export type PosRangeKey = 'today' | '7d' | '30d';

export const POS_REFRESH_MS = 30_000;
export const POS_VIEW_ROLES: ReadonlySet<string> = new Set(['admin', 'ceo', 'md', 'acc', 'csm', 'mgr']);

export function formatKobo(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Parses a naira amount typed by a user into whole kobo, or null if invalid. */
export function nairaToKobo(input: string): number | null {
  const cleaned = input.replace(/[,\s₦]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const kobo = Math.round(Number(cleaned) * 100);
  return Number.isSafeInteger(kobo) && kobo > 0 ? kobo : null;
}

export function rangeStart(range: PosRangeKey, now: Date = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === '7d') start.setDate(start.getDate() - 6);
  if (range === '30d') start.setDate(start.getDate() - 29);
  return start;
}
