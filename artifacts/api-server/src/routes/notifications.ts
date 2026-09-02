import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, appStateTable, notificationsTable, notificationTokensTable, staffUsersTable } from "@workspace/db";

const router: IRouter = Router();
const NOTIFICATION_TYPES = ["report_attention", "report_update", "document_expiry", "operational"] as const;
const FOLDER_NOTIFICATION_ROLES = ["admin", "acc", "mktg", "csm", "md", "ceo"] as const;

async function resolveRecipients(target: string, branchId?: string | null): Promise<string[]> {
  const normalized = target.trim();
  if (!normalized) return [];
  const rows = await db
    .select({ username: staffUsersTable.username })
    .from(staffUsersTable)
    .where(and(
      eq(staffUsersTable.status, "active"),
      normalized === "all"
        ? undefined
        : normalized === "folder"
          ? inArray(staffUsersTable.role, FOLDER_NOTIFICATION_ROLES)
          : or(
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

async function deliverNotification(input: {
  target: string;
  branchId?: string | null;
  type: typeof NOTIFICATION_TYPES[number];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<number> {
  const recipients = await resolveRecipients(input.target, input.branchId);
  const safeData = input.data ?? {};
  if (recipients.length === 0) return 0;

  await db.insert(notificationsTable).values(recipients.map(username => ({
    username,
    type: input.type,
    title: input.title,
    body: input.body,
    data: safeData,
  })));
  const tokens = await db
    .select({ token: notificationTokensTable.token })
    .from(notificationTokensTable)
    .where(or(...recipients.map(username => eq(notificationTokensTable.username, username))));
  await sendPush(tokens.map(row => row.token), input.title, input.body, safeData);
  return recipients.length;
}

/**
 * Runs on API start and once per day. Storing the sent marker alongside the
 * file metadata prevents duplicate alerts across API restarts and devices.
 */
export async function dispatchMyFolderExpiryReminders(): Promise<void> {
  const outbound = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7310450)`);
    const [row] = await tx.select().from(appStateTable).where(eq(appStateTable.key, "myFolderFiles"));
    if (!Array.isArray(row?.data)) return [] as { recipients: string[]; title: string; body: string; data: Record<string, unknown> }[];

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() + 3);
    let changed = false;
    const pushes: { recipients: string[]; title: string; body: string; data: Record<string, unknown> }[] = [];
    const updatedFiles = [];

    for (const value of row.data) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        updatedFiles.push(value);
        continue;
      }
      const file = value as Record<string, unknown>;
      if (file.deletedAt || file.expiryReminderSentAt || typeof file.expiresAt !== "string") {
        updatedFiles.push(file);
        continue;
      }
      const expiry = new Date(file.expiresAt);
      if (Number.isNaN(expiry.getTime()) || expiry > cutoff) {
        updatedFiles.push(file);
        continue;
      }

      const name = typeof file.name === "string" ? file.name : "A My Folder document";
      const title = file.documentKind === "certificate" ? "Certificate expiry reminder" : "Document expiry reminder";
      const body = `${name} expires on ${file.expiresAt}. Please arrange a renewal or replacement.`;
      const data = { route: "/(app)/corporate", fileId: file.id, section: file.section };
      const recipients = await resolveRecipients(file.section === "general" ? "all" : "folder");
      if (recipients.length === 0) {
        updatedFiles.push(file);
        continue;
      }

      await tx.insert(notificationsTable).values(recipients.map(username => ({
        username, type: "document_expiry", title, body, data,
      })));
      updatedFiles.push({ ...file, expiryReminderSentAt: now.toISOString() });
      pushes.push({ recipients, title, body, data });
      changed = true;
    }

    if (changed) {
      await tx.update(appStateTable)
        .set({ data: updatedFiles, updatedAt: now })
        .where(eq(appStateTable.key, "myFolderFiles"));
    }
    return pushes;
  });

  for (const push of outbound) {
    const tokens = await db
      .select({ token: notificationTokensTable.token })
      .from(notificationTokensTable)
      .where(or(...push.recipients.map(username => eq(notificationTokensTable.username, username))));
    await sendPush(tokens.map(row => row.token), push.title, push.body, push.data);
  }
}

router.get("/notifications", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(and(
      eq(notificationsTable.username, req.auth!.username),
      inArray(notificationsTable.type, NOTIFICATION_TYPES),
    ))
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
  if (!NOTIFICATION_TYPES.includes(type)) {
    res.status(400).json({ error: "Unsupported notification type" });
    return;
  }
  if (type === "document_expiry") {
    res.status(403).json({ error: "Document expiry reminders are created by the scheduled service" });
    return;
  }
  const recipients = await deliverNotification({
    target,
    branchId: typeof branchId === "string" ? branchId : null,
    type,
    title,
    body,
    data: data && typeof data === "object" ? data as Record<string, unknown> : {},
  });
  res.json({ ok: true, recipients });
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