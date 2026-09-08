import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";

import { appStateTable, db } from "@workspace/db";
import { broadcastRealtime } from "../lib/realtime";
import { deliverNotification } from "./notifications.js";
import { mergeWorkflowTombstones } from "./workflow-record-merge";

const router: IRouter = Router();
const LOCK = sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:finance-workflow'))`;
const IDEMPOTENCY_KEY = "financeWorkflowIdempotency";
const EXPENSE_DELETION_KEY = "expenseDeletionTombstones";
type JsonRecord = Record<string, unknown>;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Auth = NonNullable<Request["auth"]>;
type Failure = { kind: "conflict" | "forbidden"; error: string };

const EXPENSE_CREATORS = new Set(["mgr", "csm", "mktg", "acc", "admin"]);
const BUDGET_CREATORS = new Set(["mgr", "csm", "mktg", "acc", "admin"]);
const ACCOUNTANTS = new Set(["acc", "admin"]);
const MD = new Set(["md", "ceo", "admin"]);
const MANAGERS = new Set(["mgr", "csm", "mktg"]);
const FINAL_BUDGETS = new Set(["draft", "fully_approved", "rejected"]);
const GLOBAL_FINANCE_REVIEWERS = new Set(["acc", "md", "ceo", "admin"]);

function record(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(record) : [];
}
function revision(item: JsonRecord): number {
  const value = Number(item.revision);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
function validCommand(body: unknown): { expectedRevision: number; idempotencyKey: string } | null {
  if (!record(body)) return null;
  const expectedRevision = Number(body.expectedRevision);
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  return Number.isSafeInteger(expectedRevision) && expectedRevision >= 0 && idempotencyKey
    ? { expectedRevision, idempotencyKey }
    : null;
}
function sameBranch(item: JsonRecord, auth: Auth): boolean {
  // Accountants and MDs review the network queue. Some existing accounts still
  // carry a legacy branch assignment, so that field must not turn a global
  // reviewer into a branch-scoped approver. A missing record branch is also a
  // supported legacy value and must remain actionable.
  return GLOBAL_FINANCE_REVIEWERS.has(auth.role)
    || !auth.branchId
    || !item.branchId
    || String(item.branchId) === String(auth.branchId);
}
function canEditOwned(item: JsonRecord, auth: Auth): boolean {
  return (auth.role === "admin" || (MANAGERS.has(auth.role) && String(item.createdBy ?? item.byName ?? "") === auth.username))
    && sameBranch(item, auth);
}
function canonicalExpense(input: unknown): JsonRecord | null {
  if (!record(input)) return null;
  const cat = typeof input.cat === "string" ? input.cat.trim() : "";
  const desc = typeof input.desc === "string" ? input.desc.trim() : "";
  const amt = Number(input.amt);
  const dt = typeof input.dt === "string" ? input.dt.trim() : "";
  const budgetId = Number(input.budgetId);
  const ref = typeof input.ref === "string" ? input.ref.trim() : "";
  if (!cat || !desc || !dt || !Number.isFinite(amt) || amt <= 0 || !Number.isSafeInteger(budgetId) || budgetId <= 0) return null;
  return { cat, desc, amt, dt, budgetId, ...(ref ? { ref } : {}) };
}
function canonicalBudget(input: unknown): JsonRecord | null {
  if (!record(input) || !Array.isArray(input.items)) return null;
  const month = Number(input.month), year = Number(input.year);
  const appliesOn = typeof input.appliesOn === "string" ? input.appliesOn.trim() : "";
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const items = input.items.flatMap(value => {
    if (!record(value)) return [];
    const cat = typeof value.cat === "string" ? value.cat.trim() : "";
    const amt = Number(value.amt);
    return cat && Number.isFinite(amt) && amt > 0 ? [{ cat, amt }] : [];
  });
  if (!Number.isSafeInteger(month) || month < 1 || month > 12 || !Number.isSafeInteger(year) || year < 2000 || !appliesOn || !label || !items.length || items.length !== input.items.length) return null;
  return { month, year, appliesOn, label, items, total: items.reduce((sum, item) => sum + item.amt, 0) };
}
function workflow(stage: string, action: string, note: string, auth: Auth, now: string): JsonRecord {
  return { stage, action, note, by: auth.username, role: auth.role, dt: now };
}
function fingerprint(req: Request): string {
  // The request's operation/path and body make accidental reuse of a key a
  // conflict rather than silently returning an unrelated successful command.
  return JSON.stringify({ method: req.method, path: req.path, actor: req.auth!.username, body: req.body });
}
async function load(tx: Tx, key: string): Promise<JsonRecord[]> {
  const [row] = await tx.select().from(appStateTable).where(eq(appStateTable.key, key));
  return records(row?.data);
}
async function save(tx: Tx, key: string, value: unknown): Promise<void> {
  await tx.insert(appStateTable).values({ key, data: value })
    .onConflictDoUpdate({ target: appStateTable.key, set: { data: value, updatedAt: new Date() } });
}
async function budgetBranch(branchId: string): Promise<{ branchId: string; branchName: string } | null> {
  const [row] = await db.select().from(appStateTable).where(eq(appStateTable.key, "branches"));
  const branch = records(row?.data).find(item => String(item.id ?? "") === branchId);
  const branchName = typeof branch?.name === "string" ? branch.name.trim() : "";
  return branchName ? { branchId, branchName } : null;
}
async function idem(tx: Tx): Promise<JsonRecord[]> { return load(tx, IDEMPOTENCY_KEY); }
async function remember(tx: Tx, entries: JsonRecord[], entry: JsonRecord): Promise<void> {
  await save(tx, IDEMPOTENCY_KEY, [entry, ...entries].slice(0, 1000));
}
function conflict(error: string) { return { kind: "conflict" as const, error }; }
function forbidden(error: string) { return { kind: "forbidden" as const, error }; }

async function command(
  req: Request,
  collection: "expenses" | "budgets",
  mutate: (items: JsonRecord[], auth: Auth, now: string) => { item: JsonRecord; deleted?: boolean } | Failure,
): Promise<{ item?: JsonRecord; deleted?: boolean; replay?: boolean; error?: string; status?: number }> {
  const valid = validCommand(req.body);
  if (!valid) return { status: 400, error: "expectedRevision (non-negative integer) and idempotencyKey are required" };
  const fingerprintValue = fingerprint(req);
  return db.transaction(async tx => {
    await tx.execute(LOCK);
    const idempotency = await idem(tx);
    const prior = idempotency.find(entry => entry.key === valid.idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprintValue) return { status: 409, error: "Idempotency key was already used for a different command" };
      return { item: prior.item as JsonRecord, deleted: prior.deleted === true, replay: true };
    }
    const items = await load(tx, collection);
    const deletionRows = collection === "expenses"
      ? await tx.select().from(appStateTable).where(eq(appStateTable.key, EXPENSE_DELETION_KEY))
      : [];
    const outcome = mutate(items, req.auth!, new Date().toISOString());
    if ("kind" in outcome) return { status: outcome.kind === "forbidden" ? 403 : 409, error: outcome.error };
    const nextItems = outcome.deleted
      ? items.filter(item => item !== outcome.item)
      : items.includes(outcome.item) ? items : [outcome.item, ...items];
    await save(tx, collection, nextItems);
    if (collection === "expenses" && outcome.deleted) {
      await save(tx, EXPENSE_DELETION_KEY, mergeWorkflowTombstones(
        deletionRows[0]?.data,
        [{ id: outcome.item.id, revision: revision(outcome.item) }],
      ));
    }
    await remember(tx, idempotency, { key: valid.idempotencyKey, fingerprint: fingerprintValue, item: outcome.item, deleted: outcome.deleted === true });
    return { item: outcome.item, deleted: outcome.deleted };
  });
}
function send(res: Response, result: Awaited<ReturnType<typeof command>>, event: string): void {
  if (result.error) { res.status(result.status ?? 400).json({ error: result.error }); return; }
  if (!result.replay) broadcastRealtime({ type: event, recordId: result.item!.id, branchId: result.item!.branchId ?? null, deleted: result.deleted === true });
  res.status(result.deleted ? 200 : result.replay ? 200 : 201).json({ record: result.item, deleted: result.deleted === true, replay: result.replay === true });
}
async function notify(result: Awaited<ReturnType<typeof command>>, input: Parameters<typeof deliverNotification>[0]) {
  if (!result.error && !result.replay) {
    try { await deliverNotification(input); } catch { /* The committed workflow remains authoritative. */ }
  }
}
function target(items: JsonRecord[], id: string, expected: number): JsonRecord | Failure {
  const item = items.find(value => String(value.id) === id);
  if (!item) return conflict("Record not found");
  if (revision(item) !== expected) return conflict("Stale revision");
  return item;
}
function isFailure(value: JsonRecord | Failure): value is Failure {
  return "kind" in value && (value.kind === "conflict" || value.kind === "forbidden");
}

