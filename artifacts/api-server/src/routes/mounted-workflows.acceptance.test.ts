import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

type LoginResult = {
  token: string;
  role: string;
  empName: string;
};

type JsonRecord = Record<string, unknown>;
type ApiResult<T extends JsonRecord = JsonRecord> = {
  status: number;
  body: T;
};

test("restoring a stale backup cannot resurrect deleted deliveries or expenses", {
  skip: !process.env.DATABASE_URL || !process.env.JWT_SECRET || !process.env.PRIVATE_OBJECT_DIR,
  timeout: 30_000,
}, async () => {
  const [{ default: app }, { pool }, { objectStorageClient }] = await Promise.all([
    import("../app"),
    import("@workspace/db"),
    import("../lib/objectStorage"),
  ]);
  const marker = `backup-restore-${randomUUID()}`;
  const password = `Test-${randomUUID()}`;
  const username = `${marker}-admin`;
  const deliveryId = `${marker}-delivery`;
  const expenseId = `${marker}-expense`;
  const stateKeys = [
    "deliveries",
    "deliveryDeletionTombstones",
    "expenses",
    "expenseDeletionTombstones",
  ];
  const priorRows = await pool.query(
    "SELECT key, data FROM app_state WHERE key = ANY($1::text[])",
    [stateKeys],
  );
  const priorState = new Map<string, unknown>(
    priorRows.rows.map((row: { key: string; data: unknown }) => [row.key, row.data]),
  );
  const backupObjects = new Map<string, Buffer>();
  const originalBucket = objectStorageClient.bucket;
  Object.defineProperty(objectStorageClient, "bucket", {
    configurable: true,
    value: () => ({
      file: (name: string) => ({
        save: async (body: string) => {
          backupObjects.set(name, Buffer.from(body));
        },
        exists: async () => [backupObjects.has(name)],
        download: async () => [backupObjects.get(name) as Buffer],
      }),
      getFiles: async () => [[]],
    }),
  });
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api`;

  async function request<T extends JsonRecord = JsonRecord>(
    path: string,
    options: RequestInit = {},
    token?: string,
  ): Promise<ApiResult<T>> {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const text = await response.text();
    let body: T;
    try {
      body = JSON.parse(text) as T;
    } catch {
      body = { error: text } as unknown as T;
    }
    return { status: response.status, body };
  }

  async function readState(key: string): Promise<unknown> {
    const result = await pool.query("SELECT data FROM app_state WHERE key = $1", [key]);
    return result.rows[0]?.data;
  }

  try {
    await pool.query(`
      INSERT INTO staff_users (
        emp_name, username, password, role, branch_id, status,
        created_by, approved_by, approved_at
      )
      VALUES ('Backup Restore Admin', $1, $2, 'admin', NULL, 'active', $1, $1, NOW())
    `, [username, password]);
    const login = await request<LoginResult & JsonRecord>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    assert.equal(login.status, 200);
    assert.equal(typeof login.body.token, "string");

    const staleDelivery = {
      id: deliveryId,
      approvalStatus: "draft",
      workflowVersion: 0,
      sup: "Backup Supplier",
      prod: "PMS",
      wb: `${marker}-waybill`,
      dt: "2026-10-03",
      ord: 100,
      rec: 50,
    };
    const staleExpense = {
      id: expenseId,
      status: "pending",
      revision: 0,
      desc: "Backup expense",
    };
    await pool.query(`
      INSERT INTO app_state (key, data)
      VALUES
        ('deliveries', $1::jsonb),
        ('expenses', $2::jsonb),
        ('deliveryDeletionTombstones', '[]'::jsonb),
        ('expenseDeletionTombstones', '[]'::jsonb)
      ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `, [
      JSON.stringify([staleDelivery]),
      JSON.stringify([staleExpense]),
    ]);

    const staleBackup = await request<{ ok: boolean; backup: { objectName: string } }>(
      "/state/backup",
      { method: "POST" },
      login.body.token,
    );
    assert.equal(staleBackup.status, 200);

    const deliveryTombstone = {
      id: deliveryId,
      workflowVersion: 0,
      deletedAt: new Date().toISOString(),
    };
    const expenseTombstone = {
      id: expenseId,
      revision: 0,
      deletedAt: new Date().toISOString(),
    };
    await pool.query(`
      INSERT INTO app_state (key, data)
      VALUES
        ('deliveries', '[]'::jsonb),
        ('expenses', '[]'::jsonb),
        ('deliveryDeletionTombstones', $1::jsonb),
        ('expenseDeletionTombstones', $2::jsonb)
      ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `, [
      JSON.stringify([deliveryTombstone]),
      JSON.stringify([expenseTombstone]),
    ]);

    // This backup proves tombstones are part of the exported state.
    const protectedBackup = await request<{ ok: boolean; backup: { objectName: string } }>(
      "/state/backup",
      { method: "POST" },
      login.body.token,
    );
    assert.equal(protectedBackup.status, 200);

    // Lose the tombstones before restoring the protected snapshot. The
    // snapshot must restore them and keep both workflow records absent.
    await pool.query(`
      UPDATE app_state
      SET data = CASE key
        WHEN 'deliveries' THEN $1::jsonb
        WHEN 'expenses' THEN $2::jsonb
        WHEN 'deliveryDeletionTombstones' THEN '[]'::jsonb
        WHEN 'expenseDeletionTombstones' THEN '[]'::jsonb
      END,
      updated_at = NOW()
      WHERE key = ANY($3::text[])
    `, [
      JSON.stringify([staleDelivery]),
      JSON.stringify([staleExpense]),
      stateKeys,
    ]);
    const protectedRestore = await request<{ ok: boolean; keysRestored: number }>(
      "/state/restore",
      {
        method: "POST",
        body: JSON.stringify({ objectName: protectedBackup.body.backup.objectName }),
      },
      login.body.token,
    );
    assert.equal(protectedRestore.status, 200);
    assert.equal((await readState("deliveries") as JsonRecord[]).some(item => item.id === deliveryId), false);
    assert.equal((await readState("expenses") as JsonRecord[]).some(item => item.id === expenseId), false);
    assert.ok((await readState("deliveryDeletionTombstones") as JsonRecord[]).some(item => item.id === deliveryId));
    assert.ok((await readState("expenseDeletionTombstones") as JsonRecord[]).some(item => item.id === expenseId));

    // Restoring the older snapshot must also retain the newer live tombstones.
    const staleRestore = await request<{ ok: boolean; keysRestored: number }>(
      "/state/restore",
      {
        method: "POST",
        body: JSON.stringify({ objectName: staleBackup.body.backup.objectName }),
      },
      login.body.token,
    );
    assert.equal(staleRestore.status, 200);
    assert.equal((await readState("deliveries") as JsonRecord[]).some(item => item.id === deliveryId), false);
    assert.equal((await readState("expenses") as JsonRecord[]).some(item => item.id === expenseId), false);
  } finally {
    await pool.query("BEGIN");
    try {
      for (const key of stateKeys) {
        if (priorState.has(key)) {
          await pool.query(
            "UPDATE app_state SET data = $2::jsonb, updated_at = NOW() WHERE key = $1",
            [key, JSON.stringify(priorState.get(key))],
          );
        } else {
          await pool.query("DELETE FROM app_state WHERE key = $1", [key]);
        }
      }
      await pool.query("DELETE FROM staff_users WHERE username = $1", [username]);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
      Object.defineProperty(objectStorageClient, "bucket", {
        configurable: true,
        value: originalBucket,
      });
      await pool.end();
    }
  }
});

test("mounted workflow commands are server-authoritative, revision-safe, and idempotent", {
  skip: !process.env.DATABASE_URL || !process.env.JWT_SECRET,
  timeout: 30_000,
}, async () => {
  const [{ default: app }, { pool }] = await Promise.all([
    import("../app"),
    import("@workspace/db"),
  ]);
  const marker = `mounted-workflows-${randomUUID()}`;
  const password = `Test-${randomUUID()}`;
  const branchA = `${marker}-branch-a`;
  const branchB = `${marker}-branch-b`;
  const product = `${marker}-pms`;
  const tankId = `${marker}-tank`;
  const users = {
    manager: `${marker}-manager`,
    otherManager: `${marker}-other-manager`,
    csm: `${marker}-csm`,
    accountant: `${marker}-accountant`,
    md: `${marker}-md`,
    ceo: `${marker}-ceo`,
    admin: `${marker}-admin`,
    attendant: `${marker}-attendant`,
  };
  const stateKeys = [
    "deliveries",
    "deliveryDeletionTombstones",
    "deliveryWorkflowIdempotency",
    "expenses",
    "expenseDeletionTombstones",
    "budgets",
    "branches",
    "financeWorkflowIdempotency",
    "dips",
    "priceProposals",
    "workflowDipsPricesIdempotency",
    "prices",
    "priceHistory",
    "tanks",
    "lpgTanks",
    "inventoryLog",
    "inventoryAlerts",
    "audit",
  ];
  const priorRows = await pool.query(
    "SELECT key, data FROM app_state WHERE key = ANY($1::text[])",
    [stateKeys],
  );
  const priorState = new Map<string, unknown>(
    priorRows.rows.map((row: { key: string; data: unknown }) => [row.key, row.data]),
  );
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api`;

  async function request<T extends JsonRecord = JsonRecord>(
    path: string,
    options: RequestInit = {},
    token?: string,
  ): Promise<ApiResult<T>> {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const text = await response.text();
    let body: T;
    try {
      body = JSON.parse(text) as T;
    } catch {
      body = { error: text } as unknown as T;
    }
    return { status: response.status, body };
  }

  async function login(username: string): Promise<LoginResult> {
    const result = await request<LoginResult & JsonRecord>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    assert.equal(result.status, 200);
    assert.equal(typeof result.body.token, "string");
    return result.body;
  }

  function command(
    token: string,
    path: string,
    body: JsonRecord,
    method = "POST",
  ): Promise<ApiResult> {
    return request(path, { method, body: JSON.stringify(body) }, token);
  }

  function recordFrom(result: ApiResult): JsonRecord {
    assert.ok(result.body.record && typeof result.body.record === "object");
    return result.body.record as JsonRecord;
  }

  async function readState(key: string): Promise<unknown> {
    const row = await pool.query("SELECT data FROM app_state WHERE key = $1", [key]);
    return row.rows[0]?.data;
  }

  try {
    await pool.query(`
      INSERT INTO staff_users (
        emp_name, username, password, role, branch_id, status,
        created_by, approved_by, approved_at
      )
      VALUES
        ('Workflow Manager', $1, $8, 'mgr', $9, 'active', $10, $10, NOW()),
        ('Other Workflow Manager', $2, $8, 'mgr', $11, 'active', $10, $10, NOW()),
        ('Workflow CSM', $3, $8, 'csm', $9, 'active', $10, $10, NOW()),
        -- These reviewers intentionally retain branch assignments. Finance
        -- reviewers are still company-wide and must not be blocked by legacy
        -- branch fields on their account or on the record.
        ('Workflow Accountant', $4, $8, 'acc', $9, 'active', $10, $10, NOW()),
        ('Workflow MD', $5, $8, 'md', $11, 'active', $10, $10, NOW()),
        ('Workflow CEO', $6, $8, 'ceo', NULL, 'active', $10, $10, NOW()),
        ('Workflow Attendant', $7, $8, 'att', $9, 'active', $10, $10, NOW())
    `, [
      users.manager,
      users.otherManager,
      users.csm,
      users.accountant,
      users.md,
      users.ceo,
      users.attendant,
      password,
      branchA,
      marker,
      branchB,
    ]);
    await pool.query(`
      INSERT INTO staff_users (
        emp_name, username, password, role, branch_id, status,
        created_by, approved_by, approved_at
      )
      VALUES ('Workflow Admin', $1, $2, 'admin', NULL, 'active', $3, $3, NOW())
    `, [users.admin, password, marker]);

    const [manager, otherManager, csm, accountant, md, ceo, admin, attendant] = await Promise.all([
      login(users.manager),
      login(users.otherManager),
      login(users.csm),
      login(users.accountant),
      login(users.md),
      login(users.ceo),
      login(users.admin),
      login(users.attendant),
    ]);

    // These collections can only be changed through their mounted command
    // routes, irrespective of the authenticated actor's role.
    for (const key of ["budgets", "dips", "priceProposals"]) {
      for (const actor of [manager, accountant, md]) {
        const blocked = await command(actor.token, `/state/${key}`, {}, "PUT");
        assert.equal(blocked.status, 409, `${key} generic PUT should be blocked for ${actor.role}`);
        assert.match(String(blocked.body.error), /server-authoritative/);
      }
    }

    await pool.query(`
      INSERT INTO app_state (key, data)
      VALUES
        ('tanks', $1::jsonb),
        ('lpgTanks', '[]'::jsonb),
        ('prices', $2::jsonb),
        ('branches', $3::jsonb),
        ('budgets', $4::jsonb)
      ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `, [
      JSON.stringify([{
        id: tankId,
        name: `${marker} tank`,
        prod: product,
        branchId: branchA,
        cap: 20_000,
        op: 1_000,
        rv: 50,
        sl: 100,
      }]),
      JSON.stringify({
        [product]: 600,
        branchPrices: {
          [branchA]: { [product]: 610 },
          [branchB]: { [product]: 620 },
        },
      }),
      JSON.stringify([
        { id: branchA, name: `${marker} Branch A`, st: "Active" },
        { id: branchB, name: `${marker} Branch B`, st: "Active" },
      ]),
      JSON.stringify([
        {
          id: 1, month: 10, year: 2026, appliesOn: "2026-10-01",
          label: "October 2026", by: "mgr", byName: "Manager",
          items: [{ cat: "Operations", amt: 50_000 }], total: 50_000,
          status: "fully_approved", workflow: [], branchId: branchA,
          branchName: `${marker} Branch A`, revision: 1,
        },
        {
          id: 2, month: 10, year: 2026, appliesOn: "2026-10-01",
          label: "October 2026", by: "mgr", byName: "Other Manager",
          items: [{ cat: "Operations", amt: 50_000 }], total: 50_000,
          status: "fully_approved", workflow: [], branchId: branchB,
          branchName: `${marker} Branch B`, revision: 1,
        },
      ]),
    ]);

    const invalidDelivery = await command(csm.token, "/deliveries", {
      delivery: {
        id: `${marker}-invalid-delivery`,
        sup: "Supplier",
        prod: product,
        wb: "WB-invalid",
        dt: "2026-10-01",
        ord: 100,
        rec: 0,
      },
      expectedRevision: 0,
      idempotencyKey: `${marker}-delivery-invalid`,
    });
    assert.equal(invalidDelivery.status, 400);

    const deliveryId = `${marker}-delivery`;
    const deliveryBody = {
      delivery: {
        id: deliveryId,
        sup: "Acceptance Supplier",
        prod: product,
        wb: `${marker}-waybill`,
        dt: "2026-10-01",
        ord: 1_000,
        rec: 500,
      },
      expectedRevision: 0,
      idempotencyKey: `${marker}-delivery-create`,
    };
    const deliveryCreated = await command(csm.token, "/deliveries", deliveryBody);
    assert.equal(deliveryCreated.status, 200);
    assert.equal((deliveryCreated.body.delivery as JsonRecord).approvalStatus, "draft");
    assert.equal((deliveryCreated.body.delivery as JsonRecord).receivedByUsername, users.csm);

    const deliveryCreateReplay = await command(csm.token, "/deliveries", deliveryBody);
    assert.equal(deliveryCreateReplay.status, 200);
    assert.equal(deliveryCreateReplay.body.replayed, true);

    const wrongOwnerSubmit = await command(manager.token, `/deliveries/${deliveryId}/submit`, {
      expectedRevision: 0,
      idempotencyKey: `${marker}-delivery-wrong-owner`,
    });
    assert.equal(wrongOwnerSubmit.status, 403);
    const wrongBranchSubmit = await command(otherManager.token, `/deliveries/${deliveryId}/submit`, {
      expectedRevision: 0,
      idempotencyKey: `${marker}-delivery-wrong-branch`,
    });
    assert.equal(wrongBranchSubmit.status, 403);

    const deliverySubmitted = await command(csm.token, `/deliveries/${deliveryId}/submit`, {
      expectedRevision: 0,
      idempotencyKey: `${marker}-delivery-submit`,
    });
    assert.equal(deliverySubmitted.status, 200);
    assert.equal((deliverySubmitted.body.delivery as JsonRecord).approvalStatus, "pending_acc");
    const deliveryForwarded = await command(accountant.token, `/deliveries/${deliveryId}/forward`, {
      expectedRevision: 1,
      idempotencyKey: `${marker}-delivery-forward`,
      costPrice: 650,
    });
    assert.equal(deliveryForwarded.status, 200);
    assert.equal((deliveryForwarded.body.delivery as JsonRecord).approvalStatus, "pending_md");
    const deliveryApproveBody = {
      expectedRevision: 2,
      idempotencyKey: `${marker}-delivery-approve`,
      sellingPrice: 700,
    };
    const deliveryApproved = await command(md.token, `/deliveries/${deliveryId}/approve`, deliveryApproveBody);
    assert.equal(deliveryApproved.status, 200);
    assert.equal((deliveryApproved.body.delivery as JsonRecord).approvalStatus, "md_approved");
    // Older clients send a complete array through the generic state route.
    // That snapshot is stale, but must not downgrade the approval or erase
    // the delivery that another user approved.
    const staleDeliveryWrite = await request<{ ok: boolean; deliveries: JsonRecord[] }>(
      "/state/deliveries",
      {
        method: "PUT",
        body: JSON.stringify([deliveryCreated.body.delivery]),
      },
      csm.token,
    );
    assert.equal(staleDeliveryWrite.status, 200);
    assert.equal(
      staleDeliveryWrite.body.deliveries.find(item => item.id === deliveryId)?.approvalStatus,
      "md_approved",
    );

    const returnedDeliveryId = `${marker}-returned-delivery`;
    const returnedCreated = await command(csm.token, "/deliveries", {
      delivery: {
        id: returnedDeliveryId,
        sup: "Returned Supplier",
        prod: product,
        wb: `${marker}-returned-waybill`,
        dt: "2026-10-01",
        ord: 800,
        rec: 400,
      },
      expectedRevision: 0,
      idempotencyKey: `${marker}-returned-delivery-create`,
    });
    assert.equal(returnedCreated.status, 200);
    const returnedSubmitted = await command(csm.token, `/deliveries/${returnedDeliveryId}/submit`, {
      expectedRevision: 0,
      idempotencyKey: `${marker}-returned-delivery-submit`,
    });
    assert.equal(returnedSubmitted.status, 200);
    const returnedForwarded = await command(accountant.token, `/deliveries/${returnedDeliveryId}/forward`, {
      expectedRevision: 1,
      idempotencyKey: `${marker}-returned-delivery-forward`,
      costPrice: 640,
    });
    assert.equal(returnedForwarded.status, 200);
    const returned = await command(md.token, `/deliveries/${returnedDeliveryId}/reject`, {
      expectedRevision: 2,
      idempotencyKey: `${marker}-returned-delivery-reject`,
      note: "Correct the received quantity",
    });
    assert.equal(returned.status, 200);
    assert.equal((returned.body.delivery as JsonRecord).approvalStatus, "returned");
    const returnedCorrection = await command(csm.token, `/deliveries/${returnedDeliveryId}`, {
      delivery: { rec: 390, notes: "Corrected after MD return" },
      expectedRevision: 3,
      idempotencyKey: `${marker}-returned-delivery-correction`,
    }, "PUT");
    assert.equal(returnedCorrection.status, 200);
    assert.equal((returnedCorrection.body.delivery as JsonRecord).workflowVersion, 4);
    const staleReturnedWrite = await request<{ ok: boolean; deliveries: JsonRecord[] }>(
      "/state/deliveries",
      {
        method: "PUT",
        body: JSON.stringify([returned.body.delivery]),
      },
      manager.token,
    );
    assert.equal(staleReturnedWrite.status, 200);
    assert.equal(
      staleReturnedWrite.body.deliveries.find(item => item.id === returnedDeliveryId)?.notes,
      "Corrected after MD return",
    );

    const deliveryApprovalReplay = await command(md.token, `/deliveries/${deliveryId}/approve`, deliveryApproveBody);
    assert.equal(deliveryApprovalReplay.status, 200);
    assert.equal(deliveryApprovalReplay.body.replayed, true);
    const staleDelivery = await command(md.token, `/deliveries/${deliveryId}/approve`, {
      expectedRevision: 2,
      idempotencyKey: `${marker}-delivery-stale`,
      sellingPrice: 700,
    });
    assert.equal(staleDelivery.status, 409);
    const deliveryTanks = await readState("tanks") as JsonRecord[];
    assert.equal(deliveryTanks.find(tank => tank.id === tankId)?.rv, 550);
    const deliveryHistory = await readState("priceHistory") as JsonRecord[];
    assert.equal(deliveryHistory.filter(entry => entry.reason === `Delivery #${deliveryId} approval`).length, 1);

    const expenseCreated = await command(manager.token, "/finance/expenses", {
      expense: {
        cat: "Operations",
        desc: `${marker} expense`,
        amt: 1250,
        dt: "2026-10-02",
        budgetId: 1,
      },
      expectedRevision: 0,
      idempotencyKey: `${marker}-expense-create`,
    });
    assert.equal(expenseCreated.status, 201);
    const expense = recordFrom(expenseCreated);
    const expenseId = String(expense.id);
    assert.equal(expense.branchId, branchA);
    assert.equal(expense.branchName, `${marker} Branch A`);
    const crossBranchExpense = await command(manager.token, "/finance/expenses", {
      expense: {
        cat: "Operations",
        desc: `${marker} cross-branch expense`,
        amt: 250,
        dt: "2026-10-02",
        budgetId: 2,
      },
      expectedRevision: 0,
      idempotencyKey: `${marker}-expense-cross-branch-rejected`,
    });
    assert.equal(crossBranchExpense.status, 403);
    const expenseRoleDenied = await command(attendant.token, `/finance/expenses/${expenseId}/forward`, {
      expectedRevision: 1,
      idempotencyKey: `${marker}-expense-role-denied`,
    });
    assert.equal(expenseRoleDenied.status, 403);
    const expenseForwardDenied = await command(accountant.token, `/finance/expenses/${expenseId}/forward`, {
      expectedRevision: 1,
      idempotencyKey: `${marker}-expense-forward-disabled`,
    });
    assert.equal(expenseForwardDenied.status, 403);
    const ceoExpenseState = await request("/state/expenses", {}, ceo.token);
    assert.equal(ceoExpenseState.status, 200);
    assert.ok((ceoExpenseState.body as unknown as JsonRecord[]).some(item => String(item.id) === expenseId));
    const mdExpenseApprovalBlocked = await command(md.token, `/finance/expenses/${expenseId}/approve`, {
      expectedRevision: 1,
      idempotencyKey: `${marker}-md-expense-approve-blocked`,
    });
    assert.equal(mdExpenseApprovalBlocked.status, 403);
    const staleExpense = await command(manager.token, `/finance/expenses/${expenseId}`, {
      expense: {
        cat: "Operations",
        desc: `${marker} stale edit`,
        amt: 1300,
        dt: "2026-10-02",
        budgetId: 1,
      },
      expectedRevision: 0,
      idempotencyKey: `${marker}-expense-stale`,
    }, "PATCH");
    assert.equal(staleExpense.status, 409);
    const expenseRejected = await command(accountant.token, `/finance/expenses/${expenseId}/reject`, {
      expectedRevision: 1,
      idempotencyKey: `${marker}-expense-reject`,
    });
    assert.equal(expenseRejected.status, 201);
    assert.equal(recordFrom(expenseRejected).status, "rejected");
    const managerExpenseState = await request("/state/expenses", {}, manager.token);
    assert.equal(managerExpenseState.status, 200);
    assert.equal(
      (managerExpenseState.body as unknown as JsonRecord[]).find(item => String(item.id) === expenseId)?.status,
      "rejected",
    );
    const resubmittedExpense = await command(manager.token, `/finance/expenses/${expenseId}`, {
      expense: {
        cat: "Operations",
        desc: `${marker} corrected expense`,
        amt: 1300,
        dt: "2026-10-02",
        budgetId: 1,
      },
      expectedRevision: 2,
      idempotencyKey: `${marker}-expense-resubmit`,
    }, "PATCH");
    assert.equal(resubmittedExpense.status, 201);
    assert.equal(recordFrom(resubmittedExpense).status, "pending");
    assert.equal(recordFrom(resubmittedExpense).revision, 3);
    const expenseApproveBody = {
      expectedRevision: 3,
      idempotencyKey: `${marker}-expense-approve`,
    };
    const expenseApproved = await command(accountant.token, `/finance/expenses/${expenseId}/approve`, expenseApproveBody);
    assert.equal(expenseApproved.status, 201);
    assert.equal(recordFrom(expenseApproved).status, "approved");
    const staleExpenseWrite = await request<{ ok: boolean; expenses: JsonRecord[] }>(
      "/state/expenses",
      {
        method: "PUT",
        body: JSON.stringify([{
          ...recordFrom(expenseCreated),
          status: "pending",
          revision: 1,
        }]),
      },
      manager.token,
    );
    assert.equal(staleExpenseWrite.status, 200);
    assert.equal(
      staleExpenseWrite.body.expenses.find(item => String(item.id) === expenseId)?.status,
      "approved",
    );
    const deletableExpense = await command(manager.token, "/finance/expenses", {
      expense: {
        cat: "Operations",
        desc: `${marker} deleted expense`,
        amt: 300,
        dt: "2026-10-02",
        budgetId: 1,
      },
      expectedRevision: 0,
      idempotencyKey: `${marker}-deleted-expense-create`,
    });
    assert.equal(deletableExpense.status, 201);
    const deletableExpenseId = String(recordFrom(deletableExpense).id);
    const deletedExpense = await command(manager.token, `/finance/expenses/${deletableExpenseId}`, {
      expectedRevision: 1,
      idempotencyKey: `${marker}-deleted-expense-delete`,
    }, "DELETE");
    assert.equal(deletedExpense.status, 200);
    assert.equal(deletedExpense.body.deleted, true);
    const staleDeletedExpenseWrite = await request<{ ok: boolean; expenses: JsonRecord[] }>(
      "/state/expenses",
      {
        method: "PUT",
        body: JSON.stringify([recordFrom(deletableExpense)]),
      },
      manager.token,
    );
    assert.equal(staleDeletedExpenseWrite.status, 200);
    assert.equal(
      staleDeletedExpenseWrite.body.expenses.some(item => String(item.id) === deletableExpenseId),
      false,
    );
    const expenseReplay = await command(accountant.token, `/finance/expenses/${expenseId}/approve`, expenseApproveBody);
    assert.equal(expenseReplay.status, 200);
    assert.equal(expenseReplay.body.replay, true);

    const ceoExpense = await command(manager.token, "/finance/expenses", {
      expense: {
        cat: "Operations",
        desc: `${marker} CEO expense`,
        amt: 900,
        dt: "2026-10-02",
        budgetId: 1,
      },
      expectedRevision: 0,
      idempotencyKey: `${marker}-ceo-expense-create`,
    });
    assert.equal(ceoExpense.status, 201);
    const ceoExpenseId = String(recordFrom(ceoExpense).id);
    const ceoExpenseApprovalBlocked = await command(ceo.token, `/finance/expenses/${ceoExpenseId}/approve`, {
      expectedRevision: 1,
      idempotencyKey: `${marker}-ceo-expense-approve`,
    });
    assert.equal(ceoExpenseApprovalBlocked.status, 403);
    const mdExpenseApprovalAlsoBlocked = await command(md.token, `/finance/expenses/${ceoExpenseId}/approve`, {
      expectedRevision: 1,
      idempotencyKey: `${marker}-md-expense-approve`,
    });
    assert.equal(mdExpenseApprovalAlsoBlocked.status, 403);
    const accountantExpenseApproved = await command(accountant.token, `/finance/expenses/${ceoExpenseId}/approve`, {
      expectedRevision: 1,
      idempotencyKey: `${marker}-accountant-expense-approve`,
    });
    assert.equal(accountantExpenseApproved.status, 201);
    assert.equal(recordFrom(accountantExpenseApproved).status, "approved");

    const legacyBudgetId = `${marker}-legacy-budget`;
    await pool.query(`
      INSERT INTO app_state (key, data)
      VALUES ('budgets', $1::jsonb)
      ON CONFLICT (key) DO UPDATE
      SET data = COALESCE(app_state.data, '[]'::jsonb) || EXCLUDED.data,
          updated_at = NOW()
    `, [JSON.stringify([{
      id: legacyBudgetId,
      month: 9,
      year: 2026,
      appliesOn: "2026-09-01",
      label: "September 2026",
      by: "acc",
      byName: "Legacy Finance User",
      items: [{ cat: "Operations", amt: 1_000 }],
      total: 1_000,
      status: "fully_approved",
      workflow: [],
      revision: 0,
    }])]);
    const managerCannotClassify = await command(manager.token, `/finance/budgets/${legacyBudgetId}/classify-branch`, {
      branchId: branchA,
      expectedRevision: 0,
      idempotencyKey: `${marker}-budget-classify-manager-forbidden`,
    });
    assert.equal(managerCannotClassify.status, 403);
    const classifiedBudget = await command(accountant.token, `/finance/budgets/${legacyBudgetId}/classify-branch`, {
      branchId: branchB,
      expectedRevision: 0,
      idempotencyKey: `${marker}-budget-classify-accountant`,
    });
    assert.equal(classifiedBudget.status, 201);
    assert.equal(recordFrom(classifiedBudget).branchId, branchB);
    assert.equal(recordFrom(classifiedBudget).branchName, `${marker} Branch B`);
    assert.equal(recordFrom(classifiedBudget).revision, 1);
    assert.equal(
      (recordFrom(classifiedBudget).workflow as JsonRecord[]).at(-1)?.action,
      "classify_branch",
    );
    const cannotReclassify = await command(md.token, `/finance/budgets/${legacyBudgetId}/classify-branch`, {
      branchId: branchA,
      expectedRevision: 1,
      idempotencyKey: `${marker}-budget-reclassify-blocked`,
    });
    assert.equal(cannotReclassify.status, 409);

    const budgetInput = (label: string, status?: string, month = 11) => ({
      month,
      year: 2026,
      appliesOn: branchA,
      label,
      items: [{ cat: "Operations", amt: 5_000 }],
      ...(status ? { status } : {}),
    });
    const submittedBudget = await command(manager.token, "/finance/budgets", {
      budget: budgetInput(`${marker} submitted`, "submitted"),
      expectedRevision: 0,
      idempotencyKey: `${marker}-budget-submitted-create`,
    });
    assert.equal(submittedBudget.status, 201);
    let budget = recordFrom(submittedBudget);
    assert.equal(budget.status, "submitted");
    assert.equal(budget.branchId, branchA);
    assert.equal(budget.branchName, `${marker} Branch A`);
    const otherBranchBudget = await command(otherManager.token, "/finance/budgets", {
      budget: budgetInput(`${marker} other branch`, "submitted"),
      expectedRevision: 0,
      idempotencyKey: `${marker}-budget-other-branch-create`,
    });
    assert.equal(otherBranchBudget.status, 201);
    assert.equal(recordFrom(otherBranchBudget).branchId, branchB);
    const managerState = await request<{ budgets: JsonRecord[] }>("/state", {}, manager.token);
    assert.equal(managerState.status, 200);
    assert.ok(managerState.body.budgets.length > 0);
    assert.ok(managerState.body.budgets.every(item => item.branchId === branchA));
    assert.equal(
      managerState.body.budgets.some(item => item.id === recordFrom(otherBranchBudget).id),
      false,
    );
    const otherManagerState = await request<{ budgets: JsonRecord[] }>("/state", {}, otherManager.token);
    assert.equal(otherManagerState.status, 200);
    assert.ok(otherManagerState.body.budgets.every(item => item.branchId === branchB));
    assert.equal(
      otherManagerState.body.budgets.some(item => item.id === budget.id),
      false,
    );
    const submittedBudgetId = String(budget.id);
    const managerDeleteSubmitted = await command(manager.token, `/finance/budgets/${submittedBudgetId}`, {
      expectedRevision: 1,
      idempotencyKey: `${marker}-budget-illegal-delete`,
    }, "DELETE");
    assert.equal(managerDeleteSubmitted.status, 403);
    const budgetForwarded = await command(accountant.token, `/finance/budgets/${submittedBudgetId}/forward`, {
      expectedRevision: 1,
      idempotencyKey: `${marker}-budget-forward`,
      note: "Reviewed",
    });
    assert.equal(budgetForwarded.status, 201);
    budget = recordFrom(budgetForwarded);
    assert.equal(budget.status, "acc_forwarded");
    const budgetApproved = await command(md.token, `/finance/budgets/${submittedBudgetId}/approve`, {
      expectedRevision: 2,
      idempotencyKey: `${marker}-budget-approve`,
      note: "Approved",
    });
    assert.equal(budgetApproved.status, 201);
    assert.equal(recordFrom(budgetApproved).status, "fully_approved");
    const adminDeleteApprovedBudget = await command(admin.token, `/finance/budgets/${submittedBudgetId}`, {
      expectedRevision: 3,
      idempotencyKey: `${marker}-budget-admin-delete-approved`,
    }, "DELETE");
    assert.equal(adminDeleteApprovedBudget.status, 200);
    assert.equal(adminDeleteApprovedBudget.body.deleted, true);

    const duplicateSubmit = await command(manager.token, "/finance/budgets", {
      budget: budgetInput(`${marker} duplicate`, "submitted"),
      expectedRevision: 0,
      idempotencyKey: `${marker}-budget-duplicate-submit`,
    });
    assert.equal(duplicateSubmit.status, 409);
    assert.match(String(duplicateSubmit.body.error), /already has a budget submitted/i);

    const draftBudget = await command(manager.token, "/finance/budgets", {
      budget: budgetInput(`${marker} draft`, undefined, 12),
      expectedRevision: 0,
      idempotencyKey: `${marker}-budget-draft-create`,
    });
    const draftBudgetId = String(recordFrom(draftBudget).id);
    const atomicSubmit = await command(manager.token, `/finance/budgets/${draftBudgetId}/update-submit`, {
      budget: {
        ...budgetInput(`${marker} atomically updated`, undefined, 12),
        items: [{ cat: "Operations", amt: 7_500 }],
      },
      expectedRevision: 1,
      idempotencyKey: `${marker}-budget-update-submit`,
    });
    assert.equal(atomicSubmit.status, 201);
    assert.equal(recordFrom(atomicSubmit).status, "submitted");
    assert.equal(recordFrom(atomicSubmit).total, 7_500);
    const accountantDelete = await command(accountant.token, `/finance/budgets/${draftBudgetId}`, {
      expectedRevision: 2,
      idempotencyKey: `${marker}-budget-legal-delete`,
    }, "DELETE");
    assert.equal(accountantDelete.status, 200);
    assert.equal(accountantDelete.body.deleted, true);

    const dipCreated = await command(manager.token, "/workflows/dips", {
      dip: {
        dt: "2026-10-03",
        rd: { [tankId]: 1_125 },
        lpg: {},
        obs: marker,
      },
      expectedRevision: 0,
      idempotencyKey: `${marker}-dip-create`,
    });
    assert.equal(dipCreated.status, 201);
    const dip = dipCreated.body.dip as JsonRecord;
    const dipId = String(dip.id);
    const duplicateDailyDip = await command(manager.token, "/workflows/dips", {
      dip: {
        dt: "2026-10-03",
        rd: { [tankId]: 1_130 },
        lpg: {},
        obs: `${marker}-duplicate`,
      },
      expectedRevision: 0,
      idempotencyKey: `${marker}-dip-duplicate-date`,
    });
    assert.equal(duplicateDailyDip.status, 409);
    assert.match(String(duplicateDailyDip.body.error), /awaiting MD approval/i);
    for (const [reviewer, token] of [
      ["MD", md.token],
      ["CEO", ceo.token],
      ["Accountant", accountant.token],
      ["CSM", csm.token],
    ] as const) {
      const notifications = await request("/notifications", {}, token);
      assert.equal(notifications.status, 200);
      const rows = notifications.body as unknown as JsonRecord[];
      const dipNotification = rows.find(notification =>
        notification.title === "Tank Dip Awaiting MD Approval" &&
        (notification.data as JsonRecord | undefined)?.dipId === dip.id,
      );
      assert.ok(dipNotification, `expected a tank dip notification for ${reviewer}`);
      assert.equal(dipNotification?.read, false);
      assert.equal(
        (dipNotification?.data as JsonRecord | undefined)?.route,
        "/(app)/tanks",
      );
    }
    const dipApproveBody = {
      expectedRevision: 0,
      idempotencyKey: `${marker}-dip-approve`,
    };
    const dipApproved = await command(md.token, `/workflows/dips/${dipId}/approve`, dipApproveBody);
    assert.equal(dipApproved.status, 200);
    assert.equal((dipApproved.body.dip as JsonRecord).status, "approved");
    const dipReplay = await command(md.token, `/workflows/dips/${dipId}/approve`, dipApproveBody);
    assert.equal(dipReplay.status, 200);
    assert.equal(dipReplay.body.replayed, true);
    const staleDip = await command(md.token, `/workflows/dips/${dipId}/approve`, {
      expectedRevision: 0,
      idempotencyKey: `${marker}-dip-stale`,
    });
    assert.equal(staleDip.status, 409);
    const inventory = await readState("inventoryLog") as JsonRecord[];
    assert.equal(inventory.filter(entry => String(entry.dipId) === dipId && entry.tankId === tankId).length, 1);
    const managerApprovedEdit = await command(manager.token, `/workflows/dips/${dipId}`, {
      dip: { obs: "Manager attempted approved correction" },
      expectedRevision: 1,
      idempotencyKey: `${marker}-dip-approved-manager-edit`,
    }, "PATCH");
    assert.equal(managerApprovedEdit.status, 409);
    const managerApprovedDelete = await command(manager.token, `/workflows/dips/${dipId}`, {
      expectedRevision: 1,
      idempotencyKey: `${marker}-dip-approved-manager-delete`,
    }, "DELETE");
    assert.equal(managerApprovedDelete.status, 409);
    const adminApprovedEdit = await command(admin.token, `/workflows/dips/${dipId}`, {
      dip: { obs: "Admin corrected approved dip" },
      expectedRevision: 1,
      idempotencyKey: `${marker}-dip-approved-admin-edit`,
    }, "PATCH");
    assert.equal(adminApprovedEdit.status, 200);
    assert.equal((adminApprovedEdit.body.dip as JsonRecord).obs, "Admin corrected approved dip");
    assert.equal((adminApprovedEdit.body.dip as JsonRecord).status, "approved");
    const correctedInventory = await readState("inventoryLog") as JsonRecord[];
    const correctedInventoryEntry = correctedInventory.find(entry => String(entry.dipId) === dipId && entry.tankId === tankId);
    assert.equal(correctedInventoryEntry?.actual, 1_125);
    assert.equal(correctedInventoryEntry?.correctedBy, users.admin);
    const adminApprovedDelete = await command(admin.token, `/workflows/dips/${dipId}`, {
      expectedRevision: 2,
      idempotencyKey: `${marker}-dip-approved-admin-delete`,
    }, "DELETE");
    assert.equal(adminApprovedDelete.status, 200);
    assert.equal((adminApprovedDelete.body.dip as JsonRecord).deleted, true);
    const inventoryAfterAdminDelete = await readState("inventoryLog") as JsonRecord[];
    assert.equal(inventoryAfterAdminDelete.some(entry => String(entry.dipId) === dipId), false);

    const proposalCreated = await command(manager.token, "/workflows/price-proposals", {
      proposal: { prod: product, proposedPrice: 725 },
      expectedRevision: 0,
      idempotencyKey: `${marker}-proposal-create`,
    });
    assert.equal(proposalCreated.status, 201);
    const proposal = proposalCreated.body.proposal as JsonRecord;
    assert.equal(proposal.currentPrice, 700);
    const proposalId = String(proposal.id);
    const proposalApproveBody = {
      expectedRevision: 0,
      idempotencyKey: `${marker}-proposal-approve`,
    };
    const proposalApproved = await command(ceo.token, `/workflows/price-proposals/${proposalId}/approve`, proposalApproveBody);
    assert.equal(proposalApproved.status, 200);
    const proposalReplay = await command(ceo.token, `/workflows/price-proposals/${proposalId}/approve`, proposalApproveBody);
    assert.equal(proposalReplay.status, 200);

    const directPriceBody = {
      price: 915,
      reason: "Depot price change",
      branchId: branchA,
      expectedRevision: 0,
      idempotencyKey: randomUUID(),
    };
    const directPrice = await command(manager.token, "/workflows/prices/PMS", directPriceBody);
    assert.equal(directPrice.status, 200);
    assert.equal(
      Number((directPrice.body.prices as { branchPrices?: Record<string, Record<string, number>> }).branchPrices?.[branchA]?.PMS),
      915,
    );
    const directPriceReplay = await command(manager.token, "/workflows/prices/PMS", directPriceBody);
    assert.equal(directPriceReplay.status, 200);
    assert.equal(proposalReplay.body.replayed, true);
    const prices = await readState("prices") as JsonRecord;
    const branchPrices = prices.branchPrices as Record<string, Record<string, number>>;
    assert.equal(branchPrices[branchA][product], 725);
    assert.equal(branchPrices[branchB][product], 620);
    const finalHistory = await readState("priceHistory") as JsonRecord[];
    assert.equal(finalHistory.filter(entry => String(entry.branchId) === branchA && entry.prod === product && entry.newPrice === 725).length, 1);
  } finally {
    await pool.query("BEGIN");
    try {
      for (const key of stateKeys) {
        if (priorState.has(key)) {
          await pool.query(
            "UPDATE app_state SET data = $2::jsonb, updated_at = NOW() WHERE key = $1",
            [key, JSON.stringify(priorState.get(key))],
          );
        } else {
          await pool.query("DELETE FROM app_state WHERE key = $1", [key]);
        }
      }
      await pool.query("DELETE FROM notifications WHERE username = ANY($1::text[])", [
        Object.values(users),
      ]);
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