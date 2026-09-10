import { createHash, randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";

import { appStateTable, db } from "@workspace/db";
import { broadcastRealtime } from "../lib/realtime";
import { deliverNotification } from "./notifications.js";
import { mergeWorkflowTombstones } from "./workflow-record-merge";

const router: IRouter = Router();
type JsonRecord = Record<string, unknown>;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const IDEMPOTENCY_KEY = "deliveryWorkflowIdempotency";
const DELETION_KEY = "deliveryDeletionTombstones";
const ORIGINATOR_ROLES = new Set(["mgr", "csm", "admin"]);
const GLOBAL_REVIEW_ROLES = new Set(["acc", "md", "ceo", "admin"]);

async function notify(result: any, input: Parameters<typeof deliverNotification>[0]) {
  if (!result?.error && !result?.replayed) {
    try { await deliverNotification(input); } catch { /* The committed workflow remains authoritative. */ }
  }
}

function record(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function deliveries(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(record) : [];
}
function revision(item: JsonRecord): number {
  const value = Number(item.workflowVersion);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}
function status(item: JsonRecord): string {
  const value = String(item.approvalStatus ?? item.status ?? "draft");
  return value === "approved" ? "md_approved" : value;
}
function idOf(item: JsonRecord): string { return String(item.id ?? ""); }
function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function isBranchAllowed(item: JsonRecord, auth: { role: string; branchId?: string | null }): boolean {
  // Finance reviewers and executive approvers can review the network queue.
  // Missing branch IDs are legacy delivery records, not another branch.
  return GLOBAL_REVIEW_ROLES.has(auth.role)
    || (!!auth.branchId && !!item.branchId && item.branchId === auth.branchId);
}

async function canonicalBranch(branchId: string): Promise<{ branchId: string; branchName: string } | null> {
  const [row] = await db.select().from(appStateTable).where(eq(appStateTable.key, "branches"));
  const branch = deliveries(row?.data).find(value => idOf(value) === branchId);
  const branchName = String(branch?.name ?? "").trim();
  return branch && branchName ? { branchId, branchName } : null;
}
function isOriginator(item: JsonRecord, auth: NonNullable<Request["auth"]>): boolean {
  return item.receivedByUsername === auth.username
    || item.receivedBy === auth.username
    || (!!auth.empName && item.receivedBy === auth.empName);
}
function validPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function validatedDeliveryFields(value: JsonRecord): JsonRecord | null {
  const ordered = Number(value.ord);
  const received = Number(value.rec);
  const supplier = typeof value.sup === "string" ? value.sup.trim() : "";
  const product = typeof value.prod === "string" ? value.prod.trim() : "";
  const waybill = typeof value.wb === "string" ? value.wb.trim() : "";
  const date = typeof value.dt === "string" ? value.dt.trim() : "";
  if (!supplier || !product || !waybill || !date || !Number.isFinite(ordered) || ordered <= 0 ||
      !Number.isFinite(received) || received <= 0) return null;
  return {
    sup: supplier,
    prod: product,
    wb: waybill,
    dt: date,
    ord: ordered,
    rec: received,
    st: typeof value.st === "string" ? value.st : "ok",
    notes: typeof value.notes === "string" ? value.notes : "",
  };
}
async function save(tx: Tx, key: string, data: unknown) {
  await tx.insert(appStateTable).values({ key, data }).onConflictDoUpdate({
    target: appStateTable.key, set: { data, updatedAt: new Date() },
  });
}
async function audit(tx: Tx, action: string, actor: string, detail: string, now: string) {
  const [row] = await tx.select().from(appStateTable).where(eq(appStateTable.key, "audit"));
  const current = Array.isArray(row?.data) ? row.data : [];
  await save(tx, "audit", [{ id: randomUUID(), action, user: actor, detail, ts: now }, ...current].slice(0, 500));
}
function supplied(body: unknown): { expectedRevision: number; idempotencyKey: string } | null {
  if (!record(body) || !Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 0 ||
    typeof body.idempotencyKey !== "string" || !body.idempotencyKey.trim()) return null;
  return { expectedRevision: Number(body.expectedRevision), idempotencyKey: body.idempotencyKey.trim() };
}
async function execute(
  req: Request, operation: string, mutate: (items: JsonRecord[], now: string) =>
    { item: JsonRecord; next: JsonRecord[]; sideEffects?: (tx: Tx, item: JsonRecord, now: string) => Promise<void> } | { error: string; code: number },
) {
  const meta = supplied(req.body);
  if (!meta) return { error: "expectedRevision and idempotencyKey are required", code: 400 };
  const requestHash = fingerprint({ operation, body: req.body, actor: req.auth!.username });
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:delivery-workflow'))`);
    const [idempotencyRow, deliveryRow, deletionRow] = await Promise.all([
      tx.select().from(appStateTable).where(eq(appStateTable.key, IDEMPOTENCY_KEY)),
      tx.select().from(appStateTable).where(eq(appStateTable.key, "deliveries")),
      tx.select().from(appStateTable).where(eq(appStateTable.key, DELETION_KEY)),
    ]);
    const prior = (Array.isArray(idempotencyRow[0]?.data) ? idempotencyRow[0].data : [])
      .find(value => record(value) && value.key === meta.idempotencyKey) as JsonRecord | undefined;
    if (prior) {
      if (prior.hash !== requestHash) return { error: "Idempotency key was already used for a different request", code: 409 };
      return { item: prior.item as JsonRecord, replayed: true };
    }
    if (
      operation === "create" &&
      Array.isArray(deletionRow[0]?.data) &&
      deletionRow[0].data.some(value => record(value) && idOf(value) === idOf((req.body as JsonRecord)?.delivery as JsonRecord))
    ) {
      return { error: "A deleted delivery ID cannot be reused", code: 409 };
    }
    const currentDeliveries = deliveries(deliveryRow[0]?.data);
    const result = mutate(currentDeliveries, new Date().toISOString());
    if ("error" in result) return result;
    await save(tx, "deliveries", result.next);
    if (operation === "delete") {
      const tombstones = mergeWorkflowTombstones(deletionRow[0]?.data, [{
        id: idOf(result.item),
        workflowVersion: revision(result.item),
        deletedAt: result.item.deletedAt,
      }]);
      await save(tx, DELETION_KEY, tombstones);
    }
    if (result.sideEffects) await result.sideEffects(tx, result.item, new Date().toISOString());
    const entries = Array.isArray(idempotencyRow[0]?.data) ? idempotencyRow[0].data : [];
    await save(tx, IDEMPOTENCY_KEY, [{ key: meta.idempotencyKey, hash: requestHash, item: result.item }, ...entries].slice(0, 1000));
    return { item: result.item, replayed: false };
  });
}
function respond(res: Response, result: Awaited<ReturnType<typeof execute>>) {
  if ("error" in result) { res.status(result.code).json({ error: result.error }); return; }
  res.json({ delivery: result.item, replayed: result.replayed });
}
function requireExpected(item: JsonRecord, expected: number): { error: string; code: number } | null {
  return revision(item) === expected ? null : { error: "Delivery has changed; refresh and retry", code: 409 };
}
function transition(
  req: Request, allowed: string[], nextStatus: string,
  extra: (item: JsonRecord, now: string) => JsonRecord = item => item,
  approval = false,
) {
  return execute(req, `transition:${nextStatus}`, (items, now) => {
    const item = items.find(value => idOf(value) === req.params.id);
    if (!item) return { error: "Delivery not found", code: 404 };
    if (!isBranchAllowed(item, req.auth!)) return { error: "You cannot act on another branch's delivery", code: 403 };
    if (nextStatus === "pending_acc" && ["draft", "returned"].includes(status(item)) &&
      req.auth!.role !== "admin" && !isOriginator(item, req.auth!)) {
      return { error: "Only the originating manager may submit this delivery", code: 403 };
    }
    const expected = supplied(req.body)!.expectedRevision;
    const stale = requireExpected(item, expected); if (stale) return stale;
    if (nextStatus === "pending_acc" && status(item) === "pending_md" && item.accBy !== req.auth!.username) {
      return { error: "Only the accountant who forwarded this delivery may recall it", code: 403 };
    }
    if (!allowed.includes(status(item))) return { error: `Cannot move a ${status(item)} delivery to ${nextStatus}`, code: 409 };
    const saved = { ...extra(item, now), approvalStatus: nextStatus, workflowVersion: revision(item) + 1, updatedAt: now };
    const next = items.map(value => value === item ? saved : value);
    return {
      item: saved, next,
      sideEffects: async (tx, canonical, at) => {
        if (approval) await approvalEffects(tx, canonical, at);
        await audit(tx, `Delivery ${nextStatus}`, req.auth!.username, `Delivery #${idOf(canonical)} is ${nextStatus}`, at);
      },
    };
  });
}
async function approvalEffects(tx: Tx, item: JsonRecord, now: string) {
  const product = String(item.prod ?? "");
  const sellingPrice = Number(item.sellingPrice);
  const branchId = typeof item.branchId === "string" ? item.branchId : undefined;
  const [pricesRow, historyRow, tanksRow] = await Promise.all([
    tx.select().from(appStateTable).where(eq(appStateTable.key, "prices")),
    tx.select().from(appStateTable).where(eq(appStateTable.key, "priceHistory")),
    tx.select().from(appStateTable).where(eq(appStateTable.key, "tanks")),
  ]);
  const prices = record(pricesRow[0]?.data) ? pricesRow[0].data : {};
  const branchPrices = record(prices.branchPrices) ? prices.branchPrices : {};
  const branch = branchId && record(branchPrices[branchId]) ? branchPrices[branchId] : {};
  const oldPrice = Number(branchId ? branch[product] : prices[product]) || 0;
  const nextPrices: JsonRecord = branchId ? { ...prices, branchPrices: { ...branchPrices, [branchId]: { ...branch, [product]: sellingPrice } } } : { ...prices, [product]: sellingPrice };
  await save(tx, "prices", nextPrices);
  const history = Array.isArray(historyRow[0]?.data) ? historyRow[0].data : [];
  await save(tx, "priceHistory", [{ id: randomUUID(), prod: product, oldPrice, newPrice: sellingPrice, by: item.approvedBy, dt: now, branchId, reason: `Delivery #${idOf(item)} approval` }, ...history]);
  const quantity = Number(item.rec);
  const tanks = deliveries(tanksRow[0]?.data);
  const matching = tanks.filter(tank => tank.prod === product && (!branchId || !tank.branchId || tank.branchId === branchId));
  if (matching.length) {
    const ids = new Set(matching.map(idOf));
    await save(tx, "tanks", tanks.map(tank => ids.has(idOf(tank)) ? { ...tank, rv: (Number(tank.rv) || 0) + quantity / matching.length } : tank));
  }
}

