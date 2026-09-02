import assert from "node:assert/strict";
import test from "node:test";

import {
  createMaintenanceTaskId,
  isAllowedMaintenanceTransition,
  isMaintenanceDecisionRole,
  normalizeMaintenanceRecord,
} from "./maintenance-workflow-rules";

test("creates server-authoritative maintenance task IDs", () => {
  const first = createMaintenanceTaskId(new Date("2026-08-22T00:00:00Z"));
  const second = createMaintenanceTaskId(new Date("2026-08-22T00:00:00Z"));
  assert.match(first, /^MNT-2026-[A-F0-9]{8}$/);
  assert.match(second, /^MNT-2026-[A-F0-9]{8}$/);
  assert.notEqual(first, second);
});

test("limits acknowledgement and assignment decisions to the MD and CEO", () => {
  assert.equal(isMaintenanceDecisionRole("md"), true);
  assert.equal(isMaintenanceDecisionRole("ceo"), true);
  assert.equal(isMaintenanceDecisionRole("admin"), false);
  assert.equal(isMaintenanceDecisionRole("mgr"), false);
  assert.equal(isMaintenanceDecisionRole(undefined), false);
});

test("accepts only valid assigned-work status transitions", () => {
  assert.equal(isAllowedMaintenanceTransition("open", "commenced"), true);
  assert.equal(isAllowedMaintenanceTransition("commenced", "done"), true);
  assert.equal(isAllowedMaintenanceTransition("done", "closed"), true);
  assert.equal(isAllowedMaintenanceTransition("open", "closed"), false);
  assert.equal(isAllowedMaintenanceTransition("closed", "open"), false);
  assert.equal(isAllowedMaintenanceTransition("pending", "open"), false);
  assert.equal(isAllowedMaintenanceTransition("anything", "open"), false);
});

test("upgrades a legacy request into a stable current-workflow record", () => {
  const legacy = {
    by: "Utibe Jimmy",
    id: 1787257032133,
    st: "Open",
    pri: "Urgent",
    date: "2026-08-20",
    title: "Leakage from fuel nozzle need to be change.",
    submittedAt: "2026-08-20T20:17:05.051Z",
  };
  const first = normalizeMaintenanceRecord(legacy);
  const second = normalizeMaintenanceRecord(legacy);

  assert.match(String(first.taskId), /^MNT-2026-[A-F0-9]{8}$/);
  assert.equal(first.status, "open");
  assert.equal(first.submittedBy, "Utibe Jimmy");
  assert.deepEqual(first, second);
  assert.equal((first.history as Array<{ action: string }>)[0].action, "Legacy request imported");
});