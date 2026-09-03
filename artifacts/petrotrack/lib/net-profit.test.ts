import { calculateNetProfit } from './net-profit';

describe('calculateNetProfit', () => {
  it('deducts depreciation, bank charges, and loan interest before CITA', () => {
    expect(calculateNetProfit({
      operatingProfit: 1_000_000,
      depreciation: 100_000,
      bankCharges: 20_000,
      loanInterest: 80_000,
      citaRate: 0.3,
    })).toEqual({
      profitBeforeTax: 800_000,
      citaProvision: 240_000,
      netProfit: 560_000,
    });
  });

  it('does not create a CITA provision when deductions produce a loss', () => {
    expect(calculateNetProfit({
      operatingProfit: 100_000,
      bankCharges: 40_000,
      loanInterest: 70_000,
      citaRate: 0.3,
    })).toEqual({
      profitBeforeTax: -10_000,
      citaProvision: 0,
      netProfit: -10_000,
    });
  });
});