import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { Expense, ROLE_COLORS, fmt, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const EXPENSE_CATS = [
  'Generator fuel', 'Security & guarding', 'Utilities',
  'Staff welfare', 'Maintenance & repairs', 'Office supplies',
  'Transport', 'Miscellaneous',
];

const ST_STYLES: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:  { label: 'Pending',  color: '#BA7517', bg: '#FAEEDA', icon: 'time-outline' },
  approved: { label: 'Approved', color: '#27500A', bg: '#EAF3DE', icon: 'checkmark-circle' },
  rejected: { label: 'Rejected', color: '#791F1F', bg: '#FCEBEB', icon: 'close-circle' },
};

type ExpenseFormState = { cat: string; desc: string; amt: string; ref: string };
function blankForm(): ExpenseFormState { return { cat: EXPENSE_CATS[0], desc: '', amt: '', ref: '' }; }
function expenseToForm(e: Expense): ExpenseFormState {
  return { cat: e.cat, desc: e.desc, amt: String(e.amt), ref: e.ref ?? '' };
}

type FormSheetProps = {
  f: ExpenseFormState;
  setF: React.Dispatch<React.SetStateAction<ExpenseFormState>>;
  roleColor: string;
};
function FormSheet({ f, setF, roleColor }: FormSheetProps) {
  const colors = useColors();
  return (
    <>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>Category</Text>
      <View style={styles.catGrid}>
        {EXPENSE_CATS.map(c => (
          <TouchableOpacity key={c} onPress={() => setF(p => ({ ...p, cat: c }))}
            style={[styles.catChip, { backgroundColor: f.cat === c ? roleColor : colors.surface, borderColor: f.cat === c ? roleColor : colors.border }]}>
            <Text style={[styles.catChipText, { color: f.cat === c ? '#fff' : colors.textMuted }]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.fieldLabel, { color: colors.text }]}>Description *</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        value={f.desc} onChangeText={v => setF(p => ({ ...p, desc: v }))}
        multiline numberOfLines={3}
        placeholder="Describe the expense clearly..." placeholderTextColor={colors.textSubtle}
      />

      <Text style={[styles.fieldLabel, { color: colors.text }]}>Amount (₦) *</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        value={f.amt} onChangeText={v => setF(p => ({ ...p, amt: v }))}
        keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.textSubtle}
      />

      <Text style={[styles.fieldLabel, { color: colors.text }]}>Receipt / Reference (optional)</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        value={f.ref} onChangeText={v => setF(p => ({ ...p, ref: v }))}
        placeholder="Invoice no., receipt no., etc." placeholderTextColor={colors.textSubtle}
      />
    </>
  );
}

export default function ExpensesScreen() {
  const {
    role, userName, expenses, sales,
    addExpense, updateExpense, deleteExpense,
    approveExpense, rejectExpense,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'acc'] || colors.primary;

  const isSubmitter = role === 'acc' || role === 'mgr' || role === 'csm' || role === 'mktg' || role === 'admin';
  const canApprove  = role === 'md' || role === 'admin';

  const [tab, setTab]         = useState(0);
  const [showForm, setShowForm]   = useState(false);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);
  const [form, setForm]       = useState<ExpenseFormState>(blankForm());

  const today = new Date().toISOString().slice(0, 10);
  const todaySalesRev    = sales.filter(s => s.dt.startsWith(today)).reduce((s, x) => s + x.L * x.price, 0);
  const todayApprovedExp = expenses.filter(e => e.status === 'approved' && e.dt.startsWith(today)).reduce((s, e) => s + e.amt, 0);
  const todayNet = todaySalesRev - todayApprovedExp;

  const pendingAmt  = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + e.amt, 0);
  const approvedAmt = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + e.amt, 0);
  const pendingCount = expenses.filter(e => e.status === 'pending').length;

  const myExpenses = expenses.filter(e => e.by === role || e.byName === userName);

  /* Tabs differ by role */
  const TABS_MD        = ['Pending', 'Approved', 'All'];
  const TABS_SUBMITTER = ['My Expenses', 'All'];

  const displayedExpenses = canApprove
    ? (tab === 0 ? expenses.filter(e => e.status === 'pending')
      : tab === 1 ? expenses.filter(e => e.status === 'approved')
      : expenses)
    : (tab === 0 ? myExpenses : expenses);

  function openCreate() { setEditTarget(null); setForm(blankForm()); setShowForm(true); }
  function openEdit(e: Expense) { setEditTarget(e); setForm(expenseToForm(e)); setShowForm(true); }

  function validateForm(f: ExpenseFormState) {
    const amount = parseFloat(f.amt.replace(/,/g, ''));
    if (!f.desc.trim()) { Alert.alert('Error', 'Please enter a description.'); return null; }
    if (!amount || amount <= 0) { Alert.alert('Error', 'Please enter a valid amount.'); return null; }
    return amount;
  }

  function handleSave() {
    const amount = validateForm(form);
    if (amount === null) return;
    if (editTarget) {
      updateExpense(editTarget.id, { cat: form.cat, desc: form.desc.trim(), amt: amount, ref: form.ref.trim() || undefined });
    } else {
      addExpense({ cat: form.cat, desc: form.desc.trim(), amt: amount, by: role || 'mgr', byName: userName, ref: form.ref.trim() || undefined, budgetId: 2 });
    }
    setShowForm(false);
  }

  function handleDelete(e: Expense) {
    Alert.alert('Delete Expense?', `${e.cat} — ${fmt(e.amt)}\n\nThis cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteExpense(e.id) },
    ]);
  }

  const canEdit = (e: Expense) =>
    isSubmitter && e.status === 'pending' && (e.by === role || e.byName === userName);

  return (
    <ScreenLayout
      title="Expenses"
      rightAction={
        isSubmitter ? (
          <TouchableOpacity onPress={openCreate} style={styles.headerBtn}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        ) : undefined
      }
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Net balance banner */}
        <View style={[styles.netBanner, { backgroundColor: todayNet >= 0 ? colors.successBg : colors.errorBg, borderColor: todayNet >= 0 ? colors.successBorder : colors.errorBorder }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.netLabel, { color: colors.textMuted }]}>Today's Net Balance</Text>
            <Text style={[styles.netValue, { color: todayNet >= 0 ? colors.success : colors.error }]}>{fmt(todayNet)}</Text>
            <Text style={[styles.netSub, { color: colors.textSubtle }]}>{'Sales '}{fmt(todaySalesRev)}{' − Expenses '}{fmt(todayApprovedExp)}</Text>
          </View>
          <Ionicons name={todayNet >= 0 ? 'trending-up' : 'trending-down'} size={32} color={todayNet >= 0 ? colors.success : colors.error} />
        </View>

        {/* Metrics row */}
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
            <Text style={[styles.metricValue, { color: colors.warning }]}>{fmt(pendingAmt)}</Text>
            <Text style={[styles.metricLabel, { color: colors.warning }]}>Awaiting Approval</Text>
            <Text style={[styles.metricCount, { color: colors.textMuted }]}>{pendingCount}{' items'}</Text>
          </View>
          <View style={[styles.metricCard, { backgroundColor: colors.successBg, borderColor: colors.successBorder }]}>
            <Text style={[styles.metricValue, { color: colors.success }]}>{fmt(approvedAmt)}</Text>
            <Text style={[styles.metricLabel, { color: colors.success }]}>Approved This Month</Text>
            <Text style={[styles.metricCount, { color: colors.textMuted }]}>{expenses.filter(e => e.status === 'approved').length}{' items'}</Text>
          </View>
        </View>

        {/* MD pending banner */}
        {canApprove && pendingCount > 0 ? (
          <View style={[styles.pendingBanner, { backgroundColor: '#FAEEDA', borderColor: '#BA7517' }]}>
            <Ionicons name="time" size={15} color="#BA7517" />
            <Text style={[styles.pendingBannerText, { color: '#BA7517' }]}>
              {pendingCount}{' expense'}{pendingCount > 1 ? 's' : ''}{' awaiting your approval'}
            </Text>
          </View>
        ) : null}

        {/* Tabs */}
        <View style={styles.tabRow}>
          {(canApprove ? TABS_MD : TABS_SUBMITTER).map((t, i) => (
            <TouchableOpacity key={t} onPress={() => setTab(i)}
              style={[styles.tabBtn, { backgroundColor: tab === i ? roleColor : colors.surface, borderColor: tab === i ? roleColor : colors.border }]}>
              <Text style={[styles.tabText, { color: tab === i ? '#fff' : colors.textMuted }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {displayedExpenses.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No expenses here yet</Text>
            </View>
          ) : null}

          {displayedExpenses.map(exp => {
            const st = ST_STYLES[exp.status] || ST_STYLES.pending;
            const editable = canEdit(exp);
            const locked = exp.status === 'approved';
            return (
              <View key={exp.id} style={[styles.expCard, {
                backgroundColor: colors.surface,
                borderColor: exp.status === 'pending' && canApprove ? '#BA7517' : colors.border,
                borderWidth: exp.status === 'pending' && canApprove ? 1.5 : 1,
              }]}>
                <View style={styles.expHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.expCat, { color: colors.text }]}>{exp.cat}</Text>
                    <Text style={[styles.expDesc, { color: colors.textMuted }]}>{exp.desc}</Text>
                    <Text style={[styles.expMeta, { color: colors.textSubtle }]}>{'by '}{exp.byName}{' · '}{fmtDateTime(exp.dt)}</Text>
                    {exp.ref ? <Text style={[styles.expMeta, { color: colors.textSubtle }]}>{'Ref: '}{exp.ref}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[styles.expAmt, { color: roleColor }]}>{fmt(exp.amt)}</Text>
                    <View style={[styles.stBadge, { backgroundColor: st.bg }]}>
                      <Ionicons name={st.icon as any} size={10} color={st.color} />
                      <Text style={[styles.stText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>
                </View>

                {exp.approvedBy ? (
                  <View style={[styles.approvedRow, { backgroundColor: '#EAF3DE', borderColor: '#27500A20' }]}>
                    <Ionicons name="checkmark-circle" size={12} color="#27500A" />
                    <Text style={[styles.approvedText, { color: '#27500A' }]}>{'Approved by '}{exp.approvedBy}</Text>
                    {exp.approvedDt ? <Text style={[styles.approvedText, { color: '#27500A' }]}>{' · '}{fmtDateTime(exp.approvedDt)}</Text> : null}
                  </View>
                ) : null}

                {/* Submitter edit/delete */}
                {editable ? (
                  <View style={styles.actionRow}>
                    <TouchableOpacity onPress={() => openEdit(exp)} style={[styles.actionBtn, { borderColor: '#185FA5' }]}>
                      <Ionicons name="create-outline" size={13} color="#185FA5" />
                      <Text style={[styles.actionBtnText, { color: '#185FA5' }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(exp)} style={[styles.actionBtn, { borderColor: '#791F1F' }]}>
                      <Ionicons name="trash-outline" size={13} color="#791F1F" />
                      <Text style={[styles.actionBtnText, { color: '#791F1F' }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* MD approve/reject */}
                {canApprove && exp.status === 'pending' ? (
                  <View style={styles.actionRow}>
                    <TouchableOpacity onPress={() => rejectExpense(exp.id)}
                      style={[styles.actionBtn, { borderColor: '#791F1F', flex: 1 }]}>
                      <Ionicons name="close" size={13} color="#791F1F" />
                      <Text style={[styles.actionBtnText, { color: '#791F1F' }]}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => approveExpense(exp.id)}
                      style={[styles.approveBtn]}>
                      <Ionicons name="checkmark" size={13} color="#fff" />
                      <Text style={styles.approveBtnText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Lock indicator */}
                {locked ? (
                  <View style={[styles.lockRow, { borderColor: '#27500A' }]}>
                    <Ionicons name="lock-closed" size={11} color="#27500A" />
                    <Text style={[styles.lockText, { color: '#27500A' }]}>Approved — record locked</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
          <View style={{ height: 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ═══ Add / Edit Modal ═══ */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowForm(false)} />
          <ScrollView
            style={[styles.sheet, { backgroundColor: colors.background }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
          >
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {editTarget ? 'Edit Expense' : 'New Expense'}
            </Text>
            <FormSheet f={form} setF={setForm} roleColor={roleColor} />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32 }}>
              <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { flex: 2, backgroundColor: roleColor }]}>
                <Ionicons name={editTarget ? 'checkmark' : 'send'} size={16} color="#fff" />
                <Text style={styles.saveBtnText}>{editTarget ? 'Save Changes' : 'Submit for Approval'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowForm(false)} style={[styles.cancelBtn, { flex: 1 }]}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll:      { padding: 16 },
  headerBtn:   { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  netBanner:   { flexDirection: 'row', alignItems: 'center', margin: 16, marginBottom: 8, padding: 16, borderRadius: 14, borderWidth: 1, gap: 12 },
  netLabel:    { fontSize: 11, marginBottom: 2 },
  netValue:    { fontSize: 26, fontWeight: '800' },
  netSub:      { fontSize: 10, marginTop: 2 },
  metricsRow:  { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 10 },
  metricCard:  { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1 },
  metricValue: { fontSize: 18, fontWeight: '700' },
  metricLabel: { fontSize: 11, marginTop: 2 },
  metricCount: { fontSize: 11, marginTop: 2 },
  pendingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, borderRadius: 10, borderWidth: 1, padding: 10 },
  pendingBannerText: { fontSize: 13, fontWeight: '600' },
  tabRow:      { flexDirection: 'row', gap: 8, marginBottom: 4, paddingHorizontal: 16 },
  tabBtn:      { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  tabText:     { fontSize: 13, fontWeight: '600' },

  expCard:     { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10, gap: 8 },
  expHeader:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  expCat:      { fontSize: 14, fontWeight: '700' },
  expDesc:     { fontSize: 12, marginTop: 2, lineHeight: 17 },
  expMeta:     { fontSize: 11, marginTop: 3 },
  expAmt:      { fontSize: 18, fontWeight: '700' },
  stBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  stText:      { fontSize: 11, fontWeight: '700' },
  approvedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  approvedText:{ fontSize: 11, fontWeight: '600' },
  actionRow:   { flexDirection: 'row', gap: 8 },
  actionBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1.5 },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  approveBtn:  { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, backgroundColor: '#27500A' },
  approveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  lockRow:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  lockText:    { fontSize: 11, fontWeight: '600' },

  emptyState:  { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText:   { fontSize: 14 },

  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, maxHeight: '92%' },
  sheetTitle:  { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  fieldLabel:  { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  catGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  catChip:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  catChipText: { fontSize: 12, fontWeight: '600' },
  input:       { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 12 },
  saveBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn:   { alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#e5e5e3' },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
});
