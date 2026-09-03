import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FinancialStatusCard } from '@/components/FinancialStatusCard';
import { ScreenLayout } from '@/components/ScreenLayout';
import {
  businessDateKey,
  calculateBusinessMonthRevenue,
  calendarMonthBusinessDateRange,
  getPriceForProduct,
  isRevenueReportStatus,
  ROLE_COLORS,
  fmt,
  useApp,
} from '@/context/AppContext';
import { computePumpReportCOGS } from '@/lib/report-helpers';
import { monthlyDepreciationTotal } from '@/lib/asset-depreciation';
import { calculateNetProfit } from '@/lib/net-profit';
import { useColors } from '@/hooks/useColors';

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatBusinessDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AccountsScreen() {
  const {
    role, branchId, prices, branches, expenses, companyInfo, pumpDailyReports, deliveries,
    financialEntry, companyAssets,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'acc'] || colors.primary;

  const isGlobal = role === 'md' || role === 'ceo' || role === 'acc' || role === 'csm' || role === 'admin';
  const scopedBranchId = isGlobal ? null : branchId;
  const currentMonthRange = calendarMonthBusinessDateRange();
  const visibleBranches = isGlobal ? branches : branches.filter(b => !branchId || !b.id || b.id === branchId);

  // One branch scope applied to every input so branch-locked users never mix
  // local revenue with company-wide costs. Records without a branchId are
  // treated as company-level and only visible to global roles.
  const inScope = (bid?: string) => isGlobal || !branchId || bid === branchId;
  const num = (n: number) => (Number.isFinite(n) ? n : 0);
  const inCurrentMonth = (value?: string) => {
    const businessDate = businessDateKey(value);
    return businessDate >= currentMonthRange.from && businessDate <= currentMonthRange.to;
  };
  const scopedRevenueReports = pumpDailyReports.filter(report =>
    isRevenueReportStatus(report.status) &&
    (!scopedBranchId || report.branchId === scopedBranchId || !report.branchId),
  );
  const monthlyReports = scopedRevenueReports.filter(report => inCurrentMonth(report.date));
  const todayBusinessDate = localDateKey(new Date());
  const todayReports = scopedRevenueReports.filter(report => businessDateKey(report.date) === todayBusinessDate);
  const todayRevenue = Math.round(todayReports.reduce((sum, report) => sum + num(report.grossAmount), 0));
  const todayPmsRev = todayReports.filter(report => report.product === 'PMS').reduce((sum, report) => sum + num(report.grossAmount), 0);
  const todayAgoRev = todayReports.filter(report => report.product === 'AGO').reduce((sum, report) => sum + num(report.grossAmount), 0);
  const todayDpkRev = todayReports.filter(report => report.product === 'DPK').reduce((sum, report) => sum + num(report.grossAmount), 0);
  const todayLpgRev = todayReports.filter(report => report.product === 'LPG').reduce((sum, report) => sum + num(report.grossAmount), 0);
  const todayLubeRev = todayReports.filter(report => report.product === 'Lube Oil').reduce((sum, report) => sum + num(report.grossAmount), 0);
  const dailyRevenueLog = Array.from(
    scopedRevenueReports
      .reduce((log, report) => {
        const date = businessDateKey(report.date);
        if (!date) return log;
        const current = log.get(date) ?? { date, revenue: 0, reports: 0 };
        current.revenue += num(report.grossAmount);
        current.reports += 1;
        log.set(date, current);
        return log;
      }, new Map<string, { date: string; revenue: number; reports: number }>())
      .values(),
  ).sort((a, b) => b.date.localeCompare(a.date));
  const dailyBranchRevenueLog = Array.from(
    scopedRevenueReports
      .reduce((log, report) => {
        const date = businessDateKey(report.date);
        if (!date) return log;
        const branchId = report.branchId || 'unassigned';
        const current = log.get(date) ?? { date, total: 0, byBranch: new Map<string, number>() };
        current.total += num(report.grossAmount);
        current.byBranch.set(branchId, (current.byBranch.get(branchId) || 0) + num(report.grossAmount));
        log.set(date, current);
        return log;
      }, new Map<string, { date: string; total: number; byBranch: Map<string, number> }>())
      .values(),
  )
    .map(entry => ({
      date: entry.date,
      total: Math.round(entry.total),
      branches: Array.from(entry.byBranch.entries())
        .map(([id, revenue]) => ({
          id,
          name: id === 'unassigned' ? 'Unassigned / Company-level' : branches.find(branch => branch.id === id)?.name || 'Unknown branch',
          revenue: Math.round(revenue),
        }))
        .sort((a, b) => b.revenue - a.revenue),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  // Use the same historical delivery set as FinancialStatusCard so a
  // product's last known cost price carries into months without a delivery.
  const scopedDeliveries = deliveries.filter(
    d => inScope(d.branchId) && businessDateKey(d.dt) <= currentMonthRange.to,
  );
  const scopedExpenses   = expenses.filter(e => e.status === 'approved' && inScope(e.branchId) && inCurrentMonth(e.dt));

  // Revenue follows the same business-date shift-report ledger as Home.
  // Do not sum auto-created SalesEntry rows here: accountant approval creates
  // those rows for downstream accounting, which would double count reports
  // already present in the live report feed.
  const branchRev = (bid: string) =>
    Math.round(monthlyReports.filter(report => report.branchId === bid).reduce((s, report) => s + num(report.grossAmount), 0));
  const totalRevenue  = calculateBusinessMonthRevenue(pumpDailyReports, scopedBranchId, currentMonthRange);
  const totalExpenses = Math.round(scopedExpenses.reduce((s, e) => s + num(e.amt), 0));
  const totalCOGS     = computePumpReportCOGS(monthlyReports, scopedDeliveries);
  const grossProfit   = totalRevenue - totalCOGS;
  const operatingProfit = grossProfit - totalExpenses;
  const bankCharges = Math.max(0, Number(financialEntry.bankCharges) || 0);
  const loanInterest = Math.max(0, Number(financialEntry.loanInterest) || 0);
  const depreciation = monthlyDepreciationTotal(companyAssets, currentMonthRange.from.slice(0, 7), scopedBranchId);

  // Tax computations
  const vatRate    = parseFloat(companyInfo.vatRate  || '7.5') / 100;
  const citaRate   = parseFloat(companyInfo.citaRate || '30')  / 100;
  const payeAmt    = 80_000; // fixed PAYE provision placeholder

  const vatProvision  = Math.round(totalRevenue * vatRate);
  const { profitBeforeTax, citaProvision, netProfit } = calculateNetProfit({
    operatingProfit,
    depreciation,
    bankCharges,
    loanInterest,
    citaRate,
  });

  const taxItems = [
    {
      label: `VAT (${(vatRate * 100).toFixed(1)}%)`,
      sub:   'On total revenue',
      value: vatProvision,
      icon:  'receipt',
      color: colors.blue,
    },
    {
      label: `CITA (${(citaRate * 100).toFixed(0)}%)`,
      sub:   'Company Income Tax — on assessable profit',
      value: citaProvision,
      icon:  'business',
      color: colors.amber,
    },
    {
      label: 'PAYE (Staff)',
      sub:   'Pay-As-You-Earn provision',
      value: payeAmt,
      icon:  'people',
      color: colors.purple,
    },
  ];

  return (
    <ScreenLayout title="Accounts">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Summary hero */}
        <View style={[styles.summaryCard, { backgroundColor: roleColor }]}>
          <Text style={styles.sumLabel}>Net Profit (after CITA)</Text>
          <Text style={styles.sumValue}>{fmt(netProfit)}</Text>
          <View style={styles.sumRow}>
            <View style={styles.sumItem}>
                <Text style={styles.sumItemLabel}>Revenue This Month</Text>
              <Text style={styles.sumItemValue} numberOfLines={1} adjustsFontSizeToFit>{fmt(totalRevenue)}</Text>
            </View>
            <View style={styles.sumDivider} />
            <View style={styles.sumItem}>
              <Text style={styles.sumItemLabel}>COGS</Text>
              <Text style={styles.sumItemValue} numberOfLines={1} adjustsFontSizeToFit>{fmt(totalCOGS)}</Text>
            </View>
            <View style={styles.sumDivider} />
            <View style={styles.sumItem}>
              <Text style={styles.sumItemLabel}>Expenses</Text>
              <Text style={styles.sumItemValue} numberOfLines={1} adjustsFontSizeToFit>{fmt(totalExpenses)}</Text>
            </View>
            <View style={styles.sumDivider} />
            <View style={styles.sumItem}>
              <Text style={styles.sumItemLabel}>CITA</Text>
              <Text style={styles.sumItemValue} numberOfLines={1} adjustsFontSizeToFit>{fmt(citaProvision)}</Text>
            </View>
          </View>
        </View>

        {/* Accountant-maintained financial position */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Financial Status</Text>
        <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
          Accountant-entered cash and goods in transit; receivables come from validated credit sales
        </Text>
        <FinancialStatusCard roleColor={roleColor} />

        {/* Profit waterfall */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Profit Waterfall</Text>
        <View style={[styles.waterfallCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            { label: 'Gross Revenue',      value: totalRevenue,    color: colors.success,  sign: '' },
            { label: 'Cost of Goods',      value: totalCOGS,       color: colors.error,    sign: '−' },
            { label: 'Gross Profit',       value: grossProfit,     color: colors.text,     sign: '=' },
            { label: 'Total Expenses',     value: totalExpenses,   color: colors.error,    sign: '−' },
            { label: 'Operating Profit',   value: operatingProfit, color: colors.text,     sign: '=' },
            { label: 'Asset Depreciation', value: depreciation,     color: colors.error,   sign: '−' },
            { label: 'Bank Charges',       value: bankCharges,       color: colors.error,   sign: '−' },
            { label: 'Interest Paid on Loans', value: loanInterest,  color: colors.error,   sign: '−' },
            { label: 'Profit Before CITA', value: profitBeforeTax,  color: colors.text,     sign: '=' },
            { label: `CITA @ ${(citaRate * 100).toFixed(0)}%`, value: citaProvision, color: colors.amber, sign: '−' },
            { label: 'Net Profit',         value: netProfit,       color: roleColor,       sign: '=' },
          ].map((row, i) => (
            <View
              key={row.label}
              style={[
                styles.wfRow,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                (row.label === 'Gross Profit' || row.label === 'Operating Profit' || row.label === 'Net Profit') && {
                  backgroundColor: row.color + '0a',
                },
              ]}
            >
              <Text style={[styles.wfSign, { color: colors.textMuted }]}>{row.sign}</Text>
              <Text style={[styles.wfLabel, { color: colors.text, fontWeight: (row.sign === '=') ? '700' : '400' }]}>
                {row.label}
              </Text>
              <Text style={[styles.wfAmt, { color: row.color }]}>{fmt(row.value)}</Text>
            </View>
          ))}
        </View>

        {/* Today's business-date sales */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Today's Sales Revenue</Text>
        <View style={[styles.todayCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.todayTotal, { color: roleColor }]}>{fmt(todayRevenue)}</Text>
          <Text style={[styles.todaySub, { color: colors.textMuted }]}>Business date {formatBusinessDate(todayBusinessDate)}</Text>
          <View style={styles.prodBreakdown}>
            {[
              { label: 'PMS',      amount: todayPmsRev,  color: colors.primary, price: getPriceForProduct(prices, 'PMS', branchId),      unit: '/L' },
              { label: 'AGO',      amount: todayAgoRev,  color: colors.blue,    price: getPriceForProduct(prices, 'AGO', branchId),      unit: '/L' },
              { label: 'DPK',      amount: todayDpkRev,  color: colors.amber,   price: getPriceForProduct(prices, 'DPK', branchId),      unit: '/L' },
              { label: 'LPG',      amount: todayLpgRev,  color: colors.teal,    price: getPriceForProduct(prices, 'LPG_Single', branchId) || getPriceForProduct(prices, 'LPG', branchId),      unit: '/kg' },
              { label: 'Lube Oil', amount: todayLubeRev, color: colors.purple,  price: getPriceForProduct(prices, 'Lube Oil', branchId), unit: '/L' },
            ].filter(p => p.amount > 0 || p.price > 0).map(p => (
              <View key={p.label} style={[styles.prodItem, { backgroundColor: p.color + '12', borderColor: p.color + '33' }]}>
                <Text style={[styles.prodLabel, { color: p.color }]}>{p.label}</Text>
                <Text style={[styles.prodAmt,   { color: colors.text }]}>{fmt(p.amount)}</Text>
                <Text style={[styles.prodPrice,  { color: colors.textMuted }]}>₦{p.price}{p.unit}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Business-date revenue log */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily Business-Date Revenue Log</Text>
        <View style={[styles.dailyLogCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.dailyLogHint, { color: colors.textMuted }]}>
            Each row is grouped by the shift report business date, not submission time.
          </Text>
          {dailyRevenueLog.length === 0 ? (
            <Text style={[styles.dailyLogEmpty, { color: colors.textMuted }]}>No business-date revenue recorded yet.</Text>
          ) : (
            dailyRevenueLog.map(entry => (
              <View key={entry.date} style={[styles.dailyLogRow, { borderTopColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dailyLogDate, { color: colors.text }]}>{formatBusinessDate(entry.date)}</Text>
                  <Text style={[styles.dailyLogMeta, { color: colors.textMuted }]}>
                    {entry.reports} shift report{entry.reports === 1 ? '' : 's'}
                  </Text>
                </View>
                <Text style={[styles.dailyLogRevenue, { color: roleColor }]}>{fmt(Math.round(entry.revenue))}</Text>
              </View>
            ))
          )}
        </View>

        {/* Branch revenue by business date */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Branch Revenue by Business Date</Text>
        <View style={[styles.dailyBranchCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.dailyLogHint, { color: colors.textMuted }]}>
            Compare each branch’s revenue for every recorded business date.
          </Text>
          {dailyBranchRevenueLog.length === 0 ? (
            <Text style={[styles.dailyLogEmpty, { color: colors.textMuted }]}>No branch revenue recorded yet.</Text>
          ) : (
            dailyBranchRevenueLog.map(entry => (
              <View key={entry.date} style={[styles.dailyBranchDay, { borderTopColor: colors.border }]}>
                <View style={styles.dailyBranchHeader}>
                  <Text style={[styles.dailyLogDate, { color: colors.text }]}>{formatBusinessDate(entry.date)}</Text>
                  <Text style={[styles.dailyLogRevenue, { color: roleColor }]}>{fmt(entry.total)}</Text>
                </View>
                {entry.branches.map(branch => (
                  <View key={`${entry.date}-${branch.id}`} style={styles.dailyBranchRow}>
                    <View style={[styles.dailyBranchDot, { backgroundColor: roleColor }]} />
                    <Text style={[styles.dailyBranchName, { color: colors.text }]} numberOfLines={1}>
                      {branch.name}
                    </Text>
                    <Text style={[styles.dailyBranchRevenue, { color: colors.text }]}>{fmt(branch.revenue)}</Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>

        {/* Branch revenue */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Branches Revenue</Text>
        {visibleBranches.map(b => (
          <View key={b.id} style={[styles.branchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.branchIcon, { backgroundColor: roleColor + '18' }]}>
              <Ionicons name="business" size={16} color={roleColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.branchName, { color: colors.text }]}>{b.name}</Text>
              <Text style={[styles.branchSt,   { color: b.st === 'Active' ? colors.success : colors.textMuted }]}>
                {b.st}
              </Text>
            </View>
            <Text style={[styles.branchRev, { color: roleColor }]}>{fmt(branchRev(b.id))}</Text>
          </View>
        ))}

        {/* Tax provisions */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Tax Provisions</Text>
        {taxItems.map(t => (
          <View key={t.label} style={[styles.taxRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.taxIcon, { backgroundColor: t.color + '18' }]}>
              <Ionicons name={t.icon as any} size={16} color={t.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.taxLabel, { color: colors.text }]}>{t.label}</Text>
              <Text style={[styles.taxSub,   { color: colors.textMuted }]}>{t.sub}</Text>
            </View>
            <Text style={[styles.taxAmt, { color: t.color }]}>{fmt(t.value)}</Text>
          </View>
        ))}

        {/* CITA info note */}
        <View style={[styles.citaNote, { backgroundColor: colors.amber + '12', borderColor: colors.amber + '44' }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.amber} />
          <Text style={[styles.citaNoteText, { color: colors.text }]}>
            CITA (Company Income Tax Act) is assessed at{' '}
            <Text style={{ fontWeight: '700' }}>{(citaRate * 100).toFixed(0)}%</Text> of assessable profit
            under the Nigerian Finance Act. The rate can be adjusted in Company Settings.
          </Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll:        { padding: 16 },

  summaryCard:   { borderRadius: 16, padding: 20, marginBottom: 16 },
  sumLabel:      { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 4 },
  sumValue:      { color: '#fff', fontSize: 32, fontWeight: '700', marginBottom: 16 },
  sumRow:        { flexDirection: 'row', alignItems: 'center' },
  sumItem:       { flex: 1, alignItems: 'center' },
  sumItemLabel:  { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  sumItemValue:  { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 2 },
  sumDivider:    { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.25)' },

  sectionTitle:  { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  sectionHint:   { fontSize: 12, marginTop: -5, marginBottom: 10 },

  waterfallCard: { borderRadius: 14, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  wfRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  wfSign:        { width: 18, fontSize: 16, fontWeight: '700' },
  wfLabel:       { flex: 1, fontSize: 13 },
  wfAmt:         { fontSize: 14, fontWeight: '700' },
  todayCard:     { padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  todayTotal:    { fontSize: 28, fontWeight: '700' },
  todaySub:      { fontSize: 12, marginBottom: 12 },
  prodBreakdown: { flexDirection: 'row', gap: 8 },
  prodItem:      { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  prodLabel:     { fontSize: 12, fontWeight: '700' },
  prodAmt:       { fontSize: 13, fontWeight: '600', marginTop: 2 },
  prodPrice:     { fontSize: 10, marginTop: 1 },

  dailyLogCard:  { borderRadius: 14, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  dailyLogHint:  { fontSize: 12, lineHeight: 17, padding: 14, paddingBottom: 8 },
  dailyLogEmpty: { fontSize: 13, padding: 14, paddingTop: 4 },
  dailyLogRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth },
  dailyLogDate:  { fontSize: 14, fontWeight: '600' },
  dailyLogMeta:  { fontSize: 11, marginTop: 2 },
  dailyLogRevenue: { fontSize: 15, fontWeight: '700' },

  dailyBranchCard: { borderRadius: 14, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  dailyBranchDay:  { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  dailyBranchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  dailyBranchRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingLeft: 4 },
  dailyBranchDot:   { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
  dailyBranchName:  { flex: 1, fontSize: 13 },
  dailyBranchRevenue: { fontSize: 13, fontWeight: '600', marginLeft: 8 },

  branchRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  branchIcon:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  branchName:    { fontSize: 14, fontWeight: '600' },
  branchSt:      { fontSize: 11, marginTop: 1 },
  branchRev:     { fontSize: 16, fontWeight: '700' },

  taxRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  taxIcon:       { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  taxLabel:      { fontSize: 14, fontWeight: '600' },
  taxSub:        { fontSize: 10, marginTop: 1 },
  taxAmt:        { fontSize: 15, fontWeight: '700' },

  citaNote:      { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 4, alignItems: 'flex-start' },
  citaNoteText:  { flex: 1, fontSize: 12, lineHeight: 17 },
});
