import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  Alert, Modal,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { AppliedDateField } from '@/components/AppliedDateField';
import { useBusinessDateConfirmation } from '@/components/BusinessDateConfirmation';
import { ROLE_COLORS, fmt, fmtDateTime, useApp, type Budget, type Expense } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const YEARS  = [2024, 2025, 2026, 2027];

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  draft:          { label: 'Draft',               color: '#555',    bg: '#F0F0F0' },
  submitted:      { label: 'With Accountant',      color: '#0C447C', bg: '#E6F1FB' },
  acc_forwarded:  { label: 'With MD',              color: '#BA7517', bg: '#FAEEDA' },
  fully_approved: { label: 'Approved',             color: '#27500A', bg: '#EAF3DE' },
  rejected:       { label: 'Rejected',             color: '#791F1F', bg: '#FCEBEB' },
};

const STEP_ICON:  Record<string, string> = { submit: 'send', forward: 'share-social', approve: 'checkmark-circle', reject: 'close-circle', classify_branch: 'business' };
const STEP_COLOR: Record<string, string> = { submit: '#185FA5', forward: '#0C447C', approve: '#27500A', reject: '#791F1F', classify_branch: '#6B4F1D' };
const STEP_BG:    Record<string, string> = { submit: '#E6F1FB', forward: '#E8F0FB', approve: '#EAF3DE', reject: '#FCEBEB', classify_branch: '#FFF4D6' };

const OVER_COLOR  = '#791F1F';
const OVER_BG     = '#FCEBEB';
const SAFE_COLOR  = '#27500A';
const SAFE_BG     = '#EAF3DE';
const WARN_COLOR  = '#BA7517';
const WARN_BG     = '#FAEEDA';
const PERFORMANCE_WARNING_RATIO = 0.85;

type LineItem = { cat: string; amt: string };
function blankItem(): LineItem { return { cat: '', amt: '' }; }

const ARCHIVE_THRESHOLDS = [1, 3, 6, 9, 12] as const;
const ARCHIVABLE_STATUSES = new Set(['draft', 'fully_approved', 'rejected']);

function budgetPeriodStart(budget: Budget): Date {
  const appliesOn = budget.appliesOn?.slice(0, 10);
  if (appliesOn && !Number.isNaN(new Date(`${appliesOn}T00:00:00`).getTime())) {
    return new Date(`${appliesOn}T00:00:00`);
  }
  return new Date(budget.year, budget.month - 1, 1);
}

function budgetAgeInMonths(budget: Budget, now = new Date()): number {
  const period = budgetPeriodStart(budget);
  return (now.getFullYear() - period.getFullYear()) * 12
    + now.getMonth() - period.getMonth();
}

function compareBudgetsNewestFirst(a: Budget, b: Budget): number {
  const dateDiff = budgetPeriodStart(b).getTime() - budgetPeriodStart(a).getTime();
  return dateDiff || b.id - a.id;
}

