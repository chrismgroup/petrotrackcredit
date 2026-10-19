import { Router, type IRouter, type Request, type Response } from "express";

import { broadcastRealtime } from "../lib/realtime";
import {
  PAYROLL_PREPARER_ROLES,
  PAYROLL_VIEWER_ROLES,
  PayrollError,
  payrollStore,
  type Actor,
  type EntryPatch,
} from "../lib/payrollStore";
import { deliverNotification } from "./notifications.js";

const router: IRouter = Router();

async function safeNotify(input: Parameters<typeof deliverNotification>[0]) {
  try { await deliverNotification(input); } catch { /* Notifications never undo a saved payroll change. */ }
}

function actor(req: Request): Actor {
  return { username: req.auth!.username, role: req.auth!.role };
}

function monthLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function idParam(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new PayrollError(400, "Invalid id");
  return id;
}

type Handler = (req: Request, res: Response) => Promise<unknown>;
function handle(roles: Set<string> | null, fn: Handler) {
  return async (req: Request, res: Response) => {
    try {
      if (roles && !roles.has(req.auth?.role ?? "")) throw new PayrollError(403, "You do not have access to payroll");
      await fn(req, res);
      return undefined;
    } catch (error) {
      if (error instanceof PayrollError) return res.status(error.status).json({ error: error.message });
      req.log?.error?.({ err: error }, "payroll request failed");
      return res.status(500).json({ error: "Payroll could not be saved. Please try again." });
    }
  };
}

const ENTRY_FIELDS = [
  "empName", "empId", "jobTitle", "dept", "bankName", "accountNumber",
  "basic", "housing", "transport", "otherAllowances", "overtime", "bonus",
  "loan", "otherDeductions", "otherDeductionsLabel", "pensionEmployee", "nhis", "paye",
  "monthlyGross", "note", "reason",
] as const;
function entryPatch(body: unknown): EntryPatch {
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const patch: Record<string, unknown> = {};
  for (const field of ENTRY_FIELDS) if (field in source) patch[field] = source[field];
  return patch as EntryPatch;
}

function changed() {
  broadcastRealtime({ type: "payroll.changed" });
}

router.get("/payroll/runs", handle(PAYROLL_VIEWER_ROLES, async (_req, res) => {
  res.json({ runs: await payrollStore.listRuns() });
}));

router.post("/payroll/runs", handle(PAYROLL_PREPARER_ROLES, async (req, res) => {
  const id = await payrollStore.createRun(String(req.body?.period ?? ""), actor(req), String(req.body?.notes ?? ""));
  changed();
  res.status(201).json(await payrollStore.getRun(id));
}));

router.get("/payroll/runs/:id", handle(PAYROLL_VIEWER_ROLES, async (req, res) => {
  res.json(await payrollStore.getRun(idParam(req.params.id)));
}));

router.patch("/payroll/runs/:id", handle(PAYROLL_PREPARER_ROLES, async (req, res) => {
  const id = idParam(req.params.id);
  await payrollStore.updateNotes(id, String(req.body?.notes ?? ""), actor(req));
  changed();
  res.json(await payrollStore.getRun(id));
}));

router.delete("/payroll/runs/:id", handle(PAYROLL_PREPARER_ROLES, async (req, res) => {
  await payrollStore.deleteRun(idParam(req.params.id), actor(req));
  changed();
  res.json({ ok: true });
}));

router.post("/payroll/runs/:id/sync", handle(PAYROLL_PREPARER_ROLES, async (req, res) => {
  const id = idParam(req.params.id);
  const added = await payrollStore.syncStaff(id, actor(req));
  changed();
  res.json({ added, ...(await payrollStore.getRun(id)) });
}));

router.post("/payroll/runs/:id/entries", handle(PAYROLL_PREPARER_ROLES, async (req, res) => {
  const entry = await payrollStore.addEntry(idParam(req.params.id), entryPatch(req.body), actor(req));
  changed();
  res.status(201).json({ entry });
}));

router.patch("/payroll/runs/:id/entries/:entryId", handle(PAYROLL_PREPARER_ROLES, async (req, res) => {
  const { entry, revised } = await payrollStore.updateEntry(idParam(req.params.id), idParam(req.params.entryId), entryPatch(req.body), actor(req));
  changed();
  if (revised && entry.username) {
    await safeNotify({
      target: entry.username,
      type: "operational",
      title: "Payslip Revised",
      body: `Your ${monthLabel(entry.period)} payslip was updated (version ${entry.version}). Net pay: ₦${entry.net.toLocaleString("en-NG", { minimumFractionDigits: 2 })}.`,
      data: { route: "/(app)/payroll", payslipId: entry.id },
    });
  }
  res.json({ entry, revised });
}));

router.delete("/payroll/runs/:id/entries/:entryId", handle(PAYROLL_PREPARER_ROLES, async (req, res) => {
  await payrollStore.removeEntry(idParam(req.params.id), idParam(req.params.entryId), actor(req));
  changed();
  res.json({ ok: true });
}));

router.get("/payroll/entries/:entryId/revisions", handle(PAYROLL_VIEWER_ROLES, async (req, res) => {
  res.json({ revisions: await payrollStore.revisions(idParam(req.params.entryId)) });
}));

for (const action of ["submit", "approve", "return"] as const) {
  router.post(`/payroll/runs/:id/${action}`, handle(PAYROLL_VIEWER_ROLES, async (req, res) => {
    const id = idParam(req.params.id);
    const status = await payrollStore.transition(id, action, actor(req), String(req.body?.note ?? ""));
    changed();
    const { run } = await payrollStore.getRun(id);
    const month = monthLabel(run.period);
    const route = "/(app)/payroll";
    if (status === "acc_review") {
      await safeNotify({ target: "acc", type: "operational", title: "Payroll Awaiting Review", body: `HR submitted the ${month} payroll for your review.`, data: { route, payrollId: id } });
    } else if (status === "md_review") {
      await safeNotify({ target: "md", type: "operational", title: "Payroll Awaiting Approval", body: `The Accountant reviewed the ${month} payroll. It needs your approval.`, data: { route, payrollId: id } });
    } else if (status === "returned") {
      await safeNotify({ target: "csm", type: "operational", title: "Payroll Returned", body: `The ${month} payroll was returned: ${String(req.body?.note ?? "").slice(0, 140)}`, data: { route, payrollId: id } });
    } else if (status === "released") {
      await safeNotify({ target: "csm", type: "operational", title: "Payroll Approved", body: `The MD approved the ${month} payroll. Payslips are now available to staff.`, data: { route, payrollId: id } });
      for (const username of await payrollStore.releasedUsernames(id)) {
        await safeNotify({ target: username, type: "operational", title: "Your Payslip Is Ready", body: `Your ${month} payslip is available to download.`, data: { route } });
      }
    }
    res.json({ run });
  }));
}

router.get("/payroll/my-payslips", handle(null, async (req, res) => {
  res.json({ payslips: await payrollStore.myPayslips(req.auth!.username) });
}));

router.get("/payroll/payslips/:entryId", handle(null, async (req, res) => {
  const entry = await payrollStore.getEntry(idParam(req.params.entryId));
  const auth = req.auth!;
  const own = entry.username === auth.username;
  if (PAYROLL_VIEWER_ROLES.has(auth.role)) return res.json({ entry });
  if (!own || entry.runStatus !== "released") throw new PayrollError(404, "Payslip not found");
  return res.json({ entry });
}));

export default router;
