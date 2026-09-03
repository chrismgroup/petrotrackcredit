import assert from "node:assert/strict";
import test from "node:test";
import {
  validatePriceHistoryPayload,
  validatePriceProposalsPayload,
} from "./price-state-validation";
import {
  deletedCompanyAssetIds,
  mergeCompanyAssets,
  removeCompanyAsset,
  upsertCompanyAsset,
  validateCompanyAssetsPayload,
} from "./company-assets-state";

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

test("preserves registered assets when an updated app sends an empty snapshot", () => {
  const existing = [{
    id: "asset-1",
    name: "Generator",
    initialCost: 1_300_000,
    updatedAt: "2026-09-01T08:00:00.000Z",
    futureField: { mustRemainUnchanged: true },
  }];

  assert.deepEqual(mergeCompanyAssets(existing, []), existing);
});

test("preserves exact asset data and ignores changed app snapshots", () => {
  const current = {
    id: "asset-1",
    name: "Updated Generator",
    quantity: 2,
    updatedAt: "2026-09-03T08:00:00.000Z",
    notes: "Keep punctuation & spacing exactly.",
  };
  const stale = {
    id: "asset-1",
    name: "Old Generator",
    quantity: 1,
    updatedAt: "2026-08-20T08:00:00.000Z",
  };

  assert.deepEqual(mergeCompanyAssets([current], [stale]), [current]);
});

test("adds assets through recovery snapshots and updates through explicit upserts", () => {
  const first = { id: "asset-1", name: "Generator", updatedAt: "2026-09-01T08:00:00.000Z" };
  const updated = { ...first, name: "Main Generator", updatedAt: "2026-09-03T08:00:00.000Z" };
  const second = { id: "asset-2", name: "Hilux", updatedAt: "2026-09-03T09:00:00.000Z" };

  assert.deepEqual(mergeCompanyAssets([first], [updated, second]), [first, second]);
  assert.deepEqual(
    upsertCompanyAsset([first, second], updated, "2026-09-03T10:00:00.000Z", "accountant", 0),
    {
      conflict: false,
      assets: [
        { ...second },
        {
          ...updated,
          revision: 1,
          createdBy: "accountant",
          createdAt: "2026-09-03T10:00:00.000Z",
          updatedBy: "accountant",
          updatedAt: "2026-09-03T10:00:00.000Z",
        },
      ],
      asset: {
        ...updated,
        revision: 1,
        createdBy: "accountant",
        createdAt: "2026-09-03T10:00:00.000Z",
        updatedBy: "accountant",
        updatedAt: "2026-09-03T10:00:00.000Z",
      },
    },
  );
  assert.deepEqual(removeCompanyAsset([updated, second], "asset-1"), [second]);
});

test("rejects an edit based on an older server revision", () => {
  const current = {
    id: "asset-1",
    name: "Current Generator",
    revision: 3,
    updatedAt: "2026-09-03T10:00:00.000Z",
  };
  const staleEdit = { ...current, name: "Stale Generator" };
  assert.deepEqual(
    upsertCompanyAsset([current], staleEdit, "2026-09-03T11:00:00.000Z", "accountant", 2),
    { conflict: true, assets: [current] },
  );
});

test("never resurrects deleted asset IDs from stale snapshots", () => {
  const deleted = deletedCompanyAssetIds({ "asset-1": "2026-09-03T10:00:00.000Z" });
  const stale = { id: "asset-1", name: "Generator", updatedAt: "2099-01-01T00:00:00.000Z" };
  assert.deepEqual(mergeCompanyAssets([], [stale], deleted), []);
});

test("rejects malformed asset snapshots before they can replace stored data", () => {
  assert.equal(validateCompanyAssetsPayload(null), "companyAssets must be an array");
  assert.equal(validateCompanyAssetsPayload([{ name: "Generator" }]), "companyAssets[0].id is required");
  assert.equal(
    validateCompanyAssetsPayload([{ id: "same" }, { id: "same" }]),
    "companyAssets[1].id must be unique",
  );
});