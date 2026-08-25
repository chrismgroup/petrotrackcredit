import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ModalSheet } from '@/components/FormSheet';
import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, ROLE_LABELS, UINFO, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type InfoTopicKey = 'aboutApp' | 'aboutUs' | 'userPolicy' | 'dataPrivacy' | 'faq' | 'support' | 'contact';

const INFO_TOPICS: Array<{
  key: InfoTopicKey;
  icon: string;
  title: string;
  subtitle: string;
}> = [
  { key: 'aboutApp', icon: 'apps-outline', title: 'About the app', subtitle: 'What Petrotrack does for your station' },
  { key: 'aboutUs', icon: 'business-outline', title: 'About Chrism Group', subtitle: 'The company behind Petrotrack' },
  { key: 'userPolicy', icon: 'document-text-outline', title: 'User policy', subtitle: 'Your responsibilities when using Petrotrack' },
  { key: 'dataPrivacy', icon: 'lock-closed-outline', title: 'Data privacy', subtitle: 'How account and station data is handled' },
  { key: 'faq', icon: 'help-circle-outline', title: 'Frequently asked questions', subtitle: 'Quick answers about using the app' },
  { key: 'support', icon: 'headset-outline', title: 'Support', subtitle: 'Get help with a technical issue' },
  { key: 'contact', icon: 'mail-outline', title: 'Contact us', subtitle: 'Reach Chrism Group directly' },
];

const INFO_CONTENT: Record<InfoTopicKey, {
  title: string;
  intro: string;
  sections: Array<{ heading: string; body: string }>;
}> = {
  aboutApp: {
    title: 'About Petrotrack',
    intro: 'Petrotrack is a fuel-station management system designed to help teams run safer, more accurate and more accountable daily operations.',
    sections: [
      { heading: 'What Petrotrack brings together', body: 'The app connects branch operations, tank dips, deliveries, shift reports, stock logs, approvals, financial reporting, documents, messaging and notifications in one workspace.' },
      { heading: 'Built for real station work', body: 'Petrotrack supports business dates, role-based approvals and cloud synchronisation so teams can record what happened, review it and keep a reliable operational history.' },
      { heading: 'Designed by', body: 'Chrism Group (UK) Limited' },
    ],
  },
  aboutUs: {
    title: 'About Chrism Group',
    intro: 'Petrotrack is designed and maintained by Chrism Group (UK) Limited.',
    sections: [
      { heading: 'Our focus', body: 'Chrism Group builds practical digital tools that help organisations make better decisions, improve accountability and keep their teams connected.' },
      { heading: 'Our approach', body: 'We combine operational understanding with thoughtful technology, clear workflows and useful reporting. Petrotrack is designed to support station teams without losing sight of the people doing the work.' },
      { heading: 'Get in touch', body: 'For general enquiries, contact info@chrismgroup.com.' },
    ],
  },
  userPolicy: {
    title: 'User policy',
    intro: 'Petrotrack is a work system. Use it carefully, honestly and only for authorised station activities.',
    sections: [
      { heading: 'Use your own account', body: 'Keep your sign-in details private and do not use another person’s account. Sign out when using a shared device.' },
      { heading: 'Record accurate information', body: 'Enter tank readings, deliveries, shift reports, dates, quantities and approvals truthfully. Do not create duplicate, misleading or unauthorised records.' },
      { heading: 'Respect approval controls', body: 'Follow your assigned role and approval workflow. Do not attempt to bypass a review, alter an approved record outside the permitted correction process or approve your own work.' },
      { heading: 'Report concerns', body: 'Tell your manager or Petrotrack Support promptly about suspicious activity, incorrect records, lost access or a security concern.' },
    ],
  },
  dataPrivacy: {
    title: 'Data privacy',
    intro: 'Petrotrack uses operational and account information to provide secure station-management features.',
    sections: [
      { heading: 'Information used', body: 'This may include your account identity, role, branch assignment, operational records, approval history, messages, notifications and audit activity.' },
      { heading: 'Why it is used', body: 'Information is used to authenticate users, enforce role permissions, synchronise station data, support approvals, provide reports, maintain audit history and send relevant operational notifications.' },
      { heading: 'Your responsibility', body: 'Only enter information needed for legitimate station work. Do not add sensitive personal information to operational notes or chats unless it is necessary and authorised.' },
      { heading: 'Questions or requests', body: 'For privacy questions or requests about your information, contact info@chrismgroup.com. For access and technical issues, contact support.petrotrack@chrismgroup.com.' },
    ],
  },
  faq: {
    title: 'Frequently asked questions',
    intro: 'A few quick answers for everyday Petrotrack use.',
    sections: [
      { heading: 'Why can’t I edit an approved report?', body: 'Approved reports are locked to protect the audit trail. Use the authorised correction or return workflow, or ask an administrator for help.' },
      { heading: 'Why is a tank dip important?', body: 'An approved dip is the physical stock snapshot for that tank. It supports stock checks, variance review and current stock-value calculations.' },
      { heading: 'Why do I see a different screen from a colleague?', body: 'Petrotrack shows features based on your role and branch assignment. Ask your manager if your access appears incorrect.' },
      { heading: 'What should I do if data looks wrong?', body: 'Do not create a replacement record immediately. Capture the date and record details, then contact your manager or Petrotrack Support.' },
      { heading: 'How do I report a technical problem?', body: 'Email support.petrotrack@chrismgroup.com with your name, branch, a short description and the time the problem occurred. Do not send your password.' },
    ],
  },
  support: {
    title: 'Petrotrack Support',
    intro: 'We’re here to help with sign-in, synchronisation, permissions and app problems.',
    sections: [
      { heading: 'Support email', body: 'support.petrotrack@chrismgroup.com' },
      { heading: 'What to include', body: 'Please include your name, branch, device, the screen or workflow involved, what you expected to happen, what happened instead and any relevant record ID or business date.' },
      { heading: 'Keep your account safe', body: 'Never send your password, authentication code or private credentials by email or chat.' },
    ],
  },
  contact: {
    title: 'Contact Chrism Group',
    intro: 'For general enquiries, partnerships or information about Chrism Group (UK) Limited, contact us directly.',
    sections: [
      { heading: 'Email', body: 'info@chrismgroup.com' },
      { heading: 'For technical support', body: 'Use support.petrotrack@chrismgroup.com so your request reaches the Petrotrack support team.' },
    ],
  },
};