router.post("/finance/expenses", async (req, res) => {
  const body = canonicalExpense(req.body?.expense);
  if (!body) { res.status(400).json({ error: "Invalid expense fields" }); return; }
  if (!EXPENSE_CREATORS.has(req.auth!.role)) { res.status(403).json({ error: "Your role cannot create expenses" }); return; }
  const result = await command(req, "expenses", (items, auth, now) => {
    const maxId = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
    const budget = body.budgetId;
    return { item: { ...body, id: maxId + 1, status: "pending", submittedAt: now, createdAt: now, createdBy: auth.username, by: auth.role, byName: auth.empName ?? auth.username, branchId: auth.branchId ?? null, revision: 1, budgetId: budget } };
  });
  send(res, result, "expense.changed");
});

router.patch("/finance/expenses/:id", async (req, res) => {
  const body = canonicalExpense(req.body?.expense);
  if (!body) { res.status(400).json({ error: "Invalid expense fields" }); return; }
  const result = await command(req, "expenses", (items, auth, now) => {
    const current = target(items, req.params.id, Number(req.body.expectedRevision)); if (isFailure(current)) return current;
    if (!sameBranch(current, auth)) return forbidden("You cannot modify an expense from another branch");
    const editable = (MANAGERS.has(auth.role) && canEditOwned(current, auth)) || (ACCOUNTANTS.has(auth.role) && ["pending", "rejected"].includes(String(current.status)));
    if (!editable) return forbidden("Your role cannot edit this expense");
    if (!["pending", "rejected"].includes(String(current.status))) return conflict("This expense is locked in its current workflow state");
    const item = { ...current, ...body, updatedAt: now, updatedBy: auth.username, revision: revision(current) + 1 };
    items[items.indexOf(current)] = item; return { item };
  }); send(res, result, "expense.changed");
});

