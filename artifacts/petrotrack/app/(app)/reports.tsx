import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, fmtDate, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type Period = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
const PERIODS: Period[] = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'];
const SCALE: Record<Period, number> = { Daily: 1, Weekly: 7, Monthly: 30, Quarterly: 90, Yearly: 365 };
const PERIOD_LABELS: Record<Period, string> = {
  Daily: "Today's", Weekly: "This Week's", Monthly: "This Month's",
  Quarterly: "This Quarter's", Yearly: "This Year's",
};

function periodRange(p: Period): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - (SCALE[p] - 1));
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export default function ReportsScreen() {
  const { role, expenses, sales, branches } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'acc'] || colors.primary;
  const [period, setPeriod] = useState<Period>('Monthly');
  const [reportTab, setReportTab] = useState<'summary' | 'expenses' | 'sales'>('summary');

  const { from, to } = useMemo(() => periodRange(period), [period]);
  const scale = SCALE[period];

  const totalRev = branches.reduce((s, b) => s + b.rev, 0);
  const allApproved = expenses.filter(e => e.status === 'approved');
  const totalExpenses = allApproved.reduce((s, e) => s + e.amt, 0);
  const totalSalesRaw = sales.reduce((s, e) => s + e.L * e.price, 0);

  const scaledRev = Math.round(totalRev / 30 * scale);
  const scaledExp = Math.round(totalExpenses / 30 * scale);
  const scaledSales = Math.round(totalSalesRaw / 30 * scale);
  const scaledNet = scaledRev - scaledExp;
  const margin = scaledRev > 0 ? Math.round((scaledNet / scaledRev) * 100) : 0;

  const catTotals: Record<string, number> = {};
  for (const e of allApproved) {
    catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amt;
  }

  const catScaled = Object.entries(catTotals).map(([cat, total]) => ({
    cat, total: Math.round(total / 30 * scale),
    pct: totalExpenses > 0 ? Math.round((total / totalExpenses) * 100) : 0,
  })).sort((a, b) => b.total - a.total);

  const prodSales = [
    { prod: 'PMS', color: '#1a6e3c', L: sales.filter(s => s.pump.includes('PMS')).reduce((s, e) => s + e.L, 0), price: 830 },
    { prod: 'AGO', color: '#185FA5', L: sales.filter(s => s.pump.includes('AGO')).reduce((s, e) => s + e.L, 0), price: 1050 },
    { prod: 'DPK', color: '#BA7517', L: sales.filter(s => s.pump.includes('DPK')).reduce((s, e) => s + e.L, 0), price: 700 },
  ].map(p => ({ ...p, scaledL: Math.round(p.L * scale), scaledRev: Math.round(p.L * scale * p.price) }));

  const expItems = allApproved.slice().reverse().map(e => ({
    ...e, scaledAmt: Math.round(e.amt / 30 * scale),
  }));

  return (
    <ScreenLayout title="Expense Reports">
      <View style={styles.periodScroll}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodRow}>
          {PERIODS.map(p => (
            <TouchableOpacity key={p} onPress={() => setPeriod(p)} style={[styles.periodBtn, { backgroundColor: p === period ? roleColor : colors.surface, borderColor: p === period ? roleColor : colors.border }]}>
              <Text style={[styles.periodText, { color: p === period ? '#fff' : colors.textMuted }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.reportTabs}>
        {(['summary', 'expenses', 'sales'] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setReportTab(t)} style={[styles.reportTab, { borderBottomColor: t === reportTab ? roleColor : 'transparent', borderBottomWidth: 2 }]}>
            <Text style={[styles.reportTabText, { color: t === reportTab ? roleColor : colors.textMuted, fontWeight: t === reportTab ? '700' : '400' }]}>
              {t === 'summary' ? 'Summary' : t === 'expenses' ? 'Expenses' : 'Sales'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {reportTab === 'summary' && (
          <>
            <View style={[styles.summaryCard, { backgroundColor: roleColor }]}>
              <Text style={styles.summaryPeriod}>{PERIOD_LABELS[period]} Report</Text>
              <Text style={styles.summaryNet}>{fmt(scaledNet)}</Text>
              <Text style={styles.summaryNetLabel}>Net Profit · {margin}% margin</Text>
              <View style={styles.summaryRow}>
                {[
                  { label: 'Revenue', value: scaledRev, icon: 'trending-up' },
                  { label: 'Expenses', value: scaledExp, icon: 'trending-down' },
                  { label: 'Sales', value: scaledSales, icon: 'bar-chart' },
                ].map(item => (
                  <View key={item.label} style={styles.summaryItem}>
                    <Ionicons name={item.icon as any} size={12} color="rgba(255,255,255,0.65)" />
                    <Text style={styles.summaryItemLabel}>{item.label}</Text>
                    <Text style={styles.summaryItemValue}>{fmt(item.value)}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Expense Breakdown</Text>
            {catScaled.map(c => (
              <View key={c.cat} style={[styles.catRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <View style={styles.catHeader}>
                    <Text style={[styles.catName, { color: colors.text }]}>{c.cat}</Text>
                    <Text style={[styles.catAmt, { color: roleColor }]}>{fmt(c.total)}</Text>
                  </View>
                  <View style={[styles.progressBg, { backgroundColor: colors.border }]}>
                    <View style={[styles.progressBar, { width: `${c.pct}%` as any, backgroundColor: roleColor }]} />
                  </View>
                  <Text style={[styles.catPct, { color: colors.textMuted }]}>{c.pct}% of expenses</Text>
                </View>
              </View>
            ))}

            <View style={[styles.exportBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="download-outline" size={20} color={roleColor} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.exportTitle, { color: colors.text }]}>Export {period} Report</Text>
                <Text style={[styles.exportSub, { color: colors.textMuted }]}>PDF · Excel · CSV — {fmtDate(from.toISOString())} to {fmtDate(to.toISOString())}</Text>
              </View>
              <TouchableOpacity style={[styles.exportBtn, { backgroundColor: roleColor }]}>
                <Text style={styles.exportBtnText}>Export</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {reportTab === 'expenses' && (
          <>
            <View style={[styles.totalPill, { backgroundColor: roleColor + '18', borderColor: roleColor + '33' }]}>
              <Text style={[styles.totalPillLabel, { color: roleColor }]}>{PERIOD_LABELS[period]} Total Approved Expenses</Text>
              <Text style={[styles.totalPillValue, { color: roleColor }]}>{fmt(scaledExp)}</Text>
            </View>
            {expItems.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="receipt-outline" size={40} color={colors.border} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No approved expenses found</Text>
              </View>
            )}
            {expItems.map(e => (
              <View key={e.id} style={[styles.expItemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.expItemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.expItemCat, { color: colors.text }]}>{e.cat}</Text>
                    <Text style={[styles.expItemDesc, { color: colors.textMuted }]}>{e.desc}</Text>
                    <Text style={[styles.expItemMeta, { color: colors.textSubtle }]}>by {e.byName} · Approved by {e.approvedBy}</Text>
                  </View>
                  <Text style={[styles.expItemAmt, { color: roleColor }]}>{fmt(e.amt)}</Text>
                </View>
              </View>
            ))}
            <View style={[styles.exportBanner, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 8 }]}>
              <Ionicons name="document-text-outline" size={20} color={roleColor} />
              <Text style={[{ flex: 1, fontSize: 13, color: colors.textMuted }]}>Export expense ledger as PDF or Excel</Text>
              <TouchableOpacity style={[styles.exportBtn, { backgroundColor: roleColor }]}>
                <Text style={styles.exportBtnText}>Export</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {reportTab === 'sales' && (
          <>
            <View style={[styles.totalPill, { backgroundColor: roleColor + '18', borderColor: roleColor + '33' }]}>
              <Text style={[styles.totalPillLabel, { color: roleColor }]}>{PERIOD_LABELS[period]} Total Sales Revenue</Text>
              <Text style={[styles.totalPillValue, { color: roleColor }]}>{fmt(scaledSales)}</Text>
            </View>
            {prodSales.map(p => (
              <View key={p.prod} style={[styles.catRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.prodDot, { backgroundColor: p.color }]} />
                <View style={{ flex: 1 }}>
                  <View style={styles.catHeader}>
                    <Text style={[styles.catName, { color: colors.text }]}>{p.prod}</Text>
                    <Text style={[styles.catAmt, { color: p.color }]}>{fmt(p.scaledRev)}</Text>
                  </View>
                  <Text style={[styles.catPct, { color: colors.textMuted }]}>{p.scaledL.toLocaleString()} L · ₦{p.price}/L</Text>
                </View>
              </View>
            ))}
            <View style={[styles.exportBanner, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 8 }]}>
              <Ionicons name="download-outline" size={20} color={roleColor} />
              <Text style={[{ flex: 1, fontSize: 13, color: colors.textMuted }]}>Export sales report for {period.toLowerCase()} period</Text>
              <TouchableOpacity style={[styles.exportBtn, { backgroundColor: roleColor }]}>
                <Text style={styles.exportBtnText}>Export</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  periodScroll: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e3' },
  periodRow: { flexDirection: 'row', gap: 6, padding: 10, paddingHorizontal: 12 },
  periodBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  periodText: { fontSize: 12, fontWeight: '600' },
  reportTabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e3' },
  reportTab: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  reportTabText: { fontSize: 13 },
  scroll: { padding: 16 },
  summaryCard: { borderRadius: 16, padding: 20, marginBottom: 16 },
  summaryPeriod: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginBottom: 4 },
  summaryNet: { color: '#fff', fontSize: 32, fontWeight: '800' },
  summaryNetLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginBottom: 14 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryItemLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 10 },
  summaryItemValue: { color: '#fff', fontSize: 13, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  prodDot: { width: 10, height: 10, borderRadius: 5 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  catName: { fontSize: 13, fontWeight: '600' },
  catAmt: { fontSize: 13, fontWeight: '700' },
  catPct: { fontSize: 10, marginTop: 4 },
  progressBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: 6, borderRadius: 3 },
  exportBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  exportTitle: { fontSize: 14, fontWeight: '600' },
  exportSub: { fontSize: 11, marginTop: 2 },
  exportBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  exportBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  totalPill: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 14, alignItems: 'center' },
  totalPillLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  totalPillValue: { fontSize: 28, fontWeight: '800' },
  expItemCard: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  expItemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  expItemCat: { fontSize: 13, fontWeight: '700' },
  expItemDesc: { fontSize: 12, marginTop: 2 },
  expItemMeta: { fontSize: 10, marginTop: 3 },
  expItemAmt: { fontSize: 15, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14 },
});
