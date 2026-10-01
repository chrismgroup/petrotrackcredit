import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

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
import { computePumpReportCOGS, missingPumpReportCostProducts } from '@/lib/report-helpers';
import { monthlyDepreciationTotal } from '@/lib/asset-depreciation';
import { calculateNetProfit } from '@/lib/net-profit';
import { getFinancialMonthEntry } from '@/lib/financial-ledger';
import { useColors } from '@/hooks/useColors';
import { customerLedgerBalance } from '@/lib/customer-ledger';

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
    financialEntry, companyAssets, startupStocks, creditCustomers = [], customerPayments = [],
    addCreditCustomer, approveCreditCustomer, rejectCreditCustomer, addCustomerPayment,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'acc'] || colors.primary;
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerBranchId, setCustomerBranchId] = useState('');
  const [paymentCustomerId, setPaymentCustomerId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(localDateKey(new Date()));
  const [paymentReference, setPaymentReference] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  const isGlobal = role === 'md' || role === 'ceo' || role === 'acc' || role === 'csm' || role === 'admin';
  const scopedBranchId = isGlobal ? null : branchId;
  const currentMonthRange = calendarMonthBusinessDateRange();
  const currentMonthEntry = getFinancialMonthEntry(financialEntry, currentMonthRange.from.slice(0, 7));
  const visibleBranches = isGlobal ? branches : branches.filter(b => Boolean(branchId && b.id === branchId));

  // One branch scope applied to every input so branch-locked users never mix
  // local revenue with company-wide costs. Records without a branchId are
  // treated as company-level and only visible to global roles.
  const inScope = (bid?: string) => isGlobal || (!!branchId && bid === branchId);
  const num = (n: number) => (Number.isFinite(n) ? n : 0);
  const inCurrentMonth = (value?: string) => {
    const businessDate = businessDateKey(value);
    return businessDate >= currentMonthRange.from && businessDate <= currentMonthRange.to;
  };
  const scopedRevenueReports = pumpDailyReports.filter(report =>
    isRevenueReportStatus(report.status) &&
    (!scopedBranchId || report.branchId === scopedBranchId),
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
  const totalCOGS     = computePumpReportCOGS(monthlyReports, scopedDeliveries, startupStocks);
  const missingCostProducts = missingPumpReportCostProducts(monthlyReports, scopedDeliveries, startupStocks);
  const grossProfit   = totalRevenue - totalCOGS;
  const operatingProfit = grossProfit - totalExpenses;
  const bankCharges = currentMonthEntry.bankCharges;
  const loanInterest = currentMonthEntry.loanInterest;
  const depreciation = monthlyDepreciationTotal(companyAssets, currentMonthRange.from.slice(0, 7), scopedBranchId);

  // Tax computations
  const citaRate   = parseFloat(companyInfo.citaRate || '30')  / 100;
  const { profitBeforeTax, citaProvision, netProfit } = calculateNetProfit({
    operatingProfit,
    depreciation,
    bankCharges,
    loanInterest,
    citaRate,
  });

  const taxItems = [
    {
      label: `CIT (${(citaRate * 100).toFixed(0)}%)`,
      sub:   'Company Income Tax — on positive profit before tax',
      value: citaProvision,
      icon:  'business',
      color: colors.amber,
    },
    {
      label: 'PAYE',
      sub: 'Configured monthly payroll withholding liability',
      value: currentMonthEntry.payeProvision,
      icon: 'people',
      color: colors.purple,
    },
  ];

  function createCustomer() {
    if (!addCreditCustomer({
      name: customerName, phone: customerPhone, email: customerEmail,
      address: customerAddress, branchId: customerBranchId,
    })) {
      Alert.alert('Customer not created', 'Enter a unique customer name, phone number, and branch.');
      return;
    }
    setCustomerName(''); setCustomerPhone(''); setCustomerEmail(''); setCustomerAddress(''); setCustomerBranchId('');
    Alert.alert('Submitted', 'The customer profile has been sent to the MD for approval.');
  }

  function recordCustomerPayment() {
    const amount = parseFloat(paymentAmount.replace(/,/g, '')) || 0;
    if (!addCustomerPayment({ customerId: paymentCustomerId, amount, date: paymentDate, reference: paymentReference })) {
      Alert.alert('Payment not recorded', 'Select an approved customer and enter a valid amount and date.');
      return;
    }
    setPaymentAmount(''); setPaymentReference('');
    Alert.alert('Payment recorded', 'The customer ledger and available advance have been updated.');
  }

  return (
    <ScreenLayout title="Accounts">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Summary hero */}
        <View style={[styles.summaryCard, { backgroundColor: roleColor }]}>
          <Text style={styles.sumLabel}>Net Profit (after CIT)</Text>
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
              <Text style={styles.sumItemLabel}>CIT</Text>
              <Text style={styles.sumItemValue} numberOfLines={1} adjustsFontSizeToFit>{fmt(citaProvision)}</Text>
            </View>
          </View>
        </View>
        {missingCostProducts.length > 0 && (
          <Text style={[styles.sectionHint, { color: colors.error }]}>Profit is incomplete until an opening or approved delivery cost is recorded for {missingCostProducts.join(', ')}.</Text>
        )}

        {/* Accountant-maintained financial position */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Financial Status</Text>
        <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
          Accountant-entered cash and goods in transit; receivables come from validated credit sales
        </Text>
        <FinancialStatusCard roleColor={roleColor} />

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Credit Customers</Text>
        <Text style={[styles.sectionHint, { color: colors.textMuted }]}>Approved credit sales increase a customer balance. Payments and advances reduce it and remain available for later purchases.</Text>

        {role === 'acc' && (
          <View style={[styles.waterfallCard, { backgroundColor: colors.surface, borderColor: colors.border, gap: 8 }]}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]}>Create Customer Profile</Text>
            {[
              ['Customer name *', customerName, setCustomerName],
              ['Phone number *', customerPhone, setCustomerPhone],
              ['Email', customerEmail, setCustomerEmail],
              ['Address', customerAddress, setCustomerAddress],
            ].map(([label, value, setter]) => (
              <TextInput key={label as string} value={value as string} onChangeText={setter as (value: string) => void}
                placeholder={label as string} placeholderTextColor={colors.textMuted}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 9, padding: 10, color: colors.text }} />
            ))}
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Branch *</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {branches.map(branch => (
                <TouchableOpacity key={branch.id} onPress={() => setCustomerBranchId(branch.id)}
                  style={{ borderWidth: 1, borderColor: customerBranchId === branch.id ? roleColor : colors.border, backgroundColor: customerBranchId === branch.id ? roleColor : colors.surface, borderRadius: 8, padding: 8 }}>
                  <Text style={{ color: customerBranchId === branch.id ? '#fff' : colors.text }}>{branch.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={createCustomer} style={{ backgroundColor: roleColor, borderRadius: 9, padding: 11, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Send to MD for Approval</Text>
            </TouchableOpacity>
          </View>
        )}

        {creditCustomers.map(customer => {
          const balance = customerLedgerBalance(customer.id, pumpDailyReports, customerPayments, currentMonthRange.to);
          return (
            <View key={customer.id} style={[styles.waterfallCard, { backgroundColor: colors.surface, borderColor: colors.border, gap: 5 }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{customer.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{branches.find(branch => branch.id === customer.branchId)?.name ?? customer.branchId} · {customer.phone} · {customer.status.replace('_', ' ')}</Text>
              {customer.status === 'approved' && (
                <Text style={{ color: balance > 0 ? colors.error : balance < 0 ? colors.success : colors.text, fontWeight: '800' }}>
                  {balance > 0 ? `Outstanding: ${fmt(balance)}` : balance < 0 ? `Advance available: ${fmt(Math.abs(balance))}` : 'Balanced'}
                </Text>
              )}
              {(role === 'md' || role === 'admin') && customer.status === 'pending_md' && (
                <>
                  <TextInput value={rejectionReason} onChangeText={setRejectionReason} placeholder="Rejection reason (required only to reject)" placeholderTextColor={colors.textMuted}
                    style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 9, padding: 9, color: colors.text }} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => approveCreditCustomer(customer.id)} style={{ flex: 1, backgroundColor: colors.success, borderRadius: 8, padding: 9, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '700' }}>Approve</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => {
                      if (!rejectCreditCustomer(customer.id, rejectionReason)) Alert.alert('Reason required', 'Enter a rejection reason.');
                      else setRejectionReason('');
                    }} style={{ flex: 1, backgroundColor: colors.error, borderRadius: 8, padding: 9, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '700' }}>Reject</Text></TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          );
        })}

        {(role === 'acc' || role === 'admin') && creditCustomers.some(customer => customer.status === 'approved') && (
          <View style={[styles.waterfallCard, { backgroundColor: colors.surface, borderColor: colors.border, gap: 8 }]}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]}>Record Payment or Advance</Text>
            <View style={{ gap: 6 }}>
              {creditCustomers.filter(customer => customer.status === 'approved').map(customer => (
                <TouchableOpacity key={customer.id} onPress={() => setPaymentCustomerId(customer.id)}
                  style={{ borderWidth: 1, borderColor: paymentCustomerId === customer.id ? roleColor : colors.border, backgroundColor: paymentCustomerId === customer.id ? roleColor : colors.surface, borderRadius: 8, padding: 8 }}>
                  <Text style={{ color: paymentCustomerId === customer.id ? '#fff' : colors.text }}>{customer.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" placeholder="Amount paid or deposited" placeholderTextColor={colors.textMuted} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 9, padding: 10, color: colors.text }} />
            <TextInput value={paymentDate} onChangeText={setPaymentDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 9, padding: 10, color: colors.text }} />
            <TextInput value={paymentReference} onChangeText={setPaymentReference} placeholder="Receipt or bank reference" placeholderTextColor={colors.textMuted} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 9, padding: 10, color: colors.text }} />
            <TouchableOpacity onPress={recordCustomerPayment} style={{ backgroundColor: roleColor, borderRadius: 9, padding: 11, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '700' }}>Record Payment</Text></TouchableOpacity>
          </View>
        )}

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
            { label: 'Interest Paid on Loans', value: loanInterest, color: colors.error, sign: '−' },
            { label: 'Profit Before CIT', value: profitBeforeTax,  color: colors.text,     sign: '=' },
            { label: `CIT @ ${(citaRate * 100).toFixed(0)}%`, value: citaProvision, color: colors.amber, sign: '−' },
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

        {/* CIT info note */}
        <View style={[styles.citaNote, { backgroundColor: colors.amber + '12', borderColor: colors.amber + '44' }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.amber} />
          <Text style={[styles.citaNoteText, { color: colors.text }]}>
            CIT (Company Income Tax) is provisioned at{' '}
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
