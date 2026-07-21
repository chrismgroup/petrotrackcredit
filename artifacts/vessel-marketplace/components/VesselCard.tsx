import React from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '@/constants/colors';
import { StatusBadge } from './StatusBadge';
import type { Vessel, VesselPhoto } from '@/lib/types';

function getImageUrl(objectPath: string): string {
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
    return `${window.location.origin}/api/storage${objectPath}`;
  }
  const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? '';
  return `https://${DOMAIN}/api/storage${objectPath}`;
}

interface Props {
  vessel: Vessel;
}

export function VesselCard({ vessel }: Props) {
  const thumbUrl = vessel.firstPhotoPath ? getImageUrl(vessel.firstPhotoPath) : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => router.push(`/vessel/${vessel.id}`)}
      testID={`vessel-card-${vessel.id}`}
    >
      {thumbUrl && (
        <Image source={{ uri: thumbUrl }} style={styles.thumbnail} resizeMode="cover" />
      )}
      <View style={[styles.header, thumbUrl && styles.headerWithThumb]}>
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
    overflow: 'hidden',
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
  thumbnail: { width: '100%', height: 160 },
  header: { padding: 16, marginBottom: 0 },
  headerWithThumb: { paddingTop: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1, marginRight: 8 },
  imo: { fontSize: 11, color: Colors.textMuted },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8, paddingHorizontal: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: Colors.textSecondary },
  location: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 10, paddingHorizontal: 16 },
  locationText: { fontSize: 12, color: Colors.textMuted },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 10, paddingHorizontal: 16, paddingBottom: 16 },
  type: { fontSize: 12, color: Colors.primaryMid, fontWeight: '600' },
});
