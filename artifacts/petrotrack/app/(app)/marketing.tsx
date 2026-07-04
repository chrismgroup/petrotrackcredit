import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const MARKET_DATA = [
  { name: 'NNPCL Retail',   short: 'NNPCL',  pms: 817, ago: 1035, dpk: 685, fleet: true,  retail: true  },
  { name: 'Conoil Abuja',   short: 'CONOIL', pms: 835, ago: 1060, dpk: 710, fleet: true,  retail: false },
  { name: 'MRS Petroleum',  short: 'MRS',    pms: 828, ago: 1050, dpk: 698, fleet: false, retail: true  },
  { name: 'Total Energies', short: 'TOTAL',  pms: 825, ago: 1048, dpk: 702, fleet: true,  retail: true  },
  { name: 'Ardova Plc',     short: 'ARDOVA', pms: 822, ago: 1042, dpk: 695, fleet: false, retail: true  },
  { name: 'Rainoil Ltd',    short: 'RAIN',   pms: 829, ago: 1045, dpk: 700, fleet: true,  retail: false },
];

const CAMPAIGNS = [
  { id: 1, title: 'Ramadan Fleet Discount — AGO 3% off for bulk', status: 'Active', reach: '14 fleet clients', type: 'promo' },
  { id: 2, title: 'Loyalty Card Programme — 0.5% cashback after ₦100K', status: 'Active', reach: 'Walk-in retail', type: 'loyalty' },
  { id: 3, title: 'Staff Price — ₦50/L discount on PMS for staff', status: 'Ended', reach: 'Internal', type: 'staff' },
];

const ELASTICITY = 1.4;

function getPosLabel(rank: number, total: number): { text: string; color: string } {
  const pct = rank / total;
  if (pct <= 0.20) return { text: 'Most Competitive', color: '#27ae60' };
  if (pct <= 0.45) return { text: 'Below Average', color: '#2ecc71' };
  if (pct <= 0.55) return { text: 'Market Average', color: '#f39c12' };
  if (pct <= 0.80) return { text: 'Above Average', color: '#e67e22' };
  return { text: 'Least Competitive', color: '#e74c3c' };
}

interface RecoRow {
  icon: string;
  label: string;
  value: string;
  color: string;
  sub?: string;
}

function buildIntelligence(ourPrice: number, prodKey: string) {
  const prices = MARKET_DATA.map(d => ({ name: d.name, short: d.short, price: (d as any)[prodKey], fleet: d.fleet }));
  const sorted = [...prices].sort((a, b) => a.price - b.price);
  const rank = sorted.findIndex(p => p.price >= ourPrice);
  const effectiveRank = rank === -1 ? sorted.length : rank;
  const avg = Math.round(prices.reduce((s, p) => s + p.price, 0) / prices.length);
  const cheapest = sorted[0];
  const gapToAvg = ourPrice - avg;
  const gapToCheapest = ourPrice - cheapest.price;
  const cheaper = prices.filter(p => p.price < ourPrice);
  const expensive = prices.filter(p => p.price > ourPrice);
  const posLabel = getPosLabel(effectiveRank, prices.length);

  const recoAdj = gapToAvg > 5 ? -Math.round(gapToAvg * 0.6) : gapToAvg < -10 ? Math.round(Math.abs(gapToAvg) * 0.4) : 0;
  const volImpact = recoAdj !== 0 ? (-(recoAdj / 10) * ELASTICITY * 100 / 10).toFixed(1) : null;

  let recoText = '';
  let recoColor = '#f39c12';
  let recoUrgency: 'high' | 'medium' | 'low' = 'low';

  if (gapToAvg > 15) {
    recoText = `Reduce by ₦${Math.abs(recoAdj)} to approach market avg — high defection risk`;
    recoColor = '#e74c3c';
    recoUrgency = 'high';
  } else if (gapToAvg > 5) {
    recoText = `Consider ₦${Math.abs(recoAdj)} reduction to stay competitive with ${cheaper.length} cheaper stations`;
    recoColor = '#e67e22';
    recoUrgency = 'medium';
  } else if (gapToAvg < -10) {
    recoText = `Price headroom of ₦${Math.abs(recoAdj)} — marginal increase won't hurt volume`;
    recoColor = '#27ae60';
    recoUrgency = 'low';
  } else {
    recoText = `Hold current price — at market parity, minor variance acceptable`;
    recoColor = '#2980b9';
    recoUrgency = 'low';
  }

  const fleetTargets = prices.filter(p => {
    const comp = MARKET_DATA.find(d => d.short === p.short);
    return comp?.fleet && p.price > ourPrice;
  });

  const rows: RecoRow[] = [
    {
      icon: 'stats-chart',
      label: 'Market Position',
      value: `#${effectiveRank + 1} of ${prices.length + 1} stations`,
      color: posLabel.color,
      sub: posLabel.text,
    },
    {
      icon: 'trending-down',
      label: 'vs Market Avg',
      value: gapToAvg > 0 ? `₦${gapToAvg} above avg` : gapToAvg < 0 ? `₦${Math.abs(gapToAvg)} below avg` : 'At average',
      color: gapToAvg > 5 ? '#e74c3c' : gapToAvg < -5 ? '#27ae60' : '#f39c12',
    },
    {
      icon: 'flash',
      label: 'Threat Stations',
      value: `${cheaper.length} selling cheaper`,
      color: cheaper.length > 2 ? '#e74c3c' : cheaper.length > 0 ? '#e67e22' : '#27ae60',
      sub: cheaper.length > 0 ? cheaper.map(p => p.short).join(', ') : 'None — you lead',
    },
    {
      icon: 'star',
      label: 'Opportunity',
      value: `${expensive.length} stations costlier`,
      color: '#27ae60',
      sub: expensive.length > 0 ? `Fleet targets: ${expensive.filter((_, i) => i < 3).map(p => p.short).join(', ')}` : 'Push loyalty to lock in',
    },
  ];

  if (recoAdj !== 0 && volImpact) {
    rows.push({
      icon: 'bulb',
      label: 'Recommended Adj.',
      value: `${recoAdj > 0 ? '+' : ''}₦${recoAdj}/L`,
      color: recoColor,
      sub: `Est. ${parseFloat(volImpact) > 0 ? '+' : ''}${volImpact}% volume change`,
    });
  }

  return { rows, recoText, recoColor, recoUrgency, gapToCheapest, cheapest, fleetTargets };
}

