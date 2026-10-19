import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

type JsonRecord = Record<string, unknown>;

test("station managers can always submit tank dips with their live branch", {
  concurrency: false,
  skip: !process.env.DATABASE_URL || !process.env.JWT_SECRET,
  timeout: 30_000,
}, async () => {
  const [{ default: app }, { pool }, { invalidateLiveIdentity }] = await Promise.all([
    import("../app"),
    import("@workspace/db"),
    import("../lib/liveIdentity"),
  ]);
  const marker = `dips-${randomUUID()}`;
  const branchId = `${marker}-branch`;
  const namedBranchId = `${marker}-named`;
  const password = `Test-${randomUUID()}`;
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api`;
  const keys = ["branches", "tanks", "lpgTanks", "dips"];
  const prior = new Map<string, unknown>();
  for (const key of keys) {
    const row = await pool.query("SELECT data FROM app_state WHERE key = $1", [key]);
    prior.set(key, row.rowCount ? row.rows[0].data : undefined);
  }
  const list = (key: string) => (Array.isArray(prior.get(key)) ? prior.get(key) as JsonRecord[] : []);
  const putState = (key: string, data: unknown) => pool.query(
    `INSERT INTO app_state (key, data) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [key, JSON.stringify(data)],
  );

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
    return { status: response.status, body: text ? JSON.parse(text) as JsonRecord : {} };
  }
  async function login(username: string) {
    const result = await request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
    assert.equal(result.status, 200);
    return String(result.body.token);
  }
  const submitDip = (token: string, rd: JsonRecord, dt = "2026-10-21") => request("/workflows/dips", {
    method: "POST",
    body: JSON.stringify({ dip: { dt, rd, lpg: {}, obs: marker }, expectedRevision: 0, idempotencyKey: randomUUID() }),
  }, token);

  try {
    await putState("branches", [
      ...list("branches"),
      { id: branchId, name: `${marker} Branch`, st: "Active", mgr: "" },
      { id: namedBranchId, name: `${marker} Named`, st: "Active", mgr: `${marker} Named Manager` },
    ]);
    await putState("tanks", [
      ...list("tanks"),
      { id: `${marker}-t1`, name: "PMS Tank 1", prod: "PMS", cap: 1000, op: 0, rv: 0, sl: 0, branchId },
      { id: `${marker}-t2`, name: "AGO Tank", prod: "AGO", cap: 0, op: 0, rv: 0, sl: 0, branchId },
      { id: `${marker}-t3`, name: "Named Tank", prod: "PMS", cap: 500, op: 0, rv: 0, sl: 0, branchId: namedBranchId },
    ]);
    const inserted = await pool.query(
      `INSERT INTO staff_users (emp_name, username, password, role, status, created_by, approved_by, approved_at)
       VALUES ($1, $2, $3, 'mgr', 'active', $4, $4, NOW()), ($5, $6, $3, 'mgr', 'active', $4, $4, NOW())
       RETURNING id, username`,
      [`${marker} Manager`, `${marker}-mgr`, password, marker, `${marker} Named Manager`, `${marker}-named`],
    );
    assert.equal(inserted.rowCount, 2);

    // Logged in before any branch was assigned: the token carries no branch.
    const staleToken = await login(`${marker}-mgr`);
    const unassigned = await submitDip(staleToken, { [`${marker}-t1`]: 400 });
    assert.equal(unassigned.status, 400);
    assert.match(String(unassigned.body.error), /not assigned to a branch/i);

    // Admin assigns the branch afterwards; the same token must now work.
    await pool.query("UPDATE staff_users SET branch_id = $1 WHERE username = $2", [branchId, `${marker}-mgr`]);
    invalidateLiveIdentity(`${marker}-mgr`);
    const me = await request("/auth/me", {}, staleToken);
    assert.equal(me.status, 200);
    assert.equal(me.body.branchId, branchId);

    const first = await submitDip(staleToken, { [`${marker}-t1`]: 400, [`${marker}-t2`]: 7_000, "removed-tank": 5 });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const firstDip = first.body.dip as JsonRecord;
    assert.equal(firstDip.branchId, branchId);
    assert.deepEqual(firstDip.rd, { [`${marker}-t1`]: 400, [`${marker}-t2`]: 7_000 });

    // A pending dip for the same date never blocks a new one; it is replaced.
    const second = await submitDip(staleToken, { [`${marker}-t1`]: 410 });
    assert.equal(second.status, 201);
    assert.deepEqual(second.body.supersededDipIds, [Number(firstDip.id)]);
    const dips = await pool.query("SELECT data FROM app_state WHERE key = 'dips'");
    const branchDips = (dips.rows[0].data as JsonRecord[]).filter(dip => dip.branchId === branchId);
    assert.equal(branchDips.length, 1);

    const overCapacity = await submitDip(staleToken, { [`${marker}-t1`]: 1_500 }, "2026-10-22");
    assert.equal(overCapacity.status, 400);
    assert.match(String(overCapacity.body.error), /PMS Tank 1.*capacity of 1,000/);

    const otherBranch = await submitDip(staleToken, { [`${marker}-t3`]: 10 }, "2026-10-22");
    assert.equal(otherBranch.status, 400);
    assert.match(String(otherBranch.body.error), /another branch/);

    // A manager only named on the branch record (no account branch) can submit.
    const namedToken = await login(`${marker}-named`);
    const named = await submitDip(namedToken, { [`${marker}-t3`]: 250 });
    assert.equal(named.status, 201, JSON.stringify(named.body));
    assert.equal((named.body.dip as JsonRecord).branchId, namedBranchId);
  } finally {
    await pool.query("DELETE FROM staff_users WHERE created_by = $1", [marker]);
    for (const key of keys) {
      const data = prior.get(key);
      if (data === undefined) await pool.query("DELETE FROM app_state WHERE key = $1", [key]);
      else await putState(key, data);
    }
    invalidateLiveIdentity();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
