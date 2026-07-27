import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const SHIFT_STATUS_LABEL: Record<string, string> = {
  pending_manager:     'Pending Manager',
  pending_accountant:  'Pending Accountant',
  returned:            'Returned',
  approved:            'Approved',
};
const SHIFT_STATUS_COLOR: Record<string, string> = {
  pending_manager:     '#BA7517',
  pending_accountant:  '#185FA5',
  returned:            '#A32D2D',
  approved:            '#1a6e3c',
};
const SHIFT_STATUS_ICON: Record<string, string> = {
  pending_manager:     'time-outline',
  pending_accountant:  'hourglass-outline',
  returned:            'return-down-back-outline',
  approved:            'checkmark-circle',
};

export default function SalesScreen() {
  const { role, branchId, sales, pumpDailyReports, pumps } = useApp();
  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'att'] || colors.primary;

  const isGlobal   = role === 'md' || role === 'ceo' || role === 'acc';
  const inMyBranch = (bId?: string) => isGlobal || !branchId || !bId || bId === branchId;

  const today      = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter(s => s.dt.startsWith(today) && inMyBranch(s.branchId));
  const totalL     = todaySales.reduce((s, e) => s + e.L, 0);
  const totalAmt   = todaySales.reduce((s, e) => s + e.L * e.price, 0);
  const totalPOS   = todaySales.reduce((s, e) => s + (e.pos || 0), 0);
  const totalCash  = totalAmt - totalPOS;

  const PROD_DEF = [
    { key: 'PMS',             color: '#185FA5', unit: 'L', label: 'PMS' },
    { key: 'AGO',             color: '#BA7517', unit: 'L', label: 'AGO' },
    { key: 'DPK',             color: '#6B4F9E', unit: 'L', label: 'DPK' },
    { key: 'LPG_Single',      color: '#1a6e3c', unit: 'kg', label: 'LPG Single Buyers' },
    { key: 'LPG_Distributor', color: '#0B4D3E', unit: 'kg', label: 'LPG Distributors' },
    { key: 'Lube Oil',        color: '#A32D2D', unit: 'L', label: 'Lube Oil' },
  ] as const;

  const prodBreakdown = PROD_DEF.map(({ key, color, unit, label }) => {
    const entries = todaySales.filter(s => {
      if (key === 'LPG_Single')      return s.pump.includes('LPG') && s.lpgCategory === 'single';
      if (key === 'LPG_Distributor') return s.pump.includes('LPG') && s.lpgCategory === 'distributor';
      return s.pump.includes(key);
    });
    const vol = entries.reduce((s, e) => s + e.L, 0);
    const rev = entries.reduce((s, e) => s + e.L * e.price, 0);
    return { key, color, unit, label: label ?? key, vol, rev };
  });

  const sortedReports = [...pumpDailyReports]
    .filter(r => inMyBranch(r.branchId))
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  return (
    <ScreenLayout title="Sales">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { backgroundColor: roleColor + '12', borderColor: roleColor + '33' }]}>
            <Text style={[styles.metricValue, { color: roleColor }]}>{fmt(totalAmt)}</Text>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Today's Revenue</Text>
          </View>
          <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.metricValue, { color: colors.text }]}>{totalL.toLocaleString()} L/kg</Text>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Volume Sold</Text>
          </View>
          <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.metricValue, { color: colors.text }]}>{todaySales.length}</Text>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Reports</Text>
          </View>
        </View>

        {totalAmt > 0 && (
          <View style={[styles.cashPosCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cashPosTitle, { color: colors.text }]}>Today's Payment Breakdown</Text>
            <View style={styles.cashPosRow}>
              <View style={[styles.cashPosItem, { backgroundColor: '#27500A12', borderColor: '#27500A33' }]}>
                <Ionicons name="cash-outline" size={16} color="#27500A" />
                <Text style={[styles.cashPosValue, { color: '#27500A' }]}>{fmt(totalCash)}</Text>
                <Text style={[styles.cashPosLabel, { color: colors.textMuted }]}>Cash</Text>
              </View>
              <View style={[styles.cashPosItem, { backgroundColor: '#185FA512', borderColor: '#185FA533' }]}>
                <Ionicons name="card-outline" size={16} color="#185FA5" />
                <Text style={[styles.cashPosValue, { color: '#185FA5' }]}>{fmt(totalPOS)}</Text>
                <Text style={[styles.cashPosLabel, { color: colors.textMuted }]}>POS / Transfer</Text>
              </View>
            </View>
            {totalPOS > 0 && (
              <>
                <View style={[styles.posBar, { backgroundColor: colors.border }]}>
                  <View style={[styles.posBarFill, { flex: totalCash, backgroundColor: '#27500A' }]} />
                  <View style={[styles.posBarFill, { flex: totalPOS, backgroundColor: '#185FA5' }]} />
                </View>
                <Text style={[styles.posBarLabel, { color: colors.textSubtle }]}>
                  Cash {totalAmt > 0 ? Math.round((totalCash / totalAmt) * 100) : 0}% · POS {totalAmt > 0 ? Math.round((totalPOS / totalAmt) * 100) : 0}%
                </Text>
              </>
            )}
          </View>
        )}

        <View style={styles.prodSectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Revenue & Volume by Product</Text>
          <Text style={[styles.prodSectionSub, { color: colors.textMuted }]}>Sum = Today's Revenue above</Text>
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

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Shift Reports</Text>

        {sortedReports.length === 0 && (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="document-outline" size={32} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No shift reports yet</Text>
            <Text style={[styles.emptyHint, { color: colors.textSubtle }]}>Shift reports submitted by attendants appear here once approved by the accountant</Text>
          </View>
        )}

        {sortedReports.map(r => {
          const sc         = SHIFT_STATUS_COLOR[r.status] || '#888';
          const isApproved = r.status === 'approved';
          const isReturned = r.status === 'returned';
          return (
            <View
              key={r.id}
              style={[
                styles.reportCard,
                { backgroundColor: colors.surface, borderColor: isApproved ? sc + '55' : colors.border, borderWidth: isApproved ? 1.5 : 1 },
              ]}
            >
              <View style={styles.reportHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.reportPump, { color: colors.text }]}>{r.pumpName}</Text>
                  <Text style={[styles.reportMeta, { color: colors.textMuted }]}>
                    by {r.submittedByName} · {fmtDateTime(r.submittedAt)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={[styles.statusBadge, { backgroundColor: sc + '18' }]}>
                    <Ionicons name={SHIFT_STATUS_ICON[r.status] as any} size={10} color={sc} />
                    <Text style={[styles.statusText, { color: sc }]}>{SHIFT_STATUS_LABEL[r.status]}</Text>
                  </View>
                  <View style={[styles.prodBadge, { backgroundColor: roleColor + '18' }]}>
                    <Text style={[styles.prodBadgeText, { color: roleColor }]}>{r.product}</Text>
                  </View>
                </View>
              </View>

              {isApproved && (
                <View style={[styles.reportDetails, { borderTopColor: colors.border }]}>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Opening → Closing</Text>
                    <Text style={[styles.detailVal, { color: colors.text }]}>
                      {r.openingMeter.toLocaleString()} → {r.closingMeter.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Volume Dispensed</Text>
                    <Text style={[styles.detailVal, { color: colors.text }]}>{r.liters.toLocaleString()} L</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Gross Amount</Text>
                    <Text style={[styles.detailVal, { color: roleColor, fontWeight: '700' }]}>{fmt(r.grossAmount)}</Text>
                  </View>
                  <View style={[styles.paymentRow, { borderTopColor: colors.border }]}>
                    <View style={[styles.payChip, { backgroundColor: '#27500A12', borderColor: '#27500A33' }]}>
                      <Ionicons name="cash-outline" size={11} color="#27500A" />
                      <Text style={[styles.payChipText, { color: '#27500A' }]}>Cash {fmt(r.cashAmount)}</Text>
                    </View>
                    {r.posAmount > 0 && (
                      <View style={[styles.payChip, { backgroundColor: '#185FA512', borderColor: '#185FA533' }]}>
                        <Ionicons name="card-outline" size={11} color="#185FA5" />
                        <Text style={[styles.payChipText, { color: '#185FA5' }]}>POS {fmt(r.posAmount)}</Text>
                      </View>
                    )}
                    {r.transferAmount > 0 && (
                      <View style={[styles.payChip, { backgroundColor: '#4527a012', borderColor: '#4527a033' }]}>
                        <Ionicons name="swap-horizontal-outline" size={11} color="#4527a0" />
                        <Text style={[styles.payChipText, { color: '#4527a0' }]}>Transfer {fmt(r.transferAmount)}</Text>
                      </View>
                    )}
                  </View>
                  {r.variance !== 0 && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Variance</Text>
                      <Text style={[styles.detailVal, { color: r.variance > 0 ? '#27500A' : '#A32D2D', fontWeight: '700' }]}>
                        {r.variance > 0 ? '+' : ''}{fmt(r.variance)}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {isReturned && r.rejectionReason && (
                <View style={[styles.returnedNote, { backgroundColor: '#A32D2D0F', borderColor: '#A32D2D33' }]}>
                  <Text style={[styles.returnedText, { color: '#A32D2D' }]}>⚠ Returned: {r.rejectionReason}</Text>
                </View>
              )}
            </View>
          );
        })}

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
