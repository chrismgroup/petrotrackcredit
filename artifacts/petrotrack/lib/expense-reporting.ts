export type ExpenseReportPeriod = 'all' | 'date' | 'week' | 'month' | 'quarter' | 'year';

function dateKey(value: string): string {
  return value.slice(0, 10);
}

function localCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey(value));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function matchesExpenseReportPeriod(value: string, anchor: string, period: ExpenseReportPeriod): boolean {
  if (period === 'all') return true;
  const expenseKey = dateKey(value);
  const anchorKey = dateKey(anchor);
  if (period === 'date') return expenseKey === anchorKey;
  if (period === 'month') return expenseKey.slice(0, 7) === anchorKey.slice(0, 7);
  if (period === 'year') return expenseKey.slice(0, 4) === anchorKey.slice(0, 4);
  if (period === 'quarter') {
    const expenseMonth = Number(expenseKey.slice(5, 7));
    const anchorMonth = Number(anchorKey.slice(5, 7));
    return expenseKey.slice(0, 4) === anchorKey.slice(0, 4)
      && Math.floor((expenseMonth - 1) / 3) === Math.floor((anchorMonth - 1) / 3);
  }

  const expenseDate = localCalendarDate(expenseKey);
  const anchorDate = localCalendarDate(anchorKey);
  if (!expenseDate || !anchorDate) return false;
  const mondayOffset = (anchorDate.getDay() + 6) % 7;
  const weekStart = new Date(anchorDate);
  weekStart.setDate(anchorDate.getDate() - mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  return expenseDate >= weekStart && expenseDate < weekEnd;
}

export function expenseReportPeriodLabel(anchor: string, period: ExpenseReportPeriod): string {
  if (period === 'all') return 'All-time records';
  const key = dateKey(anchor);
  const year = key.slice(0, 4);
  const month = Number(key.slice(5, 7));
  if (period === 'date') return key;
  if (period === 'year') return year;
  if (period === 'quarter') return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
  if (period === 'month') {
    const label = new Date(Number(year), month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return label;
  }
  const anchorDate = localCalendarDate(key);
  if (!anchorDate) return key;
  const mondayOffset = (anchorDate.getDay() + 6) % 7;
  const start = new Date(anchorDate);
  start.setDate(anchorDate.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${dateKeyFromDate(start)} – ${dateKeyFromDate(end)}`;
}

function dateKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
