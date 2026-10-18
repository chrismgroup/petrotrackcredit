import type { CompanyAsset } from '@/lib/asset-depreciation';
import { depreciationTotalForDateRange } from '@/lib/asset-depreciation';
import type { Delivery, Expense, PumpDailyReport, StartupStock } from '@/context/AppContext';
import { calculateNetProfit } from '@/lib/net-profit';
import { computePumpReportCOGS, missingPumpReportCostProducts } from '@/lib/report-helpers';
import { financialCostsForDateRange, type FinancialEntry } from '@/lib/financial-ledger';

type CreditPumpReport = PumpDailyReport & { _amtMissing?: boolean };

export type CreditReadinessSnapshot = {
  from: string;
  to: string;
  approvedReportCount: number;
  monthsWithSales: number;
  litersSold: number;
  revenue: number;
  posReceipts: number;
  bankTransfers: number;
  cashCollected: number;
  creditSales: number;
  costOfGoods: number | null;
  grossProfit: number | null;
  approvedExpenses: number;
  depreciation: number;
  bankCharges: number;
  loanInterest: number;
  netProfit: number | null;
  averageMonthlyPrincipalRepayment: number;
  missingCostProducts: string[];
  incompleteReportCount: number;
};

export type LenderPolicy = {
  name: string;
  minimumActiveMonths: number;
  advanceMultipleOfMonthlyNetProfit: number;
  maximumFacilityNaira: number;
  tenorMonths: number;
  monthlyReducingBalanceRate: number;
  maxPaymentToNetProfitRatio: number;
  repaymentStepNaira: number;
};

export const ILLUSTRATIVE_LENDER_POLICY: LenderPolicy = {
  name: 'Illustrative Working-Capital Pilot',
  minimumActiveMonths: 6,
  advanceMultipleOfMonthlyNetProfit: 2,
  maximumFacilityNaira: 10_000_000,
  tenorMonths: 6,
  monthlyReducingBalanceRate: 0.03,
  maxPaymentToNetProfitRatio: 0.25,
  repaymentStepNaira: 1_000,
} as const;

export type IndicativeFacilityEstimate = {
  amount: number | null;
  monthlyInstalment: number | null;
  totalRepayment: number | null;
  estimatedInterest: number | null;
  averageMonthlyNetProfit: number | null;
  averageMonthlyPrincipalRepayment: number;
  monthlyRepaymentCapacity: number | null;
  reason: 'eligible' | 'insufficient_history' | 'incomplete_cost_data' | 'incomplete_sales_data' | 'no_positive_profit' | 'no_repayment_capacity';
};

export function previousSixFullMonths(now = new Date()): { from: string; to: string } {
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  const start = new Date(end.getFullYear(), end.getMonth() - 5, 1);
  const key = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  return { from: key(start), to: key(end) };
}

export function buildCreditReadinessSnapshot(input: {
  reports: CreditPumpReport[];
  deliveries: Delivery[];
  expenses: Expense[];
  startupStocks: StartupStock[];
  assets: CompanyAsset[];
  financialEntry: FinancialEntry;
  citaRate: number;
  now?: Date;
}): CreditReadinessSnapshot {
  const { from, to } = previousSixFullMonths(input.now);
  const reports = input.reports.filter(report =>
    report.status === 'approved' && report.date.slice(0, 10) >= from && report.date.slice(0, 10) <= to,
  );
  const deliveries = input.deliveries.filter(delivery =>
    delivery.dt.slice(0, 10) <= to
      && (delivery.approvalStatus === 'md_approved' || delivery.approvalStatus === 'approved'),
  );
  const expenses = input.expenses.filter(expense =>
    expense.status === 'approved' && expense.dt.slice(0, 10) >= from && expense.dt.slice(0, 10) <= to,
  );
  const missingCostProducts = missingPumpReportCostProducts(reports, deliveries, input.startupStocks);
  const revenue = reports.reduce((sum, report) => sum + Math.max(0, Number(report.grossAmount) || 0), 0);
  const litersSold = reports.reduce((sum, report) => sum + Math.max(0, Number(report.liters) || 0), 0);
  const paymentTotal = (field: 'posAmount' | 'transferAmount' | 'cashAmount' | 'creditAmount') =>
    reports.reduce((sum, report) => sum + Math.max(0, Number(report[field]) || 0), 0);
  const approvedExpenses = expenses.reduce((sum, expense) => sum + Math.max(0, Number(expense.amt) || 0), 0);
  const costOfGoods = computePumpReportCOGS(reports, deliveries, input.startupStocks);
  const costComplete = missingCostProducts.length === 0;
  const grossProfit = costComplete ? revenue - costOfGoods : null;
  const depreciation = depreciationTotalForDateRange(input.assets, from, to);
  const { bankCharges, loanInterest } = financialCostsForDateRange(input.financialEntry, from, to);
  const firstMonth = from.slice(0, 7);
  const lastMonth = to.slice(0, 7);
  const principalRepayments = Object.entries(input.financialEntry.months ?? {})
    .filter(([month]) => month >= firstMonth && month <= lastMonth)
    .reduce((sum, [, month]) => sum + Math.max(0, Number(month.loanPrincipalRepayment) || 0), 0);
  const netProfit = costComplete
    ? calculateNetProfit({
      operatingProfit: (grossProfit ?? 0) - approvedExpenses,
      depreciation,
      bankCharges,
      loanInterest,
      citaRate: Number.isFinite(input.citaRate) ? Math.max(0, input.citaRate) : 0,
    }).netProfit
    : null;

  return {
    from,
    to,
    approvedReportCount: reports.length,
    monthsWithSales: new Set(reports.map(report => report.date.slice(0, 7))).size,
    litersSold,
    revenue,
    posReceipts: paymentTotal('posAmount'),
    bankTransfers: paymentTotal('transferAmount'),
    cashCollected: paymentTotal('cashAmount'),
    creditSales: paymentTotal('creditAmount'),
    costOfGoods: costComplete ? costOfGoods : null,
    grossProfit,
    approvedExpenses,
    depreciation,
    bankCharges,
    loanInterest,
    netProfit,
    averageMonthlyPrincipalRepayment: principalRepayments / 6,
    missingCostProducts,
    incompleteReportCount: reports.filter(report => report._amtMissing).length,
  };
}

