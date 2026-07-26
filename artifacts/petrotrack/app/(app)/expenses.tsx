import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ModalSheet } from '@/components/FormSheet';
import { ScreenLayout } from '@/components/ScreenLayout';
import { Budget, Expense, ROLE_COLORS, fmt, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const EXPENSE_CATS = [
  'Generator fuel', 'Security & guarding', 'Utilities',
  'Staff welfare', 'Maintenance & repairs', 'Office supplies',
  'Transport', 'Miscellaneous',
];

const ST_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:      { label: 'With Accountant', color: '#0C447C', bg: '#E6F1FB', icon: 'time-outline' },
  acc_forwarded:{ label: 'With MD',         color: '#BA7517', bg: '#FAEEDA', icon: 'share-social' },
  approved:     { label: 'Approved',        color: '#27500A', bg: '#EAF3DE', icon: 'checkmark-circle' },
  rejected:     { label: 'Rejected',        color: '#791F1F', bg: '#FCEBEB', icon: 'close-circle' },
};

type FormState = { cat: string; desc: string; amt: string; ref: string; budgetId: number };
function blankForm(): FormState { return { cat: EXPENSE_CATS[0], desc: '', amt: '', ref: '', budgetId: 0 }; }
function expToForm(e: Expense): FormState { return { cat: e.cat, desc: e.desc, amt: String(e.amt), ref: e.ref ?? '', budgetId: e.budgetId }; }

