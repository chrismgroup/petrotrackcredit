import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import {
  PumpDailyReport, ROLE_COLORS, fmt, fmtDate, fmtDateTime, getPriceForPump, unitForProd, useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

/* ── helpers ─────────────────────────────────────────── */
const fmtL = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending_manager:    { label: 'Awaiting Manager',    color: '#BA7517', bg: '#FAEEDA', icon: 'time-outline' },
  pending_accountant: { label: 'Awaiting Accountant', color: '#185FA5', bg: '#E6F1FB', icon: 'hourglass-outline' },
  returned:           { label: 'Returned',             color: '#791F1F', bg: '#FCEBEB', icon: 'return-down-back-outline' },
  approved:           { label: 'Approved',             color: '#27500A', bg: '#EAF3DE', icon: 'checkmark-circle-outline' },
};

/* ── sub-components (module-scope — iOS keyboard safe) ──────── */
interface StatusBadgeProps { status: string }
function StatusBadge({ status }: StatusBadgeProps) {
  const m = STATUS_META[status] ?? STATUS_META.pending_manager;
  return (
    <View style={[c.badge, { backgroundColor: m.bg }]}>
      <Ionicons name={m.icon as any} size={10} color={m.color} />
      <Text style={[c.badgeTxt, { color: m.color }]}>{m.label}</Text>
    </View>
  );
}

