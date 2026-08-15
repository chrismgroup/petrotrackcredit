import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, appStateTable, staffUsersTable } from "@workspace/db";
import { createBackup, listBackups, restoreBackup } from "../lib/backup";

const router: IRouter = Router();

const ALLOWED_KEYS = new Set([
  "companyInfo", "tanks", "lpgTanks", "pumps", "staff", "branches",
  "departments", "userAccounts", "prices", "priceHistory", "mgrPerms",
  "roleAccess", "userAccess", "expenses", "budgets", "sales", "dips",
  "deliveries", "maintenance", "audit", "messages", "tasks", "kpis",
  "companyFiles", "deliveryEvidences", "shiftReports", "hrEmployees",
  "hrHandbooks", "hrRecommendations", "complianceDocs", "priceProposals",
  "legalMatters", "corpProjects", "meetingMinutes",
  "broadcasts", "callLog", "pumpDailyReports", "pumpInitialMeters",
  "pumpLockedMeters", "inventoryLog", "financialEntry", "marketCompetitors",
  "myFolders", "myFolderFiles", "startupStocks", "stockSnapshotConfig",
]);

// Keys that modify access control, credentials, or HR/legal/financial records.
// Only admin-role users may write to these.
const ADMIN_WRITE_KEYS = new Set([
  "userAccounts", "roleAccess", "userAccess", "mgrPerms",
  "hrEmployees", "hrHandbooks", "hrRecommendations",
  "companyFiles", "legalMatters", "meetingMinutes", "corpProjects",
  "companyInfo", "departments", "branches", "startupStocks", "stockSnapshotConfig",
]);

// Selling prices are operational. Managers may update only their own branch
// override; CEO, MD, and admin may update the network fallback.
const PRICE_WRITE_ROLES = new Set(["admin", "ceo", "md", "mgr"]);

const OPERATIONAL_KEYS = [
  "expenses", "budgets", "sales", "dips", "deliveries", "maintenance",
  "inventoryLog", "pumpDailyReports", "financialEntry", "messages",
  "tasks", "kpis", "companyFiles", "deliveryEvidences", "hrEmployees",
  "hrHandbooks", "hrRecommendations", "priceProposals", "legalMatters",
  "corpProjects", "meetingMinutes", "broadcasts", "callLog", "priceHistory",
];

type JsonRecord = Record<string, unknown>;

const PUMP_REPORT_STATUS_RANK: Record<string, number> = {
  pending_manager: 1,
  returned: 2,
  pending_accountant: 3,
  approved: 4,
};

function pumpReportActivityMs(report: JsonRecord): number {
  const timestamps = ["submittedAt", "mgrAt", "accAt"]
    .map(key => Date.parse(String(report[key] ?? "")))
    .filter(value => Number.isFinite(value));
  return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

/**
 * Pump reports are edited by attendants, managers, and accountants on separate
 * devices. A client PUT contains its complete local array, so replacing the
 * server array would let an older device erase a newly submitted report.
 * Merge by report ID and keep the version with the latest workflow activity.
 */
function mergePumpDailyReports(existing: unknown, incoming: unknown): JsonRecord[] {
  const merged = new Map<string, JsonRecord>();

  const add = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const report = value as JsonRecord;
    const id = String(report.id ?? "");
    if (!id) return;

    const current = merged.get(id);
    if (!current) {
      merged.set(id, report);
      return;
    }

    const currentActivity = pumpReportActivityMs(current);
    const candidateActivity = pumpReportActivityMs(report);
    const currentRank = PUMP_REPORT_STATUS_RANK[String(current.status ?? "")] ?? 0;
    const candidateRank = PUMP_REPORT_STATUS_RANK[String(report.status ?? "")] ?? 0;

    if (
      candidateActivity > currentActivity ||
      (candidateActivity === currentActivity && candidateRank >= currentRank)
    ) {
      merged.set(id, report);
    }
  };

  if (Array.isArray(existing)) existing.forEach(add);
  if (Array.isArray(incoming)) incoming.forEach(add);
  return Array.from(merged.values());
}

async function resolveManagerBranchId(username?: string): Promise<string | undefined> {
  if (!username) return undefined;
  const [manager] = await db
    .select({ branchId: staffUsersTable.branchId })
    .from(staffUsersTable)
    .where(eq(staffUsersTable.username, username));
  return manager?.branchId ?? undefined;
}

router.get("/state", async (_req, res): Promise<void> => {
  const rows = await db.select().from(appStateTable);
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row.key] = row.data;
  }
  res.json(result);
});

/**
 * Admin-only: seed pump meters from the most recent shift reports, then clear all
 * operational data. This is the safe production reset path that preserves the
 * current pump opening meters while wiping test transactions.
 *
 * Must be defined BEFORE /state/:key so it is not swallowed by the generic route.
 */
