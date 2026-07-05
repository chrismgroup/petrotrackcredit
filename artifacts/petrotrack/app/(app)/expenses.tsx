import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const EXPENSE_CATS = [
  'Generator fuel', 'Security & guarding', 'Utilities',
  'Staff welfare', 'Maintenance & repairs', 'Office supplies',
  'Transport', 'Miscellaneous',
];

const ST_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending',  color: '#BA7517', bg: '#FAEEDA' },
  approved: { label: 'Approved', color: '#27500A', bg: '#EAF3DE' },
  rejected: { label: 'Rejected', color: '#791F1F', bg: '#FCEBEB' },
};

const TABS_ACC = ['Pending', 'Approved', 'All'];
const TABS_MGR = ['Submit', 'My Expenses'];

export default function ExpensesScreen() {
  const { role, expenses, sales, addExpense, approveExpense, rejectExpense, userName } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'acc'] || colors.primary;
  const isMgr = role === 'mgr';
  const canApprove = role === 'acc' || role === 'ceo' || role === 'md' || role === 'admin';

  const [tab, setTab] = useState(0);
  const [cat, setCat] = useState(EXPENSE_CATS[0]);
  const [desc, setDesc] = useState('');
  const [amt, setAmt] = useState('');
  const [ref, setRef] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  const todaySalesRev = sales
    .filter(s => s.dt.startsWith(today))
    .reduce((sum, s) => sum + s.L * s.price, 0);
  const todayApprovedExp = expenses
    .filter(e => e.status === 'approved' && e.dt.startsWith(today))
    .reduce((sum, e) => sum + e.amt, 0);
  const todayNet = todaySalesRev - todayApprovedExp;

  const pendingAmt = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + e.amt, 0);
  const approvedAmt = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + e.amt, 0);

  const myExpenses = expenses.filter(e => e.by === (role || ''));
  const filtered = tab === 0 ? expenses.filter(e => e.status === 'pending')
    : tab === 1 ? expenses.filter(e => e.status === 'approved')
    : expenses;

  function handleSubmit() {
    const amount = parseFloat(amt.replace(/,/g, ''));
    if (!desc.trim()) { Alert.alert('Error', 'Please enter a description.'); return; }
    if (!amount || amount <= 0) { Alert.alert('Error', 'Please enter a valid amount.'); return; }
    addExpense({ cat, desc: desc.trim(), amt: amount, by: role || 'mgr', byName: userName || 'Station Manager', ref: ref.trim() || undefined, budgetId: 2 });
    setDesc(''); setAmt(''); setRef('');
    Alert.alert('Submitted', 'Expense submitted and awaiting accountant approval.');
  }

  if (isMgr) {
    return (
      <ScreenLayout title="Daily Expenses">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.netBanner, { backgroundColor: todayNet >= 0 ? colors.successBg : colors.errorBg, borderColor: todayNet >= 0 ? colors.successBorder : colors.errorBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.netLabel, { color: colors.textMuted }]}>Today's Net Balance</Text>
              <Text style={[styles.netValue, { color: todayNet >= 0 ? colors.success : colors.error }]}>{fmt(todayNet)}</Text>
              <Text style={[styles.netSub, { color: colors.textSubtle }]}>Sales {fmt(todaySalesRev)} − Expenses {fmt(todayApprovedExp)}</Text>
            </View>
            <Ionicons name={todayNet >= 0 ? 'trending-up' : 'trending-down'} size={32} color={todayNet >= 0 ? colors.success : colors.error} />
          </View>

          <View style={styles.tabRow}>
            {TABS_MGR.map((t, i) => (
              <TouchableOpacity key={t} onPress={() => setTab(i)} style={[styles.tabBtn, { backgroundColor: tab === i ? roleColor : colors.surface, borderColor: tab === i ? roleColor : colors.border }]}>
                <Text style={[styles.tabText, { color: tab === i ? '#fff' : colors.textMuted }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === 0 && (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Expense Category</Text>
              <View style={styles.catGrid}>
                {EXPENSE_CATS.map(c => (
                  <TouchableOpacity key={c} onPress={() => setCat(c)} style={[styles.catChip, { backgroundColor: cat === c ? roleColor : colors.surface, borderColor: cat === c ? roleColor : colors.border }]}>
                    <Text style={[styles.catChipText, { color: cat === c ? '#fff' : colors.textMuted }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.text }]}>Description</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={desc} onChangeText={setDesc} multiline numberOfLines={3}
                placeholder="Describe the expense clearly..." placeholderTextColor={colors.textSubtle}
              />

              <Text style={[styles.fieldLabel, { color: colors.text }]}>Amount (₦)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={amt} onChangeText={setAmt} keyboardType="numeric"
                placeholder="0.00" placeholderTextColor={colors.textSubtle}
              />

              <Text style={[styles.fieldLabel, { color: colors.text }]}>Receipt Reference (optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={ref} onChangeText={setRef}
                placeholder="Invoice no., receipt no., etc." placeholderTextColor={colors.textSubtle}
              />

              <TouchableOpacity onPress={handleSubmit} style={[styles.submitBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>Submit for Approval</Text>
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          )}

          {tab === 1 && (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              {myExpenses.length === 0 && (
                <View style={styles.emptyState}>
                  <Ionicons name="receipt-outline" size={40} color={colors.border} />
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>No expenses submitted yet</Text>
                </View>
              )}
              {myExpenses.map(exp => {
                const st = ST_STYLES[exp.status] || ST_STYLES.pending;
                return (
                  <View key={exp.id} style={[styles.expCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.expHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.expCat, { color: colors.text }]}>{exp.cat}</Text>
                        <Text style={[styles.expDesc, { color: colors.textMuted }]}>{exp.desc}</Text>
                        <Text style={[styles.expMeta, { color: colors.textSubtle }]}>{fmtDateTime(exp.dt)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={[styles.expAmt, { color: roleColor }]}>{fmt(exp.amt)}</Text>
                        <View style={[styles.stBadge, { backgroundColor: st.bg }]}>
                          <Text style={[styles.stText, { color: st.color }]}>{st.label}</Text>
                        </View>
                      </View>
                    </View>
                    {exp.approvedBy && <Text style={[styles.approvedBy, { color: colors.success }]}>✓ Approved by {exp.approvedBy}</Text>}
                  </View>
                );
              })}
              <View style={{ height: 16 }} />
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout title="Expenses">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.netBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.netLabel, { color: colors.textMuted }]}>Today's Net Balance</Text>
            <Text style={[styles.netValue, { color: todayNet >= 0 ? colors.success : colors.error }]}>{fmt(todayNet)}</Text>
            <Text style={[styles.netSub, { color: colors.textSubtle }]}>Sales {fmt(todaySalesRev)} − Approved Expenses {fmt(todayApprovedExp)}</Text>
          </View>
          <Ionicons name={todayNet >= 0 ? 'checkmark-circle' : 'alert-circle'} size={30} color={todayNet >= 0 ? colors.success : colors.error} />
        </View>

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
          {TABS_ACC.map((t, i) => (
            <TouchableOpacity key={t} onPress={() => setTab(i)} style={[styles.tabBtn, { backgroundColor: tab === i ? roleColor : colors.surface, borderColor: tab === i ? roleColor : colors.border }]}>
              <Text style={[styles.tabText, { color: tab === i ? '#fff' : colors.textMuted }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={40} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No {TABS_ACC[tab].toLowerCase()} expenses</Text>
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
              {exp.approvedBy && <Text style={[styles.approvedBy, { color: colors.success }]}>✓ Approved by {exp.approvedBy}</Text>}
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
  netBanner: { flexDirection: 'row', alignItems: 'center', margin: 16, marginBottom: 0, padding: 16, borderRadius: 14, borderWidth: 1, gap: 12 },
  netLabel: { fontSize: 11, marginBottom: 2 },
  netValue: { fontSize: 26, fontWeight: '800' },
  netSub: { fontSize: 10, marginTop: 2 },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  metricCard: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1 },
  metricValue: { fontSize: 18, fontWeight: '700' },
  metricLabel: { fontSize: 11, marginTop: 2 },
  metricCount: { fontSize: 11, marginTop: 2 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 14, paddingHorizontal: 16 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  tabText: { fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  catChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  catChipText: { fontSize: 12, fontWeight: '600' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 14 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
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
