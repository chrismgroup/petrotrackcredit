import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ROLE_COLORS, SCREEN_ROUTES, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const PRIMARY_TABS = [
  { id: 'home', label: 'Home', icon: 'home', route: SCREEN_ROUTES.home },
  { id: 'jobs', label: 'My Jobs', icon: 'briefcase', route: SCREEN_ROUTES.jobs },
  { id: 'messages', label: 'My Messages', icon: 'chatbubbles', route: SCREEN_ROUTES.messages },
  { id: 'profile', label: 'My Profile', icon: 'person', route: SCREEN_ROUTES.profile },
] as const;

const JOB_PATHS = [
  'jobs', 'operations', 'maintenance', 'tanks', 'receiving', 'sales', 'shift',
  'accounts', 'expenses', 'budget', 'reports', 'pump-report', 'tasks', 'users',
  'departments', 'branches', 'corporate', 'marketing', 'prices', 'audit',
  'system-settings', 'hr',
];

export function TabBar() {
  const { role } = useApp();
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  if (!role) return null;
  const roleColor = ROLE_COLORS[role] || colors.primary;

  function isActive(id: string): boolean {
    if (id === 'home') return pathname.includes('/home');
    if (id === 'messages') return pathname.includes('/messages') || pathname.includes('/comms');
    if (id === 'profile') return pathname.includes('/profile');
    return JOB_PATHS.some(path => pathname.includes(`/${path}`));
  }

  function navigate(route: string) {
    router.replace(route as never);
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
      {PRIMARY_TABS.map(item => {
        const active = isActive(item.id);
        return (
          <TouchableOpacity key={item.id} style={styles.tab} onPress={() => navigate(item.route)} activeOpacity={0.7}>
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
  tab: { flex: 1, minWidth: 82, alignItems: 'center', paddingVertical: 2, gap: 2 },
  iconPill: {
    width: 44, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 10, textAlign: 'center', letterSpacing: 0.1 },
});
