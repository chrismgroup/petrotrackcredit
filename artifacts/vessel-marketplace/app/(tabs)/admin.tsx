import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  Alert, ActivityIndicator, Platform, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { vmAdmin } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { VesselUser } from '@/lib/types';

const ROLES = ['client', 'broker', 'owner', 'admin'] as const;

const ROLE_LABELS: Record<string, string> = {
  client: 'Client',
  broker: 'Broker',
  owner: 'Owner',
  admin: 'Admin',
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  client:  { bg: '#DBEAFE', text: '#1D4ED8' },
  broker:  { bg: '#EDE9FE', text: '#7C3AED' },
  owner:   { bg: '#D1FAE5', text: '#047857' },
  admin:   { bg: '#FEF3C7', text: '#B45309' },
};

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const { user: me, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [updating, setUpdating] = useState<number | null>(null);

  const { data: users, isLoading, refetch } = useQuery({
    queryKey: ['vessel-admin-users'],
    queryFn: async () => {
      const { data, error } = await vmAdmin.listUsers();
      if (error) throw new Error(error);
      return data ?? [];
    },
    enabled: isAdmin,
  });

  const changeRole = (targetUser: VesselUser, newRole: string) => {
    if (newRole === targetUser.role) return;
    if (targetUser.id === me?.id && newRole !== 'admin') {
      Alert.alert('Warning', 'Changing your own role will remove your admin access.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: () => doRoleChange(targetUser.id, newRole) },
      ]);
      return;
    }
    Alert.alert('Change Role', `Set ${targetUser.name} to ${ROLE_LABELS[newRole]}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => doRoleChange(targetUser.id, newRole) },
    ]);
  };

  const doRoleChange = async (id: number, role: string) => {
    setUpdating(id);
    const { error } = await vmAdmin.updateUserRole(id, role);
    setUpdating(null);
    if (error) { Alert.alert('Error', error); return; }
    qc.invalidateQueries({ queryKey: ['vessel-admin-users'] });
  };

  if (!isAdmin) {
    return (
      <View style={[styles.centered, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <Ionicons name="lock-closed" size={48} color={Colors.textMuted} />
        <Text style={styles.noAccessText}>Admin access required</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 0 : 0 }]}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 24 : insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <Text style={styles.headerSub}>User management · Nigerian Vessel Marketplace</Text>
      </View>

      <View style={styles.statsRow}>
        {ROLES.map(role => {
          const count = users?.filter(u => u.role === role).length ?? 0;
          const c = ROLE_COLORS[role];
          return (
            <View key={role} style={[styles.statCard, { backgroundColor: c.bg }]}>
              <Text style={[styles.statCount, { color: c.text }]}>{count}</Text>
              <Text style={[styles.statLabel, { color: c.text }]}>{ROLE_LABELS[role]}s</Text>
            </View>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={users ?? []}
          keyExtractor={u => String(u.id)}
          contentContainerStyle={{ padding: 12, paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} colors={[Colors.primary]} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.userCard}>
              <View style={styles.userInfo}>
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.userDetails}>
                  <Text style={styles.userName}>
                    {item.name}{item.id === me?.id ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.userEmail}>{item.email}</Text>
                  {item.company && <Text style={styles.userCompany}>{item.company}</Text>}
                </View>
                {updating === item.id && <ActivityIndicator size="small" color={Colors.primary} />}
              </View>
              <View style={styles.roleRow}>
                {ROLES.map(role => {
                  const active = item.role === role;
                  const c = ROLE_COLORS[role];
                  return (
                    <Pressable
                      key={role}
                      style={[styles.roleChip, active && { backgroundColor: c.bg, borderColor: c.text }]}
                      onPress={() => changeRole(item, role)}
                      disabled={updating === item.id}
                    >
                      <Text style={[styles.roleChipText, active && { color: c.text }]}>
                        {ROLE_LABELS[role]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.navy,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textInverse,
    fontFamily: 'Inter_700Bold',
  },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
  },
  statsRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: Colors.radiusSm,
    padding: 10,
    alignItems: 'center',
  },
  statCount: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  statLabel: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
  userCard: {
    backgroundColor: Colors.card,
    borderRadius: Colors.radius,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: Colors.textInverse,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  userDetails: { flex: 1 },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    fontFamily: 'Inter_600SemiBold',
  },
  userEmail: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  userCompany: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Colors.radiusFull,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  roleChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    fontFamily: 'Inter_600SemiBold',
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  noAccessText: {
    marginTop: 12,
    fontSize: 16,
    color: Colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
});
