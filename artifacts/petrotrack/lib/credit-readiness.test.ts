import type { Delivery, Expense, PumpDailyReport } from '@/context/AppContext';
import { normaliseFinancialEntry } from '@/lib/financial-ledger';
import {
  buildCreditReadinessSnapshot,
  estimateIndicativeFacility,
  previousSixFullMonths,
} from '@/lib/credit-readiness';

function report(overrides: Partial<PumpDailyReport> = {}): PumpDailyReport {
  return {
    id: 1,
    date: '2026-05-15',
    pumpId: 'pump-1',
    pumpName: 'Pump 1',
    product: 'PMS',
    branchId: 'branch-1',
    openingMeter: 100,
    closingMeter: 200,
    liters: 100,
    unitPrice: 800,
    grossAmount: 80_000,
    posAmount: 30_000,
    cashAmount: 20_000,
    transferAmount: 30_000,
    creditAmount: 0,
    totalCollected: 80_000,
    variance: 0,
    note: '',
    submittedBy: 'attendant',
    submittedByName: 'Attendant',
    submittedAt: '2026-05-15T12:00:00.000Z',
    status: 'approved',
    ...overrides,
  };
}

function delivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: 1,
    dt: '2026-05-01',
    sup: 'Supplier',
    prod: 'PMS',
    wb: '',
    ord: 1000,
    rec: 1000,
    st: 'ok',
    notes: '',
    costPrice: 600,
    approvalStatus: 'approved',
    branchId: 'branch-1',
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 1,
    dt: '2026-05-15',
    cat: 'Utilities',
    desc: 'Power',
    amt: 5_000,
    by: 'mgr',
    byName: 'Manager',
    status: 'approved',
    budgetId: 1,
    branchId: 'branch-1',
    branchName: 'Station',
    ...overrides,
  };
}

function snapshot(overrides: {
  reports?: PumpDailyReport[];
  deliveries?: Delivery[];
  expenses?: Expense[];
} = {}) {
  return buildCreditReadinessSnapshot({
    reports: overrides.reports ?? [report()],
    deliveries: overrides.deliveries ?? [delivery()],
    expenses: overrides.expenses ?? [expense()],
    startupStocks: [],
    assets: [],
    financialEntry: normaliseFinancialEntry({}),
    citaRate: 0.3,
    now: new Date(2026, 9, 18, 12),
  });
}

describe('credit facility readiness snapshot', () => {
  it('uses the last six complete calendar months', () => {
    expect(previousSixFullMonths(new Date(2026, 9, 18, 12))).toEqual({
      from: '2026-04-01',
      to: '2026-09-30',
    });
    expect(previousSixFullMonths(new Date(2026, 0, 18, 12))).toEqual({
      from: '2025-07-01',
      to: '2025-12-31',
    });
  });

  describe('illustrative facility policy', () => {
    function sixMonthSnapshot(financialEntry = normaliseFinancialEntry({})) {
      const months = ['04', '05', '06', '07', '08', '09'];
      return buildCreditReadinessSnapshot({
        reports: months.map((month, index) => report({
          id: index + 1,
          date: `2026-${month}-15`,
        })),
        deliveries: [delivery({ dt: '2026-03-01' })],
        expenses: months.map((month, index) => expense({
          id: index + 1,
          dt: `2026-${month}-15`,
        })),
        startupStocks: [],
        assets: [],
        financialEntry,
        citaRate: 0.3,
        now: new Date(2026, 9, 18, 12),
      });
    }

    it('estimates a capped, amortizing facility after six complete profitable months', () => {
      const result = estimateIndicativeFacility(sixMonthSnapshot());

      expect(result.reason).toBe('eligible');
      expect(result.amount).toBe(14_000);
      expect(result.monthlyInstalment).toBeLessThanOrEqual(2_625);
      expect(result.totalRepayment).toBeGreaterThan(result.amount!);
      expect(result.estimatedInterest).toBeCloseTo(result.totalRepayment! - result.amount!);
    });

    it('does not estimate a facility with insufficient approved history', () => {
      const snapshot = sixMonthSnapshot();
      const result = estimateIndicativeFacility({
        ...snapshot,
        monthsWithSales: 5,
      });

      expect(result.amount).toBeNull();
      expect(result.reason).toBe('insufficient_history');
    });

    it('reduces repayment capacity by recorded existing principal repayments', () => {
      const financialEntry = normaliseFinancialEntry({
        months: Object.fromEntries(
          ['04', '05', '06', '07', '08', '09'].map(month => [
            `2026-${month}`,
            { loanPrincipalRepayment: 1_000 },
          ]),
        ),
      }, new Date(2026, 9, 18, 12));
      const result = estimateIndicativeFacility(sixMonthSnapshot(financialEntry));

      expect(result.averageMonthlyPrincipalRepayment).toBe(1_000);
      expect(result.monthlyRepaymentCapacity).toBe(1_625);
      expect(result.amount).toBe(8_000);
    });

    it('blocks borrowing estimates for incomplete or unprofitable records', () => {
      const snapshot = sixMonthSnapshot();
      expect(estimateIndicativeFacility({
        ...snapshot,
        incompleteReportCount: 1,
      }).reason).toBe('incomplete_sales_data');

      expect(estimateIndicativeFacility({
        ...snapshot,
        netProfit: -1,
      }).reason).toBe('no_positive_profit');
    });
  });

  it('uses approved records and calculates revenue, COGS and profit transparently', () => {
    const result = snapshot({
      reports: [
        report(),
        report({ id: 2, status: 'pending_manager', grossAmount: 100_000 }),
        report({ id: 3, date: '2026-03-31', grossAmount: 200_000 }),
      ],
      expenses: [
        expense(),
        expense({ id: 2, status: 'pending', amt: 90_000 }),
      ],
    });

    expect(result).toMatchObject({
      approvedReportCount: 1,
      monthsWithSales: 1,
      litersSold: 100,
      revenue: 80_000,
      posReceipts: 30_000,
      bankTransfers: 30_000,
      cashCollected: 20_000,
      creditSales: 0,
      costOfGoods: 60_000,
      grossProfit: 20_000,
      approvedExpenses: 5_000,
      netProfit: 10_500,
    });
  });

  it('withholds gross and net profit when sold products have no known cost', () => {
    const result = snapshot({ deliveries: [] });

    expect(result.costOfGoods).toBeNull();
    expect(result.grossProfit).toBeNull();
    expect(result.netProfit).toBeNull();
    expect(result.missingCostProducts).toEqual(['PMS']);
  });

  it('excludes non-approved deliveries from cost evidence', () => {
    const result = snapshot({
      deliveries: [delivery({ approvalStatus: 'pending_md' })],
    });

    expect(result.grossProfit).toBeNull();
    expect(result.missingCostProducts).toEqual(['PMS']);
  });
});
