import { Router, type IRouter } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, appStateTable } from "@workspace/db";

const router: IRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = "8h";

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
        a.password === p &&
        a.status === "active" &&
        a.role != null,
    );
    if (match) account = match;
  }

  if (!account) {
    res.status(401).json({ error: "Invalid credentials or account not active" });
    return;
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
