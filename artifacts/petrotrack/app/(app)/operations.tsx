import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { AppliedDateField } from '@/components/AppliedDateField';
import {
  DEFAULT_MGR_PERMS, calculateStockBook, currentBusinessDateKey, dipReadingToLiters,
  getCurrentTankStock, previousBusinessDateKey,
  ROLE_COLORS, StockLogEntry, StockLogOpeningSource, StockLogStatus, StockProduct, fmtDate, fmtDateTime, startupStockSeedDate, unitForProd, useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const DIP_SUBTABS_MGR  = ['Dip Form', 'Awaiting Approval'];
const DIP_SUBTABS_APPR = ['Awaiting Approval'];
const STATUS_LABELS: Record<string, string> = { ok: 'OK', short: 'Short', spill: 'Spill', seal: 'Seal Broken' };
const STATUS_COLORS: Record<string, string> = { ok: '#27500A', short: '#BA7517', spill: '#A32D2D', seal: '#4527a0' };
const DIP_STATUS_COLOR: Record<string, string> = { pending: '#BA7517', approved: '#1a6e3c', rejected: '#A32D2D' };
const DIP_STATUS_LABEL: Record<string, string> = { pending: 'Pending Approval', approved: 'Approved', rejected: 'Rejected' };
const DIP_STATUS_ICON: Record<string, string>  = { pending: 'time', approved: 'checkmark-circle', rejected: 'close-circle' };
const STOCK_PRODUCTS: StockProduct[] = ['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil'];
const GLOBAL_ROLES = new Set(['admin', 'ceo', 'md', 'acc', 'csm']);

function stockLogStatusLabel(status: StockLogStatus): string {
  return {
    balanced: 'Balanced',
    shortage: 'Shortage',
    excess: 'Excess',
    awaiting_opening: 'Awaiting opening',
    awaiting_dip: 'Awaiting tank dip',
  }[status];
}

function stockLogStatusColor(status: StockLogStatus, colors: ReturnType<typeof useColors>): string {
  if (status === 'shortage') return colors.error;
  if (status === 'excess') return colors.info;
  if (status === 'balanced') return colors.success;
  return colors.amber;
}

function latestDipForStockLog(
  dips: ReturnType<typeof useApp>['dips'],
  dateKey: string,
  petrolTanks: ReturnType<typeof useApp>['tanks'],
  branchLpgTanks: ReturnType<typeof useApp>['lpgTanks'],
  beforeDate = false,
) {
  return dips
    .filter(dip =>
      (beforeDate ? dip.dt?.slice(0, 10) < dateKey : dip.dt?.slice(0, 10) === dateKey) &&
      dip.status === 'approved' &&
      (petrolTanks.some(tank => dip.rd?.[tank.id] !== undefined) ||
        branchLpgTanks.some(tank => dip.lpg?.[tank.id] !== undefined)),
    )
    .sort((a, b) =>
      new Date(b.approvedDt ?? b.submittedAt ?? b.dt).getTime() -
      new Date(a.approvedDt ?? a.submittedAt ?? a.dt).getTime() || b.id - a.id,
    )[0];
}

function stockDipForProduct(
  dip: ReturnType<typeof latestDipForStockLog>,
  product: StockProduct,
  petrolTanks: ReturnType<typeof useApp>['tanks'],
  branchLpgTanks: ReturnType<typeof useApp>['lpgTanks'],
): number | null {
  if (!dip) return null;
  const values = product === 'LPG'
    ? branchLpgTanks.map(tank => Number(dip.lpg?.[tank.id])).filter(Number.isFinite)
    : petrolTanks.filter(tank => tank.prod === product).map(tank => {
        const value = Number(dip.rd?.[tank.id]);
        return Number.isFinite(value) ? dipReadingToLiters(value) : null;
      }).filter((value): value is number => value !== null);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
}

function makeStockLogStatus(opening: number | null, dip: number | null, discrepancy: number | null): StockLogStatus {
  if (opening === null) return 'awaiting_opening';
  if (dip === null || discrepancy === null) return 'awaiting_dip';
  if (discrepancy < -0.01) return 'shortage';
  if (discrepancy > 0.01) return 'excess';
  return 'balanced';
}

function stockLogValueSignature(entry: Pick<StockLogEntry, 'branchId' | 'product' | 'businessDate' | 'openingQuantity' | 'delivered' | 'sold' | 'bookStock' | 'tankDip' | 'discrepancy' | 'unit' | 'status' | 'openingSource'>): string {
  return [
    entry.branchId,
    entry.product,
    entry.businessDate,
    entry.openingQuantity,
    entry.delivered,
    entry.sold,
    entry.bookStock,
    entry.tankDip,
    entry.discrepancy,
    entry.unit,
    entry.status,
    entry.openingSource ?? '',
  ].join('|');
}

function StockLogPanel() {
  const {
    role, branchId, branches, tanks, lpgTanks, pumps, dips, deliveries,
    pumpDailyReports, startupStocks, stockLogs, upsertStockLogs,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;
  const [businessDate, setBusinessDate] = useState(currentBusinessDateKey());
  const isGlobal = GLOBAL_ROLES.has(role ?? '');

  const visibleBranches = useMemo(
    () => branches.filter(branch => {
      if (!isGlobal && branch.id !== branchId) return false;
      const branchTanks = tanks.filter(tank => tank.branchId === branch.id);
      const branchLpgTanks = lpgTanks.filter(tank => tank.branchId === branch.id);
      return (
        branchTanks.length > 0 ||
        branchLpgTanks.length > 0 ||
        startupStocks.some(stock => stock.branchId === branch.id) ||
        pumps.some(pump => pump.branchId === branch.id) ||
        deliveries.some(delivery => delivery.branchId === branch.id) ||
        pumpDailyReports.some(report => report.branchId === branch.id) ||
        dips.some(dip =>
          dip.status === 'approved' &&
          (branchTanks.some(tank => dip.rd?.[tank.id] !== undefined) ||
            branchLpgTanks.some(tank => dip.lpg?.[tank.id] !== undefined)),
        ) ||
        stockLogs.some(entry => entry.branchId === branch.id)
      );
    }),
    [branchId, branches, deliveries, dips, isGlobal, lpgTanks, pumpDailyReports, pumps, startupStocks, stockLogs, tanks],
  );

  const buildEntries = useMemo(() => {
    const previousDate = previousBusinessDateKey(businessDate);
    const entries: Omit<StockLogEntry, 'id' | 'createdBy' | 'createdAt'>[] = [];

    visibleBranches.forEach(branch => {
      const branchTanks = tanks.filter(tank => tank.branchId === branch.id);
      const branchLpgTanks = lpgTanks.filter(tank => tank.branchId === branch.id);
      const branchPumps = pumps.filter(pump => pump.branchId === branch.id);
      const todayDip = latestDipForStockLog(dips, businessDate, branchTanks, branchLpgTanks);
      const openingDip = latestDipForStockLog(dips, businessDate, branchTanks, branchLpgTanks, true);

      STOCK_PRODUCTS.forEach(product => {
        const hasProduct =
          branchTanks.some(tank => tank.prod === product) ||
          (product === 'LPG' && branchLpgTanks.length > 0) ||
          branchPumps.some(pump => pump.prod === product) ||
          startupStocks.some(stock => stock.branchId === branch.id && stock.product === product) ||
          deliveries.some(delivery =>
            delivery.branchId === branch.id &&
            (delivery.prod === product || (product === 'LPG' && ['LPG_Single', 'LPG_Distributor'].includes(delivery.prod))),
          ) ||
          pumpDailyReports.some(report => report.branchId === branch.id && report.product === product) ||
          stockLogs.some(entry => entry.branchId === branch.id && entry.product === product);
        if (!hasProduct) return;

        const startupRecord = startupStocks.find(stock => stock.branchId === branch.id && stock.product === product);
        const seedDate = startupRecord ? startupStockSeedDate(startupRecord) : '';
        const seedLog = startupRecord && stockLogs.find(entry =>
          entry.branchId === branch.id &&
          entry.product === product &&
          entry.businessDate === seedDate,
        );
        const expectedSeedLog = startupRecord && businessDate >= seedDate
          ? calculateStockBook(
              startupRecord,
              product,
              branch.id,
              deliveries,
              pumpDailyReports,
              seedDate,
              branchPumps,
            )
          : null;
        const seedLogMatchesCalculation = expectedSeedLog && seedLog
          ? Math.abs((seedLog.openingQuantity ?? Number.NaN) - (expectedSeedLog.startupStock ?? Number.NaN)) < 0.01 &&
            Math.abs(seedLog.delivered - expectedSeedLog.delivered) < 0.01 &&
            Math.abs(seedLog.sold - expectedSeedLog.sold) < 0.01 &&
            Math.abs((seedLog.bookStock ?? Number.NaN) - (expectedSeedLog.bookStock ?? Number.NaN)) < 0.01
          : false;
        const hasValidSeedLog = !startupRecord || (
          seedLog?.openingSource === 'startup_seed' &&
          seedLogMatchesCalculation
        );
        const previousLog = stockLogs
          .filter(entry =>
            entry.branchId === branch.id &&
            entry.product === product &&
            entry.businessDate < businessDate &&
            entry.bookStock !== null &&
            (!startupRecord || (hasValidSeedLog && entry.businessDate >= seedDate)),
          )
          .sort((a, b) => b.businessDate.localeCompare(a.businessDate))[0];
        let openingQuantity = previousLog?.bookStock ?? null;
        let openingSource: StockLogOpeningSource = previousLog?.bookStock !== null && previousLog?.bookStock !== undefined
          ? 'previous_log'
          : 'unavailable';
        if (openingQuantity === null && startupRecord && businessDate >= seedDate) {
          openingQuantity = businessDate === seedDate
            ? startupRecord.quantity
            : calculateStockBook(
                startupRecord,
                product,
                branch.id,
                deliveries,
                pumpDailyReports,
                previousDate,
                branchPumps,
                startupRecord.quantity,
                true,
              ).bookStock;
          openingSource = 'startup_seed';
        }
        if (openingQuantity === null) {
          openingQuantity = stockDipForProduct(openingDip, product, branchTanks, branchLpgTanks);
          openingSource = openingQuantity === null ? 'unavailable' : 'previous_dip';
        }
        const book = calculateStockBook(
          undefined,
          product,
          branch.id,
          deliveries,
          pumpDailyReports,
          businessDate,
          branchPumps,
          openingQuantity,
        );
        const tankDip = stockDipForProduct(todayDip, product, branchTanks, branchLpgTanks);
        const discrepancy = book.bookStock === null || tankDip === null ? null : book.bookStock - tankDip;
        entries.push({
          branchId: branch.id,
          product,
          businessDate,
          openingQuantity: book.startupStock,
          delivered: book.delivered,
          sold: book.sold,
          bookStock: book.bookStock,
          tankDip,
          discrepancy,
          unit: unitForProd(product) as 'L' | 'kg',
          status: makeStockLogStatus(book.startupStock, tankDip, discrepancy),
          openingSource,
        });
      });
    });
    return entries;
  }, [businessDate, branchId, branches, deliveries, dips, isGlobal, lpgTanks, pumpDailyReports, pumps, startupStocks, stockLogs, tanks, visibleBranches]);

  const savedEntries = stockLogs.filter(entry =>
    entry.businessDate === businessDate &&
    visibleBranches.some(branch => branch.id === entry.branchId),
  );
  const hasSavedRecordDrift = buildEntries.length > 0 &&
    (savedEntries.length !== buildEntries.length ||
      buildEntries.some(entry => {
        const saved = savedEntries.find(candidate => candidate.branchId === entry.branchId && candidate.product === entry.product);
        return !saved || stockLogValueSignature(saved) !== stockLogValueSignature(entry);
      }));
  // Approved dips change the live tank quantity immediately. Prefer the
  // corrected calculation while the updated row is being persisted.
  const displayedEntries = hasSavedRecordDrift ? buildEntries : savedEntries.length > 0 ? savedEntries : buildEntries;
  const summaryEntries = displayedEntries;
  const discrepancyCount = summaryEntries.filter(entry => entry.status === 'shortage' || entry.status === 'excess').length;
  const balancedCount = summaryEntries.filter(entry => entry.status === 'balanced').length;
  const totalSold = summaryEntries.reduce((sum, entry) => sum + entry.sold, 0);

  useEffect(() => {
    if (buildEntries.length > 0 && hasSavedRecordDrift) {
      upsertStockLogs(buildEntries);
    }
  }, [buildEntries, hasSavedRecordDrift, upsertStockLogs]);

  function createLog() {
    if (!businessDate) return;
    if (buildEntries.length === 0) {
      Alert.alert('Nothing to log', 'No branch assets or stock activity are available for this business date.');
      return;
    }
    upsertStockLogs(buildEntries);
    Alert.alert('Stock log recorded', `${buildEntries.length} product stock calculations were saved for ${businessDate}.`);
  }

  function renderEntry(entry: Omit<StockLogEntry, 'id' | 'createdBy' | 'createdAt'> | StockLogEntry) {
    const statusColor = stockLogStatusColor(entry.status, colors);
    return (
      <View key={`${entry.branchId}-${entry.product}-${entry.businessDate}`} style={[styles.stockCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.stockCardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.stockProduct, { color: colors.text }]}>{entry.product}</Text>
            <Text style={[styles.stockBranch, { color: colors.textMuted }]}>{branches.find(branch => branch.id === entry.branchId)?.name ?? 'Assigned branch'} · {entry.unit}</Text>
          </View>
          <View style={[styles.stockStatus, { backgroundColor: statusColor + '18' }]}>
            <View style={[styles.stockStatusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.stockStatusText, { color: statusColor }]}>{stockLogStatusLabel(entry.status)}</Text>
          </View>
        </View>
        <View style={styles.stockMetrics}>
          <View style={styles.stockMetric}><Text style={[styles.stockMetricLabel, { color: colors.textSubtle }]}>Opening</Text><Text style={[styles.stockMetricValue, { color: colors.text }]}>{entry.openingQuantity === null ? '—' : entry.openingQuantity.toLocaleString()}</Text></View>
          <View style={styles.stockMetric}><Text style={[styles.stockMetricLabel, { color: colors.textSubtle }]}>Delivered</Text><Text style={[styles.stockMetricValue, { color: colors.text }]}>{entry.delivered.toLocaleString()}</Text></View>
          <View style={styles.stockMetric}><Text style={[styles.stockMetricLabel, { color: colors.textSubtle }]}>Sold</Text><Text style={[styles.stockMetricValue, { color: colors.text }]}>{entry.sold.toLocaleString()}</Text></View>
          <View style={styles.stockMetric}><Text style={[styles.stockMetricLabel, { color: colors.textSubtle }]}>Book stock</Text><Text style={[styles.stockMetricValue, { color: colors.text }]}>{entry.bookStock === null ? '—' : entry.bookStock.toLocaleString()}</Text></View>
        </View>
        <View style={[styles.stockCompare, { borderTopColor: colors.border }]}>
          <Text style={[styles.stockCompareLabel, { color: colors.textMuted }]}>Tank dip</Text>
          <Text style={[styles.stockCompareValue, { color: colors.text }]}>{entry.tankDip === null ? 'Not recorded' : `${entry.tankDip.toLocaleString()} ${entry.unit}`}</Text>
          <Text style={[styles.stockCompareLabel, { color: colors.textMuted }]}>Variance</Text>
          <Text style={[styles.stockCompareValue, { color: statusColor }]}>{entry.discrepancy === null ? '—' : `${entry.discrepancy > 0 ? '+' : ''}${entry.discrepancy.toLocaleString()} ${entry.unit}`}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.stockScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={[styles.stockHero, { backgroundColor: roleColor }]}>
        <View style={styles.stockHeroOrb} />
        <Text style={styles.stockEyebrow}>OPERATIONS · INVENTORY CONTROL</Text>
        <Text style={styles.stockHeroTitle}>Daily stock log</Text>
        <Text style={styles.stockHeroSubtitle}>Opening seed + deliveries − shift-report sales, compared with the business-day tank dip.</Text>
        <View style={styles.stockMarquee}>
          <View style={styles.stockMarqueeItem}><Text style={styles.stockMarqueeValue}>{summaryEntries.length}</Text><Text style={styles.stockMarqueeLabel}>Products</Text></View>
          <View style={styles.stockMarqueeItem}><Text style={styles.stockMarqueeValue}>{balancedCount}</Text><Text style={styles.stockMarqueeLabel}>Balanced</Text></View>
          <View style={styles.stockMarqueeItem}><Text style={styles.stockMarqueeValue}>{discrepancyCount}</Text><Text style={styles.stockMarqueeLabel}>Discrepancies</Text></View>
          <View style={styles.stockMarqueeItem}><Text style={styles.stockMarqueeValue}>{totalSold.toLocaleString()}</Text><Text style={styles.stockMarqueeLabel}>Sold today</Text></View>
        </View>
      </View>

      <View style={[styles.stockControlCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <AppliedDateField value={businessDate} onChange={setBusinessDate} label="Stock log business date" accent={roleColor} helper="Uses the Stock Snapshot seed quantity and date, then extracts approved live deliveries and pump reports from that date forward. Daily records auto-save." />
        <TouchableOpacity style={[styles.stockCreateBtn, { backgroundColor: roleColor }]} onPress={createLog} activeOpacity={0.85}>
          <Ionicons name="save-outline" size={18} color="#fff" />
          <Text style={styles.stockCreateBtnText}>{savedEntries.length > 0 ? 'Refresh daily record' : 'Save daily record'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.stockSectionHeading}>
        <View>
          <Text style={[styles.stockSectionTitle, { color: colors.text }]}>Branch product ledger</Text>
          <Text style={[styles.stockSectionSubtitle, { color: colors.textMuted }]}>{savedEntries.length > 0 ? 'Historical record saved for this business day' : buildEntries.length > 0 ? 'Daily calculation auto-saves when source records change' : 'No eligible branch stock data for this date'}</Text>
        </View>
        <Ionicons name="analytics-outline" size={20} color={roleColor} />
      </View>
      {displayedEntries.map(renderEntry)}
      {buildEntries.length === 0 && savedEntries.length === 0 ? (
        <View style={[styles.stockEmpty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="file-tray-outline" size={28} color={colors.textMuted} />
          <Text style={[styles.stockEmptyTitle, { color: colors.text }]}>No stock log inputs yet</Text>
          <Text style={[styles.stockEmptyText, { color: colors.textMuted }]}>Configure a product in Stock Snapshot, then record deliveries, pump sales, or tank dips. The Stock Log will extract the live history automatically.</Text>
        </View>
      ) : null}
      <View style={styles.stockHistoryHeading}>
        <View>
          <Text style={[styles.stockSectionTitle, { color: colors.text }]}>Historical daily records</Text>
          <Text style={[styles.stockSectionSubtitle, { color: colors.textMuted }]}>Saved by business date for reference and audit</Text>
        </View>
        <Ionicons name="time-outline" size={20} color={roleColor} />
      </View>
      {Array.from(new Set(stockLogs
        .filter(entry => visibleBranches.some(branch => branch.id === entry.branchId))
        .map(entry => entry.businessDate)))
        .sort((a, b) => b.localeCompare(a))
        .map(date => {
          const dateEntries = stockLogs.filter(entry =>
            entry.businessDate === date &&
            visibleBranches.some(branch => branch.id === entry.branchId),
          );
          const issues = dateEntries.filter(entry => entry.status === 'shortage' || entry.status === 'excess').length;
          return (
            <TouchableOpacity key={date} style={[styles.stockHistoryRow, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setBusinessDate(date)} activeOpacity={0.8}>
              <View style={[styles.stockHistoryDate, { backgroundColor: roleColor + '14' }]}>
                <Text style={[styles.stockHistoryDateDay, { color: roleColor }]}>{date.slice(8, 10)}</Text>
                <Text style={[styles.stockHistoryDateMonth, { color: roleColor }]}>{new Date(`${date}T12:00:00`).toLocaleString('en-GB', { month: 'short' })}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stockHistoryTitle, { color: colors.text }]}>{fmtDate(date)}</Text>
                <Text style={[styles.stockHistoryMeta, { color: colors.textMuted }]}>{dateEntries.length} product record{dateEntries.length === 1 ? '' : 's'} · {issues > 0 ? `${issues} discrepancy${issues === 1 ? '' : 'ies'}` : 'No discrepancies'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
            </TouchableOpacity>
          );
        })}
      {stockLogs.length === 0 ? (
        <Text style={[styles.stockFootnote, { color: colors.textSubtle }]}>Your first saved day will appear here, followed by each subsequent business day.</Text>
      ) : null}
      <Text style={[styles.stockFootnote, { color: colors.textSubtle }]}>Every row is one product for one branch. LPG is measured in kg; petroleum products are measured in litres.</Text>
    </ScrollView>
  );
}

export default function OperationsScreen() {
  const { tab: requestedTab } = useLocalSearchParams<{ tab?: string }>();
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
  const canSeeDips = isMgr || canApprove;
  const normalizedRequestedTab = Array.isArray(requestedTab) ? requestedTab[0] : requestedTab;
  const hasDipApprovalRoute = normalizedRequestedTab === 'dip' || normalizedRequestedTab === 'dip-approvals';
  const [departmentTab, setDepartmentTab] = useState(
    normalizedRequestedTab === 'stock' ? 'stock' : hasDipApprovalRoute || canSeeDips ? 'dips' : 'stock',
  );

  // ── Dip state ────────────────────────────────────────────────────────────
  // MD/Admin start on Approvals; station managers start on Dip Form.
  const [dipSubTab, setDipSubTab]     = useState(canApprove ? 1 : 0);
  const [readings, setReadings]       = useState<Record<string, string>>({});
  const [lpgReadings, setLpgReadings] = useState<Record<string, string>>({});
  const [obs, setObs]                 = useState('');
  const [appliesOn, setAppliesOn]     = useState('');
  const [approvalSearch, setApprovalSearch] = useState('');

  useEffect(() => {
    if (normalizedRequestedTab === 'stock') {
      setDepartmentTab('stock');
      return;
    }
    if (hasDipApprovalRoute && canSeeDips) {
      setDepartmentTab('dips');
      if (canApprove) setDipSubTab(1);
    }
  }, [normalizedRequestedTab, hasDipApprovalRoute, canSeeDips, canApprove]);

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
  const approvedDips = dips.filter(dip => dip.status === 'approved' && dipHasVisibleReading(dip));
  const approvalSearchTerm = approvalSearch.trim().toLowerCase();
  const approvalRecords = [...pendingDips, ...approvedDips]
    .filter(dip => {
      if (!approvalSearchTerm) return true;
      const tankNames = [
        ...Object.keys(dip.rd).map(id => tanks.find(tank => tank.id === id)?.name ?? id),
        ...Object.keys(dip.lpg).map(id => lpgTanks.find(tank => tank.id === id)?.name ?? id),
      ];
      return [
        dip.dt,
        dip.submittedAt,
        dip.by,
        dip.obs,
        dip.status,
        ...tankNames,
      ].some(value => String(value ?? '').toLowerCase().includes(approvalSearchTerm));
    })
    .sort((a, b) => b.id - a.id);

  return (
    <ScreenLayout title="Operations">
      <View style={[styles.departmentTabs, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.departmentTab, { borderBottomColor: departmentTab === 'stock' ? roleColor : 'transparent' }]}
          onPress={() => setDepartmentTab('stock')}
        >
          <Ionicons name="analytics-outline" size={16} color={departmentTab === 'stock' ? roleColor : colors.textMuted} />
          <Text style={[styles.departmentTabText, { color: departmentTab === 'stock' ? roleColor : colors.textMuted }]}>Stock log</Text>
        </TouchableOpacity>
        {canSeeDips ? (
          <TouchableOpacity
            style={[styles.departmentTab, { borderBottomColor: departmentTab === 'dips' ? roleColor : 'transparent' }]}
            onPress={() => setDepartmentTab('dips')}
          >
            <Ionicons name="water-outline" size={16} color={departmentTab === 'dips' ? roleColor : colors.textMuted} />
            <Text style={[styles.departmentTabText, { color: departmentTab === 'dips' ? roleColor : colors.textMuted }]}>Tank dipping</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {departmentTab === 'stock' ? <StockLogPanel /> : null}
      {departmentTab === 'dips' && canSeeDips ? (
        <>
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

          {/* ── Approvals and history (MD / Admin) ── */}
          {dipSubTab === 1 && (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.approvalMarquee}
              >
                <View style={[styles.approvalMarqueeTile, { backgroundColor: '#BA751712', borderColor: '#BA751744' }]}>
                  <Ionicons name="time-outline" size={17} color="#BA7517" />
                  <Text style={[styles.approvalMarqueeValue, { color: '#BA7517' }]}>{pendingDips.length}</Text>
                  <Text style={[styles.approvalMarqueeLabel, { color: colors.textMuted }]}>Pending approvals</Text>
                </View>
                <View style={[styles.approvalMarqueeTile, { backgroundColor: '#1a6e3c12', borderColor: '#1a6e3c44' }]}>
                  <Ionicons name="checkmark-circle-outline" size={17} color="#1a6e3c" />
                  <Text style={[styles.approvalMarqueeValue, { color: '#1a6e3c' }]}>{approvedDips.length}</Text>
                  <Text style={[styles.approvalMarqueeLabel, { color: colors.textMuted }]}>Approved dips</Text>
                </View>
                <View style={[styles.approvalMarqueeTile, { backgroundColor: roleColor + '12', borderColor: roleColor + '44' }]}>
                  <Ionicons name="documents-outline" size={17} color={roleColor} />
                  <Text style={[styles.approvalMarqueeValue, { color: roleColor }]}>{approvalRecords.length}</Text>
                  <Text style={[styles.approvalMarqueeLabel, { color: colors.textMuted }]}>
                    {approvalSearchTerm ? 'Matching approvals' : 'Showing approvals'}
                  </Text>
                </View>
              </ScrollView>

              <View style={[styles.approvalSearch, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="search-outline" size={17} color={colors.textMuted} />
                <TextInput
                  style={[styles.approvalSearchInput, { color: colors.text }]}
                  placeholder="Search date, submitter, tank or note"
                  placeholderTextColor={colors.textSubtle}
                  value={approvalSearch}
                  onChangeText={setApprovalSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {approvalSearch.length > 0 ? (
                  <TouchableOpacity onPress={() => setApprovalSearch('')} accessibilityLabel="Clear approval search">
                    <Ionicons name="close-circle" size={17} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {approvalRecords.length === 0 ? (
                <View style={[styles.noBanner, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 12 }]}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.noBannerText, { color: colors.textMuted }]}>
                    {approvalSearchTerm ? 'No approvals match your search.' : 'No pending or approved dip records yet.'}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={[styles.mdBanner, { backgroundColor: '#BA751712', borderColor: '#BA751744' }]}>
                    <Ionicons name="time-outline" size={16} color="#BA7517" />
                    <Text style={[styles.mdBannerText, { color: '#BA7517' }]}>
                      {approvalSearchTerm
                        ? `${approvalRecords.length} matching approval record${approvalRecords.length === 1 ? '' : 's'}`
                        : `${pendingDips.length} pending · ${approvedDips.length} approved dip record${pendingDips.length + approvedDips.length === 1 ? '' : 's'}`}
                    </Text>
                  </View>
                  {approvalRecords.map(dip => {
                    const isPending = dip.status === 'pending';
                    const statusColor = isPending ? '#BA7517' : '#1a6e3c';
                    return (
                    <View key={dip.id} style={[styles.logCard, { backgroundColor: colors.surface, borderColor: `${statusColor}44`, borderWidth: 1.5 }]}>
                      <View style={styles.logHeader}>
                        <View style={{ flex: 1 }}>
                        <Text style={[styles.logDate, { color: colors.text }]}>Applies on {fmtDate(dip.dt)}</Text>
                        <Text style={[styles.logBy, { color: colors.textMuted }]}>Submitted {fmtDateTime(dip.submittedAt ?? dip.dt)}</Text>
                          <Text style={[styles.logBy, { color: colors.textMuted }]}>by {dip.by}</Text>
                        </View>
                        <View style={[styles.dipStatusBadge, { backgroundColor: `${statusColor}18` }]}>
                          <Ionicons name={isPending ? 'time' : 'checkmark-circle'} size={11} color={statusColor} />
                          <Text style={[styles.dipStatusText, { color: statusColor }]}>{isPending ? 'Pending' : 'Approved'}</Text>
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
                      {isPending && canApprove ? (
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
                      ) : isPending ? (
                        <View style={[styles.pendingBanner, { backgroundColor: '#BA751718', borderColor: '#BA7517', marginTop: 8, marginBottom: 0 }]}>
                          <Ionicons name="time-outline" size={15} color="#BA7517" />
                          <Text style={[styles.pendingText, { color: '#BA7517' }]}>Awaiting MD approval</Text>
                        </View>
                      ) : (
                        <View style={[styles.pendingBanner, { backgroundColor: '#1a6e3c18', borderColor: '#1a6e3c', marginTop: 8, marginBottom: 0 }]}>
                          <Ionicons name="checkmark-circle-outline" size={15} color="#1a6e3c" />
                          <Text style={[styles.pendingText, { color: '#1a6e3c' }]}>Approved and inventory updated</Text>
                        </View>
                      )}
                    </View>
                    );
                  })}
                </>
              )}

              <View style={{ height: 16 }} />
            </ScrollView>
           )}
        </>
      ) : null}

    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  departmentTabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  departmentTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderBottomWidth: 2 },
  departmentTabText: { fontSize: 12, fontWeight: '700' },
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
  stockScroll: { padding: 14, paddingBottom: 32, gap: 12 },
  stockHero: { borderRadius: 22, padding: 18, overflow: 'hidden', position: 'relative' },
  stockHeroOrb: { position: 'absolute', width: 190, height: 190, borderRadius: 95, right: -72, top: -92, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  stockEyebrow: { color: 'rgba(255,255,255,0.68)', fontSize: 10, letterSpacing: 1.4, fontWeight: '800' },
  stockHeroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 7 },
  stockHeroSubtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 12, lineHeight: 18, marginTop: 5, maxWidth: 330 },
  stockMarquee: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, paddingTop: 13, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)' },
  stockMarqueeItem: { flex: 1, minWidth: 0 },
  stockMarqueeValue: { color: '#fff', fontSize: 18, fontWeight: '800' },
  stockMarqueeLabel: { color: 'rgba(255,255,255,0.68)', fontSize: 10, marginTop: 3 },
  approvalMarquee: { flexDirection: 'row', gap: 9, paddingVertical: 2, paddingRight: 8 },
  approvalMarqueeTile: { minWidth: 138, borderRadius: 13, borderWidth: 1, padding: 12, gap: 4 },
  approvalMarqueeValue: { fontSize: 21, fontWeight: '800' },
  approvalMarqueeLabel: { fontSize: 10, fontWeight: '600' },
  approvalSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, marginTop: 10, marginBottom: 12 },
  approvalSearchInput: { flex: 1, minHeight: 44, fontSize: 12 },
  stockControlCard: { borderRadius: 16, borderWidth: 1, padding: 13 },
  stockCreateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 11, paddingVertical: 12, marginTop: 4 },
  stockCreateBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  stockSectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3, paddingHorizontal: 2 },
  stockSectionTitle: { fontSize: 16, fontWeight: '800' },
  stockSectionSubtitle: { fontSize: 11, marginTop: 2 },
  stockCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 11 },
  stockCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  stockProduct: { fontSize: 14, fontWeight: '800' },
  stockBranch: { fontSize: 11, marginTop: 3 },
  stockStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  stockStatusDot: { width: 6, height: 6, borderRadius: 3 },
  stockStatusText: { fontSize: 10, fontWeight: '800' },
  stockMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  stockMetric: { width: '23%', minWidth: 62 },
  stockMetricLabel: { fontSize: 10 },
  stockMetricValue: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  stockCompare: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  stockCompareLabel: { fontSize: 10, marginRight: 2 },
  stockCompareValue: { fontSize: 11, fontWeight: '800', marginRight: 10 },
  stockEmpty: { alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 24, gap: 7 },
  stockEmptyTitle: { fontSize: 14, fontWeight: '800' },
  stockEmptyText: { fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 290 },
  stockHistoryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, paddingHorizontal: 2 },
  stockHistoryRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 10, gap: 11 },
  stockHistoryDate: { alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 12 },
  stockHistoryDateDay: { fontSize: 17, fontWeight: '900', lineHeight: 19 },
  stockHistoryDateMonth: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', marginTop: 1 },
  stockHistoryTitle: { fontSize: 13, fontWeight: '800' },
  stockHistoryMeta: { fontSize: 10, marginTop: 3 },
  stockFootnote: { fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 12, marginTop: 2 },

});
