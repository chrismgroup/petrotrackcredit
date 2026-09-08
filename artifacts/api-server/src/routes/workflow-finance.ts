import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";

import { appStateTable, db, staffUsersTable } from "@workspace/db";
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
const EXPENSE_DECIDERS = new Set(["acc"]);
const MANAGERS = new Set(["mgr", "csm", "mktg"]);
const FINAL_BUDGETS = new Set(["draft", "fully_approved", "rejected"]);
const SUBMITTED_BUDGETS = new Set(["submitted", "acc_forwarded", "fully_approved"]);
const GLOBAL_FINANCE_REVIEWERS = new Set(["acc", "md", "ceo", "admin"]);
const BUDGET_BRANCH_CLASSIFIERS = new Set(["acc", "md", "ceo", "admin"]);

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
    || (
      !!auth.branchId
      && !!item.branchId
      && String(item.branchId) === String(auth.branchId)
    );
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
function budgetPeriodKey(item: JsonRecord): string | null {
  const branchId = String(item.branchId ?? "").trim();
  const month = Number(item.month);
  const year = Number(item.year);
  if (!branchId || !Number.isSafeInteger(month) || month < 1 || month > 12 || !Number.isSafeInteger(year)) return null;
  return `${branchId}|${year}-${month}`;
}
function hasSubmittedBudget(
  items: JsonRecord[],
  candidate: JsonRecord,
  excludeId?: unknown,
): boolean {
  const key = budgetPeriodKey(candidate);
  if (!key) return false;
  return items.some(item =>
    String(item.id) !== String(excludeId ?? "")
    && !item.archivedAt
    && SUBMITTED_BUDGETS.has(String(item.status))
    && budgetPeriodKey(item) === key,
  );
}
function budgetOwnerBranchId(
  budget: JsonRecord,
  staff: Array<{ username: string | null; empName: string; branchId: string | null }>,
): string {
  const explicit = String(budget.branchId ?? "").trim();
  if (explicit) return explicit;
  const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();
  const createdBy = normalize(budget.createdBy);
  const byName = normalize(budget.byName);
  const owner = staff.find(candidate =>
    (createdBy && normalize(candidate.username) === createdBy)
    || (byName && (
      normalize(candidate.empName) === byName
      || normalize(candidate.username) === byName
    )),
  );
  return owner?.branchId?.trim() ?? "";
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
async function approvedExpenseBudget(budgetId: number): Promise<{ branchId: string; branchName: string } | Failure> {
  const [budgetRow, branchRow, staff] = await Promise.all([
    db.select().from(appStateTable).where(eq(appStateTable.key, "budgets")),
    db.select().from(appStateTable).where(eq(appStateTable.key, "branches")),
    db.select({
      username: staffUsersTable.username,
      empName: staffUsersTable.empName,
      branchId: staffUsersTable.branchId,
    }).from(staffUsersTable),
  ]);
  const budget = records(budgetRow[0]?.data).find(item => Number(item.id) === budgetId);
  if (!budget) return conflict("The selected budget does not exist");
  if (budget.status !== "fully_approved") return conflict("Expenses can only be logged against a fully approved budget");

  let branchId = String(budget.branchId ?? "").trim();
  if (!branchId) {
    const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();
    const createdBy = normalize(budget.createdBy);
    const byName = normalize(budget.byName);
    const owner = staff.find(candidate =>
      (createdBy && normalize(candidate.username) === createdBy)
      || (byName && (normalize(candidate.empName) === byName || normalize(candidate.username) === byName))
    );
    branchId = owner?.branchId?.trim() ?? "";
  }
  if (!branchId) return conflict("Classify the selected budget's branch before logging expenses against it");
  const branch = records(branchRow[0]?.data).find(item => String(item.id ?? "") === branchId);
  const branchName = typeof branch?.name === "string" ? branch.name.trim() : "";
  if (!branchName) return conflict("The selected budget is not linked to a valid branch");
  return { branchId, branchName };
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
async function notifyBudgetPerformanceAlert(expense: JsonRecord): Promise<void> {
  if (String(expense.status) !== "approved") return;
  const budgetId = Number(expense.budgetId);
  if (!Number.isSafeInteger(budgetId)) return;
  const [budgetRow, expenseRow] = await Promise.all([
    db.select().from(appStateTable).where(eq(appStateTable.key, "budgets")),
    db.select().from(appStateTable).where(eq(appStateTable.key, "expenses")),
  ]);
  const budget = records(budgetRow[0]?.data).find(item => Number(item.id) === budgetId);
  if (!budget) return;
  const total = Number(budget.total);
  if (!Number.isFinite(total) || total <= 0) return;
  const approvedSpend = records(expenseRow[0]?.data)
    .filter(item => Number(item.budgetId) === budgetId && String(item.status) === "approved")
    .reduce((sum, item) => sum + (Number(item.amt) || 0), 0);
  const currentRatio = approvedSpend / total;
  const beforeRatio = Math.max(0, approvedSpend - (Number(expense.amt) || 0)) / total;
  const isOver = approvedSpend > total;
  const crossedOver = isOver && beforeRatio <= 1;
  const crossedWarning = !isOver && currentRatio >= 0.85 && beforeRatio < 0.85;
  if (!crossedOver && !crossedWarning) return;

  const branchId = String(budget.branchId ?? expense.branchId ?? "");
  const percent = Math.round(currentRatio * 100);
  const title = crossedOver ? "Budget Overspent" : "Budget nearing exhaustion";
  const body = crossedOver
    ? `${budget.branchName ?? "Branch"} ${budget.label} budget is ${percent}% spent — ₦${approvedSpend.toLocaleString()} used against ₦${total.toLocaleString()}.`
    : `${budget.branchName ?? "Branch"} ${budget.label} budget is ${percent}% spent. Review remaining funds before approving more expenses.`;
  const data = { route: "/(app)/budget", budgetId, branchId, performancePercent: percent };
  const recipients: Array<{ target: string; branchId?: string }> = [
    { target: "acc" },
    { target: "md" },
    { target: "ceo" },
    { target: "admin" },
    ...(branchId ? [{ target: "mgr", branchId }] : []),
  ];
  await Promise.all(recipients.map(recipient => deliverNotification({
    target: recipient.target,
    branchId: recipient.branchId,
    type: "operational",
    title,
    body,
    data,
  })));
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
  const assignedBranch = await approvedExpenseBudget(Number(body.budgetId));
  if ("kind" in assignedBranch) { res.status(409).json({ error: assignedBranch.error }); return; }
  if (req.auth!.branchId && String(req.auth!.branchId) !== assignedBranch.branchId) {
    res.status(403).json({ error: "You cannot log an expense against another branch's budget" });
    return;
  }
  const result = await command(req, "expenses", (items, auth, now) => {
    const maxId = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
    const budget = body.budgetId;
    return { item: { ...body, ...assignedBranch, id: maxId + 1, status: "pending", submittedAt: now, createdAt: now, createdBy: auth.username, by: auth.role, byName: auth.empName ?? auth.username, revision: 1, budgetId: budget } };
  });
  if (!result.error) await notify(result, {
    target: "acc", type: "operational",
    title: "Expense Awaiting Accountant Approval",
    body: `${result.item?.branchName ?? "Branch"} · ${result.item?.desc ?? "Expense"} — ₦${result.item?.amt ?? 0}`,
    data: { route: "/(app)/expenses", expenseId: result.item?.id },
  });
  send(res, result, "expense.changed");
});

router.patch("/finance/expenses/:id", async (req, res) => {
  const body = canonicalExpense(req.body?.expense);
  if (!body) { res.status(400).json({ error: "Invalid expense fields" }); return; }
  const assignedBranch = await approvedExpenseBudget(Number(body.budgetId));
  if ("kind" in assignedBranch) { res.status(409).json({ error: assignedBranch.error }); return; }
  const result = await command(req, "expenses", (items, auth, now) => {
    const current = target(items, req.params.id, Number(req.body.expectedRevision)); if (isFailure(current)) return current;
    if (!sameBranch(current, auth)) return forbidden("You cannot modify an expense from another branch");
    if (auth.branchId && String(auth.branchId) !== assignedBranch.branchId) return forbidden("You cannot use another branch's budget");
    if (current.branchId && String(current.branchId) !== assignedBranch.branchId) return conflict("An expense cannot be moved to another branch's budget");
    const editable = (MANAGERS.has(auth.role) && canEditOwned(current, auth)) || (ACCOUNTANTS.has(auth.role) && ["pending", "rejected"].includes(String(current.status)));
    if (!editable) return forbidden("Your role cannot edit this expense");
    if (!["pending", "rejected"].includes(String(current.status))) return conflict("This expense is locked in its current workflow state");
    const resubmitting = MANAGERS.has(auth.role) && current.status === "rejected";
    const item = {
      ...current,
      ...body,
      ...assignedBranch,
      ...(resubmitting ? { status: "pending", submittedAt: now } : {}),
      updatedAt: now,
      updatedBy: auth.username,
      revision: revision(current) + 1,
    };
    items[items.indexOf(current)] = item; return { item };
  });
  if (!result.error && result.item?.status === "pending") await notify(result, {
    target: "acc", type: "operational",
    title: "Expense Resubmitted for Accountant Approval",
    body: `${result.item?.branchName ?? "Branch"} · ${result.item?.desc ?? "Expense"} — ₦${result.item?.amt ?? 0}`,
    data: { route: "/(app)/expenses", expenseId: result.item?.id },
  });
  send(res, result, "expense.changed");
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
  if ((action === "approve" || action === "reject") && EXPENSE_DECIDERS.has(role) && (from === "pending" || from === "acc_forwarded")) {
    return action === "approve" ? "approved" : "rejected";
  }
  return null;
}
for (const action of ["forward", "approve", "reject"] as const) router.post(`/finance/expenses/:id/${action}`, async (req, res) => {
  const result = await command(req, "expenses", (items, auth, now) => {
    if (action === "forward") return forbidden("Expenses are approved directly by the Accountant; forwarding is not used");
    if ((action === "approve" || action === "reject") && !EXPENSE_DECIDERS.has(auth.role)) return forbidden("Only the Accountant can approve or reject expenses");
    const current = target(items, req.params.id, Number(req.body.expectedRevision)); if (isFailure(current)) return current;
    if (!sameBranch(current, auth)) return forbidden("You cannot act on an expense from another branch");
    const status = expenseTransition(action, String(current.status), auth.role);
    if (!status) return conflict("Illegal expense workflow transition for your role");
    const item = { ...current, status, updatedAt: now, updatedBy: auth.username, revision: revision(current) + 1, ...(status === "approved" ? { approvedBy: auth.username, approvedDt: now } : {}) };
    items[items.indexOf(current)] = item; return { item };
  });
  if (!result.error) {
    const target = String(result.item?.createdBy ?? result.item?.byName ?? "");
    await notify(result, {
      target, type: "operational",
      title: `Expense ${action === "approve" ? "Approved" : "Rejected"}`,
      body: `${result.item?.desc ?? "Expense"} — ₦${result.item?.amt ?? 0}`,
      data: { route: "/(app)/expenses", expenseId: result.item?.id },
    });
    if (action === "approve" && result.item) {
      try { await notifyBudgetPerformanceAlert(result.item); } catch { /* Alert delivery must not undo the approval. */ }
    }
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
    const candidate = {
      ...body,
      ...assignedBranch,
      id: maxId + 1,
      status: submitted ? "submitted" : "draft",
      workflow: submitted ? [workflow("Submitted to Accountant", "submit", `${lineItems.length} line items`, auth, now)] : [],
      submittedAt: now,
      createdAt: now,
      createdBy: auth.username,
      by: auth.role,
      byName: auth.empName ?? auth.username,
      revision: 1,
    };
    if (submitted && hasSubmittedBudget(items, candidate)) {
      return conflict(`This branch already has a budget submitted for ${body.label}`);
    }
    return { item: candidate };
  });
  if (!result.error && result.item?.status === "submitted") await notify(result, {
    target: "acc", type: "operational", title: "Budget Awaiting Accountant Review",
    body: `${result.item.branchName} budget for ${result.item.label} — ₦${result.item.total}`,
    data: { route: "/(app)/budget", budgetId: result.item.id },
  });
  send(res, result, "budget.changed");
});

router.post("/finance/budgets/consolidate-month", async (req, res) => {
  if (!ACCOUNTANTS.has(req.auth!.role)) {
    res.status(403).json({ error: "Only an accountant or admin can consolidate monthly budgets" });
    return;
  }
  const year = Number(req.body?.year);
  const month = Number(req.body?.month);
  const headOfficeBranchId = typeof req.body?.headOfficeBranchId === "string"
    ? req.body.headOfficeBranchId.trim()
    : "";
  const idempotencyKey = typeof req.body?.idempotencyKey === "string"
    ? req.body.idempotencyKey.trim()
    : "";
  if (!Number.isSafeInteger(year) || year < 2000 || !Number.isSafeInteger(month) || month < 1 || month > 12 || !headOfficeBranchId || !idempotencyKey) {
    res.status(400).json({ error: "year, month, headOfficeBranchId, and idempotencyKey are required" });
    return;
  }
  const headOffice = await budgetBranch(headOfficeBranchId);
  if (!headOffice) {
    res.status(400).json({ error: "The selected Head office branch does not exist" });
    return;
  }

  const fingerprintValue = fingerprint(req);
  const result = await db.transaction(async tx => {
    await tx.execute(LOCK);
    const idempotency = await idem(tx);
    const prior = idempotency.find(entry => entry.key === idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprintValue) {
        return { status: 409, error: "Idempotency key was already used for a different command" };
      }
      return { summary: prior.item as JsonRecord, replay: true };
    }

    const [budgetRow, expenseRow, staff] = await Promise.all([
      tx.select().from(appStateTable).where(eq(appStateTable.key, "budgets")),
      tx.select().from(appStateTable).where(eq(appStateTable.key, "expenses")),
      tx.select({
        username: staffUsersTable.username,
        empName: staffUsersTable.empName,
        branchId: staffUsersTable.branchId,
      }).from(staffUsersTable),
    ]);
    const budgets = records(budgetRow[0]?.data);
    const expenses = records(expenseRow[0]?.data);
    const monthBudgets = budgets.filter(item => Number(item.year) === year && Number(item.month) === month);
    if (monthBudgets.length === 0) {
      return { status: 409, error: `No budgets exist for ${year}-${String(month).padStart(2, "0")}` };
    }

    const groups = new Map<string, JsonRecord[]>();
    for (const budget of monthBudgets) {
      let branchId = budgetOwnerBranchId(budget, staff);
      if (!branchId) {
        if (["acc", "admin"].includes(String(budget.by))) branchId = headOfficeBranchId;
        else return { status: 409, error: `Cannot determine a branch for budget ${String(budget.id)}` };
      }
      const group = groups.get(branchId) ?? [];
      group.push(budget);
      groups.set(branchId, group);
    }

    const monthLabel = `${[
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ][month - 1]} ${year}`;
    const now = new Date().toISOString();
    const canonicalBySourceId = new Map<string, { id: number; branchId: string; branchName: string }>();
    const canonicalBudgets: JsonRecord[] = [];
    const archivedBudgets: JsonRecord[] = [];

    for (const [branchId, group] of groups) {
      const branch = branchId === headOfficeBranchId ? headOffice : await (async () => {
        const [row] = await tx.select().from(appStateTable).where(eq(appStateTable.key, "branches"));
        const match = records(row?.data).find(item => String(item.id ?? "") === branchId);
        const branchName = typeof match?.name === "string" ? match.name.trim() : "";
        return branchName ? { branchId, branchName } : null;
      })();
      if (!branch) return { status: 409, error: `Branch ${branchId} does not exist` };

      const ordered = [...group].sort((a, b) => Number(a.id) - Number(b.id));
      const primary = ordered[0];
      const sourceIds = ordered.map(item => Number(item.id)).filter(Number.isSafeInteger);
      const mergedItems = ordered.flatMap(item => Array.isArray(item.items)
        ? item.items.filter(record).map(line => ({ cat: String(line.cat ?? "").trim(), amt: Number(line.amt) }))
          .filter(line => line.cat && Number.isFinite(line.amt) && line.amt > 0)
        : []);
      if (mergedItems.length === 0) return { status: 409, error: `Budget ${String(primary.id)} has no valid line items` };

      const allFullyApproved = ordered.every(item => String(item.status) === "fully_approved");
      const history = ordered
        .flatMap(item => Array.isArray(item.workflow) ? item.workflow.filter(record) : [])
        .sort((a, b) => Date.parse(String(a.dt ?? "")) - Date.parse(String(b.dt ?? "")));
      const mergedStatus = allFullyApproved ? "fully_approved" : "submitted";
      const mergedHistory = [
        ...history,
        workflow(
          "Budgets consolidated",
          "merge",
          `${sourceIds.length} ${monthLabel} budget${sourceIds.length === 1 ? "" : "s"} merged for ${branch.branchName}`,
          req.auth!,
          now,
        ),
        ...(mergedStatus === "submitted"
          ? [workflow("Submitted to Accountant", "submit", "Consolidated budget requires Accountant review", req.auth!, now)]
          : []),
      ];
      const canonical = {
        ...primary,
        ...branch,
        label: monthLabel,
        items: mergedItems,
        total: mergedItems.reduce((sum, item) => sum + item.amt, 0),
        status: mergedStatus,
        workflow: mergedHistory,
        submittedAt: primary.submittedAt ?? now,
        mergedFromBudgetIds: sourceIds,
        consolidatedAt: now,
        consolidatedBy: req.auth!.username,
        updatedAt: now,
        updatedBy: req.auth!.username,
        revision: revision(primary) + 1,
      };
      canonicalBudgets.push(canonical);
      for (const source of ordered) {
        canonicalBySourceId.set(String(source.id), {
          id: Number(primary.id),
          branchId: branch.branchId,
          branchName: branch.branchName,
        });
        if (source !== primary) {
          archivedBudgets.push({
            ...source,
            archivedAt: now,
            archivedBy: req.auth!.username,
            archivedReason: `Merged into budget ${String(primary.id)}`,
            mergedIntoBudgetId: Number(primary.id),
            updatedAt: now,
            updatedBy: req.auth!.username,
            revision: revision(source) + 1,
          });
        }
      }
    }

    const canonicalIds = new Set(canonicalBudgets.map(item => String(item.id)));
    const archivedIds = new Set(archivedBudgets.map(item => String(item.id)));
    const nextBudgets = [
      ...canonicalBudgets,
      ...archivedBudgets,
      ...budgets.filter(item =>
        !monthBudgets.includes(item)
        && !canonicalIds.has(String(item.id))
        && !archivedIds.has(String(item.id)),
      ),
    ];
    const nextExpenses = expenses.map(expense => {
      const target = canonicalBySourceId.get(String(expense.budgetId ?? ""));
      if (!target) return expense;
      return {
        ...expense,
        budgetId: target.id,
        branchId: target.branchId,
        branchName: target.branchName,
        updatedAt: now,
        revision: revision(expense) + 1,
      };
    });
    await save(tx, "budgets", nextBudgets);
    await save(tx, "expenses", nextExpenses);

    const summary = {
      year,
      month,
      headOfficeBranchId,
      canonicalBudgets,
      archivedBudgetIds: archivedBudgets.map(item => Number(item.id)),
      relinkedExpenseIds: expenses
        .filter(expense => canonicalBySourceId.has(String(expense.budgetId ?? "")))
        .map(expense => Number(expense.id)),
    };
    await remember(tx, idempotency, { key: idempotencyKey, fingerprint: fingerprintValue, item: summary });
    return { summary };
  });

  if ("error" in result) {
    res.status(result.status ?? 409).json({ error: result.error });
    return;
  }
  if (!result.replay) {
    for (const budget of result.summary.canonicalBudgets as JsonRecord[]) {
      broadcastRealtime({ type: "budget.changed", recordId: budget.id, branchId: budget.branchId ?? null });
      if (budget.status === "submitted") {
        await notify(result as Awaited<ReturnType<typeof command>>, {
          target: "acc",
          branchId: String(budget.branchId ?? ""),
          type: "operational",
          title: "Consolidated Budget Awaiting Accountant Review",
          body: `${budget.branchName} budget for ${budget.label} — ₦${budget.total}`,
          data: { route: "/(app)/budget", budgetId: budget.id },
        });
      }
    }
    for (const expenseId of result.summary.relinkedExpenseIds as number[]) {
      broadcastRealtime({ type: "expense.changed", recordId: expenseId });
    }
  }
  res.status(result.replay ? 200 : 201).json({ ...result.summary, replay: result.replay === true });
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
    const item: JsonRecord = { ...current, ...body, updatedAt: now, updatedBy: auth.username, revision: revision(current) + 1 };
    if (item.status === "submitted" && hasSubmittedBudget(items, item, current.id)) {
      return conflict(`This branch already has a budget submitted for ${body.label}`);
    }
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
    if (hasSubmittedBudget(items, item, current.id)) {
      return conflict(`This branch already has a budget submitted for ${body.label}`);
    }
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

router.post("/finance/budgets/:id/classify-branch", async (req, res) => {
  if (!BUDGET_BRANCH_CLASSIFIERS.has(req.auth!.role)) {
    res.status(403).json({ error: "Only an accountant, MD, CEO, or admin can classify historical budgets" });
    return;
  }
  const requestedBranchId = typeof req.body?.branchId === "string" ? req.body.branchId.trim() : "";
  if (!requestedBranchId) { res.status(400).json({ error: "A branch is required" }); return; }
  const assignedBranch = await budgetBranch(requestedBranchId);
  if (!assignedBranch) { res.status(400).json({ error: "The selected branch does not exist" }); return; }
  const result = await command(req, "budgets", (items, auth, now) => {
    const current = target(items, req.params.id, Number(req.body.expectedRevision)); if (isFailure(current)) return current;
    if (String(current.branchId ?? "").trim()) return conflict("This budget already has a branch");
    const history = Array.isArray(current.workflow) ? current.workflow.filter(record) : [];
    const item = {
      ...current,
      ...assignedBranch,
      workflow: [...history, workflow(
        "Historical branch classified",
        "classify_branch",
        `Assigned to ${assignedBranch.branchName}`,
        auth,
        now,
      )],
      branchClassifiedAt: now,
      branchClassifiedBy: auth.username,
      updatedAt: now,
      updatedBy: auth.username,
      revision: revision(current) + 1,
    };
    items[items.indexOf(current)] = item;
    return { item };
  });
  send(res, result, "budget.changed");
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
    if (action === "submit" && hasSubmittedBudget(items, current, current.id)) {
      return conflict(`This branch already has a budget submitted for ${current.label}`);
    }
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