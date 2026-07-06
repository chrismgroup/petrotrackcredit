import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function MarketingScreen() {
  const { role, prices } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'mktg'] || colors.primary;
  const [prodTab, setProdTab] = useState<'PMS' | 'AGO' | 'DPK'>('PMS');
  const [showAddComp, setShowAddComp] = useState(false);
  const [compName, setCompName] = useState('');
  const [compPms, setCompPms] = useState('');
  const [compAgo, setCompAgo] = useState('');
  const [compDpk, setCompDpk] = useState('');

  const ourPrice = (prices as any)[prodTab] || 0;

  return (
    <ScreenLayout title="Marketing">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={[styles.heroCard, { backgroundColor: roleColor }]}>
          <Text style={styles.heroLabel}>Market Intelligence</Text>
          <Text style={styles.heroSub}>Track competitor prices and manage campaigns</Text>
        </View>

        {/* Product tabs */}
        <View style={styles.prodTabs}>
          {(['PMS', 'AGO', 'DPK'] as const).map(p => (
            <TouchableOpacity key={p} onPress={() => setProdTab(p)}
              style={[styles.prodTab, { backgroundColor: prodTab === p ? roleColor : colors.surface, borderColor: prodTab === p ? roleColor : colors.border }]}>
              <Text style={[styles.prodTabText, { color: prodTab === p ? '#fff' : colors.textMuted }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Our price card */}
        <View style={[styles.ourPriceCard, { backgroundColor: roleColor + '12', borderColor: roleColor + '44' }]}>
          <Ionicons name="pricetag" size={22} color={roleColor} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.ourPriceLabel, { color: colors.textMuted }]}>Our Current {prodTab} Price</Text>
            <Text style={[styles.ourPriceVal, { color: roleColor }]}>
              {ourPrice > 0 ? `₦${ourPrice.toLocaleString()}/L` : 'Not set'}
            </Text>
          </View>
        </View>

        {/* Competitor section */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Competitor Prices</Text>
          <TouchableOpacity onPress={() => setShowAddComp(v => !v)}
            style={[styles.addBtn, { backgroundColor: roleColor }]}>
            <Ionicons name={showAddComp ? 'close' : 'add'} size={16} color="#fff" />
            <Text style={styles.addBtnText}>{showAddComp ? 'Cancel' : 'Add'}</Text>
          </TouchableOpacity>
        </View>

        {showAddComp && (
          <View style={[styles.addForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.formLabel, { color: colors.text }]}>Station Name</Text>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
              value={compName} onChangeText={setCompName}
              placeholder="e.g. NNPCL Retail" placeholderTextColor={colors.textSubtle}
            />
            <View style={styles.priceRow}>
              {[{ label: 'PMS ₦/L', val: compPms, set: setCompPms }, { label: 'AGO ₦/L', val: compAgo, set: setCompAgo }, { label: 'DPK ₦/L', val: compDpk, set: setCompDpk }].map(f => (
                <View key={f.label} style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.textMuted }]}>{f.label}</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                    value={f.val} onChangeText={f.set}
                    placeholder="0" placeholderTextColor={colors.textSubtle}
                    keyboardType="numeric"
                  />
                </View>
              ))}
            </View>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: roleColor }]}
              onPress={() => {
                if (!compName.trim()) { Alert.alert('Required', 'Enter station name.'); return; }
                Alert.alert('Coming soon', 'Competitor tracking will be available in the next update.');
                setShowAddComp(false);
              }}>
              <Text style={styles.saveBtnText}>Save Competitor</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Empty state */}
        <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="business-outline" size={36} color={colors.textSubtle} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No competitor data yet</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Tap "Add" above to record competitor station prices for market comparison.
          </Text>
        </View>

        {/* Campaigns section */}
        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 8 }]}>Campaigns</Text>
        <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="megaphone-outline" size={36} color={colors.textSubtle} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No campaigns yet</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Campaign management coming soon.
          </Text>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  heroCard: { borderRadius: 14, padding: 18, marginBottom: 14 },
  heroLabel: { color: '#fff', fontSize: 18, fontWeight: '700' },
  heroSub: { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 2 },
  prodTabs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  prodTab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  prodTabText: { fontSize: 13, fontWeight: '700' },
  ourPriceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 18 },
  ourPriceLabel: { fontSize: 12, marginBottom: 2 },
  ourPriceVal: { fontSize: 22, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  addForm: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10, marginBottom: 14 },
  formLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  priceRow: { flexDirection: 'row', gap: 8 },
  saveBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  emptyBox: { alignItems: 'center', paddingVertical: 36, gap: 8, borderRadius: 14, borderWidth: 1, marginBottom: 14 },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptySub: { fontSize: 13, textAlign: 'center', paddingHorizontal: 24, lineHeight: 18 },
});
