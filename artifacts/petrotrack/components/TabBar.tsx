import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

  const bottomPad = Platform.OS === 'web' ? 30 : insets.bottom;

  return (
    <View style={[styles.container, {
      paddingBottom: bottomPad,
      backgroundColor: colors.surface,
      shadowColor: '#000',
    }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
      {navItems.map(item => {
        const active = isActive(item.id);
        return (
          <TouchableOpacity key={item.id} style={styles.tab} onPress={() => navigate(item.id)} activeOpacity={0.7}>
            <View style={[styles.iconPill, active && { backgroundColor: roleColor + '1A' }]}>
              <Ionicons
                name={(active ? item.icon : `${item.icon}-outline`) as any}
                size={22}
                color={active ? roleColor : colors.tabIconDefault}
              />
            </View>
            <Text style={[styles.label, {
              color: active ? roleColor : colors.tabIconDefault,
              fontWeight: active ? '700' : '500',
            }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 6,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 8,
  },
  scrollContent: { flexDirection: 'row', paddingHorizontal: 6 },
  tab: { width: 72, alignItems: 'center', paddingVertical: 2, gap: 2 },
  iconPill: {
    width: 44, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 10, textAlign: 'center', letterSpacing: 0.1 },
});
