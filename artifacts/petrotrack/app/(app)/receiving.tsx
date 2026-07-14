import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ModalSheet } from '@/components/FormSheet';

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
const APPR_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  draft:       { label: 'Draft',                color: '#555',    bg: '#F0F0F0',  icon: 'document-outline' },
  pending:     { label: 'Awaiting Accountant',  color: '#185FA5', bg: '#E6F1FB',  icon: 'time-outline' },
  pending_acc: { label: 'Awaiting Accountant',  color: '#185FA5', bg: '#E6F1FB',  icon: 'time-outline' },
  pending_md:  { label: 'Awaiting MD Approval', color: '#BA7517', bg: '#FAEEDA',  icon: 'hourglass-outline' },
  md_approved: { label: 'MD Approved',          color: '#27500A', bg: '#EAF3DE',  icon: 'checkmark-circle' },
  approved:    { label: 'Approved',             color: '#27500A', bg: '#EAF3DE',  icon: 'checkmark-circle' },
  rejected:    { label: 'Rejected by MD',       color: '#791F1F', bg: '#FCEBEB',  icon: 'close-circle' },
};
const PROD_COLORS: Record<string, string> = {
  PMS: '#1a6e3c', AGO: '#185FA5', DPK: '#BA7517', LPG: '#0F6E56', 'Lube Oil': '#5c3d11',
};

type MgrFormState = {
  prod: string; sup: string; wb: string;
  ord: string; rec: string;
  st: 'ok' | 'short' | 'spill' | 'seal';
  notes: string; dt: string;
};

function todayIso() { return new Date().toISOString().slice(0, 10); }
function blankMgrForm(): MgrFormState {
  return { prod: 'PMS', sup: '', wb: '', ord: '', rec: '', st: 'ok', notes: '', dt: todayIso() };
}
function deliveryToMgrForm(d: Delivery): MgrFormState {
  return {
    prod: d.prod, sup: d.sup, wb: d.wb,
    ord: String(d.ord), rec: String(d.rec),
    st: d.st, notes: d.notes,
    dt: d.dt ? d.dt.slice(0, 10) : todayIso(),
  };
}

