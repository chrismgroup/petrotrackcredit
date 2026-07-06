import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ROLE_COLORS, SCREEN_ROUTES, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const PATH_MAP: Record<string, string> = {
  home: 'home', users: 'users', depts: 'departments', audit: 'audit',
  settings: 'system-settings', ops: 'operations', tanks: 'tanks', acct: 'accounts',
  corp: 'corporate', branches: 'branches', maint: 'maintenance', sales: 'sales',
  budget: 'budget', exp: 'expenses', exprpt: 'reports', mktg: 'marketing', shift: 'shift',
};

export function TabBar() {
  const { role, navItems } = useApp();
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  if (!role) return null;
  const roleColor = ROLE_COLORS[role] || colors.primary;
  function isActive(id: string): boolean {
    const seg = PATH_MAP[id] || id;
    return pathname.includes(seg);
  }

  function navigate(id: string) {
    const route = SCREEN_ROUTES[id];
    if (route) router.replace(route as never);
  }

  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { borderTopColor: colors.border, paddingBottom: bottomPad, backgroundColor: colors.background }]}>
      {navItems.map(item => {
        const active = isActive(item.id);
        return (
          <TouchableOpacity key={item.id} style={styles.tab} onPress={() => navigate(item.id)} activeOpacity={0.7}>
            <Ionicons
              name={(active ? item.icon : `${item.icon}-outline`) as any}
              size={22}
              color={active ? roleColor : colors.textMuted}
            />
            <Text style={[styles.label, { color: active ? roleColor : colors.textMuted, fontWeight: active ? '700' : '400' }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  iconWrap: { position: 'relative' },
  badge: {
    position: 'absolute', top: -4, right: -8, minWidth: 16, height: 16,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  label: { fontSize: 10, textAlign: 'center' },
});
