import {
  customerLedgerBalance,
  customerLedgerPeriodRange,
  customerReceivablePosition,
  customerStatementForPeriod,
  type CreditCustomer,
} from './customer-ledger';

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

  it('builds weekly and monthly periods from the selected date', () => {
    expect(customerLedgerPeriodRange('2026-10-07', 'weekly')).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(customerLedgerPeriodRange('2026-10-07', 'monthly')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('calculates customer quantities, purchases, payments, and closing balance', () => {
    const reports = [
      { id: 1, status: 'approved', date: '2026-09-30', branchId: 'B1', product: 'PMS', unitPrice: 1_000, creditAmount: 20_000, creditCustomerId: 'C1' },
      { id: 2, status: 'approved', date: '2026-10-03', branchId: 'B1', product: 'PMS', unitPrice: 1_000, creditAmount: 35_000, creditCustomerId: 'C1' },
      { id: 3, status: 'approved', date: '2026-10-05', branchId: 'B1', product: 'LPG', unitPrice: 1_500, creditAmount: 30_000, creditCustomerId: 'C1' },
    ];
    const payments = [
      { id: 'P0', customerId: 'C1', customerName: 'C1', branchId: 'B1', amount: 5_000, date: '2026-09-30', recordedBy: 'Accountant', recordedAt: '2026-09-30T00:00:00Z' },
      { id: 'P1', customerId: 'C1', customerName: 'C1', branchId: 'B1', amount: 40_000, date: '2026-10-04', recordedBy: 'Accountant', recordedAt: '2026-10-04T00:00:00Z' },
    ];
    const statement = customerStatementForPeriod('C1', reports, payments, { from: '2026-10-01', to: '2026-10-31' });

    expect(statement.openingBalance).toBe(15_000);
    expect(statement.purchases.map(line => [line.product, line.quantity, line.unit])).toEqual([
      ['PMS', 35, 'L'],
      ['LPG', 20, 'kg'],
    ]);
    expect(statement.totalQuantity).toBe(55);
    expect(statement.totalPurchases).toBe(65_000);
    expect(statement.totalPayments).toBe(40_000);
    expect(statement.closingBalance).toBe(40_000);
  });
});
