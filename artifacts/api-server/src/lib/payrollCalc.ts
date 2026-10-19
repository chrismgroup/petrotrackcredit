/**
 * Monthly payroll calculation for Nigeria.
 *
 * PAYE follows the Nigeria Tax Act 2025 personal income tax bands (effective
 * 1 January 2026). The consolidated relief allowance no longer exists; the
 * employee's pension and NHIS contributions are deducted before tax.
 * Pension (Pension Reform Act 2014) is 8% employee / 10% employer of basic +
 * housing + transport. NHIS is 5% of basic for the employee.
 */

export const PAYE_BANDS: ReadonlyArray<{ upTo: number; rate: number }> = [
  { upTo: 800_000, rate: 0 },
  { upTo: 3_000_000, rate: 0.15 },
  { upTo: 12_000_000, rate: 0.18 },
  { upTo: 25_000_000, rate: 0.21 },
  { upTo: 50_000_000, rate: 0.23 },
  { upTo: Infinity, rate: 0.25 },
];

export const PENSION_EMPLOYEE_RATE = 0.08;
export const PENSION_EMPLOYER_RATE = 0.1;
export const NHIS_EMPLOYEE_RATE = 0.05;
export const DEFAULT_SPLIT = { basic: 0.5, housing: 0.25, transport: 0.15, otherAllowances: 0.1 } as const;

export const EARNING_FIELDS = ["basic", "housing", "transport", "otherAllowances", "overtime", "bonus"] as const;
export const OVERRIDABLE_FIELDS = ["pensionEmployee", "nhis", "paye"] as const;
export type EarningField = typeof EARNING_FIELDS[number];
export type OverridableField = typeof OVERRIDABLE_FIELDS[number];

export interface PayInput {
  basic: number;
  housing: number;
  transport: number;
  otherAllowances: number;
  overtime: number;
  bonus: number;
  loan: number;
  otherDeductions: number;
  /** Amounts HR typed in by hand; anything absent is calculated. */
  overrides?: Partial<Record<OverridableField, number>>;
}

export interface PayResult extends PayInput {
  gross: number;
  pensionEmployee: number;
  pensionEmployer: number;
  nhis: number;
  taxableMonthly: number;
  paye: number;
  totalDeductions: number;
  net: number;
}

export const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export function annualPaye(taxableAnnual: number): number {
  let remaining = Math.max(0, taxableAnnual);
  let lower = 0;
  let tax = 0;
  for (const band of PAYE_BANDS) {
    if (remaining <= 0) break;
    const width = band.upTo - lower;
    const portion = Math.min(remaining, width);
    tax += portion * band.rate;
    remaining -= portion;
    lower = band.upTo;
  }
  return round2(tax);
}

export function splitGross(monthlyGross: number) {
  const gross = Math.max(0, Number(monthlyGross) || 0);
  const basic = round2(gross * DEFAULT_SPLIT.basic);
  const housing = round2(gross * DEFAULT_SPLIT.housing);
  const transport = round2(gross * DEFAULT_SPLIT.transport);
  return { basic, housing, transport, otherAllowances: round2(gross - basic - housing - transport) };
}

export function calculatePay(input: PayInput): PayResult {
  const money = (value: unknown) => Math.max(0, round2(Number(value) || 0));
  const earnings = Object.fromEntries(EARNING_FIELDS.map(field => [field, money(input[field])])) as Record<EarningField, number>;
  const overrides: Partial<Record<OverridableField, number>> = {};
  for (const field of OVERRIDABLE_FIELDS) {
    const value = input.overrides?.[field];
    if (value !== undefined && value !== null && Number.isFinite(Number(value))) overrides[field] = money(value);
  }
  const gross = round2(EARNING_FIELDS.reduce((sum, field) => sum + earnings[field], 0));
  const pensionable = earnings.basic + earnings.housing + earnings.transport;
  const pensionEmployee = overrides.pensionEmployee ?? round2(pensionable * PENSION_EMPLOYEE_RATE);
  const pensionEmployer = round2(pensionable * PENSION_EMPLOYER_RATE);
  const nhis = overrides.nhis ?? round2(earnings.basic * NHIS_EMPLOYEE_RATE);
  const taxableMonthly = round2(Math.max(0, gross - pensionEmployee - nhis));
  const paye = overrides.paye ?? round2(annualPaye(taxableMonthly * 12) / 12);
  const loan = money(input.loan);
  const otherDeductions = money(input.otherDeductions);
  const totalDeductions = round2(pensionEmployee + nhis + paye + loan + otherDeductions);
  return {
    ...earnings,
    loan,
    otherDeductions,
    overrides,
    gross,
    pensionEmployee,
    pensionEmployer,
    nhis,
    taxableMonthly,
    paye,
    totalDeductions,
    net: round2(gross - totalDeductions),
  };
}

export function isPayrollPeriod(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Monthly gross from HR enrollment ("SALARY:1,200,000" is an annual figure). */
export function monthlyFromAnnualSalaryMeta(docs: unknown): number {
  if (!Array.isArray(docs)) return 0;
  const meta = docs.find(item => typeof item === "string" && item.startsWith("SALARY:"));
  if (typeof meta !== "string") return 0;
  const annual = Number(meta.slice("SALARY:".length).replace(/[^\d.]/g, ""));
  return Number.isFinite(annual) && annual > 0 ? round2(annual / 12) : 0;
}
