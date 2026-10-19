import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

type JsonRecord = Record<string, any>;

test("HR prepares payroll, Accountant reviews, MD releases and staff download payslips", {
  concurrency: false,
  skip: !process.env.DATABASE_URL || !process.env.JWT_SECRET,
  timeout: 30_000,
}, async () => {
  const [{ default: app }, { pool }, { invalidateLiveIdentity }] = await Promise.all([
    import("../app"),
    import("@workspace/db"),
    import("../lib/liveIdentity"),
  ]);
  const marker = `payroll-${randomUUID().slice(0, 8)}`;
  const password = `Test-${randomUUID()}`;
  const period = `20${90 + Math.floor(Math.random() * 10)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}`;
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api`;

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
  const post = (path: string, body: unknown, token: string) => request(path, { method: "POST", body: JSON.stringify(body) }, token);
  const patch = (path: string, body: unknown, token: string) => request(path, { method: "PATCH", body: JSON.stringify(body) }, token);
  async function login(username: string) {
    const result = await request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return String(result.body.token);
  }

  try {
    await pool.query(`DELETE FROM payroll_runs WHERE period = $1 AND created_by LIKE 'payroll-%'`, [period]).catch(() => undefined);
    for (const [suffix, role, docs] of [
      ["hr", "csm", []], ["acc", "acc", []], ["md", "md", []], ["att", "att", ["SALARY:6,000,000"]],
    ] as const) {
      await pool.query(
        `INSERT INTO staff_users (emp_name, username, password, role, status, employment_docs, created_by, approved_by, approved_at)
         VALUES ($1, $2, $3, $4, 'active', $5::jsonb, $6, $6, NOW())`,
        [`${marker} ${suffix}`, `${marker}-${suffix}`, password, role, JSON.stringify(docs), marker],
      );
    }
    invalidateLiveIdentity();
    const [hr, acc, md, att] = await Promise.all(["hr", "acc", "md", "att"].map(s => login(`${marker}-${s}`)));

    assert.equal((await request("/payroll/runs", {}, att)).status, 403, "attendants cannot see payroll");
    assert.equal((await post("/payroll/runs", { period }, acc)).status, 403, "only HR generates payroll");
    assert.equal((await post("/payroll/runs", { period: "October" }, hr)).status, 400);

    const created = await post("/payroll/runs", { period }, hr);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const runId = created.body.run.id;
    assert.equal(created.body.run.status, "draft");
    assert.equal((await post("/payroll/runs", { period }, hr)).status, 409, "one payroll per month");

    const mine = created.body.entries.find((e: JsonRecord) => e.username === `${marker}-att`);
    assert.ok(mine, "every active user gets a payslip");
    assert.equal(mine.gross, 500_000, "annual enrollment salary becomes monthly gross");
    assert.equal(mine.net, 387_730);

    const edited = await patch(`/payroll/runs/${runId}/entries/${mine.id}`, {
      overtime: 20_000, loan: 10_000, bankName: "Access Bank", accountNumber: "0123456789",
    }, hr);
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.entry.gross, 520_000);
    assert.equal(edited.body.entry.version, 1, "draft edits do not create revisions");
    assert.equal((await patch(`/payroll/runs/${runId}/entries/${mine.id}`, { loan: 10_000_000 }, hr)).status, 400, "net pay cannot go negative");

    const added = await post(`/payroll/runs/${runId}/entries`, { empName: `${marker} casual`, monthlyGross: 80_000 }, hr);
    assert.equal(added.status, 201);
    assert.equal(added.body.entry.gross, 80_000);

    assert.equal((await post(`/payroll/runs/${runId}/approve`, {}, acc)).status, 403, "draft cannot be approved");
    assert.equal((await post(`/payroll/runs/${runId}/submit`, {}, hr)).status, 200);
    assert.equal((await patch(`/payroll/runs/${runId}/entries/${mine.id}`, { bonus: 1 }, hr)).status, 409, "no edits under review");
    assert.equal((await post(`/payroll/runs/${runId}/approve`, {}, md)).status, 403, "MD waits for the Accountant");
    assert.equal((await post(`/payroll/runs/${runId}/return`, {}, acc)).status, 400, "returns need a reason");
    assert.equal((await post(`/payroll/runs/${runId}/return`, { note: "Fix overtime" }, acc)).status, 200);
    assert.equal((await patch(`/payroll/runs/${runId}/entries/${mine.id}`, { overtime: 25_000 }, hr)).status, 200);
    assert.equal((await post(`/payroll/runs/${runId}/submit`, {}, hr)).status, 200);
    assert.equal((await post(`/payroll/runs/${runId}/approve`, {}, acc)).status, 200);
    assert.equal((await request("/payroll/my-payslips", {}, att)).body.payslips.filter((p: JsonRecord) => p.period === period).length, 0, "not visible before MD approval");
    const released = await post(`/payroll/runs/${runId}/approve`, {}, md);
    assert.equal(released.status, 200);
    assert.equal(released.body.run.status, "released");

    const slips = await request("/payroll/my-payslips", {}, att);
    const slip = slips.body.payslips.find((p: JsonRecord) => p.period === period);
    assert.ok(slip);
    assert.equal(slip.gross, 525_000);
    assert.equal(slip.bankName, "Access Bank");
    assert.equal((await request(`/payroll/payslips/${slip.id}`, {}, att)).status, 200);
    const hrSlip = created.body.entries.find((e: JsonRecord) => e.username === `${marker}-hr`);
    assert.equal((await request(`/payroll/payslips/${hrSlip.id}`, {}, att)).status, 404, "staff cannot open other payslips");

    assert.equal((await patch(`/payroll/runs/${runId}/entries/${mine.id}`, { bonus: 5_000 }, hr)).status, 400, "released edits need a reason");
    const revised = await patch(`/payroll/runs/${runId}/entries/${mine.id}`, { bonus: 5_000, reason: "Performance bonus omitted" }, hr);
    assert.equal(revised.status, 200);
    assert.equal(revised.body.revised, true);
    assert.equal(revised.body.entry.version, 2);
    const revisions = await request(`/payroll/entries/${mine.id}/revisions`, {}, hr);
    assert.equal(revisions.body.revisions.length, 1);
    assert.equal(revisions.body.revisions[0].snapshot.gross, 525_000);
    const notes = await pool.query(`SELECT title FROM notifications WHERE username = $1 ORDER BY id`, [`${marker}-att`]);
    assert.deepEqual(notes.rows.map(r => r.title), ["Your Payslip Is Ready", "Payslip Revised"]);

    assert.equal((await request(`/payroll/runs/${runId}`, { method: "DELETE" }, hr)).status, 409, "released payroll is kept");
  } finally {
    await pool.query(`DELETE FROM payroll_runs WHERE period = $1 AND created_by = $2`, [period, `${marker}-hr`]).catch(() => undefined);
    await pool.query(`DELETE FROM notifications WHERE username LIKE $1`, [`${marker}-%`]).catch(() => undefined);
    await pool.query("DELETE FROM staff_users WHERE created_by = $1", [marker]);
    invalidateLiveIdentity();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