export function estimateIndicativeFacility(
  snapshot: CreditReadinessSnapshot,
  policy: LenderPolicy = ILLUSTRATIVE_LENDER_POLICY,
): IndicativeFacilityEstimate {
  const empty = (
    reason: IndicativeFacilityEstimate['reason'],
    averageMonthlyNetProfit: number | null = null,
    monthlyRepaymentCapacity: number | null = null,
  ): IndicativeFacilityEstimate => ({
    amount: null,
    monthlyInstalment: null,
    totalRepayment: null,
    estimatedInterest: null,
    averageMonthlyNetProfit,
    averageMonthlyPrincipalRepayment: snapshot.averageMonthlyPrincipalRepayment,
    monthlyRepaymentCapacity,
    reason,
  });

  if (snapshot.monthsWithSales < policy.minimumActiveMonths) return empty('insufficient_history');
  if (snapshot.missingCostProducts.length > 0 || snapshot.netProfit === null) return empty('incomplete_cost_data');
  if (snapshot.incompleteReportCount > 0) return empty('incomplete_sales_data');

  const averageMonthlyNetProfit = snapshot.netProfit / policy.minimumActiveMonths;
  if (averageMonthlyNetProfit <= 0) return empty('no_positive_profit', averageMonthlyNetProfit);

  const monthlyRepaymentCapacity =
    (averageMonthlyNetProfit * policy.maxPaymentToNetProfitRatio)
    - snapshot.averageMonthlyPrincipalRepayment;
  if (monthlyRepaymentCapacity <= 0) {
    return empty('no_repayment_capacity', averageMonthlyNetProfit, monthlyRepaymentCapacity);
  }

  const rate = policy.monthlyReducingBalanceRate;
  const months = policy.tenorMonths;
  const presentValueFactor = rate === 0
    ? months
    : (1 - ((1 + rate) ** -months)) / rate;
  const paymentBasedLimit = monthlyRepaymentCapacity * presentValueFactor;
  const profitBasedLimit = averageMonthlyNetProfit * policy.advanceMultipleOfMonthlyNetProfit;
  const rawAmount = Math.min(paymentBasedLimit, profitBasedLimit, policy.maximumFacilityNaira);
  const amount = Math.floor(rawAmount / policy.repaymentStepNaira) * policy.repaymentStepNaira;
  if (amount <= 0) return empty('no_repayment_capacity', averageMonthlyNetProfit, monthlyRepaymentCapacity);

  const monthlyInstalment = rate === 0
    ? amount / months
    : amount * rate / (1 - ((1 + rate) ** -months));
  const totalRepayment = monthlyInstalment * months;

  return {
    amount,
    monthlyInstalment,
    totalRepayment,
    estimatedInterest: Math.max(0, totalRepayment - amount),
    averageMonthlyNetProfit,
    averageMonthlyPrincipalRepayment: snapshot.averageMonthlyPrincipalRepayment,
    monthlyRepaymentCapacity,
    reason: 'eligible',
  };
}
