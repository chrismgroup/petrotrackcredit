import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, appStateTable, staffUsersTable } from "@workspace/db";

const router: IRouter = Router();

// Public endpoint — returns a ~50-byte timestamp, no sensitive data.
// Clients poll every 3 s and call a full syncFromServer() only when it changes.
router.get("/version", async (_req, res): Promise<void> => {
  const [stateRow] = await db
    .select({ latest: sql<string>`MAX(updated_at)` })
    .from(appStateTable);
  const [userRow] = await db
    .select({ latest: sql<string>`MAX(GREATEST(created_at, COALESCE(approved_at, created_at), COALESCE(md_approved_at, created_at)))` })
    .from(staffUsersTable);

  const stateTs = stateRow?.latest ? new Date(stateRow.latest).getTime() : 0;
  const usersTs = userRow?.latest  ? new Date(userRow.latest).getTime()  : 0;
  const version = String(Math.max(stateTs, usersTs));

  res.json({ version });
});

export default router;
