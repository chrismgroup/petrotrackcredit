import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { ModalSheet } from '@/components/FormSheet';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

import { ScreenLayout } from '@/components/ScreenLayout';
import { Department, ROLE_COLORS, ROLE_LABELS, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const ICON_OPTIONS = [
  'construct', 'briefcase', 'calculator', 'megaphone', 'business', 'build',
  'bar-chart', 'water', 'people', 'shield-checkmark', 'document-text', 'cash',
  'analytics', 'flask', 'leaf', 'hardware-chip', 'car', 'storefront',
];

const COLOR_PRESETS: { bg: string; fg: string; label: string }[] = [
  { bg: '#E5F1E9', fg: '#1F6848', label: 'Green' },
  { bg: '#EAF2ED', fg: '#225B40', label: 'Blue' },
  { bg: '#EDF3EE', fg: '#3C3489', label: 'Purple' },
  { bg: '#EDF3EE', fg: '#712B13', label: 'Orange' },
  { bg: '#E1F5EE', fg: '#085041', label: 'Teal' },
  { bg: '#EEF2E4', fg: '#49614F', label: 'Amber' },
  { bg: '#E9F0EB', fg: '#365A47', label: 'Red' },
  { bg: '#F1F5EF', fg: '#333333', label: 'Grey' },
];

const ALL_ROLES = ['ceo', 'md', 'mktg', 'csm', 'acc', 'mgr', 'att'] as const;
const BLANK_FORM = { name: '', icon: 'briefcase', col: COLOR_PRESETS[0], roles: [] as string[] };

type FormState = typeof BLANK_FORM;

function DeptFormModal({
  visible, title, form, setForm, onSave, onClose, roleColor, colors,
}: {
  visible: boolean; title: string;
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSave: () => void; onClose: () => void;
  roleColor: string; colors: any;
}) {
  function toggleRole(r: string) {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(r) ? f.roles.filter(x => x !== r) : [...f.roles, r],
    }));
  }

  return (
    <ModalSheet visible={visible} onClose={onClose}>
      <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>

          <KeyboardAwareScrollViewCompat
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            bottomOffset={24}
          >
              {/* Name */}
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="Department name *"
                placeholderTextColor={colors.textSubtle}
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
                autoFocus={false}
              />

              {/* Icon picker */}
              <Text style={[styles.label, { color: colors.textMuted }]}>Icon</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {ICON_OPTIONS.map(ic => (
                    <TouchableOpacity
                      key={ic}
                      onPress={() => setForm(f => ({ ...f, icon: ic }))}
                      style={[styles.iconBtn, {
                        backgroundColor: form.icon === ic ? roleColor + '22' : colors.surface,
                        borderColor: form.icon === ic ? roleColor : colors.border,
                      }]}
                    >
                      <Ionicons name={ic as any} size={20} color={form.icon === ic ? roleColor : colors.textMuted} />
                    </TouchableOpacity>
                  ))}
              </View>

              {/* Color picker */}
              <Text style={[styles.label, { color: colors.textMuted }]}>Colour</Text>
              <View style={styles.colorRow}>
                {COLOR_PRESETS.map((c, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setForm(f => ({ ...f, col: c }))}
                    style={[styles.colorBtn, {
                      backgroundColor: c.bg,
                      borderColor: form.col.fg === c.fg ? c.fg : 'transparent',
                      borderWidth: form.col.fg === c.fg ? 2 : 1,
                    }]}
                  >
                    <View style={[styles.colorDot, { backgroundColor: c.fg }]} />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Role picker */}
              <Text style={[styles.label, { color: colors.textMuted }]}>Assign Roles</Text>
              <View style={styles.roleGrid}>
                {ALL_ROLES.map(r => {
                  const selected = form.roles.includes(r);
                  return (
                    <TouchableOpacity
                      key={r}
                      onPress={() => toggleRole(r)}
                      style={[styles.roleToggle, {
                        backgroundColor: selected ? ROLE_COLORS[r] + '18' : colors.surface,
                        borderColor: selected ? ROLE_COLORS[r] : colors.border,
                      }]}
                    >
                      <Text style={[styles.roleToggleText, { color: selected ? ROLE_COLORS[r] : colors.textMuted }]}>
                        {ROLE_LABELS[r] ?? r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, paddingBottom: 8 }}>
                <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={onSave}>
                  <Text style={styles.submitBtnText}>Save Department</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cancelBtn, { flex: 1, borderColor: colors.border }]} onPress={onClose}>
                  <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAwareScrollViewCompat>
          </View>
    </ModalSheet>
  );
}

export default function DepartmentsScreen() {
  const {
    role, departments, staff,
    addDepartment, updateDepartment, deleteDepartment, assignStaffDept,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'admin'] || colors.primary;
  const isAdmin = role === 'admin';
  const canManage = role === 'admin' || role === 'csm';

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(BLANK_FORM);

  const [editDept, setEditDept] = useState<Department | null>(null);
  const [editForm, setEditForm] = useState<FormState>(BLANK_FORM);

  /* ── staff posting modal ── */
  const [postingDept, setPostingDept] = useState<Department | null>(null);

  function handleCreate() {
    if (!createForm.name.trim()) { Alert.alert('Required', 'Department name is required.'); return; }
    addDepartment({ name: createForm.name.trim(), icon: createForm.icon, col: createForm.col, roles: createForm.roles });
    setCreateForm(BLANK_FORM);
    setShowCreate(false);
  }

  function openEdit(dept: Department) {
    setEditForm({ name: dept.name, icon: dept.icon, col: COLOR_PRESETS.find(c => c.fg === dept.col.fg) ?? COLOR_PRESETS[0], roles: [...dept.roles] });
    setEditDept(dept);
  }

  function handleEdit() {
    if (!editDept) return;
    if (!editForm.name.trim()) { Alert.alert('Required', 'Department name is required.'); return; }
    updateDepartment(editDept.id, { name: editForm.name.trim(), icon: editForm.icon, col: editForm.col, roles: editForm.roles });
    setEditDept(null);
  }

  function handleDelete(id: string, name: string) {
    Alert.alert('Delete Department', `Remove "${name}"? Staff assigned here will be unposted. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDepartment(id) },
    ]);
  }

  const staffInDept = (deptId: string) => staff.filter(m => m.dept === deptId);
  const unassigned = staff.filter(m => !m.dept);

  return (
    <ScreenLayout
      title="Departments"
      rightAction={isAdmin ? (
        <TouchableOpacity onPress={() => { setCreateForm(BLANK_FORM); setShowCreate(true); }} style={styles.headerBtn}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      ) : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Grid of department cards */}
        <View style={styles.grid}>
          {departments.length === 0 && (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="grid-outline" size={32} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No departments yet{isAdmin ? ' — tap + to create one' : ''}</Text>
            </View>
          )}
          {departments.map(dept => (
            <TouchableOpacity
              key={dept.id}
              onPress={() => canManage ? openEdit(dept) : undefined}
              activeOpacity={canManage ? 0.8 : 1}
              style={[styles.card, { backgroundColor: dept.col.bg, borderColor: dept.col.fg + '33' }]}
            >
              <View style={styles.cardTopRow}>
                <View style={[styles.icon, { backgroundColor: dept.col.fg + '22' }]}>
                  <Ionicons name={dept.icon as any} size={22} color={dept.col.fg} />
                </View>
                {isAdmin && !dept.sys && (
                  <TouchableOpacity onPress={() => handleDelete(dept.id, dept.name)} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={14} color={dept.col.fg + 'aa'} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.cardTitle, { color: dept.col.fg }]}>{dept.name}</Text>
              <Text style={[styles.cardRoles, { color: dept.col.fg + 'aa' }]}>
                {staffInDept(dept.id).length} staff · {dept.roles.length} role{dept.roles.length !== 1 ? 's' : ''}
              </Text>
              {dept.sys && (
                <View style={[styles.sysBadge, { backgroundColor: dept.col.fg + '22' }]}>
                  <Text style={[styles.sysText, { color: dept.col.fg }]}>System</Text>
                </View>
              )}
              {canManage && (
                <View style={[styles.editHint, { backgroundColor: dept.col.fg + '15' }]}>
                  <Ionicons name="pencil" size={10} color={dept.col.fg + '99'} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Staff Posting ── */}
        {canManage && departments.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Post Staff to Department</Text>
              <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{unassigned.length} unassigned</Text>
            </View>

            {departments.map(dept => {
              const members = staffInDept(dept.id);
              return (
                <View key={dept.id} style={[styles.deptRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.rowIcon, { backgroundColor: dept.col.fg + '18' }]}>
                    <Ionicons name={dept.icon as any} size={16} color={dept.col.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>{dept.name}</Text>
                      <Text style={[styles.memberCount, { color: dept.col.fg, backgroundColor: dept.col.bg }]}>{members.length}</Text>
                    </View>
                    {members.length === 0 ? (
                      <Text style={[styles.noRoles, { color: colors.textMuted }]}>No staff posted yet</Text>
                    ) : (
                      <View style={styles.rolesWrap}>
                        {members.map(m => (
                          <TouchableOpacity
                            key={m.id}
                            onPress={() => {
                              Alert.alert('Remove from Department', `Remove ${m.name} from ${dept.name}?`, [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Remove', style: 'destructive', onPress: () => assignStaffDept(m.id, null) },
                              ]);
                            }}
                            style={[styles.memberChip, { backgroundColor: dept.col.bg, borderColor: dept.col.fg + '44' }]}
                          >
                            <Text style={[styles.memberChipText, { color: dept.col.fg }]}>{m.name.split(' ')[0]}</Text>
                            <Ionicons name="close" size={10} color={dept.col.fg + 'aa'} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* Assign unassigned staff */}
                    {unassigned.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setPostingDept(dept)}
                        style={[styles.addMemberBtn, { borderColor: dept.col.fg + '55' }]}
                      >
                        <Ionicons name="person-add-outline" size={13} color={dept.col.fg} />
                        <Text style={[styles.addMemberText, { color: dept.col.fg }]}>Post staff here</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ── Role Access Overview ── */}
        <View style={[styles.sectionRow, { marginTop: 8 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Role Access Overview</Text>
          {canManage && <Text style={[styles.sectionCount, { color: colors.textMuted }]}>tap to edit</Text>}
        </View>
        {departments.map(dept => (
          <TouchableOpacity
            key={dept.id}
            onPress={() => canManage ? openEdit(dept) : undefined}
            activeOpacity={canManage ? 0.8 : 1}
            style={[styles.deptRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={[styles.rowIcon, { backgroundColor: dept.col.fg + '18' }]}>
              <Ionicons name={dept.icon as any} size={16} color={dept.col.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{dept.name}</Text>
              {dept.roles.length === 0 ? (
                <Text style={[styles.noRoles, { color: colors.textMuted }]}>No roles assigned{canManage ? ' — tap to edit' : ''}</Text>
              ) : (
                <View style={styles.rolesWrap}>
                  {dept.roles.map(r => (
                    <View key={r} style={[styles.roleChip, { backgroundColor: ROLE_COLORS[r] + '18', borderColor: ROLE_COLORS[r] + '44' }]}>
                      <Text style={[styles.roleChipText, { color: ROLE_COLORS[r] }]}>{r.toUpperCase()}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
            {canManage && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
          </TouchableOpacity>
        ))}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Create Department Modal ── */}
      <DeptFormModal
        visible={showCreate}
        title="New Department"
        form={createForm}
        setForm={setCreateForm}
        onSave={handleCreate}
        onClose={() => setShowCreate(false)}
        roleColor={roleColor}
        colors={colors}
      />

      {/* ── Edit Department Modal ── */}
      <DeptFormModal
        visible={!!editDept}
        title={`Edit: ${editDept?.name ?? ''}`}
        form={editForm}
        setForm={setEditForm}
        onSave={handleEdit}
        onClose={() => setEditDept(null)}
        roleColor={roleColor}
        colors={colors}
      />

      {/* ── Post Staff Modal ── */}
      <ModalSheet visible={!!postingDept} onClose={() => setPostingDept(null)}>
        {postingDept && (
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <View style={[styles.icon, { width: 36, height: 36, borderRadius: 10, backgroundColor: postingDept.col.fg + '22' }]}>
                <Ionicons name={postingDept.icon as any} size={18} color={postingDept.col.fg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]}>Post to {postingDept.name}</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>Select staff to assign</Text>
              </View>
              <TouchableOpacity onPress={() => setPostingDept(null)}>
                <Ionicons name="close-circle" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              {unassigned.length === 0 ? (
                <View style={{ alignItems: 'center', padding: 32 }}>
                  <Ionicons name="checkmark-circle" size={32} color={colors.success} />
                  <Text style={{ color: colors.textMuted, marginTop: 8, textAlign: 'center' }}>All staff have been assigned to departments</Text>
                </View>
              ) : (
                unassigned.map(m => (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => { assignStaffDept(m.id, postingDept.id); }}
                    style={[styles.staffPickRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={[styles.staffPickAvatar, { backgroundColor: ROLE_COLORS[m.role] + '22' }]}>
                      <Text style={[styles.staffPickAvatarText, { color: ROLE_COLORS[m.role] }]}>
                        {m.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.staffPickName, { color: colors.text }]}>{m.name}</Text>
                      <Text style={[styles.staffPickRole, { color: colors.textMuted }]}>{ROLE_LABELS[m.role] ?? m.role}</Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={22} color={postingDept.col.fg} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        )}
      </ModalSheet>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll:              { padding: 16 },
  headerBtn:           { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  grid:                { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  emptyCard:           { width: '100%', padding: 32, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 8 },
  emptyText:           { fontSize: 13, textAlign: 'center' },
  card:                { width: '47.5%', padding: 14, borderRadius: 14, borderWidth: 1, gap: 6, position: 'relative' },
  cardTopRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  icon:                { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deleteBtn:           { padding: 4 },
  editHint:            { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cardTitle:           { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  cardRoles:           { fontSize: 11 },
  sysBadge:            { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  sysText:             { fontSize: 9, fontWeight: '700' },
  sectionRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle:        { fontSize: 15, fontWeight: '700' },
  sectionCount:        { fontSize: 12 },
  deptRow:             { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  rowIcon:             { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  rowTitle:            { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  memberCount:         { fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  noRoles:             { fontSize: 11, fontStyle: 'italic' },
  rolesWrap:           { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  roleChip:            { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  roleChipText:        { fontSize: 9, fontWeight: '700' },
  memberChip:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, marginRight: 4, marginBottom: 4 },
  memberChipText:      { fontSize: 11, fontWeight: '600' },
  addMemberBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, paddingVertical: 5, paddingHorizontal: 8, borderWidth: 1, borderRadius: 8, alignSelf: 'flex-start', borderStyle: 'dashed' },
  addMemberText:       { fontSize: 11, fontWeight: '600' },
  overlay:             { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard:           { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 8, maxHeight: '92%' },
  modalTitle:          { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  input:               { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 4 },
  label:               { fontSize: 12, fontWeight: '600', marginTop: 4, marginBottom: 6 },
  iconBtn:             { width: 44, height: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  colorRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  colorBtn:            { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  colorDot:            { width: 16, height: 16, borderRadius: 8 },
  roleGrid:            { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  roleToggle:          { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  roleToggleText:      { fontSize: 11, fontWeight: '600' },
  submitBtn:           { alignItems: 'center', paddingVertical: 13, borderRadius: 12 },
  submitBtnText:       { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn:           { alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1 },
  cancelBtnText:       { fontSize: 14, fontWeight: '600' },
  staffPickRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  staffPickAvatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  staffPickAvatarText: { fontSize: 14, fontWeight: '700' },
  staffPickName:       { fontSize: 14, fontWeight: '600' },
  staffPickRole:       { fontSize: 12, marginTop: 1 },
});
