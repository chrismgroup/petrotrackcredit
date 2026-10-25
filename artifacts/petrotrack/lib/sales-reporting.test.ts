import { filterSalesAuditEntries, groupSalesAuditEntries, type SalesAuditEntry } from './sales-reporting';

const entries: SalesAuditEntry[] = [
  { id: 1, date: '2026-10-20', branchId: 'uyo', branchName: 'Uyo', product: 'PMS', quantity: 100, amount: 95_000 },
  { id: 2, date: '2026-10-20', branchId: 'uyo', branchName: 'Uyo', product: 'PMS', quantity: 50, amount: 47_500 },
  { id: 3, date: '2026-10-21', branchId: 'uyo', branchName: 'Uyo', product: 'LPG', quantity: 20, amount: 24_000 },
  { id: 4, date: '2026-09-30', branchId: 'eket', branchName: 'Eket', product: 'PMS', quantity: 40, amount: 38_000 },
];

describe('sales audit reporting', () => {
  it('filters by branch, product and reporting period', () => {
    expect(filterSalesAuditEntries(entries, { branchId: 'uyo', product: 'PMS', period: 'month', anchor: '2026-10-10' })).toHaveLength(2);
    expect(filterSalesAuditEntries(entries, { branchId: 'all', product: 'all', period: 'quarter', anchor: '2026-10-10' })).toHaveLength(3);
  });

  it('groups branch, product and daily totals without mixing units', () => {
    const [eket, uyo] = groupSalesAuditEntries(entries);
    expect(eket.name).toBe('Eket');
    expect(uyo.amount).toBe(166_500);
    expect(uyo.products.find(product => product.product === 'PMS')).toMatchObject({ quantity: 150, amount: 142_500, unit: 'L', records: 2 });
    expect(uyo.products.find(product => product.product === 'LPG')?.unit).toBe('kg');
  });
});
