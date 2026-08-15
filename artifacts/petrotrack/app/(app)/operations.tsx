import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { AppliedDateField } from '@/components/AppliedDateField';
import {
  DEFAULT_MGR_PERMS, GLOBAL_OVERVIEW_ROLES, calculateStockBook, getCurrentTankStock, mmToLiters,
  ROLE_COLORS, fmtDate, fmtDateTime, unitForProd, useApp, type StockProduct,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const DIP_SUBTABS_MGR  = ['Dip Form', 'Awaiting Approval', 'History'];
const DIP_SUBTABS_APPR = ['Awaiting Approval', 'History'];
const DIP_SUBTABS_VIEWER = ['History'];
const STOCK_SNAPSHOT_PRODUCTS: StockProduct[] = ['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil'];
const STATUS_LABELS: Record<string, string> = { ok: 'OK', short: 'Short', spill: 'Spill', seal: 'Seal Broken' };
const STATUS_COLORS: Record<string, string> = { ok: '#27500A', short: '#BA7517', spill: '#A32D2D', seal: '#4527a0' };
const DIP_STATUS_COLOR: Record<string, string> = { pending: '#BA7517', approved: '#1a6e3c', rejected: '#A32D2D' };
const DIP_STATUS_LABEL: Record<string, string> = { pending: 'Pending Approval', approved: 'Approved', rejected: 'Rejected' };
const DIP_STATUS_ICON: Record<string, string>  = { pending: 'time', approved: 'checkmark-circle', rejected: 'close-circle' };
type TopTab = 'dip';

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function recordDateKey(value?: string): string {
  return value?.slice(0, 10) ?? '';
}

function formatStockQuantity(value: number | null): string {
  return value === null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function OperationsScreen() {
  const {
    role, userName, branchId, branches, mgrPerms,
    tanks, lpgTanks, pumps, dips, deliveries, pumpDailyReports, startupStocks, stockSnapshotConfig,
    addDip, approveDip, rejectDip,
    prices,
  } = useApp();

  const colors    = useColors();
  const params    = useLocalSearchParams<{ tab?: string }>();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;
  const isMgr      = role === 'mgr';
  const isMD       = role === 'md';
  const isAdmin    = role === 'admin';
  const canApprove = isMD || isAdmin;

  const topTabs: { key: TopTab; label: string; icon: string }[] = [
    {
      key: 'dip',
      label: params.tab === 'inventory' ? 'Inventory' : (isMgr || canApprove ? 'Tank Dip' : 'Inventory'),
      icon: params.tab === 'inventory' ? 'cube-outline' : (isMgr || canApprove ? 'water-outline' : 'cube-outline'),
    },
  ];

  const defaultTab: TopTab = 'dip';
  const [topTab, setTopTab] = useState<TopTab>(defaultTab);

  // ── Dip state ────────────────────────────────────────────────────────────
  // MD/Admin start on Approvals; station managers start on Dip Form; other
  // roles start on history because they do not submit or approve tank dips.
  const [dipSubTab, setDipSubTab]     = useState(
    params.tab === 'inventory' ? 2 : params.tab === 'dip-history' ? 3 : canApprove ? 1 : isMgr ? 0 : 3
  );
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
  const isGlobalStockViewer = role === 'admin' || (role ? GLOBAL_OVERVIEW_ROLES.has(role) : false);
  const hasPendingDip   = canDip && dips.some(d => d.by === userName && d.status === 'pending');
  const visiblePetrolTankIds = new Set(visibleTanks.map(tank => tank.id));
  const visibleLpgTankIds = new Set(visibleLpgTanks.map(tank => tank.id));
  const dipHasVisibleReading = (dip: (typeof dips)[number]) =>
    Object.keys(dip.rd).some(tankId => visiblePetrolTankIds.has(tankId)) ||
    Object.keys(dip.lpg).some(tankId => visibleLpgTankIds.has(tankId));
  const getDipBranch = (dip: (typeof dips)[number]) => {
    if (dip.branchId) {
      return {
        id: dip.branchId,
        name: branches.find(branch => branch.id === dip.branchId)?.name ?? 'Unknown branch',
      };
    }
    const branchIds = Array.from(new Set([
      ...Object.keys(dip.rd).map(tankId => tanks.find(tank => tank.id === tankId)?.branchId),
      ...Object.keys(dip.lpg).map(tankId => lpgTanks.find(tank => tank.id === tankId)?.branchId),
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

  function handleDipSubmit() {
    if (!appliesOn) {
      Alert.alert('Date required', 'Select the date this tank dip applies to.');
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
  const approvedDips = dips
    .filter(dip => dip.status === 'approved' && dipHasVisibleReading(dip))
    .sort((a, b) => new Date(b.approvedDt ?? b.dt).getTime() - new Date(a.approvedDt ?? a.dt).getTime());
  const approvedDipGroups = approvedDips.reduce<Array<{ id: string; name: string; dips: typeof approvedDips }>>((groups, dip) => {
    const branch = getDipBranch(dip);
    const group = groups.find(item => item.id === branch.id);
    if (group) group.dips.push(dip);
    else groups.push({ ...branch, dips: [dip] });
    return groups;
  }, []).sort((a, b) => a.name.localeCompare(b.name));

  const stockSnapshotBranches = (() => {
    const todayKey = localDateKey(new Date());
    const latestDipForBranch = (
      scopeTanks: typeof tanks,
      scopeLpgTanks: typeof lpgTanks,
    ) => dips
      .filter(dip =>
        recordDateKey(dip.dt) === todayKey &&
        dip.status !== 'rejected' &&
        (scopeTanks.some(tank => dip.rd?.[tank.id] !== undefined) ||
          scopeLpgTanks.some(tank => dip.lpg?.[tank.id] !== undefined)),
      )
      .sort((a, b) =>
        new Date(b.approvedDt ?? b.submittedAt ?? b.dt).getTime() -
        new Date(a.approvedDt ?? a.submittedAt ?? a.dt).getTime() ||
        b.id - a.id
      )[0];

    const dipForProduct = (
      record: typeof dips[number] | undefined,
      product: StockProduct,
      scopeTanks: typeof tanks,
      scopeLpgTanks: typeof lpgTanks,
    ): number | null => {
      if (!record) return null;
      if (product === 'LPG') {
        const readings = scopeLpgTanks
          .map(tank => record.lpg?.[tank.id])
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
        return readings.length > 0 ? readings.reduce((sum, reading) => sum + reading, 0) : null;
      }
      const readings = scopeTanks
        .filter(tank => tank.prod === product)
        .map(tank => {
          const reading = record.rd?.[tank.id];
          return typeof reading === 'number' && Number.isFinite(reading) ? mmToLiters(tank, reading) : null;
        })
        .filter((value): value is number => value !== null);
      return readings.length > 0 ? readings.reduce((sum, reading) => sum + reading, 0) : null;
    };

    const hasAssignedStockAssets = (candidateBranchId: string | null | undefined) =>
      Boolean(candidateBranchId) &&
      (tanks.some(tank => tank.branchId === candidateBranchId) ||
        lpgTanks.some(tank => tank.branchId === candidateBranchId)) &&
      pumps.some(pump => pump.branchId === candidateBranchId);

    const scopes = isGlobalStockViewer
      ? branches
        .filter(branch => hasAssignedStockAssets(branch.id))
        .map(branch => ({ branchId: branch.id, branchName: branch.name }))
      : branchId && hasAssignedStockAssets(branchId)
        ? [{ branchId, branchName: branches.find(branch => branch.id === branchId)?.name ?? 'My branch' }]
        : [];

    return scopes.map(scope => {
      const inScope = (item: { branchId?: string }) => item.branchId === scope.branchId;
      const branchTanks = tanks.filter(inScope);
      const branchLpgTanks = lpgTanks.filter(inScope);
      const todayDip = latestDipForBranch(branchTanks, branchLpgTanks);
      const enabledProducts = stockSnapshotConfig.productsByBranch[scope.branchId];

      return {
        ...scope,
        products: STOCK_SNAPSHOT_PRODUCTS
          .filter(product => enabledProducts?.[product] !== false)
          .map(product => {
            const stockBook = calculateStockBook(
              startupStocks.find(stock => stock.product === product && stock.branchId === scope.branchId),
              product,
              scope.branchId,
              deliveries,
              pumpDailyReports,
              todayKey,
              pumps,
            );
            const submittedTankDip = dipForProduct(todayDip, product, branchTanks, branchLpgTanks);
            const variance = stockBook.bookStock === null || submittedTankDip === null
              ? null
              : stockBook.bookStock - submittedTankDip;
            return {
              product,
              startupStock: stockBook.startupStock,
              deliveries: stockBook.delivered,
              sales: stockBook.sold,
              bookStock: stockBook.bookStock,
              submittedTankDip,
              variance,
              unit: unitForProd(product),
            };
          }),
      };
    });
  })();

  return (
    <ScreenLayout title={params.tab === 'inventory' ? 'Inventory' : 'Operations'}>

      {/* ── Top-level tab bar ── */}
      <View style={[styles.topTabBar, { borderBottomColor: colors.border }]}>
        {topTabs.map(t => (
          <TouchableOpacity key={t.key} onPress={() => setTopTab(t.key)}
            style={[styles.topTabBtn, { borderBottomColor: t.key === topTab ? roleColor : 'transparent' }]}>
            <Ionicons name={t.icon as any} size={15} color={t.key === topTab ? roleColor : colors.textMuted} />
            <Text style={[styles.topTabLabel, { color: t.key === topTab ? roleColor : colors.textMuted, fontWeight: t.key === topTab ? '700' : '400' }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ═══════════════════════════════════════════════════════ TANK DIP ══ */}
      {topTab === 'dip' && (
        <>
          {(() => {
            // MD/Admin see the awaiting-approval queue; station managers see
            // the Dip Form; all other roles see history only.
            const dipTabItems = (canApprove ? DIP_SUBTABS_APPR : isMgr ? DIP_SUBTABS_MGR : DIP_SUBTABS_VIEWER).map(
              (label, vi) => ({
                label,
                contentIdx: label === 'History' ? 3 : label === 'Awaiting Approval' ? 1 : 0,
              })
            );
            return (
              params.tab === 'inventory' ? null : (
                <View style={[styles.subTabBar, { borderBottomColor: colors.border }]}>
                  {dipTabItems.map(({ label, contentIdx }) => {
                    const isActive   = contentIdx === dipSubTab;
                    const showBadge  = label === 'Awaiting Approval' && pendingDips.length > 0;
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
              )
            );
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
                const mm = parseFloat(readings[t.id] || '');
                const L  = !isNaN(mm) ? mm : null;
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
                      placeholder={`Reading in mm (max ${t.dip}mm)`}
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

          {/* ── Historical approved dippings ── */}
          {dipSubTab === 3 && (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={[styles.inventorySummary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.inventorySummaryHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inventorySummaryTitle, { color: colors.text }]}>Approved dip quantities by branch</Text>
                    <Text style={[styles.inventorySummarySub, { color: colors.textMuted }]}>
                      Each product is calculated inside its own branch. Branch stock is never combined.
                    </Text>
                  </View>
                  <View style={[styles.inventorySummaryIcon, { backgroundColor: roleColor + '18' }]}>
                    <Ionicons name="business-outline" size={20} color={roleColor} />
                  </View>
                </View>
                <View style={styles.inventoryMetricGrid}>
                  <View style={styles.inventoryMetric}>
                    <Text style={[styles.inventoryMetricValue, { color: colors.text }]}>{approvedDips.length}</Text>
                    <Text style={[styles.inventoryMetricLabel, { color: colors.textMuted }]}>Approved dippings</Text>
                  </View>
                </View>
              </View>

              <Text style={[styles.sectionTitle, { color: colors.text }]}>Current tank levels</Text>
              {visibleTanks.map(tank => {
                const stock = getCurrentTankStock(tank, dips);
                const pct = Math.max(0, Math.min(100, Math.round((stock / tank.cap) * 100)));
                return (
                  <View key={tank.id} style={[styles.currentLevelRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.historyTankName, { color: colors.text }]}>{tank.name}</Text>
                      <Text style={[styles.historyMeta, { color: colors.textMuted }]}>
                        {branches.find(branch => branch.id === tank.branchId)?.name ?? 'Unassigned assets'} · {tank.prod} · Capacity {tank.cap.toLocaleString()} L
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.currentLevelValue, { color: colors.primary }]}>{stock.toLocaleString()} L</Text>
                      <Text style={[styles.historyMeta, { color: colors.textMuted }]}>{pct}% full</Text>
                    </View>
                  </View>
                );
              })}
              {visibleLpgTanks.map(tank => {
                const stock = getCurrentTankStock(tank, dips, 'lpg');
                const pct = Math.max(0, Math.min(100, Math.round((stock / tank.cap) * 100)));
                return (
                  <View key={tank.id} style={[styles.currentLevelRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.historyTankName, { color: colors.text }]}>{tank.name}</Text>
                      <Text style={[styles.historyMeta, { color: colors.textMuted }]}>
                        {branches.find(branch => branch.id === tank.branchId)?.name ?? 'Unassigned assets'} · LPG · Capacity {tank.cap.toLocaleString()} kg
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.currentLevelValue, { color: colors.teal }]}>{stock.toLocaleString()} kg</Text>
                      <Text style={[styles.historyMeta, { color: colors.textMuted }]}>{pct}% full</Text>
                    </View>
                  </View>
                );
              })}

              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 12 }]}>All approved tank dippings</Text>
              {approvedDips.length === 0 ? (
                <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.noBannerText, { color: colors.textMuted }]}>No approved dippings yet. Approved readings will appear here for comparison.</Text>
                </View>
              ) : approvedDipGroups.map(group => (
                <View key={group.id}>
                  <View style={[styles.branchHistoryHeader, { backgroundColor: roleColor + '10', borderColor: roleColor + '35' }]}>
                    <View style={styles.branchHistoryTitleRow}>
                      <Ionicons name="business-outline" size={15} color={roleColor} />
                      <Text style={[styles.branchHistoryName, { color: colors.text }]}>{group.name}</Text>
                      </View>
                    <Text style={[styles.branchHistoryCount, { color: colors.textMuted }]}>{group.dips.length} dip record{group.dips.length === 1 ? '' : 's'}</Text>
                  </View>
                  {group.dips.map(dip => {
                    const dipTime = new Date(dip.approvedDt ?? dip.dt).getTime();
                    return (
                      <View key={dip.id} style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={styles.historyCardHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.historyTankName, { color: colors.text }]}>Tank Dip #{dip.id}</Text>
                            <Text style={[styles.historyMeta, { color: colors.textMuted }]}>Applies on {fmtDate(dip.dt)} · Submitted {fmtDateTime(dip.submittedAt ?? dip.dt)} · by {dip.by}</Text>
                          </View>
                          <View style={[styles.historyStatus, { backgroundColor: colors.success + '18' }]}>
                            <Ionicons name="checkmark-circle-outline" size={12} color={colors.success} />
                            <Text style={[styles.historyStatusText, { color: colors.success }]}>Approved</Text>
                          </View>
                        </View>
                        <View style={styles.dipHistoryReadingList}>
                          {Object.entries(dip.rd).filter(([tankId]) => visiblePetrolTankIds.has(tankId)).map(([tankId, litres]) => {
                            const tank = tanks.find(item => item.id === tankId);
                            const previous = group.dips.find(candidate =>
                              candidate.id !== dip.id
                              && new Date(candidate.approvedDt ?? candidate.dt).getTime() < dipTime
                              && candidate.rd[tankId] !== undefined
                            );
                            const change = previous ? Number(litres) - Number(previous.rd[tankId]) : null;
                            return (
                              <View key={tankId} style={[styles.dipHistoryReading, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.historyMeta, { color: colors.textMuted }]}>{tank?.name ?? tankId}</Text>
                                  <Text style={[styles.historyReadingValue, { color: roleColor }]}>{Number(litres).toLocaleString()} L</Text>
                                </View>
                                <Text style={[styles.historyChange, { color: change === null ? colors.textMuted : change < 0 ? colors.error : colors.success }]}>
                                  {change === null ? 'First reading' : `${change >= 0 ? '+' : ''}${change.toLocaleString()} L vs prior`}
                                </Text>
                              </View>
                            );
                          })}
                          {Object.entries(dip.lpg).filter(([tankId]) => visibleLpgTankIds.has(tankId)).map(([tankId, kg]) => {
                            const tank = lpgTanks.find(item => item.id === tankId);
                            const previous = group.dips.find(candidate =>
                              candidate.id !== dip.id
                              && new Date(candidate.approvedDt ?? candidate.dt).getTime() < dipTime
                              && candidate.lpg[tankId] !== undefined
                            );
                            const change = previous ? Number(kg) - Number(previous.lpg[tankId]) : null;
                            return (
                              <View key={tankId} style={[styles.dipHistoryReading, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.historyMeta, { color: colors.textMuted }]}>{tank?.name ?? tankId}</Text>
                                  <Text style={[styles.historyReadingValue, { color: colors.teal }]}>{Number(kg).toLocaleString()} kg</Text>
                                </View>
                                <Text style={[styles.historyChange, { color: change === null ? colors.textMuted : change < 0 ? colors.error : colors.success }]}>
                                  {change === null ? 'First reading' : `${change >= 0 ? '+' : ''}${change.toLocaleString()} kg vs prior`}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                        {dip.obs ? <Text style={[styles.historyBreakdown, { color: colors.warning }]}>⚠ {dip.obs}</Text> : null}
                        <Text style={[styles.historyMeta, { color: colors.textMuted, marginTop: 8 }]}>Approved by {dip.approvedBy ?? '—'}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}
              <View style={{ height: 16 }} />
            </ScrollView>
          )}

          {/* Inventory */}
          {dipSubTab === 2 && (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
              <View style={[styles.inventorySummary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.inventorySummaryHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inventorySummaryTitle, { color: colors.text }]}>Stock Snapshot</Text>
                    <Text style={[styles.inventorySummarySub, { color: colors.textMuted }]}>Live Book Stock + Variance</Text>
                  </View>
                  <View style={[styles.inventorySummaryIcon, { backgroundColor: colors.primary + '18' }]}>
                    <Ionicons name="analytics-outline" size={20} color={colors.primary} />
                  </View>
                </View>
                <View style={[styles.stockSnapshotIntro, { backgroundColor: colors.infoBg, borderColor: colors.info + '30' }]}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.info} />
                  <Text style={[styles.stockSnapshotIntroText, { color: colors.textMuted }]}>
                    Live inputs: carried-forward book stock + submitted/approved deliveries − submitted shift-report sales versus the latest submitted tank dip.
                  </Text>
                </View>
              </View>

              {stockSnapshotBranches.length === 0 && (
                <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 12 }]}>
                  <Ionicons name="analytics-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.noBannerText, { color: colors.textMuted }]}>No stock snapshot branches are configured yet.</Text>
                </View>
              )}
              {stockSnapshotBranches.map(snapshotBranch => (
                <View key={snapshotBranch.branchId} style={[styles.stockSnapshotBranch, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.stockSnapshotBranchHeader, { borderBottomColor: colors.border }]}>
                    <Ionicons name="business-outline" size={14} color={roleColor} />
                    <Text style={[styles.stockSnapshotBranchName, { color: colors.text }]}>{snapshotBranch.branchName}</Text>
                  </View>
                  {snapshotBranch.products.map(snapshot => {
                    const statusColor = snapshot.startupStock === null
                      ? colors.amber
                      : snapshot.variance === null
                        ? colors.textMuted
                        : snapshot.variance < 0 ? colors.error : colors.success;
                    const statusLabel = snapshot.startupStock === null
                      ? 'Awaiting baseline'
                      : snapshot.variance === null
                        ? 'Awaiting dip'
                        : snapshot.variance < 0 ? 'Shortage' : snapshot.variance > 0 ? 'Excess' : 'Balanced';
                    return (
                      <View key={snapshot.product} style={[styles.stockSnapshotRow, { borderTopColor: colors.border }]}>
                        <View style={styles.stockSnapshotRowHeader}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.stockSnapshotProduct, { color: colors.text }]}>{snapshot.product}</Text>
                            {stockSnapshotConfig.metrics.bookStock ? (
                              <Text style={[styles.stockSnapshotFormula, { color: colors.textMuted }]} numberOfLines={1}>
                                Book stock = carried-forward + delivered − sold: {formatStockQuantity(snapshot.bookStock)} {snapshot.unit}
                              </Text>
                            ) : null}
                          </View>
                          {stockSnapshotConfig.metrics.variance ? (
                            <View style={[styles.stockSnapshotStatus, { backgroundColor: statusColor + '18' }]}>
                              <View style={[styles.stockSnapshotStatusDot, { backgroundColor: statusColor }]} />
                              <Text style={[styles.stockSnapshotStatusText, { color: statusColor }]}>{statusLabel}</Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={styles.stockSnapshotValues}>
                          {stockSnapshotConfig.metrics.startupStock ? (
                            <View style={styles.stockSnapshotValue}>
                              <Text style={[styles.stockSnapshotValueLabel, { color: colors.textSubtle }]}>Seed qty.</Text>
                              <Text style={[styles.stockSnapshotValueText, { color: colors.text }]}>
                                {formatStockQuantity(snapshot.startupStock)} {snapshot.unit}
                              </Text>
                            </View>
                          ) : null}
                          {stockSnapshotConfig.metrics.deliveries ? (
                            <View style={styles.stockSnapshotValue}>
                              <Text style={[styles.stockSnapshotValueLabel, { color: colors.textSubtle }]}>Delivered qty.</Text>
                              <Text style={[styles.stockSnapshotValueText, { color: colors.text }]}>
                                {formatStockQuantity(snapshot.deliveries)} {snapshot.unit}
                              </Text>
                            </View>
                          ) : null}
                          {stockSnapshotConfig.metrics.sales ? (
                            <View style={styles.stockSnapshotValue}>
                              <Text style={[styles.stockSnapshotValueLabel, { color: colors.textSubtle }]}>Qty sold</Text>
                              <Text style={[styles.stockSnapshotValueText, { color: colors.text }]}>
                                {formatStockQuantity(snapshot.sales)} {snapshot.unit}
                              </Text>
                            </View>
                          ) : null}
                          {stockSnapshotConfig.metrics.submittedTankDip ? (
                            <View style={styles.stockSnapshotValue}>
                              <Text style={[styles.stockSnapshotValueLabel, { color: colors.textSubtle }]}>Tank dip qty.</Text>
                              <Text style={[styles.stockSnapshotValueText, { color: colors.text }]}>
                                {formatStockQuantity(snapshot.submittedTankDip)} {snapshot.unit}
                              </Text>
                            </View>
                          ) : null}
                          {stockSnapshotConfig.metrics.variance ? (
                            <View style={[styles.stockSnapshotValue, styles.stockSnapshotVarianceValue]}>
                              <Text style={[styles.stockSnapshotValueLabel, { color: colors.textSubtle }]}>Variance</Text>
                              <Text style={[styles.stockSnapshotValueText, { color: statusColor }]}>
                                {snapshot.variance === null ? '—' : `${snapshot.variance > 0 ? '+' : ''}${formatStockQuantity(snapshot.variance)} ${snapshot.unit}`}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
              <View style={{ height: 16 }} />
            </ScrollView>
          )}
        </>
      )}

    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  topTabBar:   { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  topTabBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderBottomWidth: 2 },
  topTabLabel: { fontSize: 12 },
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

  invCard:      { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  invHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  invName:      { fontSize: 14, fontWeight: '700' },
  invProd:      { fontSize: 11, marginTop: 2 },
  progressBg:   { height: 7, borderRadius: 4, overflow: 'hidden' },
  progressBar:  { height: '100%', borderRadius: 4 },
  invStats:     { flexDirection: 'row' },
  invStat:      { flex: 1, alignItems: 'center' },
  invStatVal:   { fontSize: 16, fontWeight: '700' },
  invStatLabel: { fontSize: 10, marginTop: 2 },
  inventorySummary: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 14 },
  inventorySummaryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  inventorySummaryTitle: { fontSize: 15, fontWeight: '700' },
  inventorySummarySub: { fontSize: 11, marginTop: 2 },
  inventorySummaryIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  inventoryMetricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inventoryMetric: { width: '47%', padding: 10, borderRadius: 10, backgroundColor: 'rgba(127, 127, 127, 0.08)' },
  inventoryMetricValue: { fontSize: 18, fontWeight: '800' },
  inventoryMetricLabel: { fontSize: 10, marginTop: 2 },
  inventoryMetricCapacity: { fontSize: 9, marginTop: 4 },
  branchStockCard: { padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  branchStockHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  branchStockTitle: { fontSize: 14, fontWeight: '800' },
  inventoryUnitNote: { fontSize: 10, marginTop: 10 },
  stockSnapshotIntro: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11, borderWidth: 1 },
  stockSnapshotIntroText: { flex: 1, fontSize: 10, fontWeight: '600' },
  stockSnapshotBranch: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginTop: 12 },
  stockSnapshotBranchHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  stockSnapshotBranchName: { fontSize: 13, fontWeight: '800' },
  stockSnapshotRow: { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  stockSnapshotRowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stockSnapshotProduct: { fontSize: 12, fontWeight: '800' },
  stockSnapshotFormula: { fontSize: 9, marginTop: 3 },
  stockSnapshotStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99 },
  stockSnapshotStatusDot: { width: 6, height: 6, borderRadius: 3 },
  stockSnapshotStatusText: { fontSize: 9, fontWeight: '800' },
  stockSnapshotValues: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  stockSnapshotValue: { width: '48%', minWidth: 0 },
  stockSnapshotVarianceValue: { width: '100%', alignItems: 'flex-start' },
  stockSnapshotValueLabel: { fontSize: 9, fontWeight: '600' },
  stockSnapshotValueText: { fontSize: 11, fontWeight: '800', marginTop: 3 },
  historyHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8, marginBottom: 10 },
  historySubtitle: { fontSize: 10 },
  branchHistoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 4, marginBottom: 8 },
  branchHistoryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  branchHistoryName: { fontSize: 13, fontWeight: '800' },
  branchHistoryCount: { fontSize: 10, fontWeight: '600' },
  historyToggle: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, padding: 2 },
  historyToggleBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  historyToggleText: { fontSize: 10, fontWeight: '700' },
  historyCard: { padding: 12, borderRadius: 12, borderWidth: 1.5, marginBottom: 8 },
  historyCardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  historyTankName: { fontSize: 13, fontWeight: '700' },
  historyMeta: { fontSize: 10, marginTop: 2 },
  historyStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  historyStatusText: { fontSize: 10, fontWeight: '700' },
  historyGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 9, gap: 8 },
  historyCell: { width: '22%' },
  historyCellLabel: { fontSize: 9 },
  historyCellValue: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  historyBreakdown: { fontSize: 10, marginTop: 9 },
  currentLevelRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  currentLevelValue: { fontSize: 14, fontWeight: '800' },
  dipHistoryReadingList: { gap: 6, marginTop: 10 },
  dipHistoryReading: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9, borderRadius: 9, borderWidth: 1 },
  historyReadingValue: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  historyChange: { fontSize: 10, fontWeight: '700', textAlign: 'right' },

});
