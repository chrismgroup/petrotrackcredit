import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";

import { appStateTable, db } from "@workspace/db";
import { broadcastRealtime } from "../lib/realtime";
import { deliverNotification } from "./notifications.js";

const router: IRouter = Router();
type JsonRecord = Record<string, unknown>;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function safeNotify(input: Parameters<typeof deliverNotification>[0]) {
  try { await deliverNotification(input); } catch { /* Never turn a committed command into an HTTP 500. */ }
}
const IDEMPOTENCY_KEY = "workflowDipsPricesIdempotency";
const GLOBAL_ROLES = new Set(["admin", "ceo", "md", "acc", "csm", "mktg"]);

function record(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(record) : [];
}
function revision(value: JsonRecord): number {
  return Number.isInteger(value.workflowRevision) && Number(value.workflowRevision) >= 0
    ? Number(value.workflowRevision) : 0;
}
function idFor(items: JsonRecord[]): number {
  return items.reduce((highest, item) => Math.max(highest, Number(item.id) || 0), 0) + 1;
}
function sameBranch(auth: NonNullable<Request["auth"]>, branchId: unknown): boolean {
  return GLOBAL_ROLES.has(auth.role) || !auth.branchId || branchId === auth.branchId;
}
function command(req: Request): { expectedRevision: number; idempotencyKey: string } | null {
  const expectedRevision = req.body?.expectedRevision;
  const idempotencyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : "";
  return Number.isInteger(expectedRevision) && expectedRevision >= 0 && idempotencyKey
    ? { expectedRevision, idempotencyKey } : null;
}
async function state(tx: Tx, key: string): Promise<JsonRecord[]> {
  const [row] = await tx.select().from(appStateTable).where(eq(appStateTable.key, key));
  return records(row?.data);
}
async function stateObject(tx: Tx, key: string): Promise<JsonRecord> {
  const [row] = await tx.select().from(appStateTable).where(eq(appStateTable.key, key));
  return record(row?.data) ? row.data : {};
}
async function save(tx: Tx, key: string, data: unknown): Promise<void> {
  await tx.insert(appStateTable).values({ key, data }).onConflictDoUpdate({
    target: appStateTable.key, set: { data, updatedAt: new Date() },
  });
}
async function audit(tx: Tx, action: string, user: string, detail: string, now: string): Promise<void> {
  const entries = await state(tx, "audit");
  await save(tx, "audit", [{ id: randomUUID(), action, user, detail, ts: now }, ...entries].slice(0, 500));
}
function fingerprint(req: Request): string {
  return JSON.stringify({ method: req.method, path: req.path, actor: req.auth!.username, body: req.body });
}
async function replay(tx: Tx, key: string, signature: string): Promise<{ status: number; body: JsonRecord } | null> {
  const entries = await state(tx, IDEMPOTENCY_KEY);
  const prior = entries.find(entry => entry.key === key);
  if (!prior) return null;
  if (prior.signature !== signature) return { status: 409, body: { error: "Idempotency key was already used for a different command" } };
  return { status: Number(prior.status) || 200, body: record(prior.body) ? prior.body : { error: "Invalid idempotency replay" } };
}
async function remember(tx: Tx, key: string, signature: string, status: number, body: JsonRecord): Promise<void> {
  const entries = await state(tx, IDEMPOTENCY_KEY);
  await save(tx, IDEMPOTENCY_KEY, [{ key, signature, status, body, at: new Date().toISOString() }, ...entries].slice(0, 2000));
}
function currentPrice(prices: JsonRecord, product: string, branchId?: string): number {
  const branchPrices = record(prices.branchPrices) ? prices.branchPrices : {};
  const branch = branchId && record(branchPrices[branchId]) ? branchPrices[branchId] as JsonRecord : {};
  const raw = branch[product] ?? prices[product];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}
async function validateReadings(tx: Tx, rd: JsonRecord, lpg: JsonRecord, branchId?: string | null): Promise<string | null> {
  const [tanks, lpgTanks] = await Promise.all([state(tx, "tanks"), state(tx, "lpgTanks")]);
  const validate = (input: JsonRecord, configured: JsonRecord[], label: string) => {
    const byId = new Map(configured.map(tank => [String(tank.id), tank]));
    for (const [tankId, raw] of Object.entries(input)) {
      const tank = byId.get(tankId); const value = Number(raw);
      if (!tank || (branchId && tank.branchId && tank.branchId !== branchId)) return `${label} tank ${tankId} is not assigned to your branch`;
      if (!Number.isFinite(value) || value < 0 || value > Number(tank.cap)) return `${label} reading for ${tankId} must be between 0 and its tank capacity`;
    }
    return null;
  };
  return validate(rd, tanks, "Petroleum") ?? validate(lpg, lpgTanks, "LPG");
}

