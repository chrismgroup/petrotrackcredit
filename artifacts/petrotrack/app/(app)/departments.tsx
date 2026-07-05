import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, ROLE_LABELS, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const ICON_OPTIONS = [
  'construct', 'briefcase', 'calculator', 'megaphone', 'business', 'build',
  'bar-chart', 'water', 'people', 'shield-checkmark', 'document-text', 'cash',
  'analytics', 'flask', 'leaf', 'hardware-chip', 'car', 'storefront',
];

const COLOR_PRESETS: { bg: string; fg: string; label: string }[] = [
  { bg: '#EAF3DE', fg: '#27500A', label: 'Green' },
  { bg: '#E6F1FB', fg: '#0C447C', label: 'Blue' },
  { bg: '#EEEDFE', fg: '#3C3489', label: 'Purple' },
  { bg: '#FAECE7', fg: '#712B13', label: 'Orange' },
  { bg: '#E1F5EE', fg: '#085041', label: 'Teal' },
  { bg: '#FAEEDA', fg: '#633806', label: 'Amber' },
  { bg: '#FCEBEB', fg: '#791F1F', label: 'Red' },
  { bg: '#F0F0F0', fg: '#333333', label: 'Grey' },
];

const ALL_ROLES = ['ceo', 'md', 'mktg', 'csm', 'acc', 'mgr', 'att'] as const;

const BLANK_FORM = { name: '', icon: 'briefcase', col: COLOR_PRESETS[0], roles: [] as string[] };

export default function DepartmentsScreen() {
  const { role, departments, staff, addDepartment, deleteDepartment } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'admin'] || colors.primary;
  const isAdmin = role === 'admin';

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);

  function toggleRole(r: string) {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(r) ? f.roles.filter(x => x !== r) : [...f.roles, r],
    }));
  }

  function handleCreate() {
    if (!form.name.trim()) { Alert.alert('Required', 'Department name is required.'); return; }
    addDepartment({ name: form.name.trim(), icon: form.icon, col: form.col, roles: form.roles });
    setForm(BLANK_FORM);
    setShowModal(false);
  }

  function handleDelete(id: string, name: string) {
    Alert.alert('Delete Department', `Remove "${name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDepartment(id) },
    ]);
  }

  return (
    <ScreenLayout
      title="Departments"
      rightAction={isAdmin ? (
        <TouchableOpacity onPress={() => setShowModal(true)} style={styles.headerBtn}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      ) : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Grid of department cards */}
        <View style={styles.grid}>
          {departments.map(dept => (
            <View key={dept.id} style={[styles.card, { backgroundColor: dept.col.bg, borderColor: dept.col.fg + '33' }]}>
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
                {dept.roles.length} role{dept.roles.length !== 1 ? 's' : ''}
              </Text>
              {dept.sys && (
                <View style={[styles.sysBadge, { backgroundColor: dept.col.fg + '22' }]}>
                  <Text style={[styles.sysText, { color: dept.col.fg }]}>System</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Role access matrix */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Role Access Overview</Text>
        {departments.map(dept => (
          <View key={dept.id} style={[styles.deptRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.rowIcon, { backgroundColor: dept.col.fg + '18' }]}>
              <Ionicons name={dept.icon as any} size={16} color={dept.col.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{dept.name}</Text>
              {dept.roles.length === 0 ? (
                <Text style={[styles.noRoles, { color: colors.textMuted }]}>No roles assigned</Text>
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
          </View>
        ))}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Create department modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowModal(false)}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New Department</Text>

            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="Department name *"
              placeholderTextColor={colors.textSubtle}
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
            />

            {/* Icon picker */}
            <Text style={[styles.label, { color: colors.textMuted }]}>Icon</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
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
            </ScrollView>

            {/* Color picker */}
            <Text style={[styles.label, { color: colors.textMuted }]}>Colour</Text>
            <View style={styles.colorRow}>
              {COLOR_PRESETS.map((c, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setForm(f => ({ ...f, col: c }))}
                  style={[styles.colorBtn, {
                    backgroundColor: c.bg,
                    borderColor: form.col === c ? c.fg : 'transparent',
                    borderWidth: form.col === c ? 2 : 1,
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

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleCreate}>
                <Text style={styles.submitBtnText}>Create Department</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1, borderColor: colors.border }]} onPress={() => setShowModal(false)}>
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
  scroll: { padding: 16 },
  headerBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  card: { width: '47.5%', padding: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { padding: 4 },
  cardTitle: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  cardRoles: { fontSize: 11 },
  sysBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  sysText: { fontSize: 9, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  deptRow: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  rowTitle: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  noRoles: { fontSize: 11, fontStyle: 'italic' },
  rolesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  roleChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  roleChipText: { fontSize: 9, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 8, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  iconBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  colorBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  colorDot: { width: 16, height: 16, borderRadius: 8 },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  roleToggle: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  roleToggleText: { fontSize: 11, fontWeight: '600' },
  submitBtn: { alignItems: 'center', paddingVertical: 13, borderRadius: 12 },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1 },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
});
