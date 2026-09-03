import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';

import { ModalSheet } from '@/components/FormSheet';
import { ActionItemsTable } from '@/components/ActionItemsTable';
import { ScreenLayout } from '@/components/ScreenLayout';
import {
  ActionItem,
  ActionItemStatus,
  ROLE_COLORS,
  ROLE_LABELS,
  getActionItemUrgency,
  resolveUserInfo,
  useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type ActionView = 'active' | 'archived';

const ACTION_PARTY_ROLES: Exclude<keyof typeof ROLE_LABELS, 'admin'>[] = ['ceo', 'md', 'mktg', 'csm', 'acc', 'mgr', 'att'];
const ACTION_STATUS_META: Record<ActionItemStatus, { label: string; color: string; icon: string }> = {
  open: { label: 'Open', color: '#185FA5', icon: 'ellipse-outline' },
  'on-going': { label: 'On-going', color: '#BA7517', icon: 'time-outline' },
  closed: { label: 'Closed', color: '#27500A', icon: 'checkmark-circle' },
};
const ACTION_URGENCY_LABELS = {
  overdue: 'Overdue',
  'due-soon': 'Due within 2 weeks',
  'on-track': 'More than 2 weeks',
} as const;
function getActionItemUrgencyLabel(targetDate: string) {
  return ACTION_URGENCY_LABELS[getActionItemUrgency(targetDate)];
}

export default function ActionItemsScreen() {
  const {
    role, staffId, branchId, branches, userAccounts, actionItems,
    addActionItem, updateActionItemStatus,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'md'] || colors.primary;
  const isCorporateAdmin = role === 'admin' || role === 'ceo';
  const availableBranches = branches.filter(branch =>
    branch.st === 'Active' && (isCorporateAdmin || !branchId || branch.id === branchId),
  );
  const actionPartyAccounts = userAccounts.filter(account =>
    account.status === 'active' && account.role && account.role !== 'admin'
      && ACTION_PARTY_ROLES.includes(account.role as any),
  );
  const actionPartyOptions = actionPartyAccounts.length > 0
    ? actionPartyAccounts
    : ACTION_PARTY_ROLES.map(partyRole => ({
        id: 0,
        empName: resolveUserInfo(partyRole, userAccounts).name,
        role: partyRole,
      }));

  const [actionView, setActionView] = useState<ActionView>('active');
  const [actionBranchFilter, setActionBranchFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [selectedActionItemId, setSelectedActionItemId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: '',
    desc: '',
    actionPartyId: null as number | null,
    actionPartyRole: '',
    actionPartyName: '',
    targetDate: '',
    branchId: branchId ?? '',
  });

  const visibleItems = actionItems.filter(item => {
    const userBranchMatches = isCorporateAdmin || !branchId || item.branchId === branchId;
    const selectedBranchMatches = actionBranchFilter === 'all' || item.branchId === actionBranchFilter;
    const archived = item.status === 'closed' || !!item.archivedAt;
    return userBranchMatches && selectedBranchMatches && (actionView === 'archived' ? archived : !archived);
  });
  const selectedActionItem = selectedActionItemId === null
    ? null
    : actionItems.find(item => item.id === selectedActionItemId) ?? null;

  function openForm() {
    setForm(current => ({
      ...current,
      branchId: branchId ?? availableBranches[0]?.id ?? '',
    }));
    setShowForm(true);
  }

  function addItem() {
    if (!role || !form.title.trim() || !form.actionPartyRole || !form.targetDate || !form.branchId) {
      Alert.alert('Required', 'Title, action party, target close date, and branch are required.');
      return;
    }
    const selectedBranch = branches.find(branch => branch.id === form.branchId);
    const created = addActionItem({
      title: form.title.trim(),
      desc: form.desc.trim(),
      actionPartyId: form.actionPartyId || undefined,
      actionPartyRole: form.actionPartyRole as any,
      actionPartyName: form.actionPartyName,
      targetDate: form.targetDate,
      branchId: form.branchId,
      branchName: selectedBranch?.name ?? form.branchId,
    });
    if (!created) {
      Alert.alert('Unable to add action item', 'Please sign in again and try once more.');
      return;
    }
    setForm({
      title: '', desc: '', actionPartyId: null, actionPartyRole: '',
      actionPartyName: '', targetDate: '', branchId: branchId ?? availableBranches[0]?.id ?? '',
    });
    setShowForm(false);
  }

  function canUpdate(item: ActionItem) {
    if (!role || item.status === 'closed') return false;
    return role === 'ceo'
      || (item.actionPartyId !== undefined ? item.actionPartyId === staffId : item.actionPartyRole === role);
  }

  function changeStatus(item: ActionItem, status: ActionItemStatus) {
    if (status === 'closed') {
      Alert.alert('Close action item?', `"${item.title}" will be locked and moved to the ${item.branchName} archive.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close and archive', onPress: () => updateActionItemStatus(item.id, status) },
      ]);
      return;
    }
    updateActionItemStatus(item.id, status);
  }

  function openDetails(item: ActionItem) {
    setSelectedActionItemId(item.id);
  }

  function renderDetails() {
    if (!selectedActionItem) return null;
    const status = ACTION_STATUS_META[selectedActionItem.status];
    const history = selectedActionItem.history?.length
      ? selectedActionItem.history
      : [{
          action: 'Action item created',
          actor: selectedActionItem.createdBy,
          actorRole: selectedActionItem.createdByRole,
          at: selectedActionItem.createdAt,
          detail: `Assigned to ${selectedActionItem.actionPartyName}.`,
        }];
    const editable = canUpdate(selectedActionItem);

    return (
      <ModalSheet visible={!!selectedActionItem} onClose={() => setSelectedActionItemId(null)}>
        <View style={[styles.detailContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.flex}>
              <Text style={[styles.detailEyebrow, { color: colors.primary }]}>ACTION ITEM DETAILS</Text>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Full workflow</Text>
            </View>
            <TouchableOpacity
              onPress={() => setSelectedActionItemId(null)}
              style={[styles.closeButton, { backgroundColor: colors.surface }]}
              accessibilityRole="button"
              accessibilityLabel="Close action item details"
            >
              <Ionicons name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.sheet}
            contentContainerStyle={styles.detailContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.detailHero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.detailTitleRow}>
                <Text style={[styles.detailTitle, { color: colors.text }]}>{selectedActionItem.title}</Text>
                <View style={[styles.statusBadge, { backgroundColor: status.color + '18' }]}>
                  <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                </View>
              </View>
              <Text style={[styles.detailDescription, { color: colors.textMuted }]}>
                {selectedActionItem.desc || 'No description or expected outcome was provided.'}
              </Text>
            </View>

            <View style={styles.infoGrid}>
              <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Action party</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{selectedActionItem.actionPartyName}</Text>
                <Text style={[styles.infoHint, { color: colors.textMuted }]}>{ROLE_LABELS[selectedActionItem.actionPartyRole]}</Text>
              </View>
              <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Close-out date</Text>
                <Text style={[styles.infoValue, { color: status.color }]}>{selectedActionItem.targetDate}</Text>
                <Text style={[styles.infoHint, { color: status.color }]}>{getActionItemUrgencyLabel(selectedActionItem.targetDate)}</Text>
              </View>
              <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Branch</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{selectedActionItem.branchName}</Text>
              </View>
              <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Created</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>#{String(selectedActionItem.id).slice(-6)}</Text>
                <Text style={[styles.infoHint, { color: colors.textMuted }]}>{selectedActionItem.createdAt}</Text>
              </View>
            </View>

            {editable ? (
              <View style={[styles.statusEditor, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Update status</Text>
                <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
                  Only the assigned action party or CEO can update this item.
                </Text>
                <View style={styles.statusOptions}>
                  {(['open', 'on-going', 'closed'] as ActionItemStatus[]).map(nextStatus => {
                    const nextMeta = ACTION_STATUS_META[nextStatus];
                    const active = selectedActionItem.status === nextStatus;
                    return (
                      <TouchableOpacity
                        key={nextStatus}
                        testID={`action-status-${nextStatus}`}
                        onPress={() => changeStatus(selectedActionItem, nextStatus)}
                        style={[styles.statusOption, {
                          backgroundColor: active ? nextMeta.color : colors.background,
                          borderColor: active ? nextMeta.color : colors.border,
                        }]}
                      >
                        <Ionicons name={nextMeta.icon as any} size={15} color={active ? '#fff' : nextMeta.color} />
                        <Text style={[styles.statusOptionText, { color: active ? '#fff' : colors.textMuted }]}>{nextMeta.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={[styles.readOnlyNotice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name={selectedActionItem.status === 'closed' ? 'lock-closed-outline' : 'eye-outline'} size={16} color={colors.textMuted} />
                <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
                  {selectedActionItem.status === 'closed'
                    ? 'This action item is closed and locked in the branch archive.'
                    : 'You can view this action item, but only the action party or CEO can update its status.'}
                </Text>
              </View>
            )}

            <View style={styles.historySection}>
              <View style={styles.historyHeading}>
                <View style={styles.flex}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Workflow history</Text>
                  <Text style={[styles.sectionHint, { color: colors.textMuted }]}>Every recorded change to this action item.</Text>
                </View>
                <Text style={[styles.historyCount, { color: colors.primary }]}>{history.length}</Text>
              </View>
              {history.map((entry, index) => (
                <View key={`${entry.at}-${index}`} style={styles.historyRow}>
                  <View style={[styles.historyDot, { backgroundColor: index === history.length - 1 ? colors.primary : colors.border }]} />
                  <View style={styles.flex}>
                    <Text style={[styles.historyAction, { color: colors.text }]}>{entry.action}</Text>
                    <Text style={[styles.historyMeta, { color: colors.textMuted }]}>
                      {entry.actor}{entry.actorRole ? ` · ${ROLE_LABELS[entry.actorRole] ?? entry.actorRole}` : ''} · {entry.at}
                    </Text>
                    {!!entry.detail && <Text style={[styles.historyDetail, { color: colors.textMuted }]}>{entry.detail}</Text>}
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </ModalSheet>
    );
  }

  function renderItems() {
    if (!visibleItems.length) {
      return (
        <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name={actionView === 'archived' ? 'archive-outline' : 'flash-outline'} size={38} color={colors.textSubtle} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {actionView === 'archived' ? 'No closed action items in this branch archive' : 'No open action items yet'}
          </Text>
          {actionView === 'active' && (
            <TouchableOpacity onPress={openForm} style={[styles.emptyAction, { backgroundColor: roleColor }]}>
              <Text style={styles.emptyActionText}>Add Action Item</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (actionView === 'archived') {
      const branchGroups = Array.from(new Set(visibleItems.map(item => item.branchId)));
      return branchGroups.map(groupBranchId => {
        const group = visibleItems.filter(item => item.branchId === groupBranchId);
        return (
          <View key={groupBranchId} style={styles.group}>
            <View style={styles.groupHeader}>
              <Ionicons name="archive-outline" size={14} color={colors.textMuted} />
              <Text style={[styles.groupLabel, { color: colors.textMuted }]}>
                {group[0]?.branchName ?? groupBranchId} · {group.length}
              </Text>
            </View>
           <ActionItemsTable items={group} colors={colors} emptyText="No closed action items in this branch archive" onRowPress={openDetails} />
          </View>
        );
      });
    }

    return (['open', 'on-going'] as ActionItemStatus[]).map(status => {
      const group = visibleItems.filter(item => item.status === status);
      if (!group.length) return null;
      const meta = ACTION_STATUS_META[status];
      return (
        <View key={status} style={styles.group}>
          <View style={styles.groupHeader}>
            <View style={[styles.groupDot, { backgroundColor: meta.color }]} />
            <Text style={[styles.groupLabel, { color: meta.color }]}>{meta.label} · {group.length}</Text>
          </View>
           <ActionItemsTable items={group} colors={colors} onRowPress={openDetails} />
        </View>
      );
    });
  }

  return (
    <ScreenLayout
      title="Action Items"
      rightAction={role ? (
        <TouchableOpacity onPress={openForm} style={styles.headerButton} accessibilityLabel="Add action item">
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      ) : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: roleColor }]}>
          <Text style={styles.eyebrow}>FOLLOW-THROUGH</Text>
          <Text style={styles.heroTitle}>Keep important actions moving.</Text>
          <Text style={styles.heroSub}>Track ownership, close-out dates and branch accountability in one place.</Text>
          <View style={styles.heroStats}>
            <View><Text style={styles.statValue}>{actionItems.filter(item => item.status !== 'closed').length}</Text><Text style={styles.statLabel}>Open items</Text></View>
            <View><Text style={styles.statValue}>{actionItems.filter(item => item.status === 'closed').length}</Text><Text style={styles.statLabel}>Archived</Text></View>
            <View><Text style={styles.statValue}>{availableBranches.length}</Text><Text style={styles.statLabel}>Branches</Text></View>
          </View>
        </View>

        <View style={styles.toolbar}>
          <View style={styles.viewRow}>
            {(['active', 'archived'] as ActionView[]).map(view => (
              <TouchableOpacity
                key={view}
                onPress={() => setActionView(view)}
                style={[styles.filterPill, { backgroundColor: actionView === view ? roleColor : colors.surface, borderColor: actionView === view ? roleColor : colors.border }]}
              >
                <Ionicons name={view === 'active' ? 'flash-outline' : 'archive-outline'} size={13} color={actionView === view ? '#fff' : colors.textMuted} />
                <Text style={[styles.filterText, { color: actionView === view ? '#fff' : colors.textMuted }]}>{view === 'active' ? 'Open items' : 'Branch archive'}</Text>
                <Text style={[styles.filterCount, { color: actionView === view ? 'rgba(255,255,255,0.8)' : colors.textSubtle }]}>
                  {actionItems.filter(item => view === 'archived' ? item.status === 'closed' : item.status !== 'closed').length}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branchFilters}>
            <TouchableOpacity onPress={() => setActionBranchFilter('all')} style={[styles.branchPill, { backgroundColor: actionBranchFilter === 'all' ? roleColor + '15' : colors.surface, borderColor: actionBranchFilter === 'all' ? roleColor : colors.border }]}>
              <Text style={[styles.branchPillText, { color: actionBranchFilter === 'all' ? roleColor : colors.textMuted }]}>All branches</Text>
            </TouchableOpacity>
            {availableBranches.map(branch => (
              <TouchableOpacity key={branch.id} onPress={() => setActionBranchFilter(branch.id)} style={[styles.branchPill, { backgroundColor: actionBranchFilter === branch.id ? roleColor + '15' : colors.surface, borderColor: actionBranchFilter === branch.id ? roleColor : colors.border }]}>
                <Text style={[styles.branchPillText, { color: actionBranchFilter === branch.id ? roleColor : colors.textMuted }]} numberOfLines={1}>{branch.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {renderItems()}
        <View style={{ height: 22 }} />
      </ScrollView>

      {renderDetails()}

      <ModalSheet visible={showForm} onClose={() => setShowForm(false)}>
        <KeyboardAvoidingView
          style={[styles.sheetContainer, { backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
        >
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.flex}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Add Action Item</Text>
              <Text style={[styles.sheetIntro, { color: colors.textMuted }]}>
                Assign a clear follow-up to a person. Closing locks it in the branch archive.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => Keyboard.dismiss()}
              style={[styles.keyboardButton, { backgroundColor: colors.surface }]}
              accessibilityRole="button"
              accessibilityLabel="Hide keyboard"
            >
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowForm(false)}
              style={[styles.closeButton, { backgroundColor: colors.surface }]}
              accessibilityRole="button"
              accessibilityLabel="Close action item form"
            >
              <Ionicons name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.sheet}
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            automaticallyAdjustKeyboardInsets
          >
          <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} placeholder="Action item title *" placeholderTextColor={colors.textSubtle} value={form.title} onChangeText={title => setForm(current => ({ ...current, title }))} />
          <TextInput style={[styles.input, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} placeholder="Description or expected outcome (optional)" placeholderTextColor={colors.textSubtle} multiline value={form.desc} onChangeText={desc => setForm(current => ({ ...current, desc }))} />

          <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Action party *</Text>
          {actionPartyOptions.map(option => {
            const optionRole = option.role as any;
            const optionId = option.id || undefined;
            const optionName = option.empName;
            const optionColor = ROLE_COLORS[optionRole] || colors.primary;
            const selected = (form.actionPartyId === optionId || (!optionId && !form.actionPartyId)) && form.actionPartyRole === optionRole;
            return (
              <TouchableOpacity key={`${optionRole}-${optionId ?? 'role'}`} onPress={() => setForm(current => ({ ...current, actionPartyId: optionId ?? null, actionPartyRole: optionRole, actionPartyName: optionName }))} style={[styles.assigneeRow, { backgroundColor: selected ? optionColor + '10' : colors.surface, borderColor: selected ? optionColor : colors.border }]}>
                <View style={[styles.avatar, { backgroundColor: selected ? optionColor : colors.textSubtle }]}><Text style={styles.avatarText}>{resolveUserInfo(optionRole, userAccounts).initials}</Text></View>
                <View style={styles.flex}><Text style={[styles.assigneeName, { color: selected ? optionColor : colors.text }]}>{optionName}</Text><Text style={[styles.assigneeRole, { color: colors.textMuted }]}>{ROLE_LABELS[optionRole] ?? optionRole}</Text></View>
                {selected && <Ionicons name="checkmark-circle" size={18} color={optionColor} />}
              </TouchableOpacity>
            );
          })}

          <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Target close date *</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSubtle} value={form.targetDate} onChangeText={targetDate => setForm(current => ({ ...current, targetDate }))} />
          <Text style={[styles.hint, { color: colors.textSubtle }]}>Past dates show red · within 14 days shows yellow · later dates show green.</Text>

          <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Branch archive *</Text>
          {availableBranches.length === 0 ? <Text style={[styles.hint, { color: colors.error }]}>No active branch is available for this account.</Text> : (
            <View style={styles.chipRow}>
              {availableBranches.map(branch => {
                const selected = form.branchId === branch.id;
                return <TouchableOpacity key={branch.id} onPress={() => setForm(current => ({ ...current, branchId: branch.id }))} style={[styles.chip, { backgroundColor: selected ? roleColor + '18' : colors.surface, borderColor: selected ? roleColor : colors.border }]}><Ionicons name="business-outline" size={13} color={selected ? roleColor : colors.textMuted} /><Text style={[styles.chipText, { color: selected ? roleColor : colors.textMuted }]}>{branch.name}</Text></TouchableOpacity>;
              })}
            </View>
          )}
          <View style={styles.formActions}>
            <TouchableOpacity style={[styles.submitButton, { backgroundColor: roleColor }]} onPress={addItem}><Text style={styles.submitText}>Add Action Item</Text></TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowForm(false)}><Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text></TouchableOpacity>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ModalSheet>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 14, paddingBottom: 36 },
  hero: { borderRadius: 22, padding: 20, gap: 8 },
  eyebrow: { color: 'rgba(255,255,255,0.68)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  heroTitle: { color: '#fff', fontSize: 23, lineHeight: 28, fontWeight: '800', marginTop: 3 },
  heroSub: { color: 'rgba(255,255,255,0.76)', fontSize: 12, lineHeight: 18 },
  heroStats: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', marginTop: 12, paddingTop: 13 },
  statValue: { color: '#fff', fontSize: 20, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.66)', fontSize: 10, marginTop: 2 },
  headerButton: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  toolbar: { gap: 10 },
  viewRow: { flexDirection: 'row', gap: 8 },
  filterPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 99, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 },
  filterText: { fontSize: 11, fontWeight: '700' },
  filterCount: { fontSize: 10, fontWeight: '800' },
  branchFilters: { gap: 7 },
  branchPill: { borderRadius: 99, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 7 },
  branchPillText: { fontSize: 10, fontWeight: '700' },
  group: { marginBottom: 4 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7, paddingHorizontal: 2 },
  groupDot: { width: 7, height: 7, borderRadius: 4 },
  groupLabel: { fontSize: 11, fontWeight: '800' },
  emptyBox: { borderWidth: 1, borderRadius: 18, alignItems: 'center', padding: 28, gap: 10 },
  emptyText: { fontSize: 13, textAlign: 'center' },
  emptyAction: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  emptyActionText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  sheetContainer: { height: '82%', width: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  detailContainer: { height: '92%', width: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  keyboardButton: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  closeButton: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sheet: { flex: 1 },
  sheetContent: { padding: 16, paddingBottom: 36 },
  detailContent: { padding: 16, paddingBottom: 42, gap: 14 },
  detailEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.3, marginBottom: 3 },
  detailHero: { borderWidth: 1, borderRadius: 18, padding: 15, gap: 10 },
  detailTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailTitle: { flex: 1, fontSize: 20, lineHeight: 25, fontWeight: '800' },
  detailDescription: { fontSize: 13, lineHeight: 20 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoCard: { flexGrow: 1, flexBasis: '44%', minWidth: 140, borderWidth: 1, borderRadius: 14, padding: 12, gap: 3 },
  infoLabel: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  infoHint: { fontSize: 10, lineHeight: 15 },
  statusEditor: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  sectionHint: { fontSize: 11, lineHeight: 16 },
  statusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  statusOption: { minHeight: 40, flexGrow: 1, flexBasis: '29%', borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  statusOptionText: { fontSize: 11, fontWeight: '800' },
  readOnlyNotice: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  historySection: { gap: 10 },
  historyHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyCount: { minWidth: 28, textAlign: 'center', fontSize: 12, fontWeight: '800', borderRadius: 99 },
  historyRow: { flexDirection: 'row', gap: 10, paddingLeft: 4 },
  historyDot: { width: 9, height: 9, borderRadius: 5, marginTop: 4 },
  historyAction: { fontSize: 12, lineHeight: 17, fontWeight: '800' },
  historyMeta: { fontSize: 10, lineHeight: 15, marginTop: 2 },
  historyDetail: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  sheetTitle: { fontSize: 20, fontWeight: '800', marginBottom: 7 },
  sheetIntro: { fontSize: 11, lineHeight: 16, marginBottom: 12 },
  input: { minHeight: 46, borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, fontSize: 14, marginBottom: 9 },
  textArea: { minHeight: 78, paddingTop: 12, textAlignVertical: 'top' },
  inputLabel: { fontSize: 11, fontWeight: '700', marginTop: 8, marginBottom: 7 },
  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 11, padding: 9, marginBottom: 7 },
  avatar: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  assigneeName: { fontSize: 12, fontWeight: '700' },
  assigneeRole: { fontSize: 10, marginTop: 2 },
  flex: { flex: 1 },
  hint: { fontSize: 10, lineHeight: 15, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 8 },
  chipText: { fontSize: 11, fontWeight: '700' },
  formActions: { flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 30 },
  submitButton: { flex: 1, minHeight: 45, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  cancelButton: { flex: 1, minHeight: 45, borderRadius: 11, backgroundColor: 'rgba(127,127,127,0.12)', alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 12, fontWeight: '700' },
});