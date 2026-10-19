import { createHash, randomBytes } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";

import { appStateTable, db, staffUsersTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/auth/me", (req, res): void => {
  const auth = req.auth!;
  res.json({ username: auth.username, empName: auth.empName ?? null, role: auth.role, branchId: auth.branchId ?? null });
});

const FULL_USER_MANAGEMENT_ROLES = new Set(["admin", "csm"]);

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

async function canonicalBranch(branchId: unknown): Promise<{ id: string; name: string } | null> {
  if (typeof branchId !== "string" || !branchId.trim()) return null;
  const [state] = await db.select({ data: appStateTable.data })
    .from(appStateTable)
    .where(eq(appStateTable.key, "branches"));
  const branches = Array.isArray(state?.data) ? state.data : [];
  const branch = branches.find(item =>
    item && typeof item === "object" && String((item as Record<string, unknown>).id) === branchId,
  ) as Record<string, unknown> | undefined;
  const name = typeof branch?.name === "string" ? branch.name.trim() : "";
  return branch && name ? { id: branchId, name } : null;
}

async function safeRow(row: typeof staffUsersTable.$inferSelect) {
  const { password: _pw, ...rest } = row;
  const branch = await canonicalBranch(row.branchId);
  return { ...rest, branchName: branch?.name ?? null };
}

// GET /users — list all (any authenticated user)
router.get("/users", async (req, res): Promise<void> => {
  const branchScoped = req.auth!.role === "mgr" || req.auth!.role === "att";
  if (branchScoped && !req.auth!.branchId) {
    res.json([]);
    return;
  }
  const query = db.select().from(staffUsersTable);
  const rows = branchScoped
    ? await query.where(eq(staffUsersTable.branchId, req.auth!.branchId!)).orderBy(asc(staffUsersTable.createdAt))
    : await query.orderBy(asc(staffUsersTable.createdAt));
  res.json(await Promise.all(rows.map(safeRow)));
});

// POST /users — create enrollment or account (Admin/HR can create active; any auth user can enroll)
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
  const branch = await canonicalBranch(branchId);
  if (!branch) {
    res.status(400).json({ error: "A valid branchId is required" });
    return;
  }
  if (empId) {
    const [duplicate] = await db.select({ id: staffUsersTable.id })
      .from(staffUsersTable)
      .where(eq(staffUsersTable.empId, empId));
    if (duplicate) {
      res.status(409).json({ error: "Staff ID already exists" });
      return;
    }
  }

  // Admin and HR can create active accounts directly.
  const wantsActive = status === "active" || (username && password && role && !status);
  if (wantsActive && !FULL_USER_MANAGEMENT_ROLES.has(req.auth?.role ?? "")) {
    res.status(403).json({ error: "Only Admin or HR can create active accounts" });
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
        branchId:         branch.id,
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

    res.status(201).json(await safeRow(row));
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Username already exists" });
    } else {
      throw err;
    }
  }
});

// DELETE /users/native-fixtures/:runId — remove an interrupted native fixture
// (admin only). The account must match every provisioning marker so a
// similarly named real staff account can never be selected for recovery.
router.delete("/users/native-fixtures/:runId", async (req, res): Promise<void> => {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const runId = req.params.runId;
  if (!/^[A-Za-z0-9-]{1,40}$/.test(runId)) {
    res.status(400).json({ error: "Invalid native fixture run id" });
    return;
  }

  const branchId = typeof req.query.branchId === "string" ? req.query.branchId.trim() : "";
  const expectedUsername = `native-outbox-${runId}`;
  const expectedEmpName = `Native Outbox ${runId}`;
  const conditions = [
    eq(staffUsersTable.username, expectedUsername),
    eq(staffUsersTable.empName, expectedEmpName),
    eq(staffUsersTable.role, "att"),
    eq(staffUsersTable.createdBy, req.auth.username),
    ...(branchId ? [eq(staffUsersTable.branchId, branchId)] : []),
  ];

  const deleted = await db
    .delete(staffUsersTable)
    .where(and(...conditions))
    .returning({ id: staffUsersTable.id });

  res.json({ ok: true, deleted: deleted.length });
});

