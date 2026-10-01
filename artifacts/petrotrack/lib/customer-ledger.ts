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

export interface CustomerCreditSale {
  id?: number | string;
  status: string;
  date: string;
  branchId: string;
  creditAmount: number;
  creditCustomerId?: string;
  product?: string;
  unitPrice?: number;
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
      && report.creditCustomerId === customerId
      && (!throughDate || report.date.slice(0, 10) <= throughDate.slice(0, 10)))
    .reduce((total, report) => total + amount(report.creditAmount), 0);
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
      && report.creditCustomerId === customerId
      && report.date.slice(0, 10) >= range.from
      && report.date.slice(0, 10) <= range.to)
    .map((report, index): CustomerPurchaseLine => {
      const purchaseAmount = amount(report.creditAmount);
      const unitPrice = amount(report.unitPrice);
      const product = String(report.product || 'Product');
      return {
        id: String(report.id ?? `${report.date}-${index}`),
        date: report.date.slice(0, 10),
        product,
        unit: product === 'LPG' || product.startsWith('LPG_') ? 'kg' : 'L',
        quantity: unitPrice > 0 ? Number((purchaseAmount / unitPrice).toFixed(4)) : 0,
        unitPrice,
        amount: purchaseAmount,
        branchId: report.branchId,
      };
    })
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
