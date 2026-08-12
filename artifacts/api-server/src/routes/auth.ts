import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import jwt from "jsonwebtoken";

import { db, appStateTable, staffUsersTable } from "@workspace/db";

const router: IRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = "8h";

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function verifyStoredPassword(plaintext: string, stored: string): boolean {
  if (stored.startsWith("sha256:")) {
    const inner = stored.slice("sha256:".length);
    const colonIdx = inner.indexOf(":");
    if (colonIdx < 0) return false;
    const salt = inner.slice(0, colonIdx);
    const expected = inner.slice(colonIdx + 1);
    const actual = createHash("sha256").update(salt + plaintext).digest("hex");
    return timingSafeStringEqual(actual, expected);
  }
  // Plaintext compatibility: accept legacy unhashed passwords
  return timingSafeStringEqual(stored, plaintext);
}

function serverHash(plaintext: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(salt + plaintext).digest("hex");
  return `sha256:${salt}:${hash}`;
}

router.post("/auth/login", async (req, res): Promise<void> => {
  if (!JWT_SECRET) {
    req.log.error("JWT_SECRET is not configured");
    res.status(503).json({ error: "Service unavailable" });
    return;
  }

  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  const u = username.trim();
  const p = password.trim();

  if (!u || !p) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  // ── 1. Query the dedicated staff_users table (primary source of truth) ──
  const [dbUser] = await db
    .select()
    .from(staffUsersTable)
    .where(eq(staffUsersTable.username, u));

  if (dbUser && dbUser.status === "active" && dbUser.role != null && verifyStoredPassword(p, dbUser.password)) {
    // Opportunistic rehash: upgrade plaintext passwords in the users table
    if (!dbUser.password.startsWith("sha256:")) {
      try {
        await db
          .update(staffUsersTable)
          .set({ password: serverHash(p) })
          .where(eq(staffUsersTable.id, dbUser.id));
        req.log.info({ username: u }, "Rehashed plaintext password in staff_users");
      } catch (err) {
        req.log.warn({ err, username: u }, "Failed to rehash password");
      }
    }

    const token = jwt.sign(
      { username: dbUser.username!, role: dbUser.role },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL },
    );

    res.json({
      token,
      staffId: dbUser.id,
      role: dbUser.role,
      empName: dbUser.empName,
      branchId: dbUser.branchId ?? null,
    });
    return;
  }

  // ── 2. Fall back to app_state/userAccounts (legacy / migration period) ──
  interface LegacyAccount {
    id: number;
    username: string;
    password: string;
    role: string | null;
    status: string;
    empName: string;
    branchId?: string;
  }

  const [row] = await db
    .select()
    .from(appStateTable)
    .where(eq(appStateTable.key, "userAccounts"));

  let legacyAccount: LegacyAccount | null = null;

  if (row?.data && Array.isArray(row.data)) {
    const accounts = row.data as LegacyAccount[];
    const match = accounts.find(
      (a) =>
        a.username === u &&
        a.status === "active" &&
        a.role != null &&
        verifyStoredPassword(p, a.password),
    );
    if (match) legacyAccount = match;
  }

  if (!legacyAccount) {
    res.status(401).json({ error: "Invalid credentials or account not active" });
    return;
  }

  // Migrate this account into staff_users so future logins use the table
  try {
    await db
      .insert(staffUsersTable)
      .values({
        empName:   legacyAccount.empName,
        username:  legacyAccount.username,
        password:  legacyAccount.password.startsWith("sha256:") ? legacyAccount.password : serverHash(p),
        role:      legacyAccount.role,
        branchId:  legacyAccount.branchId ?? null,
        status:    "active",
        createdBy: "migration",
        approvedBy: "migration",
        approvedAt: new Date(),
      })
      .onConflictDoNothing(); // username is UNIQUE — skip if already there
    req.log.info({ username: u }, "Migrated legacy account into staff_users on login");
  } catch (err) {
    req.log.warn({ err, username: u }, "Failed to migrate legacy account");
  }

  // Opportunistic rehash in the legacy blob too
  if (!legacyAccount.password.startsWith("sha256:") && row?.data && Array.isArray(row.data)) {
    try {
      const newHash = serverHash(p);
      const updated = (row.data as LegacyAccount[]).map((a) =>
        a.id === legacyAccount!.id ? { ...a, password: newHash } : a,
      );
      await db
        .update(appStateTable)
        .set({ data: updated })
        .where(eq(appStateTable.key, "userAccounts"));
    } catch (err) {
      req.log.warn({ err }, "Failed to rehash legacy password");
    }
  }

  const token = jwt.sign(
    { username: legacyAccount.username, role: legacyAccount.role! },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL },
  );

  res.json({
    token,
    staffId: legacyAccount.id,
    role: legacyAccount.role,
    empName: legacyAccount.empName,
    branchId: legacyAccount.branchId ?? null,
  });
});

export default router;
