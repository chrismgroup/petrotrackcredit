import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { AddressInfo } from "node:net";

type LoginResult = {
  token: string;
  role: string;
  empName: string;
};

type PumpReport = {
  id: string;
  date: string;
  pumpId: string;
  branchId: string;
  openingMeter: number;
  closingMeter: number;
  liters: number;
  status: string;
  submittedBy: string;
  submittedAt: string;
  mgrAt?: string;
  accAt?: string;
  adminReturnedAt?: string;
  [key: string]: unknown;
};

test("merges concurrent pump-report arrays and protects workflow ordering", {
  skip: !process.env.DATABASE_URL || !process.env.JWT_SECRET,
  timeout: 30_000,
}, async () => {
  const [{ default: app }, { pool }] = await Promise.all([
    import("../app"),
    import("@workspace/db"),
  ]);
  const marker = `pump-report-acceptance-${randomUUID()}`;
  const password = `Test-${randomUUID()}`;
  const branchId = `branch-${randomUUID()}`;
  const usernames = {
    attendantA: `${marker}-att-a`,
    attendantB: `${marker}-att-b`,
    manager: `${marker}-manager`,
    accountant: `${marker}-accountant`,
    admin: `${marker}-admin`,
  };
  const reportIds = [`${marker}-approved`, `${marker}-returned`];
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api`;

  async function request<T>(
    path: string,
    options: RequestInit = {},
    token?: string,
  ): Promise<{ status: number; body: T }> {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const body = await response.json() as T;
    return { status: response.status, body };
  }

  async function login(username: string): Promise<LoginResult> {
    const result = await request<LoginResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    assert.equal(result.status, 200);
    assert.equal(typeof result.body.token, "string");
    return result.body;
  }

  async function putReports(token: string, reports: PumpReport[]) {
    return request<{ ok: boolean; reports: PumpReport[] }>(
      "/state/pumpDailyReports",
      { method: "PUT", body: JSON.stringify(reports) },
      token,
    );
  }

  function report(id: string, submittedBy: string, overrides: Partial<PumpReport> = {}): PumpReport {
    return {
      id,
      date: "2026-09-02",
      pumpId: `${marker}-pump`,
      branchId,
      openingMeter: 1000,
      closingMeter: 1050,
      liters: 50,
      status: "pending_manager",
      submittedBy,
      submittedAt: "2026-09-02T10:00:00.000Z",
      ...overrides,
    };
  }

  function findReport(reports: PumpReport[], id: string): PumpReport {
    const found = reports.find(candidate => candidate.id === id);
    assert.ok(found, `Expected report ${id} in canonical response`);
    return found;
  }

  try {
    await pool.query(`
      INSERT INTO staff_users (
        emp_name, username, password, role, branch_id, status,
        created_by, approved_by, approved_at
      )
      VALUES
        ('Acceptance Attendant A', $1, $6, 'att', $7, 'active', $8, $8, NOW()),
        ('Acceptance Attendant B', $2, $6, 'att', $7, 'active', $8, $8, NOW()),
        ('Acceptance Manager', $3, $6, 'mgr', $7, 'active', $8, $8, NOW()),
        ('Acceptance Accountant', $4, $6, 'acc', NULL, 'active', $8, $8, NOW()),
        ('Acceptance Admin', $5, $6, 'admin', NULL, 'active', $8, $8, NOW())
    `, [
      usernames.attendantA,
      usernames.attendantB,
      usernames.manager,
      usernames.accountant,
      usernames.admin,
      password,
      branchId,
      marker,
    ]);

    const [attendantA, attendantB, manager, accountant, admin] = await Promise.all([
      login(usernames.attendantA),
      login(usernames.attendantB),
      login(usernames.manager),
      login(usernames.accountant),
      login(usernames.admin),
    ]);
    assert.equal(attendantA.role, "att");
    assert.equal(attendantB.role, "att");
    assert.equal(manager.role, "mgr");
    assert.equal(accountant.role, "acc");
    assert.equal(admin.role, "admin");

    const approvedId = reportIds[0];
    const returnedId = reportIds[1];
    const approvedPending = report(approvedId, usernames.attendantA, { closingMeter: 1100 });
    const returnedPending = report(returnedId, usernames.attendantB, {
      closingMeter: 1200,
      submittedAt: "2026-09-02T10:01:00.000Z",
    });

    // Seed one report so the second actor can carry it in its local snapshot.
    // The next writes are separate authenticated actors sending complete,
    // overlapping arrays at the same time. Neither request may erase the
    // other's report.
    const seedWrite = await putReports(attendantA.token, [approvedPending]);
    assert.equal(seedWrite.status, 200);
    const [firstWrite, secondWrite] = await Promise.all([
      putReports(attendantA.token, [approvedPending]),
      putReports(attendantB.token, [approvedPending, returnedPending]),
    ]);
    assert.equal(firstWrite.status, 200);
    assert.equal(secondWrite.status, 200);
    const afterConcurrentWrites = await request<PumpReport[]>(
      "/state/pumpDailyReports",
      {},
      attendantA.token,
    );
    assert.equal(afterConcurrentWrites.status, 200);
    assert.deepEqual(
      afterConcurrentWrites.body.map(candidate => candidate.id).sort(),
      reportIds.slice().sort(),
    );

    // A stale full-array write omits the other device's newer report. The
    // canonical response must still contain both records.
    const staleArrayWrite = await putReports(attendantA.token, [approvedPending]);
    assert.equal(staleArrayWrite.status, 200);
    assert.deepEqual(
      staleArrayWrite.body.reports.map(candidate => candidate.id).sort(),
      reportIds.slice().sort(),
    );

    const approvedForwarded = {
      ...approvedPending,
      status: "pending_accountant",
      mgrAt: "2026-09-02T11:00:00.000Z",
    };
    const forwarded = await putReports(manager.token, [approvedForwarded]);
    assert.equal(forwarded.status, 200);
    assert.equal(findReport(forwarded.body.reports, approvedId).status, "pending_accountant");

    const approved = {
      ...approvedForwarded,
      status: "approved",
      accAt: "2026-09-02T12:00:00.000Z",
    };
    const approvedWrite = await putReports(accountant.token, [approved]);
    assert.equal(approvedWrite.status, 200);
    assert.equal(findReport(approvedWrite.body.reports, approvedId).status, "approved");

    // This copy is newer by submission time but is still an old pending state.
    // Approved status must remain authoritative, matching the client merge.
    const stalePendingAfterApproval = {
      ...approvedPending,
      submittedAt: "2026-09-02T13:00:00.000Z",
    };
    const staleApprovalWrite = await putReports(manager.token, [stalePendingAfterApproval]);
    assert.equal(staleApprovalWrite.status, 200);
    assert.equal(findReport(staleApprovalWrite.body.reports, approvedId).status, "approved");

    const returnedForwarded = {
      ...returnedPending,
      status: "pending_accountant",
      mgrAt: "2026-09-02T11:01:00.000Z",
    };
    const returnedForwardWrite = await putReports(manager.token, [returnedForwarded]);
    assert.equal(returnedForwardWrite.status, 200);
    assert.equal(findReport(returnedForwardWrite.body.reports, returnedId).status, "pending_accountant");

    const returned = {
      ...returnedForwarded,
      status: "returned",
      accAt: "2026-09-02T12:01:00.000Z",
    };
    const returnedWrite = await putReports(accountant.token, [returned]);
    assert.equal(returnedWrite.status, 200);
    assert.equal(findReport(returnedWrite.body.reports, returnedId).status, "returned");

    const staleReturnedPending = {
      ...returnedPending,
      submittedAt: "2026-09-02T09:00:00.000Z",
    };
    const staleReturnedWrite = await putReports(attendantB.token, [staleReturnedPending]);
    assert.equal(staleReturnedWrite.status, 200);
    assert.equal(findReport(staleReturnedWrite.body.reports, returnedId).status, "returned");

    const adminReturned = {
      ...approved,
      status: "pending_accountant",
      adminReturnedAt: "2026-09-02T14:00:00.000Z",
      adminReturnedBy: usernames.admin,
    };
    const adminReturnWrite = await putReports(admin.token, [adminReturned]);
    assert.equal(adminReturnWrite.status, 200);
    assert.equal(findReport(adminReturnWrite.body.reports, approvedId).status, "pending_accountant");

    // A stale approved copy must not reverse the explicit Admin return.
    const staleApprovedWrite = await putReports(accountant.token, [approved]);
    assert.equal(staleApprovedWrite.status, 200);
    assert.equal(findReport(staleApprovedWrite.body.reports, approvedId).status, "pending_accountant");
  } finally {
    await pool.query("BEGIN");
    try {
      await pool.query(
        "DELETE FROM pump_reports WHERE id = ANY($1::text[])",
        [reportIds],
      );
      await pool.query(`
        UPDATE app_state
        SET data = COALESCE((
          SELECT jsonb_agg(item)
          FROM jsonb_array_elements(data) item
          WHERE NOT (item->>'id' = ANY($1::text[]))
        ), '[]'::jsonb)
        WHERE key = 'pumpDailyReports'
      `, [reportIds]);
      await pool.query("DELETE FROM staff_users WHERE created_by = $1", [marker]);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
      await pool.end();
    }
  }
});