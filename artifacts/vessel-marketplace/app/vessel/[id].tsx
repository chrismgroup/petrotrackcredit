import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { vmVessels } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/context/AuthContext';

const ALLOWED_STATUS = ['available', 'laid_up', 'decommissioned'];

export default function VesselDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated, isOwnerOrAdmin, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [statusLoading, setStatusLoading] = useState(false);

  const { data: vessel, isLoading, error } = useQuery({
    queryKey: ['vessel', id],
    queryFn: async () => {
      const { data, error } = await vmVessels.get(Number(id));
      if (error) throw new Error(error);
      return data;
    },
    enabled: !!id,
  });

  const canManage = vessel && (isAdmin || vessel.ownerId === user?.id);

  const changeStatus = async (status: string) => {
    if (!vessel) return;
    setStatusLoading(true);
    const { error } = await vmVessels.setStatus(vessel.id, status);
    setStatusLoading(false);
    if (error) { Alert.alert('Error', error); return; }
    qc.invalidateQueries({ queryKey: ['vessel', id] });
    qc.invalidateQueries({ queryKey: ['vessels'] });
    qc.invalidateQueries({ queryKey: ['my-vessels'] });
  };

  const handleStatusChange = () => {
    if (!vessel) return;
    const options = ALLOWED_STATUS.filter(s => s !== vessel.status);
    Alert.alert('Change Status', 'Select new vessel status', [
      ...options.map(s => ({
        text: s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
        onPress: () => changeStatus(s),
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (isLoading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  if (error || !vessel) {
    return (
      <View style={styles.centered}>
        <Ionicons name="warning-outline" size={48} color={Colors.danger} />
        <Text style={styles.errorText}>Vessel not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 24 }}>
      <View style={styles.hero}>
        <View style={styles.heroContent}>
          <Text style={styles.vesselName}>{vessel.name}</Text>
          {vessel.imoNumber && <Text style={styles.imo}>IMO: {vessel.imoNumber}</Text>}
          <StatusBadge type="vessel" status={vessel.status} />
        </View>
      </View>

      {canManage && (
        <View style={styles.actionRow}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => router.push(`/vessel/edit/${vessel.id}`)}
          >
            <Ionicons name="create-outline" size={18} color={Colors.primary} />
            <Text style={styles.actionBtnText}>Edit</Text>
          </Pressable>
          {vessel.status !== 'on_hire' && (
            <Pressable style={[styles.actionBtn, { opacity: statusLoading ? 0.5 : 1 }]} onPress={handleStatusChange} disabled={statusLoading}>
              <Ionicons name="swap-horizontal-outline" size={18} color={Colors.accent} />
              <Text style={[styles.actionBtnText, { color: Colors.accent }]}>Change Status</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Vessel Information</Text>
        <InfoRow label="Type" value={vessel.vesselType} />
        <InfoRow label="Flag" value={vessel.flag} />
        <InfoRow label="Year Built" value={vessel.yearBuilt ? String(vessel.yearBuilt) : undefined} />
        <InfoRow label="Owner" value={vessel.ownerName} />
        <InfoRow label="Classification" value={vessel.classificationSociety} />
        <InfoRow label="Trading Area" value={vessel.tradingArea} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Technical Specifications</Text>
        <InfoRow label="DWT" value={vessel.dwt ? `${Number(vessel.dwt).toLocaleString()} tonnes` : undefined} />
        <InfoRow label="GRT" value={vessel.grt ? `${Number(vessel.grt).toLocaleString()}` : undefined} />
        <InfoRow label="LOA" value={vessel.loa ? `${vessel.loa} m` : undefined} />
        <InfoRow label="Beam" value={vessel.beam ? `${vessel.beam} m` : undefined} />
        <InfoRow label="Draft" value={vessel.draft ? `${vessel.draft} m` : undefined} />
      </View>

      {vessel.description && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Description</Text>
          <Text style={styles.description}>{vessel.description}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Owner Contact</Text>
        {!isAuthenticated ? (
          <View style={styles.loginCta}>
            <Ionicons name="lock-closed-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.loginCtaText}>Sign in to view owner contact details</Text>
            <Pressable style={styles.loginCtaBtn} onPress={() => router.push('/auth/login')}>
              <Text style={styles.loginCtaBtnText}>Sign In</Text>
            </Pressable>
          </View>
        ) : vessel.contacts && vessel.contacts.length > 0 ? (
          vessel.contacts.map((c, i) => (
            <View key={c.id} style={[styles.contact, i > 0 && styles.contactBorder]}>
              <Text style={styles.contactName}>{c.contactName}</Text>
              {c.phone && <ContactItem icon="call-outline" value={c.phone} />}
              {c.email && <ContactItem icon="mail-outline" value={c.email} />}
              {c.address && <ContactItem icon="location-outline" value={c.address} />}
            </View>
          ))
        ) : (
          <Text style={styles.noContact}>No contact details listed</Text>
        )}
      </View>

      {isAuthenticated && vessel.status === 'available' && user?.id !== vessel.ownerId && (
        <Pressable
          style={styles.charterBtn}
          onPress={() => router.push(`/charter/new/${vessel.id}`)}
          testID="charter-btn"
        >
          <Ionicons name="document-text-outline" size={20} color={Colors.textInverse} />
          <Text style={styles.charterBtnText}>Submit Charter Enquiry</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ContactItem({ icon, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: string }) {
  return (
    <View style={styles.contactItem}>
      <Ionicons name={icon} size={14} color={Colors.textMuted} />
      <Text style={styles.contactValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  hero: { backgroundColor: Colors.navy, padding: 20, paddingBottom: 24 },
  heroContent: { gap: 8 },
  vesselName: { fontSize: 24, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  imo: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_400Regular' },
  actionRow: { flexDirection: 'row', gap: 12, padding: 16, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: Colors.radiusSm, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  actionBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary, fontFamily: 'Inter_600SemiBold' },
  card: { backgroundColor: Colors.card, margin: 12, marginBottom: 0, borderRadius: Colors.radius, padding: 16, borderWidth: 1, borderColor: Colors.borderLight },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Inter_700Bold' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  infoLabel: { fontSize: 14, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  infoValue: { fontSize: 14, color: Colors.text, fontWeight: '500', fontFamily: 'Inter_500Medium', flex: 1, textAlign: 'right' },
  description: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, fontFamily: 'Inter_400Regular' },
  loginCta: { alignItems: 'center', padding: 24, gap: 12 },
  loginCtaText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  loginCtaBtn: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: Colors.radius },
  loginCtaBtnText: { color: Colors.textInverse, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  contact: { paddingVertical: 12 },
  contactBorder: { borderTopWidth: 1, borderTopColor: Colors.borderLight },
  contactName: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 8, fontFamily: 'Inter_700Bold' },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  contactValue: { fontSize: 14, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  noContact: { fontSize: 14, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  charterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryMid,
    margin: 16,
    borderRadius: Colors.radius,
    paddingVertical: 16,
    gap: 10,
  },
  charterBtnText: { fontSize: 16, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  errorText: { marginTop: 12, color: Colors.danger, fontSize: 16 },
});
