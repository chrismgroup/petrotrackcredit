import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ModalSheet } from '@/components/FormSheet';
import { AppliedDateField } from '@/components/AppliedDateField';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

import { ScreenLayout } from '@/components/ScreenLayout';
import { useBusinessDateConfirmation } from '@/components/BusinessDateConfirmation';
import { Delivery, ROLE_COLORS, fmt, fmtDate, fmtDateTime, getPriceForProduct, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { safeNum } from '@/lib/report-helpers';

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
  returned:    { label: 'Returned for Correction', color: '#791F1F', bg: '#FCEBEB', icon: 'return-down-back' },
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

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function todayIso() { return localDateKey(new Date()); }
function unitForProd(p: string) { return p === 'LPG' ? 'kg' : 'L'; }
function blankMgrForm(): MgrFormState {
  return { prod: 'PMS', sup: '', wb: '', ord: '', rec: '', st: 'ok', notes: '', dt: '' };
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
          placeholder={`Qty ordered (${unitForProd(f.prod)})`} placeholderTextColor={colors.textSubtle}
          keyboardType="numeric" value={f.ord}
          onChangeText={v => setF(prev => ({ ...prev, ord: v }))}
        />
        <TextInput
          style={[styles.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholder={`Qty received (${unitForProd(f.prod)})`} placeholderTextColor={colors.textSubtle}
          keyboardType="numeric" value={f.rec}
          onChangeText={v => setF(prev => ({ ...prev, rec: v }))}
        />
      </View>

      {(() => {
        const ordN = parseFloat(f.ord);
        const recN = parseFloat(f.rec);
        if (!ordN || !recN || ordN === recN) return null;
        const diff = recN - ordN;
        const short = diff < 0;
        return (
          <View style={[styles.mismatchBox, { backgroundColor: short ? '#FAEEDA' : '#FCEBEB', borderColor: short ? '#BA7517' : '#791F1F' }]}>
            <Ionicons name={short ? 'warning-outline' : 'alert-circle-outline'} size={15} color={short ? '#BA7517' : '#791F1F'} />
            <Text style={[styles.mismatchText, { color: short ? '#BA7517' : '#791F1F' }]}>
              {(() => {
                const u = unitForProd(f.prod);
                return short
                  ? `Shortage of ${Math.abs(diff).toLocaleString()} ${u} — received less than ordered`
                  : `Overage of ${diff.toLocaleString()} ${u} — received more than ordered`;
              })()}
            </Text>
          </View>
        );
      })()}

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

      <AppliedDateField
        value={f.dt}
        onChange={dt => setF(prev => ({ ...prev, dt }))}
        label="Delivery applies on *"
        accent={roleColor}
        helper="Choose the date the delivery was received. Submission time is tracked separately."
      />

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
    deliveries, prices, branches,
    deliveryEvidences, addDeliveryEvidence,
    addDeliveryConfirmed, updateDeliveryConfirmed, deleteDelivery,
    submitDeliveryForApprovalConfirmed, accForwardToMdConfirmed, accRecallDelivery, approveDeliveryConfirmed, rejectDeliveryConfirmed,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;
  const { requestDateConfirmation, confirmationModal } = useBusinessDateConfirmation();
  const [filterDate, setFilterDate] = useState('');

  const isMgr        = role === 'mgr' || role === 'csm' || role === 'admin';
  const isAcc        = role === 'acc' || role === 'admin';
  const isMd         = role === 'md' || role === 'admin';
  const isAdmin      = role === 'admin';

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
  const [isSubmittingMdAction, setIsSubmittingMdAction] = useState(false);
  const [isSubmittingAccForward, setIsSubmittingAccForward] = useState(false);
  const [isSavingDelivery, setIsSavingDelivery] = useState(false);
  const deliveryScrollRef = useRef<ScrollView>(null);

  /* ── branch + role scoping ─────────────────────────────────────────────
     - admin / ceo / md / mktg / acc / csm : see all delivery records
     - mgr                      : only their own submissions, branch-scoped
  ── */
  const isGlobalViewer = role === 'admin' || role === 'ceo' || role === 'md' || role === 'mktg' || role === 'acc' || role === 'csm';
  // Deliveries still awaiting accountant/MD action surface first (most
  // recently submitted of those on top), so a report can never be buried
  // under already-resolved records further down the list.
  const compareDeliveriesForReview = (a: Delivery, b: Delivery) => {
    const isPending = (d: Delivery) => d.approvalStatus === 'pending_acc' || d.approvalStatus === 'pending' || d.approvalStatus === 'pending_md';
    const rank = (d: Delivery) => isPending(d) ? 0 : 1;
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return b.id - a.id;
  };
  const visibleDeliveries = [...deliveries]
    .filter(d => {
      if (isGlobalViewer) return true;
      // branch-scope first
      const inBranch = !branchId || !d.branchId || d.branchId === branchId;
      if (!inBranch) return false;
      // station managers see only their own submissions
      if (role === 'mgr') return d.receivedBy === userName;
      return true; // acc and others see all branch deliveries
    })
    .sort(compareDeliveriesForReview);
  const sortedDeliveries = filterDate
    ? visibleDeliveries.filter(d => d.dt.slice(0, 10) === filterDate)
    : visibleDeliveries;

  const pendingAccCount = sortedDeliveries.filter(d => d.approvalStatus === 'pending_acc' || d.approvalStatus === 'pending').length;
  const pendingMdCount  = sortedDeliveries.filter(d => d.approvalStatus === 'pending_md').length;

  function fmtSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function pickFromGallery(delivId: number) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Media library access is needed to attach photos or videos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85, allowsEditing: false });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      const isVid = a.type === 'video';
      const saved = await addDeliveryEvidence({ delivId, type: isVid ? 'video' : 'photo', name: a.fileName ?? `${isVid ? 'video' : 'photo'}_${Date.now()}`, by: userName ?? '', uri: a.uri, mimeType: a.mimeType ?? (isVid ? 'video/mp4' : 'image/jpeg'), size: a.fileSize });
      if (!saved.ok) Alert.alert('Evidence not saved', saved.error ?? 'The server could not save this attachment. Please select it again to retry.');
    }
  }

  async function pickDocument(delivId: number) {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (!result.canceled && result.assets?.[0]) {
      const a = result.assets[0];
      const saved = await addDeliveryEvidence({ delivId, type: 'document', name: a.name, by: userName ?? '', uri: a.uri, mimeType: a.mimeType ?? 'application/octet-stream', size: a.size });
      if (!saved.ok) Alert.alert('Evidence not saved', saved.error ?? 'The server could not save this document. Please select it again to retry.');
    }
  }

  function validateMgrForm(f: MgrFormState) {
    const ordN = parseFloat(f.ord);
    const recN = parseFloat(f.rec);
    if (!f.sup.trim()) { Alert.alert('Required', 'Supplier name is required.'); return null; }
    if (!f.wb.trim())  { Alert.alert('Required', 'Waybill number is required.'); return null; }
    if (!ordN || !recN) { Alert.alert('Required', 'Ordered and received quantities are required.'); return null; }
    if (!f.dt) { Alert.alert('Date required', 'Select the date this delivery applies to.'); return null; }
    return { ordN, recN };
  }

  function handleAdd() {
    if (isSavingDelivery) return;
    const vals = validateMgrForm(form);
    if (!vals) return;
    if (!branchId) {
      Alert.alert('Branch assignment required', 'Assign this manager to a branch before recording a delivery so the stock is added to the correct inventory ledger.');
      return;
    }
    requestDateConfirmation('delivery', form.dt, async () => {
      setIsSavingDelivery(true);
      const result = await addDeliveryConfirmed({
        dt: form.dt,
        sup: form.sup.trim(), prod: form.prod, wb: form.wb,
        ord: vals.ordN, rec: vals.recN, st: form.st, notes: form.notes,
        receivedBy: userName, approvalStatus: 'draft',
        branchId: branchId ?? undefined,
      });
      setIsSavingDelivery(false);
      if (!result.ok) {
        Alert.alert('Delivery not saved', result.error ?? 'The server could not save this delivery. Your entries remain available so you can retry.');
        return;
      }
      setForm(blankMgrForm());
      setShowForm(false);
    }, 'Confirm & save');
  }

  function openEdit(d: Delivery) { setEditTarget(d); setEditForm(deliveryToMgrForm(d)); }

  function handleUpdate() {
    if (isSavingDelivery) return;
    if (!editTarget) return;
    const vals = validateMgrForm(editForm);
    if (!vals) return;
    requestDateConfirmation('delivery', editForm.dt, async () => {
      setIsSavingDelivery(true);
      const updated = await updateDeliveryConfirmed(editTarget.id, {
        dt: editForm.dt,
        sup: editForm.sup.trim(), prod: editForm.prod, wb: editForm.wb,
        ord: vals.ordN, rec: vals.recN, st: editForm.st, notes: editForm.notes,
        receivedBy: editTarget.receivedBy,
        approvalStatus: 'draft',
      });
      setIsSavingDelivery(false);
      if (!updated.ok) {
        Alert.alert('Unable to update', updated.error ?? 'The server could not update this delivery. Your changes remain available so you can retry.');
        return;
      }
      setEditTarget(null);
    }, 'Confirm & save');
  }

  function handleDelete(d: Delivery) {
    Alert.alert(
      'Delete Delivery?',
      `WB: ${d.wb} — ${d.prod} ${safeNum(d.rec).toLocaleString()}${unitForProd(d.prod)}\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          if (!deleteDelivery(d.id)) {
            Alert.alert('Unable to delete', 'Returned deliveries can only be deleted by their originator. Approved deliveries can only be deleted by an admin.');
          }
        } },
      ]
    );
  }

  function handleSubmitToAcc(d: Delivery) {
    const rec = safeNum(d.rec); const ord = safeNum(d.ord);
    const mismatch = rec !== ord;
    const u = unitForProd(d.prod);
    const mismatchLine = mismatch
      ? `\n\n⚠️ ${rec < ord
          ? `Shortage: received ${(ord - rec).toLocaleString()} ${u} less than ordered`
          : `Overage: received ${(rec - ord).toLocaleString()} ${u} more than ordered`}`
      : '';
    Alert.alert(
      mismatch ? '⚠️ Quantity Mismatch — Forward Anyway?' : 'Forward to Accountant?',
      `WB: ${d.wb} — ${d.prod} ${rec.toLocaleString()}${u} from ${d.sup}${mismatchLine}\n\nAccountant will set the cost price and forward to MD for approval.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: mismatch ? 'Forward Anyway' : 'Forward', style: mismatch ? 'destructive' : 'default', onPress: async () => {
          const result = await submitDeliveryForApprovalConfirmed(d.id);
          if (!result.ok) Alert.alert('Delivery not forwarded', result.error ?? 'The server could not forward this delivery.');
        } },
      ]
    );
  }

  function openAccModal(d: Delivery) {
    setAccTarget(d);
    setAccCostPrice(d.costPrice ? String(d.costPrice) : '');
    setAccNote(d.accNote ?? '');
  }

  function handleAccForward() {
    if (!accTarget || isSubmittingAccForward) return;
    const cost = parseFloat(accCostPrice);
    if (!cost || cost <= 0) { Alert.alert('Required', `Enter a valid cost price per ${unitForProd(accTarget.prod)}.`); return; }
    Alert.alert(
      'Forward to MD for Approval?',
      `${accTarget.prod} ${safeNum(accTarget.rec).toLocaleString()}${unitForProd(accTarget.prod)} · Cost ₦${cost.toLocaleString()}/${unitForProd(accTarget.prod)}\n\nMD will approve or return this record.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forward to MD',
          onPress: async () => {
            if (isSubmittingAccForward) return;
            setIsSubmittingAccForward(true);
            const result = await accForwardToMdConfirmed(accTarget.id, cost, accNote.trim());
            setIsSubmittingAccForward(false);
            if (!result.ok) {
              Alert.alert('Delivery not forwarded', result.error ?? 'The server could not forward this delivery. Your cost and note remain available.');
              return;
            }
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
      // Pre-fill with the current price for this delivery's branch.
      const curPrice = getPriceForProduct(prices, d.prod, d.branchId ?? branchId);
      setMdSellingPrice(curPrice && curPrice > 0 ? String(curPrice) : '');
    }
  }

  function handleMdApprove() {
    if (!mdTarget || isSubmittingMdAction) return;
    const sell = parseFloat(mdSellingPrice);
    if (!sell || sell <= 0) { Alert.alert('Required', `Enter a valid selling price per ${unitForProd(mdTarget.prod)} before approving.`); return; }
    Alert.alert(
      'Approve & Lock Record?',
      `${mdTarget.prod} ${safeNum(mdTarget.rec).toLocaleString()}${unitForProd(mdTarget.prod)} from ${mdTarget.sup}\nWB: ${mdTarget.wb}\nCost: ₦${safeNum(mdTarget.costPrice).toLocaleString()}/${unitForProd(mdTarget.prod)} · Sell: ₦${sell.toLocaleString()}/${unitForProd(mdTarget.prod)}\n\nThis record will be permanently locked and the selling price will be updated for this branch only.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            // Guards a double-tap (or a stacked duplicate Alert) from firing a
            // second approve command against a record the first tap already moved.
            if (isSubmittingMdAction) return;
            setIsSubmittingMdAction(true);
            const result = await approveDeliveryConfirmed(mdTarget.id, sell, mdNote.trim() || undefined);
            setIsSubmittingMdAction(false);
            if (!result.ok) {
              Alert.alert('Delivery not approved', result.error ?? 'The server could not approve this delivery. Your entries remain available.');
              return;
            }
            setMdTarget(null);
            setMdSellingPrice('');
            setMdNote('');
          },
        },
      ]
    );
  }

  async function handleMdRejectConfirm() {
    if (!mdTarget || isSubmittingMdAction) return;
    if (!mdNote.trim()) { Alert.alert('Required', 'Provide a reason for returning this record.'); return; }
    setIsSubmittingMdAction(true);
    const result = await rejectDeliveryConfirmed(mdTarget.id, mdNote.trim());
    setIsSubmittingMdAction(false);
    if (!result.ok) {
      Alert.alert('Delivery not returned', result.error ?? 'The server could not return this delivery. Your reason remains available.');
      return;
    }
    setMdTarget(null);
    setMdNote('');
  }

  const canMgrEdit = (d: Delivery) =>
    isMgr &&
    (d.approvalStatus === 'draft' || !d.approvalStatus || d.approvalStatus === 'returned') &&
    (!d.receivedBy || d.receivedBy === userName);
  const canMgrSubmit = (d: Delivery) =>
    isMgr &&
    (d.approvalStatus === 'draft' || !d.approvalStatus || d.approvalStatus === 'returned') &&
    (!d.receivedBy || d.receivedBy === userName);
  const canAccSet = (d: Delivery) =>
    isAcc && (d.approvalStatus === 'pending_acc' || d.approvalStatus === 'pending');
  const canAccRecall = (d: Delivery) =>
    isAcc && d.approvalStatus === 'pending_md' && d.accBy === userName;
  const canMdAct = (d: Delivery) =>
    isMd && d.approvalStatus === 'pending_md';
  const isLocked = (d: Delivery) =>
    d.approvalStatus === 'md_approved' || d.approvalStatus === 'approved';

  const submittedGroups = [
    {
      key: 'draft',
      title: 'Submitted · Drafts',
      subtitle: 'Saved by the receiving manager and not yet forwarded',
      items: sortedDeliveries.filter(d => !isLocked(d) && (d.approvalStatus === 'draft' || !d.approvalStatus)),
    },
    {
      key: 'accountant',
      title: 'Submitted · Awaiting accountant',
      subtitle: 'Cost price still needs to be entered',
      items: sortedDeliveries.filter(d => !isLocked(d) && (d.approvalStatus === 'pending_acc' || d.approvalStatus === 'pending')),
    },
    {
      key: 'md',
      title: 'Submitted · Awaiting MD approval',
      subtitle: 'Cost has been entered and the record is ready for final approval',
      items: sortedDeliveries.filter(d => !isLocked(d) && d.approvalStatus === 'pending_md'),
    },
    {
      key: 'returned',
      title: 'Submitted · Returned for correction',
      subtitle: 'These records need attention before they can move forward',
      items: sortedDeliveries.filter(d => !isLocked(d) && (d.approvalStatus === 'returned' || d.approvalStatus === 'rejected')),
    },
  ].filter(group => group.items.length > 0);

  const approvedByBranch = new Map<string, { name: string; items: Delivery[] }>();
  sortedDeliveries.filter(isLocked).forEach(delivery => {
    const key = delivery.branchId ?? 'unassigned';
    const name = branches.find(branch => branch.id === delivery.branchId)?.name ?? 'Unassigned branch';
    const existing = approvedByBranch.get(key);
    if (existing) existing.items.push(delivery);
    else approvedByBranch.set(key, { name, items: [delivery] });
  });
  const approvedGroups = [...approvedByBranch.entries()].map(([key, group]) => ({
    key: `approved-${key}`,
    title: `Approved · ${group.name}`,
    subtitle: `${group.items.length} locked delivery record${group.items.length === 1 ? '' : 's'} recorded for this branch`,
    items: group.items,
  }));
  const deliveryGroups = [...submittedGroups, ...approvedGroups];

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
      <ScrollView ref={deliveryScrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {isAcc && pendingAccCount > 0 ? (
          <>
            <View style={[styles.banner, { backgroundColor: colors.infoBg, borderColor: colors.info }]}>
              <Ionicons name="pricetag" size={16} color={colors.info} />
              <Text style={[styles.bannerText, { color: colors.info }]}>
                {pendingAccCount}{' record'}{pendingAccCount > 1 ? 's' : ''}{' awaiting your cost price entry'}
              </Text>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Pending Cost Entry</Text>
            {sortedDeliveries.filter(d => canAccSet(d)).map(d => {
              const pc = PROD_COLORS[d.prod] || colors.info;
              return (
                <View key={d.id} style={[styles.accPendingCard, { backgroundColor: colors.infoBg, borderColor: colors.info }]}>
                  <View style={styles.accPendingTop}>
                    <View style={[styles.accPendingProdBadge, { backgroundColor: pc + '22' }]}>
                      <Ionicons name="cube-outline" size={12} color={pc} />
                      <Text style={[styles.accPendingProd, { color: pc }]}>{d.prod}</Text>
                    </View>
                    <Text style={[styles.accPendingMeta, { color: colors.info }]}>
                      {safeNum(d.rec).toLocaleString()}{unitForProd(d.prod)}{'  ·  WB: '}{d.wb}
                    </Text>
                    <Text style={[styles.accPendingDate, { color: colors.info }]}>{fmtDate(d.dt)}</Text>
                  </View>
                  <Text style={[styles.accPendingSup, { color: colors.text }]}>
                    {d.sup}{d.notes ? '  —  ' + d.notes : ''}
                  </Text>
                  <TouchableOpacity
                    onPress={() => openAccModal(d)}
                    style={[styles.accPendingBtn, { backgroundColor: colors.info }]}
                  >
                    <Ionicons name="pricetag-outline" size={14} color="#fff" />
                    <Text style={styles.accPendingBtnText}>Set Cost Price & Forward to MD</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        ) : null}

        {isMd && pendingMdCount > 0 ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`View ${pendingMdCount} delivery record${pendingMdCount > 1 ? 's' : ''} awaiting your approval`}
            activeOpacity={0.75}
            onPress={() => {
              setFilterDate('');
              deliveryScrollRef.current?.scrollTo({ y: 0, animated: true });
            }}
            style={[styles.banner, { backgroundColor: colors.warning + '18', borderColor: colors.warning }]}
          >
            <Ionicons name="checkmark-done" size={16} color={colors.warning} />
            <Text style={[styles.bannerText, { color: colors.warning, flex: 1 }]}>
              {pendingMdCount}{' delivery record'}{pendingMdCount > 1 ? 's' : ''}{' awaiting your approval'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.warning} />
          </TouchableOpacity>
        ) : null}

        <AppliedDateField
          value={filterDate}
          onChange={setFilterDate}
          label="View deliveries for a date"
          accent={roleColor}
          helper="Filter by the date the delivery applies to."
        />

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Delivery Reports</Text>
        {sortedDeliveries.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="cube-outline" size={36} color={colors.textSubtle} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No deliveries recorded yet</Text>
            {isMgr ? <Text style={[styles.emptyText, { color: colors.textSubtle, fontSize: 12 }]}>Tap + to record a product receipt</Text> : null}
          </View>
        ) : null}

        {deliveryGroups.map(group => (
          <View key={group.key} style={styles.deliveryGroup}>
            <View style={styles.deliveryGroupHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.deliveryGroupTitle, { color: colors.text }]}>{group.title}</Text>
                <Text style={[styles.deliveryGroupSubtitle, { color: colors.textMuted }]}>{group.subtitle}</Text>
              </View>
              <View style={[styles.deliveryGroupCount, { backgroundColor: roleColor + '16' }]}>
                <Text style={[styles.deliveryGroupCountText, { color: roleColor }]}>{group.items.length}</Text>
              </View>
            </View>
            {group.items.map(d => {
          const st = ST_MAP[d.st] || ST_MAP.ok;
          const pc = PROD_COLORS[d.prod] || roleColor;
          const apSt = d.approvalStatus || 'draft';
          const apCfg = APPR_MAP[apSt] || APPR_MAP.draft;
          const hasCost = !!(d.costPrice && d.costPrice > 0);
            const sellPrice = d.sellingPrice ?? getPriceForProduct(prices, d.prod, d.branchId ?? branchId);
          const margin = hasCost && sellPrice ? Math.round(((sellPrice - safeNum(d.costPrice)) / sellPrice) * 100) : null;
          const totalCostVal = hasCost ? safeNum(d.rec) * safeNum(d.costPrice) : null;
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                    <Text style={[styles.delivQty, { color: colors.textMuted }]}>
                      {'Ordered: '}{safeNum(d.ord).toLocaleString()}{`${unitForProd(d.prod)} · Received: `}
                      <Text style={{ fontWeight: '700', color: colors.text }}>{safeNum(d.rec).toLocaleString()}{unitForProd(d.prod)}</Text>
                    </Text>
                    {safeNum(d.rec) !== safeNum(d.ord) ? (
                      <View style={[styles.mismatchBadge, {
                        backgroundColor: safeNum(d.rec) < safeNum(d.ord) ? '#FAEEDA' : '#FCEBEB',
                      }]}>
                        <Ionicons
                          name={safeNum(d.rec) < safeNum(d.ord) ? 'warning-outline' : 'alert-circle-outline'}
                          size={11}
                          color={safeNum(d.rec) < safeNum(d.ord) ? '#BA7517' : '#791F1F'}
                        />
                        <Text style={[styles.mismatchBadgeText, { color: safeNum(d.rec) < safeNum(d.ord) ? '#BA7517' : '#791F1F' }]}>
                          {safeNum(d.rec) < safeNum(d.ord)
                            ? `Short ${(safeNum(d.ord) - safeNum(d.rec)).toLocaleString()} ${unitForProd(d.prod)}`
                            : `+${(safeNum(d.rec) - safeNum(d.ord)).toLocaleString()} ${unitForProd(d.prod)} over`}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {d.notes ? <Text style={[styles.delivNotes, { color: colors.textSubtle }]}>{d.notes}</Text> : null}
                   {(apSt === 'returned' || apSt === 'pending_acc' || apSt === 'pending') && d.rejectedNote ? (
                     <Text style={[styles.delivNotes, { color: '#791F1F' }]}>
                       {apSt === 'returned' ? 'Returned by MD: ' : 'Returned for review: '}{d.rejectedNote}
                     </Text>
                  ) : null}
                </View>
              </View>

              {hasCost ? (
                <View style={[styles.costRow, { backgroundColor: '#0F6E5608', borderColor: '#0F6E5620' }]}>
                  <View style={styles.costItem}>
                    <Text style={[styles.costLabel, { color: colors.textMuted }]}>Cost/{unitForProd(d.prod)}</Text>
                    <Text style={[styles.costVal, { color: colors.text }]}>{'₦'}{safeNum(d.costPrice).toLocaleString()}</Text>
                  </View>
                  {sellPrice > 0 ? (
                    <>
                      <View style={styles.costDivider} />
                      <View style={styles.costItem}>
                        <Text style={[styles.costLabel, { color: colors.textMuted }]}>Sell/{unitForProd(d.prod)}</Text>
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
                    {' · Included in stock records'}
                  </Text>
                </View>
              ) : null}

              {d.receivedBy ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="person-outline" size={11} color={colors.textSubtle} />
                  <Text style={[styles.receivedBy, { color: colors.textSubtle }]}>{'Received by '}{d.receivedBy}</Text>
                </View>
              ) : null}

              {/* ── Evidence section ── */}
              {(() => {
                const evList = deliveryEvidences.filter(e => e.delivId === d.id);
                const canAdd = isMgr && !locked;
                if (evList.length === 0 && !canAdd) return null;
                return (
                  <View style={[styles.evSection, { borderTopColor: colors.border }]}>
                    <View style={styles.evHeader}>
                      <Ionicons name="attach-outline" size={12} color={colors.textMuted} />
                      <Text style={[styles.evTitle, { color: colors.textMuted }]}>
                        {'Evidence'}{evList.length > 0 ? ` (${evList.length})` : ''}
                      </Text>
                      {canAdd && (
                        <View style={styles.evBtns}>
                          <TouchableOpacity onPress={() => pickFromGallery(d.id)} style={[styles.evBtn, { backgroundColor: '#2980B912', borderColor: '#2980B944' }]}>
                            <Ionicons name="images-outline" size={12} color="#2980B9" />
                            <Text style={[styles.evBtnText, { color: '#2980B9' }]}>Gallery</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => pickDocument(d.id)} style={[styles.evBtn, { backgroundColor: '#8E44AD12', borderColor: '#8E44AD44' }]}>
                            <Ionicons name="document-outline" size={12} color="#8E44AD" />
                            <Text style={[styles.evBtnText, { color: '#8E44AD' }]}>File</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    {evList.length === 0 ? (
                      <Text style={[styles.evEmpty, { color: colors.textSubtle }]}>
                        {'No files attached — use Camera, Gallery, or File to upload evidence'}
                      </Text>
                    ) : (
                      evList.map(ev => {
                        const isImg = ev.mimeType?.startsWith('image/') || ev.type === 'photo';
                        const isVid = ev.mimeType?.startsWith('video/') || ev.type === 'video';
                        const ic    = isImg ? 'image-outline' : isVid ? 'videocam-outline' : 'document-text-outline';
                        const ic2   = isImg ? roleColor : isVid ? '#2980B9' : '#8E44AD';
                        const lbl   = isImg ? 'IMG' : isVid ? 'VID' : 'FILE';
                        return (
                          <View key={ev.id} style={[styles.evItem, { backgroundColor: colors.background, borderColor: colors.border }]}>
                            {isImg && ev.uri ? (
                              <Image source={{ uri: ev.uri }} style={styles.evThumb} />
                            ) : (
                              <View style={[styles.evIconBox, { backgroundColor: ic2 + '15' }]}>
                                <Ionicons name={ic as any} size={16} color={ic2} />
                              </View>
                            )}
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.evName, { color: colors.text }]} numberOfLines={1}>{ev.name}</Text>
                              <Text style={[styles.evMeta, { color: colors.textSubtle }]}>
                                {ev.by}{' · '}{fmtDateTime(ev.dt)}
                                {ev.size ? '  ' + fmtSize(ev.size) : ''}
                              </Text>
                            </View>
                            <View style={[styles.evTypeBadge, { backgroundColor: ic2 + '15' }]}>
                              <Text style={[styles.evTypeText, { color: ic2 }]}>{lbl}</Text>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                );
              })()}

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
              {isAdmin && !canMgrEdit(d) ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity onPress={() => handleDelete(d)} style={[styles.actionBtn, { borderColor: '#791F1F' }]}>
                    <Ionicons name="trash-outline" size={14} color="#791F1F" />
                    <Text style={[styles.actionBtnText, { color: '#791F1F' }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {canAccSet(d) ? (
                <TouchableOpacity onPress={() => openAccModal(d)} style={[styles.fullBtn, { backgroundColor: '#185FA5' }]}>
                  <Ionicons name="pricetag-outline" size={14} color="#fff" />
                  <Text style={styles.fullBtnText}>Set Cost Price & Forward to MD</Text>
                </TouchableOpacity>
              ) : null}

              {canAccRecall(d) ? (
                <TouchableOpacity
                  onPress={() => { accRecallDelivery(d.id); openAccModal(d); }}
                  style={[styles.fullBtn, { backgroundColor: '#BA7517' }]}
                >
                  <Ionicons name="return-down-back-outline" size={14} color="#fff" />
                  <Text style={styles.fullBtnText}>Recall & Edit Cost Price</Text>
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
                  <Text style={[styles.lockText, { color: '#27500A' }]}>Permanently locked — included in stock records</Text>
                </View>
              ) : null}
            </View>
          );
            })}
          </View>
        ))}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Manager: Add Modal */}
      <ModalSheet visible={showForm} onClose={() => setShowForm(false)}>
        <KeyboardAwareScrollViewCompat style={[styles.sheet, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" bottomOffset={24}>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>Record Product Receipt</Text>
          <View style={[styles.infoBox, { backgroundColor: '#E6F1FB', borderColor: '#185FA5' }]}>
            <Ionicons name="information-circle-outline" size={15} color="#185FA5" />
            <Text style={[styles.infoText, { color: '#185FA5' }]}>
              {'Record the physical delivery details. Cost price will be set by the accountant after you forward this record. You can attach evidence (photos, videos, documents) to saved records.'}
            </Text>
          </View>
          <MgrFormFields f={form} setF={setForm} roleColor={roleColor} />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32 }}>
            <TouchableOpacity
              style={[styles.saveBtn, { flex: 1, backgroundColor: roleColor, opacity: isSavingDelivery ? 0.6 : 1 }]}
              onPress={handleAdd}
              disabled={isSavingDelivery}
            >
              <Text style={styles.saveBtnText}>{isSavingDelivery ? 'Saving\u2026' : 'Save as Draft'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setShowForm(false)} disabled={isSavingDelivery}>
              <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollViewCompat>
      </ModalSheet>

      {/* Manager: Edit Modal */}
      <ModalSheet visible={editTarget !== null} onClose={() => setEditTarget(null)}>
        <KeyboardAwareScrollViewCompat style={[styles.sheet, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" bottomOffset={24}>
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
            <TouchableOpacity
              style={[styles.saveBtn, { flex: 1, backgroundColor: '#185FA5', opacity: isSavingDelivery ? 0.6 : 1 }]}
              onPress={handleUpdate}
              disabled={isSavingDelivery}
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={styles.saveBtnText}>{isSavingDelivery ? 'Saving\u2026' : 'Save Changes'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setEditTarget(null)} disabled={isSavingDelivery}>
              <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollViewCompat>
      </ModalSheet>

      {/* Accountant: Set Cost Price Modal */}
      <ModalSheet visible={accTarget !== null} onClose={() => setAccTarget(null)}>
        <KeyboardAwareScrollViewCompat style={[styles.sheet, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" bottomOffset={24}>
          <View style={styles.editHeader}>
            <View style={[styles.editIconBox, { backgroundColor: '#E6F1FB' }]}>
              <Ionicons name="pricetag" size={18} color="#185FA5" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.text, marginBottom: 0 }]}>Set Cost Price</Text>
              <Text style={[styles.editSub, { color: colors.textMuted }]}>
                {accTarget?.prod}{' · '}{safeNum(accTarget?.rec).toLocaleString()}{accTarget ? unitForProd(accTarget.prod) : 'L'}{' · WB: '}{accTarget?.wb}
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
              <Text style={{ color: colors.text, fontWeight: '600' }}>{safeNum(accTarget?.rec).toLocaleString()}{accTarget ? unitForProd(accTarget.prod) : 'L'}</Text>
              {'  ·  Ordered: '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>{safeNum(accTarget?.ord).toLocaleString()}{accTarget ? unitForProd(accTarget.prod) : 'L'}</Text>
            </Text>
            <Text style={[styles.delivSummaryRow, { color: colors.textMuted }]}>
              {'Date: '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>{accTarget ? fmtDate(accTarget.dt) : ''}</Text>
            </Text>
          </View>

          <View style={[styles.costPriceBox, { backgroundColor: '#E6F1FB', borderColor: '#185FA5' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Ionicons name="pricetag-outline" size={15} color="#185FA5" />
              <Text style={[styles.costPriceLabel, { color: '#185FA5' }]}>Cost Price (₦ per {accTarget ? unitForProd(accTarget.prod) : 'L'}) *</Text>
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
                    {fmt(parseFloat(accCostPrice) * safeNum(accTarget.rec))}
                  </Text>
                </Text>
                {getPriceForProduct(prices, accTarget.prod, accTarget.branchId ?? branchId) > 0 ? (
                  <Text style={[styles.costHint, { color: colors.textMuted }]}>
                    {'Sell: ₦'}{getPriceForProduct(prices, accTarget.prod, accTarget.branchId ?? branchId).toLocaleString()}{`/${accTarget ? unitForProd(accTarget.prod) : 'L'}  ·  Margin: `}
                    <Text style={{ fontWeight: '700', color: (getPriceForProduct(prices, accTarget.prod, accTarget.branchId ?? branchId) - parseFloat(accCostPrice)) >= 0 ? '#27500A' : '#791F1F' }}>
                      {Math.round(((getPriceForProduct(prices, accTarget.prod, accTarget.branchId ?? branchId) - parseFloat(accCostPrice)) / getPriceForProduct(prices, accTarget.prod, accTarget.branchId ?? branchId)) * 100)}{'%'}
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
            <TouchableOpacity
              style={[styles.saveBtn, { flex: 2, backgroundColor: '#185FA5', opacity: isSubmittingAccForward ? 0.6 : 1 }]}
              onPress={handleAccForward}
              disabled={isSubmittingAccForward}
            >
              <Ionicons name="send" size={15} color="#fff" />
              <Text style={styles.saveBtnText}>{isSubmittingAccForward ? 'Forwarding…' : 'Forward to MD'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollViewCompat>
      </ModalSheet>

      {/* MD: Set Selling Price & Approve Modal */}
      <ModalSheet visible={mdTarget !== null && !mdRejectMode} onClose={() => { setMdTarget(null); setMdSellingPrice(''); setMdNote(''); }}>
        <KeyboardAwareScrollViewCompat style={[styles.sheet, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" bottomOffset={24}>
          <View style={styles.editHeader}>
            <View style={[styles.editIconBox, { backgroundColor: '#EAF3DE' }]}>
              <Ionicons name="checkmark-circle" size={18} color="#27500A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.text, marginBottom: 0 }]}>Set Selling Price & Approve</Text>
              <Text style={[styles.editSub, { color: colors.textMuted }]}>
                {mdTarget?.prod}{' · '}{safeNum(mdTarget?.rec).toLocaleString()}{mdTarget ? unitForProd(mdTarget.prod) : 'L'}{' · WB: '}{mdTarget?.wb}
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
              <Text style={{ color: colors.text, fontWeight: '600' }}>{safeNum(mdTarget?.rec).toLocaleString()}{mdTarget ? unitForProd(mdTarget.prod) : 'L'}</Text>
              {'  ·  Cost Price: '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>{'₦'}{safeNum(mdTarget?.costPrice).toLocaleString()}{mdTarget ? `/${unitForProd(mdTarget.prod)}` : '/L'}</Text>
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
              <Text style={[styles.costPriceLabel, { color: '#27500A' }]}>Selling Price (₦ per {mdTarget ? unitForProd(mdTarget.prod) : 'L'}) *</Text>
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
                    {fmt(parseFloat(mdSellingPrice) * safeNum(mdTarget.rec))}
                  </Text>
                </Text>
                <Text style={[styles.costHint, { color: colors.textMuted }]}>
                  {'Margin: '}
                  <Text style={{ fontWeight: '700', color: (parseFloat(mdSellingPrice) - safeNum(mdTarget.costPrice)) >= 0 ? '#27500A' : '#791F1F' }}>
                    {Math.round(((parseFloat(mdSellingPrice) - safeNum(mdTarget.costPrice)) / parseFloat(mdSellingPrice)) * 100)}{'%'}
                    {'  ·  ₦'}{(parseFloat(mdSellingPrice) - safeNum(mdTarget.costPrice)).toLocaleString()}{`/${mdTarget ? unitForProd(mdTarget.prod) : 'L'} profit`}
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
              {'Approving will permanently lock this record and update the selling price for '}{mdTarget?.prod}{' at this branch only.'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32 }}>
            <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => { setMdTarget(null); setMdSellingPrice(''); setMdNote(''); }}>
              <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { flex: 2, backgroundColor: '#27500A', opacity: isSubmittingMdAction ? 0.6 : 1 }]}
              onPress={handleMdApprove}
              disabled={isSubmittingMdAction}
            >
              <Ionicons name="checkmark-circle" size={15} color="#fff" />
              <Text style={styles.saveBtnText}>{isSubmittingMdAction ? 'Approving…' : 'Approve & Lock'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollViewCompat>
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
            <TouchableOpacity
              style={[styles.saveBtn, { flex: 2, backgroundColor: '#791F1F', opacity: isSubmittingMdAction ? 0.6 : 1 }]}
              onPress={handleMdRejectConfirm}
              disabled={isSubmittingMdAction}
            >
              <Ionicons name="return-down-back" size={15} color="#fff" />
              <Text style={styles.saveBtnText}>{isSubmittingMdAction ? 'Returning…' : 'Return to Accountant'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ModalSheet>
      {confirmationModal}
    </ScreenLayout>
  );

}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 12 },
  bannerText: { fontSize: 13, fontWeight: '600', flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10, marginTop: 4 },
  deliveryGroup: { gap: 1, marginTop: 5 },
  deliveryGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  deliveryGroupTitle: { fontSize: 14, fontWeight: '800' },
  deliveryGroupSubtitle: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  deliveryGroupCount: { minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  deliveryGroupCountText: { fontSize: 12, fontWeight: '800' },
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
  accPendingCard: { borderRadius: 12, borderWidth: 1.5, padding: 14, marginBottom: 10, gap: 6 },
  accPendingTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  accPendingProdBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  accPendingProd: { fontSize: 12, fontWeight: '700' },
  accPendingMeta: { fontSize: 12, fontWeight: '600', flex: 1 },
  accPendingDate: { fontSize: 11, fontWeight: '500' },
  accPendingSup: { fontSize: 13, fontWeight: '600' },
  accPendingBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, marginTop: 2 },
  accPendingBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  mismatchBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 8 },
  mismatchText: { fontSize: 12, fontWeight: '600', flex: 1 },
  mismatchBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  mismatchBadgeText: { fontSize: 11, fontWeight: '700' },
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
  evSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 6 },
  evHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  evTitle: { fontSize: 12, fontWeight: '600', flex: 1 },
  evBtns: { flexDirection: 'row', gap: 5 },
  evBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1 },
  evBtnText: { fontSize: 10, fontWeight: '700' },
  evEmpty: { fontSize: 11, fontStyle: 'italic', paddingVertical: 2 },
  evItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, borderWidth: 1 },
  evThumb: { width: 36, height: 36, borderRadius: 6 },
  evIconBox: { width: 36, height: 36, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  evName: { fontSize: 11, fontWeight: '600' },
  evMeta: { fontSize: 10, marginTop: 1 },
  evTypeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  evTypeText: { fontSize: 9, fontWeight: '700' },
});
