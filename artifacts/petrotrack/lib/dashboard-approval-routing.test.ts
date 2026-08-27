import { getDashboardApprovalRoute } from './dashboard-approval-routing';

const routes = {
  shift: '/(app)/shift',
  receiving: '/(app)/receiving',
  reports: '/(app)/reports',
};

describe('getDashboardApprovalRoute', () => {
  it('opens the shift queue when pending shift reports exist', () => {
    expect(getDashboardApprovalRoute({ shiftReports: 2, deliveries: 3 }, routes))
      .toBe('/(app)/shift?tab=all_records');
  });

  it('opens receiving when only pending deliveries exist', () => {
    expect(getDashboardApprovalRoute({ shiftReports: 0, deliveries: 1 }, routes))
      .toBe('/(app)/receiving');
  });

  it('keeps the reporting route when there is no pending queue', () => {
    expect(getDashboardApprovalRoute({ shiftReports: 0, deliveries: 0 }, routes))
      .toBe('/(app)/reports');
  });
});