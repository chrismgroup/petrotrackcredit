export type CreditCustomerStatus = 'pending_md' | 'approved' | 'rejected';

export interface CreditCustomer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  contactPerson?: string;
  branchId: string;
  status: CreditCustomerStatus;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  updatedBy?: string;
  updatedAt?: string;
  revision: number;
}

export interface CustomerPayment {
  id: string;
  customerId: string;
  customerName: string;
  branchId: string;
  amount: number;
  date: string;
  reference?: string;
  note?: string;
  recordedBy: string;
  recordedAt: string;
}

/** One approved credit customer's purchase within a single shift report. */
export interface CreditSaleLine {
  customerId: string;
  customerName: string;
  quantity: number;
  amount: number;
}

export interface CustomerCreditSale {
  id?: number | string;
  status: string;
  date: string;
  branchId: string;
  creditAmount: number;
  creditCustomerId?: string;
  creditCustomerName?: string;
  /** Present on reports that may record several credit customers. */
  creditSales?: CreditSaleLine[];
  product?: string;
  unitPrice?: number;
}

/**
 * Credit lines for a report. Reports saved before multi-customer support only
 * carry a single creditCustomerId, which is treated as one line.
 */
export function reportCreditLines(report: CustomerCreditSale): CreditSaleLine[] {
  if (Array.isArray(report.creditSales) && report.creditSales.length > 0) {
    return report.creditSales.filter(line => line && line.customerId && amount(line.amount) > 0);
  }
  if (report.creditCustomerId && amount(report.creditAmount) > 0) {
    const unitPrice = amount(report.unitPrice);
    return [{
      customerId: report.creditCustomerId,
      customerName: report.creditCustomerName ?? '',
      quantity: unitPrice > 0 ? Number((amount(report.creditAmount) / unitPrice).toFixed(4)) : 0,
      amount: amount(report.creditAmount),
    }];
  }
  return [];
}

/** True when the report's credit is attributed to approved customer profiles. */
export function hasCustomerCredit(report: CustomerCreditSale): boolean {
  return reportCreditLines(report).length > 0;
}

export interface CreditSaleDraft {
  customerId: string;
  quantity: string;
}

export type CreditSalesResult =
  | { ok: true; lines: CreditSaleLine[]; totalAmount: number; totalQuantity: number }
  | { ok: false; error: string };

/**
 * Validates the attendant's credit entries. Only MD-approved customers of the
 * report's branch are accepted, each at most once, each with a positive
 * quantity, and the combined quantity cannot exceed the volume sold.
 */
export function buildCreditSales(
  drafts: CreditSaleDraft[],
  customers: CreditCustomer[],
  branchId: string,
  unitPrice: number,
  volumeSold: number,
): CreditSalesResult {
  const seen = new Set<string>();
  const lines: CreditSaleLine[] = [];
  for (const draft of drafts) {
    const customer = customers.find(candidate => candidate.id === draft.customerId);
    if (!customer || customer.status !== 'approved' || customer.branchId !== branchId) {
      return { ok: false, error: 'Only MD-approved credit customers of this branch can buy on credit.' };
    }
    if (seen.has(customer.id)) {
      return { ok: false, error: `${customer.name} has been added more than once.` };
    }
    seen.add(customer.id);
    const quantity = parseFloat(draft.quantity.replace(/,/g, '')) || 0;
    if (quantity <= 0) {
      return { ok: false, error: `Enter the quantity ${customer.name} bought, or remove the customer.` };
    }
    lines.push({
      customerId: customer.id,
      customerName: customer.name,
      quantity,
      amount: Number((quantity * unitPrice).toFixed(2)),
    });
  }
  const totalQuantity = Number(lines.reduce((total, line) => total + line.quantity, 0).toFixed(4));
  if (totalQuantity > volumeSold) {
    return { ok: false, error: 'The combined credit customer quantity cannot exceed the total quantity sold in this shift report.' };
  }
  const totalAmount = Number(lines.reduce((total, line) => total + line.amount, 0).toFixed(2));
  return { ok: true, lines, totalAmount, totalQuantity };
}

/** Report fields to save for a set of validated credit lines. */
export function creditSaleFields(lines: CreditSaleLine[], totalAmount: number) {
  return {
    creditAmount: totalAmount,
    creditSales: lines.length > 0 ? lines : undefined,
    // Single-customer reports keep the original fields so older readers still work.
    creditCustomerId: lines.length === 1 ? lines[0].customerId : undefined,
    creditCustomerName: lines.length > 0 ? lines.map(line => line.customerName).join(', ') : undefined,
  };
}

export type CustomerLedgerPeriod = 'weekly' | 'monthly';

