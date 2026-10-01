export interface BankLoan {
  bank: string;
  amount: number;
}

export interface FinancialMonthEntry {
  capitalInjection: number;
  bankCharges: number;
  loanPrincipalRepayment: number;
  loanInterest: number;
  customerPaymentsReceived: number;
  customerPaymentsByBranch: Record<string, number>;
  payeProvision: number;
  payeRemitted: number;
  citaProvision: number;
  citaPaid: number;
  startupCapital: number;
  startupCapitalSource: 'admin' | 'rollover';
  closingOperatingCapital?: number;
  finalizedNetProfit?: number;
  finalizedAt?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface FinancialEntry {
  schemaVersion: 4;
  cashInBank: number;
  posValue: number;
  goodsOnTransit: number;
  cashInHand: number;
  debtsFromCustomers: number;
  bankLoans: BankLoan[];
  liabilities: number;
  months: Record<string, FinancialMonthEntry>;
  updatedBy: string;
  updatedAt: string;
}

export type FinancialEntryUpdate = Partial<
  Omit<FinancialEntry, 'months' | 'updatedBy' | 'updatedAt'>
  & Omit<FinancialMonthEntry, 'updatedBy' | 'updatedAt'>
>;

const MONTH_KEY = /^\d{4}-\d{2}$/;

function nonNegative(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function finite(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function financialMonthKey(anchor = new Date()): string {
  return `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`;
}

export function previousFinancialMonthKey(monthKey: string): string {
  if (!MONTH_KEY.test(monthKey)) return '';
  const [year, month] = monthKey.split('-').map(Number);
  return financialMonthKey(new Date(year, month - 2, 15, 12));
}

export function emptyFinancialMonthEntry(overrides: Partial<FinancialMonthEntry> = {}): FinancialMonthEntry {
  return {
    capitalInjection: 0,
    bankCharges: 0,
    loanPrincipalRepayment: 0,
    loanInterest: 0,
    customerPaymentsReceived: 0,
    customerPaymentsByBranch: {},
    payeProvision: 0,
    payeRemitted: 0,
    citaProvision: 0,
    citaPaid: 0,
    startupCapital: 0,
    startupCapitalSource: 'rollover',
    updatedBy: '',
    updatedAt: '',
    ...overrides,
  };
}

function normaliseMonthEntry(value: unknown): FinancialMonthEntry {
  const incoming = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<FinancialMonthEntry>
    : {};
  const rawBranchPayments = incoming.customerPaymentsByBranch && typeof incoming.customerPaymentsByBranch === 'object'
    ? incoming.customerPaymentsByBranch
    : {};
  const customerPaymentsByBranch = Object.fromEntries(
    Object.entries(rawBranchPayments)
      .map(([branchId, amount]) => [branchId, nonNegative(amount)])
      .filter(([branchId]) => Boolean(branchId)),
  );
  return emptyFinancialMonthEntry({
    capitalInjection: nonNegative(incoming.capitalInjection),
    bankCharges: nonNegative(incoming.bankCharges),
    loanPrincipalRepayment: nonNegative(incoming.loanPrincipalRepayment),
    loanInterest: nonNegative(incoming.loanInterest),
    customerPaymentsReceived: nonNegative(incoming.customerPaymentsReceived),
    customerPaymentsByBranch,
    payeProvision: nonNegative(incoming.payeProvision),
    payeRemitted: nonNegative(incoming.payeRemitted),
    citaProvision: nonNegative(incoming.citaProvision),
    citaPaid: nonNegative(incoming.citaPaid),
    startupCapital: finite(incoming.startupCapital),
    startupCapitalSource: incoming.startupCapitalSource === 'admin' ? 'admin' : 'rollover',
    ...(Number.isFinite(Number(incoming.closingOperatingCapital))
      ? { closingOperatingCapital: Number(incoming.closingOperatingCapital) }
      : {}),
    ...(Number.isFinite(Number(incoming.finalizedNetProfit))
      ? { finalizedNetProfit: Number(incoming.finalizedNetProfit) }
      : {}),
    ...(typeof incoming.finalizedAt === 'string' && incoming.finalizedAt
      ? { finalizedAt: incoming.finalizedAt }
      : {}),
    updatedBy: typeof incoming.updatedBy === 'string' ? incoming.updatedBy : '',
    updatedAt: typeof incoming.updatedAt === 'string' ? incoming.updatedAt : '',
  });
}

export const EMPTY_FINANCIAL_ENTRY: FinancialEntry = {
  schemaVersion: 4,
  cashInBank: 0,
  posValue: 0,
  goodsOnTransit: 0,
  cashInHand: 0,
  debtsFromCustomers: 0,
  bankLoans: [],
  liabilities: 0,
  months: {},
  updatedBy: '',
  updatedAt: '',
};

/**
 * Converts the former single-record format into the versioned monthly ledger.
 * A record already rolled into the current month still contains the prior
 * month's manual flows. Those flows are assigned to the prior month and the
 * new month starts at zero. The former `loanInterest` field had been presented
 * as total loan repayment, so it migrates to principal instead of P&L interest.
 */
export function normaliseFinancialEntry(value: unknown, now = new Date()): FinancialEntry {
  const incoming = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawMonths = incoming.months && typeof incoming.months === 'object' && !Array.isArray(incoming.months)
    ? incoming.months as Record<string, unknown>
    : null;
  const months: Record<string, FinancialMonthEntry> = {};

  if (rawMonths) {
    for (const [key, entry] of Object.entries(rawMonths)) {
      if (MONTH_KEY.test(key)) months[key] = normaliseMonthEntry(entry);
    }
  } else if (
    'capitalInjection' in incoming || 'bankCharges' in incoming || 'loanInterest' in incoming
    || 'startupCapitalMonth' in incoming || 'closingOperatingCapital' in incoming
  ) {
    const currentKey = financialMonthKey(now);
    const declaredKey = typeof incoming.startupCapitalMonth === 'string' && MONTH_KEY.test(incoming.startupCapitalMonth)
      ? incoming.startupCapitalMonth
      : currentKey;
    const wasAutomaticallyRolled = incoming.startupCapitalSource === 'rollover' && declaredKey === currentKey;
    const legacyMonthKey = wasAutomaticallyRolled ? previousFinancialMonthKey(currentKey) : declaredKey;
    const closingOperatingCapital = Number.isFinite(Number(incoming.closingOperatingCapital))
      ? Number(incoming.closingOperatingCapital)
      : undefined;
    months[legacyMonthKey] = emptyFinancialMonthEntry({
      capitalInjection: nonNegative(incoming.capitalInjection),
      bankCharges: nonNegative(incoming.bankCharges),
      loanPrincipalRepayment: nonNegative(incoming.loanPrincipalRepayment ?? incoming.loanInterest),
      loanInterest: 0,
      startupCapital: finite(incoming.startupCapital),
      startupCapitalSource: incoming.startupCapitalSource === 'admin' ? 'admin' : 'rollover',
      ...(closingOperatingCapital !== undefined ? { closingOperatingCapital } : {}),
      updatedBy: typeof incoming.updatedBy === 'string' ? incoming.updatedBy : '',
      updatedAt: typeof incoming.updatedAt === 'string' ? incoming.updatedAt : '',
    });
    if (legacyMonthKey !== currentKey) {
      months[currentKey] = emptyFinancialMonthEntry({
        startupCapital: closingOperatingCapital ?? finite(incoming.startupCapital),
        startupCapitalSource: 'rollover',
      });
    }
  }

  return {
    ...EMPTY_FINANCIAL_ENTRY,
    schemaVersion: 4,
    cashInBank: finite(incoming.cashInBank),
    posValue: finite(incoming.posValue),
    goodsOnTransit: finite(incoming.goodsOnTransit),
    cashInHand: finite(incoming.cashInHand),
    debtsFromCustomers: finite(incoming.debtsFromCustomers),
    bankLoans: Array.isArray(incoming.bankLoans)
      ? incoming.bankLoans
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          bank: typeof (item as BankLoan).bank === 'string' ? (item as BankLoan).bank : '',
          amount: nonNegative((item as BankLoan).amount),
        }))
      : [],
    liabilities: nonNegative(incoming.liabilities),
    months,
    updatedBy: typeof incoming.updatedBy === 'string' ? incoming.updatedBy : '',
    updatedAt: typeof incoming.updatedAt === 'string' ? incoming.updatedAt : '',
  };
}

