type ApprovalRoutes = {
  shift: string;
  receiving: string;
  reports: string;
};

export function getDashboardApprovalRoute(
  counts: { shiftReports: number; deliveries: number },
  routes: ApprovalRoutes,
) {
  if (counts.shiftReports > 0) return `${routes.shift}?tab=all_records`;
  if (counts.deliveries > 0) return routes.receiving;
  return routes.reports;
}