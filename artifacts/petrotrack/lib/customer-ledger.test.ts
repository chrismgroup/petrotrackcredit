import { customerLedgerBalance, customerReceivablePosition, type CreditCustomer } from './customer-ledger';

const customer = (id: string): CreditCustomer => ({
  id, name: id, phone: '0800', branchId: 'B1', status: 'approved',
  createdBy: 'Accountant', createdAt: '2026-10-01T00:00:00Z', revision: 1,
});

describe('customer receivables ledger', () => {
  it('preserves an advance and consumes it when approved credit sales post', () => {
    const payments = [{
      id: 'P1', customerId: 'C1', customerName: 'C1', branchId: 'B1', amount: 100_000,
      date: '2026-10-01', recordedBy: 'Accountant', recordedAt: '2026-10-01T00:00:00Z',
    }];
    expect(customerLedgerBalance('C1', [], payments)).toBe(-100_000);
    expect(customerLedgerBalance('C1', [{
      status: 'approved', date: '2026-10-02', branchId: 'B1', creditAmount: 35_000, creditCustomerId: 'C1',
    }], payments)).toBe(-65_000);
  });

  it('does not net one customer advance against another customer receivable', () => {
    const reports = [{
      status: 'approved', date: '2026-10-02', branchId: 'B1', creditAmount: 80_000, creditCustomerId: 'C2',
    }];
    const payments = [{
      id: 'P1', customerId: 'C1', customerName: 'C1', branchId: 'B1', amount: 100_000,
      date: '2026-10-01', recordedBy: 'Accountant', recordedAt: '2026-10-01T00:00:00Z',
    }];
    expect(customerReceivablePosition([customer('C1'), customer('C2')], reports, payments, 'B1'))
      .toEqual({ receivables: 80_000, advances: 100_000 });
  });
});
