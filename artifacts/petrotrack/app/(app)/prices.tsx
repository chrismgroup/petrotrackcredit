import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { PriceProposal, Prices, ROLE_COLORS, fmt, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const PRODUCTS: (keyof Prices)[] = ['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil'];
const PROD_COLORS: Record<string, string> = {
  PMS: '#1a6e3c', AGO: '#185FA5', DPK: '#BA7517', LPG: '#0F6E56', 'Lube Oil': '#5c3d11',
};
const PROD_ICONS: Record<string, string> = {
  PMS: 'flame', AGO: 'car', DPK: 'bulb', LPG: 'thermometer', 'Lube Oil': 'settings',
};

const STATUS_CFG = {
  pending:  { label: 'Pending CEO approval', color: '#BA7517', bg: '#FAEEDA', icon: 'time' },
  approved: { label: 'Approved',             color: '#27500A', bg: '#EAF3DE', icon: 'checkmark-circle' },
  rejected: { label: 'Rejected',             color: '#791F1F', bg: '#FCEBEB', icon: 'close-circle' },
} as const;

export default function PricesScreen() {
  const { role, userName, prices, priceHistory, priceProposals, addPriceProposal, approvePriceProposal, rejectPriceProposal } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'md'] || colors.primary;

  const isCeo = role === 'ceo' || role === 'admin';
  const isMd  = role === 'md';
  const canPropose = isMd;
  const canApprove = isCeo;

  /* ── propose modal (MD) ── */
  const [proposeProd, setProposeProd] = useState<keyof Prices | null>(null);
  const [proposeDraft, setProposeDraft] = useState('');

  function openPropose(prod: keyof Prices) { setProposeProd(prod); setProposeDraft(''); }
  function handlePropose() {
    if (!proposeProd) return;
    const val = parseFloat(proposeDraft);
    if (!proposeDraft || isNaN(val) || val <= 0) { Alert.alert('Invalid', 'Enter a valid price greater than 0.'); return; }
    const current = (prices as any)[proposeProd] ?? 0;
    if (val === current) { Alert.alert('No change', 'Proposed price is the same as the current price.'); return; }
    addPriceProposal(proposeProd, val);
    setProposeProd(null);
    Alert.alert('Submitted', `Your price proposal for ${proposeProd} has been sent to the CEO for approval.`);
  }

  /* ── reject modal (CEO) ── */
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  function handleApprove(p: PriceProposal) {
    Alert.alert(
      'Approve price change?',
      `${p.prod}: ₦${p.currentPrice.toLocaleString()} → ₦${p.proposedPrice.toLocaleString()}/L\nProposed by ${p.proposedBy}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', style: 'default', onPress: () => approvePriceProposal(p.id) },
      ]
    );
  }
  function handleReject() {
    if (rejectId === null) return;
    rejectPriceProposal(rejectId, rejectNote || undefined);
    setRejectId(null); setRejectNote('');
  }

  const pendingProposals  = priceProposals.filter(p => p.status === 'pending');
  const resolvedProposals = priceProposals.filter(p => p.status !== 'pending').slice(0, 10);
  const recentHistory     = [...priceHistory].sort((a, b) => b.id - a.id).slice(0, 15);

  /* Pending proposals for a given product (MD view) */
  function myPendingFor(prod: string) {
    return priceProposals.find(p => p.prod === prod && p.status === 'pending' && p.proposedBy === userName);
  }

  return (
    <ScreenLayout title="Selling Prices">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* CEO: pending approvals banner */}
        {canApprove && pendingProposals.length > 0 && (
          <View style={[styles.banner, { backgroundColor: '#FAEEDA', borderColor: '#BA7517' }]}>
            <Ionicons name="time" size={16} color="#BA7517" />
            <Text style={[styles.bannerText, { color: '#BA7517' }]}>
              {pendingProposals.length} price proposal{pendingProposals.length > 1 ? 's' : ''} awaiting your approval
            </Text>
          </View>
        )}

        {/* Current prices grid */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Current Prices</Text>
        <View style={styles.grid}>
          {PRODUCTS.map(prod => {
            const price = (prices as any)[prod] ?? 0;
            const pc    = PROD_COLORS[prod] || roleColor;
            const myPending = myPendingFor(prod);
            return (
              <View key={prod} style={[styles.priceCard, { backgroundColor: colors.surface, borderColor: myPending ? '#BA7517' : colors.border }]}>
                <View style={[styles.prodIcon, { backgroundColor: pc + '18' }]}>
                  <Ionicons name={(PROD_ICONS[prod] || 'pricetag') as any} size={20} color={pc} />
                </View>
                <Text style={[styles.prodName, { color: colors.textMuted }]}>{prod}</Text>
                <Text style={[styles.prodPrice, { color: price > 0 ? colors.text : colors.textSubtle }]}>
                  {price > 0 ? fmt(price) : '—'}
                </Text>
                <Text style={[styles.perL, { color: colors.textSubtle }]}>/litre</Text>
                {canPropose && !myPending && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: pc + '15', borderColor: pc + '40' }]}
                    onPress={() => openPropose(prod)}
                  >
                    <Ionicons name="send" size={12} color={pc} />
                    <Text style={[styles.actionBtnText, { color: pc }]}>Propose</Text>
                  </TouchableOpacity>
                )}
                {canPropose && myPending && (
                  <View style={[styles.pendingBadge, { backgroundColor: '#FAEEDA' }]}>
                    <Ionicons name="time" size={11} color="#BA7517" />
                    <Text style={[styles.pendingText, { color: '#BA7517' }]}>₦{myPending.proposedPrice.toLocaleString()} pending</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* CEO: pending proposals to approve/reject */}
        {canApprove && pendingProposals.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Pending Approvals</Text>
            {pendingProposals.map(p => {
              const pc  = PROD_COLORS[p.prod] || roleColor;
              const up  = p.proposedPrice > p.currentPrice;
              return (
                <View key={p.id} style={[styles.proposalCard, { backgroundColor: colors.surface, borderColor: '#BA7517' }]}>
                  <View style={styles.proposalTop}>
                    <View style={[styles.prodBadge, { backgroundColor: pc + '18' }]}>
                      <Text style={[styles.prodBadgeText, { color: pc }]}>{p.prod}</Text>
                    </View>
                    <View style={styles.proposalPrices}>
                      <Text style={[styles.propOld, { color: colors.textMuted }]}>₦{p.currentPrice.toLocaleString()}</Text>
                      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={14} color={up ? '#27500A' : '#791F1F'} />
                      <Text style={[styles.propNew, { color: colors.text }]}>₦{p.proposedPrice.toLocaleString()}</Text>
                    </View>
                    <View style={[styles.diffBadge, { backgroundColor: up ? '#EAF3DE' : '#FCEBEB' }]}>
                      <Text style={[styles.diffText, { color: up ? '#27500A' : '#791F1F' }]}>
                        {up ? '+' : ''}₦{(p.proposedPrice - p.currentPrice).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.proposalMeta, { color: colors.textSubtle }]}>
                    Proposed by {p.proposedBy} · {fmtDateTime(p.proposedAt)}
                  </Text>
                  <View style={styles.proposalBtns}>
                    <TouchableOpacity
                      style={[styles.rejectBtn, { borderColor: '#791F1F' }]}
                      onPress={() => { setRejectId(p.id); setRejectNote(''); }}
                    >
                      <Ionicons name="close" size={14} color="#791F1F" />
                      <Text style={[styles.rejectBtnText, { color: '#791F1F' }]}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.approveBtn, { backgroundColor: '#27500A' }]}
                      onPress={() => handleApprove(p)}
                    >
                      <Ionicons name="checkmark" size={14} color="#fff" />
                      <Text style={styles.approveBtnText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* Resolved proposals (recent) */}
        {resolvedProposals.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Decisions</Text>
            {resolvedProposals.map(p => {
              const pc  = PROD_COLORS[p.prod] || roleColor;
              const cfg = STATUS_CFG[p.status];
              return (
                <View key={p.id} style={[styles.resolvedRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.prodBadge, { backgroundColor: pc + '18' }]}>
                    <Text style={[styles.prodBadgeText, { color: pc }]}>{p.prod}</Text>
                  </View>
                  <View style={styles.resolvedMid}>
                    <Text style={[styles.resolvedPrices, { color: colors.text }]}>
                      ₦{p.currentPrice.toLocaleString()} → ₦{p.proposedPrice.toLocaleString()}/L
                    </Text>
                    <Text style={[styles.resolvedMeta, { color: colors.textSubtle }]}>
                      by {p.proposedBy} · {fmtDateTime(p.proposedAt)}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                    <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
                    <Text style={[styles.statusText, { color: cfg.color }]}>{p.status}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* Price change history */}
        {recentHistory.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Price History</Text>
            {recentHistory.map(h => {
              const pc = PROD_COLORS[h.prod] || roleColor;
              const up = h.newPrice > h.oldPrice;
              return (
                <View key={h.id} style={[styles.histRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.histIcon, { backgroundColor: pc + '18' }]}>
                    <Text style={[styles.histProd, { color: pc }]}>{h.prod}</Text>
                  </View>
                  <View style={styles.histMid}>
                    <View style={styles.histPrices}>
                      <Text style={[styles.histOld, { color: colors.textMuted }]}>₦{h.oldPrice.toLocaleString()}</Text>
                      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={12} color={up ? '#27500A' : '#791F1F'} />
                      <Text style={[styles.histNew, { color: colors.text }]}>₦{h.newPrice.toLocaleString()}</Text>
                    </View>
                    <Text style={[styles.histBy, { color: colors.textSubtle }]}>by {h.by} · {fmtDateTime(h.dt)}</Text>
                  </View>
                  <View style={[styles.changeBadge, { backgroundColor: up ? '#EAF3DE' : '#FCEBEB', borderColor: up ? '#27500A' : '#791F1F' }]}>
                    <Text style={[styles.changeText, { color: up ? '#27500A' : '#791F1F' }]}>
                      {up ? '+' : ''}₦{(h.newPrice - h.oldPrice).toLocaleString()}
                    </Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {recentHistory.length === 0 && pendingProposals.length === 0 && (
          <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="pricetag-outline" size={36} color={colors.textSubtle} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No price activity yet</Text>
          </View>
        )}

      </ScrollView>

      {/* MD: Propose change modal */}
      <Modal visible={proposeProd !== null} transparent animationType="fade">
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setProposeProd(null)} />
          <View style={[styles.modal, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIcon, { backgroundColor: (PROD_COLORS[proposeProd || ''] || roleColor) + '18' }]}>
                <Ionicons name="send" size={20} color={PROD_COLORS[proposeProd || ''] || roleColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Propose {proposeProd} Price</Text>
                <Text style={[styles.modalSub, { color: colors.textMuted }]}>
                  Current: {proposeProd ? fmt((prices as any)[proposeProd] || 0) : '—'}/L · Requires CEO approval
                </Text>
              </View>
            </View>
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Proposed Price per Litre (₦)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              keyboardType="numeric"
              value={proposeDraft}
              onChangeText={setProposeDraft}
              placeholder="e.g. 950"
              placeholderTextColor={colors.textSubtle}
              autoFocus
            />
            <Text style={[styles.approvalNote, { color: colors.textMuted, backgroundColor: colors.background }]}>
              <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
              {' '}This proposal will be sent to the CEO for approval before the price changes.
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setProposeProd(null)}>
                <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: PROD_COLORS[proposeProd || ''] || roleColor }]}
                onPress={handlePropose}
              >
                <Ionicons name="send" size={15} color="#fff" />
                <Text style={styles.saveBtnText}>Submit for Approval</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* CEO: Reject reason modal */}
      <Modal visible={rejectId !== null} transparent animationType="fade">
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setRejectId(null)} />
          <View style={[styles.modal, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIcon, { backgroundColor: '#FCEBEB' }]}>
                <Ionicons name="close-circle" size={20} color="#791F1F" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Reject Proposal</Text>
                <Text style={[styles.modalSub, { color: colors.textMuted }]}>Optionally add a reason</Text>
              </View>
            </View>
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Reason (optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={rejectNote}
              onChangeText={setRejectNote}
              placeholder="e.g. Market rate review needed"
              placeholderTextColor={colors.textSubtle}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setRejectId(null)}>
                <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#791F1F' }]} onPress={handleReject}>
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
  scroll:         { padding: 16, paddingBottom: 40 },
  banner:         { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 16 },
  bannerText:     { fontSize: 13, fontWeight: '600', flex: 1 },
  sectionTitle:   { fontSize: 12, fontWeight: '700', marginBottom: 10, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.6 },
  grid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  priceCard:      { width: '47%', borderRadius: 12, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  prodIcon:       { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  prodName:       { fontSize: 12, fontWeight: '500' },
  prodPrice:      { fontSize: 20, fontWeight: '700' },
  perL:           { fontSize: 11, marginTop: -4 },
  actionBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, marginTop: 6 },
  actionBtnText:  { fontSize: 12, fontWeight: '600' },
  pendingBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 6 },
  pendingText:    { fontSize: 11, fontWeight: '600' },
  proposalCard:   { borderRadius: 12, borderWidth: 1.5, padding: 14, marginBottom: 10, gap: 8 },
  proposalTop:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  prodBadge:      { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  prodBadgeText:  { fontSize: 12, fontWeight: '700' },
  proposalPrices: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  propOld:        { fontSize: 13, textDecorationLine: 'line-through' },
  propNew:        { fontSize: 14, fontWeight: '700' },
  diffBadge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  diffText:       { fontSize: 12, fontWeight: '700' },
  proposalMeta:   { fontSize: 12 },
  proposalBtns:   { flexDirection: 'row', gap: 10, marginTop: 4 },
  rejectBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, borderWidth: 1.5, paddingVertical: 10 },
  rejectBtnText:  { fontSize: 14, fontWeight: '600' },
  approveBtn:     { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, paddingVertical: 10 },
  approveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  resolvedRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8 },
  resolvedMid:    { flex: 1, gap: 3 },
  resolvedPrices: { fontSize: 13, fontWeight: '600' },
  resolvedMeta:   { fontSize: 11 },
  statusBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText:     { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  histRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8 },
  histIcon:       { width: 42, height: 42, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  histProd:       { fontSize: 11, fontWeight: '700' },
  histMid:        { flex: 1, gap: 3 },
  histPrices:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  histOld:        { fontSize: 13, textDecorationLine: 'line-through' },
  histNew:        { fontSize: 13, fontWeight: '700' },
  histBy:         { fontSize: 11 },
  changeBadge:    { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  changeText:     { fontSize: 12, fontWeight: '700' },
  emptyBox:       { borderRadius: 12, borderWidth: 1, padding: 32, alignItems: 'center', gap: 8 },
  emptyText:      { fontSize: 14 },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modal:          { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  modalHeader:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalIcon:      { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  modalTitle:     { fontSize: 16, fontWeight: '700' },
  modalSub:       { fontSize: 12, marginTop: 2 },
  inputLabel:     { fontSize: 13, fontWeight: '500', marginBottom: -6 },
  input:          { borderRadius: 10, borderWidth: 1, padding: 14, fontSize: 16 },
  approvalNote:   { fontSize: 12, borderRadius: 8, padding: 10, lineHeight: 18 },
  modalBtns:      { flexDirection: 'row', gap: 10, marginTop: 2 },
  cancelBtn:      { flex: 1, borderRadius: 10, borderWidth: 1, padding: 14, alignItems: 'center' },
  cancelText:     { fontSize: 15, fontWeight: '600' },
  saveBtn:        { flex: 2, borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveBtnText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
});
