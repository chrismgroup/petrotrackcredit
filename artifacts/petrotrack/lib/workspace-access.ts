import type { NavItem, Role } from '@/context/AppContext';

export type WorkspaceRouteAccess = {
  path: string;
  permission?: string;
  adminOnly?: boolean;
  allowedRoles?: readonly Role[];
};

export const WORKSPACE_ROUTE_ACCESS: readonly WorkspaceRouteAccess[] = [
  { path: '/home', permission: 'home' },
  { path: '/jobs', permission: 'jobs' },
  { path: '/job-department', permission: 'jobs' },
  { path: '/messages', permission: 'messages' },
  { path: '/notifications', permission: 'notifications' },
  { path: '/profile', permission: 'profile' },
  { path: '/operations', permission: 'ops' },
  { path: '/tanks', permission: 'tanks' },
  { path: '/maintenance', permission: 'maint' },
  { path: '/receiving', permission: 'recv' },
  { path: '/stock-snapshot', permission: 'stockSnapshot' },
  { path: '/inventory', permission: 'inventory' },
  { path: '/sales', permission: 'sales' },
  { path: '/shift', permission: 'shift' },
  { path: '/pump-report', permission: 'pumpReport' },
  { path: '/accounts', permission: 'acct' },
  { path: '/customer-profile', permission: 'acct' },
  { path: '/daily-revenue-log', permission: 'dailyRevenueLog' },
  { path: '/branch-revenue-log', permission: 'branchRevenueLog' },
  { path: '/asset-management', permission: 'assets' },
  { path: '/expenses', permission: 'exp' },
  { path: '/budget', permission: 'budget' },
  { path: '/reports', permission: 'exprpt' },
  { path: '/credit-facility', permission: 'creditFacility', allowedRoles: ['admin', 'ceo', 'md'] },
  { path: '/pos-transactions', permission: 'posTransactions', allowedRoles: ['admin', 'ceo', 'md', 'acc', 'csm', 'mgr'] },
  { path: '/pos-terminals', permission: 'posTerminals', adminOnly: true },
  { path: '/marketing', permission: 'mktg' },
  { path: '/prices', permission: 'prices' },
  { path: '/hr', permission: 'hr' },
  { path: '/corporate', permission: 'corp' },
  { path: '/corporate-workspace', permission: 'corporateWorkspace' },
  { path: '/document-preview', permission: 'documentPreview' },
  { path: '/tasks', permission: 'tasks' },
  { path: '/action-items', permission: 'actionItems' },
  { path: '/branches', permission: 'branches' },
  { path: '/comms', permission: 'comms' },
  { path: '/users', permission: 'users' },
  { path: '/departments', permission: 'depts' },
  { path: '/audit', permission: 'audit' },
  { path: '/system-settings', permission: 'settings' },
] as const;

function pathnameMatches(pathname: string, protectedPath: string): boolean {
  const routePath = pathname.replace(/^\/\(app\)/, '').split(/[?#]/, 1)[0];
  return routePath === protectedPath || routePath.startsWith(`${protectedPath}/`);
}

export function workspaceRouteAccess(pathname: string): WorkspaceRouteAccess | undefined {
  return WORKSPACE_ROUTE_ACCESS.find(rule => pathnameMatches(pathname, rule.path));
}

export function canAccessWorkspaceRoute(
  pathname: string,
  role: Role,
  navItems: readonly Pick<NavItem, 'id'>[],
  roleAccess?: Readonly<Record<string, Readonly<Record<string, boolean>>>>,
  userAccess?: Readonly<Record<number, Readonly<Record<string, boolean>>>>,
  staffId?: number | null,
): boolean {
  if (role === 'admin') return true;
  const rule = workspaceRouteAccess(pathname);
  if (!rule) return false;
  if (rule.adminOnly) return false;
  if (rule.allowedRoles && !rule.allowedRoles.includes(role)) return false;
  if (!rule.permission) return true;
  if (staffId !== null && staffId !== undefined) {
    const override = userAccess?.[staffId]?.[rule.permission];
    if (override !== undefined) return override;
  }
  const roleGrant = roleAccess?.[role]?.[rule.permission];
  if (roleGrant !== undefined) return roleGrant;
  return navItems.some(item => item.id === rule.permission);
}
