type ApprovalRoutes = {
  shift: string;
  receiving: string;
  reports: string;
};

export function getDashboardApprovalRoute(
  counts: { shiftReports: number; deliveries: number },
  routes: ApprovalRoutes,
  role?: string | null,
) {
  if (counts.shiftReports > 0) {
    const tab = role === "mgr"
      ? "review"
      : role === "acc"
        ? "pending_acc"
        : role === "att"
          ? "dashboard"
          : "all_records";
    return `${routes.shift}?tab=${tab}`;
  }
  if (counts.deliveries > 0) return routes.receiving;
  return routes.reports;
}