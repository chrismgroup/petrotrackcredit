import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Alert, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { vmVessels, vmCharters } from '@/lib/api';
import { RATE_BASES } from '@/lib/types';

export default function NewCharterScreen() {
  const { vesselId } = useLocalSearchParams<{ vesselId: string }>();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  const { data: vessel } = useQuery({
    queryKey: ['vessel', vesselId],
    queryFn: async () => {
      const { data } = await vmVessels.get(Number(vesselId));
      return data;
    },
    enabled: !!vesselId,
  });

  const [form, setForm] = useState({
    rate: '',
    rateCurrency: 'USD',
    rateBasis: 'Per Day',
    laycanEarliest: '',
    laycanLatest: '',
    durationDays: '',
    cargoPurpose: '',
    terms: '',
  });

  const set = (key: string) => (val: string) => setForm(f => ({ ...f, [key]: val }));

  const submit = async () => {
    if (!vesselId) return;
    if (!form.rate.trim()) { Alert.alert('Validation', 'Rate is required'); return; }

    setLoading(true);
    const { error } = await vmCharters.submit(Number(vesselId), {
      rate: Number(form.rate),
      rateCurrency: form.rateCurrency,
      rateBasis: form.rateBasis,
      laycanEarliest: form.laycanEarliest || undefined,
      laycanLatest: form.laycanLatest || undefined,
      durationDays: form.durationDays ? Number(form.durationDays) : undefined,
      cargoPurpose: form.cargoPurpose || undefined,
      terms: form.terms || undefined,
    } as any);
    setLoading(false);

    if (error) { Alert.alert('Error', error); return; }
    qc.invalidateQueries({ queryKey: ['charter-parties'] });
    Alert.alert('Enquiry Submitted!', 'The vessel owner has been notified. Check My Charters to track progress.', [
      { text: 'View Charters', onPress: () => router.push('/(tabs)/charters') },
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 24 }}>
      {vessel && (
        <View style={styles.vesselInfo}>
          <Text style={styles.vesselLabel}>Charter Enquiry For</Text>
          <Text style={styles.vesselName}>{vessel.name}</Text>
          <Text style={styles.vesselType}>{vessel.vesselType}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Rate & Terms</Text>

        <View style={styles.rateRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Currency</Text>
            <TextInput
              style={styles.input}
              value={form.rateCurrency}
              onChangeText={set('rateCurrency')}
              placeholder="USD"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={{ flex: 2 }}>
            <Text style={styles.fieldLabel}>Rate Amount *</Text>
            <TextInput
              style={styles.input}
              value={form.rate}
              onChangeText={set('rate')}
              placeholder="e.g. 15000"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Rate Basis</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {RATE_BASES.map(rb => (
            <Pressable
              key={rb}
              style={[styles.chip, form.rateBasis === rb && styles.chipActive]}
              onPress={() => setForm(f => ({ ...f, rateBasis: rb }))}
            >
              <Text style={[styles.chipText, form.rateBasis === rb && styles.chipTextActive]}>{rb}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Field label="Duration (days)" value={form.durationDays} onChangeText={set('durationDays')} placeholder="e.g. 30" keyboardType="numeric" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Laycan Period</Text>
        <View style={styles.rateRow}>
          <View style={{ flex: 1 }}>
            <Field label="Earliest (YYYY-MM-DD)" value={form.laycanEarliest} onChangeText={set('laycanEarliest')} placeholder="2025-02-01" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Latest (YYYY-MM-DD)" value={form.laycanLatest} onChangeText={set('laycanLatest')} placeholder="2025-02-15" />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cargo & Purpose</Text>
        <Field label="Cargo / Purpose" value={form.cargoPurpose} onChangeText={set('cargoPurpose')} placeholder="e.g. Crude Oil – Bonny to Rotterdam" />
        <Field label="Special Terms & Conditions" value={form.terms} onChangeText={set('terms')} placeholder="Any special requirements, terms..." multiline />
      </View>

      <Pressable
        style={[styles.submitBtn, loading && { opacity: 0.6 }]}
        onPress={submit}
        disabled={loading}
        testID="submit-charter-btn"
      >
        {loading ? <ActivityIndicator color={Colors.textInverse} /> : (
          <>
            <Ionicons name="send-outline" size={20} color={Colors.textInverse} />
            <Text style={styles.submitBtnText}>Submit Charter Enquiry</Text>
          </>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any; multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  vesselInfo: { backgroundColor: Colors.navy, padding: 20 },
  vesselLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Inter_500Medium' },
  vesselName: { fontSize: 22, fontWeight: '700', color: Colors.textInverse, marginTop: 4, fontFamily: 'Inter_700Bold' },
  vesselType: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4, fontFamily: 'Inter_400Regular' },
  section: { backgroundColor: Colors.card, margin: 12, marginBottom: 0, borderRadius: Colors.radius, padding: 16, borderWidth: 1, borderColor: Colors.borderLight },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Inter_700Bold' },
  rateRow: { flexDirection: 'row', gap: 10 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, fontFamily: 'Inter_600SemiBold' },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Colors.radiusSm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: Colors.text, backgroundColor: Colors.background, fontFamily: 'Inter_400Regular' },
  multiline: { height: 96, textAlignVertical: 'top', paddingTop: 10 },
  chipRow: { flexGrow: 0, marginBottom: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Colors.radiusFull, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, marginRight: 6 },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  chipTextActive: { color: Colors.textInverse },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, margin: 16, borderRadius: Colors.radius, paddingVertical: 16, gap: 10 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
});
