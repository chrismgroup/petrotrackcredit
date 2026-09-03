import {
  annualAssetDepreciation,
  depreciationTotalForDateRange,
  isAssetDepreciatingInMonth,
  monthlyAssetDepreciation,
  monthlyDepreciationTotal,
  type CompanyAsset,
} from './asset-depreciation';

const asset: CompanyAsset = {
  id: 'asset-1',
  name: 'Generator',
  category: 'Generators',
  branchId: 'branch-a',
  initialCost: 1_300_000,
  endOfLifeValue: 100_000,
  usefulLifeYears: 5,
  acquiredOn: '2026-01-15',
  createdBy: 'Admin',
  createdAt: '2026-01-15T12:00:00.000Z',
  updatedBy: 'Admin',
  updatedAt: '2026-01-15T12:00:00.000Z',
};

describe('asset depreciation', () => {
  it('uses straight-line annual and monthly depreciation', () => {
    expect(annualAssetDepreciation(asset)).toBe(240_000);
    expect(monthlyAssetDepreciation(asset)).toBe(20_000);
  });

  it('does not depreciate before acquisition or after useful life', () => {
    expect(isAssetDepreciatingInMonth(asset, '2025-12')).toBe(false);
    expect(isAssetDepreciatingInMonth(asset, '2026-01')).toBe(true);
    expect(isAssetDepreciatingInMonth(asset, '2030-12')).toBe(true);
    expect(isAssetDepreciatingInMonth(asset, '2031-01')).toBe(false);
  });

  it('supports branch-scoped monthly totals', () => {
    const otherBranch = { ...asset, id: 'asset-2', branchId: 'branch-b', quantity: 2 };
    expect(monthlyDepreciationTotal([asset, otherBranch], '2026-09')).toBe(60_000);
    expect(monthlyDepreciationTotal([asset, otherBranch], '2026-09', 'branch-a')).toBe(20_000);
  });

  it('adds one depreciation charge for each month in a report range', () => {
    expect(depreciationTotalForDateRange([asset], '2026-01-01', '2026-03-31')).toBe(60_000);
  });
});