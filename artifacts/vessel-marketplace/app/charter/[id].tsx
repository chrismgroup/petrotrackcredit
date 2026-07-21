import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, Platform, TextInput } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { vmCharters } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { RATE_BASES } from '@/lib/types';

export default function CharterDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [loading, setLoading] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  const { data: charter, isLoading } = useQuery({
    queryKey: ['charter', id],
    queryFn: async () => {
      const { data: all } = await vmCharters.list();
      return all?.find(c => c.id === Number(id)) ?? null;
    },
    enabled: !!id,
  });

  const isOwner = charter?.ownerId === user?.id || isAdmin;
  const isCharterer = charter?.chartererId === user?.id;
  const canEdit = (isOwner || isCharterer) && ['enquiry', 'negotiating'].includes(charter?.status ?? '');
  const canConfirm = (isOwner || isCharterer) && ['enquiry', 'negotiating'].includes(charter?.status ?? '');
  const alreadyConfirmed = (isOwner && !!charter?.ownerConfirmedAt) || (isCharterer && !!charter?.chartererConfirmedAt);

  const startEdit = () => {
    if (!charter) return;
    setEditForm({
      rate: charter.rate ?? '',
      rateCurrency: charter.rateCurrency ?? 'USD',
      rateBasis: charter.rateBasis ?? '',
      laycanEarliest: charter.laycanEarliest ? charter.laycanEarliest.slice(0, 10) : '',
      laycanLatest: charter.laycanLatest ? charter.laycanLatest.slice(0, 10) : '',
      durationDays: charter.durationDays ? String(charter.durationDays) : '',
      cargoPurpose: charter.cargoPurpose ?? '',
      terms: charter.terms ?? '',
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!charter) return;
    setLoading('edit');
    const { error } = await vmCharters.update(charter.id, {
      rate: editForm.rate ? Number(editForm.rate) : undefined,
      rateCurrency: editForm.rateCurrency,
      rateBasis: editForm.rateBasis || undefined,
      laycanEarliest: editForm.laycanEarliest || undefined,
      laycanLatest: editForm.laycanLatest || undefined,
      durationDays: editForm.durationDays ? Number(editForm.durationDays) : undefined,
      cargoPurpose: editForm.cargoPurpose || undefined,
      terms: editForm.terms || undefined,
    } as any);
    setLoading(null);
    if (error) { Alert.alert('Error', error); return; }
    setEditing(false);
    qc.invalidateQueries({ queryKey: ['charter', id] });
    qc.invalidateQueries({ queryKey: ['charter-parties'] });
  };

  const confirm = async () => {
    if (!charter) return;
    setLoading('confirm');
    const { data, error } = await vmCharters.confirm(charter.id);
    setLoading(null);
    if (error) { Alert.alert('Error', error); return; }
    qc.invalidateQueries({ queryKey: ['charter', id] });
    qc.invalidateQueries({ queryKey: ['charter-parties'] });
    if (data?.status === 'active') {
      Alert.alert('Charter Active!', 'Both parties have confirmed. The vessel is now on hire.');
    } else {
      Alert.alert('Confirmed', 'Awaiting the other party\'s confirmation.');
    }
  };

  const decline = async () => {
    Alert.alert('Decline Charter?', 'This will decline the enquiry and notify the other party.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive',
        onPress: async () => {
          setLoading('decline');
          const { error } = await vmCharters.decline(charter!.id);
          setLoading(null);
          if (error) { Alert.alert('Error', error); return; }
          qc.invalidateQueries({ queryKey: ['charter', id] });
          qc.invalidateQueries({ queryKey: ['charter-parties'] });
          Alert.alert('Declined', 'The charter enquiry has been declined.');
        },
      },
    ]);
  };

  const terminate = async () => {
    Alert.alert('Terminate Hire?', 'This will return the vessel to available status.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Terminate', style: 'destructive',
        onPress: async () => {
          setLoading('terminate');
          const { error } = await vmCharters.terminate(charter!.id);
          setLoading(null);
          if (error) { Alert.alert('Error', error); return; }
          qc.invalidateQueries({ queryKey: ['charter', id] });
          qc.invalidateQueries({ queryKey: ['charter-parties'] });
        },
      },
    ]);
  };

  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  if (!charter) return <View style={styles.centered}><Text style={styles.errorText}>Charter not found</Text></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 24 }}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{charter.vesselName ?? `Vessel #${charter.vesselId}`}</Text>
        <StatusBadge type="charter" status={charter.status} />
        <Text style={styles.heroRole}>
          Your role: {charter.chartererId === user?.id ? 'Charterer' : 'Vessel Owner'}
        </Text>
      </View>

      {!editing ? (
        <>
          <View style={styles.card}>
            <Row label="Rate" value={charter.rate ? `${charter.rateCurrency} ${Number(charter.rate).toLocaleString()} ${charter.rateBasis ?? ''}` : 'Not specified'} />
            <Row label="Laycan Earliest" value={charter.laycanEarliest ? new Date(charter.laycanEarliest).toLocaleDateString() : 'Not specified'} />
            <Row label="Laycan Latest" value={charter.laycanLatest ? new Date(charter.laycanLatest).toLocaleDateString() : 'Not specified'} />
            <Row label="Duration" value={charter.durationDays ? `${charter.durationDays} days` : 'Not specified'} />
            <Row label="Cargo/Purpose" value={charter.cargoPurpose ?? 'Not specified'} />
          </View>

          {charter.terms && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Terms & Conditions</Text>
              <Text style={styles.terms}>{charter.terms}</Text>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Confirmation Status</Text>
            <ConfirmRow label="Owner" confirmed={!!charter.ownerConfirmedAt} date={charter.ownerConfirmedAt} />
            <ConfirmRow label="Charterer" confirmed={!!charter.chartererConfirmedAt} date={charter.chartererConfirmedAt} />
            {charter.hireStart && <Row label="Hire Start" value={new Date(charter.hireStart).toLocaleDateString()} />}
            {charter.hireEnd && <Row label="Hire End" value={new Date(charter.hireEnd).toLocaleDateString()} />}
          </View>

          <View style={styles.card}>
            <Row label="Charterer" value={charter.chartererName ?? `User #${charter.chartererId}`} />
            <Row label="Owner" value={charter.ownerName ?? `User #${charter.ownerId}`} />
            <Row label="Created" value={new Date(charter.createdAt).toLocaleDateString()} />
          </View>
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Edit Terms</Text>
          <EField label="Rate" value={editForm.rate} onChange={v => setEditForm(f => ({ ...f, rate: v }))} keyboardType="numeric" />
          <EField label="Currency" value={editForm.rateCurrency} onChange={v => setEditForm(f => ({ ...f, rateCurrency: v }))} />
          <Text style={styles.fieldLabel}>Rate Basis</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 14 }}>
            {RATE_BASES.map(rb => (
              <Pressable
                key={rb}
                style={[styles.chip, editForm.rateBasis === rb && styles.chipActive]}
                onPress={() => setEditForm(f => ({ ...f, rateBasis: rb }))}
              >
                <Text style={[styles.chipText, editForm.rateBasis === rb && styles.chipTextActive]}>{rb}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <EField label="Laycan Earliest (YYYY-MM-DD)" value={editForm.laycanEarliest} onChange={v => setEditForm(f => ({ ...f, laycanEarliest: v }))} />
          <EField label="Laycan Latest (YYYY-MM-DD)" value={editForm.laycanLatest} onChange={v => setEditForm(f => ({ ...f, laycanLatest: v }))} />
          <EField label="Duration (days)" value={editForm.durationDays} onChange={v => setEditForm(f => ({ ...f, durationDays: v }))} keyboardType="numeric" />
          <EField label="Cargo / Purpose" value={editForm.cargoPurpose} onChange={v => setEditForm(f => ({ ...f, cargoPurpose: v }))} />
          <EField label="Terms & Conditions" value={editForm.terms} onChange={v => setEditForm(f => ({ ...f, terms: v }))} multiline />
          <View style={styles.editActions}>
            <Pressable style={styles.cancelBtn} onPress={() => setEditing(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.saveBtn, loading === 'edit' && { opacity: 0.6 }]} onPress={saveEdit} disabled={loading === 'edit'}>
              {loading === 'edit' ? <ActivityIndicator color={Colors.textInverse} size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.actions}>
        {canEdit && !editing && (
          <Pressable style={styles.editBtn} onPress={startEdit}>
            <Ionicons name="create-outline" size={18} color={Colors.accent} />
            <Text style={styles.editBtnText}>Propose Changes</Text>
          </Pressable>
        )}

        {canConfirm && !alreadyConfirmed && !editing && (
          <Pressable
            style={[styles.confirmBtn, loading === 'confirm' && { opacity: 0.6 }]}
            onPress={confirm}
            disabled={loading === 'confirm'}
            testID="confirm-charter-btn"
          >
            {loading === 'confirm' ? <ActivityIndicator color={Colors.textInverse} size="small" /> : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color={Colors.textInverse} />
                <Text style={styles.confirmBtnText}>Confirm Agreement</Text>
              </>
            )}
          </Pressable>
        )}

        {alreadyConfirmed && ['enquiry', 'negotiating'].includes(charter.status) && (
          <View style={styles.awaitingBanner}>
            <Ionicons name="time-outline" size={18} color={Colors.success} />
            <Text style={styles.awaitingText}>Awaiting other party's confirmation</Text>
          </View>
        )}

        {(isOwner || isCharterer) && ['enquiry', 'negotiating'].includes(charter.status) && (
          <Pressable
            style={[styles.declineBtn, loading === 'decline' && { opacity: 0.6 }]}
            onPress={decline}
            disabled={loading === 'decline'}
            testID="decline-charter-btn"
          >
            {loading === 'decline' ? <ActivityIndicator color={Colors.danger} size="small" /> : (
              <>
                <Ionicons name="close-outline" size={18} color={Colors.danger} />
                <Text style={styles.declineBtnText}>Decline</Text>
              </>
            )}
          </Pressable>
        )}

        {isOwner && charter.status === 'active' && (
          <Pressable
            style={[styles.terminateBtn, loading === 'terminate' && { opacity: 0.6 }]}
            onPress={terminate}
            disabled={loading === 'terminate'}
          >
            {loading === 'terminate' ? <ActivityIndicator color={Colors.textInverse} size="small" /> : (
              <>
                <Ionicons name="close-circle-outline" size={18} color={Colors.textInverse} />
                <Text style={styles.terminateBtnText}>Terminate Hire</Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ConfirmRow({ label, confirmed, date }: { label: string; confirmed: boolean; date: string | null }) {
  return (
    <View style={styles.confirmRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.confirmStatus}>
        <Ionicons name={confirmed ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={confirmed ? Colors.success : Colors.textMuted} />
        <Text style={[styles.confirmText, { color: confirmed ? Colors.success : Colors.textMuted }]}>
          {confirmed ? `Confirmed ${date ? new Date(date).toLocaleDateString() : ''}` : 'Pending'}
        </Text>
      </View>
    </View>
  );
}

function EField({ label, value, onChange, keyboardType, multiline }: {
  label: string; value: string; onChange: (v: string) => void;
  keyboardType?: any; multiline?: boolean;
}) {
  return (
    <View style={styles.efield}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.einput, multiline && styles.emultiline]}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        placeholderTextColor={Colors.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  hero: { backgroundColor: Colors.navy, padding: 20, gap: 8 },
  heroTitle: { fontSize: 22, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  heroRole: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_400Regular' },
  card: { backgroundColor: Colors.card, margin: 12, marginBottom: 0, borderRadius: Colors.radius, padding: 16, borderWidth: 1, borderColor: Colors.borderLight },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Inter_700Bold' },
  terms: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, fontFamily: 'Inter_400Regular' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  infoLabel: { fontSize: 14, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  infoValue: { fontSize: 14, color: Colors.text, fontWeight: '500', fontFamily: 'Inter_500Medium', flex: 1, textAlign: 'right' },
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  confirmStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, fontFamily: 'Inter_600SemiBold' },
  efield: { marginBottom: 14 },
  einput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Colors.radiusSm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: Colors.text, backgroundColor: Colors.background, fontFamily: 'Inter_400Regular' },
  emultiline: { height: 96, textAlignVertical: 'top', paddingTop: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Colors.radiusFull, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, marginRight: 6 },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  chipTextActive: { color: Colors.textInverse },
  editActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: Colors.radiusSm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontWeight: '600', color: Colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: Colors.radiusSm, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  actions: { padding: 16, gap: 12 },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Colors.radius, borderWidth: 1.5, borderColor: Colors.accent },
  editBtnText: { fontSize: 15, fontWeight: '600', color: Colors.accent, fontFamily: 'Inter_600SemiBold' },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.success, paddingVertical: 14, borderRadius: Colors.radius },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  declineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Colors.radius, borderWidth: 1.5, borderColor: Colors.danger },
  declineBtnText: { fontSize: 15, fontWeight: '600', color: Colors.danger, fontFamily: 'Inter_600SemiBold' },
  terminateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.danger, paddingVertical: 14, borderRadius: Colors.radius },
  terminateBtnText: { fontSize: 15, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  awaitingBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.successLight, paddingVertical: 12, borderRadius: Colors.radius, borderWidth: 1, borderColor: Colors.success },
  awaitingText: { fontSize: 14, color: Colors.successText, fontFamily: 'Inter_500Medium' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  errorText: { fontSize: 16, color: Colors.danger },
});