type FormSheetProps = { f: FormState; setF: React.Dispatch<React.SetStateAction<FormState>>; roleColor: string; approvedBudgets: Budget[] };
function FormSheet({ f, setF, roleColor, approvedBudgets }: FormSheetProps) {
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
      <Text style={[styles.fieldLabel, { color: colors.text }]}>Charge to Budget *</Text>
      {approvedBudgets.length === 0 ? (
        <View style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, justifyContent: 'center' }]}>
          <Text style={{ color: colors.textSubtle, fontSize: 13 }}>No approved budgets available</Text>
        </View>
      ) : (
        <View style={styles.catGrid}>
          {approvedBudgets.map(b => (
            <TouchableOpacity key={b.id} onPress={() => setF(p => ({ ...p, budgetId: b.id }))}
              style={[styles.catChip, { backgroundColor: f.budgetId === b.id ? roleColor : colors.surface, borderColor: f.budgetId === b.id ? roleColor : colors.border }]}>
              <Text style={[styles.catChipText, { color: f.budgetId === b.id ? '#fff' : colors.textMuted }]}>{b.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <Text style={[styles.fieldLabel, { color: colors.text }]}>Description *</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        value={f.desc} onChangeText={v => setF(p => ({ ...p, desc: v }))}
        multiline numberOfLines={3} placeholder="Describe the expense clearly..."
        placeholderTextColor={colors.textSubtle}
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
    role, userName, expenses, sales, budgets,
    addExpense, updateExpense, deleteExpense,
    forwardExpenseToMD, approveExpense, rejectExpense,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;

  const isMgr = role === 'mgr' || role === 'csm' || role === 'mktg';
  const isAcc = role === 'acc' || role === 'admin';
  const isMD  = role === 'md'  || role === 'admin';
  const isCeo = role === 'ceo';

  const approvedBudgets = budgets.filter(b => b.status === 'fully_approved');

  const [tab, setTab]               = useState(0);
  const [showForm, setShowForm]     = useState(false);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);
  const [form, setForm]             = useState<FormState>(blankForm());

  /* Acc forward modal */
  const [fwdTarget, setFwdTarget]   = useState<Expense | null>(null);
  const [fwdNote, setFwdNote]       = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const todaySalesRev    = sales.filter(s => s.dt.startsWith(today)).reduce((s, x) => s + x.L * x.price, 0);
  const todayApprovedExp = expenses.filter(e => e.status === 'approved' && e.dt.startsWith(today)).reduce((s, e) => s + e.amt, 0);
  const todayNet = todaySalesRev - todayApprovedExp;

  const pendingAmt  = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + e.amt, 0);
  const approvedAmt = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + e.amt, 0);

  const pendingForAcc = expenses.filter(e => e.status === 'pending' || e.status === 'rejected');
  const pendingForMD  = expenses.filter(e => e.status === 'acc_forwarded');
  const myExpenses    = expenses.filter(e => e.by === role || e.byName === userName);

  /* Tab definitions per role */
  const TABS_MGR = ['My Expenses', 'All'];
  const TABS_ACC = ['For Review', 'All'];
  const TABS_MD  = ['For Approval', 'Approved', 'All'];
  const TABS_CEO = ['Pending', 'Approved', 'All'];
  const currentTabs = isCeo ? TABS_CEO : isMD ? TABS_MD : isAcc ? TABS_ACC : TABS_MGR;

  const displayedExpenses = isCeo
    ? (tab === 0 ? expenses.filter(e => e.status === 'pending' || e.status === 'acc_forwarded')
      : tab === 1 ? expenses.filter(e => e.status === 'approved') : expenses)
    : isMD
    ? (tab === 0 ? pendingForMD : tab === 1 ? expenses.filter(e => e.status === 'approved') : expenses)
    : isAcc
    ? (tab === 0 ? pendingForAcc : expenses)
    : (tab === 0 ? myExpenses : expenses);

  const pendingCount = isCeo ? expenses.filter(e => e.status === 'pending' || e.status === 'acc_forwarded').length
    : isAcc ? pendingForAcc.length : isMD ? pendingForMD.length : 0;

  function openCreate() {
    setEditTarget(null);
    setForm({ ...blankForm(), budgetId: approvedBudgets[0]?.id ?? 0 });
    setShowForm(true);
  }
  function openEdit(e: Expense) { setEditTarget(e); setForm(expToForm(e)); setShowForm(true); }

  function handleSave() {
    const amount = parseFloat(form.amt.replace(/,/g, ''));
    if (!form.desc.trim()) { Alert.alert('Error', 'Please enter a description.'); return; }
    if (!amount || amount <= 0) { Alert.alert('Error', 'Please enter a valid amount.'); return; }
    if (!editTarget && (!form.budgetId || !approvedBudgets.find(b => b.id === form.budgetId))) {
      Alert.alert('No Budget Selected', 'Please select an approved budget to charge this expense to.');
      return;
    }
    if (editTarget) {
      updateExpense(editTarget.id, { cat: form.cat, desc: form.desc.trim(), amt: amount, ref: form.ref.trim() || undefined });
    } else {
      addExpense({ cat: form.cat, desc: form.desc.trim(), amt: amount, by: role || 'mgr', byName: userName, ref: form.ref.trim() || undefined, budgetId: form.budgetId });
    }
    setShowForm(false);
  }

  function handleDelete(e: Expense) {
    Alert.alert('Delete Expense?', `${e.cat} — ${fmt(e.amt)}\n\nThis cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteExpense(e.id) },
    ]);
  }

  function handleForwardConfirm() {
    if (!fwdTarget) return;
    forwardExpenseToMD(fwdTarget.id, fwdNote || undefined);
    setFwdTarget(null); setFwdNote('');
  }

  /* Permission helpers */
  const mgrCanEdit = (e: Expense) =>
    isMgr && (e.status === 'pending' || e.status === 'rejected') && (e.by === role || e.byName === userName);
  const accCanEdit    = (e: Expense) => isAcc && (e.status === 'pending' || e.status === 'rejected');
  const accCanDelete  = (e: Expense) => isAcc && (e.status === 'pending' || e.status === 'rejected');
  const accCanForward = (e: Expense) => isAcc && (e.status === 'pending' || e.status === 'rejected');
  const mdCanAct = (e: Expense) => isMD && e.status === 'acc_forwarded';

  return (
    <ScreenLayout
      title="Expenses"
      rightAction={
        (isMgr || isAcc) ? (
          <TouchableOpacity onPress={openCreate} style={styles.headerBtn}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        ) : undefined
      }
    >
      {/* Net balance banner */}
      <View style={[styles.netBanner, { backgroundColor: todayNet >= 0 ? colors.successBg : colors.errorBg, borderColor: todayNet >= 0 ? colors.successBorder : colors.errorBorder }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.netLabel, { color: colors.textMuted }]}>Today's Net Balance</Text>
          <Text style={[styles.netValue, { color: todayNet >= 0 ? colors.success : colors.error }]}>{fmt(todayNet)}</Text>
          <Text style={[styles.netSub, { color: colors.textSubtle }]}>{'Sales '}{fmt(todaySalesRev)}{' − Expenses '}{fmt(todayApprovedExp)}</Text>
        </View>
        <Ionicons name={todayNet >= 0 ? 'trending-up' : 'trending-down'} size={32} color={todayNet >= 0 ? colors.success : colors.error} />
      </View>

      {/* Metrics */}
      <View style={styles.metricsRow}>
        <View style={[styles.metricCard, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
          <Text style={[styles.metricValue, { color: colors.warning }]}>{fmt(pendingAmt)}</Text>
          <Text style={[styles.metricLabel, { color: colors.warning }]}>Pending</Text>
          <Text style={[styles.metricCount, { color: colors.textMuted }]}>{expenses.filter(e => e.status === 'pending').length}{' items'}</Text>
        </View>
        <View style={[styles.metricCard, { backgroundColor: colors.successBg, borderColor: colors.successBorder }]}>
          <Text style={[styles.metricValue, { color: colors.success }]}>{fmt(approvedAmt)}</Text>
          <Text style={[styles.metricLabel, { color: colors.success }]}>Approved</Text>
          <Text style={[styles.metricCount, { color: colors.textMuted }]}>{expenses.filter(e => e.status === 'approved').length}{' items'}</Text>
        </View>
      </View>

      {/* Pending badge banner for acc/md */}
      {pendingCount > 0 ? (
        <View style={[styles.pendingBanner, {
          backgroundColor: isAcc ? '#E6F1FB' : '#FAEEDA',
          borderColor: isAcc ? '#0C447C' : '#BA7517',
        }]}>
          <Ionicons name="time" size={15} color={isAcc ? '#0C447C' : '#BA7517'} />
          <Text style={[styles.pendingBannerText, { color: isAcc ? '#0C447C' : '#BA7517' }]}>
            {pendingCount}{' expense'}{pendingCount > 1 ? 's' : ''}{isAcc ? ' awaiting your review' : ' awaiting your approval'}
          </Text>
        </View>
      ) : null}

      {/* Tabs */}
      <View style={styles.tabRow}>
        {currentTabs.map((t, i) => (
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
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {isMgr ? 'No expenses yet. Tap + to add one.' : 'No expenses here.'}
            </Text>
          </View>
        ) : null}

        {displayedExpenses.map(exp => {
          const st = ST_MAP[exp.status] || ST_MAP.pending;
          const locked = exp.status === 'approved';

          return (
            <View key={exp.id} style={[styles.expCard, {
              backgroundColor: colors.surface,
              borderColor: exp.status === 'pending' && isAcc ? '#0C447C'
                : exp.status === 'acc_forwarded' && isMD ? '#BA7517'
                : colors.border,
              borderWidth: (exp.status === 'pending' && isAcc) || (exp.status === 'acc_forwarded' && isMD) ? 1.5 : 1,
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
                  <Text style={[styles.approvedText, { color: '#27500A' }]}>
                    {'Approved by '}{exp.approvedBy}
                    {exp.approvedDt ? ' · ' + fmtDateTime(exp.approvedDt) : ''}
                  </Text>
                </View>
              ) : null}

              {/* Mgr: edit + delete own pending/rejected */}
              {mgrCanEdit(exp) ? (
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

              {/* Acc: add/edit/delete + forward to MD */}
              {accCanEdit(exp) ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity onPress={() => openEdit(exp)} style={[styles.actionBtn, { borderColor: '#0C447C' }]}>
                    <Ionicons name="create-outline" size={13} color="#0C447C" />
                    <Text style={[styles.actionBtnText, { color: '#0C447C' }]}>Edit</Text>
                  </TouchableOpacity>
                  {accCanDelete(exp) ? (
                    <TouchableOpacity onPress={() => handleDelete(exp)} style={[styles.actionBtn, { borderColor: '#791F1F' }]}>
                      <Ionicons name="trash-outline" size={13} color="#791F1F" />
                      <Text style={[styles.actionBtnText, { color: '#791F1F' }]}>Delete</Text>
                    </TouchableOpacity>
                  ) : null}
                  {accCanForward(exp) ? (
                    <TouchableOpacity onPress={() => { setFwdTarget(exp); setFwdNote(''); }}
                      style={[styles.forwardBtn]}>
                      <Ionicons name="share-social" size={13} color="#fff" />
                      <Text style={styles.forwardBtnText}>Forward to MD</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              {/* MD: approve/reject */}
              {mdCanAct(exp) ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity onPress={() => rejectExpense(exp.id)}
                    style={[styles.actionBtn, { borderColor: '#791F1F', flex: 1 }]}>
                    <Ionicons name="close" size={13} color="#791F1F" />
                    <Text style={[styles.actionBtnText, { color: '#791F1F' }]}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => approveExpense(exp.id)} style={styles.approveBtn}>
                    <Ionicons name="checkmark" size={13} color="#fff" />
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Status lock indicators */}
              {exp.status === 'pending' && !isAcc ? (
                <View style={[styles.lockRow, { borderColor: '#0C447C' }]}>
                  <Ionicons name="lock-closed-outline" size={11} color="#0C447C" />
                  <Text style={[styles.lockText, { color: '#0C447C' }]}>Under accountant review</Text>
                </View>
              ) : null}
              {exp.status === 'acc_forwarded' && !isMD ? (
                <View style={[styles.lockRow, { borderColor: '#BA7517' }]}>
                  <Ionicons name="lock-closed-outline" size={11} color="#BA7517" />
                  <Text style={[styles.lockText, { color: '#BA7517' }]}>Forwarded — awaiting MD approval</Text>
                </View>
              ) : null}
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

      {/* Add / Edit Modal */}
      <ModalSheet visible={showForm} onClose={() => setShowForm(false)}>
          <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {editTarget ? 'Edit Expense' : 'New Expense'}
            </Text>
            <FormSheet f={form} setF={setForm} roleColor={roleColor} approvedBudgets={approvedBudgets} />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32 }}>
              <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { flex: 2, backgroundColor: roleColor }]}>
                <Ionicons name={editTarget ? 'checkmark' : 'send'} size={16} color="#fff" />
                <Text style={styles.saveBtnText}>{editTarget ? 'Save Changes' : 'Submit Expense'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowForm(false)} style={[styles.cancelBtn, { flex: 1 }]}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
      </ModalSheet>

      {/* Acc Forward to MD Modal */}
      <ModalSheet visible={fwdTarget !== null} onClose={() => setFwdTarget(null)}>
          <View style={[styles.smallModal, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.fwdIconBox, { backgroundColor: '#E6F1FB' }]}>
                <Ionicons name="share-social" size={18} color="#0C447C" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.text, marginBottom: 0 }]}>Forward to MD</Text>
                <Text style={[styles.fwdSub, { color: colors.textMuted }]}>{fwdTarget?.cat}{' — '}{fwdTarget ? fmt(fwdTarget.amt) : ''}</Text>
              </View>
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 12 }]}>Verification note (optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={fwdNote} onChangeText={setFwdNote}
              placeholder="e.g. Receipt verified — amount correct"
              placeholderTextColor={colors.textSubtle}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setFwdTarget(null)}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { flex: 2, backgroundColor: '#0C447C' }]} onPress={handleForwardConfirm}>
                <Ionicons name="share-social" size={15} color="#fff" />
                <Text style={styles.saveBtnText}>Forward to MD</Text>
              </TouchableOpacity>
            </View>
          </View>
      </ModalSheet>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll:       { padding: 16 },
  headerBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  netBanner:    { flexDirection: 'row', alignItems: 'center', margin: 16, marginBottom: 8, padding: 16, borderRadius: 14, borderWidth: 1, gap: 12 },
  netLabel:     { fontSize: 11, marginBottom: 2 },
  netValue:     { fontSize: 26, fontWeight: '800' },
  netSub:       { fontSize: 10, marginTop: 2 },
  metricsRow:   { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 10 },
  metricCard:   { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1 },
  metricValue:  { fontSize: 18, fontWeight: '700' },
  metricLabel:  { fontSize: 11, marginTop: 2 },
  metricCount:  { fontSize: 11, marginTop: 2 },
  pendingBanner:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, borderRadius: 10, borderWidth: 1, padding: 10 },
  pendingBannerText: { fontSize: 13, fontWeight: '600' },
  tabRow:       { flexDirection: 'row', gap: 8, marginBottom: 4, paddingHorizontal: 16 },
  tabBtn:       { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  tabText:      { fontSize: 13, fontWeight: '600' },
  expCard:      { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10, gap: 8 },
  expHeader:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  expCat:       { fontSize: 14, fontWeight: '700' },
  expDesc:      { fontSize: 12, marginTop: 2, lineHeight: 17 },
  expMeta:      { fontSize: 11, marginTop: 3 },
  expAmt:       { fontSize: 18, fontWeight: '700' },
  stBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  stText:       { fontSize: 11, fontWeight: '700' },
  approvedRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  approvedText: { fontSize: 11, fontWeight: '600' },
  actionRow:    { flexDirection: 'row', gap: 8 },
  actionBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1.5 },
  actionBtnText:{ fontSize: 13, fontWeight: '600' },
  forwardBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, backgroundColor: '#0C447C' },
  forwardBtnText:{ color: '#fff', fontSize: 13, fontWeight: '700' },
  approveBtn:   { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, backgroundColor: '#27500A' },
  approveBtnText:{ color: '#fff', fontSize: 13, fontWeight: '700' },
  lockRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  lockText:     { fontSize: 11, fontWeight: '600' },
  emptyState:   { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText:    { fontSize: 14, textAlign: 'center' },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, maxHeight: '92%' },
  smallModal:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 10 },
  sheetTitle:   { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  fwdIconBox:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  fwdSub:       { fontSize: 12, marginTop: 2 },
  fieldLabel:   { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  catGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  catChip:      { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  catChipText:  { fontSize: 12, fontWeight: '600' },
  input:        { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 12 },
  saveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  saveBtnText:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn:    { alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#e5e5e3' },
  cancelBtnText:{ fontSize: 14, fontWeight: '600' },
});
