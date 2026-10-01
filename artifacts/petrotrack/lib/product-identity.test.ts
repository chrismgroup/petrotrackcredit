import {
  canonicalProduct,
  isProduct,
  productFromLegacyLabel,
  resolveSalesProduct,
} from './product-identity';

describe('product identity', () => {
  it('keeps PMS, AGO, DPK, LPG, and lubricants as distinct canonical products', () => {
    expect(canonicalProduct('PMS')).toBe('PMS');
    expect(canonicalProduct('AGO')).toBe('AGO');
    expect(canonicalProduct('DPK')).toBe('DPK');
    expect(canonicalProduct('LPG_Distributor')).toBe('LPG');
    expect(canonicalProduct('Lubricant')).toBe('Lube Oil');
  });

  it('reads complete product tokens from legacy pump labels without substring matching', () => {
    expect(productFromLegacyLabel('Pump 2 (AGO)')).toBe('AGO');
    expect(productFromLegacyLabel('PMS Pump 1')).toBe('PMS');
    expect(productFromLegacyLabel('PMSAGO combined label')).toBeNull();
    expect(productFromLegacyLabel('Pump 1')).toBeNull();
  });

  it('uses the persisted product instead of a conflicting pump label', () => {
    const entry = { product: 'AGO', pump: 'Legacy PMS label' };
    expect(resolveSalesProduct(entry)).toBe('AGO');
    expect(isProduct(entry, 'AGO')).toBe(true);
    expect(isProduct(entry, 'PMS')).toBe(false);
  });

  it('rejects ambiguous legacy labels so their value is not assigned twice', () => {
    const entry = { pump: 'PMS / AGO shared meter' };
    expect(resolveSalesProduct(entry)).toBeNull();
    expect(isProduct(entry, 'PMS')).toBe(false);
    expect(isProduct(entry, 'AGO')).toBe(false);
  });
});