// PUT /users/:id — full update (Admin or HR)
router.put("/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const callerRole = req.auth?.role;
  if (!FULL_USER_MANAGEMENT_ROLES.has(callerRole ?? "")) {
    res.status(403).json({ error: "Only Admin or HR may edit users" });
    return;
  }

  const {
    empName, empId, username, password, role, branchId, status, jobTitle, dept,
    phoneNumber, nin, staffAddress, guarantorName, guarantorPhone, guarantorAddress, employmentDocs,
  } = req.body ?? {};
  if (branchId !== undefined && !await canonicalBranch(branchId)) {
    res.status(400).json({ error: "branchId must identify an existing branch" });
    return;
  }
  if (empId !== undefined) {
    const [current] = await db.select({ empId: staffUsersTable.empId })
      .from(staffUsersTable)
      .where(eq(staffUsersTable.id, id));
    if (!current) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (current.empId && current.empId !== empId) {
      res.status(409).json({ error: "Staff ID is permanent and cannot be changed" });
      return;
    }
    if (empId) {
      const [duplicate] = await db.select({ id: staffUsersTable.id })
        .from(staffUsersTable)
        .where(eq(staffUsersTable.empId, empId));
      if (duplicate && duplicate.id !== id) {
        res.status(409).json({ error: "Staff ID already exists" });
        return;
      }
    }
  }

  const updates: Record<string, unknown> = {};
  if (empName           !== undefined) updates.empName           = empName;
  if (empId             !== undefined) updates.empId = empId;
  if (username          !== undefined) updates.username = username;
  if (password          !== undefined) updates.password = ensureHashed(password);
  if (role              !== undefined) updates.role = role;
  if (branchId          !== undefined) updates.branchId = branchId;
  if (status            !== undefined) updates.status = status;
  if (jobTitle          !== undefined) updates.jobTitle         = jobTitle;
  if (dept              !== undefined) updates.dept             = dept;
  if (phoneNumber       !== undefined) updates.phoneNumber      = phoneNumber;
  if (nin               !== undefined) updates.nin               = nin;
  if (staffAddress      !== undefined) updates.staffAddress     = staffAddress;
  if (guarantorName     !== undefined) updates.guarantorName    = guarantorName;
  if (guarantorPhone    !== undefined) updates.guarantorPhone   = guarantorPhone;
  if (guarantorAddress  !== undefined) updates.guarantorAddress = guarantorAddress;
  if (employmentDocs    !== undefined) updates.employmentDocs   = employmentDocs;

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
    res.json(await safeRow(row));
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Username already exists" });
    } else {
      throw err;
    }
  }
});

// PATCH /users/:id/status — status transitions
// Admin/HR: any status, plus sets credentials on activation
// MD:    pending_md → pending_admin | rejected
router.patch("/users/:id/status", async (req, res): Promise<void> => {
  const callerRole = req.auth?.role;
  if (callerRole !== "admin" && callerRole !== "md" && callerRole !== "csm") {
    res.status(403).json({ error: "Admin, HR or MD only" });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { status, username, password, role, branchId, rejectionReason, rejectedBy } = req.body ?? {};
  const [existing] = await db
    .select({ status: staffUsersTable.status, branchId: staffUsersTable.branchId })
    .from(staffUsersTable)
    .where(eq(staffUsersTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Validate MD's allowed transitions
  if (callerRole === "md") {
    if (!["pending_admin", "rejected"].includes(status)) {
      res.status(403).json({ error: "MD may only approve (→ pending_admin) or reject enrollments" });
      return;
    }
    // Confirm the record is currently pending_md
    if (existing.status !== "pending_md") {
      res.status(400).json({ error: "Record is not in pending_md state" });
      return;
    }
  }

  const managerAllowed = ["active", "suspended", "inactive", "rejected", "pending", "pending_md", "pending_admin"];
  if (FULL_USER_MANAGEMENT_ROLES.has(callerRole ?? "") && !managerAllowed.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${managerAllowed.join(", ")}` });
    return;
  }

  const updates: Record<string, unknown> = { status };

  if (status === "pending_admin" && callerRole === "md") {
    updates.mdApprovedBy = req.auth?.username;
    updates.mdApprovedAt = new Date();
  }

  if (status === "pending_admin" && callerRole === "csm") {
    updates.rejectionReason = null;
    updates.rejectedBy = null;
    updates.rejectedAt = null;
  }

  if (status === "rejected") {
    updates.rejectionReason = typeof rejectionReason === "string" ? rejectionReason : null;
    updates.rejectedBy = typeof rejectedBy === "string" ? rejectedBy : req.auth?.username ?? null;
    updates.rejectedAt = new Date();
  }

  if (status === "active" && FULL_USER_MANAGEMENT_ROLES.has(callerRole ?? "")) {
    const assignedBranch = await canonicalBranch(branchId ?? existing.branchId);
    if (!assignedBranch) {
      res.status(400).json({ error: "A valid branchId is required before activation" });
      return;
    }
    updates.approvedBy = req.auth?.username;
    updates.approvedAt = new Date();
    if (username !== undefined) updates.username = username;
    if (password !== undefined) updates.password = ensureHashed(password);
    if (role     !== undefined) updates.role     = role;
    updates.branchId = assignedBranch.id;
  }

  try {
    const [row] = await db
      .update(staffUsersTable)
      .set(updates)
      .where(eq(staffUsersTable.id, id))
      .returning();

    if (!row) { res.status(404).json({ error: "User not found" }); return; }
    res.json(await safeRow(row));
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Username already exists" });
    } else {
      throw err;
    }
  }
});

// DELETE /users/:id (Admin or HR)
router.delete("/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const callerRole = req.auth?.role;
  if (!FULL_USER_MANAGEMENT_ROLES.has(callerRole ?? "")) {
    res.status(403).json({ error: "Only Admin or HR may delete users" });
    return;
  }
  const [existing] = await db
    .select({ username: staffUsersTable.username })
    .from(staffUsersTable)
    .where(eq(staffUsersTable.id, id));
  if (existing?.username && existing.username === req.auth?.username) {
    res.status(400).json({ error: "You cannot delete the account you are currently using" });
    return;
  }

  const deleted = await db
    .delete(staffUsersTable)
    .where(eq(staffUsersTable.id, id))
    .returning({ id: staffUsersTable.id });
  if (deleted.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
