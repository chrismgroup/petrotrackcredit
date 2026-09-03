export type NetProfitInput = {
  operatingProfit: number;
  depreciation?: number;
  bankCharges?: number;
  loanInterest?: number;
  citaRate: number;
};

function nonNegative(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

export function calculateNetProfit({
  operatingProfit,
  depreciation = 0,
  bankCharges = 0,
  loanInterest = 0,
  citaRate,
}: NetProfitInput) {
  const profitBeforeTax = operatingProfit
    - nonNegative(depreciation)
    - nonNegative(bankCharges)
    - nonNegative(loanInterest);
  const citaProvision = profitBeforeTax > 0
    ? Math.round(profitBeforeTax * nonNegative(citaRate))
    : 0;

  return {
    profitBeforeTax,
    citaProvision,
    netProfit: profitBeforeTax - citaProvision,
  };
}