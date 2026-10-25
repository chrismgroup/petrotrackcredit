import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AppliedDateField } from '@/components/AppliedDateField';
import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { expenseReportPeriodLabel } from '@/lib/expense-reporting';
import { safeNum, safeStr } from '@/lib/report-helpers';
import {
  filterSalesAuditEntries, groupSalesAuditEntries, salesUnit,
  type SalesAuditEntry, type SalesReportPeriod,
} from '@/lib/sales-reporting';

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function businessDateKey(value: unknown): string {
  return safeStr(value, '').slice(0, 10);
}

type Colors = ReturnType<typeof useColors>;

function FilterChip({ label, active, onPress, color, colors, square = false }: {
  label: string; active: boolean; onPress: () => void; color: string; colors: Colors; square?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.filterChip, square && styles.filterChipSquare, {
      backgroundColor: active ? color : colors.background,
      borderColor: active ? color : colors.border,
    }]}>
      <Text style={[styles.filterChipText, { color: active ? '#fff' : colors.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SummaryCard({ label, value, color, colors }: { label: string; value: string; color: string; colors: Colors }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
    </View>
  );
}

export default function SalesScreen() {
  const { role, branchId, branches, pumpDailyReports, pumps } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'att'] || colors.primary;
  const isGlobal = role === 'admin' || role === 'md' || role === 'ceo' || role === 'acc' || role === 'csm';
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState('all');
  const [period, setPeriod] = useState<SalesReportPeriod>('all');
  const [anchorDate, setAnchorDate] = useState(localDateKey());

  const entries = useMemo<SalesAuditEntry[]>(() => {
    const branchNames = Object.fromEntries(branches.map(branch => [branch.id, safeStr(branch.name)]));
    const resolveBranchId = (report: typeof pumpDailyReports[number]) =>
      report.branchId || pumps.find(pump => pump.id === report.pumpId)?.branchId;
    return pumpDailyReports
      .filter(report => {
        const reportBranchId = resolveBranchId(report);
        return report.status === 'approved' && (isGlobal || (!!branchId && reportBranchId === branchId));
      })
      .map(report => {
        const resolvedBranchId = resolveBranchId(report) || 'unassigned';
        return {
          id: report.id,
          date: businessDateKey(report.date),
          branchId: resolvedBranchId,
          branchName: branchNames[resolvedBranchId] || 'Unassigned branch',
          product: safeStr(report.product, 'Unknown product'),
          quantity: safeNum(report.liters),
          amount: safeNum(report.grossAmount),
        };
      });
  }, [branchId, branches, isGlobal, pumpDailyReports, pumps]);
  const products = useMemo(() => [...new Set(entries.map(entry => entry.product))].sort(), [entries]);
  const visibleBranches = branches.filter(branch => isGlobal || branch.id === branchId);
  const filteredEntries = useMemo(() => filterSalesAuditEntries(entries, {
    branchId: selectedBranch,
    product: selectedProduct,
    period,
    anchor: anchorDate,
  }), [anchorDate, entries, period, selectedBranch, selectedProduct]);
  const groups = useMemo(() => groupSalesAuditEntries(filteredEntries), [filteredEntries]);
  const totalAmount = filteredEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const totalLiquid = filteredEntries.filter(entry => salesUnit(entry.product) === 'L').reduce((sum, entry) => sum + entry.quantity, 0);
  const totalLpg = filteredEntries.filter(entry => salesUnit(entry.product) === 'kg').reduce((sum, entry) => sum + entry.quantity, 0);

  return (
    <ScreenLayout title="Sales">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.auditFilters, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.auditHeader}>
            <View style={[styles.auditIcon, { backgroundColor: roleColor + '18' }]}>
              <Ionicons name="analytics-outline" size={17} color={roleColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.auditTitle, { color: colors.text }]}>Sales audit ledger</Text>
              <Text style={[styles.auditSubtitle, { color: colors.textMuted }]}>Approved shift sales only. Expenses are excluded.</Text>
            </View>
            {(selectedBranch !== 'all' || selectedProduct !== 'all' || period !== 'all') ? (
              <TouchableOpacity onPress={() => { setSelectedBranch('all'); setSelectedProduct('all'); setPeriod('all'); setAnchorDate(localDateKey()); }}>
                <Text style={[styles.resetText, { color: roleColor }]}>Reset</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {isGlobal && visibleBranches.length > 1 ? (
            <>
              <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Branch</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
                <FilterChip label="All branches" active={selectedBranch === 'all'} onPress={() => setSelectedBranch('all')} color={roleColor} colors={colors} />
                {visibleBranches.map(branch => (
                  <FilterChip key={branch.id} label={branch.name} active={selectedBranch === branch.id} onPress={() => setSelectedBranch(branch.id)} color={roleColor} colors={colors} />
                ))}
              </ScrollView>
            </>
          ) : null}

          <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Product</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
            <FilterChip label="All products" active={selectedProduct === 'all'} onPress={() => setSelectedProduct('all')} color={roleColor} colors={colors} />
            {products.map(product => (
              <FilterChip key={product} label={product} active={selectedProduct === product} onPress={() => setSelectedProduct(product)} color={roleColor} colors={colors} />
            ))}
          </ScrollView>

          <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Period</Text>
          <View style={styles.periodRow}>
            {([['date', 'Day'], ['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year'], ['all', 'All time']] as const).map(([value, label]) => (
              <FilterChip key={value} label={label} active={period === value} onPress={() => setPeriod(value)} color={roleColor} colors={colors} square />
            ))}
          </View>
          {period !== 'all' ? (
            <AppliedDateField value={anchorDate} onChange={setAnchorDate} label="Reporting period containing" accent={roleColor} helper="Choose any date within the sales period to audit." />
          ) : null}
        </View>

        <View style={styles.summaryGrid}>
          <SummaryCard label="Sales amount" value={fmt(totalAmount)} color={roleColor} colors={colors} />
          <SummaryCard label="Liquid products" value={`${totalLiquid.toLocaleString()} L`} color="#286247" colors={colors} />
          <SummaryCard label="LPG" value={`${totalLpg.toLocaleString()} kg`} color="#174D36" colors={colors} />
          <SummaryCard label="Source records" value={filteredEntries.length.toLocaleString()} color="#71805B" colors={colors} />
        </View>
        <Text style={[styles.periodCaption, { color: colors.textMuted }]}>{expenseReportPeriodLabel(anchorDate, period)}</Text>

        {groups.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="bar-chart-outline" size={30} color={colors.textSubtle} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No approved sales records match these filters.</Text>
          </View>
        ) : null}

        {groups.map(branch => (
          <View key={branch.id} style={styles.branchSection}>
            <View style={[styles.branchHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.branchIcon, { backgroundColor: roleColor + '18' }]}><Ionicons name="business-outline" size={17} color={roleColor} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.branchName, { color: colors.text }]}>{branch.name}</Text>
                <Text style={[styles.branchMeta, { color: colors.textMuted }]}>{branch.records} approved shift record{branch.records === 1 ? '' : 's'}</Text>
              </View>
              <Text style={[styles.branchAmount, { color: roleColor }]}>{fmt(branch.amount)}</Text>
            </View>
            {branch.products.map(product => (
              <View key={product.product} style={[styles.productCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.productHeader}>
                  <View style={[styles.prodDot, { backgroundColor: roleColor }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.productName, { color: colors.text }]}>{product.product}</Text>
                    <Text style={[styles.productMeta, { color: colors.textMuted }]}>{product.records} record{product.records === 1 ? '' : 's'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.productAmount, { color: roleColor }]}>{fmt(product.amount)}</Text>
                    <Text style={[styles.productQuantity, { color: colors.textMuted }]}>{product.quantity.toLocaleString()} {product.unit}</Text>
                  </View>
                </View>
                <View style={[styles.ledgerHeader, { borderTopColor: colors.border }]}>
                  <Text style={[styles.ledgerHeadText, { color: colors.textSubtle }]}>DATE</Text>
                  <Text style={[styles.ledgerHeadText, { color: colors.textSubtle }]}>QUANTITY</Text>
                  <Text style={[styles.ledgerHeadText, { color: colors.textSubtle }]}>AMOUNT</Text>
                </View>
                {product.daily.map(day => (
                  <View key={day.date} style={[styles.ledgerRow, { borderTopColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.ledgerDate, { color: colors.text }]}>{day.date}</Text>
                      <Text style={[styles.ledgerRecords, { color: colors.textSubtle }]}>{day.records} shift{day.records === 1 ? '' : 's'}</Text>
                    </View>
                    <Text style={[styles.ledgerValue, { color: colors.text }]}>{day.quantity.toLocaleString()} {product.unit}</Text>
                    <Text style={[styles.ledgerValue, { color: roleColor }]}>{fmt(day.amount)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}
        <View style={{ height: 16 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  auditFilters: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12, gap: 7 },
  auditHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 2 },
  auditIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  auditTitle: { fontSize: 15, fontWeight: '800' },
  auditSubtitle: { fontSize: 11, marginTop: 1 },
  resetText: { fontSize: 12, fontWeight: '700', padding: 5 },
  filterLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginTop: 3 },
  filterChips: { gap: 7, paddingVertical: 1, paddingRight: 6 },
  filterChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7 },
  filterChipSquare: { borderRadius: 8 },
  filterChipText: { fontSize: 12, fontWeight: '700' },
  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 7 },
  summaryCard: { width: '48%', borderWidth: 1, borderRadius: 12, padding: 12 },
  summaryLabel: { fontSize: 10, fontWeight: '600' },
  summaryValue: { fontSize: 17, fontWeight: '800', marginTop: 4 },
  periodCaption: { fontSize: 11, fontWeight: '600', marginBottom: 12, textAlign: 'right' },
  emptyCard: { padding: 32, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 8, marginBottom: 8 },
  emptyText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  branchSection: { marginBottom: 12 },
  branchHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  branchIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  branchName: { fontSize: 14, fontWeight: '800' },
  branchMeta: { fontSize: 10, marginTop: 2 },
  branchAmount: { fontSize: 16, fontWeight: '800' },
  productCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  productHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  prodDot: { width: 9, height: 9, borderRadius: 5 },
  productName: { fontSize: 14, fontWeight: '800' },
  productMeta: { fontSize: 10, marginTop: 1 },
  productAmount: { fontSize: 15, fontWeight: '800' },
  productQuantity: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  ledgerHeader: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 8 },
  ledgerHeadText: { width: '33%', fontSize: 9, fontWeight: '700' },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  ledgerDate: { fontSize: 11, fontWeight: '700' },
  ledgerRecords: { fontSize: 9, marginTop: 1 },
  ledgerValue: { width: '33%', fontSize: 11, fontWeight: '700', textAlign: 'right' },
});
