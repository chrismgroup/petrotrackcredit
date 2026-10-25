import { expenseReportPeriodLabel, matchesExpenseReportPeriod } from './expense-reporting';

describe('expense audit periods', () => {
  it('matches an exact business date', () => {
    expect(matchesExpenseReportPeriod('2026-10-20T15:00:00Z', '2026-10-20', 'date')).toBe(true);
    expect(matchesExpenseReportPeriod('2026-10-19', '2026-10-20', 'date')).toBe(false);
  });

  it('uses Monday through Sunday for weekly reconciliation', () => {
    expect(matchesExpenseReportPeriod('2026-10-19', '2026-10-22', 'week')).toBe(true);
    expect(matchesExpenseReportPeriod('2026-10-25', '2026-10-22', 'week')).toBe(true);
    expect(matchesExpenseReportPeriod('2026-10-26', '2026-10-22', 'week')).toBe(false);
  });

  it('matches month, quarter and year boundaries', () => {
    expect(matchesExpenseReportPeriod('2026-10-01', '2026-10-20', 'month')).toBe(true);
    expect(matchesExpenseReportPeriod('2026-12-31', '2026-10-20', 'quarter')).toBe(true);
    expect(matchesExpenseReportPeriod('2026-09-30', '2026-10-20', 'quarter')).toBe(false);
    expect(matchesExpenseReportPeriod('2026-01-01', '2026-10-20', 'year')).toBe(true);
  });

  it('labels quarterly and all-time reports', () => {
    expect(expenseReportPeriodLabel('2026-10-20', 'quarter')).toBe('Q4 2026');
    expect(expenseReportPeriodLabel('2026-10-20', 'all')).toBe('All-time records');
  });
});