export function getFinancialMonthEntry(entry: FinancialEntry, monthKey: string): FinancialMonthEntry {
  return normaliseMonthEntry(entry.months?.[monthKey]);
}

export function financialEntriesInRange(entry: FinancialEntry, fromDate: string, toDate: string): FinancialMonthEntry[] {
  const fromMonth = fromDate.slice(0, 7);
  const toMonth = toDate.slice(0, 7);
  return Object.entries(entry.months ?? {})
    .filter(([key]) => key >= fromMonth && key <= toMonth)
    .map(([, month]) => normaliseMonthEntry(month));
}

export function cumulativeLoanPrincipalRepaid(entry: FinancialEntry, throughMonth?: string): number {
  return Object.entries(entry.months ?? {})
    .filter(([key]) => !throughMonth || key <= throughMonth)
    .reduce((total, [, month]) => total + nonNegative(month.loanPrincipalRepayment), 0);
}

export function cumulativeCustomerPaymentsReceived(entry: FinancialEntry, throughMonth?: string): number {
  return Object.entries(entry.months ?? {})
    .filter(([key]) => !throughMonth || key <= throughMonth)
    .reduce((total, [, rawMonth]) => {
      const month = normaliseMonthEntry(rawMonth);
      const allocated = Object.values(month.customerPaymentsByBranch).reduce((sum, amount) => sum + nonNegative(amount), 0);
      return total + (allocated > 0 ? allocated : nonNegative(month.customerPaymentsReceived));
    }, 0);
}

