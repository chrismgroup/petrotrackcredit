import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { KPI, ROLE_COLORS, ROLE_LABELS, TASK_CAN_ASSIGN, Task, TaskPriority, TaskStatus, UINFO, fmtDate, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type TabId = 'mine' | 'assigned' | 'kpis';

const STATUS_META: Record<TaskStatus, { label: string; color: string; bg: string; icon: string }> = {
  commenced:  { label: 'Commenced',  color: '#185FA5', bg: '#E6F1FB', icon: 'play-circle'       },
  progressing:{ label: 'Progressing',color: '#BA7517', bg: '#FAEEDA', icon: 'time'              },
  completed:  { label: 'Completed',  color: '#27500A', bg: '#EAF3DE', icon: 'checkmark-circle'  },
};

const PRI_META: Record<TaskPriority, { color: string; bg: string }> = {
  High:   { color: '#791F1F', bg: '#FCEBEB' },
  Medium: { color: '#BA7517', bg: '#FAEEDA' },
  Low:    { color: '#27500A', bg: '#EAF3DE' },
};

const PERIODS = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual', 'Per request'];

export default function TasksScreen() {
  const { role, userName, tasks, kpis, addTask, updateTaskStatus, deleteTask, addKpi, deleteKpi } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'md'] || colors.primary;
  const isMd = role === 'md';

  const [tab, setTab] = useState<TabId>('mine');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showKpiForm, setShowKpiForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', desc: '', assignedTo: '' as string, priority: 'Medium' as TaskPriority, dueDate: '' });
  const [kpiForm, setKpiForm] = useState({ title: '', target: '', unit: '', period: 'Monthly', assignedTo: '' as string, assignedToName: '' });

  const assignableRoles: string[] = role ? TASK_CAN_ASSIGN[role] ?? [] : [];
  const canAssign = assignableRoles.length > 0;
  const myTasks = tasks.filter(t => t.assignedTo === role);
  const assignedByMe = tasks.filter(t => t.assignedBy === role);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'mine', label: `My Tasks (${myTasks.length})` },
    { id: 'assigned', label: `Assigned (${assignedByMe.length})` },
    ...(isMd ? [{ id: 'kpis' as TabId, label: `KPIs (${kpis.length})` }] : []),
  ];

  function handleAssignTask() {
    if (!role || !taskForm.title || !taskForm.assignedTo) {
      Alert.alert('Required', 'Title and assignee are required.'); return;
    }
    const info = UINFO[taskForm.assignedTo];
    addTask({
      title: taskForm.title, desc: taskForm.desc,
      assignedBy: role, assignedByName: userName,
      assignedTo: taskForm.assignedTo as any,
      assignedToName: info?.name ?? taskForm.assignedTo,
      status: 'commenced', priority: taskForm.priority,
      dueDate: taskForm.dueDate,
    });
    setTaskForm({ title: '', desc: '', assignedTo: '', priority: 'Medium', dueDate: '' });
    setShowTaskForm(false);
  }

  function handleAddKpi() {
    if (!kpiForm.title || !kpiForm.assignedTo) {
      Alert.alert('Required', 'Title and assignee are required.'); return;
    }
    addKpi({
      title: kpiForm.title, target: kpiForm.target, unit: kpiForm.unit,
      period: kpiForm.period, assignedTo: kpiForm.assignedTo as any,
      assignedToName: UINFO[kpiForm.assignedTo]?.name ?? kpiForm.assignedTo,
    });
    setKpiForm({ title: '', target: '', unit: '', period: 'Monthly', assignedTo: '', assignedToName: '' });
    setShowKpiForm(false);
  }

  function handleNextStatus(task: Task) {
    const order: TaskStatus[] = ['commenced', 'progressing', 'completed'];
    const idx = order.indexOf(task.status);
    if (idx < order.length - 1) {
      const next = order[idx + 1];
      Alert.alert(
        'Update Status',
        `Mark as "${STATUS_META[next].label}"?`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: () => updateTaskStatus(task.id, next) }]
      );
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

  function renderTaskCard(task: Task, isOwn: boolean) {
    const sm = STATUS_META[task.status];
    const pm = PRI_META[task.priority];
    const isCompleted = task.status === 'completed';
    return (
      <View key={task.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <View style={[styles.badge, { backgroundColor: pm.bg }]}>
                <Text style={[styles.badgeText, { color: pm.color }]}>{task.priority}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: sm.bg }]}>
                <Ionicons name={sm.icon as any} size={10} color={sm.color} />
                <Text style={[styles.badgeText, { color: sm.color }]}>{sm.label}</Text>
              </View>
            </View>
            <Text style={[styles.cardTitle, { color: colors.text, opacity: isCompleted ? 0.55 : 1 }]} numberOfLines={2}>
              {task.title}
            </Text>
            <Text style={[styles.cardDesc, { color: colors.textMuted }]} numberOfLines={2}>{task.desc}</Text>
          </View>
          {(isOwn ? task.assignedBy === role : false) && (
            <TouchableOpacity onPress={() => handleDeleteTask(task)} style={[styles.iconBtn, { borderColor: colors.errorBorder, backgroundColor: colors.errorBg }]}>
              <Ionicons name="trash-outline" size={13} color={colors.error} />
            </TouchableOpacity>
          )}
          {!isOwn && (
            <TouchableOpacity onPress={() => handleDeleteTask(task)} style={[styles.iconBtn, { borderColor: colors.errorBorder, backgroundColor: colors.errorBg }]}>
              <Ionicons name="trash-outline" size={13} color={colors.error} />
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.cardMeta, { borderTopColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name={isOwn ? 'person-outline' : 'arrow-forward-circle-outline'} size={12} color={colors.textSubtle} />
            <Text style={[styles.metaText, { color: colors.textMuted }]}>
              {isOwn ? `From: ${task.assignedByName}` : `To: ${task.assignedToName}`}
            </Text>
          </View>
          {task.dueDate ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="calendar-outline" size={12} color={colors.textSubtle} />
              <Text style={[styles.metaText, { color: colors.textMuted }]}>Due: {fmtDate(task.dueDate)}</Text>
            </View>
          ) : null}
        </View>

        {isOwn && !isCompleted && (
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

        {!isOwn && task.status !== 'completed' && (
          <TouchableOpacity
            onPress={() => handleNextStatus(task)}
            style={[styles.advanceBtn, { backgroundColor: roleColor + '15', borderColor: roleColor + '30' }]}
          >
            <Ionicons name="arrow-forward" size={13} color={roleColor} />
            <Text style={[styles.advanceBtnText, { color: roleColor }]}>Advance to next stage</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function renderKpiCard(kpi: KPI) {
    const assigneeColor = ROLE_COLORS[kpi.assignedTo] || colors.primary;
    return (
      <View key={kpi.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{kpi.title}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
              <View style={[styles.kpiTargetBox, { backgroundColor: assigneeColor + '12' }]}>
                <Text style={[styles.kpiTargetVal, { color: assigneeColor }]}>{kpi.target} {kpi.unit}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.background }]}>
                <Text style={[styles.badgeText, { color: colors.textMuted }]}>{kpi.period}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Ionicons name="person-outline" size={12} color={colors.textSubtle} />
              <Text style={[styles.metaText, { color: colors.textMuted }]}>{kpi.assignedToName}</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => handleDeleteKpi(kpi)}
            style={[styles.iconBtn, { borderColor: colors.errorBorder, backgroundColor: colors.errorBg }]}
          >
            <Ionicons name="trash-outline" size={13} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const rightAction = (
    <TouchableOpacity
      onPress={() => tab === 'kpis' ? setShowKpiForm(true) : setShowTaskForm(true)}
      style={styles.headerBtn}
    >
      <Ionicons name="add" size={20} color="#fff" />
    </TouchableOpacity>
  );

  const showRightAction = tab === 'kpis' || (tab !== 'mine' && canAssign) || (tab === 'mine' && canAssign);

  return (
    <ScreenLayout title="Tasks & KPIs" rightAction={canAssign || isMd ? rightAction : undefined}>
      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabRow}>
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
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === 'mine' && (
          <>
            {myTasks.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="checkmark-done-circle-outline" size={36} color={colors.textSubtle} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No tasks assigned to you</Text>
              </View>
            ) : (
              <>
                {(['commenced', 'progressing', 'completed'] as TaskStatus[]).map(s => {
                  const group = myTasks.filter(t => t.status === s);
                  if (!group.length) return null;
                  const sm = STATUS_META[s];
                  return (
                    <View key={s} style={{ marginBottom: 4 }}>
                      <View style={styles.groupHeader}>
                        <View style={[styles.groupDot, { backgroundColor: sm.color }]} />
                        <Text style={[styles.groupLabel, { color: sm.color }]}>{sm.label} · {group.length}</Text>
                      </View>
                      {group.map(t => renderTaskCard(t, true))}
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}

        {tab === 'assigned' && (
          <>
            {assignedByMe.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="list-circle-outline" size={36} color={colors.textSubtle} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>You haven't assigned any tasks yet</Text>
                {canAssign && (
                  <TouchableOpacity onPress={() => setShowTaskForm(true)} style={[styles.emptyAction, { backgroundColor: roleColor }]}>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Assign a Task</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <>
                {(['commenced', 'progressing', 'completed'] as TaskStatus[]).map(s => {
                  const group = assignedByMe.filter(t => t.status === s);
                  if (!group.length) return null;
                  const sm = STATUS_META[s];
                  return (
                    <View key={s} style={{ marginBottom: 4 }}>
                      <View style={styles.groupHeader}>
                        <View style={[styles.groupDot, { backgroundColor: sm.color }]} />
                        <Text style={[styles.groupLabel, { color: sm.color }]}>{sm.label} · {group.length}</Text>
                      </View>
                      {group.map(t => renderTaskCard(t, false))}
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}

        {tab === 'kpis' && (
          <>
            {/* Summary chips */}
            <View style={styles.kpiSummaryRow}>
              {['mgr', 'acc', 'csm', 'mktg', 'att'].map(r => {
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
                <TouchableOpacity onPress={() => setShowKpiForm(true)} style={[styles.emptyAction, { backgroundColor: roleColor }]}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Add KPI</Text>
                </TouchableOpacity>
              </View>
            ) : (
              kpis.map(k => renderKpiCard(k))
            )}
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Assign Task Modal */}
      <Modal visible={showTaskForm} transparent animationType="slide" onRequestClose={() => setShowTaskForm(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowTaskForm(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]} onStartShouldSetResponder={() => true}>
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
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="Due date (YYYY-MM-DD)" placeholderTextColor={colors.textSubtle}
              value={taskForm.dueDate} onChangeText={v => setTaskForm(f => ({ ...f, dueDate: v }))}
            />

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Priority</Text>
            <View style={styles.chipRow}>
              {(['High', 'Medium', 'Low'] as TaskPriority[]).map(p => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setTaskForm(f => ({ ...f, priority: p }))}
                  style={[styles.chip, {
                    backgroundColor: taskForm.priority === p ? PRI_META[p].bg : colors.surface,
                    borderColor: taskForm.priority === p ? PRI_META[p].color : colors.border,
                  }]}
                >
                  <Text style={[styles.chipText, { color: taskForm.priority === p ? PRI_META[p].color : colors.textMuted }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Assign to *</Text>
            <View style={styles.chipRow}>
              {assignableRoles.map(r => {
                const info = UINFO[r];
                const rc = ROLE_COLORS[r] || colors.primary;
                const active = taskForm.assignedTo === r;
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setTaskForm(f => ({ ...f, assignedTo: r }))}
                    style={[styles.assigneeChip, { backgroundColor: active ? rc + '18' : colors.surface, borderColor: active ? rc : colors.border }]}
                  >
                    <View style={[styles.assigneeAvatar, { backgroundColor: active ? rc : colors.textSubtle }]}>
                      <Text style={styles.assigneeAvatarText}>{info?.initials ?? r.slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <View>
                      <Text style={[styles.assigneeName, { color: active ? rc : colors.text }]}>{info?.name ?? r}</Text>
                      <Text style={[styles.assigneeRole, { color: colors.textMuted }]}>{ROLE_LABELS[r] ?? r}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleAssignTask}>
                <Text style={styles.submitBtnText}>Assign Task</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setShowTaskForm(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add KPI Modal (MD only) */}
      <Modal visible={showKpiForm} transparent animationType="slide" onRequestClose={() => setShowKpiForm(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowKpiForm(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Set KPI / Target</Text>

            {[
              { key: 'title', label: 'KPI Title *' },
              { key: 'target', label: 'Target value (e.g. 15000000)' },
              { key: 'unit', label: 'Unit (e.g. ₦, %, hours)' },
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {PERIODS.map(p => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setKpiForm(f => ({ ...f, period: p }))}
                    style={[styles.chip, {
                      backgroundColor: kpiForm.period === p ? roleColor + '18' : colors.surface,
                      borderColor: kpiForm.period === p ? roleColor : colors.border,
                    }]}
                  >
                    <Text style={[styles.chipText, { color: kpiForm.period === p ? roleColor : colors.textMuted }]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Assign to *</Text>
            <View style={styles.chipRow}>
              {(['md', 'mktg', 'csm', 'acc', 'mgr', 'att'] as const).map(r => {
                const info = UINFO[r];
                const rc = ROLE_COLORS[r] || colors.primary;
                const active = kpiForm.assignedTo === r;
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setKpiForm(f => ({ ...f, assignedTo: r, assignedToName: info?.name ?? r }))}
                    style={[styles.assigneeChip, { backgroundColor: active ? rc + '18' : colors.surface, borderColor: active ? rc : colors.border }]}
                  >
                    <View style={[styles.assigneeAvatar, { backgroundColor: active ? rc : colors.textSubtle }]}>
                      <Text style={styles.assigneeAvatarText}>{info?.initials ?? r.slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <View>
                      <Text style={[styles.assigneeName, { color: active ? rc : colors.text }]}>{info?.name ?? r}</Text>
                      <Text style={[styles.assigneeRole, { color: colors.textMuted }]}>{ROLE_LABELS[r] ?? r}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleAddKpi}>
                <Text style={styles.submitBtnText}>Set KPI</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setShowKpiForm(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  tabScroll: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e3' },
  tabRow: { paddingHorizontal: 16, flexDirection: 'row', gap: 4 },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  tabLabel: { fontSize: 13 },
  scroll: { padding: 16 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginTop: 4 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 10 },
  cardTop: { flexDirection: 'row', gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  cardDesc: { fontSize: 12, lineHeight: 17 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  metaText: { fontSize: 11 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  iconBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
  statusBtns: { flexDirection: 'row', gap: 6 },
  statusBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  statusBtnText: { fontSize: 11, fontWeight: '600' },
  advanceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  advanceBtnText: { fontSize: 12, fontWeight: '600' },
  emptyBox: { alignItems: 'center', gap: 10, padding: 32, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed' },
  emptyText: { fontSize: 14, textAlign: 'center' },
  emptyAction: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  kpiSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  kpiChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  kpiChipText: { fontSize: 11, fontWeight: '600' },
  kpiChipCount: { fontSize: 12, fontWeight: '800' },
  kpiTargetBox: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  kpiTargetVal: { fontSize: 14, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 10, maxHeight: '88%' },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  textArea: { height: 80, textAlignVertical: 'top' },
  inputLabel: { fontSize: 12, fontWeight: '500' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '600' },
  assigneeChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  assigneeAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  assigneeAvatarText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  assigneeName: { fontSize: 12, fontWeight: '600' },
  assigneeRole: { fontSize: 10 },
  submitBtn: { alignItems: 'center', paddingVertical: 13, borderRadius: 12 },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#e5e5e3' },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
});
