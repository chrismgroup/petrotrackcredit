import { and, desc, eq, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, notificationsTable, notificationTokensTable, staffUsersTable } from "@workspace/db";

const router: IRouter = Router();

async function resolveRecipients(target: string, branchId?: string | null): Promise<string[]> {
  const normalized = target.trim();
  if (!normalized) return [];
  const rows = await db
    .select({ username: staffUsersTable.username })
    .from(staffUsersTable)
    .where(and(
      eq(staffUsersTable.status, "active"),
      or(
        eq(staffUsersTable.username, normalized),
        eq(staffUsersTable.empName, normalized),
        eq(staffUsersTable.role, normalized),
      ),
      branchId ? eq(staffUsersTable.branchId, branchId) : undefined,
    ));
  return rows.map(row => row.username).filter((username): username is string => !!username);
}

async function sendPush(tokens: string[], title: string, body: string, data: Record<string, unknown>) {
  if (tokens.length === 0) return;
  const messages = tokens.map(to => ({
    to, sound: "default", title, body, data,
    priority: "high", channelId: "petrotrack-alerts",
  }));
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
  } catch {
    // Persistence is authoritative; push delivery can be retried on the next event.
  }
}

router.get("/notifications", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.username, req.auth!.username))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(100);
  res.json(rows);
});

router.post("/notifications/tokens", async (req, res): Promise<void> => {
  const { token, platform } = req.body ?? {};
  if (typeof token !== "string" || !token.startsWith("ExponentPushToken[")) {
    res.status(400).json({ error: "Valid Expo push token is required" });
    return;
  }
  await db.insert(notificationTokensTable)
    .values({ username: req.auth!.username, token, platform: typeof platform === "string" ? platform : "unknown" })
    .onConflictDoUpdate({
      target: notificationTokensTable.token,
      set: { username: req.auth!.username, platform: typeof platform === "string" ? platform : "unknown", updatedAt: new Date() },
    });
  res.json({ ok: true });
});

router.post("/notifications/tokens/unregister", async (req, res): Promise<void> => {
  await db.delete(notificationTokensTable)
    .where(eq(notificationTokensTable.username, req.auth!.username));
  res.json({ ok: true });
});

router.post("/notifications", async (req, res): Promise<void> => {
  const { target, branchId, type, title, body, data } = req.body ?? {};
  if (typeof target !== "string" || typeof title !== "string" || typeof body !== "string") {
    res.status(400).json({ error: "target, title, and body are required" });
    return;
  }
  const recipients = await resolveRecipients(target, typeof branchId === "string" ? branchId : null);
  const safeData = data && typeof data === "object" ? data : {};
  if (recipients.length > 0) {
    await db.insert(notificationsTable).values(recipients.map(username => ({
      username,
      type: typeof type === "string" ? type : "general",
      title,
      body,
      data: safeData,
    })));
    const tokens = await db
      .select({ token: notificationTokensTable.token })
      .from(notificationTokensTable)
      .where(or(...recipients.map(username => eq(notificationTokensTable.username, username))));
    await sendPush(tokens.map(row => row.token), title, body, safeData);
  }
  res.json({ ok: true, recipients: recipients.length });
});

router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid notification id" });
    return;
  }
  await db.update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.username, req.auth!.username)));
  res.json({ ok: true });
});

router.post("/notifications/read-all", async (req, res): Promise<void> => {
  await db.update(notificationsTable)
    .set({ read: true })
    .where(eq(notificationsTable.username, req.auth!.username));
  res.json({ ok: true });
});

export default router;