import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import {
  DEFAULT_MGR_PERMS, ROLE_COLORS, fmt, fmtDate, fmtDateTime, useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const SHIFT_REPORT_LABEL: Record<string, string> = {
  pending_manager:    'Pending Manager',
  pending_accountant: 'Pending Accountant',
  returned:           'Returned',
  approved:           'Approved',
};
const SHIFT_REPORT_COLOR: Record<string, string> = {
  pending_manager:    '#BA7517',
  pending_accountant: '#185FA5',
  returned:           '#A32D2D',
  approved:           '#1a6e3c',
};

const DIP_SUBTABS_MGR  = ['Dip Form', 'Inventory'];
const DIP_SUBTABS_APPR = ['Approvals', 'Inventory'];
const STATUS_LABELS: Record<string, string> = { ok: 'OK', short: 'Short', spill: 'Spill', seal: 'Seal Broken' };
const STATUS_COLORS: Record<string, string> = { ok: '#27500A', short: '#BA7517', spill: '#A32D2D', seal: '#4527a0' };
const DIP_STATUS_COLOR: Record<string, string> = { pending: '#BA7517', approved: '#1a6e3c', rejected: '#A32D2D' };
const DIP_STATUS_LABEL: Record<string, string> = { pending: 'Pending Approval', approved: 'Approved', rejected: 'Rejected' };
const DIP_STATUS_ICON: Record<string, string>  = { pending: 'time', approved: 'checkmark-circle', rejected: 'close-circle' };
const PRI_COLORS: Record<string, { bg: string; fg: string }> = {
  Urgent: { bg: '#FCEBEB', fg: '#791F1F' },
  Medium: { bg: '#FAEEDA', fg: '#633806' },
  Low:    { bg: '#EAF3DE', fg: '#27500A' },
};

type TopTab = 'dip' | 'sales' | 'maint';

export default function OperationsScreen() {
  const {
    role, userName, branchId, mgrPerms,
    tanks, lpgTanks, dips,
    addDip, approveDip, rejectDip,
    prices,
    sales, pumpDailyReports,
    maintenance, addMaintenance,
  } = useApp();

  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;
  const isMgr      = role === 'mgr';
  const isMD       = role === 'md';
  const isAdmin    = role === 'admin';
  const isAtt      = role === 'att';
  const canApprove = isMD || isAdmin;

  const topTabs: { key: TopTab; label: string; icon: string }[] = [
    ...(isMgr || canApprove ? [{ key: 'dip' as TopTab, label: 'Tank Dip', icon: 'water-outline' }] : []),
    { key: 'sales', label: 'Sales',        icon: 'bar-chart-outline' },
    { key: 'maint', label: 'Maintenance',  icon: 'build-outline'     },
  ];

  const defaultTab: TopTab = (isMgr || canApprove) ? 'dip' : 'sales';
  const [topTab, setTopTab] = useState<TopTab>(defaultTab);

  // ── Dip state ────────────────────────────────────────────────────────────
  // MD/Admin start on Approvals (content index 1); mgr starts on Dip Form (index 0)
  const [dipSubTab, setDipSubTab]     = useState(canApprove ? 1 : 0);
  const [readings, setReadings]       = useState<Record<string, string>>({});
  const [lpgReadings, setLpgReadings] = useState<Record<string, string>>({});
  const [obs, setObs]                 = useState('');

  const perms           = isMgr ? (mgrPerms[branchId ?? ''] ?? DEFAULT_MGR_PERMS) : DEFAULT_MGR_PERMS;
  const inMyBranch = (t: { branchId?: string }) => !branchId || !t.branchId || t.branchId === branchId;
  const visibleTanks    = isMgr && !perms.canPetrolTanks ? [] : isMD ? tanks : tanks.filter(inMyBranch);
  const visibleLpgTanks = isMgr && !perms.canLpgTanks   ? [] : isMD ? lpgTanks : lpgTanks.filter(inMyBranch);
  const canDip          = isMgr;
  const hasPendingDip   = canDip && dips.some(d => d.by === userName && d.status === 'pending');

  function handleDipSubmit() {
    const rd: Record<string, number> = {};
    const lpg: Record<string, number> = {};
    for (const t of visibleTanks)    { rd[t.id]  = parseFloat(readings[t.id]    || '0') || 0; }
    for (const l of visibleLpgTanks) { lpg[l.id] = parseFloat(lpgReadings[l.id] || '0') || 0; }
    addDip({ dt: new Date().toISOString(), by: userName, rd, lpg, obs, status: 'pending' });
    setReadings({}); setLpgReadings({}); setObs('');
    Alert.alert('Dip Submitted', 'Tank readings recorded successfully.');
  }


  function stockPct(t: { op: number; sl: number; rv: number; cap: number }) {
    return Math.round(((t.op + t.rv - t.sl) / t.cap) * 100);
  }

  // ── Sales metrics (from approved shift reports via SalesEntry) ───────────
  const today      = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter(s =>
    s.dt.startsWith(today) &&
    (!isMgr || !branchId || !s.branchId || s.branchId === branchId)
  );
  const totalL     = todaySales.reduce((s, e) => s + e.L, 0);
  const totalAmt   = todaySales.reduce((s, e) => s + e.L * e.price, 0);
  const totalPOS   = todaySales.reduce((s, e) => s + (e.pos || 0), 0);
  const totalCash  = totalAmt - totalPOS;
  const pmsSales   = todaySales.filter(s => s.pump.includes('PMS'));
  const agoSales   = todaySales.filter(s => s.pump.includes('AGO'));
  const dkpSales   = todaySales.filter(s => s.pump.includes('DPK'));

  // ── Maintenance state ────────────────────────────────────────────────────
  const canMaint = isMgr || isAtt || role === 'csm' || role === 'admin';
  const [showMaintForm, setShowMaintForm] = useState(false);
  const [maintForm, setMaintForm]         = useState({ title: '', pri: 'Urgent' as 'Urgent' | 'Medium' | 'Low' });
  const openItems = maintenance.filter(m => m.st === 'Open');
  const doneItems = maintenance.filter(m => m.st === 'Done');

  function handleMaintSubmit() {
    if (!maintForm.title.trim()) { Alert.alert('Required', 'Please enter a description.'); return; }
    addMaintenance({ title: maintForm.title.trim(), pri: maintForm.pri, by: userName, date: new Date().toISOString().slice(0, 10), st: 'Open' });
    setMaintForm({ title: '', pri: 'Urgent' });
    setShowMaintForm(false);
    Alert.alert('Submitted', 'Maintenance request logged.');
  }

  return (
    <ScreenLayout title="Operations">

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
            // MD/Admin see [Approvals→1, Inventory→2]; Mgr sees [Dip Form→0, Inventory→2]
            const pendingCount = dips.filter(d => d.status === 'pending').length;
            const dipTabItems = (canApprove ? DIP_SUBTABS_APPR : DIP_SUBTABS_MGR).map(
              (label, vi) => ({
                label,
                contentIdx: canApprove ? vi + 1 : (vi === 0 ? 0 : 2),
              })
            );
            return (
              <View style={[styles.subTabBar, { borderBottomColor: colors.border }]}>
                {dipTabItems.map(({ label, contentIdx }) => {
                  const isActive   = contentIdx === dipSubTab;
                  const showBadge  = label === 'Approvals' && pendingCount > 0;
                  return (
                    <TouchableOpacity key={label} onPress={() => setDipSubTab(contentIdx)}
                      style={[styles.subTabBtn, { borderBottomColor: isActive ? roleColor : 'transparent' }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Text style={[styles.subTabLabel, { color: isActive ? roleColor : colors.textMuted, fontWeight: isActive ? '700' : '400' }]}>{label}</Text>
                        {showBadge && (
                          <View style={[styles.subTabBadge, { backgroundColor: '#BA7517' }]}>
                            <Text style={styles.subTabBadgeText}>{pendingCount}</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
                    <Text style={[styles.dipCapacity, { color: colors.textMuted }]}>Cap: {t.cap.toLocaleString()}L · Stock: {(t.op - t.sl).toLocaleString()}L</Text>
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
              {visibleLpgTanks.map(l => (
                <View key={l.id} style={[styles.dipCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.dipCardTitle, { color: colors.text }]}>{l.name}</Text>
                  <Text style={[styles.dipCapacity, { color: colors.textMuted }]}>Cap: {l.cap.toLocaleString()} kg</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                    placeholder="Fill percentage (0-100)"
                    placeholderTextColor={colors.textSubtle}
                    keyboardType="numeric"
                    value={lpgReadings[l.id] || ''}
                    onChangeText={v => setLpgReadings(r => ({ ...r, [l.id]: v }))}
                    editable={canDip}
                  />
                  {lpgReadings[l.id] ? <Text style={[styles.calcResult, { color: roleColor }]}>≈ {Math.round((parseFloat(lpgReadings[l.id] || '0') / 100) * l.cap).toLocaleString()} kg</Text> : null}
                </View>
              ))}

              <TextInput
                style={[styles.obsInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="Observations (anomalies, water sheen, etc.)"
                placeholderTextColor={colors.textSubtle}
                multiline numberOfLines={3}
                value={obs} onChangeText={setObs} editable={canDip}
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

          {/* ── Approvals (MD / Admin) ── */}
          {dipSubTab === 1 && (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
              {dips.filter(d => d.status === 'pending').length === 0 ? (
                <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 12 }]}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.noBannerText, { color: colors.textMuted }]}>No pending dip records. All caught up!</Text>
                </View>
              ) : (
                <>
                  <View style={[styles.mdBanner, { backgroundColor: '#BA751712', borderColor: '#BA751744' }]}>
                    <Ionicons name="time-outline" size={16} color="#BA7517" />
                    <Text style={[styles.mdBannerText, { color: '#BA7517' }]}>
                      {dips.filter(d => d.status === 'pending').length} dip record{dips.filter(d => d.status === 'pending').length > 1 ? 's' : ''} awaiting approval. Approving will update tank inventory.
                    </Text>
                  </View>
                  {dips.filter(d => d.status === 'pending').map(dip => (
                    <View key={dip.id} style={[styles.logCard, { backgroundColor: colors.surface, borderColor: '#BA751744', borderWidth: 1.5 }]}>
                      <View style={styles.logHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.logDate, { color: colors.text }]}>{fmtDateTime(dip.dt)}</Text>
                          <Text style={[styles.logBy, { color: colors.textMuted }]}>by {dip.by}</Text>
                        </View>
                        <View style={[styles.dipStatusBadge, { backgroundColor: '#BA751718' }]}>
                          <Ionicons name="time" size={11} color="#BA7517" />
                          <Text style={[styles.dipStatusText, { color: '#BA7517' }]}>Pending</Text>
                        </View>
                      </View>

                      {/* Tank readings */}
                      <View style={styles.readingsGrid}>
                        {Object.entries(dip.rd).map(([tid, litres]) => {
                          const tank = tanks.find(t => t.id === tid);
                          return (
                            <View key={tid} style={[styles.readingChip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                              <Text style={[styles.readingLabel, { color: colors.textMuted }]}>{tank?.name ?? tid}</Text>
                              <Text style={[styles.readingVal, { color: roleColor }]}>{Number(litres).toLocaleString()} L</Text>
                            </View>
                          );
                        })}
                        {Object.entries(dip.lpg).map(([lid, kg]) => {
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
                    </View>
                  ))}
                </>
              )}

              {/* Show all-time dip history below pending ones */}
              {dips.filter(d => d.status !== 'pending').length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 16 }]}>Dip History</Text>
                  {dips.filter(d => d.status !== 'pending').slice(0, 20).map(dip => {
                    const sc = DIP_STATUS_COLOR[dip.status] || '#888';
                    return (
                      <View key={dip.id} style={[styles.logCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={styles.logHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.logDate, { color: colors.text }]}>{fmtDateTime(dip.dt)}</Text>
                            <Text style={[styles.logBy, { color: colors.textMuted }]}>by {dip.by}</Text>
                          </View>
                          <View style={[styles.dipStatusBadge, { backgroundColor: sc + '18' }]}>
                            <Ionicons name={DIP_STATUS_ICON[dip.status] as any} size={11} color={sc} />
                            <Text style={[styles.dipStatusText, { color: sc }]}>{DIP_STATUS_LABEL[dip.status]}</Text>
                          </View>
                        </View>
                        <View style={styles.readingsGrid}>
                          {Object.entries(dip.rd).map(([tid, litres]) => {
                            const tank = tanks.find(t => t.id === tid);
                            return (
                              <View key={tid} style={[styles.readingChip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                <Text style={[styles.readingLabel, { color: colors.textMuted }]}>{tank?.name ?? tid}</Text>
                                <Text style={[styles.readingVal, { color: roleColor }]}>{Number(litres).toLocaleString()} L</Text>
                              </View>
                            );
                          })}
                        </View>
                        {dip.approvedBy && (
                          <Text style={[styles.approvedByText, { color: colors.textMuted }]}>
                            {dip.status === 'approved' ? '✓' : '✗'} {dip.approvedBy} · {dip.approvedDt ? fmtDateTime(dip.approvedDt) : ''}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </>
              )}
              <View style={{ height: 16 }} />
            </ScrollView>
          )}

          {/* Inventory */}
          {dipSubTab === 2 && (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
              {visibleTanks.length === 0 && visibleLpgTanks.length === 0 && (
                <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 12 }]}>
                  <Ionicons name="cube-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.noBannerText, { color: colors.textMuted }]}>No tanks found. Add tanks in System Settings.</Text>
                </View>
              )}
              {visibleTanks.length > 0 && <Text style={[styles.sectionTitle, { color: colors.text }]}>Petroleum Tanks</Text>}
              {visibleTanks.map(t => {
                const stock = t.op + t.rv - t.sl;
                const pct   = stockPct(t);
                const barCol = pct < 30 ? colors.error : pct < 60 ? colors.amber : colors.primary;
                return (
                  <View key={t.id} style={[styles.invCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.invHeader}>
                      <View>
                        <Text style={[styles.invName, { color: colors.text }]}>{t.name}</Text>
                        <Text style={[styles.invProd, { color: colors.textMuted }]}>Capacity: {t.cap.toLocaleString()}L</Text>
                      </View>
                      <View style={[styles.prodBadge, { backgroundColor: roleColor + '18' }]}>
                        <Text style={[styles.prodBadgeText, { color: roleColor }]}>{t.prod}</Text>
                      </View>
                    </View>
                    <View style={[styles.progressBg, { backgroundColor: colors.border, marginVertical: 10 }]}>
                      <View style={[styles.progressBar, { width: `${pct}%` as any, backgroundColor: barCol }]} />
                    </View>
                    <View style={styles.invStats}>
                      <View style={styles.invStat}>
                        <Text style={[styles.invStatVal, { color: colors.text }]}>{stock.toLocaleString()}L</Text>
                        <Text style={[styles.invStatLabel, { color: colors.textMuted }]}>Current Stock</Text>
                      </View>
                      <View style={styles.invStat}>
                        <Text style={[styles.invStatVal, { color: barCol }]}>{pct}%</Text>
                        <Text style={[styles.invStatLabel, { color: colors.textMuted }]}>Fill Level</Text>
                      </View>
                      <View style={styles.invStat}>
                        <Text style={[styles.invStatVal, { color: colors.text }]}>{t.sl.toLocaleString()}L</Text>
                        <Text style={[styles.invStatLabel, { color: colors.textMuted }]}>Today Sales</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              {visibleLpgTanks.length > 0 && <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 8 }]}>LPG Tanks</Text>}
              {visibleLpgTanks.map(l => {
                const stock  = l.op + l.rv - l.sl;
                const pct    = Math.max(0, Math.min(100, Math.round((stock / l.cap) * 100)));
                const barCol = pct < 30 ? colors.error : pct < 60 ? colors.amber : colors.teal;
                return (
                  <View key={l.id} style={[styles.invCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.invHeader}>
                      <View>
                        <Text style={[styles.invName, { color: colors.text }]}>{l.name}</Text>
                        <Text style={[styles.invProd, { color: colors.textMuted }]}>Capacity: {l.cap.toLocaleString()} kg</Text>
                      </View>
                      <View style={[styles.prodBadge, { backgroundColor: colors.teal + '18' }]}>
                        <Text style={[styles.prodBadgeText, { color: colors.teal }]}>LPG</Text>
                      </View>
                    </View>
                    <View style={[styles.progressBg, { backgroundColor: colors.border, marginVertical: 10 }]}>
                      <View style={[styles.progressBar, { width: `${pct}%` as any, backgroundColor: barCol }]} />
                    </View>
                    <View style={styles.invStats}>
                      <View style={styles.invStat}>
                        <Text style={[styles.invStatVal, { color: barCol }]}>{pct}%</Text>
                        <Text style={[styles.invStatLabel, { color: colors.textMuted }]}>Fill Level</Text>
                      </View>
                      <View style={styles.invStat}>
                        <Text style={[styles.invStatVal, { color: colors.text }]}>{Math.round(pct / 100 * l.cap).toLocaleString()} kg</Text>
                        <Text style={[styles.invStatLabel, { color: colors.textMuted }]}>Current Stock</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              <View style={{ height: 16 }} />
            </ScrollView>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ SALES ══ */}
      {topTab === 'sales' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, { backgroundColor: roleColor + '12', borderColor: roleColor + '33' }]}>
              <Text style={[styles.metricValue, { color: roleColor }]}>{fmt(totalAmt)}</Text>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Today's Revenue</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.metricValue, { color: colors.text }]}>{totalL.toLocaleString()} L</Text>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Volume Sold</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.metricValue, { color: colors.text }]}>{todaySales.length}</Text>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Entries</Text>
            </View>
          </View>

          {totalPOS > 0 && (
            <View style={[styles.cashPosCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cashPosTitle, { color: colors.text }]}>Payment Breakdown</Text>
              <View style={styles.cashPosRow}>
                <View style={[styles.cashPosItem, { backgroundColor: '#27500A12', borderColor: '#27500A33' }]}>
                  <Ionicons name="cash-outline" size={16} color="#27500A" />
                  <Text style={[styles.cashPosValue, { color: '#27500A' }]}>{fmt(totalCash)}</Text>
                  <Text style={[styles.cashPosLabel, { color: colors.textMuted }]}>Cash</Text>
                </View>
                <View style={[styles.cashPosItem, { backgroundColor: '#185FA512', borderColor: '#185FA533' }]}>
                  <Ionicons name="card-outline" size={16} color="#185FA5" />
                  <Text style={[styles.cashPosValue, { color: '#185FA5' }]}>{fmt(totalPOS)}</Text>
                  <Text style={[styles.cashPosLabel, { color: colors.textMuted }]}>POS / Transfer</Text>
                </View>
              </View>
              <View style={[styles.posBar, { backgroundColor: colors.border }]}>
                <View style={[styles.posBarCash, { flex: totalCash, backgroundColor: '#27500A' }]} />
                <View style={[styles.posBarPos, { flex: totalPOS, backgroundColor: '#185FA5' }]} />
              </View>
              <Text style={[styles.posBarLabel, { color: colors.textSubtle }]}>
                Cash {totalAmt > 0 ? Math.round((totalCash / totalAmt) * 100) : 0}% · POS {totalAmt > 0 ? Math.round((totalPOS / totalAmt) * 100) : 0}%
              </Text>
            </View>
          )}

          <View style={styles.prodRowSales}>
            {[
              { label: 'PMS', L: pmsSales.reduce((s, e) => s + e.L, 0), color: colors.primary },
              { label: 'AGO', L: agoSales.reduce((s, e) => s + e.L, 0), color: colors.blue   },
              { label: 'DPK', L: dkpSales.reduce((s, e) => s + e.L, 0), color: colors.amber  },
            ].map(p => (
              <View key={p.label} style={[styles.prodCardSales, { backgroundColor: p.color + '12', borderColor: p.color + '33' }]}>
                <Text style={[styles.prodLabelSales, { color: p.color }]}>{p.label}</Text>
                <Text style={[styles.prodLSales, { color: colors.text }]}>{p.L.toLocaleString()}L</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 8 }]}>Shift Reports</Text>
          {[...pumpDailyReports]
            .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
            .map(r => {
              const sc         = SHIFT_REPORT_COLOR[r.status] || '#888';
              const isApproved = r.status === 'approved';
              const isReturned = r.status === 'returned';
              return (
                <View key={r.id} style={[styles.logCard, { backgroundColor: colors.surface, borderColor: isApproved ? sc + '55' : colors.border, borderWidth: isApproved ? 1.5 : 1 }]}>
                  <View style={styles.logHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.logDate, { color: colors.text }]}>{r.pumpName}</Text>
                      <Text style={[styles.logBy, { color: colors.textMuted }]}>by {r.submittedByName} · {fmtDateTime(r.submittedAt)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={[styles.shiftStatusBadge, { backgroundColor: sc + '18' }]}>
                        <Text style={[styles.shiftStatusText, { color: sc }]}>{SHIFT_REPORT_LABEL[r.status]}</Text>
                      </View>
                      {isApproved && (
                        <Text style={[styles.saleAmt, { color: roleColor }]}>{fmt(r.grossAmount)}</Text>
                      )}
                    </View>
                  </View>
                  {isApproved && (
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <View style={[styles.posChip, { backgroundColor: '#27500A12', borderColor: '#27500A30' }]}>
                        <Ionicons name="water-outline" size={11} color="#27500A" />
                        <Text style={[styles.posChipText, { color: '#27500A' }]}>{r.liters.toLocaleString()}L</Text>
                      </View>
                      <View style={[styles.posChip, { backgroundColor: '#185FA512', borderColor: '#185FA530' }]}>
                        <Ionicons name="cash-outline" size={11} color="#185FA5" />
                        <Text style={[styles.posChipText, { color: '#185FA5' }]}>Cash {fmt(r.cashAmount)}</Text>
                      </View>
                      {r.posAmount > 0 && (
                        <View style={[styles.posChip, { backgroundColor: '#4527a012', borderColor: '#4527a030' }]}>
                          <Ionicons name="card-outline" size={11} color="#4527a0" />
                          <Text style={[styles.posChipText, { color: '#4527a0' }]}>POS {fmt(r.posAmount)}</Text>
                        </View>
                      )}
                    </View>
                  )}
                  {isReturned && r.rejectionReason && (
                    <View style={[{ marginTop: 6, padding: 6, borderRadius: 7, backgroundColor: '#A32D2D0F', borderWidth: 1, borderColor: '#A32D2D33' }]}>
                      <Text style={[styles.posChipText, { color: '#A32D2D' }]}>⚠ {r.rejectionReason}</Text>
                    </View>
                  )}
                </View>
              );
            })
          }
          {pumpDailyReports.length === 0 && (
            <View style={[styles.logCard, { backgroundColor: colors.surface, borderColor: colors.border, alignItems: 'center', padding: 24 }]}>
              <Text style={[styles.logBy, { color: colors.textMuted }]}>No shift reports yet</Text>
            </View>
          )}
          <View style={{ height: 16 }} />
        </ScrollView>
      )}

      {/* ══════════════════════════════════════════════════ MAINTENANCE ══ */}
      {topTab === 'maint' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          {canMaint && (
            <TouchableOpacity onPress={() => setShowMaintForm(v => !v)}
              style={[styles.addOutlineBtn, { borderColor: roleColor, marginBottom: showMaintForm ? 0 : 12 }]}>
              <Ionicons name={showMaintForm ? 'close' : 'add'} size={17} color={roleColor} />
              <Text style={[styles.addOutlineBtnText, { color: roleColor }]}>{showMaintForm ? 'Cancel' : 'New Maintenance Request'}</Text>
            </TouchableOpacity>
          )}
          {showMaintForm && canMaint && (
            <View style={[styles.dipCard, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 12 }]}>
              <Text style={[styles.formSectionTitle, { color: colors.text }]}>New Maintenance Request</Text>
              <TextInput
                style={[styles.obsInput, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder="Describe the issue..."
                placeholderTextColor={colors.textSubtle}
                multiline numberOfLines={3}
                value={maintForm.title}
                onChangeText={v => setMaintForm(f => ({ ...f, title: v }))}
                textAlignVertical="top"
              />
              <Text style={[styles.subLabel, { color: colors.textMuted }]}>Priority</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['Urgent', 'Medium', 'Low'] as const).map(p => (
                  <TouchableOpacity key={p} onPress={() => setMaintForm(f => ({ ...f, pri: p }))}
                    style={[styles.prodBtn, { flex: 1, justifyContent: 'center', backgroundColor: maintForm.pri === p ? PRI_COLORS[p].fg : colors.background, borderColor: maintForm.pri === p ? PRI_COLORS[p].fg : colors.border }]}>
                    <Text style={{ color: maintForm.pri === p ? '#fff' : colors.textMuted, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleMaintSubmit} activeOpacity={0.85}>
                  <Ionicons name="send" size={16} color="#fff" />
                  <Text style={styles.submitBtnText}>Submit Request</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cancelBtn, { flex: 1, borderColor: colors.border }]} onPress={() => setShowMaintForm(false)}>
                  <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
              <Text style={[styles.metricValue, { color: colors.error }]}>{openItems.length}</Text>
              <Text style={[styles.metricLabel, { color: colors.error }]}>Open</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
              <Text style={[styles.metricValue, { color: colors.warning }]}>{openItems.filter(m => m.pri === 'Urgent').length}</Text>
              <Text style={[styles.metricLabel, { color: colors.warning }]}>Urgent</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: colors.successBg, borderColor: colors.successBorder }]}>
              <Text style={[styles.metricValue, { color: colors.success }]}>{doneItems.length}</Text>
              <Text style={[styles.metricLabel, { color: colors.success }]}>Done</Text>
            </View>
          </View>

          {openItems.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Open Items</Text>
              {openItems.map(m => (
                <View key={m.id} style={[styles.logCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={[styles.logDate, { color: colors.text, flex: 1 }]}>{m.title}</Text>
                    <View style={[styles.priBadge, { backgroundColor: PRI_COLORS[m.pri].bg }]}>
                      <Text style={[styles.priText, { color: PRI_COLORS[m.pri].fg }]}>{m.pri}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 }}>
                    <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                    <Text style={[styles.logBy, { color: colors.textMuted }]}>by {m.by}</Text>
                    <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                    <Text style={[styles.logBy, { color: colors.textMuted }]}>{fmtDate(m.date)}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {doneItems.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 8 }]}>Completed</Text>
              {doneItems.map(m => (
                <View key={m.id} style={[styles.logCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: 0.75 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={[styles.logDate, { color: colors.text, flex: 1 }]}>{m.title}</Text>
                    {m.cost !== undefined && <Text style={[styles.saleAmt, { color: colors.success }]}>₦{m.cost.toLocaleString()}</Text>}
                  </View>
                  <Text style={[styles.logBy, { color: colors.textMuted, marginTop: 4 }]}>by {m.by} · {fmtDate(m.date)}</Text>
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

  metricsRow:   { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metricCard:   { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1 },
  metricValue:  { fontSize: 15, fontWeight: '700' },
  metricLabel:  { fontSize: 10, marginTop: 2 },
  cashPosCard:  { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  cashPosTitle: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  cashPosRow:   { flexDirection: 'row', gap: 8, marginBottom: 10 },
  cashPosItem:  { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', gap: 3 },
  cashPosValue: { fontSize: 16, fontWeight: '700' },
  cashPosLabel: { fontSize: 10 },
  posBar:       { height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row', marginBottom: 4 },
  posBarCash:   { borderRadius: 3 },
  posBarPos:    { borderRadius: 3 },
  posBarLabel:  { fontSize: 10, textAlign: 'center' },
  prodRowSales: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  prodCardSales:{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  prodLabelSales:{ fontSize: 12, fontWeight: '700' },
  prodLSales:   { fontSize: 13, fontWeight: '700', marginTop: 2 },
  calcPreview:  { padding: 12, borderRadius: 10, borderWidth: 1, gap: 6, marginBottom: 4 },
  calcRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calcLabel:    { fontSize: 12 },
  calcValue:    { fontSize: 14, fontWeight: '700' },
  calcDivider:  { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  saleAmt:          { fontSize: 15, fontWeight: '700' },
  saleL:            { fontSize: 11, marginTop: 2 },
  shiftStatusBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  shiftStatusText:  { fontSize: 10, fontWeight: '600' },
  posChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1 },
  posChipText:  { fontSize: 11, fontWeight: '600' },

  priBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priText:      { fontSize: 11, fontWeight: '700' },
});
