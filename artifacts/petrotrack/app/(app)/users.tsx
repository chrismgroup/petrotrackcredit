import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const ROLE_OPTIONS = ['CEO', 'Managing Director', 'Marketing Manager', 'Corp. Services Mgr', 'Accountant', 'Station Manager', 'Pump Attendant'];

export default function UsersScreen() {
  const { role, staff, addStaff, toggleStaff } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'admin'] || colors.primary;
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', role: 'Station Manager', email: '', sal: '' });
  const [search, setSearch] = useState('');

  const filtered = staff.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.role.toLowerCase().includes(search.toLowerCase()));

  function handleAdd() {
    if (!form.name || !form.email) { Alert.alert('Required', 'Name and email are required.'); return; }
    addStaff({ name: form.name, role: form.role, email: form.email, sal: parseFloat(form.sal) || 0, st: 'Active' });
    setForm({ name: '', role: 'Station Manager', email: '', sal: '' });
    setShowForm(false);
  }

  return (
    <ScreenLayout title="Users"
      rightAction={
        <TouchableOpacity onPress={() => setShowForm(true)} style={styles.headerBtn}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      }
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search users..."
            placeholderTextColor={colors.textSubtle}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: roleColor }]}>{staff.filter(s => s.st === 'Active').length}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Active</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: colors.warning }]}>{staff.filter(s => s.st === 'Suspended').length}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Suspended</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: colors.text }]}>{staff.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total</Text>
          </View>
        </View>

        {filtered.map(s => (
          <View key={s.id} style={[styles.userCard, { backgroundColor: colors.surface, borderColor: s.st === 'Active' ? colors.border : colors.warningBorder }]}>
            <View style={[styles.avatar, { backgroundColor: s.st === 'Active' ? roleColor : colors.textSubtle }]}>
              <Text style={styles.avatarText}>{s.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: colors.text }]}>{s.name}</Text>
              <Text style={[styles.userRole, { color: colors.textMuted }]}>{s.role}</Text>
              <Text style={[styles.userEmail, { color: colors.textSubtle }]}>{s.email}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <View style={[styles.stBadge, { backgroundColor: s.st === 'Active' ? colors.successBg : colors.warningBg }]}>
                <Text style={[styles.stText, { color: s.st === 'Active' ? colors.success : colors.warning }]}>{s.st}</Text>
              </View>
              <TouchableOpacity onPress={() => Alert.alert('Confirm', `${s.st === 'Active' ? 'Suspend' : 'Activate'} ${s.name}?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Confirm', onPress: () => toggleStaff(s.id) },
              ])} style={[styles.toggleBtn, { borderColor: colors.border }]}>
                <Ionicons name={s.st === 'Active' ? 'pause' : 'play'} size={12} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <View style={{ height: 16 }} />
      </ScrollView>

      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowForm(false)}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add Staff Member</Text>
            {[{ key: 'name', label: 'Full Name *' }, { key: 'email', label: 'Email Address *', kb: 'email-address' as const }, { key: 'sal', label: 'Monthly Salary (₦)', kb: 'numeric' as const }].map(f => (
              <TextInput key={f.key} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder={f.label} placeholderTextColor={colors.textSubtle}
                keyboardType={f.kb} value={(form as any)[f.key]}
                onChangeText={v => setForm(fr => ({ ...fr, [f.key]: v }))} />
            ))}
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Role</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {ROLE_OPTIONS.map(r => (
                  <TouchableOpacity key={r} onPress={() => setForm(f => ({ ...f, role: r }))} style={[styles.roleBtn, { backgroundColor: form.role === r ? roleColor : colors.surface, borderColor: form.role === r ? roleColor : colors.border }]}>
                    <Text style={{ color: form.role === r ? '#fff' : colors.textMuted, fontSize: 11, fontWeight: '600' }}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleAdd}>
                <Text style={styles.submitBtnText}>Add Staff</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setShowForm(false)}>
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
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 4 },
  searchInput: { flex: 1, fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 11, marginTop: 1 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  userName: { fontSize: 15, fontWeight: '600' },
  userRole: { fontSize: 12, marginTop: 1 },
  userEmail: { fontSize: 11, marginTop: 1 },
  stBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  stText: { fontSize: 10, fontWeight: '700' },
  toggleBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  headerBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  inputLabel: { fontSize: 12, fontWeight: '500' },
  roleBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  submitBtn: { alignItems: 'center', paddingVertical: 13, borderRadius: 12 },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#e5e5e3' },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
});
