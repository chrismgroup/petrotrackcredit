import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { vmCharters } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import type { CharterParty } from '@/lib/types';

export default function ChartersScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, user } = useAuth();

  const { data: charters, isLoading, refetch } = useQuery({
    queryKey: ['charter-parties'],
    queryFn: async () => {
      const { data } = await vmCharters.list();
      return data ?? [];
    },
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <View style={styles.header}><Text style={styles.headerTitle}>My Charters</Text></View>
        <View style={styles.centered}>
          <Ionicons name="document-text-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Sign in to view charters</Text>
          <Text style={styles.emptyText}>Log in to manage your charter parties</Text>
          <Pressable style={styles.loginBtn} onPress={() => router.push('/auth/login')}>
            <Text style={styles.loginBtnText}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View style={styles.header}><Text style={styles.headerTitle}>My Charters</Text></View>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}

      {!isLoading && (
        <FlatList
          data={charters}
          keyExtractor={c => String(c.id)}
          renderItem={({ item }) => <CharterCard charter={item} userId={user?.id ?? 0} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!(charters && charters.length > 0)}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="document-text-outline" size={64} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No charter parties yet</Text>
              <Text style={styles.emptyText}>Browse vessels to submit an enquiry</Text>
              <Pressable style={styles.browseBtn} onPress={() => router.push('/(tabs)')}>
                <Text style={styles.browseBtnText}>Browse Vessels</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </View>
  );
}

function CharterCard({ charter, userId }: { charter: CharterParty; userId: number }) {
  const isCharterer = charter.chartererId === userId;
  const myRole = isCharterer ? 'Charterer' : 'Vessel Owner';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      onPress={() => router.push(`/charter/${charter.id}`)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.vesselName} numberOfLines={1}>{charter.vesselName ?? `Vessel #${charter.vesselId}`}</Text>
        <StatusBadge type="charter" status={charter.status} small />
      </View>
      <Text style={styles.role}>Your role: {myRole}</Text>
      <View style={styles.cardMeta}>
        {charter.rate && (
          <Text style={styles.metaText}>
            {charter.rateCurrency ?? 'USD'} {Number(charter.rate).toLocaleString()} {charter.rateBasis ?? ''}
          </Text>
        )}
        {charter.durationDays && (
          <Text style={styles.metaText}>{charter.durationDays} days</Text>
        )}
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.date}>{new Date(charter.createdAt).toLocaleDateString()}</Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.navy, paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  list: { paddingTop: 12, paddingBottom: 24 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Colors.radius,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  vesselName: { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1, marginRight: 8, fontFamily: 'Inter_700Bold' },
  role: { fontSize: 12, color: Colors.textMuted, marginBottom: 8, fontFamily: 'Inter_400Regular' },
  cardMeta: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  metaText: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 10 },
  date: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginTop: 16, fontFamily: 'Inter_700Bold' },
  emptyText: { fontSize: 14, color: Colors.textMuted, marginTop: 8, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  loginBtn: { marginTop: 24, backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 12, borderRadius: Colors.radius },
  loginBtnText: { color: Colors.textInverse, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  browseBtn: { marginTop: 24, backgroundColor: Colors.primaryLight, paddingHorizontal: 24, paddingVertical: 10, borderRadius: Colors.radius },
  browseBtnText: { color: Colors.textInverse, fontFamily: 'Inter_600SemiBold' },
});
