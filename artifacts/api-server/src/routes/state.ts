import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, appStateTable, staffUsersTable } from "@workspace/db";

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
  "pumpLockedMeters", "inventoryLog", "financialEntry",
]);

// Keys that modify access control, credentials, or HR/legal/financial records.
// Only admin-role users may write to these.
const ADMIN_WRITE_KEYS = new Set([
  "userAccounts", "roleAccess", "userAccess", "mgrPerms",
  "hrEmployees", "hrHandbooks", "hrRecommendations",
  "companyFiles", "legalMatters", "meetingMinutes", "corpProjects",
  "companyInfo", "departments", "branches",
]);

router.get("/state", async (_req, res): Promise<void> => {
  const rows = await db.select().from(appStateTable);
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row.key] = row.data;
  }
  res.json(result);
});

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

  const data = req.body;
  if (data === undefined || data === null) {
    res.status(400).json({ error: "Body required" });
    return;
  }
  await db
    .insert(appStateTable)
    .values({ key, data })
    .onConflictDoUpdate({ target: appStateTable.key, set: { data, updatedAt: new Date() } });
  res.json({ ok: true });
});

export default router;