router.post("/state/reset-operational", async (req, res): Promise<void> => {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const rows = await db
    .select()
    .from(appStateTable)
    .where(sql`${appStateTable.key} IN (${[
      "pumpDailyReports",
      "pumpInitialMeters",
      "pumpLockedMeters",
      "pumps",
      "audit",
    ]})`);

  const state = Object.fromEntries(rows.map((r) => [r.key, r.data]));

  const pumpDailyReports = Array.isArray(state.pumpDailyReports) ? state.pumpDailyReports : [];
  const pumpInitialMeters =
    state.pumpInitialMeters && typeof state.pumpInitialMeters === "object"
      ? (state.pumpInitialMeters as Record<string, number>)
      : {};
  const pumpLockedMeters =
    state.pumpLockedMeters && typeof state.pumpLockedMeters === "object"
      ? (state.pumpLockedMeters as Record<string, number>)
      : {};
  const pumps = Array.isArray(state.pumps) ? state.pumps : [];
  const audit = Array.isArray(state.audit) ? state.audit : [];

  const seedMeters: Record<string, number> = {};
  for (const pump of pumps) {
    if (!pump?.id) continue;
    const pumpId = pump.id as string;
    const sorted = [...pumpDailyReports]
      .filter(
        (r: any) =>
          r.pumpId === pumpId &&
          (r.status === "approved" || r.status === "pending_accountant"),
      )
      .sort(
        (a: any, b: any) =>
          String(b.date ?? "").localeCompare(String(a.date ?? "")) ||
          pumpReportActivityMs(b) - pumpReportActivityMs(a) ||
          Number(b.id ?? 0) - Number(a.id ?? 0),
      );
    if (sorted.length > 0) {
      seedMeters[pumpId] = Number(sorted[0].closingMeter);
      continue;
    }
      if (pumpLockedMeters[pumpId] !== undefined) {
        seedMeters[pumpId] = Number(pumpLockedMeters[pumpId]);
        continue;
      }
    if (pumpInitialMeters[pumpId] !== undefined) {
      seedMeters[pumpId] = Number(pumpInitialMeters[pumpId]);
    }
  }

  const auditEntry = {
    id: Math.floor(Math.random() * 1_000_000_000),
    action: "Operational data seeded and reset",
    user: req.auth.username,
    detail: `Preserved pump opening meters from ${pumpDailyReports.length} shift reports; cleared operational data for real-life entry.`,
    ts: new Date().toISOString(),
  };
  const newAudit = [auditEntry, ...audit];

  await db.transaction(async (tx) => {
    await tx
      .insert(appStateTable)
      .values({ key: "pumpInitialMeters", data: seedMeters })
      .onConflictDoUpdate({
        target: appStateTable.key,
        set: { data: seedMeters, updatedAt: new Date() },
      });

    await tx
      .insert(appStateTable)
      .values({ key: "pumpLockedMeters", data: {} })
      .onConflictDoUpdate({
        target: appStateTable.key,
        set: { data: {}, updatedAt: new Date() },
      });

    for (const key of OPERATIONAL_KEYS) {
      const emptyValue = key === "messages" ? {} : [];
      await tx
        .insert(appStateTable)
        .values({ key, data: emptyValue })
        .onConflictDoUpdate({
          target: appStateTable.key,
          set: { data: emptyValue, updatedAt: new Date() },
        });
    }

    await tx
      .insert(appStateTable)
      .values({ key: "audit", data: newAudit })
      .onConflictDoUpdate({
        target: appStateTable.key,
        set: { data: newAudit, updatedAt: new Date() },
      });
  });

  res.json({ ok: true, seedMeters });
});

/* ── Backup routes (admin-only) ─────────────────────────────────────────── */

router.post("/state/backup", async (req, res): Promise<void> => {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const meta = await createBackup();
    res.json({ ok: true, backup: meta });
  } catch (err) {
    req.log.error({ err }, "Manual backup failed");
    res.status(500).json({ error: "Backup failed" });
  }
});

router.get("/state/backups", async (req, res): Promise<void> => {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const backups = await listBackups();
    res.json({ backups });
  } catch (err) {
    req.log.error({ err }, "List backups failed");
    res.status(500).json({ error: "Failed to list backups" });
  }
});

router.post("/state/restore", async (req, res): Promise<void> => {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { objectName } = req.body ?? {};
  if (typeof objectName !== "string" || !objectName) {
    res.status(400).json({ error: "objectName is required" });
    return;
  }
  try {
    const { keysRestored } = await restoreBackup(objectName);
    res.json({ ok: true, keysRestored });
  } catch (err) {
    req.log.error({ err }, "Restore failed");
    res.status(500).json({ error: "Restore failed" });
  }
});

