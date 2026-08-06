import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert, Modal, Platform, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { ModalSheet } from '@/components/FormSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ROLE_COLORS, ROLE_LABELS, UINFO, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

interface Props {
  title: string;
  rightAction?: React.ReactNode;
}

export function Header({ title, rightAction }: Props) {
  const { role, userName, logout, unreadCount, changeOwnPassword } = useApp();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [showMenu, setShowMenu] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);

  if (!role) return null;

  const roleColor = ROLE_COLORS[role] || colors.primary;
  const info = UINFO[role];
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const userInitials = userName
    ? userName.trim().split(/\s+/).filter(Boolean).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : (info?.initials || 'U');
  const unread = unreadCount();
  const isAdmin = role === 'admin';

  function handleLogout() {
    setShowMenu(false);
    logout();
    router.replace('/');
  }

  function openChangePw() {
    setShowMenu(false);
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
    setShowCur(false); setShowNew(false);
    setShowChangePw(true);
  }

  async function handleSavePassword() {
    if (!currentPw.trim()) { Alert.alert('Required', 'Enter your current password.'); return; }
    if (!newPw.trim()) { Alert.alert('Required', 'Enter a new password.'); return; }
    if (newPw.trim().length < 6) { Alert.alert('Too Short', 'New password must be at least 6 characters.'); return; }
    if (newPw.trim() !== confirmPw.trim()) { Alert.alert('Mismatch', 'New password and confirmation do not match.'); return; }
    if (newPw.trim() === currentPw.trim()) { Alert.alert('Same Password', 'New password must be different from the current one.'); return; }
    const ok = await changeOwnPassword(currentPw.trim(), newPw.trim());
    if (!ok) { Alert.alert('Incorrect Password', 'Your current password is incorrect. Please try again.'); return; }
    setShowChangePw(false);
    Alert.alert('Password Changed', 'Your password has been updated successfully.');
  }

  return (
    <>
      {/* ── Main header bar ── */}
      <View style={[styles.container, {
        backgroundColor: roleColor,
        paddingTop: topPad + 12,
        shadowColor: roleColor,
      }]}>
        {/* Decorative circles for depth */}
        <View style={[styles.decCircle1, { backgroundColor: 'rgba(255,255,255,0.06)' }]} />
        <View style={[styles.decCircle2, { backgroundColor: 'rgba(255,255,255,0.04)' }]} />

        <View style={styles.row}>
          <View style={styles.titleSection}>
            <View style={styles.roleChip}>
              <Text style={styles.roleBadge}>{ROLE_LABELS[role]}</Text>
            </View>
            <Text style={styles.title}>{title}</Text>
          </View>
          <View style={styles.actions}>
            {rightAction}
            <TouchableOpacity
              style={[styles.homeBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
              onPress={() => router.replace('/(app)/home' as never)}
              accessibilityLabel="Go to Overview"
            >
              <Ionicons name="home-outline" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.notifBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
              onPress={() => router.replace('/(app)/messages' as never)}
            >
              <Ionicons name={unread > 0 ? 'notifications' : 'notifications-outline'} size={20} color="#fff" />
              {unread > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.20)' }]}
              onPress={() => router.replace('/(app)/profile' as never)}
              accessibilityLabel="Open My Profile"
            >
              <Text style={styles.avatarText}>{userInitials}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Profile menu ── */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border, top: topPad + 64 }]}>
            <View style={[styles.menuAvatar, { backgroundColor: roleColor }]}>
              <Text style={styles.menuAvatarText}>{userInitials}</Text>
            </View>
            <Text style={[styles.menuName, { color: colors.text }]}>{userName || info?.name}</Text>
            <Text style={[styles.menuRole, { color: colors.textMuted }]}>{ROLE_LABELS[role]}</Text>
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            {!isAdmin && (
              <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.surface }]} onPress={openChangePw}>
                <View style={[styles.menuItemIcon, { backgroundColor: colors.border }]}>
                  <Ionicons name="key-outline" size={16} color={colors.text} />
                </View>
                <Text style={[styles.menuItemText, { color: colors.text }]}>Change Password</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#FEE2E2' }]} onPress={handleLogout}>
              <View style={[styles.menuItemIcon, { backgroundColor: '#FCA5A5' }]}>
                <Ionicons name="log-out-outline" size={16} color={colors.error} />
              </View>
              <Text style={[styles.menuItemText, { color: colors.error }]}>Sign Out</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.error} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Change Password modal ── */}
      <ModalSheet visible={showChangePw} onClose={() => setShowChangePw(false)}>
        <View style={[styles.pwCard, { backgroundColor: colors.background }]}>
          <View style={styles.pwHeader}>
            <View style={[styles.pwIconBox, { backgroundColor: roleColor + '22' }]}>
              <Ionicons name="key" size={20} color={roleColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pwTitle, { color: colors.text }]}>Change Password</Text>
              <Text style={[styles.pwSub, { color: colors.textMuted }]}>@{userName}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowChangePw(false)}>
              <Ionicons name="close-circle" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Current Password</Text>
          <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
            <TextInput style={[styles.input, { color: colors.text }]} value={currentPw} onChangeText={setCurrentPw}
              placeholder="Your current password" placeholderTextColor={colors.textSubtle}
              secureTextEntry={!showCur} autoCapitalize="none" autoCorrect={false} />
            <TouchableOpacity onPress={() => setShowCur(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={showCur ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>New Password</Text>
          <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="lock-open-outline" size={16} color={colors.textMuted} />
            <TextInput style={[styles.input, { color: colors.text }]} value={newPw} onChangeText={setNewPw}
              placeholder="At least 6 characters" placeholderTextColor={colors.textSubtle}
              secureTextEntry={!showNew} autoCapitalize="none" autoCorrect={false} />
            <TouchableOpacity onPress={() => setShowNew(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Confirm New Password</Text>
          <View style={[styles.inputWrap, {
            backgroundColor: colors.surface,
            borderColor: confirmPw && newPw && confirmPw !== newPw ? colors.errorBorder : colors.border,
          }]}>
            <Ionicons name="checkmark-circle-outline" size={16} color={colors.textMuted} />
            <TextInput style={[styles.input, { color: colors.text }]} value={confirmPw} onChangeText={setConfirmPw}
              placeholder="Re-enter new password" placeholderTextColor={colors.textSubtle}
              secureTextEntry={!showNew} autoCapitalize="none" autoCorrect={false} />
            {confirmPw.length > 0 && (
              <Ionicons name={confirmPw === newPw ? 'checkmark-circle' : 'close-circle'} size={16}
                color={confirmPw === newPw ? colors.success : colors.error} />
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TouchableOpacity onPress={handleSavePassword}
              style={[styles.saveBtn, { backgroundColor: roleColor, flex: 1 }]} activeOpacity={0.85}>
              <Ionicons name="save-outline" size={16} color="#fff" />
              <Text style={styles.saveBtnText}>Update Password</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowChangePw(false)}
              style={[styles.cancelBtn, { borderColor: colors.border, flex: 0.55 }]} activeOpacity={0.8}>
              <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ModalSheet>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
    zIndex: 10,
  },
  decCircle1: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    top: -40, right: -30,
  },
  decCircle2: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    top: 20, right: 90,
  },
  row:          { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  titleSection: { flex: 1 },
  roleChip:     { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  roleBadge:    { color: 'rgba(255,255,255,0.65)', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600' },
  title:        { color: '#fff', fontSize: 23, fontWeight: '800', letterSpacing: -0.5 },
  actions:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  homeBtn:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  notifBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  notifBadge: {
    position: 'absolute', top: 4, right: 4, backgroundColor: '#F43F5E',
    width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
  },
  notifBadgeText: { color: '#fff', fontSize: 7, fontWeight: '800' },
  avatar:       { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { color: '#fff', fontSize: 13, fontWeight: '800' },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.40)' },
  menu: {
    position: 'absolute', right: 14, width: 230,
    borderRadius: 18, borderWidth: 1, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, elevation: 12, gap: 6,
  },
  menuAvatar:     { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 8 },
  menuAvatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  menuName:       { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  menuRole:       { fontSize: 12, textAlign: 'center', marginTop: 2 },
  menuDivider:    { height: 1, marginVertical: 10 },
  menuItem:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12 },
  menuItemIcon:   { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  menuItemText:   { flex: 1, fontSize: 14, fontWeight: '600' },
  pwCard:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 0 },
  pwHeader:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  pwIconBox:      { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pwTitle:        { fontSize: 16, fontWeight: '700' },
  pwSub:          { fontSize: 12, marginTop: 1 },
  fieldLabel:     { fontSize: 11, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrap:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, marginBottom: 14 },
  input:          { flex: 1, fontSize: 14 },
  saveBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  saveBtnText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn:      { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1 },
  cancelBtnText:  { fontSize: 14, fontWeight: '600' },
});
