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
import { computeCOGS } from '@/lib/report-helpers';
import { useColors } from '@/hooks/useColors';

export default function AccountsScreen() {
  const { role, branchId, prices, tanks, sales, branches, expenses, companyInfo, pumpDailyReports, deliveries } = useApp();
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
  const monthlyReports = pumpDailyReports.filter(report =>
    isRevenueReportStatus(report.status) &&
    inCurrentMonth(report.date) &&
    (!scopedBranchId || report.branchId === scopedBranchId || !report.branchId),
  );
  const scopedSales      = sales.filter(e => inScope(e.branchId) && inCurrentMonth(e.dt));
  const scopedDeliveries = deliveries.filter(d => inScope(d.branchId) && inCurrentMonth(d.dt));
  const scopedExpenses   = expenses.filter(e => e.status === 'approved' && inScope(e.branchId) && inCurrentMonth(e.dt));

  // Revenue follows the same business-date shift-report ledger as Home.
  // Do not sum auto-created SalesEntry rows here: accountant approval creates
  // those rows for downstream accounting, which would double count reports
  // already present in the live report feed.
  const branchRev = (bid: string) =>
    Math.round(monthlyReports.filter(report => report.branchId === bid).reduce((s, report) => s + num(report.grossAmount), 0));
  const totalRevenue  = calculateBusinessMonthRevenue(pumpDailyReports, scopedBranchId, currentMonthRange);
  const totalExpenses = Math.round(scopedExpenses.reduce((s, e) => s + num(e.amt), 0));
  const totalCOGS     = computeCOGS(scopedSales, scopedDeliveries);
  const grossProfit   = totalRevenue - totalCOGS;
  const operatingProfit = grossProfit - totalExpenses;

  const pmsRev     = monthlyReports.filter(report => report.product === 'PMS').reduce((sum, report) => sum + num(report.grossAmount), 0);
  const agoRev     = monthlyReports.filter(report => report.product === 'AGO').reduce((sum, report) => sum + num(report.grossAmount), 0);
  const dkpRev     = monthlyReports.filter(report => report.product === 'DPK').reduce((sum, report) => sum + num(report.grossAmount), 0);
  const lpgRev     = monthlyReports.filter(report => report.product === 'LPG').reduce((sum, report) => sum + num(report.grossAmount), 0);
  const lubeRev    = monthlyReports.filter(report => report.product === 'Lube Oil').reduce((sum, report) => sum + num(report.grossAmount), 0);

  // Tax computations
  const vatRate    = parseFloat(companyInfo.vatRate  || '7.5') / 100;
  const citaRate   = parseFloat(companyInfo.citaRate || '30')  / 100;
  const payeAmt    = 80_000; // fixed PAYE provision placeholder

  const vatProvision  = Math.round(totalRevenue * vatRate);
  const citaProvision = operatingProfit > 0 ? Math.round(operatingProfit * citaRate) : 0;
  const netProfit     = operatingProfit - citaProvision;

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
          Accountant-entered cash, POS, debts, loans and liabilities
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

        {/* Current month's sales */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>This Month's Sales Revenue</Text>
        <View style={[styles.todayCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.todayTotal, { color: roleColor }]}>{fmt(totalRevenue)}</Text>
          <Text style={[styles.todaySub, { color: colors.textMuted }]}>Business dates {currentMonthRange.from} to {currentMonthRange.to}</Text>
          <View style={styles.prodBreakdown}>
            {[
              { label: 'PMS',      amount: pmsRev,  color: colors.primary, price: getPriceForProduct(prices, 'PMS', branchId),      unit: '/L' },
              { label: 'AGO',      amount: agoRev,  color: colors.blue,    price: getPriceForProduct(prices, 'AGO', branchId),      unit: '/L' },
              { label: 'DPK',      amount: dkpRev,  color: colors.amber,   price: getPriceForProduct(prices, 'DPK', branchId),      unit: '/L' },
              { label: 'LPG',      amount: lpgRev,  color: colors.teal,    price: getPriceForProduct(prices, 'LPG_Single', branchId) || getPriceForProduct(prices, 'LPG', branchId),      unit: '/kg' },
              { label: 'Lube Oil', amount: lubeRev, color: colors.purple,  price: getPriceForProduct(prices, 'Lube Oil', branchId), unit: '/L' },
            ].filter(p => p.amount > 0 || p.price > 0).map(p => (
              <View key={p.label} style={[styles.prodItem, { backgroundColor: p.color + '12', borderColor: p.color + '33' }]}>
                <Text style={[styles.prodLabel, { color: p.color }]}>{p.label}</Text>
                <Text style={[styles.prodAmt,   { color: colors.text }]}>{fmt(p.amount)}</Text>
                <Text style={[styles.prodPrice,  { color: colors.textMuted }]}>₦{p.price}{p.unit}</Text>
              </View>
            ))}
          </View>
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
