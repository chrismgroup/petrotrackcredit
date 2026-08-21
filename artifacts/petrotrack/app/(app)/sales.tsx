import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { safeNum, safeStr } from '@/lib/report-helpers';

const SHIFT_STATUS_LABEL: Record<string, string> = {
  pending_manager:     'Pending Manager',
  pending_accountant:  'Pending Accountant',
  returned:            'Returned',
  returned_attendant:  'With Attendant',
  approved:            'Approved',
};
const SHIFT_STATUS_COLOR: Record<string, string> = {
  pending_manager:     '#BA7517',
  pending_accountant:  '#185FA5',
  returned:            '#A32D2D',
  returned_attendant:  '#8A3B0F',
  approved:            '#1a6e3c',
};
const SHIFT_STATUS_ICON: Record<string, string> = {
  pending_manager:     'time-outline',
  pending_accountant:  'hourglass-outline',
  returned:            'return-down-back-outline',
  returned_attendant:  'return-down-back-outline',
  approved:            'checkmark-circle',
};

type SalesFeedEntry = {
  branchId?: string;
  product: string;
  lpgCategory?: 'single' | 'distributor';
  volume: number;
  revenue: number;
  cash: number;
  pos: number;
  transfer: number;
  credit: number;
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

function saleProductFromPump(pumpName: unknown): string {
  const safePumpName = safeStr(pumpName, '');
  if (safePumpName.includes('LPG')) return 'LPG';
  if (safePumpName.includes('PMS')) return 'PMS';
  if (safePumpName.includes('AGO')) return 'AGO';
  if (safePumpName.includes('DPK')) return 'DPK';
  if (safePumpName.includes('Lube Oil')) return 'Lube Oil';
  return safeStr(safePumpName);
}

export default function SalesScreen() {
  const { role, branchId, branches, sales, pumpDailyReports, pumps } = useApp();
  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'att'] || colors.primary;

  const isGlobal   = role === 'admin' || role === 'md' || role === 'ceo' || role === 'acc' || role === 'csm';
  const inMyBranch = (bId?: string) => isGlobal || !branchId || !bId || bId === branchId;

  const today = localDateKey(new Date());
  const reportBranchId = (report: typeof pumpDailyReports[number]) =>
    report.branchId || pumps.find(pump => pump.id === report.pumpId)?.branchId;
  const liveTodayReports = pumpDailyReports.filter(report =>
    businessDateKey(report.date) === today &&
    (report.status === 'pending_accountant' || report.status === 'approved') &&
    inMyBranch(reportBranchId(report)),
  );
  // Approved shift reports also create SalesEntry records. Keep manual sales
  // entries, but use the report itself for every shift-report sale so pending
  // submissions are visible before the approval workflow completes.
  const manualTodaySales = sales.filter(sale =>
    !sale.shiftReportId &&
    businessDateKey(sale.dt) === today &&
    inMyBranch(sale.branchId),
  );
  const todayFeed: SalesFeedEntry[] = [
    ...liveTodayReports.map(report => ({
      branchId: reportBranchId(report),
      product: safeStr(report.product),
      lpgCategory: report.product === 'LPG'
        ? pumps.find(pump => pump.id === report.pumpId)?.lpgCategory
        : undefined,
      volume: safeNum(report.liters),
      revenue: safeNum(report.grossAmount),
      cash: safeNum(report.cashAmount),
      pos: safeNum(report.posAmount),
      transfer: safeNum(report.transferAmount),
      credit: safeNum(report.creditAmount),
    })),
    ...manualTodaySales.map(sale => {
      const volume = safeNum(sale.L);
      const revenue = safeNum(volume * safeNum(sale.price));
      const pos = safeNum(sale.pos);
      return {
        branchId: sale.branchId,
        product: saleProductFromPump(sale.pump),
        lpgCategory: sale.lpgCategory,
        volume,
        revenue,
        cash: Math.max(0, revenue - pos),
        pos,
        transfer: 0,
        credit: 0,
      };
    }),
  ];
  const totalL = todayFeed.reduce((sum, entry) => sum + entry.volume, 0);
  const totalAmt = todayFeed.reduce((sum, entry) => sum + entry.revenue, 0);
  const totalPOS = todayFeed.reduce((sum, entry) => sum + entry.pos + entry.transfer, 0);
  const totalCash = todayFeed.reduce((sum, entry) => sum + entry.cash, 0);
  const totalCredit = todayFeed.reduce((sum, entry) => sum + entry.credit, 0);
  const paymentTotal = totalCash + totalPOS + totalCredit;

  const PROD_DEF = [
    { key: 'PMS',             color: '#185FA5', unit: 'L', label: 'PMS' },
    { key: 'AGO',             color: '#BA7517', unit: 'L', label: 'AGO' },
    { key: 'DPK',             color: '#6B4F9E', unit: 'L', label: 'DPK' },
    { key: 'LPG_Single',      color: '#1a6e3c', unit: 'kg', label: 'LPG Single Buyers' },
    { key: 'LPG_Distributor', color: '#0B4D3E', unit: 'kg', label: 'LPG Distributors' },
    { key: 'Lube Oil',        color: '#A32D2D', unit: 'L', label: 'Lube Oil' },
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
      .filter(branch => isGlobal || !branchId || branch.id === branchId)
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
            <Text style={[styles.metricValue, { color: colors.text }]}>{liveTodayReports.length}</Text>
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
              {totalCredit > 0 && (
                <View style={[styles.cashPosItem, { backgroundColor: '#A85E1A12', borderColor: '#A85E1A33' }]}>
                  <Ionicons name="time-outline" size={16} color="#A85E1A" />
                  <Text style={[styles.cashPosValue, { color: '#A85E1A' }]}>{fmt(totalCredit)}</Text>
                  <Text style={[styles.cashPosLabel, { color: colors.textMuted }]}>Credit</Text>
                </View>
              )}
            </View>
            {paymentTotal > 0 && (
              <>
                <View style={[styles.posBar, { backgroundColor: colors.border }]}>
                  {totalCash > 0 && <View style={[styles.posBarFill, { flex: totalCash, backgroundColor: '#27500A' }]} />}
                  {totalPOS > 0 && <View style={[styles.posBarFill, { flex: totalPOS, backgroundColor: '#185FA5' }]} />}
                  {totalCredit > 0 && <View style={[styles.posBarFill, { flex: totalCredit, backgroundColor: '#A85E1A' }]} />}
                </View>
                <Text style={[styles.posBarLabel, { color: colors.textSubtle }]}>
                  Cash {Math.round((totalCash / paymentTotal) * 100)}% · POS/Transfer {Math.round((totalPOS / paymentTotal) * 100)}% · Credit {Math.round((totalCredit / paymentTotal) * 100)}%
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

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Shift Reports</Text>

        {sortedReports.length === 0 && (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="document-outline" size={32} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No shift reports yet</Text>
          <Text style={[styles.emptyHint, { color: colors.textSubtle }]}>Submitted shift reports appear here while they move through review</Text>
          </View>
        )}

        {sortedReports.map(r => {
          const sc         = SHIFT_STATUS_COLOR[r.status] || '#888';
           const isApproved = r.status === 'approved';
          const isReturned = r.status === 'returned' || r.status === 'returned_attendant';
           const hasLiveDetails = !isReturned;
          return (
            <View
              key={safeStr(r.id, `report-${safeStr(r.pumpName)}`)}
              style={[
                styles.reportCard,
                { backgroundColor: colors.surface, borderColor: isApproved ? sc + '55' : colors.border, borderWidth: isApproved ? 1.5 : 1 },
              ]}
            >
              <View style={styles.reportHeader}>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.reportPump, { color: colors.text }]}>{safeStr(r.pumpName)}</Text>
                  <Text style={[styles.reportMeta, { color: colors.textMuted }]}>
                     by {safeStr(r.submittedByName)} · {fmtDateTime(safeStr(r.submittedAt, ''))}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={[styles.statusBadge, { backgroundColor: sc + '18' }]}>
                     <Ionicons name={(SHIFT_STATUS_ICON[r.status] || 'help-circle-outline') as any} size={10} color={sc} />
                     <Text style={[styles.statusText, { color: sc }]}>{safeStr(SHIFT_STATUS_LABEL[r.status])}</Text>
                  </View>
                  <View style={[styles.prodBadge, { backgroundColor: roleColor + '18' }]}>
                     <Text style={[styles.prodBadgeText, { color: roleColor }]}>{safeStr(r.product)}</Text>
                  </View>
                </View>
              </View>

              {hasLiveDetails && (
                <View style={[styles.reportDetails, { borderTopColor: colors.border }]}>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Opening → Closing</Text>
                    <Text style={[styles.detailVal, { color: colors.text }]}>
                       {safeNum(r.openingMeter).toLocaleString()} → {safeNum(r.closingMeter).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Volume Dispensed</Text>
                     <Text style={[styles.detailVal, { color: colors.text }]}>{safeNum(r.liters).toLocaleString()} L</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Gross Amount</Text>
                      <Text style={[styles.detailVal, { color: roleColor, fontWeight: '700' }]}>{fmt(safeNum(r.grossAmount))}</Text>
                  </View>
                  <View style={[styles.paymentRow, { borderTopColor: colors.border }]}>
                    <View style={[styles.payChip, { backgroundColor: '#27500A12', borderColor: '#27500A33' }]}>
                      <Ionicons name="cash-outline" size={11} color="#27500A" />
                       <Text style={[styles.payChipText, { color: '#27500A' }]}>Cash {fmt(safeNum(r.cashAmount))}</Text>
                    </View>
                     {safeNum(r.posAmount) > 0 && (
                      <View style={[styles.payChip, { backgroundColor: '#185FA512', borderColor: '#185FA533' }]}>
                        <Ionicons name="card-outline" size={11} color="#185FA5" />
                       <Text style={[styles.payChipText, { color: '#185FA5' }]}>POS {fmt(safeNum(r.posAmount))}</Text>
                      </View>
                    )}
                     {safeNum(r.transferAmount) > 0 && (
                      <View style={[styles.payChip, { backgroundColor: '#4527a012', borderColor: '#4527a033' }]}>
                        <Ionicons name="swap-horizontal-outline" size={11} color="#4527a0" />
                       <Text style={[styles.payChipText, { color: '#4527a0' }]}>Transfer {fmt(safeNum(r.transferAmount))}</Text>
                      </View>
                    )}
                  </View>
                   {safeNum(r.variance) !== 0 && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Variance</Text>
                       <Text style={[styles.detailVal, { color: safeNum(r.variance) > 0 ? '#27500A' : '#A32D2D', fontWeight: '700' }]}>
                         {safeNum(r.variance) > 0 ? '+' : ''}{fmt(safeNum(r.variance))}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {isReturned && r.rejectionReason && (
                <View style={[styles.returnedNote, { backgroundColor: '#A32D2D0F', borderColor: '#A32D2D33' }]}>
                  <Text style={[styles.returnedText, { color: '#A32D2D' }]}>⚠ Returned: {safeStr(r.rejectionReason)}</Text>
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
