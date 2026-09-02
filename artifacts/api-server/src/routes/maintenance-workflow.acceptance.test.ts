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

type MaintenanceRecord = {
  taskId: string;
  title: string;
  status: string;
  acknowledgedBy?: string;
  assignedTo?: string;
  history: Array<{ action: string; actor: string; detail?: string }>;
};

test("completes the credentialed requester, MD, CEO, manager, and assignee handoffs", {
  skip: !process.env.DATABASE_URL || !process.env.JWT_SECRET,
  timeout: 30_000,
}, async () => {
  const [{ default: app }, { pool }] = await Promise.all([
    import("../app"),
    import("@workspace/db"),
  ]);
  const marker = `maintenance-acceptance-${randomUUID()}`;
  const password = `Test-${randomUUID()}`;
  const usernames = {
    requester: `${marker}-requester`,
    md: `${marker}-md`,
    ceo: `${marker}-ceo`,
    manager: `${marker}-manager`,
    assignee: `${marker}-assignee`,
  };
  const createdTaskIds: string[] = [];
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

  async function createTask(token: string, title: string): Promise<MaintenanceRecord> {
    const result = await request<{ maintenance: MaintenanceRecord }>("/maintenance", {
      method: "POST",
      body: JSON.stringify({ title, pri: "Urgent", date: "2026-09-01" }),
    }, token);
    assert.equal(result.status, 201);
    assert.match(result.body.maintenance.taskId, /^MNT-\d{4}-[A-F0-9]{8}$/);
    createdTaskIds.push(result.body.maintenance.taskId);
    return result.body.maintenance;
  }

  try {
    const fixtures = [
      ["Maintenance Requester", usernames.requester, "att"],
      ["Maintenance MD", usernames.md, "md"],
      ["Maintenance CEO", usernames.ceo, "ceo"],
      ["Maintenance Manager", usernames.manager, "mgr"],
      ["Maintenance Assignee", usernames.assignee, "att"],
    ];
    for (const [empName, username, role] of fixtures) {
      await pool.query(`
        INSERT INTO staff_users (
          emp_name, username, password, role, status,
          created_by, approved_by, approved_at
        )
        VALUES ($1, $2, $3, $4, 'active', $5, $5, NOW())
      `, [empName, username, password, role, marker]);
    }

    const [requester, md, ceo, manager, assignee] = await Promise.all([
      login(usernames.requester),
      login(usernames.md),
      login(usernames.ceo),
      login(usernames.manager),
      login(usernames.assignee),
    ]);
    assert.equal(requester.role, "att");
    assert.equal(md.role, "md");
    assert.equal(ceo.role, "ceo");
    assert.equal(manager.role, "mgr");
    assert.equal(assignee.role, "att");

    const first = await createTask(requester.token, `${marker} MD to CEO handoff`);
    assert.equal(first.history[0]?.action, "Request submitted");
    assert.equal(first.history[0]?.actor, usernames.requester);

    const managerAcknowledge = await request<{ error: string }>(
      `/maintenance/${first.taskId}/acknowledge`,
      { method: "POST", body: "{}" },
      manager.token,
    );
    assert.equal(managerAcknowledge.status, 403);
    assert.match(managerAcknowledge.body.error, /Only the MD or CEO/);

    const managerAssign = await request<{ error: string }>(
      `/maintenance/${first.taskId}/assign`,
      { method: "POST", body: JSON.stringify({ username: usernames.assignee }) },
      manager.token,
    );
    assert.equal(managerAssign.status, 403);
    assert.match(managerAssign.body.error, /Only the MD or CEO/);

    const acknowledged = await request<{ maintenance: MaintenanceRecord }>(
      `/maintenance/${first.taskId}/acknowledge`,
      { method: "POST", body: "{}" },
      md.token,
    );
    assert.equal(acknowledged.status, 200);
    assert.equal(acknowledged.body.maintenance.acknowledgedBy, usernames.md);

    const assigned = await request<{ maintenance: MaintenanceRecord }>(
      `/maintenance/${first.taskId}/assign`,
      { method: "POST", body: JSON.stringify({ username: usernames.assignee }) },
      ceo.token,
    );
    assert.equal(assigned.status, 200);
    assert.equal(assigned.body.maintenance.assignedTo, usernames.assignee);

    const unassignedStatus = await request<{ error: string }>(
      `/maintenance/${first.taskId}/status`,
      { method: "POST", body: JSON.stringify({ status: "commenced" }) },
      requester.token,
    );
    assert.equal(unassignedStatus.status, 403);
    assert.match(unassignedStatus.body.error, /Only the assigned staff member/);

    for (const status of ["commenced", "done", "closed"]) {
      const updated = await request<{ maintenance: MaintenanceRecord }>(
        `/maintenance/${first.taskId}/status`,
        { method: "POST", body: JSON.stringify({ status }) },
        assignee.token,
      );
      assert.equal(updated.status, 200);
      assert.equal(updated.body.maintenance.status, status);
    }

    const requesterNotifications = await request<Array<{ title: string; data: { taskId?: string } }>>(
      "/notifications",
      {},
      requester.token,
    );
    assert.equal(requesterNotifications.status, 200);
    assert.ok(requesterNotifications.body.some(item =>
      item.title === "Maintenance request received" && item.data?.taskId === first.taskId
    ));

    const assigneeNotifications = await request<Array<{ title: string; data: { taskId?: string } }>>(
      "/notifications",
      {},
      assignee.token,
    );
    assert.equal(assigneeNotifications.status, 200);
    assert.ok(assigneeNotifications.body.some(item =>
      item.title === "Maintenance task assigned" && item.data?.taskId === first.taskId
    ));

    const afterReload = await request<MaintenanceRecord[]>("/maintenance", {}, requester.token);
    assert.equal(afterReload.status, 200);
    const reloaded = afterReload.body.find(item => item.taskId === first.taskId);
    assert.ok(reloaded);
    assert.equal(reloaded.status, "closed");
    assert.deepEqual(reloaded.history.map(entry => entry.action), [
      "Request submitted",
      "Receipt acknowledged",
      "Task assigned",
      "Status updated",
      "Status updated",
      "Status updated",
    ]);

    const second = await createTask(requester.token, `${marker} CEO to MD handoff`);
    const ceoAcknowledged = await request<{ maintenance: MaintenanceRecord }>(
      `/maintenance/${second.taskId}/acknowledge`,
      { method: "POST", body: "{}" },
      ceo.token,
    );
    assert.equal(ceoAcknowledged.status, 200);
    assert.equal(ceoAcknowledged.body.maintenance.acknowledgedBy, usernames.ceo);

    const mdAssigned = await request<{ maintenance: MaintenanceRecord }>(
      `/maintenance/${second.taskId}/assign`,
      { method: "POST", body: JSON.stringify({ username: usernames.assignee }) },
      md.token,
    );
    assert.equal(mdAssigned.status, 200);
    assert.equal(mdAssigned.body.maintenance.assignedTo, usernames.assignee);
  } finally {
    await pool.query("BEGIN");
    try {
      for (const taskId of createdTaskIds) {
        await pool.query(`
          UPDATE app_state
          SET data = COALESCE((
            SELECT jsonb_agg(item)
            FROM jsonb_array_elements(data) item
            WHERE item->>'taskId' <> $1
          ), '[]'::jsonb)
          WHERE key = 'maintenance'
        `, [taskId]);
        await pool.query(`
          UPDATE app_state
          SET data = COALESCE((
            SELECT jsonb_agg(item)
            FROM jsonb_array_elements(data) item
            WHERE item->>'detail' NOT LIKE $1
          ), '[]'::jsonb)
          WHERE key = 'audit'
        `, [`${taskId}%`]);
      }
      await pool.query(
        "DELETE FROM notifications WHERE username = ANY($1::text[])",
        [Object.values(usernames)],
      );
      await pool.query(
        "DELETE FROM notification_tokens WHERE username = ANY($1::text[])",
        [Object.values(usernames)],
      );
      await pool.query(
        "DELETE FROM staff_users WHERE created_by = $1",
        [marker],
      );
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