import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { vmNotifications } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { VesselNotification } from '@/lib/types';

const NOTIF_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  enquiry_received: 'mail-outline',
  terms_updated: 'refresh-outline',
  party_confirmed: 'checkmark-circle-outline',
  charter_active: 'boat-outline',
  charter_terminated: 'close-circle-outline',
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();

  const { data: notifs, isLoading, refetch } = useQuery({
    queryKey: ['vessel-notifications'],
    queryFn: async () => {
      const { data } = await vmNotifications.list();
      return data ?? [];
    },
    enabled: isAuthenticated,
  });

  const unreadCount = notifs?.filter(n => !n.read).length ?? 0;

  const markAllRead = async () => {
    await vmNotifications.markAllRead();
    qc.invalidateQueries({ queryKey: ['vessel-notifications'] });
  };

  const markRead = async (id: number) => {
    await vmNotifications.markRead(id);
    qc.invalidateQueries({ queryKey: ['vessel-notifications'] });
  };

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <View style={styles.header}><Text style={styles.headerTitle}>Notifications</Text></View>
        <View style={styles.centered}>
          <Ionicons name="notifications-off-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Sign in for alerts</Text>
          <Pressable style={styles.loginBtn} onPress={() => router.push('/auth/login')}>
            <Text style={styles.loginBtnText}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <Pressable onPress={markAllRead} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}

      {!isLoading && (
        <FlatList
          data={notifs}
          keyExtractor={n => String(n.id)}
          renderItem={({ item }) => (
            <NotifItem notif={item} onRead={() => markRead(item.id)} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!(notifs && notifs.length > 0)}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="notifications-outline" size={64} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No notifications</Text>
              <Text style={styles.emptyText}>Charter activity will appear here</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function NotifItem({ notif, onRead }: { notif: VesselNotification; onRead: () => void }) {
  const icon = NOTIF_ICONS[notif.type] ?? 'notifications-outline';
  return (
    <Pressable
      style={[styles.notifCard, !notif.read && styles.unread]}
      onPress={() => {
        if (!notif.read) onRead();
        if (notif.relatedId) router.push(`/charter/${notif.relatedId}`);
      }}
    >
      <View style={[styles.iconWrap, !notif.read && styles.iconWrapUnread]}>
        <Ionicons name={icon} size={20} color={notif.read ? Colors.textMuted : Colors.primary} />
      </View>
      <View style={styles.notifContent}>
        <Text style={[styles.notifTitle, !notif.read && styles.unreadTitle]}>{notif.title}</Text>
        <Text style={styles.notifMessage} numberOfLines={2}>{notif.message}</Text>
        <Text style={styles.notifDate}>{new Date(notif.createdAt).toLocaleString()}</Text>
      </View>
      {!notif.read && <View style={styles.dot} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.navy, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  markAllBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  markAllText: { color: Colors.accentLight, fontSize: 13, fontFamily: 'Inter_500Medium' },
  list: { paddingTop: 8, paddingBottom: 24 },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 12,
  },
  unread: { backgroundColor: '#EEF3FB' },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.greyLight, alignItems: 'center', justifyContent: 'center' },
  iconWrapUnread: { backgroundColor: Colors.borderLight },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginBottom: 2, fontFamily: 'Inter_600SemiBold' },
  unreadTitle: { color: Colors.text },
  notifMessage: { fontSize: 13, color: Colors.textMuted, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  notifDate: { fontSize: 11, color: Colors.textMuted, marginTop: 4, fontFamily: 'Inter_400Regular' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 6 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginTop: 16, fontFamily: 'Inter_700Bold' },
  emptyText: { fontSize: 14, color: Colors.textMuted, marginTop: 8, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  loginBtn: { marginTop: 24, backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 12, borderRadius: Colors.radius },
  loginBtnText: { color: Colors.textInverse, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
});
