import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ROLE_COLORS, ROLE_LABELS, UINFO, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

interface Props {
  title: string;
  rightAction?: React.ReactNode;
}

export function Header({ title, rightAction }: Props) {
  const { role, userName, logout, unreadCount } = useApp();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showMenu, setShowMenu] = useState(false);

  if (!role) return null;

  const roleColor = ROLE_COLORS[role] || colors.primary;
  const info = UINFO[role];
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const unread = unreadCount();

  function handleLogout() {
    setShowMenu(false);
    logout();
    router.replace('/');
  }

  return (
    <>
      <View style={[styles.container, { backgroundColor: roleColor, paddingTop: topPad + 10 }]}>
        <View style={styles.row}>
          <View style={styles.titleSection}>
            <Text style={styles.roleBadge}>{ROLE_LABELS[role]}</Text>
            <Text style={styles.title}>{title}</Text>
          </View>
          <View style={styles.actions}>
            {rightAction}
            {unread > 0 && (
              <TouchableOpacity style={styles.notifBtn} onPress={() => router.replace('/(app)/messages' as never)}>
                <Ionicons name="notifications" size={22} color="#fff" />
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.avatar} onPress={() => setShowMenu(true)}>
              <Text style={styles.avatarText}>{info?.initials || 'U'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border, top: topPad + 58 }]}>
            <View style={[styles.menuAvatar, { backgroundColor: roleColor }]}>
              <Text style={styles.menuAvatarText}>{info?.initials || 'U'}</Text>
            </View>
            <Text style={[styles.menuName, { color: colors.text }]}>{info?.name || userName}</Text>
            <Text style={[styles.menuRole, { color: colors.textMuted }]}>{ROLE_LABELS[role]}</Text>
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={18} color={colors.error} />
              <Text style={[styles.menuItemText, { color: colors.error }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  titleSection: { flex: 1 },
  roleBadge: { color: 'rgba(255,255,255,0.7)', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notifBtn: { position: 'relative' },
  notifBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#E24B4A', width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  notifBadgeText: { color: '#fff', fontSize: 8, fontWeight: '700' },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  menu: { position: 'absolute', right: 14, width: 220, borderRadius: 14, borderWidth: 1, padding: 16, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, elevation: 8 },
  menuAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 10 },
  menuAvatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  menuName: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  menuRole: { fontSize: 12, textAlign: 'center', marginTop: 2 },
  menuDivider: { height: 1, marginVertical: 12 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  menuItemText: { fontSize: 14, fontWeight: '600' },
});
