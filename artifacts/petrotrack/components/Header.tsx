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
  const unread = unreadCount();
  const isAdmin = role === 'admin';

  function handleLogout() {
    setShowMenu(false);
    logout();
    router.replace('/');
  }

  function openChangePw() {
    setShowMenu(false);
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setShowCur(false);
    setShowNew(false);
    setShowChangePw(true);
  }

  async function handleSavePassword() {
    if (!currentPw.trim()) { Alert.alert('Required', 'Enter your current password.'); return; }
    if (!newPw.trim()) { Alert.alert('Required', 'Enter a new password.'); return; }
    if (newPw.trim().length < 6) { Alert.alert('Too Short', 'New password must be at least 6 characters.'); return; }
    if (newPw.trim() !== confirmPw.trim()) { Alert.alert('Mismatch', 'New password and confirmation do not match.'); return; }
    if (newPw.trim() === currentPw.trim()) { Alert.alert('Same Password', 'New password must be different from the current one.'); return; }

    const ok = await changeOwnPassword(currentPw.trim(), newPw.trim());
    if (!ok) {
      Alert.alert('Incorrect Password', 'Your current password is incorrect. Please try again.');
      return;
    }
    setShowChangePw(false);
    Alert.alert('Password Changed', 'Your password has been updated successfully.');
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

      {/* ── Profile menu ── */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border, top: topPad + 58 }]}>
            <View style={[styles.menuAvatar, { backgroundColor: roleColor }]}>
              <Text style={styles.menuAvatarText}>{info?.initials || 'U'}</Text>
            </View>
            <Text style={[styles.menuName, { color: colors.text }]}>{userName || info?.name}</Text>
            <Text style={[styles.menuRole, { color: colors.textMuted }]}>{ROLE_LABELS[role]}</Text>
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            {/* Change password — shown to all non-admin users */}
            {!isAdmin && (
              <TouchableOpacity style={styles.menuItem} onPress={openChangePw}>
                <Ionicons name="key-outline" size={18} color={colors.text} />
                <Text style={[styles.menuItemText, { color: colors.text }]}>Change Password</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={18} color={colors.error} />
              <Text style={[styles.menuItemText, { color: colors.error }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Change Password modal ── */}
      <ModalSheet visible={showChangePw} onClose={() => setShowChangePw(false)}>
          <View style={[styles.pwCard, { backgroundColor: colors.background }]}>
            {/* Header */}
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

            {/* Current password */}
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Current Password</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={currentPw}
                onChangeText={setCurrentPw}
                placeholder="Your current password"
                placeholderTextColor={colors.textSubtle}
                secureTextEntry={!showCur}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowCur(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={showCur ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* New password */}
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>New Password</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="lock-open-outline" size={16} color={colors.textMuted} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={newPw}
                onChangeText={setNewPw}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textSubtle}
                secureTextEntry={!showNew}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowNew(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Confirm new password */}
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Confirm New Password</Text>
            <View style={[styles.inputWrap, {
              backgroundColor: colors.surface,
              borderColor: confirmPw && newPw && confirmPw !== newPw ? colors.errorBorder : colors.border,
            }]}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.textMuted} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={confirmPw}
                onChangeText={setConfirmPw}
                placeholder="Re-enter new password"
                placeholderTextColor={colors.textSubtle}
                secureTextEntry={!showNew}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {confirmPw.length > 0 && (
                <Ionicons
                  name={confirmPw === newPw ? 'checkmark-circle' : 'close-circle'}
                  size={16}
                  color={confirmPw === newPw ? colors.success : colors.error}
                />
              )}
            </View>

            {/* Buttons */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity
                onPress={handleSavePassword}
                style={[styles.saveBtn, { backgroundColor: roleColor, flex: 1 }]}
                activeOpacity={0.85}
              >
                <Ionicons name="save-outline" size={16} color="#fff" />
                <Text style={styles.saveBtnText}>Update Password</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowChangePw(false)}
                style={[styles.cancelBtn, { borderColor: colors.border, flex: 0.55 }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
      </ModalSheet>
    </>
  );
}

const styles = StyleSheet.create({
  container:      { paddingHorizontal: 16, paddingBottom: 14 },
  row:            { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  titleSection:   { flex: 1 },
  roleBadge:      { color: 'rgba(255,255,255,0.7)', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  title:          { color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  actions:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notifBtn:       { position: 'relative' },
  notifBadge:     { position: 'absolute', top: -4, right: -4, backgroundColor: '#E24B4A', width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  notifBadgeText: { color: '#fff', fontSize: 8, fontWeight: '700' },
  avatar:         { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  avatarText:     { color: '#fff', fontSize: 13, fontWeight: '700' },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  menu:           { position: 'absolute', right: 14, width: 220, borderRadius: 14, borderWidth: 1, padding: 16, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, elevation: 8 },
  menuAvatar:     { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 10 },
  menuAvatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  menuName:       { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  menuRole:       { fontSize: 12, textAlign: 'center', marginTop: 2 },
  menuDivider:    { height: 1, marginVertical: 12 },
  menuItem:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  menuItemText:   { fontSize: 14, fontWeight: '600' },
  pwCard:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 0 },
  pwHeader:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  pwIconBox:      { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pwTitle:        { fontSize: 16, fontWeight: '700' },
  pwSub:          { fontSize: 12, marginTop: 1 },
  fieldLabel:     { fontSize: 11, fontWeight: '600', marginBottom: 6 },
  inputWrap:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, marginBottom: 14 },
  input:          { flex: 1, fontSize: 14 },
  saveBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  saveBtnText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn:      { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1 },
  cancelBtnText:  { fontSize: 14, fontWeight: '600' },
});
