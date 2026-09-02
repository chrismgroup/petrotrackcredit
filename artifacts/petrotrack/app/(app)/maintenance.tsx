import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { AppliedDateField } from '@/components/AppliedDateField';
import { useBusinessDateConfirmation } from '@/components/BusinessDateConfirmation';
import { ScreenLayout } from '@/components/ScreenLayout';
import { fmtDate, fmtDateTime, type MaintenanceItem, useApp } from '@/context/AppContext';
import { type MaintenanceWorkflowStatus } from '@/lib/api';
import { useColors } from '@/hooks/useColors';

const PRIORITIES = ['Urgent', 'Medium', 'Low'] as const;
const STATUSES: Array<{ value: MaintenanceWorkflowStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'awaiting_approval', label: 'Awaiting approval' },
  { value: 'commenced', label: 'Commenced' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
  { value: 'closed', label: 'Closed' },
];
const STATUS_TRANSITIONS: Record<MaintenanceWorkflowStatus, MaintenanceWorkflowStatus[]> = {
  pending: [],
  awaiting_approval: ['open', 'commenced', 'closed'],
  commenced: ['awaiting_approval', 'open', 'done'],
  open: ['awaiting_approval', 'commenced', 'done'],
  done: ['open', 'closed'],
  closed: [],
};

function statusLabel(item: MaintenanceItem) {
  const value = item.status ?? (item.st === 'Done' ? 'done' : 'open');
  return STATUSES.find(status => status.value === value)?.label ?? 'Open';
}

