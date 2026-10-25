import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ModalSheet } from '@/components/FormSheet';
import { AppliedDateField } from '@/components/AppliedDateField';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { ScreenLayout } from '@/components/ScreenLayout';
import { useBusinessDateConfirmation } from '@/components/BusinessDateConfirmation';
import { Budget, Expense, ROLE_COLORS, businessDateKey, fmt, fmtDateTime, isRevenueReportStatus, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { safeNum } from '@/lib/report-helpers';
import { workflowApi } from '@/lib/api';
import { expenseReportPeriodLabel, matchesExpenseReportPeriod, type ExpenseReportPeriod } from '@/lib/expense-reporting';

type ExpenseCategoryGroup = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  items: string[];
};

export const EXPENSE_CATEGORY_GROUPS: ExpenseCategoryGroup[] = [
  {
    key: 'operations', label: 'Station Operations', icon: 'speedometer-outline', color: '#B7791F',
    items: [
      'Generator fuel', 'Generator maintenance', 'Pump & dispenser servicing', 'Tank cleaning & calibration',
      'Product haulage & logistics', 'Fire safety equipment', 'Security & guarding', 'Utilities',
      'Water supply', 'Waste disposal',
    ],
  },
  {
    key: 'payroll', label: 'Staff & Payroll', icon: 'people-outline', color: '#2F6B9A',
    items: [
      'Salaries and wages', 'Staff allowances', 'Overtime', 'Bonuses', 'Pension contribution',
      'Staff welfare', 'Medical / HMO', 'Training and development', 'Uniforms & PPE', 'Recruitment',
    ],
  },
  {
    key: 'office', label: 'Office & Admin', icon: 'briefcase-outline', color: '#6B4FA3',
    items: [
      'Office supplies', 'Office stationery', 'Printing and photocopying', 'Postage and courier',
      'Internet subscription', 'Telephone bills', 'Electricity bills', 'Cleaning services',
      'Refreshments & kitchen', 'Miscellaneous',
    ],
  },
  {
    key: 'travel', label: 'Travel & Transport', icon: 'airplane-outline', color: '#0E7C86',
    items: [
      'Transport', 'Air ticket', 'Hotel accommodation', 'Travel allowance', 'Meals on official trips',
      'Vehicle fuel', 'Vehicle repairs & maintenance', 'Vehicle licensing & insurance',
    ],
  },
  {
    key: 'marketing', label: 'Sales & Marketing', icon: 'megaphone-outline', color: '#C2410C',
    items: [
      'Promotional materials', 'Customer entertainment', 'Sales commission', 'Branding and publicity',
      'Advertising (radio / print / social)', 'Signage & banners', 'Customer loyalty & rewards',
    ],
  },
  {
    key: 'facilities', label: 'Facilities & Rent', icon: 'business-outline', color: '#4D7C0F',
    items: [
      'Office rent', 'Maintenance & repairs', 'Facility maintenance', 'Facility management',
      'Service charges', 'Property rates & tenement', 'Landscaping & grounds', 'Furniture & fittings',
    ],
  },
  {
    key: 'professional', label: 'Professional & Statutory', icon: 'document-text-outline', color: '#5B5BD6',
    items: [
      'Legal fees', 'Audit fees', 'Consulting fees', 'Tax advisory fees', 'Tax remittances (PAYE / VAT / WHT)',
      'NMDPRA permits & levies', 'Business premises permit', 'Local government levies',
      'CAC filings', 'Insurance premiums',
    ],
  },
  {
    key: 'technology', label: 'IT & Technology', icon: 'laptop-outline', color: '#0369A1',
    items: [
      'Software subscriptions', 'Computer repairs', 'IT support services', 'Website hosting / maintenance',
      'Cyber security', 'CCTV & surveillance', 'Hardware & equipment', 'Data & airtime',
    ],
  },
  {
    key: 'finance', label: 'Finance & Banking', icon: 'card-outline', color: '#9D174D',
    items: [
      'Bank charges', 'POS & transfer charges', 'Loan interest', 'Stamp duty', 'Forex / exchange losses',
    ],
  },
  {
    key: 'community', label: 'Community & Donations', icon: 'heart-outline', color: '#B45309',
    items: [
      'Host community relations', 'Donations & sponsorships', 'Festive gifts & hampers', 'CSR projects',
    ],
  },
];

