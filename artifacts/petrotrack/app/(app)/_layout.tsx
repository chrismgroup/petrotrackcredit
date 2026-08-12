import { Redirect, Stack, usePathname } from 'expo-router';
import React from 'react';

import { SCREEN_ROUTES, useApp } from '@/context/AppContext';

const ROUTE_ACCESS: Record<string, string> = {
  '/operations': 'ops',
  '/tanks': 'ops',
  '/maintenance': 'ops',
  '/receiving': 'recv',
  '/sales': 'sales',
  '/shift': 'shift',
  '/pump-report': 'shift',
  '/accounts': 'acct',
  '/expenses': 'exp',
  '/budget': 'budget',
  '/reports': 'exprpt',
  '/marketing': 'mktg',
  '/prices': 'prices',
  '/hr': 'hr',
  '/corporate': 'corp',
  '/tasks': 'tasks',
  '/branches': 'branches',
  '/comms': 'comms',
};
const ADMIN_ONLY_ROUTES = ['/departments', '/audit', '/system-settings'];
const STAFF_ACCOUNT_ROLES = new Set(['admin', 'csm', 'md']);

export default function AppLayout() {
  const { role, isServerAuthenticated, navItems } = useApp();
  const pathname = usePathname();

  if (!role || !isServerAuthenticated) {
    return <Redirect href="/" />;
  }

  // Navigation is the first layer of access control, but Home cards and
  // deep links can also push a route directly. Enforce the same admin-managed
  // role/user permission at the route boundary.
  if (role !== 'admin') {
    if (pathname.includes('/users') && !STAFF_ACCOUNT_ROLES.has(role)) {
      return <Redirect href={SCREEN_ROUTES.home as never} />;
    }
    if (ADMIN_ONLY_ROUTES.some(path => pathname.includes(path))) {
      return <Redirect href={SCREEN_ROUTES.home as never} />;
    }
    const requiredModule = Object.entries(ROUTE_ACCESS)
      .find(([path]) => pathname.includes(path))?.[1];
    if (requiredModule && !navItems.some(item => item.id === requiredModule)) {
      const fallback = navItems.find(item => SCREEN_ROUTES[item.id])?.id ?? 'home';
      return <Redirect href={(SCREEN_ROUTES[fallback] ?? SCREEN_ROUTES.home) as never} />;
    }
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
