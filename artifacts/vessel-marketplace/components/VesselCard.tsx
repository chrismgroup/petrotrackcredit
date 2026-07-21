import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '@/constants/colors';
import { StatusBadge } from './StatusBadge';
import type { Vessel } from '@/lib/types';

interface Props {
  vessel: Vessel;
}

export function VesselCard({ vessel }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => router.push(`/vessel/${vessel.id}`)}
      testID={`vessel-card-${vessel.id}`}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>{vessel.name}</Text>
          <StatusBadge type="vessel" status={vessel.status} small />
        </View>
        {vessel.imoNumber && (
          <Text style={styles.imo}>IMO: {vessel.imoNumber}</Text>
        )}
      </View>

      <View style={styles.meta}>
        <MetaItem icon="boat-outline" value={vessel.vesselType} />
        {vessel.flag && <MetaItem icon="flag-outline" value={vessel.flag} />}
        {vessel.dwt && <MetaItem icon="barbell-outline" value={`${Number(vessel.dwt).toLocaleString()} DWT`} />}
        {vessel.yearBuilt && <MetaItem icon="calendar-outline" value={String(vessel.yearBuilt)} />}
      </View>

      {vessel.tradingArea && (
        <View style={styles.location}>
          <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.locationText}>{vessel.tradingArea}</Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.type}>{vessel.vesselType}</Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </View>
    </Pressable>
  );
}

function MetaItem({ icon, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={13} color={Colors.textMuted} />
      <Text style={styles.metaText}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  pressed: { opacity: 0.85 },
  header: { marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1, marginRight: 8 },
  imo: { fontSize: 11, color: Colors.textMuted },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: Colors.textSecondary },
  location: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 10 },
  locationText: { fontSize: 12, color: Colors.textMuted },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 10 },
  type: { fontSize: 12, color: Colors.primaryMid, fontWeight: '600' },
});