async function run(req: Request, res: Response, action: (tx: Tx, now: string) => Promise<{ status: number; body: JsonRecord }>) {
  const cmd = command(req);
  if (!cmd) return res.status(400).json({ error: "expectedRevision (non-negative integer) and idempotencyKey are required" });
  const signature = fingerprint(req);
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:workflow-dips-prices'))`);
    const prior = await replay(tx, cmd.idempotencyKey, signature);
    if (prior) return { ...prior, replayed: true };
    const next = await action(tx, new Date().toISOString());
    // Persist both successes and deterministic command conflicts, so retries
    // never re-run an approval's inventory/price effects.
    await remember(tx, cmd.idempotencyKey, signature, next.status, next.body);
    return { ...next, replayed: false };
  });
  if (result.status < 300 && !result.replayed) {
    broadcastRealtime({ type: "workflow.changed" });
    const dip = record(result.body.dip) ? result.body.dip : null;
    const proposal = record(result.body.proposal) ? result.body.proposal : null;
    if (req.path === "/workflows/dips" && dip) {
      for (const target of ["md", "ceo", "acc", "csm"]) {
        await safeNotify({
          target,
          type: "operational",
          title: "Tank Dip Awaiting MD Approval",
          body: `${dip.by ?? "A manager"} submitted tank dip readings for ${dip.dt ?? "the selected date"}.`,
          data: {
            route: "/(app)/tanks",
            dipId: dip.id,
            branchId: dip.branchId ?? null,
          },
        });
      }
    } else if (req.path.endsWith("/approve") && Array.isArray(result.body.inventoryLog)) {
      for (const value of result.body.inventoryLog.filter(record)) {
        const discrepancy = Number(value.discrepancy);
        if (!Number.isFinite(discrepancy) || Math.abs(discrepancy) <= 50) continue;
        const direction = discrepancy < 0 ? "Shortage" : "Overage";
        for (const target of ["md", "ceo", "acc", "csm"]) {
          await safeNotify({
            target,
            type: "operational",
            title: `Inventory Discrepancy — ${value.tankName ?? value.tankId}`,
            body: `${value.product}: expected ${value.expected}, actual ${value.actual}, ${direction} ${Math.abs(discrepancy)}`,
            data: { route: "/(app)/inventory", dipId: value.dipId, tankId: value.tankId },
          });
        }
      }
    } else if (proposal && (req.path.endsWith("/approve") || req.path.endsWith("/reject"))) {
      await safeNotify({
        target: String(proposal.proposedBy ?? ""),
        type: "operational",
        title: `Price Change ${proposal.status === "approved" ? "Approved" : "Rejected"}`,
        body: `${proposal.prod} proposal ${proposal.status}${proposal.status === "approved" ? ` at ₦${proposal.proposedPrice}` : ""}.`,
        data: { route: "/(app)/prices", proposalId: proposal.id },
      });
    } else if (dip && req.path.endsWith("/reject")) {
      await safeNotify({
        target: String(dip.by ?? ""),
        type: "operational",
        title: "Dip Rejected",
        body: `Dip ${dip.id} was returned for correction.`,
        data: { route: "/(app)/tanks", dipId: dip.id },
      });
    }
  }
  return res.status(result.status).json({ ...result.body, replayed: result.replayed });
}