router.delete("/finance/expenses/:id", async (req, res) => {
  const result = await command(req, "expenses", (items, auth) => {
    const current = target(items, req.params.id, Number(req.body.expectedRevision)); if (isFailure(current)) return current;
    if (!sameBranch(current, auth)) return forbidden("You cannot delete an expense from another branch");
    const allowed = (MANAGERS.has(auth.role) && canEditOwned(current, auth)) || (ACCOUNTANTS.has(auth.role) && ["pending", "rejected"].includes(String(current.status)));
    if (!allowed) return forbidden("Your role cannot delete this expense");
    if (!["pending", "rejected"].includes(String(current.status))) return conflict("This expense cannot be deleted after forwarding");
    return { item: current, deleted: true };
  }); send(res, result, "expense.changed");
});

function expenseTransition(action: "forward" | "approve" | "reject", from: string, role: string): string | null {
  if (action === "forward" && ACCOUNTANTS.has(role) && (from === "pending" || from === "rejected")) return "acc_forwarded";
  if ((action === "approve" || action === "reject") && MD.has(role) && from === "acc_forwarded") return action === "approve" ? "approved" : "rejected";
  return null;
}
for (const action of ["forward", "approve", "reject"] as const) router.post(`/finance/expenses/:id/${action}`, async (req, res) => {
  const result = await command(req, "expenses", (items, auth, now) => {
    if (action === "forward" && !ACCOUNTANTS.has(auth.role)) return forbidden("Only an accountant or admin can forward expenses");
    if ((action === "approve" || action === "reject") && !MD.has(auth.role)) return forbidden("Only the MD or admin can approve or reject expenses");
    const current = target(items, req.params.id, Number(req.body.expectedRevision)); if (isFailure(current)) return current;
    if (!sameBranch(current, auth)) return forbidden("You cannot act on an expense from another branch");
    const status = expenseTransition(action, String(current.status), auth.role);
    if (!status) return conflict("Illegal expense workflow transition for your role");
    const item = { ...current, status, updatedAt: now, updatedBy: auth.username, revision: revision(current) + 1, ...(status === "approved" ? { approvedBy: auth.username, approvedDt: now } : {}) };
    items[items.indexOf(current)] = item; return { item };
  });
  if (!result.error) {
    const target = action === "forward" ? "md" : String(result.item?.createdBy ?? result.item?.byName ?? "");
    await notify(result, {
      target, type: "operational",
      title: action === "forward" ? "Expense Awaiting MD Approval" : `Expense ${action === "approve" ? "Approved" : "Rejected"}`,
      body: `${result.item?.desc ?? "Expense"} — ₦${result.item?.amt ?? 0}`,
      data: { route: "/(app)/expenses", expenseId: result.item?.id },
    });
  }
  send(res, result, "expense.changed");
});

