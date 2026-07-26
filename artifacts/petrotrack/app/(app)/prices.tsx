import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ModalSheet } from '@/components/FormSheet';
import { ScreenLayout } from '@/components/ScreenLayout';
import { PriceProposal, Prices, ROLE_COLORS, fmt, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const PRODUCTS: (keyof Prices)[] = ['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil'];

const PROD_META: Record<string, { color: string; icon: string; unit: string }> = {
  PMS:        { color: '#1a6e3c', icon: 'flame',       unit: '/L' },
  AGO:        { color: '#185FA5', icon: 'car',         unit: '/L' },
  DPK:        { color: '#BA7517', icon: 'bulb-outline',unit: '/L' },
  LPG:        { color: '#0F6E56', icon: 'thermometer', unit: '/kg' },
  'Lube Oil': { color: '#5c3d11', icon: 'settings',    unit: '/L' },
};

const STATUS_CFG = {
  pending:  { label: 'Pending', color: '#BA7517', bg: '#FAEEDA', icon: 'time-outline'           },
  approved: { label: 'Approved', color: '#27500A', bg: '#EAF3DE', icon: 'checkmark-circle-outline'},
  rejected: { label: 'Rejected', color: '#791F1F', bg: '#FCEBEB', icon: 'close-circle-outline'  },
} as const;

/* ─── Modal shell — thin wrapper around ModalSheet ─────── */
function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  return <ModalSheet visible={visible} onClose={onClose}>{children}</ModalSheet>;
}