export function cumulativeBranchCustomerPaymentsReceived(
  entry: FinancialEntry,
  branchId: string,
  throughMonth?: string,
): number {
  return Object.entries(entry.months ?? {})
    .filter(([key]) => !throughMonth || key <= throughMonth)
    .reduce((total, [, rawMonth]) => total + nonNegative(normaliseMonthEntry(rawMonth).customerPaymentsByBranch[branchId]), 0);
}

export function cumulativeCitaPayable(entry: FinancialEntry, throughMonth?: string): number {
  return Math.max(0, Object.entries(entry.months ?? {})
    .filter(([key]) => !throughMonth || key <= throughMonth)
    .reduce((total, [, rawMonth]) => {
      const month = normaliseMonthEntry(rawMonth);
      return total + month.citaProvision - month.citaPaid;
    }, 0));
}

export function cumulativePayePayable(entry: FinancialEntry, throughMonth?: string): number {
  return Math.max(0, Object.entries(entry.months ?? {})
    .filter(([key]) => !throughMonth || key <= throughMonth)
    .reduce((total, [, rawMonth]) => {
      const month = normaliseMonthEntry(rawMonth);
      return total + month.payeProvision - month.payeRemitted;
    }, 0));
}

function utcDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Allocates monthly finance totals across only the calendar days included in
 * a custom report. Full-month reports retain the exact persisted totals. */
export function financialCostsForDateRange(entry: FinancialEntry, fromDate: string, toDate: string) {
  const start = utcDate(fromDate);
  const end = utcDate(toDate);
  if (!start || !end || start > end) return { bankCharges: 0, loanInterest: 0 };

  let bankCharges = 0;
  let loanInterest = 0;
  for (const [monthKey, rawMonth] of Object.entries(entry.months ?? {})) {
    if (!MONTH_KEY.test(monthKey)) continue;
    const [year, month] = monthKey.split('-').map(Number);
    const monthIndex = month - 1;
    const monthStart = new Date(Date.UTC(year, monthIndex, 1));
    const monthEnd = new Date(Date.UTC(year, monthIndex, daysInUtcMonth(year, monthIndex)));
    const overlapStart = start > monthStart ? start : monthStart;
    const overlapEnd = end < monthEnd ? end : monthEnd;
    if (overlapStart > overlapEnd) continue;
    const includedDays = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86_400_000) + 1;
    const share = includedDays / daysInUtcMonth(year, monthIndex);
    const monthEntry = normaliseMonthEntry(rawMonth);
    bankCharges += monthEntry.bankCharges * share;
    loanInterest += monthEntry.loanInterest * share;
  }
  return { bankCharges, loanInterest };
}
