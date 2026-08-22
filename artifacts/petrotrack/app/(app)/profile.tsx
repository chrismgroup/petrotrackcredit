import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ModalSheet } from '@/components/FormSheet';
import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, ROLE_LABELS, UINFO, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function ProfileScreen() {
  const { role, userName, branchId, staffId, navItems, unreadCount, changeOwnPassword, logout } = useApp();
  const colors = useColors();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  if (!role) return null;

  const roleColor = ROLE_COLORS[role] || colors.primary;
  const info = UINFO[role];
  const initials = (userName || info?.initials || 'U').split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase();

  async function savePassword() {
    if (!currentPw.trim() || !newPw.trim() || !confirmPw.trim()) {
      Alert.alert('Required', 'Complete all password fields.');
      return;
    }
    if (newPw.trim().length < 6) {
      Alert.alert('Too short', 'Your new password must be at least 6 characters.');
      return;
    }
    if (newPw.trim() !== confirmPw.trim()) {
      Alert.alert('Mismatch', 'New password and confirmation do not match.');
      return;
    }
    const ok = await changeOwnPassword(currentPw.trim(), newPw.trim());
    if (!ok) {
      Alert.alert('Incorrect password', 'Your current password is incorrect.');
      return;
    }
    setShowPassword(false);
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
    Alert.alert('Password changed', 'Your password has been updated.');
  }

  function signOut() {
    Alert.alert('Sign out?', 'You will need to sign in again to access Petrotrack.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { logout(); router.replace('/'); } },
    ]);
  }

  return (
    <ScreenLayout title="My Profile">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.profileHero, { backgroundColor: roleColor }]}>
          <View style={styles.heroOrb} />
          <View style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.18)' }]}><Text style={styles.avatarText}>{initials}</Text></View>
          <Text style={styles.name}>{userName || info?.name || 'Petrotrack user'}</Text>
          <Text style={styles.role}>{ROLE_LABELS[role]}</Text>
          <View style={styles.status}><View style={styles.statusDot} /><Text style={styles.statusText}>Account active</Text></View>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.text }]}>{navItems.length}</Text><Text style={[styles.statLabel, { color: colors.textMuted }]}>Available areas</Text></View>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.text }]}>{unreadCount()}</Text><Text style={[styles.statLabel, { color: colors.textMuted }]}>Unread messages</Text></View>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.text }]}>{staffId ?? '—'}</Text><Text style={[styles.statLabel, { color: colors.textMuted }]}>Staff ID</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Account details</Text>
          <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <DetailRow icon="shield-checkmark-outline" label="Role" value={ROLE_LABELS[role]} colors={colors} />
            <DetailRow icon="business-outline" label="Branch" value={branchId || 'All branches'} colors={colors} />
            <DetailRow icon="cloud-done-outline" label="Sync status" value="Cloud synced" colors={colors} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Security & account</Text>
          <View style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActionRow icon="key-outline" title="Change password" subtitle="Update your Petrotrack sign-in password" onPress={() => setShowPassword(true)} colors={colors} />
            <ActionRow icon="chatbubbles-outline" title="Open My Chats" subtitle="Chat with staff and message selected users" onPress={() => router.replace('/(app)/messages' as never)} colors={colors} />
            <ActionRow icon="log-out-outline" title="Sign out" subtitle="End this session on the device" onPress={signOut} colors={colors} destructive />
          </View>
        </View>

        <Text style={[styles.footer, { color: colors.textSubtle }]}>Petrotrack · Secure station operations</Text>
      </ScrollView>

      <ModalSheet visible={showPassword} onClose={() => setShowPassword(false)}>
        <View style={[styles.passwordSheet, { backgroundColor: colors.background }]}>
          <View style={styles.sheetTitleRow}><View style={[styles.sheetIcon, { backgroundColor: roleColor + '18' }]}><Ionicons name="key-outline" size={20} color={roleColor} /></View><View style={{ flex: 1 }}><Text style={[styles.sheetTitle, { color: colors.text }]}>Change password</Text><Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>Keep your account protected</Text></View><TouchableOpacity onPress={() => setShowPassword(false)}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity></View>
          <PasswordField label="Current password" value={currentPw} onChangeText={setCurrentPw} colors={colors} />
          <PasswordField label="New password" value={newPw} onChangeText={setNewPw} colors={colors} />
          <PasswordField label="Confirm new password" value={confirmPw} onChangeText={setConfirmPw} colors={colors} />
          <TouchableOpacity style={[styles.saveButton, { backgroundColor: roleColor }]} onPress={savePassword}><Text style={styles.saveButtonText}>Update password</Text><Ionicons name="arrow-forward" size={17} color="#fff" /></TouchableOpacity>
        </View>
      </ModalSheet>
    </ScreenLayout>
  );
}