router.post("/deliveries", async (req, res) => {
  if (!ORIGINATOR_ROLES.has(req.auth!.role)) { res.status(403).json({ error: "Only managers, CSM, or admins can create deliveries" }); return; }
  const incoming = record(req.body?.delivery) ? req.body.delivery : null;
  const fields = incoming ? validatedDeliveryFields(incoming) : null;
  if (!incoming || !fields || !idOf(incoming) || !req.auth!.branchId) { res.status(400).json({ error: "Valid delivery fields, an id, and authenticated branch are required" }); return; }
  const assignedBranch = await canonicalBranch(req.auth!.branchId);
  if (!assignedBranch) { res.status(400).json({ error: "The authenticated branch does not exist" }); return; }
  const result = await execute(req, "create", (items, now) => {
    if (items.some(item => idOf(item) === idOf(incoming))) return { error: "Delivery id already exists", code: 409 };
    if (supplied(req.body)!.expectedRevision !== 0) return { error: "New deliveries require expectedRevision 0", code: 409 };
    const item = {
      ...fields,
      id: incoming.id,
      ...assignedBranch,
      receivedBy: req.auth!.empName ?? req.auth!.username,
      receivedByUsername: req.auth!.username,
      submittedAt: now,
      approvalStatus: "draft",
      workflowVersion: 0,
      updatedAt: now,
    };
    return { item, next: [item, ...items], sideEffects: (tx, canonical, at) => audit(tx, "Delivery recorded", req.auth!.username, `Delivery #${idOf(canonical)} recorded`, at) };
  });
  if (!("error" in result)) broadcastRealtime({ type: "delivery.changed", deliveryId: idOf(result.item), branchId: result.item.branchId ?? null });
  respond(res, result);
});

