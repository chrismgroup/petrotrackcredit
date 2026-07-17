import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function AccountsScreen() {
  const { prices, tanks, sales, branches, expenses, companyInfo } = useApp();
  const { role } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'acc'] || colors.primary;

  const totalRevenue  = branches.reduce((s, b) => s + b.rev, 0);
  const totalExpenses = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + e.amt, 0);
  const grossProfit   = totalRevenue - totalExpenses;

  const todaySales = sales.reduce((s, e) => s + e.L * e.price, 0);
  const pmsRev     = sales.filter(s => s.pump.includes('PMS')).reduce((sum, s) => sum + s.L * s.price, 0);
  const agoRev     = sales.filter(s => s.pump.includes('AGO')).reduce((sum, s) => sum + s.L * s.price, 0);
  const dkpRev     = sales.filter(s => s.pump.includes('DPK')).reduce((sum, s) => sum + s.L * s.price, 0);

  // Tax computations
  const vatRate    = parseFloat(companyInfo.vatRate  || '7.5') / 100;
  const citaRate   = parseFloat(companyInfo.citaRate || '30')  / 100;
  const payeAmt    = 80_000; // fixed PAYE provision placeholder

  const vatProvision  = Math.round(totalRevenue * vatRate);
  const citaProvision = grossProfit > 0 ? Math.round(grossProfit * citaRate) : 0;
  const netProfit     = grossProfit - citaProvision;

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
              <Text style={styles.sumItemLabel}>Revenue</Text>
              <Text style={styles.sumItemValue}>{fmt(totalRevenue)}</Text>
            </View>
            <View style={styles.sumDivider} />
            <View style={styles.sumItem}>
              <Text style={styles.sumItemLabel}>Expenses</Text>
              <Text style={styles.sumItemValue}>{fmt(totalExpenses)}</Text>
            </View>
            <View style={styles.sumDivider} />
            <View style={styles.sumItem}>
              <Text style={styles.sumItemLabel}>CITA</Text>
              <Text style={styles.sumItemValue}>{fmt(citaProvision)}</Text>
            </View>
          </View>
        </View>

        {/* Profit waterfall */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Profit Waterfall</Text>
        <View style={[styles.waterfallCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            { label: 'Gross Revenue',      value: totalRevenue,  color: colors.success,  sign: '' },
            { label: 'Total Expenses',     value: totalExpenses, color: colors.error,    sign: '−' },
            { label: 'Gross Profit',       value: grossProfit,   color: colors.text,     sign: '=' },
            { label: `CITA @ ${(citaRate * 100).toFixed(0)}%`, value: citaProvision, color: colors.amber, sign: '−' },
            { label: 'Net Profit',         value: netProfit,     color: roleColor,       sign: '=' },
          ].map((row, i) => (
            <View
              key={row.label}
              style={[
                styles.wfRow,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                (row.label === 'Gross Profit' || row.label === 'Net Profit') && {
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

        {/* Today's sales */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Today's Sales Revenue</Text>
        <View style={[styles.todayCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.todayTotal, { color: roleColor }]}>{fmt(todaySales)}</Text>
          <Text style={[styles.todaySub, { color: colors.textMuted }]}>Today's total sales</Text>
          <View style={styles.prodBreakdown}>
            {[
              { label: 'PMS', amount: pmsRev, color: colors.primary, price: prices.PMS },
              { label: 'AGO', amount: agoRev, color: colors.blue,    price: prices.AGO },
              { label: 'DPK', amount: dkpRev, color: colors.amber,   price: prices.DPK },
            ].map(p => (
              <View key={p.label} style={[styles.prodItem, { backgroundColor: p.color + '12', borderColor: p.color + '33' }]}>
                <Text style={[styles.prodLabel, { color: p.color }]}>{p.label}</Text>
                <Text style={[styles.prodAmt,   { color: colors.text }]}>{fmt(p.amount)}</Text>
                <Text style={[styles.prodPrice,  { color: colors.textMuted }]}>₦{p.price}/L</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Branch revenue */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Branches Revenue</Text>
        {branches.map(b => (
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
            <Text style={[styles.branchRev, { color: roleColor }]}>{fmt(b.rev)}</Text>
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
