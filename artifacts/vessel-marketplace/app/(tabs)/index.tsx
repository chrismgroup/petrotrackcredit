import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, ActivityIndicator, ScrollView, Platform, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { vmVessels } from '@/lib/api';
import { VesselCard } from '@/components/VesselCard';
import { VESSEL_TYPES } from '@/lib/types';
import type { Vessel } from '@/lib/types';
import type { VesselsFilter } from '@/lib/api';

const STATUS_FILTERS = ['All', 'Available', 'On Hire'];
const TYPE_SHORTCUTS = ['All', 'Tanker', 'Barge', 'MODU', 'FPSO', 'OSV', 'Ship'];

export default function BrowseScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');

  const filters: VesselsFilter = {
    search: search || undefined,
    status: statusFilter === 'All' ? undefined : statusFilter.toLowerCase().replace(' ', '_'),
    vesselType: typeFilter === 'All' ? undefined : typeFilter,
  };

  const { data: vessels, isLoading, error, refetch } = useQuery({
    queryKey: ['vessels', filters],
    queryFn: async () => {
      const { data, error } = await vmVessels.list(filters);
      if (error) throw new Error(error);
      return data ?? [];
    },
  });

  const headerHeight = 67 + 48 + 44 + 56;

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🇳🇬 Nigerian Vessel Market</Text>
        <Text style={styles.headerSub}>Browse available maritime vessels</Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search vessels, IMO, type..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          testID="search-input"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        {STATUS_FILTERS.map(s => (
          <Pressable
            key={s}
            style={[styles.chip, statusFilter === s && styles.chipActive]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>{s}</Text>
          </Pressable>
        ))}
        <View style={styles.divider} />
        {TYPE_SHORTCUTS.map(t => (
          <Pressable
            key={t}
            style={[styles.chip, typeFilter === t && styles.chipActive]}
            onPress={() => setTypeFilter(t)}
          >
            <Text style={[styles.chipText, typeFilter === t && styles.chipTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading vessels...</Text>
        </View>
      )}

      {error && !isLoading && (
        <View style={styles.centered}>
          <Ionicons name="warning-outline" size={48} color={Colors.danger} />
          <Text style={styles.errorText}>Failed to load vessels</Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {!isLoading && !error && (
        <FlatList
          data={vessels}
          keyExtractor={v => String(v.id)}
          renderItem={({ item }) => <VesselCard vessel={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!(vessels && vessels.length > 0)}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.accent} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="boat-outline" size={64} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No vessels found</Text>
              <Text style={styles.emptyText}>Try adjusting your search or filters</Text>
            </View>
          }
          ListHeaderComponent={
            vessels && vessels.length > 0 ? (
              <Text style={styles.count}>{vessels.length} vessel{vessels.length !== 1 ? 's' : ''} found</Text>
            ) : null
          }
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
    paddingVertical: 16,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2, fontFamily: 'Inter_400Regular' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: Colors.radius,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text, fontFamily: 'Inter_400Regular' },
  filterRow: { flexGrow: 0, marginBottom: 4 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Colors.radiusFull,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  chipTextActive: { color: Colors.textInverse },
  divider: { width: 1, height: '80%', backgroundColor: Colors.border, alignSelf: 'center', marginHorizontal: 2 },
  list: { paddingTop: 8, paddingBottom: 24 },
  count: { fontSize: 13, color: Colors.textMuted, paddingHorizontal: 20, paddingBottom: 8, fontFamily: 'Inter_500Medium' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingText: { marginTop: 16, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  errorText: { fontSize: 16, color: Colors.danger, marginTop: 12, textAlign: 'center' },
  retryBtn: { marginTop: 16, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: Colors.radius },
  retryText: { color: Colors.textInverse, fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginTop: 16, fontFamily: 'Inter_700Bold' },
  emptyText: { fontSize: 14, color: Colors.textMuted, marginTop: 8, fontFamily: 'Inter_400Regular' },
});
