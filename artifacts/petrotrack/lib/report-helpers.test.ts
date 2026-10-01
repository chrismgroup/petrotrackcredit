import { computePumpReportCOGS, getLastKnownCostPrice } from './report-helpers';

describe('historical COGS', () => {
  const deliveries = [
    { dt: '2026-09-01', prod: 'PMS', rec: 10_000, costPrice: 700, approvalStatus: 'approved', branchId: 'A' },
    { dt: '2026-09-15', prod: 'PMS', rec: 10_000, costPrice: 750, approvalStatus: 'approved', branchId: 'A' },
    { dt: '2026-09-01', prod: 'PMS', rec: 10_000, costPrice: 680, approvalStatus: 'approved', branchId: 'B' },
  ];

  it('uses the latest cost for the sale branch that existed on the sale date', () => {
    expect(computePumpReportCOGS([
      { pumpName: 'Pump 1', product: 'PMS', liters: 10, date: '2026-09-10', branchId: 'A' },
      { pumpName: 'Pump 1', product: 'PMS', liters: 10, date: '2026-09-20', branchId: 'A' },
      { pumpName: 'Pump 2', product: 'PMS', liters: 10, date: '2026-09-20', branchId: 'B' },
    ], deliveries)).toBe(21_300);
  });

  it('does not use a future delivery cost', () => {
    expect(getLastKnownCostPrice(deliveries, 'PMS', 'A', '2026-09-10')).toBe(700);
  });
});
