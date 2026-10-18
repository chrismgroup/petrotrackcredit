import {
  buildCreditSales,
  creditSaleFields,
  customerLedgerBalance,
  customerLedgerPeriodRange,
  customerReceivablePosition,
  customerStatementForPeriod,
  hasCustomerCredit,
  reportCreditLines,
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

  it('posts each customer on a multi-customer shift report to their own ledger', () => {
    const reports = [{
      id: 7, status: 'approved', date: '2026-10-03', branchId: 'B1', product: 'PMS', unitPrice: 1_000,
      creditAmount: 150_000, creditCustomerName: 'Ibom Air, Tulcan',
      creditSales: [
        { customerId: 'IBOM', customerName: 'Ibom Air', quantity: 100, amount: 100_000 },
        { customerId: 'TULCAN', customerName: 'Tulcan', quantity: 50, amount: 50_000 },
      ],
    }];
    expect(customerLedgerBalance('IBOM', reports)).toBe(100_000);
    expect(customerLedgerBalance('TULCAN', reports)).toBe(50_000);
    expect(customerReceivablePosition([customer('IBOM'), customer('TULCAN')], reports, [], 'B1'))
      .toEqual({ receivables: 150_000, advances: 0 });
    const statement = customerStatementForPeriod('TULCAN', reports, [], { from: '2026-10-01', to: '2026-10-31' });
    expect(statement.purchases.map(line => [line.quantity, line.amount])).toEqual([[50, 50_000]]);
    expect(hasCustomerCredit(reports[0])).toBe(true);
    expect(hasCustomerCredit({ status: 'approved', date: '2026-10-03', branchId: 'B1', creditAmount: 9_000 })).toBe(false);
  });

  it('reads legacy single-customer reports as one credit line', () => {
    expect(reportCreditLines({
      status: 'approved', date: '2026-10-03', branchId: 'B1', unitPrice: 1_000,
      creditAmount: 20_000, creditCustomerId: 'C1', creditCustomerName: 'C1',
    })).toEqual([{ customerId: 'C1', customerName: 'C1', quantity: 20, amount: 20_000 }]);
  });
});

describe('buildCreditSales', () => {
  const approved = [
    { ...customer('IBOM'), name: 'Ibom Air' },
    { ...customer('TULCAN'), name: 'Tulcan' },
    { ...customer('PENDING'), name: 'Pending Co', status: 'pending_md' as const },
    { ...customer('OTHER'), name: 'Other Branch', branchId: 'B2' },
  ];

  it('builds lines for several approved customers', () => {
    const result = buildCreditSales(
      [{ customerId: 'IBOM', quantity: '100' }, { customerId: 'TULCAN', quantity: '50.5' }],
      approved, 'B1', 1_000, 400,
    );
    expect(result).toEqual({
      ok: true,
      totalAmount: 150_500,
      totalQuantity: 150.5,
      lines: [
        { customerId: 'IBOM', customerName: 'Ibom Air', quantity: 100, amount: 100_000 },
        { customerId: 'TULCAN', customerName: 'Tulcan', quantity: 50.5, amount: 50_500 },
      ],
    });
    if (result.ok) {
      expect(creditSaleFields(result.lines, result.totalAmount)).toEqual({
        creditAmount: 150_500,
        creditSales: result.lines,
        creditCustomerId: undefined,
        creditCustomerName: 'Ibom Air, Tulcan',
      });
    }
  });

  it('keeps the single-customer fields for one customer and clears them for none', () => {
    const single = buildCreditSales([{ customerId: 'IBOM', quantity: '10' }], approved, 'B1', 1_000, 400);
    expect(single.ok && creditSaleFields(single.lines, single.totalAmount)).toMatchObject({
      creditAmount: 10_000, creditCustomerId: 'IBOM', creditCustomerName: 'Ibom Air',
    });
    expect(creditSaleFields([], 0)).toEqual({
      creditAmount: 0, creditSales: undefined, creditCustomerId: undefined, creditCustomerName: undefined,
    });
  });

  it.each([
    ['an unapproved customer', [{ customerId: 'PENDING', quantity: '5' }], /MD-approved/],
    ['another branch customer', [{ customerId: 'OTHER', quantity: '5' }], /MD-approved/],
    ['an unknown customer', [{ customerId: 'GHOST', quantity: '5' }], /MD-approved/],
    ['a duplicate customer', [{ customerId: 'IBOM', quantity: '5' }, { customerId: 'IBOM', quantity: '1' }], /more than once/],
    ['a missing quantity', [{ customerId: 'IBOM', quantity: '' }], /Enter the quantity Ibom Air bought/],
    ['more than was sold', [{ customerId: 'IBOM', quantity: '300' }, { customerId: 'TULCAN', quantity: '150' }], /cannot exceed/],
  ])('rejects %s', (_label, drafts, error) => {
    const result = buildCreditSales(drafts, approved, 'B1', 1_000, 400);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(error);
  });
});