router.post("/finance/budgets", async (req, res) => {
  const body = canonicalBudget(req.body?.budget);
  if (!body) { res.status(400).json({ error: "Invalid budget fields" }); return; }
  if (!BUDGET_CREATORS.has(req.auth!.role)) { res.status(403).json({ error: "Your role cannot create budgets" }); return; }
  const requestedBranchId = typeof req.body?.budget?.branchId === "string"
    ? req.body.budget.branchId.trim()
    : "";
  const assignedBranchId = req.auth!.branchId || requestedBranchId;
  if (!assignedBranchId) { res.status(400).json({ error: "A branch is required for every budget" }); return; }
  const assignedBranch = await budgetBranch(assignedBranchId);
  if (!assignedBranch) { res.status(400).json({ error: "The selected budget branch does not exist" }); return; }
  const result = await command(req, "budgets", (items, auth, now) => {
    const maxId = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
    const submitted = req.body?.budget?.status === "submitted"
      || auth.role === "acc"
      || auth.role === "admin";
    const lineItems = body.items as JsonRecord[];
    return { item: { ...body, ...assignedBranch, id: maxId + 1, status: submitted ? "submitted" : "draft", workflow: submitted ? [workflow("Submitted to Accountant", "submit", `${lineItems.length} line items`, auth, now)] : [], submittedAt: now, createdAt: now, createdBy: auth.username, by: auth.role, byName: auth.empName ?? auth.username, revision: 1 } };
  });
  if (!result.error && result.item?.status === "submitted") await notify(result, {
    target: "acc", type: "operational", title: "Budget Awaiting Accountant Review",
    body: `${result.item.branchName} budget for ${result.item.label} — ₦${result.item.total}`,
    data: { route: "/(app)/budget", budgetId: result.item.id },
  });
  send(res, result, "budget.changed");
});

router.patch("/finance/budgets/:id", async (req, res) => {
  const body = canonicalBudget(req.body?.budget);
  if (!body) { res.status(400).json({ error: "Invalid budget fields" }); return; }
  const result = await command(req, "budgets", (items, auth, now) => {
    const current = target(items, req.params.id, Number(req.body.expectedRevision)); if (isFailure(current)) return current;
    if (!sameBranch(current, auth)) return forbidden("You cannot modify a budget from another branch");
    const allowed = (MANAGERS.has(auth.role) && canEditOwned(current, auth)) || (ACCOUNTANTS.has(auth.role) && ["submitted", "rejected"].includes(String(current.status)));
    if (!allowed) return forbidden("Your role cannot edit this budget");
    if (current.archivedAt || !["draft", "submitted", "rejected"].includes(String(current.status))) return conflict("This budget is locked in its current workflow state");
    const item = { ...current, ...body, updatedAt: now, updatedBy: auth.username, revision: revision(current) + 1 };
    items[items.indexOf(current)] = item; return { item };
  }); send(res, result, "budget.changed");
});

router.post("/finance/budgets/:id/update-submit", async (req, res) => {
  const body = canonicalBudget(req.body?.budget);
  if (!body) { res.status(400).json({ error: "Invalid budget fields" }); return; }
  const result = await command(req, "budgets", (items, auth, now) => {
    const current = target(items, req.params.id, Number(req.body.expectedRevision)); if (isFailure(current)) return current;
    if (!MANAGERS.has(auth.role) || !canEditOwned(current, auth)) return forbidden("Only the originating user may update and submit this budget");
    if (current.archivedAt || !["draft", "rejected"].includes(String(current.status))) return conflict("Only a draft or rejected budget can be updated and submitted");
    const history = Array.isArray(current.workflow) ? current.workflow.filter(record) : [];
    const item = {
      ...current,
      ...body,
      status: "submitted",
      workflow: [...history, workflow("Submitted to Accountant", "submit", `${(body.items as JsonRecord[]).length} line items`, auth, now)],
      updatedAt: now,
      updatedBy: auth.username,
      revision: revision(current) + 1,
    };
    items[items.indexOf(current)] = item;
    return { item };
  });
  if (!result.error) await notify(result, {
    target: "acc", type: "operational", title: "Budget Awaiting Accountant Review",
    body: `${result.item?.label} — ₦${result.item?.total}`,
    data: { route: "/(app)/budget", budgetId: result.item?.id },
  });
  send(res, result, "budget.changed");
});

