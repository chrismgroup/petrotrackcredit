type JsonRecord = Record<string, unknown>;

export interface CreditSaleLine {
  customerId: string;
  customerName: string;
  quantity: number;
  amount: number;
}

const TOLERANCE_NAIRA = 0.05;

/**
 * Validates the credit sales on a submitted shift report. Every line must
 * belong to an MD-approved customer of the report's branch, appear once, and
 * the amounts must match the quantities, the unit price and creditAmount.
 * Reports from older clients carrying a single creditCustomerId are accepted
 * as one line. Returns null when the credit data is invalid.
 */
export function validatedCreditSaleLines(
  report: JsonRecord,
  creditAmount: number,
  approvedBranchCustomers: Map<string, JsonRecord>,
): CreditSaleLine[] | null {
  if (!Number.isFinite(creditAmount) || creditAmount < 0) return null;
  const unitPrice = Number(report.unitPrice);
  const volumeSold = Number(report.liters);

  if (report.creditSales === undefined || report.creditSales === null) {
    const customerId = String(report.creditCustomerId ?? "");
    if (creditAmount <= 0) return customerId ? null : [];
    const customer = approvedBranchCustomers.get(customerId);
    if (!customerId || !customer) return null;
    return [{
      customerId,
      customerName: String(customer.name ?? ""),
      quantity: unitPrice > 0 ? Number((creditAmount / unitPrice).toFixed(4)) : 0,
      amount: creditAmount,
    }];
  }

  if (!Array.isArray(report.creditSales)) return null;
  if (report.creditSales.length === 0) return creditAmount > 0 ? null : [];
  if (creditAmount <= 0) return null;

  const seen = new Set<string>();
  const lines: CreditSaleLine[] = [];
  for (const raw of report.creditSales) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const line = raw as JsonRecord;
    const customerId = String(line.customerId ?? "");
    const customer = approvedBranchCustomers.get(customerId);
    const quantity = Number(line.quantity);
    const amount = Number(line.amount);
    if (!customer || seen.has(customerId)) return null;
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(amount) || amount <= 0) return null;
    if (unitPrice > 0 && Math.abs(quantity * unitPrice - amount) > TOLERANCE_NAIRA) return null;
    seen.add(customerId);
    lines.push({ customerId, customerName: String(customer.name ?? ""), quantity, amount });
  }

  const totalAmount = lines.reduce((total, line) => total + line.amount, 0);
  const totalQuantity = lines.reduce((total, line) => total + line.quantity, 0);
  if (Math.abs(totalAmount - creditAmount) > TOLERANCE_NAIRA) return null;
  if (Number.isFinite(volumeSold) && totalQuantity > volumeSold + 1e-6) return null;
  const claimedSingle = report.creditCustomerId;
  if (claimedSingle !== undefined && claimedSingle !== null && claimedSingle !== "") {
    if (lines.length !== 1 || String(claimedSingle) !== lines[0].customerId) return null;
  }
  return lines;
}