/* ═══════════════════════════════════════════════════════════
   SCREEN
═══════════════════════════════════════════════════════════ */
export default function PricesScreen() {
  const {
    role, userName,
    prices, priceHistory, priceProposals, deliveries,
    updatePrice, addPriceProposal,
    approvePriceProposal, updateAndApprovePriceProposal, rejectPriceProposal,
  } = useApp();

  // Last approved delivery cost price per product — gives MD market context
  function lastCostPrice(prod: string): number | null {
    const approved = deliveries
      .filter(d => d.prod === prod && (d.approvalStatus === 'md_approved' || d.approvalStatus === 'approved') && d.costPrice)
      .sort((a, b) => b.id - a.id);
    return approved[0]?.costPrice ?? null;
  }
  const colors = useColors();
  const rc = ROLE_COLORS[role || 'md'] || colors.primary;

  /* Role capabilities */
  const canSetDirect = role === 'ceo' || role === 'admin' || role === 'md';
  const canApprove   = role === 'ceo' || role === 'admin';
  const canPropose   = !canSetDirect;

  /* ── Set-price sheet (CEO / MD / admin) ── */
  const [setProd,   setSetProd]   = useState<keyof Prices | null>(null);
  const [setDraft,  setSetDraft]  = useState('');
  const [setReason, setSetReason] = useState('');

  const REASON_PRESETS = ['Market price increase', 'Market price decrease', 'NNPC directive', 'Depot price change', 'Seasonal adjustment', 'Other'];

  function openSet(prod: keyof Prices) {
    setSetProd(prod);
    setSetDraft(((prices as any)[prod] ?? 0) > 0 ? String((prices as any)[prod]) : '');
    setSetReason('');
  }
  function handleSet() {
    if (!setProd) return;
    const val = parseFloat(setDraft);
    if (!setDraft || isNaN(val) || val <= 0) {
      Alert.alert('Invalid price', 'Enter a valid price greater than 0.');
      return;
    }
    const current = (prices as any)[setProd] ?? 0;
    if (val === current) {
      Alert.alert('No change', 'The new price is the same as the current price.');
      return;
    }
    updatePrice(setProd, val, undefined, setReason.trim() || undefined);
    setSetProd(null);
    setSetReason('');
    const unit = PROD_META[setProd || 'PMS']?.unit ?? '/L';
    Alert.alert('Price updated', `${setProd} price set to ₦${val.toLocaleString()}${unit}`);
  }

  /* ── Propose sheet (other roles) ── */
  const [proposeProd,  setProposeProd]  = useState<keyof Prices | null>(null);
  const [proposeDraft, setProposeDraft] = useState('');

  function openPropose(prod: keyof Prices) { setProposeProd(prod); setProposeDraft(''); }
  function handlePropose() {
    if (!proposeProd) return;
    const val = parseFloat(proposeDraft);
    if (!proposeDraft || isNaN(val) || val <= 0) {
      Alert.alert('Invalid price', 'Enter a valid price greater than 0.');
      return;
    }
    const current = (prices as any)[proposeProd] ?? 0;
    if (val === current) {
      Alert.alert('No change', 'Proposed price is the same as the current price.');
      return;
    }
    addPriceProposal(proposeProd, val);
    setProposeProd(null);
    Alert.alert('Proposal submitted', `Your ${proposeProd} price proposal has been sent for approval.`);
  }

  /* ── Approve / update / reject (CEO / admin) ── */
  const [rejectTarget, setRejectTarget] = useState<PriceProposal | null>(null);
  const [rejectNote,   setRejectNote]   = useState('');

  const [updateTarget, setUpdateTarget] = useState<PriceProposal | null>(null);
  const [updateDraft,  setUpdateDraft]  = useState('');

  function openUpdate(p: PriceProposal) { setUpdateTarget(p); setUpdateDraft(String(p.proposedPrice)); }
  function handleUpdate() {
    if (!updateTarget) return;
    const val = parseFloat(updateDraft);
    if (!updateDraft || isNaN(val) || val <= 0) {
      Alert.alert('Invalid price', 'Enter a valid price greater than 0.');
      return;
    }
    updateAndApprovePriceProposal(updateTarget.id, val);
    setUpdateTarget(null);
  }

  function handleApprove(p: PriceProposal) {
    Alert.alert(
      'Approve price change?',
      `${p.prod}: ₦${p.currentPrice.toLocaleString()} → ₦${p.proposedPrice.toLocaleString()}${PROD_META[p.prod]?.unit ?? '/L'}\nProposed by ${p.proposedBy}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', style: 'default', onPress: () => approvePriceProposal(p.id) },
      ]
    );
  }

  function handleReject() {
    if (!rejectTarget) return;
    rejectPriceProposal(rejectTarget.id, rejectNote || undefined);
    setRejectTarget(null);
    setRejectNote('');
  }

  const pending  = priceProposals.filter(p => p.status === 'pending');
  const resolved = priceProposals.filter(p => p.status !== 'pending').slice(0, 10);
  const history  = [...priceHistory].sort((a, b) => b.id - a.id).slice(0, 15);

  function myPending(prod: string) {
    return priceProposals.find(p => p.prod === prod && p.status === 'pending' && p.proposedBy === userName);
  }

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <ScreenLayout title="Selling Prices">

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Pending banner */}
        {canApprove && pending.length > 0 ? (
          <View style={[s.banner, { backgroundColor: '#FAEEDA', borderColor: '#BA7517' }]}>
            <Ionicons name="time-outline" size={16} color="#BA7517" />
            <Text style={[s.bannerTxt, { color: '#BA7517' }]}>
              {pending.length} price proposal{pending.length > 1 ? 's' : ''} awaiting your approval
            </Text>
          </View>
        ) : null}

        {/* ── Current prices ── */}
        <Text style={[s.secLabel, { color: colors.textMuted }]}>Current Selling Prices</Text>
        {PRODUCTS.map(prod => {
          const price = (prices as any)[prod] ?? 0;
          const meta  = PROD_META[prod];
          const mp    = myPending(prod);
          return (
            <View key={prod} style={[s.priceRow, { backgroundColor: colors.surface, borderColor: mp ? '#BA7517' : colors.border }]}>
              <View style={[s.prodIconWrap, { backgroundColor: meta.color + '18' }]}>
                <Ionicons name={meta.icon as any} size={20} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.prodName, { color: colors.text }]}>{prod}</Text>
                <Text style={[s.prodUnit, { color: colors.textSubtle }]}>{meta.unit}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[s.prodPrice, { color: price > 0 ? colors.text : colors.textSubtle }]}>
                  {price > 0 ? `₦${price.toLocaleString()}` : '—'}
                </Text>
                {/* CEO / MD / admin: set price directly */}
                {canSetDirect ? (
                  <TouchableOpacity
                    onPress={() => openSet(prod)}
                    style={[s.actionBtn, { backgroundColor: meta.color + '15', borderColor: meta.color + '50' }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="pencil" size={12} color={meta.color} />
                    <Text style={[s.actionBtnTxt, { color: meta.color }]}>Set Price</Text>
                  </TouchableOpacity>
                ) : null}
                {/* Other roles: propose */}
                {canPropose && !mp ? (
                  <TouchableOpacity
                    onPress={() => openPropose(prod)}
                    style={[s.actionBtn, { backgroundColor: meta.color + '15', borderColor: meta.color + '50' }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="send-outline" size={12} color={meta.color} />
                    <Text style={[s.actionBtnTxt, { color: meta.color }]}>Propose</Text>
                  </TouchableOpacity>
                ) : null}
                {/* Other roles: pending badge */}
                {canPropose && mp ? (
                  <View style={[s.pendingBadge, { backgroundColor: '#FAEEDA' }]}>
                    <Ionicons name="time-outline" size={11} color="#BA7517" />
                    <Text style={[s.pendingTxt, { color: '#BA7517' }]}>₦{mp.proposedPrice.toLocaleString()} pending</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}

        {/* ── Pending approvals (CEO / admin) ── */}
        {canApprove && pending.length > 0 ? (
          <>
            <Text style={[s.secLabel, { color: colors.textMuted }]}>Pending Approvals</Text>
            {pending.map(p => {
              const meta = PROD_META[p.prod] ?? PROD_META.PMS;
              const up   = p.proposedPrice > p.currentPrice;
              return (
                <View key={p.id} style={[s.proposalCard, { backgroundColor: colors.surface, borderColor: '#BA7517' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[s.prodIconWrap, { backgroundColor: meta.color + '18' }]}>
                      <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.prodName, { color: colors.text }]}>{p.prod}</Text>
                      <Text style={[s.prodUnit, { color: colors.textSubtle }]}>by {p.proposedBy} · {fmtDateTime(p.proposedAt)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Text style={[s.strikePrice, { color: colors.textMuted }]}>₦{p.currentPrice.toLocaleString()}</Text>
                        <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={13} color={up ? '#27500A' : '#791F1F'} />
                        <Text style={[s.propNew, { color: colors.text }]}>₦{p.proposedPrice.toLocaleString()}</Text>
                      </View>
                      <View style={[s.diffBadge, { backgroundColor: up ? '#EAF3DE' : '#FCEBEB' }]}>
                        <Text style={[s.diffTxt, { color: up ? '#27500A' : '#791F1F' }]}>
                          {up ? '+' : ''}₦{(p.proposedPrice - p.currentPrice).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.proposalBtns}>
                    <TouchableOpacity
                      style={[s.propBtn, { borderColor: '#791F1F' }]}
                      onPress={() => { setRejectTarget(p); setRejectNote(''); }}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Ionicons name="close" size={14} color="#791F1F" />
                      <Text style={[s.propBtnTxt, { color: '#791F1F' }]}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.propBtn, { borderColor: '#185FA5' }]}
                      onPress={() => openUpdate(p)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Ionicons name="create-outline" size={14} color="#185FA5" />
                      <Text style={[s.propBtnTxt, { color: '#185FA5' }]}>Adjust</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.propBtnFill, { backgroundColor: '#27500A' }]}
                      onPress={() => handleApprove(p)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Ionicons name="checkmark" size={14} color="#fff" />
                      <Text style={s.propBtnFillTxt}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        ) : null}

        {/* ── Recent decisions ── */}
        {resolved.length > 0 ? (
          <>
            <Text style={[s.secLabel, { color: colors.textMuted }]}>Recent Decisions</Text>
            {resolved.map(p => {
              const meta = PROD_META[p.prod] ?? PROD_META.PMS;
              const cfg  = STATUS_CFG[p.status];
              return (
                <View key={p.id} style={[s.histRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[s.prodIconWrap, { backgroundColor: meta.color + '18' }]}>
                    <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.prodName, { color: colors.text }]}>{p.prod}</Text>
                    <Text style={[s.prodUnit, { color: colors.textSubtle }]}>
                      ₦{p.currentPrice.toLocaleString()} → ₦{p.proposedPrice.toLocaleString()} · by {p.proposedBy}
                    </Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                    <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
                    <Text style={[s.statusTxt, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
              );
            })}
          </>
        ) : null}

        {/* ── Price history ── */}
        {history.length > 0 ? (
          <>
            <Text style={[s.secLabel, { color: colors.textMuted }]}>Price History</Text>
            {history.map(h => {
              const meta = PROD_META[h.prod] ?? PROD_META.PMS;
              const up   = h.newPrice > h.oldPrice;
              return (
                <View key={h.id} style={[s.histRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[s.prodIconWrap, { backgroundColor: meta.color + '18' }]}>
                    <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[s.strikePrice, { color: colors.textMuted }]}>₦{h.oldPrice.toLocaleString()}</Text>
                      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={12} color={up ? '#27500A' : '#791F1F'} />
                      <Text style={[s.propNew, { color: colors.text }]}>₦{h.newPrice.toLocaleString()}</Text>
                    </View>
                    <Text style={[s.prodUnit, { color: colors.textSubtle }]}>{h.prod} · by {h.by} · {fmtDateTime(h.dt)}</Text>
                    {h.reason ? <Text style={[s.prodUnit, { color: colors.textMuted, fontStyle: 'italic' }]}>{h.reason}</Text> : null}
                  </View>
                  <View style={[s.diffBadge, { backgroundColor: up ? '#EAF3DE' : '#FCEBEB', borderWidth: 1, borderColor: up ? '#27500A30' : '#791F1F30' }]}>
                    <Text style={[s.diffTxt, { color: up ? '#27500A' : '#791F1F' }]}>
                      {up ? '+' : ''}₦{(h.newPrice - h.oldPrice).toLocaleString()}
                    </Text>
                  </View>
                </View>
              );
            })}
          </>
        ) : null}

        {history.length === 0 && pending.length === 0 ? (
          <View style={[s.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="pricetag-outline" size={36} color={colors.textSubtle} />
            <Text style={[s.emptyTxt, { color: colors.textMuted }]}>No price activity yet</Text>
          </View>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ══ Set Price Sheet (CEO / MD / admin) ══ */}
      <Sheet visible={setProd !== null} onClose={() => { setSetProd(null); setSetReason(''); }}>
        <ScrollView style={[s.sheet, { backgroundColor: colors.surface }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <View style={[s.sheetIcon, { backgroundColor: (PROD_META[setProd || 'PMS']?.color ?? rc) + '18' }]}>
              <Ionicons name={(PROD_META[setProd || 'PMS']?.icon ?? 'pricetag') as any} size={22} color={PROD_META[setProd || 'PMS']?.color ?? rc} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetTitle, { color: colors.text }]}>Set {setProd} Price</Text>
              <Text style={[s.sheetSub, { color: colors.textMuted }]}>
                Current: {setProd ? (((prices as any)[setProd] ?? 0) > 0 ? `₦${((prices as any)[setProd]).toLocaleString()}${PROD_META[setProd]?.unit ?? '/L'}` : 'Not set') : '—'}
              </Text>
            </View>
          </View>

          {/* Cost context */}
          {setProd && lastCostPrice(setProd) ? (
            <View style={[s.contextBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={[s.contextLabel, { color: colors.textMuted }]}>Last Cost Price</Text>
                  <Text style={[s.contextVal, { color: colors.text }]}>{'₦'}{lastCostPrice(setProd)!.toLocaleString()}{PROD_META[setProd]?.unit ?? '/L'}</Text>
                </View>
                {(prices as any)[setProd] > 0 ? (
                  <>
                    <View style={[s.contextDivider, { backgroundColor: colors.border }]} />
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={[s.contextLabel, { color: colors.textMuted }]}>Current Margin</Text>
                      <Text style={[s.contextVal, { color: (prices as any)[setProd] > lastCostPrice(setProd)! ? '#27500A' : '#791F1F' }]}>
                        {Math.round((((prices as any)[setProd] - lastCostPrice(setProd)!) / (prices as any)[setProd]) * 100)}{'%'}
                      </Text>
                    </View>
                  </>
                ) : null}
                {setDraft && parseFloat(setDraft) > 0 && lastCostPrice(setProd) ? (
                  <>
                    <View style={[s.contextDivider, { backgroundColor: colors.border }]} />
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={[s.contextLabel, { color: colors.textMuted }]}>New Margin</Text>
                      <Text style={[s.contextVal, { color: parseFloat(setDraft) > lastCostPrice(setProd)! ? '#27500A' : '#791F1F' }]}>
                        {Math.round(((parseFloat(setDraft) - lastCostPrice(setProd)!) / parseFloat(setDraft)) * 100)}{'%'}
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>
            </View>
          ) : null}

          <Text style={[s.inputLabel, { color: colors.textMuted }]}>New Selling Price (₦ per litre)</Text>
          <TextInput
            style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            keyboardType="decimal-pad"
            returnKeyType="done"
            value={setDraft}
            onChangeText={setSetDraft}
            onSubmitEditing={handleSet}
            placeholder="e.g. 950"
            placeholderTextColor={colors.textSubtle}
            autoFocus
            selectTextOnFocus
          />

          <Text style={[s.inputLabel, { color: colors.textMuted }]}>Reason for Change</Text>
          <View style={s.presetRow}>
            {REASON_PRESETS.map(r => (
              <TouchableOpacity
                key={r}
                onPress={() => setSetReason(setReason === r ? '' : r)}
                style={[s.presetChip, { backgroundColor: setReason === r ? (PROD_META[setProd || 'PMS']?.color ?? rc) + '20' : colors.background, borderColor: setReason === r ? (PROD_META[setProd || 'PMS']?.color ?? rc) : colors.border }]}
              >
                <Text style={[s.presetChipTxt, { color: setReason === r ? (PROD_META[setProd || 'PMS']?.color ?? rc) : colors.textMuted }]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {setReason === 'Other' ? (
            <TextInput
              style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, marginTop: 6 }]}
              placeholder="Describe the reason..."
              placeholderTextColor={colors.textSubtle}
              value={setReason === 'Other' ? '' : setReason}
              onChangeText={setSetReason}
            />
          ) : null}

          <View style={s.sheetBtns}>
            <TouchableOpacity style={[s.btnOutline, { borderColor: colors.border }]} onPress={() => { setSetProd(null); setSetReason(''); }}>
              <Text style={[s.btnOutlineTxt, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btnFill, { backgroundColor: PROD_META[setProd || 'PMS']?.color ?? rc }]}
              onPress={handleSet}
            >
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <Text style={s.btnFillTxt}>Update Price</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 32 }} />
        </ScrollView>
      </Sheet>

      {/* ══ Propose Sheet (other roles) ══ */}
      <Sheet visible={proposeProd !== null} onClose={() => setProposeProd(null)}>
        <View style={[s.sheet, { backgroundColor: colors.surface }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <View style={[s.sheetIcon, { backgroundColor: (PROD_META[proposeProd || 'PMS']?.color ?? rc) + '18' }]}>
              <Ionicons name="send-outline" size={22} color={PROD_META[proposeProd || 'PMS']?.color ?? rc} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetTitle, { color: colors.text }]}>Propose {proposeProd} Price</Text>
              <Text style={[s.sheetSub, { color: colors.textMuted }]}>
                Current: {proposeProd ? (((prices as any)[proposeProd] ?? 0) > 0 ? `₦${((prices as any)[proposeProd]).toLocaleString()}${PROD_META[proposeProd]?.unit ?? '/L'}` : 'Not set') : '—'} · Requires approval
              </Text>
            </View>
          </View>
          <Text style={[s.inputLabel, { color: colors.textMuted }]}>Proposed Price{PROD_META[proposeProd || 'PMS']?.unit.replace('/', ' per ').replace('L', 'Litre').replace('kg', 'Kilogram') ?? ' per Litre'} (₦)</Text>
          <TextInput
            style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            keyboardType="decimal-pad"
            returnKeyType="done"
            value={proposeDraft}
            onChangeText={setProposeDraft}
            onSubmitEditing={handlePropose}
            placeholder="e.g. 950"
            placeholderTextColor={colors.textSubtle}
            autoFocus
            selectTextOnFocus
          />
          <View style={[s.noteBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={[s.noteTxt, { color: colors.textMuted }]}>This proposal will be reviewed by management before the price changes.</Text>
          </View>
          <View style={s.sheetBtns}>
            <TouchableOpacity style={[s.btnOutline, { borderColor: colors.border }]} onPress={() => setProposeProd(null)}>
              <Text style={[s.btnOutlineTxt, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btnFill, { backgroundColor: PROD_META[proposeProd || 'PMS']?.color ?? rc }]}
              onPress={handlePropose}
            >
              <Ionicons name="send" size={15} color="#fff" />
              <Text style={s.btnFillTxt}>Submit Proposal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Sheet>

      {/* ══ Adjust & Approve Sheet (CEO / admin) ══ */}
      <Sheet visible={updateTarget !== null} onClose={() => setUpdateTarget(null)}>
        <View style={[s.sheet, { backgroundColor: colors.surface }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <View style={[s.sheetIcon, { backgroundColor: '#E8F0FC' }]}>
              <Ionicons name="create-outline" size={22} color="#185FA5" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetTitle, { color: colors.text }]}>Adjust {updateTarget?.prod} Price</Text>
              <Text style={[s.sheetSub, { color: colors.textMuted }]}>
                Proposed: ₦{updateTarget?.proposedPrice.toLocaleString()}{PROD_META[updateTarget?.prod || 'PMS']?.unit ?? '/L'} · Set your price to approve
              </Text>
            </View>
          </View>
          <Text style={[s.inputLabel, { color: colors.textMuted }]}>Approved Price{PROD_META[updateTarget?.prod || 'PMS']?.unit.replace('/', ' per ').replace('L', 'Litre').replace('kg', 'Kilogram') ?? ' per Litre'} (₦)</Text>
          <TextInput
            style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            keyboardType="decimal-pad"
            returnKeyType="done"
            value={updateDraft}
            onChangeText={setUpdateDraft}
            onSubmitEditing={handleUpdate}
            placeholder="e.g. 950"
            placeholderTextColor={colors.textSubtle}
            autoFocus
            selectTextOnFocus
          />
          <View style={s.sheetBtns}>
            <TouchableOpacity style={[s.btnOutline, { borderColor: colors.border }]} onPress={() => setUpdateTarget(null)}>
              <Text style={[s.btnOutlineTxt, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnFill, { backgroundColor: '#185FA5' }]} onPress={handleUpdate}>
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <Text style={s.btnFillTxt}>Adjust & Approve</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Sheet>

      {/* ══ Reject Sheet (CEO / admin) ══ */}
      <Sheet visible={rejectTarget !== null} onClose={() => setRejectTarget(null)}>
        <View style={[s.sheet, { backgroundColor: colors.surface }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <View style={[s.sheetIcon, { backgroundColor: '#FCEBEB' }]}>
              <Ionicons name="close-circle-outline" size={22} color="#791F1F" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetTitle, { color: colors.text }]}>Reject Proposal</Text>
              <Text style={[s.sheetSub, { color: colors.textMuted }]}>{rejectTarget?.prod} · ₦{rejectTarget?.proposedPrice.toLocaleString()}{PROD_META[rejectTarget?.prod || 'PMS']?.unit ?? '/L'} by {rejectTarget?.proposedBy}</Text>
            </View>
          </View>
          <Text style={[s.inputLabel, { color: colors.textMuted }]}>Reason (optional)</Text>
          <TextInput
            style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            value={rejectNote}
            onChangeText={setRejectNote}
            onSubmitEditing={handleReject}
            returnKeyType="done"
            placeholder="e.g. Market rate review needed"
            placeholderTextColor={colors.textSubtle}
            autoFocus
          />
          <View style={s.sheetBtns}>
            <TouchableOpacity style={[s.btnOutline, { borderColor: colors.border }]} onPress={() => setRejectTarget(null)}>
              <Text style={[s.btnOutlineTxt, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnFill, { backgroundColor: '#791F1F' }]} onPress={handleReject}>
              <Ionicons name="close" size={15} color="#fff" />
              <Text style={s.btnFillTxt}>Reject Proposal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Sheet>

    </ScreenLayout>
  );
}

/* ─── Styles ─────────────────────────────────────────────── */
const s = StyleSheet.create({
  scroll:        { padding: 16, paddingBottom: 40 },
  banner:        { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 16 },
  bannerTxt:     { fontSize: 13, fontWeight: '600', flex: 1 },
  secLabel:      { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginTop: 8 },

  priceRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  prodIconWrap:  { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  prodName:      { fontSize: 15, fontWeight: '700' },
  prodUnit:      { fontSize: 11, marginTop: 2 },
  prodPrice:     { fontSize: 20, fontWeight: '800' },

  actionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  actionBtnTxt:  { fontSize: 12, fontWeight: '600' },
  pendingBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  pendingTxt:    { fontSize: 11, fontWeight: '600' },

  proposalCard:  { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 10, gap: 12 },
  strikePrice:   { fontSize: 13, textDecorationLine: 'line-through' },
  propNew:       { fontSize: 14, fontWeight: '700' },
  diffBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  diffTxt:       { fontSize: 12, fontWeight: '700' },
  proposalBtns:  { flexDirection: 'row', gap: 8 },
  propBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, borderWidth: 1.5, paddingVertical: 10 },
  propBtnTxt:    { fontSize: 13, fontWeight: '600' },
  propBtnFill:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, paddingVertical: 10 },
  propBtnFillTxt:{ color: '#fff', fontSize: 13, fontWeight: '700' },

  histRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  statusBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusTxt:     { fontSize: 11, fontWeight: '700' },

  contextBox:     { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 4 },
  contextLabel:   { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  contextVal:     { fontSize: 15, fontWeight: '800' },
  contextDivider: { width: 1, height: 36 },
  presetRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  presetChip:     { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6 },
  presetChipTxt:  { fontSize: 12, fontWeight: '600' },

  emptyBox:      { borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', padding: 40, alignItems: 'center', gap: 12, marginTop: 8 },
  emptyTxt:      { fontSize: 14, textAlign: 'center' },

  /* Sheet */
  sheet:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24, gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 16 },
  sheetHandle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ccc', alignSelf: 'center', marginBottom: 4 },
  sheetHeader:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetIcon:     { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  sheetTitle:    { fontSize: 17, fontWeight: '800' },
  sheetSub:      { fontSize: 12, marginTop: 2 },
  inputLabel:    { fontSize: 12, fontWeight: '600', marginBottom: -8 },
  input:         { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 10, fontSize: 16, fontWeight: '600' },
  noteBox:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, borderWidth: 1, padding: 10 },
  noteTxt:       { fontSize: 12, flex: 1, lineHeight: 17 },
  sheetBtns:     { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnOutline:    { flex: 1, borderRadius: 12, borderWidth: 1.5, paddingVertical: 13, alignItems: 'center' },
  btnOutlineTxt: { fontSize: 14, fontWeight: '600' },
  btnFill:       { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, paddingVertical: 13 },
  btnFillTxt:    { color: '#fff', fontSize: 14, fontWeight: '800' },
});
