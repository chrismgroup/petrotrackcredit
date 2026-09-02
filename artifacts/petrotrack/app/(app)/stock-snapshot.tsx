import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import {
  calculateDailyOperationalStock,
  calculateDailyStockLogBalance,
  dipReadingToLiters,
  ROLE_COLORS,
  type DipRecord,
  type LPGTank,
  type StockProduct,
  type Tank,
  unitForProd,
  useBusinessDateKey,
  useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { findLatestDipForProduct } from '@/lib/dip-helpers';

const PRODUCTS: StockProduct[] = ['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil'];
const GLOBAL_ROLES = new Set(['admin', 'ceo', 'md', 'acc', 'csm', 'mktg']);

type SnapshotRow = {
  product: StockProduct;
  unit: string;
  opening: number | null;
  delivered: number;
  sold: number;
  bookStock: number | null;
  tankDip: number | null;
  variance: number | null;
};

type BranchSnapshot = {
  branchId: string;
  branchName: string;
  rows: SnapshotRow[];
};

function formatQuantity(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function dipForProduct(
  record: DipRecord | undefined,
  product: StockProduct,
  tanks: Tank[],
  lpgTanks: LPGTank[],
): number | null {
  if (!record) return null;
  const readings = product === 'LPG'
    ? lpgTanks.map(tank => record.lpg?.[tank.id])
    : tanks
        .filter(tank => tank.prod === product)
        .map(tank => {
          const reading = record.rd?.[tank.id];
          return reading === undefined ? undefined : dipReadingToLiters(reading);
        });
  const numericReadings = readings
    .map(value => typeof value === 'number' ? value : Number(value))
    .filter((value): value is number => Number.isFinite(value));
  return numericReadings.length > 0
    ? numericReadings.reduce((sum, reading) => sum + reading, 0)
    : null;
}

export default function StockSnapshotScreen() {
  const {
    role,
    branchId,
    branches,
    tanks,
    lpgTanks,
    dips,
    deliveries,
    pumps,
    pumpDailyReports,
    startupStocks,
    stockSnapshotConfig,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;
  const todayKey = useBusinessDateKey();
  const isGlobal = GLOBAL_ROLES.has(role ?? '');

  const snapshots = useMemo<BranchSnapshot[]>(() => {
    const scopes = isGlobal
      ? branches.map(branch => ({ branchId: branch.id, branchName: branch.name }))
      : branchId
        ? [{ branchId, branchName: branches.find(branch => branch.id === branchId)?.name ?? 'My branch' }]
        : [];

    return scopes
      .map(scope => {
        const branchTanks = tanks.filter(tank => tank.branchId === scope.branchId);
        const branchLpgTanks = lpgTanks.filter(tank => tank.branchId === scope.branchId);
        const branchPumps = pumps.filter(pump => pump.branchId === scope.branchId);
        const enabledProducts = stockSnapshotConfig.productsByBranch[scope.branchId];

        const rows = PRODUCTS
          .filter(product => enabledProducts?.[product] !== false)
          .map(product => {
            const startupRecord = startupStocks.find(stock =>
              stock.product === product && stock.branchId === scope.branchId,
            );
            const todayDip = findLatestDipForProduct(
              dips,
              todayKey,
              scope.branchId,
              product,
              branchTanks,
              branchLpgTanks,
              { approvedOnly: false },
            );
            const stockBook = calculateDailyOperationalStock(
              startupRecord,
              product,
              scope.branchId,
              deliveries,
              pumpDailyReports,
              todayKey,
              branchPumps,
            );
            const tankDip = dipForProduct(todayDip, product, branchTanks, branchLpgTanks);
            const variance = calculateDailyStockLogBalance(
              stockBook.startupStock,
              stockBook.delivered,
              stockBook.sold,
              tankDip,
            ).variance;

            return {
              product,
              unit: unitForProd(product),
              opening: stockBook.startupStock,
              delivered: stockBook.delivered,
              sold: stockBook.sold,
              bookStock: stockBook.bookStock,
              tankDip,
              variance,
            };
          });

        return { ...scope, rows };
      })
      .filter(snapshot => snapshot.rows.length > 0);
  }, [
    branchId,
    branches,
    deliveries,
    dips,
    isGlobal,
    lpgTanks,
    pumpDailyReports,
    pumps,
    startupStocks,
    stockSnapshotConfig,
    tanks,
    todayKey,
  ]);

  const discrepancyCount = snapshots.reduce(
    (count, snapshot) => count + snapshot.rows.filter(row => row.variance !== null && row.variance !== 0).length,
    0,
  );
  const productsTracked = snapshots.reduce((count, snapshot) => count + snapshot.rows.length, 0);

  return (
    <ScreenLayout title="Stock Snapshot">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: roleColor }]}>
          <View style={styles.heroOrb} />
          <Text style={styles.eyebrow}>MY JOBS · INVENTORY CONTROL</Text>
          <Text style={styles.heroTitle}>Stock snapshot</Text>
          <Text style={styles.heroSubtitle}>
            Compare today&apos;s book stock with the latest submitted tank dip. Book stock rolls forward from the opening balance using today&apos;s approved deliveries and shift sales.
          </Text>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{productsTracked}</Text>
              <Text style={styles.heroStatLabel}>Products tracked</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{snapshots.length}</Text>
              <Text style={styles.heroStatLabel}>{snapshots.length === 1 ? 'Branch' : 'Branches'}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{discrepancyCount}</Text>
              <Text style={styles.heroStatLabel}>Variances</Text>
            </View>
          </View>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.infoBg, borderColor: colors.info + '30' }]}>
          <Ionicons name="information-circle-outline" size={17} color={colors.info} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: colors.info }]}>Today&apos;s business date: {todayKey}</Text>
            <Text style={[styles.infoText, { color: colors.textMuted }]}>
              Positive variance means the tank dip is above book stock. Negative variance indicates a shortage. LPG is measured in kg; petroleum products are measured in litres.
            </Text>
          </View>
        </View>

        {snapshots.map(snapshot => (
          <View key={snapshot.branchId} style={styles.branchSection}>
            {isGlobal ? (
              <View style={styles.branchHeader}>
                <Ionicons name="business-outline" size={16} color={roleColor} />
                <Text style={[styles.branchName, { color: colors.text }]}>{snapshot.branchName}</Text>
              </View>
            ) : null}

            {snapshot.rows.map(row => {
              const statusColor = row.opening === null
                ? colors.amber
                : row.variance === null
                  ? colors.textMuted
                  : row.variance < 0
                    ? colors.error
                    : row.variance > 0
                      ? colors.info
                      : colors.success;
              const statusLabel = row.opening === null
                ? 'Awaiting opening'
                : row.variance === null
                  ? 'Awaiting tank dip'
                  : row.variance < 0
                    ? 'Shortage'
                    : row.variance > 0
                      ? 'Excess'
                      : 'Balanced';

              return (
                <View key={row.product} style={[styles.productCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.productHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.productName, { color: colors.text }]}>{row.product}</Text>
                      <Text style={[styles.productUnit, { color: colors.textMuted }]}>Unit: {row.unit}</Text>
                    </View>
                    {stockSnapshotConfig.metrics.variance ? (
                      <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                        <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.metricsGrid}>
                    {stockSnapshotConfig.metrics.startupStock ? (
                      <Metric label="Opening qty." value={formatQuantity(row.opening)} unit={row.unit} colors={colors} />
                    ) : null}
                    {stockSnapshotConfig.metrics.deliveries ? (
                      <Metric label="Delivered today" value={formatQuantity(row.delivered)} unit={row.unit} colors={colors} />
                    ) : null}
                    {stockSnapshotConfig.metrics.sales ? (
                      <Metric label="Sold today" value={formatQuantity(row.sold)} unit={row.unit} colors={colors} />
                    ) : null}
                    {stockSnapshotConfig.metrics.bookStock ? (
                      <Metric label="Book stock" value={formatQuantity(row.bookStock)} unit={row.unit} colors={colors} />
                    ) : null}
                    {stockSnapshotConfig.metrics.submittedTankDip ? (
                      <Metric label="Tank dip" value={formatQuantity(row.tankDip)} unit={row.unit} colors={colors} />
                    ) : null}
                  </View>

                  {stockSnapshotConfig.metrics.variance ? (
                    <View style={[styles.varianceRow, { backgroundColor: statusColor + '0D', borderTopColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.varianceLabel, { color: colors.textMuted }]}>Variance</Text>
                        <Text style={[styles.varianceHelper, { color: colors.textSubtle }]}>Tank dip minus book stock</Text>
                      </View>
                      <Text style={[styles.varianceValue, { color: statusColor }]}>
                        {row.variance === null ? '—' : `${row.variance > 0 ? '+' : ''}${formatQuantity(row.variance)} ${row.unit}`}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}

        {snapshots.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="analytics-outline" size={34} color={colors.textSubtle} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No stock inputs yet</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Configure a branch opening balance, add a delivery, record shift sales, or submit a tank dip to see the stock snapshot here.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenLayout>
  );
}

function Metric({
  label,
  value,
  unit,
  colors,
}: {
  label: string;
  value: string;
  unit: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: colors.textSubtle }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.metricUnit, { color: colors.textMuted }]}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 34, gap: 13 },
  hero: { borderRadius: 22, padding: 19, overflow: 'hidden', position: 'relative' },
  heroOrb: { position: 'absolute', width: 190, height: 190, borderRadius: 95, right: -68, top: -96, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  eyebrow: { color: 'rgba(255,255,255,0.68)', fontSize: 10, letterSpacing: 1.4, fontWeight: '800' },
  heroTitle: { color: '#fff', fontSize: 25, fontWeight: '800', marginTop: 7 },
  heroSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 18, marginTop: 6 },
  heroStats: { flexDirection: 'row', marginTop: 19, paddingTop: 13, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)' },
  heroStat: { flex: 1 },
  heroStatValue: { color: '#fff', fontSize: 19, fontWeight: '800' },
  heroStatLabel: { color: 'rgba(255,255,255,0.68)', fontSize: 10, marginTop: 3 },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 13, borderWidth: 1, padding: 12 },
  infoTitle: { fontSize: 12, fontWeight: '800', marginBottom: 3 },
  infoText: { fontSize: 11, lineHeight: 17 },
  branchSection: { gap: 9 },
  branchHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2, paddingTop: 4 },
  branchName: { fontSize: 15, fontWeight: '800' },
  productCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 12 },
  productHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  productName: { fontSize: 15, fontWeight: '800' },
  productUnit: { fontSize: 11, marginTop: 3 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '800' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  metric: { width: '30%', minWidth: 80 },
  metricLabel: { fontSize: 10, lineHeight: 13 },
  metricValue: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  metricUnit: { fontSize: 9, marginTop: 1 },
  varianceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11 },
  varianceLabel: { fontSize: 11, fontWeight: '700' },
  varianceHelper: { fontSize: 10, marginTop: 2 },
  varianceValue: { fontSize: 16, fontWeight: '900' },
  emptyCard: { alignItems: 'center', borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', padding: 28, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  emptyText: { fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 300 },
});