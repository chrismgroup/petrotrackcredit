import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ShiftPosSummary } from '@/components/ShiftPosSummary';
import { useBusinessDateConfirmation } from '@/components/BusinessDateConfirmation';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { ModalSheet } from '@/components/FormSheet';
import {
  PumpDailyReport, ROLE_COLORS, currentBusinessDateKey, fmt, fmtDate, fmtDateTime, getPumpOpeningMeter, isFutureBusinessDate, unitForProd, useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { AppliedDateField } from '@/components/AppliedDateField';
import { CreditSalesEditor } from '@/components/CreditSalesEditor';
import {
  buildCreditSales, creditSaleFields, customerLedgerBalance, reportCreditLines, type CreditSaleDraft,
} from '@/lib/customer-ledger';
import { getPriceForPumpOnDate } from '@/lib/price-history';
import { paymentsApi, type ShiftTerminal, type ShiftTerminalAssignment } from '@/lib/api';

/* ── helpers ─────────────────────────────────────────── */
const fmtL = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });
const creditDraftsFor = (report: PumpDailyReport): CreditSaleDraft[] =>
  reportCreditLines(report).map(line => ({ customerId: line.customerId, quantity: String(line.quantity) }));

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending_manager:    { label: "Awaiting Manager's Approval",    color: '#71805B', bg: '#EEF2E4', icon: 'time-outline' },
  pending_accountant: { label: "Awaiting Accountant's Approval", color: '#286247', bg: '#EAF2ED', icon: 'hourglass-outline' },
  returned:           { label: 'Rejected',             color: '#365A47', bg: '#E9F0EB', icon: 'close-circle-outline' },
  returned_attendant: { label: 'With Attendant',       color: '#526B3F', bg: '#EEF2E4', icon: 'return-down-back-outline' },
  approved:           { label: 'Approved',             color: '#1F6848', bg: '#E5F1E9', icon: 'checkmark-circle-outline' },
};

const REPORT_STATUS_GROUPS = ['pending_manager', 'pending_accountant', 'approved', 'returned', 'returned_attendant'] as const;
const REPORT_STATUS_ORDER: Record<PumpDailyReport['status'], number> =
  Object.fromEntries(REPORT_STATUS_GROUPS.map((status, index) => [status, index])) as Record<PumpDailyReport['status'], number>;

function sortShiftReports(a: PumpDailyReport, b: PumpDailyReport): number {
  return REPORT_STATUS_ORDER[a.status] - REPORT_STATUS_ORDER[b.status]
    || b.date.localeCompare(a.date)
    || b.submittedAt.localeCompare(a.submittedAt)
    || b.id - a.id;
}

function reportMatchesQuery(report: PumpDailyReport, query: string, branchName?: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [
    report.pumpName,
    report.product,
    report.branchId,
    branchName,
    report.submittedBy,
    report.submittedByName,
    report.date,
    STATUS_META[report.status]?.label,
  ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery);
}

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

