import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { SCREEN_ROUTES, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { safeNotificationRoute } from '@/lib/navigation-routing';

function timeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-NG', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

function iconFor(type: string): keyof typeof Ionicons.glyphMap {
  if (type === 'report_attention') return 'document-text-outline';
  if (type === 'report_update') return 'checkmark-circle-outline';
  if (type === 'document_expiry') return 'calendar-outline';
  if (type === 'operational') return 'warning-outline';
  return 'notifications-outline';
}

export default function NotificationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const {
    role, notifications, markNotificationRead, markAllNotificationsRead,
  } = useApp();

  if (!role) return null;
  const unread = notifications.filter(item => !item.read).length;

  async function openNotification(id: number, data: Record<string, unknown> | null) {
    await markNotificationRead(id);
    router.push(safeNotificationRoute(data?.route) as never);
  }

  return (
    <ScreenLayout
      title="Notifications"
      rightAction={unread > 0 ? (
        <TouchableOpacity
          onPress={() => void markAllNotificationsRead()}
          style={styles.markAll}
          accessibilityLabel="Mark all notifications as read"
        >
          <Text style={styles.markAllText}>Mark all read</Text>
        </TouchableOpacity>
      ) : null}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.summaryIcon, { backgroundColor: colors.primary + '18' }]}>
            <Ionicons name="notifications" size={19} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryTitle, { color: colors.text }]}>Your alerts</Text>
            <Text style={[styles.summaryMeta, { color: colors.textMuted }]}>
              {unread > 0 ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'You are all caught up'}
            </Text>
          </View>
        </View>

        {notifications.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-outline" size={44} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No notifications yet</Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              Report updates and document expiry reminders will appear here and remain available after you reopen the app.
            </Text>
          </View>
        ) : (
          notifications.map(item => (
            <TouchableOpacity
              key={item.id}
              onPress={() => void openNotification(item.id, item.data)}
              activeOpacity={0.78}
              style={[
                styles.row,
                {
                  backgroundColor: item.read ? colors.surface : colors.primary + '0D',
                  borderColor: item.read ? colors.border : colors.primary + '55',
                },
              ]}
            >
              <View style={[styles.icon, { backgroundColor: item.read ? colors.border : colors.primary + '18' }]}>
                <Ionicons
                  name={iconFor(item.type)}
                  size={19}
                  color={item.read ? colors.textMuted : colors.primary}
                />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.titleRow}>
                  <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                  {!item.read ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
                </View>
                <Text style={[styles.body, { color: colors.textMuted }]}>{item.body}</Text>
                <Text style={[styles.time, { color: colors.textSubtle }]}>{timeLabel(item.createdAt)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={colors.textSubtle} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  summary: {
    borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row',
    alignItems: 'center', gap: 12, marginBottom: 4,
  },
  summaryIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontSize: 16, fontWeight: '800' },
  summaryMeta: { fontSize: 12, marginTop: 3 },
  markAll: { paddingHorizontal: 7, paddingVertical: 5 },
  markAllText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  row: {
    borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: 'row',
    alignItems: 'flex-start', gap: 11,
  },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { fontSize: 14, fontWeight: '800', flex: 1 },
  body: { fontSize: 13, lineHeight: 18 },
  time: { fontSize: 11, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  empty: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 80, gap: 9 },
  emptyTitle: { fontSize: 17, fontWeight: '800' },
  emptyBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
});