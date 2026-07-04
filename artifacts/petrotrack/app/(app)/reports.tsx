import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const PERIODS = ['Daily', 'Weekly', 'Monthly', 'Quarterly'];

export default function ReportsScreen() {
  const { role, expenses, sales, branches } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'acc'] || colors.primary;
  const [period, setPeriod] = useState(2);

  const totalRev = branches.reduce((s, b) => s + b.rev, 0);
  const totalExpenses = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + e.amt, 0);
  const totalSales = sales.reduce((s, e) => s + e.L * e.price, 0);

  const catTotals: Record<string, number> = {};
  for (const e of expenses) {
    if (e.status === 'approved') catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amt;
  }

  const scaleFactor = [1, 7, 30, 90][period];

  return (
    <ScreenLayout title="Reports">
      <View style={styles.periodRow}>
        {PERIODS.map((p, i) => (
          <TouchableOpacity key={p} onPress={() => setPeriod(i)} style={[styles.periodBtn, { backgroundColor: i === period ? roleColor : colors.surface, borderColor: i === period ? roleColor : colors.border }]}>
            <Text style={[styles.periodText, { color: i === period ? '#fff' : colors.textMuted }]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.summaryCard, { backgroundColor: roleColor }]}>
          <Text style={styles.summaryLabel}>{PERIODS[period]} Net Profit</Text>
          <Text style={styles.summaryValue}>{fmt(Math.round((totalRev - totalExpenses) / 30 * scaleFactor))}</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Ionicons name="trending-up" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.summaryItemLabel}>Revenue</Text>
              <Text style={styles.summaryItemValue}>{fmt(Math.round(totalRev / 30 * scaleFactor))}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Ionicons name="trending-down" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.summaryItemLabel}>Expenses</Text>
              <Text style={styles.summaryItemValue}>{fmt(Math.round(totalExpenses / 30 * scaleFactor))}</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Expense Breakdown</Text>
        {Object.entries(catTotals).map(([cat, total]) => {
          const pct = Math.round((total / totalExpenses) * 100);
          return (
            <View key={cat} style={[styles.catRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <View style={styles.catHeader}>
                  <Text style={[styles.catName, { color: colors.text }]}>{cat}</Text>
                  <Text style={[styles.catAmt, { color: roleColor }]}>{fmt(Math.round(total / 30 * scaleFactor))}</Text>
                </View>
                <View style={[styles.progressBg, { backgroundColor: colors.border }]}>
                  <View style={[styles.progressBar, { width: `${pct}%` as any, backgroundColor: roleColor }]} />
                </View>
                <Text style={[styles.catPct, { color: colors.textMuted }]}>{pct}% of expenses</Text>
              </View>
            </View>
          );
        })}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Sales by Product</Text>
        {[
          { prod: 'PMS', L: sales.filter(s => s.pump.includes('PMS')).reduce((s, e) => s + e.L, 0), color: colors.primary },
          { prod: 'AGO', L: sales.filter(s => s.pump.includes('AGO')).reduce((s, e) => s + e.L, 0), color: colors.blue },
          { prod: 'DPK', L: sales.filter(s => s.pump.includes('DPK')).reduce((s, e) => s + e.L, 0), color: colors.amber },
        ].map(p => (
          <View key={p.prod} style={[styles.prodRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.prodDot, { backgroundColor: p.color }]} />
            <Text style={[styles.prodName, { color: colors.text }]}>{p.prod}</Text>
            <Text style={[styles.prodL, { color: colors.textMuted }]}>{(p.L * scaleFactor).toLocaleString()} L</Text>
            <Text style={[styles.prodAmt, { color: p.color }]}>{fmt(p.L * scaleFactor * 830)}</Text>
          </View>
        ))}

        <View style={{ height: 16 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  periodRow: { flexDirection: 'row', gap: 6, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e3' },
  periodBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  periodText: { fontSize: 12, fontWeight: '600' },
  scroll: { padding: 16 },
  summaryCard: { borderRadius: 16, padding: 20, marginBottom: 16 },
  summaryLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 4 },
  summaryValue: { color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 14 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryItemLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 11 },
  summaryItemValue: { color: '#fff', fontSize: 14, fontWeight: '700' },
  summaryDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.25)' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  catRow: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  catName: { fontSize: 13, fontWeight: '600' },
  catAmt: { fontSize: 13, fontWeight: '700' },
  catPct: { fontSize: 10, marginTop: 4 },
  progressBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: 6, borderRadius: 3 },
  prodRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  prodDot: { width: 10, height: 10, borderRadius: 5 },
  prodName: { flex: 1, fontSize: 14, fontWeight: '600' },
  prodL: { fontSize: 12 },
  prodAmt: { fontSize: 14, fontWeight: '700' },
});
