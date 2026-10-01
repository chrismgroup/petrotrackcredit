import { getPriceForPumpOnDate } from './price-history';

const prices = {
  PMS: 1_100,
  AGO: 1_200,
  DPK: 900,
  LPG: 1_500,
  LPG_Single: 1_500,
  LPG_Distributor: 1_400,
  'Lube Oil': 2_000,
  branchPrices: { B1: { PMS: 1_050 } },
};

const pump = { id: 'P1', name: 'PMS 1', prod: 'PMS', branchId: 'B1', active: true } as const;

describe('historical branch selling price', () => {
  it('uses the price effective on the selected business date', () => {
    const history = [
      { id: 1, prod: 'PMS', oldPrice: 900, newPrice: 1_000, by: 'Manager', dt: '2026-09-15T09:00:00Z', branchId: 'B1' },
      { id: 2, prod: 'PMS', oldPrice: 1_000, newPrice: 1_050, by: 'Manager', dt: '2026-10-05T09:00:00Z', branchId: 'B1' },
    ];
    expect(getPriceForPumpOnDate(pump, prices, history, '2026-09-01')).toBe(900);
    expect(getPriceForPumpOnDate(pump, prices, history, '2026-09-20')).toBe(1_000);
    expect(getPriceForPumpOnDate(pump, prices, history, '2026-10-06')).toBe(1_050);
  });

  it('prefers branch history and falls back to the current branch price', () => {
    expect(getPriceForPumpOnDate(pump, prices, [], '2026-10-06')).toBe(1_050);
  });
});
