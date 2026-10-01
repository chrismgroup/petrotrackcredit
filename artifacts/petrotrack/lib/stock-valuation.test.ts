import { aggregateStockValueByBranch } from './stock-valuation';

describe('stock valuation by branch and product', () => {
  it('does not mix AGO with PMS in the same branch or across branches', () => {
    const result = aggregateStockValueByBranch([
      { branchId: 'uyo', product: 'PMS', quantity: 10_000, unitCost: 800 },
      { branchId: 'uyo', product: 'AGO', quantity: 4_000, unitCost: 1_100 },
      { branchId: 'ikot', product: 'AGO', quantity: 2_000, unitCost: 1_050 },
    ]);

    expect(result.uyo.byProd.PMS).toEqual({ stock: 10_000, unitCost: 800, value: 8_000_000 });
    expect(result.uyo.byProd.AGO).toEqual({ stock: 4_000, unitCost: 1_100, value: 4_400_000 });
    expect(result.uyo.value).toBe(12_400_000);
    expect(result.ikot.byProd.PMS).toBeUndefined();
    expect(result.ikot.byProd.AGO?.value).toBe(2_100_000);
  });

  it('uses a weighted unit cost only within the same branch and product', () => {
    const result = aggregateStockValueByBranch([
      { branchId: 'uyo', product: 'AGO', quantity: 100, unitCost: 900 },
      { branchId: 'uyo', product: 'AGO', quantity: 300, unitCost: 1_100 },
    ]);

    expect(result.uyo.byProd.AGO).toEqual({ stock: 400, unitCost: 1_050, value: 420_000 });
  });
});