type ItemEditorProps = { items: LineItem[]; setItems: React.Dispatch<React.SetStateAction<LineItem[]>>; roleColor: string };
function ItemEditor({ items, setItems, roleColor }: ItemEditorProps) {
  const colors = useColors();
  const total = items.reduce((s, i) => s + (parseFloat(i.amt) || 0), 0);
  function updateItem(i: number, field: 'cat' | 'amt', val: string) {
    setItems(prev => prev.map((x, j) => j === i ? { ...x, [field]: val } : x));
  }
  return (
    <>
      <View style={styles.itemsHeader}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>Line Items</Text>
        <TouchableOpacity onPress={() => setItems(p => [...p, blankItem()])}
          style={[styles.addItemBtn, { borderColor: roleColor }]}>
          <Ionicons name="add" size={14} color={roleColor} />
          <Text style={[styles.addItemBtnText, { color: roleColor }]}>Add item</Text>
        </TouchableOpacity>
      </View>
      {items.map((item, i) => (
        <View key={i} style={[styles.lineItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            value={item.cat} onChangeText={v => updateItem(i, 'cat', v)}
            placeholder="Category (e.g. Generator fuel)"
            placeholderTextColor={colors.textMuted}
            style={[styles.catInput, { color: colors.text, borderBottomColor: colors.border }]}
          />
          <View style={styles.amtRow}>
            <Text style={[styles.nairaSign, { color: colors.textMuted }]}>₦</Text>
            <TextInput
              value={item.amt} onChangeText={v => updateItem(i, 'amt', v)}
              placeholder="0" placeholderTextColor={colors.textMuted}
              keyboardType="numeric" style={[styles.amtInput, { color: colors.text }]}
            />
            {items.length > 1 ? (
              <TouchableOpacity onPress={() => setItems(p => p.filter((_, j) => j !== i))} style={styles.removeBtn}>
                <Ionicons name="trash-outline" size={17} color="#791F1F" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ))}
      {total > 0 ? (
        <View style={[styles.totalPreview, { backgroundColor: roleColor + '14', borderColor: roleColor + '40' }]}>
          <Text style={[styles.totalPreviewLabel, { color: colors.textMuted }]}>Budget Total</Text>
          <Text style={[styles.totalPreviewAmt, { color: roleColor }]}>{fmt(total)}</Text>
        </View>
      ) : null}
    </>
  );
}

/* ─── Budget performance helpers ─── */
interface BranchPerf { id: string; name: string; spent: number; pct: number; isOver: boolean }
interface BudgetPerf {
  totalSpent: number;
  remaining: number;
  pct: number;
  isOver: boolean;
  isWarning: boolean;
  byBranch: BranchPerf[];
}

function calcPerf(b: Budget, expenses: Expense[], branchMap: Record<string, string>): BudgetPerf {
  const linked = expenses.filter(e => e.budgetId === b.id && e.status === 'approved');
  const totalSpent = linked.reduce((s, e) => s + e.amt, 0);
  const pct = b.total > 0 ? totalSpent / b.total : 0;
  const isOver    = totalSpent > b.total;
  const isWarning = !isOver && pct >= PERFORMANCE_WARNING_RATIO;

  const grouped: Record<string, number> = {};
  for (const e of linked) {
    const key = e.branchId ?? 'unassigned';
    grouped[key] = (grouped[key] ?? 0) + e.amt;
  }
  const byBranch: BranchPerf[] = Object.entries(grouped).map(([id, spent]) => ({
    id,
    name: branchMap[id] ?? id,
    spent,
    pct: b.total > 0 ? spent / b.total : 0,
    isOver: spent > b.total,
  })).sort((a, z) => z.spent - a.spent);

  return { totalSpent, remaining: b.total - totalSpent, pct, isOver, isWarning, byBranch };
}

/* ─── Mini progress bar ─── */
function PerfBar({ pct, isOver, isWarning }: { pct: number; isOver: boolean; isWarning: boolean }) {
  const fill = Math.min(pct, 1);
  const color = isOver ? OVER_COLOR : isWarning ? WARN_COLOR : SAFE_COLOR;
  return (
    <View style={styles.perfBarTrack}>
      <View style={[styles.perfBarFill, { width: `${fill * 100}%` as any, backgroundColor: color }]} />
    </View>
  );
}

export default function BudgetScreen() {
  const {
    role, userName, branchId, budgets, expenses, branches,
    addBudget, updateBudget, updateAndSubmitBudget, deleteBudget, archiveBudgets, classifyBudgetBranch, submitBudgetToAcc,
    forwardBudget, approveBudget, rejectBudget, consolidateBudgetMonth,
  } = useApp();

  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;
  const {
    requestDateConfirmation,
    confirmationContent,
    hasPendingConfirmation,
  } = useBusinessDateConfirmation();

  const isMgr = role === 'mgr' || role === 'csm' || role === 'mktg';
  const isAcc = role === 'acc' || role === 'admin';
  const isMD  = role === 'md'  || role === 'ceo' || role === 'admin';
  const isCeo = role === 'ceo';
  const canClassifyHistoricalBudget = role === 'acc' || role === 'md' || role === 'ceo' || role === 'admin';

  const [tab, setTab] = useState<string>(isMgr ? 'mine' : 'pending');

  const [selected, setSelected]     = useState<Budget | null>(null);
  const [actionType, setActionType] = useState<'forward' | 'approve' | 'reject' | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [classificationBranchId, setClassificationBranchId] = useState('');
  const [classificationBusy, setClassificationBusy] = useState(false);
  const [reviewingBudgetIds, setReviewingBudgetIds] = useState<Set<number>>(() => new Set());
  const reviewingBudgetIdsRef = useRef<Set<number>>(new Set());

  const [showForm, setShowForm]     = useState(false);
  const [editTarget, setEditTarget] = useState<Budget | null>(null);
  const [formMonth, setFormMonth]   = useState(new Date().getMonth());
  const [formYear, setFormYear]     = useState(new Date().getFullYear());
  const [formDate, setFormDate]     = useState('');
  const [formBranchId, setFormBranchId] = useState(branchId ?? '');
  const [formItems, setFormItems]   = useState<LineItem[]>([blankItem()]);
  const [filterDate, setFilterDate] = useState('');
  const [archiveThreshold, setArchiveThreshold] = useState<number>(3);
  const [showConsolidate, setShowConsolidate] = useState(false);
  const [consolidateYear, setConsolidateYear] = useState(String(new Date().getFullYear()));
  const [consolidateMonth, setConsolidateMonth] = useState(String(new Date().getMonth() + 1));
  const [consolidateBusy, setConsolidateBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [submittingBudgetIds, setSubmittingBudgetIds] = useState<Set<number>>(() => new Set());
  const submittingBudgetIdsRef = useRef<Set<number>>(new Set());

  /* Branch name lookup */
  const branchMap: Record<string, string> = {};
  for (const br of branches) branchMap[br.id] = br.name;

  const activeBudgets = budgets.filter(b => !b.archivedAt);
  const archivedBudgets = budgets.filter(b => !!b.archivedAt);
  const pendingForAcc = activeBudgets.filter(b => b.status === 'submitted');
  const pendingForMD  = activeBudgets.filter(b => b.status === 'acc_forwarded');
  // mgr: only budgets they personally submitted (not all mgr-role budgets across branches)
  const myBudgets = activeBudgets.filter(b =>
    role === 'mgr'
      ? !!branchId && b.branchId === branchId
      : (b.by === role || b.byName === userName)
  );

  const displayListBase: Budget[] =
    isMD  ? (tab === 'pending' ? pendingForMD  : activeBudgets)
    : isAcc ? (tab === 'pending' ? pendingForAcc : tab === 'archived' ? archivedBudgets : activeBudgets)
    : role === 'csm' ? activeBudgets
    : myBudgets;
  const displayList = filterDate
    ? displayListBase.filter(b => (b.appliesOn ?? '').slice(0, 10) === filterDate).sort(compareBudgetsNewestFirst)
    : [...displayListBase].sort(compareBudgetsNewestFirst);

  /* Approved budgets summary for MD/ACC overview */
  const approvedBudgets = activeBudgets.filter(b => b.status === 'fully_approved');
  const totalApproved   = approvedBudgets.reduce((s, b) => s + b.total, 0);
  const totalSpentAll   = approvedBudgets.reduce((s, b) => s + calcPerf(b, expenses, branchMap).totalSpent, 0);
  const showSummary     = (isMD || isAcc || isCeo || role === 'csm') && approvedBudgets.length > 0 && tab === 'all';

  const eligibleToArchive = isAcc
    ? activeBudgets.filter(b =>
        ARCHIVABLE_STATUSES.has(b.status) && budgetAgeInMonths(b) > archiveThreshold
      )
    : [];

  function openCreate() {
    setEditTarget(null);
    setFormMonth(new Date().getMonth());
    setFormYear(new Date().getFullYear());
    setFormDate('');
    setFormBranchId(branchId ?? branches[0]?.id ?? '');
    setFormItems([blankItem()]);
    setShowForm(true);
  }

  function openEdit(b: Budget) {
    setEditTarget(b);
    setFormMonth(b.month - 1);
    setFormYear(b.year);
    setFormDate(b.appliesOn?.slice(0, 10) ?? '');
    setFormBranchId(b.branchId);
    setFormItems(b.items.map(i => ({ cat: i.cat, amt: String(i.amt) })));
    setShowForm(true);
  }

  function buildItems() {
    const valid = formItems.filter(i => i.cat.trim() && parseFloat(i.amt) > 0);
    if (!valid.length) { Alert.alert('Add at least one item with a category and amount'); return null; }
    const items = valid.map(i => ({ cat: i.cat.trim(), amt: parseFloat(i.amt) }));
    const total = items.reduce((s, i) => s + i.amt, 0);
    const label = `${MONTHS[formMonth]} ${formYear}`;
    return { items, total, label };
  }

  function handleSaveDraft() {
    if (!formDate) { Alert.alert('Date required', 'Select the date this budget applies to.'); return; }
    if (!formBranchId) { Alert.alert('Branch required', 'Select the branch this budget belongs to.'); return; }
    const built = buildItems();
    if (!built) return;
    requestDateConfirmation('budget', formDate, () => {
      if (editTarget) {
        updateBudget(editTarget.id, { ...built, month: formMonth + 1, year: formYear, appliesOn: formDate });
      } else {
        const status = isAcc ? 'submitted' : 'draft';
        addBudget({ month: formMonth + 1, year: formYear, appliesOn: formDate, label: built.label, by: role!, byName: userName, items: built.items, total: built.total, status, branchId: formBranchId, branchName: branchMap[formBranchId] ?? formBranchId });
      }
      setShowForm(false);
    }, 'Confirm & save');
  }

  function handleSaveAndSubmit() {
    if (formBusy) return;
    if (!formDate) { Alert.alert('Date required', 'Select the date this budget applies to.'); return; }
    if (!formBranchId) { Alert.alert('Branch required', 'Select the branch this budget belongs to.'); return; }
    const built = buildItems();
    if (!built) return;
    requestDateConfirmation('budget', formDate, () => {
      if (formBusy) return;
      setFormBusy(true);
      void (async () => {
        const result = editTarget
          ? await updateAndSubmitBudget(editTarget.id, { ...built, month: formMonth + 1, year: formYear, appliesOn: formDate })
          : await addBudget({ month: formMonth + 1, year: formYear, appliesOn: formDate, label: built.label, by: role!, byName: userName, items: built.items, total: built.total, status: 'submitted', branchId: formBranchId, branchName: branchMap[formBranchId] ?? formBranchId });
        if (!result.ok) return;
        setShowForm(false);
      })().finally(() => {
        setFormBusy(false);
      });
    });
  }

  function handleDeleteBudget(b: Budget) {
    Alert.alert('Delete Budget?', `${b.label} — ${fmt(b.total)}\n\nThis cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteBudget(b.id) },
    ]);
  }

  function handleArchiveOldBudgets() {
    if (!isAcc) return;
    if (eligibleToArchive.length === 0) {
      Alert.alert(
        'Nothing to archive',
        `There are no completed or rejected budgets older than ${archiveThreshold} month${archiveThreshold === 1 ? '' : 's'}. Pending budgets stay visible for workflow review.`,
      );
      return;
    }
    Alert.alert(
      `Archive ${eligibleToArchive.length} budget${eligibleToArchive.length === 1 ? '' : 's'}?`,
      `These completed, rejected, or draft budgets are older than ${archiveThreshold} month${archiveThreshold === 1 ? '' : 's'} and will move out of the active list. They will remain available in Archived.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive budgets',
          onPress: () => {
            archiveBudgets(eligibleToArchive.map(b => b.id));
            setTab('archived');
          },
        },
      ],
    );
  }

  async function handleConsolidateMonth() {
    const year = Number(consolidateYear);
    const month = Number(consolidateMonth);
    const headOffice = branches.find(branch => branch.name.trim().toLowerCase() === 'head office');
    if (!Number.isSafeInteger(year) || year < 2000 || !Number.isSafeInteger(month) || month < 1 || month > 12) {
      Alert.alert('Invalid month', 'Enter a valid year and a month from 1 to 12.');
      return;
    }
    if (!headOffice) {
      Alert.alert('Head office branch missing', 'Create or restore the Head office branch before consolidating budgets.');
      return;
    }
    setConsolidateBusy(true);
    const result = await consolidateBudgetMonth(year, month, headOffice.id);
    setConsolidateBusy(false);
    if (!result.ok) {
      Alert.alert('Consolidation failed', result.error ?? 'Please try again.');
      return;
    }
    setShowConsolidate(false);
    Alert.alert(
      'Budgets consolidated',
      `${result.result?.canonicalBudgets.length ?? 0} branch budgets are now active. ${result.result?.archivedBudgetIds.length ?? 0} duplicate budgets were archived.`,
    );
  }

  function handleSubmitToAcc(b: Budget) {
    if (submittingBudgetIdsRef.current.has(b.id)) return;
    Alert.alert('Submit to Accountant?',
      `${b.label} — ${fmt(b.total)}\nOnce submitted you cannot edit or delete until the accountant acts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: () => {
            if (submittingBudgetIdsRef.current.has(b.id)) return;
            submittingBudgetIdsRef.current.add(b.id);
            setSubmittingBudgetIds(current => new Set(current).add(b.id));
            void submitBudgetToAcc(b.id).then(result => {
              if (result.ok) setSelected(null);
            }).finally(() => {
              submittingBudgetIdsRef.current.delete(b.id);
              setSubmittingBudgetIds(current => {
                const next = new Set(current);
                next.delete(b.id);
                return next;
              });
            });
          },
        },
      ]
    );
  }

  function setBudgetReviewBusy(id: number, busy: boolean) {
    setReviewingBudgetIds(current => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleAction() {
    if (!selected || !actionType) return;
    if (!actionNote.trim()) { Alert.alert('Please add a note before confirming'); return; }
    const budgetId = selected.id;
    if (reviewingBudgetIdsRef.current.has(budgetId)) return;

    reviewingBudgetIdsRef.current.add(budgetId);
    setBudgetReviewBusy(budgetId, true);
    try {
      const note = actionNote.trim();
      const result = actionType === 'forward'
        ? await forwardBudget(budgetId, note)
        : actionType === 'approve'
          ? await approveBudget(budgetId, note)
          : await rejectBudget(budgetId, note);

      const committed = result?.ok === true;
      if (committed && (actionType === 'forward' || actionType === 'approve')) {
        Alert.alert(
          'Saved',
          actionType === 'forward' ? 'Budget forwarded to MD.' : 'Budget approved.',
        );
      }
      setActionType(null);
      setActionNote('');
      if (committed) setSelected(null);
    } finally {
      reviewingBudgetIdsRef.current.delete(budgetId);
      setBudgetReviewBusy(budgetId, false);
    }
  }

  async function handleClassifyBranch() {
    if (!selected || !classificationBranchId || classificationBusy) return;
    setClassificationBusy(true);
    const result = await classifyBudgetBranch(selected.id, classificationBranchId);
    setClassificationBusy(false);
    if (!result.ok) {
      Alert.alert('Branch classification failed', result.error ?? 'Please try again.');
      return;
    }
    setClassificationBranchId('');
    setSelected(null);
  }

  const mgrCanEdit   = (b: Budget) =>
    isMgr && !b.archivedAt && (b.status === 'draft' || b.status === 'rejected') && (b.by === role || b.byName === userName);
  const accCanEdit   = (b: Budget) => isAcc && !b.archivedAt && (b.status === 'submitted' || b.status === 'rejected');
  const accCanDelete = (b: Budget) => isAcc && !b.archivedAt && (b.status === 'submitted' || b.status === 'rejected');

  const TABS_MGR = [{ key: 'mine', label: 'My Budgets' }];
  const TABS_ACC = [
    { key: 'pending', label: 'For Review', count: pendingForAcc.length },
    { key: 'all',     label: 'All Budgets' },
    { key: 'archived', label: 'Archived', count: archivedBudgets.length },
  ];
  const TABS_MD  = [
    { key: 'pending', label: 'For Approval', count: pendingForMD.length },
    { key: 'all',     label: 'All Budgets' },
  ];
  const TABS_CEO = [
    { key: 'all',     label: 'All Budgets' },
    { key: 'pending', label: 'Pending', count: pendingForAcc.length + pendingForMD.length },
    { key: 'approved', label: 'Approved', count: approvedBudgets.length },
  ];
  const tabs = isCeo ? TABS_CEO : isMD ? TABS_MD : isAcc ? TABS_ACC : TABS_MGR;

  /* Detail-modal performance (computed once when selected changes) */
  // mgr only sees their own branch's expenses
  const visibleExpenses = role === 'mgr' && branchId
    ? expenses.filter(e => !e.branchId || e.branchId === branchId)
    : expenses;

  const selPerf = selected ? calcPerf(selected, visibleExpenses, branchMap) : null;

  return (
    <ScreenLayout
      title="Budget"
      rightAction={
        (isMgr || isAcc) ? (
          <TouchableOpacity onPress={openCreate} style={styles.headerBtn}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        ) : undefined
      }
    >
      {/* Tab bar */}
      {tabs.length > 1 ? (
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          {tabs.map(t => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)}
              style={[styles.tabBtn, { borderBottomColor: t.key === tab ? roleColor : 'transparent' }]}>
              <Text style={[styles.tabLabel, { color: t.key === tab ? roleColor : colors.textMuted, fontWeight: t.key === tab ? '700' : '400' }]}>
                {t.label}
              </Text>
              {'count' in t && (t as { count: number }).count > 0 ? (
                <View style={[styles.badge, { backgroundColor: roleColor }]}>
                  <Text style={styles.badgeText}>{(t as { count: number }).count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {isAcc ? (
        <View style={[styles.archivePanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.archivePanelHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.archiveTitle, { color: colors.text }]}>Tidy up old budgets</Text>
              <Text style={[styles.archiveHelp, { color: colors.textMuted }]}>
                Archive completed, rejected, or draft budgets older than the selected age. Pending reviews are never archived.
              </Text>
            </View>
            <Ionicons name="archive-outline" size={20} color={roleColor} />
          </View>
          <View style={styles.archiveOptions}>
            {ARCHIVE_THRESHOLDS.map(months => (
              <TouchableOpacity
                key={months}
                onPress={() => setArchiveThreshold(months)}
                style={[
                  styles.archiveOption,
                  {
                    backgroundColor: archiveThreshold === months ? roleColor : colors.background,
                    borderColor: archiveThreshold === months ? roleColor : colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Archive budgets older than ${months} month${months === 1 ? '' : 's'}`}
              >
                <Text style={[styles.archiveOptionText, { color: archiveThreshold === months ? '#fff' : colors.textMuted }]}>
                  {months} mo
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={handleArchiveOldBudgets}
              style={[styles.archiveAction, { backgroundColor: roleColor }]}
              accessibilityRole="button"
              accessibilityLabel={`Archive eligible budgets older than ${archiveThreshold} month${archiveThreshold === 1 ? '' : 's'}`}
            >
              <Text style={styles.archiveActionText}>Archive</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.archiveCount, { color: colors.textMuted }]}>
            {eligibleToArchive.length} eligible budget{eligibleToArchive.length === 1 ? '' : 's'} at this threshold
          </Text>
          <TouchableOpacity
            onPress={() => setShowConsolidate(true)}
            style={[styles.consolidateButton, { borderColor: roleColor }]}
            accessibilityRole="button"
            accessibilityLabel="Consolidate budgets for a month"
          >
            <Ionicons name="git-merge-outline" size={15} color={roleColor} />
            <Text style={[styles.consolidateButtonText, { color: roleColor }]}>Consolidate a month</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <AppliedDateField
        value={filterDate}
        onChange={setFilterDate}
        label="View budgets for a date"
        accent={roleColor}
        helper="Filter by the date the budget applies to."
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Approved-budgets summary banner (MD / ACC, All-tab) ── */}
        {showSummary ? (
          <View style={[styles.summaryCard, { borderColor: SAFE_COLOR + '44' }]}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryHalf}>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Total Approved</Text>
                <Text style={[styles.summaryAmt, { color: SAFE_COLOR }]}>{fmt(totalApproved)}</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.summaryHalf}>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Total Spent</Text>
                <Text style={[styles.summaryAmt, {
                   color: totalSpentAll > totalApproved ? OVER_COLOR : totalSpentAll >= totalApproved * PERFORMANCE_WARNING_RATIO ? WARN_COLOR : SAFE_COLOR,
                }]}>{fmt(totalSpentAll)}</Text>
              </View>
            </View>
            <PerfBar
              pct={totalApproved > 0 ? totalSpentAll / totalApproved : 0}
              isOver={totalSpentAll > totalApproved}
               isWarning={!( totalSpentAll > totalApproved) && totalSpentAll >= totalApproved * PERFORMANCE_WARNING_RATIO}
            />
            <Text style={[styles.summaryNote, { color: colors.textMuted }]}>
              {approvedBudgets.length} approved budget{approvedBudgets.length !== 1 ? 's' : ''}
              {' · '}
              {totalSpentAll > totalApproved
                ? `over budget by ${fmt(totalSpentAll - totalApproved)}`
                : `${fmt(totalApproved - totalSpentAll)} remaining`}
            </Text>
          </View>
        ) : null}

        {displayList.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="wallet-outline" size={44} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {isMgr ? 'No budgets yet. Tap + to create one.'
                : isAcc ? 'No budgets submitted for review yet.'
                : isCeo ? 'No budgets on record yet.'
                : 'No budgets awaiting your approval yet.'}
            </Text>
          </View>
        ) : null}

        {displayList.map(b => {
          const st        = STATUS_MAP[b.status] || STATUS_MAP.draft;
          const canMgrEdit = mgrCanEdit(b);
          const canAccEdit = accCanEdit(b);
          const locked    = b.status === 'fully_approved';
          const perf      = locked ? calcPerf(b, expenses, branchMap) : null;
           const archived = !!b.archivedAt;

          return (
            <TouchableOpacity key={b.id} onPress={() => setSelected(b)} activeOpacity={0.85}
              style={[styles.card, {
                backgroundColor: colors.surface,
                borderColor: b.status === 'submitted' ? '#0C447C'
                  : b.status === 'acc_forwarded' ? '#BA7517'
                  : b.status === 'fully_approved' ? (perf && perf.isOver ? OVER_COLOR : SAFE_COLOR)
                  : colors.border,
                borderWidth: b.status === 'submitted' || b.status === 'acc_forwarded' || locked ? 1.5 : 1,
              }]}>

              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{b.label}{' Budget'}</Text>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>{b.branchName || branchMap[b.branchId] || 'Branch not assigned'}{' · By '}{b.byName}{' · '}{b.items.length}{' items'}</Text>
                </View>
                 <View style={[styles.statusBadge, { backgroundColor: archived ? '#F0F0F0' : st.bg }]}>
                   <Text style={[styles.statusText, { color: archived ? '#555' : st.color }]}>{archived ? 'Archived' : st.label}</Text>
                </View>
              </View>

              {/* Approved budget: show amount + performance */}
              {locked && perf ? (
                <>
                  <View style={[styles.approvedBanner, { backgroundColor: SAFE_BG, borderColor: SAFE_COLOR + '55' }]}>
                    <Ionicons name="checkmark-circle" size={16} color={SAFE_COLOR} />
                    <Text style={[styles.approvedLabel, { color: SAFE_COLOR }]}>Approved Budget</Text>
                    <Text style={[styles.approvedAmt, { color: SAFE_COLOR }]}>{fmt(b.total)}</Text>
                  </View>
                  <View style={styles.perfRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.perfRowTop}>
                        <Text style={[styles.perfSpentLabel, { color: colors.textMuted }]}>Spent</Text>
                        <Text style={[styles.perfSpentAmt, {
                          color: perf.isOver ? OVER_COLOR : perf.isWarning ? WARN_COLOR : SAFE_COLOR,
                          fontWeight: '700',
                        }]}>{fmt(perf.totalSpent)}</Text>
                      </View>
                      <PerfBar pct={perf.pct} isOver={perf.isOver} isWarning={perf.isWarning} />
                    </View>
                    <View style={[styles.perfPill, {
                      backgroundColor: perf.isOver ? OVER_BG : perf.isWarning ? WARN_BG : SAFE_BG,
                    }]}>
                      <Ionicons
                        name={perf.isOver ? 'trending-up' : 'trending-down'}
                        size={11}
                        color={perf.isOver ? OVER_COLOR : perf.isWarning ? WARN_COLOR : SAFE_COLOR}
                      />
                      <Text style={[styles.perfPillText, {
                        color: perf.isOver ? OVER_COLOR : perf.isWarning ? WARN_COLOR : SAFE_COLOR,
                      }]}>
                        {perf.isOver ? 'Over' : perf.isWarning ? 'Near limit' : 'Under'}
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <Text style={[styles.cardTotal, { color: roleColor }]}>{fmt(b.total)}</Text>
                  <View style={styles.stepDots}>
                    {[0,1,2,3].map(i => (
                      <View key={i} style={[styles.stepDot, { backgroundColor: i < b.workflow.length ? st.color : colors.border }]} />
                    ))}
                  </View>
                </>
              )}

              {/* Mgr inline actions */}
              {canMgrEdit ? (
                <View style={styles.cardActions}>
                  <TouchableOpacity onPress={e => { e.stopPropagation?.(); openEdit(b); }}
                    style={[styles.cardActionBtn, { borderColor: '#185FA5' }]}>
                    <Ionicons name="create-outline" size={13} color="#185FA5" />
                    <Text style={[styles.cardActionText, { color: '#185FA5' }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={e => { e.stopPropagation?.(); handleDeleteBudget(b); }}
                    style={[styles.cardActionBtn, { borderColor: '#791F1F' }]}>
                    <Ionicons name="trash-outline" size={13} color="#791F1F" />
                    <Text style={[styles.cardActionText, { color: '#791F1F' }]}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={submittingBudgetIds.has(b.id)}
                    onPress={e => { e.stopPropagation?.(); handleSubmitToAcc(b); }}
                    style={[styles.cardSubmitBtn, { backgroundColor: roleColor, opacity: submittingBudgetIds.has(b.id) ? 0.55 : 1 }]}
                  >
                    <Ionicons name="send" size={13} color="#fff" />
                    <Text style={styles.cardSubmitText}>{submittingBudgetIds.has(b.id) ? 'Submitting…' : 'Submit to Accountant'}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Acc inline actions */}
              {canAccEdit ? (
                <View style={styles.cardActions}>
                  <TouchableOpacity onPress={e => { e.stopPropagation?.(); openEdit(b); }}
                    style={[styles.cardActionBtn, { borderColor: '#0C447C' }]}>
                    <Ionicons name="create-outline" size={13} color="#0C447C" />
                    <Text style={[styles.cardActionText, { color: '#0C447C' }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={e => { e.stopPropagation?.(); handleDeleteBudget(b); }}
                    style={[styles.cardActionBtn, { borderColor: '#791F1F' }]}>
                    <Ionicons name="trash-outline" size={13} color="#791F1F" />
                    <Text style={[styles.cardActionText, { color: '#791F1F' }]}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSelected(b)}
                    style={[styles.cardSubmitBtn, { backgroundColor: '#0C447C' }]}>
                    <Ionicons name="share-social" size={13} color="#fff" />
                    <Text style={styles.cardSubmitText}>Forward to MD</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Lock indicators */}
              {b.status === 'submitted' && !isAcc ? (
                <View style={[styles.lockRow, { borderColor: '#0C447C' }]}>
                  <Ionicons name="lock-closed-outline" size={11} color="#0C447C" />
                  <Text style={[styles.lockText, { color: '#0C447C' }]}>Under accountant review</Text>
                </View>
              ) : null}
              {b.status === 'acc_forwarded' && !isMD ? (
                <View style={[styles.lockRow, { borderColor: '#BA7517' }]}>
                  <Ionicons name="lock-closed-outline" size={11} color="#BA7517" />
                  <Text style={[styles.lockText, { color: '#BA7517' }]}>Awaiting MD approval</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ═══ DETAIL MODAL ═══ */}
      <Modal visible={!!selected} animationType="slide"
        onRequestClose={() => { setSelected(null); setActionType(null); setActionNote(''); }}>
        {selected ? (() => {
          const isApproved = selected.status === 'fully_approved';
          const headerBg   = isApproved ? SAFE_COLOR : roleColor;
          return (
            <View style={{ flex: 1, backgroundColor: colors.background }}>
              <View style={[styles.modalHeader, { backgroundColor: headerBg, paddingTop: 52 }]}>
                <TouchableOpacity onPress={() => { setSelected(null); setActionType(null); setActionNote(''); }} style={styles.headerBack}>
                  <Ionicons name="arrow-back" size={22} color="#fff" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>{selected.label}{' Budget'}</Text>
                  <Text style={styles.modalSub}>{selected.branchName || branchMap[selected.branchId] || 'Branch not assigned'}{' · '}{fmt(selected.total)}{' · '}{STATUS_MAP[selected.status]?.label}</Text>
                </View>
              </View>

              <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

                {/* ── Approved: performance dashboard ── */}
                {isApproved && selPerf ? (
                  <>
                    {/* Approved amount banner */}
                    <View style={[styles.approvedDetailBanner, { borderColor: SAFE_COLOR + '44' }]}>
                      <View style={styles.approvedDetailTop}>
                        <Ionicons name="checkmark-circle" size={22} color={SAFE_COLOR} />
                        <Text style={[styles.approvedDetailTitle, { color: SAFE_COLOR }]}>Total Amount Approved</Text>
                      </View>
                      <Text style={[styles.approvedDetailAmt, { color: SAFE_COLOR }]}>{fmt(selected.total)}</Text>
                    </View>

                    {/* Overall performance */}
                    <View style={[styles.perfCard, {
                      backgroundColor: selPerf.isOver ? OVER_BG : selPerf.isWarning ? WARN_BG : SAFE_BG,
                      borderColor: (selPerf.isOver ? OVER_COLOR : selPerf.isWarning ? WARN_COLOR : SAFE_COLOR) + '55',
                    }]}>
                      <View style={styles.perfCardHeader}>
                        <Ionicons
                          name={selPerf.isOver ? 'alert-circle' : selPerf.isWarning ? 'warning' : 'checkmark-circle'}
                          size={18}
                          color={selPerf.isOver ? OVER_COLOR : selPerf.isWarning ? WARN_COLOR : SAFE_COLOR}
                        />
                        <Text style={[styles.perfCardTitle, {
                          color: selPerf.isOver ? OVER_COLOR : selPerf.isWarning ? WARN_COLOR : SAFE_COLOR,
                        }]}>
                          {selPerf.isOver
                            ? `Over Budget by ${fmt(Math.abs(selPerf.remaining))}`
                            : selPerf.isWarning
                            ? `Near Limit — ${fmt(selPerf.remaining)} remaining`
                            : `Under Budget — ${fmt(selPerf.remaining)} remaining`}
                        </Text>
                      </View>
                      <View style={styles.perfMetricRow}>
                        <View style={styles.perfMetric}>
                          <Text style={[styles.perfMetricLabel, { color: colors.textMuted }]}>Budgeted</Text>
                          <Text style={[styles.perfMetricAmt, { color: colors.text }]}>{fmt(selected.total)}</Text>
                        </View>
                        <View style={styles.perfMetric}>
                          <Text style={[styles.perfMetricLabel, { color: colors.textMuted }]}>Spent</Text>
                          <Text style={[styles.perfMetricAmt, {
                            color: selPerf.isOver ? OVER_COLOR : selPerf.isWarning ? WARN_COLOR : SAFE_COLOR,
                          }]}>{fmt(selPerf.totalSpent)}</Text>
                        </View>
                        <View style={styles.perfMetric}>
                          <Text style={[styles.perfMetricLabel, { color: colors.textMuted }]}>Utilisation</Text>
                          <Text style={[styles.perfMetricAmt, {
                            color: selPerf.isOver ? OVER_COLOR : selPerf.isWarning ? WARN_COLOR : SAFE_COLOR,
                          }]}>{Math.round(selPerf.pct * 100)}%</Text>
                        </View>
                      </View>
                      <PerfBar pct={selPerf.pct} isOver={selPerf.isOver} isWarning={selPerf.isWarning} />
                    </View>

                    {/* Branch breakdown */}
                    {selPerf.byBranch.length > 0 ? (
                      <>
                        <Text style={[styles.section, { color: colors.text }]}>Spending by Branch</Text>
                        {selPerf.byBranch.map(br => {
                           const brColor = br.isOver ? OVER_COLOR : br.pct >= PERFORMANCE_WARNING_RATIO ? WARN_COLOR : SAFE_COLOR;
                           const brBg    = br.isOver ? OVER_BG    : br.pct >= PERFORMANCE_WARNING_RATIO ? WARN_BG    : SAFE_BG;
                          return (
                            <View key={br.id} style={[styles.branchRow, { backgroundColor: colors.surface, borderColor: brColor + '44' }]}>
                              <View style={styles.branchRowTop}>
                                <View style={[styles.branchDot, { backgroundColor: brColor }]} />
                                <Text style={[styles.branchName, { color: colors.text }]}>{br.name}</Text>
                                <View style={[styles.branchPill, { backgroundColor: brBg }]}>
                                  <Text style={[styles.branchPillText, { color: brColor }]}>
                                     {br.isOver ? '⬆ Over' : br.pct >= PERFORMANCE_WARNING_RATIO ? '⚠ Near' : '✓ OK'}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.branchAmtRow}>
                                <Text style={[styles.branchAmt, { color: brColor }]}>{fmt(br.spent)}</Text>
                                <Text style={[styles.branchPct, { color: colors.textMuted }]}>{Math.round(br.pct * 100)}% of budget</Text>
                              </View>
                               <PerfBar pct={br.pct} isOver={br.isOver} isWarning={br.pct >= PERFORMANCE_WARNING_RATIO && !br.isOver} />
                            </View>
                          );
                        })}
                      </>
                    ) : (
                      <View style={[styles.noExpBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Ionicons name="receipt-outline" size={22} color={colors.textMuted} />
                        <Text style={[styles.noExpText, { color: colors.textMuted }]}>No approved expenses linked to this budget yet.</Text>
                      </View>
                    )}
                  </>
                ) : null}

                {/* Budget line items */}
                <Text style={[styles.section, { color: colors.text, marginTop: isApproved ? 20 : 0 }]}>Budget Items</Text>
                {selected.items.map((item, i) => (
                  <View key={i} style={[styles.itemRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.itemCat, { color: colors.text }]}>{item.cat}</Text>
                    <Text style={[styles.itemAmt, { color: roleColor }]}>{fmt(item.amt)}</Text>
                  </View>
                ))}
                <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.totalLabel, { color: colors.text }]}>TOTAL</Text>
                  <Text style={[styles.totalAmt, { color: roleColor }]}>{fmt(selected.total)}</Text>
                </View>

                {/* Workflow */}
                {selected.workflow.length > 0 ? (
                  <>
                    <Text style={[styles.section, { color: colors.text, marginTop: 20 }]}>Workflow</Text>
                    {selected.workflow.map((step, i) => (
                      <View key={i} style={styles.wfStep}>
                        <View style={styles.wfLeft}>
                          <View style={[styles.wfIcon, { backgroundColor: STEP_BG[step.action] || '#eee' }]}>
                            <Ionicons name={STEP_ICON[step.action] as any} size={15} color={STEP_COLOR[step.action] || '#555'} />
                          </View>
                          {i < selected.workflow.length - 1 ? <View style={[styles.wfLine, { backgroundColor: colors.border }]} /> : null}
                        </View>
                        <View style={styles.wfContent}>
                          <Text style={[styles.wfStage, { color: colors.text }]}>{step.stage}</Text>
                          <Text style={[styles.wfBy, { color: colors.textMuted }]}>{'by '}{step.by}{' · '}{fmtDateTime(step.dt)}</Text>
                          {!!step.note ? <Text style={[styles.wfNote, { color: colors.textMuted }]}>{step.note}</Text> : null}
                        </View>
                      </View>
                    ))}
                  </>
                ) : null}

                {canClassifyHistoricalBudget && !selected.branchId ? (
                  <View style={[styles.actionBox, { backgroundColor: '#FFF8E8', borderColor: '#E2C46D' }]}>
                    <Ionicons name="business" size={18} color="#6B4F1D" />
                    <Text style={[styles.actionTitle, { color: '#6B4F1D' }]}>Classify Historical Budget</Text>
                    <Text style={[styles.actionSub, { color: colors.textMuted }]}>
                      Select the station this historical budget belongs to. This is audited and cannot be changed after confirmation.
                    </Text>
                    <View style={styles.chipRow}>
                      {branches.map(branch => (
                        <TouchableOpacity
                          key={branch.id}
                          onPress={() => setClassificationBranchId(branch.id)}
                          style={[styles.chip, {
                            backgroundColor: classificationBranchId === branch.id ? '#6B4F1D' : colors.surface,
                            borderColor: classificationBranchId === branch.id ? '#6B4F1D' : colors.border,
                          }]}
                        >
                          <Text style={[styles.chipText, { color: classificationBranchId === branch.id ? '#fff' : colors.text }]}>
                            {branch.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity
                      disabled={!classificationBranchId || classificationBusy}
                      onPress={handleClassifyBranch}
                      style={[styles.primaryBtn, {
                        backgroundColor: '#6B4F1D',
                        opacity: !classificationBranchId || classificationBusy ? 0.5 : 1,
                      }]}
                    >
                      <Text style={styles.primaryBtnText}>{classificationBusy ? 'Assigning…' : 'Confirm Branch Assignment'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Mgr: submit from detail */}
                {isMgr && mgrCanEdit(selected) && !actionType ? (
                  <View style={[styles.actionBox, { backgroundColor: '#F0F4FF', borderColor: '#BCC9E8' }]}>
                    <Ionicons name="send" size={18} color={roleColor} />
                    <Text style={[styles.actionTitle, { color: roleColor }]}>Submit to Accountant</Text>
                    <Text style={[styles.actionSub, { color: colors.textMuted }]}>The accountant will review, verify amounts, then forward to the MD for final approval.</Text>
                    <TouchableOpacity
                      disabled={submittingBudgetIds.has(selected.id)}
                      onPress={() => handleSubmitToAcc(selected)}
                      style={[styles.primaryBtn, { backgroundColor: roleColor, opacity: submittingBudgetIds.has(selected.id) ? 0.55 : 1 }]}
                    >
                      <Ionicons name="send" size={15} color="#fff" />
                      <Text style={styles.primaryBtnText}>{submittingBudgetIds.has(selected.id) ? 'Submitting…' : 'Submit to Accountant'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Acc: forward to MD */}
                {isAcc && selected.status === 'submitted' && !actionType ? (
                  <View style={[styles.actionBox, { backgroundColor: '#E6F1FB', borderColor: '#BCD4EF' }]}>
                    <Ionicons name="search" size={18} color="#0C447C" />
                    <Text style={[styles.actionTitle, { color: '#0C447C' }]}>Accountant Review</Text>
                    <Text style={[styles.actionSub, { color: colors.textMuted }]}>Verify all line items and amounts. You may edit the budget before forwarding it to the MD.</Text>
                    <View style={styles.actionBtns}>
                      <TouchableOpacity onPress={() => setActionType('forward')}
                        style={[styles.primaryBtn, { backgroundColor: '#0C447C' }]}>
                        <Ionicons name="share-social" size={15} color="#fff" />
                        <Text style={styles.primaryBtnText}>Forward to MD</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setActionType('reject')}
                        style={[styles.outlineBtn, { borderColor: '#791F1F' }]}>
                        <Text style={[styles.outlineBtnText, { color: '#791F1F' }]}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                {/* MD: approve/reject */}
                {isMD && selected.status === 'acc_forwarded' && !actionType ? (
                  <View style={[styles.actionBox, { backgroundColor: '#EAF3DE', borderColor: '#C2DDB3' }]}>
                    <Ionicons name="checkmark-done" size={18} color="#27500A" />
                    <Text style={[styles.actionTitle, { color: '#27500A' }]}>MD Final Approval</Text>
                    <Text style={[styles.actionSub, { color: colors.textMuted }]}>This budget has been reviewed and verified by the Accountant.</Text>
                    <View style={styles.actionBtns}>
                      <TouchableOpacity onPress={() => setActionType('approve')}
                        style={[styles.primaryBtn, { backgroundColor: '#1a6e3c' }]}>
                        <Ionicons name="checkmark" size={15} color="#fff" />
                        <Text style={styles.primaryBtnText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setActionType('reject')}
                        style={[styles.outlineBtn, { borderColor: '#791F1F' }]}>
                        <Text style={[styles.outlineBtnText, { color: '#791F1F' }]}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                {!!actionType ? (
                  <View style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.noteLabel, { color: colors.text }]}>
                      {actionType === 'forward' ? 'Scrutiny Note (required)' : actionType === 'approve' ? 'Approval Note (required)' : 'Rejection Reason (required)'}
                    </Text>
                    <TextInput
                      value={actionNote} onChangeText={setActionNote}
                      placeholder={actionType === 'forward' ? 'e.g. All items verified — no corrections needed.' : 'Add a note…'}
                      placeholderTextColor={colors.textMuted}
                      multiline
                      style={[styles.noteInput, { color: colors.text, borderColor: colors.border }]}
                    />
                    <View style={styles.actionBtns}>
                      <TouchableOpacity
                        disabled={reviewingBudgetIds.has(selected.id)}
                        onPress={handleAction}
                        style={[styles.primaryBtn, {
                          backgroundColor: actionType === 'reject' ? '#791F1F' : actionType === 'forward' ? '#0C447C' : '#1a6e3c',
                          opacity: reviewingBudgetIds.has(selected.id) ? 0.5 : 1,
                        }]}>
                        <Text style={styles.primaryBtnText}>
                          {reviewingBudgetIds.has(selected.id)
                            ? 'Saving…'
                            : actionType === 'forward' ? 'Forward to MD' : actionType === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={reviewingBudgetIds.has(selected.id)}
                        onPress={() => { setActionType(null); setActionNote(''); }}
                        style={[styles.outlineBtn, { borderColor: colors.border }]}>
                        <Text style={[styles.outlineBtnText, { color: colors.textMuted }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                <View style={{ height: 32 }} />
              </ScrollView>
            </View>
          );
        })() : null}
      </Modal>

      {/* ═══ MONTH CONSOLIDATION MODAL ═══ */}
      <Modal visible={showConsolidate} animationType="fade" transparent onRequestClose={() => setShowConsolidate(false)}>
        <View style={styles.consolidateOverlay}>
          <View style={[styles.consolidateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.consolidateHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.consolidateTitle, { color: colors.text }]}>Consolidate a month</Text>
                <Text style={[styles.consolidateHelp, { color: colors.textMuted }]}>
                  Merges duplicate branch budgets, assigns Accountant-created items to Head office, relinks expenses, and archives the source records.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowConsolidate(false)} disabled={consolidateBusy}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.consolidateFields}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>Year</Text>
                <TextInput
                  value={consolidateYear}
                  onChangeText={setConsolidateYear}
                  keyboardType="number-pad"
                  style={[styles.consolidateInput, { color: colors.text, borderColor: colors.border }]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>Month</Text>
                <TextInput
                  value={consolidateMonth}
                  onChangeText={setConsolidateMonth}
                  keyboardType="number-pad"
                  style={[styles.consolidateInput, { color: colors.text, borderColor: colors.border }]}
                />
              </View>
            </View>
            <View style={[styles.headOfficeHint, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Ionicons name="business-outline" size={18} color={roleColor} />
              <Text style={[styles.consolidateHelp, { color: colors.text }]}>
                Accountant-created records will be assigned to: {branches.find(branch => branch.name.trim().toLowerCase() === 'head office')?.name ?? 'Head office'}
              </Text>
            </View>
            <View style={styles.actionBtns}>
              <TouchableOpacity
                onPress={handleConsolidateMonth}
                disabled={consolidateBusy}
                style={[styles.primaryBtn, { backgroundColor: roleColor, opacity: consolidateBusy ? 0.6 : 1 }]}
              >
                <Ionicons name="git-merge-outline" size={15} color="#fff" />
                <Text style={styles.primaryBtnText}>{consolidateBusy ? 'Consolidating…' : 'Consolidate budgets'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowConsolidate(false)} disabled={consolidateBusy}
                style={[styles.outlineBtn, { borderColor: colors.border }]}>
                <Text style={[styles.outlineBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ CREATE / EDIT MODAL ═══ */}
      <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            {hasPendingConfirmation ? confirmationContent : (
              <>
                <View style={[styles.modalHeader, { backgroundColor: roleColor, paddingTop: 52 }]}>
                  <TouchableOpacity onPress={() => setShowForm(false)} style={styles.headerBack}>
                    <Ionicons name="close" size={22} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.modalTitle}>{editTarget ? 'Edit Budget' : 'New Budget'}</Text>
                </View>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Branch *</Text>
              <View style={styles.chipRow}>
                {branches.map(branch => (
                  <TouchableOpacity
                    key={branch.id}
                    disabled={role === 'mgr'}
                    onPress={() => setFormBranchId(branch.id)}
                    style={[styles.chip, {
                      backgroundColor: branch.id === formBranchId ? roleColor : colors.surface,
                      borderColor: branch.id === formBranchId ? roleColor : colors.border,
                      opacity: role === 'mgr' && branch.id !== formBranchId ? 0.45 : 1,
                    }]}
                  >
                    <Text style={[styles.chipText, { color: branch.id === formBranchId ? '#fff' : colors.text }]}>{branch.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <AppliedDateField
                value={formDate}
                onChange={setFormDate}
                accent={roleColor}
                helper="Select the business date covered by this budget. Submission time is recorded separately."
              />
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Month</Text>
              <View style={styles.chipRow}>
                {MONTHS.map((m, i) => (
                  <TouchableOpacity key={m} onPress={() => setFormMonth(i)}
                    style={[styles.chip, { backgroundColor: i === formMonth ? roleColor : colors.surface, borderColor: i === formMonth ? roleColor : colors.border }]}>
                    <Text style={[styles.chipText, { color: i === formMonth ? '#fff' : colors.text }]}>{m.slice(0, 3)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.fieldLabel, { color: colors.text, marginTop: 12 }]}>Year</Text>
              <View style={styles.yearRow}>
                {YEARS.map(y => (
                  <TouchableOpacity key={y} onPress={() => setFormYear(y)}
                    style={[styles.chip, { backgroundColor: y === formYear ? roleColor : colors.surface, borderColor: y === formYear ? roleColor : colors.border }]}>
                    <Text style={[styles.chipText, { color: y === formYear ? '#fff' : colors.text }]}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <ItemEditor items={formItems} setItems={setFormItems} roleColor={roleColor} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                 <TouchableOpacity onPress={handleSaveDraft} disabled={formBusy}
                  style={[styles.submitBtn, { flex: 1, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: roleColor }]}>
                  <Ionicons name="save-outline" size={16} color={roleColor} />
                  <Text style={[styles.submitBtnText, { color: roleColor }]}>Save Draft</Text>
                </TouchableOpacity>
                {(!editTarget || editTarget.status === 'draft' || editTarget.status === 'rejected') ? (
                   <TouchableOpacity onPress={handleSaveAndSubmit} disabled={formBusy}
                     style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor, opacity: formBusy ? 0.6 : 1 }]}>
                    <Ionicons name="send" size={16} color="#fff" />
                     <Text style={styles.submitBtnText}>{formBusy ? 'Submitting…' : 'Save & Submit'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={{ height: 32 }} />
                </ScrollView>
              </>
            )}
          </View>
      </Modal>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll:            { padding: 16 },
  tabBar:            { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6, borderBottomWidth: 2 },
  tabLabel:          { fontSize: 13 },
  badge:             { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  badgeText:         { color: '#fff', fontSize: 11, fontWeight: '700' },
  headerBtn:         { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  archivePanel:      { borderWidth: 1, borderRadius: 14, padding: 14, margin: 16, marginBottom: 8, gap: 10 },
  archivePanelHeader:{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  archiveTitle:      { fontSize: 13, fontWeight: '800' },
  archiveHelp:       { fontSize: 11, lineHeight: 16, marginTop: 3 },
  archiveOptions:    { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  archiveOption:     { minWidth: 42, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  archiveOptionText: { fontSize: 11, fontWeight: '700' },
  archiveAction:     { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 8, marginLeft: 'auto' },
  archiveActionText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  archiveCount:      { fontSize: 10 },
  consolidateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 9, borderWidth: 1, borderRadius: 8 },
  consolidateButtonText: { fontSize: 12, fontWeight: '800' },
  consolidateOverlay: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.42)' },
  consolidateCard: { borderWidth: 1, borderRadius: 16, padding: 18, gap: 16 },
  consolidateHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  consolidateTitle: { fontSize: 18, fontWeight: '800', flex: 1 },
  consolidateHelp: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  consolidateFields: { flexDirection: 'row', gap: 10 },
  consolidateInput: { height: 44, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, fontSize: 15 },
  headOfficeHint: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 10, padding: 11 },

  /* Summary banner */
  summaryCard:       { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 16, backgroundColor: '#F3FAF0', gap: 8 },
  summaryRow:        { flexDirection: 'row', alignItems: 'center' },
  summaryHalf:       { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider:    { width: 1, height: 40, marginHorizontal: 8 },
  summaryLabel:      { fontSize: 11, fontWeight: '600' },
  summaryAmt:        { fontSize: 20, fontWeight: '800' },
  summaryNote:       { fontSize: 11, textAlign: 'center' },

  /* Card */
  card:              { padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 12, gap: 8 },
  cardTop:           { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle:         { fontSize: 15, fontWeight: '700' },
  cardSub:           { fontSize: 12, marginTop: 2 },
  statusBadge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText:        { fontSize: 11, fontWeight: '700' },
  cardTotal:         { fontSize: 22, fontWeight: '700' },
  stepDots:          { flexDirection: 'row', gap: 4 },
  stepDot:           { width: 22, height: 6, borderRadius: 3 },

  /* Approved card elements */
  approvedBanner:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  approvedLabel:     { fontSize: 12, fontWeight: '700', flex: 1 },
  approvedAmt:       { fontSize: 16, fontWeight: '800' },
  perfRow:           { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perfRowTop:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  perfSpentLabel:    { fontSize: 11 },
  perfSpentAmt:      { fontSize: 13 },
  perfPill:          { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 3 },
  perfPillText:      { fontSize: 11, fontWeight: '700' },

  /* Progress bar */
  perfBarTrack:      { height: 7, borderRadius: 4, backgroundColor: '#E0E0E0', overflow: 'hidden' },
  perfBarFill:       { height: 7, borderRadius: 4 },

  cardActions:       { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  cardActionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5 },
  cardActionText:    { fontSize: 12, fontWeight: '600' },
  cardSubmitBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, borderRadius: 8 },
  cardSubmitText:    { color: '#fff', fontSize: 12, fontWeight: '700' },
  lockRow:           { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  lockText:          { fontSize: 11, fontWeight: '600' },
  empty:             { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText:         { fontSize: 14, textAlign: 'center', maxWidth: 260 },

  /* Modal */
  modalHeader:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  headerBack:        { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  modalTitle:        { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
  modalSub:          { color: 'rgba(255,255,255,0.65)', fontSize: 12 },

  /* Approved detail banner */
  approvedDetailBanner: { backgroundColor: SAFE_BG, borderWidth: 1.5, borderColor: SAFE_COLOR + '55', borderRadius: 14, padding: 16, gap: 6, marginBottom: 12 },
  approvedDetailTop:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  approvedDetailTitle:  { fontSize: 13, fontWeight: '700', flex: 1, color: SAFE_COLOR },
  approvedDetailAmt:    { fontSize: 30, fontWeight: '800', color: SAFE_COLOR },

  /* Performance card */
  perfCard:          { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10, marginBottom: 16 },
  perfCardHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  perfCardTitle:     { fontSize: 13, fontWeight: '700', flex: 1 },
  perfMetricRow:     { flexDirection: 'row', gap: 4 },
  perfMetric:        { flex: 1, alignItems: 'center', gap: 2 },
  perfMetricLabel:   { fontSize: 10, fontWeight: '600' },
  perfMetricAmt:     { fontSize: 14, fontWeight: '800' },

  /* Branch breakdown */
  branchRow:         { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8, gap: 6 },
  branchRowTop:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  branchDot:         { width: 8, height: 8, borderRadius: 4 },
  branchName:        { fontSize: 13, fontWeight: '700', flex: 1 },
  branchPill:        { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  branchPillText:    { fontSize: 10, fontWeight: '700' },
  branchAmtRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  branchAmt:         { fontSize: 16, fontWeight: '800' },
  branchPct:         { fontSize: 11 },
  noExpBox:          { borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', padding: 20, alignItems: 'center', gap: 8, marginBottom: 12 },
  noExpText:         { fontSize: 13, textAlign: 'center', maxWidth: 240 },

  /* Workflow, items, actions */
  section:           { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  itemRow:           { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  itemCat:           { fontSize: 14 },
  itemAmt:           { fontSize: 14, fontWeight: '600' },
  totalRow:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1.5, marginTop: 2 },
  totalLabel:        { fontSize: 14, fontWeight: '700' },
  totalAmt:          { fontSize: 18, fontWeight: '700' },
  wfStep:            { flexDirection: 'row', gap: 12, marginBottom: 8 },
  wfLeft:            { alignItems: 'center', width: 34 },
  wfIcon:            { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  wfLine:            { width: 2, flex: 1, marginTop: 4, minHeight: 18 },
  wfContent:         { flex: 1, paddingTop: 6, paddingBottom: 8 },
  wfStage:           { fontSize: 14, fontWeight: '600' },
  wfBy:              { fontSize: 12, marginTop: 2 },
  wfNote:            { fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  actionBox:         { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8, marginTop: 12 },
  actionTitle:       { fontSize: 15, fontWeight: '700' },
  actionSub:         { fontSize: 13, lineHeight: 18 },
  actionBtns:        { flexDirection: 'row', gap: 8, marginTop: 4 },
  primaryBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10 },
  primaryBtnText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  outlineBtn:        { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1.5 },
  outlineBtnText:    { fontSize: 14, fontWeight: '600' },
  noteCard:          { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10, marginTop: 12 },
  noteLabel:         { fontSize: 14, fontWeight: '600' },
  noteInput:         { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },

  /* Form */
  fieldLabel:        { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  chipRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  chip:              { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  chipText:          { fontSize: 12, fontWeight: '600' },
  yearRow:           { flexDirection: 'row', gap: 8, marginBottom: 14 },
  itemsHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 },
  addItemBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  addItemBtnText:    { fontSize: 12, fontWeight: '600' },
  lineItem:          { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  catInput:          { fontSize: 14, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  amtRow:            { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  nairaSign:         { fontSize: 16, fontWeight: '600' },
  amtInput:          { flex: 1, fontSize: 16, fontWeight: '600' },
  removeBtn:         { padding: 4 },
  totalPreview:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 4 },
  totalPreviewLabel: { fontSize: 13, fontWeight: '600' },
  totalPreviewAmt:   { fontSize: 22, fontWeight: '800' },
  submitBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 8 },
  submitBtnText:     { fontSize: 14, fontWeight: '700', color: '#fff' },
});
