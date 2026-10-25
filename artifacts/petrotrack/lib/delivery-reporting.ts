export type DeliveryReportPeriod = 'all' | 'week' | 'month' | 'year';

export interface DeliveryReportRecord {
  dt: string;
  branchId?: string | null;
  prod: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function deliveryDateKey(value: string): string {
  return value.slice(0, 10);
}

function localCalendarDate(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function matchesDeliveryReportPeriod(value: string, anchor: string, period: DeliveryReportPeriod): boolean {
  if (period === 'all') return true;
  const deliveryKey = deliveryDateKey(value);
  const anchorKey = deliveryDateKey(anchor);
  if (period === 'month') return deliveryKey.slice(0, 7) === anchorKey.slice(0, 7);
  if (period === 'year') return deliveryKey.slice(0, 4) === anchorKey.slice(0, 4);

  const deliveryDate = localCalendarDate(deliveryKey);
  const anchorDate = localCalendarDate(anchorKey);
  if (!deliveryDate || !anchorDate) return false;
  const mondayOffset = (anchorDate.getDay() + 6) % 7;
  const weekStart = new Date(anchorDate);
  weekStart.setDate(anchorDate.getDate() - mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  return deliveryDate >= weekStart && deliveryDate < weekEnd;
}

export function deliveryMonthLabel(value: string): string {
  const key = deliveryDateKey(value);
  const month = Number(key.slice(5, 7));
  return MONTHS[month - 1] ? `${MONTHS[month - 1]} ${key.slice(0, 4)}` : key;
}

export function deliveryMonthKey(value: string): string {
  return deliveryDateKey(value).slice(0, 7);
}
