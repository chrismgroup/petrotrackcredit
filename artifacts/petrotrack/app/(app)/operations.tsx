import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { AppliedDateField } from '@/components/AppliedDateField';
import {
  calculateDailyOperationalStock, calculateDailyStockLogBalance, currentBusinessDateKey, dipReadingToLiters,
  startupStockSeedDate,
  ROLE_COLORS, StockLogEntry, StockLogOpeningSource, StockLogStatus, StockProduct, fmtDate, fmtDateTime, unitForProd, useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { findLatestDipForProduct } from '@/lib/dip-helpers';
import { canonicalProduct } from '@/lib/product-identity';

const STOCK_PRODUCTS: StockProduct[] = ['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil'];
const GLOBAL_ROLES = new Set(['admin', 'ceo', 'md', 'acc', 'csm']);

function stockLogStatusLabel(status: StockLogStatus): string {
  return {
    balanced: 'Balanced',
    shortage: 'Shortage',
    excess: 'Excess',
    awaiting_opening: 'Awaiting opening',
    awaiting_dip: 'Awaiting reconciliation',
    not_applicable: 'No reconciliation required',
  }[status];
}

function stockLogStatusColor(status: StockLogStatus, colors: ReturnType<typeof useColors>): string {
  if (status === 'shortage') return colors.error;
  if (status === 'excess') return colors.info;
  if (status === 'balanced') return colors.success;
  if (status === 'not_applicable') return colors.textMuted;
  return colors.amber;
}

function stockDipForProduct(
  dip: ReturnType<typeof findLatestDipForProduct>,
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

function makeStockLogStatus(
  opening: number | null,
  dip: number | null,
  discrepancy: number | null,
  dipRequired: boolean,
): StockLogStatus {
  if (opening === null) return 'awaiting_opening';
  if (!dipRequired) return 'not_applicable';
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
    const entries: Omit<StockLogEntry, 'id' | 'createdBy' | 'createdAt'>[] = [];

    visibleBranches.forEach(branch => {
      const branchTanks = tanks.filter(tank => tank.branchId === branch.id);
      const branchLpgTanks = lpgTanks.filter(tank => tank.branchId === branch.id);
      const branchPumps = pumps.filter(pump => pump.branchId === branch.id);

      STOCK_PRODUCTS.forEach(product => {
        const hasProduct =
          branchTanks.some(tank => tank.prod === product) ||
          (product === 'LPG' && branchLpgTanks.length > 0) ||
          branchPumps.some(pump => pump.prod === product) ||
          startupStocks.some(stock => stock.branchId === branch.id && stock.product === product) ||
          deliveries.some(delivery =>
            delivery.branchId === branch.id &&
            canonicalProduct(delivery.prod) === product,
          ) ||
          pumpDailyReports.some(report => report.branchId === branch.id && report.product === product) ||
          stockLogs.some(entry => entry.branchId === branch.id && entry.product === product);
        if (!hasProduct) return;

        const todayDip = findLatestDipForProduct(
          dips, businessDate, branch.id, product, branchTanks, branchLpgTanks,
        );
        const startupRecord = startupStocks.find(stock => stock.branchId === branch.id && stock.product === product);
        const stockBook = calculateDailyOperationalStock(
          startupRecord,
          product,
          branch.id,
          deliveries,
          pumpDailyReports,
          businessDate,
          branchPumps,
        );
        const openingQuantity = stockBook.startupStock;
        const openingSource: StockLogOpeningSource = openingQuantity === null
          ? 'unavailable'
          : startupRecord && businessDate === startupStockSeedDate(startupRecord)
            ? 'startup_seed'
            : 'previous_log';
        const tankDip = stockDipForProduct(todayDip, product, branchTanks, branchLpgTanks);
        const balance = calculateDailyStockLogBalance(
          stockBook.startupStock,
          stockBook.delivered,
          stockBook.sold,
          tankDip,
        );
        const dipRequired = product === 'LPG'
          ? branchLpgTanks.length > 0
          : branchTanks.some(tank => tank.prod === product);
        entries.push({
          branchId: branch.id,
          product,
          businessDate,
          openingQuantity,
          delivered: stockBook.delivered,
          sold: stockBook.sold,
          bookStock: balance.bookStock,
          tankDip,
          discrepancy: balance.variance,
          unit: unitForProd(product) as 'L' | 'kg',
          status: makeStockLogStatus(openingQuantity, tankDip, balance.variance, dipRequired),
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
  // Stock logs are derived records, not an immutable snapshot. A dip can be
  // approved after its applied business date, so past dates must also be
  // recalculated from the seed, deliveries, approved sales and dip records.
  // Otherwise an approval made after midnight leaves the displayed dip and
  // variance permanently stale.
  const displayedEntries = buildEntries;
  const summaryEntries = displayedEntries;
  const discrepancyCount = summaryEntries.filter(entry => entry.status === 'shortage' || entry.status === 'excess').length;
  const balancedCount = summaryEntries.filter(entry => entry.status === 'balanced').length;
  const totalSold = summaryEntries.reduce((sum, entry) => sum + entry.sold, 0);

  useEffect(() => {
    if (buildEntries.length > 0 && hasSavedRecordDrift) {
      void upsertStockLogs(buildEntries);
    }
  }, [buildEntries, hasSavedRecordDrift, upsertStockLogs]);

  async function createLog() {
    if (!businessDate) return;
    if (buildEntries.length === 0) {
      Alert.alert('Nothing to log', 'No branch assets or stock activity are available for this business date.');
      return;
    }
    const result = await upsertStockLogs(buildEntries);
    if (!result.ok) {
      Alert.alert('Stock log not saved', result.error ?? 'The server could not save this stock log. Your calculated entries remain on screen so you can retry.');
      return;
    }
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
          <View style={styles.stockMetric}><Text style={[styles.stockMetricLabel, { color: colors.textSubtle }]}>Expected stock</Text><Text style={[styles.stockMetricValue, { color: colors.text }]}>{entry.bookStock === null ? '—' : entry.bookStock.toLocaleString()}</Text></View>
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
        <Text style={styles.stockHeroSubtitle}>Track opening stock, deliveries, pump sales and the expected balance for each business day.</Text>
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
          <Text style={[styles.stockEmptyText, { color: colors.textMuted }]}>Configure a product in Stock Snapshot, then record deliveries or pump sales. The Stock Log will extract the live history automatically.</Text>
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
  return (
    <ScreenLayout title="Operations">
      <StockLogPanel />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
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
