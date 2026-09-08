import { Redirect, Stack, usePathname } from 'expo-router';
import React from 'react';

import { SCREEN_ROUTES, useApp } from '@/context/AppContext';
import { canAccessWorkspaceRoute } from '@/lib/workspace-access';

export default function AppLayout() {
  const { role, staffId, isServerAuthenticated, isHydrated, navItems, roleAccess, userAccess } = useApp();
  const pathname = usePathname();

  // On a browser/native reload, wait for AsyncStorage and the saved auth token
  // before deciding that a deep link is unauthenticated. Redirecting earlier
  // destroys the requested route and sends a valid session back to Home.
  if (!isHydrated) return null;

  if (!role || !isServerAuthenticated) {
    return <Redirect href="/" />;
  }

  // Navigation is the first layer of access control, but Home cards and
  // deep links can also push a route directly. Enforce the same admin-managed
  // role/user permission at the route boundary.
  if (role !== 'admin') {
    if (!canAccessWorkspaceRoute(pathname, role, navItems, roleAccess, userAccess, staffId)) {
      const fallback = Object.values(SCREEN_ROUTES).find(route =>
        canAccessWorkspaceRoute(route, role, navItems, roleAccess, userAccess, staffId)
      );
      if (!fallback) return <Redirect href="/" />;
      return <Redirect href={fallback as never} />;
    }
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
