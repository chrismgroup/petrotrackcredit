import assert from "node:assert/strict";
import test from "node:test";

import {
  createMaintenanceTaskId,
  isAllowedMaintenanceTransition,
  isMaintenanceDecisionRole,
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