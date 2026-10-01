export const STOCK_PRODUCTS = ['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil'] as const;

export type CanonicalProduct = typeof STOCK_PRODUCTS[number];
export type ReportProduct = CanonicalProduct | 'Others';

/**
 * Converts only known product names and legacy aliases to a canonical value.
 * PMS and AGO deliberately have no fuzzy or substring relationship.
 */
export function canonicalProduct(value: unknown): CanonicalProduct | null {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[\s_-]+/g, ' ')
    .toUpperCase();

  switch (normalized) {
    case 'PMS': return 'PMS';
    case 'AGO': return 'AGO';
    case 'DPK': return 'DPK';
    case 'LPG':
    case 'LPG SINGLE':
    case 'LPG DISTRIBUTOR':
      return 'LPG';
    case 'LUBE':
    case 'LUBE OIL':
    case 'LUBRICANT':
    case 'LUBRICANTS':
      return 'Lube Oil';
    default:
      return null;
  }
}

export function canonicalReportProduct(value: unknown): ReportProduct | null {
  const product = canonicalProduct(value);
  if (product) return product;
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === 'OTHER' || normalized === 'OTHERS' ? 'Others' : null;
}

/**
 * Legacy sales rows stored only a pump label. Resolve those rows by complete
 * product tokens and reject ambiguous labels instead of assigning their value
 * to the wrong product.
 */
export function productFromLegacyLabel(value: unknown): ReportProduct | null {
  const exact = canonicalReportProduct(value);
  if (exact) return exact;

  const label = String(value ?? '').toUpperCase();
  const matches = new Set<ReportProduct>();
  if (/(^|[^A-Z0-9])PMS([^A-Z0-9]|$)/.test(label)) matches.add('PMS');
  if (/(^|[^A-Z0-9])AGO([^A-Z0-9]|$)/.test(label)) matches.add('AGO');
  if (/(^|[^A-Z0-9])DPK([^A-Z0-9]|$)/.test(label)) matches.add('DPK');
  if (/(^|[^A-Z0-9])LPG([^A-Z0-9]|$)/.test(label)) matches.add('LPG');
  if (/(^|[^A-Z0-9])(LUBE|LUBRICANTS?)([^A-Z0-9]|$)/.test(label)) matches.add('Lube Oil');
  if (/(^|[^A-Z0-9])OTHERS?([^A-Z0-9]|$)/.test(label)) matches.add('Others');
  return matches.size === 1 ? [...matches][0] : null;
}

export function resolveSalesProduct(entry: { product?: unknown; pump?: unknown }): ReportProduct | null {
  return canonicalReportProduct(entry.product) ?? productFromLegacyLabel(entry.pump);
}

export function isProduct(
  entry: { product?: unknown; pump?: unknown },
  expected: unknown,
): boolean {
  const canonicalExpected = canonicalReportProduct(expected);
  return canonicalExpected !== null && resolveSalesProduct(entry) === canonicalExpected;
}
