import type { PriceChange, Prices, Pump, PriceProduct } from '@/context/AppContext';

function currentProductPrice(prices: Prices, product: string, branchId?: string): number {
  const branchPrice = branchId ? prices.branchPrices?.[branchId]?.[product as PriceProduct] : undefined;
  if (typeof branchPrice === 'number' && branchPrice > 0) return branchPrice;
  const networkPrice = prices[product as keyof Omit<Prices, 'branchPrices'>];
  return typeof networkPrice === 'number' && networkPrice > 0 ? networkPrice : 0;
}

export function getPriceForPumpOnDate(
  pump: Pump,
  prices: Prices,
  priceHistory: PriceChange[],
  businessDate: string,
): number {
  const productKeys = pump.prod === 'LPG'
    ? [pump.lpgCategory === 'distributor' ? 'LPG_Distributor' : 'LPG_Single', 'LPG']
    : [pump.prod];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return productKeys.map(product => currentProductPrice(prices, product, pump.branchId)).find(price => price > 0) ?? 0;
  }
  for (const product of productKeys) {
    const productHistory = priceHistory.filter(change => change.prod === product);
    const branchHistory = productHistory.filter(change => change.branchId === pump.branchId);
    const applicableHistory = (branchHistory.length > 0
      ? branchHistory
      : productHistory.filter(change => !change.branchId))
      .sort((left, right) => left.dt.localeCompare(right.dt) || left.id - right.id);
    if (applicableHistory.length === 0) {
      const current = currentProductPrice(prices, product, pump.branchId);
      if (current > 0) return current;
      continue;
    }
    const effective = applicableHistory.filter(change => change.dt.slice(0, 10) <= businessDate).at(-1);
    if (effective?.newPrice && effective.newPrice > 0) return effective.newPrice;
    const earliest = applicableHistory[0];
    if (earliest.oldPrice > 0) return earliest.oldPrice;
  }
  return productKeys.map(product => currentProductPrice(prices, product, pump.branchId)).find(price => price > 0) ?? 0;
}
