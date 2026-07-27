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
  if (pw.startsWith("sha256:")) return pw;
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

// POST /users — create enrollment or account (admin can create active; any auth user can enroll)
router.post("/users", async (req, res): Promise<void> => {
  const {
    empName, empId, username, password, role, branchId, status,
    jobTitle, dept, phoneNumber,
    nin, staffAddress, guarantorName, guarantorPhone, guarantorAddress,
    employmentDocs,
  } = req.body ?? {};

  if (!empName || typeof empName !== "string") {
    res.status(400).json({ error: "empName is required" });
    return;
  }

  // Only admin can create active accounts directly
  const wantsActive = status === "active" || (username && password && role && !status);
  if (wantsActive && req.auth?.role !== "admin") {
    res.status(403).json({ error: "Only admin can create active accounts" });
    return;
  }

  const hasCredentials = username && password && role;
  const resolvedStatus: string = status ?? (hasCredentials ? "active" : "pending_md");

  try {
    const [row] = await db
      .insert(staffUsersTable)
      .values({
        empName,
        empId:            empId            ?? null,
        username:         username         ?? null,
        password:         ensureHashed(password ?? ""),
        role:             role             ?? null,
        branchId:         branchId         ?? null,
        status:           resolvedStatus,
        jobTitle:         jobTitle         ?? null,
        dept:             dept             ?? null,
        phoneNumber:      phoneNumber      ?? null,
        nin:              nin              ?? null,
        staffAddress:     staffAddress     ?? null,
        guarantorName:    guarantorName    ?? null,
        guarantorPhone:   guarantorPhone   ?? null,
        guarantorAddress: guarantorAddress ?? null,
        employmentDocs:   Array.isArray(employmentDocs) ? employmentDocs : [],
        createdBy:        req.auth?.username ?? "system",
        approvedBy:       hasCredentials ? req.auth?.username : null,
        approvedAt:       hasCredentials ? new Date() : null,
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

  const {
    empName, empId, username, password, role, branchId, status, jobTitle, dept,
    phoneNumber, nin, staffAddress, guarantorName, guarantorPhone, guarantorAddress, employmentDocs,
  } = req.body ?? {};

  const updates: Record<string, unknown> = {};
  if (empName           !== undefined) updates.empName           = empName;
  if (empId             !== undefined) updates.empId             = empId;
  if (username          !== undefined) updates.username          = username;
  if (password          !== undefined) updates.password          = ensureHashed(password);
  if (role              !== undefined) updates.role              = role;
  if (branchId          !== undefined) updates.branchId          = branchId;
  if (status            !== undefined) updates.status            = status;
  if (jobTitle          !== undefined) updates.jobTitle          = jobTitle;
  if (dept              !== undefined) updates.dept              = dept;
  if (phoneNumber       !== undefined) updates.phoneNumber       = phoneNumber;
  if (nin               !== undefined) updates.nin               = nin;
  if (staffAddress      !== undefined) updates.staffAddress      = staffAddress;
  if (guarantorName     !== undefined) updates.guarantorName     = guarantorName;
  if (guarantorPhone    !== undefined) updates.guarantorPhone    = guarantorPhone;
  if (guarantorAddress  !== undefined) updates.guarantorAddress  = guarantorAddress;
  if (employmentDocs    !== undefined) updates.employmentDocs    = employmentDocs;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No updates provided" });
    return;
  }

  try {
    const [row] = await db
      .update(staffUsersTable)
      .set({ ...updates })
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

// PATCH /users/:id/status — status transitions
// Admin: any status, plus sets credentials on activation
// MD:    pending_md → pending_admin | rejected
router.patch("/users/:id/status", async (req, res): Promise<void> => {
  const callerRole = req.auth?.role;
  if (callerRole !== "admin" && callerRole !== "md") {
    res.status(403).json({ error: "Admin or MD only" });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { status, username, password, role, branchId } = req.body ?? {};

  // Validate MD's allowed transitions
  if (callerRole === "md") {
    if (!["pending_admin", "rejected"].includes(status)) {
      res.status(403).json({ error: "MD may only approve (→ pending_admin) or reject enrollments" });
      return;
    }
    // Confirm the record is currently pending_md
    const [existing] = await db
      .select({ status: staffUsersTable.status })
      .from(staffUsersTable)
      .where(eq(staffUsersTable.id, id));
    if (!existing || existing.status !== "pending_md") {
      res.status(400).json({ error: "Record is not in pending_md state" });
      return;
    }
  }

  const adminAllowed = ["active", "suspended", "rejected", "pending", "pending_md", "pending_admin"];
  if (callerRole === "admin" && !adminAllowed.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${adminAllowed.join(", ")}` });
    return;
  }

  const updates: Record<string, unknown> = { status };

  if (status === "pending_admin" && callerRole === "md") {
    updates.mdApprovedBy = req.auth?.username;
    updates.mdApprovedAt = new Date();
  }

  if (status === "active" && callerRole === "admin") {
    updates.approvedBy = req.auth?.username;
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
