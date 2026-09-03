import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ModalSheet } from '@/components/FormSheet';
import { ActionItemsTable } from '@/components/ActionItemsTable';
import { ScreenLayout } from '@/components/ScreenLayout';
import {
  ActionItem,
  ActionItemStatus,
  ROLE_COLORS,
  ROLE_LABELS,
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
            <ActionItemsTable items={group} colors={colors} emptyText="No closed action items in this branch archive" />
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
          <ActionItemsTable items={group} colors={colors} canUpdate={canUpdate} onStatusChange={changeStatus} />
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

      <ModalSheet visible={showForm} onClose={() => setShowForm(false)}>
        <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          <Text style={[styles.sheetTitle, { color: colors.text }]}>Add Action Item</Text>
          <Text style={[styles.sheetIntro, { color: colors.textMuted }]}>Assign a clear follow-up to a person. Closing locks it in the branch archive.</Text>
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
  sheet: { padding: 16 },
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