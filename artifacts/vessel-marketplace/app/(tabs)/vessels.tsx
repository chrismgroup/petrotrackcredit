import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { vmVessels } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import type { Vessel } from '@/lib/types';

export default function MyVesselsScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isOwnerOrAdmin, user } = useAuth();

  const { data: vessels, isLoading, refetch } = useQuery({
    queryKey: ['my-vessels', user?.id],
    queryFn: async () => {
      const { data } = await vmVessels.list();
      return (data ?? []).filter(v => user?.role === 'admin' || v.ownerId === user?.id);
    },
    enabled: isOwnerOrAdmin,
  });

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <View style={styles.header}><Text style={styles.headerTitle}>My Vessels</Text></View>
        <View style={styles.centered}>
          <Ionicons name="boat-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Sign in to manage vessels</Text>
          <Pressable style={styles.loginBtn} onPress={() => router.push('/auth/login')}>
            <Text style={styles.loginBtnText}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!isOwnerOrAdmin) {
    return (
      <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <View style={styles.header}><Text style={styles.headerTitle}>My Vessels</Text></View>
        <View style={styles.centered}>
          <Ionicons name="boat-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Owner access required</Text>
          <Text style={styles.emptyText}>Only vessel owners and admins can manage listings. Register as an owner to list your vessels.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{user?.role === 'admin' ? 'All Vessels (Admin)' : 'My Vessels'}</Text>
      </View>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}

      {!isLoading && (
        <FlatList
          data={vessels}
          keyExtractor={v => String(v.id)}
          renderItem={({ item }) => <MyVesselCard vessel={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!(vessels && vessels.length > 0)}
          onRefresh={refetch}
          refreshing={isLoading}
          ListHeaderComponent={
            <Pressable style={styles.addBtn} onPress={() => router.push('/vessel/add')} testID="add-vessel-btn">
              <Ionicons name="add" size={20} color={Colors.textInverse} />
              <Text style={styles.addBtnText}>Add New Vessel</Text>
            </Pressable>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="boat-outline" size={64} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No vessels listed yet</Text>
              <Text style={styles.emptyText}>Add your first vessel to the marketplace</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function MyVesselCard({ vessel }: { vessel: Vessel }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.vesselName} numberOfLines={1}>{vessel.name}</Text>
        <StatusBadge type="vessel" status={vessel.status} small />
      </View>
      <Text style={styles.vesselType}>{vessel.vesselType}</Text>
      {vessel.dwt && <Text style={styles.meta}>{Number(vessel.dwt).toLocaleString()} DWT</Text>}
      <View style={styles.cardActions}>
        <Pressable
          style={styles.editBtn}
          onPress={() => router.push(`/vessel/${vessel.id}`)}
        >
          <Ionicons name="eye-outline" size={16} color={Colors.primary} />
          <Text style={styles.editBtnText}>View</Text>
        </Pressable>
        <Pressable
          style={styles.editBtn}
          onPress={() => router.push(`/vessel/edit/${vessel.id}`)}
        >
          <Ionicons name="create-outline" size={16} color={Colors.accent} />
          <Text style={[styles.editBtnText, { color: Colors.accent }]}>Edit</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.navy, paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  list: { paddingVertical: 12, paddingHorizontal: 16 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Colors.radius,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 12,
  },
  addBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: 15, fontFamily: 'Inter_700Bold' },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Colors.radius,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  vesselName: { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1, marginRight: 8, fontFamily: 'Inter_700Bold' },
  vesselType: { fontSize: 13, color: Colors.primaryMid, fontFamily: 'Inter_500Medium', marginBottom: 4 },
  meta: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginBottom: 12 },
  cardActions: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 12 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtnText: { fontSize: 14, color: Colors.primary, fontFamily: 'Inter_600SemiBold' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginTop: 16, fontFamily: 'Inter_700Bold' },
  emptyText: { fontSize: 14, color: Colors.textMuted, marginTop: 8, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  loginBtn: { marginTop: 24, backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 12, borderRadius: Colors.radius },
  loginBtnText: { color: Colors.textInverse, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
});
