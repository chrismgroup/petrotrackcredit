import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppliedDateField } from '@/components/AppliedDateField';
import { ScreenLayout } from '@/components/ScreenLayout';
import {
  calculateDailyOperationalStock,
  calculateDailyStockLogBalance,
  dipReadingToLiters,
  isPhysicalDeliveryReceipt,
  ROLE_COLORS,
  StockProduct,
  useBusinessDateKey,
  useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { findLatestDipForProduct } from '@/lib/dip-helpers';

const PRODUCTS: StockProduct[] = ['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil'];
const GLOBAL_ROLES = new Set(['admin', 'ceo', 'md', 'acc', 'csm', 'mktg']);
const PRODUCT_COLORS: Record<string, string> = {
  PMS: '#1a6e3c',
  AGO: '#185FA5',
  DPK: '#BA7517',
  LPG: '#0F6E56',
  'Lube Oil': '#5c3d11',
};
const UNITS: Record<string, string> = { PMS: 'L', AGO: 'L', DPK: 'L', LPG: 'kg', 'Lube Oil': 'L' };

type InventoryTank = { id: string; name: string; stock: number; capacity: number; dipDate: string | null };
type InventoryProduct = {
  product: StockProduct;
  unit: string;
  stock: number;
  capacity: number;
  tanks: InventoryTank[];
  lastDip: string | null;
  dipBased: boolean;
};
type InventoryBranch = { id: string | null; name: string; products: InventoryProduct[] };
type SnapshotRow = {
  product: StockProduct;
  unit: string;
  opening: number | null;
  delivered: number;
  sold: number;
  bookStock: number | null;
  dip: number | null;
  variance: number | null;
};
type SnapshotBranch = { id: string | null; name: string; rows: SnapshotRow[] };

function latestDipValue(
  dips: ReturnType<typeof useApp>['dips'],
  tankId: string,
  lpg: boolean,
): { stock: number; date: string | null } {
  const record = dips
    .filter(d => d.status === 'approved' && (lpg ? d.lpg?.[tankId] : d.rd?.[tankId]) !== undefined)
    .sort((a, b) => new Date(b.dt).getTime() - new Date(a.dt).getTime())[0];
  return {
    stock: record ? Number(lpg ? record.lpg?.[tankId] : record.rd?.[tankId]) : 0,
    date: record?.dt ?? null,
  };
}

function dipForProduct(
  record: ReturnType<typeof useApp>['dips'][number] | undefined,
  product: StockProduct,
  tanks: ReturnType<typeof useApp>['tanks'],
  lpgTanks: ReturnType<typeof useApp>['lpgTanks'],
): number | null {
  if (!record) return null;
  const readings = product === 'LPG'
    ? lpgTanks.map(tank => record.lpg?.[tank.id])
    : tanks.filter(tank => tank.prod === product).map(tank => {
        const reading = record.rd?.[tank.id];
        return reading === undefined ? undefined : dipReadingToLiters(reading);
      });
  const values = readings.map(Number).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function statusForVariance(variance: number | null, dip: number | null): { label: string; color: string } {
  if (variance === null || dip === null) return { label: 'Awaiting dip', color: '#BA7517' };
  if (variance < -0.01) return { label: 'Shortage', color: '#BA7517' };
  if (variance > 0.01) return { label: 'Excess', color: '#791F1F' };
  return { label: 'Balanced', color: '#27500A' };
}

export default function InventoryScreen() {
  const {
    role, branchId, branches, tanks, lpgTanks, dips, deliveries, pumps,
    pumpDailyReports, startupStocks,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;
  const businessDate = useBusinessDateKey();
  const [selectedDate, setSelectedDate] = useState(businessDate);
  const isGlobal = GLOBAL_ROLES.has(role ?? '');

  const scopedBranches = useMemo(() => {
    if (isGlobal) return branches;
    const branch = branches.find(item => item.id === branchId);
    return branch ? [branch] : [{ id: branchId ?? '', name: 'This Branch', st: 'Active' as const, rev: 0, mgr: '', pumps: 0, tanks: 0 }];
  }, [branchId, branches, isGlobal]);

  const inventory = useMemo<InventoryBranch[]>(() => scopedBranches
    .map(branch => {
      const branchTanks = tanks.filter(tank => isGlobal
        ? tank.branchId === branch.id
        : (!branchId || !tank.branchId || tank.branchId === branch.id));
      const branchLpgTanks = lpgTanks.filter(tank => isGlobal
        ? tank.branchId === branch.id
        : (!branchId || !tank.branchId || tank.branchId === branch.id));
      const branchDeliveries = deliveries.filter(delivery => isGlobal
        ? delivery.branchId === branch.id
        : (!branchId || !delivery.branchId || delivery.branchId === branch.id));
      const products: InventoryProduct[] = [];

      for (const product of PRODUCTS) {
        const productTanks = branchTanks.filter(tank => tank.prod === product);
        if (productTanks.length) {
          const rows = productTanks.map(tank => {
            const dip = latestDipValue(dips, tank.id, false);
            return { id: tank.id, name: tank.name, stock: dip.stock, capacity: tank.cap, dipDate: dip.date };
          });
          products.push({
            product,
            unit: UNITS[product],
            stock: rows.reduce((sum, row) => sum + row.stock, 0),
            capacity: rows.reduce((sum, row) => sum + row.capacity, 0),
            tanks: rows,
            lastDip: rows.map(row => row.dipDate).filter(Boolean).sort().reverse()[0] ?? null,
            dipBased: true,
          });
        } else if (product === 'Lube Oil') {
          const stock = branchDeliveries
            .filter(isPhysicalDeliveryReceipt)
            .reduce((sum, delivery) => sum + Number(delivery.rec || 0), 0);
          if (stock > 0) products.push({ product, unit: 'L', stock, capacity: 0, tanks: [], lastDip: null, dipBased: false });
        }
      }

      if (branchLpgTanks.length) {
        const rows = branchLpgTanks.map(tank => {
          const dip = latestDipValue(dips, tank.id, true);
          return { id: tank.id, name: tank.name, stock: dip.stock, capacity: tank.cap, dipDate: dip.date };
        });
        products.push({
          product: 'LPG',
          unit: 'kg',
          stock: rows.reduce((sum, row) => sum + row.stock, 0),
          capacity: rows.reduce((sum, row) => sum + row.capacity, 0),
          tanks: rows,
          lastDip: rows.map(row => row.dipDate).filter(Boolean).sort().reverse()[0] ?? null,
          dipBased: true,
        });
      }
      return { id: branch.id, name: branch.name, products };
    })
    .filter(branch => branch.products.length > 0), [branches, deliveries, dips, lpgTanks, scopedBranches, tanks]);

  const snapshotBranches = useMemo<SnapshotBranch[]>(() => scopedBranches
    .map(branch => {
      const branchTanks = tanks.filter(tank => tank.branchId === branch.id);
      const branchLpgTanks = lpgTanks.filter(tank => tank.branchId === branch.id);
      const branchPumps = pumps.filter(pump => pump.branchId === branch.id);
      const rows = PRODUCTS.map(product => {
        const latestDip = findLatestDipForProduct(
          dips, selectedDate, branch.id, product, branchTanks, branchLpgTanks, { approvedOnly: false },
        );
        const opening = startupStocks.find(stock => stock.product === product && stock.branchId === branch.id);
        const book = calculateDailyOperationalStock(
          opening, product, branch.id, deliveries, pumpDailyReports, selectedDate, branchPumps,
        );
        const dip = dipForProduct(latestDip, product, branchTanks, branchLpgTanks);
        const balance = calculateDailyStockLogBalance(book.startupStock, book.delivered, book.sold, dip);
        if (book.startupStock === null && book.delivered === 0 && book.sold === 0 && dip === null) return null;
        return {
          product, unit: UNITS[product], opening: book.startupStock, delivered: book.delivered,
          sold: book.sold, bookStock: book.bookStock, dip, variance: balance.variance,
        };
      }).filter((row): row is SnapshotRow => row !== null);
      return { id: branch.id, name: branch.name, rows };
    })
    .filter(branch => branch.rows.length > 0), [deliveries, dips, lpgTanks, pumps, pumpDailyReports, selectedDate, scopedBranches, startupStocks, tanks]);

  const discrepancyCount = snapshotBranches.reduce(
    (sum, branch) => sum + branch.rows.filter(row => row.variance !== null && Math.abs(row.variance) > (row.unit === 'kg' ? 50 : 200)).length, 0,
  );
  const productCount = inventory.reduce((sum, branch) => sum + branch.products.length, 0);

  return (
    <ScreenLayout title="Product inventory">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: roleColor }]}>
          <View style={styles.heroOrb} />
          <Text style={styles.eyebrow}>OPERATIONS · STOCK CONTROL</Text>
          <Text style={styles.heroTitle}>Live product inventory</Text>
          <Text style={styles.heroSubtitle}>Current product stock from the latest approved dip readings, separated from delivery approvals.</Text>
          <View style={styles.metrics}>
            <View><Text style={styles.metricValue}>{productCount}</Text><Text style={styles.metricLabel}>Products tracked</Text></View>
            <View><Text style={styles.metricValue}>{inventory.length}</Text><Text style={styles.metricLabel}>Branches</Text></View>
            <View><Text style={styles.metricValue}>{discrepancyCount}</Text><Text style={styles.metricLabel}>Alerts</Text></View>
          </View>
        </View>

        <AppliedDateField
          value={selectedDate}
          onChange={setSelectedDate}
          label="Stock snapshot date"
          accent={roleColor}
          helper="Book stock rolls forward from the configured opening quantity using approved deliveries and approved sales."
        />

        {discrepancyCount > 0 ? (
          <View style={styles.alertBox}>
            <Ionicons name="warning-outline" size={18} color="#791F1F" />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>{discrepancyCount} stock discrepancy alert{discrepancyCount === 1 ? '' : 's'}</Text>
              <Text style={styles.alertText}>Review the branch rows below where the book balance differs materially from the latest dip.</Text>
            </View>
          </View>
        ) : null}

        <SectionHeading icon="layers-outline" title="Product inventory by branch" subtitle="Latest approved physical dip reading" color={roleColor} />
        {inventory.map(branch => (
          <View key={branch.id ?? 'unassigned'} style={styles.branchBlock}>
            {isGlobal ? <BranchHeading name={branch.name} color={roleColor} colors={colors} /> : null}
            {branch.products.map(product => {
              const productColor = PRODUCT_COLORS[product.product] || roleColor;
              const percentage = product.capacity > 0 ? Math.min(100, Math.round((product.stock / product.capacity) * 100)) : null;
              const low = percentage !== null && percentage < 20;
              return (
                <View key={product.product} style={[styles.inventoryCard, { backgroundColor: colors.surface, borderColor: low ? '#BA7517' : colors.border }]}>
                  <View style={styles.cardTop}>
                    <View style={[styles.productPill, { backgroundColor: productColor + '18' }]}>
                      <Ionicons name="cube-outline" size={13} color={productColor} />
                      <Text style={[styles.productPillText, { color: productColor }]}>{product.product}</Text>
                    </View>
                    {!product.dipBased ? <Text style={styles.sourceLabel}>Delivery-based</Text> : null}
                  </View>
                  <Text style={[styles.stockValue, { color: low ? '#BA7517' : '#27500A' }]}>
                    {product.stock.toLocaleString()} <Text style={[styles.stockUnit, { color: colors.textMuted }]}>{product.unit}</Text>
                  </Text>
                  {percentage !== null ? (
                    <>
                      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                        <View style={[styles.progressFill, { width: `${percentage}%` as never, backgroundColor: low ? '#BA7517' : productColor }]} />
                      </View>
                      <Text style={[styles.cardMeta, { color: colors.textSubtle }]}>{percentage}% of {product.capacity.toLocaleString()} {product.unit} capacity</Text>
                    </>
                  ) : null}
                  {product.tanks.length > 1 ? product.tanks.map(tank => (
                    <View key={tank.id} style={[styles.tankRow, { borderTopColor: colors.border }]}>
                      <Text style={[styles.tankName, { color: colors.textMuted }]} numberOfLines={1}>{tank.name}</Text>
                      <Text style={[styles.tankStock, { color: colors.text }]}>{tank.stock.toLocaleString()} {product.unit}</Text>
                      <Text style={[styles.cardMeta, { color: colors.textSubtle }]}>{tank.dipDate ? tank.dipDate.slice(0, 10) : 'No dip'}</Text>
                    </View>
                  )) : null}
                  <View style={styles.cardFooter}>
                    <Text style={[styles.cardMeta, { color: colors.textSubtle }]}>{product.lastDip ? `Last dip: ${product.lastDip.slice(0, 10)}` : 'No dip on record'}</Text>
                    {low ? <Text style={styles.lowLabel}>LOW</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
        {inventory.length === 0 ? <EmptyState text="No inventory data is available for the selected branch." colors={colors} /> : null}

        <SectionHeading icon="analytics-outline" title="Stock snapshot by branch" subtitle={`Opening + deliveries − sales for ${selectedDate}`} color={roleColor} />
        {snapshotBranches.map(branch => (
          <View key={branch.id ?? 'unassigned'} style={[styles.snapshotCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <BranchHeading name={branch.name} color={roleColor} colors={colors} />
            {branch.rows.map(row => {
              const varianceStatus = statusForVariance(row.variance, row.dip);
              return (
                <View key={row.product} style={[styles.snapshotRow, { borderTopColor: colors.border }]}>
                  <View style={styles.snapshotProduct}>
                    <View style={[styles.productDot, { backgroundColor: PRODUCT_COLORS[row.product] || roleColor }]} />
                    <Text style={[styles.snapshotProductName, { color: colors.text }]}>{row.product}</Text>
                  </View>
                  <Metric label="Book" value={row.bookStock === null ? '—' : row.bookStock.toLocaleString()} colors={colors} />
                  <Metric label="Dip" value={row.dip === null ? '—' : row.dip.toLocaleString()} colors={colors} />
                  <View style={styles.snapshotStatus}>
                    <Text style={[styles.snapshotVariance, { color: varianceStatus.color }]}>{row.variance === null ? '—' : `${row.variance > 0 ? '+' : ''}${row.variance.toLocaleString()}`}</Text>
                    <Text style={[styles.snapshotStatusLabel, { color: varianceStatus.color }]}>{varianceStatus.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ))}
        {snapshotBranches.length === 0 ? <EmptyState text="No stock activity is available for this date." colors={colors} /> : null}
        <View style={{ height: 18 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

function SectionHeading({ icon, title, subtitle, color }: { icon: string; title: string; subtitle: string; color: string }) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeading}>
      <View style={[styles.sectionIcon, { backgroundColor: color + '15' }]}><Ionicons name={icon as any} size={18} color={color} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

function BranchHeading({ name, color, colors }: { name: string; color: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.branchHeading, { backgroundColor: color + '12', borderColor: color + '30' }]}>
      <Ionicons name="business-outline" size={13} color={color} />
      <Text style={[styles.branchName, { color }]}>{name}</Text>
    </View>
  );
}

function Metric({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.metric}><Text style={[styles.metricLabelSmall, { color: colors.textSubtle }]}>{label}</Text><Text style={[styles.metricValueSmall, { color: colors.text }]}>{value}</Text></View>;
}

function EmptyState({ text, colors }: { text: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name="file-tray-outline" size={28} color={colors.textMuted} />
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 14 },
  hero: { borderRadius: 22, padding: 20, overflow: 'hidden' },
  heroOrb: { position: 'absolute', width: 180, height: 180, borderRadius: 90, right: -70, top: -80, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  eyebrow: { color: 'rgba(255,255,255,0.68)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 8 },
  heroSubtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 19, marginTop: 7, maxWidth: 340 },
  metrics: { flexDirection: 'row', gap: 30, marginTop: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)' },
  metricValue: { color: '#fff', fontSize: 20, fontWeight: '800' },
  metricLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 2 },
  alertBox: { flexDirection: 'row', gap: 10, borderRadius: 13, borderWidth: 1, borderColor: '#791F1F', backgroundColor: '#FCEBEB', padding: 13 },
  alertTitle: { color: '#791F1F', fontSize: 13, fontWeight: '800' },
  alertText: { color: '#791F1F', fontSize: 11, lineHeight: 16, marginTop: 3 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5 },
  sectionIcon: { width: 35, height: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionSubtitle: { fontSize: 11, marginTop: 2 },
  branchBlock: { gap: 8 },
  branchHeading: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  branchName: { fontSize: 13, fontWeight: '800', flex: 1 },
  inventoryCard: { borderRadius: 15, borderWidth: 1, padding: 14, gap: 7 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  productPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  productPillText: { fontSize: 12, fontWeight: '800' },
  sourceLabel: { color: '#666', fontSize: 10, fontWeight: '600' },
  stockValue: { fontSize: 27, fontWeight: '800' },
  stockUnit: { fontSize: 14, fontWeight: '500' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  cardMeta: { fontSize: 10 },
  tankRow: { flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 7 },
  tankName: { flex: 1, fontSize: 11 },
  tankStock: { fontSize: 11, fontWeight: '700' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lowLabel: { color: '#BA7517', backgroundColor: '#FAEEDA', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, fontSize: 10, fontWeight: '800' },
  snapshotCard: { borderRadius: 15, borderWidth: 1, padding: 12, gap: 2 },
  snapshotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  snapshotProduct: { flex: 1.35, flexDirection: 'row', alignItems: 'center', gap: 6 },
  productDot: { width: 8, height: 8, borderRadius: 4 },
  snapshotProductName: { fontSize: 12, fontWeight: '700' },
  metric: { flex: 0.8 },
  metricLabelSmall: { fontSize: 9, textTransform: 'uppercase' },
  metricValueSmall: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  snapshotStatus: { flex: 0.9, alignItems: 'flex-end' },
  snapshotVariance: { fontSize: 12, fontWeight: '800' },
  snapshotStatusLabel: { fontSize: 9, fontWeight: '700', marginTop: 2 },
  emptyBox: { alignItems: 'center', gap: 8, borderRadius: 15, borderWidth: 1, borderStyle: 'dashed', padding: 28 },
  emptyText: { fontSize: 13, textAlign: 'center' },
});