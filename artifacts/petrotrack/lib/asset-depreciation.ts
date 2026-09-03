export const ASSET_CATEGORIES = [
  'Vehicles',
  'Pumps',
  'Tanks',
  'Machines',
  'Generators',
  'Solar Systems',
  'Office Equipment',
  'Land',
  'Buildings',
  'Others',
] as const;

export type AssetCategory = typeof ASSET_CATEGORIES[number];

export interface CompanyAsset {
  id: string;
  name: string;
  category: AssetCategory;
  branchId: string;
  /** Number of identical units represented by this register row. Legacy rows default to one. */
  quantity?: number;
  initialCost: number;
  endOfLifeValue: number;
  usefulLifeYears: number;
  acquiredOn: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  /** Server-managed optimistic concurrency revision. Legacy rows start at zero. */
  revision?: number;
}

export type AssetInput = Omit<CompanyAsset, 'id' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt'>;

export function mergeCompanyAssetSnapshots(
  server: CompanyAsset[],
  local: CompanyAsset[],
  deletedIds: Iterable<string> = [],
): CompanyAsset[] {
  const serverIds = new Set(server.map(asset => asset.id));
  const deleted = new Set(deletedIds);
  return [
    ...server,
    ...local.filter(asset => asset.id && !serverIds.has(asset.id) && !deleted.has(asset.id)),
  ];
}

export function annualAssetDepreciation(asset: Pick<CompanyAsset, 'initialCost' | 'endOfLifeValue' | 'usefulLifeYears'>): number {
  if (!Number.isFinite(asset.usefulLifeYears) || asset.usefulLifeYears <= 0) return 0;
  return Math.max(0, asset.initialCost - asset.endOfLifeValue) / asset.usefulLifeYears;
}

export function monthlyAssetDepreciation(asset: Pick<CompanyAsset, 'initialCost' | 'endOfLifeValue' | 'usefulLifeYears'>): number {
  return annualAssetDepreciation(asset) / 12;
}

export function assetQuantity(asset: Pick<CompanyAsset, 'quantity'>): number {
  return Number.isInteger(asset.quantity) && (asset.quantity ?? 0) > 0 ? asset.quantity ?? 1 : 1;
}

export function isAssetDepreciatingInMonth(
  asset: Pick<CompanyAsset, 'acquiredOn' | 'usefulLifeYears'>,
  monthKey: string,
): boolean {
  const acquiredMonth = asset.acquiredOn.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(acquiredMonth) || !/^\d{4}-\d{2}$/.test(monthKey)) return false;
  const [startYear, startMonth] = acquiredMonth.split('-').map(Number);
  const [targetYear, targetMonth] = monthKey.split('-').map(Number);
  const elapsedMonths = ((targetYear - startYear) * 12) + targetMonth - startMonth;
  return elapsedMonths >= 0 && elapsedMonths < asset.usefulLifeYears * 12;
}

export function monthlyDepreciationTotal(
  assets: CompanyAsset[],
  monthKey: string,
  branchId?: string | null,
): number {
  return assets
    .filter(asset => (!branchId || asset.branchId === branchId) && isAssetDepreciatingInMonth(asset, monthKey))
    .reduce((total, asset) => total + (monthlyAssetDepreciation(asset) * assetQuantity(asset)), 0);
}

export function depreciationTotalForDateRange(
  assets: CompanyAsset[],
  fromDate: string,
  toDate: string,
  branchId?: string | null,
): number {
  const start = fromDate.slice(0, 7);
  const end = toDate.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end) || start > end) return 0;
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
  let cursor = (startYear * 12) + startMonth - 1;
  const last = (endYear * 12) + endMonth - 1;
  let total = 0;
  while (cursor <= last) {
    const year = Math.floor(cursor / 12);
    const month = (cursor % 12) + 1;
    total += monthlyDepreciationTotal(assets, `${year}-${String(month).padStart(2, '0')}`, branchId);
    cursor += 1;
  }
  return total;
}