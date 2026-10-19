import assert from "node:assert/strict";
import test from "node:test";

import { annualPaye, calculatePay, isPayrollPeriod, monthlyFromAnnualSalaryMeta, splitGross } from "../lib/payrollCalc";

test("PAYE follows the Nigeria Tax Act 2025 bands", () => {
  assert.equal(annualPaye(0), 0);
  assert.equal(annualPaye(800_000), 0);
  assert.equal(annualPaye(3_000_000), 330_000);
  assert.equal(annualPaye(12_000_000), 330_000 + 1_620_000);
  assert.equal(annualPaye(60_000_000), 330_000 + 1_620_000 + 2_730_000 + 5_750_000 + 2_500_000);
});

test("a ₦500,000 monthly gross produces the expected payslip", () => {
  const pay = calculatePay({ ...splitGross(500_000), overtime: 0, bonus: 0, loan: 0, otherDeductions: 0, overrides: {} });
  assert.deepEqual([pay.basic, pay.housing, pay.transport, pay.otherAllowances], [250_000, 125_000, 75_000, 50_000]);
  assert.equal(pay.gross, 500_000);
  assert.equal(pay.pensionEmployee, 36_000);
  assert.equal(pay.pensionEmployer, 45_000);
  assert.equal(pay.nhis, 12_500);
  assert.equal(pay.taxableMonthly, 451_500);
  assert.equal(pay.paye, 63_770);
  assert.equal(pay.totalDeductions, 112_270);
  assert.equal(pay.net, 387_730);
});

test("loans, other deductions and HR overrides flow into net pay", () => {
  const pay = calculatePay({
    ...splitGross(200_000), overtime: 10_000, bonus: 0, loan: 15_000, otherDeductions: 5_000,
    overrides: { paye: 1_000, nhis: 0 },
  });
  assert.equal(pay.gross, 210_000);
  assert.equal(pay.paye, 1_000);
  assert.equal(pay.nhis, 0);
  assert.equal(pay.net, 210_000 - (pay.pensionEmployee + 1_000 + 15_000 + 5_000));
});

test("period and salary helpers", () => {
  assert.ok(isPayrollPeriod("2026-10"));
  assert.ok(!isPayrollPeriod("2026-13"));
  assert.ok(!isPayrollPeriod("Oct 2026"));
  assert.equal(monthlyFromAnnualSalaryMeta(["SALARY:1,200,000"]), 100_000);
  assert.equal(monthlyFromAnnualSalaryMeta(["OTHER"]), 0);
});
