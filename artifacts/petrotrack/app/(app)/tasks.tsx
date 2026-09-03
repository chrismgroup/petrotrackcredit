import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ModalSheet } from '@/components/FormSheet';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ActionItem, ActionItemStatus, ActionItemUrgency, KPI, ROLE_COLORS, ROLE_LABELS, TASK_CAN_ASSIGN, Task, TaskCadence, TaskPriority, TaskStatus, UINFO, resolveUserInfo, fmtDate, getActionItemUrgency, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type TabId = 'mine' | 'assigned' | 'action-items' | 'kpis';
type CadenceFilter = 'all' | TaskCadence;
type ActionView = 'active' | 'archived';

const STATUS_META: Record<TaskStatus, { label: string; color: string; bg: string; icon: string }> = {
  commenced:   { label: 'Commenced',   color: '#185FA5', bg: '#E6F1FB', icon: 'play-circle'      },
  progressing: { label: 'Progressing', color: '#BA7517', bg: '#FAEEDA', icon: 'time'             },
  completed:   { label: 'Completed',   color: '#27500A', bg: '#EAF3DE', icon: 'checkmark-circle' },
};

const PRI_META: Record<TaskPriority, { color: string; bg: string }> = {
  High:   { color: '#791F1F', bg: '#FCEBEB' },
  Medium: { color: '#BA7517', bg: '#FAEEDA' },
  Low:    { color: '#27500A', bg: '#EAF3DE' },
};

const CADENCE_META: Record<TaskCadence, { label: string; icon: string; color: string; bg: string }> = {
  daily:     { label: 'Daily',     icon: 'sunny-outline',    color: '#D85A30', bg: '#FAECE7' },
  weekly:    { label: 'Weekly',    icon: 'calendar-outline', color: '#185FA5', bg: '#E6F1FB' },
  monthly:   { label: 'Monthly',   icon: 'calendar',         color: '#4527a0', bg: '#EEEDFE' },
  quarterly: { label: 'Quarterly', icon: 'layers-outline',   color: '#0F6E56', bg: '#E1F5EE' },
};

const CADENCE_FILTERS: { id: CadenceFilter; label: string }[] = [
  { id: 'all',       label: 'All'       },
  { id: 'daily',     label: 'Daily'     },
  { id: 'weekly',    label: 'Weekly'    },
  { id: 'monthly',   label: 'Monthly'   },
  { id: 'quarterly', label: 'Quarterly' },
];

const KPI_PERIODS = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual', 'Per request'];

const ACTION_PARTY_ROLES: Exclude<keyof typeof ROLE_LABELS, 'admin'>[] = ['ceo', 'md', 'mktg', 'csm', 'acc', 'mgr', 'att'];
const ACTION_STATUS_META: Record<ActionItemStatus, { label: string; color: string; bg: string; icon: string }> = {
  open: { label: 'Open', color: '#185FA5', bg: '#E6F1FB', icon: 'ellipse-outline' },
  'on-going': { label: 'On-going', color: '#BA7517', bg: '#FAEEDA', icon: 'time-outline' },
  closed: { label: 'Closed', color: '#27500A', bg: '#EAF3DE', icon: 'checkmark-circle' },
};
const ACTION_URGENCY_META: Record<ActionItemUrgency, { label: string; color: string; bg: string }> = {
  overdue: { label: 'Overdue', color: '#B42318', bg: '#FCEBEB' },
  'due-soon': { label: 'Due within 2 weeks', color: '#9A6700', bg: '#FFF4CC' },
  'on-track': { label: 'More than 2 weeks', color: '#137333', bg: '#EAF5EA' },
};

