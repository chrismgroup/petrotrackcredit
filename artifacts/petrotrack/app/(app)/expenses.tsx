import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ModalSheet } from '@/components/FormSheet';
import { AppliedDateField } from '@/components/AppliedDateField';
import { ScreenLayout } from '@/components/ScreenLayout';
import { useBusinessDateConfirmation } from '@/components/BusinessDateConfirmation';
import { Budget, Expense, ROLE_COLORS, fmt, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { safeNum } from '@/lib/report-helpers';

const EXPENSE_CATS = [
  'Generator fuel', 'Security & guarding', 'Utilities',
  'Staff welfare', 'Salaries and wages', 'Maintenance & repairs', 'Office supplies',
  'Transport', 'Miscellaneous',
];

const ST_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:      { label: 'With Accountant', color: '#0C447C', bg: '#E6F1FB', icon: 'time-outline' },
  acc_forwarded:{ label: 'With Accountant', color: '#0C447C', bg: '#E6F1FB', icon: 'time-outline' },
  approved:     { label: 'Approved',        color: '#27500A', bg: '#EAF3DE', icon: 'checkmark-circle' },
  rejected:     { label: 'With Manager',    color: '#791F1F', bg: '#FCEBEB', icon: 'close-circle' },
};

type FormState = { cat: string; desc: string; amt: string; ref: string; budgetId: number; dt: string };
function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function blankForm(): FormState {
  return { cat: EXPENSE_CATS[0], desc: '', amt: '', ref: '', budgetId: 0, dt: localDateKey() };
}
function expToForm(e: Expense): FormState { return { cat: e.cat, desc: e.desc, amt: String(e.amt), ref: e.ref ?? '', budgetId: e.budgetId, dt: e.dt.slice(0, 10) }; }

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
      <AppliedDateField
        value={f.dt}
        onChange={dt => setF(p => ({ ...p, dt }))}
        accent={roleColor}
        helper="This is the date the expense belongs to, not the submission date."
      />
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
              <Text style={[styles.catChipText, { color: f.budgetId === b.id ? '#fff' : colors.textMuted }]}>{b.branchName}{' · '}{b.label}</Text>
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
    refreshFinanceState: refreshFinanceStateFromContext,
    addExpense, updateExpenseConfirmed, deleteExpense,
    approveExpenseConfirmed, rejectExpenseConfirmed,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;
  const {
    requestDateConfirmation,
    confirmationContent,
    hasPendingConfirmation,
  } = useBusinessDateConfirmation();

  const isMgr = role === 'mgr' || role === 'csm' || role === 'mktg';
  const isAcc = role === 'acc';
  const isMD  = role === 'md';
  const isCeo = role === 'ceo';
  const isReadOnlyViewer = role === 'admin' || isMD || isCeo;
  // Manager state is already branch-scoped by the authenticated API response.
  // Do not apply a second client-session branch check: a stale local branch ID
  // can otherwise hide a valid approved budget before the request reaches the
  // server. Expense creation still validates status and branch authoritatively.
  const approvedBudgets = budgets.filter(b => b.status === 'fully_approved');

  const [tab, setTab]               = useState(0);
  const [showForm, setShowForm]     = useState(false);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);
  const [form, setForm]             = useState<FormState>(blankForm());
  const [formError, setFormError]   = useState('');
  const [formBusy, setFormBusy]     = useState(false);

  const [filterDate, setFilterDate] = useState('');
  const [reviewingExpenseIds, setReviewingExpenseIds] = useState<Set<number>>(() => new Set());
  const reviewingExpenseIdsRef = useRef<Set<number>>(new Set());

  const today = new Date().toISOString().slice(0, 10);
  const todaySalesRev    = sales.filter(s => s.dt.startsWith(today)).reduce((s, x) => s + safeNum(x.L) * safeNum(x.price), 0);
  const todayApprovedExp = expenses.filter(e => e.status === 'approved' && e.dt.startsWith(today)).reduce((s, e) => s + e.amt, 0);
  const todayNet = todaySalesRev - todayApprovedExp;

  const pendingAmt  = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + e.amt, 0);
  const approvedAmt = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + e.amt, 0);

  const pendingForAcc = expenses.filter(e => e.status === 'pending' || e.status === 'acc_forwarded');
  const pendingForViewer = expenses.filter(e => e.status === 'pending' || e.status === 'acc_forwarded');
  const myExpenses    = expenses.filter(e => e.by === role || e.byName === userName);

  /* Tab definitions per role */
  const TABS_MGR = ['My Expenses', 'All'];
  const TABS_ACC = ['For Review', 'All'];
  const TABS_VIEWER = ['Pending Approval', 'Approved', 'All'];
  const currentTabs = isReadOnlyViewer ? TABS_VIEWER : isAcc ? TABS_ACC : TABS_MGR;

  const displayedExpensesBase = isReadOnlyViewer
    ? (tab === 0 ? pendingForViewer
      : tab === 1 ? expenses.filter(e => e.status === 'approved') : expenses)
    : isAcc
    ? (tab === 0 ? pendingForAcc : expenses)
    : (tab === 0 ? myExpenses : expenses);
  const displayedExpenses = (filterDate
    ? displayedExpensesBase.filter(expense => expense.dt.slice(0, 10) === filterDate)
    : displayedExpensesBase
  ).slice().sort((a, b) => {
    const businessDateOrder = b.dt.localeCompare(a.dt);
    if (businessDateOrder !== 0) return businessDateOrder;
    const submittedOrder = Date.parse(b.submittedAt ?? b.dt) - Date.parse(a.submittedAt ?? a.dt);
    if (Number.isFinite(submittedOrder) && submittedOrder !== 0) return submittedOrder;
    return b.id - a.id;
  });

  const pendingCount = isAcc ? pendingForAcc.length : isReadOnlyViewer ? pendingForViewer.length : 0;

  const [refreshingBudgets, setRefreshingBudgets] = useState(false);

  useEffect(() => {
    if (!showForm || editTarget || form.budgetId || approvedBudgets.length === 0) return;
    setForm(current => ({ ...current, budgetId: approvedBudgets[0].id }));
  }, [approvedBudgets, editTarget, form.budgetId, showForm]);

  function showCreateForm() {
    setEditTarget(null);
    setForm(blankForm());
    setFormError('');
    setShowForm(true);
  }

  function openCreate() {
    if (refreshingBudgets) return;
    // Keep lightweight screen test doubles and older embedded contexts
    // functional while the production provider refreshes authoritative data.
    if (typeof refreshFinanceStateFromContext !== 'function') {
      showCreateForm();
      return;
    }
    setRefreshingBudgets(true);
    void refreshFinanceStateFromContext()
      .finally(() => setRefreshingBudgets(false))
      .then(showCreateForm);
  }
  function openEdit(e: Expense) { setEditTarget(e); setForm(expToForm(e)); setFormError(''); setShowForm(true); }

  function handleSave() {
    if (formBusy) return;
    const amount = parseFloat(form.amt.replace(/,/g, ''));
    setFormError('');
    if (!form.desc.trim()) { setFormError('Please enter a description.'); return; }
    if (!amount || amount <= 0) { setFormError('Please enter a valid amount.'); return; }
    if (!form.dt) { setFormError('Select the date this expense applies to.'); return; }
    if (!editTarget && (!form.budgetId || !approvedBudgets.find(b => b.id === form.budgetId))) {
      setFormError('Select a fully approved budget before submitting this expense.');
      return;
    }
    requestDateConfirmation('expense', form.dt, async () => {
      if (formBusy) return;
      setFormBusy(true);
      try {
        if (editTarget) {
          const result = await updateExpenseConfirmed(editTarget.id, { cat: form.cat, desc: form.desc.trim(), amt: amount, dt: form.dt });
          if (!result.ok) {
            Alert.alert('Expense not updated', result.error ?? 'The server could not update this expense. Your entries remain available so you can retry.');
            return;
          }
        } else {
          const result = await addExpense({
            dt: form.dt,
            cat: form.cat,
            desc: form.desc.trim(),
            amt: amount,
            by: role || 'mgr',
            byName: userName,
            ref: form.ref.trim() || undefined,
            budgetId: form.budgetId,
          });
          if (!result.ok) {
            setFormError(result.error ?? 'The server could not save this expense. Check the selected budget and try again.');
            return;
          }
        }
        setShowForm(false);
        setFormError('');
      } finally {
        setFormBusy(false);
      }
    }, 'Confirm & save');
  }

  function handleDelete(e: Expense) {
    Alert.alert('Delete Expense?', `${e.cat} — ${fmt(e.amt)}\n\nThis cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteExpense(e.id) },
    ]);
  }

  function setExpenseReviewBusy(id: number, busy: boolean) {
    setReviewingExpenseIds(current => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleExpenseDecision(id: number, decision: 'approve' | 'reject') {
    if (reviewingExpenseIdsRef.current.has(id)) return;
    reviewingExpenseIdsRef.current.add(id);
    setExpenseReviewBusy(id, true);
    try {
      const result = decision === 'approve'
        ? await approveExpenseConfirmed(id)
        : await rejectExpenseConfirmed(id);
      if (!result?.ok) {
        Alert.alert(
          decision === 'approve' ? 'Expense not approved' : 'Expense not rejected',
          result?.error ?? `The server could not ${decision} this expense.`,
        );
      }
    } finally {
      reviewingExpenseIdsRef.current.delete(id);
      setExpenseReviewBusy(id, false);
    }
  }

  /* Permission helpers */
  const mgrCanEdit = (e: Expense) =>
    isMgr && (e.status === 'pending' || e.status === 'rejected') && (e.by === role || e.byName === userName);
  const accCanEdit    = (e: Expense) => isAcc && (e.status === 'pending' || e.status === 'rejected');
  const accCanDelete  = (e: Expense) => isAcc && (e.status === 'pending' || e.status === 'rejected');
  const accCanDecide = (e: Expense) => isAcc && (e.status === 'pending' || e.status === 'acc_forwarded');

  return (
    <ScreenLayout
      title="Expenses"
      rightAction={
        (isMgr || isAcc) ? (
          <TouchableOpacity onPress={() => { void openCreate(); }} disabled={refreshingBudgets} style={[styles.headerBtn, { opacity: refreshingBudgets ? 0.55 : 1 }]}>
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
           backgroundColor: isAcc ? '#E6F1FB' : '#F1F5F9',
           borderColor: isAcc ? '#0C447C' : '#64748B',
        }]}>
          <Ionicons name="time" size={15} color={isAcc ? '#0C447C' : '#64748B'} />
          <Text style={[styles.pendingBannerText, { color: isAcc ? '#0C447C' : '#64748B' }]}>
            {pendingCount}{' expense'}{pendingCount > 1 ? 's' : ''}{isAcc ? ' awaiting your review' : ' pending approval'}
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

      <AppliedDateField
        value={filterDate}
        onChange={setFilterDate}
        label="View expenses for a date"
        accent={roleColor}
        helper="Filter by the date the expense applies to."
      />

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
              borderColor: (exp.status === 'pending' || exp.status === 'acc_forwarded') && isAcc ? '#0C447C'
                : colors.border,
              borderWidth: (exp.status === 'pending' || exp.status === 'acc_forwarded') && isAcc ? 1.5 : 1,
            }]}>
              <View style={styles.expHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.expCat, { color: colors.text }]}>{exp.cat}</Text>
                  <Text style={[styles.expDesc, { color: colors.textMuted }]}>{exp.desc}</Text>
                   <Text style={[styles.expMeta, { color: colors.textSubtle }]}>{exp.branchName || 'Branch not assigned'}{' · by '}{exp.byName}{' · applies on '}{exp.dt.slice(0, 10)}{' · submitted '}{exp.submittedAt ? fmtDateTime(exp.submittedAt) : fmtDateTime(exp.dt)}</Text>
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

               {/* Accountant: edit/delete plus direct approval decision */}
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
                </View>
              ) : null}

               {/* Only the Accountant can approve or reject */}
               {accCanDecide(exp) ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    disabled={reviewingExpenseIds.has(exp.id)}
                    onPress={() => handleExpenseDecision(exp.id, 'reject')}
                    style={[styles.actionBtn, { borderColor: '#791F1F', flex: 1, opacity: reviewingExpenseIds.has(exp.id) ? 0.5 : 1 }]}>
                    <Ionicons name="close" size={13} color="#791F1F" />
                    <Text style={[styles.actionBtnText, { color: '#791F1F' }]}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={reviewingExpenseIds.has(exp.id)}
                    onPress={() => handleExpenseDecision(exp.id, 'approve')}
                    style={[styles.approveBtn, { opacity: reviewingExpenseIds.has(exp.id) ? 0.5 : 1 }]}>
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
               {exp.status === 'acc_forwarded' && !isAcc ? (
                <View style={[styles.lockRow, { borderColor: '#BA7517' }]}>
                  <Ionicons name="lock-closed-outline" size={11} color="#BA7517" />
                   <Text style={[styles.lockText, { color: '#0C447C' }]}>With Accountant for approval</Text>
                </View>
              ) : null}
               {exp.status === 'rejected' ? (
                 <View style={[styles.lockRow, { borderColor: '#791F1F' }]}>
                   <Ionicons name="arrow-undo-outline" size={11} color="#791F1F" />
                   <Text style={[styles.lockText, { color: '#791F1F' }]}>Returned to manager for correction</Text>
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
      <ModalSheet visible={showForm} onClose={() => { setShowForm(false); setFormError(''); }}>
        {hasPendingConfirmation ? confirmationContent : (
          <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {editTarget ? 'Edit Expense' : 'New Expense'}
            </Text>
            {formError ? (
              <View style={[styles.formError, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                <Text style={[styles.formErrorText, { color: colors.error }]}>{formError}</Text>
              </View>
            ) : null}
            <FormSheet f={form} setF={setForm} roleColor={roleColor} approvedBudgets={approvedBudgets} />
            {!editTarget && approvedBudgets.length === 0 ? (
              <View style={[styles.budgetRequirement, { backgroundColor: colors.infoBg, borderColor: colors.info }]}>
                <Ionicons name="information-circle-outline" size={16} color={colors.info} />
                <Text style={[styles.budgetRequirementText, { color: colors.info }]}>
                  Expenses can only be submitted against a fully approved budget. Submit the new budget for review and wait for final approval before recording an expense.
                </Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32 }}>
              <TouchableOpacity
                onPress={handleSave}
                disabled={formBusy}
                style={[styles.saveBtn, { flex: 2, backgroundColor: roleColor, opacity: formBusy ? 0.6 : 1 }]}
              >
                <Ionicons name={editTarget ? 'checkmark' : 'send'} size={16} color="#fff" />
                <Text style={styles.saveBtnText}>
                  {formBusy ? 'Submitting…' : editTarget ? 'Save Changes' : 'Submit Expense'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setShowForm(false); setFormError(''); }}
                disabled={formBusy}
                style={[styles.cancelBtn, { flex: 1, opacity: formBusy ? 0.5 : 1 }]}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
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
  formError: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  formErrorText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  budgetRequirement: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, borderRadius: 10, borderWidth: 1, marginBottom: 14 },
  budgetRequirementText: { flex: 1, fontSize: 12, lineHeight: 17 },
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