interface ReportCardProps {
  report: PumpDailyReport;
  onPress: () => void;
  roleColor: string;
  colors: any;
}
function ReportCard({ report, onPress, roleColor, colors }: ReportCardProps) {
  const varColor = report.variance === 0 ? '#27500A' : report.variance > 0 ? '#185FA5' : '#791F1F';
  return (
    <TouchableOpacity onPress={onPress} style={[c.card, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.75}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={[c.pumpAvatar, { backgroundColor: roleColor + '18' }]}>
          <Ionicons name="speedometer-outline" size={18} color={roleColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[c.cardTitle, { color: colors.text }]}>{report.pumpName}</Text>
          <Text style={[c.cardSub, { color: colors.textMuted }]}>
            {report.product} · {fmtDate(report.date)} · {fmtL(report.liters)} {unitForProd(report.product)}
          </Text>
        </View>
        <StatusBadge status={report.status} />
      </View>
      <View style={[c.cardFooter, { borderTopColor: colors.border }]}>
        <Text style={[c.cardMeta, { color: colors.textMuted }]}>Gross: {fmt(report.grossAmount)}</Text>
        <Text style={[c.cardMeta, { color: colors.textMuted }]}>Collected: {fmt(report.totalCollected)}</Text>
        <Text style={[c.cardMeta, { color: varColor, fontWeight: '700' }]}>
          {report.variance === 0 ? 'Balanced' : report.variance > 0 ? `+${fmt(report.variance)}` : fmt(report.variance)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

interface FieldProps { label: string; value: string; colors: any; accent?: string }
function Field({ label, value, colors, accent }: FieldProps) {
  return (
    <View style={[c.field, { borderBottomColor: colors.border }]}>
      <Text style={[c.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[c.fieldValue, { color: accent ?? colors.text }]}>{value}</Text>
    </View>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN SCREEN
══════════════════════════════════════════════════════ */
export default function ShiftReportScreen() {
  const {
    role, userName, branchId, pumps, prices,
    pumpDailyReports, pumpInitialMeters, pumpLockedMeters,
    submitPumpReport, mgrForwardPumpReport,
    accApprovePumpReport, accRejectPumpReport,
    mgrResubmitPumpReport, setPumpInitialMeter, lockPumpMeter, unlockPumpMeter, deletePumpReport, updatePumpReport,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'att'] || colors.primary;

  const isAtt   = role === 'att';
  const isMgr   = role === 'mgr';
  const isAcc   = role === 'acc';
  const isAdmin = role === 'admin';
  const isMd    = role === 'md';
  const isCeo   = role === 'ceo';
  const isCsm   = role === 'csm';
  const canView = isAtt || isMgr || isAcc || isAdmin || isMd || isCeo || isCsm;
  const isGlobalOverview = isAcc || isAdmin || isMd || isCeo || isCsm;

  const today = new Date().toISOString().slice(0, 10);
  const activePumps = pumps.filter(p => {
    if (!p.active) return false;
    if (isGlobalOverview || !branchId || !p.branchId) return true;   // global overview or legacy pump — show all
    return p.branchId === branchId;               // attendant/mgr — branch-scoped
  });

  /* ── derive opening meter from last closing or admin initial ── */
  const getOpeningMeter = useCallback((pumpId: string) => {
    // Admin-locked value always wins
    if (pumpLockedMeters[pumpId] !== undefined) return pumpLockedMeters[pumpId];
    // Only use reports that have passed manager review (pending_accountant or approved).
    // pending_manager and returned reports have not been validated yet and must not roll over.
    const sorted = [...pumpDailyReports]
      .filter(r => r.pumpId === pumpId && (r.status === 'approved' || r.status === 'pending_accountant'))
      .sort((a, b) => b.date.localeCompare(a.date) || b.submittedAt.localeCompare(a.submittedAt));
    if (sorted.length > 0) return sorted[0].closingMeter;
    return pumpInitialMeters[pumpId] ?? 0;
  }, [pumpDailyReports, pumpInitialMeters, pumpLockedMeters]);

  /* ── tab state ── */
  const defaultTab = isAtt ? 'dashboard' : isMgr ? 'review' : isAcc ? 'pending_acc' : (isMd || isCeo) ? 'all_records' : 'initial';
  const [tab, setTab] = useState(defaultTab);

  /* ── selected pump (att) ── */
  const [selPump, setSelPump] = useState(() => activePumps[0]?.id ?? '');
  const pump = activePumps.find(p => p.id === selPump) ?? activePumps[0];

  /* ── form state (att) ── */
  const openingMeter = pump ? getOpeningMeter(pump.id) : 0;
  const [closeMeter, setCloseMeter] = useState('');
  const [posAmt, setPosAmt]         = useState('');
  const [cashAmt, setCashAmt]         = useState('');
  const [xferAmt, setXferAmt]         = useState('');
  const [creditAmt, setCreditAmt]     = useState('');
  const [noteAtt, setNoteAtt]         = useState('');

  const closeVal  = parseFloat(closeMeter.replace(/,/g, '')) || 0;
  const liters    = closeVal > openingMeter ? parseFloat((closeVal - openingMeter).toFixed(4)) : 0;
  const unitPrice = pump ? getPriceForPump(pump, prices) : 0;
  const grossAmt  = liters * unitPrice;
  const posVal    = parseFloat(posAmt.replace(/,/g, ''))    || 0;
  const cashVal   = parseFloat(cashAmt.replace(/,/g, ''))   || 0;
  const xferVal   = parseFloat(xferAmt.replace(/,/g, ''))   || 0;
  const creditVal = parseFloat(creditAmt.replace(/,/g, '')) || 0;
  const totalColl = posVal + cashVal + xferVal;
  const variance  = totalColl + creditVal - grossAmt;
  const varColor  = variance === 0 ? '#27500A' : variance > 0 ? '#185FA5' : '#791F1F';

  const todayBlockingReport = useMemo(() =>
    pumpDailyReports.find(
      r => r.pumpId === selPump && r.date === today &&
           (r.status === 'pending_manager' || r.status === 'returned')
    ) ?? null,
    [pumpDailyReports, selPump, today]
  );

  function handleSubmit() {
    if (!pump) { Alert.alert('Error', 'No active pump selected.'); return; }
    if (liters <= 0) { Alert.alert('Error', 'Closing meter must be greater than opening meter.'); return; }
    if (totalColl + creditVal <= 0) { Alert.alert('Error', 'Enter at least one payment amount (POS, cash, transfer, or credit).'); return; }
    if (todayBlockingReport) {
      const label = todayBlockingReport.status === 'returned'
        ? 'was returned and must be re-forwarded by the manager'
        : 'is awaiting manager review';
      Alert.alert('Manager Approval Required', `Your earlier report for ${pump.name} today ${label}. You can submit another shift report once the manager approves it.`);
      return;
    }
    submitPumpReport({
      date: today,
      pumpId: pump.id, pumpName: pump.name, product: pump.prod,
      branchId: branchId ?? '',
      openingMeter, closingMeter: closeVal, liters,
      unitPrice, grossAmount: grossAmt,
      posAmount: posVal, cashAmount: cashVal, transferAmount: xferVal, creditAmount: creditVal,
      totalCollected: totalColl, variance,
      note: noteAtt.trim(),
      submittedBy: userName ?? '', submittedByName: userName ?? '',
    });
    setCloseMeter(''); setPosAmt(''); setCashAmt(''); setXferAmt(''); setCreditAmt(''); setNoteAtt('');
    const vLabel = variance === 0 ? 'Balanced ✓' : variance > 0 ? `Overage of ${fmt(variance)}` : `Shortage of ${fmt(Math.abs(variance))}`;
    Alert.alert('Shift Report Submitted', `${pump.name} · ${fmtL(liters)}${unitForProd(pump.prod)}\nGross: ${fmt(grossAmt)}\n${vLabel}\nSent to branch manager for review.`);
    setTab('history');
  }

  /* ── modal state ── */
  const [viewing, setViewing] = useState<PumpDailyReport | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editClose, setEditClose] = useState('');
  const [editPos, setEditPos] = useState('');
  const [editCash, setEditCash] = useState('');
  const [editXfer, setEditXfer] = useState('');
  const [editCredit, setEditCredit] = useState('');
  const [editNote, setEditNote] = useState('');

  function openReport(r: PumpDailyReport) {
    setViewing(r);
    setReviewNote('');
    setRejectReason('');
    setIsEditing(false);
    setEditClose(String(r.closingMeter));
    setEditPos(String(r.posAmount));
    setEditCash(String(r.cashAmount));
    setEditXfer(String(r.transferAmount));
    setEditCredit(String(r.creditAmount));
    setEditNote(r.note ?? '');
  }
  function closeModal() {
    setViewing(null);
    setReviewNote('');
    setRejectReason('');
    setIsEditing(false);
  }

  function startEdit() { setIsEditing(true); }
  function cancelEdit() {
    if (!viewing) return;
    setEditClose(String(viewing.closingMeter));
    setEditPos(String(viewing.posAmount));
    setEditCash(String(viewing.cashAmount));
    setEditXfer(String(viewing.transferAmount));
    setEditCredit(String(viewing.creditAmount));
    setEditNote(viewing.note ?? '');
    setIsEditing(false);
  }

  function handleSaveEdit() {
    if (!viewing) return;
    const closeVal = parseFloat(editClose.replace(/,/g, '')) || 0;
    if (closeVal <= viewing.openingMeter) { Alert.alert('Invalid', 'Closing meter must be greater than opening meter.'); return; }
    updatePumpReport(viewing.id, {
      closingMeter: closeVal,
      posAmount: parseFloat(editPos.replace(/,/g, '')) || 0,
      cashAmount: parseFloat(editCash.replace(/,/g, '')) || 0,
      transferAmount: parseFloat(editXfer.replace(/,/g, '')) || 0,
      creditAmount: parseFloat(editCredit.replace(/,/g, '')) || 0,
      note: editNote.trim(),
    });
    setIsEditing(false);
    Alert.alert('Updated', 'Shift report has been updated.');
  }

  function handleDelete() {
    if (!viewing) return;
    const canDeleteApproved = isAdmin || isMd;
    if (viewing.status === 'approved' && !canDeleteApproved) { Alert.alert('Locked', 'Approved reports cannot be deleted.'); return; }
    if (viewing.status === 'pending_accountant' && !isAdmin && !isMd) { Alert.alert('In Review', 'This report is with the accountant and cannot be deleted.'); return; }
    Alert.alert(
      'Delete Report',
      `Delete the shift report for ${viewing.pumpName} on ${fmtDate(viewing.date)}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { deletePumpReport(viewing.id); closeModal(); } },
      ]
    );
  }

  function handleMgrForward() {
    if (!viewing) return;
    if (!reviewNote.trim()) { Alert.alert('Required', 'Add a manager note before forwarding.'); return; }
    mgrForwardPumpReport(viewing.id, reviewNote.trim());
    Alert.alert('Forwarded', 'Report forwarded to accountant for final approval.');
    closeModal();
  }

  function handleMgrResubmit() {
    if (!viewing) return;
    if (!reviewNote.trim()) { Alert.alert('Required', 'Add a note explaining corrections made.'); return; }
    mgrResubmitPumpReport(viewing.id, reviewNote.trim());
    Alert.alert('Re-submitted', 'Report sent back to accountant for approval.');
    closeModal();
  }

  function handleAccApprove() {
    if (!viewing) return;
    accApprovePumpReport(viewing, reviewNote.trim());
    Alert.alert('Approved', 'Report approved — sales record has been created automatically.');
    closeModal();
  }

  function handleAccReject() {
    if (!viewing) return;
    if (!rejectReason.trim()) { Alert.alert('Required', 'Provide a rejection reason.'); return; }
    accRejectPumpReport(viewing.id, rejectReason.trim());
    Alert.alert('Returned', 'Report returned to branch manager with rejection reason.');
    closeModal();
  }

  /* ── initial meter (admin) ── */
  const [initMeters, setInitMeters] = useState<Record<string, string>>(
    Object.fromEntries(activePumps.map(p => [p.id, String(pumpInitialMeters[p.id] ?? '')]))
  );
  const [lockInputs, setLockInputs] = useState<Record<string, string>>({});

  function saveInitMeter(pumpId: string) {
    const v = parseFloat(initMeters[pumpId].replace(/,/g, ''));
    if (isNaN(v) || v < 0) { Alert.alert('Invalid', 'Enter a valid meter reading.'); return; }
    setPumpInitialMeter(pumpId, v);
    Alert.alert('Saved', 'Initial meter reading updated.');
  }

  function handleLockMeter(pumpId: string) {
    const raw = lockInputs[pumpId] ?? '';
    const v = parseFloat(raw.replace(/,/g, ''));
    if (isNaN(v) || v < 0) { Alert.alert('Invalid', 'Enter a valid meter reading to lock.'); return; }
    Alert.alert(
      'Lock Opening Meter',
      `Lock the opening meter for this pump to ${fmtL(v)}?\n\nAttendants will always see this value as their opening until you unlock it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock', style: 'destructive',
          onPress: () => {
            lockPumpMeter(pumpId, v);
            setLockInputs(m => ({ ...m, [pumpId]: '' }));
          },
        },
      ]
    );
  }

  function handleUnlockMeter(pumpId: string) {
    Alert.alert(
      'Unlock Opening Meter',
      'Release the lock? The opening meter will resume auto-carry from the last closing meter.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unlock', onPress: () => unlockPumpMeter(pumpId) },
      ]
    );
  }

  /* ── branch-scoped filter: both att and mgr see ONLY their branch ── */
  const inMyBranch = (r: PumpDailyReport) => {
    if (!branchId) return true;           // no branch set on this session — show all (legacy)
    if (!r.branchId) return true;         // report has no branch tag (legacy data) — show to all
    return r.branchId === branchId;
  };

  /* ── filtered lists ── */
  const myReports = useMemo(() =>
     [...pumpDailyReports]
       .filter(r => (isGlobalOverview || inMyBranch(r)) && (isGlobalOverview || r.submittedBy === userName || r.branchId === branchId))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [pumpDailyReports, userName, branchId, isGlobalOverview]
  );

  const pendingMgr = useMemo(() =>
    pumpDailyReports.filter(r => r.status === 'pending_manager' && (isGlobalOverview || inMyBranch(r)))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [pumpDailyReports, branchId, isGlobalOverview]
  );
  const returnedMgr = useMemo(() =>
    pumpDailyReports.filter(r => r.status === 'returned' && (isGlobalOverview || inMyBranch(r)))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [pumpDailyReports, branchId]
  );
  const pendingAcc = useMemo(() =>
    pumpDailyReports.filter(r => r.status === 'pending_accountant')
      .sort((a, b) => b.date.localeCompare(a.date)),
    [pumpDailyReports]
  );
  const pendingAccMgr = useMemo(() =>
    pumpDailyReports.filter(r => r.status === 'pending_accountant' && (isGlobalOverview || inMyBranch(r)))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [pumpDailyReports, branchId, isGlobalOverview]
  );
  const approvedAll = useMemo(() =>
    pumpDailyReports.filter(r => r.status === 'approved')
      .sort((a, b) => b.date.localeCompare(a.date)),
    [pumpDailyReports]
  );
  const allReports = useMemo(() =>
    [...pumpDailyReports].sort((a, b) => b.date.localeCompare(a.date) || b.submittedAt.localeCompare(a.submittedAt)),
    [pumpDailyReports]
  );

  /* ── attendant dashboard stats ── */
  const attReports = useMemo(() =>
    [...pumpDailyReports].filter(r => r.submittedBy === userName).sort((a, b) => b.date.localeCompare(a.date)),
    [pumpDailyReports, userName]
  );
  const monthKey = today.slice(0, 7);
  const monthReports = useMemo(() => attReports.filter(r => r.date.startsWith(monthKey)), [attReports, monthKey]);
  const dashTotals = useMemo(() => ({
    liters:    monthReports.reduce((s, r) => s + r.liters, 0),
    gross:     monthReports.reduce((s, r) => s + r.grossAmount, 0),
    collected: monthReports.reduce((s, r) => s + r.totalCollected, 0),
    variance:  monthReports.reduce((s, r) => s + r.variance, 0),
  }), [monthReports]);
  const statusCounts = useMemo(() => ({
    approved: attReports.filter(r => r.status === 'approved').length,
    pending:  attReports.filter(r => r.status === 'pending_manager' || r.status === 'pending_accountant').length,
    returned: attReports.filter(r => r.status === 'returned').length,
  }), [attReports]);
  const todayPumpStatus = useMemo(() =>
    activePumps.map(p => ({
      pump: p,
      report: pumpDailyReports.find(r => r.date === today && r.pumpId === p.id) ?? null,
    })),
    [activePumps, pumpDailyReports, today]
  );
  const returnedReports = useMemo(() =>
    attReports.filter(r => r.status === 'returned'),
    [attReports]
  );

  /* ── tab definitions ── */
  type Tab = 'dashboard' | 'submit' | 'history' | 'review' | 'pending_acc' | 'approved' | 'initial' | 'all_records';
  const tabs: { key: Tab; label: string; badge?: number; roles: string[] }[] = [
    { key: 'dashboard',   label: 'My Summary',    badge: returnedReports.length || undefined, roles: ['att'] },
    { key: 'submit',      label: 'Record Meters', roles: ['att'] },
    { key: 'history',     label: 'My History',    roles: ['att'] },
    { key: 'review',      label: 'Review',        badge: pendingMgr.length + returnedMgr.length + pendingAccMgr.length, roles: ['mgr'] },
    { key: 'pending_acc', label: 'Approvals',     badge: pendingAcc.length, roles: ['acc'] },
    { key: 'approved',    label: 'Approved',      roles: ['acc', 'mgr'] },
    { key: 'all_records', label: 'All Records',   roles: ['admin', 'md', 'ceo'] },
    { key: 'initial',     label: 'Set Meters',    roles: ['admin'] },
  ];
  const visibleTabs = tabs.filter(t => role && t.roles.includes(role));

  if (!canView) {
    return (
      <ScreenLayout title="Shift Report">
        <View style={c.center}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textSubtle} />
          <Text style={[c.emptyTxt, { color: colors.textMuted }]}>Access restricted</Text>
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout title="Shift Report">

      {/* Tab bar */}
      <View style={[c.tabBar, { borderBottomColor: colors.border }]}>
        {visibleTabs.map(t => {
          const active = tab === t.key;
          return (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)}
              style={[c.tabBtn, { borderBottomColor: active ? roleColor : 'transparent' }]}>
              <Text style={[c.tabLabel, { color: active ? roleColor : colors.textMuted, fontWeight: active ? '700' : '400' }]}>
                {t.label}
              </Text>
              {!!t.badge && t.badge > 0 && (
                <View style={[c.tabBadge, { backgroundColor: '#E74C3C' }]}>
                  <Text style={c.tabBadgeTxt}>{t.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ══ ATTENDANT: DASHBOARD ══ */}
      {tab === 'dashboard' && (
        <ScrollView contentContainerStyle={c.scroll} showsVerticalScrollIndicator={false}>

          {/* Returned alert banner */}
          {returnedReports.length > 0 && (
            <View style={[c.alertBanner, { backgroundColor: '#FCEBEB', borderColor: '#E74C3C55' }]}>
              <Ionicons name="alert-circle" size={18} color="#791F1F" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#791F1F' }}>
                  {returnedReports.length} report{returnedReports.length > 1 ? 's' : ''} returned for correction
                </Text>
                <Text style={{ fontSize: 11, color: '#791F1F', marginTop: 2 }}>Check "My History" to see rejection reasons.</Text>
              </View>
              <TouchableOpacity onPress={() => setTab('history')}
                style={{ backgroundColor: '#791F1F', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>View</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Today's pump status */}
          <Text style={[c.sectionLabel, { color: colors.text }]}>Today's Pumps</Text>
          {todayPumpStatus.length === 0 && (
            <View style={[c.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border, paddingVertical: 20 }]}>
              <Ionicons name="speedometer-outline" size={28} color={colors.textSubtle} />
              <Text style={[c.emptyTxt, { color: colors.textMuted }]}>No active pumps assigned</Text>
            </View>
          )}
          {todayPumpStatus.map(({ pump: p, report: r }) => {
            const submitted = r !== null;
            const sm = submitted ? (STATUS_META[r!.status] ?? STATUS_META.pending_manager) : null;
            return (
              <View key={p.id} style={[c.todayCard, { backgroundColor: colors.surface, borderColor: submitted ? (sm!.color + '55') : colors.border }]}>
                <View style={[c.pumpAvatar, { backgroundColor: (submitted ? sm!.color : colors.textSubtle) + '18' }]}>
                  <Ionicons name="speedometer-outline" size={18} color={submitted ? sm!.color : colors.textSubtle} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[c.cardTitle, { color: colors.text }]}>{p.name}</Text>
                  <Text style={[c.cardSub, { color: colors.textMuted }]}>{p.prod}</Text>
                  {submitted && r && (
                    <Text style={[c.cardSub, { color: colors.textMuted, marginTop: 2 }]}>
                      {fmtL(r.liters)} {unitForProd(r.product)} · {fmt(r.grossAmount)}
                    </Text>
                  )}
                </View>
                {submitted && sm ? (
                  <View style={[c.badge, { backgroundColor: sm.bg }]}>
                    <Ionicons name={sm.icon as any} size={10} color={sm.color} />
                    <Text style={[c.badgeTxt, { color: sm.color }]}>{sm.label}</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => { setSelPump(p.id); setTab('submit'); }}
                    style={[c.badge, { backgroundColor: roleColor + '18' }]}>
                    <Ionicons name="add" size={12} color={roleColor} />
                    <Text style={[c.badgeTxt, { color: roleColor }]}>Submit</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* Status counts */}
          <Text style={[c.sectionLabel, { color: colors.text, marginTop: 14 }]}>All-Time Summary</Text>
          <View style={c.statRow}>
            <View style={[c.statTile, { backgroundColor: '#EAF3DE', borderColor: '#27500A22' }]}>
              <Ionicons name="checkmark-circle" size={20} color="#27500A" />
              <Text style={[c.statNum, { color: '#27500A' }]}>{statusCounts.approved}</Text>
              <Text style={[c.statLbl, { color: '#27500A' }]}>Approved</Text>
            </View>
            <View style={[c.statTile, { backgroundColor: '#FAEEDA', borderColor: '#BA751722' }]}>
              <Ionicons name="hourglass" size={20} color="#BA7517" />
              <Text style={[c.statNum, { color: '#BA7517' }]}>{statusCounts.pending}</Text>
              <Text style={[c.statLbl, { color: '#BA7517' }]}>In Review</Text>
            </View>
            <View style={[c.statTile, { backgroundColor: '#FCEBEB', borderColor: '#E74C3C22' }]}>
              <Ionicons name="return-down-back" size={20} color="#791F1F" />
              <Text style={[c.statNum, { color: '#791F1F' }]}>{statusCounts.returned}</Text>
              <Text style={[c.statLbl, { color: '#791F1F' }]}>Returned</Text>
            </View>
          </View>

          {/* This month's totals */}
          <Text style={[c.sectionLabel, { color: colors.text, marginTop: 14 }]}>
            This Month · {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
          </Text>
          <View style={[c.monthCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={c.monthRow}>
              <View style={c.monthCol}>
                <Text style={[c.monthVal, { color: roleColor }]}>{fmtL(dashTotals.liters)}</Text>
                <Text style={[c.monthLbl, { color: colors.textMuted }]}>Volume Sold</Text>
              </View>
              <View style={[c.monthDivider, { backgroundColor: colors.border }]} />
              <View style={c.monthCol}>
                <Text style={[c.monthVal, { color: colors.text }]}>{fmt(dashTotals.gross)}</Text>
                <Text style={[c.monthLbl, { color: colors.textMuted }]}>Gross Sales</Text>
              </View>
            </View>
            <View style={[c.monthDividerH, { backgroundColor: colors.border }]} />
            <View style={c.monthRow}>
              <View style={c.monthCol}>
                <Text style={[c.monthVal, { color: colors.text }]}>{fmt(dashTotals.collected)}</Text>
                <Text style={[c.monthLbl, { color: colors.textMuted }]}>Total Collected</Text>
              </View>
              <View style={[c.monthDivider, { backgroundColor: colors.border }]} />
              <View style={c.monthCol}>
                {(() => {
                  const vc = dashTotals.variance === 0 ? '#27500A' : dashTotals.variance > 0 ? '#185FA5' : '#791F1F';
                  return (
                    <>
                      <Text style={[c.monthVal, { color: vc }]}>
                        {dashTotals.variance === 0 ? '₦0' : (dashTotals.variance > 0 ? '+' : '') + fmt(dashTotals.variance)}
                      </Text>
                      <Text style={[c.monthLbl, { color: colors.textMuted }]}>Net Variance</Text>
                    </>
                  );
                })()}
              </View>
            </View>
            <Text style={[c.monthFooter, { color: colors.textSubtle, borderTopColor: colors.border }]}>
              {monthReports.length} report{monthReports.length !== 1 ? 's' : ''} this month
            </Text>
          </View>

          {/* Recent 5 reports */}
          {attReports.length > 0 && (
            <>
              <Text style={[c.sectionLabel, { color: colors.text, marginTop: 14 }]}>Recent Reports</Text>
              {attReports.slice(0, 5).map(r => (
                <ReportCard key={r.id} report={r} roleColor={roleColor} colors={colors} onPress={() => openReport(r)} />
              ))}
              {attReports.length > 5 && (
                <TouchableOpacity onPress={() => setTab('history')}
                  style={[c.viewAllBtn, { borderColor: roleColor + '44', backgroundColor: roleColor + '08' }]}>
                  <Text style={[c.viewAllTxt, { color: roleColor }]}>View all {attReports.length} reports</Text>
                  <Ionicons name="chevron-forward" size={14} color={roleColor} />
                </TouchableOpacity>
              )}
            </>
          )}

          {attReports.length === 0 && (
            <View style={[c.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 10 }]}>
              <Ionicons name="document-outline" size={36} color={colors.textSubtle} />
              <Text style={[c.emptyTxt, { color: colors.textMuted }]}>No reports yet. Submit your first shift report above.</Text>
              <TouchableOpacity onPress={() => setTab('submit')}
                style={[c.submitBtn, { backgroundColor: roleColor, paddingHorizontal: 24, marginTop: 4 }]}>
                <Ionicons name="add-circle" size={16} color="#fff" />
                <Text style={c.submitBtnTxt}>Submit First Report</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ══ RECORD METERS ══ */}
      {tab === 'submit' && (
        <ScrollView contentContainerStyle={c.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">

          {activePumps.length === 0 && (
            <View style={[c.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="alert-circle-outline" size={36} color={colors.textSubtle} />
              <Text style={[c.emptyTxt, { color: colors.textMuted }]}>No active pumps configured. Contact your manager.</Text>
            </View>
          )}

          {activePumps.length > 0 && (
            <>
              {/* Pump selector */}
              <Text style={[c.sectionLabel, { color: colors.textMuted }]}>Select Pump</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {activePumps.map(p => {
                  const active = selPump === p.id;
                  return (
                    <TouchableOpacity key={p.id} onPress={() => { setSelPump(p.id); setCloseMeter(''); }}
                      style={[c.pumpChip, { backgroundColor: active ? roleColor : colors.surface, borderColor: active ? roleColor : colors.border }]}>
                      <Ionicons name="speedometer-outline" size={13} color={active ? '#fff' : colors.textMuted} />
                      <Text style={[c.pumpChipTxt, { color: active ? '#fff' : colors.textMuted }]}>{p.name}</Text>
                      <Text style={[c.pumpProd, { color: active ? 'rgba(255,255,255,0.8)' : colors.textSubtle }]}>{p.prod}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {todayBlockingReport ? (
                <View style={[c.alreadyCard, {
                  backgroundColor: todayBlockingReport.status === 'returned' ? '#FFF3E0' : '#FFF8E1',
                  borderColor: todayBlockingReport.status === 'returned' ? '#E65100AA' : '#BA751744',
                }]}>
                  <Ionicons
                    name={todayBlockingReport.status === 'returned' ? 'arrow-undo-circle' : 'time-outline'}
                    size={22}
                    color={todayBlockingReport.status === 'returned' ? '#E65100' : '#BA7517'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: todayBlockingReport.status === 'returned' ? '#E65100' : '#7A4F00' }}>
                      {todayBlockingReport.status === 'returned' ? 'Report returned — awaiting re-forward' : 'Awaiting manager review'}
                    </Text>
                    <Text style={{ fontSize: 12, color: todayBlockingReport.status === 'returned' ? '#BF360C' : '#6D4C00', marginTop: 2 }}>
                      Your earlier report for {pump?.name} today must be approved by the manager before you can submit another shift report.
                    </Text>
                  </View>
                </View>
              ) : (
                <>
                  {/* Meter readings */}
                  <View style={[c.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[c.formTitle, { color: colors.text }]}>Meter Readings</Text>
                    <Text style={[c.formHint, { color: colors.textMuted }]}>Opening meter auto-filled from last closing reading.</Text>

                    <View style={c.meterRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[c.inputLabel, { color: colors.textMuted }]}>Opening Meter ({unitForProd(pump.prod)})</Text>
                        <View style={[c.readonlyInput, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <Ionicons name="lock-closed-outline" size={13} color={colors.textSubtle} />
                          <Text style={[c.readonlyVal, { color: colors.textMuted }]}>{fmtL(openingMeter)}</Text>
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[c.inputLabel, { color: colors.textMuted }]}>Closing Meter (L) *</Text>
                        <TextInput
                          style={[c.textInput, { backgroundColor: colors.background, borderColor: colors.inputBorder ?? colors.border, color: colors.text }]}
                          placeholder="Enter reading" placeholderTextColor={colors.textSubtle}
                          keyboardType="decimal-pad" value={closeMeter} onChangeText={setCloseMeter}
                        />
                      </View>
                    </View>

                    {liters > 0 && (
                      <View style={[c.calcRow, { backgroundColor: roleColor + '12', borderColor: roleColor + '33' }]}>
                        <Ionicons name="water-outline" size={16} color={roleColor} />
                        <Text style={[c.calcTxt, { color: roleColor }]}>
                          {fmtL(liters)} {unitForProd(pump.prod)} × ₦{unitPrice.toLocaleString()}/{unitForProd(pump.prod)} = <Text style={{ fontWeight: '800' }}>{fmt(grossAmt)}</Text>
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Payment breakdown */}
                  <View style={[c.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[c.formTitle, { color: colors.text }]}>Payment Breakdown</Text>
                    <Text style={[c.formHint, { color: colors.textMuted }]}>Enter all amounts received. POS + Cash + Transfer + Credit must equal gross sales.</Text>

                    {[
                      { label: 'POS Amount (₦)', val: posAmt, set: setPosAmt, icon: 'card-outline', color: '#185FA5' },
                      { label: 'Cash Amount (₦)', val: cashAmt, set: setCashAmt, icon: 'cash-outline', color: '#27500A' },
                      { label: 'Bank Transfer (₦)', val: xferAmt, set: setXferAmt, icon: 'swap-horizontal-outline', color: '#7B3FA8' },
                      { label: 'Credit to Customer (₦)', val: creditAmt, set: setCreditAmt, icon: 'person-outline', color: '#A85E1A' },
                    ].map(f => (
                      <View key={f.label} style={{ marginBottom: 10 }}>
                        <Text style={[c.inputLabel, { color: colors.textMuted }]}>{f.label}</Text>
                        <View style={[c.payInputWrap, { backgroundColor: colors.background, borderColor: colors.inputBorder ?? colors.border }]}>
                          <Ionicons name={f.icon as any} size={15} color={f.color} />
                          <TextInput
                            style={[c.payInput, { color: colors.text }]}
                            placeholder="0.00" placeholderTextColor={colors.textSubtle}
                            keyboardType="decimal-pad" value={f.val} onChangeText={f.set}
                          />
                        </View>
                      </View>
                    ))}

                    {/* Balance summary */}
                    {(posVal + cashVal + xferVal + creditVal) > 0 && (
                      <View style={[c.balanceCard, { backgroundColor: varColor + '10', borderColor: varColor + '33' }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 12, color: colors.textMuted }}>Gross Amount</Text>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{fmt(grossAmt)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 12, color: colors.textMuted }}>Total Collected</Text>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{fmt(totalColl)}</Text>
                        </View>
                        {creditVal > 0 && (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ fontSize: 12, color: '#A85E1A' }}>Credit to Customer</Text>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#A85E1A' }}>{fmt(creditVal)}</Text>
                          </View>
                        )}
                        <View style={[c.divider, { backgroundColor: colors.border }]} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: varColor }}>
                            {variance === 0 ? 'Balanced ✓' : variance > 0 ? 'Overage' : 'Shortage'}
                          </Text>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: varColor }}>
                            {variance === 0 ? '₦0' : (variance > 0 ? '+' : '') + fmt(variance)}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Notes */}
                  <Text style={[c.inputLabel, { color: colors.textMuted }]}>Notes (optional)</Text>
                  <TextInput
                    style={[c.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                    placeholder="Any remarks for your manager…" placeholderTextColor={colors.textSubtle}
                    multiline numberOfLines={3} value={noteAtt} onChangeText={setNoteAtt}
                  />

                  <TouchableOpacity onPress={handleSubmit}
                    style={[c.submitBtn, { backgroundColor: liters > 0 ? roleColor : colors.textSubtle }]}
                    disabled={liters <= 0} activeOpacity={0.85}>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={c.submitBtnTxt}>Submit to Manager</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ══ HISTORY ══ */}
      {tab === 'history' && (
        <ScrollView contentContainerStyle={c.scroll} showsVerticalScrollIndicator={false}>
          {myReports.length === 0 && (
            <View style={[c.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="document-outline" size={36} color={colors.textSubtle} />
              <Text style={[c.emptyTxt, { color: colors.textMuted }]}>No shift reports yet</Text>
            </View>
          )}
          {myReports.map(r => (
            <ReportCard key={r.id} report={r} roleColor={roleColor} colors={colors} onPress={() => openReport(r)} />
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ══ MANAGER: REVIEW ══ */}
      {tab === 'review' && isMgr && (
        <ScrollView contentContainerStyle={c.scroll} showsVerticalScrollIndicator={false}>
          {pendingMgr.length === 0 && returnedMgr.length === 0 && pendingAccMgr.length === 0 && (
            <View style={[c.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="checkmark-done-circle-outline" size={36} color={colors.textSubtle} />
              <Text style={[c.emptyTxt, { color: colors.textMuted }]}>No shift reports awaiting your review</Text>
            </View>
          )}
          {returnedMgr.length > 0 && (
            <>
              <Text style={[c.sectionLabel, { color: '#791F1F' }]}>Returned by Accountant ({returnedMgr.length})</Text>
              {returnedMgr.map(r => (
                <ReportCard key={r.id} report={r} roleColor="#791F1F" colors={colors} onPress={() => openReport(r)} />
              ))}
            </>
          )}
          {pendingMgr.length > 0 && (
            <>
              <Text style={[c.sectionLabel, { color: '#BA7517' }]}>Awaiting Your Review ({pendingMgr.length})</Text>
              {pendingMgr.map(r => (
                <ReportCard key={r.id} report={r} roleColor={roleColor} colors={colors} onPress={() => openReport(r)} />
              ))}
            </>
          )}
          {pendingAccMgr.length > 0 && (
            <>
              <Text style={[c.sectionLabel, { color: '#185FA5' }]}>Forwarded — With Accountant ({pendingAccMgr.length})</Text>
              {pendingAccMgr.map(r => (
                <ReportCard key={r.id} report={r} roleColor="#185FA5" colors={colors} onPress={() => openReport(r)} />
              ))}
            </>
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ══ ACCOUNTANT: PENDING APPROVAL ══ */}
      {tab === 'pending_acc' && isAcc && (
        <ScrollView contentContainerStyle={c.scroll} showsVerticalScrollIndicator={false}>
          {pendingAcc.length === 0 && (
            <View style={[c.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="checkmark-circle-outline" size={36} color={colors.textSubtle} />
              <Text style={[c.emptyTxt, { color: colors.textMuted }]}>No shift reports pending approval</Text>
            </View>
          )}
          {pendingAcc.map(r => (
            <ReportCard key={r.id} report={r} roleColor={roleColor} colors={colors} onPress={() => openReport(r)} />
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ══ APPROVED HISTORY ══ */}
      {tab === 'approved' && (
        <ScrollView contentContainerStyle={c.scroll} showsVerticalScrollIndicator={false}>
          {approvedAll.length === 0 && (
            <View style={[c.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="document-text-outline" size={36} color={colors.textSubtle} />
              <Text style={[c.emptyTxt, { color: colors.textMuted }]}>No approved shift reports yet</Text>
            </View>
          )}
          {approvedAll.map(r => (
            <ReportCard key={r.id} report={r} roleColor="#27500A" colors={colors} onPress={() => openReport(r)} />
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ══ ADMIN / MD / CEO: ALL RECORDS ══ */}
      {tab === 'all_records' && (
        <ScrollView contentContainerStyle={c.scroll} showsVerticalScrollIndicator={false}>
          {allReports.length === 0 && (
            <View style={[c.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="document-text-outline" size={36} color={colors.textSubtle} />
              <Text style={[c.emptyTxt, { color: colors.textMuted }]}>No shift reports submitted yet</Text>
            </View>
          )}
          {allReports.length > 0 && (
            <>
              {(['approved', 'pending_accountant', 'pending_manager', 'returned'] as const).map(st => {
                const group = allReports.filter(r => r.status === st);
                if (group.length === 0) return null;
                const meta = STATUS_META[st] ?? STATUS_META.pending_manager;
                return (
                  <React.Fragment key={st}>
                    <Text style={[c.sectionLabel, { color: meta.color }]}>
                      {meta.label} ({group.length})
                    </Text>
                    {group.map(r => (
                      <ReportCard key={r.id} report={r} roleColor={meta.color} colors={colors} onPress={() => openReport(r)} />
                    ))}
                  </React.Fragment>
                );
              })}
            </>
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ══ ADMIN: SET INITIAL METERS ══ */}
      {tab === 'initial' && isAdmin && (
        <ScrollView contentContainerStyle={c.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          <View style={[c.infoBanner, { backgroundColor: '#185FA522', borderColor: '#185FA544' }]}>
            <Ionicons name="information-circle" size={16} color="#185FA5" />
            <Text style={[c.infoBannerTxt, { color: '#185FA5' }]}>
              Set the initial meter reading (first-time seed). To override the next opening meter, enter a value and tap <Text style={{ fontWeight: '700' }}>Lock</Text> — attendants will see that value until you unlock it.
            </Text>
          </View>
          {activePumps.map(p => {
            const current = pumpInitialMeters[p.id];
            const locked = pumpLockedMeters[p.id];
            const isLocked = locked !== undefined;
            const lastReport = [...pumpDailyReports].filter(r => r.pumpId === p.id).sort((a, b) => b.date.localeCompare(a.date))[0];
            const effectiveOpening = getOpeningMeter(p.id);
            return (
              <View key={p.id} style={[c.initCard, { backgroundColor: colors.surface, borderColor: isLocked ? '#C0392B55' : colors.border }]}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <View style={[c.pumpAvatar, { backgroundColor: isLocked ? '#FDECEA' : roleColor + '18' }]}>
                    <Ionicons name={isLocked ? 'lock-closed' : 'speedometer-outline'} size={18} color={isLocked ? '#C0392B' : roleColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[c.cardTitle, { color: colors.text }]}>{p.name}</Text>
                    <Text style={[c.cardSub, { color: colors.textMuted }]}>{p.prod}</Text>
                  </View>
                  {isLocked ? (
                    <View style={[c.badge, { backgroundColor: '#FDECEA' }]}>
                      <Ionicons name="lock-closed" size={10} color="#C0392B" />
                      <Text style={[c.badgeTxt, { color: '#C0392B' }]}>LOCKED</Text>
                    </View>
                  ) : current !== undefined ? (
                    <View style={[c.badge, { backgroundColor: '#EAF3DE' }]}>
                      <Text style={[c.badgeTxt, { color: '#27500A' }]}>Seed: {fmtL(current)}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Current effective opening */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 2 }}>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>Current opening (attendant sees)</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isLocked ? '#C0392B' : colors.text }}>
                    {fmtL(effectiveOpening)} {unitForProd(p.prod)}
                  </Text>
                </View>

                {lastReport && (
                  <Text style={[c.cardSub, { color: colors.textMuted, marginBottom: 8 }]}>
                    Last closing: {fmtL(lastReport.closingMeter)} {unitForProd(p.prod)} · {fmtDate(lastReport.date)}
                  </Text>
                )}

                {/* Unlock banner when locked */}
                {isLocked && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FDECEA', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <Ionicons name="lock-closed" size={14} color="#C0392B" />
                    <Text style={{ flex: 1, fontSize: 12, color: '#C0392B' }}>
                      Opening meter locked at {fmtL(locked)} {unitForProd(p.prod)}
                    </Text>
                    <TouchableOpacity onPress={() => handleUnlockMeter(p.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#C0392B', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 }}>
                      <Ionicons name="lock-open-outline" size={13} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Unlock</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Seed / initial meter row */}
                <Text style={[c.inputLabel, { color: colors.textMuted, marginBottom: 4 }]}>Initial seed meter (L)</Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                  <TextInput
                    style={[c.textInput, { flex: 1, marginBottom: 0, backgroundColor: colors.background, borderColor: colors.inputBorder ?? colors.border, color: colors.text }]}
                    placeholder={current !== undefined ? String(current) : 'Enter initial meter (L)'}
                    placeholderTextColor={colors.textSubtle}
                    keyboardType="decimal-pad"
                    value={initMeters[p.id] ?? ''}
                    onChangeText={v => setInitMeters(m => ({ ...m, [p.id]: v }))}
                  />
                  <TouchableOpacity onPress={() => saveInitMeter(p.id)}
                    style={[c.saveBtn, { backgroundColor: roleColor }]}>
                    <Ionicons name="save-outline" size={15} color="#fff" />
                    <Text style={c.saveBtnTxt}>Save</Text>
                  </TouchableOpacity>
                </View>

                {/* Lock override row */}
                <Text style={[c.inputLabel, { color: '#C0392B', marginBottom: 4 }]}>Override &amp; lock opening meter (L)</Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TextInput
                    style={[c.textInput, { flex: 1, marginBottom: 0, backgroundColor: colors.background, borderColor: '#C0392B44', color: colors.text }]}
                    placeholder="Enter new opening meter to lock"
                    placeholderTextColor={colors.textSubtle}
                    keyboardType="decimal-pad"
                    value={lockInputs[p.id] ?? ''}
                    onChangeText={v => setLockInputs(m => ({ ...m, [p.id]: v }))}
                  />
                  <TouchableOpacity onPress={() => handleLockMeter(p.id)}
                    style={[c.saveBtn, { backgroundColor: '#C0392B' }]}>
                    <Ionicons name="lock-closed-outline" size={15} color="#fff" />
                    <Text style={c.saveBtnTxt}>Lock</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          {activePumps.length === 0 && (
            <View style={[c.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="alert-circle-outline" size={36} color={colors.textSubtle} />
              <Text style={[c.emptyTxt, { color: colors.textMuted }]}>No active pumps. Add pumps in System Settings first.</Text>
            </View>
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ══ DETAIL MODAL ══ */}
      {!!viewing && (
        <View style={c.modalOverlay}>
          <ScrollView style={[c.modalSheet, { backgroundColor: colors.background }]}
            contentContainerStyle={{ padding: 20 }}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="none">

            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <View style={[c.pumpAvatar, { backgroundColor: roleColor + '18', width: 44, height: 44, borderRadius: 22 }]}>
                <Ionicons name="speedometer-outline" size={20} color={roleColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[c.modalTitle, { color: colors.text }]}>{viewing.pumpName}</Text>
                <Text style={[c.cardSub, { color: colors.textMuted }]}>{viewing.product} · {fmtDate(viewing.date)}</Text>
              </View>
              {((isAtt && viewing.submittedBy === userName &&
                (viewing.status === 'pending_manager' || viewing.status === 'returned')) ||
                isAdmin || isMd || isCeo) && !isEditing && (
                <TouchableOpacity onPress={startEdit} style={{ marginRight: 10 }}>
                  <Ionicons name="create-outline" size={22} color={roleColor} />
                </TouchableOpacity>
              )}
              {((isAtt && viewing.submittedBy === userName &&
                (viewing.status === 'pending_manager' || viewing.status === 'returned')) ||
                isAdmin || isMd) && !isEditing && (
                <TouchableOpacity onPress={handleDelete} style={{ marginRight: 10 }}>
                  <Ionicons name="trash-outline" size={22} color="#E74C3C" />
                </TouchableOpacity>
              )}
              {isEditing && (
                <TouchableOpacity onPress={cancelEdit} style={{ marginRight: 10 }}>
                  <Ionicons name="close-outline" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close-circle" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <StatusBadge status={viewing.status} />

            {viewing.rejectionReason && (
              <View style={[c.rejectionCard, { backgroundColor: '#FCEBEB', borderColor: '#E74C3C44', marginTop: 12 }]}>
                <Ionicons name="alert-circle" size={16} color="#791F1F" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#791F1F', marginBottom: 2 }}>Accountant Rejection Reason</Text>
                  <Text style={{ fontSize: 13, color: '#791F1F' }}>{viewing.rejectionReason}</Text>
                </View>
              </View>
            )}

            {/* Meter & volume */}
            <Text style={[c.sectionLabel, { color: colors.text, marginTop: 16 }]}>Meter Readings</Text>
            <Field label="Opening Meter" value={`${fmtL(viewing.openingMeter)} ${unitForProd(viewing.product)}`} colors={colors} />
            {isEditing ? (
              <>
                <Text style={[c.inputLabel, { color: colors.textMuted, marginTop: 8 }]}>Closing Meter ({unitForProd(viewing.product)})</Text>
                <TextInput
                  style={[c.textInput, { backgroundColor: colors.surface, borderColor: colors.inputBorder ?? colors.border, color: colors.text }]}
                  placeholder="Closing meter" placeholderTextColor={colors.textSubtle}
                  keyboardType="decimal-pad" value={editClose} onChangeText={setEditClose}
                />
              </>
            ) : (
              <Field label="Closing Meter" value={`${fmtL(viewing.closingMeter)} ${unitForProd(viewing.product)}`} colors={colors} />
            )}
            <Field label="Volume Sold" value={`${fmtL(viewing.liters)} ${unitForProd(viewing.product)}`} colors={colors} />
            <Field label="Unit Price" value={`₦${viewing.unitPrice.toLocaleString()}/${unitForProd(viewing.product)}`} colors={colors} />
            <Field label="Gross Amount" value={fmt(viewing.grossAmount)} colors={colors} />

            {/* Payment */}
            <Text style={[c.sectionLabel, { color: colors.text, marginTop: 12 }]}>Payment Breakdown</Text>
            {isEditing ? (
              <>
                {[
                  { label: 'POS', value: editPos, setter: setEditPos },
                  { label: 'Cash', value: editCash, setter: setEditCash },
                  { label: 'Bank Transfer', value: editXfer, setter: setEditXfer },
                  { label: 'Credit to Customer', value: editCredit, setter: setEditCredit },
                ].map(f => (
                  <View key={f.label} style={{ marginBottom: 8 }}>
                    <Text style={[c.inputLabel, { color: colors.textMuted }]}>{f.label}</Text>
                    <TextInput
                      style={[c.textInput, { backgroundColor: colors.surface, borderColor: colors.inputBorder ?? colors.border, color: colors.text, marginBottom: 0 }]}
                      placeholder="0" placeholderTextColor={colors.textSubtle}
                      keyboardType="decimal-pad" value={f.value} onChangeText={f.setter}
                    />
                  </View>
                ))}
              </>
            ) : (
              <>
                <Field label="POS" value={fmt(viewing.posAmount)} colors={colors} />
                <Field label="Cash" value={fmt(viewing.cashAmount)} colors={colors} />
                <Field label="Bank Transfer" value={fmt(viewing.transferAmount)} colors={colors} />
                <Field label="Credit to Customer" value={fmt(viewing.creditAmount ?? 0)} colors={colors} accent="#A85E1A" />
              </>
            )}
            <Field label="Total Collected" value={fmt(viewing.totalCollected)} colors={colors} />
            {(() => {
              const vc = viewing.variance === 0 ? '#27500A' : viewing.variance > 0 ? '#185FA5' : '#791F1F';
              return (
                <View style={[c.varCard, { backgroundColor: vc + '10', borderColor: vc + '33' }]}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: vc }}>
                    {viewing.variance === 0 ? 'Balanced' : viewing.variance > 0 ? 'Overage' : 'Shortage'}
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: vc }}>
                    {viewing.variance === 0 ? '₦0' : (viewing.variance > 0 ? '+' : '') + fmt(viewing.variance)}
                  </Text>
                </View>
              );
            })()}

            {isEditing && (
              <>
                <Text style={[c.inputLabel, { color: colors.textMuted, marginTop: 8 }]}>Notes</Text>
                <TextInput
                  style={[c.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  placeholder="Any remarks…" placeholderTextColor={colors.textSubtle}
                  multiline numberOfLines={3} value={editNote} onChangeText={setEditNote}
                />
                <TouchableOpacity onPress={handleSaveEdit} style={[c.submitBtn, { backgroundColor: roleColor }]}>
                  <Ionicons name="save-outline" size={16} color="#fff" />
                  <Text style={c.submitBtnTxt}>Save Changes</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={cancelEdit} style={[c.submitBtn, { backgroundColor: colors.textSubtle }]}>
                  <Text style={c.submitBtnTxt}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Workflow trail */}
            <Text style={[c.sectionLabel, { color: colors.text, marginTop: 12 }]}>Submission Trail</Text>
            <Field label="Submitted By" value={`${viewing.submittedByName} · ${fmtDateTime(viewing.submittedAt)}`} colors={colors} />
            {viewing.mgrNote && <Field label="Manager Note" value={viewing.mgrNote} colors={colors} />}
            {viewing.mgrBy   && <Field label="Manager Review" value={`${viewing.mgrBy} · ${fmtDateTime(viewing.mgrAt ?? '')}`} colors={colors} />}
            {viewing.accNote && <Field label="Accountant Note" value={viewing.accNote} colors={colors} />}
            {viewing.accBy   && <Field label="Accountant Review" value={`${viewing.accBy} · ${fmtDateTime(viewing.accAt ?? '')}`} colors={colors} />}
            {viewing.note    && <Field label="Attendant Note" value={viewing.note} colors={colors} />}

            {/* Manager actions */}
            {isMgr && viewing.status === 'pending_manager' && (
              <>
                <Text style={[c.sectionLabel, { color: colors.text, marginTop: 16 }]}>Manager Review</Text>
                <TextInput
                  style={[c.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  placeholder="Add your review note (required)…" placeholderTextColor={colors.textSubtle}
                  multiline numberOfLines={3} value={reviewNote} onChangeText={setReviewNote}
                />
                <TouchableOpacity onPress={handleMgrForward} style={[c.submitBtn, { backgroundColor: roleColor }]}>
                  <Ionicons name="arrow-forward-circle" size={16} color="#fff" />
                  <Text style={c.submitBtnTxt}>Forward to Accountant</Text>
                </TouchableOpacity>
              </>
            )}

            {isMgr && viewing.status === 'returned' && (
              <>
                <Text style={[c.sectionLabel, { color: colors.text, marginTop: 16 }]}>Re-submit to Accountant</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>
                  Address the rejection reason above, add a note explaining the corrections, then re-submit.
                </Text>
                <TextInput
                  style={[c.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  placeholder="Explain corrections made (required)…" placeholderTextColor={colors.textSubtle}
                  multiline numberOfLines={3} value={reviewNote} onChangeText={setReviewNote}
                />
                <TouchableOpacity onPress={handleMgrResubmit} style={[c.submitBtn, { backgroundColor: '#185FA5' }]}>
                  <Ionicons name="refresh-circle" size={16} color="#fff" />
                  <Text style={c.submitBtnTxt}>Re-submit to Accountant</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Accountant actions */}
            {isAcc && viewing.status === 'pending_accountant' && (
              <>
                <Text style={[c.sectionLabel, { color: colors.text, marginTop: 16 }]}>Accountant Decision</Text>
                <TextInput
                  style={[c.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  placeholder="Approval note (optional)…" placeholderTextColor={colors.textSubtle}
                  multiline numberOfLines={2} value={reviewNote} onChangeText={setReviewNote}
                />
                <TouchableOpacity onPress={handleAccApprove} style={[c.submitBtn, { backgroundColor: '#27500A' }]}>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={c.submitBtnTxt}>Approve & Lock Report</Text>
                </TouchableOpacity>
                <Text style={[c.sectionLabel, { color: '#791F1F', marginTop: 14 }]}>Reject & Return to Manager</Text>
                <TextInput
                  style={[c.textArea, { backgroundColor: '#FCEBEB', borderColor: '#E74C3C44', color: colors.text }]}
                  placeholder="State the rejection reason (required)…" placeholderTextColor="#c0392b"
                  multiline numberOfLines={3} value={rejectReason} onChangeText={setRejectReason}
                />
                <TouchableOpacity onPress={handleAccReject} style={[c.submitBtn, { backgroundColor: '#791F1F' }]}>
                  <Ionicons name="return-down-back" size={16} color="#fff" />
                  <Text style={c.submitBtnTxt}>Reject — Return to Manager</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      )}

    </ScreenLayout>
  );
}

/* ── Styles ───────────────────────────────────────────── */
const c = StyleSheet.create({
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  tabBar:        { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 2.5 },
  tabLabel:      { fontSize: 13 },
  tabBadge:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9, minWidth: 18, alignItems: 'center' },
  tabBadgeTxt:   { fontSize: 10, fontWeight: '800', color: '#fff' },
  scroll:        { padding: 14 },
  sectionLabel:  { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8, marginTop: 4 },
  pumpChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  pumpChipTxt:   { fontSize: 13, fontWeight: '600' },
  pumpProd:      { fontSize: 10, fontWeight: '500' },
  pumpAvatar:    { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  formCard:      { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  formTitle:     { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  formHint:      { fontSize: 11, marginBottom: 12 },
  meterRow:      { flexDirection: 'row', gap: 10 },
  inputLabel:    { fontSize: 11, fontWeight: '600', marginBottom: 5 },
  textInput:     { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10 },
  readonlyInput: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, marginBottom: 10 },
  readonlyVal:   { fontSize: 14 },
  calcRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  calcTxt:       { fontSize: 13 },
  payInputWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  payInput:      { flex: 1, fontSize: 14 },
  balanceCard:   { borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 10 },
  divider:       { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  textArea:      { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, marginBottom: 10, textAlignVertical: 'top', minHeight: 72 },
  submitBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 4 },
  submitBtnTxt:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  alreadyCard:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  emptyCard:     { alignItems: 'center', padding: 40, borderRadius: 16, borderWidth: 1, gap: 10, marginTop: 20 },
  emptyTxt:      { fontSize: 14, textAlign: 'center' },
  infoBanner:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  infoBannerTxt: { flex: 1, fontSize: 12, lineHeight: 17 },
  initCard:      { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  saveBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  saveBtnTxt:    { color: '#fff', fontSize: 13, fontWeight: '700' },
  card:          { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardTitle:     { fontSize: 14, fontWeight: '700' },
  cardSub:       { fontSize: 12, marginTop: 2 },
  cardFooter:    { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  cardMeta:      { fontSize: 12 },
  badge:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeTxt:      { fontSize: 10, fontWeight: '700' },
  modalOverlay:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:    { maxHeight: '94%', borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  modalTitle:    { fontSize: 16, fontWeight: '800' },
  field:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  fieldLabel:    { fontSize: 12 },
  fieldValue:    { fontSize: 13, fontWeight: '600', maxWidth: '55%', textAlign: 'right' },
  varCard:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 8 },
  rejectionCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  alertBanner:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  todayCard:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, marginBottom: 8 },
  statRow:       { flexDirection: 'row', gap: 8, marginBottom: 4 },
  statTile:      { flex: 1, alignItems: 'center', gap: 4, padding: 14, borderRadius: 14, borderWidth: 1 },
  statNum:       { fontSize: 22, fontWeight: '800' },
  statLbl:       { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  monthCard:     { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 4 },
  monthRow:      { flexDirection: 'row' },
  monthCol:      { flex: 1, alignItems: 'center', padding: 16, gap: 4 },
  monthDivider:  { width: StyleSheet.hairlineWidth },
  monthDividerH: { height: StyleSheet.hairlineWidth },
  monthVal:      { fontSize: 17, fontWeight: '800' },
  monthLbl:      { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  monthFooter:   { textAlign: 'center', fontSize: 11, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  viewAllBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, marginTop: 4 },
  viewAllTxt:    { fontSize: 13, fontWeight: '600' },
});