router.put("/deliveries/:id", async (req, res) => {
  const patch = record(req.body?.delivery) ? req.body.delivery : null;
  if (!patch) { res.status(400).json({ error: "delivery is required" }); return; }
  const result = await execute(req, "update", (items, now) => {
    const item = items.find(value => idOf(value) === req.params.id);
    if (!item) return { error: "Delivery not found", code: 404 };
    if (!ORIGINATOR_ROLES.has(req.auth!.role) || !isBranchAllowed(item, req.auth!) ||
      (req.auth!.role !== "admin" && !isOriginator(item, req.auth!))) return { error: "Not permitted for this delivery", code: 403 };
    const stale = requireExpected(item, supplied(req.body)!.expectedRevision); if (stale) return stale;
    if (!["draft", "returned"].includes(status(item))) return { error: "Only draft or returned deliveries can be edited", code: 409 };
    const mergedFields = validatedDeliveryFields({ ...item, ...patch });
    if (!mergedFields) return { error: "Valid supplier, product, waybill, date, and positive quantities are required", code: 400 };
    const saved = { ...item, ...mergedFields, workflowVersion: revision(item) + 1, updatedAt: now };
    return { item: saved, next: items.map(value => value === item ? saved : value), sideEffects: (tx, canonical, at) => audit(tx, "Delivery updated", req.auth!.username, `Delivery #${idOf(canonical)} updated`, at) };
  });
  if (!("error" in result)) broadcastRealtime({ type: "delivery.changed", deliveryId: req.params.id });
  respond(res, result);
});