/* ── Generic per-key state routes (must come AFTER the specific /state/* routes) ── */

router.get("/state/:key", async (req, res): Promise<void> => {
  const key = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  if (!ALLOWED_KEYS.has(key)) {
    res.status(400).json({ error: "Unknown state key" });
    return;
  }
  const [row] = await db.select().from(appStateTable).where(eq(appStateTable.key, key));
  if (!row) {
    res.json(null);
    return;
  }
  res.json(row.data);
});

router.put("/state/:key", async (req, res): Promise<void> => {
  const key = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  if (!ALLOWED_KEYS.has(key)) {
    res.status(400).json({ error: "Unknown state key" });
    return;
  }

  // Sensitive keys require admin role
  if (ADMIN_WRITE_KEYS.has(key) && req.auth?.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if ((key === "prices" || key === "priceHistory") && !PRICE_WRITE_ROLES.has(req.auth?.role ?? "")) {
    res.status(403).json({ error: "Only Admin, CEO, MD, or station managers may update prices" });
    return;
  }

  let data = req.body;
  if (data === undefined || data === null) {
    res.status(400).json({ error: "Body required" });
    return;
  }

  // A manager sends the full client-side state blob on every sync. Never let
  // that blob replace the network fallback or another branch's override.
  // Merge only this manager's branch into the server-authoritative prices.
  if (key === "prices" && req.auth?.role === "mgr") {
    const managerBranchId = req.auth.branchId ?? await resolveManagerBranchId(req.auth.username);
    if (!managerBranchId) {
      res.status(403).json({ error: "A branch assignment is required to update prices" });
      return;
    }
    const [existingRow] = await db
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.key, "prices"));
    const existing = existingRow?.data && typeof existingRow.data === "object"
      ? existingRow.data as Record<string, unknown>
      : {};
    const incoming = typeof data === "object" ? data as Record<string, unknown> : {};
    const existingBranchPrices = existing.branchPrices && typeof existing.branchPrices === "object"
      ? existing.branchPrices as Record<string, unknown>
      : {};
    const incomingBranchPrices = incoming.branchPrices && typeof incoming.branchPrices === "object"
      ? incoming.branchPrices as Record<string, unknown>
      : {};
    const existingBranch = existingBranchPrices[managerBranchId] && typeof existingBranchPrices[managerBranchId] === "object"
      ? existingBranchPrices[managerBranchId] as Record<string, unknown>
      : {};
    const incomingBranch = incomingBranchPrices[managerBranchId] && typeof incomingBranchPrices[managerBranchId] === "object"
      ? incomingBranchPrices[managerBranchId] as Record<string, unknown>
      : {};
    data = {
      ...existing,
      branchPrices: {
        ...existingBranchPrices,
        [managerBranchId]: { ...existingBranch, ...incomingBranch },
      },
    };
  }

  // History is also a shared state blob. Preserve every other branch's
  // entries and accept only entries explicitly tagged for this manager's
  // branch.
  if (key === "priceHistory" && req.auth?.role === "mgr") {
    const managerBranchId = req.auth.branchId ?? await resolveManagerBranchId(req.auth.username);
    if (!managerBranchId) {
      res.status(403).json({ error: "A branch assignment is required to update price history" });
      return;
    }
    const [existingRow] = await db
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.key, "priceHistory"));
    const existingHistory = Array.isArray(existingRow?.data) ? existingRow.data as Record<string, unknown>[] : [];
    const incomingHistory = Array.isArray(data) ? data as Record<string, unknown>[] : [];
    const incomingOwn = incomingHistory.filter(entry => entry.branchId === managerBranchId);
    const existingOtherBranches = existingHistory.filter(entry => entry.branchId !== managerBranchId);
    data = [...incomingOwn, ...existingOtherBranches];
  }

  // Reports are shared workflow records. Merge instead of replacing the full
  // array so a stale attendant/manager/accountant client cannot erase reports
  // submitted by another device between its initial sync and its next PUT.
  if (key === "pumpDailyReports" && Array.isArray(data)) {
    const [existingRow] = await db
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.key, "pumpDailyReports"));
    data = mergePumpDailyReports(existingRow?.data, data);
  }

  // Server-side cap: keep only the newest audit entries (entries are prepended),
  // so older app builds without the client-side cap can't grow the log unbounded.
  if (key === "audit" && Array.isArray(data) && data.length > 500) {
    data = data.slice(0, 500);
  }
  await db
    .insert(appStateTable)
    .values({ key, data })
    .onConflictDoUpdate({ target: appStateTable.key, set: { data, updatedAt: new Date() } });
  res.json({ ok: true });
});

export default router;
