import { createHash, randomBytes } from "crypto";
import { asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";

import { db, staffUsersTable } from "@workspace/db";

const router: IRouter = Router();

function serverHash(plaintext: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(salt + plaintext).digest("hex");
  return `sha256:${salt}:${hash}`;
}

function ensureHashed(pw: string): string {
  if (!pw) return "";
  if (pw.startsWith("sha256:")) return pw; // already hashed by client
  return serverHash(pw);
}

function safeRow(row: typeof staffUsersTable.$inferSelect) {
  const { password: _pw, ...rest } = row;
  return rest;
}

// GET /users — list all (any authenticated user)
router.get("/users", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(staffUsersTable)
    .orderBy(asc(staffUsersTable.createdAt));
  res.json(rows.map(safeRow));
});

// POST /users — create (admin only)
router.post("/users", async (req, res): Promise<void> => {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const { empName, empId, username, password, role, branchId, status, jobTitle, dept } =
    req.body ?? {};

  if (!empName || typeof empName !== "string") {
    res.status(400).json({ error: "empName is required" });
    return;
  }

  const hasCredentials = username && password && role;
  const resolvedStatus: string = status ?? (hasCredentials ? "active" : "pending");

  try {
    const [row] = await db
      .insert(staffUsersTable)
      .values({
        empName,
        empId:       empId   ?? null,
        username:    username ?? null,
        password:    ensureHashed(password ?? ""),
        role:        role     ?? null,
        branchId:    branchId ?? null,
        status:      resolvedStatus,
        jobTitle:    jobTitle ?? null,
        dept:        dept     ?? null,
        createdBy:   req.auth.username,
        approvedBy:  hasCredentials ? req.auth.username : null,
        approvedAt:  hasCredentials ? new Date()        : null,
      })
      .returning();

    res.status(201).json(safeRow(row));
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Username already exists" });
    } else {
      throw err;
    }
  }
});

// PUT /users/:id — full update (admin only)
router.put("/users/:id", async (req, res): Promise<void> => {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { empName, empId, username, password, role, branchId, status, jobTitle, dept } =
    req.body ?? {};

  const updates: Record<string, unknown> = {};
  if (empName   !== undefined) updates.empName   = empName;
  if (empId     !== undefined) updates.empId     = empId;
  if (username  !== undefined) updates.username  = username;
  if (password  !== undefined) updates.password  = ensureHashed(password);
  if (role      !== undefined) updates.role      = role;
  if (branchId  !== undefined) updates.branchId  = branchId;
  if (status    !== undefined) updates.status    = status;
  if (jobTitle  !== undefined) updates.jobTitle  = jobTitle;
  if (dept      !== undefined) updates.dept      = dept;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No updates provided" });
    return;
  }

  try {
    const [row] = await db
      .update(staffUsersTable)
      .set(updates)
      .where(eq(staffUsersTable.id, id))
      .returning();

    if (!row) { res.status(404).json({ error: "User not found" }); return; }
    res.json(safeRow(row));
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Username already exists" });
    } else {
      throw err;
    }
  }
});

// PATCH /users/:id/status — approve / suspend / reject (admin only)
router.patch("/users/:id/status", async (req, res): Promise<void> => {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { status, username, password, role, branchId } = req.body ?? {};
  const allowed = ["active", "suspended", "rejected", "pending"];
  if (!allowed.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
    return;
  }

  const updates: Record<string, unknown> = { status };

  if (status === "active") {
    updates.approvedBy = req.auth.username;
    updates.approvedAt = new Date();
    if (username !== undefined) updates.username = username;
    if (password !== undefined) updates.password = ensureHashed(password);
    if (role     !== undefined) updates.role     = role;
    if (branchId !== undefined) updates.branchId = branchId;
  }

  try {
    const [row] = await db
      .update(staffUsersTable)
      .set(updates)
      .where(eq(staffUsersTable.id, id))
      .returning();

    if (!row) { res.status(404).json({ error: "User not found" }); return; }
    res.json(safeRow(row));
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Username already exists" });
    } else {
      throw err;
    }
  }
});

// DELETE /users/:id (admin only)
router.delete("/users/:id", async (req, res): Promise<void> => {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(staffUsersTable).where(eq(staffUsersTable.id, id));
  res.json({ ok: true });
});

export default router;
