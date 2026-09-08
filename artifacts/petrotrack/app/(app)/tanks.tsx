import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { AppliedDateField } from '@/components/AppliedDateField';
import { useBusinessDateConfirmation } from '@/components/BusinessDateConfirmation';
import { DEFAULT_MGR_PERMS, getCurrentTankStock, isPhysicalDeliveryReceipt, ROLE_COLORS, SCREEN_ROUTES, fmt, fmtDate, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { sendOperationalNotification } from '@/lib/api';
import { safeNum } from '@/lib/report-helpers';

const TABS = ['Dip Form', 'Log & Delivery', 'Inventory'];
const STATUS_LABELS: Record<string, string> = { ok: 'OK', short: 'Short', spill: 'Spill', seal: 'Seal Broken' };
const STATUS_COLORS: Record<string, string> = { ok: '#27500A', short: '#BA7517', spill: '#A32D2D', seal: '#4527a0' };
const DIP_STATUS_COLOR: Record<string, string> = { pending: '#BA7517', approved: '#1a6e3c', rejected: '#A32D2D' };
const DIP_STATUS_LABEL: Record<string, string> = { pending: 'Pending Approval', approved: 'Approved', rejected: 'Rejected' };
const DIP_STATUS_ICON: Record<string, string> = { pending: 'time', approved: 'checkmark-circle', rejected: 'close-circle' };

export default function TanksScreen() {
  const { role, tanks, lpgTanks, dips, deliveries, sales, branches, addDip, updateDip, deleteDip, approveDip, rejectDip, addDeliveryConfirmed, prices, deliveryEvidences, addDeliveryEvidence, userName, branchId, mgrPerms } = useApp();

  async function pickCameraEvidence(delivId: number) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is needed to capture delivery evidence.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const saved = await addDeliveryEvidence({ delivId, type: 'photo', name: asset.fileName ?? `photo_${Date.now()}.jpg`, by: userName || 'Manager', uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', size: asset.fileSize });
      if (!saved.ok) Alert.alert('Evidence not saved', saved.error ?? 'The server could not save this photo. Please select it again to retry.');
    }
  }

  async function pickGalleryEvidence(delivId: number) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Media library access is needed to attach evidence.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8, allowsEditing: false });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const isVid = asset.type === 'video';
      const saved = await addDeliveryEvidence({ delivId, type: isVid ? 'video' : 'photo', name: asset.fileName ?? `${isVid ? 'video' : 'photo'}_${Date.now()}`, by: userName || 'Manager', uri: asset.uri, mimeType: asset.mimeType ?? (isVid ? 'video/mp4' : 'image/jpeg'), size: asset.fileSize });
      if (!saved.ok) Alert.alert('Evidence not saved', saved.error ?? 'The server could not save this attachment. Please select it again to retry.');
    }
  }

  async function pickDocEvidence(delivId: number) {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const saved = await addDeliveryEvidence({ delivId, type: 'document', name: asset.name, by: userName || 'Manager', uri: asset.uri, mimeType: asset.mimeType ?? 'application/octet-stream', size: asset.size });
      if (!saved.ok) Alert.alert('Evidence not saved', saved.error ?? 'The server could not save this document. Please select it again to retry.');
    }
  }
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;
  const { requestDateConfirmation, confirmationModal } = useBusinessDateConfirmation();
  const canEdit = role === 'mgr';
  const [activeTab, setActiveTab] = useState(canEdit ? 0 : 1);
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [lpgReadings, setLpgReadings] = useState<Record<string, string>>({});
  const [obs, setObs] = useState('');
  const [appliesOn, setAppliesOn] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [delForm, setDelForm] = useState({ prod: 'PMS', sup: '', wb: '', ord: '', rec: '', st: 'ok', notes: '' });
  const [editingDipId, setEditingDipId] = useState<number | null>(null);
  const [editDipReadings, setEditDipReadings] = useState<Record<string, string>>({});
  const [editDipLpg, setEditDipLpg] = useState<Record<string, string>>({});
  const [editDipObs, setEditDipObs] = useState('');
  const [selectedHistoryBranchId, setSelectedHistoryBranchId] = useState<string | null>(null);

  const isMD = role === 'md';
  const isAdmin = role === 'admin';
  // Pending dips are independent submissions. Do not block a manager from
  // recording a new reading because an earlier reading is still awaiting MD;
  // MD can review multiple pending records and the server remains the source
  // of truth for their statuses.

  const perms = role === 'mgr' ? (mgrPerms[branchId ?? ''] ?? DEFAULT_MGR_PERMS) : DEFAULT_MGR_PERMS;
  const inMyBranch = (t: { branchId?: string }) => !branchId || !t.branchId || t.branchId === branchId;
  const canSeeAllTanks = role === 'admin' || role === 'md' || role === 'ceo' || role === 'acc' || role === 'csm' || role === 'mktg';
  const visibleTanks    = role === 'mgr' && !perms.canPetrolTanks ? [] : canSeeAllTanks ? tanks : tanks.filter(inMyBranch);
  const visibleLpgTanks = role === 'mgr' && !perms.canLpgTanks   ? [] : canSeeAllTanks ? lpgTanks : lpgTanks.filter(inMyBranch);
  const visiblePetrolTankIds = new Set(visibleTanks.map(tank => tank.id));
  const visibleLpgTankIds = new Set(visibleLpgTanks.map(tank => tank.id));
  const dipHasVisibleReading = (dip: (typeof dips)[number]) =>
    Boolean(branchId && dip.branchId === branchId) ||
    Object.keys(dip.rd ?? {}).some(tankId => visiblePetrolTankIds.has(tankId)) ||
    Object.keys(dip.lpg ?? {}).some(tankId => visibleLpgTankIds.has(tankId));
  const getDipBranch = (dip: (typeof dips)[number]) => {
    if (dip.branchId) {
      return {
        id: dip.branchId,
        name: branches.find(branch => branch.id === dip.branchId)?.name ?? 'Unknown branch',
      };
    }
    const branchIds = Array.from(new Set([
      ...Object.keys(dip.rd ?? {}).map(tankId => tanks.find(tank => tank.id === tankId)?.branchId),
      ...Object.keys(dip.lpg ?? {}).map(tankId => lpgTanks.find(tank => tank.id === tankId)?.branchId),
    ].filter((id): id is string => Boolean(id))));
    if (branchIds.length === 1) {
      return {
        id: branchIds[0],
        name: branches.find(branch => branch.id === branchIds[0])?.name ?? 'Unknown branch',
      };
    }
    if (branchIds.length > 1) return { id: 'multiple', name: 'Multiple branches' };
    return { id: 'unassigned', name: 'Unassigned branch' };
  };
  const visibleDipRecords = dips.filter(dipHasVisibleReading);
  const dipHistoryGroups = visibleDipRecords.reduce<Array<{ id: string; name: string; dips: typeof visibleDipRecords }>>((groups, dip) => {
    const branch = getDipBranch(dip);
    const group = groups.find(item => item.id === branch.id);
    if (group) group.dips.push(dip);
    else groups.push({ ...branch, dips: [dip] });
    return groups;
  }, []).sort((a, b) => a.name.localeCompare(b.name));
  const historyBranchGroups = (() => {
    const groups = new Map<string, { id: string; name: string; dips: typeof visibleDipRecords }>();
    if (canSeeAllTanks) {
      branches.forEach(branch => groups.set(branch.id, { id: branch.id, name: branch.name, dips: [] }));
    } else if (branchId) {
      const branch = branches.find(item => item.id === branchId);
      groups.set(branchId, { id: branchId, name: branch?.name ?? 'This Branch', dips: [] });
    }
    dipHistoryGroups.forEach(group => {
      const existing = groups.get(group.id);
      if (existing) existing.dips.push(...group.dips);
      else groups.set(group.id, { ...group, dips: [...group.dips] });
    });
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();
  const activeHistoryBranchId = selectedHistoryBranchId && historyBranchGroups.some(group => group.id === selectedHistoryBranchId)
    ? selectedHistoryBranchId
    : null;
  const displayedDipHistoryGroups = historyBranchGroups.filter(group =>
    activeHistoryBranchId ? group.id === activeHistoryBranchId : group.dips.length > 0,
  );
  const hasDisplayedHistory = displayedDipHistoryGroups.some(group => group.dips.length > 0);
  const pendingDips = dips.filter(d => d.status === 'pending' && dipHasVisibleReading(d));

  function computeDipAnalysis(rdMap: Record<string, number>) {
    const expectedByProd: Record<string, number> = {};
    for (const t of visibleTanks) {
      const approvedDipsForTank = dips
        .filter(d => d.status === 'approved' && (d.rd ?? {})[t.id] !== undefined)
        .sort((a, b) =>
          new Date(b.approvedDt ?? b.submittedAt ?? b.dt).getTime() -
          new Date(a.approvedDt ?? a.submittedAt ?? a.dt).getTime()
        );
      const lastDip = approvedDipsForTank[0];
      const dipReading = lastDip ? ((lastDip.rd ?? {})[t.id] ?? 0) : 0;
      const dipDt = lastDip?.dt;
      const recvdSinceDip = deliveries
        .filter(d => d.prod === t.prod &&
          d.branchId === t.branchId &&
          isPhysicalDeliveryReceipt(d) &&
          (!dipDt || d.dt > dipDt))
        .reduce((s, d) => s + safeNum(d.rec), 0);
      const soldSinceDip = sales
        .filter(e => e.pump.toLowerCase().includes(t.prod.toLowerCase()) &&
          (!dipDt || e.dt > dipDt))
        .reduce((s, e) => s + safeNum(e.L), 0);
      expectedByProd[t.prod] = (expectedByProd[t.prod] ?? 0) + dipReading + recvdSinceDip - soldSinceDip;
    }
    const actualByProd: Record<string, number> = {};
    for (const t of visibleTanks) {
      const L = rdMap[t.id] ?? 0;
      actualByProd[t.prod] = (actualByProd[t.prod] ?? 0) + L;
    }
    return Object.keys(actualByProd).map(prod => {
      const actual = actualByProd[prod] ?? 0;
      const expected = expectedByProd[prod] ?? 0;
      const diff = actual - expected;
      return { prod, actual, expected, diff, complete: diff >= 0 };
    });
  }

  function handleDipSubmit() {
    if (!appliesOn) {
      Alert.alert('Date required', 'Select the date this tank dip applies to.');
      return;
    }
    const rd: Record<string, number> = {};
    const lpg: Record<string, number> = {};
    for (const t of visibleTanks)    { rd[t.id]  = parseFloat(readings[t.id]    || '0') || 0; }
    for (const l of visibleLpgTanks) { lpg[l.id] = parseFloat(lpgReadings[l.id] || '0') || 0; }

    const analysis = computeDipAnalysis(rd);
    requestDateConfirmation('tank dip', appliesOn, () => {
      addDip({ dt: appliesOn, by: userName, rd, lpg, obs, status: 'pending' });
      setReadings({}); setLpgReadings({}); setObs(''); setAppliesOn('');

      if (analysis.length > 0) {
        const lines = analysis.map(a => {
          const diffAbs = Math.abs(a.diff).toLocaleString(undefined, { maximumFractionDigits: 0 });
          return a.complete
            ? `${a.prod}: ${a.actual.toLocaleString(undefined, { maximumFractionDigits: 0 })}L recorded — ✅ Complete (surplus ${diffAbs}L)`
            : `${a.prod}: ${a.actual.toLocaleString(undefined, { maximumFractionDigits: 0 })}L recorded vs ${a.expected.toLocaleString(undefined, { maximumFractionDigits: 0 })}L expected — ⚠ SHORT by ${diffAbs}L`;
        }).join('\n');
        const alertBody = `Dip submitted by ${userName}:\n\n${lines}`;
        (['md', 'ceo'] as const).forEach(to => {
          void sendOperationalNotification({
            target: to,
            title: `Tank Dip Report — ${analysis.some(a => !a.complete) ? 'SHORTAGE DETECTED' : 'All Complete'}`,
            body: alertBody,
            route: SCREEN_ROUTES.inventory,
          }).catch(() => {
            // The dip remains saved locally and will sync independently.
          });
        });
      }

      Alert.alert('Dip Submitted', 'Tank readings recorded. MD and CEO have been notified.');
    });
  }

  function handleDeliverySubmit() {
    if (!deliveryDate) {
      Alert.alert('Date required', 'Select the date this delivery applies to.');
      return;
    }
    if (!branchId) {
      Alert.alert('Branch assignment required', 'Assign this manager to a branch before recording a delivery so the stock is added to the correct inventory ledger.');
      return;
    }
    requestDateConfirmation('delivery', deliveryDate, async () => {
      const result = await addDeliveryConfirmed({
        dt: deliveryDate,
        sup: delForm.sup,
        prod: delForm.prod,
        wb: delForm.wb,
        ord: parseFloat(delForm.ord) || 0,
        rec: parseFloat(delForm.rec) || 0,
        st: delForm.st as any,
        notes: delForm.notes,
        branchId,
      });
      if (!result.ok) {
        Alert.alert('Delivery not recorded', result.error ?? 'The server could not save this delivery. Your entries remain available so you can retry.');
        return;
      }
      setDelForm({ prod: 'PMS', sup: '', wb: '', ord: '', rec: '', st: 'ok', notes: '' });
      setDeliveryDate('');
      setShowDeliveryForm(false);
      Alert.alert('Delivery Recorded', 'Delivery entry saved.');
    }, 'Confirm & save');
  }

  function stockPct(t: { id: string; op: number; sl: number; rv: number; cap: number }) {
    const stock = getCurrentTankStock(t, dips);
    return Math.round((stock / t.cap) * 100);
  }

  function startEditDip(dip: typeof dips[0]) {
    setEditingDipId(dip.id);
    setEditDipReadings(Object.fromEntries(Object.entries(dip.rd ?? {}).map(([k, v]) => [k, String(v)])));
    setEditDipLpg(Object.fromEntries(Object.entries(dip.lpg ?? {}).map(([k, v]) => [k, String(v)])));
    setEditDipObs(dip.obs ?? '');
  }
  function cancelEditDip() {
    setEditingDipId(null);
    setEditDipReadings({});
    setEditDipLpg({});
    setEditDipObs('');
  }
  function saveEditDip(dipId: number) {
    const rd: Record<string, number> = {};
    const lpg: Record<string, number> = {};
    for (const [k, v] of Object.entries(editDipReadings)) { const n = parseFloat(v); if (!isNaN(n)) rd[k] = n; }
    for (const [k, v] of Object.entries(editDipLpg)) { const n = parseFloat(v); if (!isNaN(n)) lpg[k] = n; }
    updateDip(dipId, { rd, lpg, obs: editDipObs.trim() });
    cancelEditDip();
  }
  function handleDeleteDip(dip: typeof dips[0]) {
    Alert.alert(
      'Delete Dip Record?',
      `Recorded by ${dip.by} for ${fmtDate(dip.dt)}. Submitted ${fmtDateTime(dip.submittedAt ?? dip.dt)}. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteDip(dip.id) },
      ]
    );
  }

  return (
    <ScreenLayout title="Tank Dipping">
      <View style={styles.tabBar}>
        {TABS.map((t, i) => {
          if (i === 0 && !canEdit) return null;
          const showBadge = i === 1 && (isMD || isAdmin) && pendingDips.length > 0;
          return (
            <TouchableOpacity key={t} onPress={() => setActiveTab(i)} style={[styles.tabBtn, { borderBottomColor: i === activeTab ? roleColor : 'transparent', borderBottomWidth: 2 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={[styles.tabLabel, { color: i === activeTab ? roleColor : colors.textMuted, fontWeight: i === activeTab ? '700' : '400' }]}>{t}</Text>
                {showBadge && (
                  <View style={[styles.tabBadge, { backgroundColor: '#BA7517' }]}>
                    <Text style={styles.tabBadgeText}>{pendingDips.length}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === 0 && canEdit && (
        <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          {visibleTanks.length > 0 && <Text style={[styles.formSection, { color: colors.text }]}>Petroleum Tanks</Text>}
          {!perms.canPetrolTanks && role === 'mgr' && (
            <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
              <Text style={[styles.noBannerText, { color: colors.textMuted }]}>Petroleum tank access not granted for this branch</Text>
            </View>
          )}
          {visibleTanks.map(t => {
            const enteredL = parseFloat(readings[t.id] || '');
            const pctFull = !isNaN(enteredL) && t.cap > 0 ? Math.round((enteredL / t.cap) * 100) : null;
            return (
              <View key={t.id} style={[styles.dipCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.dipCardHeader}>
                  <Text style={[styles.dipCardTitle, { color: colors.text }]}>{t.name}</Text>
                  <View style={[styles.prodBadge, { backgroundColor: roleColor + '18' }]}>
                    <Text style={[styles.prodText, { color: roleColor }]}>{t.prod}</Text>
                  </View>
                </View>
                <Text style={[styles.dipCapacity, { color: colors.textMuted }]}>Capacity: {safeNum(t.cap).toLocaleString()}L</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                  placeholder={`Current level in litres (max ${safeNum(t.cap).toLocaleString()}L)`}
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="numeric"
                  value={readings[t.id] || ''}
                  onChangeText={v => setReadings(r => ({ ...r, [t.id]: v }))}
                  editable={canEdit}
                />
                {pctFull !== null && (
                  <Text style={[styles.calcResult, { color: pctFull < 20 ? '#A32D2D' : pctFull < 50 ? '#BA7517' : roleColor }]}>
                    {enteredL.toLocaleString()}L — {pctFull}% full
                  </Text>
                )}
              </View>
            );
          })}

          {visibleLpgTanks.length > 0 && <Text style={[styles.formSection, { color: colors.text }]}>LPG Tanks</Text>}
          {!perms.canLpgTanks && role === 'mgr' && (
            <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
              <Text style={[styles.noBannerText, { color: colors.textMuted }]}>LPG tank access not granted for this branch</Text>
            </View>
          )}
          {visibleLpgTanks.map(l => {
            const enteredKg = parseFloat(lpgReadings[l.id] || '');
            const pctFull = !isNaN(enteredKg) && l.cap > 0 ? Math.round((enteredKg / l.cap) * 100) : null;
            return (
              <View key={l.id} style={[styles.dipCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.dipCardHeader}>
                  <Text style={[styles.dipCardTitle, { color: colors.text }]}>{l.name}</Text>
                  <View style={[styles.prodBadge, { backgroundColor: colors.teal + '22' }]}>
                    <Text style={[styles.prodText, { color: colors.teal }]}>LPG</Text>
                  </View>
                </View>
                <Text style={[styles.dipCapacity, { color: colors.textMuted }]}>Capacity: {safeNum(l.cap).toLocaleString()} kg</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                  placeholder={`Current level in kg (max ${safeNum(l.cap).toLocaleString()} kg)`}
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="numeric"
                  value={lpgReadings[l.id] || ''}
                  onChangeText={v => setLpgReadings(r => ({ ...r, [l.id]: v }))}
                  editable={canEdit}
                />
                {pctFull !== null && (
                  <Text style={[styles.calcResult, { color: pctFull < 20 ? '#A32D2D' : pctFull < 50 ? '#BA7517' : colors.teal }]}>
                    {enteredKg.toLocaleString()} kg — {pctFull}% full
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
            value={obs}
            onChangeText={setObs}
            editable={canEdit}
          />
          <AppliedDateField
            value={appliesOn}
            onChange={setAppliesOn}
            label="Tank dip applies on *"
            accent={roleColor}
            helper="Select the business date for this reading."
          />

          {canEdit && (() => {
            const rdMap: Record<string, number> = {};
            for (const t of visibleTanks) { rdMap[t.id] = parseFloat(readings[t.id] || '0') || 0; }
            const hasAnyReading = Object.values(rdMap).some(v => v > 0);
            const analysis = hasAnyReading ? computeDipAnalysis(rdMap) : [];
            return analysis.length > 0 ? (
              <View style={[styles.dipCard, { backgroundColor: colors.surface, borderColor: colors.border, gap: 6 }]}>
                <Text style={[styles.formSection, { color: colors.text, marginBottom: 0 }]}>Stock Analysis</Text>
                {analysis.map(a => {
                  const diffAbs = Math.abs(a.diff).toLocaleString(undefined, { maximumFractionDigits: 0 });
                  const bc = a.complete ? '#27500A' : '#791F1F';
                  const bg = a.complete ? '#EAF3DE' : '#FCEBEB';
                  return (
                    <View key={a.prod} style={[styles.analysisRow, { backgroundColor: bg, borderColor: bc + '40' }]}>
                      <Ionicons name={a.complete ? 'checkmark-circle' : 'alert-circle'} size={16} color={bc} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.analysisProd, { color: bc }]}>{a.prod}</Text>
                        <Text style={[styles.analysisDetail, { color: bc }]}>
                          {a.complete
                            ? `${a.actual.toLocaleString(undefined, { maximumFractionDigits: 0 })}L recorded — surplus ${diffAbs}L`
                            : `SHORT by ${diffAbs}L (${a.actual.toLocaleString(undefined, { maximumFractionDigits: 0 })}L found vs ${a.expected.toLocaleString(undefined, { maximumFractionDigits: 0 })}L expected)`}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null;
          })()}

          <Text style={[styles.formSection, { color: colors.text }]}>Record Delivery</Text>
          {!showDeliveryForm ? (
            <TouchableOpacity style={[styles.addBtn, { borderColor: roleColor }]} onPress={() => setShowDeliveryForm(true)}>
              <Ionicons name="add" size={18} color={roleColor} />
              <Text style={[styles.addBtnText, { color: roleColor }]}>Record New Delivery</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.dipCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <AppliedDateField
                value={deliveryDate}
                onChange={setDeliveryDate}
                label="Delivery applies on *"
                accent={roleColor}
                helper="Select the date the delivery belongs to."
              />
              {['PMS', 'AGO', 'DPK', 'LPG'].map(p => (
                <TouchableOpacity key={p} onPress={() => setDelForm(f => ({ ...f, prod: p }))} style={[styles.prodBtn, { backgroundColor: delForm.prod === p ? roleColor : colors.background, borderColor: delForm.prod === p ? roleColor : colors.border }]}>
                  <Text style={{ color: delForm.prod === p ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '600' }}>{p}</Text>
                </TouchableOpacity>
              ))}
              {[
                { key: 'sup', label: 'Supplier Name' }, { key: 'wb', label: 'Waybill Number' },
                { key: 'ord', label: delForm.prod === 'LPG' ? 'Ordered Qty (kg)' : 'Ordered Qty (L)' },
                { key: 'rec', label: delForm.prod === 'LPG' ? 'Received Qty (kg)' : 'Received Qty (L)' },
                { key: 'notes', label: 'Notes' },
              ].map(f => (
                <TextInput
                  key={f.key}
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                  placeholder={f.label}
                  placeholderTextColor={colors.textSubtle}
                  keyboardType={['ord', 'rec'].includes(f.key) ? 'numeric' : 'default'}
                  value={(delForm as any)[f.key]}
                  onChangeText={v => setDelForm(fv => ({ ...fv, [f.key]: v }))}
                />
              ))}
              <View style={styles.prodRow}>
                {['ok', 'short', 'spill', 'seal'].map(s => (
                  <TouchableOpacity key={s} onPress={() => setDelForm(f => ({ ...f, st: s }))} style={[styles.prodBtn, { backgroundColor: delForm.st === s ? roleColor : colors.background, borderColor: delForm.st === s ? roleColor : colors.border }]}>
                    <Text style={{ color: delForm.st === s ? '#fff' : colors.textMuted, fontSize: 11, fontWeight: '600' }}>{STATUS_LABELS[s]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleDeliverySubmit} activeOpacity={0.85}>
                  <Text style={styles.submitBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cancelBtn, { flex: 1, borderColor: colors.border }]} onPress={() => setShowDeliveryForm(false)}>
                  <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <View style={{ height: 8 }} />
        </ScrollView>

        {canEdit && (
          <View style={[styles.stickyFooter, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: roleColor, marginBottom: 0 }]} onPress={handleDipSubmit} activeOpacity={0.85}>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Submit Dip to MD</Text>
            </TouchableOpacity>
          </View>
        )}
        </View>
      )}

      {activeTab === 1 && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          {isMD && dips.some(d => d.status === 'pending') && (
            <View style={[styles.mdBanner, { backgroundColor: '#4527a018', borderColor: '#4527a0' }]}>
              <Ionicons name="alert-circle" size={16} color="#4527a0" />
              <Text style={[styles.mdBannerText, { color: '#4527a0' }]}>
                {dips.filter(d => d.status === 'pending').length} dip record{dips.filter(d => d.status === 'pending').length > 1 ? 's' : ''} awaiting your approval
              </Text>
            </View>
          )}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Inventory history by branch</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyBranchRail}>
            {canSeeAllTanks && (
              <TouchableOpacity
                style={[
                  styles.historyBranchTile,
                  { backgroundColor: activeHistoryBranchId === null ? roleColor : colors.surface, borderColor: activeHistoryBranchId === null ? roleColor : colors.border },
                ]}
                onPress={() => setSelectedHistoryBranchId(null)}
                activeOpacity={0.85}
              >
                <Ionicons name="layers-outline" size={18} color={activeHistoryBranchId === null ? '#fff' : roleColor} />
                <Text style={[styles.historyBranchTileName, { color: activeHistoryBranchId === null ? '#fff' : colors.text }]} numberOfLines={1}>All branches</Text>
                <Text style={[styles.historyBranchTileCount, { color: activeHistoryBranchId === null ? '#ffffffcc' : colors.textMuted }]}>
                  {visibleDipRecords.length} report{visibleDipRecords.length === 1 ? '' : 's'}
                </Text>
              </TouchableOpacity>
            )}
            {historyBranchGroups.map(group => {
              const selected = activeHistoryBranchId === group.id;
              return (
                <TouchableOpacity
                  key={group.id}
                  style={[styles.historyBranchTile, { backgroundColor: selected ? roleColor : colors.surface, borderColor: selected ? roleColor : colors.border }]}
                  onPress={() => setSelectedHistoryBranchId(group.id)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="business-outline" size={18} color={selected ? '#fff' : roleColor} />
                  <Text style={[styles.historyBranchTileName, { color: selected ? '#fff' : colors.text }]} numberOfLines={1}>{group.name}</Text>
                  <Text style={[styles.historyBranchTileCount, { color: selected ? '#ffffffcc' : colors.textMuted }]}>
                    {group.dips.length} report{group.dips.length === 1 ? '' : 's'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {!hasDisplayedHistory ? (
            <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.noBannerText, { color: colors.textMuted }]}>
                {activeHistoryBranchId ? 'No dip reports for this branch yet.' : 'No dip reports yet. Submitted readings will appear here.'}
              </Text>
            </View>
          ) : displayedDipHistoryGroups.map(group => (
            <View key={group.id}>
              <View style={[styles.branchHistoryHeader, { backgroundColor: roleColor + '10', borderColor: roleColor + '35' }]}>
                <View style={styles.branchHistoryTitleRow}>
                  <Ionicons name="business-outline" size={15} color={roleColor} />
                  <Text style={[styles.branchHistoryName, { color: colors.text }]}>{group.name}</Text>
                </View>
                <Text style={[styles.branchHistoryCount, { color: colors.textMuted }]}>{group.dips.length} dip record{group.dips.length === 1 ? '' : 's'}</Text>
              </View>
              {group.dips.map(dip => {
                const sc = DIP_STATUS_COLOR[dip.status] || '#888';
                const isPending = dip.status === 'pending';
                return (
                <View key={dip.id} style={[styles.logCard, { backgroundColor: colors.surface, borderColor: isPending ? sc + '66' : colors.border, borderWidth: isPending ? 1.5 : 1 }]}>
                <View style={styles.logHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.logDate, { color: colors.text }]}>Applies on {fmtDate(dip.dt)}</Text>
                    <Text style={[styles.logBy, { color: colors.textMuted }]}>Submitted {fmtDateTime(dip.submittedAt ?? dip.dt)}</Text>
                    <Text style={[styles.logBy, { color: colors.textMuted }]}>by {dip.by}</Text>
                  </View>
                  <View style={[styles.dipStatusBadge, { backgroundColor: sc + '18' }]}>
                    <Ionicons name={DIP_STATUS_ICON[dip.status] as any} size={11} color={sc} />
                    <Text style={[styles.dipStatusText, { color: sc }]}>{DIP_STATUS_LABEL[dip.status]}</Text>
                  </View>
                </View>
                <View style={styles.readingsGrid}>
                  {Object.entries(dip.rd ?? {}).filter(([tid]) => visiblePetrolTankIds.has(tid)).map(([tid, litres]) => {
                    const tank = tanks.find(t => t.id === tid);
                    return (
                      <View key={tid} style={[styles.readingChip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <Text style={[styles.readingLabel, { color: colors.textMuted }]}>{tank?.name.replace('Tank ', 'T')}</Text>
                        <Text style={[styles.readingVal, { color: roleColor }]}>{Number(litres).toLocaleString()}L</Text>
                      </View>
                    );
                  })}
                  {Object.entries(dip.lpg ?? {}).filter(([lid]) => visibleLpgTankIds.has(lid)).map(([lid, kg]) => {
                    const lt = lpgTanks.find(l => l.id === lid);
                    return (
                      <View key={lid} style={[styles.readingChip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <Text style={[styles.readingLabel, { color: colors.textMuted }]}>{lt?.name.replace('LPG Tank ', 'L')}</Text>
                        <Text style={[styles.readingVal, { color: colors.teal }]}>{Number(kg).toLocaleString()} kg</Text>
                      </View>
                    );
                  })}
                </View>
                {dip.obs ? <Text style={[styles.dipObs, { color: colors.warning }]}>⚠ {dip.obs}</Text> : null}
                {dip.approvedBy && (
                  <Text style={[styles.approvedByText, { color: colors.textMuted }]}>
                    {dip.status === 'approved' ? '✓' : '✗'} {dip.approvedBy} · {dip.approvedDt ? fmtDateTime(dip.approvedDt) : ''}
                  </Text>
                )}
                {(canEdit || isAdmin || isMD) && (
                  <View style={[styles.mdActions, { marginTop: 8 }]}>
                    <TouchableOpacity
                      style={[styles.rejectBtn, { borderColor: roleColor, backgroundColor: roleColor + '12' }]}
                      onPress={() => startEditDip(dip)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="create-outline" size={15} color={roleColor} />
                      <Text style={[styles.mdActionText, { color: roleColor }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.rejectBtn, { borderColor: '#A32D2D', backgroundColor: '#FCEBEB' }]}
                      onPress={() => handleDeleteDip(dip)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="trash-outline" size={15} color="#A32D2D" />
                      <Text style={[styles.mdActionText, { color: '#A32D2D' }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {editingDipId === dip.id && (
                  <View style={[styles.dipCard, { backgroundColor: colors.background, borderColor: colors.border, marginTop: 8 }]}>
                    <Text style={[styles.formSection, { color: colors.text, marginBottom: 6 }]}>Edit Readings</Text>
                    {visibleTanks.map(t => (
                      <View key={t.id} style={{ marginBottom: 6 }}>
                        <Text style={[styles.dipCapacity, { color: colors.textMuted }]}>{t.name} ({t.prod})</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.inputBorder, color: colors.text }]}
                          placeholder="Current level in litres" placeholderTextColor={colors.textSubtle}
                          keyboardType="numeric"
                          value={editDipReadings[t.id] ?? ''}
                          onChangeText={v => setEditDipReadings(r => ({ ...r, [t.id]: v }))}
                        />
                      </View>
                    ))}
                    {visibleLpgTanks.map(l => (
                      <View key={l.id} style={{ marginBottom: 6 }}>
                        <Text style={[styles.dipCapacity, { color: colors.textMuted }]}>{l.name} (LPG)</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.inputBorder, color: colors.text }]}
                          placeholder="Current level in kg" placeholderTextColor={colors.textSubtle}
                          keyboardType="numeric"
                          value={editDipLpg[l.id] ?? ''}
                          onChangeText={v => setEditDipLpg(r => ({ ...r, [l.id]: v }))}
                        />
                      </View>
                    ))}
                    <TextInput
                      style={[styles.obsInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                      placeholder="Observations" placeholderTextColor={colors.textSubtle}
                      multiline numberOfLines={2} value={editDipObs} onChangeText={setEditDipObs}
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={() => saveEditDip(dip.id)} activeOpacity={0.85}>
                        <Text style={styles.submitBtnText}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.cancelBtn, { flex: 1, borderColor: colors.border }]} onPress={cancelEditDip}>
                        <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                {isMD && isPending && (
                  <View style={styles.mdActions}>
                    <TouchableOpacity
                      style={[styles.approveBtn, { backgroundColor: '#1a6e3c' }]}
                      onPress={() => { approveDip(dip.id); Alert.alert('Approved', 'Dip record has been approved.'); }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="checkmark" size={15} color="#fff" />
                      <Text style={styles.mdActionText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.rejectBtn, { borderColor: '#A32D2D' }]}
                      onPress={() => { rejectDip(dip.id); Alert.alert('Rejected', 'Dip record has been rejected.'); }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="close" size={15} color="#A32D2D" />
                      <Text style={[styles.mdActionText, { color: '#A32D2D' }]}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {isAdmin && isPending && (
                  <View style={[styles.mdActions, { marginTop: 6 }]}>
                    <TouchableOpacity
                      style={[styles.approveBtn, { backgroundColor: '#1a6e3c' }]}
                      onPress={() => { approveDip(dip.id); Alert.alert('Approved', 'Dip record approved by admin.'); }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="checkmark" size={15} color="#fff" />
                      <Text style={styles.mdActionText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.rejectBtn, { borderColor: '#791F1F', backgroundColor: '#FCEBEB' }]}
                      onPress={() =>
                        Alert.alert(
                          'Reset Dip Record',
                          `This will reject the pending dip by "${dip.by}" so they can submit a new one. Continue?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Reset', style: 'destructive', onPress: () => { rejectDip(dip.id); Alert.alert('Reset', 'Dip reset. Manager can now submit a new dip.'); } },
                          ]
                        )
                      }
                      activeOpacity={0.85}
                    >
                      <Ionicons name="refresh" size={15} color="#791F1F" />
                      <Text style={[styles.mdActionText, { color: '#791F1F' }]}>Reset (Unblock)</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
                );
              })}
            </View>
          ))}

          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 12 }]}>Delivery Records</Text>
          {deliveries.filter(d => !branchId || !d.branchId || d.branchId === branchId).map(rec => {
            const evidence = deliveryEvidences.filter(e => e.delivId === rec.id);
            return (
              <View key={rec.id} style={[styles.logCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.logHeader}>
                  <View>
                    <Text style={[styles.logDate, { color: colors.text }]}>{rec.prod} — {rec.sup}</Text>
                    <Text style={[styles.logBy, { color: colors.textMuted }]}>WB: {rec.wb} · {fmtDateTime(rec.dt)}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[rec.st] + '22' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[rec.st] }]}>{STATUS_LABELS[rec.st]}</Text>
                  </View>
                </View>
                <View style={styles.deliveryStats}>
                  <Text style={[styles.deliveryStatItem, { color: colors.textMuted }]}>Ordered: <Text style={{ color: colors.text, fontWeight: '600' }}>{safeNum(rec.ord).toLocaleString()}{rec.prod === 'LPG' ? 'kg' : 'L'}</Text></Text>
                  <Text style={[styles.deliveryStatItem, { color: colors.textMuted }]}>Received: <Text style={{ color: roleColor, fontWeight: '700' }}>{safeNum(rec.rec).toLocaleString()}{rec.prod === 'LPG' ? 'kg' : 'L'}</Text></Text>
                  {safeNum(rec.ord) !== safeNum(rec.rec) && <Text style={{ color: STATUS_COLORS[rec.st], fontSize: 12 }}>Diff: {(safeNum(rec.rec) - safeNum(rec.ord)).toLocaleString()}{rec.prod === 'LPG' ? 'kg' : 'L'}</Text>}
                </View>
                {rec.notes ? <Text style={[styles.dipObs, { color: colors.textMuted }]}>{rec.notes}</Text> : null}

                <View style={[styles.evidenceSection, { borderTopColor: colors.border }]}>
                  <View style={styles.evidenceHeader}>
                    <Ionicons name="attach-outline" size={13} color={colors.textMuted} />
                    <Text style={[styles.evidenceTitle, { color: colors.textMuted }]}>Evidence ({evidence.length})</Text>
                    {canEdit && (
                      <View style={styles.evidenceBtns}>
                        <TouchableOpacity onPress={() => pickCameraEvidence(rec.id)} style={[styles.evidenceAddBtn, { backgroundColor: roleColor + '18', borderColor: roleColor + '44' }]}>
                          <Ionicons name="camera-outline" size={11} color={roleColor} />
                          <Text style={[styles.evidenceAddText, { color: roleColor }]}>Camera</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => pickGalleryEvidence(rec.id)} style={[styles.evidenceAddBtn, { backgroundColor: '#2980B918', borderColor: '#2980B944' }]}>
                          <Ionicons name="images-outline" size={11} color="#2980B9" />
                          <Text style={[styles.evidenceAddText, { color: '#2980B9' }]}>Gallery</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => pickDocEvidence(rec.id)} style={[styles.evidenceAddBtn, { backgroundColor: '#8E44AD18', borderColor: '#8E44AD44' }]}>
                          <Ionicons name="document-outline" size={11} color="#8E44AD" />
                          <Text style={[styles.evidenceAddText, { color: '#8E44AD' }]}>File</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  {evidence.length === 0 && (
                    <Text style={[styles.evidenceEmpty, { color: colors.textSubtle }]}>
                      {canEdit ? 'No files attached — tap Camera, Gallery, or File to upload evidence' : 'No evidence attached'}
                    </Text>
                  )}
                  {evidence.map(ev => {
                    const isImg = ev.mimeType?.startsWith('image/') || ev.type === 'photo';
                    const isVid = ev.mimeType?.startsWith('video/') || ev.type === 'video';
                    const ic = isImg ? 'image-outline' : isVid ? 'videocam-outline' : 'document-text-outline';
                    const icColor = isImg ? roleColor : isVid ? '#2980B9' : '#8E44AD';
                    const label = isImg ? 'IMG' : isVid ? 'VID' : 'FILE';
                    return (
                      <View key={ev.id} style={[styles.evidenceItem, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <Ionicons name={ic as any} size={14} color={icColor} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.evidenceName, { color: colors.text }]} numberOfLines={1}>{ev.name}</Text>
                          <Text style={[styles.evidenceMeta, { color: colors.textSubtle }]}>by {ev.by} · {fmtDateTime(ev.dt)}</Text>
                        </View>
                        <View style={[styles.evidenceTypeBadge, { backgroundColor: icColor + '18' }]}>
                          <Text style={[styles.evidenceTypeText, { color: icColor }]}>{label}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
          <View style={{ height: 16 }} />
        </ScrollView>
      )}

      {activeTab === 2 && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          {visibleTanks.length > 0 && <Text style={[styles.sectionTitle, { color: colors.text }]}>Petroleum Tanks</Text>}
          {!perms.canPetrolTanks && role === 'mgr' && (
            <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
              <Text style={[styles.noBannerText, { color: colors.textMuted }]}>Petroleum tank access not granted</Text>
            </View>
          )}
          {visibleTanks.map(t => {
            const approvedDips = dips
              .filter(d => d.status === 'approved' && (d.rd ?? {})[t.id] !== undefined)
              .sort((a, b) => new Date(b.dt).getTime() - new Date(a.dt).getTime());
            const lastDipRecord = approvedDips[0];
            const dipReading = lastDipRecord ? ((lastDipRecord.rd ?? {})[t.id] ?? 0) : 0;
            const dipDt = lastDipRecord?.dt;
            const deliveriesSinceDip = deliveries
              .filter(d => d.prod === t.prod &&
                d.branchId === t.branchId &&
                isPhysicalDeliveryReceipt(d) &&
                (!dipDt || new Date(d.dt) > new Date(dipDt)))
              .reduce((s, d) => s + safeNum(d.rec), 0);
            const salesSinceDip = sales
              .filter(s => s.pump.toLowerCase().includes(t.prod.toLowerCase()) &&
                (!dipDt || new Date(s.dt) > new Date(dipDt)))
              .reduce((s, e) => s + safeNum(e.L), 0);
            const currentStock = Math.max(0, dipReading + deliveriesSinceDip - salesSinceDip);
            const pct = t.cap > 0 ? Math.min(100, Math.round((currentStock / t.cap) * 100)) : 0;
            const barColor = pct < 30 ? colors.error : pct < 60 ? colors.amber : colors.primary;
            return (
              <View key={t.id} style={[styles.invCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.invHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.invName, { color: colors.text }]}>{t.name}</Text>
                    <Text style={[styles.invProd, { color: colors.textMuted }]}>Capacity: {safeNum(t.cap).toLocaleString()}L</Text>
                  </View>
                  <View style={[styles.prodBadge, { backgroundColor: roleColor + '18' }]}>
                    <Text style={[styles.prodText, { color: roleColor }]}>{t.prod}</Text>
                  </View>
                </View>
                <View style={[styles.progressBg, { backgroundColor: colors.border, marginVertical: 10 }]}>
                  <View style={[styles.progressBar, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                </View>
                <View style={styles.invStats}>
                  <View style={styles.invStat}>
                    <Text style={[styles.invStatVal, { color: colors.text }]}>{currentStock.toLocaleString()}L</Text>
                    <Text style={[styles.invStatLabel, { color: colors.textMuted }]}>Current Stock</Text>
                  </View>
                  <View style={styles.invStat}>
                    <Text style={[styles.invStatVal, { color: barColor }]}>{pct}%</Text>
                    <Text style={[styles.invStatLabel, { color: colors.textMuted }]}>Fill Level</Text>
                  </View>
                </View>
                <View style={[styles.invBreakdown, { borderTopColor: colors.border }]}>
                  <View style={styles.invBreakdownRow}>
                    <Text style={[styles.invBreakdownLabel, { color: colors.textMuted }]}>
                      Last dip{lastDipRecord ? ` applies on ${fmtDate(lastDipRecord.dt)}` : ''}
                    </Text>
                    <Text style={[styles.invBreakdownVal, { color: colors.text }]}>{dipReading.toLocaleString()}L</Text>
                  </View>
                  <View style={styles.invBreakdownRow}>
                    <Text style={[styles.invBreakdownLabel, { color: colors.textMuted }]}>+ Deliveries received</Text>
                    <Text style={[styles.invBreakdownVal, { color: '#27500A' }]}>+{deliveriesSinceDip.toLocaleString()}L</Text>
                  </View>
                  <View style={styles.invBreakdownRow}>
                    <Text style={[styles.invBreakdownLabel, { color: colors.textMuted }]}>− Sales volume</Text>
                    <Text style={[styles.invBreakdownVal, { color: colors.error }]}>−{salesSinceDip.toLocaleString()}L</Text>
                  </View>
                  <View style={[styles.invBreakdownRow, styles.invBreakdownTotal, { borderTopColor: colors.border }]}>
                    <Text style={[styles.invBreakdownLabel, { color: colors.text, fontWeight: '700' }]}>= Current Inventory</Text>
                    <Text style={[styles.invBreakdownVal, { color: barColor, fontWeight: '700' }]}>{currentStock.toLocaleString()}L</Text>
                  </View>
                </View>
              </View>
            );
          })}

          {visibleLpgTanks.length > 0 && <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 8 }]}>LPG Tanks</Text>}
          {!perms.canLpgTanks && role === 'mgr' && (
            <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
              <Text style={[styles.noBannerText, { color: colors.textMuted }]}>LPG tank access not granted</Text>
            </View>
          )}
          {visibleLpgTanks.map(l => {
            const approvedDips = dips
              .filter(d => d.status === 'approved' && (d.lpg ?? {})[l.id] !== undefined)
              .sort((a, b) => new Date(b.dt).getTime() - new Date(a.dt).getTime());
            const lastDipRecord = approvedDips[0];
            const dipReading = lastDipRecord ? ((lastDipRecord.lpg ?? {})[l.id] ?? 0) : 0;
            const dipDt = lastDipRecord?.dt;
            const deliveriesSinceDip = deliveries
              .filter(d => d.prod === 'LPG' &&
                d.branchId === l.branchId &&
                isPhysicalDeliveryReceipt(d) &&
                (!dipDt || new Date(d.dt) > new Date(dipDt)))
              .reduce((s, d) => s + safeNum(d.rec), 0);
            const currentStock = Math.max(0, dipReading + deliveriesSinceDip);
            const pct = l.cap > 0 ? Math.min(100, Math.round((currentStock / l.cap) * 100)) : 0;
            const barColor = pct < 30 ? colors.error : pct < 60 ? colors.amber : colors.teal;
            return (
              <View key={l.id} style={[styles.invCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.invHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.invName, { color: colors.text }]}>{l.name}</Text>
                    <Text style={[styles.invProd, { color: colors.textMuted }]}>Capacity: {safeNum(l.cap).toLocaleString()} kg</Text>
                  </View>
                  <View style={[styles.prodBadge, { backgroundColor: colors.teal + '18' }]}>
                    <Text style={[styles.prodText, { color: colors.teal }]}>LPG</Text>
                  </View>
                </View>
                <View style={[styles.progressBg, { backgroundColor: colors.border, marginVertical: 10 }]}>
                  <View style={[styles.progressBar, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                </View>
                <View style={styles.invStats}>
                  <View style={styles.invStat}>
                    <Text style={[styles.invStatVal, { color: colors.text }]}>{currentStock.toLocaleString()} kg</Text>
                    <Text style={[styles.invStatLabel, { color: colors.textMuted }]}>Current Stock</Text>
                  </View>
                  <View style={styles.invStat}>
                    <Text style={[styles.invStatVal, { color: barColor }]}>{pct}%</Text>
                    <Text style={[styles.invStatLabel, { color: colors.textMuted }]}>Fill Level</Text>
                  </View>
                </View>
                <View style={[styles.invBreakdown, { borderTopColor: colors.border }]}>
                  <View style={styles.invBreakdownRow}>
                    <Text style={[styles.invBreakdownLabel, { color: colors.textMuted }]}>
                      Last dip{lastDipRecord ? ` applies on ${fmtDate(lastDipRecord.dt)}` : ''}
                    </Text>
                    <Text style={[styles.invBreakdownVal, { color: colors.text }]}>{dipReading.toLocaleString()} kg</Text>
                  </View>
                  <View style={styles.invBreakdownRow}>
                    <Text style={[styles.invBreakdownLabel, { color: colors.textMuted }]}>+ Deliveries received</Text>
                    <Text style={[styles.invBreakdownVal, { color: '#27500A' }]}>+{deliveriesSinceDip.toLocaleString()} kg</Text>
                  </View>
                  <View style={[styles.invBreakdownRow, styles.invBreakdownTotal, { borderTopColor: colors.border }]}>
                    <Text style={[styles.invBreakdownLabel, { color: colors.text, fontWeight: '700' }]}>= Current Inventory</Text>
                    <Text style={[styles.invBreakdownVal, { color: barColor, fontWeight: '700' }]}>{currentStock.toLocaleString()} kg</Text>
                  </View>
                </View>
              </View>
            );
          })}
          <View style={{ height: 16 }} />
        </ScrollView>
      )}

      {confirmationModal}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e3' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabLabel: { fontSize: 13 },
  tabBadge: { minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  scroll: { padding: 16 },
  formSection: { fontSize: 14, fontWeight: '700', marginBottom: 10, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  dipCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 12, gap: 8 },
  dipCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dipCardTitle: { fontSize: 14, fontWeight: '600' },
  dipCapacity: { fontSize: 11 },
  prodBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  prodText: { fontSize: 11, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  calcResult: { fontSize: 13, fontWeight: '600' },
  stickyFooter: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  invBreakdown: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 8, gap: 4 },
  invBreakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  invBreakdownLabel: { fontSize: 12 },
  invBreakdownVal: { fontSize: 12, fontWeight: '600' },
  invBreakdownTotal: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4, paddingTop: 6 },
  analysisRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, borderWidth: 1, padding: 10 },
  analysisProd: { fontSize: 13, fontWeight: '700' },
  analysisDetail: { fontSize: 12, marginTop: 1 },
  obsInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 16, minHeight: 80, textAlignVertical: 'top' },
  lockBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 14 },
  lockText: { flex: 1, fontSize: 13, fontWeight: '600' },
  noBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', marginBottom: 12 },
  noBannerText: { flex: 1, fontSize: 12 },
  pendingBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 14 },
  pendingText: { flex: 1, fontSize: 12, lineHeight: 18 },
  mdBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  mdBannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  dipStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  dipStatusText: { fontSize: 10, fontWeight: '700' },
  approvedByText: { fontSize: 11, marginTop: 4 },
  historyBranchRail: { gap: 8, paddingBottom: 4 },
  historyBranchTile: { width: 132, minHeight: 92, padding: 11, borderRadius: 13, borderWidth: 1, justifyContent: 'space-between' },
  historyBranchTileName: { fontSize: 12, fontWeight: '800', marginTop: 8 },
  historyBranchTileCount: { fontSize: 10, fontWeight: '600', marginTop: 4 },
  mdActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10 },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5 },
  mdActionText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12, marginBottom: 16 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  evidenceSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 6 },
  evidenceHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  evidenceTitle: { flex: 1, fontSize: 12, fontWeight: '600' },
  evidenceBtns: { flexDirection: 'row', gap: 6 },
  evidenceAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  evidenceAddText: { fontSize: 10, fontWeight: '700' },
  evidenceItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, borderWidth: 1 },
  evidenceName: { fontSize: 11, fontWeight: '600' },
  evidenceMeta: { fontSize: 10, marginTop: 1 },
  evidenceTypeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  evidenceTypeText: { fontSize: 9, fontWeight: '700' },
  evidenceEmpty: { fontSize: 11, fontStyle: 'italic', paddingVertical: 4 },
  cancelBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', marginBottom: 16 },
  addBtnText: { fontSize: 14, fontWeight: '600' },
  prodRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  prodBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  logCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  branchHistoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 4, marginBottom: 8 },
  branchHistoryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  branchHistoryName: { fontSize: 13, fontWeight: '800' },
  branchHistoryCount: { fontSize: 10, fontWeight: '600' },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  logDate: { fontSize: 14, fontWeight: '600' },
  logBy: { fontSize: 11, marginTop: 2 },
  readingsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  readingChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  readingLabel: { fontSize: 9 },
  readingVal: { fontSize: 13, fontWeight: '700' },
  dipObs: { fontSize: 12, marginTop: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '700' },
  deliveryStats: { flexDirection: 'row', gap: 12, marginTop: 4 },
  deliveryStatItem: { fontSize: 12 },
  invCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  invHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  invName: { fontSize: 14, fontWeight: '600' },
  invProd: { fontSize: 11, marginTop: 2 },
  invStats: { flexDirection: 'row', gap: 12 },
  invStat: {},
  invStatVal: { fontSize: 16, fontWeight: '700' },
  invStatLabel: { fontSize: 11, marginTop: 1 },
  progressBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressBar: { height: 8, borderRadius: 4 },
  histCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  histHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  histTank: { fontSize: 14, fontWeight: '700' },
  histMeta: { fontSize: 11, marginTop: 2 },
  discBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  discBadgeText: { fontSize: 11, fontWeight: '700' },
  histGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  histCell: { width: '30%' },
  histCellLabel: { fontSize: 10, marginBottom: 2 },
  histCellVal: { fontSize: 13, fontWeight: '600' },
});