export default function MarketingScreen() {
  const { role, prices } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'mktg'] || colors.primary;
  const [prodTab, setProdTab] = useState<'PMS' | 'AGO' | 'DPK'>('PMS');
  const [intelExpanded, setIntelExpanded] = useState(true);

  const prodKey = prodTab.toLowerCase() as 'pms' | 'ago' | 'dpk';
  const ourPrice = (prices as any)[prodTab];

  const sorted = [...MARKET_DATA].sort((a, b) => (a as any)[prodKey] - (b as any)[prodKey]);
  const cheapest = (sorted[0] as any)[prodKey];
  const expensive = (sorted[sorted.length - 1] as any)[prodKey];
  const avg = Math.round(MARKET_DATA.reduce((s, d) => s + (d as any)[prodKey], 0) / MARKET_DATA.length);

  const intel = buildIntelligence(ourPrice, prodKey);
  const urgencyColors: Record<string, string> = { high: '#e74c3c', medium: '#e67e22', low: '#2980b9' };
  const urgencyBg: Record<string, string> = { high: '#fdecea', medium: '#fef3e2', low: '#eaf4fb' };

  return (
    <ScreenLayout title="Marketing">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroCard, { backgroundColor: roleColor }]}>
          <Text style={styles.heroLabel}>Market Intelligence</Text>
          <Text style={styles.heroSub}>Live competitor analysis — {MARKET_DATA.length} stations tracked</Text>
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

        <TouchableOpacity
          onPress={() => setIntelExpanded(v => !v)}
          style={[styles.intelHeader, { backgroundColor: urgencyBg[intel.recoUrgency], borderColor: urgencyColors[intel.recoUrgency] + '55' }]}
          activeOpacity={0.8}
        >
          <View style={[styles.intelBrainIcon, { backgroundColor: urgencyColors[intel.recoUrgency] + '22' }]}>
            <Ionicons name="analytics" size={20} color={urgencyColors[intel.recoUrgency]} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.intelTitleRow}>
              <Text style={[styles.intelTitle, { color: urgencyColors[intel.recoUrgency] }]}>AI Market Brief — {prodTab}</Text>
              <View style={[styles.urgencyPill, { backgroundColor: urgencyColors[intel.recoUrgency] }]}>
                <Text style={styles.urgencyPillText}>{intel.recoUrgency.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={[styles.intelReco, { color: '#333' }]} numberOfLines={intelExpanded ? undefined : 2}>
              {intel.recoText}
            </Text>
          </View>
          <Ionicons name={intelExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={urgencyColors[intel.recoUrgency]} />
        </TouchableOpacity>

        {intelExpanded && (
          <View style={[styles.intelBody, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {intel.rows.map((row, i) => (
              <View key={row.label} style={[styles.intelRow, i < intel.rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <View style={[styles.intelRowIcon, { backgroundColor: row.color + '18' }]}>
                  <Ionicons name={row.icon as any} size={14} color={row.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.intelRowLabel, { color: colors.textMuted }]}>{row.label}</Text>
                  {row.sub && <Text style={[styles.intelRowSub, { color: colors.textSubtle }]}>{row.sub}</Text>}
                </View>
                <Text style={[styles.intelRowValue, { color: row.color }]}>{row.value}</Text>
              </View>
            ))}

            {intel.fleetTargets.length > 0 && (
              <View style={[styles.fleetBox, { backgroundColor: '#e8f5e9', borderColor: '#a5d6a7' }]}>
                <View style={styles.fleetBoxHeader}>
                  <Ionicons name="car" size={14} color="#2e7d32" />
                  <Text style={styles.fleetBoxTitle}>Fleet Acquisition Targets</Text>
                </View>
                <Text style={styles.fleetBoxSub}>These competitors serve fleet clients but price higher — direct outreach opportunity:</Text>
                <View style={styles.fleetPills}>
                  {intel.fleetTargets.map(t => (
                    <View key={t.short} style={styles.fleetPill}>
                      <Text style={styles.fleetPillText}>{t.short}</Text>
                      <Text style={styles.fleetPillDiff}> +₦{t.price - ourPrice}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[styles.fleetAction, { color: '#2e7d32' }]}>
                  → Offer ₦{Math.round((ourPrice - (ourPrice * 0.02)))} fleet rate (2% discount) to undercut by ₦{Math.round((intel.fleetTargets[0]?.price || ourPrice) - (ourPrice - ourPrice * 0.02))}+
                </Text>
              </View>
            )}
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 16 }]}>Competitor Price Table — {prodTab}</Text>
        {MARKET_DATA.map(d => {
          const price = (d as any)[prodKey];
          const diff = price - ourPrice;
          return (
            <View key={d.name} style={[styles.compRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.compIcon, { backgroundColor: roleColor + '18' }]}>
                <Ionicons name="business" size={14} color={roleColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.compName, { color: colors.text }]}>{d.name}</Text>
                <View style={styles.compTags}>
                  {d.fleet && <View style={styles.compTag}><Text style={styles.compTagText}>Fleet</Text></View>}
                  {d.retail && <View style={styles.compTag}><Text style={styles.compTagText}>Retail</Text></View>}
                </View>
              </View>
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
  intelHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 1 },
  intelBrainIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  intelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  intelTitle: { fontSize: 13, fontWeight: '700' },
  urgencyPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  urgencyPillText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  intelReco: { fontSize: 12, lineHeight: 17 },
  intelBody: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 4 },
  intelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  intelRowIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  intelRowLabel: { fontSize: 12, fontWeight: '500' },
  intelRowSub: { fontSize: 10, marginTop: 1 },
  intelRowValue: { fontSize: 13, fontWeight: '700' },
  fleetBox: { margin: 10, marginTop: 4, padding: 12, borderRadius: 10, borderWidth: 1 },
  fleetBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  fleetBoxTitle: { fontSize: 12, fontWeight: '700', color: '#2e7d32' },
  fleetBoxSub: { fontSize: 11, color: '#388e3c', marginBottom: 8, lineHeight: 15 },
  fleetPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  fleetPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#c8e6c9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  fleetPillText: { fontSize: 11, fontWeight: '700', color: '#1b5e20' },
  fleetPillDiff: { fontSize: 11, fontWeight: '600', color: '#2e7d32' },
  fleetAction: { fontSize: 11, fontWeight: '600', lineHeight: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  compRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  compIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  compName: { fontSize: 13, fontWeight: '500' },
  compTags: { flexDirection: 'row', gap: 4, marginTop: 2 },
  compTag: { backgroundColor: '#e8f5e9', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  compTagText: { fontSize: 9, fontWeight: '600', color: '#2e7d32' },
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