type MgrFormFieldsProps = {
  f: MgrFormState;
  setF: React.Dispatch<React.SetStateAction<MgrFormState>>;
  roleColor: string;
};
function MgrFormFields({ f, setF, roleColor }: MgrFormFieldsProps) {
  const colors = useColors();
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
        value={f.wb}
        onChangeText={v => setF(prev => ({ ...prev, wb: v }))}
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

      <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Delivery Condition</Text>
      <View style={styles.chipRow}>
        {(Object.entries(ST_MAP) as [string, typeof ST_MAP.ok][]).map(([k, v]) => (
          <TouchableOpacity
            key={k}
            onPress={() => setF(prev => ({ ...prev, st: k as MgrFormState['st'] }))}
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
    role, userName, branchId,
    tanks, lpgTanks, deliveries, prices, sales, pumpDailyReports,
    addDelivery, updateDelivery, deleteDelivery,
    submitDeliveryForApproval, accForwardToMd, approveDelivery, rejectDelivery,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;

  const isMgr = role === 'mgr' || role === 'csm' || role === 'admin';
  const isAcc = role === 'acc' || role === 'admin';
  const isMd  = role === 'md'  || role === 'ceo' || role === 'admin';

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<MgrFormState>(blankMgrForm());

  const [editTarget, setEditTarget] = useState<Delivery | null>(null);
  const [editForm, setEditForm] = useState<MgrFormState>(blankMgrForm());

  const [accTarget, setAccTarget] = useState<Delivery | null>(null);
  const [accCostPrice, setAccCostPrice] = useState('');
  const [accNote, setAccNote] = useState('');

  const [mdTarget, setMdTarget] = useState<Delivery | null>(null);
  const [mdNote, setMdNote] = useState('');
  const [mdRejectMode, setMdRejectMode] = useState(false);
  const [mdSellingPrice, setMdSellingPrice] = useState('');

  /* ── branch + role scoping ─────────────────────────────────────────────
     - admin / ceo / md / mktg : see all deliveries (approval chain)
     - acc / csm                : branch-scoped (all deliveries in their branch)
     - mgr                      : only their own submissions, branch-scoped
  ── */
  const isGlobalViewer = role === 'admin' || role === 'ceo' || role === 'md' || role === 'mktg';
  const sortedDeliveries = [...deliveries]
    .filter(d => {
      if (isGlobalViewer) return true;
      // branch-scope first
      const inBranch = !branchId || !d.branchId || d.branchId === branchId;
      if (!inBranch) return false;
      // mgr/csm see only their own submissions
      if (role === 'mgr' || role === 'csm') return d.receivedBy === userName;
      return true; // acc and others see all branch deliveries
    })
    .sort((a, b) => b.id - a.id);

  const pendingAccCount = sortedDeliveries.filter(d => d.approvalStatus === 'pending_acc' || d.approvalStatus === 'pending').length;
  const pendingMdCount  = sortedDeliveries.filter(d => d.approvalStatus === 'pending_md').length;

  // Branch-scoped tanks
  const myTanks    = tanks.filter(t => !branchId || !t.branchId || t.branchId === branchId);
  const myLpgTanks = lpgTanks.filter(l => !branchId || !l.branchId || l.branchId === branchId);

  // Inventory driven by actual tank dip levels (op + rv - sl), with deliveries &
  // pump shift reports as supporting received/sold metrics.
  const petrolProds = ['PMS', 'AGO', 'DPK'] as const;
  const petrolInv = petrolProds
    .map(prod => {
      const prodTanks = myTanks.filter(t => t.prod === prod);
      const currentStock = prodTanks.reduce((s, t) => s + Math.max(0, t.op + t.rv - t.sl), 0);
      const totalCap     = prodTanks.reduce((s, t) => s + t.cap, 0);
      // Received: all deliveries not in draft/rejected
      const received = deliveries
        .filter(d => d.prod === prod && d.approvalStatus !== 'draft' && d.approvalStatus !== 'rejected')
        .reduce((s, d) => s + d.rec, 0);
      // Sold: from approved pump shift reports
      const sold = pumpDailyReports
        .filter(r => r.product === prod && r.status === 'approved')
        .reduce((s, r) => s + r.liters, 0);
      // Avg cost from fully approved deliveries
      const appDlv    = deliveries.filter(d => d.prod === prod && (d.approvalStatus === 'md_approved' || d.approvalStatus === 'approved'));
      const appRec    = appDlv.reduce((s, d) => s + d.rec, 0);
      const avgCost   = appRec > 0 ? appDlv.reduce((s, d) => s + (d.costPrice ?? 0) * d.rec, 0) / appRec : 0;
      if (prodTanks.length === 0 && received === 0) return null;
      return { prod, currentStock, totalCap, totalReceived: received, totalSold: sold, avgCost, unit: 'L' };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const lpgStock    = myLpgTanks.reduce((s, l) => s + Math.max(0, l.op + l.rv - l.sl), 0);
  const lpgCap      = myLpgTanks.reduce((s, l) => s + l.cap, 0);
  const lpgReceived = deliveries.filter(d => d.prod === 'LPG' && d.approvalStatus !== 'draft' && d.approvalStatus !== 'rejected').reduce((s, d) => s + d.rec, 0);
  const lpgSold     = pumpDailyReports.filter(r => r.product === 'LPG' && r.status === 'approved').reduce((s, r) => s + r.liters, 0);
  const lpgAppDlv   = deliveries.filter(d => d.prod === 'LPG' && (d.approvalStatus === 'md_approved' || d.approvalStatus === 'approved'));
  const lpgAppRec   = lpgAppDlv.reduce((s, d) => s + d.rec, 0);
  const lpgAvgCost  = lpgAppRec > 0 ? lpgAppDlv.reduce((s, d) => s + (d.costPrice ?? 0) * d.rec, 0) / lpgAppRec : 0;
  const lpgInv = (myLpgTanks.length > 0 || lpgReceived > 0)
    ? [{ prod: 'LPG', currentStock: lpgStock, totalCap: lpgCap, totalReceived: lpgReceived, totalSold: lpgSold, avgCost: lpgAvgCost, unit: 'kg' }]
    : [];

  const inventory = [...petrolInv, ...lpgInv];

  function validateMgrForm(f: MgrFormState) {
    const ordN = parseFloat(f.ord);
    const recN = parseFloat(f.rec);
    if (!f.sup.trim()) { Alert.alert('Required', 'Supplier name is required.'); return null; }
    if (!f.wb.trim())  { Alert.alert('Required', 'Waybill number is required.'); return null; }
    if (!ordN || !recN) { Alert.alert('Required', 'Ordered and received quantities are required.'); return null; }
    return { ordN, recN };
  }

  function handleAdd() {
    const vals = validateMgrForm(form);
    if (!vals) return;
    addDelivery({
      dt: form.dt ? new Date(form.dt).toISOString() : new Date().toISOString(),
      sup: form.sup.trim(), prod: form.prod, wb: form.wb,
      ord: vals.ordN, rec: vals.recN, st: form.st, notes: form.notes,
      receivedBy: userName, approvalStatus: 'draft',
      branchId: branchId ?? undefined,
    });
    setForm(blankMgrForm());
    setShowForm(false);
  }

  function openEdit(d: Delivery) { setEditTarget(d); setEditForm(deliveryToMgrForm(d)); }

  function handleUpdate() {
    if (!editTarget) return;
    const vals = validateMgrForm(editForm);
    if (!vals) return;
    updateDelivery(editTarget.id, {
      dt: editForm.dt ? new Date(editForm.dt).toISOString() : editTarget.dt,
      sup: editForm.sup.trim(), prod: editForm.prod, wb: editForm.wb,
      ord: vals.ordN, rec: vals.recN, st: editForm.st, notes: editForm.notes,
      receivedBy: editTarget.receivedBy,
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

  function handleSubmitToAcc(d: Delivery) {
    Alert.alert(
      'Forward to Accountant?',
      `WB: ${d.wb} — ${d.prod} ${d.rec.toLocaleString()}L from ${d.sup}\n\nAccountant will set the cost price and forward to MD for approval.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Forward', onPress: () => submitDeliveryForApproval(d.id) },
      ]
    );
  }

  function openAccModal(d: Delivery) {
    setAccTarget(d);
    setAccCostPrice(d.costPrice ? String(d.costPrice) : '');
    setAccNote(d.accNote ?? '');
  }

  function handleAccForward() {
    if (!accTarget) return;
    const cost = parseFloat(accCostPrice);
    if (!cost || cost <= 0) { Alert.alert('Required', 'Enter a valid cost price per litre.'); return; }
    Alert.alert(
      'Forward to MD for Approval?',
      `${accTarget.prod} ${accTarget.rec.toLocaleString()}L · Cost ₦${cost.toLocaleString()}/L\n\nMD will approve or return this record.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forward to MD',
          onPress: () => {
            accForwardToMd(accTarget.id, cost, accNote.trim());
            setAccTarget(null);
            setAccCostPrice('');
            setAccNote('');
          },
        },
      ]
    );
  }

  function openMdModal(d: Delivery, reject: boolean) {
    setMdTarget(d);
    setMdNote('');
    setMdRejectMode(reject);
    if (!reject) {
      // Pre-fill with current global price for this product
      const curPrice = (prices as any)[d.prod];
      setMdSellingPrice(curPrice && curPrice > 0 ? String(curPrice) : '');
    }
  }

  function handleMdApprove() {
    if (!mdTarget) return;
    const sell = parseFloat(mdSellingPrice);
    if (!sell || sell <= 0) { Alert.alert('Required', 'Enter a valid selling price per litre before approving.'); return; }
    Alert.alert(
      'Approve & Lock Record?',
      `${mdTarget.prod} ${mdTarget.rec.toLocaleString()}L from ${mdTarget.sup}\nWB: ${mdTarget.wb}\nCost: ₦${mdTarget.costPrice?.toLocaleString()}/L · Sell: ₦${sell.toLocaleString()}/L\n\nThis record will be permanently locked and the selling price will be updated system-wide.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => {
            approveDelivery(mdTarget.id, sell, mdNote.trim() || undefined);
            setMdTarget(null);
            setMdSellingPrice('');
            setMdNote('');
          },
        },
      ]
    );
  }

  function handleMdRejectConfirm() {
    if (!mdTarget) return;
    if (!mdNote.trim()) { Alert.alert('Required', 'Provide a reason for returning this record.'); return; }
    rejectDelivery(mdTarget.id, mdNote.trim());
    setMdTarget(null);
    setMdNote('');
  }

  const canMgrEdit = (d: Delivery) =>
    isMgr && (d.approvalStatus === 'draft' || !d.approvalStatus);
  const canMgrSubmit = (d: Delivery) =>
    isMgr && (d.approvalStatus === 'draft' || !d.approvalStatus);
  const canAccSet = (d: Delivery) =>
    isAcc && (d.approvalStatus === 'pending_acc' || d.approvalStatus === 'pending');
  const canMdAct = (d: Delivery) =>
    isMd && d.approvalStatus === 'pending_md';
  const isLocked = (d: Delivery) =>
    d.approvalStatus === 'md_approved' || d.approvalStatus === 'approved';

  return (
    <ScreenLayout
      title="Product Receiving"
      rightAction={
        isMgr ? (
          <TouchableOpacity onPress={() => { setForm(blankMgrForm()); setShowForm(true); }} style={styles.headerBtn}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        ) : undefined
      }
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {isAcc && pendingAccCount > 0 ? (
          <View style={[styles.banner, { backgroundColor: '#E6F1FB', borderColor: '#185FA5' }]}>
            <Ionicons name="pricetag" size={16} color="#185FA5" />
            <Text style={[styles.bannerText, { color: '#185FA5' }]}>
              {pendingAccCount}{' record'}{pendingAccCount > 1 ? 's' : ''}{' awaiting your cost price entry'}
            </Text>
          </View>
        ) : null}

        {isMd && pendingMdCount > 0 ? (
          <View style={[styles.banner, { backgroundColor: '#FAEEDA', borderColor: '#BA7517' }]}>
            <Ionicons name="checkmark-done" size={16} color="#BA7517" />
            <Text style={[styles.bannerText, { color: '#BA7517' }]}>
              {pendingMdCount}{' delivery record'}{pendingMdCount > 1 ? 's' : ''}{' awaiting your approval'}
            </Text>
          </View>
        ) : null}

        {inventory.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Current Inventory</Text>
            <View style={styles.inventoryGrid}>
              {inventory.map(inv => {
                const pc  = PROD_COLORS[inv.prod] || roleColor;
                const low = inv.totalCap > 0 ? inv.currentStock < inv.totalCap * 0.2 : false;
                return (
                  <View key={inv.prod} style={[styles.invCard, { backgroundColor: colors.surface, borderColor: low ? '#BA7517' : colors.border }]}>
                    <View style={[styles.invProdBadge, { backgroundColor: pc + '18' }]}>
                      <Ionicons name="cube-outline" size={12} color={pc} />
                      <Text style={[styles.invProdText, { color: pc }]}>{inv.prod}</Text>
                    </View>
                    <Text style={[styles.invAvail, { color: low ? '#BA7517' : '#27500A' }]}>
                      {inv.currentStock.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      <Text style={[styles.invUnit, { color: colors.textMuted }]}>{' ' + inv.unit + ' in stock'}</Text>
                    </Text>
                    {inv.totalCap > 0 ? (
                      <View style={[styles.progressBg, { backgroundColor: colors.border, marginBottom: 8 }]}>
                        <View style={[styles.progressBar, { width: `${Math.min(100, Math.round((inv.currentStock / inv.totalCap) * 100))}%` as any, backgroundColor: low ? '#BA7517' : pc }]} />
                      </View>
                    ) : null}
                    <View style={styles.invDetail}>
                      <View style={styles.invDetailItem}>
                        <Text style={[styles.invDetailLabel, { color: colors.textMuted }]}>Received</Text>
                        <Text style={[styles.invDetailVal, { color: colors.text }]}>{inv.totalReceived.toLocaleString()}{' ' + inv.unit}</Text>
                      </View>
                      <View style={[styles.invDetailDivider, { backgroundColor: colors.border }]} />
                      <View style={styles.invDetailItem}>
                        <Text style={[styles.invDetailLabel, { color: colors.textMuted }]}>Sold</Text>
                        <Text style={[styles.invDetailVal, { color: '#791F1F' }]}>{inv.totalSold.toLocaleString(undefined, { maximumFractionDigits: 0 })}{' ' + inv.unit}</Text>
                      </View>
                      {inv.avgCost > 0 ? (
                        <>
                          <View style={[styles.invDetailDivider, { backgroundColor: colors.border }]} />
                          <View style={styles.invDetailItem}>
                            <Text style={[styles.invDetailLabel, { color: colors.textMuted }]}>Avg Cost</Text>
                            <Text style={[styles.invDetailVal, { color: colors.text }]}>{'₦'}{Math.round(inv.avgCost).toLocaleString()}</Text>
                          </View>
                        </>
                      ) : null}
                    </View>
                    {low ? (
                      <View style={[styles.lowBadge, { backgroundColor: '#FAEEDA' }]}>
                        <Ionicons name="warning-outline" size={11} color="#BA7517" />
                        <Text style={[styles.lowText, { color: '#BA7517' }]}>Low stock</Text>
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
            {isMgr ? <Text style={[styles.emptyText, { color: colors.textSubtle, fontSize: 12 }]}>Tap + to record a product receipt</Text> : null}
          </View>
        ) : null}

        {sortedDeliveries.map(d => {
          const st = ST_MAP[d.st] || ST_MAP.ok;
          const pc = PROD_COLORS[d.prod] || roleColor;
          const apSt = d.approvalStatus || 'draft';
          const apCfg = APPR_MAP[apSt] || APPR_MAP.draft;
          const hasCost = !!(d.costPrice && d.costPrice > 0);
          const sellPrice = d.sellingPrice ?? ((prices as any)[d.prod] ?? 0);
          const margin = hasCost && sellPrice ? Math.round(((sellPrice - d.costPrice!) / sellPrice) * 100) : null;
          const totalCostVal = hasCost ? d.rec * d.costPrice! : null;
          const locked = isLocked(d);

          return (
            <View key={d.id} style={[styles.delivCard, {
              backgroundColor: colors.surface,
              borderColor: apSt === 'pending_md' ? '#BA7517' : locked ? '#27500A' : apSt === 'pending_acc' || apSt === 'pending' ? '#185FA5' : colors.border,
              borderWidth: apSt !== 'draft' ? 1.5 : 1,
            }]}>
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

              <View style={styles.delivBody}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.delivWb, { color: colors.text }]}>{'WB: '}{d.wb}</Text>
                  <Text style={[styles.delivSup, { color: colors.textMuted }]}>{d.sup}</Text>
                  <Text style={[styles.delivQty, { color: colors.textMuted }]}>
                    {'Ordered: '}{d.ord.toLocaleString()}{' L · Received: '}
                    <Text style={{ fontWeight: '700', color: colors.text }}>{d.rec.toLocaleString()}{' L'}</Text>
                  </Text>
                  {d.notes ? <Text style={[styles.delivNotes, { color: colors.textSubtle }]}>{d.notes}</Text> : null}
                  {(apSt === 'pending_acc' || apSt === 'pending') && d.rejectedNote ? (
                    <Text style={[styles.delivNotes, { color: '#791F1F' }]}>{'Returned by MD: '}{d.rejectedNote}</Text>
                  ) : null}
                </View>
              </View>

              {hasCost ? (
                <View style={[styles.costRow, { backgroundColor: '#0F6E5608', borderColor: '#0F6E5620' }]}>
                  <View style={styles.costItem}>
                    <Text style={[styles.costLabel, { color: colors.textMuted }]}>Cost/L</Text>
                    <Text style={[styles.costVal, { color: colors.text }]}>{'₦'}{d.costPrice!.toLocaleString()}</Text>
                  </View>
                  {sellPrice > 0 ? (
                    <>
                      <View style={styles.costDivider} />
                      <View style={styles.costItem}>
                        <Text style={[styles.costLabel, { color: colors.textMuted }]}>Sell/L</Text>
                        <Text style={[styles.costVal, { color: pc }]}>{'₦'}{sellPrice.toLocaleString()}</Text>
                      </View>
                    </>
                  ) : null}
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

              {d.accBy ? (
                <View style={[styles.trailRow, { backgroundColor: '#E6F1FB', borderColor: '#185FA520' }]}>
                  <Ionicons name="pricetag" size={12} color="#185FA5" />
                  <Text style={[styles.trailText, { color: '#185FA5' }]}>
                    {'Cost set by '}{d.accBy}{d.accAt ? ' · ' + fmtDateTime(d.accAt) : ''}
                    {d.accNote ? ' — ' + d.accNote : ''}
                  </Text>
                </View>
              ) : null}

              {locked && d.approvedBy ? (
                <View style={[styles.trailRow, { backgroundColor: '#EAF3DE', borderColor: '#27500A20' }]}>
                  <Ionicons name="checkmark-circle" size={12} color="#27500A" />
                  <Text style={[styles.trailText, { color: '#27500A' }]}>
                    {'MD Approved by '}{d.approvedBy}
                    {d.approvedAt ? ' · ' + fmtDateTime(d.approvedAt) : ''}
                    {' · Counts toward inventory'}
                  </Text>
                </View>
              ) : null}

              {d.receivedBy ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="person-outline" size={11} color={colors.textSubtle} />
                  <Text style={[styles.receivedBy, { color: colors.textSubtle }]}>{'Received by '}{d.receivedBy}</Text>
                </View>
              ) : null}

              {canMgrEdit(d) ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity onPress={() => openEdit(d)} style={[styles.actionBtn, { borderColor: '#185FA5' }]}>
                    <Ionicons name="create-outline" size={14} color="#185FA5" />
                    <Text style={[styles.actionBtnText, { color: '#185FA5' }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(d)} style={[styles.actionBtn, { borderColor: '#791F1F' }]}>
                    <Ionicons name="trash-outline" size={14} color="#791F1F" />
                    <Text style={[styles.actionBtnText, { color: '#791F1F' }]}>Delete</Text>
                  </TouchableOpacity>
                  {canMgrSubmit(d) ? (
                    <TouchableOpacity onPress={() => handleSubmitToAcc(d)} style={[styles.forwardBtn, { backgroundColor: roleColor }]}>
                      <Ionicons name="send" size={14} color="#fff" />
                      <Text style={styles.forwardBtnText}>Forward to Acc</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              {canAccSet(d) ? (
                <TouchableOpacity onPress={() => openAccModal(d)} style={[styles.fullBtn, { backgroundColor: '#185FA5' }]}>
                  <Ionicons name="pricetag-outline" size={14} color="#fff" />
                  <Text style={styles.fullBtnText}>Set Cost Price & Forward to MD</Text>
                </TouchableOpacity>
              ) : null}

              {canMdAct(d) ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    onPress={() => openMdModal(d, true)}
                    style={[styles.actionBtn, { borderColor: '#791F1F', flex: 1 }]}
                  >
                    <Ionicons name="return-down-back-outline" size={14} color="#791F1F" />
                    <Text style={[styles.actionBtnText, { color: '#791F1F' }]}>Return</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => openMdModal(d, false)}
                    style={[styles.approveBtn]}
                  >
                    <Ionicons name="checkmark-circle" size={14} color="#fff" />
                    <Text style={styles.approveBtnText}>Set Price & Approve</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {locked ? (
                <View style={[styles.lockRow, { borderColor: '#27500A' }]}>
                  <Ionicons name="lock-closed" size={12} color="#27500A" />
                  <Text style={[styles.lockText, { color: '#27500A' }]}>Permanently locked — counts toward inventory</Text>
                </View>
              ) : null}
            </View>
          );
        })}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Manager: Add Modal */}
      <ModalSheet visible={showForm} onClose={() => setShowForm(false)}>
        <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          <Text style={[styles.sheetTitle, { color: colors.text }]}>Record Product Receipt</Text>
          <View style={[styles.infoBox, { backgroundColor: '#E6F1FB', borderColor: '#185FA5' }]}>
            <Ionicons name="information-circle-outline" size={15} color="#185FA5" />
            <Text style={[styles.infoText, { color: '#185FA5' }]}>
              {'Record the physical delivery details. Cost price will be set by the accountant after you forward this record.'}
            </Text>
          </View>
          <MgrFormFields f={form} setF={setForm} roleColor={roleColor} />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32 }}>
            <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleAdd}>
              <Text style={styles.saveBtnText}>Save as Draft</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setShowForm(false)}>
              <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </ModalSheet>

      {/* Manager: Edit Modal */}
      <ModalSheet visible={editTarget !== null} onClose={() => setEditTarget(null)}>
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
          <MgrFormFields f={editForm} setF={setEditForm} roleColor={roleColor} />
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
      </ModalSheet>

      {/* Accountant: Set Cost Price Modal */}
      <ModalSheet visible={accTarget !== null} onClose={() => setAccTarget(null)}>
        <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          <View style={styles.editHeader}>
            <View style={[styles.editIconBox, { backgroundColor: '#E6F1FB' }]}>
              <Ionicons name="pricetag" size={18} color="#185FA5" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.text, marginBottom: 0 }]}>Set Cost Price</Text>
              <Text style={[styles.editSub, { color: colors.textMuted }]}>
                {accTarget?.prod}{' · '}{accTarget?.rec.toLocaleString()}{' L · WB: '}{accTarget?.wb}
              </Text>
            </View>
          </View>

          <View style={[styles.delivSummaryBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.delivSummaryRow, { color: colors.textMuted }]}>
              {'Supplier: '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>{accTarget?.sup}</Text>
            </Text>
            <Text style={[styles.delivSummaryRow, { color: colors.textMuted }]}>
              {'Received: '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>{accTarget?.rec.toLocaleString()}{' L'}</Text>
              {'  ·  Ordered: '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>{accTarget?.ord.toLocaleString()}{' L'}</Text>
            </Text>
            <Text style={[styles.delivSummaryRow, { color: colors.textMuted }]}>
              {'Date: '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>{accTarget ? fmtDate(accTarget.dt) : ''}</Text>
            </Text>
          </View>

          <View style={[styles.costPriceBox, { backgroundColor: '#E6F1FB', borderColor: '#185FA5' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Ionicons name="pricetag-outline" size={15} color="#185FA5" />
              <Text style={[styles.costPriceLabel, { color: '#185FA5' }]}>Cost Price (₦ per litre) *</Text>
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: '#185FA550', color: colors.text, marginBottom: 0, fontSize: 18, fontWeight: '700' }]}
              placeholder="e.g. 780"
              placeholderTextColor={colors.textSubtle}
              keyboardType="numeric"
              value={accCostPrice}
              onChangeText={setAccCostPrice}
            />
            {accCostPrice && accTarget ? (
              <View style={{ marginTop: 8, gap: 3 }}>
                <Text style={[styles.costHint, { color: colors.textMuted }]}>
                  {'Total cost: '}
                  <Text style={{ fontWeight: '700', color: colors.text }}>
                    {fmt(parseFloat(accCostPrice) * accTarget.rec)}
                  </Text>
                </Text>
                {(prices as any)[accTarget.prod] > 0 ? (
                  <Text style={[styles.costHint, { color: colors.textMuted }]}>
                    {'Sell: ₦'}{((prices as any)[accTarget.prod]).toLocaleString()}{'/L  ·  Margin: '}
                    <Text style={{ fontWeight: '700', color: ((prices as any)[accTarget.prod] - parseFloat(accCostPrice)) >= 0 ? '#27500A' : '#791F1F' }}>
                      {Math.round((((prices as any)[accTarget.prod] - parseFloat(accCostPrice)) / (prices as any)[accTarget.prod]) * 100)}{'%'}
                    </Text>
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Note to MD (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            placeholder="Any observations on this delivery..."
            placeholderTextColor={colors.textSubtle}
            multiline numberOfLines={3}
            value={accNote}
            onChangeText={setAccNote}
          />

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32 }}>
            <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setAccTarget(null)}>
              <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, { flex: 2, backgroundColor: '#185FA5' }]} onPress={handleAccForward}>
              <Ionicons name="send" size={15} color="#fff" />
              <Text style={styles.saveBtnText}>Forward to MD</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </ModalSheet>

      {/* MD: Set Selling Price & Approve Modal */}
      <ModalSheet visible={mdTarget !== null && !mdRejectMode} onClose={() => { setMdTarget(null); setMdSellingPrice(''); setMdNote(''); }}>
        <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          <View style={styles.editHeader}>
            <View style={[styles.editIconBox, { backgroundColor: '#EAF3DE' }]}>
              <Ionicons name="checkmark-circle" size={18} color="#27500A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.text, marginBottom: 0 }]}>Set Selling Price & Approve</Text>
              <Text style={[styles.editSub, { color: colors.textMuted }]}>
                {mdTarget?.prod}{' · '}{mdTarget?.rec.toLocaleString()}{' L · WB: '}{mdTarget?.wb}
              </Text>
            </View>
          </View>

          <View style={[styles.delivSummaryBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.delivSummaryRow, { color: colors.textMuted }]}>
              {'Supplier: '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>{mdTarget?.sup}</Text>
            </Text>
            <Text style={[styles.delivSummaryRow, { color: colors.textMuted }]}>
              {'Received: '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>{mdTarget?.rec.toLocaleString()}{' L'}</Text>
              {'  ·  Cost Price: '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>{'₦'}{mdTarget?.costPrice?.toLocaleString()}{'/L'}</Text>
            </Text>
            {mdTarget?.accNote ? (
              <Text style={[styles.delivSummaryRow, { color: colors.textMuted }]}>
                {'Acc note: '}
                <Text style={{ color: colors.text, fontWeight: '600' }}>{mdTarget.accNote}</Text>
              </Text>
            ) : null}
          </View>

          <View style={[styles.costPriceBox, { backgroundColor: '#EAF3DE', borderColor: '#27500A' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Ionicons name="cash-outline" size={15} color="#27500A" />
              <Text style={[styles.costPriceLabel, { color: '#27500A' }]}>Selling Price (₦ per litre) *</Text>
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: '#27500A50', color: colors.text, marginBottom: 0, fontSize: 18, fontWeight: '700' }]}
              placeholder="e.g. 950"
              placeholderTextColor={colors.textSubtle}
              keyboardType="numeric"
              value={mdSellingPrice}
              onChangeText={setMdSellingPrice}
            />
            {mdSellingPrice && mdTarget?.costPrice ? (
              <View style={{ marginTop: 8, gap: 3 }}>
                <Text style={[styles.costHint, { color: colors.textMuted }]}>
                  {'Total revenue: '}
                  <Text style={{ fontWeight: '700', color: colors.text }}>
                    {fmt(parseFloat(mdSellingPrice) * mdTarget.rec)}
                  </Text>
                </Text>
                <Text style={[styles.costHint, { color: colors.textMuted }]}>
                  {'Margin: '}
                  <Text style={{ fontWeight: '700', color: (parseFloat(mdSellingPrice) - mdTarget.costPrice) >= 0 ? '#27500A' : '#791F1F' }}>
                    {Math.round(((parseFloat(mdSellingPrice) - mdTarget.costPrice) / parseFloat(mdSellingPrice)) * 100)}{'%'}
                    {'  ·  ₦'}{(parseFloat(mdSellingPrice) - mdTarget.costPrice).toLocaleString()}{'/L profit'}
                  </Text>
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={[styles.inputLabel, { color: colors.textMuted }]}>MD Note (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            placeholder="Any notes on this approval..."
            placeholderTextColor={colors.textSubtle}
            multiline numberOfLines={3}
            value={mdNote}
            onChangeText={setMdNote}
          />

          <View style={[{ backgroundColor: '#FAEEDA', borderRadius: 10, padding: 10, marginBottom: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
            <Ionicons name="information-circle-outline" size={16} color="#BA7517" />
            <Text style={{ fontSize: 12, color: '#BA7517', flex: 1, fontWeight: '500' }}>
              {'Approving will permanently lock this record and update the system selling price for '}{mdTarget?.prod}{' across all branches.'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32 }}>
            <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => { setMdTarget(null); setMdSellingPrice(''); setMdNote(''); }}>
              <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, { flex: 2, backgroundColor: '#27500A' }]} onPress={handleMdApprove}>
              <Ionicons name="checkmark-circle" size={15} color="#fff" />
              <Text style={styles.saveBtnText}>Approve & Lock</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </ModalSheet>

      {/* MD: Reject / Return Modal */}
      <ModalSheet visible={mdTarget !== null && mdRejectMode} onClose={() => { setMdTarget(null); setMdNote(''); }}>
        <View style={[styles.smallModal, { backgroundColor: colors.surface }]}>
          <View style={styles.editHeader}>
            <View style={[styles.editIconBox, { backgroundColor: '#FCEBEB' }]}>
              <Ionicons name="return-down-back" size={18} color="#791F1F" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.text, marginBottom: 0 }]}>Return to Accountant</Text>
              <Text style={[styles.editSub, { color: colors.textMuted }]}>
                {mdTarget?.prod}{' · WB: '}{mdTarget?.wb}
              </Text>
            </View>
          </View>
          <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Reason for Return *</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            value={mdNote}
            onChangeText={setMdNote}
            placeholder="e.g. Cost price appears incorrect, please review"
            placeholderTextColor={colors.textSubtle}
            multiline numberOfLines={3}
            autoFocus
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => { setMdTarget(null); setMdNote(''); }}>
              <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, { flex: 2, backgroundColor: '#791F1F' }]} onPress={handleMdRejectConfirm}>
              <Ionicons name="return-down-back" size={15} color="#fff" />
              <Text style={styles.saveBtnText}>Return to Accountant</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ModalSheet>
    </ScreenLayout>
  );

}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 12 },
  bannerText: { fontSize: 13, fontWeight: '600', flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10, marginTop: 4 },
  inventoryGrid: { gap: 8, marginBottom: 16 },
  invCard: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 8 },
  progressBg:  { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: 6, borderRadius: 3 },
  invProdBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  invProdText: { fontSize: 12, fontWeight: '700' },
  invAvail: { fontSize: 24, fontWeight: '800' },
  invUnit: { fontSize: 14, fontWeight: '500' },
  invDetail: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  invDetailItem: { flex: 1, alignItems: 'center', gap: 2 },
  invDetailDivider: { width: 1, height: 28 },
  invDetailLabel: { fontSize: 10 },
  invDetailVal: { fontSize: 12, fontWeight: '700' },
  lowBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  lowText: { fontSize: 11, fontWeight: '700' },
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
  trailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  trailText: { fontSize: 11, fontWeight: '600', flex: 1 },
  receivedBy: { fontSize: 10 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1.5 },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  forwardBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8 },
  forwardBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  fullBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  fullBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  approveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, backgroundColor: '#27500A' },
  approveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  lockText: { fontSize: 11, fontWeight: '600' },
  headerBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 24, maxHeight: '92%' },
  smallModal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  editHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  editIconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  editSub: { fontSize: 12, marginTop: 2 },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 14 },
  infoText: { fontSize: 12, flex: 1, lineHeight: 18 },
  delivSummaryBox: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 14, gap: 4 },
  delivSummaryRow: { fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 10 },
  textArea: { height: 80, textAlignVertical: 'top' },
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
