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
  "myFolders", "myFolderFiles", "startupStocks",
]);

// Keys that modify access control, credentials, or HR/legal/financial records.
// Only admin-role users may write to these.
const ADMIN_WRITE_KEYS = new Set([
  "userAccounts", "roleAccess", "userAccess", "mgrPerms",
  "hrEmployees", "hrHandbooks", "hrRecommendations",
  "companyFiles", "legalMatters", "meetingMinutes", "corpProjects",
  "companyInfo", "departments", "branches", "startupStocks",
]);

// Selling prices are operational but affect the whole station network.
// CEO, MD, admin, and station managers may update them directly.
const PRICE_WRITE_ROLES = new Set(["admin", "ceo", "md", "mgr"]);

const OPERATIONAL_KEYS = [
  "expenses", "budgets", "sales", "dips", "deliveries", "maintenance",
  "inventoryLog", "pumpDailyReports", "financialEntry", "messages",
  "tasks", "kpis", "companyFiles", "deliveryEvidences", "hrEmployees",
  "hrHandbooks", "hrRecommendations", "priceProposals", "legalMatters",
  "corpProjects", "meetingMinutes", "broadcasts", "callLog", "priceHistory",
];

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
    if (pumpLockedMeters[pumpId] !== undefined) {
      seedMeters[pumpId] = Number(pumpLockedMeters[pumpId]);
      continue;
    }
    const sorted = [...pumpDailyReports]
      .filter(
        (r: any) =>
          r.pumpId === pumpId &&
          (r.status === "approved" || r.status === "pending_accountant"),
      )
      .sort(
        (a: any, b: any) =>
          b.date.localeCompare(a.date) ||
          b.submittedAt.localeCompare(a.submittedAt),
      );
    if (sorted.length > 0) {
      seedMeters[pumpId] = Number(sorted[0].closingMeter);
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