router.post("/workflows/dips", async (req, res) => run(req, res, async (tx, now) => {
  const cmd = command(req)!;
  const input = record(req.body?.dip) ? req.body.dip : null;
  if (!input || cmd.expectedRevision !== 0 || req.auth!.role !== "mgr") return { status: 403, body: { error: "Only a manager may create a new branch dip" } };
  if (!record(input.rd) || !record(input.lpg) || typeof input.dt !== "string" || !input.dt) {
    return { status: 400, body: { error: "Dip date plus rd and lpg reading objects are required" } };
  }
  const assignedBranchId = String(req.auth!.branchId ?? "").trim();
  const branches = await state(tx, "branches");
  const assignedBranch = branches.find(branch => String(branch.id ?? "") === assignedBranchId);
  const assignedBranchName = String(assignedBranch?.name ?? "").trim();
  if (!assignedBranchId || !assignedBranchName) {
    return { status: 400, body: { error: "The manager must be assigned to a valid branch" } };
  }
  const readingError = await validateReadings(tx, input.rd, input.lpg, assignedBranchId);
  if (readingError) return { status: 400, body: { error: readingError } };
  const dips = await state(tx, "dips");
  const existingDailyDip = dips.find(dip =>
    dip.branchId === assignedBranchId &&
    String(dip.dt ?? "").slice(0, 10) === input.dt.slice(0, 10) &&
    dip.status !== "rejected",
  );
  if (existingDailyDip) {
    return {
      status: 409,
      body: {
        error: existingDailyDip.status === "approved"
          ? "This branch already has an approved tank dip for that business date"
          : "This branch already has a tank dip awaiting MD approval for that business date",
      },
    };
  }
  const dip = { id: idFor(dips), dt: input.dt, rd: input.rd, lpg: input.lpg, obs: typeof input.obs === "string" ? input.obs : "", by: req.auth!.username, branchId: assignedBranchId, branchName: assignedBranchName, submittedAt: now, status: "pending", workflowRevision: 0 };
  dips.unshift(dip); await save(tx, "dips", dips); await audit(tx, "Dip submitted", req.auth!.username, `Dip ${dip.id} submitted`, now);
  return { status: 201, body: { dip } };
}));

router.patch("/workflows/dips/:id", async (req, res) => run(req, res, async (tx, now) => {
  const cmd = command(req)!; const dips = await state(tx, "dips"); const index = dips.findIndex(d => String(d.id) === req.params.id);
  if (index < 0) return { status: 404, body: { error: "Dip not found" } };
  const old = dips[index];
  if (revision(old) !== cmd.expectedRevision) return { status: 409, body: { error: "Dip revision is stale" } };
  const isAdmin = req.auth!.role === "admin";
  if (!isAdmin && old.status !== "pending") return { status: 409, body: { error: "Approved or rejected dips are locked; only admin may update them" } };
  if (!isAdmin && (req.auth!.role !== "mgr" || old.by !== req.auth!.username || !sameBranch(req.auth!, old.branchId))) return { status: 403, body: { error: "Only the submitting branch manager may edit this pending dip" } };
  const input = record(req.body?.dip) ? req.body.dip : {};
  if ((input.rd !== undefined && !record(input.rd)) || (input.lpg !== undefined && !record(input.lpg))) return { status: 400, body: { error: "Readings must be objects" } };
  const revisedRd = record(input.rd) ? input.rd : (record(old.rd) ? old.rd : {});
  const revisedLpg = record(input.lpg) ? input.lpg : (record(old.lpg) ? old.lpg : {});
  const validationBranchId = isAdmin && typeof old.branchId === "string" ? old.branchId : req.auth!.branchId;
  const readingError = await validateReadings(tx, revisedRd, revisedLpg, validationBranchId);
  if (readingError) return { status: 400, body: { error: readingError } };
  const dip = { ...old, ...(typeof input.dt === "string" ? { dt: input.dt } : {}), ...(record(input.rd) ? { rd: input.rd } : {}), ...(record(input.lpg) ? { lpg: input.lpg } : {}), ...(typeof input.obs === "string" ? { obs: input.obs } : {}), workflowRevision: revision(old) + 1, updatedAt: now };
  dips[index] = dip;
  await save(tx, "dips", dips);
  if (isAdmin && old.status === "approved") {
    const [inventory, alerts] = await Promise.all([state(tx, "inventoryLog"), state(tx, "inventoryAlerts")]);
    const correctedInventory = inventory.map(entry => {
      if (String(entry.dipId) !== String(old.id)) return entry;
      const tankId = String(entry.tankId ?? "");
      const actual = revisedRd[tankId] ?? revisedLpg[tankId];
      if (typeof actual !== "number" || !Number.isFinite(actual)) return entry;
      const expected = Number(entry.expected) || 0;
      return { ...entry, actual, discrepancy: actual - expected, correctedBy: req.auth!.username, correctedAt: now };
    });
    const correctedAlerts = correctedInventory
      .filter(entry => String(entry.dipId) === String(old.id) && Math.abs(Number(entry.discrepancy)) > 50)
      .map(entry => ({ id: randomUUID(), type: "inventory_discrepancy", ...entry, createdAt: now }));
    await Promise.all([
      save(tx, "inventoryLog", correctedInventory),
      save(tx, "inventoryAlerts", [
        ...correctedAlerts,
        ...alerts.filter(entry => String(entry.dipId) !== String(old.id)),
      ]),
    ]);
  }
  await audit(tx, isAdmin && old.status !== "pending" ? "Approved dip corrected by admin" : "Dip updated", req.auth!.username, `Dip ${old.id} updated`, now);
  return { status: 200, body: { dip } };
}));

