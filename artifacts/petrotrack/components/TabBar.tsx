import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ROLE_COLORS, SCREEN_ROUTES, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const PRIMARY_TABS = [
  { id: 'home', label: 'Home', icon: 'home', route: SCREEN_ROUTES.home },
  { id: 'jobs', label: 'My Jobs', icon: 'briefcase', route: SCREEN_ROUTES.jobs },
  { id: 'messages', label: 'My Chats', icon: 'chatbubbles', route: SCREEN_ROUTES.messages },
  { id: 'folder', label: 'My Documents', icon: 'folder', route: SCREEN_ROUTES.corp },
  { id: 'profile', label: 'My Profile', icon: 'person', route: SCREEN_ROUTES.profile },
] as const;

const JOB_PATHS = [
  'jobs', 'operations', 'maintenance', 'tanks', 'receiving', 'inventory', 'sales', 'shift',
  'accounts', 'asset-management', 'daily-revenue-log', 'branch-revenue-log',
  'stock-snapshot', 'expenses', 'budget', 'reports', 'pump-report', 'tasks', 'action-items', 'users',
  'departments', 'branches', 'marketing', 'prices', 'audit',
  'system-settings', 'hr',
];

export function TabBar() {
  const { role } = useApp();
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  if (!role) return null;
  const roleColor = ROLE_COLORS[role] || colors.primary;
  // My Folder remains a primary destination for every signed-in user because
  // General Library is public to all users; its sensitive sections are gated
  // inside the destination.
  const canOpenFolder = !!role;

  function isActive(id: string): boolean {
    if (id === 'home') return pathname.includes('/home');
    if (id === 'messages') return pathname.includes('/messages') || pathname.includes('/comms');
    if (id === 'folder') return pathname.includes('/corporate');
    if (id === 'profile') return pathname.includes('/profile');
    if (id === 'jobs') return JOB_PATHS.some(path => pathname.includes(`/${path}`));
    return false;
  }

  function navigate(route: string) {
    router.replace(route as never);
  }

  const bottomPad = Platform.OS === 'web' ? 30 : insets.bottom;
  const compact = width < 360;
  const navItems = PRIMARY_TABS.filter(item => item.id !== 'folder' || canOpenFolder);

  return (
    <View style={[styles.container, {
      paddingBottom: bottomPad,
      backgroundColor: colors.surface,
      shadowColor: '#000',
    }]}>
      <View style={styles.navRail}>
      {navItems.map(item => {
        const active = isActive(item.id);
        return (
          <TouchableOpacity
            key={item.id}
            style={[styles.tab, compact && styles.compactTab]}
            onPress={() => navigate(item.route)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
          >
            <View style={[styles.iconPill, compact && styles.compactIconPill, active && { backgroundColor: roleColor + '1A' }]}>
              <Ionicons
                name={(active ? item.icon : `${item.icon}-outline`) as any}
                size={compact ? 20 : 22}
                color={active ? roleColor : colors.tabIconDefault}
              />
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[styles.label, compact && styles.compactLabel, {
              color: active ? roleColor : colors.tabIconDefault,
              fontWeight: active ? '700' : '500',
            }]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 6,
    width: '100%',
    alignItems: 'center',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 8,
  },
  navRail: {
    width: '100%',
    maxWidth: 720,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    gap: 2,
  },
  compactTab: { paddingHorizontal: 0 },
  iconPill: {
    width: 44, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  compactIconPill: { width: 38, height: 28 },
  label: { width: '100%', fontSize: 10, textAlign: 'center', letterSpacing: 0.1 },
  compactLabel: { fontSize: 9 },
});
