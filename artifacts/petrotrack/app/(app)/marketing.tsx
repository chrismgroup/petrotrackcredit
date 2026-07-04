import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const MARKET_DATA = [
  { name: 'NNPCL Retail', pms: 817, ago: 1035, dpk: 685 },
  { name: 'Conoil', pms: 835, ago: 1060, dpk: 710 },
  { name: 'MRS Petroleum', pms: 828, ago: 1050, dpk: 698 },
  { name: 'Total Energies', pms: 825, ago: 1048, dpk: 702 },
  { name: 'Ardova Plc', pms: 822, ago: 1042, dpk: 695 },
];

const CAMPAIGNS = [
  { id: 1, title: 'Ramadan Fleet Discount — AGO 3% off for bulk', status: 'Active', reach: '14 fleet clients', type: 'promo' },
  { id: 2, title: 'Loyalty Card Programme — 0.5% cashback after ₦100K', status: 'Active', reach: 'Walk-in retail', type: 'loyalty' },
  { id: 3, title: 'Staff Price — ₦50/L discount on PMS for staff', status: 'Ended', reach: 'Internal', type: 'staff' },
];

export default function MarketingScreen() {
  const { role, prices } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'mktg'] || colors.primary;
  const [prodTab, setProdTab] = useState<'PMS' | 'AGO' | 'DPK'>('PMS');

  const prodKey = prodTab.toLowerCase() as 'pms' | 'ago' | 'dpk';
  const ourPrice = (prices as any)[prodTab];

  const sorted = [...MARKET_DATA].sort((a, b) => (a as any)[prodKey] - (b as any)[prodKey]);
  const cheapest = (sorted[0] as any)[prodKey];
  const expensive = (sorted[sorted.length - 1] as any)[prodKey];
  const avg = Math.round(MARKET_DATA.reduce((s, d) => s + (d as any)[prodKey], 0) / MARKET_DATA.length);

  return (
    <ScreenLayout title="Marketing">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroCard, { backgroundColor: roleColor }]}>
          <Text style={styles.heroLabel}>Market Intelligence</Text>
          <Text style={styles.heroSub}>Competitor analysis across {MARKET_DATA.length} stations</Text>
        </View>

        <View style={styles.prodTabs}>
          {(['PMS', 'AGO', 'DPK'] as const).map(p => (
            <TouchableOpacity key={p} onPress={() => setProdTab(p)} style={[styles.prodTab, { backgroundColor: prodTab === p ? roleColor : colors.surface, borderColor: prodTab === p ? roleColor : colors.border }]}>
              <Text style={[styles.prodTabText, { color: prodTab === p ? '#fff' : colors.textMuted }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.priceGrid}>
          {[
            { label: 'Our Price', value: ourPrice, color: roleColor, highlight: true },
            { label: 'Market Avg', value: avg, color: colors.textMuted },
            { label: 'Cheapest', value: cheapest, color: colors.success },
            { label: 'Highest', value: expensive, color: colors.error },
          ].map(p => (
            <View key={p.label} style={[styles.priceCard, { backgroundColor: p.highlight ? roleColor + '12' : colors.surface, borderColor: p.highlight ? roleColor + '44' : colors.border }]}>
              <Text style={[styles.priceVal, { color: p.color }]}>₦{p.value}</Text>
              <Text style={[styles.priceLabel, { color: colors.textMuted }]}>{p.label}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Competitor Price Table — {prodTab}</Text>
        {MARKET_DATA.map(d => {
          const price = (d as any)[prodKey];
          const diff = price - ourPrice;
          return (
            <View key={d.name} style={[styles.compRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.compIcon, { backgroundColor: roleColor + '18' }]}>
                <Ionicons name="business" size={14} color={roleColor} />
              </View>
              <Text style={[styles.compName, { color: colors.text }]}>{d.name}</Text>
              <Text style={[styles.compPrice, { color: colors.text }]}>₦{price}/L</Text>
              <View style={[styles.diffBadge, { backgroundColor: diff > 0 ? colors.successBg : diff < 0 ? colors.errorBg : colors.surface }]}>
                <Text style={[styles.diffText, { color: diff > 0 ? colors.success : diff < 0 ? colors.error : colors.textMuted }]}>
                  {diff > 0 ? '+' : ''}{diff} vs us
                </Text>
              </View>
            </View>
          );
        })}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Active Campaigns</Text>
        {CAMPAIGNS.map(c => (
          <View key={c.id} style={[styles.campaignCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.campaignHeader}>
              <View style={[styles.campaignIcon, { backgroundColor: roleColor + '18' }]}>
                <Ionicons name={c.type === 'loyalty' ? 'card' : c.type === 'staff' ? 'people' : 'megaphone'} size={16} color={roleColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.campaignTitle, { color: colors.text }]}>{c.title}</Text>
                <Text style={[styles.campaignReach, { color: colors.textMuted }]}>Target: {c.reach}</Text>
              </View>
              <View style={[styles.campaignStatus, { backgroundColor: c.status === 'Active' ? colors.successBg : colors.surface, borderColor: c.status === 'Active' ? colors.successBorder : colors.border }]}>
                <Text style={[styles.campaignStatusText, { color: c.status === 'Active' ? colors.success : colors.textMuted }]}>{c.status}</Text>
              </View>
            </View>
          </View>
        ))}
        <View style={{ height: 16 }} />
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
  priceGrid: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  priceCard: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  priceVal: { fontSize: 16, fontWeight: '700' },
  priceLabel: { fontSize: 10, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  compRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  compIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  compName: { flex: 1, fontSize: 13, fontWeight: '500' },
  compPrice: { fontSize: 13, fontWeight: '600' },
  diffBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  diffText: { fontSize: 11, fontWeight: '600' },
  campaignCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  campaignHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  campaignIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  campaignTitle: { fontSize: 13, fontWeight: '600' },
  campaignReach: { fontSize: 11, marginTop: 1 },
  campaignStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  campaignStatusText: { fontSize: 11, fontWeight: '700' },
});
