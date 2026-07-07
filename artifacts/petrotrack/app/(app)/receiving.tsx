import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { Delivery, ROLE_COLORS, fmt, fmtDate, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const PRODUCTS = ['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil'];
const ST_MAP = {
  ok:    { label: 'OK',         color: '#27500A', bg: '#EAF3DE' },
  short: { label: 'Short',      color: '#BA7517', bg: '#FAEEDA' },
  spill: { label: 'Spill',      color: '#791F1F', bg: '#FCEBEB' },
  seal:  { label: 'Seal Issue', color: '#4527a0', bg: '#EEEDFE' },
};
const APPR_MAP = {
  draft:    { label: 'Draft',            color: '#555',    bg: '#F0F0F0',  icon: 'document-outline' },
  pending:  { label: 'Awaiting CEO',     color: '#BA7517', bg: '#FAEEDA',  icon: 'time-outline' },
  approved: { label: 'Approved',         color: '#27500A', bg: '#EAF3DE',  icon: 'checkmark-circle' },
  rejected: { label: 'Rejected',         color: '#791F1F', bg: '#FCEBEB',  icon: 'close-circle' },
} as const;
const PROD_COLORS: Record<string, string> = {
  PMS: '#1a6e3c', AGO: '#185FA5', DPK: '#BA7517', LPG: '#0F6E56', 'Lube Oil': '#5c3d11', Others: '#4a4a4a',
};

type FormState = {
  prod: string; sup: string; wb: string;
  ord: string; rec: string; costPrice: string;
  st: 'ok' | 'short' | 'spill' | 'seal';
  notes: string; dt: string;
};

function todayIso() { return new Date().toISOString().slice(0, 10); }
function blankForm(): FormState {
  return { prod: 'PMS', sup: '', wb: '', ord: '', rec: '', costPrice: '', st: 'ok', notes: '', dt: todayIso() };
}
function deliveryToForm(d: Delivery): FormState {
  return {
    prod: d.prod, sup: d.sup, wb: d.wb,
    ord: String(d.ord), rec: String(d.rec),
    costPrice: d.costPrice ? String(d.costPrice) : '',
    st: d.st, notes: d.notes,
    dt: d.dt ? d.dt.slice(0, 10) : todayIso(),
  };
}

type FormFieldsProps = {
  f: FormState;
  setF: React.Dispatch<React.SetStateAction<FormState>>;
  roleColor: string;
  sellPrice: number;
};
function FormFields({ f, setF, roleColor, sellPrice }: FormFieldsProps) {
  const colors = useColors();
  const hasCostAndProd = f.costPrice.length > 0 && f.prod.length > 0;
  const parsedCost = parseFloat(f.costPrice);
  const margin = hasCostAndProd && sellPrice > 0 && parsedCost > 0
    ? Math.round(((sellPrice - parsedCost) / sellPrice) * 100)
    : null;

  return (
    <>
      <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Product *</Text>
      <View style={styles.chipRow}>
        {PRODUCTS.map(p => (
          <TouchableOpacity
            key={p}
            onPress={() => setF(prev => ({ ...prev, prod: p }))}
            style={[styles.chip, {
              backgroundColor: f.prod === p ? (PROD_COLORS[p] || roleColor) : colors.surface,
              borderColor: f.prod === p ? (PROD_COLORS[p] || roleColor) : colors.border,
            }]}
          >
            <Text style={[styles.chipText, { color: f.prod === p ? '#fff' : colors.textMuted }]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Supplier Name *</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        placeholder="Enter supplier company name"
        placeholderTextColor={colors.textSubtle}
        value={f.sup}
        onChangeText={v => setF(prev => ({ ...prev, sup: v }))}
        autoCapitalize="words"
      />

      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        placeholder="Waybill / Delivery note number *"
        placeholderTextColor={colors.textSubtle}
        value={f.wb} onChangeText={v => setF(prev => ({ ...prev, wb: v }))}
      />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          style={[styles.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholder="Qty ordered (L)" placeholderTextColor={colors.textSubtle}
          keyboardType="numeric" value={f.ord}
          onChangeText={v => setF(prev => ({ ...prev, ord: v }))}
        />
        <TextInput
          style={[styles.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholder="Qty received (L)" placeholderTextColor={colors.textSubtle}
          keyboardType="numeric" value={f.rec}
          onChangeText={v => setF(prev => ({ ...prev, rec: v }))}
        />
      </View>

      <View style={[styles.costPriceBox, { backgroundColor: roleColor + '0A', borderColor: roleColor + '30' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Ionicons name="pricetag-outline" size={15} color={roleColor} />
          <Text style={[styles.costPriceLabel, { color: roleColor }]}>Cost Price (₦ per litre) *</Text>
        </View>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, borderColor: roleColor + '40', color: colors.text, marginBottom: 0 }]}
          placeholder="e.g. 780" placeholderTextColor={colors.textSubtle}
          keyboardType="numeric" value={f.costPrice}
          onChangeText={v => setF(prev => ({ ...prev, costPrice: v }))}
        />
        {hasCostAndProd ? (
          <View style={{ marginTop: 6, flexDirection: 'row', gap: 10 }}>
            <Text style={[styles.costHint, { color: colors.textMuted }]}>
              {'Sell: ₦'}{sellPrice.toLocaleString()}{'/L'}
            </Text>
            {margin !== null ? (
              <Text style={[styles.costHint, { color: margin >= 0 ? '#27500A' : '#791F1F', fontWeight: '700' }]}>
                {'Margin: '}{margin}{'%'}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Delivery Status</Text>
      <View style={styles.chipRow}>
        {(Object.entries(ST_MAP) as [string, typeof ST_MAP.ok][]).map(([k, v]) => (
          <TouchableOpacity
            key={k}
            onPress={() => setF(prev => ({ ...prev, st: k as FormState['st'] }))}
            style={[styles.chip, { backgroundColor: f.st === k ? v.bg : colors.surface, borderColor: f.st === k ? v.color : colors.border }]}
          >
            <Text style={[styles.chipText, { color: f.st === k ? v.color : colors.textMuted }]}>{v.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Delivery Date *</Text>
      <View style={[styles.dateRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="calendar-outline" size={16} color={roleColor} />
        <TextInput
          style={[styles.dateInput, { color: colors.text }]}
          value={f.dt}
          onChangeText={v => setF(prev => ({ ...prev, dt: v }))}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textSubtle}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <TouchableOpacity onPress={() => setF(prev => ({ ...prev, dt: todayIso() }))}>
          <Text style={[styles.todayBtn, { color: roleColor }]}>Today</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={[styles.input, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        placeholder="Notes (optional)" placeholderTextColor={colors.textSubtle}
        multiline numberOfLines={3} value={f.notes}
        onChangeText={v => setF(prev => ({ ...prev, notes: v }))}
      />
    </>
  );
}

export default function ReceivingScreen() {
  const {
    role, userName, deliveries, prices,
    addDelivery, updateDelivery, deleteDelivery,
    submitDeliveryForApproval, approveDelivery, rejectDelivery,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'acc'] || colors.primary;

  const isAcc = role === 'acc' || role === 'admin';
  const isCeo = role === 'ceo' || role === 'admin';

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm());

  const [editTarget, setEditTarget] = useState<Delivery | null>(null);
  const [editForm, setEditForm] = useState<FormState>(blankForm());

  /* CEO reject modal */
  const [rejectTarget, setRejectTarget] = useState<Delivery | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const sortedDeliveries = [...deliveries].sort((a, b) => b.id - a.id);
  const pendingCount = sortedDeliveries.filter(d => d.approvalStatus === 'pending').length;

  const summary = PRODUCTS.map(prod => {
    const recs = deliveries.filter(d => d.prod === prod && d.costPrice);
    const totalRec = recs.reduce((s, d) => s + d.rec, 0);
    const totalCost = recs.reduce((s, d) => s + d.rec * (d.costPrice ?? 0), 0);
    const avgCost = totalRec > 0 ? Math.round(totalCost / totalRec) : 0;
    const sellPrice = (prices as any)[prod] ?? 0;
    const margin = sellPrice > 0 && avgCost > 0 ? Math.round(((sellPrice - avgCost) / sellPrice) * 100) : null;
    return { prod, totalRec, avgCost, sellPrice, margin };
  }).filter(s => s.totalRec > 0);

  function validateForm(f: FormState) {
    const ordN = parseFloat(f.ord);
    const recN = parseFloat(f.rec);
    const costN = parseFloat(f.costPrice);
    if (!f.sup.trim()) { Alert.alert('Required', 'Supplier name is required.'); return null; }
    if (!f.wb) { Alert.alert('Required', 'Waybill number is required.'); return null; }
    if (!ordN || !recN) { Alert.alert('Required', 'Ordered and received quantities are required.'); return null; }
    if (!costN) { Alert.alert('Required', 'Cost price per litre is required.'); return null; }
    return { ordN, recN, costN };
  }

  function handleAdd() {
    const vals = validateForm(form);
    if (!vals) return;
    addDelivery({
      dt: form.dt ? new Date(form.dt).toISOString() : new Date().toISOString(),
      sup: form.sup.trim(), prod: form.prod, wb: form.wb,
      ord: vals.ordN, rec: vals.recN, st: form.st, notes: form.notes,
      costPrice: vals.costN, receivedBy: userName,
      approvalStatus: 'draft',
    });
    setForm(blankForm());
    setShowForm(false);
  }

  function openEdit(d: Delivery) { setEditTarget(d); setEditForm(deliveryToForm(d)); }

  function handleUpdate() {
    if (!editTarget) return;
    const vals = validateForm(editForm);
    if (!vals) return;
    updateDelivery(editTarget.id, {
      dt: editForm.dt ? new Date(editForm.dt).toISOString() : editTarget.dt,
      sup: editForm.sup.trim(), prod: editForm.prod, wb: editForm.wb,
      ord: vals.ordN, rec: vals.recN, st: editForm.st, notes: editForm.notes,
      costPrice: vals.costN, receivedBy: editTarget.receivedBy,
      approvalStatus: 'draft',
    });
    setEditTarget(null);
  }

  function handleDelete(d: Delivery) {
    Alert.alert(
      'Delete Delivery?',
      `WB: ${d.wb} — ${d.prod} ${d.rec.toLocaleString()}L\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteDelivery(d.id) },
      ]
    );
  }

  function handleSubmitForApproval(d: Delivery) {
    Alert.alert(
      'Submit for CEO Approval?',
      `WB: ${d.wb} — ${d.prod} ${d.rec.toLocaleString()}L from ${d.sup}\n\nOnce submitted you cannot edit or delete this record until the CEO acts on it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Submit', onPress: () => submitDeliveryForApproval(d.id) },
      ]
    );
  }

  function handleApprove(d: Delivery) {
    Alert.alert(
      'Approve Delivery Record?',
      `${d.prod} ${d.rec.toLocaleString()}L from ${d.sup}\nWB: ${d.wb}\nDate: ${fmtDate(d.dt)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => approveDelivery(d.id) },
      ]
    );
  }

  function handleRejectConfirm() {
    if (!rejectTarget) return;
    rejectDelivery(rejectTarget.id, rejectNote || undefined);
    setRejectTarget(null);
    setRejectNote('');
  }

  const canEdit = (d: Delivery) =>
    isAcc && (d.approvalStatus === 'draft' || d.approvalStatus === 'rejected' || !d.approvalStatus);
  const canSubmit = (d: Delivery) =>
    isAcc && (d.approvalStatus === 'draft' || d.approvalStatus === 'rejected' || !d.approvalStatus);
  const canCeoAct = (d: Delivery) =>
    isCeo && d.approvalStatus === 'pending';

  return (
    <ScreenLayout
      title="Product Receiving"
      rightAction={
        isAcc ? (
          <TouchableOpacity onPress={() => { setForm(blankForm()); setShowForm(true); }} style={styles.headerBtn}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        ) : undefined
      }
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* CEO pending approvals banner */}
        {isCeo && pendingCount > 0 ? (
          <View style={[styles.banner, { backgroundColor: '#FAEEDA', borderColor: '#BA7517' }]}>
            <Ionicons name="time" size={16} color="#BA7517" />
            <Text style={[styles.bannerText, { color: '#BA7517' }]}>
              {pendingCount}{' delivery record'}{pendingCount > 1 ? 's' : ''}{' awaiting your approval'}
            </Text>
          </View>
        ) : null}

        {/* Cost vs Sell summary */}
        {summary.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Cost vs. Selling Price</Text>
            <View style={styles.summaryGrid}>
              {summary.map(s => {
                const pc = PROD_COLORS[s.prod] || roleColor;
                const profitable = s.margin !== null && s.margin > 0;
                return (
                  <View key={s.prod} style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={[styles.prodBadge, { backgroundColor: pc + '18' }]}>
                      <Text style={[styles.prodBadgeText, { color: pc }]}>{s.prod}</Text>
                    </View>
                    <View style={styles.priceRow}>
                      <View style={styles.priceCol}>
                        <Text style={[styles.priceLabel, { color: colors.textMuted }]}>Cost</Text>
                        <Text style={[styles.priceVal, { color: colors.text }]}>{'₦'}{s.avgCost}{'/L'}</Text>
                      </View>
                      <Ionicons name="arrow-forward" size={14} color={colors.textSubtle} />
                      <View style={styles.priceCol}>
                        <Text style={[styles.priceLabel, { color: colors.textMuted }]}>Sell</Text>
                        <Text style={[styles.priceVal, { color: pc }]}>{'₦'}{s.sellPrice}{'/L'}</Text>
                      </View>
                    </View>
                    {s.margin !== null ? (
                      <View style={[styles.marginBadge, {
                        backgroundColor: profitable ? '#EAF3DE' : '#FCEBEB',
                        borderColor: profitable ? '#27500A' : '#791F1F',
                      }]}>
                        <Ionicons name={profitable ? 'trending-up' : 'trending-down'} size={11} color={profitable ? '#27500A' : '#791F1F'} />
                        <Text style={[styles.marginText, { color: profitable ? '#27500A' : '#791F1F' }]}>
                          {profitable ? '+' : ''}{s.margin}{'% margin · '}{s.totalRec.toLocaleString()}{' L received'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Delivery Records</Text>
        {sortedDeliveries.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="cube-outline" size={36} color={colors.textSubtle} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No deliveries recorded yet</Text>
          </View>
        ) : null}

        {sortedDeliveries.map(d => {
          const st = ST_MAP[d.st] || ST_MAP.ok;
          const pc = PROD_COLORS[d.prod] || roleColor;
          const apSt = d.approvalStatus || 'draft';
          const apCfg = APPR_MAP[apSt];
          const hasCost = !!(d.costPrice && d.costPrice > 0);
          const sellPrice = (prices as any)[d.prod] ?? 0;
          const margin = hasCost && sellPrice ? Math.round(((sellPrice - d.costPrice!) / sellPrice) * 100) : null;
          const totalCostVal = hasCost ? d.rec * d.costPrice! : null;
          const isLocked = apSt === 'approved';

          return (
            <View key={d.id} style={[styles.delivCard, {
              backgroundColor: colors.surface,
              borderColor: apSt === 'pending' ? '#BA7517' : apSt === 'approved' ? '#27500A' : colors.border,
              borderWidth: apSt === 'pending' || apSt === 'approved' ? 1.5 : 1,
            }]}>
              {/* Card header */}
              <View style={styles.delivHeader}>
                <View style={[styles.prodTag, { backgroundColor: pc + '15' }]}>
                  <Ionicons name="cube-outline" size={13} color={pc} />
                  <Text style={[styles.prodTagText, { color: pc }]}>{d.prod}</Text>
                </View>
                <View style={[styles.stBadge, { backgroundColor: st.bg }]}>
                  <Text style={[styles.stText, { color: st.color }]}>{st.label}</Text>
                </View>
                <View style={[styles.apBadge, { backgroundColor: apCfg.bg }]}>
                  <Ionicons name={apCfg.icon as any} size={11} color={apCfg.color} />
                  <Text style={[styles.apText, { color: apCfg.color }]}>{apCfg.label}</Text>
                </View>
                <View style={{ flex: 1 }} />
                <Text style={[styles.delivDate, { color: colors.textMuted }]}>{fmtDate(d.dt)}</Text>
              </View>

              {/* Details */}
              <View style={styles.delivBody}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.delivWb, { color: colors.text }]}>{'WB: '}{d.wb}</Text>
                  <Text style={[styles.delivSup, { color: colors.textMuted }]}>{d.sup}</Text>
                  <Text style={[styles.delivQty, { color: colors.textMuted }]}>
                    {'Ordered: '}{d.ord.toLocaleString()}{' L · Received: '}
                    <Text style={{ fontWeight: '700', color: colors.text }}>{d.rec.toLocaleString()}{' L'}</Text>
                  </Text>
                  {d.notes ? <Text style={[styles.delivNotes, { color: colors.textSubtle }]}>{d.notes}</Text> : null}
                  {apSt === 'rejected' && d.rejectedNote ? (
                    <Text style={[styles.delivNotes, { color: '#791F1F' }]}>{'Rejected: '}{d.rejectedNote}</Text>
                  ) : null}
                </View>
              </View>

              {/* Cost / margin */}
              {hasCost ? (
                <View style={[styles.costRow, { backgroundColor: roleColor + '08', borderColor: roleColor + '20' }]}>
                  <View style={styles.costItem}>
                    <Text style={[styles.costLabel, { color: colors.textMuted }]}>Cost/L</Text>
                    <Text style={[styles.costVal, { color: colors.text }]}>{'₦'}{d.costPrice!.toLocaleString()}</Text>
                  </View>
                  <View style={styles.costDivider} />
                  <View style={styles.costItem}>
                    <Text style={[styles.costLabel, { color: colors.textMuted }]}>Sell/L</Text>
                    <Text style={[styles.costVal, { color: pc }]}>{'₦'}{sellPrice.toLocaleString()}</Text>
                  </View>
                  <View style={styles.costDivider} />
                  <View style={styles.costItem}>
                    <Text style={[styles.costLabel, { color: colors.textMuted }]}>Total Cost</Text>
                    <Text style={[styles.costVal, { color: colors.text }]}>{fmt(totalCostVal!)}</Text>
                  </View>
                  {margin !== null ? (
                    <>
                      <View style={styles.costDivider} />
                      <View style={styles.costItem}>
                        <Text style={[styles.costLabel, { color: colors.textMuted }]}>Margin</Text>
                        <Text style={[styles.costVal, { color: margin >= 0 ? '#27500A' : '#791F1F', fontWeight: '800' }]}>
                          {margin >= 0 ? '+' : ''}{margin}{'%'}
                        </Text>
                      </View>
                    </>
                  ) : null}
                </View>
              ) : null}

              {/* Approved by line */}
              {apSt === 'approved' && d.approvedBy ? (
                <View style={[styles.approvedRow, { backgroundColor: '#EAF3DE', borderColor: '#27500A20' }]}>
                  <Ionicons name="checkmark-circle" size={13} color="#27500A" />
                  <Text style={[styles.approvedText, { color: '#27500A' }]}>
                    {'Approved by '}{d.approvedBy}
                    {d.approvedAt ? ' · ' + fmtDateTime(d.approvedAt) : ''}
                  </Text>
                </View>
              ) : null}

              {d.receivedBy ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="person-outline" size={11} color={colors.textSubtle} />
                  <Text style={[styles.receivedBy, { color: colors.textSubtle }]}>{'Received by '}{d.receivedBy}</Text>
                </View>
              ) : null}

              {/* Accountant actions */}
              {canEdit(d) ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity onPress={() => openEdit(d)} style={[styles.actionBtn, { borderColor: '#185FA5' }]}>
                    <Ionicons name="create-outline" size={14} color="#185FA5" />
                    <Text style={[styles.actionBtnText, { color: '#185FA5' }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(d)} style={[styles.actionBtn, { borderColor: '#791F1F' }]}>
                    <Ionicons name="trash-outline" size={14} color="#791F1F" />
                    <Text style={[styles.actionBtnText, { color: '#791F1F' }]}>Delete</Text>
                  </TouchableOpacity>
                  {canSubmit(d) ? (
                    <TouchableOpacity onPress={() => handleSubmitForApproval(d)} style={[styles.submitForApprBtn, { backgroundColor: roleColor }]}>
                      <Ionicons name="send" size={14} color="#fff" />
                      <Text style={styles.submitForApprText}>Submit</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              {/* CEO actions on pending */}
              {canCeoAct(d) ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    onPress={() => { setRejectTarget(d); setRejectNote(''); }}
                    style={[styles.actionBtn, { borderColor: '#791F1F', flex: 1 }]}
                  >
                    <Ionicons name="close" size={14} color="#791F1F" />
                    <Text style={[styles.actionBtnText, { color: '#791F1F' }]}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleApprove(d)}
                    style={[styles.approveBtn]}
                  >
                    <Ionicons name="checkmark" size={14} color="#fff" />
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Pending lock notice for accountant */}
              {isAcc && apSt === 'pending' ? (
                <View style={[styles.lockRow, { borderColor: '#BA7517' }]}>
                  <Ionicons name="lock-closed-outline" size={12} color="#BA7517" />
                  <Text style={[styles.lockText, { color: '#BA7517' }]}>Submitted — awaiting CEO approval</Text>
                </View>
              ) : null}

              {/* Approved lock notice for accountant */}
              {isAcc && apSt === 'approved' ? (
                <View style={[styles.lockRow, { borderColor: '#27500A' }]}>
                  <Ionicons name="lock-closed" size={12} color="#27500A" />
                  <Text style={[styles.lockText, { color: '#27500A' }]}>Record locked — CEO approved</Text>
                </View>
              ) : null}
            </View>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Add Modal */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowForm(false)} />
          <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Record Product Receipt</Text>
            <FormFields f={form} setF={setForm} roleColor={roleColor} sellPrice={(prices as any)[form.prod] ?? 0} />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32 }}>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleAdd}>
                <Text style={styles.saveBtnText}>Save as Draft</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setShowForm(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={editTarget !== null} transparent animationType="slide" onRequestClose={() => setEditTarget(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setEditTarget(null)} />
          <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
            <View style={styles.editHeader}>
              <View style={[styles.editIconBox, { backgroundColor: '#E8F0FC' }]}>
                <Ionicons name="create" size={18} color="#185FA5" />
              </View>
              <View>
                <Text style={[styles.sheetTitle, { color: colors.text, marginBottom: 0 }]}>Edit Delivery</Text>
                <Text style={[styles.editSub, { color: colors.textMuted }]}>{'WB: '}{editTarget?.wb}</Text>
              </View>
            </View>
            <FormFields f={editForm} setF={setEditForm} roleColor={roleColor} sellPrice={(prices as any)[editForm.prod] ?? 0} />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32 }}>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: '#185FA5' }]} onPress={handleUpdate}>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setEditTarget(null)}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* CEO Reject Modal */}
      <Modal visible={rejectTarget !== null} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setRejectTarget(null)} />
          <View style={[styles.smallModal, { backgroundColor: colors.surface }]}>
            <View style={styles.editHeader}>
              <View style={[styles.editIconBox, { backgroundColor: '#FCEBEB' }]}>
                <Ionicons name="close-circle" size={18} color="#791F1F" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.text, marginBottom: 0 }]}>Reject Delivery</Text>
                <Text style={[styles.editSub, { color: colors.textMuted }]}>{'WB: '}{rejectTarget?.wb}</Text>
              </View>
            </View>
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Reason (optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={rejectNote}
              onChangeText={setRejectNote}
              placeholder="e.g. Waybill mismatch"
              placeholderTextColor={colors.textSubtle}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setRejectTarget(null)}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { flex: 2, backgroundColor: '#791F1F' }]} onPress={handleRejectConfirm}>
                <Ionicons name="close" size={15} color="#fff" />
                <Text style={styles.saveBtnText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 16 },
  bannerText: { fontSize: 13, fontWeight: '600', flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10, marginTop: 4 },
  summaryGrid: { gap: 8, marginBottom: 16 },
  summaryCard: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 10 },
  prodBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  prodBadgeText: { fontSize: 12, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  priceCol: { gap: 2 },
  priceLabel: { fontSize: 10 },
  priceVal: { fontSize: 18, fontWeight: '800' },
  marginBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, alignSelf: 'flex-start' },
  marginText: { fontSize: 11, fontWeight: '700' },
  delivCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 8 },
  delivHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  prodTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  prodTagText: { fontSize: 12, fontWeight: '700' },
  stBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  stText: { fontSize: 11, fontWeight: '700' },
  apBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  apText: { fontSize: 11, fontWeight: '700' },
  delivDate: { fontSize: 11 },
  delivBody: { flexDirection: 'row' },
  delivWb: { fontSize: 13, fontWeight: '700' },
  delivSup: { fontSize: 12, marginTop: 1 },
  delivQty: { fontSize: 12, marginTop: 3 },
  delivNotes: { fontSize: 11, marginTop: 3, fontStyle: 'italic' },
  costRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, padding: 10 },
  costItem: { flex: 1, alignItems: 'center', gap: 2 },
  costDivider: { width: 1, height: 28, backgroundColor: '#e5e5e3' },
  costLabel: { fontSize: 10 },
  costVal: { fontSize: 13, fontWeight: '700' },
  approvedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  approvedText: { fontSize: 11, fontWeight: '600' },
  receivedBy: { fontSize: 10 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1.5 },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  submitForApprBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8 },
  submitForApprText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  approveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, backgroundColor: '#27500A' },
  approveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  lockText: { fontSize: 11, fontWeight: '600' },
  headerBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 24, maxHeight: '92%' },
  smallModal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  editHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  editIconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  editSub: { fontSize: 12, marginTop: 2 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 10 },
  textArea: { height: 72, textAlignVertical: 'top' },
  inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '600' },
  costPriceBox: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
  costPriceLabel: { fontSize: 13, fontWeight: '700' },
  costHint: { fontSize: 12 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 10 },
  dateInput: { flex: 1, fontSize: 14 },
  todayBtn: { fontSize: 13, fontWeight: '700' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#e5e5e3' },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
  emptyBox: { alignItems: 'center', gap: 10, padding: 32, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed' },
  emptyText: { fontSize: 14 },
});