const EXPENSE_CATS = EXPENSE_CATEGORY_GROUPS.flatMap(g => g.items);

function groupForCategory(cat: string): ExpenseCategoryGroup | undefined {
  return EXPENSE_CATEGORY_GROUPS.find(g => g.items.includes(cat));
}

const ST_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:      { label: 'With Accountant', color: '#225B40', bg: '#EAF2ED', icon: 'time-outline' },
  acc_forwarded:{ label: 'With MD',         color: '#526B3F', bg: '#EEF2E4', icon: 'time-outline' },
  approved:     { label: 'Approved',        color: '#1F6848', bg: '#E5F1E9', icon: 'checkmark-circle' },
  rejected:     { label: 'With Manager',    color: '#365A47', bg: '#E9F0EB', icon: 'close-circle' },
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
type FormSheetProps = {
  f: FormState;
  setF: React.Dispatch<React.SetStateAction<FormState>>;
  roleColor: string;
  approvedBudgets: Budget[];
  branchNames: Record<string, string>;
};
function FormSheet({ f, setF, roleColor, approvedBudgets, branchNames }: FormSheetProps) {
  const colors = useColors();
  const [openGroup, setOpenGroup] = useState<string | null>(() => groupForCategory(f.cat)?.key ?? EXPENSE_CATEGORY_GROUPS[0].key);
  const selectedGroup = groupForCategory(f.cat);
  const toggleGroup = (key: string) => setOpenGroup(prev => (prev === key ? null : key));
  return (
    <>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>Category *</Text>
      <View style={[styles.catSelected, { backgroundColor: `${roleColor}14`, borderColor: `${roleColor}55` }]}>
        <View style={[styles.catSelectedIcon, { backgroundColor: selectedGroup?.color ?? roleColor }]}>
          <Ionicons name={selectedGroup?.icon ?? 'pricetag-outline'} size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.catSelectedEyebrow, { color: colors.textMuted }]}>
            {selectedGroup ? selectedGroup.label.toUpperCase() : 'SELECTED CATEGORY'}
          </Text>
          <Text style={[styles.catSelectedName, { color: colors.text }]} numberOfLines={1}>{f.cat}</Text>
        </View>
        <Ionicons name="checkmark-circle" size={22} color={roleColor} />
      </View>
      <View style={styles.catGroups}>
        {EXPENSE_CATEGORY_GROUPS.map(group => {
          const isOpen = openGroup === group.key;
          const hasSelection = selectedGroup?.key === group.key;
          return (
            <View key={group.key}
              style={[styles.catGroup, { backgroundColor: colors.surface, borderColor: hasSelection ? group.color : colors.border }]}>
              <TouchableOpacity onPress={() => toggleGroup(group.key)} activeOpacity={0.7} style={styles.catGroupHeader}>
                <View style={[styles.catGroupIcon, { backgroundColor: `${group.color}1A` }]}>
                  <Ionicons name={group.icon} size={18} color={group.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.catGroupTitle, { color: colors.text }]}>{group.label}</Text>
                  <Text style={[styles.catGroupMeta, { color: colors.textSubtle }]}>
                    {hasSelection ? f.cat : `${group.items.length} categories`}
                  </Text>
                </View>
                {hasSelection ? <View style={[styles.catGroupDot, { backgroundColor: group.color }]} /> : null}
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSubtle} />
              </TouchableOpacity>
              {isOpen ? (
                <View style={[styles.catGrid, styles.catGroupBody, { borderTopColor: colors.border }]}>
                  {group.items.map(c => {
                    const active = f.cat === c;
                    return (
                      <TouchableOpacity key={c} onPress={() => setF(p => ({ ...p, cat: c }))} activeOpacity={0.75}
                        style={[styles.catChip, {
                          backgroundColor: active ? group.color : colors.background,
                          borderColor: active ? group.color : colors.border,
                        }]}>
                        {active ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                        <Text style={[styles.catChipText, { color: active ? '#fff' : colors.text, fontWeight: active ? '700' : '600' }]}>{c}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
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
    role, userName, branchId, expenses, pumpDailyReports, budgets, branches,
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
  const isReadOnlyViewer = isMD || isCeo;
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
  const [reportBranchId, setReportBranchId] = useState('all');
  const [reportPeriod, setReportPeriod] = useState<ExpenseReportPeriod>('all');
  const [reportDate, setReportDate] = useState(localDateKey());
  const [reviewingExpenseIds, setReviewingExpenseIds] = useState<Set<number>>(() => new Set());
  const reviewingExpenseIdsRef = useRef<Set<number>>(new Set());

  const today = localDateKey();
  const todaySalesRev    = (pumpDailyReports ?? [])
    .filter(report => isRevenueReportStatus(report.status) && businessDateKey(report.date) === today)
    .reduce((sum, report) => sum + safeNum(report.grossAmount), 0);
  const todayApprovedExp = expenses.filter(e => e.status === 'approved' && e.dt.startsWith(today)).reduce((s, e) => s + e.amt, 0);
  const todayNet = todaySalesRev - todayApprovedExp;

  const pendingAmt  = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + e.amt, 0);
  const approvedAmt = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + e.amt, 0);

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
  const displayedExpenses = displayedExpensesBase.filter(expense =>
    (reportBranchId === 'all' || expense.branchId === reportBranchId)
    && matchesExpenseReportPeriod(expense.dt, reportDate, reportPeriod),
  ).sort((a, b) => {
    const businessDateOrder = b.dt.localeCompare(a.dt);
    if (businessDateOrder !== 0) return businessDateOrder;
    const submittedOrder = Date.parse(b.submittedAt ?? b.dt) - Date.parse(a.submittedAt ?? a.dt);
    if (Number.isFinite(submittedOrder) && submittedOrder !== 0) return submittedOrder;
    return b.id - a.id;
  });
  const expenseGroups = useMemo(() => {
    const grouped = new Map<string, { name: string; items: Expense[] }>();
    displayedExpenses.forEach(expense => {
      const key = expense.branchId || 'unassigned';
      const name = expense.branchName || branchNames[expense.branchId] || 'Branch not assigned';
      const current = grouped.get(key);
      if (current) current.items.push(expense);
      else grouped.set(key, { name, items: [expense] });
    });
    return [...grouped.entries()]
      .sort(([, a], [, b]) => a.name.localeCompare(b.name))
      .map(([key, group]) => ({
        key,
        name: group.name,
        items: group.items,
        total: group.items.reduce((sum, expense) => sum + safeNum(expense.amt), 0),
        approved: group.items.filter(expense => expense.status === 'approved').reduce((sum, expense) => sum + safeNum(expense.amt), 0),
        pending: group.items.filter(expense => expense.status !== 'approved').reduce((sum, expense) => sum + safeNum(expense.amt), 0),
      }));
  }, [branchNames, displayedExpenses]);
  const reportTotal = displayedExpenses.reduce((sum, expense) => sum + safeNum(expense.amt), 0);

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
    isMgr && (e.status === 'pending' || e.status === 'rejected')
    && Boolean(branchId && e.branchId === branchId);
  const accCanEdit    = (e: Expense) => isAcc && (e.status === 'pending' || e.status === 'rejected');
  const accCanDelete  = (e: Expense) => isAcc && (e.status === 'pending' || e.status === 'rejected');
  const adminCanCleanUp = (e: Expense) => role === 'admin' && e.status === 'rejected';
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
          <Text style={[styles.netLabel, { color: colors.textMuted }]}>Revenue Less Approved Expenses</Text>
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
          pending-review tab so a report never stays buried. */}
      {pendingCount > 0 ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`View ${pendingCount} expense${pendingCount > 1 ? 's' : ''} ${isAcc ? 'awaiting your review' : 'pending approval'}`}
          activeOpacity={0.75}
          onPress={() => setTab(0)}
          style={[styles.pendingBanner, {
           backgroundColor: isAcc ? '#EAF2ED' : '#F1F5F9',
           borderColor: isAcc ? '#225B40' : '#587063',
        }]}>
          <Ionicons name="time" size={15} color={isAcc ? '#225B40' : '#587063'} />
          <Text style={[styles.pendingBannerText, { color: isAcc ? '#225B40' : '#587063', flex: 1 }]}>
            {pendingCount}{' expense'}{pendingCount > 1 ? 's' : ''}{isAcc ? ' awaiting your review' : ' pending approval'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={isAcc ? '#225B40' : '#587063'} />
        </TouchableOpacity>
      ) : null}

      <View style={[styles.auditFilters, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.auditFilterHeader}>
          <View style={[styles.auditIcon, { backgroundColor: roleColor + '18' }]}>
            <Ionicons name="funnel-outline" size={16} color={roleColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.auditTitle, { color: colors.text }]}>Audit expense reports</Text>
            <Text style={[styles.auditSubtitle, { color: colors.textMuted }]}>Reconcile records by branch and reporting period.</Text>
          </View>
          {(reportBranchId !== 'all' || reportPeriod !== 'all') ? (
            <TouchableOpacity
              accessibilityLabel="Clear expense report filters"
              onPress={() => { setReportBranchId('all'); setReportPeriod('all'); setReportDate(localDateKey()); }}
            >
              <Text style={[styles.clearFilters, { color: roleColor }]}>Reset</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {branches.length > 1 ? (
          <>
            <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Branch</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
              <TouchableOpacity onPress={() => setReportBranchId('all')} style={[styles.filterChip, { backgroundColor: reportBranchId === 'all' ? roleColor : colors.background, borderColor: reportBranchId === 'all' ? roleColor : colors.border }]}>
                <Text style={[styles.filterChipText, { color: reportBranchId === 'all' ? '#fff' : colors.textMuted }]}>All branches</Text>
              </TouchableOpacity>
              {branches.map(branch => (
                <TouchableOpacity key={branch.id} onPress={() => setReportBranchId(branch.id)} style={[styles.filterChip, { backgroundColor: reportBranchId === branch.id ? roleColor : colors.background, borderColor: reportBranchId === branch.id ? roleColor : colors.border }]}>
                  <Text style={[styles.filterChipText, { color: reportBranchId === branch.id ? '#fff' : colors.textMuted }]}>{branch.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : null}

        <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Period</Text>
        <View style={styles.periodRow}>
          {([['date', 'Date'], ['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year'], ['all', 'All time']] as const).map(([value, label]) => (
            <TouchableOpacity key={value} onPress={() => setReportPeriod(value)} style={[styles.periodChip, { backgroundColor: reportPeriod === value ? roleColor : colors.background, borderColor: reportPeriod === value ? roleColor : colors.border }]}>
              <Text style={[styles.filterChipText, { color: reportPeriod === value ? '#fff' : colors.textMuted }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {reportPeriod !== 'all' ? (
          <AppliedDateField
            value={reportDate}
            onChange={setReportDate}
            label={reportPeriod === 'date' ? 'Expense date' : `${reportPeriod[0].toUpperCase()}${reportPeriod.slice(1)} containing`}
            accent={roleColor}
            helper="Choose a date within the period you want to reconcile."
          />
        ) : null}

        <View style={[styles.auditSummary, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View>
            <Text style={[styles.auditSummaryLabel, { color: colors.textMuted }]}>{expenseReportPeriodLabel(reportDate, reportPeriod)}</Text>
            <Text style={[styles.auditSummaryCount, { color: colors.text }]}>{displayedExpenses.length} expense record{displayedExpenses.length === 1 ? '' : 's'}</Text>
          </View>
          <Text style={[styles.auditSummaryTotal, { color: roleColor }]}>{fmt(reportTotal)}</Text>
        </View>
      </View>

      <View style={styles.scroll}>
        {displayedExpenses.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={40} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {isMgr ? 'No expenses yet. Tap + to add one.' : 'No expenses here.'}
            </Text>
          </View>
        ) : null}

        {expenseGroups.map(group => (
          <View key={group.key} style={styles.expenseGroup}>
            <View style={[styles.expenseGroupHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.expenseGroupIcon, { backgroundColor: roleColor + '18' }]}>
                <Ionicons name="business-outline" size={17} color={roleColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.expenseGroupName, { color: colors.text }]}>{group.name}</Text>
                <Text style={[styles.expenseGroupMeta, { color: colors.textMuted }]}>
                  {group.items.length} record{group.items.length === 1 ? '' : 's'} · Approved {fmt(group.approved)} · Pending {fmt(group.pending)}
                </Text>
              </View>
              <Text style={[styles.expenseGroupTotal, { color: roleColor }]}>{fmt(group.total)}</Text>
            </View>
            {group.items.map(exp => {
          const st = ST_MAP[exp.status] || ST_MAP.pending;
          const locked = exp.status === 'approved';

          return (
            <View key={exp.id} style={[styles.expCard, {
              backgroundColor: colors.surface,
              borderColor: (exp.status === 'pending' || exp.status === 'acc_forwarded') && isAcc ? '#225B40'
                : colors.border,
              borderWidth: (exp.status === 'pending' || exp.status === 'acc_forwarded') && isAcc ? 1.5 : 1,
            }]}>
              <View style={styles.expHeader}>
                <View style={[styles.expCatIcon, { backgroundColor: `${groupForCategory(exp.cat)?.color ?? roleColor}1A` }]}>
                  <Ionicons name={groupForCategory(exp.cat)?.icon ?? 'pricetag-outline'} size={16} color={groupForCategory(exp.cat)?.color ?? roleColor} />
                </View>
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
                <View style={[styles.approvedRow, { backgroundColor: '#E5F1E9', borderColor: '#1F684820' }]}>
                  <Ionicons name="checkmark-circle" size={12} color="#1F6848" />
                  <Text style={[styles.approvedText, { color: '#1F6848' }]}>
                    {'Approved by '}{exp.approvedBy}
                    {exp.approvedDt ? ' · ' + fmtDateTime(exp.approvedDt) : ''}
                  </Text>
                </View>
              ) : null}

              {/* Mgr: edit + delete own pending/rejected */}
              {mgrCanEdit(exp) ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity onPress={() => openEdit(exp)} style={[styles.actionBtn, { borderColor: '#286247' }]}>
                    <Ionicons name="create-outline" size={13} color="#286247" />
                    <Text style={[styles.actionBtnText, { color: '#286247' }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(exp)} style={[styles.actionBtn, { borderColor: '#365A47' }]}>
                    <Ionicons name="trash-outline" size={13} color="#365A47" />
                    <Text style={[styles.actionBtnText, { color: '#365A47' }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

               {/* Accountant: edit/delete before forwarding */}
              {accCanEdit(exp) ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity onPress={() => openEdit(exp)} style={[styles.actionBtn, { borderColor: '#225B40' }]}>
                    <Ionicons name="create-outline" size={13} color="#225B40" />
                    <Text style={[styles.actionBtnText, { color: '#225B40' }]}>Edit</Text>
                  </TouchableOpacity>
                  {accCanDelete(exp) ? (
                    <TouchableOpacity onPress={() => handleDelete(exp)} style={[styles.actionBtn, { borderColor: '#365A47' }]}>
                      <Ionicons name="trash-outline" size={13} color="#365A47" />
                      <Text style={[styles.actionBtnText, { color: '#365A47' }]}>Delete</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              {adminCanCleanUp(exp) ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity onPress={() => openEdit(exp)} style={[styles.actionBtn, { borderColor: '#286247' }]}>
                    <Ionicons name="create-outline" size={13} color="#286247" />
                    <Text style={[styles.actionBtnText, { color: '#286247' }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(exp)} style={[styles.actionBtn, { borderColor: '#365A47' }]}>
                    <Ionicons name="trash-outline" size={13} color="#365A47" />
                    <Text style={[styles.actionBtnText, { color: '#365A47' }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

               {/* Accountant reviews first and forwards to MD, or returns to manager */}
               {accCanReview(exp) ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    disabled={reviewingExpenseIds.has(exp.id)}
                    onPress={() => handleExpenseDecision(exp.id, 'reject')}
                    style={[styles.actionBtn, { borderColor: '#365A47', flex: 1, opacity: reviewingExpenseIds.has(exp.id) ? 0.5 : 1 }]}>
                    <Ionicons name="close" size={13} color="#365A47" />
                    <Text style={[styles.actionBtnText, { color: '#365A47' }]}>Reject</Text>
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
                    style={[styles.actionBtn, { borderColor: '#365A47', flex: 1, opacity: reviewingExpenseIds.has(exp.id) ? 0.5 : 1 }]}>
                    <Ionicons name="close" size={13} color="#365A47" />
                    <Text style={[styles.actionBtnText, { color: '#365A47' }]}>Reject</Text>
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
                <View style={[styles.lockRow, { borderColor: '#225B40' }]}>
                  <Ionicons name="lock-closed-outline" size={11} color="#225B40" />
                  <Text style={[styles.lockText, { color: '#225B40' }]}>Under accountant review</Text>
                </View>
              ) : null}
               {exp.status === 'acc_forwarded' && !isMD ? (
                <View style={[styles.lockRow, { borderColor: '#71805B' }]}>
                  <Ionicons name="lock-closed-outline" size={11} color="#71805B" />
                    <Text style={[styles.lockText, { color: '#526B3F' }]}>With MD for final approval</Text>
                </View>
              ) : null}
               {exp.status === 'rejected' ? (
                 <View style={[styles.lockRow, { borderColor: '#365A47' }]}>
                   <Ionicons name="arrow-undo-outline" size={11} color="#365A47" />
                   <Text style={[styles.lockText, { color: '#365A47' }]}>Returned to manager for correction</Text>
                 </View>
               ) : null}
              {locked ? (
                <View style={[styles.lockRow, { borderColor: '#1F6848' }]}>
                  <Ionicons name="lock-closed" size={11} color="#1F6848" />
                  <Text style={[styles.lockText, { color: '#1F6848' }]}>Approved — record locked</Text>
                </View>
              ) : null}
            </View>
          );
            })}
          </View>
        ))}
        <View style={{ height: 20 }} />
      </View>
      </ScrollView>

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
  auditFilters: { borderWidth: 1, borderRadius: 14, padding: 12, marginHorizontal: 16, marginTop: 4, marginBottom: 8, gap: 7 },
  auditFilterHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 2 },
  auditIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  auditTitle: { fontSize: 14, fontWeight: '800' },
  auditSubtitle: { fontSize: 11, marginTop: 1 },
  clearFilters: { fontSize: 12, fontWeight: '700', padding: 5 },
  filterLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginTop: 3 },
  filterChips: { gap: 7, paddingVertical: 1, paddingRight: 6 },
  filterChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7 },
  filterChipText: { fontSize: 12, fontWeight: '700' },
  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  periodChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 7 },
  auditSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderRadius: 10, padding: 11, marginTop: 3 },
  auditSummaryLabel: { fontSize: 11, fontWeight: '600' },
  auditSummaryCount: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  auditSummaryTotal: { fontSize: 18, fontWeight: '800' },
  expenseGroup: { marginBottom: 8 },
  expenseGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  expenseGroupIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  expenseGroupName: { fontSize: 14, fontWeight: '800' },
  expenseGroupMeta: { fontSize: 10, lineHeight: 15, marginTop: 2 },
  expenseGroupTotal: { fontSize: 15, fontWeight: '800' },
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
  expHeader:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  expCatIcon:   { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
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
  forwardBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, backgroundColor: '#225B40' },
  forwardBtnText:{ color: '#fff', fontSize: 13, fontWeight: '700' },
  approveBtn:   { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1F6848' },
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
  catChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  catChipText:  { fontSize: 12, fontWeight: '600' },
  catSelected:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  catSelectedIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  catSelectedEyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  catSelectedName: { fontSize: 16, fontWeight: '800' },
  catGroups:    { gap: 8, marginBottom: 16 },
  catGroup:     { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  catGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11 },
  catGroupIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catGroupTitle: { fontSize: 14, fontWeight: '700' },
  catGroupMeta: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  catGroupDot:  { width: 8, height: 8, borderRadius: 4, marginRight: 2 },
  catGroupBody: { marginBottom: 0, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth },
  input:        { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 12 },
  saveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  saveBtnText:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn:    { alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#e5e5e3' },
  cancelBtnText:{ fontSize: 14, fontWeight: '600' },
});
