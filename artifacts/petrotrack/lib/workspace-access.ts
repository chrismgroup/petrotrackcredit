import type { NavItem, Role } from '@/context/AppContext';

export type WorkspaceRouteAccess = {
  path: string;
  permission?: string;
  adminOnly?: boolean;
  allowedRoles?: readonly Role[];
};

export const WORKSPACE_ROUTE_ACCESS: readonly WorkspaceRouteAccess[] = [
  { path: '/operations', permission: 'ops' },
  { path: '/tanks', permission: 'ops' },
  { path: '/maintenance', permission: 'maint' },
  { path: '/receiving', permission: 'recv' },
  { path: '/stock-snapshot', permission: 'recv' },
  { path: '/inventory', permission: 'recv' },
  { path: '/sales', permission: 'sales' },
  { path: '/shift', permission: 'shift' },
  { path: '/pump-report', permission: 'shift' },
  { path: '/accounts', permission: 'acct' },
  { path: '/daily-revenue-log', permission: 'acct' },
  { path: '/branch-revenue-log', permission: 'acct' },
  { path: '/asset-management', permission: 'assets' },
  { path: '/expenses', permission: 'exp' },
  { path: '/budget', permission: 'budget' },
  { path: '/reports', permission: 'exprpt' },
  { path: '/marketing', permission: 'mktg' },
  { path: '/prices', permission: 'prices' },
  { path: '/hr', permission: 'hr' },
  { path: '/corporate', permission: 'corp' },
  { path: '/corporate-workspace', permission: 'corp' },
  { path: '/document-preview', permission: 'corp' },
  { path: '/tasks', permission: 'tasks' },
  { path: '/action-items', permission: 'actionItems' },
  { path: '/branches', permission: 'branches' },
  { path: '/call', permission: 'comms' },
  { path: '/comms', permission: 'comms' },
  { path: '/users', allowedRoles: ['admin', 'csm', 'md'] },
  { path: '/departments', adminOnly: true },
  { path: '/audit', adminOnly: true },
  { path: '/system-settings', adminOnly: true },
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
): boolean {
  if (role === 'admin') return true;
  const rule = workspaceRouteAccess(pathname);
  if (!rule) return true;
  if (rule.adminOnly) return false;
  if (rule.allowedRoles && !rule.allowedRoles.includes(role)) return false;
  return !rule.permission || navItems.some(item => item.id === rule.permission);
}