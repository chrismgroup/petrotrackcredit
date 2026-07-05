import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, fmtDate, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type Period = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
const PERIODS: Period[] = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'];
const SCALE: Record<Period, number> = { Daily: 1, Weekly: 7, Monthly: 30, Quarterly: 90, Yearly: 365 };
const PERIOD_LABELS: Record<Period, string> = {
  Daily: "Today's", Weekly: "This Week's", Monthly: "This Month's",
  Quarterly: "This Quarter's", Yearly: "This Year's",
};

const PROD_COLORS: Record<string, string> = {
  PMS: '#1a6e3c', AGO: '#185FA5', DPK: '#BA7517', LPG: '#633806',
};

function periodRange(p: Period): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - (SCALE[p] - 1));
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export default function ReportsScreen() {
  const { role, expenses, sales, branches, deliveries, prices } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'acc'] || colors.primary;
  const [period, setPeriod] = useState<Period>('Monthly');
  const [reportTab, setReportTab] = useState<'summary' | 'pnl' | 'expenses' | 'sales'>('summary');

  const { from, to } = useMemo(() => periodRange(period), [period]);
  const scale = SCALE[period];

  const totalRev = branches.reduce((s, b) => s + b.rev, 0);
  const allApproved = expenses.filter(e => e.status === 'approved');
  const totalExpenses = allApproved.reduce((s, e) => s + e.amt, 0);
  const totalSalesRaw = sales.reduce((s, e) => s + e.L * e.price, 0);

  const scaledRev = Math.round(totalRev / 30 * scale);
  const scaledExp = Math.round(totalExpenses / 30 * scale);
  const scaledSales = Math.round(totalSalesRaw / 30 * scale);
  const scaledNet = scaledRev - scaledExp;
  const margin = scaledRev > 0 ? Math.round((scaledNet / scaledRev) * 100) : 0;

  // P&L per product
  const pnlByProd = useMemo(() => {
    const prods = ['PMS', 'AGO', 'DPK', 'LPG'];
    return prods.map(prod => {
      // Sales revenue for this product
      const prodSales = sales.filter(s => s.pump.includes(prod));
      const totalVolumeSold = prodSales.reduce((s, e) => s + e.L, 0);
      const sellPrice = (prices as any)[prod] ?? 0;
      const salesRevenue = Math.round(totalVolumeSold * scale * sellPrice);

      // Cost of goods: deliveries for this product with cost price
      const prodDelivs = deliveries.filter(d => d.prod === prod && d.costPrice);
      const totalVolumeReceived = prodDelivs.reduce((s, d) => s + d.rec, 0);
      const totalCostOfGoods = prodDelivs.reduce((s, d) => s + d.rec * (d.costPrice ?? 0), 0);
      const avgCostPerL = totalVolumeReceived > 0 ? totalCostOfGoods / totalVolumeReceived : 0;
      // Scale cost proportionally to period
      const scaledCOGS = Math.round(avgCostPerL * totalVolumeSold * scale);

      const grossProfit = salesRevenue - scaledCOGS;
      const grossMargin = salesRevenue > 0 ? Math.round((grossProfit / salesRevenue) * 100) : null;

      return { prod, totalVolumeSold, sellPrice, salesRevenue, avgCostPerL: Math.round(avgCostPerL), scaledCOGS, grossProfit, grossMargin, hasCostData: prodDelivs.length > 0 };
    }).filter(p => p.totalVolumeSold > 0 || p.scaledCOGS > 0);
  }, [sales, deliveries, prices, scale]);

  const totalSalesRevPnl = pnlByProd.reduce((s, p) => s + p.salesRevenue, 0);
  const totalCOGS = pnlByProd.reduce((s, p) => s + p.scaledCOGS, 0);
  const totalGrossProfit = totalSalesRevPnl - totalCOGS;
  const grossMarginPct = totalSalesRevPnl > 0 ? Math.round((totalGrossProfit / totalSalesRevPnl) * 100) : 0;
  const netProfitPnl = totalGrossProfit - scaledExp;
  const netMarginPct = totalSalesRevPnl > 0 ? Math.round((netProfitPnl / totalSalesRevPnl) * 100) : 0;

  const catTotals: Record<string, number> = {};
  for (const e of allApproved) {
    catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amt;
  }
  const catScaled = Object.entries(catTotals).map(([cat, total]) => ({
    cat, total: Math.round(total / 30 * scale),
    pct: totalExpenses > 0 ? Math.round((total / totalExpenses) * 100) : 0,
  })).sort((a, b) => b.total - a.total);

  const prodSales = [
    { prod: 'PMS', color: '#1a6e3c', L: sales.filter(s => s.pump.includes('PMS')).reduce((s, e) => s + e.L, 0), price: prices.PMS },
    { prod: 'AGO', color: '#185FA5', L: sales.filter(s => s.pump.includes('AGO')).reduce((s, e) => s + e.L, 0), price: prices.AGO },
    { prod: 'DPK', color: '#BA7517', L: sales.filter(s => s.pump.includes('DPK')).reduce((s, e) => s + e.L, 0), price: prices.DPK },
  ].map(p => ({ ...p, scaledL: Math.round(p.L * scale), scaledRev: Math.round(p.L * scale * p.price) }));

  const expItems = allApproved.slice().reverse();

  return (
    <ScreenLayout title="Reports">
      {/* Period selector */}
      <View style={styles.periodScroll}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodRow}>
          {PERIODS.map(p => (
            <TouchableOpacity key={p} onPress={() => setPeriod(p)}
              style={[styles.periodBtn, { backgroundColor: p === period ? roleColor : colors.surface, borderColor: p === period ? roleColor : colors.border }]}>
              <Text style={[styles.periodText, { color: p === period ? '#fff' : colors.textMuted }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Report tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
        {([
          { id: 'summary',  label: 'Summary'  },
          { id: 'pnl',      label: 'P&L'      },
          { id: 'expenses', label: 'Expenses' },
          { id: 'sales',    label: 'Sales'    },
        ] as const).map(t => (
          <TouchableOpacity key={t.id} onPress={() => setReportTab(t.id)}
            style={[styles.reportTab, { borderBottomColor: t.id === reportTab ? roleColor : 'transparent', borderBottomWidth: 2 }]}>
            <Text style={[styles.reportTabText, { color: t.id === reportTab ? roleColor : colors.textMuted, fontWeight: t.id === reportTab ? '700' : '400' }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── SUMMARY ── */}
        {reportTab === 'summary' && (
          <>
            <View style={[styles.summaryCard, { backgroundColor: roleColor }]}>
              <Text style={styles.summaryPeriod}>{PERIOD_LABELS[period]} Report</Text>
              <Text style={styles.summaryNet}>{fmt(scaledNet)}</Text>
              <Text style={styles.summaryNetLabel}>Net · {margin}% margin</Text>
              <View style={styles.summaryRow}>
                {[
                  { label: 'Revenue', value: scaledRev,   icon: 'trending-up'   },
                  { label: 'Expenses', value: scaledExp,  icon: 'trending-down' },
                  { label: 'Sales',    value: scaledSales, icon: 'bar-chart'    },
                ].map(item => (
                  <View key={item.label} style={styles.summaryItem}>
                    <Ionicons name={item.icon as any} size={12} color="rgba(255,255,255,0.65)" />
                    <Text style={styles.summaryItemLabel}>{item.label}</Text>
                    <Text style={styles.summaryItemValue}>{fmt(item.value)}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Expense Breakdown</Text>
            {catScaled.map(c => (
              <View key={c.cat} style={[styles.catRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <View style={styles.catHeader}>
                    <Text style={[styles.catName, { color: colors.text }]}>{c.cat}</Text>
                    <Text style={[styles.catAmt, { color: roleColor }]}>{fmt(c.total)}</Text>
                  </View>
                  <View style={[styles.progressBg, { backgroundColor: colors.border }]}>
                    <View style={[styles.progressBar, { width: `${c.pct}%` as any, backgroundColor: roleColor }]} />
                  </View>
                  <Text style={[styles.catPct, { color: colors.textMuted }]}>{c.pct}% of expenses</Text>
                </View>
              </View>
            ))}
            <ExportBanner label={`Export ${period} Report`} sub={`${fmtDate(from.toISOString())} – ${fmtDate(to.toISOString())}`} color={roleColor} colors={colors} />
          </>
        )}

        {/* ── P&L ── */}
        {reportTab === 'pnl' && (
          <>
            {/* Top P&L summary card */}
            <View style={[styles.plHeader, { backgroundColor: netProfitPnl >= 0 ? '#0a2318' : '#791F1F' }]}>
              <Text style={styles.plHeaderLabel}>{PERIOD_LABELS[period]} Profit & Loss</Text>
              <Text style={styles.plHeaderNet}>{fmt(netProfitPnl)}</Text>
              <Text style={styles.plHeaderSub}>{netProfitPnl >= 0 ? 'Net Profit' : 'Net Loss'} · {netMarginPct}% net margin</Text>
              <View style={styles.plHeaderRow}>
                {[
                  { label: 'Sales Revenue', value: totalSalesRevPnl },
                  { label: 'Cost of Goods', value: totalCOGS        },
                  { label: 'Gross Profit',  value: totalGrossProfit  },
                ].map(item => (
                  <View key={item.label} style={styles.plHeaderItem}>
                    <Text style={styles.plHeaderItemLabel}>{item.label}</Text>
                    <Text style={[styles.plHeaderItemVal, { color: item.label === 'Cost of Goods' ? '#ffb3b3' : '#fff' }]}>
                      {fmt(item.value)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Gross margin */}
            <View style={[styles.plMarginRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.plMarginLabel, { color: colors.textMuted }]}>Gross Margin</Text>
              <View style={[styles.progressBg, { flex: 1, backgroundColor: colors.border, marginHorizontal: 10 }]}>
                <View style={[styles.progressBar, { width: `${Math.max(0, Math.min(grossMarginPct, 100))}%` as any, backgroundColor: grossMarginPct >= 0 ? '#27500A' : '#791F1F' }]} />
              </View>
              <Text style={[styles.plMarginPct, { color: grossMarginPct >= 0 ? '#27500A' : '#791F1F' }]}>{grossMarginPct}%</Text>
            </View>

            {/* Per-product breakdown */}
            <Text style={[styles.sectionTitle, { color: colors.text }]}>By Product</Text>
            {pnlByProd.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="analytics-outline" size={32} color={colors.textSubtle} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No sales data for this period</Text>
              </View>
            ) : pnlByProd.map(p => {
              const pc = PROD_COLORS[p.prod] || roleColor;
              const profitable = p.grossProfit >= 0;
              return (
                <View key={p.prod} style={[styles.plProdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.plProdHeader}>
                    <View style={[styles.plProdTag, { backgroundColor: pc + '15' }]}>
                      <Text style={[styles.plProdTagText, { color: pc }]}>{p.prod}</Text>
                    </View>
                    <View style={{ flex: 1 }} />
                    {p.grossMargin !== null && (
                      <View style={[styles.plGrossMarginBadge, { backgroundColor: profitable ? '#EAF3DE' : '#FCEBEB' }]}>
                        <Ionicons name={profitable ? 'trending-up' : 'trending-down'} size={11} color={profitable ? '#27500A' : '#791F1F'} />
                        <Text style={[styles.plGrossMarginText, { color: profitable ? '#27500A' : '#791F1F' }]}>
                          {p.grossMargin}% gross margin
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Revenue vs Cost vs Profit grid */}
                  <View style={styles.plGrid}>
                    <View style={styles.plGridItem}>
                      <Text style={[styles.plGridLabel, { color: colors.textMuted }]}>Volume Sold</Text>
                      <Text style={[styles.plGridVal, { color: colors.text }]}>{(p.totalVolumeSold * scale).toLocaleString()} L</Text>
                    </View>
                    <View style={styles.plGridItem}>
                      <Text style={[styles.plGridLabel, { color: colors.textMuted }]}>Sell Price</Text>
                      <Text style={[styles.plGridVal, { color: pc }]}>₦{p.sellPrice.toLocaleString()}/L</Text>
                    </View>
                    <View style={styles.plGridItem}>
                      <Text style={[styles.plGridLabel, { color: colors.textMuted }]}>Cost Price</Text>
                      <Text style={[styles.plGridVal, { color: colors.text }]}>
                        {p.hasCostData ? `₦${p.avgCostPerL.toLocaleString()}/L` : '—'}
                      </Text>
                    </View>
                  </View>

                  {/* Revenue vs COGS vs Gross profit */}
                  {[
                    { label: 'Sales Revenue',   value: p.salesRevenue, color: '#185FA5', icon: 'cash-outline'         },
                    { label: 'Cost of Goods',   value: p.scaledCOGS,   color: '#791F1F', icon: 'pricetag-outline'     },
                    { label: 'Gross Profit',    value: p.grossProfit,  color: profitable ? '#27500A' : '#791F1F', icon: profitable ? 'trending-up' : 'trending-down' },
                  ].map(row => (
                    <View key={row.label} style={[styles.plRowItem, { borderTopColor: colors.border }]}>
                      <Ionicons name={row.icon as any} size={13} color={row.color} />
                      <Text style={[styles.plRowLabel, { color: colors.textMuted }]}>{row.label}</Text>
                      <Text style={[styles.plRowVal, { color: row.color }]}>{fmt(row.value)}</Text>
                    </View>
                  ))}

                  {!p.hasCostData && (
                    <View style={[styles.noCostNote, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
                      <Text style={[styles.noCostNoteText, { color: colors.textMuted }]}>
                        No cost price recorded for this product — use the Receive tab to add deliveries with cost price
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Operating expenses deduction */}
            <View style={[styles.plOpexCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.plOpexTitle, { color: colors.text }]}>Operating Expenses</Text>
              {catScaled.slice(0, 4).map(c => (
                <View key={c.cat} style={styles.plOpexRow}>
                  <Text style={[styles.plOpexCat, { color: colors.textMuted }]}>{c.cat}</Text>
                  <Text style={[styles.plOpexAmt, { color: '#791F1F' }]}>{fmt(c.total)}</Text>
                </View>
              ))}
              {catScaled.length > 4 && (
                <Text style={[styles.plOpexMore, { color: colors.textSubtle }]}>+ {catScaled.length - 4} more categories</Text>
              )}
              <View style={[styles.plOpexTotal, { borderTopColor: colors.border }]}>
                <Text style={[styles.plOpexTotalLabel, { color: colors.text }]}>Total Operating Expenses</Text>
                <Text style={[styles.plOpexTotalVal, { color: '#791F1F' }]}>{fmt(scaledExp)}</Text>
              </View>
            </View>

            {/* Final net profit */}
            <View style={[styles.plFinalCard, { backgroundColor: netProfitPnl >= 0 ? '#EAF3DE' : '#FCEBEB', borderColor: netProfitPnl >= 0 ? '#27500A33' : '#791F1F33' }]}>
              <View>
                <Text style={[styles.plFinalLabel, { color: netProfitPnl >= 0 ? '#27500A' : '#791F1F' }]}>
                  {netProfitPnl >= 0 ? 'Net Profit' : 'Net Loss'} ({PERIOD_LABELS[period].replace("'s", '')})
                </Text>
                <Text style={[styles.plFinalSub, { color: netProfitPnl >= 0 ? '#3a6e1c' : '#aa2222' }]}>
                  Gross Profit − Operating Expenses = {fmt(totalGrossProfit)} − {fmt(scaledExp)}
                </Text>
              </View>
              <Text style={[styles.plFinalVal, { color: netProfitPnl >= 0 ? '#27500A' : '#791F1F' }]}>
                {fmt(netProfitPnl)}
              </Text>
            </View>

            <ExportBanner label="Export P&L Report" sub={`${fmtDate(from.toISOString())} – ${fmtDate(to.toISOString())}`} color={roleColor} colors={colors} />
          </>
        )}

        {/* ── EXPENSES ── */}
        {reportTab === 'expenses' && (
          <>
            <View style={[styles.totalPill, { backgroundColor: roleColor + '18', borderColor: roleColor + '33' }]}>
              <Text style={[styles.totalPillLabel, { color: roleColor }]}>{PERIOD_LABELS[period]} Total Approved Expenses</Text>
              <Text style={[styles.totalPillValue, { color: roleColor }]}>{fmt(scaledExp)}</Text>
            </View>
            {expItems.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="receipt-outline" size={40} color={colors.border} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No approved expenses found</Text>
              </View>
            )}
            {expItems.map(e => (
              <View key={e.id} style={[styles.expItemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.expItemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.expItemCat, { color: colors.text }]}>{e.cat}</Text>
                    <Text style={[styles.expItemDesc, { color: colors.textMuted }]}>{e.desc}</Text>
                    <Text style={[styles.expItemMeta, { color: colors.textSubtle }]}>by {e.byName} · Approved by {e.approvedBy}</Text>
                  </View>
                  <Text style={[styles.expItemAmt, { color: roleColor }]}>{fmt(e.amt)}</Text>
                </View>
              </View>
            ))}
            <ExportBanner label="Export Expense Ledger" sub="PDF or Excel" color={roleColor} colors={colors} />
          </>
        )}

        {/* ── SALES ── */}
        {reportTab === 'sales' && (
          <>
            <View style={[styles.totalPill, { backgroundColor: roleColor + '18', borderColor: roleColor + '33' }]}>
              <Text style={[styles.totalPillLabel, { color: roleColor }]}>{PERIOD_LABELS[period]} Total Sales Revenue</Text>
              <Text style={[styles.totalPillValue, { color: roleColor }]}>{fmt(scaledSales)}</Text>
            </View>
            {prodSales.map(p => (
              <View key={p.prod} style={[styles.catRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.prodDot, { backgroundColor: p.color }]} />
                <View style={{ flex: 1 }}>
                  <View style={styles.catHeader}>
                    <Text style={[styles.catName, { color: colors.text }]}>{p.prod}</Text>
                    <Text style={[styles.catAmt, { color: p.color }]}>{fmt(p.scaledRev)}</Text>
                  </View>
                  <Text style={[styles.catPct, { color: colors.textMuted }]}>{p.scaledL.toLocaleString()} L · ₦{p.price}/L</Text>
                </View>
              </View>
            ))}
            <ExportBanner label={`Export ${period} Sales Report`} sub="Full pump-level breakdown" color={roleColor} colors={colors} />
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

function ExportBanner({ label, sub, color, colors }: { label: string; sub: string; color: string; colors: any }) {
  return (
    <View style={[styles.exportBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name="download-outline" size={20} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.exportTitle, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.exportSub, { color: colors.textMuted }]}>{sub}</Text>
      </View>
      <TouchableOpacity style={[styles.exportBtn, { backgroundColor: color }]}>
        <Text style={styles.exportBtnText}>Export</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  periodScroll: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e3' },
  periodRow: { flexDirection: 'row', gap: 6, padding: 10, paddingHorizontal: 12 },
  periodBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  periodText: { fontSize: 12, fontWeight: '600' },
  tabsScroll: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e3' },
  tabsRow: { paddingHorizontal: 8, flexDirection: 'row' },
  reportTab: { paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  reportTabText: { fontSize: 13 },
  scroll: { padding: 16 },
  summaryCard: { borderRadius: 16, padding: 20, marginBottom: 16 },
  summaryPeriod: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginBottom: 4 },
  summaryNet: { color: '#fff', fontSize: 32, fontWeight: '800' },
  summaryNetLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginBottom: 14 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryItemLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 10 },
  summaryItemValue: { color: '#fff', fontSize: 13, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  prodDot: { width: 10, height: 10, borderRadius: 5 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  catName: { fontSize: 13, fontWeight: '600' },
  catAmt: { fontSize: 13, fontWeight: '700' },
  catPct: { fontSize: 10, marginTop: 4 },
  progressBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: 6, borderRadius: 3 },
  exportBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8, marginTop: 4 },
  exportTitle: { fontSize: 14, fontWeight: '600' },
  exportSub: { fontSize: 11, marginTop: 2 },
  exportBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  exportBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  totalPill: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 14, alignItems: 'center' },
  totalPillLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  totalPillValue: { fontSize: 28, fontWeight: '800' },
  expItemCard: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  expItemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  expItemCat: { fontSize: 13, fontWeight: '700' },
  expItemDesc: { fontSize: 12, marginTop: 2 },
  expItemMeta: { fontSize: 10, marginTop: 3 },
  expItemAmt: { fontSize: 15, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14 },
  // P&L
  plHeader: { borderRadius: 16, padding: 20, marginBottom: 14 },
  plHeaderLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 4 },
  plHeaderNet: { color: '#fff', fontSize: 34, fontWeight: '800' },
  plHeaderSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 14 },
  plHeaderRow: { flexDirection: 'row' },
  plHeaderItem: { flex: 1, alignItems: 'center' },
  plHeaderItemLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 9, marginBottom: 3 },
  plHeaderItemVal: { fontSize: 12, fontWeight: '700' },
  plMarginRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 14 },
  plMarginLabel: { fontSize: 12, fontWeight: '600', width: 90 },
  plMarginPct: { fontSize: 14, fontWeight: '800', width: 42, textAlign: 'right' },
  plProdCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 8 },
  plProdHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plProdTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  plProdTagText: { fontSize: 12, fontWeight: '700' },
  plGrossMarginBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  plGrossMarginText: { fontSize: 10, fontWeight: '700' },
  plGrid: { flexDirection: 'row', gap: 0 },
  plGridItem: { flex: 1, gap: 2 },
  plGridLabel: { fontSize: 10 },
  plGridVal: { fontSize: 13, fontWeight: '700' },
  plRowItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  plRowLabel: { flex: 1, fontSize: 12 },
  plRowVal: { fontSize: 14, fontWeight: '700' },
  noCostNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 10, borderRadius: 8, borderWidth: 1 },
  noCostNoteText: { flex: 1, fontSize: 11, lineHeight: 16 },
  plOpexCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 6 },
  plOpexTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  plOpexRow: { flexDirection: 'row', justifyContent: 'space-between' },
  plOpexCat: { fontSize: 12 },
  plOpexAmt: { fontSize: 12, fontWeight: '600' },
  plOpexMore: { fontSize: 11 },
  plOpexTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  plOpexTotalLabel: { fontSize: 13, fontWeight: '700' },
  plOpexTotalVal: { fontSize: 14, fontWeight: '800' },
  plFinalCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  plFinalLabel: { fontSize: 14, fontWeight: '700' },
  plFinalSub: { fontSize: 10, marginTop: 3 },
  plFinalVal: { fontSize: 22, fontWeight: '900', marginLeft: 'auto' },
});