router.delete("/finance/budgets/:id", async (req, res) => {
  const result = await command(req, "budgets", (items, auth) => {
    const current = target(items, req.params.id, Number(req.body.expectedRevision)); if (isFailure(current)) return current;
    if (!sameBranch(current, auth)) return forbidden("You cannot delete a budget from another branch");
    const originator = MANAGERS.has(auth.role) && canEditOwned(current, auth)
      && ["draft", "rejected"].includes(String(current.status));
    const accountant = ACCOUNTANTS.has(auth.role)
      && ["submitted", "rejected"].includes(String(current.status));
    if (!originator && !accountant) return forbidden("Your role cannot delete this budget in its current state");
    return { item: current, deleted: true };
  }); send(res, result, "budget.changed");
});

router.post("/finance/budgets/:id/archive", async (req, res) => {
  const result = await command(req, "budgets", (items, auth, now) => {
    const current = target(items, req.params.id, Number(req.body.expectedRevision)); if (isFailure(current)) return current;
    if (!ACCOUNTANTS.has(auth.role)) return forbidden("Only an accountant or admin can archive budgets");
    if (!sameBranch(current, auth)) return forbidden("You cannot archive a budget from another branch");
    if (current.archivedAt || !FINAL_BUDGETS.has(String(current.status))) return conflict("Only draft, rejected, or fully approved budgets can be archived");
    const item = { ...current, archivedAt: now, archivedBy: auth.username, updatedAt: now, revision: revision(current) + 1 };
    items[items.indexOf(current)] = item; return { item };
  }); send(res, result, "budget.changed");
});

function budgetTransition(action: "submit" | "forward" | "approve" | "reject", status: string, role: string): { status: string; stage: string } | null {
  if (action === "submit" && MANAGERS.has(role) && (status === "draft" || status === "rejected")) return { status: "submitted", stage: "Submitted to Accountant" };
  if (action === "forward" && ACCOUNTANTS.has(role) && (status === "submitted" || status === "rejected")) return { status: "acc_forwarded", stage: "Accountant reviewed" };
  if (action === "approve" && MD.has(role) && status === "acc_forwarded") return { status: "fully_approved", stage: "MD approved" };
  if (action === "reject" && (ACCOUNTANTS.has(role) && status === "submitted" || MD.has(role) && status === "acc_forwarded")) return { status: "rejected", stage: "Rejected" };
  return null;
}
for (const action of ["submit", "forward", "approve", "reject"] as const) router.post(`/finance/budgets/:id/${action}`, async (req, res) => {
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  const result = await command(req, "budgets", (items, auth, now) => {
    if (action === "submit" && !MANAGERS.has(auth.role)) return forbidden("Only a manager, CSM, or marketing user can submit a budget");
    if (action === "forward" && !ACCOUNTANTS.has(auth.role)) return forbidden("Only an accountant or admin can forward budgets");
    if ((action === "approve" || action === "reject") && !ACCOUNTANTS.has(auth.role) && !MD.has(auth.role)) return forbidden("Your role cannot decide this budget");
    const current = target(items, req.params.id, Number(req.body.expectedRevision)); if (isFailure(current)) return current;
    if (!sameBranch(current, auth)) return forbidden("You cannot act on a budget from another branch");
    if (current.archivedAt) return conflict("Archived budgets cannot transition");
    const next = budgetTransition(action, String(current.status), auth.role);
    if (!next) return conflict("Illegal budget workflow transition for your role");
    const history = Array.isArray(current.workflow) ? current.workflow.filter(record) : [];
    const item = { ...current, status: next.status, workflow: [...history, workflow(next.stage, action, note, auth, now)], updatedAt: now, updatedBy: auth.username, revision: revision(current) + 1 };
    items[items.indexOf(current)] = item; return { item };
  });
  if (!result.error) {
    const target = action === "submit" ? "acc"
      : action === "forward" ? "md"
      : String(result.item?.createdBy ?? result.item?.byName ?? "");
    await notify(result, {
      target, type: "operational",
      title: action === "submit" ? "Budget Awaiting Accountant Review"
        : action === "forward" ? "Budget Awaiting MD Approval"
        : `Budget ${action === "approve" ? "Approved" : "Rejected"}`,
      body: `${result.item?.branchName ?? "Branch"} budget for ${result.item?.label} — ₦${result.item?.total}`,
      data: { route: "/(app)/budget", budgetId: result.item?.id },
    });
  }
  send(res, result, "budget.changed");
});

export default router;