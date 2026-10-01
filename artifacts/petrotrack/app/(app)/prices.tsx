import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  Alert, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ModalSheet } from '@/components/FormSheet';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { ScreenLayout } from '@/components/ScreenLayout';
import { getPriceForProduct, PriceProduct, PriceProposal, ROLE_COLORS, fmt, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { getLastKnownCostPrice, safeNum, safeStr } from '@/lib/report-helpers';

const PRODUCTS: PriceProduct[] = ['PMS', 'AGO', 'DPK', 'LPG_Single', 'LPG_Distributor', 'Lube Oil'];

const PROD_META: Record<string, { color: string; icon: string; unit: string; label: string }> = {
  PMS:             { color: '#174D36', icon: 'flame',       unit: '/L', label: 'PMS' },
  AGO:             { color: '#286247', icon: 'car',         unit: '/L', label: 'AGO' },
  DPK:             { color: '#71805B', icon: 'bulb-outline',unit: '/L', label: 'DPK' },
  LPG_Single:      { color: '#1F6848', icon: 'thermometer', unit: '/kg', label: 'LPG (Single Buyers)' },
  LPG_Distributor: { color: '#0B4D3E', icon: 'thermometer', unit: '/kg', label: 'LPG (Distributors)' },
  'Lube Oil':      { color: '#49614F', icon: 'settings',    unit: '/L', label: 'Lube Oil' },
};

const STATUS_CFG = {
  pending:  { label: 'Pending', color: '#71805B', bg: '#EEF2E4', icon: 'time-outline'           },
  approved: { label: 'Approved', color: '#1F6848', bg: '#E5F1E9', icon: 'checkmark-circle-outline'},
  rejected: { label: 'Rejected', color: '#365A47', bg: '#E9F0EB', icon: 'close-circle-outline'  },
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
    role, userName, branchId, branches,
    prices, priceHistory, priceProposals, deliveries, startupStocks,
    updatePriceConfirmed, addPriceProposalConfirmed,
    approvePriceProposalConfirmed, updateAndApprovePriceProposalConfirmed, rejectPriceProposal,
  } = useApp();

  // Last approved delivery cost price per product — gives MD market context
  function lastCostPrice(prod: string): number | null {
    const deliveryProduct = prod.startsWith('LPG_') ? 'LPG' : prod;
    return getLastKnownCostPrice(
      deliveries,
      deliveryProduct,
      branchId ?? undefined,
      new Date().toISOString().slice(0, 10),
      startupStocks,
    ) || null;
  }
  const colors = useColors();
  const rc = ROLE_COLORS[role || 'md'] || colors.primary;
  const branchName = branchId ? branches.find(b => b.id === branchId)?.name ?? branchId : null;
  const currentPriceFor = (prod: string) => safeNum(getPriceForProduct(prices, prod, branchId));

  /* Role capabilities */
  const canSetDirect = role === 'ceo' || role === 'admin' || role === 'md' || role === 'mgr';
  const canApprove   = role === 'ceo' || role === 'admin';
  const canPropose   = !canSetDirect;

  /* ── Set-price sheet (CEO / MD / admin / station manager) ── */
  const [setProd,   setSetProd]   = useState<PriceProduct | null>(null);
  const [setDraft,  setSetDraft]  = useState('');
  const [setReason, setSetReason] = useState('');

  const REASON_PRESETS = ['Market price increase', 'Market price decrease', 'NNPC directive', 'Depot price change', 'Seasonal adjustment', 'Other'];

  function openSet(prod: PriceProduct) {
    setSetProd(prod);
    const current = safeNum(currentPriceFor(prod));
    setSetDraft(current > 0 ? String(current) : '');
    setSetReason('');
  }
  async function handleSet() {
    if (!setProd) return;
    const val = parseFloat(setDraft);
    if (!setDraft || isNaN(val) || val <= 0) {
      Alert.alert('Invalid price', 'Enter a valid price greater than 0.');
      return;
    }
    const current = safeNum(currentPriceFor(setProd));
    if (val === current) {
      Alert.alert('No change', 'The new price is the same as the current price.');
      return;
    }
    const result = await updatePriceConfirmed(setProd, val, setReason.trim() || undefined);
    if (!result.ok) {
      Alert.alert('Price not updated', result.error ?? 'The server could not update this price. Your entries remain available so you can retry.');
      return;
    }
    setSetProd(null);
    setSetReason('');
    const unit = PROD_META[setProd || 'PMS']?.unit ?? '/L';
    Alert.alert(
      'Price updated',
      `${setProd} price set to ₦${val.toLocaleString()}${unit}${branchName ? ` at ${branchName}. Other branches were not changed.` : '.'}`,
    );
  }

  /* ── Propose sheet (other roles) ── */
  const [proposeProd,  setProposeProd]  = useState<PriceProduct | null>(null);
  const [proposeDraft, setProposeDraft] = useState('');

  function openPropose(prod: PriceProduct) { setProposeProd(prod); setProposeDraft(''); }
  async function handlePropose() {
    if (!proposeProd) return;
    const val = parseFloat(proposeDraft);
    if (!proposeDraft || isNaN(val) || val <= 0) {
      Alert.alert('Invalid price', 'Enter a valid price greater than 0.');
      return;
    }
    const current = safeNum(currentPriceFor(proposeProd));
    if (val === current) {
      Alert.alert('No change', 'Proposed price is the same as the current price.');
      return;
    }
    const result = await addPriceProposalConfirmed(proposeProd, val);
    if (!result.ok) {
      Alert.alert('Proposal not submitted', result.error ?? 'The server could not save this proposal. Your price remains available so you can retry.');
      return;
    }
    setProposeProd(null);
    Alert.alert('Proposal submitted', `Your ${proposeProd} price proposal has been sent for approval.`);
  }

  /* ── Approve / update / reject (CEO / admin) ── */
  const [rejectTarget, setRejectTarget] = useState<PriceProposal | null>(null);
  const [rejectNote,   setRejectNote]   = useState('');
  const priceScrollRef = useRef<ScrollView>(null);
  const pendingSectionYRef = useRef(0);

  const [updateTarget, setUpdateTarget] = useState<PriceProposal | null>(null);
  const [updateDraft,  setUpdateDraft]  = useState('');

  function openUpdate(p: PriceProposal) { setUpdateTarget(p); setUpdateDraft(String(safeNum(p.proposedPrice))); }
  async function handleUpdate() {
    if (!updateTarget) return;
    const val = parseFloat(updateDraft);
    if (!updateDraft || isNaN(val) || val <= 0) {
      Alert.alert('Invalid price', 'Enter a valid price greater than 0.');
      return;
    }
    const result = await updateAndApprovePriceProposalConfirmed(updateTarget.id, val);
    if (!result.ok) {
      Alert.alert('Price not approved', result.error ?? 'The server could not approve this price. Your edited value remains available.');
      return;
    }
    setUpdateTarget(null);
  }

  function handleApprove(p: PriceProposal) {
    Alert.alert(
      'Approve price change?',
      `${safeStr(p.prod)}: ₦${safeNum(p.currentPrice).toLocaleString()} → ₦${safeNum(p.proposedPrice).toLocaleString()}${PROD_META[p.prod]?.unit ?? '/L'}\nProposed by ${safeStr(p.proposedBy)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', style: 'default', onPress: async () => {
          const result = await approvePriceProposalConfirmed(p.id);
          if (!result.ok) Alert.alert('Price not approved', result.error ?? 'The server could not approve this proposal.');
        } },
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
  const history  = [...priceHistory].sort((a, b) => safeNum(b.id) - safeNum(a.id)).slice(0, 15);

  function myPending(prod: string) {
    return priceProposals.find(p => p.prod === prod
      && p.status === 'pending'
      && p.proposedBy === userName
      && Boolean(branchId && p.branchId === branchId));
  }

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <ScreenLayout title="Selling Prices">

      <ScrollView ref={priceScrollRef} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Pending banner — tapping jumps straight to the pending-approvals
            section below, since it can otherwise sit under the full current
            price list. */}
        {canApprove && pending.length > 0 ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`View ${pending.length} price proposal${pending.length > 1 ? 's' : ''} awaiting your approval`}
            activeOpacity={0.75}
            onPress={() => priceScrollRef.current?.scrollTo({ y: pendingSectionYRef.current, animated: true })}
            style={[s.banner, { backgroundColor: colors.warning + '18', borderColor: colors.warning }]}
          >
            <Ionicons name="time-outline" size={16} color={colors.warning} />
            <Text style={[s.bannerTxt, { color: colors.warning, flex: 1 }]}>
              {pending.length} price proposal{pending.length > 1 ? 's' : ''} awaiting your approval
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.warning} />
          </TouchableOpacity>
        ) : null}

        {/* ── Current prices ── */}
        <Text style={[s.secLabel, { color: colors.textMuted }]}>Current Selling Prices</Text>
        <View style={[s.scopeBanner, { backgroundColor: branchId ? colors.successBg : colors.infoBg, borderColor: branchId ? colors.successBorder : colors.infoBorder }]}>
          <Ionicons name={branchId ? 'location-outline' : 'globe-outline'} size={16} color={branchId ? colors.success : colors.info} />
          <Text style={[s.scopeBannerText, { color: branchId ? colors.success : colors.info }]}>
            {branchId
              ? `Branch price list: ${branchName}. Changes here apply only to this branch.`
              : 'Network fallback prices. Branch-specific manager overrides remain separate.'}
          </Text>
        </View>
        {PRODUCTS.map(prod => {
          const price = currentPriceFor(prod);
          const meta  = PROD_META[prod];
          const mp    = myPending(prod);
          return (
            <View key={prod} style={[s.priceRow, { backgroundColor: colors.surface, borderColor: mp ? '#71805B' : colors.border }]}>
              <View style={[s.prodIconWrap, { backgroundColor: meta.color + '18' }]}>
                <Ionicons name={meta.icon as any} size={20} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.prodName, { color: colors.text }]}>{meta.label}</Text>
                <Text style={[s.prodUnit, { color: colors.textSubtle }]}>{meta.unit}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[s.prodPrice, { color: price > 0 ? colors.text : colors.textSubtle }]}>
                  {price > 0 ? `₦${price.toLocaleString()}` : '—'}
                </Text>
                {/* CEO / MD / admin / station manager: set price directly */}
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
                  <View style={[s.pendingBadge, { backgroundColor: '#EEF2E4' }]}>
                    <Ionicons name="time-outline" size={11} color="#71805B" />
                    <Text style={[s.pendingTxt, { color: '#71805B' }]}>₦{safeNum(mp.proposedPrice).toLocaleString()} pending</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}

        {/* ── Pending approvals (CEO / admin) ── */}
        {canApprove && pending.length > 0 ? (
          <>
            <Text
              style={[s.secLabel, { color: colors.textMuted }]}
              onLayout={e => { pendingSectionYRef.current = e.nativeEvent.layout.y; }}
            >
              Pending Approvals
            </Text>
            {pending.map(p => {
              const meta = PROD_META[p.prod] ?? PROD_META.PMS;
              const currentPrice = safeNum(p.currentPrice);
              const proposedPrice = safeNum(p.proposedPrice);
              const up   = proposedPrice > currentPrice;
              return (
                <View key={safeStr(p.id, `pending-${safeStr(p.prod)}`)} style={[s.proposalCard, { backgroundColor: colors.surface, borderColor: '#71805B' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[s.prodIconWrap, { backgroundColor: meta.color + '18' }]}>
                      <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.prodName, { color: colors.text }]}>{safeStr(p.prod)}</Text>
                      <Text style={[s.prodUnit, { color: colors.textSubtle }]}>by {safeStr(p.proposedBy)} · {fmtDateTime(safeStr(p.proposedAt, ''))}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Text style={[s.strikePrice, { color: colors.textMuted }]}>₦{currentPrice.toLocaleString()}</Text>
                        <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={13} color={up ? '#1F6848' : '#365A47'} />
                        <Text style={[s.propNew, { color: colors.text }]}>₦{proposedPrice.toLocaleString()}</Text>
                      </View>
                      <View style={[s.diffBadge, { backgroundColor: up ? '#E5F1E9' : '#E9F0EB' }]}>
                        <Text style={[s.diffTxt, { color: up ? '#1F6848' : '#365A47' }]}>
                          {up ? '+' : ''}₦{(proposedPrice - currentPrice).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.proposalBtns}>
                    <TouchableOpacity
                      style={[s.propBtn, { borderColor: '#365A47' }]}
                      onPress={() => { setRejectTarget(p); setRejectNote(''); }}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Ionicons name="close" size={14} color="#365A47" />
                      <Text style={[s.propBtnTxt, { color: '#365A47' }]}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.propBtn, { borderColor: '#286247' }]}
                      onPress={() => openUpdate(p)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Ionicons name="create-outline" size={14} color="#286247" />
                      <Text style={[s.propBtnTxt, { color: '#286247' }]}>Adjust</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.propBtnFill, { backgroundColor: '#1F6848' }]}
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
              const cfg  = STATUS_CFG[p.status] ?? STATUS_CFG.rejected;
              const currentPrice = safeNum(p.currentPrice);
              const proposedPrice = safeNum(p.proposedPrice);
              return (
                <View key={safeStr(p.id, `resolved-${safeStr(p.prod)}`)} style={[s.histRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[s.prodIconWrap, { backgroundColor: meta.color + '18' }]}>
                    <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.prodName, { color: colors.text }]}>{safeStr(p.prod)}</Text>
                    <Text style={[s.prodUnit, { color: colors.textSubtle }]}>
                      ₦{currentPrice.toLocaleString()} → ₦{proposedPrice.toLocaleString()} · by {safeStr(p.proposedBy)}
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
              const oldPrice = safeNum(h.oldPrice);
              const newPrice = safeNum(h.newPrice);
              const up   = newPrice > oldPrice;
              return (
                <View key={safeStr(h.id, `history-${safeStr(h.prod)}-${safeStr(h.dt, '')}`)} style={[s.histRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[s.prodIconWrap, { backgroundColor: meta.color + '18' }]}>
                    <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[s.strikePrice, { color: colors.textMuted }]}>₦{oldPrice.toLocaleString()}</Text>
                      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={12} color={up ? '#1F6848' : '#365A47'} />
                      <Text style={[s.propNew, { color: colors.text }]}>₦{newPrice.toLocaleString()}</Text>
                    </View>
                     <Text style={[s.prodUnit, { color: colors.textSubtle }]}>
                       {safeStr(h.prod)}{h.branchId ? ` · ${safeStr(branches.find(b => b.id === h.branchId)?.name ?? h.branchId)}` : ' · Network fallback'} · by {safeStr(h.by)} · {fmtDateTime(safeStr(h.dt, ''))}
                     </Text>
                     {h.reason ? <Text style={[s.prodUnit, { color: colors.textMuted, fontStyle: 'italic' }]}>{safeStr(h.reason)}</Text> : null}
                  </View>
                  <View style={[s.diffBadge, { backgroundColor: up ? '#E5F1E9' : '#E9F0EB', borderWidth: 1, borderColor: up ? '#1F684830' : '#365A4730' }]}>
                    <Text style={[s.diffTxt, { color: up ? '#1F6848' : '#365A47' }]}>
                      {up ? '+' : ''}₦{(newPrice - oldPrice).toLocaleString()}
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

      {/* ══ Set Price Sheet (CEO / MD / admin / station manager) ══ */}
      <Sheet visible={setProd !== null} onClose={() => { setSetProd(null); setSetReason(''); }}>
        <KeyboardAwareScrollViewCompat style={[s.sheet, { backgroundColor: colors.surface }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" bottomOffset={24}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <View style={[s.sheetIcon, { backgroundColor: (PROD_META[setProd || 'PMS']?.color ?? rc) + '18' }]}>
              <Ionicons name={(PROD_META[setProd || 'PMS']?.icon ?? 'pricetag') as any} size={22} color={PROD_META[setProd || 'PMS']?.color ?? rc} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetTitle, { color: colors.text }]}>Set {setProd} Price</Text>
              <Text style={[s.sheetSub, { color: colors.textMuted }]}>
                Current: {setProd ? (safeNum(currentPriceFor(setProd)) > 0 ? `₦${safeNum(currentPriceFor(setProd))}${PROD_META[setProd]?.unit ?? '/L'}` : 'Not set') : '—'}
              </Text>
            </View>
          </View>

          {/* Cost context */}
          {setProd && lastCostPrice(setProd) ? (
            <View style={[s.contextBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={[s.contextLabel, { color: colors.textMuted }]}>Last Cost Price</Text>
                  <Text style={[s.contextVal, { color: colors.text }]}>{'₦'}{safeNum(lastCostPrice(setProd)).toLocaleString()}{PROD_META[setProd]?.unit ?? '/L'}</Text>
                </View>
                {currentPriceFor(setProd) > 0 ? (
                  <>
                    <View style={[s.contextDivider, { backgroundColor: colors.border }]} />
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={[s.contextLabel, { color: colors.textMuted }]}>Current Margin</Text>
                      <Text style={[s.contextVal, { color: safeNum(currentPriceFor(setProd)) > safeNum(lastCostPrice(setProd)) ? '#1F6848' : '#365A47' }]}>
                        {Math.round(((safeNum(currentPriceFor(setProd)) - safeNum(lastCostPrice(setProd))) / safeNum(currentPriceFor(setProd))) * 100)}{'%'}
                      </Text>
                    </View>
                  </>
                ) : null}
                {setDraft && parseFloat(setDraft) > 0 && lastCostPrice(setProd) ? (
                  <>
                    <View style={[s.contextDivider, { backgroundColor: colors.border }]} />
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={[s.contextLabel, { color: colors.textMuted }]}>New Margin</Text>
                      <Text style={[s.contextVal, { color: parseFloat(setDraft) > lastCostPrice(setProd)! ? '#1F6848' : '#365A47' }]}>
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
        </KeyboardAwareScrollViewCompat>
      </Sheet>

      {/* ══ Propose Sheet (other roles) ══ */}
      <Sheet visible={proposeProd !== null} onClose={() => setProposeProd(null)}>
        <KeyboardAwareScrollViewCompat contentContainerStyle={[s.sheet, { backgroundColor: colors.surface }]} keyboardShouldPersistTaps="handled" bottomOffset={24}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <View style={[s.sheetIcon, { backgroundColor: (PROD_META[proposeProd || 'PMS']?.color ?? rc) + '18' }]}>
              <Ionicons name="send-outline" size={22} color={PROD_META[proposeProd || 'PMS']?.color ?? rc} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetTitle, { color: colors.text }]}>Propose {proposeProd} Price</Text>
              <Text style={[s.sheetSub, { color: colors.textMuted }]}>
                Current: {proposeProd ? (safeNum(currentPriceFor(proposeProd)) > 0 ? `₦${safeNum(currentPriceFor(proposeProd))}${PROD_META[proposeProd]?.unit ?? '/L'}` : 'Not set') : '—'} · Requires approval
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
        </KeyboardAwareScrollViewCompat>
      </Sheet>

      {/* ══ Adjust & Approve Sheet (CEO / admin) ══ */}
      <Sheet visible={updateTarget !== null} onClose={() => setUpdateTarget(null)}>
        <KeyboardAwareScrollViewCompat contentContainerStyle={[s.sheet, { backgroundColor: colors.surface }]} keyboardShouldPersistTaps="handled" bottomOffset={24}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <View style={[s.sheetIcon, { backgroundColor: '#EAF2ED' }]}>
              <Ionicons name="create-outline" size={22} color="#286247" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetTitle, { color: colors.text }]}>Adjust {updateTarget?.prod} Price</Text>
              <Text style={[s.sheetSub, { color: colors.textMuted }]}>
                Proposed: ₦{safeNum(updateTarget?.proposedPrice).toLocaleString()}{PROD_META[updateTarget?.prod || 'PMS']?.unit ?? '/L'} · Set your price to approve
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
            <TouchableOpacity style={[s.btnFill, { backgroundColor: '#286247' }]} onPress={handleUpdate}>
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <Text style={s.btnFillTxt}>Adjust & Approve</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollViewCompat>
      </Sheet>

      {/* ══ Reject Sheet (CEO / admin) ══ */}
      <Sheet visible={rejectTarget !== null} onClose={() => setRejectTarget(null)}>
        <KeyboardAwareScrollViewCompat contentContainerStyle={[s.sheet, { backgroundColor: colors.surface }]} keyboardShouldPersistTaps="handled" bottomOffset={24}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <View style={[s.sheetIcon, { backgroundColor: '#E9F0EB' }]}>
              <Ionicons name="close-circle-outline" size={22} color="#365A47" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetTitle, { color: colors.text }]}>Reject Proposal</Text>
              <Text style={[s.sheetSub, { color: colors.textMuted }]}>{safeStr(rejectTarget?.prod)} · ₦{safeNum(rejectTarget?.proposedPrice).toLocaleString()}{PROD_META[rejectTarget?.prod || 'PMS']?.unit ?? '/L'} by {safeStr(rejectTarget?.proposedBy)}</Text>
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
            <TouchableOpacity style={[s.btnFill, { backgroundColor: '#365A47' }]} onPress={handleReject}>
              <Ionicons name="close" size={15} color="#fff" />
              <Text style={s.btnFillTxt}>Reject Proposal</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollViewCompat>
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
  scopeBanner:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 12 },
  scopeBannerText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },

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
