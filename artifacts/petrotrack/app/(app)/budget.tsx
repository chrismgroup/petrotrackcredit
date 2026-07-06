import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import {
  ROLE_COLORS, fmt, fmtDateTime, useApp, type Budget,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const YEARS  = [2024, 2025, 2026, 2027];

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  fully_approved: { label: 'Approved',     color: '#27500A', bg: '#EAF3DE' },
  acc_forwarded:  { label: 'Under Review', color: '#0C447C', bg: '#E6F1FB' },
  submitted:      { label: 'Pending',      color: '#BA7517', bg: '#FAEEDA' },
  rejected:       { label: 'Rejected',     color: '#791F1F', bg: '#FCEBEB' },
};

const STEP_ICON:  Record<string, string> = { submit: 'create', forward: 'share-social', approve: 'checkmark-circle', reject: 'close-circle' };
const STEP_COLOR: Record<string, string> = { submit: '#185FA5', forward: '#185FA5', approve: '#27500A', reject: '#791F1F' };
const STEP_BG:    Record<string, string> = { submit: '#E6F1FB', forward: '#E6F1FB', approve: '#EAF3DE', reject: '#FCEBEB' };

export default function BudgetScreen() {
  const {
    role, userName, budgets,
    addBudget, forwardBudget, approveBudget, rejectBudget,
  } = useApp();

  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;

  const isCreator = role === 'mgr' || role === 'csm' || role === 'mktg';
  const isAcc     = role === 'acc';
  const isMD      = role === 'md';

  // ── Tab (acc / md only) ───────────────────────────────────────────────────
  const [tab, setTab] = useState<'pending' | 'all'>('pending');

  // ── Detail modal ──────────────────────────────────────────────────────────
  const [selected, setSelected]   = useState<Budget | null>(null);
  const [actionType, setActionType] = useState<'forward' | 'approve' | 'reject' | null>(null);
  const [actionNote, setActionNote] = useState('');

  // ── Create modal ──────────────────────────────────────────────────────────
  const [showCreate, setShowCreate]     = useState(false);
  const [createMonth, setCreateMonth]   = useState(new Date().getMonth());
  const [createYear, setCreateYear]     = useState(new Date().getFullYear());
  const [createItems, setCreateItems]   = useState<{ cat: string; amt: string }[]>([{ cat: '', amt: '' }]);

  // ── Visible list ──────────────────────────────────────────────────────────
  const pendingForAcc = budgets.filter(b => b.status === 'submitted');
  const pendingForMD  = budgets.filter(b => b.status === 'acc_forwarded');

  const displayList: Budget[] =
    isAcc   ? (tab === 'pending' ? pendingForAcc : budgets)
    : isMD  ? (tab === 'pending' ? pendingForMD  : budgets)
    : isCreator ? budgets.filter(b => b.by === role)
    : budgets;

  // ── Create budget ─────────────────────────────────────────────────────────
  function handleCreate() {
    const valid = createItems.filter(i => i.cat.trim() && parseFloat(i.amt) > 0);
    if (!valid.length) { Alert.alert('Add at least one item with a category and amount'); return; }
    const items = valid.map(i => ({ cat: i.cat.trim(), amt: parseFloat(i.amt) }));
    const total = items.reduce((s, i) => s + i.amt, 0);
    const label = `${MONTHS[createMonth]} ${createYear}`;
    addBudget({ month: createMonth + 1, year: createYear, label, by: role!, byName: userName, items, total, status: 'submitted' });
    setShowCreate(false);
    setCreateItems([{ cat: '', amt: '' }]);
    Alert.alert('Budget Submitted', `${label} budget sent to Accountant for review.`);
  }

  // ── Acc / MD action ───────────────────────────────────────────────────────
  function handleAction() {
    if (!selected || !actionType) return;
    if (!actionNote.trim()) { Alert.alert('Please add a note before confirming'); return; }
    if (actionType === 'forward')  forwardBudget(selected.id, actionNote.trim());
    if (actionType === 'approve')  approveBudget(selected.id, actionNote.trim());
    if (actionType === 'reject')   rejectBudget(selected.id, actionNote.trim());
    setActionType(null);
    setActionNote('');
    setSelected(null);
  }

  // ── Create item helpers ───────────────────────────────────────────────────
  function updateItem(i: number, field: 'cat' | 'amt', val: string) {
    setCreateItems(prev => prev.map((x, j) => j === i ? { ...x, [field]: val } : x));
  }
  function removeItem(i: number) {
    setCreateItems(prev => prev.filter((_, j) => j !== i));
  }
  const createTotal = createItems.reduce((s, i) => s + (parseFloat(i.amt) || 0), 0);

  return (
    <ScreenLayout title="Budget">

      {/* ── Tab bar (acc / md) ── */}
      {(isAcc || isMD) && (
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          {(['pending', 'all'] as const).map(t => {
            const count = t === 'pending' ? (isAcc ? pendingForAcc : pendingForMD).length : 0;
            return (
              <TouchableOpacity key={t} onPress={() => setTab(t)}
                style={[styles.tabBtn, { borderBottomColor: t === tab ? roleColor : 'transparent' }]}>
                <Text style={[styles.tabLabel, { color: t === tab ? roleColor : colors.textMuted, fontWeight: t === tab ? '700' : '400' }]}>
                  {t === 'pending' ? (isAcc ? 'Pending Review' : 'Awaiting Approval') : 'All Budgets'}
                </Text>
                {count > 0 && (
                  <View style={[styles.badge, { backgroundColor: roleColor }]}>
                    <Text style={styles.badgeText}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Budget list ── */}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {displayList.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="wallet-outline" size={44} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {isCreator ? 'No budgets yet. Tap + to create one.' : 'No budgets to review right now.'}
            </Text>
          </View>
        ) : (
          displayList.map(b => {
            const st = STATUS_MAP[b.status] || STATUS_MAP.submitted;
            return (
              <TouchableOpacity key={b.id} onPress={() => setSelected(b)} activeOpacity={0.85}
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{b.label} Budget</Text>
                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>By {b.byName} · {b.items.length} items</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>
                <Text style={[styles.cardTotal, { color: roleColor }]}>{fmt(b.total)}</Text>
                <View style={styles.stepDots}>
                  {[0,1,2,3].map(i => (
                    <View key={i} style={[styles.stepDot, { backgroundColor: i < b.workflow.length ? st.color : colors.border }]} />
                  ))}
                </View>
                <Text style={[styles.cardMeta, { color: colors.textMuted }]}>{b.workflow.length}/4 steps · tap to view</Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* ── FAB (creators) ── */}
      {isCreator && (
        <TouchableOpacity onPress={() => setShowCreate(true)} style={[styles.fab, { backgroundColor: roleColor }]}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ═══════════════════════════════ DETAIL MODAL ═══ */}
      <Modal visible={!!selected} animationType="slide" onRequestClose={() => { setSelected(null); setActionType(null); setActionNote(''); }}>
        {selected && (
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={[styles.modalHeader, { backgroundColor: roleColor, paddingTop: 52 }]}>
              <TouchableOpacity onPress={() => { setSelected(null); setActionType(null); setActionNote(''); }} style={styles.headerBack}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{selected.label} Budget</Text>
                <Text style={styles.modalSub}>{fmt(selected.total)} · {STATUS_MAP[selected.status]?.label}</Text>
              </View>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

                {/* Items */}
                <Text style={[styles.section, { color: colors.text }]}>Budget Items</Text>
                {selected.items.map((item, i) => (
                  <View key={i} style={[styles.itemRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.itemCat, { color: colors.text }]}>{item.cat}</Text>
                    <Text style={[styles.itemAmt, { color: roleColor }]}>{fmt(item.amt)}</Text>
                  </View>
                ))}
                <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.totalLabel, { color: colors.text }]}>TOTAL</Text>
                  <Text style={[styles.totalAmt, { color: roleColor }]}>{fmt(selected.total)}</Text>
                </View>

                {/* Workflow */}
                <Text style={[styles.section, { color: colors.text, marginTop: 20 }]}>Approval Workflow</Text>
                {selected.workflow.map((step, i) => (
                  <View key={i} style={styles.wfStep}>
                    <View style={styles.wfLeft}>
                      <View style={[styles.wfIcon, { backgroundColor: STEP_BG[step.action] || colors.infoBg }]}>
                        <Ionicons name={STEP_ICON[step.action] as any} size={15} color={STEP_COLOR[step.action] || colors.info} />
                      </View>
                      {i < selected.workflow.length - 1 && <View style={[styles.wfLine, { backgroundColor: colors.border }]} />}
                    </View>
                    <View style={styles.wfContent}>
                      <Text style={[styles.wfStage, { color: colors.text }]}>{step.stage}</Text>
                      <Text style={[styles.wfBy, { color: colors.textMuted }]}>by {step.by} · {fmtDateTime(step.dt)}</Text>
                      {!!step.note && <Text style={[styles.wfNote, { color: colors.textMuted }]}>{step.note}</Text>}
                    </View>
                  </View>
                ))}

                {/* ACC action buttons */}
                {isAcc && selected.status === 'submitted' && !actionType && (
                  <View style={[styles.actionBox, { backgroundColor: colors.infoBg, borderColor: colors.border }]}>
                    <Ionicons name="search" size={18} color={colors.info} />
                    <Text style={[styles.actionTitle, { color: colors.info }]}>Scrutiny Required</Text>
                    <Text style={[styles.actionSub, { color: colors.textMuted }]}>Review all line items, verify amounts, then forward to MD or reject.</Text>
                    <View style={styles.actionBtns}>
                      <TouchableOpacity onPress={() => setActionType('forward')} style={[styles.primaryBtn, { backgroundColor: '#185FA5' }]}>
                        <Ionicons name="share-social" size={15} color="#fff" />
                        <Text style={styles.primaryBtnText}>Forward to MD</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setActionType('reject')} style={[styles.outlineBtn, { borderColor: colors.error }]}>
                        <Text style={[styles.outlineBtnText, { color: colors.error }]}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* MD action buttons */}
                {isMD && selected.status === 'acc_forwarded' && !actionType && (
                  <View style={[styles.actionBox, { backgroundColor: '#EAF3DE', borderColor: colors.border }]}>
                    <Ionicons name="checkmark-done" size={18} color="#27500A" />
                    <Text style={[styles.actionTitle, { color: '#27500A' }]}>Final Approval</Text>
                    <Text style={[styles.actionSub, { color: colors.textMuted }]}>This budget has been reviewed by the Accountant. Your approval releases it.</Text>
                    <View style={styles.actionBtns}>
                      <TouchableOpacity onPress={() => setActionType('approve')} style={[styles.primaryBtn, { backgroundColor: '#1a6e3c' }]}>
                        <Ionicons name="checkmark" size={15} color="#fff" />
                        <Text style={styles.primaryBtnText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setActionType('reject')} style={[styles.outlineBtn, { borderColor: colors.error }]}>
                        <Text style={[styles.outlineBtnText, { color: colors.error }]}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Note input */}
                {!!actionType && (
                  <View style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.noteLabel, { color: colors.text }]}>
                      {actionType === 'forward' ? 'Scrutiny Note' : actionType === 'approve' ? 'Approval Note' : 'Rejection Reason'}
                    </Text>
                    <TextInput
                      value={actionNote} onChangeText={setActionNote}
                      placeholder={actionType === 'forward' ? 'e.g. Reviewed — all items verified. No corrections needed.' : 'Add a note…'}
                      placeholderTextColor={colors.textMuted}
                      multiline
                      style={[styles.noteInput, { color: colors.text, borderColor: colors.border }]}
                    />
                    <View style={styles.actionBtns}>
                      <TouchableOpacity onPress={handleAction}
                        style={[styles.primaryBtn, { backgroundColor: actionType === 'reject' ? colors.error : roleColor }]}>
                        <Text style={styles.primaryBtnText}>
                          {actionType === 'forward' ? 'Send to MD' : actionType === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setActionType(null); setActionNote(''); }}
                        style={[styles.outlineBtn, { borderColor: colors.border }]}>
                        <Text style={[styles.outlineBtnText, { color: colors.textMuted }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        )}
      </Modal>

      {/* ═══════════════════════════════ CREATE MODAL ═══ */}
      <Modal visible={showCreate} animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={[styles.modalHeader, { backgroundColor: roleColor, paddingTop: 52 }]}>
              <TouchableOpacity onPress={() => setShowCreate(false)} style={styles.headerBack}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>New Budget</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

              {/* Month picker */}
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Month</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                {MONTHS.map((m, i) => (
                  <TouchableOpacity key={m} onPress={() => setCreateMonth(i)}
                    style={[styles.chip, { backgroundColor: i === createMonth ? roleColor : colors.surface, borderColor: i === createMonth ? roleColor : colors.border }]}>
                    <Text style={[styles.chipText, { color: i === createMonth ? '#fff' : colors.text }]}>{m.slice(0, 3)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Year picker */}
              <Text style={[styles.fieldLabel, { color: colors.text, marginTop: 12 }]}>Year</Text>
              <View style={styles.yearRow}>
                {YEARS.map(y => (
                  <TouchableOpacity key={y} onPress={() => setCreateYear(y)}
                    style={[styles.chip, { backgroundColor: y === createYear ? roleColor : colors.surface, borderColor: y === createYear ? roleColor : colors.border }]}>
                    <Text style={[styles.chipText, { color: y === createYear ? '#fff' : colors.text }]}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Line items */}
              <View style={[styles.itemsHeader, { marginTop: 16 }]}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>Line Items</Text>
                <TouchableOpacity onPress={() => setCreateItems(prev => [...prev, { cat: '', amt: '' }])}
                  style={[styles.addBtn, { borderColor: roleColor }]}>
                  <Ionicons name="add" size={14} color={roleColor} />
                  <Text style={[styles.addBtnText, { color: roleColor }]}>Add item</Text>
                </TouchableOpacity>
              </View>

              {createItems.map((item, i) => (
                <View key={i} style={[styles.lineItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TextInput
                    value={item.cat}
                    onChangeText={v => updateItem(i, 'cat', v)}
                    placeholder="Category (e.g. Generator fuel)"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.catInput, { color: colors.text, borderBottomColor: colors.border }]}
                  />
                  <View style={styles.amtRow}>
                    <Text style={[styles.nairaSign, { color: colors.textMuted }]}>₦</Text>
                    <TextInput
                      value={item.amt}
                      onChangeText={v => updateItem(i, 'amt', v)}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                      style={[styles.amtInput, { color: colors.text }]}
                    />
                    {createItems.length > 1 && (
                      <TouchableOpacity onPress={() => removeItem(i)} style={styles.removeBtn}>
                        <Ionicons name="trash-outline" size={17} color={colors.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}

              {/* Total preview */}
              {createTotal > 0 && (
                <View style={[styles.totalPreview, { backgroundColor: roleColor + '14', borderColor: roleColor + '40' }]}>
                  <Text style={[styles.totalPreviewLabel, { color: colors.textMuted }]}>Budget Total</Text>
                  <Text style={[styles.totalPreviewAmt, { color: roleColor }]}>{fmt(createTotal)}</Text>
                </View>
              )}

              <TouchableOpacity onPress={handleCreate} style={[styles.submitBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>Submit to Accountant</Text>
              </TouchableOpacity>

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll:        { padding: 16 },
  tabBar:        { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6, borderBottomWidth: 2 },
  tabLabel:      { fontSize: 13 },
  badge:         { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  badgeText:     { color: '#fff', fontSize: 11, fontWeight: '700' },

  card:          { padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 12, gap: 8 },
  cardTop:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle:     { fontSize: 15, fontWeight: '700' },
  cardSub:       { fontSize: 12, marginTop: 2 },
  statusBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText:    { fontSize: 11, fontWeight: '700' },
  cardTotal:     { fontSize: 22, fontWeight: '700' },
  stepDots:      { flexDirection: 'row', gap: 4 },
  stepDot:       { width: 22, height: 6, borderRadius: 3 },
  cardMeta:      { fontSize: 11 },

  empty:         { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText:     { fontSize: 14, textAlign: 'center', maxWidth: 240 },

  fab:           { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6 },

  modalHeader:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  headerBack:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  modalTitle:    { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
  modalSub:      { color: 'rgba(255,255,255,0.65)', fontSize: 12 },

  section:       { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  itemRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  itemCat:       { fontSize: 14 },
  itemAmt:       { fontSize: 14, fontWeight: '600' },
  totalRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1.5, marginTop: 2 },
  totalLabel:    { fontSize: 14, fontWeight: '700' },
  totalAmt:      { fontSize: 18, fontWeight: '700' },

  wfStep:        { flexDirection: 'row', gap: 12, marginBottom: 8 },
  wfLeft:        { alignItems: 'center', width: 34 },
  wfIcon:        { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  wfLine:        { width: 2, flex: 1, marginTop: 4, minHeight: 18 },
  wfContent:     { flex: 1, paddingBottom: 8 },
  wfStage:       { fontSize: 13, fontWeight: '700' },
  wfBy:          { fontSize: 11, marginTop: 2 },
  wfNote:        { fontSize: 12, marginTop: 4, lineHeight: 17 },

  actionBox:     { padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 16, gap: 6 },
  actionTitle:   { fontSize: 14, fontWeight: '700' },
  actionSub:     { fontSize: 12, lineHeight: 17 },
  actionBtns:    { flexDirection: 'row', gap: 8, marginTop: 10 },
  primaryBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: 10 },
  primaryBtnText:{ color: '#fff', fontSize: 13, fontWeight: '700' },
  outlineBtn:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1 },
  outlineBtnText:{ fontSize: 13, fontWeight: '600' },

  noteCard:      { padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 16, gap: 8 },
  noteLabel:     { fontSize: 14, fontWeight: '700' },
  noteInput:     { minHeight: 80, borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 13, lineHeight: 19, textAlignVertical: 'top' },

  fieldLabel:    { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  chipRow:       { flexDirection: 'row', marginBottom: 4 },
  yearRow:       { flexDirection: 'row', gap: 8 },
  chip:          { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginRight: 6 },
  chipText:      { fontSize: 13, fontWeight: '600' },

  itemsHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  addBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  addBtnText:    { fontSize: 12, fontWeight: '600' },

  lineItem:      { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10, gap: 8 },
  catInput:      { fontSize: 14, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  amtRow:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nairaSign:     { fontSize: 14, fontWeight: '600' },
  amtInput:      { flex: 1, fontSize: 15, fontWeight: '600' },
  removeBtn:     { padding: 4 },

  totalPreview:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginVertical: 12 },
  totalPreviewLabel: { fontSize: 13, fontWeight: '600' },
  totalPreviewAmt:   { fontSize: 20, fontWeight: '700' },

  submitBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 4 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
