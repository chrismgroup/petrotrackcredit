import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { AppliedDateField } from '@/components/AppliedDateField';
import {
  DEFAULT_MGR_PERMS, getCurrentTankStock,
  ROLE_COLORS, fmtDate, fmtDateTime, useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const DIP_SUBTABS_MGR  = ['Dip Form', 'Awaiting Approval'];
const DIP_SUBTABS_APPR = ['Awaiting Approval'];
const STATUS_LABELS: Record<string, string> = { ok: 'OK', short: 'Short', spill: 'Spill', seal: 'Seal Broken' };
const STATUS_COLORS: Record<string, string> = { ok: '#27500A', short: '#BA7517', spill: '#A32D2D', seal: '#4527a0' };
const DIP_STATUS_COLOR: Record<string, string> = { pending: '#BA7517', approved: '#1a6e3c', rejected: '#A32D2D' };
const DIP_STATUS_LABEL: Record<string, string> = { pending: 'Pending Approval', approved: 'Approved', rejected: 'Rejected' };
const DIP_STATUS_ICON: Record<string, string>  = { pending: 'time', approved: 'checkmark-circle', rejected: 'close-circle' };
export default function OperationsScreen() {
  const {
    role, userName, branchId, mgrPerms,
    tanks, lpgTanks, dips,
    addDip, approveDip, rejectDip,
  } = useApp();

  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;
  const isMgr      = role === 'mgr';
  const isMD       = role === 'md';
  const isAdmin    = role === 'admin';
  const canApprove = isMD || isAdmin;

  // ── Dip state ────────────────────────────────────────────────────────────
  // MD/Admin start on Approvals; station managers start on Dip Form.
  const [dipSubTab, setDipSubTab]     = useState(canApprove ? 1 : 0);
  const [readings, setReadings]       = useState<Record<string, string>>({});
  const [lpgReadings, setLpgReadings] = useState<Record<string, string>>({});
  const [obs, setObs]                 = useState('');
  const [appliesOn, setAppliesOn]     = useState('');

  const perms           = isMgr ? (mgrPerms[branchId ?? ''] ?? DEFAULT_MGR_PERMS) : DEFAULT_MGR_PERMS;
  const inMyBranch = (t: { branchId?: string }) => !branchId || !t.branchId || t.branchId === branchId;
  const canSeeAllTanks = role === 'admin' || role === 'md' || role === 'ceo' || role === 'acc' || role === 'csm' || role === 'mktg';
  const visibleTanks    = isMgr && !perms.canPetrolTanks ? [] : canSeeAllTanks ? tanks : tanks.filter(inMyBranch);
  const visibleLpgTanks = isMgr && !perms.canLpgTanks   ? [] : canSeeAllTanks ? lpgTanks : lpgTanks.filter(inMyBranch);
  const canDip          = isMgr;
  const hasPendingDip   = canDip && dips.some(d => d.by === userName && d.status === 'pending');
  const visiblePetrolTankIds = new Set(visibleTanks.map(tank => tank.id));
  const visibleLpgTankIds = new Set(visibleLpgTanks.map(tank => tank.id));
  const dipHasVisibleReading = (dip: (typeof dips)[number]) =>
    Object.keys(dip.rd).some(tankId => visiblePetrolTankIds.has(tankId)) ||
    Object.keys(dip.lpg).some(tankId => visibleLpgTankIds.has(tankId));
  function handleDipSubmit() {
    if (!appliesOn) {
      Alert.alert('Date required', 'Select the date this tank dip applies to.');
      return;
    }
    const invalidPetrolTank = visibleTanks.find(tank => {
      const value = parseFloat(readings[tank.id] || '');
      return Number.isFinite(value) && (value < 0 || value > tank.cap);
    });
    if (invalidPetrolTank) {
      Alert.alert('Invalid tank quantity', `${invalidPetrolTank.name} must be between 0 and ${invalidPetrolTank.cap.toLocaleString()} L.`);
      return;
    }
    const invalidLpgTank = visibleLpgTanks.find(tank => {
      const value = parseFloat(lpgReadings[tank.id] || '');
      return Number.isFinite(value) && (value < 0 || value > tank.cap);
    });
    if (invalidLpgTank) {
      Alert.alert('Invalid LPG quantity', `${invalidLpgTank.name} must be between 0 and ${invalidLpgTank.cap.toLocaleString()} kg.`);
      return;
    }
    const rd: Record<string, number> = {};
    const lpg: Record<string, number> = {};
    for (const t of visibleTanks)    { rd[t.id]  = parseFloat(readings[t.id]    || '0') || 0; }
    for (const l of visibleLpgTanks) { lpg[l.id] = parseFloat(lpgReadings[l.id] || '0') || 0; }
    addDip({ dt: appliesOn, by: userName, rd, lpg, obs, status: 'pending' });
    setReadings({}); setLpgReadings({}); setObs(''); setAppliesOn('');
    Alert.alert('Dip Submitted', 'Tank readings recorded successfully.');
  }


  const pendingDips = dips.filter(dip => dip.status === 'pending' && dipHasVisibleReading(dip));

  return (
    <ScreenLayout title="Operations">
      {/* MD/Admin see the awaiting-approval queue; station managers see the Dip Form. */}
      {(() => {
        const dipTabItems = (canApprove ? DIP_SUBTABS_APPR : isMgr ? DIP_SUBTABS_MGR : []).map(
          label => ({
            label,
            contentIdx: label === 'Awaiting Approval' ? 1 : 0,
          })
        );
        return dipTabItems.length > 0 ? (
          <View style={[styles.subTabBar, { borderBottomColor: colors.border }]}>
            {dipTabItems.map(({ label, contentIdx }) => {
              const isActive = contentIdx === dipSubTab;
              const showBadge = label === 'Awaiting Approval' && pendingDips.length > 0;
              return (
                <TouchableOpacity key={label} onPress={() => setDipSubTab(contentIdx)}
                  style={[styles.subTabBtn, { borderBottomColor: isActive ? roleColor : 'transparent' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={[styles.subTabLabel, { color: isActive ? roleColor : colors.textMuted, fontWeight: isActive ? '700' : '400' }]}>{label}</Text>
                    {showBadge && (
                      <View style={[styles.subTabBadge, { backgroundColor: '#BA7517' }]}>
                        <Text style={styles.subTabBadgeText}>{pendingDips.length}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null;
      })()}

      {/* Dip Form */}
          {dipSubTab === 0 && (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
              {visibleTanks.length > 0 && <Text style={[styles.formSection, { color: colors.text }]}>Petroleum Tanks</Text>}
              {!perms.canPetrolTanks && isMgr && (
                <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
                  <Text style={[styles.noBannerText, { color: colors.textMuted }]}>Petroleum tank access not granted for this branch</Text>
                </View>
              )}
              {visibleTanks.map(t => {
                const liters = parseFloat(readings[t.id] || '');
                const L  = !isNaN(liters) ? liters : null;
                return (
                  <View key={t.id} style={[styles.dipCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.dipCardHeader}>
                      <Text style={[styles.dipCardTitle, { color: colors.text }]}>{t.name}</Text>
                      <View style={[styles.prodBadge, { backgroundColor: roleColor + '18' }]}>
                        <Text style={[styles.prodBadgeText, { color: roleColor }]}>{t.prod}</Text>
                      </View>
                    </View>
                    <Text style={[styles.dipCapacity, { color: colors.textMuted }]}>Cap: {t.cap.toLocaleString()}L · Stock: {getCurrentTankStock(t, dips).toLocaleString()}L</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                       placeholder={`Quantity in litres (max ${t.cap.toLocaleString()} L)`}
                      placeholderTextColor={colors.textSubtle}
                      keyboardType="numeric"
                      value={readings[t.id] || ''}
                      onChangeText={v => setReadings(r => ({ ...r, [t.id]: v }))}
                      editable={canDip}
                    />
                    {L !== null && <Text style={[styles.calcResult, { color: roleColor }]}>≈ {L.toLocaleString()} L ({Math.round((L / t.cap) * 100)}% full)</Text>}
                  </View>
                );
              })}

              {visibleLpgTanks.length > 0 && <Text style={[styles.formSection, { color: colors.text }]}>LPG Tanks</Text>}
              {!perms.canLpgTanks && isMgr && (
                <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
                  <Text style={[styles.noBannerText, { color: colors.textMuted }]}>LPG tank access not granted for this branch</Text>
                </View>
              )}
              {visibleLpgTanks.map(l => {
                const enteredKg = parseFloat(lpgReadings[l.id] || '');
                const pct = !isNaN(enteredKg) && l.cap > 0 ? Math.round((enteredKg / l.cap) * 100) : null;
                return (
                  <View key={l.id} style={[styles.dipCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.dipCardHeader}>
                      <Text style={[styles.dipCardTitle, { color: colors.text }]}>{l.name}</Text>
                      <View style={[styles.prodBadge, { backgroundColor: (colors.teal ?? '#1a6e3c') + '22' }]}>
                        <Text style={[styles.prodBadgeText, { color: colors.teal ?? '#1a6e3c' }]}>LPG</Text>
                      </View>
                    </View>
                    <Text style={[styles.dipCapacity, { color: colors.textMuted }]}>Capacity: {l.cap.toLocaleString()} kg</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                      placeholder={`Current level in kg (max ${l.cap.toLocaleString()} kg)`}
                      placeholderTextColor={colors.textSubtle}
                      keyboardType="numeric"
                      value={lpgReadings[l.id] || ''}
                      onChangeText={v => setLpgReadings(r => ({ ...r, [l.id]: v }))}
                      editable={canDip}
                    />
                    {pct !== null && (
                      <Text style={[styles.calcResult, { color: pct < 20 ? '#A32D2D' : pct < 50 ? '#BA7517' : colors.teal ?? '#1a6e3c' }]}>
                        {enteredKg.toLocaleString()} kg — {pct}% full
                      </Text>
                    )}
                  </View>
                );
              })}

              <TextInput
                style={[styles.obsInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="Observations (anomalies, water sheen, etc.)"
                placeholderTextColor={colors.textSubtle}
                multiline numberOfLines={3}
                value={obs} onChangeText={setObs} editable={canDip}
              />
              <AppliedDateField
                value={appliesOn}
                onChange={setAppliesOn}
                label="Tank dip applies on *"
                accent={roleColor}
                helper="Select the business date for this reading. Approval time is stored separately."
              />

              {canDip && hasPendingDip && (
                <View style={[styles.pendingBanner, { backgroundColor: '#BA751718', borderColor: '#BA7517' }]}>
                  <Ionicons name="time" size={16} color="#BA7517" />
                  <Text style={[styles.pendingText, { color: '#BA7517' }]}>You have a dip record awaiting MD approval.</Text>
                </View>
              )}
              {canDip && !hasPendingDip && (
                <TouchableOpacity style={[styles.submitBtn, { backgroundColor: roleColor }]} onPress={handleDipSubmit} activeOpacity={0.85}>
                  <Ionicons name="save" size={18} color="#fff" />
                  <Text style={styles.submitBtnText}>Submit Dip Record</Text>
                </TouchableOpacity>
              )}

              <View style={{ height: 16 }} />
            </ScrollView>
          )}

          {/* ── Awaiting Approval (MD / Admin) ── */}
          {dipSubTab === 1 && (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
              {pendingDips.length === 0 ? (
                <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 12 }]}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.noBannerText, { color: colors.textMuted }]}>No pending dip records. All caught up!</Text>
                </View>
              ) : (
                <>
                  <View style={[styles.mdBanner, { backgroundColor: '#BA751712', borderColor: '#BA751744' }]}>
                    <Ionicons name="time-outline" size={16} color="#BA7517" />
                    <Text style={[styles.mdBannerText, { color: '#BA7517' }]}>
                      {pendingDips.length} dip record{pendingDips.length > 1 ? 's' : ''} awaiting approval. Approving will update tank inventory.
                    </Text>
                  </View>
                  {pendingDips.map(dip => (
                    <View key={dip.id} style={[styles.logCard, { backgroundColor: colors.surface, borderColor: '#BA751744', borderWidth: 1.5 }]}>
                      <View style={styles.logHeader}>
                        <View style={{ flex: 1 }}>
                        <Text style={[styles.logDate, { color: colors.text }]}>Applies on {fmtDate(dip.dt)}</Text>
                        <Text style={[styles.logBy, { color: colors.textMuted }]}>Submitted {fmtDateTime(dip.submittedAt ?? dip.dt)}</Text>
                          <Text style={[styles.logBy, { color: colors.textMuted }]}>by {dip.by}</Text>
                        </View>
                        <View style={[styles.dipStatusBadge, { backgroundColor: '#BA751718' }]}>
                          <Ionicons name="time" size={11} color="#BA7517" />
                          <Text style={[styles.dipStatusText, { color: '#BA7517' }]}>Pending</Text>
                        </View>
                      </View>

                      {/* Tank readings */}
                      <View style={styles.readingsGrid}>
                        {Object.entries(dip.rd).filter(([tid]) => visiblePetrolTankIds.has(tid)).map(([tid, litres]) => {
                          const tank = tanks.find(t => t.id === tid);
                          return (
                            <View key={tid} style={[styles.readingChip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                              <Text style={[styles.readingLabel, { color: colors.textMuted }]}>{tank?.name ?? tid}</Text>
                              <Text style={[styles.readingVal, { color: roleColor }]}>{Number(litres).toLocaleString()} L</Text>
                            </View>
                          );
                        })}
                        {Object.entries(dip.lpg).filter(([lid]) => visibleLpgTankIds.has(lid)).map(([lid, kg]) => {
                          const lt = lpgTanks.find(l => l.id === lid);
                          return (
                            <View key={lid} style={[styles.readingChip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                              <Text style={[styles.readingLabel, { color: colors.textMuted }]}>{lt?.name ?? lid}</Text>
                              <Text style={[styles.readingVal, { color: colors.teal ?? '#1a6e3c' }]}>{Number(kg).toLocaleString()} kg</Text>
                            </View>
                          );
                        })}
                      </View>

                      {dip.obs ? (
                        <Text style={[styles.dipObs, { color: colors.warning }]}>⚠ {dip.obs}</Text>
                      ) : null}

                      {/* Action row */}
                      {canApprove ? (
                        <View style={styles.mdActions}>
                          <TouchableOpacity
                            style={[styles.approveBtn, { backgroundColor: '#1a6e3c' }]}
                            onPress={() => {
                              approveDip(dip.id);
                              Alert.alert('Approved', 'Dip record approved. Tank inventory has been updated.');
                            }}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="checkmark" size={15} color="#fff" />
                            <Text style={styles.mdActionText}>Approve &amp; Update Inventory</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.rejectBtn, { borderColor: '#A32D2D' }]}
                            onPress={() =>
                              Alert.alert(
                                isAdmin ? 'Reset Dip Record' : 'Reject Dip Record',
                                isAdmin
                                  ? `Reject this dip by "${dip.by}" so they can submit a new one?`
                                  : `Reject this dip submission by ${dip.by}?`,
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  {
                                    text: isAdmin ? 'Reset' : 'Reject',
                                    style: 'destructive',
                                    onPress: () => {
                                      rejectDip(dip.id);
                                      Alert.alert(
                                        isAdmin ? 'Reset' : 'Rejected',
                                        isAdmin ? 'Dip reset. Manager can now submit a new reading.' : 'Dip record rejected.'
                                      );
                                    },
                                  },
                                ]
                              )
                            }
                            activeOpacity={0.85}
                          >
                            <Ionicons name={isAdmin ? 'refresh' : 'close'} size={15} color="#A32D2D" />
                            <Text style={[styles.mdActionText, { color: '#A32D2D' }]}>{isAdmin ? 'Reset' : 'Reject'}</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={[styles.pendingBanner, { backgroundColor: '#BA751718', borderColor: '#BA7517', marginTop: 8, marginBottom: 0 }]}>
                          <Ionicons name="time-outline" size={15} color="#BA7517" />
                          <Text style={[styles.pendingText, { color: '#BA7517' }]}>Awaiting MD approval</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </>
              )}

              <View style={{ height: 16 }} />
            </ScrollView>
          )}

    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  subTabBar:        { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, backgroundColor: 'transparent' },
  subTabBtn:        { flex: 1, alignItems: 'center', paddingVertical: 8, borderBottomWidth: 2 },
  subTabLabel:      { fontSize: 12 },
  subTabBadge:      { minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  subTabBadgeText:  { color: '#fff', fontSize: 9, fontWeight: '800' },
  scroll:      { padding: 14 },

  formSection:      { fontSize: 13, fontWeight: '700', marginBottom: 10, marginTop: 4 },
  formSectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  subLabel:         { fontSize: 11, fontWeight: '600', marginBottom: 4, color: '#888' },
  sectionTitle:     { fontSize: 14, fontWeight: '700', marginBottom: 10 },

  dipCard:       { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 12, gap: 8 },
  dipCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dipCardTitle:  { fontSize: 14, fontWeight: '700' },
  dipCapacity:   { fontSize: 11 },
  prodBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  prodBadgeText: { fontSize: 12, fontWeight: '700' },
  prodBtn:       { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  input:         { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  obsInput:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 72, textAlignVertical: 'top' },
  calcResult:    { fontSize: 13, fontWeight: '700' },
  pendingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  pendingText:   { fontSize: 12, flex: 1 },
  noBanner:      { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  noBannerText:  { fontSize: 12, flex: 1 },
  addOutlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, marginBottom: 12 },
  addOutlineBtnText: { fontSize: 13, fontWeight: '700' },
  submitBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn:     { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },

  mdBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  mdBannerText: { fontSize: 12, flex: 1 },
  logCard:      { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  logHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logDate:      { fontSize: 13, fontWeight: '600' },
  logBy:        { fontSize: 11, marginTop: 2 },
  dipStatusBadge:{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  dipStatusText:{ fontSize: 10, fontWeight: '700' },
  readingsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  readingChip:  { flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1, alignItems: 'center' },
  readingLabel: { fontSize: 10 },
  readingVal:   { fontSize: 12, fontWeight: '700' },
  dipObs:       { fontSize: 11, marginTop: 4 },
  approvedByText:{ fontSize: 10, marginTop: 4 },
  mdActions:    { flexDirection: 'row', gap: 8, marginTop: 8 },
  approveBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8 },
  rejectBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5 },
  mdActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  statusBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText:   { fontSize: 11, fontWeight: '700' },
  deliveryStats:{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 8 },
  deliveryStatItem:{ fontSize: 12 },
  evidenceSection: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 8 },
  evidenceHeader:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  evidenceTitle:   { flex: 1, fontSize: 11 },
  evidenceBtns:    { flexDirection: 'row', gap: 6 },
  evidenceAddBtn:  { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  evidenceAddText: { fontSize: 10, fontWeight: '600' },
  evidenceEmpty:   { fontSize: 11, fontStyle: 'italic' },
  evidenceItem:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 7, borderRadius: 7, borderWidth: 1, marginBottom: 4 },
  evidenceName:    { fontSize: 11, fontWeight: '600' },
  evidenceMeta:    { fontSize: 10 },

});
