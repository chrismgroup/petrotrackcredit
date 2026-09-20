import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { AppliedDateField } from '@/components/AppliedDateField';
import { useBusinessDateConfirmation } from '@/components/BusinessDateConfirmation';
import { DEFAULT_MGR_PERMS, ROLE_COLORS, SCREEN_ROUTES, businessDateKey, fmt, fmtDate, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { safeNum } from '@/lib/report-helpers';

const DIP_STATUS_COLOR: Record<string, string> = { pending: '#BA7517', approved: '#1a6e3c', rejected: '#A32D2D' };
const DIP_STATUS_LABEL: Record<string, string> = { pending: 'Pending Approval', approved: 'Approved', rejected: 'Rejected' };
const DIP_STATUS_ICON: Record<string, string> = { pending: 'time', approved: 'checkmark-circle', rejected: 'close-circle' };

export default function TanksScreen() {
  const { role, tanks, lpgTanks, dips, branches, addDip, updateDip, deleteDip, approveDip, rejectDip, prices, userName, branchId, mgrPerms } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;
  const { requestDateConfirmation, confirmationModal } = useBusinessDateConfirmation();
  const canEdit = role === 'mgr';
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [lpgReadings, setLpgReadings] = useState<Record<string, string>>({});
  const [obs, setObs] = useState('');
  const [appliesOn, setAppliesOn] = useState('');
  const [editingDipId, setEditingDipId] = useState<number | null>(null);
  const [editDipReadings, setEditDipReadings] = useState<Record<string, string>>({});
  const [editDipLpg, setEditDipLpg] = useState<Record<string, string>>({});
  const [editDipObs, setEditDipObs] = useState('');
  const [selectedHistoryBranchId, setSelectedHistoryBranchId] = useState<string | null>(null);
  const [decidingDipId, setDecidingDipId] = useState<number | null>(null);
  const [isSavingEditDip, setIsSavingEditDip] = useState(false);

  const isMD = role === 'md';
  const canViewWorkflow = role === 'md' || role === 'ceo' || role === 'acc' || role === 'csm';
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
  const canReviewDip = (dip: (typeof dips)[number]) =>
    canViewWorkflow || dipHasVisibleReading(dip);
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
  const visibleDipRecords = dips.filter(dip =>
    canReviewDip(dip)
    && (canEdit
      ? (dip.status === 'rejected' || dip.status === 'pending') && dip.by === userName
      : canViewWorkflow),
  );
  // Pending/awaiting-review reports surface first, then everything else by
  // most recent applies-on/submitted date and time.
  const compareDipsForReview = (a: (typeof visibleDipRecords)[number], b: (typeof visibleDipRecords)[number]) => {
    const rank = (dip: (typeof visibleDipRecords)[number]) => dip.status === 'pending' ? 0 : 1;
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    const timeOf = (dip: (typeof visibleDipRecords)[number]) => new Date(dip.submittedAt ?? dip.dt).getTime();
    return timeOf(b) - timeOf(a);
  };
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
    return [...groups.values()]
      .map(group => ({ ...group, dips: [...group.dips].sort(compareDipsForReview) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  })();
  const activeHistoryBranchId = selectedHistoryBranchId && historyBranchGroups.some(group => group.id === selectedHistoryBranchId)
    ? selectedHistoryBranchId
    : null;
  const displayedDipHistoryGroups = historyBranchGroups.filter(group =>
    activeHistoryBranchId ? group.id === activeHistoryBranchId : group.dips.length > 0,
  );
  const hasDisplayedHistory = displayedDipHistoryGroups.some(group => group.dips.length > 0);
  const pendingDips = dips.filter(d => d.status === 'pending' && dipHasVisibleReading(d));
  // The server allows only one non-rejected dip per branch per business date.
  // Warn before submitting so a manager never hits that block with no visible
  // explanation of what's already pending.
  const hasPendingDipForDate = canEdit && Boolean(appliesOn) && dips.some(d =>
    d.by === userName &&
    d.status === 'pending' &&
    businessDateKey(d.dt) === businessDateKey(appliesOn),
  );

  function handleDipSubmit() {
    if (!appliesOn) {
      Alert.alert('Date required', 'Select the date this tank dip applies to.');
      return;
    }
    if (hasPendingDipForDate) {
      Alert.alert('Already submitted', 'This date already has a dip record awaiting MD approval. Edit or withdraw it in "My Dip Submissions" below to submit a corrected reading.');
      return;
    }
    const rd: Record<string, number> = {};
    const lpg: Record<string, number> = {};
    for (const t of visibleTanks)    { rd[t.id]  = parseFloat(readings[t.id]    || '0') || 0; }
    for (const l of visibleLpgTanks) { lpg[l.id] = parseFloat(lpgReadings[l.id] || '0') || 0; }

    requestDateConfirmation('tank dip', appliesOn, async () => {
      const result = await addDip({ dt: appliesOn, by: userName, rd, lpg, obs, status: 'pending' });
      if (!result.ok) {
        Alert.alert(
          'Dip not submitted',
          result.error ?? 'The server did not accept this tank dip. Your readings remain available so you can retry.',
        );
        return;
      }
      setReadings({}); setLpgReadings({}); setObs(''); setAppliesOn('');
      Alert.alert('Dip Submitted', 'Tank readings recorded and sent to MD for approval.');
    });
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
    if (isSavingEditDip) return;
    const rd: Record<string, number> = {};
    const lpg: Record<string, number> = {};
    for (const [k, v] of Object.entries(editDipReadings)) { const n = parseFloat(v); if (!isNaN(n)) rd[k] = n; }
    for (const [k, v] of Object.entries(editDipLpg)) { const n = parseFloat(v); if (!isNaN(n)) lpg[k] = n; }
    setIsSavingEditDip(true);
    updateDip(dipId, { rd, lpg, obs: editDipObs.trim() }).then(result => {
      setIsSavingEditDip(false);
      if (!result.ok) {
        Alert.alert('Dip not updated', result.error ?? 'The server could not update this dip. Please refresh and try again.');
        return;
      }
      cancelEditDip();
      Alert.alert('Dip Updated', 'Readings have been saved.');
    });
  }
  function handleDeleteDip(dip: typeof dips[0]) {
    const isPending = dip.status === 'pending';
    Alert.alert(
      isPending ? 'Withdraw Dip Record?' : 'Delete Dip Record?',
      `${isPending ? 'Awaiting MD approval, submitted' : 'Recorded by ' + dip.by + ' for ' + fmtDate(dip.dt) + '. Submitted'} ${fmtDateTime(dip.submittedAt ?? dip.dt)}.${isPending ? ' Withdrawing frees up this date so you can submit a corrected reading.' : ' This cannot be undone.'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isPending ? 'Withdraw' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteDip(dip.id);
            if (!result.ok) {
              Alert.alert(isPending ? 'Dip not withdrawn' : 'Dip not deleted', result.error ?? 'The server could not complete this request. Please refresh and try again.');
            }
          },
        },
      ]
    );
  }
  async function handleApproveDip(dipId: number) {
    if (decidingDipId !== null) return;
    setDecidingDipId(dipId);
    const result = await approveDip(dipId);
    setDecidingDipId(null);
    if (!result.ok) {
      Alert.alert('Dip not approved', result.error ?? 'The server could not approve this dip. Please refresh and try again.');
      return;
    }
    Alert.alert('Approved', 'Dip record has been approved.');
  }
  async function handleRejectDip(dipId: number) {
    if (decidingDipId !== null) return;
    setDecidingDipId(dipId);
    const result = await rejectDip(dipId);
    setDecidingDipId(null);
    if (!result.ok) {
      Alert.alert('Dip not rejected', result.error ?? 'The server could not reject this dip. Please refresh and try again.');
      return;
    }
    Alert.alert('Rejected', 'Dip record has been rejected.');
  }

  return (
    <ScreenLayout title="Tank Dipping">
      {canEdit && (
        <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Dip Form</Text>
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
          {hasPendingDipForDate && (
            <View style={[styles.pendingBanner, { backgroundColor: '#BA751718', borderColor: '#BA7517' }]}>
              <Ionicons name="time" size={16} color="#BA7517" />
              <Text style={[styles.pendingText, { color: '#BA7517' }]}>
                This date already has a dip record awaiting MD approval. Edit or withdraw it in "My Dip Submissions" below.
              </Text>
            </View>
          )}

          <View style={{ height: 8 }} />
        </ScrollView>

        {canEdit && (
          <View style={[styles.stickyFooter, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: roleColor, marginBottom: 0, opacity: hasPendingDipForDate ? 0.6 : 1 }]}
              onPress={handleDipSubmit}
              disabled={hasPendingDipForDate}
              activeOpacity={0.85}
            >
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Submit Dip to MD</Text>
            </TouchableOpacity>
          </View>
        )}
        </View>
      )}

      {((canEdit && visibleDipRecords.length > 0) || canViewWorkflow) && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          {isMD && dips.some(d => d.status === 'pending') && (
            <View style={[styles.mdBanner, { backgroundColor: '#4527a018', borderColor: '#4527a0' }]}>
              <Ionicons name="alert-circle" size={16} color="#4527a0" />
              <Text style={[styles.mdBannerText, { color: '#4527a0' }]}>
                {dips.filter(d => d.status === 'pending').length} dip record{dips.filter(d => d.status === 'pending').length > 1 ? 's' : ''} awaiting your approval
              </Text>
            </View>
          )}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {canEdit ? 'My Dip Submissions' : 'Pending Dip Reports for Review'}
          </Text>
          <View style={styles.historyBranchRail}>
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
          </View>
          {!hasDisplayedHistory ? (
            <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.noBannerText, { color: colors.textMuted }]}>
                 {canEdit
                   ? 'No dip submissions awaiting MD review or requiring correction.'
                   : 'No dip reports are awaiting MD approval.'}
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
                {canEdit && (dip.status === 'rejected' || dip.status === 'pending') && (
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
                      <Text style={[styles.mdActionText, { color: '#A32D2D' }]}>{dip.status === 'pending' ? 'Withdraw' : 'Delete'}</Text>
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
                      <TouchableOpacity
                        style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor, opacity: isSavingEditDip ? 0.6 : 1 }]}
                        onPress={() => saveEditDip(dip.id)}
                        disabled={isSavingEditDip}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.submitBtnText}>{isSavingEditDip ? 'Saving\u2026' : 'Save'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.cancelBtn, { flex: 1, borderColor: colors.border }]} onPress={cancelEditDip} disabled={isSavingEditDip}>
                        <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                {isMD && isPending && (
                  <View style={styles.mdActions}>
                    <TouchableOpacity
                      style={[styles.approveBtn, { backgroundColor: '#1a6e3c', opacity: decidingDipId === dip.id ? 0.6 : 1 }]}
                      onPress={() => handleApproveDip(dip.id)}
                      disabled={decidingDipId !== null}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="checkmark" size={15} color="#fff" />
                      <Text style={styles.mdActionText}>{decidingDipId === dip.id ? 'Approving\u2026' : 'Approve'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.rejectBtn, { borderColor: '#A32D2D', opacity: decidingDipId === dip.id ? 0.6 : 1 }]}
                      onPress={() => handleRejectDip(dip.id)}
                      disabled={decidingDipId !== null}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="close" size={15} color="#A32D2D" />
                      <Text style={[styles.mdActionText, { color: '#A32D2D' }]}>{decidingDipId === dip.id ? 'Rejecting\u2026' : 'Reject'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
                );
              })}
            </View>
          ))}

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
  historyBranchRail: { gap: 8, paddingBottom: 4, marginBottom: 4 },
  historyBranchTile: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 13, borderWidth: 1 },
  historyBranchTileName: { flex: 1, fontSize: 13, fontWeight: '800' },
  historyBranchTileCount: { fontSize: 11, fontWeight: '600' },
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
