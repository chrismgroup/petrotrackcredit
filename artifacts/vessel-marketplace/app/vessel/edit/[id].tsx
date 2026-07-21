import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Alert, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { vmVessels } from '@/lib/api';
import { VESSEL_TYPES } from '@/lib/types';
import type { VesselPhoto } from '@/lib/types';
import { VesselPhotoUploader } from '@/components/VesselPhotoUploader';

const STATUSES = ['available', 'laid_up', 'decommissioned'];

export default function EditVesselScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: vessel, isLoading } = useQuery({
    queryKey: ['vessel', id],
    queryFn: async () => {
      const { data } = await vmVessels.get(Number(id));
      return data;
    },
    enabled: !!id,
  });

  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [photos, setPhotos] = useState<VesselPhoto[]>([]);

  React.useEffect(() => {
    if (vessel && !form) {
      setPhotos(vessel.photos ?? []);
      setForm({
        name: vessel.name ?? '',
        imoNumber: vessel.imoNumber ?? '',
        vesselType: vessel.vesselType ?? '',
        flag: vessel.flag ?? '',
        dwt: vessel.dwt ?? '',
        grt: vessel.grt ?? '',
        yearBuilt: vessel.yearBuilt ? String(vessel.yearBuilt) : '',
        loa: vessel.loa ?? '',
        beam: vessel.beam ?? '',
        draft: vessel.draft ?? '',
        classificationSociety: vessel.classificationSociety ?? '',
        tradingArea: vessel.tradingArea ?? '',
        description: vessel.description ?? '',
        status: vessel.status ?? 'available',
        contactName: vessel.contacts?.[0]?.contactName ?? '',
        contactPhone: vessel.contacts?.[0]?.phone ?? '',
        contactEmail: vessel.contacts?.[0]?.email ?? '',
        contactAddress: vessel.contacts?.[0]?.address ?? '',
      });
    }
  }, [vessel]);

  const set = (key: string) => (val: string) => setForm(f => f ? { ...f, [key]: val } : null);

  const save = async () => {
    if (!form || !vessel) return;
    if (!form.name.trim()) { Alert.alert('Validation', 'Vessel name is required'); return; }

    setSaving(true);
    const contacts = form.contactName.trim()
      ? [{ contactName: form.contactName.trim(), phone: form.contactPhone || null, email: form.contactEmail || null, address: form.contactAddress || null }]
      : [];

    const { error } = await vmVessels.update(vessel.id, {
      name: form.name.trim(),
      imoNumber: form.imoNumber || undefined,
      vesselType: form.vesselType,
      flag: form.flag || undefined,
      dwt: form.dwt || undefined,
      grt: form.grt || undefined,
      yearBuilt: form.yearBuilt ? Number(form.yearBuilt) : undefined,
      loa: form.loa || undefined,
      beam: form.beam || undefined,
      draft: form.draft || undefined,
      classificationSociety: form.classificationSociety || undefined,
      tradingArea: form.tradingArea || undefined,
      description: form.description || undefined,
      contacts,
    } as any);
    setSaving(false);

    if (error) { Alert.alert('Error', error); return; }
    qc.invalidateQueries({ queryKey: ['vessel', id] });
    qc.invalidateQueries({ queryKey: ['vessels'] });
    qc.invalidateQueries({ queryKey: ['my-vessels'] });
    Alert.alert('Saved', 'Vessel updated successfully', [{ text: 'OK', onPress: () => router.back() }]);
  };

  if (isLoading || !form) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 24 }}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Basic Information</Text>
        <Field label="Vessel Name *" value={form.name} onChangeText={set('name')} placeholder="e.g. MV Ocean Pride" />
        <Field label="IMO Number" value={form.imoNumber} onChangeText={set('imoNumber')} placeholder="e.g. 9123456" />
        <Field label="Flag State" value={form.flag} onChangeText={set('flag')} placeholder="e.g. Nigeria" />

        <Text style={styles.fieldLabel}>Vessel Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
          {VESSEL_TYPES.map(t => (
            <Pressable
              key={t}
              style={[styles.typeChip, form.vesselType === t && styles.typeChipActive]}
              onPress={() => setForm(f => f ? { ...f, vesselType: t } : null)}
            >
              <Text style={[styles.typeChipText, form.vesselType === t && styles.typeChipTextActive]}>{t}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Technical Specifications</Text>
        <View style={styles.row}>
          <View style={styles.col}><Field label="DWT" value={form.dwt} onChangeText={set('dwt')} keyboardType="numeric" /></View>
          <View style={styles.col}><Field label="GRT" value={form.grt} onChangeText={set('grt')} keyboardType="numeric" /></View>
        </View>
        <View style={styles.row}>
          <View style={styles.col}><Field label="Year Built" value={form.yearBuilt} onChangeText={set('yearBuilt')} keyboardType="numeric" /></View>
          <View style={styles.col}><Field label="LOA (m)" value={form.loa} onChangeText={set('loa')} keyboardType="numeric" /></View>
        </View>
        <View style={styles.row}>
          <View style={styles.col}><Field label="Beam (m)" value={form.beam} onChangeText={set('beam')} keyboardType="numeric" /></View>
          <View style={styles.col}><Field label="Draft (m)" value={form.draft} onChangeText={set('draft')} keyboardType="numeric" /></View>
        </View>
        <Field label="Classification Society" value={form.classificationSociety} onChangeText={set('classificationSociety')} />
        <Field label="Trading Area" value={form.tradingArea} onChangeText={set('tradingArea')} />
        <Field label="Description" value={form.description} onChangeText={set('description')} multiline />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Photos</Text>
        <VesselPhotoUploader
          vesselId={vessel?.id}
          photos={photos}
          onPhotosChange={setPhotos}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Owner Contact</Text>
        <Field label="Contact Name" value={form.contactName} onChangeText={set('contactName')} />
        <Field label="Phone" value={form.contactPhone} onChangeText={set('contactPhone')} keyboardType="phone-pad" />
        <Field label="Email" value={form.contactEmail} onChangeText={set('contactEmail')} keyboardType="email-address" />
        <Field label="Address" value={form.contactAddress} onChangeText={set('contactAddress')} />
      </View>

      <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color={Colors.textInverse} /> : (
          <>
            <Ionicons name="checkmark" size={20} color={Colors.textInverse} />
            <Text style={styles.saveBtnText}>Save Changes</Text>
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
  section: { backgroundColor: Colors.card, margin: 12, marginBottom: 0, borderRadius: Colors.radius, padding: 16, borderWidth: 1, borderColor: Colors.borderLight },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Inter_700Bold' },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, fontFamily: 'Inter_600SemiBold' },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Colors.radiusSm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: Colors.text, backgroundColor: Colors.background, fontFamily: 'Inter_400Regular' },
  multiline: { height: 96, textAlignVertical: 'top', paddingTop: 10 },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  typeScroll: { flexGrow: 0, marginBottom: 14 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Colors.radiusFull, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, marginRight: 6 },
  typeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  typeChipText: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  typeChipTextActive: { color: Colors.textInverse },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, margin: 16, borderRadius: Colors.radius, paddingVertical: 16, gap: 10 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
