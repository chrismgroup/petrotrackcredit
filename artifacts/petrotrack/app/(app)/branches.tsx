import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { ModalSheet } from '@/components/FormSheet';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const ST_STYLES: Record<string, { color: string; bg: string }> = {
  Active:    { color: '#27500A', bg: '#EAF3DE' },
  Pending:   { color: '#BA7517', bg: '#FAEEDA' },
  Suspended: { color: '#791F1F', bg: '#FCEBEB' },
};

const BRANCH_FIELDS = [
  { key: 'name',  label: 'Branch Name *' },
  { key: 'mgr',   label: 'Manager Name' },
  { key: 'pumps', label: 'Pump Count',  kb: 'numeric' as const },
  { key: 'tanks', label: 'Tank Count',  kb: 'numeric' as const },
] as const;

type BranchForm = { name: string; mgr: string; pumps: string; tanks: string };

export default function BranchesScreen() {
  const { role, branches, addBranch, updateBranch, deleteBranch } = useApp();
  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'csm'] || colors.primary;
  const isAdmin   = role === 'admin';

  const totalRev    = branches.reduce((s, b) => s + b.rev, 0);
  const activeCount = branches.filter(b => b.st === 'Active').length;

  // ── Add form ──────────────────────────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm]         = useState<BranchForm>({ name: '', mgr: '', pumps: '2', tanks: '2' });

  function handleAdd() {
    if (!addForm.name.trim()) { Alert.alert('Required', 'Branch name is required.'); return; }
    // Admin-created branches go straight to Active; other roles submit as Pending
    addBranch({ name: addForm.name.trim(), st: isAdmin ? 'Active' : 'Pending', rev: 0, mgr: addForm.mgr.trim(), pumps: parseInt(addForm.pumps) || 2, tanks: parseInt(addForm.tanks) || 2 });
    setAddForm({ name: '', mgr: '', pumps: '2', tanks: '2' });
    setShowAddForm(false);
  }

  function handleApprove(b: typeof branches[number]) {
    Alert.alert(
      'Approve Branch',
      `Activate "${b.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => updateBranch(b.id, { st: 'Active' }) },
      ]
    );
  }

  // ── Edit form ─────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm,  setEditForm]  = useState<BranchForm>({ name: '', mgr: '', pumps: '', tanks: '' });

  function openEdit(b: typeof branches[number]) {
    setEditForm({ name: b.name, mgr: b.mgr || '', pumps: String(b.pumps), tanks: String(b.tanks) });
    setEditingId(b.id);
  }

  function handleSaveEdit() {
    if (!editForm.name.trim()) { Alert.alert('Required', 'Branch name cannot be empty.'); return; }
    updateBranch(editingId!, {
      name:  editForm.name.trim(),
      mgr:   editForm.mgr.trim(),
      pumps: parseInt(editForm.pumps) || 0,
      tanks: parseInt(editForm.tanks) || 0,
    });
    setEditingId(null);
    Alert.alert('Updated', 'Branch details saved.');
  }

  // ── Suspend / Delete ──────────────────────────────────────────────────
  function handleSuspend(b: typeof branches[number]) {
    const nextSt = b.st === 'Suspended' ? 'Active' : 'Suspended';
    Alert.alert(
      `${nextSt === 'Suspended' ? 'Suspend' : 'Activate'} Branch`,
      `${nextSt === 'Suspended' ? 'Suspend' : 'Activate'} "${b.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => updateBranch(b.id, { st: nextSt }) },
      ]
    );
  }

  function handleDelete(b: typeof branches[number]) {
    Alert.alert(
      'Delete Branch',
      `Permanently remove "${b.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteBranch(b.id) },
      ]
    );
  }

  return (
    <ScreenLayout
      title="Branches"
      rightAction={isAdmin ? (
        <TouchableOpacity onPress={() => setShowAddForm(true)} style={styles.headerBtn}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      ) : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!isAdmin && (
          <View style={[styles.readonlyBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
            <Text style={[styles.readonlyText, { color: colors.textMuted }]}>
              View only — only System Admin can create, edit or remove branches
            </Text>
          </View>
        )}

        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { backgroundColor: roleColor + '12', borderColor: roleColor + '33' }]}>
            <Text style={[styles.metricValue, { color: roleColor }]}>{fmt(totalRev)}</Text>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Total Revenue</Text>
          </View>
          <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.metricValue, { color: colors.text }]}>{activeCount}/{branches.length}</Text>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Active Branches</Text>
          </View>
        </View>

        {branches.map(b => {
          const st = ST_STYLES[b.st] || ST_STYLES.Pending;
          return (
            <View key={b.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: b.st === 'Suspended' ? colors.warningBorder : colors.border }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.branchIcon, { backgroundColor: roleColor + '18' }]}>
                  <Ionicons name="business" size={20} color={roleColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.branchName, { color: colors.text }]}>{b.name}</Text>
                  <Text style={[styles.branchId, { color: colors.textMuted }]}>ID: {b.id}</Text>
                </View>
                <View style={[styles.stBadge, { backgroundColor: st.bg }]}>
                  <Text style={[styles.stText, { color: st.color }]}>{b.st}</Text>
                </View>
              </View>

              {b.mgr ? (
                <View style={styles.infoRow}>
                  <Ionicons name="person-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.infoText, { color: colors.textMuted }]}>Manager: {b.mgr}</Text>
                </View>
              ) : null}

              <View style={styles.statsRow}>
                <View style={[styles.statItem, { backgroundColor: colors.background }]}>
                  <Ionicons name="water" size={14} color={roleColor} />
                  <Text style={[styles.statVal, { color: colors.text }]}>{b.pumps} pumps</Text>
                </View>
                <View style={[styles.statItem, { backgroundColor: colors.background }]}>
                  <Ionicons name="cube" size={14} color={roleColor} />
                  <Text style={[styles.statVal, { color: colors.text }]}>{b.tanks} tanks</Text>
                </View>
                {b.rev > 0 && (
                  <View style={[styles.statItem, { backgroundColor: roleColor + '12' }]}>
                    <Ionicons name="trending-up" size={14} color={roleColor} />
                    <Text style={[styles.statVal, { color: roleColor }]}>{fmt(b.rev)}</Text>
                  </View>
                )}
              </View>

              {isAdmin && (
                <View style={styles.adminActions}>
                  {/* Approve — only shown for Pending branches */}
                  {b.st === 'Pending' && (
                    <TouchableOpacity
                      onPress={() => handleApprove(b)}
                      style={[styles.actionBtn, { backgroundColor: colors.successBg, borderColor: colors.successBorder }]}
                    >
                      <Ionicons name="checkmark-circle-outline" size={13} color={colors.success} />
                      <Text style={[styles.actionBtnText, { color: colors.success }]}>Approve</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => openEdit(b)}
                    style={[styles.actionBtn, { backgroundColor: roleColor + '12', borderColor: roleColor + '33' }]}
                  >
                    <Ionicons name="create-outline" size={13} color={roleColor} />
                    <Text style={[styles.actionBtnText, { color: roleColor }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSuspend(b)}
                    style={[styles.actionBtn, {
                      backgroundColor: b.st === 'Suspended' ? colors.successBg : colors.warningBg,
                      borderColor:     b.st === 'Suspended' ? colors.successBorder : colors.warningBorder,
                    }]}
                  >
                    <Ionicons
                      name={b.st === 'Suspended' ? 'play' : 'pause'}
                      size={12}
                      color={b.st === 'Suspended' ? colors.success : colors.warning}
                    />
                    <Text style={[styles.actionBtnText, { color: b.st === 'Suspended' ? colors.success : colors.warning }]}>
                      {b.st === 'Suspended' ? 'Activate' : 'Suspend'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(b)}
                    style={[styles.actionBtn, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}
                  >
                    <Ionicons name="trash-outline" size={12} color={colors.error} />
                    <Text style={[styles.actionBtnText, { color: colors.error }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── Add Branch Modal ── */}
      <ModalSheet visible={showAddForm} onClose={() => setShowAddForm(false)}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add Branch</Text>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="none" showsVerticalScrollIndicator={false}>
              {BRANCH_FIELDS.map(f => (
                <TextInput
                  key={f.key}
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  placeholder={f.label}
                  placeholderTextColor={colors.textSubtle}
                  keyboardType={'kb' in f ? f.kb : 'default'}
                  value={addForm[f.key]}
                  onChangeText={v => setAddForm(fr => ({ ...fr, [f.key]: v }))}
                  autoCorrect={false}
                />
              ))}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleAdd}>
                  <Text style={styles.submitBtnText}>Add Branch</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setShowAddForm(false)}>
                  <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
      </ModalSheet>

      {/* ── Edit Branch Modal ── */}
      <ModalSheet visible={editingId !== null} onClose={() => setEditingId(null)}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Branch</Text>
              <TouchableOpacity onPress={() => setEditingId(null)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="none" showsVerticalScrollIndicator={false}>
              {BRANCH_FIELDS.map(f => (
                <View key={f.key}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{f.label}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                    placeholder={f.label}
                    placeholderTextColor={colors.textSubtle}
                    keyboardType={'kb' in f ? f.kb : 'default'}
                    value={editForm[f.key]}
                    onChangeText={v => setEditForm(fr => ({ ...fr, [f.key]: v }))}
                    autoCorrect={false}
                  />
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleSaveEdit}>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.submitBtnText}>Save Changes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setEditingId(null)}>
                  <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
      </ModalSheet>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll:         { padding: 16 },
  readonlyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 14 },
  readonlyText:   { flex: 1, fontSize: 12 },
  metricsRow:     { flexDirection: 'row', gap: 8, marginBottom: 16 },
  metricCard:     { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1 },
  metricValue:    { fontSize: 18, fontWeight: '700' },
  metricLabel:    { fontSize: 11, marginTop: 2 },
  card:           { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10, gap: 10 },
  cardHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  branchIcon:     { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  branchName:     { fontSize: 15, fontWeight: '700' },
  branchId:       { fontSize: 11, marginTop: 1 },
  stBadge:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  stText:         { fontSize: 11, fontWeight: '700' },
  infoRow:        { flexDirection: 'row', alignItems: 'center', gap: 5 },
  infoText:       { fontSize: 12 },
  statsRow:       { flexDirection: 'row', gap: 6 },
  statItem:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  statVal:        { fontSize: 12, fontWeight: '600' },
  adminActions:   { flexDirection: 'row', gap: 6, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e5e3' },
  actionBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  actionBtnText:  { fontSize: 11, fontWeight: '600' },
  headerBtn:      { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 10 },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle:     { fontSize: 18, fontWeight: '700' },
  fieldLabel:     { fontSize: 11, fontWeight: '600', marginBottom: 3 },
  input:          { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 2 },
  submitBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  submitBtnText:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn:      { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#e5e5e3' },
  cancelBtnText:  { fontSize: 14, fontWeight: '600' },
});
