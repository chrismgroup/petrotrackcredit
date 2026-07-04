import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const ST_STYLES: Record<string, { color: string; bg: string }> = {
  Active: { color: '#27500A', bg: '#EAF3DE' },
  Pending: { color: '#BA7517', bg: '#FAEEDA' },
  Suspended: { color: '#791F1F', bg: '#FCEBEB' },
};

export default function BranchesScreen() {
  const { role, branches, addBranch } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'csm'] || colors.primary;
  const canAdd = role === 'admin' || role === 'csm' || role === 'md';
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', mgr: '', pumps: '2', tanks: '2' });

  const totalRev = branches.reduce((s, b) => s + b.rev, 0);
  const activeCount = branches.filter(b => b.st === 'Active').length;

  function handleAdd() {
    if (!form.name) { Alert.alert('Required', 'Branch name is required.'); return; }
    addBranch({ name: form.name, st: 'Pending', rev: 0, mgr: form.mgr, pumps: parseInt(form.pumps) || 2, tanks: parseInt(form.tanks) || 2 });
    setForm({ name: '', mgr: '', pumps: '2', tanks: '2' });
    setShowForm(false);
  }

  return (
    <ScreenLayout title="Branches"
      rightAction={canAdd ? (
        <TouchableOpacity onPress={() => setShowForm(true)} style={styles.headerBtn}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      ) : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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
            <View key={b.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
            </View>
          );
        })}
        <View style={{ height: 16 }} />
      </ScrollView>

      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowForm(false)}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add Branch</Text>
            {[
              { key: 'name', label: 'Branch Name *' }, { key: 'mgr', label: 'Manager Name' },
              { key: 'pumps', label: 'Pump Count', kb: 'numeric' as const },
              { key: 'tanks', label: 'Tank Count', kb: 'numeric' as const },
            ].map(f => (
              <TextInput key={f.key} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder={f.label} placeholderTextColor={colors.textSubtle}
                keyboardType={f.kb} value={(form as any)[f.key]}
                onChangeText={v => setForm(fr => ({ ...fr, [f.key]: v }))} />
            ))}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleAdd}>
                <Text style={styles.submitBtnText}>Add Branch</Text>
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
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  metricCard: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1 },
  metricValue: { fontSize: 18, fontWeight: '700' },
  metricLabel: { fontSize: 11, marginTop: 2 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  branchIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  branchName: { fontSize: 15, fontWeight: '700' },
  branchId: { fontSize: 11, marginTop: 1 },
  stBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  stText: { fontSize: 11, fontWeight: '700' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  infoText: { fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: 6 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  statVal: { fontSize: 12, fontWeight: '600' },
  headerBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  submitBtn: { alignItems: 'center', paddingVertical: 13, borderRadius: 12 },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#e5e5e3' },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
});
