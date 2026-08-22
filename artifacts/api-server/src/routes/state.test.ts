import assert from "node:assert/strict";
import test from "node:test";
import {
  validatePriceHistoryPayload,
  validatePriceProposalsPayload,
} from "./price-state-validation";

test("accepts valid price history records, including a zero baseline", () => {
  assert.equal(
    validatePriceHistoryPayload([
      {
        id: 1,
        prod: "PMS",
        oldPrice: 0,
        newPrice: 850,
        by: "manager",
        dt: "2026-08-22T10:00:00.000Z",
        branchId: "B1",
      },
    ]),
    null,
  );
});

test("accepts valid price proposals", () => {
  assert.equal(
    validatePriceProposalsPayload([
      {
        id: 1,
        prod: "LPG",
        currentPrice: 700,
        proposedPrice: 750,
        proposedBy: "attendant",
        proposedAt: "2026-08-22T10:00:00.000Z",
        status: "pending",
        branchId: "B1",
      },
    ]),
    null,
  );
});

test("rejects malformed price history records", () => {
  const malformedRecords = [
    { prod: "", oldPrice: 100, newPrice: 110, by: "manager" },
    { prod: "PMS", oldPrice: 100, newPrice: 110, by: " " },
    { prod: "PMS", oldPrice: Number.NaN, newPrice: 110, by: "manager" },
    { prod: "PMS", oldPrice: 100, newPrice: 0, by: "manager" },
    { prod: "PMS", oldPrice: 100, newPrice: Number.POSITIVE_INFINITY, by: "manager" },
    { prod: "PMS", oldPrice: "100", newPrice: 110, by: "manager" },
  ];

  for (const record of malformedRecords) {
    assert.match(
      validatePriceHistoryPayload([record]) ?? "",
      /^priceHistory\[0\]\./,
    );
  }
});

test("rejects malformed price proposals", () => {
  const malformedRecords = [
    { prod: "", currentPrice: 100, proposedPrice: 110, proposedBy: "attendant" },
    { prod: "PMS", currentPrice: 100, proposedPrice: 110, proposedBy: null },
    { prod: "PMS", currentPrice: Number.NEGATIVE_INFINITY, proposedPrice: 110, proposedBy: "attendant" },
    { prod: "PMS", currentPrice: 100, proposedPrice: 0, proposedBy: "attendant" },
    { prod: "PMS", currentPrice: 100, proposedPrice: Number.NaN, proposedBy: "attendant" },
    { prod: "PMS", currentPrice: "100", proposedPrice: 110, proposedBy: "attendant" },
  ];

  for (const record of malformedRecords) {
    assert.match(
      validatePriceProposalsPayload([record]) ?? "",
      /^priceProposals\[0\]\./,
    );
  }
});

test("rejects non-array price state payloads", () => {
  assert.equal(
    validatePriceHistoryPayload({ prod: "PMS" }),
    "priceHistory must be an array",
  );
  assert.equal(
    validatePriceProposalsPayload(null),
    "priceProposals must be an array",
  );
});