export interface CustomerPurchaseLine {
  id: string;
  date: string;
  product: string;
  unit: 'L' | 'kg';
  quantity: number;
  unitPrice: number;
  amount: number;
  branchId: string;
}

export interface CustomerStatement {
  from: string;
  to: string;
  openingBalance: number;
  purchases: CustomerPurchaseLine[];
  payments: CustomerPayment[];
  totalQuantity: number;
  totalPurchases: number;
  totalPayments: number;
  closingBalance: number;
}

const amount = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};

export function customerLedgerBalance(
  customerId: string,
  reports: CustomerCreditSale[] = [],
  payments: CustomerPayment[] = [],
  throughDate?: string,
): number {
  const sales = reports
    .filter(report => report.status === 'approved'
      && (!throughDate || report.date.slice(0, 10) <= throughDate.slice(0, 10)))
    .reduce((total, report) => total + reportCreditLines(report)
      .filter(line => line.customerId === customerId)
      .reduce((sum, line) => sum + amount(line.amount), 0), 0);
  const received = payments
    .filter(payment => payment.customerId === customerId
      && (!throughDate || payment.date.slice(0, 10) <= throughDate.slice(0, 10)))
    .reduce((total, payment) => total + amount(payment.amount), 0);
  return Math.round(sales - received);
}

export function customerReceivablePosition(
  customers: CreditCustomer[] = [],
  reports: CustomerCreditSale[] = [],
  payments: CustomerPayment[] = [],
  branchId?: string | null,
  throughDate?: string,
): { receivables: number; advances: number } {
  return customers
    .filter(customer => customer.status === 'approved' && (!branchId || customer.branchId === branchId))
    .reduce((position, customer) => {
      const balance = customerLedgerBalance(customer.id, reports, payments, throughDate);
      if (balance >= 0) position.receivables += balance;
      else position.advances += Math.abs(balance);
      return position;
    }, { receivables: 0, advances: 0 });
}

function dateKey(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function customerLedgerPeriodRange(anchorDate: string, period: CustomerLedgerPeriod): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) return null;
  const [year, month, day] = anchorDate.split('-').map(Number);
  const anchor = new Date(year, month - 1, day, 12);
  if (anchor.getFullYear() !== year || anchor.getMonth() !== month - 1 || anchor.getDate() !== day) return null;
  if (period === 'monthly') {
    return {
      from: dateKey(new Date(year, month - 1, 1, 12)),
      to: dateKey(new Date(year, month, 0, 12)),
    };
  }
  const mondayOffset = (anchor.getDay() + 6) % 7;
  const monday = new Date(year, month - 1, day - mondayOffset, 12);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: dateKey(monday), to: dateKey(sunday) };
}

export function customerStatementForPeriod(
  customerId: string,
  reports: CustomerCreditSale[] = [],
  payments: CustomerPayment[] = [],
  range: { from: string; to: string },
): CustomerStatement {
  const purchases = reports
    .filter(report => report.status === 'approved'
      && report.date.slice(0, 10) >= range.from
      && report.date.slice(0, 10) <= range.to)
    .flatMap((report, index) => reportCreditLines(report)
      .filter(line => line.customerId === customerId)
      .map((line, lineIndex): CustomerPurchaseLine => {
        const purchaseAmount = amount(line.amount);
        const unitPrice = amount(report.unitPrice);
        const product = String(report.product || 'Product');
        const baseId = String(report.id ?? `${report.date}-${index}`);
        return {
          id: lineIndex === 0 ? baseId : `${baseId}-${lineIndex}`,
          date: report.date.slice(0, 10),
          product,
          unit: product === 'LPG' || product.startsWith('LPG_') ? 'kg' : 'L',
          quantity: unitPrice > 0 ? Number((purchaseAmount / unitPrice).toFixed(4)) : 0,
          unitPrice,
          amount: purchaseAmount,
          branchId: report.branchId,
        };
      }))
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  const periodPayments = payments
    .filter(payment => payment.customerId === customerId
      && payment.date.slice(0, 10) >= range.from
      && payment.date.slice(0, 10) <= range.to)
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  const dayBefore = new Date(`${range.from}T12:00:00`);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const openingBalance = customerLedgerBalance(customerId, reports, payments, dateKey(dayBefore));
  const totalPurchases = purchases.reduce((total, purchase) => total + purchase.amount, 0);
  const totalPayments = periodPayments.reduce((total, payment) => total + amount(payment.amount), 0);
  return {
    ...range,
    openingBalance,
    purchases,
    payments: periodPayments,
    totalQuantity: Number(purchases.reduce((total, purchase) => total + purchase.quantity, 0).toFixed(4)),
    totalPurchases,
    totalPayments,
    closingBalance: Math.round(openingBalance + totalPurchases - totalPayments),
  };
}
