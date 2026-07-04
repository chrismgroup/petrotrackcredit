import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const TABS = ['Pending', 'Approved', 'All'];

const ST_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: '#BA7517', bg: '#FAEEDA' },
  approved: { label: 'Approved', color: '#27500A', bg: '#EAF3DE' },
  rejected: { label: 'Rejected', color: '#791F1F', bg: '#FCEBEB' },
};

export default function ExpensesScreen() {
  const { role, expenses, approveExpense, rejectExpense } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'acc'] || colors.primary;
  const canApprove = role === 'acc' || role === 'ceo' || role === 'md' || role === 'admin';
  const [tab, setTab] = useState(0);

  const filtered = tab === 0 ? expenses.filter(e => e.status === 'pending')
    : tab === 1 ? expenses.filter(e => e.status === 'approved')
    : expenses;

  const pendingAmt = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + e.amt, 0);
  const approvedAmt = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + e.amt, 0);

  return (
    <ScreenLayout title="Expenses">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
            <Text style={[styles.metricValue, { color: colors.warning }]}>{fmt(pendingAmt)}</Text>
            <Text style={[styles.metricLabel, { color: colors.warning }]}>Awaiting Approval</Text>
            <Text style={[styles.metricCount, { color: colors.textMuted }]}>{expenses.filter(e => e.status === 'pending').length} items</Text>
          </View>
          <View style={[styles.metricCard, { backgroundColor: colors.successBg, borderColor: colors.successBorder }]}>
            <Text style={[styles.metricValue, { color: colors.success }]}>{fmt(approvedAmt)}</Text>
            <Text style={[styles.metricLabel, { color: colors.success }]}>Approved This Month</Text>
            <Text style={[styles.metricCount, { color: colors.textMuted }]}>{expenses.filter(e => e.status === 'approved').length} items</Text>
          </View>
        </View>

        <View style={styles.tabRow}>
          {TABS.map((t, i) => (
            <TouchableOpacity key={t} onPress={() => setTab(i)} style={[styles.tabBtn, { backgroundColor: tab === i ? roleColor : colors.surface, borderColor: tab === i ? roleColor : colors.border }]}>
              <Text style={[styles.tabText, { color: tab === i ? '#fff' : colors.textMuted }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={40} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No {TABS[tab].toLowerCase()} expenses</Text>
          </View>
        )}

        {filtered.map(exp => {
          const st = ST_STYLES[exp.status] || ST_STYLES.pending;
          return (
            <View key={exp.id} style={[styles.expCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.expHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.expCat, { color: colors.text }]}>{exp.cat}</Text>
                  <Text style={[styles.expDesc, { color: colors.textMuted }]}>{exp.desc}</Text>
                  <Text style={[styles.expMeta, { color: colors.textSubtle }]}>by {exp.byName} · {fmtDateTime(exp.dt)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[styles.expAmt, { color: roleColor }]}>{fmt(exp.amt)}</Text>
                  <View style={[styles.stBadge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.stText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>
              </View>
              {exp.approvedBy && (
                <Text style={[styles.approvedBy, { color: colors.success }]}>✓ Approved by {exp.approvedBy}</Text>
              )}
              {canApprove && exp.status === 'pending' && (
                <View style={styles.actionRow}>
                  <TouchableOpacity onPress={() => approveExpense(exp.id)} style={[styles.approveBtn, { backgroundColor: colors.successBg, borderColor: colors.successBorder }]}>
                    <Ionicons name="checkmark" size={14} color={colors.success} />
                    <Text style={[styles.approveBtnText, { color: colors.success }]}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => rejectExpense(exp.id)} style={[styles.rejectBtn, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
                    <Ionicons name="close" size={14} color={colors.error} />
                    <Text style={[styles.rejectBtnText, { color: colors.error }]}>Reject</Text>
                  </TouchableOpacity>
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
  scroll: { padding: 16 },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  metricCard: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1 },
  metricValue: { fontSize: 18, fontWeight: '700' },
  metricLabel: { fontSize: 11, marginTop: 2 },
  metricCount: { fontSize: 11, marginTop: 2 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  tabText: { fontSize: 13, fontWeight: '600' },
  expCard: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10, gap: 8 },
  expHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  expCat: { fontSize: 14, fontWeight: '700' },
  expDesc: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  expMeta: { fontSize: 11, marginTop: 4 },
  expAmt: { fontSize: 18, fontWeight: '700' },
  stBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  stText: { fontSize: 11, fontWeight: '700' },
  approvedBy: { fontSize: 12, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 8 },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  approveBtnText: { fontSize: 13, fontWeight: '700' },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  rejectBtnText: { fontSize: 13, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14 },
});
