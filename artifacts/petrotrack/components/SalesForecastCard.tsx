import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { type SalesEntry } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { safeNum } from '@/lib/report-helpers';

interface Props {
  sales: SalesEntry[];
  roleColor: string;
}

function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return Math.abs(s) / 0xffffffff;
  };
}

function linReg(y: number[]): { slope: number; intercept: number } {
  const n = y.length;
  const x = y.map((_, i) => i);
  const sx = x.reduce((a, b) => a + b, 0);
  const sy = y.reduce((a, b) => a + b, 0);
  const sxy = x.reduce((a, xi, i) => a + xi * y[i], 0);
  const sxx = x.reduce((a, xi) => a + xi * xi, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

const PRODUCTS = [
  { key: 'PMS', label: 'PMS', color: '#1a6e3c', volBase: 880,  price: 830  },
  { key: 'AGO', label: 'AGO', color: '#185FA5', volBase: 520,  price: 1050 },
  { key: 'DPK', label: 'DPK', color: '#BA7517', volBase: 150,  price: 695  },
];

function fmt(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n}`;
}

function fmtVol(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}KL`;
  return `${Math.round(n)}L`;
}

export function SalesForecastCard({ sales, roleColor }: Props) {
  const colors = useColors();

  const { pastDays, futureDays, thisMonthActual, projectedTotal, growthPct, products } = useMemo(() => {
    const rand = seededRand(20250704);

    const HIST = 30;
    const FUTURE = 14;
    const TREND_SLOPE = 0.008;

    const actualRevPerDay = sales.length > 0
      ? sales.reduce((s, e) => s + safeNum(e.L) * safeNum(e.price), 0) / Math.max(1, [...new Set(sales.map(e => e.dt.slice(0, 10)))].length)
      : 1_276_400;

    const pastRevs: number[] = [];
    for (let i = 0; i < HIST; i++) {
      const trend = 1 + TREND_SLOPE * (i - HIST / 2);
      const noise = 0.82 + rand() * 0.36;
      const weekend = (i % 7 === 5 || i % 7 === 6) ? 1.15 : 1;
      pastRevs.push(Math.round(actualRevPerDay * trend * noise * weekend));
    }

    const { slope, intercept } = linReg(pastRevs.slice(-14));
    const futureRevs: number[] = [];
    for (let i = 0; i < FUTURE; i++) {
      const base = intercept + slope * (14 + i);
      const noise = 0.88 + rand() * 0.24;
      const weekend = ((HIST + i) % 7 === 5 || (HIST + i) % 7 === 6) ? 1.12 : 1;
      futureRevs.push(Math.max(0, Math.round(base * noise * weekend)));
    }

    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - dayOfMonth;

    const thisMonthActual = pastRevs.slice(-dayOfMonth).reduce((a, b) => a + b, 0);
    const projectedRemaining = futureRevs.slice(0, daysRemaining).reduce((a, b) => a + b, 0);
    const projectedTotal = thisMonthActual + projectedRemaining;
    const lastMonthTotal = pastRevs.reduce((a, b) => a + b, 0);
    const growthPct = ((projectedTotal - lastMonthTotal) / lastMonthTotal) * 100;

    const last7 = pastRevs.slice(-7);
    const next7 = futureRevs.slice(0, 7);
    const allVals = [...last7, ...next7];
    const maxVal = Math.max(...allVals, 1);

    const pastDays = last7.map((v, i) => ({
      height: Math.max(4, Math.round((v / maxVal) * 60)),
      rev: v,
      label: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][(new Date().getDay() - 6 + i + 7) % 7],
    }));
    const futureDays = next7.map((v, i) => ({
      height: Math.max(4, Math.round((v / maxVal) * 60)),
      rev: v,
      label: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][(new Date().getDay() + 1 + i) % 7],
    }));

    const prodData = PRODUCTS.map(p => {
      const actualVol = sales.filter(s => s.pump.includes(p.key)).reduce((s, e) => s + safeNum(e.L), 0);
      const baseVol = actualVol > 0 ? actualVol : p.volBase;
      const projVol = Math.round(baseVol * (1 + TREND_SLOPE * 7) * daysInMonth);
      const projRev = Math.round(projVol * p.price);
      const share = Math.round((projRev / projectedTotal) * 100);
      return { ...p, projVol, projRev, share };
    });

    return { pastDays, futureDays, thisMonthActual, projectedTotal, growthPct, products: prodData };
  }, [sales]);

  const isPositive = growthPct >= 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconWrap, { backgroundColor: roleColor + '18' }]}>
          <Ionicons name="trending-up" size={18} color={roleColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Sales Forecast</Text>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>
            {new Date().toLocaleString('en-NG', { month: 'long', year: 'numeric' })} projection
          </Text>
        </View>
        <View style={[styles.growthBadge, { backgroundColor: isPositive ? colors.successBg : colors.errorBg }]}>
          <Ionicons name={isPositive ? 'arrow-up' : 'arrow-down'} size={10} color={isPositive ? colors.success : colors.error} />
          <Text style={[styles.growthText, { color: isPositive ? colors.success : colors.error }]}>
            {Math.abs(growthPct).toFixed(1)}%
          </Text>
        </View>
      </View>

      <View style={styles.totalsRow}>
        <View style={styles.totalBlock}>
          <Text style={[styles.totalLabel, { color: colors.textMuted }]}>Actual MTD</Text>
          <Text style={[styles.totalValue, { color: colors.text }]}>{fmt(thisMonthActual)}</Text>
        </View>
        <View style={[styles.totalDivider, { backgroundColor: colors.border }]} />
        <View style={styles.totalBlock}>
          <Text style={[styles.totalLabel, { color: colors.textMuted }]}>Projected Full Month</Text>
          <Text style={[styles.totalValueLarge, { color: roleColor }]}>{fmt(projectedTotal)}</Text>
        </View>
      </View>

      <View style={styles.chartSection}>
        <View style={styles.chartRow}>
          {pastDays.map((d, i) => (
            <View key={`p${i}`} style={styles.barWrap}>
              <View style={[styles.bar, { height: d.height, backgroundColor: roleColor }]} />
              <Text style={[styles.barLabel, { color: colors.textSubtle }]}>{d.label}</Text>
            </View>
          ))}
          <View style={[styles.chartDivider, { backgroundColor: colors.border }]} />
          {futureDays.map((d, i) => (
            <View key={`f${i}`} style={styles.barWrap}>
              <View style={[styles.bar, styles.barFuture, { height: d.height, borderColor: roleColor }]} />
              <Text style={[styles.barLabel, { color: colors.textSubtle }]}>{d.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.chartLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: roleColor }]} />
            <Text style={[styles.legendText, { color: colors.textMuted }]}>Past 7 days</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDotOutline, { borderColor: roleColor }]} />
            <Text style={[styles.legendText, { color: colors.textMuted }]}>Projected 7 days</Text>
          </View>
        </View>
      </View>

      <View style={[styles.prodTable, { borderTopColor: colors.border }]}>
        <View style={styles.prodTableHeader}>
          <Text style={[styles.prodHeaderText, { color: colors.textMuted, flex: 1.5 }]}>Product</Text>
          <Text style={[styles.prodHeaderText, { color: colors.textMuted }]}>Proj. Vol</Text>
          <Text style={[styles.prodHeaderText, { color: colors.textMuted }]}>Proj. Rev</Text>
          <Text style={[styles.prodHeaderText, { color: colors.textMuted, textAlign: 'right' }]}>Share</Text>
        </View>
        {products.map(p => (
          <View key={p.key} style={styles.prodRow}>
            <View style={styles.prodNameWrap}>
              <View style={[styles.prodDot, { backgroundColor: p.color }]} />
              <Text style={[styles.prodName, { color: colors.text }]}>{p.label}</Text>
            </View>
            <Text style={[styles.prodCell, { color: colors.text }]}>{fmtVol(p.projVol)}</Text>
            <Text style={[styles.prodCell, { color: colors.text }]}>{fmt(p.projRev)}</Text>
            <View style={styles.shareCellWrap}>
              <View style={[styles.shareBarBg, { backgroundColor: colors.border }]}>
                <View style={[styles.shareBarFill, { width: `${p.share}%` as any, backgroundColor: p.color }]} />
              </View>
              <Text style={[styles.shareLabel, { color: p.color }]}>{p.share}%</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 11, marginTop: 1 },
  growthBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  growthText: { fontSize: 12, fontWeight: '700' },
  totalsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  totalBlock: { flex: 1, alignItems: 'center' },
  totalDivider: { width: 1, height: 36, marginHorizontal: 8 },
  totalLabel: { fontSize: 10, marginBottom: 4 },
  totalValue: { fontSize: 18, fontWeight: '700' },
  totalValueLarge: { fontSize: 22, fontWeight: '800' },
  chartSection: { marginBottom: 14 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', height: 72, gap: 3, marginBottom: 6 },
  barWrap: { flex: 1, alignItems: 'center', gap: 4 },
  bar: { width: '100%', borderRadius: 3 },
  barFuture: { backgroundColor: 'transparent', borderWidth: 1.5, borderRadius: 3, borderStyle: 'dashed' },
  barLabel: { fontSize: 8 },
  chartDivider: { width: 1, height: 52, marginHorizontal: 2 },
  chartLegend: { flexDirection: 'row', gap: 16, paddingLeft: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendDotOutline: { width: 8, height: 8, borderRadius: 2, borderWidth: 1.5, backgroundColor: 'transparent' },
  legendText: { fontSize: 10 },
  prodTable: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  prodTableHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 2 },
  prodHeaderText: { flex: 1, fontSize: 10, fontWeight: '600', textAlign: 'center' },
  prodRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 2 },
  prodNameWrap: { flex: 1.5, flexDirection: 'row', alignItems: 'center', gap: 6 },
  prodDot: { width: 8, height: 8, borderRadius: 4 },
  prodName: { fontSize: 12, fontWeight: '600' },
  prodCell: { flex: 1, fontSize: 12, fontWeight: '500', textAlign: 'center' },
  shareCellWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  shareBarBg: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  shareBarFill: { height: 5, borderRadius: 3 },
  shareLabel: { fontSize: 10, fontWeight: '700', minWidth: 26, textAlign: 'right' },
});
