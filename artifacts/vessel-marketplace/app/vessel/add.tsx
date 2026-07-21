import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Alert, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { vmVessels, requestUploadUrl, uploadToPresignedUrl } from '@/lib/api';
import { VESSEL_TYPES } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { VesselPhotoUploader, type PendingPhoto } from '@/components/VesselPhotoUploader';
import type { VesselPhoto } from '@/lib/types';
import { validateVesselFields, hasVesselErrors, type VesselFieldErrors } from '@/lib/vesselValidation';

const STATUSES = ['available', 'laid_up', 'decommissioned'];

interface ContactForm {
  contactName: string;
  phone: string;
  email: string;
  address: string;
}

export default function AddVesselScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { isOwnerOrAdmin } = useAuth();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<{
    name: string; imoNumber: string; vesselType: string; flag: string;
    dwt: string; grt: string; yearBuilt: string; loa: string; beam: string;
    draft: string; classificationSociety: string; tradingArea: string;
    description: string; status: string;
  }>({
    name: '',
    imoNumber: '',
    vesselType: VESSEL_TYPES[0],
    flag: 'Nigeria',
    dwt: '',
    grt: '',
    yearBuilt: '',
    loa: '',
    beam: '',
    draft: '',
    classificationSociety: '',
    tradingArea: '',
    description: '',
    status: 'available',
  });

  const [contact, setContact] = useState<ContactForm>({
    contactName: '',
    phone: '',
    email: '',
    address: '',
  });
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [errors, setErrors] = useState<VesselFieldErrors & { name?: string }>({});

  const set = (key: string) => (val: string) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const validate = (): boolean => {
    const fieldErrors: VesselFieldErrors & { name?: string } = {};
    if (!form.name.trim()) fieldErrors.name = 'Vessel name is required';
    const vesselErrors = validateVesselFields({
      imoNumber: form.imoNumber,
      dwt: form.dwt,
      grt: form.grt,
      yearBuilt: form.yearBuilt,
      loa: form.loa,
      beam: form.beam,
      draft: form.draft,
    });
    Object.assign(fieldErrors, vesselErrors);
    setErrors(fieldErrors);
    return !fieldErrors.name && !hasVesselErrors(vesselErrors);
  };

  const submit = async () => {
    if (!validate()) return;

    setLoading(true);
    const contacts = contact.contactName.trim()
      ? [{ contactName: contact.contactName.trim(), phone: contact.phone || null, email: contact.email || null, address: contact.address || null }]
      : [];

    const { data: vessel, error } = await vmVessels.create({
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
      status: form.status,
      contacts,
    } as any);

    if (error || !vessel) { setLoading(false); Alert.alert('Error', error ?? 'Failed to create vessel'); return; }

    for (const p of pendingPhotos) {
      try {
        const { data: urlData, error: urlErr } = await requestUploadUrl({ name: p.name, size: p.size, contentType: p.contentType });
        if (urlErr || !urlData) continue;
        const blob = await uriToBlob(p.uri);
        const ok = await uploadToPresignedUrl(urlData.uploadURL, blob, p.contentType);
        if (!ok) continue;
        await vmVessels.addPhoto(vessel.id, urlData.objectPath);
      } catch { /* non-critical */ }
    }

    setLoading(false);
    qc.invalidateQueries({ queryKey: ['vessels'] });
    qc.invalidateQueries({ queryKey: ['my-vessels'] });
    Alert.alert('Success', 'Vessel added to marketplace', [{ text: 'OK', onPress: () => router.back() }]);
  };

  async function uriToBlob(uri: string): Promise<Blob> {
    if (typeof window !== 'undefined') {
      const res = await fetch(uri);
      return res.blob();
    }
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = () => resolve(xhr.response);
      xhr.onerror = reject;
      xhr.responseType = 'blob';
      xhr.open('GET', uri, true);
      xhr.send(null);
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 24 }}>
      <Section title="Basic Information">
        <Field label="Vessel Name *" value={form.name} onChangeText={set('name')} placeholder="e.g. MV Ocean Pride" error={errors.name} />
        <Field label="IMO Number" value={form.imoNumber} onChangeText={set('imoNumber')} placeholder="e.g. 9074729" error={errors.imoNumber} />
        <Field label="Flag State" value={form.flag} onChangeText={set('flag')} placeholder="e.g. Nigeria" />

        <Text style={styles.fieldLabel}>Vessel Type *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
          {VESSEL_TYPES.map(t => (
            <Pressable
              key={t}
              style={[styles.typeChip, form.vesselType === t && styles.typeChipActive]}
              onPress={() => setForm(f => ({ ...f, vesselType: t }))}
            >
              <Text style={[styles.typeChipText, form.vesselType === t && styles.typeChipTextActive]}>
                {t}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.fieldLabel}>Status</Text>
        <View style={styles.statusRow}>
          {STATUSES.map(s => (
            <Pressable
              key={s}
              style={[styles.statusChip, form.status === s && styles.statusChipActive]}
              onPress={() => setForm(f => ({ ...f, status: s }))}
            >
              <Text style={[styles.statusChipText, form.status === s && styles.statusChipTextActive]}>
                {s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <Section title="Technical Specifications">
        <View style={styles.row}>
          <View style={styles.col}>
            <Field label="DWT (tonnes)" value={form.dwt} onChangeText={set('dwt')} placeholder="e.g. 50000" keyboardType="numeric" error={errors.dwt} />
          </View>
          <View style={styles.col}>
            <Field label="GRT" value={form.grt} onChangeText={set('grt')} placeholder="e.g. 30000" keyboardType="numeric" error={errors.grt} />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.col}>
            <Field label="Year Built" value={form.yearBuilt} onChangeText={set('yearBuilt')} placeholder="e.g. 2010" keyboardType="numeric" error={errors.yearBuilt} />
          </View>
          <View style={styles.col}>
            <Field label="LOA (m)" value={form.loa} onChangeText={set('loa')} placeholder="e.g. 185" keyboardType="numeric" error={errors.loa} />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.col}>
            <Field label="Beam (m)" value={form.beam} onChangeText={set('beam')} placeholder="e.g. 28" keyboardType="numeric" error={errors.beam} />
          </View>
          <View style={styles.col}>
            <Field label="Draft (m)" value={form.draft} onChangeText={set('draft')} placeholder="e.g. 12" keyboardType="numeric" error={errors.draft} />
          </View>
        </View>
        <Field label="Classification Society" value={form.classificationSociety} onChangeText={set('classificationSociety')} placeholder="e.g. Lloyd's Register" />
      </Section>

      <Section title="Trading Information">
        <Field label="Trading Area" value={form.tradingArea} onChangeText={set('tradingArea')} placeholder="e.g. West African Coast" />
        <Field label="Description" value={form.description} onChangeText={set('description')} placeholder="Vessel details, history, condition..." multiline />
      </Section>

      <Section title="Photos (Optional)">
        <VesselPhotoUploader
          photos={[]}
          onPhotosChange={() => {}}
          pendingPhotos={pendingPhotos}
          onPendingPhotosChange={setPendingPhotos}
        />
      </Section>

      <Section title="Owner Contact (Optional)">
        <Field label="Contact Name" value={contact.contactName} onChangeText={v => setContact(c => ({ ...c, contactName: v }))} placeholder="e.g. Captain James" />
        <Field label="Phone" value={contact.phone} onChangeText={v => setContact(c => ({ ...c, phone: v }))} placeholder="+234 800 000 0000" keyboardType="phone-pad" />
        <Field label="Email" value={contact.email} onChangeText={v => setContact(c => ({ ...c, email: v }))} placeholder="contact@company.com" keyboardType="email-address" />
        <Field label="Address" value={contact.address} onChangeText={v => setContact(c => ({ ...c, address: v }))} placeholder="Lagos, Nigeria" />
      </Section>

      <Pressable
        style={[styles.submitBtn, loading && { opacity: 0.6 }]}
        onPress={submit}
        disabled={loading}
        testID="submit-vessel-btn"
      >
        {loading ? <ActivityIndicator color={Colors.textInverse} /> : (
          <>
            <Ionicons name="checkmark" size={20} color={Colors.textInverse} />
            <Text style={styles.submitBtnText}>Add to Marketplace</Text>
          </>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, error }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any; multiline?: boolean; error?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline, error ? styles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
  inputError: { borderColor: Colors.danger },
  multiline: { height: 96, textAlignVertical: 'top', paddingTop: 10 },
  errorText: { fontSize: 12, color: Colors.danger, marginTop: 4, fontFamily: 'Inter_400Regular' },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  typeScroll: { marginBottom: 14, flexGrow: 0 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Colors.radiusFull, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, marginRight: 6 },
  typeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  typeChipText: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  typeChipTextActive: { color: Colors.textInverse },
  statusRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statusChip: { flex: 1, paddingVertical: 8, borderRadius: Colors.radiusSm, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  statusChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  statusChipText: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  statusChipTextActive: { color: Colors.textInverse },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, margin: 16, borderRadius: Colors.radius, paddingVertical: 16, gap: 10 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
});