export default function TasksScreen() {
  const {
    role, userName, staffId, branchId, branches, userAccounts, tasks, kpis, actionItems,
    addTask, updateTaskStatus, deleteTask, addKpi, deleteKpi, addActionItem, updateActionItemStatus,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'md'] || colors.primary;
  const isCeo = role === 'ceo';

  const [tab, setTab] = useState<TabId>('mine');
  const [cadenceFilter, setCadenceFilter] = useState<CadenceFilter>('all');
  const [actionView, setActionView] = useState<ActionView>('active');
  const [actionBranchFilter, setActionBranchFilter] = useState<string>('all');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showKpiForm, setShowKpiForm] = useState(false);
  const [showActionForm, setShowActionForm] = useState(false);

  const [taskForm, setTaskForm] = useState({
    title: '', desc: '', assignedTo: '' as string,
    priority: 'Medium' as TaskPriority,
    cadence: 'daily' as TaskCadence,
    target: '', targetUnit: '', dueDate: '',
  });
  const [kpiForm, setKpiForm] = useState({
    title: '', target: '', unit: '', period: 'Monthly',
    assignedTo: '' as string, assignedToName: '',
  });
  const [actionForm, setActionForm] = useState({
    title: '', desc: '', actionPartyId: null as number | null,
    actionPartyRole: '' as string, actionPartyName: '',
    targetDate: '', branchId: branchId ?? '',
  });

  const assignableRoles: string[] = role ? TASK_CAN_ASSIGN[role] ?? [] : [];
  const canAssign = assignableRoles.length > 0;
  const isCorporateAdmin = role === 'admin' || role === 'ceo';
  const availableBranches = branches.filter(branch => branch.st === 'Active' && (isCorporateAdmin || !branchId || branch.id === branchId));
  const actionPartyAccounts = userAccounts.filter(account =>
    account.status === 'active' && account.role && account.role !== 'admin'
      && ACTION_PARTY_ROLES.includes(account.role as any),
  );
  const actionPartyOptions = actionPartyAccounts.length > 0
    ? actionPartyAccounts
    : ACTION_PARTY_ROLES.map(partyRole => ({ id: 0, empName: resolveUserInfo(partyRole, userAccounts).name, role: partyRole }));
  const visibleActionItems = actionItems.filter(item => {
    const userBranchMatches = isCorporateAdmin || !branchId || item.branchId === branchId;
    const branchMatches = actionBranchFilter === 'all' || item.branchId === actionBranchFilter;
    const isArchived = item.status === 'closed' || !!item.archivedAt;
    return userBranchMatches && branchMatches && (actionView === 'archived' ? isArchived : !isArchived);
  });

  const myTasksAll    = tasks.filter(t => t.assignedTo === role);
  const assignedByAll = tasks.filter(t => t.assignedBy === role);
  const myTasks    = cadenceFilter === 'all' ? myTasksAll    : myTasksAll.filter(t => t.cadence === cadenceFilter);
  const assignedBy = cadenceFilter === 'all' ? assignedByAll : assignedByAll.filter(t => t.cadence === cadenceFilter);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'mine',     label: `My Tasks (${myTasksAll.length})` },
    { id: 'assigned', label: `Assigned (${assignedByAll.length})` },
    { id: 'action-items', label: `Action Items (${actionItems.filter(item => item.status !== 'closed').length})` },
    ...(isCeo ? [{ id: 'kpis' as TabId, label: `KPIs (${kpis.length})` }] : []),
  ];

  function openTaskForm() { setShowTaskForm(true); }
  function openKpiForm()  { setShowKpiForm(true); }
  function openActionForm() {
    setActionForm(form => ({ ...form, branchId: branchId ?? availableBranches[0]?.id ?? '' }));
    setShowActionForm(true);
  }

  function handleAssignTask() {
    if (!role || !taskForm.title || !taskForm.assignedTo) {
      Alert.alert('Required', 'Title and assignee are required.'); return;
    }
    const assignedToResolved = resolveUserInfo(taskForm.assignedTo, userAccounts);
    addTask({
      title: taskForm.title, desc: taskForm.desc,
      assignedBy: role, assignedByName: userName,
      assignedTo: taskForm.assignedTo as any,
      assignedToName: assignedToResolved.name,
      status: 'commenced', priority: taskForm.priority,
      cadence: taskForm.cadence,
      target: taskForm.target || undefined,
      targetUnit: taskForm.targetUnit || undefined,
      dueDate: taskForm.dueDate,
    });
    setTaskForm({ title: '', desc: '', assignedTo: '', priority: 'Medium', cadence: 'daily', target: '', targetUnit: '', dueDate: '' });
    setShowTaskForm(false);
  }

  function handleAddKpi() {
    if (!kpiForm.title || !kpiForm.assignedTo) {
      Alert.alert('Required', 'Title and assignee are required.'); return;
    }
    addKpi({
      title: kpiForm.title, target: kpiForm.target, unit: kpiForm.unit,
      period: kpiForm.period, assignedTo: kpiForm.assignedTo as any,
      assignedToName: resolveUserInfo(kpiForm.assignedTo, userAccounts).name,
    });
    setKpiForm({ title: '', target: '', unit: '', period: 'Monthly', assignedTo: '', assignedToName: '' });
    setShowKpiForm(false);
  }

  function handleAddActionItem() {
    if (!role || !actionForm.title.trim() || !actionForm.actionPartyRole || !actionForm.targetDate || !actionForm.branchId) {
      Alert.alert('Required', 'Title, action party, target close date, and branch are required.');
      return;
    }
    const selectedBranch = branches.find(branch => branch.id === actionForm.branchId);
    const created = addActionItem({
      title: actionForm.title,
      desc: actionForm.desc,
      actionPartyId: actionForm.actionPartyId || undefined,
      actionPartyRole: actionForm.actionPartyRole as any,
      actionPartyName: actionForm.actionPartyName,
      targetDate: actionForm.targetDate,
      branchId: actionForm.branchId,
      branchName: selectedBranch?.name ?? actionForm.branchId,
    });
    if (!created) {
      Alert.alert('Unable to add action item', 'Please sign in again and try once more.');
      return;
    }
    setActionForm({
      title: '', desc: '', actionPartyId: null, actionPartyRole: '',
      actionPartyName: '', targetDate: '', branchId: branchId ?? availableBranches[0]?.id ?? '',
    });
    setShowActionForm(false);
  }

  function handleActionStatus(item: ActionItem, status: ActionItemStatus) {
    if (status === 'closed') {
      Alert.alert('Close action item?', `"${item.title}" will be locked and moved to the ${item.branchName} archive.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close and archive', onPress: () => updateActionItemStatus(item.id, status) },
      ]);
      return;
    }
    updateActionItemStatus(item.id, status);
  }

  function handleNextStatus(task: Task) {
    const order: TaskStatus[] = ['commenced', 'progressing', 'completed'];
    const idx = order.indexOf(task.status);
    if (idx < order.length - 1) {
      const next = order[idx + 1];
      Alert.alert('Update Status', `Mark as "${STATUS_META[next].label}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => updateTaskStatus(task.id, next) },
      ]);
    }
  }

  function handleDeleteTask(task: Task) {
    Alert.alert('Delete Task', `Remove "${task.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTask(task.id) },
    ]);
  }

  function handleDeleteKpi(kpi: KPI) {
    Alert.alert('Delete KPI', `Remove "${kpi.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteKpi(kpi.id) },
    ]);
  }

  function canUpdateActionItem(item: ActionItem) {
    if (!role || item.status === 'closed') return false;
    return role === 'ceo'
      || (item.actionPartyId !== undefined ? item.actionPartyId === staffId : item.actionPartyRole === role);
  }

  function renderTaskCard(task: Task, isAssignedToMe: boolean) {
    const sm  = STATUS_META[task.status];
    const pm  = PRI_META[task.priority];
    const cm  = CADENCE_META[task.cadence];
    const done = task.status === 'completed';
    return (
      <View key={task.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Top row: badges + trash (CEO can delete tasks they assigned; assignees cannot) */}
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <View style={[styles.badge, { backgroundColor: cm.bg }]}>
            <Ionicons name={cm.icon as any} size={10} color={cm.color} />
            <Text style={[styles.badgeText, { color: cm.color }]}>{cm.label}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: pm.bg }]}>
            <Text style={[styles.badgeText, { color: pm.color }]}>{task.priority}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: sm.bg }]}>
            <Ionicons name={sm.icon as any} size={10} color={sm.color} />
            <Text style={[styles.badgeText, { color: sm.color }]}>{sm.label}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {isCeo && !isAssignedToMe && (
            <TouchableOpacity
              onPress={() => handleDeleteTask(task)}
              style={[styles.iconBtn, { borderColor: colors.errorBorder, backgroundColor: colors.errorBg }]}
            >
              <Ionicons name="trash-outline" size={12} color={colors.error} />
            </TouchableOpacity>
          )}
        </View>

        {/* Title + desc */}
        <Text style={[styles.cardTitle, { color: colors.text, opacity: done ? 0.5 : 1 }]} numberOfLines={2}>
          {task.title}
        </Text>
        {!!task.desc && (
          <Text style={[styles.cardDesc, { color: colors.textMuted }]} numberOfLines={2}>{task.desc}</Text>
        )}

        {/* Target row */}
        {task.target ? (
          <View style={[styles.targetRow, { backgroundColor: roleColor + '0D', borderColor: roleColor + '25' }]}>
            <Ionicons name="flag-outline" size={12} color={roleColor} />
            <Text style={[styles.targetLabel, { color: roleColor }]}>Target:</Text>
            <Text style={[styles.targetVal, { color: roleColor }]}>{task.target}{task.targetUnit ? ` ${task.targetUnit}` : ''}</Text>
            {task.dueDate ? (
              <>
                <View style={[styles.targetDivider, { backgroundColor: roleColor + '40' }]} />
                <Ionicons name="calendar-outline" size={11} color={colors.textMuted} />
                <Text style={[styles.targetDue, { color: colors.textMuted }]}>by {fmtDate(task.dueDate)}</Text>
              </>
            ) : null}
          </View>
        ) : task.dueDate ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="calendar-outline" size={12} color={colors.textSubtle} />
            <Text style={[styles.metaText, { color: colors.textMuted }]}>Due: {fmtDate(task.dueDate)}</Text>
          </View>
        ) : null}

        {/* Assigned from/to */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={isAssignedToMe ? 'person-outline' : 'arrow-forward-circle-outline'} size={12} color={colors.textSubtle} />
          <Text style={[styles.metaText, { color: colors.textMuted }]}>
            {isAssignedToMe ? `From: ${task.assignedByName}` : `To: ${task.assignedToName}`}
          </Text>
        </View>

        {/* Status controls */}
        {isAssignedToMe && !done && (
          <View style={styles.statusBtns}>
            {(['commenced', 'progressing', 'completed'] as TaskStatus[]).map(s => {
              const m = STATUS_META[s];
              const active = task.status === s;
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => !active && updateTaskStatus(task.id, s)}
                  style={[styles.statusBtn, { backgroundColor: active ? m.color : colors.background, borderColor: active ? m.color : colors.border }]}
                >
                  <Text style={[styles.statusBtnText, { color: active ? '#fff' : colors.textMuted }]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {!isAssignedToMe && task.status !== 'completed' && (
          <TouchableOpacity
            onPress={() => handleNextStatus(task)}
            style={[styles.advanceBtn, { backgroundColor: roleColor + '12', borderColor: roleColor + '28' }]}
          >
            <Ionicons name="arrow-forward" size={13} color={roleColor} />
            <Text style={[styles.advanceBtnText, { color: roleColor }]}>Advance to next stage</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function renderActionItemCard(item: ActionItem) {
    const urgency = ACTION_URGENCY_META[getActionItemUrgency(item.targetDate)];
    const status = ACTION_STATUS_META[item.status];
    const canUpdate = canUpdateActionItem(item);
    return (
      <View key={item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: item.status === 'closed' ? colors.border : urgency.color + '55' }]}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <View style={[styles.badge, { backgroundColor: status.bg }]}>
            <Ionicons name={status.icon as any} size={10} color={status.color} />
            <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: urgency.bg }]}>
            <Text style={[styles.badgeText, { color: urgency.color }]}>{urgency.label}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {item.status === 'closed' && <Ionicons name="lock-closed-outline" size={15} color={colors.textSubtle} />}
        </View>

        <Text style={[styles.cardTitle, { color: colors.text, opacity: item.status === 'closed' ? 0.65 : 1 }]} numberOfLines={2}>
          {item.title}
        </Text>
        {!!item.desc && <Text style={[styles.cardDesc, { color: colors.textMuted }]} numberOfLines={3}>{item.desc}</Text>}

        <View style={[styles.actionMetaBox, { backgroundColor: urgency.bg + '80', borderColor: urgency.color + '35' }]}>
          <View style={styles.actionMetaLine}>
            <Ionicons name="person-outline" size={12} color={urgency.color} />
            <Text style={[styles.metaText, { color: colors.text }]}>Action party: <Text style={{ fontWeight: '700' }}>{item.actionPartyName}</Text></Text>
          </View>
          <View style={styles.actionMetaLine}>
            <Ionicons name="business-outline" size={12} color={urgency.color} />
            <Text style={[styles.metaText, { color: colors.text }]}>{item.branchName}</Text>
          </View>
          <View style={styles.actionMetaLine}>
            <Ionicons name="calendar-outline" size={12} color={urgency.color} />
            <Text style={[styles.metaText, { color: urgency.color, fontWeight: '700' }]}>Target close: {fmtDate(item.targetDate)}</Text>
          </View>
        </View>

        {item.status === 'closed' ? (
          <View style={styles.lockedRow}>
            <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.metaText, { color: colors.textMuted }]}>
              Locked by {item.closedBy ?? 'user'} · archived {item.closedAt ? fmtDate(item.closedAt) : ''}
            </Text>
          </View>
        ) : canUpdate ? (
          <View style={styles.statusBtns}>
            {(['open', 'on-going', 'closed'] as ActionItemStatus[]).map(nextStatus => {
              const meta = ACTION_STATUS_META[nextStatus];
              const active = item.status === nextStatus;
              return (
                <TouchableOpacity
                  key={nextStatus}
                  onPress={() => !active && handleActionStatus(item, nextStatus)}
                  style={[styles.statusBtn, { backgroundColor: active ? meta.color : colors.background, borderColor: active ? meta.color : colors.border }]}
                >
                  <Text style={[styles.statusBtnText, { color: active ? '#fff' : colors.textMuted }]}>{meta.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.lockedRow}>
            <Ionicons name="information-circle-outline" size={13} color={colors.textSubtle} />
            <Text style={[styles.metaText, { color: colors.textMuted }]}>Only the action party or CEO can update this item.</Text>
          </View>
        )}
      </View>
    );
  }

  function renderActionItems() {
    const activeItems = visibleActionItems.filter(item => item.status !== 'closed');
    if (!visibleActionItems.length) {
      return (
        <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name={actionView === 'archived' ? 'archive-outline' : 'flash-outline'} size={36} color={colors.textSubtle} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {actionView === 'archived' ? 'No closed action items in this branch archive' : 'No open action items yet'}
          </Text>
          {actionView === 'active' && (
            <TouchableOpacity onPress={openActionForm} style={[styles.emptyAction, { backgroundColor: roleColor }]}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Add Action Item</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (actionView === 'archived') {
      const groups = Array.from(new Set(visibleActionItems.map(item => item.branchId)));
      return (
        <>
          {groups.map(groupBranchId => {
            const group = visibleActionItems.filter(item => item.branchId === groupBranchId);
            return (
              <View key={groupBranchId} style={{ marginBottom: 4 }}>
                <View style={styles.groupHeader}>
                  <Ionicons name="archive-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.groupLabel, { color: colors.textMuted }]}>{group[0]?.branchName ?? groupBranchId} · {group.length}</Text>
                </View>
                {group.map(renderActionItemCard)}
              </View>
            );
          })}
        </>
      );
    }

    return (
      <>
        {(['open', 'on-going'] as ActionItemStatus[]).map(statusValue => {
          const group = activeItems.filter(item => item.status === statusValue);
          if (!group.length) return null;
          const meta = ACTION_STATUS_META[statusValue];
          return (
            <View key={statusValue} style={{ marginBottom: 4 }}>
              <View style={styles.groupHeader}>
                <View style={[styles.groupDot, { backgroundColor: meta.color }]} />
                <Text style={[styles.groupLabel, { color: meta.color }]}>{meta.label} · {group.length}</Text>
              </View>
              {group.map(renderActionItemCard)}
            </View>
          );
        })}
      </>
    );
  }

  function renderKpiCard(kpi: KPI) {
    const ac = ROLE_COLORS[kpi.assignedTo] || colors.primary;
    return (
      <View key={kpi.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{kpi.title}</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <View style={[styles.kpiTargetBox, { backgroundColor: ac + '12' }]}>
                <Ionicons name="flag" size={11} color={ac} />
                <Text style={[styles.kpiTargetVal, { color: ac }]}>{kpi.target} {kpi.unit}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.background }]}>
                <Ionicons name="refresh-outline" size={10} color={colors.textMuted} />
                <Text style={[styles.badgeText, { color: colors.textMuted }]}>{kpi.period}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="person-outline" size={12} color={colors.textSubtle} />
              <Text style={[styles.metaText, { color: colors.textMuted }]}>{kpi.assignedToName}</Text>
            </View>
          </View>
          {isCeo && (
            <TouchableOpacity
              onPress={() => handleDeleteKpi(kpi)}
              style={[styles.iconBtn, { borderColor: colors.errorBorder, backgroundColor: colors.errorBg }]}
            >
              <Ionicons name="trash-outline" size={12} color={colors.error} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  function renderCadenceFilter() {
    const taskList = tab === 'mine' ? myTasksAll : assignedByAll;
    const counts: Record<string, number> = { all: taskList.length };
    for (const c of ['daily', 'weekly', 'monthly', 'quarterly'] as TaskCadence[]) {
      counts[c] = taskList.filter(t => t.cadence === c).length;
    }
    return (
      <View style={styles.filterRow}>
        {CADENCE_FILTERS.map(f => {
          const active = cadenceFilter === f.id;
          const cm = f.id !== 'all' ? CADENCE_META[f.id as TaskCadence] : null;
          const fColor = cm ? cm.color : roleColor;
          return (
            <TouchableOpacity
              key={f.id}
              onPress={() => setCadenceFilter(f.id)}
              style={[styles.filterPill, {
                backgroundColor: active ? fColor : colors.surface,
                borderColor: active ? fColor : colors.border,
              }]}
            >
              {cm && <Ionicons name={cm.icon as any} size={11} color={active ? '#fff' : fColor} />}
              <Text style={[styles.filterPillText, { color: active ? '#fff' : colors.textMuted }]}>
                {f.label}
              </Text>
              <Text style={[styles.filterCount, { color: active ? 'rgba(255,255,255,0.8)' : colors.textSubtle }]}>
                {counts[f.id] ?? 0}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  function renderGrouped(list: Task[], isAssignedToMe: boolean) {
    if (list.length === 0) {
      return (
        <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name={isAssignedToMe ? 'checkmark-done-circle-outline' : 'list-circle-outline'} size={36} color={colors.textSubtle} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {cadenceFilter === 'all'
              ? (isAssignedToMe ? 'No tasks assigned to you' : "You haven't assigned any tasks yet")
              : `No ${cadenceFilter} tasks`}
          </Text>
          {!isAssignedToMe && canAssign && (
            <TouchableOpacity onPress={openTaskForm} style={[styles.emptyAction, { backgroundColor: roleColor }]}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Assign a Task</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }
    return (
      <>
        {(['commenced', 'progressing', 'completed'] as TaskStatus[]).map(s => {
          const group = list.filter(t => t.status === s);
          if (!group.length) return null;
          const sm = STATUS_META[s];
          return (
            <View key={s} style={{ marginBottom: 4 }}>
              <View style={styles.groupHeader}>
                <View style={[styles.groupDot, { backgroundColor: sm.color }]} />
                <Text style={[styles.groupLabel, { color: sm.color }]}>{sm.label} · {group.length}</Text>
              </View>
              {group.map(t => renderTaskCard(t, isAssignedToMe))}
            </View>
          );
        })}
      </>
    );
  }

  const showAddBtn = tab === 'kpis' ? isCeo : tab === 'action-items' ? !!role : canAssign;

  return (
    <ScreenLayout
      title="Tasks & KPIs"
      rightAction={showAddBtn ? (
        <TouchableOpacity onPress={tab === 'kpis' ? openKpiForm : tab === 'action-items' ? openActionForm : openTaskForm} style={styles.headerBtn}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      ) : undefined}
    >
      {/* Main tabs */}
      <View style={styles.tabRow}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.id}
            onPress={() => setTab(t.id)}
            style={[styles.tabBtn, { borderBottomColor: tab === t.id ? roleColor : 'transparent', borderBottomWidth: 2 }]}
          >
            <Text style={[styles.tabLabel, { color: tab === t.id ? roleColor : colors.textMuted, fontWeight: tab === t.id ? '700' : '500' }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Cadence filter (tasks tabs only) */}
      {tab !== 'kpis' && tab !== 'action-items' && renderCadenceFilter()}
      {tab === 'action-items' && (
        <View style={styles.actionToolbar}>
          <View style={styles.actionViewRow}>
            {(['active', 'archived'] as ActionView[]).map(view => (
              <TouchableOpacity
                key={view}
                onPress={() => setActionView(view)}
                style={[styles.filterPill, {
                  backgroundColor: actionView === view ? roleColor : colors.surface,
                  borderColor: actionView === view ? roleColor : colors.border,
                }]}
              >
                <Ionicons name={view === 'active' ? 'flash-outline' : 'archive-outline'} size={12} color={actionView === view ? '#fff' : colors.textMuted} />
                <Text style={[styles.filterPillText, { color: actionView === view ? '#fff' : colors.textMuted }]}>
                  {view === 'active' ? 'Open items' : 'Branch archive'}
                </Text>
                <Text style={[styles.filterCount, { color: actionView === view ? 'rgba(255,255,255,0.8)' : colors.textSubtle }]}>
                  {actionItems.filter(item => view === 'archived' ? item.status === 'closed' : item.status !== 'closed').length}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branchFilterRow}>
            <TouchableOpacity
              onPress={() => setActionBranchFilter('all')}
              style={[styles.branchPill, { backgroundColor: actionBranchFilter === 'all' ? roleColor + '15' : colors.surface, borderColor: actionBranchFilter === 'all' ? roleColor : colors.border }]}
            >
              <Text style={[styles.branchPillText, { color: actionBranchFilter === 'all' ? roleColor : colors.textMuted }]}>All branches</Text>
            </TouchableOpacity>
            {availableBranches.map(branch => (
              <TouchableOpacity
                key={branch.id}
                onPress={() => setActionBranchFilter(branch.id)}
                style={[styles.branchPill, { backgroundColor: actionBranchFilter === branch.id ? roleColor + '15' : colors.surface, borderColor: actionBranchFilter === branch.id ? roleColor : colors.border }]}
              >
                <Text style={[styles.branchPillText, { color: actionBranchFilter === branch.id ? roleColor : colors.textMuted }]} numberOfLines={1}>{branch.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === 'mine'     && renderGrouped(myTasks, true)}
        {tab === 'assigned' && renderGrouped(assignedBy, false)}
        {tab === 'action-items' && renderActionItems()}
        {tab === 'kpis' && (
          <>
            {/* Role summary chips */}
            <View style={styles.kpiChipRow}>
              {(['mgr', 'acc', 'csm', 'mktg', 'att'] as const).map(r => {
                const count = kpis.filter(k => k.assignedTo === r).length;
                if (!count) return null;
                const c = ROLE_COLORS[r] || colors.primary;
                return (
                  <View key={r} style={[styles.kpiChip, { backgroundColor: c + '15', borderColor: c + '30' }]}>
                    <Text style={[styles.kpiChipText, { color: c }]}>{ROLE_LABELS[r].split(' ')[0]}</Text>
                    <Text style={[styles.kpiChipCount, { color: c }]}>{count}</Text>
                  </View>
                );
              })}
            </View>
            {kpis.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="analytics-outline" size={36} color={colors.textSubtle} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No KPIs set yet</Text>
                <TouchableOpacity onPress={openKpiForm} style={[styles.emptyAction, { backgroundColor: roleColor }]}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Add KPI</Text>
                </TouchableOpacity>
              </View>
            ) : kpis.map(k => renderKpiCard(k))}
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Assign Task Modal ── */}
      <ModalSheet visible={showTaskForm} onClose={() => setShowTaskForm(false)}>
          <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Assign Task</Text>

            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="Task title *" placeholderTextColor={colors.textSubtle}
              value={taskForm.title} onChangeText={v => setTaskForm(f => ({ ...f, title: v }))}
            />
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="Description (optional)" placeholderTextColor={colors.textSubtle}
              multiline numberOfLines={3} value={taskForm.desc}
              onChangeText={v => setTaskForm(f => ({ ...f, desc: v }))}
            />

            {/* Cadence */}
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Cadence *</Text>
            <View style={styles.chipRow}>
              {(['daily', 'weekly', 'monthly', 'quarterly'] as TaskCadence[]).map(c => {
                const cm = CADENCE_META[c];
                const active = taskForm.cadence === c;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setTaskForm(f => ({ ...f, cadence: c }))}
                    style={[styles.cadenceChip, { backgroundColor: active ? cm.color : colors.surface, borderColor: active ? cm.color : colors.border }]}
                  >
                    <Ionicons name={cm.icon as any} size={13} color={active ? '#fff' : cm.color} />
                    <Text style={[styles.chipText, { color: active ? '#fff' : colors.textMuted }]}>{cm.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Priority */}
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Priority</Text>
            <View style={styles.chipRow}>
              {(['High', 'Medium', 'Low'] as TaskPriority[]).map(p => {
                const pm = PRI_META[p];
                const active = taskForm.priority === p;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setTaskForm(f => ({ ...f, priority: p }))}
                    style={[styles.chip, { backgroundColor: active ? pm.bg : colors.surface, borderColor: active ? pm.color : colors.border }]}
                  >
                    <Text style={[styles.chipText, { color: active ? pm.color : colors.textMuted }]}>{p}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Target */}
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Target (optional)</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="Value (e.g. 5000000)" placeholderTextColor={colors.textSubtle}
                keyboardType="default" value={taskForm.target}
                onChangeText={v => setTaskForm(f => ({ ...f, target: v }))}
              />
              <TextInput
                style={[styles.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="Unit (e.g. ₦, %)" placeholderTextColor={colors.textSubtle}
                value={taskForm.targetUnit}
                onChangeText={v => setTaskForm(f => ({ ...f, targetUnit: v }))}
              />
            </View>

            {/* Due date */}
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="Completion date (YYYY-MM-DD)" placeholderTextColor={colors.textSubtle}
              value={taskForm.dueDate} onChangeText={v => setTaskForm(f => ({ ...f, dueDate: v }))}
            />

            {/* Assign to */}
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Assign to *</Text>
            {assignableRoles.map(r => {
              const resolved = resolveUserInfo(r, userAccounts);
              const rc = ROLE_COLORS[r] || colors.primary;
              const active = taskForm.assignedTo === r;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setTaskForm(f => ({ ...f, assignedTo: r }))}
                  style={[styles.assigneeRow, { backgroundColor: active ? rc + '10' : colors.surface, borderColor: active ? rc : colors.border }]}
                >
                  <View style={[styles.assigneeAvatar, { backgroundColor: active ? rc : colors.textSubtle }]}>
                    <Text style={styles.assigneeAvatarText}>{resolved.initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.assigneeName, { color: active ? rc : colors.text }]}>{resolved.name}</Text>
                    <Text style={[styles.assigneeRole, { color: colors.textMuted }]}>{ROLE_LABELS[r] ?? r}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={18} color={rc} />}
                </TouchableOpacity>
              );
            })}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 32 }}>
              <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleAssignTask}>
                <Text style={styles.submitBtnText}>Assign Task</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setShowTaskForm(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
      </ModalSheet>

      {/* ── Add Action Item Modal ── */}
      <ModalSheet visible={showActionForm} onClose={() => setShowActionForm(false)}>
        <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          <Text style={[styles.sheetTitle, { color: colors.text }]}>Add Action Item</Text>
          <Text style={[styles.sheetIntro, { color: colors.textMuted }]}>
            Assign a clear follow-up to a person. The assigned action party or CEO can update it; closing locks it in the branch archive.
          </Text>

          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            placeholder="Action item title *" placeholderTextColor={colors.textSubtle}
            value={actionForm.title} onChangeText={value => setActionForm(form => ({ ...form, title: value }))}
          />
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            placeholder="Description or expected outcome (optional)" placeholderTextColor={colors.textSubtle}
            multiline numberOfLines={3} value={actionForm.desc}
            onChangeText={value => setActionForm(form => ({ ...form, desc: value }))}
          />

          <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Action party *</Text>
          {actionPartyOptions.map(option => {
            const optionRole = option.role as any;
            const optionName = option.empName;
            const optionId = option.id || undefined;
            const optionColor = ROLE_COLORS[optionRole] || colors.primary;
            const active = actionForm.actionPartyId === optionId
              && actionForm.actionPartyRole === optionRole;
            const fallbackActive = !optionId && !actionForm.actionPartyId && actionForm.actionPartyRole === optionRole;
            return (
              <TouchableOpacity
                key={`${optionRole}-${optionId ?? 'role'}`}
                onPress={() => setActionForm(form => ({
                  ...form,
                  actionPartyId: optionId ?? null,
                  actionPartyRole: optionRole,
                  actionPartyName: optionName,
                }))}
                style={[styles.assigneeRow, { backgroundColor: (active || fallbackActive) ? optionColor + '10' : colors.surface, borderColor: (active || fallbackActive) ? optionColor : colors.border }]}
              >
                <View style={[styles.assigneeAvatar, { backgroundColor: (active || fallbackActive) ? optionColor : colors.textSubtle }]}>
                  <Text style={styles.assigneeAvatarText}>{resolveUserInfo(optionRole, userAccounts).initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.assigneeName, { color: (active || fallbackActive) ? optionColor : colors.text }]}>{optionName}</Text>
                  <Text style={[styles.assigneeRole, { color: colors.textMuted }]}>{ROLE_LABELS[optionRole] ?? optionRole}</Text>
                </View>
                {(active || fallbackActive) && <Ionicons name="checkmark-circle" size={18} color={optionColor} />}
              </TouchableOpacity>
            );
          })}

          <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Target close date *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSubtle}
            value={actionForm.targetDate} onChangeText={value => setActionForm(form => ({ ...form, targetDate: value }))}
          />
          <Text style={[styles.fieldHint, { color: colors.textSubtle }]}>Past dates show red · within 14 days shows yellow · later dates show green.</Text>

          <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Branch archive *</Text>
          {availableBranches.length === 0 ? (
            <Text style={[styles.fieldHint, { color: colors.error }]}>No active branch is available for this account.</Text>
          ) : (
            <View style={styles.chipRow}>
              {availableBranches.map(branch => {
                const active = actionForm.branchId === branch.id;
                return (
                  <TouchableOpacity
                    key={branch.id}
                    onPress={() => setActionForm(form => ({ ...form, branchId: branch.id }))}
                    style={[styles.chip, { backgroundColor: active ? roleColor + '18' : colors.surface, borderColor: active ? roleColor : colors.border }]}
                  >
                    <Ionicons name="business-outline" size={13} color={active ? roleColor : colors.textMuted} />
                    <Text style={[styles.chipText, { color: active ? roleColor : colors.textMuted }]}>{branch.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 32 }}>
            <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleAddActionItem}>
              <Text style={styles.submitBtnText}>Add Action Item</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setShowActionForm(false)}>
              <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </ModalSheet>

      {/* ── Add KPI Modal (CEO only) ── */}
      <ModalSheet visible={showKpiForm} onClose={() => setShowKpiForm(false)}>
          <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Set KPI / Target</Text>

            {[
              { key: 'title',  label: 'KPI Title *' },
              { key: 'target', label: 'Target value (e.g. 15000000)' },
              { key: 'unit',   label: 'Unit (e.g. ₦, %, hours)' },
            ].map(f => (
              <TextInput
                key={f.key}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder={f.label} placeholderTextColor={colors.textSubtle}
                value={(kpiForm as any)[f.key]}
                onChangeText={v => setKpiForm(frm => ({ ...frm, [f.key]: v }))}
              />
            ))}

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Period</Text>
            <View style={styles.chipRow}>
              {KPI_PERIODS.map(p => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setKpiForm(f => ({ ...f, period: p }))}
                  style={[styles.chip, { backgroundColor: kpiForm.period === p ? roleColor + '18' : colors.surface, borderColor: kpiForm.period === p ? roleColor : colors.border }]}
                >
                  <Text style={[styles.chipText, { color: kpiForm.period === p ? roleColor : colors.textMuted }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Assign to *</Text>
            {(['md', 'mktg', 'csm', 'acc', 'mgr', 'att'] as const).filter(r => r !== role).map(r => {
              const resolved = resolveUserInfo(r, userAccounts);
              const rc = ROLE_COLORS[r] || colors.primary;
              const active = kpiForm.assignedTo === r;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setKpiForm(f => ({ ...f, assignedTo: r, assignedToName: resolved.name }))}
                  style={[styles.assigneeRow, { backgroundColor: active ? rc + '10' : colors.surface, borderColor: active ? rc : colors.border }]}
                >
                  <View style={[styles.assigneeAvatar, { backgroundColor: active ? rc : colors.textSubtle }]}>
                    <Text style={styles.assigneeAvatarText}>{resolved.initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.assigneeName, { color: active ? rc : colors.text }]}>{resolved.name}</Text>
                    <Text style={[styles.assigneeRole, { color: colors.textMuted }]}>{ROLE_LABELS[r] ?? r}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={18} color={rc} />}
                </TouchableOpacity>
              );
            })}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 32 }}>
              <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleAddKpi}>
                <Text style={styles.submitBtnText}>Set KPI</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setShowKpiForm(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
      </ModalSheet>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  tabRow: { paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e3' },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  tabLabel: { fontSize: 13 },
  filterRow: { paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e3' },
  filterPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  filterPillText: { fontSize: 12, fontWeight: '600' },
  filterCount: { fontSize: 11, fontWeight: '700' },
  actionToolbar: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e3' },
  actionViewRow: { paddingHorizontal: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 7 },
  branchFilterRow: { paddingHorizontal: 14, gap: 6 },
  branchPill: { maxWidth: 180, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 18, borderWidth: 1 },
  branchPillText: { fontSize: 11, fontWeight: '600' },
  scroll: { padding: 16 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginTop: 4 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  cardDesc: { fontSize: 12, lineHeight: 17 },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, flexWrap: 'wrap' },
  targetLabel: { fontSize: 11, fontWeight: '600' },
  targetVal: { fontSize: 12, fontWeight: '800' },
  targetDivider: { width: 1, height: 12, marginHorizontal: 2 },
  targetDue: { fontSize: 11 },
  metaText: { fontSize: 11 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  actionMetaBox: { borderRadius: 10, borderWidth: 1, padding: 9, gap: 5 },
  actionMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  iconBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  statusBtns: { flexDirection: 'row', gap: 6 },
  statusBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  statusBtnText: { fontSize: 11, fontWeight: '600' },
  advanceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  advanceBtnText: { fontSize: 12, fontWeight: '600' },
  emptyBox: { alignItems: 'center', gap: 10, padding: 32, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed' },
  emptyText: { fontSize: 14, textAlign: 'center' },
  emptyAction: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  kpiChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  kpiChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  kpiChipText: { fontSize: 11, fontWeight: '600' },
  kpiChipCount: { fontSize: 12, fontWeight: '800' },
  kpiTargetBox: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  kpiTargetVal: { fontSize: 14, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 24, maxHeight: '90%' },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  sheetIntro: { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 10 },
  textArea: { height: 80, textAlignVertical: 'top' },
  inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  fieldHint: { fontSize: 11, lineHeight: 16, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  cadenceChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '600' },
  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  assigneeAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  assigneeAvatarText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  assigneeName: { fontSize: 13, fontWeight: '600' },
  assigneeRole: { fontSize: 11, marginTop: 1 },
  headerBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  submitBtn: { alignItems: 'center', paddingVertical: 13, borderRadius: 12 },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#e5e5e3' },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
});