function DetailRow({ icon, label, value, colors }: { icon: string; label: string; value: string; colors: any }) {
  return <View style={[styles.detailRow, { borderBottomColor: colors.border }]}><Ionicons name={icon as any} size={18} color={colors.primary} /><Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text><Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text></View>;
}

function ActionRow({ icon, title, subtitle, onPress, colors, destructive = false }: { icon: string; title: string; subtitle: string; onPress: () => void; colors: any; destructive?: boolean }) {
  const color = destructive ? colors.error : colors.primary;
  return <TouchableOpacity style={[styles.actionRow, { borderBottomColor: colors.border }]} onPress={onPress} activeOpacity={0.75}><View style={[styles.actionIcon, { backgroundColor: color + '14' }]}><Ionicons name={icon as any} size={18} color={color} /></View><View style={{ flex: 1 }}><Text style={[styles.actionTitle, { color: destructive ? colors.error : colors.text }]}>{title}</Text><Text style={[styles.actionSubtitle, { color: colors.textMuted }]}>{subtitle}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.textSubtle} /></TouchableOpacity>;
}

function PasswordField({ label, value, onChangeText, colors }: { label: string; value: string; onChangeText: (value: string) => void; colors: any }) {
  return <View style={{ marginBottom: 13 }}><Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text><View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.inputBorder }]}><Ionicons name="lock-closed-outline" size={16} color={colors.textSubtle} /><TextInput value={value} onChangeText={onChangeText} secureTextEntry placeholder="Enter password" placeholderTextColor={colors.textSubtle} style={[styles.input, { color: colors.text }]} /></View></View>;
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 34, gap: 20 },
  profileHero: { borderRadius: 24, alignItems: 'center', paddingVertical: 24, overflow: 'hidden', position: 'relative' },
  heroOrb: { position: 'absolute', width: 250, height: 250, borderRadius: 125, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', top: -165, right: -55 },
  avatar: { width: 76, height: 76, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  name: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 12 },
  role: { color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 3 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.13)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#86EFAC' },
  statusText: { color: '#E1F0E6', fontSize: 10, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 15, paddingVertical: 13, paddingHorizontal: 8, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 9, textAlign: 'center', marginTop: 4 },
  section: { gap: 9 },
  sectionTitle: { fontSize: 16, fontWeight: '800', paddingHorizontal: 2 },
  detailCard: { borderRadius: 17, borderWidth: 1, paddingHorizontal: 13 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  detailLabel: { fontSize: 12, width: 78 },
  detailValue: { flex: 1, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  actionCard: { borderRadius: 17, borderWidth: 1, paddingHorizontal: 13 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  actionIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: 13, fontWeight: '700' },
  actionSubtitle: { fontSize: 10, marginTop: 3 },
  footer: { fontSize: 10, textAlign: 'center', marginTop: 2 },
  passwordSheet: { padding: 22, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 22 },
  sheetIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 17, fontWeight: '800' },
  sheetSubtitle: { fontSize: 11, marginTop: 2 },
  fieldLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 14, paddingVertical: 12 },
  saveButton: { borderRadius: 13, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 5 },
  saveButtonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});