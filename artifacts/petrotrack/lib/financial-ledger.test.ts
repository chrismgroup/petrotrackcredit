import {
  cumulativeCustomerPaymentsReceived,
  cumulativeBranchCustomerPaymentsReceived,
  cumulativeCitaPayable,
  cumulativePayePayable,
  cumulativeLoanPrincipalRepaid,
  financialEntriesInRange,
  financialCostsForDateRange,
  getFinancialMonthEntry,
  normaliseFinancialEntry,
} from './financial-ledger';

describe('monthly financial ledger', () => {
  it('migrates a carried legacy repayment into the prior month as principal', () => {
    const ledger = normaliseFinancialEntry({
      cashInBank: 500_000,
      bankLoans: [{ bank: 'Test Bank', amount: 10_000_000 }],
      capitalInjection: 250_000,
      bankCharges: 12_000,
      loanInterest: 6_364_164,
      startupCapital: -8_622_377.907,
      startupCapitalMonth: '2026-10',
      startupCapitalSource: 'rollover',
      closingOperatingCapital: -8_622_377.907,
    }, new Date('2026-10-01T12:00:00'));

    const september = getFinancialMonthEntry(ledger, '2026-09');
    const october = getFinancialMonthEntry(ledger, '2026-10');

    expect(september.loanPrincipalRepayment).toBe(6_364_164);
    expect(september.loanInterest).toBe(0);
    expect(september.bankCharges).toBe(12_000);
    expect(october.loanPrincipalRepayment).toBe(0);
    expect(october.loanInterest).toBe(0);
    expect(october.bankCharges).toBe(0);
    expect(october.startupCapital).toBe(-8_622_377.907);
  });

  it('keeps monthly finance costs and finalized results isolated by month', () => {
    const ledger = normaliseFinancialEntry({
      months: {
        '2026-09': {
          bankCharges: 10_000,
          loanPrincipalRepayment: 500_000,
          loanInterest: 40_000,
          customerPaymentsReceived: 300_000,
          payeProvision: 75_000,
          finalizedNetProfit: -8_622_377.907,
        },
        '2026-10': {
          bankCharges: 2_000,
          loanPrincipalRepayment: 100_000,
          loanInterest: 5_000,
        },
      },
    });

    expect(getFinancialMonthEntry(ledger, '2026-09').finalizedNetProfit).toBe(-8_622_377.907);
    expect(getFinancialMonthEntry(ledger, '2026-10').loanInterest).toBe(5_000);
    expect(financialEntriesInRange(ledger, '2026-10-01', '2026-10-31')).toHaveLength(1);
    expect(cumulativeLoanPrincipalRepaid(ledger, '2026-10')).toBe(600_000);
    expect(cumulativeCustomerPaymentsReceived(ledger, '2026-09')).toBe(300_000);
    expect(getFinancialMonthEntry(ledger, '2026-09').payeProvision).toBe(75_000);
  });

  it('prorates monthly finance costs for partial-period reports', () => {
    const ledger = normaliseFinancialEntry({
      months: {
        '2026-10': { bankCharges: 31_000, loanInterest: 62_000 },
      },
    });

    expect(financialCostsForDateRange(ledger, '2026-10-01', '2026-10-31')).toEqual({
      bankCharges: 31_000,
      loanInterest: 62_000,
    });
    expect(financialCostsForDateRange(ledger, '2026-10-01', '2026-10-07')).toEqual({
      bankCharges: 7_000,
      loanInterest: 14_000,
    });
  });

  it('persists branch payments and carries tax liabilities until settlement', () => {
    const ledger = normaliseFinancialEntry({
      months: {
        '2026-09': {
          customerPaymentsByBranch: { A: 200_000, B: 100_000 },
          citaProvision: 900_000,
          citaPaid: 250_000,
          payeProvision: 80_000,
          payeRemitted: 30_000,
        },
        '2026-10': { citaPaid: 100_000, payeRemitted: 20_000 },
      },
    });

    expect(cumulativeCustomerPaymentsReceived(ledger, '2026-09')).toBe(300_000);
    expect(cumulativeBranchCustomerPaymentsReceived(ledger, 'A', '2026-09')).toBe(200_000);
    expect(cumulativeCitaPayable(ledger, '2026-10')).toBe(550_000);
    expect(cumulativePayePayable(ledger, '2026-10')).toBe(30_000);
  });
});
