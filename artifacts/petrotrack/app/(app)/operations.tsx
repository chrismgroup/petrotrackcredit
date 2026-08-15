import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { AppliedDateField } from '@/components/AppliedDateField';
import {
  DEFAULT_MGR_PERMS, getCurrentTankStock, ROLE_COLORS, fmtDate, fmtDateTime, unitForProd, useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const DIP_SUBTABS_MGR  = ['Dip Form', 'Awaiting Approval', 'History'];
const DIP_SUBTABS_APPR = ['Awaiting Approval', 'History'];
const STATUS_LABELS: Record<string, string> = { ok: 'OK', short: 'Short', spill: 'Spill', seal: 'Seal Broken' };
const STATUS_COLORS: Record<string, string> = { ok: '#27500A', short: '#BA7517', spill: '#A32D2D', seal: '#4527a0' };
const DIP_STATUS_COLOR: Record<string, string> = { pending: '#BA7517', approved: '#1a6e3c', rejected: '#A32D2D' };
const DIP_STATUS_LABEL: Record<string, string> = { pending: 'Pending Approval', approved: 'Approved', rejected: 'Rejected' };
const DIP_STATUS_ICON: Record<string, string>  = { pending: 'time', approved: 'checkmark-circle', rejected: 'close-circle' };
const STOCK_PRODUCTS = ['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil'] as const;
type StockProduct = typeof STOCK_PRODUCTS[number];
type TopTab = 'dip';

export default function OperationsScreen() {
  const {
    role, userName, branchId, branches, mgrPerms,
    tanks, lpgTanks, dips, inventoryLog,
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
  // MD/Admin start on Approvals (content index 1); mgr starts on Dip Form (index 0)
  const [dipSubTab, setDipSubTab]     = useState(
    params.tab === 'inventory' ? 2 : params.tab === 'dip-history' ? 3 : canApprove ? 1 : 0
  );
  const [readings, setReadings]       = useState<Record<string, string>>({});
  const [lpgReadings, setLpgReadings] = useState<Record<string, string>>({});
  const [obs, setObs]                 = useState('');
  const [appliesOn, setAppliesOn]     = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'variance'>('all');
  const [historyDate, setHistoryDate] = useState('');

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
    const rd: Record<string, number> = {};
    const lpg: Record<string, number> = {};
    for (const t of visibleTanks)    { rd[t.id]  = parseFloat(readings[t.id]    || '0') || 0; }
    for (const l of visibleLpgTanks) { lpg[l.id] = parseFloat(lpgReadings[l.id] || '0') || 0; }
    addDip({ dt: appliesOn, by: userName, rd, lpg, obs, status: 'pending' });
    setReadings({}); setLpgReadings({}); setObs(''); setAppliesOn('');
    Alert.alert('Dip Submitted', 'Tank readings recorded successfully.');
  }


  const visibleInventoryLog = inventoryLog
    .filter(entry => !branchId || !entry.branchId || entry.branchId === branchId)
    .sort((a, b) => new Date(b.dt).getTime() - new Date(a.dt).getTime());
  const filteredInventoryLog = visibleInventoryLog
    .filter(entry => !historyDate || dips.find(dip => dip.id === entry.dipId)?.dt.slice(0, 10) === historyDate)
    .filter(entry => historyFilter === 'variance' ? Math.abs(entry.discrepancy) > 50 : true);
  const varianceCount = visibleInventoryLog.filter(entry => Math.abs(entry.discrepancy) > 50).length;
  const branchStockGroups = (() => {
    const unassignedAssets = tanks.some(tank => !tank.branchId) || lpgTanks.some(tank => !tank.branchId);
    const scopes: { id?: string; name: string }[] = canSeeAllTanks
      ? [
          ...branches.map(branch => ({ id: branch.id, name: branch.name })),
          ...(unassignedAssets ? [{ name: 'Unassigned assets' }] : []),
        ]
      : [{
          id: branchId ?? undefined,
          name: branches.find(branch => branch.id === branchId)?.name ?? 'My branch',
        }];

    const assetBelongsToScope = (asset: { branchId?: string }, scopeId?: string) =>
      scopeId ? asset.branchId === scopeId : !asset.branchId;

    return scopes.map(scope => {
      const scopeTanks = tanks.filter(tank => assetBelongsToScope(tank, scope.id));
      const scopeLpgTanks = lpgTanks.filter(tank => assetBelongsToScope(tank, scope.id));
      const products = STOCK_PRODUCTS.map((product: StockProduct) => {
        const productTanks = product === 'LPG'
          ? scopeLpgTanks
          : scopeTanks.filter(tank => tank.prod === product);
        const capacity = productTanks.reduce((sum, tank) => sum + tank.cap, 0);
        const stock = productTanks.reduce(
          (sum, tank) => sum + getCurrentTankStock(tank, dips, product === 'LPG' ? 'lpg' : 'petrol'),
          0,
        );
        return {
          product,
          capacity,
          stock,
          fill: capacity > 0 ? Math.round((stock / capacity) * 100) : 0,
        };
      });
      return { ...scope, products, hasAssets: scopeTanks.length > 0 || scopeLpgTanks.length > 0 };
    }).filter(group => group.hasAssets || !canSeeAllTanks);
  })();
  const pendingDips = dips.filter(dip => dip.status === 'pending' && dipHasVisibleReading(dip));
  const approvedDips = dips
    .filter(dip => dip.status === 'approved' && dipHasVisibleReading(dip))
    .sort((a, b) => new Date(b.approvedDt ?? b.dt).getTime() - new Date(a.approvedDt ?? a.dt).getTime());

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
            // MD/Admin see the awaiting-approval queue; managers see the Dip Form.
            const dipTabItems = (canApprove ? DIP_SUBTABS_APPR : DIP_SUBTABS_MGR).map(
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

              <Text style={[styles.sectionTitle, { color: colors.text }]}>Product quantities by branch</Text>
              {branchStockGroups.length === 0 ? (
                <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="business-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.noBannerText, { color: colors.textMuted }]}>No branch fuel tanks are configured yet.</Text>
                </View>
              ) : branchStockGroups.map(group => (
                <View key={group.id ?? 'unassigned'} style={[styles.branchStockCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.branchStockHeader}>
                    <Ionicons name="business-outline" size={16} color={roleColor} />
                    <Text style={[styles.branchStockTitle, { color: colors.text }]}>{group.name}</Text>
                  </View>
                  <View style={styles.inventoryMetricGrid}>
                    {group.products.map(({ product, stock, capacity }) => {
                      const isLpg = product === 'LPG';
                      return (
                        <View key={product} style={styles.inventoryMetric}>
                          <Text style={[styles.inventoryMetricValue, { color: isLpg ? colors.teal : colors.text }]}>
                            {stock.toLocaleString()} {unitForProd(product)}
                          </Text>
                          <Text style={[styles.inventoryMetricLabel, { color: colors.textMuted }]}>{product} stock</Text>
                          <Text style={[styles.inventoryMetricCapacity, { color: colors.textSubtle }]}>
                            Capacity: {capacity.toLocaleString()} {unitForProd(product)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}

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
              ) : approvedDips.map(dip => {
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
                        const previous = approvedDips.find(candidate =>
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
                        const previous = approvedDips.find(candidate =>
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
              <View style={{ height: 16 }} />
            </ScrollView>
          )}

          {/* Inventory */}
          {dipSubTab === 2 && (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
              <View style={[styles.inventorySummary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.inventorySummaryHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inventorySummaryTitle, { color: colors.text }]}>Current stock overview</Text>
                    <Text style={[styles.inventorySummarySub, { color: colors.textMuted }]}>Live balance across your visible tanks</Text>
                  </View>
                  <View style={[styles.inventorySummaryIcon, { backgroundColor: colors.primary + '18' }]}>
                    <Ionicons name="analytics-outline" size={20} color={colors.primary} />
                  </View>
                </View>
                <View style={styles.inventoryMetricGrid}>
                  <View style={styles.inventoryMetric}>
                    <Text style={[styles.inventoryMetricValue, { color: varianceCount > 0 ? colors.error : colors.success }]}>{visibleInventoryLog.length} / {varianceCount}</Text>
                    <Text style={[styles.inventoryMetricLabel, { color: colors.textMuted }]}>Checks / flags</Text>
                  </View>
                </View>
                <Text style={[styles.inventoryUnitNote, { color: colors.textMuted }]}>
                  Petroleum is measured in litres; LPG is measured in kilograms.
                </Text>
              </View>

              {visibleTanks.length === 0 && visibleLpgTanks.length === 0 && (
                <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 12 }]}>
                  <Ionicons name="cube-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.noBannerText, { color: colors.textMuted }]}>No tanks found. Add tanks in System Settings.</Text>
                </View>
              )}
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Product quantities by branch</Text>
              {branchStockGroups.length === 0 ? (
                <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="business-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.noBannerText, { color: colors.textMuted }]}>No branch fuel tanks are configured yet.</Text>
                </View>
              ) : branchStockGroups.map(group => (
                <View key={group.id ?? 'unassigned'} style={[styles.branchStockCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.branchStockHeader}>
                    <Ionicons name="business-outline" size={16} color={roleColor} />
                    <Text style={[styles.branchStockTitle, { color: colors.text }]}>{group.name}</Text>
                  </View>
                  <View style={styles.inventoryMetricGrid}>
                    {group.products.map(({ product, stock, capacity, fill }) => {
                      const pct = Math.max(0, Math.min(100, fill));
                      const isLpg = product === 'LPG';
                      const barCol = pct < 30 ? colors.error : pct < 60 ? (isLpg ? colors.amber : colors.primary) : (isLpg ? colors.teal : colors.success);
                      return (
                        <View key={product} style={styles.inventoryMetric}>
                          <Text style={[styles.inventoryMetricValue, { color: isLpg ? colors.teal : colors.text }]}>
                            {stock.toLocaleString()} {unitForProd(product)}
                          </Text>
                          <Text style={[styles.inventoryMetricLabel, { color: colors.textMuted }]}>{product} stock</Text>
                          <Text style={[styles.inventoryMetricCapacity, { color: colors.textSubtle }]}>
                            Capacity: {capacity.toLocaleString()} {unitForProd(product)}
                          </Text>
                          <View style={[styles.progressBg, { backgroundColor: colors.border, marginTop: 7 }]}>
                            <View style={[styles.progressBar, { width: `${pct}%` as any, backgroundColor: barCol }]} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}

              <View style={styles.historyHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 2 }]}>Historical inventory log</Text>
                  <Text style={[styles.historySubtitle, { color: colors.textMuted }]}>Branch-scoped physical checks compared with expected stock</Text>
                </View>
                <View style={[styles.historyToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {(['all', 'variance'] as const).map(filter => (
                    <TouchableOpacity
                      key={filter}
                      onPress={() => setHistoryFilter(filter)}
                      style={[styles.historyToggleBtn, historyFilter === filter && { backgroundColor: colors.primary }]}
                    >
                      <Text style={[styles.historyToggleText, { color: historyFilter === filter ? '#fff' : colors.textMuted }]}>
                        {filter === 'all' ? 'All' : 'Flags'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <AppliedDateField
                value={historyDate}
                onChange={setHistoryDate}
                label="View approved checks for a date"
                accent={roleColor}
                helper="Filter by the date the tank dip applies to."
              />

              {filteredInventoryLog.length === 0 ? (
                <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name={historyFilter === 'variance' ? 'checkmark-circle-outline' : 'time-outline'} size={16} color={colors.textMuted} />
                  <Text style={[styles.noBannerText, { color: colors.textMuted }]}>
                    {historyFilter === 'variance'
                      ? 'No material stock variances found.'
                      : 'No approved inventory checks yet. History will appear after a tank dip is approved.'}
                  </Text>
                </View>
              ) : (
                filteredInventoryLog.slice(0, 50).map(entry => {
                  const previous = visibleInventoryLog.find(candidate =>
                    candidate.tankId === entry.tankId
                    && new Date(candidate.dt).getTime() < new Date(entry.dt).getTime()
                  );
                  const unit = unitForProd(entry.product);
                  const change = previous ? entry.actual - previous.actual : null;
                  const hasVariance = Math.abs(entry.discrepancy) > 50;
                  const varianceColor = entry.discrepancy < 0 ? colors.error : entry.discrepancy > 0 ? colors.warning : colors.success;
                  return (
                    <View key={entry.id} style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: hasVariance ? varianceColor : colors.border }]}>
                      <View style={styles.historyCardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.historyTankName, { color: colors.text }]}>{entry.tankName}</Text>
                          <Text style={[styles.historyMeta, { color: colors.textMuted }]}>{entry.product} · {fmtDateTime(entry.dt)}</Text>
                          <Text style={[styles.historyMeta, { color: colors.textMuted }]}>Approved by {entry.approvedBy}</Text>
                        </View>
                        <View style={[styles.historyStatus, { backgroundColor: hasVariance ? varianceColor + '18' : colors.success + '18' }]}>
                          <Ionicons name={hasVariance ? 'warning-outline' : 'checkmark-circle-outline'} size={12} color={hasVariance ? varianceColor : colors.success} />
                          <Text style={[styles.historyStatusText, { color: hasVariance ? varianceColor : colors.success }]}>
                            {hasVariance ? (entry.discrepancy < 0 ? 'Shortage' : 'Overage') : 'Matched'}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.historyGrid, { borderTopColor: colors.border }]}>
                        <View style={styles.historyCell}>
                          <Text style={[styles.historyCellLabel, { color: colors.textMuted }]}>Expected</Text>
                          <Text style={[styles.historyCellValue, { color: colors.text }]}>{entry.expected.toLocaleString()}{unit}</Text>
                        </View>
                        <View style={styles.historyCell}>
                          <Text style={[styles.historyCellLabel, { color: colors.textMuted }]}>Actual</Text>
                          <Text style={[styles.historyCellValue, { color: colors.text }]}>{entry.actual.toLocaleString()}{unit}</Text>
                        </View>
                        <View style={styles.historyCell}>
                          <Text style={[styles.historyCellLabel, { color: colors.textMuted }]}>Variance</Text>
                          <Text style={[styles.historyCellValue, { color: varianceColor }]}>
                            {entry.discrepancy >= 0 ? '+' : ''}{entry.discrepancy.toLocaleString()}{unit}
                          </Text>
                        </View>
                        <View style={styles.historyCell}>
                          <Text style={[styles.historyCellLabel, { color: colors.textMuted }]}>Vs previous</Text>
                          <Text style={[styles.historyCellValue, { color: change === null ? colors.textMuted : change < 0 ? colors.error : colors.success }]}>
                            {change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toLocaleString()}${unit}`}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.historyBreakdown, { color: colors.textMuted }]}>
                        Opening {entry.opening.toLocaleString()}{unit} · Received +{entry.received.toLocaleString()}{unit} · Sold −{entry.sold.toLocaleString()}{unit}
                      </Text>
                    </View>
                  );
                })
              )}
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
  historyHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8, marginBottom: 10 },
  historySubtitle: { fontSize: 10 },
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
