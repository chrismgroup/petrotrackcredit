import { createHash, randomBytes } from "crypto";
import { Router, type IRouter } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, appStateTable } from "@workspace/db";

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
  // Plaintext compatibility: accept legacy unhashed passwords so existing accounts
  // are not locked out before an admin/user resets them via the hashing write paths.
  return timingSafeStringEqual(stored, plaintext);
}

interface UserAccount {
  id: number;
  username: string;
  password: string;
  role: string | null;
  status: string;
  empName: string;
  branchId?: string;
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

  const [row] = await db
    .select()
    .from(appStateTable)
    .where(eq(appStateTable.key, "userAccounts"));

  let account: UserAccount | null = null;

  if (row?.data && Array.isArray(row.data)) {
    const accounts = row.data as UserAccount[];
    const match = accounts.find(
      (a) =>
        a.username === u &&
        a.status === "active" &&
        a.role != null &&
        verifyStoredPassword(p, a.password),
    );
    if (match) account = match;
  }

  if (!account) {
    res.status(401).json({ error: "Invalid credentials or account not active" });
    return;
  }

  // Opportunistic rehash: if this account still has a plaintext password, upgrade
  // it to a salted SHA-256 hash immediately so the plaintext is not retained.
  if (!account.password.startsWith("sha256:") && row?.data && Array.isArray(row.data)) {
    try {
      const salt = randomBytes(16).toString("hex");
      const newHash = `sha256:${salt}:${createHash("sha256").update(salt + p).digest("hex")}`;
      const updatedAccounts = (row.data as UserAccount[]).map((a) =>
        a.id === account!.id ? { ...a, password: newHash } : a,
      );
      await db
        .update(appStateTable)
        .set({ data: updatedAccounts })
        .where(eq(appStateTable.key, "userAccounts"));
      req.log.info({ username: u }, "Migrated account password from plaintext to hash");
    } catch (err) {
      req.log.warn({ err, username: u }, "Failed to rehash password; will retry on next login");
    }
  }

  const payload: { username: string; role: string } = {
    username: account.username,
    role: account.role!,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });

  res.json({
    token,
    role: account.role,
    empName: account.empName,
    branchId: account.branchId ?? null,
  });
});

export default router;
