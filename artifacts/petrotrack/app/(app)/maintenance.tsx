import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmtDate, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const PRI_COLORS: Record<string, { bg: string; fg: string }> = {
  Urgent: { bg: '#FCEBEB', fg: '#791F1F' },
  Medium: { bg: '#FAEEDA', fg: '#633806' },
  Low: { bg: '#EAF3DE', fg: '#27500A' },
};

export default function MaintenanceScreen() {
  const { role, maintenance, addMaintenance, updateMaintenance, deleteMaintenance, userName } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;
  const canSubmit = role === 'mgr' || role === 'att' || role === 'csm' || role === 'admin';
  const canManage = canSubmit || role === 'md';

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', pri: 'Urgent' as 'Urgent' | 'Medium' | 'Low' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPri, setEditPri] = useState<'Urgent' | 'Medium' | 'Low'>('Urgent');
  const [editCost, setEditCost] = useState('');

  const open = maintenance.filter(m => m.st === 'Open');
  const done = maintenance.filter(m => m.st === 'Done');

  function handleSubmit() {
    if (!form.title.trim()) { Alert.alert('Required', 'Please enter a description.'); return; }
    addMaintenance({ title: form.title.trim(), pri: form.pri, by: userName, date: new Date().toISOString().slice(0, 10), st: 'Open' });
    setForm({ title: '', pri: 'Urgent' });
    setShowForm(false);
    Alert.alert('Submitted', 'Maintenance request logged.');
  }

  function startEdit(item: typeof maintenance[0]) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditPri(item.pri);
    setEditCost(item.cost !== undefined ? String(item.cost) : '');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle('');
    setEditPri('Urgent');
    setEditCost('');
  }

  function saveEdit(id: number) {
    if (!editTitle.trim()) {
      Alert.alert('Required', 'Please enter a description.');
      return;
    }
    const cost = parseFloat(editCost.replace(/,/g, ''));
    updateMaintenance(id, {
      title: editTitle.trim(),
      pri: editPri,
      cost: Number.isNaN(cost) ? undefined : cost,
    });
    cancelEdit();
  }

  function handleDelete(item: typeof maintenance[0]) {
    Alert.alert('Delete Maintenance?', `Remove "${item.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMaintenance(item.id) },
    ]);
  }

  return (
    <ScreenLayout title="Maintenance"
      rightAction={canSubmit ? (
        <TouchableOpacity onPress={() => setShowForm(f => !f)} style={styles.headerBtn}>
          <Ionicons name={showForm ? 'close' : 'add'} size={20} color="#fff" />
        </TouchableOpacity>
      ) : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {showForm && canSubmit && (
          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.formTitle, { color: colors.text }]}>New Maintenance Request</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
              placeholder="Describe the issue..."
              placeholderTextColor={colors.textSubtle}
              multiline numberOfLines={3}
              value={form.title}
              onChangeText={v => setForm(f => ({ ...f, title: v }))}
              textAlignVertical="top"
            />
            <Text style={[styles.formLabel, { color: colors.textMuted }]}>Priority</Text>
            <View style={styles.priRow}>
              {(['Urgent', 'Medium', 'Low'] as const).map(p => (
                <TouchableOpacity key={p} onPress={() => setForm(f => ({ ...f, pri: p }))}
                  style={[styles.priBtn, { backgroundColor: form.pri === p ? PRI_COLORS[p].fg : colors.background, borderColor: form.pri === p ? PRI_COLORS[p].fg : colors.border }]}>
                  <Text style={{ color: form.pri === p ? '#fff' : colors.textMuted, fontSize: 13, fontWeight: '600' }}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleSubmit} activeOpacity={0.85}>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>Submit Request</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1, borderColor: colors.border }]} onPress={() => setShowForm(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={[styles.summaryRow]}>
          <View style={[styles.summaryCard, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
            <Text style={[styles.summaryNum, { color: colors.error }]}>{open.length}</Text>
            <Text style={[styles.summaryLabel, { color: colors.error }]}>Open</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
            <Text style={[styles.summaryNum, { color: colors.warning }]}>{open.filter(m => m.pri === 'Urgent').length}</Text>
            <Text style={[styles.summaryLabel, { color: colors.warning }]}>Urgent</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.successBg, borderColor: colors.successBorder }]}>
            <Text style={[styles.summaryNum, { color: colors.success }]}>{done.length}</Text>
            <Text style={[styles.summaryLabel, { color: colors.success }]}>Done</Text>
          </View>
        </View>

        {open.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Open Items</Text>
            {open.map(m => (
              <View key={m.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {editingId === m.id ? (
                  <>
                    <Text style={[styles.formTitle, { color: colors.text }]}>Edit Maintenance</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                      value={editTitle}
                      onChangeText={setEditTitle}
                      multiline
                      numberOfLines={2}
                      textAlignVertical="top"
                    />
                    <Text style={[styles.formLabel, { color: colors.textMuted }]}>Priority</Text>
                    <View style={styles.priRow}>
                      {(['Urgent', 'Medium', 'Low'] as const).map(p => (
                        <TouchableOpacity key={p} onPress={() => setEditPri(p)}
                          style={[styles.priBtn, { backgroundColor: editPri === p ? PRI_COLORS[p].fg : colors.background, borderColor: editPri === p ? PRI_COLORS[p].fg : colors.border }]}>
                          <Text style={{ color: editPri === p ? '#fff' : colors.textMuted, fontSize: 13, fontWeight: '600' }}>{p}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={[styles.formLabel, { color: colors.textMuted }]}>Cost (₦)</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text, minHeight: 44 }]}
                      value={editCost}
                      onChangeText={setEditCost}
                      keyboardType="decimal-pad"
                      placeholder="Optional"
                      placeholderTextColor={colors.textSubtle}
                    />
                    <View style={styles.actionRow}>
                      <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={() => saveEdit(m.id)}>
                        <Text style={styles.submitBtnText}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.cancelBtn, { flex: 1, borderColor: colors.border }]} onPress={cancelEdit}>
                        <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.cardHeader}>
                      <Text style={[styles.cardTitle, { color: colors.text }]}>{m.title}</Text>
                      <View style={[styles.priBadge, { backgroundColor: PRI_COLORS[m.pri].bg }]}>
                        <Text style={[styles.priText, { color: PRI_COLORS[m.pri].fg }]}>{m.pri}</Text>
                      </View>
                    </View>
                    <View style={styles.cardMeta}>
                      <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                      <Text style={[styles.metaText, { color: colors.textMuted }]}>by {m.by}</Text>
                      <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                      <Text style={[styles.metaText, { color: colors.textMuted }]}>{fmtDate(m.date)}</Text>
                    </View>
                    {canManage && (
                      <View style={styles.actionRow}>
                        <TouchableOpacity style={[styles.outlineAction, { borderColor: roleColor, backgroundColor: roleColor + '12' }]} onPress={() => startEdit(m)}>
                          <Ionicons name="create-outline" size={15} color={roleColor} />
                          <Text style={[styles.outlineActionText, { color: roleColor }]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.outlineAction, { borderColor: '#A32D2D', backgroundColor: '#FCEBEB' }]} onPress={() => handleDelete(m)}>
                          <Ionicons name="trash-outline" size={15} color="#A32D2D" />
                          <Text style={[styles.outlineActionText, { color: '#A32D2D' }]}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>
            ))}
          </>
        )}

        {done.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 8 }]}>Completed</Text>
            {done.map(m => (
              <View key={m.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: 0.75 }]}>
                <View style={styles.cardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{m.title}</Text>
                  </View>
                  {m.cost !== undefined && <Text style={[styles.costText, { color: colors.success }]}>₦{m.cost.toLocaleString()}</Text>}
                </View>
                <View style={styles.cardMeta}>
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>by {m.by}</Text>
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>{fmtDate(m.date)}</Text>
                </View>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 16 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  formCard: { padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 16, gap: 10 },
  formTitle: { fontSize: 15, fontWeight: '700' },
  formLabel: { fontSize: 12, fontWeight: '500' },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 80 },
  priRow: { flexDirection: 'row', gap: 8 },
  priBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  outlineAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5 },
  outlineActionText: { fontSize: 13, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  summaryNum: { fontSize: 24, fontWeight: '700' },
  summaryLabel: { fontSize: 12, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  card: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8, gap: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: '600', flex: 1 },
  priBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priText: { fontSize: 11, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  metaText: { fontSize: 11 },
  costText: { fontSize: 14, fontWeight: '700' },
  headerBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
});
