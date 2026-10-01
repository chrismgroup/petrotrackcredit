export type CreditCustomerStatus = 'pending_md' | 'approved' | 'rejected';

export interface CreditCustomer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  branchId: string;
  status: CreditCustomerStatus;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
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
  status: string;
  date: string;
  branchId: string;
  creditAmount: number;
  creditCustomerId?: string;
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