router.delete("/workflows/dips/:id", async (req, res) => run(req, res, async (tx, now) => {
  const cmd = command(req)!; const dips = await state(tx, "dips"); const index = dips.findIndex(d => String(d.id) === req.params.id);
  if (index < 0) return { status: 404, body: { error: "Dip not found" } }; const dip = dips[index];
  if (revision(dip) !== cmd.expectedRevision) return { status: 409, body: { error: "Dip revision is stale" } };
  const isAdmin = req.auth!.role === "admin";
  if (!isAdmin && dip.status !== "pending") return { status: 409, body: { error: "Approved or rejected dips are locked; only admin may delete them" } };
  if (!isAdmin && (req.auth!.role !== "mgr" || dip.by !== req.auth!.username || !sameBranch(req.auth!, dip.branchId))) return { status: 403, body: { error: "Only the submitting branch manager may delete this pending dip" } };
  dips.splice(index, 1);
  await save(tx, "dips", dips);
  if (isAdmin && dip.status === "approved") {
    const [inventory, alerts] = await Promise.all([state(tx, "inventoryLog"), state(tx, "inventoryAlerts")]);
    await Promise.all([
      save(tx, "inventoryLog", inventory.filter(entry => String(entry.dipId) !== String(dip.id))),
      save(tx, "inventoryAlerts", alerts.filter(entry => String(entry.dipId) !== String(dip.id))),
    ]);
  }
  await audit(tx, isAdmin && dip.status === "approved" ? "Approved dip deleted by admin" : "Dip deleted", req.auth!.username, `Dip ${dip.id} deleted`, now);
  return { status: 200, body: { dip: { ...dip, deleted: true, workflowRevision: revision(dip) + 1 } } };
}));

router.post("/workflows/dips/:id/:decision", async (req, res) => run(req, res, async (tx, now) => {
  const cmd = command(req)!; const decision = req.params.decision;
  if (!["approve", "reject"].includes(decision)) return { status: 400, body: { error: "Decision must be approve or reject" } };
  if (!["md", "admin"].includes(req.auth!.role)) return { status: 403, body: { error: "Only MD or admin may decide a dip" } };
  const dips = await state(tx, "dips"); const index = dips.findIndex(d => String(d.id) === req.params.id);
  if (index < 0) return { status: 404, body: { error: "Dip not found" } }; const old = dips[index];
  if (old.status !== "pending" || revision(old) !== cmd.expectedRevision) return { status: 409, body: { error: "Dip is no longer pending or revision is stale" } };
  const dip = { ...old, status: decision === "approve" ? "approved" : "rejected", approvedBy: req.auth!.username, approvedDt: now, workflowRevision: revision(old) + 1 };
  dips[index] = dip; await save(tx, "dips", dips);
  if (decision === "reject") { await audit(tx, "Dip rejected", req.auth!.username, `Dip ${old.id} rejected`, now); return { status: 200, body: { dip } }; }
  const [tanks, lpgTanks, inventory] = await Promise.all([state(tx, "tanks"), state(tx, "lpgTanks"), state(tx, "inventoryLog")]);
  const logs: JsonRecord[] = [];
  const apply = (tank: JsonRecord, readings: JsonRecord, lpg: boolean) => {
    const actual = readings[String(tank.id)]; if (typeof actual !== "number" || !Number.isFinite(actual)) return tank;
    const expected = (Number(tank.op) || 0) + (Number(tank.rv) || 0) - (Number(tank.sl) || 0);
    const entry = { id: randomUUID(), dipId: old.id, dt: now, approvedBy: req.auth!.username, tankId: tank.id, tankName: tank.name, product: lpg ? "LPG" : tank.prod, opening: tank.op, received: tank.rv, sold: tank.sl, expected, actual, discrepancy: actual - expected, branchId: tank.branchId ?? old.branchId ?? null };
    logs.push(entry); return { ...tank, op: actual, rv: 0, sl: 0 };
  };
  const nextTanks = tanks.map(tank => apply(tank, record(old.rd) ? old.rd : {}, false));
  const nextLpg = lpgTanks.map(tank => apply(tank, record(old.lpg) ? old.lpg : {}, true));
  await Promise.all([save(tx, "tanks", nextTanks), save(tx, "lpgTanks", nextLpg), save(tx, "inventoryLog", [...logs, ...inventory])]);
  const alerts = logs.filter(log => Math.abs(Number(log.discrepancy)) > 50).map(log => ({ id: randomUUID(), type: "inventory_discrepancy", dipId: old.id, ...log, createdAt: now }));
  if (alerts.length) {
    const existingAlerts = await state(tx, "inventoryAlerts");
    await save(tx, "inventoryAlerts", [...alerts, ...existingAlerts]);
  }
  await audit(tx, "Dip approved", req.auth!.username, `Dip ${old.id} approved; ${logs.length} inventory snapshots recorded${alerts.length ? `; ${alerts.length} discrepancy alerts` : ""}`, now);
  return { status: 200, body: { dip, inventoryLog: logs } };
}));