export default function MaintenanceScreen() {
  const {
    role, userName, maintenance, userAccounts,
    addMaintenance, acknowledgeMaintenance, assignMaintenance, updateMaintenanceStatus, deleteMaintenance,
  } = useApp();
  const colors = useColors();
  const { requestDateConfirmation, confirmationModal } = useBusinessDateConfirmation();
  const isDecisionMaker = role === 'md' || role === 'ceo';
  const [showForm, setShowForm] = useState(false);
  const [filterDate, setFilterDate] = useState('');
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);
  const [workingTaskId, setWorkingTaskId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', pri: 'Urgent' as typeof PRIORITIES[number], date: '' });

  const items = maintenance
    .filter(item => !filterDate || item.date.slice(0, 10) === filterDate)
    .sort((left, right) => (right.updatedAt ?? right.submittedAt ?? '').localeCompare(left.updatedAt ?? left.submittedAt ?? ''));
  const activeItems = items.filter(item => !['done', 'closed'].includes(item.status ?? (item.st === 'Done' ? 'done' : 'open')));
  const finishedItems = items.filter(item => !activeItems.includes(item));
  const activeStaff = userAccounts.filter(account => account.status === 'active' && !!account.username);

  async function submitRequest() {
    if (!form.title.trim()) {
      Alert.alert('Description required', 'Please describe the maintenance issue.');
      return;
    }
    if (!form.date) {
      Alert.alert('Date required', 'Select the business date this request applies to.');
      return;
    }
    requestDateConfirmation('maintenance request', form.date, async () => {
      const created = await addMaintenance({ title: form.title.trim(), pri: form.pri, date: form.date });
      if (!created) {
        Alert.alert('Not submitted', 'The request could not be saved. Please check your connection and try again.');
        return;
      }
      setForm({ title: '', pri: 'Urgent', date: '' });
      setShowForm(false);
      Alert.alert(
        'Request submitted',
        `${created.taskId} has been created. The MD and CEO can now acknowledge and assign this request.`,
      );
    });
  }

  async function acknowledge(taskId: string) {
    setWorkingTaskId(taskId);
    try {
      const ok = await acknowledgeMaintenance(taskId);
      if (!ok) Alert.alert('Acknowledgement failed', 'This request could not be acknowledged. Refresh and try again.');
    } finally {
      setWorkingTaskId(null);
    }
  }

  async function assign(taskId: string, username: string, name: string) {
    setWorkingTaskId(taskId);
    try {
      const ok = await assignMaintenance(taskId, username);
      if (!ok) {
        Alert.alert('Assignment failed', 'Choose an active staff member and try again.');
        return;
      }
      setAssigningTaskId(null);
      Alert.alert('Assigned', `This maintenance task is now assigned to ${name}.`);
    } finally {
      setWorkingTaskId(null);
    }
  }

  async function changeStatus(taskId: string, status: MaintenanceWorkflowStatus) {
    setWorkingTaskId(taskId);
    try {
      const ok = await updateMaintenanceStatus(taskId, status);
      if (!ok) Alert.alert('Status not updated', 'Only the assigned staff member can update an open task.');
    } finally {
      setWorkingTaskId(null);
    }
  }

  function confirmDelete(taskId: string, title: string) {
    const remove = async () => {
      setWorkingTaskId(taskId);
      try {
        const ok = await deleteMaintenance(taskId, itemIdForTask(taskId));
        if (!ok) Alert.alert('Delete failed', 'The request could not be deleted. Refresh and try again.');
      } finally {
        setWorkingTaskId(null);
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`This permanently removes “${title}” from the maintenance list.`)) void remove();
      return;
    }
    Alert.alert(
      'Delete maintenance request?',
      `This permanently removes “${title}” from the maintenance list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void remove(),
        },
      ],
    );
  }

  function itemIdForTask(taskId: string) {
    return maintenance.find(item => item.taskId === taskId)?.id;
  }

  function renderItem(item: MaintenanceItem) {
    const taskId = item.taskId;
    const isAssignedUser = !!item.assignedToName && item.assignedToName === userName;
    const currentStatus = item.status ?? (item.st === 'Done' ? 'done' : 'open');
    const canUpdate = !!taskId && isAssignedUser && currentStatus !== 'closed';
    const isWorking = workingTaskId === taskId;
    const nextStatuses = STATUS_TRANSITIONS[currentStatus] ?? [];
    const history = item.history ?? [];
    return (
      <View key={taskId ?? item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.taskId, { color: colors.textMuted }]}>{taskId ?? `Legacy request #${item.id}`}</Text>
            <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
          </View>
          <View style={[styles.priority, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={[styles.priorityText, { color: item.pri === 'Urgent' ? colors.error : item.pri === 'Medium' ? colors.warning : colors.success }]}>{item.pri}</Text>
          </View>
        </View>

        <View style={styles.meta}>
          <Ionicons name="person-outline" size={13} color={colors.textMuted} />
          <Text style={[styles.metaText, { color: colors.textMuted }]}>Submitted by {item.submittedByName ?? item.by}</Text>
          <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
          <Text style={[styles.metaText, { color: colors.textMuted }]}>{fmtDate(item.date)}</Text>
        </View>
        <View style={[styles.statusRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Ionicons name={currentStatus === 'closed' ? 'lock-closed-outline' : currentStatus === 'done' ? 'checkmark-circle-outline' : 'construct-outline'} size={15} color={colors.textMuted} />
          <Text style={[styles.statusText, { color: colors.text }]}>{statusLabel(item)}</Text>
          <Text style={[styles.statusHint, { color: colors.textMuted }]}>
            {item.assignedToName ? `Assigned to ${item.assignedToName}` : item.acknowledgedAt ? 'Awaiting assignment' : 'Awaiting receipt acknowledgement'}
          </Text>
        </View>

        {!!taskId && isDecisionMaker && !item.acknowledgedAt && (
          <TouchableOpacity disabled={isWorking} style={[styles.primaryAction, { backgroundColor: colors.primary, opacity: isWorking ? 0.6 : 1 }]} onPress={() => acknowledge(taskId)}>
            <Ionicons name="receipt-outline" size={16} color="#fff" />
            <Text style={styles.primaryActionText}>{isWorking ? 'Saving…' : 'Acknowledge receipt'}</Text>
          </TouchableOpacity>
        )}
        {!!taskId && isDecisionMaker && !!item.acknowledgedAt && (
          <>
            <TouchableOpacity disabled={isWorking} style={[styles.outlineAction, { borderColor: colors.primary, opacity: isWorking ? 0.6 : 1 }]} onPress={() => setAssigningTaskId(assigningTaskId === taskId ? null : taskId)}>
              <Ionicons name="person-add-outline" size={16} color={colors.primary} />
              <Text style={[styles.outlineActionText, { color: colors.primary }]}>{item.assignedToName ? 'Reassign task' : 'Assign task'}</Text>
            </TouchableOpacity>
            {assigningTaskId === taskId && (
              <View style={[styles.assignmentPanel, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <Text style={[styles.assignmentTitle, { color: colors.text }]}>Assign to active staff</Text>
                {activeStaff.map(staff => (
                   <TouchableOpacity disabled={isWorking} key={staff.id} style={[styles.staffRow, { borderColor: colors.border, opacity: isWorking ? 0.6 : 1 }]} onPress={() => assign(taskId, staff.username, staff.empName)}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.staffName, { color: colors.text }]}>{staff.empName}</Text>
                      <Text style={[styles.metaText, { color: colors.textMuted }]}>{staff.jobTitle || staff.role || 'Staff member'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
        {canUpdate && (
          <View style={styles.statusOptions}>
            <Text style={[styles.assignmentTitle, { color: colors.text }]}>Update work status</Text>
            <View style={styles.statusChips}>
              {STATUSES.filter(status => nextStatuses.includes(status.value)).map(status => (
                <TouchableOpacity disabled={isWorking} key={status.value} style={[styles.statusChip, { borderColor: colors.border, backgroundColor: colors.background, opacity: isWorking ? 0.6 : 1 }]} onPress={() => changeStatus(taskId, status.value)}>
                  <Text style={[styles.chipText, { color: colors.text }]}>{isWorking ? 'Saving…' : status.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {!!taskId && role === 'admin' && (
          <TouchableOpacity
            disabled={isWorking}
            style={[styles.deleteAction, { borderColor: colors.error, opacity: isWorking ? 0.6 : 1 }]}
            onPress={() => confirmDelete(taskId, item.title)}
          >
            <Ionicons name="trash-outline" size={15} color={colors.error} />
            <Text style={[styles.deleteActionText, { color: colors.error }]}>{isWorking ? 'Deleting…' : 'Delete request'}</Text>
          </TouchableOpacity>
        )}

        <View style={[styles.history, { borderTopColor: colors.border }]}>
          <Text style={[styles.historyTitle, { color: colors.textMuted }]}>WORKFLOW HISTORY</Text>
          {history.length === 0 ? (
            <Text style={[styles.metaText, { color: colors.textMuted }]}>This legacy request has no workflow history.</Text>
          ) : history.slice().reverse().map(entry => (
            <View key={entry.id} style={styles.historyRow}>
              <Ionicons name="time-outline" size={13} color={colors.textMuted} />
              <Text style={[styles.historyText, { color: colors.text }]}>{entry.action} <Text style={{ color: colors.textMuted }}>by {entry.actor} · {fmtDateTime(entry.at)}</Text></Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <ScreenLayout
      title="Maintenance"
      rightAction={
        <TouchableOpacity onPress={() => setShowForm(value => !value)} style={styles.headerBtn}>
          <Ionicons name={showForm ? 'close' : 'add'} size={21} color="#fff" />
        </TouchableOpacity>
      }
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: colors.textMuted }]}>Submit an issue, then track acknowledgement, assignment, and the complete work history.</Text>
        {showForm && (
          <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.formTitle, { color: colors.text }]}>New maintenance request</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.inputBorder, backgroundColor: colors.background, color: colors.text }]}
              placeholder="Describe the issue and affected equipment"
              placeholderTextColor={colors.textSubtle}
              multiline
              value={form.title}
              onChangeText={title => setForm(previous => ({ ...previous, title }))}
              textAlignVertical="top"
            />
            <View style={styles.priorityRow}>
              {PRIORITIES.map(priority => (
                <TouchableOpacity key={priority} style={[styles.priorityButton, { borderColor: form.pri === priority ? colors.primary : colors.border, backgroundColor: form.pri === priority ? colors.primary : colors.background }]} onPress={() => setForm(previous => ({ ...previous, pri: priority }))}>
                  <Text style={{ color: form.pri === priority ? '#fff' : colors.text, fontWeight: '700', fontSize: 13 }}>{priority}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <AppliedDateField value={form.date} onChange={date => setForm(previous => ({ ...previous, date }))} accent={colors.primary} helper="Select the business date this issue applies to." />
            <TouchableOpacity style={[styles.primaryAction, { backgroundColor: colors.primary }]} onPress={submitRequest}>
              <Ionicons name="send-outline" size={16} color="#fff" />
              <Text style={styles.primaryActionText}>Submit request</Text>
            </TouchableOpacity>
          </View>
        )}

        <AppliedDateField value={filterDate} onChange={setFilterDate} label="Filter by business date" accent={colors.primary} helper="Leave blank to see all maintenance requests." />
        <View style={styles.summary}>
          <View style={[styles.summaryCard, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}><Text style={[styles.summaryNumber, { color: colors.error }]}>{activeItems.length}</Text><Text style={[styles.summaryLabel, { color: colors.error }]}>Active</Text></View>
          <View style={[styles.summaryCard, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}><Text style={[styles.summaryNumber, { color: colors.warning }]}>{activeItems.filter(item => item.pri === 'Urgent').length}</Text><Text style={[styles.summaryLabel, { color: colors.warning }]}>Urgent</Text></View>
          <View style={[styles.summaryCard, { backgroundColor: colors.successBg, borderColor: colors.successBorder }]}><Text style={[styles.summaryNumber, { color: colors.success }]}>{finishedItems.length}</Text><Text style={[styles.summaryLabel, { color: colors.success }]}>Finished</Text></View>
        </View>

        {activeItems.length > 0 && <Text style={[styles.sectionTitle, { color: colors.text }]}>Active requests</Text>}
        {activeItems.map(renderItem)}
        {finishedItems.length > 0 && <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 10 }]}>Done and closed</Text>}
        {finishedItems.map(renderItem)}
        {items.length === 0 && <Text style={[styles.empty, { color: colors.textMuted }]}>No maintenance requests match this date.</Text>}
      </ScrollView>
      {confirmationModal}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32 },
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  form: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10, marginBottom: 16 },
  formTitle: { fontSize: 16, fontWeight: '700' },
  input: { minHeight: 92, borderWidth: 1, borderRadius: 11, padding: 11, fontSize: 14 },
  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderWidth: 1, borderRadius: 9 },
  primaryAction: { minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 12 },
  primaryActionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  summary: { flexDirection: 'row', gap: 8, marginVertical: 14 },
  summaryCard: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 11, paddingVertical: 10 },
  summaryNumber: { fontSize: 22, fontWeight: '800' },
  summaryLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 13, padding: 13, marginBottom: 10, gap: 9 },
  cardTop: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  taskId: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 3 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  priority: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, borderWidth: 1 },
  priorityText: { fontSize: 11, fontWeight: '800' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaText: { fontSize: 11, lineHeight: 16 },
  statusRow: { borderWidth: 1, borderRadius: 9, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  statusText: { fontSize: 12, fontWeight: '800' },
  statusHint: { fontSize: 11, flexShrink: 1 },
  outlineAction: { minHeight: 40, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  outlineActionText: { fontSize: 13, fontWeight: '800' },
  assignmentPanel: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 2 },
  assignmentTitle: { fontSize: 12, fontWeight: '800', marginBottom: 3 },
  staffRow: { paddingVertical: 9, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  staffName: { fontSize: 13, fontWeight: '700' },
  statusOptions: { gap: 7 },
  statusChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 },
  chipText: { fontSize: 11, fontWeight: '700' },
  deleteAction: { minHeight: 38, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  deleteActionText: { fontSize: 12, fontWeight: '800' },
  history: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, gap: 5 },
  historyTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  historyRow: { flexDirection: 'row', gap: 5, alignItems: 'flex-start' },
  historyText: { fontSize: 11, lineHeight: 16, flex: 1 },
  empty: { textAlign: 'center', fontSize: 13, paddingVertical: 30 },
  headerBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
});