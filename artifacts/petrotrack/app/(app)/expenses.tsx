import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ModalSheet } from '@/components/FormSheet';
import { AppliedDateField } from '@/components/AppliedDateField';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { ScreenLayout } from '@/components/ScreenLayout';
import { useBusinessDateConfirmation } from '@/components/BusinessDateConfirmation';
import { Budget, Expense, ROLE_COLORS, fmt, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { safeNum } from '@/lib/report-helpers';
import { workflowApi } from '@/lib/api';

const EXPENSE_CATS = [
  'Generator fuel', 'Security & guarding', 'Utilities',
  'Staff welfare', 'Salaries and wages', 'Maintenance & repairs', 'Office supplies',
  'Transport', 'Miscellaneous',
];

const ST_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:      { label: 'With Accountant', color: '#0C447C', bg: '#E6F1FB', icon: 'time-outline' },
  acc_forwarded:{ label: 'With MD',         color: '#854F0B', bg: '#FAEEDA', icon: 'time-outline' },
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
type BranchExpenseTotal = { key: string; name: string; amount: number; count: number };

function groupApprovedExpensesByBranch(
  expenses: Expense[],
  branchNames: Record<string, string>,
  matchesPeriod: (businessDate: string) => boolean,
): BranchExpenseTotal[] {
  const totals = new Map<string, BranchExpenseTotal>();
  expenses
    .filter(expense => expense.status === 'approved' && matchesPeriod(expense.dt.slice(0, 10)))
    .forEach(expense => {
      const key = expense.branchId || expense.branchName || 'unassigned';
      const current = totals.get(key) ?? {
        key,
        name: expense.branchName || branchNames[expense.branchId] || 'Branch not assigned',
        amount: 0,
        count: 0,
      };
      current.amount += safeNum(expense.amt);
      current.count += 1;
      totals.set(key, current);
    });
  return [...totals.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

type FormSheetProps = {
  f: FormState;
  setF: React.Dispatch<React.SetStateAction<FormState>>;
  roleColor: string;
  approvedBudgets: Budget[];
  branchNames: Record<string, string>;
};
function FormSheet({ f, setF, roleColor, approvedBudgets, branchNames }: FormSheetProps) {
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
              <Text style={[styles.catChipText, { color: f.budgetId === b.id ? '#fff' : colors.textMuted }]}>
                {b.branchName || branchNames[b.branchId] || 'Branch not assigned'}{' · '}{b.label}
              </Text>
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
    role, userName, branchId, expenses, sales, budgets, branches,
    refreshFinanceState: refreshFinanceStateFromContext,
    addExpense, updateExpenseConfirmed, deleteExpense,
    forwardExpenseToMDConfirmed, approveExpenseConfirmed, rejectExpenseConfirmed,
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
  const branchNames = Object.fromEntries(branches.map(branch => [branch.id, branch.name]));

  const [tab, setTab]               = useState(0);
  const [showForm, setShowForm]     = useState(false);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);
  const [form, setForm]             = useState<FormState>(blankForm());
  const [formError, setFormError]   = useState('');
  const [budgetRefreshError, setBudgetRefreshError] = useState('');
  const [formBusy, setFormBusy]     = useState(false);
  const [repairingBranches, setRepairingBranches] = useState(false);
  const [selectedReportKey, setSelectedReportKey] = useState<string | null>(null);

  const [filterDate, setFilterDate] = useState('');
  const [periodStart, setPeriodStart] = useState(() => `${localDateKey().slice(0, 4)}-01-01`);
  const [periodEnd, setPeriodEnd] = useState(() => localDateKey());
  const [reviewingExpenseIds, setReviewingExpenseIds] = useState<Set<number>>(() => new Set());
  const reviewingExpenseIdsRef = useRef<Set<number>>(new Set());

  const today = localDateKey();
  const todaySalesRev    = sales.filter(s => s.dt.startsWith(today)).reduce((s, x) => s + safeNum(x.L) * safeNum(x.price), 0);
  const todayApprovedExp = expenses.filter(e => e.status === 'approved' && e.dt.startsWith(today)).reduce((s, e) => s + e.amt, 0);
  const todayNet = todaySalesRev - todayApprovedExp;

  const pendingAmt  = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + e.amt, 0);
  const approvedAmt = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + e.amt, 0);
  const reportDate = filterDate || today;
  const reportMonth = reportDate.slice(0, 7);
  const reportYear = reportDate.slice(0, 4);
  const canViewExpenseScorecards = ['mgr', 'acc', 'csm', 'mktg', 'md', 'ceo'].includes(role ?? '');
  const reportExpenses = role === 'mgr'
    ? expenses.filter(expense => !!branchId && expense.branchId === branchId)
    : expenses;
  const validCustomPeriod = !!periodStart && !!periodEnd && periodStart <= periodEnd;
  const dailyMatches = (date: string) => date === reportDate;
  const monthlyMatches = (date: string) => date.startsWith(reportMonth);
  const ytdMatches = (date: string) => date.startsWith(reportYear) && date <= reportDate;
  const periodMatches = (date: string) => validCustomPeriod && date >= periodStart && date <= periodEnd;
  const expenseReports = [
    {
      key: 'daily',
      title: 'Daily expenses',
      period: reportDate,
      icon: 'today-outline' as const,
      matches: dailyMatches,
      totals: groupApprovedExpensesByBranch(reportExpenses, branchNames, dailyMatches),
    },
    {
      key: 'monthly',
      title: 'Monthly expenses',
      period: reportMonth,
      icon: 'calendar-outline' as const,
      matches: monthlyMatches,
      totals: groupApprovedExpensesByBranch(reportExpenses, branchNames, monthlyMatches),
    },
    {
      key: 'ytd',
      title: 'Year-to-date expenses',
      period: `${reportYear} YTD`,
      icon: 'analytics-outline' as const,
      matches: ytdMatches,
      totals: groupApprovedExpensesByBranch(reportExpenses, branchNames, ytdMatches),
    },
    {
      key: 'period',
      title: 'Expenses for a period',
      period: validCustomPeriod ? `${periodStart} – ${periodEnd}` : 'Choose a valid period',
      icon: 'options-outline' as const,
      matches: periodMatches,
      totals: validCustomPeriod
        ? groupApprovedExpensesByBranch(reportExpenses, branchNames, periodMatches)
        : [],
    },
  ];
  const selectedReport = expenseReports.find(report => report.key === selectedReportKey);
  const selectedReportItems = selectedReport
    ? reportExpenses
        .filter(expense => expense.status === 'approved' && selectedReport.matches(expense.dt.slice(0, 10)))
        .slice()
        .sort((a, b) => b.dt.localeCompare(a.dt) || b.id - a.id)
    : [];

  const pendingForAcc = expenses.filter(e => e.status === 'pending');
  const pendingForMd = expenses.filter(e => e.status === 'acc_forwarded');
  const pendingForViewer = expenses.filter(e => e.status === 'pending' || e.status === 'acc_forwarded');
  const myExpenses    = expenses.filter(e => e.by === role || e.byName === userName);

  /* Tab definitions per role */
  const TABS_MGR = ['My Expenses', 'All'];
  const TABS_ACC = ['For Review', 'All'];
  const TABS_VIEWER = ['Pending Approval', 'Approved', 'All Expenses'];
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

  const pendingCount = isAcc ? pendingForAcc.length : isMD ? pendingForMd.length : isReadOnlyViewer ? pendingForViewer.length : 0;

  const [refreshingBudgets, setRefreshingBudgets] = useState(false);

  useEffect(() => {
    if (!showForm || editTarget || form.budgetId || approvedBudgets.length === 0) return;
    setForm(current => ({ ...current, budgetId: approvedBudgets[0].id }));
  }, [approvedBudgets, editTarget, form.budgetId, showForm]);

  function showCreateForm(error = '') {
    setEditTarget(null);
    setForm(blankForm());
    setFormError(error);
    setBudgetRefreshError(error);
    setShowForm(true);
  }

  async function openCreate() {
    if (refreshingBudgets) return;
    // Keep lightweight screen test doubles and older embedded contexts
    // functional while the production provider refreshes authoritative data.
    if (typeof refreshFinanceStateFromContext !== 'function') {
      showCreateForm();
      return;
    }
    setRefreshingBudgets(true);
    try {
      const refreshed = await refreshFinanceStateFromContext();
      if (!refreshed) throw new Error('Finance state refresh did not complete.');
      showCreateForm();
    } catch {
      showCreateForm('Could not refresh approved budgets. Please retry before submitting this expense.');
    } finally {
      setRefreshingBudgets(false);
    }
  }
  function openEdit(e: Expense) { setEditTarget(e); setForm(expToForm(e)); setFormError(''); setShowForm(true); }

  function handleSave() {
    if (formBusy) return;
    const amount = parseFloat(form.amt.replace(/,/g, ''));
    setFormError('');
    if (!editTarget && budgetRefreshError) {
      setFormError(budgetRefreshError);
      return;
    }
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
          Alert.alert('Expense Updated', `${form.cat} \u00b7 ${fmt(amount)} saved.`);
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
          Alert.alert('Expense Submitted', `${form.cat} \u00b7 ${fmt(amount)} saved and sent to the accountant for approval.`);
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

  async function handleExpenseDecision(id: number, decision: 'forward' | 'approve' | 'reject') {
    if (reviewingExpenseIdsRef.current.has(id)) return;
    reviewingExpenseIdsRef.current.add(id);
    setExpenseReviewBusy(id, true);
    try {
      const result = decision === 'forward'
        ? await forwardExpenseToMDConfirmed(id)
        : decision === 'approve'
          ? await approveExpenseConfirmed(id)
          : await rejectExpenseConfirmed(id);
      if (!result?.ok) {
        Alert.alert(
          decision === 'forward' ? 'Expense not forwarded' : decision === 'approve' ? 'Expense not approved' : 'Expense not rejected',
          result?.error ?? `The server could not ${decision} this expense.`,
        );
      } else if (decision === 'forward' || decision === 'approve') {
        Alert.alert(
          'Saved',
          decision === 'forward' ? 'Expense forwarded to MD.' : 'Expense approved.',
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
  const accCanReview = (e: Expense) => isAcc && e.status === 'pending';
  const mdCanDecide = (e: Expense) => isMD && e.status === 'acc_forwarded';

  const repairLegacyBranches = () => {
    Alert.alert(
      'Repair legacy expense branches',
      'This will permanently assign canonical branches to legacy expenses using their existing branch, linked budget, or submitting staff account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Repair',
          onPress: () => {
            setRepairingBranches(true);
            void workflowApi.expenses.repairBranches()
              .then(async result => {
                if (!result) {
                  Alert.alert('Repair failed', 'The server could not repair legacy expense branches.');
                  return;
                }
                await refreshFinanceStateFromContext();
                Alert.alert(
                  'Repair complete',
                  `${result.repaired} expense item${result.repaired === 1 ? '' : 's'} updated.${result.unresolvedIds.length ? ` ${result.unresolvedIds.length} could not be assigned safely.` : ' All expense items now have a canonical branch.'}`,
                );
              })
              .finally(() => setRepairingBranches(false));
          },
        },
      ],
    );
  };

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
      <ScrollView contentContainerStyle={styles.pageScroll} showsVerticalScrollIndicator={false}>
      {/* Expense status shortcuts */}
      <View style={styles.topTabRow}>
        {currentTabs.map((t, i) => (
          <TouchableOpacity key={t} onPress={() => setTab(i)}
            style={[styles.tabBtn, { backgroundColor: tab === i ? roleColor : colors.surface, borderColor: tab === i ? roleColor : colors.border }]}>
            <Text style={[styles.tabText, { color: tab === i ? '#fff' : colors.textMuted }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

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

      <AppliedDateField
        value={filterDate}
        onChange={setFilterDate}
        label={canViewExpenseScorecards ? 'Reporting business date' : 'View expenses for a business date'}
        accent={roleColor}
        helper={canViewExpenseScorecards
          ? 'Choose a business date to update the daily, monthly, and year-to-date scorecards and filter the expense list.'
          : 'Filter expenses by the date they apply to.'}
      />

      {canViewExpenseScorecards ? (
        <View style={styles.reportSection}>
          <Text style={[styles.reportSectionTitle, { color: colors.text }]}>Approved expense scorecards</Text>
          <Text style={[styles.reportScope, { color: colors.textMuted }]}>
            {role === 'mgr' ? 'Your assigned branch only' : 'All branches'}
          </Text>
          <View style={styles.periodFields}>
            <View style={{ flex: 1 }}>
              <AppliedDateField
                value={periodStart}
                onChange={setPeriodStart}
                label="Period start"
                accent={roleColor}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppliedDateField
                value={periodEnd}
                onChange={setPeriodEnd}
                label="Period end"
                accent={roleColor}
              />
            </View>
          </View>
          {!validCustomPeriod ? (
            <Text style={[styles.periodError, { color: colors.error }]}>Period start must be on or before period end.</Text>
          ) : null}
          <View style={styles.reportTiles}>
            {expenseReports.map(report => {
              const total = report.totals.reduce((sum, branch) => sum + branch.amount, 0);
              return (
                <TouchableOpacity
                  key={report.key}
                  accessibilityLabel={`${report.title} scorecard`}
                  accessibilityRole="button"
                  onPress={() => setSelectedReportKey(report.key)}
                  disabled={report.key === 'period' && !validCustomPeriod}
                  style={[styles.reportTile, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={styles.reportTileHeader}>
                    <View style={[styles.reportIcon, { backgroundColor: colors.infoBg }]}>
                      <Ionicons name={report.icon} size={17} color={colors.info} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reportTileTitle, { color: colors.text }]}>{report.title}</Text>
                      <Text style={[styles.reportPeriod, { color: colors.textMuted }]}>{report.period}</Text>
                    </View>
                  </View>
                  <Text style={[styles.reportTotal, { color: roleColor }]}>{fmt(total)}</Text>
                  <Text style={[styles.reportTotalLabel, { color: colors.textSubtle }]}>Approved total</Text>
                  <View style={[styles.reportDivider, { backgroundColor: colors.border }]} />
                  {report.totals.length > 0 ? report.totals.map(branch => (
                    <View key={branch.key} style={styles.branchReportRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.branchReportName, { color: colors.text }]} numberOfLines={1}>{branch.name}</Text>
                        <Text style={[styles.branchReportCount, { color: colors.textSubtle }]}>{branch.count} item{branch.count === 1 ? '' : 's'}</Text>
                      </View>
                      <Text style={[styles.branchReportAmount, { color: colors.text }]}>{fmt(branch.amount)}</Text>
                    </View>
                  )) : (
                    <Text style={[styles.reportEmpty, { color: colors.textMuted }]}>No approved expenses for this period.</Text>
                  )}
                  <View style={styles.reportDetailsLink}>
                    <Text style={[styles.reportDetailsText, { color: roleColor }]}>View expense items</Text>
                    <Ionicons name="chevron-forward" size={14} color={roleColor} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      {role === 'admin' ? (
        <TouchableOpacity
          accessibilityLabel="Repair legacy expense branches"
          onPress={repairLegacyBranches}
          disabled={repairingBranches}
          style={[styles.pendingBanner, {
            backgroundColor: colors.infoBg,
            borderColor: colors.border,
            opacity: repairingBranches ? 0.6 : 1,
          }]}
        >
          <Ionicons name="build-outline" size={17} color={colors.info} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.pendingBannerText, { color: colors.info }]}>
              {repairingBranches ? 'Repairing legacy expense branches…' : 'Repair legacy expense branches'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
              Permanently assign branches using each expense’s budget and submitter records.
            </Text>
          </View>
        </TouchableOpacity>
      ) : null}

      {/* Pending badge banner for acc/md — tapping jumps straight to the
          pending-review tab (and clears any date filter) so a report never
          stays buried behind whatever tab or filter was previously active. */}
      {pendingCount > 0 ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`View ${pendingCount} expense${pendingCount > 1 ? 's' : ''} ${isAcc ? 'awaiting your review' : 'pending approval'}`}
          activeOpacity={0.75}
          onPress={() => { setTab(0); setFilterDate(''); }}
          style={[styles.pendingBanner, {
           backgroundColor: isAcc ? '#E6F1FB' : '#F1F5F9',
           borderColor: isAcc ? '#0C447C' : '#64748B',
        }]}>
          <Ionicons name="time" size={15} color={isAcc ? '#0C447C' : '#64748B'} />
          <Text style={[styles.pendingBannerText, { color: isAcc ? '#0C447C' : '#64748B', flex: 1 }]}>
            {pendingCount}{' expense'}{pendingCount > 1 ? 's' : ''}{isAcc ? ' awaiting your review' : ' pending approval'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={isAcc ? '#0C447C' : '#64748B'} />
        </TouchableOpacity>
      ) : null}

      <View style={styles.scroll}>
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
                   <Text style={[styles.expMeta, { color: colors.textSubtle }]}>{exp.branchName || branchNames[exp.branchId] || 'Branch not assigned'}{' · by '}{exp.byName}{' · applies on '}{exp.dt.slice(0, 10)}{' · submitted '}{exp.submittedAt ? fmtDateTime(exp.submittedAt) : fmtDateTime(exp.dt)}</Text>
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

               {/* Accountant: edit/delete before forwarding */}
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

               {/* Accountant reviews first and forwards to MD, or returns to manager */}
               {accCanReview(exp) ? (
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
                    onPress={() => handleExpenseDecision(exp.id, 'forward')}
                    style={[styles.approveBtn, { opacity: reviewingExpenseIds.has(exp.id) ? 0.5 : 1 }]}>
                    <Ionicons name="checkmark" size={13} color="#fff" />
                    <Text style={styles.approveBtnText}>Forward to MD</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* MD makes the final decision after Accountant review */}
              {mdCanDecide(exp) ? (
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
                    <Text style={styles.approveBtnText}>Approve & Lock</Text>
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
                    <Text style={[styles.lockText, { color: '#854F0B' }]}>With MD for final approval</Text>
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
      </View>
      </ScrollView>

      <ModalSheet visible={!!selectedReport} onClose={() => setSelectedReportKey(null)}>
        <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
          <View style={styles.reportDetailHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.text, marginBottom: 2 }]}>
                {selectedReport?.title ?? 'Expense details'}
              </Text>
              <Text style={[styles.reportPeriod, { color: colors.textMuted }]}>{selectedReport?.period}</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Close expense scorecard details"
              onPress={() => setSelectedReportKey(null)}
              style={[styles.detailCloseBtn, { borderColor: colors.border }]}
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={[styles.detailSummary, { backgroundColor: colors.infoBg, borderColor: colors.border }]}>
            <Text style={[styles.reportTotalLabel, { color: colors.textMuted }]}>Approved expenditure</Text>
            <Text style={[styles.detailSummaryTotal, { color: roleColor }]}>
              {fmt(selectedReportItems.reduce((sum, expense) => sum + expense.amt, 0))}
            </Text>
            <Text style={[styles.reportTotalLabel, { color: colors.textSubtle }]}>
              {selectedReportItems.length} expense item{selectedReportItems.length === 1 ? '' : 's'}
            </Text>
          </View>
          {selectedReportItems.length > 0 ? selectedReportItems.map(expense => (
            <View key={expense.id} style={[styles.detailExpenseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.detailExpenseHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.expCat, { color: colors.text }]}>{expense.cat}</Text>
                  <Text style={[styles.expDesc, { color: colors.textMuted }]}>{expense.desc}</Text>
                </View>
                <Text style={[styles.detailExpenseAmount, { color: roleColor }]}>{fmt(expense.amt)}</Text>
              </View>
              <Text style={[styles.expMeta, { color: colors.textSubtle }]}>
                {expense.branchName || branchNames[expense.branchId] || 'Branch not assigned'}
                {' · '}{expense.dt.slice(0, 10)}{' · '}{expense.byName}
              </Text>
              {expense.ref ? (
                <Text style={[styles.expMeta, { color: colors.textSubtle }]}>{'Ref: '}{expense.ref}</Text>
              ) : null}
            </View>
          )) : (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={36} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No approved expense items in this scorecard.</Text>
            </View>
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      </ModalSheet>

      {/* Add / Edit Modal */}
      <ModalSheet visible={showForm} onClose={() => { setShowForm(false); setFormError(''); }}>
        {hasPendingConfirmation ? confirmationContent : (
          <KeyboardAwareScrollViewCompat style={[styles.sheet, { backgroundColor: colors.background }]}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="none" bottomOffset={24}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {editTarget ? 'Edit Expense' : 'New Expense'}
            </Text>
            {formError ? (
              <View style={[styles.formError, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                <Text style={[styles.formErrorText, { color: colors.error }]}>{formError}</Text>
              </View>
            ) : null}
            <FormSheet
              f={form}
              setF={setForm}
              roleColor={roleColor}
              approvedBudgets={approvedBudgets}
              branchNames={branchNames}
            />
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
          </KeyboardAwareScrollViewCompat>
        )}
      </ModalSheet>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  pageScroll:   { paddingBottom: 20 },
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
  reportSection: { marginTop: 4, marginBottom: 6 },
  reportSectionTitle: { fontSize: 15, fontWeight: '700', marginHorizontal: 16, marginBottom: 8 },
  reportScope: { fontSize: 11, marginHorizontal: 16, marginTop: -5, marginBottom: 6 },
  periodFields: { flexDirection: 'row', gap: 8, marginHorizontal: 8 },
  periodError: { fontSize: 11, marginHorizontal: 16, marginBottom: 8 },
  reportTiles: { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  reportTile: { width: '100%', borderRadius: 14, borderWidth: 1, padding: 14 },
  reportTileHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  reportIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  reportTileTitle: { fontSize: 14, fontWeight: '700' },
  reportPeriod: { fontSize: 11, marginTop: 1 },
  reportTotal: { fontSize: 23, fontWeight: '800', marginTop: 13 },
  reportTotalLabel: { fontSize: 10, marginTop: 1 },
  reportDivider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  branchReportRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  branchReportName: { fontSize: 12, fontWeight: '600' },
  branchReportCount: { fontSize: 10, marginTop: 1 },
  branchReportAmount: { fontSize: 12, fontWeight: '700' },
  reportEmpty: { fontSize: 11, lineHeight: 16, paddingVertical: 6 },
  reportDetailsLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 9 },
  reportDetailsText: { fontSize: 11, fontWeight: '700' },
  pendingBanner:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, borderRadius: 10, borderWidth: 1, padding: 10 },
  pendingBannerText: { fontSize: 13, fontWeight: '600' },
  topTabRow:    { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 0, paddingHorizontal: 16 },
  tabRow:       { flexDirection: 'row', gap: 8, marginBottom: 4, paddingHorizontal: 16 },
  tabBtn:       { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  tabText:      { fontSize: 13, fontWeight: '600' },
  expCard:      { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10, gap: 8 },
  expHeader:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  expCat:       { fontSize: 14, fontWeight: '700' },
  expDesc:      { fontSize: 12, marginTop: 2, lineHeight: 17 },
  expMeta:      { fontSize: 11, marginTop: 3 },
  expAmt:       { fontSize: 18, fontWeight: '700' },
  reportDetailHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  detailCloseBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  detailSummary: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  detailSummaryTotal: { fontSize: 24, fontWeight: '800', marginVertical: 3 },
  detailExpenseCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  detailExpenseHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailExpenseAmount: { fontSize: 15, fontWeight: '800' },
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
