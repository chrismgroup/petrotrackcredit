import { canonicalProduct, type CanonicalProduct } from './product-identity';

export interface StockValueItem {
  branchId: string;
  product: unknown;
  quantity: number;
  unitCost: number;
}

export interface ProductStockValue {
  stock: number;
  value: number;
  unitCost: number;
}

export interface BranchStockValue {
  value: number;
  byProd: Partial<Record<CanonicalProduct, ProductStockValue>>;
}

/** Keeps every stock total isolated by the compound identity branch + product. */
export function aggregateStockValueByBranch(items: StockValueItem[]): Record<string, BranchStockValue> {
  const byBranch: Record<string, BranchStockValue> = {};
  for (const item of items) {
    const product = canonicalProduct(item.product);
    const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
    const unitCost = Number.isFinite(item.unitCost) ? item.unitCost : 0;
    if (!product) continue;

    const branch = byBranch[item.branchId] ?? { value: 0, byProd: {} };
    const productTotal = branch.byProd[product] ?? { stock: 0, value: 0, unitCost: 0 };
    productTotal.stock += quantity;
    productTotal.value += quantity * unitCost;
    productTotal.unitCost = productTotal.stock > 0 ? productTotal.value / productTotal.stock : 0;
    branch.value += quantity * unitCost;
    branch.byProd[product] = productTotal;
    byBranch[item.branchId] = branch;
  }
  return byBranch;
}
