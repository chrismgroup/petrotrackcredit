import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { safeNum, safeStr } from '@/lib/report-helpers';

type SalesFeedEntry = {
  branchId?: string;
  product: string;
  lpgCategory?: 'single' | 'distributor';
  volume: number;
  revenue: number;
};

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function businessDateKey(value: unknown): string {
  return safeStr(value, '').slice(0, 10);
}

export default function SalesScreen() {
  const { role, branchId, branches, pumpDailyReports, pumps } = useApp();
  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'att'] || colors.primary;

  const isGlobal   = role === 'admin' || role === 'md' || role === 'ceo' || role === 'acc' || role === 'csm';
  const inMyBranch = (bId?: string) => isGlobal || (!!branchId && bId === branchId);

  const today = localDateKey(new Date());
  const reportBranchId = (report: typeof pumpDailyReports[number]) =>
    report.branchId || pumps.find(pump => pump.id === report.pumpId)?.branchId;
  const liveTodayReports = pumpDailyReports.filter(report =>
    businessDateKey(report.date) === today &&
    (report.status === 'pending_manager' || report.status === 'pending_accountant' || report.status === 'approved') &&
    inMyBranch(reportBranchId(report)),
  );
  // Sales Overview is a projection of shift reports, not a second report
  // ledger. Include a shift as soon as it is submitted, and exclude it while
  // it is returned for correction so stale/rejected figures never contribute.
  const todayFeed: SalesFeedEntry[] = liveTodayReports.map(report => ({
      branchId: reportBranchId(report),
      product: safeStr(report.product),
      lpgCategory: report.product === 'LPG'
        ? pumps.find(pump => pump.id === report.pumpId)?.lpgCategory
        : undefined,
      volume: safeNum(report.liters),
      revenue: safeNum(report.grossAmount),
    }));

  const PROD_DEF = [
    { key: 'PMS',             color: '#286247', unit: 'L', label: 'PMS' },
    { key: 'AGO',             color: '#71805B', unit: 'L', label: 'AGO' },
    { key: 'DPK',             color: '#315F49', unit: 'L', label: 'DPK' },
    { key: 'LPG_Single',      color: '#174D36', unit: 'kg', label: 'LPG Single Buyers' },
    { key: 'LPG_Distributor', color: '#0B4D3E', unit: 'kg', label: 'LPG Distributors' },
    { key: 'Lube Oil',        color: '#365A47', unit: 'L', label: 'Lube Oil' },
  ] as const;

  const prodBreakdown = PROD_DEF.map(({ key, color, unit, label }) => {
    const entries = todayFeed.filter(entry => {
      if (key === 'LPG_Single')      return entry.product === 'LPG' && entry.lpgCategory === 'single';
      if (key === 'LPG_Distributor') return entry.product === 'LPG' && entry.lpgCategory === 'distributor';
      return entry.product === key;
    });
    const vol = entries.reduce((sum, entry) => sum + entry.volume, 0);
    const rev = entries.reduce((sum, entry) => sum + entry.revenue, 0);
    return { key, color, unit, label: label ?? key, vol, rev };
  });

  const branchBreakdown = [
    ...branches
      .filter(branch => isGlobal || (!!branchId && branch.id === branchId))
      .map(branch => {
        const entries = todayFeed.filter(entry => entry.branchId === branch.id);
        return {
          id: branch.id,
          name: safeStr(branch.name),
          volume: entries.reduce((sum, entry) => sum + entry.volume, 0),
          revenue: entries.reduce((sum, entry) => sum + entry.revenue, 0),
        };
      }),
    ...(isGlobal && todayFeed.some(entry => !entry.branchId)
      ? [{
          id: 'unassigned',
          name: 'Unassigned branch',
          volume: todayFeed.filter(entry => !entry.branchId).reduce((sum, entry) => sum + entry.volume, 0),
          revenue: todayFeed.filter(entry => !entry.branchId).reduce((sum, entry) => sum + entry.revenue, 0),
        }]
      : []),
  ].sort((a, b) => b.revenue - a.revenue);

  return (
    <ScreenLayout title="Sales">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        <View style={styles.prodSectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Revenue & Volume by Product</Text>
          <Text style={[styles.prodSectionSub, { color: colors.textMuted }]}>Today · from submitted shift records</Text>
        </View>
        <View style={styles.prodGrid}>
          {prodBreakdown.map(p => (
            <View key={p.key} style={[styles.prodCard, { backgroundColor: p.color + '12', borderColor: p.color + '33' }]}>
              <View style={[styles.prodDot, { backgroundColor: p.color }]} />
              <Text style={[styles.prodLabel, { color: p.color }]}>{p.label}</Text>
              <Text style={[styles.prodRev, { color: colors.text }]}>{fmt(p.rev)}</Text>
              <Text style={[styles.prodVol, { color: colors.textMuted }]}>{p.vol.toLocaleString()} {p.unit}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Revenue & Volume by Branch</Text>
        <View style={styles.branchGrid}>
          {branchBreakdown.map(branch => (
            <View key={branch.id} style={[styles.branchCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.branchCardHeader}>
                <Ionicons name="business-outline" size={15} color={roleColor} />
                <Text style={[styles.branchName, { color: colors.text }]} numberOfLines={1}>{branch.name}</Text>
              </View>
              <Text style={[styles.branchRevenue, { color: roleColor }]}>{fmt(branch.revenue)}</Text>
              <Text style={[styles.branchVolume, { color: colors.textMuted }]}>{branch.volume.toLocaleString()} L/kg</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll:         { padding: 16 },
  metricsRow:     { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metricCard:     { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1 },
  metricValue:    { fontSize: 16, fontWeight: '700' },
  metricLabel:    { fontSize: 11, marginTop: 2 },
  cashPosCard:    { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  cashPosTitle:   { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  cashPosRow:     { flexDirection: 'row', gap: 8, marginBottom: 10 },
  cashPosItem:    { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', gap: 3 },
  cashPosValue:   { fontSize: 17, fontWeight: '700' },
  cashPosLabel:   { fontSize: 10 },
  posBar:         { height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row', marginBottom: 4 },
  posBarFill:     { borderRadius: 3 },
  posBarLabel:    { fontSize: 10, textAlign: 'center' },
  prodSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  prodSectionSub: { fontSize: 10 },
  prodGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  prodCard:       { width: '48%', padding: 12, borderRadius: 12, borderWidth: 1, gap: 3 },
  prodDot:        { width: 8, height: 8, borderRadius: 4, marginBottom: 2 },
  prodLabel:      { fontSize: 12, fontWeight: '800' },
  prodVol:        { fontSize: 15, fontWeight: '700' },
  prodRev:        { fontSize: 11 },
  branchGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  branchCard:     { width: '48%', padding: 12, borderRadius: 12, borderWidth: 1, gap: 4 },
  branchCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  branchName:     { flex: 1, fontSize: 11, fontWeight: '800' },
  branchRevenue:  { fontSize: 14, fontWeight: '800', marginTop: 4 },
  branchVolume:   { fontSize: 11 },
  sectionTitle:   { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  emptyCard:      { padding: 32, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 8, marginBottom: 8 },
  emptyText:      { fontSize: 14, fontWeight: '600' },
  emptyHint:      { fontSize: 12, textAlign: 'center' },
  reportCard:     { padding: 14, borderRadius: 12, marginBottom: 8 },
  reportHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  reportPump:     { fontSize: 14, fontWeight: '700' },
  reportMeta:     { fontSize: 11, marginTop: 2 },
  statusBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  statusText:     { fontSize: 10, fontWeight: '600' },
  prodBadge:      { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  prodBadgeText:  { fontSize: 10, fontWeight: '700' },
  reportDetails:  { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 8, gap: 5 },
  detailRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel:    { fontSize: 12 },
  detailVal:      { fontSize: 12, fontWeight: '600' },
  paymentRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 2 },
  payChip:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1 },
  payChipText:    { fontSize: 11, fontWeight: '600' },
  returnedNote:   { marginTop: 8, padding: 8, borderRadius: 8, borderWidth: 1 },
  returnedText:   { fontSize: 12, fontWeight: '600' },
});