export default function ProfileScreen() {
  const { role, userName, branchId, staffId, navItems, unreadCount, changeOwnPassword, logout } = useApp();
  const colors = useColors();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [activeInfoTopic, setActiveInfoTopic] = useState<InfoTopicKey | null>(null);
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

  async function completeSignOut() {
    await logout();
    router.replace('/');
  }

  function signOut() {
    void completeSignOut();
  }

  async function openEmail(address: string) {
    const url = `mailto:${address}`;
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Email unavailable', `Please email ${address} from your mail app.`);
      return;
    }
    await Linking.openURL(url);
  }

  const activeInfo = activeInfoTopic ? INFO_CONTENT[activeInfoTopic] : null;

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

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Help & information</Text>
          <View style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {INFO_TOPICS.map(topic => (
              <ActionRow
                key={topic.key}
                icon={topic.icon}
                title={topic.title}
                subtitle={topic.subtitle}
                onPress={() => setActiveInfoTopic(topic.key)}
                colors={colors}
              />
            ))}
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

      <ModalSheet visible={Boolean(activeInfo)} onClose={() => setActiveInfoTopic(null)}>
        {activeInfo && (
          <View style={[styles.infoSheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetTitleRow}>
              <View style={[styles.sheetIcon, { backgroundColor: roleColor + '18' }]}>
                <Ionicons name={(INFO_TOPICS.find(topic => topic.key === activeInfoTopic)?.icon ?? 'information-circle-outline') as any} size={20} color={roleColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>{activeInfo.title}</Text>
                <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>Chrism Group (UK) Limited</Text>
              </View>
              <TouchableOpacity onPress={() => setActiveInfoTopic(null)} accessibilityLabel="Close information">
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.infoScroll}
              contentContainerStyle={styles.infoContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.infoIntro, { color: colors.text }]}>{activeInfo.intro}</Text>
              {activeInfo.sections.map(section => (
                <View key={section.heading} style={styles.infoSection}>
                  <Text style={[styles.infoHeading, { color: colors.text }]}>{section.heading}</Text>
                  <Text style={[styles.infoBody, { color: colors.textMuted }]}>{section.body}</Text>
                </View>
              ))}
              {(activeInfoTopic === 'support' || activeInfoTopic === 'contact') && (
                <TouchableOpacity
                  style={[styles.emailButton, { backgroundColor: roleColor }]}
                  onPress={() => void openEmail(activeInfoTopic === 'support' ? 'support.petrotrack@chrismgroup.com' : 'info@chrismgroup.com')}
                  accessibilityRole="button"
                  accessibilityLabel={activeInfoTopic === 'support' ? 'Email Petrotrack Support' : 'Email Chrism Group'}
                >
                  <Ionicons name="mail-outline" size={17} color="#fff" />
                  <Text style={styles.emailButtonText}>{activeInfoTopic === 'support' ? 'Email Support' : 'Email Chrism Group'}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        )}
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
  infoSheet: { maxHeight: '88%', padding: 22, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  infoScroll: { flexGrow: 0 },
  infoContent: { paddingBottom: 12 },
  infoIntro: { fontSize: 14, lineHeight: 21, fontWeight: '600', marginBottom: 20 },
  infoSection: { marginBottom: 18 },
  infoHeading: { fontSize: 13, fontWeight: '800', marginBottom: 6 },
  infoBody: { fontSize: 13, lineHeight: 20 },
  emailButton: { borderRadius: 13, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2 },
  emailButtonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
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