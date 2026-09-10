import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

type JsonRecord = Record<string, unknown>;

test("HR shares full user lifecycle control with Admin", {
  concurrency: false,
  skip: !process.env.DATABASE_URL || !process.env.JWT_SECRET,
  timeout: 30_000,
}, async () => {
  const [{ default: app }, { pool }] = await Promise.all([
    import("../app"),
    import("@workspace/db"),
  ]);
  const marker = `users-${randomUUID()}`;
  const branchId = `${marker}-branch`;
  const branchName = `${marker} Branch`;
  const transferBranchId = `${marker}-transfer`;
  const transferBranchName = `${marker} Transfer Branch`;
  const permanentStaffId = `GS-${marker}`;
  const hrUsername = `${marker}-hr`;
  const password = `Test-${randomUUID()}`;
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api`;
  const priorBranches = await pool.query("SELECT data FROM app_state WHERE key = 'branches'");
  const existingBranches = Array.isArray(priorBranches.rows[0]?.data) ? priorBranches.rows[0].data : [];

  async function request(path: string, options: RequestInit = {}, token?: string) {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) as JsonRecord : {},
    };
  }

  try {
    await pool.query(
      `INSERT INTO app_state (key, data) VALUES ('branches', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [JSON.stringify([
        ...existingBranches,
        { id: branchId, name: branchName, st: "Active" },
        { id: transferBranchId, name: transferBranchName, st: "Active" },
      ])],
    );
    const inserted = await pool.query(
      `INSERT INTO staff_users (
        emp_name, username, password, role, status, created_by, approved_by, approved_at
      ) VALUES ($1, $2, $3, 'csm', 'active', $2, $2, NOW()) RETURNING id`,
      [`${marker} HR`, hrUsername, password],
    );
    const hrId = Number(inserted.rows[0].id);
    const login = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: hrUsername, password }),
    });
    assert.equal(login.status, 200);
    const token = String(login.body.token);

    const created = await request("/users", {
      method: "POST",
      body: JSON.stringify({
        empName: `${marker} Staff`,
        empId: permanentStaffId,
        username: `${marker}-staff`,
        password,
        role: "att",
        branchId,
        status: "active",
      }),
    }, token);
    assert.equal(created.status, 201);
    assert.equal(created.body.empId, permanentStaffId);
    assert.equal(created.body.branchName, branchName);
    const userId = Number(created.body.id);

    const updated = await request(`/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ role: "mgr", branchId: transferBranchId }),
    }, token);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.role, "mgr");
    assert.equal(updated.body.empId, permanentStaffId);
    assert.equal(updated.body.branchId, transferBranchId);
    assert.equal(updated.body.branchName, transferBranchName);

    const changedStaffId = await request(`/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ empId: `${permanentStaffId}-changed` }),
    }, token);
    assert.equal(changedStaffId.status, 409);
    assert.match(String(changedStaffId.body.error), /permanent/i);

    const duplicateStaffId = await request("/users", {
      method: "POST",
      body: JSON.stringify({
        empName: `${marker} Duplicate`,
        empId: permanentStaffId,
        username: `${marker}-duplicate`,
        password,
        role: "att",
        branchId,
        status: "active",
      }),
    }, token);
    assert.equal(duplicateStaffId.status, 409);

    const suspended = await request(`/users/${userId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "suspended" }),
    }, token);
    assert.equal(suspended.status, 200);
    assert.equal(suspended.body.status, "suspended");

    const reactivated = await request(`/users/${userId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    }, token);
    assert.equal(reactivated.status, 200);
    assert.equal(reactivated.body.status, "active");

    const deleted = await request(`/users/${userId}`, { method: "DELETE" }, token);
    assert.equal(deleted.status, 200);

    const selfDelete = await request(`/users/${hrId}`, { method: "DELETE" }, token);
    assert.equal(selfDelete.status, 400);
    assert.match(String(selfDelete.body.error), /currently using/i);
  } finally {
    await pool.query("DELETE FROM staff_users WHERE username LIKE $1", [`${marker}%`]);
    if (priorBranches.rowCount) {
      await pool.query("UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE key = 'branches'", [JSON.stringify(existingBranches)]);
    } else {
      await pool.query("DELETE FROM app_state WHERE key = 'branches'");
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});