import assert from "node:assert/strict";
import test from "node:test";
import { mergeWorkflowRecords } from "./workflow-record-merge";

test("keeps an approved delivery when a stale device sends its pending copy", () => {
  const approved = { id: "delivery-1", approvalStatus: "md_approved", workflowVersion: 3 };
  const stale = { id: "delivery-1", approvalStatus: "pending_md", workflowVersion: 2 };
  assert.deepEqual(mergeWorkflowRecords([approved], [stale], "deliveries"), [approved]);
});

test("keeps a returned delivery and accepts the originator's newer correction", () => {
  const returned = { id: "delivery-1", approvalStatus: "returned", workflowVersion: 3 };
  const stale = { id: "delivery-1", approvalStatus: "pending_md", workflowVersion: 2 };
  const corrected = { id: "delivery-1", approvalStatus: "pending_acc", workflowVersion: 4 };
  assert.deepEqual(mergeWorkflowRecords([returned], [stale], "deliveries"), [returned]);
  assert.deepEqual(mergeWorkflowRecords([returned], [corrected], "deliveries"), [corrected]);
});

test("keeps an approved expense when a stale device sends a pending copy", () => {
  const approved = { id: 7, status: "approved", revision: 3 };
  const stale = { id: 7, status: "pending", revision: 1 };
  assert.deepEqual(mergeWorkflowRecords([approved], [stale], "expenses"), [approved]);
});

test("does not resurrect an explicitly deleted workflow record", () => {
  const stale = { id: "delivery-1", approvalStatus: "draft", workflowVersion: 0 };
  const tombstone = { id: "delivery-1", workflowVersion: 0, deletedAt: "2026-09-08T12:00:00.000Z" };
  assert.deepEqual(mergeWorkflowRecords([], [stale], "deliveries", [tombstone]), []);
});