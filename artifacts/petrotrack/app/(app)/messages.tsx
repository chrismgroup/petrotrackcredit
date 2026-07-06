import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, ROLE_LABELS, UINFO, chatKey, useApp, type Role } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const ALL_ROLES: Role[] = ['admin', 'ceo', 'md', 'mktg', 'csm', 'acc', 'mgr', 'att'];

export default function MessagesScreen() {
  const { role, messages } = useApp();
  const colors = useColors();
  const router = useRouter();

  if (!role) return null;

  const roleColor = ROLE_COLORS[role] || colors.primary;
  const peers = ALL_ROLES.filter(r => r !== role);

  function getUnreadFromPeer(peer: Role): number {
    const key = chatKey(role!, peer);
    const msgs = messages[key];
    if (!Array.isArray(msgs)) return 0;
    return msgs.filter(m => m.to === role && !m.read).length;
  }

  function getLastMessage(peer: Role) {
    const key = chatKey(role!, peer);
    const msgs = messages[key];
    if (!Array.isArray(msgs) || msgs.length === 0) return null;
    return msgs[msgs.length - 1];
  }

  function openChat(peer: Role) {
    router.push({ pathname: '/(app)/chat/[peer]', params: { peer } });
  }

  return (
    <ScreenLayout title="Messages">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>CONVERSATIONS</Text>
        {peers.map(peer => {
          const info = UINFO[peer];
          const unread = getUnreadFromPeer(peer);
          const lastMsg = getLastMessage(peer);
          return (
            <TouchableOpacity
              key={peer}
              onPress={() => openChat(peer)}
              activeOpacity={0.8}
              style={[styles.contactCard, { backgroundColor: colors.card, borderColor: unread > 0 ? ROLE_COLORS[peer] + '55' : colors.border }]}
            >
              <View style={[styles.avatar, { backgroundColor: info.color }]}>
                <Text style={styles.avatarText}>{info.initials}</Text>
                {info.online && <View style={styles.onlineDot} />}
              </View>
              <View style={styles.contactInfo}>
                <View style={styles.contactRow}>
                  <Text style={[styles.contactName, { color: colors.text, fontWeight: unread > 0 ? '700' : '600' }]}>{info.name}</Text>
                  {lastMsg && <Text style={[styles.contactTime, { color: colors.textSubtle }]}>{lastMsg.ts}</Text>}
                </View>
                <View style={styles.previewRow}>
                  <Text style={[styles.contactRole, { color: ROLE_COLORS[peer] }]}>{ROLE_LABELS[peer]}</Text>
                </View>
                {lastMsg && (
                  <Text style={[styles.preview, { color: unread > 0 ? colors.text : colors.textMuted, fontWeight: unread > 0 ? '500' : '400' }]} numberOfLines={1}>
                    {lastMsg.from === role ? 'You: ' : ''}{lastMsg.type === 'req' ? '📦 Purchase request' : lastMsg.type === 'alert' ? '🚨 Alert' : lastMsg.body}
                  </Text>
                )}
              </View>
              {unread > 0 && (
                <View style={[styles.unreadBadge, { backgroundColor: ROLE_COLORS[peer] || roleColor }]}>
                  <Text style={styles.unreadText}>{unread}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 16 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' },
  contactCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  onlineDot: { position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: 6, backgroundColor: '#4CAF50', borderWidth: 2, borderColor: '#fff' },
  contactInfo: { flex: 1 },
  contactRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contactName: { fontSize: 15 },
  contactTime: { fontSize: 11 },
  previewRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  contactRole: { fontSize: 11, fontWeight: '600' },
  preview: { fontSize: 13, marginTop: 2 },
  unreadBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
