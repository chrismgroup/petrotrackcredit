import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { ModalSheet } from '@/components/FormSheet';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

import { ScreenLayout } from '@/components/ScreenLayout';
import { LPGTank, Pump, ROLE_COLORS, Tank, fmt, salesRevenueByBranch, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const ST_STYLES: Record<string, { color: string; bg: string }> = {
  Active:    { color: '#1F6848', bg: '#E5F1E9' },
  Pending:   { color: '#71805B', bg: '#EEF2E4' },
  Suspended: { color: '#365A47', bg: '#E9F0EB' },
};

/* ── module-level chip picker (iOS keyboard rule: no sub-components in render) ── */
interface AssetPickerProps {
  label: string;
  items: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  accent: string;
  colors: ReturnType<typeof import('@/hooks/useColors').useColors>;
}
function AssetPicker({ label, items, selected, onToggle, accent, colors }: AssetPickerProps) {
  if (items.length === 0) {
    return (
      <View style={{ marginBottom: 10 }}>
        <Text style={[apStyles.label, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[apStyles.empty, { color: colors.textSubtle }]}>
          No {label.toLowerCase()} available — add some in System Settings first.
        </Text>
      </View>
    );
  }
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[apStyles.label, { color: colors.textMuted }]}>{label}</Text>
      <View style={apStyles.chipRow}>
        {items.map(item => {
          const active = selected.includes(item.id);
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => onToggle(item.id)}
              style={[apStyles.chip, {
                borderColor: active ? accent : colors.border,
                backgroundColor: active ? accent + '1A' : colors.surface,
              }]}
            >
              <Text style={[apStyles.chipText, { color: active ? accent : colors.textMuted }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
const apStyles = StyleSheet.create({
  label:    { fontSize: 11, fontWeight: '600', marginBottom: 6 },
  empty:    { fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  chipText: { fontSize: 12, fontWeight: '600' },
});

/* ── helpers ── */
function toggle(arr: string[], id: string): string[] {
  return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
}

type BranchForm = {
  name: string;
  mgr: string;
  tankIds: string[];
  lpgIds: string[];
  pumpIds: string[];
};

const BLANK_FORM: BranchForm = { name: '', mgr: '', tankIds: [], lpgIds: [], pumpIds: [] };

export default function BranchesScreen() {
  const {
    role, branches, addBranch, updateBranch, deleteBranch,
    tanks, lpgTanks, pumps, updateTank, updateLpgTank, updatePump,
    sales,
  } = useApp();
  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'csm'] || colors.primary;
  const isAdmin   = role === 'admin';

  const { total: totalRev, byBranch: branchRev } = salesRevenueByBranch(sales);
  const activeCount = branches.filter(b => b.st === 'Active').length;

  /* ── helpers to get assets assigned to a branch ── */
  const tanksFor    = (bid: string) => tanks.filter(t => t.branchId === bid);
  const lpgFor      = (bid: string) => lpgTanks.filter(l => l.branchId === bid);
  const pumpsFor    = (bid: string) => pumps.filter(p => p.branchId === bid);

  /* ── persist branch assignments ──
     When saving, update branchId on every tank/pump:
     - Selected in this branch  → set branchId = branchId
     - Was assigned here but deselected → clear branchId  */
  function applyAssignments(
    branchId: string,
    form: BranchForm,
    prevTankIds: string[],
    prevLpgIds: string[],
    prevPumpIds: string[],
  ) {
    // tanks
    const allTankIds = [...new Set([...form.tankIds, ...prevTankIds])];
    for (const id of allTankIds) {
      const isSelected = form.tankIds.includes(id);
      const wasHere    = prevTankIds.includes(id);
      if (isSelected) updateTank(id, { branchId });
      else if (wasHere) updateTank(id, { branchId: undefined });
    }
    // lpg tanks
    const allLpgIds = [...new Set([...form.lpgIds, ...prevLpgIds])];
    for (const id of allLpgIds) {
      const isSelected = form.lpgIds.includes(id);
      const wasHere    = prevLpgIds.includes(id);
      if (isSelected) updateLpgTank(id, { branchId });
      else if (wasHere) updateLpgTank(id, { branchId: undefined });
    }
    // pumps
    const allPumpIds = [...new Set([...form.pumpIds, ...prevPumpIds])];
    for (const id of allPumpIds) {
      const isSelected = form.pumpIds.includes(id);
      const wasHere    = prevPumpIds.includes(id);
      if (isSelected) updatePump(id, { branchId });
      else if (wasHere) updatePump(id, { branchId: undefined });
    }
  }

  /* ── Add form ──────────────────────────────────────────────────────────── */
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm]         = useState<BranchForm>(BLANK_FORM);

  function handleAdd() {
    if (!addForm.name.trim()) { Alert.alert('Required', 'Branch name is required.'); return; }
    const newBranch = addBranch({
      name:  addForm.name.trim(),
      st:    isAdmin ? 'Active' : 'Pending',
      rev:   0,
      mgr:   addForm.mgr.trim(),
      pumps: addForm.pumpIds.length,
      tanks: addForm.tankIds.length + addForm.lpgIds.length,
    });
    // addBranch returns the generated id immediately, so assignments do not
    // depend on a stale render's `branches` array.
    applyAssignments(newBranch.id, addForm, [], [], []);
    setAddForm(BLANK_FORM);
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

  /* ── Edit form ─────────────────────────────────────────────────────────── */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm,  setEditForm]  = useState<BranchForm>(BLANK_FORM);

  function openEdit(b: typeof branches[number]) {
    setEditForm({
      name:    b.name,
      mgr:     b.mgr || '',
      tankIds: tanksFor(b.id).map(t => t.id),
      lpgIds:  lpgFor(b.id).map(l => l.id),
      pumpIds: pumpsFor(b.id).map(p => p.id),
    });
    setEditingId(b.id);
  }

  function handleSaveEdit() {
    if (!editForm.name.trim()) { Alert.alert('Required', 'Branch name cannot be empty.'); return; }
    if (!editingId) return;
    const bid = editingId;
    const prevTankIds = tanksFor(bid).map(t => t.id);
    const prevLpgIds  = lpgFor(bid).map(l => l.id);
    const prevPumpIds = pumpsFor(bid).map(p => p.id);

    updateBranch(bid, {
      name:  editForm.name.trim(),
      mgr:   editForm.mgr.trim(),
      pumps: editForm.pumpIds.length,
      tanks: editForm.tankIds.length + editForm.lpgIds.length,
    });
    applyAssignments(bid, editForm, prevTankIds, prevLpgIds, prevPumpIds);
    setEditingId(null);
    Alert.alert('Updated', 'Branch and assignments saved.');
  }

  /* ── Suspend / Delete ──────────────────────────────────────────────────── */
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
        { text: 'Delete', style: 'destructive', onPress: () => {
          // Unassign all items from this branch before deleting
          tanksFor(b.id).forEach(t => updateTank(t.id, { branchId: undefined }));
          lpgFor(b.id).forEach(l => updateLpgTank(l.id, { branchId: undefined }));
          pumpsFor(b.id).forEach(p => updatePump(p.id, { branchId: undefined }));
          deleteBranch(b.id);
        }},
      ]
    );
  }

  /* ── picker item lists ── */
  const tankItems = tanks.map(t => ({ id: t.id, label: `${t.name} (${t.prod})` }));
  const lpgItems  = lpgTanks.map(l => ({ id: l.id, label: l.name }));
  const pumpItems = pumps.map(p => ({ id: p.id, label: `${p.name} (${p.prod})` }));

  /* ── render ────────────────────────────────────────────────────────────── */
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
          const st           = ST_STYLES[b.st] || ST_STYLES.Pending;
          const assignedTanks = tanksFor(b.id);
          const assignedLpg   = lpgFor(b.id);
          const assignedPumps = pumpsFor(b.id);
          return (
            <View key={b.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: b.st === 'Suspended' ? colors.warningBorder : colors.border }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.branchIcon, { backgroundColor: roleColor + '18' }]}>
                  <Ionicons name="business" size={20} color={roleColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.branchName, { color: colors.text }]}>{b.name}</Text>
                  <Text style={[styles.branchIdText, { color: colors.textMuted }]}>ID: {b.id}</Text>
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

              {/* Assigned tanks */}
              {(assignedTanks.length > 0 || assignedLpg.length > 0) && (
                <View style={styles.assetSection}>
                  <Text style={[styles.assetSectionLabel, { color: colors.textMuted }]}>
                    <Ionicons name="cube-outline" size={11} /> Tanks
                  </Text>
                  <View style={styles.assetChipRow}>
                    {assignedTanks.map(t => (
                      <View key={t.id} style={[styles.assetChip, { backgroundColor: roleColor + '12', borderColor: roleColor + '30' }]}>
                        <Text style={[styles.assetChipText, { color: roleColor }]}>{t.name}</Text>
                        <Text style={[styles.assetChipSub, { color: roleColor + 'BB' }]}>{t.prod}</Text>
                      </View>
                    ))}
                    {assignedLpg.map(l => (
                      <View key={l.id} style={[styles.assetChip, { backgroundColor: '#1F684812', borderColor: '#1F684830' }]}>
                        <Text style={[styles.assetChipText, { color: '#1F6848' }]}>{l.name}</Text>
                        <Text style={[styles.assetChipSub, { color: '#1F6848BB' }]}>LPG</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Assigned pumps */}
              {assignedPumps.length > 0 && (
                <View style={styles.assetSection}>
                  <Text style={[styles.assetSectionLabel, { color: colors.textMuted }]}>
                    <Ionicons name="water-outline" size={11} /> Pumps
                  </Text>
                  <View style={styles.assetChipRow}>
                    {assignedPumps.map(p => (
                      <View key={p.id} style={[styles.assetChip, { backgroundColor: colors.infoBg, borderColor: colors.border }]}>
                        <Text style={[styles.assetChipText, { color: colors.text }]}>{p.name}</Text>
                        <Text style={[styles.assetChipSub, { color: colors.textMuted }]}>{p.prod}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Fallback when nothing assigned yet */}
              {assignedTanks.length === 0 && assignedLpg.length === 0 && assignedPumps.length === 0 && (
                <Text style={[styles.noAssignments, { color: colors.textSubtle }]}>
                  No tanks or pumps assigned yet
                </Text>
              )}

              {(branchRev[b.id] ?? 0) > 0 && (
                <View style={styles.statsRow}>
                  <View style={[styles.statItem, { backgroundColor: roleColor + '12' }]}>
                    <Ionicons name="trending-up" size={14} color={roleColor} />
                    <Text style={[styles.statVal, { color: roleColor }]}>{fmt(branchRev[b.id] ?? 0)}</Text>
                  </View>
                </View>
              )}

              {isAdmin && (
                <View style={styles.adminActions}>
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
          <KeyboardAwareScrollViewCompat
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 520 }}
            bottomOffset={24}
          >
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Branch Name *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="e.g. Lekki Station"
              placeholderTextColor={colors.textSubtle}
              value={addForm.name}
              onChangeText={v => setAddForm(f => ({ ...f, name: v }))}
              autoCorrect={false}
            />
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Manager Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="e.g. Chukwuemeka Obi"
              placeholderTextColor={colors.textSubtle}
              value={addForm.mgr}
              onChangeText={v => setAddForm(f => ({ ...f, mgr: v }))}
              autoCorrect={false}
            />
            <AssetPicker
              label="Petroleum Tanks"
              items={tankItems}
              selected={addForm.tankIds}
              onToggle={id => setAddForm(f => ({ ...f, tankIds: toggle(f.tankIds, id) }))}
              accent={roleColor}
              colors={colors}
            />
            <AssetPicker
              label="LPG Tanks"
              items={lpgItems}
              selected={addForm.lpgIds}
              onToggle={id => setAddForm(f => ({ ...f, lpgIds: toggle(f.lpgIds, id) }))}
              accent="#1F6848"
              colors={colors}
            />
            <AssetPicker
              label="Pumps"
              items={pumpItems}
              selected={addForm.pumpIds}
              onToggle={id => setAddForm(f => ({ ...f, pumpIds: toggle(f.pumpIds, id) }))}
              accent={roleColor}
              colors={colors}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleAdd}>
                <Text style={styles.submitBtnText}>Add Branch</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => { setShowAddForm(false); setAddForm(BLANK_FORM); }}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 24 }} />
          </KeyboardAwareScrollViewCompat>
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
          <KeyboardAwareScrollViewCompat
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 520 }}
            bottomOffset={24}
          >
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Branch Name *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="Branch name"
              placeholderTextColor={colors.textSubtle}
              value={editForm.name}
              onChangeText={v => setEditForm(f => ({ ...f, name: v }))}
              autoCorrect={false}
            />
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Manager Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="Manager name"
              placeholderTextColor={colors.textSubtle}
              value={editForm.mgr}
              onChangeText={v => setEditForm(f => ({ ...f, mgr: v }))}
              autoCorrect={false}
            />
            <AssetPicker
              label="Petroleum Tanks"
              items={tankItems}
              selected={editForm.tankIds}
              onToggle={id => setEditForm(f => ({ ...f, tankIds: toggle(f.tankIds, id) }))}
              accent={roleColor}
              colors={colors}
            />
            <AssetPicker
              label="LPG Tanks"
              items={lpgItems}
              selected={editForm.lpgIds}
              onToggle={id => setEditForm(f => ({ ...f, lpgIds: toggle(f.lpgIds, id) }))}
              accent="#1F6848"
              colors={colors}
            />
            <AssetPicker
              label="Pumps"
              items={pumpItems}
              selected={editForm.pumpIds}
              onToggle={id => setEditForm(f => ({ ...f, pumpIds: toggle(f.pumpIds, id) }))}
              accent={roleColor}
              colors={colors}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleSaveEdit}>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>Save Changes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setEditingId(null)}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 24 }} />
          </KeyboardAwareScrollViewCompat>
        </View>
      </ModalSheet>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll:           { padding: 16 },
  readonlyBanner:   { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 14 },
  readonlyText:     { flex: 1, fontSize: 12 },
  metricsRow:       { flexDirection: 'row', gap: 8, marginBottom: 16 },
  metricCard:       { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1 },
  metricValue:      { fontSize: 18, fontWeight: '700' },
  metricLabel:      { fontSize: 11, marginTop: 2 },
  card:             { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10, gap: 10 },
  cardHeader:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  branchIcon:       { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  branchName:       { fontSize: 15, fontWeight: '700' },
  branchIdText:     { fontSize: 11, marginTop: 1 },
  stBadge:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  stText:           { fontSize: 11, fontWeight: '700' },
  infoRow:          { flexDirection: 'row', alignItems: 'center', gap: 5 },
  infoText:         { fontSize: 12 },
  statsRow:         { flexDirection: 'row', gap: 6 },
  statItem:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  statVal:          { fontSize: 12, fontWeight: '600' },
  assetSection:     { gap: 4 },
  assetSectionLabel:{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  assetChipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  assetChip:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  assetChipText:    { fontSize: 12, fontWeight: '600' },
  assetChipSub:     { fontSize: 10 },
  noAssignments:    { fontSize: 11, fontStyle: 'italic' },
  adminActions:     { flexDirection: 'row', gap: 6, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e5e3' },
  actionBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  actionBtnText:    { fontSize: 11, fontWeight: '600' },
  headerBtn:        { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  modalCard:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 10 },
  modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle:       { fontSize: 18, fontWeight: '700' },
  fieldLabel:       { fontSize: 11, fontWeight: '600', marginBottom: 3 },
  input:            { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 10 },
  submitBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  submitBtnText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn:        { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#e5e5e3' },
  cancelBtnText:    { fontSize: 14, fontWeight: '600' },
});