router.post("/workflows/price-proposals", async (req, res) => run(req, res, async (tx, now) => {
  const cmd = command(req)!; const input = record(req.body?.proposal) ? req.body.proposal : null;
  if (!input || cmd.expectedRevision !== 0) return { status: 400, body: { error: "A new proposal requires expectedRevision 0" } };
  if (["admin", "ceo"].includes(req.auth!.role)) return { status: 403, body: { error: "CEO and admin approve prices; they do not submit proposals" } };
  const product = typeof input.prod === "string" ? input.prod.trim() : ""; const proposedPrice = Number(input.proposedPrice);
  if (!product || !Number.isFinite(proposedPrice) || proposedPrice <= 0) return { status: 400, body: { error: "Product and a positive proposed price are required" } };
  const [proposals, prices] = await Promise.all([state(tx, "priceProposals"), stateObject(tx, "prices")]);
  const proposal = { id: idFor(proposals), prod: product, currentPrice: currentPrice(prices, product, req.auth!.branchId ?? undefined), proposedPrice, proposedBy: req.auth!.username, proposedAt: now, branchId: req.auth!.branchId ?? null, status: "pending", workflowRevision: 0 };
  proposals.unshift(proposal); await save(tx, "priceProposals", proposals); await audit(tx, "Price proposal submitted", req.auth!.username, `${product}: ${proposal.currentPrice} → ${proposedPrice}`, now);
  return { status: 201, body: { proposal } };
}));

router.post("/workflows/prices/:product", async (req, res) => run(req, res, async (tx, now) => {
  const cmd = command(req)!;
  if (cmd.expectedRevision !== 0) return { status: 400, body: { error: "Direct price updates require expectedRevision 0" } };
  if (!["admin", "ceo", "md", "mgr"].includes(req.auth!.role)) {
    return { status: 403, body: { error: "You are not authorized to update selling prices" } };
  }
  const product = typeof req.params.product === "string" ? req.params.product.trim() : "";
  const price = Number(req.body?.price);
  if (!product || !Number.isFinite(price) || price <= 0) {
    return { status: 400, body: { error: "Product and a positive selling price are required" } };
  }
  const requestedBranch = typeof req.body?.branchId === "string" && req.body.branchId.trim()
    ? req.body.branchId.trim()
    : undefined;
  const branchId = req.auth!.role === "mgr" ? req.auth!.branchId ?? undefined : requestedBranch;
  if (req.auth!.role === "mgr" && !branchId) {
    return { status: 403, body: { error: "A branch assignment is required to update a selling price" } };
  }
  if (req.auth!.role === "mgr" && requestedBranch && requestedBranch !== branchId) {
    return { status: 403, body: { error: "A manager can only update prices for the assigned branch" } };
  }
  const prices = await stateObject(tx, "prices");
  const oldPrice = currentPrice(prices, product, branchId);
  const allBranchPrices = record(prices.branchPrices) ? prices.branchPrices : {};
  const selectedBranchPrices = branchId && record(allBranchPrices[branchId]) ? allBranchPrices[branchId] : {};
  const nextPrices = branchId
    ? { ...prices, branchPrices: { ...allBranchPrices, [branchId]: { ...selectedBranchPrices, [product]: price } } }
    : { ...prices, [product]: price };
  const history = await state(tx, "priceHistory");
  const reason = typeof req.body?.reason === "string" && req.body.reason.trim() ? req.body.reason.trim() : undefined;
  const historyEntry = {
    id: randomUUID(),
    prod: product,
    oldPrice,
    newPrice: price,
    by: req.auth!.username,
    dt: now,
    branchId: branchId ?? null,
    ...(reason ? { reason } : {}),
  };
  await save(tx, "prices", nextPrices);
  await save(tx, "priceHistory", [historyEntry, ...history]);
  await audit(tx, "Price update", req.auth!.username, `${product}: ${oldPrice} → ${price}${branchId ? ` at branch ${branchId}` : " network-wide"}`, now);
  return { status: 200, body: { prices: nextPrices, priceHistory: historyEntry } };
}));