function DeliveryBadge({ status }: { status?: PumpDailyReport['deliveryStatus'] }) {
  const queued = status === 'queued';
  const color = queued ? '#526B3F' : '#1F6848';
  const backgroundColor = queued ? '#EEF2E4' : '#E5F1E9';
  return (
    <View style={[c.badge, { backgroundColor }]}>
      <Ionicons name={queued ? 'cloud-upload-outline' : 'cloud-done-outline'} size={10} color={color} />
      <Text style={[c.badgeTxt, { color }]}>{queued ? 'Queued' : 'Confirmed'}</Text>
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
  const varColor = report.variance === 0 ? '#1F6848' : report.variance > 0 ? '#286247' : '#365A47';
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
        <View style={c.statusColumn}>
          <StatusBadge status={report.status} />
          <DeliveryBadge status={report.deliveryStatus} />
        </View>
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

interface GroupedReportsProps {
  reports: PumpDailyReport[];
  colors: any;
  onPress: (report: PumpDailyReport) => void;
  searchQuery?: string;
  statuses?: readonly PumpDailyReport['status'][];
}

function GroupedReports({ reports, colors, onPress, searchQuery = '', statuses = REPORT_STATUS_GROUPS }: GroupedReportsProps) {
  const [expanded, setExpanded] = useState<Record<PumpDailyReport['status'], boolean>>({
    pending_manager: true,
    pending_accountant: true,
    approved: false,
    returned: false,
    returned_attendant: false,
  });
  const normalizedQuery = searchQuery.trim();
  const matchingReports = reports.filter(report => reportMatchesQuery(report, normalizedQuery));

  return (
    <>
      {statuses.map(status => {
        const group = matchingReports.filter(report => report.status === status).sort(sortShiftReports);
        const meta = STATUS_META[status];
        return (
          <View key={status} style={[c.folder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => setExpanded(current => ({ ...current, [status]: !current[status] }))}
              style={c.folderHeader}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`${meta.label} folder, ${group.length} reports`}
              accessibilityState={{ expanded: normalizedQuery ? true : expanded[status] }}
            >
              <View style={[c.folderIcon, { backgroundColor: meta.bg }]}>
                <Ionicons name={(expanded[status] || normalizedQuery ? 'folder-open-outline' : 'folder-outline') as any} size={18} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[c.folderTitle, { color: colors.text }]}>{meta.label}</Text>
                <Text style={[c.folderHint, { color: colors.textMuted }]}>
                  {group.length === 0 ? (normalizedQuery ? 'No matching reports' : 'No reports in this folder') : `${group.length} report${group.length === 1 ? '' : 's'} · newest first`}
                </Text>
              </View>
              <View style={[c.folderCount, { backgroundColor: meta.bg }]}>
                <Text style={[c.folderCountText, { color: meta.color }]}>{group.length}</Text>
              </View>
              <Ionicons
                name={(normalizedQuery || expanded[status] ? 'chevron-up' : 'chevron-down') as any}
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>
            {(normalizedQuery || expanded[status]) && group.length > 0 && (
              <View style={[c.folderContent, { borderTopColor: colors.border }]}>
                {group.map(report => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    roleColor={meta.color}
                    colors={colors}
                    onPress={() => onPress(report)}
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
      {normalizedQuery.length > 0 && matchingReports.length === 0 && (
        <View style={[c.searchEmpty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={28} color={colors.textSubtle} />
          <Text style={[c.emptyTxt, { color: colors.textMuted }]}>No shift reports match “{searchQuery.trim()}”.</Text>
        </View>
      )}
    </>
  );
}

interface BranchGroupedReportsProps {
  reports: PumpDailyReport[];
  colors: any;
  onPress: (report: PumpDailyReport) => void;
  searchQuery?: string;
  branchNameById: Record<string, string>;
  roleColor: string;
}

/** Groups approved shift reports branch-by-branch, newest first inside each branch. */
function BranchGroupedReports({ reports, colors, onPress, searchQuery = '', branchNameById, roleColor }: BranchGroupedReportsProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const normalizedQuery = searchQuery.trim();

  const groups = useMemo(() => {
    const byBranch = new Map<string, PumpDailyReport[]>();
    for (const report of reports) {
      if (!reportMatchesQuery(report, normalizedQuery, branchNameById[report.branchId])) continue;
      const key = report.branchId || '';
      const list = byBranch.get(key);
      if (list) list.push(report);
      else byBranch.set(key, [report]);
    }
    return Array.from(byBranch.entries())
      .map(([id, list]) => ({
        id,
        name: id ? (branchNameById[id] ?? id) : 'Unassigned Branch',
        list: list.sort((a, b) => b.date.localeCompare(a.date) || b.submittedAt.localeCompare(a.submittedAt) || b.id - a.id),
      }))
      .sort((a, b) => {
        if (!a.id && b.id) return 1;      // unassigned last
        if (a.id && !b.id) return -1;
        return a.name.localeCompare(b.name);
      });
  }, [reports, normalizedQuery, branchNameById]);

  if (groups.length === 0 && normalizedQuery.length > 0) {
    return (
      <View style={[c.searchEmpty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={28} color={colors.textSubtle} />
        <Text style={[c.emptyTxt, { color: colors.textMuted }]}>No approved shift reports match “{normalizedQuery}”.</Text>
      </View>
    );
  }

  return (
    <>
      {groups.map(group => {
        const isOpen = normalizedQuery.length > 0 || !collapsed[group.id];
        return (
          <View key={group.id || 'unassigned'} style={[c.folder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => setCollapsed(current => ({ ...current, [group.id]: !current[group.id] }))}
              style={c.folderHeader}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`${group.name} branch, ${group.list.length} approved reports`}
              accessibilityState={{ expanded: isOpen }}
            >
              <View style={[c.folderIcon, { backgroundColor: roleColor + '18' }]}>
                <Ionicons name="business-outline" size={18} color={roleColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[c.folderTitle, { color: colors.text }]}>{group.name}</Text>
                <Text style={[c.folderHint, { color: colors.textMuted }]}>
                  {group.list.length} approved report{group.list.length === 1 ? '' : 's'} · newest first
                </Text>
              </View>
              <View style={[c.folderCount, { backgroundColor: '#E5F1E9' }]}>
                <Text style={[c.folderCountText, { color: '#1F6848' }]}>{group.list.length}</Text>
              </View>
              <Ionicons name={(isOpen ? 'chevron-up' : 'chevron-down') as any} size={18} color={colors.textMuted} />
            </TouchableOpacity>
            {isOpen && (
              <View style={[c.folderContent, { borderTopColor: colors.border }]}>
                {group.list.map(report => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    roleColor={STATUS_META.approved.color}
                    colors={colors}
                    onPress={() => onPress(report)}
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}

interface ReportSearchProps {
  value: string;
  onChange: (value: string) => void;
  colors: any;
  roleColor: string;
  resultCount: number;
}

function ReportSearch({ value, onChange, colors, roleColor, resultCount }: ReportSearchProps) {
  return (
    <View style={[c.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[c.searchInputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={17} color={colors.textMuted} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="Search by pump, product, branch, staff, or date"
          placeholderTextColor={colors.textSubtle}
          style={[c.searchInput, { color: colors.text }]}
          accessibilityLabel="Search shift reports"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={() => onChange('')} accessibilityRole="button" accessibilityLabel="Clear report search">
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      <View style={c.searchMetaRow}>
        <Ionicons name="folder-open-outline" size={13} color={roleColor} />
        <Text style={[c.searchMeta, { color: colors.textMuted }]}>
          {resultCount} report{resultCount === 1 ? '' : 's'} · folders ordered by approval stage
        </Text>
      </View>
    </View>
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
    role, userName, branchId, pumps, prices, priceHistory, branches, creditCustomers = [], customerPayments = [],
    pumpDailyReports, pumpInitialMeters, pumpLockedMeters,
    submitPumpReportConfirmed, mgrForwardPumpReport,
    accApprovePumpReport, accRejectPumpReport,
    mgrResubmitPumpReport, mgrReturnPumpReportToAttendant, attResubmitPumpReport,
    setPumpInitialMeter, lockPumpMeter, unlockPumpMeter, adminReturnApprovedPumpReport, deletePumpReport, updatePumpReport, correctApprovedPumpReportDate,
  } = useApp();
  const branchNameById = useMemo(() =>
    Object.fromEntries(branches.map(b => [b.id, b.name])) as Record<string, string>,
    [branches]
  );
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'att'] || colors.primary;
  const { requestDateConfirmation, confirmationModal } = useBusinessDateConfirmation();
  const { tab: requestedTab } = useLocalSearchParams<{ tab?: string }>();
  const normalizedRequestedTab = Array.isArray(requestedTab) ? requestedTab[0] : requestedTab;

  const isAtt   = role === 'att';
  const isMgr   = role === 'mgr';
  const isAcc   = role === 'acc';
  const isAdmin = role === 'admin';
  const isMd    = role === 'md';
  const isCeo   = role === 'ceo';
  const isCsm   = role === 'csm';
  const canReviewAsManager = isMgr || isAdmin;
  const canReviewAsAccountant = isAcc || isAdmin;
  const isOwnAttendantReport = (report: PumpDailyReport) =>
    isAtt && (report.submittedBy === userName || report.submittedByName === userName);
  const canView = isAtt || isMgr || isAcc || isAdmin || isMd || isCeo || isCsm;
  const isGlobalOverview = isAcc || isAdmin || isMd || isCeo || isCsm;

  const today = currentBusinessDateKey();
  const activePumps = pumps.filter(p => {
    if (!p.active) return false;
    if (isGlobalOverview) return true;
    if (!branchId || !p.branchId) return false;
    return p.branchId === branchId;               // attendant/mgr — branch-scoped
  });

  /* ── derive opening meter from the latest usable closing or admin initial ── */
  const getOpeningMeter = useCallback((pumpId: string) => {
    return getPumpOpeningMeter(pumpDailyReports, pumpId, pumpLockedMeters, pumpInitialMeters);
  }, [pumpDailyReports, pumpInitialMeters, pumpLockedMeters]);

  /* ── tab state ── */
  const defaultTab = normalizedRequestedTab === 'all_records' && (isAdmin || isMd || isCeo)
    ? 'all_records'
    : isAtt ? 'dashboard' : isMgr ? 'review' : isAcc ? 'pending_acc' : (isMd || isCeo) ? 'all_records' : 'initial';
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
  const [creditDrafts, setCreditDrafts] = useState<CreditSaleDraft[]>([]);
  const [noteAtt, setNoteAtt]         = useState('');
  const [appliesOn, setAppliesOn]     = useState('');
  const [historyDate, setHistoryDate] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  // A terminal belongs to this attendant shift, never to a pump.  We retain
  // manual values during the one-week shadow period and submit provider totals.
  const [shiftTerminals, setShiftTerminals] = useState<ShiftTerminal[]>([]);
  const [terminalAssignments, setTerminalAssignments] = useState<ShiftTerminalAssignment[]>([]);
  const [terminalTotals, setTerminalTotals] = useState({ cardNetKobo: 0, transferNetKobo: 0, netKobo: 0 });
  const [terminalLoading, setTerminalLoading] = useState(false);

  const loadShiftTerminals = useCallback(async () => {
    const result = await paymentsApi.shiftTerminals();
    if (result?.terminals) setShiftTerminals(result.terminals);
  }, []);
  const claimTerminal = useCallback(async (terminal: ShiftTerminal) => {
    setTerminalLoading(true);
    try {
      const result = await paymentsApi.claimShiftTerminal(terminal.id);
      if (!result?.assignment) { Alert.alert('Terminal unavailable', 'This terminal may already be assigned to another active shift.'); return; }
      setTerminalAssignments(current => [...current, result.assignment]);
      await loadShiftTerminals();
    } finally { setTerminalLoading(false); }
  }, [loadShiftTerminals]);
  const releaseAssignment = useCallback(async (assignmentId: string) => {
    const result = await paymentsApi.releaseShiftTerminal(assignmentId);
    if (result?.assignment) {
      setTerminalAssignments(current => current.filter(item => item.id !== assignmentId));
      await loadShiftTerminals();
    }
  }, [loadShiftTerminals]);
  useEffect(() => { if (isAtt) void loadShiftTerminals(); }, [isAtt, loadShiftTerminals]);
  useEffect(() => {
    if (!terminalAssignments.length) { setTerminalTotals({ cardNetKobo: 0, transferNetKobo: 0, netKobo: 0 }); return; }
    let cancelled = false;
    const load = async () => {
      const result = await paymentsApi.shiftTerminalSummary(terminalAssignments.map(item => item.id));
      if (!cancelled && result?.totals) setTerminalTotals({
        cardNetKobo: result.totals.cardNetKobo ?? result.totals.cardKobo,
        transferNetKobo: result.totals.transferNetKobo ?? result.totals.transferKobo,
        netKobo: result.totals.netKobo,
      });
    };
    void load(); const timer = setInterval(() => { void load(); }, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [terminalAssignments]);

  const closeVal  = parseFloat(closeMeter.replace(/,/g, '')) || 0;
  const liters    = closeVal > openingMeter ? parseFloat((closeVal - openingMeter).toFixed(4)) : 0;
  const unitPrice = pump ? getPriceForPumpOnDate(pump, prices, priceHistory, appliesOn || today) : 0;
  const grossAmt  = liters * unitPrice;
  const posVal    = parseFloat(posAmt.replace(/,/g, ''))    || 0;
  const automaticPosVal = terminalAssignments.length ? terminalTotals.cardNetKobo / 100 : null;
  const automaticXferVal = terminalAssignments.length ? terminalTotals.transferNetKobo / 100 : null;
  const reportedPosVal = automaticPosVal ?? posVal;
  const reportedXferVal = automaticXferVal ?? (parseFloat(xferAmt.replace(/,/g, '')) || 0);
  const cashVal   = parseFloat(cashAmt.replace(/,/g, ''))   || 0;
  const xferVal   = parseFloat(xferAmt.replace(/,/g, ''))   || 0;
  const creditVal = Number(creditDrafts
    .reduce((total, draft) => total + (parseFloat(draft.quantity.replace(/,/g, '')) || 0) * unitPrice, 0)
    .toFixed(2));
  const totalColl = reportedPosVal + cashVal + reportedXferVal;
  const variance  = totalColl + creditVal - grossAmt;
  const varColor  = variance === 0 ? '#1F6848' : variance > 0 ? '#286247' : '#365A47';
  const reportBranchId = branchId ?? pump?.branchId ?? '';
  const approvedCreditCustomers = creditCustomers.filter(customer =>
    customer.status === 'approved' && customer.branchId === reportBranchId,
  );

  function handleSubmit() {
    if (!pump) { Alert.alert('Error', 'No active pump selected.'); return; }
    if (!appliesOn) { Alert.alert('Date required', 'Select the date this shift report applies to.'); return; }
    if (isAtt && isFutureBusinessDate(appliesOn, today)) {
      Alert.alert('Future date not allowed', `Attendants can only submit shift reports dated ${fmtDate(today)} or earlier.`);
      return;
    }
    if (liters <= 0) { Alert.alert('Error', 'Closing meter must be greater than opening meter.'); return; }
    if (unitPrice <= 0) { Alert.alert('Price unavailable', 'No approved branch selling price is available for this product on the selected business date.'); return; }
    const credit = buildCreditSales(creditDrafts, creditCustomers, reportBranchId, unitPrice, liters);
    if (!credit.ok) { Alert.alert('Check credit sales', credit.error); return; }
    if (totalColl + credit.totalAmount <= 0) { Alert.alert('Error', 'Enter at least one payment amount (POS, cash, transfer, or credit).'); return; }
    requestDateConfirmation('shift report', appliesOn, async () => {
      const submitted = await submitPumpReportConfirmed({
         date: appliesOn,
        pumpId: pump.id, pumpName: pump.name, product: pump.prod,
        branchId: branchId ?? pump.branchId ?? '',
        openingMeter, closingMeter: closeVal, liters,
        unitPrice, grossAmount: grossAmt,
        posAmount: reportedPosVal, cashAmount: cashVal, transferAmount: reportedXferVal,
        ...creditSaleFields(credit.lines, credit.totalAmount),
        totalCollected: totalColl, variance: totalColl + credit.totalAmount - grossAmt,
        note: noteAtt.trim(),
        submittedBy: userName ?? '', submittedByName: userName ?? '',
      });
      if (!submitted) {
        Alert.alert('Report not saved', 'This report could not be stored on the device. Your entries are still on screen—please try again.');
        return;
      }
      setCloseMeter(''); setPosAmt(''); setCashAmt(''); setXferAmt(''); setCreditDrafts([]); setNoteAtt('');
      setAppliesOn('');
      await Promise.all(terminalAssignments.map(item => paymentsApi.releaseShiftTerminal(item.id)));
      setTerminalAssignments([]);
      const vLabel = variance === 0 ? 'Balanced ✓' : variance > 0 ? `Overage of ${fmt(variance)}` : `Shortage of ${fmt(Math.abs(variance))}`;
      if (submitted === 'queued') {
        Alert.alert(
          'Shift Report Queued',
          `${pump.name} · ${fmtL(liters)}${unitForProd(pump.prod)}\nGross: ${fmt(grossAmt)}\n${vLabel}\nSaved on this device and will retry automatically when the connection returns.`,
        );
      } else {
        Alert.alert('Shift Report Confirmed', `${pump.name} · ${fmtL(liters)}${unitForProd(pump.prod)}\nGross: ${fmt(grossAmt)}\n${vLabel}\nConfirmed by the server and sent to the branch manager for review.`);
      }
      setTab('history');
    });
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
  const [editCreditDrafts, setEditCreditDrafts] = useState<CreditSaleDraft[]>([]);
  const [editNote, setEditNote] = useState('');
  const [editDate, setEditDate] = useState('');
  const [isCorrectingDate, setIsCorrectingDate] = useState(false);
  const [correctedDate, setCorrectedDate] = useState('');
  const [returnToAttendant, setReturnToAttendant] = useState<{
    report: PumpDailyReport;
    note: string;
  } | null>(null);

  function openReport(r: PumpDailyReport) {
    setViewing(r);
    setReviewNote('');
    setRejectReason('');
    setIsEditing(false);
    setEditClose(String(r.closingMeter));
    setEditPos(String(r.posAmount));
    setEditCash(String(r.cashAmount));
    setEditXfer(String(r.transferAmount));
    setEditCreditDrafts(creditDraftsFor(r));
    setEditNote(r.note ?? '');
    setEditDate(r.date);
    setIsCorrectingDate(false);
    setCorrectedDate(r.date);
  }
  function closeModal() {
    setViewing(null);
    setReviewNote('');
    setRejectReason('');
    setIsEditing(false);
    setIsCorrectingDate(false);
    setCorrectedDate('');
  }

  function startEdit() { setIsEditing(true); }
  function cancelEdit() {
    if (!viewing) return;
    setEditClose(String(viewing.closingMeter));
    setEditPos(String(viewing.posAmount));
    setEditCash(String(viewing.cashAmount));
    setEditXfer(String(viewing.transferAmount));
    setEditCreditDrafts(creditDraftsFor(viewing));
    setEditNote(viewing.note ?? '');
    setEditDate(viewing.date);
    setIsEditing(false);
  }

  function startDateCorrection() {
    if (!viewing || !isAdmin || viewing.status !== 'approved') return;
    setCorrectedDate(viewing.date);
    setIsCorrectingDate(true);
  }

  function cancelDateCorrection() {
    if (viewing) setCorrectedDate(viewing.date);
    setIsCorrectingDate(false);
  }

  function handleDateCorrection() {
    if (!viewing || !correctedDate) return;
    if (correctedDate === viewing.date) {
      Alert.alert('No change', 'Choose a different business date to correct this report.');
      return;
    }
    const report = viewing;
    Alert.alert(
      'Correct approved report date?',
      `Move ${report.pumpName} from ${fmtDate(report.date)} to ${fmtDate(correctedDate)}? The approval remains locked and the linked sales date will be updated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Correct date',
          onPress: () => {
            if (!correctApprovedPumpReportDate(report.id, correctedDate)) {
              Alert.alert('Unable to correct date', 'Only an admin can correct the business date of an approved report.');
              return;
            }
            closeModal();
            Alert.alert('Date corrected', 'The approved report and its linked sales record now use the corrected business date.');
          },
        },
      ],
    );
  }

  function handleSaveEdit() {
    if (!viewing) return;
    if (!editDate) { Alert.alert('Date required', 'Select the correct business date before saving.'); return; }
    const closeVal = parseFloat(editClose.replace(/,/g, '')) || 0;
    if (closeVal <= viewing.openingMeter) { Alert.alert('Invalid', 'Closing meter must be greater than opening meter.'); return; }
    const editedCredit = buildCreditSales(
      editCreditDrafts, creditCustomers, viewing.branchId, viewing.unitPrice,
      parseFloat((closeVal - viewing.openingMeter).toFixed(4)),
    );
    if (!editedCredit.ok) { Alert.alert('Check credit sales', editedCredit.error); return; }
    // Older reports may hold credit with no customer; keep it until customers are assigned.
    const keepUnassignedCredit = editedCredit.lines.length === 0 && reportCreditLines(viewing).length === 0;
    requestDateConfirmation('shift report', editDate, () => {
      updatePumpReport(viewing.id, {
        date: editDate,
        closingMeter: closeVal,
        posAmount: parseFloat(editPos.replace(/,/g, '')) || 0,
        cashAmount: parseFloat(editCash.replace(/,/g, '')) || 0,
        transferAmount: parseFloat(editXfer.replace(/,/g, '')) || 0,
        ...(keepUnassignedCredit ? {} : creditSaleFields(editedCredit.lines, editedCredit.totalAmount)),
        note: editNote.trim(),
      });
      setIsEditing(false);
      Alert.alert('Updated', 'Shift report has been updated.');
    }, 'Confirm & save');
  }

  function handleAdminReturn() {
    if (!viewing || !isAdmin || viewing.status !== 'approved') return;
    if (!reviewNote.trim()) {
      Alert.alert('Reason required', 'Explain why this approved report is being returned to the accountant.');
      return;
    }
    const report = viewing;
    Alert.alert(
      'Return approved report?',
      'This reverses its approved sales entry while the accountant reviews it. The accountant can reject it to the manager, who can then return it to the attendant to correct the business date.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Return to accountant',
          onPress: () => {
            if (!adminReturnApprovedPumpReport(report.id, reviewNote)) {
              Alert.alert('Unable to return', 'Only an admin can return an approved report to the accountant.');
              return;
            }
            closeModal();
            Alert.alert('Returned to accountant', 'The report is back with the accountant for review. Its approved sales entry has been reversed while it is corrected.');
          },
        },
      ],
    );
  }

  async function handleDelete() {
    if (!viewing) return;
    if (viewing.status === 'approved' && !isAdmin) {
      Alert.alert('Locked', 'This report was approved by the accountant and is permanently locked. It cannot be deleted or edited.');
      return;
    }
    if (viewing.status === 'pending_accountant' && !isAdmin && !isMd) { Alert.alert('In Review', 'This report is with the accountant and cannot be deleted.'); return; }
    const isApprovedWrongDate = viewing.status === 'approved';
    Alert.alert(
      isApprovedWrongDate ? 'Delete approved report for re-entry?' : 'Delete Report',
      isApprovedWrongDate
        ? `Use this only when ${viewing.pumpName} was approved on the wrong business date. This removes the approved report and sale, resets its opening meter to ${fmtL(viewing.openingMeter)}, and lets the attendant enter and submit a replacement report.`
        : `Delete the shift report for ${viewing.pumpName} on ${fmtDate(viewing.date)}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isApprovedWrongDate ? 'Delete & reopen' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            const deleted = await deletePumpReport(viewing.id);
            if (!deleted) {
              Alert.alert('Unable to delete', 'The report could not be deleted. Check your connection and try again.');
              return;
            }
            closeModal();
            if (isApprovedWrongDate) {
              Alert.alert('Report deleted', 'The opening meter has been reset so the pump attendant can enter and submit the corrected report.');
            }
          },
        },
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

  function handleMgrReturnToAttendant() {
    if (!viewing) return;
    if (!reviewNote.trim()) { Alert.alert('Required', 'Add a note telling the attendant what to correct.'); return; }
    setReturnToAttendant({ report: viewing, note: reviewNote.trim() });
  }

  function confirmMgrReturnToAttendant() {
    if (!returnToAttendant) return;
    const { report, note } = returnToAttendant;
    setReturnToAttendant(null);
    mgrReturnPumpReportToAttendant(report.id, note);
    closeModal();
    Alert.alert('Returned', `Report sent back to ${report.submittedByName} for correction.`);
  }

  function handleAttResubmit() {
    if (!viewing) return;
    if (isFutureBusinessDate(viewing.date, today)) {
      Alert.alert('Future date not allowed', `Attendants can only submit shift reports dated ${fmtDate(today)} or earlier.`);
      return;
    }
    requestDateConfirmation('corrected shift report', viewing.date, () => {
      if (!attResubmitPumpReport(viewing.id, reviewNote.trim())) {
        Alert.alert('Unable to re-submit', 'This shift report cannot be submitted with a future business date.');
        return;
      }
      Alert.alert('Re-submitted', 'Your corrected report was sent to the branch manager for review.');
      closeModal();
    });
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
       .sort(sortShiftReports),
    [pumpDailyReports, userName, branchId, isGlobalOverview]
  );

  const pendingMgr = useMemo(() =>
    pumpDailyReports.filter(r => r.status === 'pending_manager' && (isGlobalOverview || inMyBranch(r)))
      .sort(sortShiftReports),
    [pumpDailyReports, branchId, isGlobalOverview]
  );
  const returnedMgr = useMemo(() =>
    pumpDailyReports.filter(r => r.status === 'returned' && (isGlobalOverview || inMyBranch(r)))
      .sort(sortShiftReports),
    [pumpDailyReports, branchId]
  );
  const returnedAttMgr = useMemo(() =>
    pumpDailyReports.filter(r => r.status === 'returned_attendant' && (isGlobalOverview || inMyBranch(r)))
      .sort(sortShiftReports),
    [pumpDailyReports, branchId, isGlobalOverview]
  );
  const pendingAcc = useMemo(() =>
    pumpDailyReports.filter(r => r.status === 'pending_accountant')
      .sort(sortShiftReports),
    [pumpDailyReports]
  );
  const pendingAccMgr = useMemo(() =>
    pumpDailyReports.filter(r => r.status === 'pending_accountant' && (isGlobalOverview || inMyBranch(r)))
      .sort(sortShiftReports),
    [pumpDailyReports, branchId, isGlobalOverview]
  );
  const approvedAll = useMemo(() =>
    pumpDailyReports.filter(r => r.status === 'approved')
      .sort(sortShiftReports),
    [pumpDailyReports]
  );
  const allReports = useMemo(() =>
    [...pumpDailyReports].sort(sortShiftReports),
    [pumpDailyReports]
  );
  const reviewReports = useMemo(() =>
    [...pendingMgr, ...pendingAccMgr, ...returnedMgr, ...returnedAttMgr].sort(sortShiftReports),
    [pendingMgr, pendingAccMgr, returnedMgr, returnedAttMgr]
  );
  const historyReports = useMemo(() =>
    myReports.filter(r => !historyDate || r.date === historyDate),
    [myReports, historyDate]
  );

  /* ── attendant dashboard stats ── */
  const attReports = useMemo(() =>
    [...pumpDailyReports]
      .filter(r => r.submittedBy === userName && (isGlobalOverview || inMyBranch(r)))
      .sort(sortShiftReports),
    [pumpDailyReports, userName, branchId, isGlobalOverview]
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
    pending:  attReports.filter(r => r.status === 'pending_manager' || r.status === 'pending_accountant' || r.status === 'returned').length,
    returned: attReports.filter(r => r.status === 'returned_attendant').length,
  }), [attReports]);
  const todayPumpStatus = useMemo(() =>
    activePumps.map(p => ({
      pump: p,
      report: pumpDailyReports.find(r => r.date === today && r.pumpId === p.id) ?? null,
    })),
    [activePumps, pumpDailyReports, today]
  );
  const returnedReports = useMemo(() =>
    attReports.filter(r => r.status === 'returned_attendant'),
    [attReports]
  );

  /* ── tab definitions ── */
  type Tab = 'dashboard' | 'submit' | 'history' | 'review' | 'pending_acc' | 'approved' | 'initial' | 'all_records';
  const tabs: { key: Tab; label: string; badge?: number; roles: string[] }[] = [
    { key: 'dashboard',   label: 'My Summary',    badge: returnedReports.length || undefined, roles: ['att'] },
    { key: 'submit',      label: 'Record Meters', roles: ['att'] },
    { key: 'history',     label: 'My History',    roles: ['att'] },
    { key: 'review',      label: 'Review',        badge: pendingMgr.length + returnedMgr.length + returnedAttMgr.length, roles: ['mgr'] },
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
              testID={`shift-tab-${t.key}`}
              style={[c.tabBtn, { borderBottomColor: active ? roleColor : 'transparent' }]}>
              <Text style={[c.tabLabel, { color: active ? roleColor : colors.textMuted, fontWeight: active ? '700' : '400' }]}>
                {t.label}
              </Text>
              {!!t.badge && t.badge > 0 && (
                <View style={[c.tabBadge, { backgroundColor: '#365A47' }]}>
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
            <View style={[c.alertBanner, { backgroundColor: '#E9F0EB', borderColor: '#365A4755' }]}>
              <Ionicons name="alert-circle" size={18} color="#365A47" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#365A47' }}>
                  {returnedReports.length} report{returnedReports.length > 1 ? 's' : ''} returned for correction
                </Text>
                {returnedReports.slice(0, 3).map(report => (
                  <View key={report.id} style={{ marginTop: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#365A47' }}>
                      {report.pumpName} · {fmtDate(report.date)}
                    </Text>
                    <Text style={{ fontSize: 11, lineHeight: 16, color: '#365A47', marginTop: 1 }}>
                      {report.mgrNote?.trim() || 'Your manager did not add a correction note.'}
                    </Text>
                  </View>
                ))}
                {returnedReports.length > 3 && (
                  <Text style={{ fontSize: 11, color: '#365A47', marginTop: 5 }}>
                    +{returnedReports.length - 3} more correction{returnedReports.length - 3 === 1 ? '' : 's'} in My History
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setTab('history')}
                style={{ backgroundColor: '#365A47', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
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
                  <View style={c.statusColumn}>
                    <View style={[c.badge, { backgroundColor: sm.bg }]}>
                      <Ionicons name={sm.icon as any} size={10} color={sm.color} />
                      <Text style={[c.badgeTxt, { color: sm.color }]}>{sm.label}</Text>
                    </View>
                    <DeliveryBadge status={r?.deliveryStatus} />
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
            <View style={[c.statTile, { backgroundColor: '#E5F1E9', borderColor: '#1F684822' }]}>
              <Ionicons name="checkmark-circle" size={20} color="#1F6848" />
              <Text style={[c.statNum, { color: '#1F6848' }]}>{statusCounts.approved}</Text>
              <Text style={[c.statLbl, { color: '#1F6848' }]}>Approved</Text>
            </View>
            <View style={[c.statTile, { backgroundColor: '#EEF2E4', borderColor: '#71805B22' }]}>
              <Ionicons name="hourglass" size={20} color="#71805B" />
              <Text style={[c.statNum, { color: '#71805B' }]}>{statusCounts.pending}</Text>
              <Text style={[c.statLbl, { color: '#71805B' }]}>In Review</Text>
            </View>
            <View style={[c.statTile, { backgroundColor: '#E9F0EB', borderColor: '#365A4722' }]}>
              <Ionicons name="return-down-back" size={20} color="#365A47" />
              <Text style={[c.statNum, { color: '#365A47' }]}>{statusCounts.returned}</Text>
              <Text style={[c.statLbl, { color: '#365A47' }]}>Returned</Text>
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
                  const vc = dashTotals.variance === 0 ? '#1F6848' : dashTotals.variance > 0 ? '#286247' : '#365A47';
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
        <KeyboardAwareScrollViewCompat contentContainerStyle={c.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" bottomOffset={24}>

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

              <AppliedDateField
                value={appliesOn}
                onChange={setAppliesOn}
                label="Business date generated *"
                accent={roleColor}
                helper="Select the date the shift report was generated. Submission time is recorded separately."
              />

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
                          testID="shift-closing-meter"
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

                  <View style={[c.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[c.formTitle, { color: colors.text }]}>Shift POS terminals</Text>
                    <Text style={[c.formHint, { color: colors.textMuted }]}>Select the terminal picked up at the start of shift. Add a replacement if it fails. Moniepoint totals are assigned to this shift automatically.</Text>
                    {terminalAssignments.map(assignment => {
                      const terminal = shiftTerminals.find(item => item.id === assignment.terminalId);
                      return <View key={assignment.id} style={c.terminalRow}>
                        <Text style={[c.terminalText, { color: colors.text }]}>{terminal?.label ?? 'Assigned POS terminal'}</Text>
                        <TouchableOpacity onPress={() => void releaseAssignment(assignment.id)}><Text style={{ color: colors.error, fontWeight: '700' }}>Replace</Text></TouchableOpacity>
                      </View>;
                    })}
                    {shiftTerminals.filter(item => item.available).map(terminal => (
                      <TouchableOpacity key={terminal.id} disabled={terminalLoading} onPress={() => void claimTerminal(terminal)} style={[c.terminalPick, { borderColor: colors.border }]}>
                        <Ionicons name="card-outline" size={16} color={colors.primary} />
                        <Text style={[c.terminalText, { color: colors.text }]}>{terminal.label} · {terminal.providerTerminalId}</Text>
                        <Text style={{ color: colors.primary, fontWeight: '700' }}>{terminalAssignments.length ? 'Add replacement' : 'Start shift'}</Text>
                      </TouchableOpacity>
                    ))}
                    {terminalAssignments.length ? <View style={[c.calcRow, { backgroundColor: roleColor + '12', borderColor: roleColor + '33' }]}>
                      <Text style={[c.calcTxt, { color: roleColor }]}>Automatic Moniepoint: POS {fmt(automaticPosVal ?? 0)} · Transfer {fmt(automaticXferVal ?? 0)} · Total {fmt(terminalTotals.netKobo / 100)}</Text>
                    </View> : null}
                  </View>

                  {/* Payment breakdown */}
                  <View style={[c.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[c.formTitle, { color: colors.text }]}>Payment Breakdown</Text>
                    <Text style={[c.formHint, { color: colors.textMuted }]}>Enter all amounts received and the customer’s quantity. Petrotrack calculates the customer amount from the branch price for the selected business date. An available advance is applied automatically.</Text>

                    {[
                      { label: terminalAssignments.length ? 'Manual POS (shadow comparison) (₦)' : 'POS Amount (₦)', val: posAmt, set: setPosAmt, icon: 'card-outline', color: '#286247' },
                      { label: 'Cash Amount (₦)', val: cashAmt, set: setCashAmt, icon: 'cash-outline', color: '#1F6848' },
                      { label: terminalAssignments.length ? 'Manual Transfer (shadow comparison) (₦)' : 'Bank Transfer (₦)', val: xferAmt, set: setXferAmt, icon: 'swap-horizontal-outline', color: '#315F49' },
                    ].map(f => (
                      <View key={f.label} style={{ marginBottom: 10 }}>
                        <Text style={[c.inputLabel, { color: colors.textMuted }]}>{f.label}</Text>
                        <View style={[c.payInputWrap, { backgroundColor: colors.background, borderColor: colors.inputBorder ?? colors.border }]}>
                          <Ionicons name={f.icon as any} size={15} color={f.color} />
                          <TextInput
                            testID={`shift-payment-${f.label.split(' ')[0].toLowerCase()}`}
                            style={[c.payInput, { color: colors.text }]}
                            placeholder="0.00" placeholderTextColor={colors.textSubtle}
                            keyboardType="decimal-pad" value={f.val} onChangeText={f.set}
                          />
                        </View>
                      </View>
                    ))}

                    <CreditSalesEditor
                      customers={approvedCreditCustomers}
                      drafts={creditDrafts}
                      onChange={setCreditDrafts}
                      unitPrice={unitPrice}
                      unit={pump ? unitForProd(pump.prod) : 'L'}
                      accent={roleColor}
                      balanceFor={customerId => customerLedgerBalance(customerId, pumpDailyReports, customerPayments, appliesOn || today)}
                    />

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
                            <Text style={{ fontSize: 12, color: '#62754D' }}>Credit to Customer</Text>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#62754D' }}>{fmt(creditVal)}</Text>
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
                    testID="shift-note"
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
            </>
          )}
          <View style={{ height: 24 }} />
        </KeyboardAwareScrollViewCompat>
      )}

      {/* ══ HISTORY ══ */}
      {tab === 'history' && (
        <ScrollView contentContainerStyle={c.scroll} showsVerticalScrollIndicator={false}>
          <ReportSearch
            value={reportSearch}
            onChange={setReportSearch}
            colors={colors}
            roleColor={roleColor}
            resultCount={historyReports.filter(r => reportMatchesQuery(r, reportSearch)).length}
          />
          <AppliedDateField
            value={historyDate}
            onChange={setHistoryDate}
            label="View shift reports for a date"
            accent={roleColor}
            helper="Filter by the business date the shift report applies to."
          />
          {historyReports.length === 0 && (
            <View style={[c.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="document-outline" size={36} color={colors.textSubtle} />
              <Text style={[c.emptyTxt, { color: colors.textMuted }]}>No shift reports yet</Text>
            </View>
          )}
          <GroupedReports
            reports={historyReports}
            colors={colors}
            onPress={openReport}
            searchQuery={reportSearch}
          />
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ══ MANAGER: REVIEW ══ */}
      {tab === 'review' && isMgr && (
        <ScrollView contentContainerStyle={c.scroll} showsVerticalScrollIndicator={false}>
          <ReportSearch
            value={reportSearch}
            onChange={setReportSearch}
            colors={colors}
            roleColor={roleColor}
            resultCount={reviewReports.filter(r => reportMatchesQuery(r, reportSearch)).length}
          />
          {reviewReports.length === 0 && (
            <View style={[c.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="checkmark-done-circle-outline" size={36} color={colors.textSubtle} />
              <Text style={[c.emptyTxt, { color: colors.textMuted }]}>No shift reports awaiting your review</Text>
            </View>
          )}
          {reviewReports.length > 0 && (
            <GroupedReports
              reports={reviewReports}
              colors={colors}
              onPress={openReport}
              searchQuery={reportSearch}
              statuses={['pending_manager', 'returned', 'returned_attendant', 'pending_accountant']}
            />
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ══ ACCOUNTANT: PENDING APPROVAL ══ */}
      {tab === 'pending_acc' && isAcc && (
        <ScrollView contentContainerStyle={c.scroll} showsVerticalScrollIndicator={false}>
          <ReportSearch
            value={reportSearch}
            onChange={setReportSearch}
            colors={colors}
            roleColor={roleColor}
            resultCount={pendingAcc.filter(r => reportMatchesQuery(r, reportSearch)).length}
          />
          {pendingAcc.length === 0 && (
            <View style={[c.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="checkmark-circle-outline" size={36} color={colors.textSubtle} />
              <Text style={[c.emptyTxt, { color: colors.textMuted }]}>No shift reports pending approval</Text>
            </View>
          )}
          {pendingAcc.filter(r => reportMatchesQuery(r, reportSearch)).map(r => (
            <ReportCard key={r.id} report={r} roleColor={roleColor} colors={colors} onPress={() => openReport(r)} />
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ══ APPROVED HISTORY ══ */}
      {tab === 'approved' && (
        <ScrollView contentContainerStyle={c.scroll} showsVerticalScrollIndicator={false}>
          <ReportSearch
            value={reportSearch}
            onChange={setReportSearch}
            colors={colors}
            roleColor={roleColor}
            resultCount={approvedAll.filter(r => reportMatchesQuery(r, reportSearch)).length}
          />
          {approvedAll.length === 0 && (
            <View style={[c.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="document-text-outline" size={36} color={colors.textSubtle} />
              <Text style={[c.emptyTxt, { color: colors.textMuted }]}>No approved shift reports yet</Text>
            </View>
          )}
          {approvedAll.length > 0 && (
            <BranchGroupedReports
              reports={approvedAll}
              colors={colors}
              onPress={openReport}
              searchQuery={reportSearch}
              branchNameById={branchNameById}
              roleColor={roleColor}
            />
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ══ ADMIN / MD / CEO: ALL RECORDS ══ */}
      {tab === 'all_records' && (
        <ScrollView contentContainerStyle={c.scroll} showsVerticalScrollIndicator={false}>
          <ReportSearch
            value={reportSearch}
            onChange={setReportSearch}
            colors={colors}
            roleColor={roleColor}
            resultCount={allReports.filter(r => reportMatchesQuery(r, reportSearch)).length}
          />
          {allReports.length === 0 && (
            <View style={[c.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="document-text-outline" size={36} color={colors.textSubtle} />
              <Text style={[c.emptyTxt, { color: colors.textMuted }]}>No shift reports submitted yet</Text>
            </View>
          )}
          {allReports.length > 0 && (
            <>
              <GroupedReports
                reports={allReports}
                colors={colors}
                onPress={openReport}
                searchQuery={reportSearch}
              />
            </>
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ══ ADMIN: SET INITIAL METERS ══ */}
      {tab === 'initial' && isAdmin && (
        <KeyboardAwareScrollViewCompat contentContainerStyle={c.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" bottomOffset={24}>
          <View style={[c.infoBanner, { backgroundColor: colors.info + '18', borderColor: colors.info }]}>
            <Ionicons name="information-circle" size={16} color={colors.info} />
            <Text style={[c.infoBannerTxt, { color: colors.info }]}>
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
              <View key={p.id} style={[c.initCard, { backgroundColor: colors.surface, borderColor: isLocked ? '#365A4755' : colors.border }]}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <View style={[c.pumpAvatar, { backgroundColor: isLocked ? '#E9F0EB' : roleColor + '18' }]}>
                    <Ionicons name={isLocked ? 'lock-closed' : 'speedometer-outline'} size={18} color={isLocked ? '#365A47' : roleColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[c.cardTitle, { color: colors.text }]}>{p.name}</Text>
                    <Text style={[c.cardSub, { color: colors.textMuted }]}>{p.prod}</Text>
                  </View>
                  {isLocked ? (
                    <View style={[c.badge, { backgroundColor: '#E9F0EB' }]}>
                      <Ionicons name="lock-closed" size={10} color="#365A47" />
                      <Text style={[c.badgeTxt, { color: '#365A47' }]}>LOCKED</Text>
                    </View>
                  ) : current !== undefined ? (
                    <View style={[c.badge, { backgroundColor: '#E5F1E9' }]}>
                      <Text style={[c.badgeTxt, { color: '#1F6848' }]}>Seed: {fmtL(current)}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Current effective opening */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 2 }}>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>Current opening (attendant sees)</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isLocked ? '#365A47' : colors.text }}>
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E9F0EB', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <Ionicons name="lock-closed" size={14} color="#365A47" />
                    <Text style={{ flex: 1, fontSize: 12, color: '#365A47' }}>
                      Opening meter locked at {fmtL(locked)} {unitForProd(p.prod)}
                    </Text>
                    <TouchableOpacity onPress={() => handleUnlockMeter(p.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#365A47', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 }}>
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
                <Text style={[c.inputLabel, { color: '#365A47', marginBottom: 4 }]}>Override &amp; lock opening meter (L)</Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TextInput
                    style={[c.textInput, { flex: 1, marginBottom: 0, backgroundColor: colors.background, borderColor: '#365A4744', color: colors.text }]}
                    placeholder="Enter new opening meter to lock"
                    placeholderTextColor={colors.textSubtle}
                    keyboardType="decimal-pad"
                    value={lockInputs[p.id] ?? ''}
                    onChangeText={v => setLockInputs(m => ({ ...m, [p.id]: v }))}
                  />
                  <TouchableOpacity onPress={() => handleLockMeter(p.id)}
                    style={[c.saveBtn, { backgroundColor: '#365A47' }]}>
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
        </KeyboardAwareScrollViewCompat>
      )}

      {/* ══ DETAIL MODAL ══ */}
      {!!viewing && (
        <View style={c.modalOverlay}>
          <KeyboardAwareScrollViewCompat style={[c.modalSheet, { backgroundColor: colors.background }]}
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
              {viewing.deliveryStatus !== 'queued' && ((isOwnAttendantReport(viewing) &&
                (viewing.status === 'pending_manager' || viewing.status === 'returned' || viewing.status === 'returned_attendant')) ||
                ((isAdmin || isMd || isCeo) && viewing.status !== 'approved')) && !isEditing && !isCorrectingDate && (
                <TouchableOpacity onPress={startEdit} style={{ marginRight: 10 }}>
                  <Ionicons name="create-outline" size={22} color={roleColor} />
                </TouchableOpacity>
              )}
              {isAdmin && viewing.status === 'approved' && !isCorrectingDate && (
                <TouchableOpacity onPress={startDateCorrection} style={{ marginRight: 10 }}>
                  <Ionicons name="calendar-outline" size={22} color={roleColor} />
                </TouchableOpacity>
              )}
              {viewing.deliveryStatus !== 'queued' && ((isOwnAttendantReport(viewing) &&
                (viewing.status === 'pending_manager' || viewing.status === 'returned' || viewing.status === 'returned_attendant')) ||
                ((isAdmin || isMd) && viewing.status !== 'approved') ||
                (isAdmin && viewing.status === 'approved')) && !isEditing && !isCorrectingDate && (
                <TouchableOpacity onPress={handleDelete} style={{ marginRight: 10 }}>
                  <Ionicons name="trash-outline" size={22} color="#365A47" />
                </TouchableOpacity>
              )}
              {(isEditing || isCorrectingDate) && (
                <TouchableOpacity onPress={isCorrectingDate ? cancelDateCorrection : cancelEdit} style={{ marginRight: 10 }}>
                  <Ionicons name="close-outline" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close-circle" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={c.deliveryRow}>
              <StatusBadge status={viewing.status} />
              <DeliveryBadge status={viewing.deliveryStatus} />
            </View>
            {viewing.deliveryStatus === 'queued' && (
              <View style={[c.lockedNotice, { backgroundColor: '#EEF2E4', borderColor: '#71805B44' }]}>
                <Ionicons name="cloud-upload-outline" size={14} color="#526B3F" />
                <Text style={{ flex: 1, fontSize: 12, color: '#526B3F' }}>
                  Queued on this device. Petrotrack will retry after login, reconnect, or when the app returns to the foreground.
                </Text>
              </View>
            )}

            {viewing.status === 'approved' && (
              <View style={[c.lockedNotice, { backgroundColor: '#E5F1E9', borderColor: '#1F684844' }]}>
                <Ionicons name="lock-closed-outline" size={14} color="#1F6848" />
                <Text style={{ flex: 1, fontSize: 12, color: '#1F6848' }}>
                  Approved by the accountant and locked. Admin can correct its business date, return it to the accountant for a correction workflow, or delete it only to re-enter a wrong-date report.
                </Text>
              </View>
            )}

            {isCorrectingDate && (
              <View style={[c.dateCorrectionCard, { backgroundColor: '#EAF2ED', borderColor: '#28624744' }]}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#286247' }}>Correct business date</Text>
                <Text style={{ fontSize: 12, color: '#286247', marginTop: 3 }}>
                  Use only when an approved report was submitted against the wrong operating day. This keeps approval locked and updates the linked sales date.
                </Text>
                <AppliedDateField
                  value={correctedDate}
                  onChange={setCorrectedDate}
                  label="Corrected applies-on date"
                  accent="#286247"
                  helper="The original date and this correction are retained in the audit trail."
                />
                <TouchableOpacity onPress={handleDateCorrection} style={[c.submitBtn, { backgroundColor: '#286247' }]}>
                  <Ionicons name="calendar-outline" size={16} color="#fff" />
                  <Text style={c.submitBtnTxt}>Save corrected date</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={cancelDateCorrection} style={[c.submitBtn, { backgroundColor: colors.textSubtle }]}>
                  <Text style={c.submitBtnTxt}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {viewing.rejectionReason && (
              <View style={[c.rejectionCard, { backgroundColor: '#E9F0EB', borderColor: '#365A4744', marginTop: 12 }]}>
                <Ionicons name="alert-circle" size={16} color="#365A47" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#365A47', marginBottom: 2 }}>Accountant Rejection Reason</Text>
                  <Text style={{ fontSize: 13, color: '#365A47' }}>{viewing.rejectionReason}</Text>
                </View>
              </View>
            )}

            {/* Meter & volume */}
            <Text style={[c.sectionLabel, { color: colors.text, marginTop: 16 }]}>Meter Readings</Text>
            {isEditing && (
              <AppliedDateField
                value={editDate}
                onChange={setEditDate}
                label="Applies-on business date"
                accent={roleColor}
                helper="Use the operating day this shift actually belongs to."
              />
            )}
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
                {viewing.creditAmount > 0 && reportCreditLines(viewing).length === 0 && editCreditDrafts.length === 0 && (
                  <Text style={[c.formHint, { color: colors.error, marginBottom: 6 }]}>
                    This older report has {fmt(viewing.creditAmount)} of credit with no customer. Select the approved customers to assign it.
                  </Text>
                )}
                <CreditSalesEditor
                  customers={creditCustomers.filter(customer => customer.status === 'approved' && customer.branchId === viewing.branchId)}
                  drafts={editCreditDrafts}
                  onChange={setEditCreditDrafts}
                  unitPrice={viewing.unitPrice}
                  unit={unitForProd(viewing.product)}
                  accent={roleColor}
                  testIDPrefix="edit-credit"
                />
              </>
            ) : (
              <>
                <Field label="POS" value={fmt(viewing.posAmount)} colors={colors} />
                <Field label="Cash" value={fmt(viewing.cashAmount)} colors={colors} />
                <Field label="Bank Transfer" value={fmt(viewing.transferAmount)} colors={colors} />
                <Field label="Credit to Customer" value={fmt(viewing.creditAmount ?? 0)} colors={colors} accent="#62754D" />
                {(viewing.creditAmount ?? 0) > 0 && (() => {
                  const creditLines = reportCreditLines(viewing);
                  if (creditLines.length === 0) {
                    return <Field label="Credit Customer" value="Not assigned" colors={colors} accent="#62754D" />;
                  }
                  return creditLines.map(line => (
                    <Field
                      key={line.customerId}
                      label={`Credit · ${line.customerName || 'Customer'}`}
                      value={`${fmtL(line.quantity)} ${unitForProd(viewing.product)} · ${fmt(line.amount)}`}
                      colors={colors}
                      accent="#62754D"
                    />
                  ));
                })()}
              </>
            )}
            <Field label="Total Collected" value={fmt(viewing.totalCollected)} colors={colors} />
            <ShiftPosSummary
              role={role}
              pumpId={viewing.pumpId}
              branchId={viewing.branchId}
              date={viewing.date}
              reportedPos={viewing.posAmount}
              reportedTransfer={viewing.transferAmount}
            />
            {(() => {
              const vc = viewing.variance === 0 ? '#1F6848' : viewing.variance > 0 ? '#286247' : '#365A47';
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
            {viewing.adminReturnedAt && (
              <Field
                label="Admin Return for Correction"
                value={`${viewing.adminReturnedBy ?? 'Admin'} · ${fmtDateTime(viewing.adminReturnedAt)}${viewing.adminReturnNote ? ` — ${viewing.adminReturnNote}` : ''}`}
                colors={colors}
              />
            )}
            {viewing.dateCorrectedAt && (
              <Field
                label="Business Date Correction"
                value={`${fmtDate(viewing.dateCorrectedFrom ?? viewing.date)} → ${fmtDate(viewing.date)} · ${viewing.dateCorrectedBy ?? 'Admin'} · ${fmtDateTime(viewing.dateCorrectedAt)}`}
                colors={colors}
              />
            )}
            {viewing.note    && <Field label="Attendant Note" value={viewing.note} colors={colors} />}

            {/* Manager actions */}
            {canReviewAsManager && viewing.status === 'pending_manager' && (
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

            {canReviewAsManager && viewing.status === 'returned' && (
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
                <TouchableOpacity onPress={handleMgrResubmit} style={[c.submitBtn, { backgroundColor: '#286247' }]}>
                  <Ionicons name="refresh-circle" size={16} color="#fff" />
                  <Text style={c.submitBtnTxt}>Re-submit to Accountant</Text>
                </TouchableOpacity>
                <Text style={[c.sectionLabel, { color: '#526B3F', marginTop: 14 }]}>Reject & Return to Attendant</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>
                  Reject this returned report and send it back to {viewing.submittedByName} so they can correct the business date or figures before re-submitting it. The note above is required and will be shown to them.
                </Text>
                <TouchableOpacity onPress={handleMgrReturnToAttendant} style={[c.submitBtn, { backgroundColor: '#526B3F' }]}>
                  <Ionicons name="return-down-back" size={16} color="#fff" />
                  <Text style={c.submitBtnTxt}>Reject — Return to Attendant</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Attendant action: correct and re-submit a returned or rejected report */}
            {isOwnAttendantReport(viewing) &&
              (viewing.status === 'returned' || viewing.status === 'returned_attendant') && (
              <>
                <Text style={[c.sectionLabel, { color: colors.text, marginTop: 16 }]}>Correct & Re-submit</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>
                  This report was returned for correction. Use the pencil icon above to correct the business date or figures, then re-submit it to your manager for review.
                </Text>
                <TextInput
                  style={[c.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  placeholder="Note about your corrections (optional)…" placeholderTextColor={colors.textSubtle}
                  multiline numberOfLines={3} value={reviewNote} onChangeText={setReviewNote}
                />
                <TouchableOpacity onPress={handleAttResubmit} style={[c.submitBtn, { backgroundColor: roleColor }]}>
                  <Ionicons name="send" size={16} color="#fff" />
                  <Text style={c.submitBtnTxt}>Re-submit to Manager</Text>
                </TouchableOpacity>
              </>
            )}

            {isAdmin && viewing.status === 'approved' && (
              <>
                <Text style={[c.sectionLabel, { color: '#526B3F', marginTop: 16 }]}>Return for Correction</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>
                  Return this approved report to the accountant when its date must be corrected through the full review chain.
                </Text>
                <TextInput
                  style={[c.textArea, { backgroundColor: '#FFF4E5', borderColor: '#D9770644', color: colors.text }]}
                  placeholder="Explain why the report is being returned (required)…" placeholderTextColor={colors.textSubtle}
                  multiline numberOfLines={3} value={reviewNote} onChangeText={setReviewNote}
                />
                <TouchableOpacity onPress={handleAdminReturn} style={[c.submitBtn, { backgroundColor: '#526B3F' }]}>
                  <Ionicons name="return-down-back" size={16} color="#fff" />
                  <Text style={c.submitBtnTxt}>Return to Accountant</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Accountant actions */}
            {canReviewAsAccountant && viewing.status === 'pending_accountant' && (
              <>
                <Text style={[c.sectionLabel, { color: colors.text, marginTop: 16 }]}>Accountant Decision</Text>
                <TextInput
                  style={[c.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  placeholder="Approval note (optional)…" placeholderTextColor={colors.textSubtle}
                  multiline numberOfLines={2} value={reviewNote} onChangeText={setReviewNote}
                />
                <TouchableOpacity onPress={handleAccApprove} style={[c.submitBtn, { backgroundColor: '#1F6848' }]}>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={c.submitBtnTxt}>Approve & Lock Report</Text>
                </TouchableOpacity>
                <Text style={[c.sectionLabel, { color: '#365A47', marginTop: 14 }]}>Reject & Return to Manager</Text>
                <TextInput
                  style={[c.textArea, { backgroundColor: '#E9F0EB', borderColor: '#365A4744', color: colors.text }]}
                  placeholder="State the rejection reason (required)…" placeholderTextColor="#365A47"
                  multiline numberOfLines={3} value={rejectReason} onChangeText={setRejectReason}
                />
                <TouchableOpacity onPress={handleAccReject} style={[c.submitBtn, { backgroundColor: '#365A47' }]}>
                  <Ionicons name="return-down-back" size={16} color="#fff" />
                  <Text style={c.submitBtnTxt}>Reject — Return to Manager</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={{ height: 20 }} />
          </KeyboardAwareScrollViewCompat>
        </View>
      )}
      {confirmationModal}
      <ModalSheet visible={returnToAttendant !== null} onClose={() => setReturnToAttendant(null)}>
        <View style={[c.confirmSheet, { backgroundColor: colors.surface }]}>
          <View style={c.confirmIcon}>
            <Ionicons name="return-down-back" size={22} color="#526B3F" />
          </View>
          <Text style={[c.confirmTitle, { color: colors.text }]}>Return to Attendant?</Text>
          <Text style={[c.confirmBody, { color: colors.textMuted }]}>
            Send this report back to {returnToAttendant?.report.submittedByName ?? 'the attendant'} for correction?
          </Text>
          <View style={c.confirmActions}>
            <TouchableOpacity
              onPress={() => setReturnToAttendant(null)}
              style={[c.confirmCancel, { borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Cancel return to attendant"
            >
              <Text style={[c.confirmCancelText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmMgrReturnToAttendant}
              style={c.confirmReturn}
              accessibilityRole="button"
              accessibilityLabel="Confirm return to attendant"
            >
              <Text style={c.confirmReturnText}>Return</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ModalSheet>
    </ScreenLayout>
  );
}

/* ── Styles ───────────────────────────────────────────── */
const c = StyleSheet.create({
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  tabBar:        { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 2.5 },
  tabLabel:      { fontSize: 13 },
  confirmSheet:  { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 },
  confirmIcon:   { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2E4' },
  confirmTitle:  { fontSize: 20, fontWeight: '800' },
  confirmBody:   { fontSize: 14, lineHeight: 20 },
  confirmActions:{ flexDirection: 'row', gap: 8, marginTop: 4 },
  confirmCancel: { flex: 1, borderWidth: 1, borderRadius: 11, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  confirmReturn: { flex: 1.5, borderRadius: 11, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#526B3F' },
  confirmCancelText: { fontSize: 14, fontWeight: '700' },
  confirmReturnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  tabBadge:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9, minWidth: 18, alignItems: 'center' },
  tabBadgeTxt:   { fontSize: 10, fontWeight: '800', color: '#fff' },
  scroll:        { padding: 14 },
  sectionLabel:  { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8, marginTop: 4 },
  searchWrap:    { borderRadius: 14, borderWidth: 1, padding: 10, marginBottom: 12 },
  searchInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput:   { flex: 1, fontSize: 13, paddingVertical: 0 },
  searchMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingHorizontal: 2 },
  searchMeta:    { fontSize: 11 },
  searchEmpty:   { alignItems: 'center', padding: 24, borderRadius: 14, borderWidth: 1, gap: 8, marginTop: 2 },
  folder:        { borderRadius: 14, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  folderHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  folderIcon:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  folderTitle:   { fontSize: 13, fontWeight: '800' },
  folderHint:    { fontSize: 11, marginTop: 2 },
  folderCount:   { minWidth: 26, height: 26, paddingHorizontal: 7, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  folderCountText: { fontSize: 12, fontWeight: '800' },
  folderContent: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10 },
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
  statusColumn:  { alignItems: 'flex-end', gap: 4 },
  deliveryRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalOverlay:  { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:    { maxHeight: '94%', borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  modalTitle:    { fontSize: 16, fontWeight: '800' },
  field:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  fieldLabel:    { fontSize: 12 },
  fieldValue:    { fontSize: 13, fontWeight: '600', maxWidth: '55%', textAlign: 'right' },
  varCard:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 8 },
  lockedNotice:  { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 12 },
  dateCorrectionCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
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