router.delete("/deliveries/:id", async (req, res) => {
  const result = await execute(req, "delete", (items, now) => {
    const item = items.find(value => idOf(value) === req.params.id);
    if (!item) return { error: "Delivery not found", code: 404 };
    if (req.auth!.role !== "admin" && (
      !ORIGINATOR_ROLES.has(req.auth!.role)
      || !isBranchAllowed(item, req.auth!)
      || !isOriginator(item, req.auth!)
    )) return { error: "Not permitted for this delivery", code: 403 };
    const stale = requireExpected(item, supplied(req.body)!.expectedRevision); if (stale) return stale;
    if (req.auth!.role !== "admin" && !["draft", "returned"].includes(status(item))) {
      return { error: "Only draft or returned deliveries can be deleted", code: 409 };
    }
    return { item: { ...item, deletedAt: now }, next: items.filter(value => value !== item), sideEffects: (tx, canonical, at) => audit(tx, "Delivery deleted", req.auth!.username, `Delivery #${idOf(canonical)} deleted`, at) };
  });
  if (!("error" in result)) broadcastRealtime({ type: "delivery.changed", deliveryId: req.params.id, deleted: true });
  respond(res, result);
});

router.post("/deliveries/:id/submit", async (req, res) => {
  if (!ORIGINATOR_ROLES.has(req.auth!.role)) { res.status(403).json({ error: "Only managers, CSM, or admins can submit deliveries" }); return; }
  const result = await transition(req, ["draft", "returned"], "pending_acc", (item, now) => ({ ...item, submittedBy: req.auth!.username, submittedAt: now }));
  if (!("error" in result)) await notify(result, {
    target: "acc", branchId: String(result.item.branchId ?? ""), type: "operational",
    title: "Delivery Awaiting Cost Entry",
    body: `${result.item.prod} ${result.item.rec} from ${result.item.sup} (WB: ${result.item.wb})`,
    data: { route: "/(app)/receiving", deliveryId: result.item.id },
  });
  if (!("error" in result)) broadcastRealtime({ type: "delivery.changed", deliveryId: req.params.id }); respond(res, result);
});
router.post("/deliveries/:id/forward", async (req, res) => {
  if (!["acc", "admin"].includes(req.auth!.role)) { res.status(403).json({ error: "Only an accountant or admin may forward deliveries" }); return; }
  if (!validPositiveNumber(req.body?.costPrice)) { res.status(400).json({ error: "A positive costPrice is required" }); return; }
  const result = await transition(req, ["pending_acc"], "pending_md", (item, now) => ({ ...item, costPrice: req.body.costPrice, accNote: String(req.body.note ?? ""), accBy: req.auth!.username, accAt: now }));
  if (!("error" in result)) await notify(result, {
    target: "md", type: "operational", title: "Delivery Awaiting MD Approval",
    body: `${result.item.prod} ${result.item.rec} · Cost ₦${result.item.costPrice} (WB: ${result.item.wb})`,
    data: { route: "/(app)/receiving", deliveryId: result.item.id },
  });
  if (!("error" in result)) broadcastRealtime({ type: "delivery.changed", deliveryId: req.params.id }); respond(res, result);
});
router.post("/deliveries/:id/recall", async (req, res) => {
  if (req.auth!.role !== "acc") { res.status(403).json({ error: "Only the forwarding accountant may recall a delivery" }); return; }
  const result = await transition(req, ["pending_md"], "pending_acc");
  if (!("error" in result)) broadcastRealtime({ type: "delivery.changed", deliveryId: req.params.id }); respond(res, result);
});
router.post("/deliveries/:id/approve", async (req, res) => {
  if (!["md", "admin"].includes(req.auth!.role)) { res.status(403).json({ error: "Only MD or admin may approve deliveries" }); return; }
  if (!validPositiveNumber(req.body?.sellingPrice)) { res.status(400).json({ error: "A positive sellingPrice is required" }); return; }
  const result = await transition(req, ["pending_md"], "md_approved", (item, now) => ({ ...item, sellingPrice: req.body.sellingPrice, mdNote: String(req.body.note ?? ""), approvedBy: req.auth!.username, approvedAt: now, mdBy: req.auth!.username, mdAt: now }), true);
  if (!("error" in result)) await notify(result, {
    target: "acc", branchId: String(result.item.branchId ?? ""), type: "operational",
    title: "Delivery Approved — Price Updated",
    body: `${result.item.prod} ${result.item.rec} from ${result.item.sup} approved. Selling price: ₦${result.item.sellingPrice}.`,
    data: { route: "/(app)/receiving", deliveryId: result.item.id },
  });
  if (!("error" in result)) broadcastRealtime({ type: "delivery.changed", deliveryId: req.params.id }); respond(res, result);
});
router.post("/deliveries/:id/reject", async (req, res) => {
  if (!["md", "admin"].includes(req.auth!.role)) { res.status(403).json({ error: "Only MD or admin may return deliveries" }); return; }
  const result = await transition(req, ["pending_md"], "returned", (item, now) => ({ ...item, rejectedNote: String(req.body.note ?? ""), rejectedBy: req.auth!.username, rejectedAt: now }));
  if (!("error" in result)) await notify(result, {
    target: String(result.item.receivedByUsername ?? result.item.receivedBy ?? ""),
    type: "operational", title: "Delivery Returned for Correction",
    body: `Delivery ${result.item.wb} was returned${req.body?.note ? `: ${req.body.note}` : "."}`,
    data: { route: "/(app)/receiving", deliveryId: result.item.id },
  });
  if (!("error" in result)) broadcastRealtime({ type: "delivery.changed", deliveryId: req.params.id }); respond(res, result);
});

export default router;