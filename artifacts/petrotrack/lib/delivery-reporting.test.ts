import { deliveryMonthLabel, matchesDeliveryReportPeriod } from './delivery-reporting';

describe('delivery report periods', () => {
  it('matches a Monday-to-Sunday audit week without timezone shifts', () => {
    expect(matchesDeliveryReportPeriod('2026-10-19T12:00:00.000Z', '2026-10-21', 'week')).toBe(true);
    expect(matchesDeliveryReportPeriod('2026-10-25T23:59:00.000Z', '2026-10-21', 'week')).toBe(true);
    expect(matchesDeliveryReportPeriod('2026-10-26T00:00:00.000Z', '2026-10-21', 'week')).toBe(false);
  });

  it('matches monthly and yearly audit periods', () => {
    expect(matchesDeliveryReportPeriod('2026-10-01', '2026-10-21', 'month')).toBe(true);
    expect(matchesDeliveryReportPeriod('2026-09-30', '2026-10-21', 'month')).toBe(false);
    expect(matchesDeliveryReportPeriod('2026-01-01', '2026-10-21', 'year')).toBe(true);
    expect(matchesDeliveryReportPeriod('2025-10-21', '2026-10-21', 'year')).toBe(false);
  });

  it('formats a delivery month for report headings', () => {
    expect(deliveryMonthLabel('2026-10-21T12:00:00.000Z')).toBe('October 2026');
  });
});
