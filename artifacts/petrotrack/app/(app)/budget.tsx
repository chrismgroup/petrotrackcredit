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
  draft:          { label: 'Draft',        color: '#555',    bg: '#F0F0F0' },
  fully_approved: { label: 'Approved',     color: '#27500A', bg: '#EAF3DE' },
  acc_forwarded:  { label: 'Under Review', color: '#0C447C', bg: '#E6F1FB' },
  submitted:      { label: 'Awaiting MD',  color: '#BA7517', bg: '#FAEEDA' },
  rejected:       { label: 'Rejected',     color: '#791F1F', bg: '#FCEBEB' },
};

const STEP_ICON:  Record<string, string> = { submit: 'send', forward: 'share-social', approve: 'checkmark-circle', reject: 'close-circle' };
const STEP_COLOR: Record<string, string> = { submit: '#185FA5', forward: '#185FA5', approve: '#27500A', reject: '#791F1F' };
const STEP_BG:    Record<string, string> = { submit: '#E6F1FB', forward: '#E6F1FB', approve: '#EAF3DE', reject: '#FCEBEB' };

type LineItem = { cat: string; amt: string };

function blankItem(): LineItem { return { cat: '', amt: '' }; }

type ItemEditorProps = {
  items: LineItem[];
  setItems: React.Dispatch<React.SetStateAction<LineItem[]>>;
  roleColor: string;
};
function ItemEditor({ items, setItems, roleColor }: ItemEditorProps) {
  const colors = useColors();
  const total = items.reduce((s, i) => s + (parseFloat(i.amt) || 0), 0);

  function updateItem(i: number, field: 'cat' | 'amt', val: string) {
    setItems(prev => prev.map((x, j) => j === i ? { ...x, [field]: val } : x));
  }
  function removeItem(i: number) {
    setItems(prev => prev.filter((_, j) => j !== i));
  }

  return (
    <>
      <View style={styles.itemsHeader}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>Line Items</Text>
        <TouchableOpacity
          onPress={() => setItems(prev => [...prev, blankItem()])}
          style={[styles.addItemBtn, { borderColor: roleColor }]}
        >
          <Ionicons name="add" size={14} color={roleColor} />
          <Text style={[styles.addItemBtnText, { color: roleColor }]}>Add item</Text>
        </TouchableOpacity>
      </View>

      {items.map((item, i) => (
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
            {items.length > 1 ? (
              <TouchableOpacity onPress={() => removeItem(i)} style={styles.removeBtn}>
                <Ionicons name="trash-outline" size={17} color="#791F1F" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ))}

      {total > 0 ? (
        <View style={[styles.totalPreview, { backgroundColor: roleColor + '14', borderColor: roleColor + '40' }]}>
          <Text style={[styles.totalPreviewLabel, { color: colors.textMuted }]}>Budget Total</Text>
          <Text style={[styles.totalPreviewAmt, { color: roleColor }]}>{fmt(total)}</Text>
        </View>
      ) : null}
    </>
  );
}

export default function BudgetScreen() {
  const {
    role, userName, budgets,
    addBudget, updateBudget, deleteBudget, submitBudgetToMD,
    approveBudget, rejectBudget,
  } = useApp();

  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;

  const isCreator = role === 'acc' || role === 'mgr' || role === 'csm' || role === 'mktg' || role === 'admin';
  const isMD      = role === 'md' || role === 'admin';

  const [tab, setTab] = useState<'pending' | 'mine' | 'all'>('pending');

  const [selected, setSelected]     = useState<Budget | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [actionNote, setActionNote] = useState('');

  const [showForm, setShowForm]     = useState(false);
  const [editTarget, setEditTarget] = useState<Budget | null>(null);

  const [formMonth, setFormMonth]   = useState(new Date().getMonth());
  const [formYear, setFormYear]     = useState(new Date().getFullYear());
  const [formItems, setFormItems]   = useState<LineItem[]>([blankItem()]);

  const pendingForMD = budgets.filter(b => b.status === 'submitted' || b.status === 'acc_forwarded');
  const myBudgets    = budgets.filter(b => b.by === role || b.byName === userName);

  const displayList: Budget[] =
    isMD      ? (tab === 'pending' ? pendingForMD : budgets)
    : isCreator ? (tab === 'mine' ? myBudgets : budgets)
    : budgets;

  function openCreate() {
    setEditTarget(null);
    setFormMonth(new Date().getMonth());
    setFormYear(new Date().getFullYear());
    setFormItems([blankItem()]);
    setShowForm(true);
  }

  function openEdit(b: Budget) {
    setEditTarget(b);
    setFormMonth(b.month - 1);
    setFormYear(b.year);
    setFormItems(b.items.map(i => ({ cat: i.cat, amt: String(i.amt) })));
    setShowForm(true);
  }

  function validateAndBuildItems() {
    const valid = formItems.filter(i => i.cat.trim() && parseFloat(i.amt) > 0);
    if (!valid.length) {
      Alert.alert('Add at least one item with a category and amount');
      return null;
    }
    const items = valid.map(i => ({ cat: i.cat.trim(), amt: parseFloat(i.amt) }));
    const total = items.reduce((s, i) => s + i.amt, 0);
    const label = `${MONTHS[formMonth]} ${formYear}`;
    return { items, total, label };
  }

  function handleSaveDraft() {
    const built = validateAndBuildItems();
    if (!built) return;
    if (editTarget) {
      updateBudget(editTarget.id, { ...built, month: formMonth + 1, year: formYear });
    } else {
      addBudget({ month: formMonth + 1, year: formYear, label: built.label, by: role!, byName: userName, items: built.items, total: built.total, status: 'draft' });
    }
    setShowForm(false);
  }

  function handleSaveAndSubmit() {
    const built = validateAndBuildItems();
    if (!built) return;
    if (editTarget) {
      updateBudget(editTarget.id, { ...built, month: formMonth + 1, year: formYear });
      setTimeout(() => submitBudgetToMD(editTarget.id), 50);
    } else {
      addBudget({ month: formMonth + 1, year: formYear, label: built.label, by: role!, byName: userName, items: built.items, total: built.total, status: 'draft' });
      Alert.alert('Saved', `${built.label} budget saved. Open it to submit to MD.`);
    }
    setShowForm(false);
  }

  function handleDelete(b: Budget) {
    Alert.alert('Delete Budget?', `${b.label} — ${fmt(b.total)}\n\nThis cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteBudget(b.id) },
    ]);
  }

  function handleAction() {
    if (!selected || !actionType) return;
    if (!actionNote.trim()) { Alert.alert('Please add a note before confirming'); return; }
    if (actionType === 'approve') approveBudget(selected.id, actionNote.trim());
    if (actionType === 'reject')  rejectBudget(selected.id, actionNote.trim());
    setActionType(null);
    setActionNote('');
    setSelected(null);
  }

  function handleSubmitFromDetail(b: Budget) {
    Alert.alert(
      'Submit to MD?',
      `${b.label} — ${fmt(b.total)}\n\nOnce submitted you cannot edit or delete this budget until the MD acts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Submit', onPress: () => { submitBudgetToMD(b.id); setSelected(null); } },
      ]
    );
  }

  const canEditBudget = (b: Budget) =>
    isCreator && (b.status === 'draft' || b.status === 'rejected') && (b.by === role || b.byName === userName);

  return (
    <ScreenLayout
      title="Budget"
      rightAction={
        isCreator ? (
          <TouchableOpacity onPress={openCreate} style={styles.headerBtn}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        ) : undefined
      }
    >
      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {isMD ? (
          <>
            {(['pending', 'all'] as const).map(t => {
              const count = t === 'pending' ? pendingForMD.length : 0;
              return (
                <TouchableOpacity key={t} onPress={() => setTab(t)}
                  style={[styles.tabBtn, { borderBottomColor: t === tab ? roleColor : 'transparent' }]}>
                  <Text style={[styles.tabLabel, { color: t === tab ? roleColor : colors.textMuted, fontWeight: t === tab ? '700' : '400' }]}>
                    {t === 'pending' ? 'Awaiting Approval' : 'All Budgets'}
                  </Text>
                  {count > 0 ? (
                    <View style={[styles.badge, { backgroundColor: roleColor }]}>
                      <Text style={styles.badgeText}>{count}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </>
        ) : isCreator ? (
          <>
            {(['mine', 'all'] as const).map(t => (
              <TouchableOpacity key={t} onPress={() => setTab(t)}
                style={[styles.tabBtn, { borderBottomColor: t === tab ? roleColor : 'transparent' }]}>
                <Text style={[styles.tabLabel, { color: t === tab ? roleColor : colors.textMuted, fontWeight: t === tab ? '700' : '400' }]}>
                  {t === 'mine' ? 'My Budgets' : 'All Budgets'}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {displayList.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="wallet-outline" size={44} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {isCreator ? 'No budgets yet. Tap + to create one.' : 'No budgets to review right now.'}
            </Text>
          </View>
        ) : null}

        {displayList.map(b => {
          const st = STATUS_MAP[b.status] || STATUS_MAP.submitted;
          const editable = canEditBudget(b);
          return (
            <TouchableOpacity key={b.id} onPress={() => setSelected(b)} activeOpacity={0.85}
              style={[styles.card, {
                backgroundColor: colors.surface,
                borderColor: b.status === 'submitted' || b.status === 'acc_forwarded' ? '#BA7517' : colors.border,
                borderWidth: b.status === 'submitted' || b.status === 'acc_forwarded' ? 1.5 : 1,
              }]}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{b.label} Budget</Text>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>{'By '}{b.byName}{' · '}{b.items.length}{' items'}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                  <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>
              <Text style={[styles.cardTotal, { color: roleColor }]}>{fmt(b.total)}</Text>
              <View style={styles.stepDots}>
                {[0,1,2].map(i => (
                  <View key={i} style={[styles.stepDot, { backgroundColor: i < b.workflow.length ? st.color : colors.border }]} />
                ))}
              </View>

              {editable ? (
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    onPress={e => { e.stopPropagation?.(); openEdit(b); }}
                    style={[styles.cardActionBtn, { borderColor: '#185FA5' }]}
                  >
                    <Ionicons name="create-outline" size={13} color="#185FA5" />
                    <Text style={[styles.cardActionText, { color: '#185FA5' }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={e => { e.stopPropagation?.(); handleDelete(b); }}
                    style={[styles.cardActionBtn, { borderColor: '#791F1F' }]}
                  >
                    <Ionicons name="trash-outline" size={13} color="#791F1F" />
                    <Text style={[styles.cardActionText, { color: '#791F1F' }]}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={e => { e.stopPropagation?.(); handleSubmitFromDetail(b); }}
                    style={[styles.cardSubmitBtn, { backgroundColor: roleColor }]}
                  >
                    <Ionicons name="send" size={13} color="#fff" />
                    <Text style={styles.cardSubmitText}>Submit to MD</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {b.status === 'submitted' || b.status === 'acc_forwarded' ? (
                <View style={[styles.lockRow, { borderColor: '#BA7517' }]}>
                  <Ionicons name="lock-closed-outline" size={11} color="#BA7517" />
                  <Text style={[styles.lockText, { color: '#BA7517' }]}>Submitted — awaiting MD approval</Text>
                </View>
              ) : null}
              {b.status === 'fully_approved' ? (
                <View style={[styles.lockRow, { borderColor: '#27500A' }]}>
                  <Ionicons name="lock-closed" size={11} color="#27500A" />
                  <Text style={[styles.lockText, { color: '#27500A' }]}>Approved by MD — record locked</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ═══ DETAIL MODAL ═══ */}
      <Modal visible={!!selected} animationType="slide" onRequestClose={() => { setSelected(null); setActionType(null); setActionNote(''); }}>
        {selected ? (
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={[styles.modalHeader, { backgroundColor: roleColor, paddingTop: 52 }]}>
              <TouchableOpacity onPress={() => { setSelected(null); setActionType(null); setActionNote(''); }} style={styles.headerBack}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{selected.label} Budget</Text>
                <Text style={styles.modalSub}>{fmt(selected.total)}{' · '}{STATUS_MAP[selected.status]?.label}</Text>
              </View>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

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

                {selected.workflow.length > 0 ? (
                  <>
                    <Text style={[styles.section, { color: colors.text, marginTop: 20 }]}>Workflow</Text>
                    {selected.workflow.map((step, i) => (
                      <View key={i} style={styles.wfStep}>
                        <View style={styles.wfLeft}>
                          <View style={[styles.wfIcon, { backgroundColor: STEP_BG[step.action] || colors.infoBg }]}>
                            <Ionicons name={STEP_ICON[step.action] as any} size={15} color={STEP_COLOR[step.action] || colors.info} />
                          </View>
                          {i < selected.workflow.length - 1 ? <View style={[styles.wfLine, { backgroundColor: colors.border }]} /> : null}
                        </View>
                        <View style={styles.wfContent}>
                          <Text style={[styles.wfStage, { color: colors.text }]}>{step.stage}</Text>
                          <Text style={[styles.wfBy, { color: colors.textMuted }]}>{'by '}{step.by}{' · '}{fmtDateTime(step.dt)}</Text>
                          {!!step.note ? <Text style={[styles.wfNote, { color: colors.textMuted }]}>{step.note}</Text> : null}
                        </View>
                      </View>
                    ))}
                  </>
                ) : null}

                {/* Creator submit from detail */}
                {isCreator && canEditBudget(selected) && !actionType ? (
                  <View style={[styles.actionBox, { backgroundColor: '#F0F4FF', borderColor: '#BCC9E8' }]}>
                    <Ionicons name="send" size={18} color={roleColor} />
                    <Text style={[styles.actionTitle, { color: roleColor }]}>Submit for MD Approval</Text>
                    <Text style={[styles.actionSub, { color: colors.textMuted }]}>Review your line items, then submit this budget to the MD.</Text>
                    <TouchableOpacity onPress={() => handleSubmitFromDetail(selected)} style={[styles.primaryBtn, { backgroundColor: roleColor }]}>
                      <Ionicons name="send" size={15} color="#fff" />
                      <Text style={styles.primaryBtnText}>Submit to MD</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* MD action */}
                {isMD && (selected.status === 'submitted' || selected.status === 'acc_forwarded') && !actionType ? (
                  <View style={[styles.actionBox, { backgroundColor: '#EAF3DE', borderColor: '#C2DDB3' }]}>
                    <Ionicons name="checkmark-done" size={18} color="#27500A" />
                    <Text style={[styles.actionTitle, { color: '#27500A' }]}>Final Approval</Text>
                    <Text style={[styles.actionSub, { color: colors.textMuted }]}>Review all line items then approve or reject this budget.</Text>
                    <View style={styles.actionBtns}>
                      <TouchableOpacity onPress={() => setActionType('approve')} style={[styles.primaryBtn, { backgroundColor: '#1a6e3c' }]}>
                        <Ionicons name="checkmark" size={15} color="#fff" />
                        <Text style={styles.primaryBtnText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setActionType('reject')} style={[styles.outlineBtn, { borderColor: '#791F1F' }]}>
                        <Text style={[styles.outlineBtnText, { color: '#791F1F' }]}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                {!!actionType ? (
                  <View style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.noteLabel, { color: colors.text }]}>
                      {actionType === 'approve' ? 'Approval Note' : 'Rejection Reason'}
                    </Text>
                    <TextInput
                      value={actionNote} onChangeText={setActionNote}
                      placeholder="Add a note…"
                      placeholderTextColor={colors.textMuted}
                      multiline
                      style={[styles.noteInput, { color: colors.text, borderColor: colors.border }]}
                    />
                    <View style={styles.actionBtns}>
                      <TouchableOpacity onPress={handleAction}
                        style={[styles.primaryBtn, { backgroundColor: actionType === 'reject' ? '#791F1F' : '#1a6e3c' }]}>
                        <Text style={styles.primaryBtnText}>
                          {actionType === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setActionType(null); setActionNote(''); }}
                        style={[styles.outlineBtn, { borderColor: colors.border }]}>
                        <Text style={[styles.outlineBtnText, { color: colors.textMuted }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        ) : null}
      </Modal>

      {/* ═══ CREATE / EDIT MODAL ═══ */}
      <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={[styles.modalHeader, { backgroundColor: roleColor, paddingTop: 52 }]}>
              <TouchableOpacity onPress={() => setShowForm(false)} style={styles.headerBack}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{editTarget ? 'Edit Budget' : 'New Budget'}</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Month</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                {MONTHS.map((m, i) => (
                  <TouchableOpacity key={m} onPress={() => setFormMonth(i)}
                    style={[styles.chip, { backgroundColor: i === formMonth ? roleColor : colors.surface, borderColor: i === formMonth ? roleColor : colors.border }]}>
                    <Text style={[styles.chipText, { color: i === formMonth ? '#fff' : colors.text }]}>{m.slice(0, 3)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.fieldLabel, { color: colors.text, marginTop: 12 }]}>Year</Text>
              <View style={styles.yearRow}>
                {YEARS.map(y => (
                  <TouchableOpacity key={y} onPress={() => setFormYear(y)}
                    style={[styles.chip, { backgroundColor: y === formYear ? roleColor : colors.surface, borderColor: y === formYear ? roleColor : colors.border }]}>
                    <Text style={[styles.chipText, { color: y === formYear ? '#fff' : colors.text }]}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <ItemEditor items={formItems} setItems={setFormItems} roleColor={roleColor} />

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity onPress={handleSaveDraft}
                  style={[styles.submitBtn, { flex: 1, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: roleColor }]}>
                  <Ionicons name="save-outline" size={16} color={roleColor} />
                  <Text style={[styles.submitBtnText, { color: roleColor }]}>Save Draft</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveAndSubmit}
                  style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]}>
                  <Ionicons name="send" size={16} color="#fff" />
                  <Text style={styles.submitBtnText}>
                    {editTarget ? 'Save & Submit' : 'Save Draft'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: 32 }} />
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
  headerBtn:     { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  card:          { padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 12, gap: 8 },
  cardTop:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle:     { fontSize: 15, fontWeight: '700' },
  cardSub:       { fontSize: 12, marginTop: 2 },
  statusBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText:    { fontSize: 11, fontWeight: '700' },
  cardTotal:     { fontSize: 22, fontWeight: '700' },
  stepDots:      { flexDirection: 'row', gap: 4 },
  stepDot:       { width: 22, height: 6, borderRadius: 3 },
  cardActions:   { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  cardActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5 },
  cardActionText:{ fontSize: 12, fontWeight: '600' },
  cardSubmitBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, borderRadius: 8 },
  cardSubmitText:{ color: '#fff', fontSize: 12, fontWeight: '700' },
  lockRow:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  lockText:      { fontSize: 11, fontWeight: '600' },

  empty:         { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText:     { fontSize: 14, textAlign: 'center', maxWidth: 240 },

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
  wfContent:     { flex: 1, paddingTop: 6, paddingBottom: 8 },
  wfStage:       { fontSize: 14, fontWeight: '600' },
  wfBy:          { fontSize: 12, marginTop: 2 },
  wfNote:        { fontSize: 12, marginTop: 4, fontStyle: 'italic' },

  actionBox:     { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8, marginTop: 12 },
  actionTitle:   { fontSize: 15, fontWeight: '700' },
  actionSub:     { fontSize: 13, lineHeight: 18 },
  actionBtns:    { flexDirection: 'row', gap: 8, marginTop: 4 },
  primaryBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10 },
  primaryBtnText:{ color: '#fff', fontSize: 14, fontWeight: '700' },
  outlineBtn:    { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1.5 },
  outlineBtnText:{ fontSize: 14, fontWeight: '600' },

  noteCard:      { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10, marginTop: 12 },
  noteLabel:     { fontSize: 14, fontWeight: '600' },
  noteInput:     { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },

  fieldLabel:    { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  chipRow:       { marginBottom: 6 },
  chip:          { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, marginRight: 6 },
  chipText:      { fontSize: 12, fontWeight: '600' },
  yearRow:       { flexDirection: 'row', gap: 8, marginBottom: 14 },

  itemsHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 },
  addItemBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  addItemBtnText:{ fontSize: 12, fontWeight: '600' },
  lineItem:      { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  catInput:      { fontSize: 14, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  amtRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  nairaSign:     { fontSize: 16, fontWeight: '600' },
  amtInput:      { flex: 1, fontSize: 16, fontWeight: '600' },
  removeBtn:     { padding: 4 },
  totalPreview:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 4 },
  totalPreviewLabel: { fontSize: 13, fontWeight: '600' },
  totalPreviewAmt:   { fontSize: 22, fontWeight: '800' },

  submitBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 8 },
  submitBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