router.post("/workflows/price-proposals/:id/:decision", async (req, res) => run(req, res, async (tx, now) => {
  const cmd = command(req)!; const decision = req.params.decision;
  if (!["approve", "reject"].includes(decision)) return { status: 400, body: { error: "Decision must be approve or reject" } };
  if (!["ceo", "admin"].includes(req.auth!.role)) return { status: 403, body: { error: "Only CEO or admin may decide price proposals" } };
  const proposals = await state(tx, "priceProposals"); const index = proposals.findIndex(p => String(p.id) === req.params.id);
  if (index < 0) return { status: 404, body: { error: "Price proposal not found" } }; const old = proposals[index];
  if (old.status !== "pending" || revision(old) !== cmd.expectedRevision) return { status: 409, body: { error: "Proposal is no longer pending or revision is stale" } };
  const edited = req.body?.editedPrice; const finalPrice = edited === undefined ? Number(old.proposedPrice) : Number(edited);
  if (decision === "approve" && (!Number.isFinite(finalPrice) || finalPrice <= 0)) return { status: 400, body: { error: "Approved price must be positive" } };
  const proposal = { ...old, ...(decision === "approve" && edited !== undefined ? { proposedPrice: finalPrice } : {}), status: decision === "approve" ? "approved" : "rejected", reviewedBy: req.auth!.username, reviewedAt: now, ...(typeof req.body?.note === "string" ? { note: req.body.note } : {}), workflowRevision: revision(old) + 1 };
  proposals[index] = proposal; await save(tx, "priceProposals", proposals);
  if (decision === "reject") { await audit(tx, "Price proposal rejected", req.auth!.username, `Proposal ${old.id} rejected`, now); return { status: 200, body: { proposal } }; }
  const prices = await stateObject(tx, "prices"); const branchId = typeof old.branchId === "string" ? old.branchId : undefined;
  const oldPrice = currentPrice(prices, String(old.prod), branchId);
  const allBranchPrices = record(prices.branchPrices) ? prices.branchPrices : {};
  const selectedBranchPrices = branchId && record(allBranchPrices[branchId]) ? allBranchPrices[branchId] : {};
  const nextPrices = branchId
    ? { ...prices, branchPrices: { ...allBranchPrices, [branchId]: { ...selectedBranchPrices, [String(old.prod)]: finalPrice } } }
    : { ...prices, [String(old.prod)]: finalPrice };
  const history = await state(tx, "priceHistory"); const historyEntry = { id: randomUUID(), prod: old.prod, oldPrice, newPrice: finalPrice, by: req.auth!.username, dt: now, branchId: branchId ?? null, ...(edited !== undefined ? { reason: "CEO/admin adjusted proposal" } : {}) };
  await save(tx, "prices", nextPrices); await save(tx, "priceHistory", [historyEntry, ...history]); await audit(tx, "Price proposal approved", req.auth!.username, `${old.prod}: ${oldPrice} → ${finalPrice}`, now);
  return { status: 200, body: { proposal, prices: nextPrices, priceHistory: historyEntry } };
}));

export default router;