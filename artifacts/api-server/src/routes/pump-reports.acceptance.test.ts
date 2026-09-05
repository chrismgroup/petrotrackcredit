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
  const deletedReportId = String(parseInt(randomUUID().slice(0, 8), 16));
  const attendantDeletedReportId = String(parseInt(randomUUID().slice(0, 8), 16));
  const attendantResubmittedReportId = String(parseInt(randomUUID().slice(0, 8), 16));
  const cleanupReportIds = [
    ...reportIds,
    deletedReportId,
    attendantDeletedReportId,
    attendantResubmittedReportId,
    `${marker}-fixture`,
    `${marker}-unrelated`,
  ];
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
    return request<{ ok: boolean; reports: PumpReport[]; rejectedReportIds?: string[] }>(
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
      unitPrice: 700,
      grossAmount: 35000,
      posAmount: 10000,
      cashAmount: 25000,
      transferAmount: 0,
      creditAmount: 0,
      totalCollected: 35000,
      variance: 0,
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

  async function reopenAndRead(
    token: string,
    id: string,
    expectedStatus: string,
  ): Promise<PumpReport> {
    // A foreground resume first checks the lightweight version endpoint, then
    // hydrates a fresh authenticated state snapshot.
    const version = await request<{ version: string }>("/version", {}, token);
    assert.equal(version.status, 200);
    assert.equal(typeof version.body.version, "string");
    const state = await request<PumpReport[]>("/state/pumpDailyReports", {}, token);
    assert.equal(state.status, 200);
    const current = findReport(state.body, id);
    assert.equal(current.status, expectedStatus);
    return current;
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
    const approvedPending = report(approvedId, "Acceptance Attendant A", {
      closingMeter: 1100,
      submittedByName: "Acceptance Attendant A",
    });
    const returnedPending = report(returnedId, usernames.attendantB, {
      closingMeter: 1200,
      submittedAt: "2026-09-02T10:01:00.000Z",
    });

    // Seed one report so the second actor can carry it in its local snapshot.
    // The next writes are separate authenticated actors sending complete,
    // overlapping arrays at the same time. Neither request may erase the
    // other's report.
    const seedWrite = await request<{ ok: boolean; report: PumpReport }>(
      "/pump-reports",
      {
        method: "POST",
        body: JSON.stringify({ report: approvedPending, idempotencyKey: approvedId }),
      },
      attendantA.token,
    );
    assert.equal(seedWrite.status, 201);
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
    const unauthorizedUnrelatedTransition = {
      ...returnedPending,
      status: "approved",
      accAt: "2026-09-02T11:00:00.000Z",
      workflowVersion: 99,
    };
    const forwarded = await putReports(manager.token, [
      approvedForwarded,
      unauthorizedUnrelatedTransition,
    ]);
    assert.equal(forwarded.status, 200);
    assert.equal(findReport(forwarded.body.reports, approvedId).status, "pending_accountant");
    assert.equal(findReport(forwarded.body.reports, returnedId).status, "pending_manager");
    assert.deepEqual(forwarded.body.rejectedReportIds, [returnedId]);

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
      workflowVersion: 3,
    };
    const returnedWrite = await putReports(accountant.token, [returned]);
    assert.equal(returnedWrite.status, 200);
    assert.equal(findReport(returnedWrite.body.reports, returnedId).status, "returned");
    await reopenAndRead(manager.token, returnedId, "returned");

    // A manager must be able to send a returned report to its original
    // attendant even when the manager's device clock is behind the accountant.
    const returnedToAttendant = {
      ...returned,
      status: "returned_attendant",
      mgrAt: "2026-09-02T09:00:00.000Z",
      workflowVersion: 4,
    };
    const returnedToAttendantWrite = await putReports(manager.token, [returnedToAttendant]);
    assert.equal(returnedToAttendantWrite.status, 200);
    assert.equal(findReport(returnedToAttendantWrite.body.reports, returnedId).status, "returned_attendant");
    await reopenAndRead(attendantB.token, returnedId, "returned_attendant");

    // The original attendant's corrected resubmission also advances by
    // revision, so an older phone clock cannot leave it stuck with the manager.
    const attendantResubmitted = {
      ...returnedToAttendant,
      status: "pending_manager",
      submittedAt: "2026-09-02T08:00:00.000Z",
      workflowVersion: 5,
    };
    const attendantResubmittedWrite = await putReports(attendantB.token, [attendantResubmitted]);
    assert.equal(attendantResubmittedWrite.status, 200);
    assert.equal(findReport(attendantResubmittedWrite.body.reports, returnedId).status, "pending_manager");
    await reopenAndRead(manager.token, returnedId, "pending_manager");

    const returnedForwardedAgain = {
      ...attendantResubmitted,
      status: "pending_accountant",
      mgrAt: "2026-09-02T07:00:00.000Z",
      workflowVersion: 6,
    };
    const returnedForwardedAgainWrite = await putReports(manager.token, [returnedForwardedAgain]);
    assert.equal(returnedForwardedAgainWrite.status, 200);
    assert.equal(findReport(returnedForwardedAgainWrite.body.reports, returnedId).status, "pending_accountant");
    await reopenAndRead(accountant.token, returnedId, "pending_accountant");

    const returnedApproved = {
      ...returnedForwardedAgain,
      status: "approved",
      accAt: "2026-09-02T06:00:00.000Z",
      workflowVersion: 7,
    };
    const returnedApprovedWrite = await putReports(accountant.token, [returnedApproved]);
    assert.equal(returnedApprovedWrite.status, 200);
    assert.equal(findReport(returnedApprovedWrite.body.reports, returnedId).status, "approved");
    await reopenAndRead(attendantB.token, returnedId, "approved");

    const staleReturnedPending = {
      ...returnedPending,
      submittedAt: "2026-09-02T09:00:00.000Z",
    };
    const staleReturnedWrite = await putReports(attendantB.token, [staleReturnedPending]);
    assert.equal(staleReturnedWrite.status, 200);
    assert.equal(findReport(staleReturnedWrite.body.reports, returnedId).status, "approved");

    const adminReturned = {
      ...approved,
      status: "pending_accountant",
      adminReturnedAt: "2026-09-02T14:00:00.000Z",
      adminReturnedBy: usernames.admin,
      workflowVersion: 4,
    };
    const adminReturnWrite = await putReports(admin.token, [adminReturned]);
    assert.equal(adminReturnWrite.status, 200);
    assert.equal(findReport(adminReturnWrite.body.reports, approvedId).status, "pending_accountant");

    // A stale approved copy must not reverse the explicit Admin return.
    const staleApprovedWrite = await putReports(accountant.token, [approved]);
    assert.equal(staleApprovedWrite.status, 200);
    assert.equal(findReport(staleApprovedWrite.body.reports, approvedId).status, "pending_accountant");

    const deletedApproved = report(deletedReportId, usernames.attendantA, {
      status: "approved",
      accAt: "2026-09-02T15:00:00.000Z",
    });
    const seedDeletedReport = await putReports(admin.token, [deletedApproved]);
    assert.equal(seedDeletedReport.status, 200);
    assert.equal(findReport(seedDeletedReport.body.reports, deletedReportId).status, "approved");

    const deleteResponse = await request<{ ok: boolean }>(
      `/state/pump-reports/${deletedReportId}/delete`,
      { method: "POST", body: JSON.stringify({}) },
      admin.token,
    );
    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteResponse.body.ok, true);

    // An Admin is allowed to write reports, so this proves the deletion
    // tombstone—not only transition authorization—prevents resurrection.
    const staleDeletedWrite = await putReports(admin.token, [deletedApproved]);
    assert.equal(staleDeletedWrite.status, 200);
    assert.equal(
      staleDeletedWrite.body.reports.some(candidate => candidate.id === deletedReportId),
      false,
    );

    const canonicalState = await request<Record<string, unknown>>("/state", {}, admin.token);
    assert.equal(canonicalState.status, 200);
    const canonicalReports = canonicalState.body.pumpDailyReports as PumpReport[];
    assert.equal(canonicalReports.some(candidate => candidate.id === deletedReportId), false);

    const [appStateReports, durableReport] = await Promise.all([
      pool.query(
        "SELECT data FROM app_state WHERE key = 'pumpDailyReports'",
      ),
      pool.query(
        "SELECT id FROM pump_reports WHERE id = $1",
        [deletedReportId],
      ),
    ]);
    const persistedReports = appStateReports.rows[0]?.data as PumpReport[] | undefined;
    assert.equal(
      persistedReports?.some(candidate => candidate.id === deletedReportId),
      false,
    );
    assert.equal(durableReport.rowCount, 0);

    const returnedForAttendant = report(attendantDeletedReportId, usernames.attendantA, {
      status: "returned",
      submittedByName: "Acceptance Attendant A",
      accNote: "Correct the rejected figures",
      workflowVersion: 3,
    });
    const seedReturnedForAttendant = await putReports(admin.token, [returnedForAttendant]);
    assert.equal(seedReturnedForAttendant.status, 200);
    assert.equal(
      findReport(seedReturnedForAttendant.body.reports, attendantDeletedReportId).status,
      "returned",
    );

    const correctedByAttendant = {
      ...returnedForAttendant,
      closingMeter: 1060,
      note: "Corrected by original attendant",
      workflowVersion: 4,
    };
    const attendantEdit = await putReports(attendantA.token, [correctedByAttendant]);
    assert.equal(attendantEdit.status, 200);
    assert.equal(
      findReport(attendantEdit.body.reports, attendantDeletedReportId).closingMeter,
      1060,
    );

    const otherAttendantDelete = await request<{ error: string }>(
      `/state/pump-reports/${attendantDeletedReportId}/delete`,
      { method: "POST", body: JSON.stringify({}) },
      attendantB.token,
    );
    assert.equal(otherAttendantDelete.status, 403);

    const attendantDelete = await request<{ ok: boolean }>(
      `/state/pump-reports/${attendantDeletedReportId}/delete`,
      { method: "POST", body: JSON.stringify({}) },
      attendantA.token,
    );
    assert.equal(attendantDelete.status, 200);
    assert.equal(attendantDelete.body.ok, true);

    const staleAttendantDeletedWrite = await putReports(admin.token, [returnedForAttendant]);
    assert.equal(staleAttendantDeletedWrite.status, 200);
    assert.equal(
      staleAttendantDeletedWrite.body.reports.some(candidate => candidate.id === attendantDeletedReportId),
      false,
    );

    const returnedForResubmission = report(attendantResubmittedReportId, usernames.attendantA, {
      status: "returned",
      submittedByName: "Acceptance Attendant A",
      accNote: "Correct and resubmit",
      workflowVersion: 3,
    });
    const seedReturnedForResubmission = await putReports(admin.token, [returnedForResubmission]);
    assert.equal(seedReturnedForResubmission.status, 200);

    const unauthorizedResubmission = await putReports(attendantB.token, [{
      ...returnedForResubmission,
      status: "pending_manager",
      workflowVersion: 4,
    }]);
    assert.equal(unauthorizedResubmission.status, 200);
    assert.deepEqual(unauthorizedResubmission.body.rejectedReportIds, [attendantResubmittedReportId]);
    assert.equal(
      findReport(unauthorizedResubmission.body.reports, attendantResubmittedReportId).status,
      "returned",
    );

    const attendantResubmission = await putReports(attendantA.token, [{
      ...returnedForResubmission,
      status: "pending_manager",
      note: "Corrected and re-submitted",
      submittedAt: "2026-09-02T16:00:00.000Z",
      workflowVersion: 4,
    }]);
    assert.equal(attendantResubmission.status, 200);
    assert.equal(
      findReport(attendantResubmission.body.reports, attendantResubmittedReportId).status,
      "pending_manager",
    );

    const fixtureMarker = `native-outbox-fixture-${marker}`;
    const fixtureReport = report(`${marker}-fixture`, usernames.attendantA, {
      note: fixtureMarker,
    });
    const unrelatedFixtureReport = report(`${marker}-unrelated`, usernames.attendantB, {
      note: fixtureMarker,
    });
    const seededFixtureReports = await putReports(admin.token, [
      fixtureReport,
      unrelatedFixtureReport,
    ]);
    assert.equal(seededFixtureReports.status, 200);

    const fixtureCleanup = await request<{ ok: boolean; deleted: number }>(
      "/state/pump-reports/cleanup-fixture",
      {
        method: "POST",
        body: JSON.stringify({
          reportMarker: fixtureMarker,
          submittedBy: usernames.attendantA,
        }),
      },
      admin.token,
    );
    assert.deepEqual(fixtureCleanup, {
      status: 200,
      body: { ok: true, deleted: 1 },
    });

    // Matching the exact marker and submitter keeps another fixture or test
    // account with the same note untouched.
    const afterFixtureCleanup = await request<Record<string, unknown>>("/state", {}, admin.token);
    const remainingFixtureReports = afterFixtureCleanup.body.pumpDailyReports as PumpReport[];
    assert.equal(remainingFixtureReports.some(candidate => candidate.id === fixtureReport.id), false);
    assert.equal(remainingFixtureReports.some(candidate => candidate.id === unrelatedFixtureReport.id), true);

    // Cleanup also leaves a tombstone, so a stale admin/device copy cannot
    // recreate the report after the cleanup request.
    const staleFixtureWrite = await putReports(admin.token, [fixtureReport]);
    assert.equal(staleFixtureWrite.status, 200);
    assert.equal(staleFixtureWrite.body.reports.some(candidate => candidate.id === fixtureReport.id), false);
  } finally {
    await pool.query("BEGIN");
    try {
      await pool.query(
        "DELETE FROM pump_reports WHERE id = ANY($1::text[])",
        [cleanupReportIds],
      );
      await pool.query(`
        UPDATE app_state
        SET data = COALESCE((
          SELECT jsonb_agg(item)
          FROM jsonb_array_elements(data) item
          WHERE NOT (item->>'id' = ANY($1::text[]))
        ), '[]'::jsonb)
        WHERE key = 'pumpDailyReports'
      `, [cleanupReportIds]);
      await pool.query(`
        UPDATE app_state
        SET data = COALESCE((
          SELECT jsonb_agg(item)
          FROM jsonb_array_elements(data) item
          WHERE NOT (item->>'id' = ANY($1::text[]))
        ), '[]'::jsonb)
        WHERE key = 'pumpReportDeletionTombstones'
      `, [cleanupReportIds]);
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