import assert from "node:assert/strict";
import { test } from "node:test";

import { validatedCreditSaleLines } from "./credit-sales";

const customers = new Map<string, Record<string, unknown>>([
  ["ibom", { id: "ibom", name: "Ibom Air", status: "approved", branchId: "B1" }],
  ["tulcan", { id: "tulcan", name: "Tulcan", status: "approved", branchId: "B1" }],
]);
const base = { unitPrice: 1_000, liters: 500 };

test("accepts several approved customers and uses server-side names", () => {
  const lines = validatedCreditSaleLines({
    ...base,
    creditSales: [
      { customerId: "ibom", customerName: "Spoofed", quantity: 100, amount: 100_000 },
      { customerId: "tulcan", customerName: "Tulcan", quantity: 50, amount: 50_000 },
    ],
  }, 150_000, customers);
  assert.deepEqual(lines?.map(line => [line.customerId, line.customerName, line.amount]), [
    ["ibom", "Ibom Air", 100_000],
    ["tulcan", "Tulcan", 50_000],
  ]);
});

test("rejects customers that are not approved for the branch", () => {
  assert.equal(validatedCreditSaleLines({
    ...base,
    creditSales: [{ customerId: "pending-co", quantity: 10, amount: 10_000 }],
  }, 10_000, customers), null);
});

test("rejects duplicates, mismatched totals, bad prices and excess volume", () => {
  const line = (customerId: string, quantity: number, amount = quantity * 1_000) => ({ customerId, quantity, amount });
  assert.equal(validatedCreditSaleLines({ ...base, creditSales: [line("ibom", 10), line("ibom", 5)] }, 15_000, customers), null);
  assert.equal(validatedCreditSaleLines({ ...base, creditSales: [line("ibom", 10), line("tulcan", 5)] }, 99_000, customers), null);
  assert.equal(validatedCreditSaleLines({ ...base, creditSales: [line("ibom", 10, 1)] }, 1, customers), null);
  assert.equal(validatedCreditSaleLines({ ...base, creditSales: [line("ibom", 400), line("tulcan", 200)] }, 600_000, customers), null);
  assert.equal(validatedCreditSaleLines({ ...base, creditSales: [line("ibom", 10)] }, 0, customers), null);
  assert.equal(validatedCreditSaleLines({ ...base, creditSales: [] }, 5_000, customers), null);
});

test("accepts legacy single-customer reports and no-credit reports", () => {
  assert.deepEqual(validatedCreditSaleLines({ ...base, creditCustomerId: "tulcan" }, 20_000, customers), [
    { customerId: "tulcan", customerName: "Tulcan", quantity: 20, amount: 20_000 },
  ]);
  assert.deepEqual(validatedCreditSaleLines({ ...base }, 0, customers), []);
  assert.equal(validatedCreditSaleLines({ ...base }, 20_000, customers), null);
  assert.equal(validatedCreditSaleLines({ ...base, creditCustomerId: "ibom" }, 0, customers), null);
});
