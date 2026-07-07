import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import React, { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { Branch, ROLE_COLORS, fmt, fmtDate, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

/* ─── Types ─────────────────────────────────────────────── */
type Period    = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
type ReportType = 'summary' | 'pnl' | 'expenses' | 'sales' | 'prices' | 'full';

const PERIODS: Period[] = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'];
const SCALE: Record<Period, number> = { Daily: 1, Weekly: 7, Monthly: 30, Quarterly: 90, Yearly: 365 };
const PERIOD_LABELS: Record<Period, string> = {
  Daily: "Daily", Weekly: "Weekly", Monthly: "Monthly",
  Quarterly: "Quarterly", Yearly: "Yearly",
};
const PROD_COLORS: Record<string, string> = {
  PMS: '#1a6e3c', AGO: '#185FA5', DPK: '#BA7517', LPG: '#633806',
};

const REPORT_TYPES: { id: ReportType; label: string; icon: string; desc: string }[] = [
  { id: 'summary',  label: 'Summary',        icon: 'stats-chart',    desc: 'Revenue, expenses & net balance' },
  { id: 'pnl',      label: 'Profit & Loss',  icon: 'trending-up',    desc: 'Gross/net profit with COGS' },
  { id: 'expenses', label: 'Expenses',        icon: 'receipt',        desc: 'Approved expense ledger' },
  { id: 'sales',    label: 'Sales',           icon: 'bar-chart',      desc: 'Product-level sales volume & revenue' },
  { id: 'prices',   label: 'Prices',          icon: 'pricetag',       desc: 'Current prices & change history' },
  { id: 'full',     label: 'Full Report',     icon: 'document-text',  desc: 'All sections in one PDF' },
];

/* ─── Helpers ────────────────────────────────────────────── */
function periodRange(p: Period): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - (SCALE[p] - 1));
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function matchesProd(pump: string, prod: string): boolean {
  const p = pump.toLowerCase();
  if (prod === 'Lube Oil') return p.includes('lube');
  if (prod === 'Others')   return p.includes('other');
  return p.includes(prod.toLowerCase());
}

function nfmt(n: number) {
  return '₦' + n.toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

/* ─── PDF builder ───────────────────────────────────────── */
function buildPdfHtml(opts: {
  title: string; period: string; branchName: string; generatedAt: string;
  sections: Array<{ heading: string; rows: Array<{ label: string; value: string }> }>;
  tables?: Array<{ heading: string; headers: string[]; rows: string[][] }>;
}) {
  const sectionHtml = opts.sections.map(s => `
    <div class="section">
      <h3>${s.heading}</h3>
      <table class="kv">
        ${s.rows.map(r => `<tr><td class="lbl">${r.label}</td><td class="val">${r.value}</td></tr>`).join('')}
      </table>
    </div>`).join('');
  const tableHtml = (opts.tables ?? []).map(t => `
    <div class="section">
      <h3>${t.heading}</h3>
      <table class="data">
        <thead><tr>${t.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${t.rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a;margin:0;padding:24px}
  .header{background:#0a3a1e;color:#fff;padding:20px 24px;border-radius:8px;margin-bottom:20px}
  .header h1{margin:0 0 4px;font-size:20px}.header p{margin:0;opacity:.7;font-size:12px}
  .meta{display:flex;gap:16px;margin-bottom:20px}
  .meta-item{flex:1;background:#f5f5f3;border-radius:6px;padding:10px 14px}
  .meta-item .k{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.5px}
  .meta-item .v{font-size:14px;font-weight:700;margin-top:2px}
  .section{margin-bottom:20px}
  .section h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#444;border-bottom:1.5px solid #e5e5e3;padding-bottom:6px;margin-bottom:10px}
  table.kv{width:100%;border-collapse:collapse}
  table.kv tr:nth-child(even) td{background:#f9f9f7}
  table.kv td{padding:7px 10px;font-size:13px}
  table.kv td.lbl{color:#555;width:55%}
  table.kv td.val{font-weight:700;text-align:right}
  table.data{width:100%;border-collapse:collapse}
  table.data th{background:#0a3a1e;color:#fff;padding:8px 10px;font-size:12px;text-align:left}
  table.data td{padding:7px 10px;font-size:12px;border-bottom:1px solid #f0f0ee}
  table.data tr:nth-child(even) td{background:#f9f9f7}
  .footer{text-align:center;font-size:10px;color:#999;margin-top:32px;border-top:1px solid #e5e5e3;padding-top:12px}
  </style></head><body>
  <div class="header"><h1>PetroTrack NG &mdash; ${opts.title}</h1><p>${opts.period} &bull; ${opts.branchName}</p></div>
  <div class="meta">
    <div class="meta-item"><div class="k">Period</div><div class="v">${opts.period}</div></div>
    <div class="meta-item"><div class="k">Branch</div><div class="v">${opts.branchName}</div></div>
    <div class="meta-item"><div class="k">Generated</div><div class="v">${opts.generatedAt}</div></div>
  </div>
  ${sectionHtml}${tableHtml}
  <div class="footer">Generated by PetroTrack NG &bull; Confidential</div>
  </body></html>`;
}

async function printReport(html: string) {
  try {
    if (Platform.OS === 'web') {
      await Print.printAsync({ html });
    } else {
      const { uri } = await Print.printToFileAsync({ html });
      await Print.printAsync({ uri });
    }
  } catch (e: any) {
    if (!e?.message?.includes('cancel')) Alert.alert('Export failed', e?.message ?? 'Could not generate PDF');
  }
}

/* ─── Small UI pieces ───────────────────────────────────── */
function BranchBar({ branches, selected, onSelect, roleColor, colors }: {
  branches: Branch[]; selected: string | null;
  onSelect: (id: string | null) => void; roleColor: string; colors: any;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e3' }}
      contentContainerStyle={{ flexDirection: 'row', gap: 6, padding: 10, paddingHorizontal: 12 }}>
      <TouchableOpacity onPress={() => onSelect(null)}
        style={[styles.pill, { backgroundColor: selected === null ? roleColor : colors.surface, borderColor: selected === null ? roleColor : colors.border }]}>
        <Ionicons name="layers-outline" size={12} color={selected === null ? '#fff' : colors.textMuted} />
        <Text style={[styles.pillText, { color: selected === null ? '#fff' : colors.textMuted }]}>All Branches</Text>
      </TouchableOpacity>
      {branches.map(b => (
        <TouchableOpacity key={b.id} onPress={() => onSelect(b.id)}
          style={[styles.pill, { backgroundColor: selected === b.id ? roleColor : colors.surface, borderColor: selected === b.id ? roleColor : colors.border }]}>
          <Ionicons name="business-outline" size={12} color={selected === b.id ? '#fff' : colors.textMuted} />
          <Text style={[styles.pillText, { color: selected === b.id ? '#fff' : colors.textMuted }]}>{b.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

/* ─── Main screen ───────────────────────────────────────── */
export default function ReportsScreen() {
  const { role, branchId, expenses, sales, branches, deliveries, prices, priceHistory, priceProposals } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'acc'] || colors.primary;
  const isMgr = role === 'mgr' || role === 'csm' || role === 'mktg';

  /* ── Builder state ── */
  const [selectedBranch, setSelectedBranch] = useState<string | null>(isMgr ? (branchId ?? null) : null);
  const [reportType,  setReportType]  = useState<ReportType>('summary');
  const [period,      setPeriod]      = useState<Period>('Monthly');
  const [prodFilter,  setProdFilter]  = useState<string | null>(null);
  const [catFilter,   setCatFilter]   = useState<string | null>(null);
  const [generated,   setGenerated]   = useState(false);

  const { from, to } = useMemo(() => periodRange(period), [period]);
  const scale = SCALE[period];
  const branchName = selectedBranch === null
    ? 'All Branches'
    : (branches.find(b => b.id === selectedBranch)?.name ?? selectedBranch);
  const generatedAt = new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

  /* ── Filtered data ── */
  const filterByBranch = <T extends { branchId?: string }>(arr: T[]): T[] =>
    selectedBranch === null ? arr : arr.filter(x => x.branchId === selectedBranch || !x.branchId);

  const filteredSales      = useMemo(() => filterByBranch(sales),      [sales,      selectedBranch]);
  const filteredDeliveries = useMemo(() => filterByBranch(deliveries), [deliveries, selectedBranch]);
  const filteredExpenses   = useMemo(() => filterByBranch(expenses),   [expenses,   selectedBranch]);

  const allApproved   = filteredExpenses.filter(e => e.status === 'approved');
  const totalExpenses = allApproved.reduce((s, e) => s + e.amt, 0);
  const totalRev      = branches.filter(b => selectedBranch === null || b.id === selectedBranch).reduce((s, b) => s + b.rev, 0);
  const scaledExp     = Math.round(totalExpenses / 30 * scale);
  const scaledRev     = Math.round(totalRev / 30 * scale);
  const scaledSales   = Math.round(filteredSales.reduce((s, e) => s + e.L * e.price, 0) / 30 * scale);
  const scaledNet     = scaledRev - scaledExp;
  const margin        = scaledRev > 0 ? Math.round((scaledNet / scaledRev) * 100) : 0;

  /* product list */
  const allProds = useMemo(() => {
    const set = new Set<string>();
    filteredDeliveries.forEach(d => { if (d.costPrice) set.add(d.prod); });
    const KNOWN = ['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil', 'Others'];
    filteredSales.forEach(s => { const m = KNOWN.find(p => matchesProd(s.pump, p)); if (m) set.add(m); });
    const order = ['PMS', 'AGO', 'LPG', 'Lube Oil', 'Others', 'DPK'];
    return [...order.filter(p => set.has(p)), ...[...set].filter(p => !order.includes(p))];
  }, [filteredSales, filteredDeliveries]);

  /* P&L per product */
  const pnlByProd = useMemo(() => {
    return allProds.map(prod => {
      const pe  = filteredSales.filter(s => matchesProd(s.pump, prod));
      const vol = pe.reduce((s, e) => s + e.L, 0);
      const rev = pe.reduce((s, e) => s + e.L * e.price, 0);
      const salesRevenue = Math.round(rev * scale);
      const avgSell = vol > 0 ? Math.round(rev / vol) : ((prices as any)[prod] ?? 0);
      const delivs = filteredDeliveries.filter(d => d.prod === prod && d.costPrice);
      const volRec = delivs.reduce((s, d) => s + d.rec, 0);
      const costTot= delivs.reduce((s, d) => s + d.rec * (d.costPrice ?? 0), 0);
      const avgCost= volRec > 0 ? costTot / volRec : 0;
      const scaledCOGS = Math.round(avgCost * vol * scale);
      const grossProfit= salesRevenue - scaledCOGS;
      const grossMargin= salesRevenue > 0 ? Math.round((grossProfit / salesRevenue) * 100) : null;
      return {
        prod, totalVolumeSold: vol, avgSellPrice: avgSell, currentSellPrice: (prices as any)[prod] ?? 0,
        salesRevenue, avgCostPerL: Math.round(avgCost), scaledCOGS, grossProfit, grossMargin,
        hasCostData: delivs.length > 0,
        priceChanges: priceHistory.filter(h => h.prod === prod).slice(0, 3),
      };
    }).filter(p => p.totalVolumeSold > 0 || p.scaledCOGS > 0);
  }, [allProds, filteredSales, filteredDeliveries, prices, priceHistory, scale]);

  const totalSalesRevPnl = pnlByProd.reduce((s, p) => s + p.salesRevenue, 0);
  const totalCOGS        = pnlByProd.reduce((s, p) => s + p.scaledCOGS,   0);
  const totalGrossProfit = totalSalesRevPnl - totalCOGS;
  const grossMarginPct   = totalSalesRevPnl > 0 ? Math.round((totalGrossProfit / totalSalesRevPnl) * 100) : 0;
  const netProfitPnl     = totalGrossProfit - scaledExp;
  const netMarginPct     = totalSalesRevPnl > 0 ? Math.round((netProfitPnl / totalSalesRevPnl) * 100) : 0;

  /* expense categories */
  const catTotals: Record<string, number> = {};
  for (const e of allApproved) catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amt;
  const allCats = Object.keys(catTotals).sort();
  const catScaled = Object.entries(catTotals).map(([cat, total]) => ({
    cat, total: Math.round(total / 30 * scale),
    pct: totalExpenses > 0 ? Math.round((total / totalExpenses) * 100) : 0,
  })).sort((a, b) => b.total - a.total);

  /* product sales */
  const prodSales = ['PMS', 'AGO', 'DPK', 'LPG'].map(prod => {
    const color = PROD_COLORS[prod] || roleColor;
    const L = filteredSales.filter(s => s.pump.includes(prod)).reduce((s, e) => s + e.L, 0);
    const price = (prices as any)[prod] ?? 0;
    return { prod, color, L, price, scaledL: Math.round(L * scale), scaledRev: Math.round(L * scale * price) };
  }).filter(p => p.L > 0);

  /* filtered views for prod/cat filter */
  const activeProdFilter = (reportType === 'pnl' || reportType === 'sales') ? prodFilter : null;
  const activeCatFilter  = reportType === 'expenses' ? catFilter : null;

  const visiblePnl  = activeProdFilter ? pnlByProd.filter(p => p.prod === activeProdFilter) : pnlByProd;
  const visibleExp  = activeCatFilter
    ? allApproved.filter(e => e.cat === activeCatFilter).slice().reverse()
    : allApproved.slice().reverse();
  const visibleProd = activeProdFilter ? prodSales.filter(p => p.prod === activeProdFilter) : prodSales;

  /* per-branch breakdown for "All Branches" summary */
  const branchBreakdown = useMemo(() => {
    if (selectedBranch !== null || branches.length === 0) return [];
    return branches.map(b => {
      const bSales = sales.filter(s => s.branchId === b.id);
      const bExp   = expenses.filter(e => e.status === 'approved' && e.branchId === b.id);
      const bRev   = Math.round(b.rev / 30 * scale);
      const bExpT  = Math.round(bExp.reduce((s, e) => s + e.amt, 0) / 30 * scale);
      const bSalesRev = Math.round(bSales.reduce((s, e) => s + e.L * e.price, 0) / 30 * scale);
      return { id: b.id, name: b.name, rev: bRev, expenses: bExpT, salesRev: bSalesRev, net: bRev - bExpT };
    });
  }, [branches, sales, expenses, selectedBranch, scale]);

  /* ── PDF export ── */
  function exportCurrentReport() {
    const periodStr = `${PERIOD_LABELS[period]} · ${fmtDate(from.toISOString())} – ${fmtDate(to.toISOString())}`;

    if (reportType === 'summary' || reportType === 'full') {
      const html = buildPdfHtml({
        title: reportType === 'full' ? 'Full Report' : 'Summary Report',
        period: periodStr, branchName, generatedAt,
        sections: [
          { heading: 'Financial Overview', rows: [
            { label: 'Total Revenue',    value: nfmt(scaledRev)   },
            { label: 'Total Sales',      value: nfmt(scaledSales) },
            { label: 'Total Expenses',   value: nfmt(scaledExp)   },
            { label: 'Net Balance',      value: nfmt(scaledNet)   },
            { label: 'Margin',           value: `${margin}%`      },
          ]},
          { heading: 'Expense Breakdown', rows: catScaled.map(c => ({ label: c.cat, value: `${nfmt(c.total)} (${c.pct}%)` })) },
          ...(reportType === 'full' ? [
            { heading: 'Profit & Loss Summary', rows: [
              { label: 'Sales Revenue',      value: nfmt(totalSalesRevPnl) },
              { label: 'Cost of Goods Sold', value: nfmt(totalCOGS)        },
              { label: 'Gross Profit',       value: nfmt(totalGrossProfit) },
              { label: 'Gross Margin',       value: `${grossMarginPct}%`   },
              { label: 'Operating Expenses', value: nfmt(scaledExp)        },
              { label: 'Net Profit / (Loss)',value: nfmt(netProfitPnl)     },
              { label: 'Net Margin',         value: `${netMarginPct}%`     },
            ]},
          ] : []),
        ],
        tables: [
          ...(branchBreakdown.length > 0 ? [{ heading: 'Branch Breakdown', headers: ['Branch', 'Revenue', 'Sales', 'Expenses', 'Net'],
            rows: branchBreakdown.map(b => [b.name, nfmt(b.rev), nfmt(b.salesRev), nfmt(b.expenses), nfmt(b.net)]) }] : []),
          ...(reportType === 'full' ? [
            { heading: 'Product P&L', headers: ['Product', 'Volume (L)', 'Revenue', 'COGS', 'Gross Profit', 'Margin'],
              rows: pnlByProd.map(p => [p.prod, (p.totalVolumeSold * scale).toLocaleString(), nfmt(p.salesRevenue), nfmt(p.scaledCOGS), nfmt(p.grossProfit), p.grossMargin !== null ? `${p.grossMargin}%` : '—']) },
            { heading: 'Sales by Product', headers: ['Product', 'Volume (L)', 'Unit Price', 'Revenue'],
              rows: prodSales.map(p => [p.prod, p.scaledL.toLocaleString(), nfmt(p.price), nfmt(p.scaledRev)]) },
            { heading: 'Expense Records', headers: ['Category', 'Description', 'By', 'Amount', 'Approved By'],
              rows: allApproved.slice().reverse().map(e => [e.cat, e.desc, e.byName, nfmt(e.amt), e.approvedBy ?? '—']) },
            { heading: 'Price Change History', headers: ['Product', 'Old Price', 'New Price', 'Change', 'By', 'Date'],
              rows: [...priceHistory].sort((a, b) => b.id - a.id).map(h => [h.prod, nfmt(h.oldPrice), nfmt(h.newPrice), `${h.newPrice > h.oldPrice ? '+' : ''}${nfmt(h.newPrice - h.oldPrice)}`, h.by, fmtDate(h.dt)]) },
          ] : []),
        ],
      });
      printReport(html); return;
    }

    if (reportType === 'pnl') {
      const rows = visiblePnl;
      const html = buildPdfHtml({
        title: `Profit & Loss Report${activeProdFilter ? ` — ${activeProdFilter}` : ''}`,
        period: periodStr, branchName, generatedAt,
        sections: [{ heading: 'P&L Summary', rows: [
          { label: 'Sales Revenue',          value: nfmt(rows.reduce((s, p) => s + p.salesRevenue, 0)) },
          { label: 'Cost of Goods Sold',     value: nfmt(rows.reduce((s, p) => s + p.scaledCOGS, 0))   },
          { label: 'Gross Profit',           value: nfmt(rows.reduce((s, p) => s + p.grossProfit, 0))   },
          { label: 'Gross Margin',           value: `${grossMarginPct}%`   },
          { label: 'Operating Expenses',     value: nfmt(scaledExp)        },
          { label: 'Net Profit / (Loss)',    value: nfmt(netProfitPnl)     },
          { label: 'Net Margin',             value: `${netMarginPct}%`     },
        ]}],
        tables: [{ heading: 'Product P&L', headers: ['Product', 'Volume (L)', 'Revenue', 'COGS', 'Gross Profit', 'Margin'],
          rows: rows.map(p => [p.prod, (p.totalVolumeSold * scale).toLocaleString(), nfmt(p.salesRevenue), nfmt(p.scaledCOGS), nfmt(p.grossProfit), p.grossMargin !== null ? `${p.grossMargin}%` : '—']) },
          { heading: 'Operating Expenses', headers: ['Category', 'Amount'], rows: catScaled.map(c => [c.cat, nfmt(c.total)]) }],
      });
      printReport(html); return;
    }

    if (reportType === 'expenses') {
      const html = buildPdfHtml({
        title: `Expense Report${activeCatFilter ? ` — ${activeCatFilter}` : ''}`,
        period: periodStr, branchName, generatedAt,
        sections: [{ heading: 'Summary', rows: [
          { label: 'Total Approved Expenses', value: nfmt(scaledExp) },
          { label: 'Records shown',           value: `${visibleExp.length}` },
          ...(activeCatFilter ? [{ label: 'Category filter', value: activeCatFilter }] : []),
        ]}],
        tables: [{ heading: 'Expense Records', headers: ['Category', 'Description', 'By', 'Amount', 'Approved By'],
          rows: visibleExp.map(e => [e.cat, e.desc, e.byName, nfmt(e.amt), e.approvedBy ?? '—']) }],
      });
      printReport(html); return;
    }

    if (reportType === 'sales') {
      const html = buildPdfHtml({
        title: `Sales Report${activeProdFilter ? ` — ${activeProdFilter}` : ''}`,
        period: periodStr, branchName, generatedAt,
        sections: [{ heading: 'Summary', rows: [
          { label: 'Total Sales Revenue', value: nfmt(scaledSales) },
          ...(activeProdFilter ? [{ label: 'Product filter', value: activeProdFilter }] : []),
        ]}],
        tables: [{ heading: 'Sales by Product', headers: ['Product', 'Volume (L)', 'Unit Price', 'Revenue'],
          rows: visibleProd.map(p => [p.prod, p.scaledL.toLocaleString(), nfmt(p.price), nfmt(p.scaledRev)]) }],
      });
      printReport(html); return;
    }

    if (reportType === 'prices') {
      const html = buildPdfHtml({
        title: 'Price Report', period: periodStr, branchName, generatedAt,
        sections: [{ heading: 'Current Prices', rows: (['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil'] as const).map(prod => ({
          label: prod, value: (prices as any)[prod] > 0 ? `₦${(prices as any)[prod].toLocaleString()}/L` : 'Not set',
        }))}],
        tables: [{ heading: 'Price Change History', headers: ['Product', 'Old Price', 'New Price', 'Change', 'By', 'Date'],
          rows: [...priceHistory].sort((a, b) => b.id - a.id).map(h => [h.prod, nfmt(h.oldPrice), nfmt(h.newPrice),
            `${h.newPrice > h.oldPrice ? '+' : ''}${nfmt(h.newPrice - h.oldPrice)}`, h.by, fmtDate(h.dt)]) }],
      });
      printReport(html);
    }
  }

  /* ─────────────────────────────────────────────────────── */
  /*  Render                                                  */
  /* ─────────────────────────────────────────────────────── */

  const reportTypeMeta = REPORT_TYPES.find(r => r.id === reportType)!;
  const periodStr = `${fmtDate(from.toISOString())} – ${fmtDate(to.toISOString())}`;

  return (
    <ScreenLayout title="Reports">
      {/* Branch selector */}
      {!isMgr && branches.length > 0 ? (
        <BranchBar branches={branches} selected={selectedBranch} onSelect={(id) => { setSelectedBranch(id); setGenerated(false); }} roleColor={roleColor} colors={colors} />
      ) : null}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── BUILDER PANEL ── */}
        <View style={[styles.builderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.builderTitle, { color: colors.text }]}>Build Your Report</Text>
          <Text style={[styles.builderSub, { color: colors.textMuted }]}>Choose report type, timeframe and optional filters, then generate.</Text>

          {/* Report type */}
          <Text style={[styles.builderLabel, { color: colors.textMuted }]}>Report Type</Text>
          <View style={styles.typeGrid}>
            {REPORT_TYPES.map(rt => {
              const active = reportType === rt.id;
              return (
                <TouchableOpacity key={rt.id} onPress={() => { setReportType(rt.id); setProdFilter(null); setCatFilter(null); setGenerated(false); }}
                  style={[styles.typeCard, {
                    backgroundColor: active ? roleColor + '12' : colors.background,
                    borderColor: active ? roleColor : colors.border,
                  }]}>
                  <Ionicons name={rt.icon as any} size={18} color={active ? roleColor : colors.textMuted} />
                  <Text style={[styles.typeCardLabel, { color: active ? roleColor : colors.text }]}>{rt.label}</Text>
                  <Text style={[styles.typeCardDesc, { color: colors.textSubtle }]} numberOfLines={2}>{rt.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Timeframe */}
          <Text style={[styles.builderLabel, { color: colors.textMuted }]}>Timeframe</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
            {PERIODS.map(p => {
              const active = period === p;
              return (
                <TouchableOpacity key={p} onPress={() => { setPeriod(p); setGenerated(false); }}
                  style={[styles.pill, { backgroundColor: active ? roleColor : colors.surface, borderColor: active ? roleColor : colors.border }]}>
                  <Text style={[styles.pillText, { color: active ? '#fff' : colors.textMuted }]}>{p}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Text style={[styles.dateRange, { color: colors.textSubtle }]}>
            {PERIOD_LABELS[period]} · {periodStr}
          </Text>

          {/* Optional product filter */}
          {(reportType === 'pnl' || reportType === 'sales') && allProds.length > 0 ? (
            <>
              <Text style={[styles.builderLabel, { color: colors.textMuted }]}>Filter by Product (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                <TouchableOpacity onPress={() => { setProdFilter(null); setGenerated(false); }}
                  style={[styles.pill, { backgroundColor: prodFilter === null ? roleColor + '15' : colors.surface, borderColor: prodFilter === null ? roleColor : colors.border }]}>
                  <Text style={[styles.pillText, { color: prodFilter === null ? roleColor : colors.textMuted }]}>All Products</Text>
                </TouchableOpacity>
                {allProds.map(p => {
                  const active = prodFilter === p;
                  const pc = PROD_COLORS[p] || roleColor;
                  return (
                    <TouchableOpacity key={p} onPress={() => { setProdFilter(p); setGenerated(false); }}
                      style={[styles.pill, { backgroundColor: active ? pc + '15' : colors.surface, borderColor: active ? pc : colors.border }]}>
                      <Text style={[styles.pillText, { color: active ? pc : colors.textMuted }]}>{p}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          {/* Optional category filter for expenses */}
          {reportType === 'expenses' && allCats.length > 0 ? (
            <>
              <Text style={[styles.builderLabel, { color: colors.textMuted }]}>Filter by Category (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                <TouchableOpacity onPress={() => { setCatFilter(null); setGenerated(false); }}
                  style={[styles.pill, { backgroundColor: catFilter === null ? roleColor + '15' : colors.surface, borderColor: catFilter === null ? roleColor : colors.border }]}>
                  <Text style={[styles.pillText, { color: catFilter === null ? roleColor : colors.textMuted }]}>All Categories</Text>
                </TouchableOpacity>
                {allCats.map(c => {
                  const active = catFilter === c;
                  return (
                    <TouchableOpacity key={c} onPress={() => { setCatFilter(c); setGenerated(false); }}
                      style={[styles.pill, { backgroundColor: active ? roleColor + '15' : colors.surface, borderColor: active ? roleColor : colors.border }]}>
                      <Text style={[styles.pillText, { color: active ? roleColor : colors.textMuted }]}>{c}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          {/* Generate button */}
          <TouchableOpacity onPress={() => setGenerated(true)}
            style={[styles.generateBtn, { backgroundColor: roleColor }]}>
            <Ionicons name="analytics" size={16} color="#fff" />
            <Text style={styles.generateBtnText}>Generate {reportTypeMeta.label}</Text>
          </TouchableOpacity>
        </View>

        {/* ── GENERATED REPORT ── */}
        {generated ? (
          <>
            {/* Report header */}
            <View style={[styles.reportHeader, { backgroundColor: roleColor }]}>
              <View style={styles.reportHeaderTop}>
                <Ionicons name={reportTypeMeta.icon as any} size={18} color="rgba(255,255,255,0.8)" />
                <Text style={styles.reportHeaderTitle}>{reportTypeMeta.label}</Text>
              </View>
              <Text style={styles.reportHeaderMeta}>{PERIOD_LABELS[period]} · {branchName}</Text>
              <Text style={styles.reportHeaderDate}>{periodStr}</Text>
              {activeProdFilter ? <Text style={styles.reportHeaderFilter}>Product: {activeProdFilter}</Text> : null}
              {activeCatFilter  ? <Text style={styles.reportHeaderFilter}>Category: {activeCatFilter}</Text>  : null}

              {/* PDF export button inside header */}
              <TouchableOpacity onPress={exportCurrentReport}
                style={styles.headerExportBtn}>
                <Ionicons name="download-outline" size={14} color={roleColor} />
                <Text style={[styles.headerExportBtnText, { color: roleColor }]}>Download PDF</Text>
              </TouchableOpacity>
            </View>

            {/* ── Summary content ── */}
            {(reportType === 'summary' || reportType === 'full') ? (
              <>
                <View style={styles.kpiRow}>
                  {[
                    { label: 'Revenue',  value: scaledRev,   icon: 'trending-up-outline',   color: '#27500A' },
                    { label: 'Sales',    value: scaledSales, icon: 'bar-chart-outline',      color: '#185FA5' },
                    { label: 'Expenses', value: scaledExp,   icon: 'trending-down-outline',  color: '#791F1F' },
                    { label: 'Net',      value: scaledNet,   icon: 'wallet-outline',          color: scaledNet >= 0 ? '#27500A' : '#791F1F' },
                  ].map(k => (
                    <View key={k.label} style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name={k.icon as any} size={14} color={k.color} />
                      <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>{k.label}</Text>
                      <Text style={[styles.kpiValue, { color: k.color }]}>{fmt(k.value)}</Text>
                    </View>
                  ))}
                </View>
                <View style={[styles.marginRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.marginLabel, { color: colors.textMuted }]}>Net Margin</Text>
                  <View style={[styles.progressBg, { flex: 1, backgroundColor: colors.border, marginHorizontal: 10 }]}>
                    <View style={[styles.progressBar, { width: `${Math.max(0, Math.min(Math.abs(margin), 100))}%` as any, backgroundColor: margin >= 0 ? '#27500A' : '#791F1F' }]} />
                  </View>
                  <Text style={[styles.marginPct, { color: margin >= 0 ? '#27500A' : '#791F1F' }]}>{margin}%</Text>
                </View>

                {branchBreakdown.length > 0 ? (
                  <>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Branch Breakdown</Text>
                    {branchBreakdown.map(b => (
                      <View key={b.id} style={[styles.branchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.branchRowName, { color: colors.text }]}>{b.name}</Text>
                          <Text style={[styles.branchRowSub, { color: colors.textMuted }]}>Rev {fmt(b.rev)} · Sales {fmt(b.salesRev)}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.branchRowNet, { color: b.net >= 0 ? '#27500A' : '#791F1F' }]}>{fmt(b.net)}</Text>
                          <Text style={[styles.branchRowSub, { color: colors.textMuted }]}>Exp {fmt(b.expenses)}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                ) : null}

                <Text style={[styles.sectionTitle, { color: colors.text }]}>Expense Breakdown</Text>
                {catScaled.map(c => (
                  <View key={c.cat} style={[styles.catRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={[styles.catName, { color: colors.text }]}>{c.cat}</Text>
                        <Text style={[styles.catAmt, { color: roleColor }]}>{fmt(c.total)}</Text>
                      </View>
                      <View style={[styles.progressBg, { backgroundColor: colors.border }]}>
                        <View style={[styles.progressBar, { width: `${c.pct}%` as any, backgroundColor: roleColor }]} />
                      </View>
                      <Text style={[{ fontSize: 10, marginTop: 4, color: colors.textMuted }]}>{c.pct}% of expenses</Text>
                    </View>
                  </View>
                ))}

                {/* Full report also shows P&L + Sales sections */}
                {reportType === 'full' ? (
                  <>
                    <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 4 }]}>Profit & Loss</Text>
                    {renderPnlSection(visiblePnl, colors, roleColor, scale, netProfitPnl, netMarginPct, totalSalesRevPnl, totalCOGS, totalGrossProfit, grossMarginPct, scaledExp, catScaled)}
                    <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 4 }]}>Sales by Product</Text>
                    {renderSalesSection(prodSales, colors, roleColor, scaledSales)}
                  </>
                ) : null}
              </>
            ) : null}

            {/* ── P&L content ── */}
            {reportType === 'pnl' ? renderPnlSection(visiblePnl, colors, roleColor, scale, netProfitPnl, netMarginPct, totalSalesRevPnl, totalCOGS, totalGrossProfit, grossMarginPct, scaledExp, catScaled) : null}

            {/* ── Expenses content ── */}
            {reportType === 'expenses' ? (
              <>
                <View style={[styles.totalPill, { backgroundColor: roleColor + '18', borderColor: roleColor + '33' }]}>
                  <Text style={[styles.totalPillLabel, { color: roleColor }]}>Total Approved Expenses</Text>
                  <Text style={[styles.totalPillValue, { color: roleColor }]}>{fmt(scaledExp)}</Text>
                </View>
                {visibleExp.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="receipt-outline" size={36} color={colors.border} />
                    <Text style={[{ fontSize: 14, color: colors.textMuted }]}>No approved expenses</Text>
                  </View>
                ) : null}
                {visibleExp.map(e => (
                  <View key={e.id} style={[styles.expCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[{ fontSize: 13, fontWeight: '700', color: colors.text }]}>{e.cat}</Text>
                      <Text style={[{ fontSize: 12, marginTop: 2, color: colors.textMuted }]}>{e.desc}</Text>
                      <Text style={[{ fontSize: 10, marginTop: 3, color: colors.textSubtle }]}>by {e.byName} · Approved by {e.approvedBy}</Text>
                    </View>
                    <Text style={[{ fontSize: 15, fontWeight: '700', color: roleColor }]}>{fmt(e.amt)}</Text>
                  </View>
                ))}
              </>
            ) : null}

            {/* ── Sales content ── */}
            {reportType === 'sales' ? renderSalesSection(visibleProd, colors, roleColor, scaledSales) : null}

            {/* ── Prices content ── */}
            {reportType === 'prices' ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Current Prices</Text>
                {(['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil'] as const).map(prod => {
                  const price = (prices as any)[prod] ?? 0;
                  const pc = PROD_COLORS[prod] || roleColor;
                  const lastChange = priceHistory.filter(h => h.prod === prod).sort((a, b) => b.id - a.id)[0];
                  return (
                    <View key={prod} style={[styles.catRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={[styles.prodDot, { backgroundColor: pc }]} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={[styles.catName, { color: colors.text }]}>{prod}</Text>
                          <Text style={[styles.catAmt, { color: price > 0 ? pc : colors.textSubtle }]}>
                            {price > 0 ? `₦${price.toLocaleString()}/L` : 'Not set'}
                          </Text>
                        </View>
                        {lastChange ? (
                          <Text style={[{ fontSize: 10, color: colors.textMuted }]}>
                            Last changed by {lastChange.by} · {fmtDate(lastChange.dt)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}

                <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 8 }]}>Price Change History</Text>
                {priceHistory.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="pricetag-outline" size={36} color={colors.border} />
                    <Text style={[{ fontSize: 14, color: colors.textMuted }]}>No price changes recorded</Text>
                  </View>
                ) : [...priceHistory].sort((a, b) => b.id - a.id).map(h => {
                  const pc = PROD_COLORS[h.prod] || roleColor;
                  const up = h.newPrice > h.oldPrice;
                  return (
                    <View key={h.id} style={[styles.priceHistRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={[styles.priceHistTag, { backgroundColor: pc + '18' }]}>
                        <Text style={[{ fontSize: 11, fontWeight: '700', color: pc }]}>{h.prod}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[{ fontSize: 13, textDecorationLine: 'line-through', color: colors.textMuted }]}>₦{h.oldPrice.toLocaleString()}</Text>
                          <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={12} color={up ? '#27500A' : '#791F1F'} />
                          <Text style={[{ fontSize: 13, fontWeight: '700', color: colors.text }]}>₦{h.newPrice.toLocaleString()}</Text>
                          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: up ? '#EAF3DE' : '#FCEBEB' }}>
                            <Text style={[{ fontSize: 11, fontWeight: '700', color: up ? '#27500A' : '#791F1F' }]}>
                              {up ? '+' : ''}₦{(h.newPrice - h.oldPrice).toLocaleString()}
                            </Text>
                          </View>
                        </View>
                        <Text style={[{ fontSize: 11, color: colors.textSubtle }]}>{h.by} · {fmtDate(h.dt)}</Text>
                      </View>
                    </View>
                  );
                })}

                {priceProposals.length > 0 ? (
                  <>
                    <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 8 }]}>Proposal History</Text>
                    {[...priceProposals].sort((a, b) => b.id - a.id).map(p => {
                      const pc = PROD_COLORS[p.prod] || roleColor;
                      const up = p.proposedPrice > p.currentPrice;
                      const statusColor = p.status === 'approved' ? '#27500A' : p.status === 'rejected' ? '#791F1F' : '#BA7517';
                      const statusBg    = p.status === 'approved' ? '#EAF3DE'  : p.status === 'rejected' ? '#FCEBEB'  : '#FAEEDA';
                      return (
                        <View key={p.id} style={[styles.priceHistRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                          <View style={[styles.priceHistTag, { backgroundColor: pc + '18' }]}>
                            <Text style={[{ fontSize: 11, fontWeight: '700', color: pc }]}>{p.prod}</Text>
                          </View>
                          <View style={{ flex: 1, gap: 3 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[{ fontSize: 13, textDecorationLine: 'line-through', color: colors.textMuted }]}>₦{p.currentPrice.toLocaleString()}</Text>
                              <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={12} color={up ? '#27500A' : '#791F1F'} />
                              <Text style={[{ fontSize: 13, fontWeight: '700', color: colors.text }]}>₦{p.proposedPrice.toLocaleString()}</Text>
                            </View>
                            <Text style={[{ fontSize: 11, color: colors.textSubtle }]}>
                              By {p.proposedBy}{p.reviewedBy ? ` · ${p.status === 'approved' ? 'Approved' : 'Rejected'} by ${p.reviewedBy}` : ''} · {fmtDate(p.proposedAt)}
                            </Text>
                          </View>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: statusBg }}>
                            <Text style={[{ fontSize: 11, fontWeight: '700', color: statusColor, textTransform: 'capitalize' }]}>{p.status}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </>
                ) : null}
              </>
            ) : null}

            {/* Bottom export banner */}
            <TouchableOpacity onPress={exportCurrentReport}
              style={[styles.bottomExportBtn, { backgroundColor: roleColor }]}>
              <Ionicons name="download-outline" size={16} color="#fff" />
              <Text style={styles.bottomExportBtnText}>Download {reportTypeMeta.label} as PDF</Text>
            </TouchableOpacity>
          </>
        ) : (
          /* Empty state — not yet generated */
          <View style={[styles.notYetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="document-text-outline" size={40} color={colors.border} />
            <Text style={[styles.notYetText, { color: colors.textMuted }]}>
              Select your options above, then tap Generate to view the report.
            </Text>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

/* ─── Reusable section renderers ─────────────────────────── */
function renderPnlSection(
  visiblePnl: any[], colors: any, roleColor: string, scale: number,
  netProfitPnl: number, netMarginPct: number, totalSalesRevPnl: number,
  totalCOGS: number, totalGrossProfit: number, grossMarginPct: number,
  scaledExp: number, catScaled: { cat: string; total: number; pct: number }[],
) {
  return (
    <>
      <View style={[styles.plHeader, { backgroundColor: netProfitPnl >= 0 ? '#0a2318' : '#791F1F' }]}>
        <Text style={styles.plHeaderLabel}>Profit & Loss</Text>
        <Text style={styles.plHeaderNet}>{fmt(netProfitPnl)}</Text>
        <Text style={styles.plHeaderSub}>{netProfitPnl >= 0 ? 'Net Profit' : 'Net Loss'} · {netMarginPct}% net margin</Text>
        <View style={{ flexDirection: 'row' }}>
          {[
            { label: 'Sales Revenue', value: totalSalesRevPnl },
            { label: 'Cost of Goods', value: totalCOGS        },
            { label: 'Gross Profit',  value: totalGrossProfit  },
          ].map(item => (
            <View key={item.label} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, marginBottom: 3 }}>{item.label}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: item.label === 'Cost of Goods' ? '#ffb3b3' : '#fff' }}>{fmt(item.value)}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={[styles.marginRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.marginLabel, { color: colors.textMuted }]}>Gross Margin</Text>
        <View style={[styles.progressBg, { flex: 1, backgroundColor: colors.border, marginHorizontal: 10 }]}>
          <View style={[styles.progressBar, { width: `${Math.max(0, Math.min(grossMarginPct, 100))}%` as any, backgroundColor: grossMarginPct >= 0 ? '#27500A' : '#791F1F' }]} />
        </View>
        <Text style={[styles.marginPct, { color: grossMarginPct >= 0 ? '#27500A' : '#791F1F' }]}>{grossMarginPct}%</Text>
      </View>
      {visiblePnl.map((p: any) => {
        const pc = PROD_COLORS[p.prod] || roleColor;
        const profitable = p.grossProfit >= 0;
        return (
          <View key={p.prod} style={[styles.plProdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: pc + '15' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: pc }}>{p.prod}</Text>
              </View>
              <View style={{ flex: 1 }} />
              {p.grossMargin !== null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: profitable ? '#EAF3DE' : '#FCEBEB' }}>
                  <Ionicons name={profitable ? 'trending-up' : 'trending-down'} size={11} color={profitable ? '#27500A' : '#791F1F'} />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: profitable ? '#27500A' : '#791F1F' }}>{p.grossMargin}% gross margin</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row' }}>
              {[
                { label: 'Volume Sold', val: `${(p.totalVolumeSold * scale).toLocaleString()} L` },
                { label: 'Avg Sell',    val: `₦${p.avgSellPrice.toLocaleString()}/L`, color: pc },
                { label: 'Avg Cost',    val: p.hasCostData ? `₦${p.avgCostPerL.toLocaleString()}/L` : '—' },
              ].map(g => (
                <View key={g.label} style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>{g.label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: g.color ?? colors.text }}>{g.val}</Text>
                </View>
              ))}
            </View>
            {[
              { label: 'Sales Revenue (actual prices)', value: p.salesRevenue, color: '#185FA5', icon: 'cash-outline' },
              { label: 'Cost of Goods Sold',            value: p.scaledCOGS,   color: '#791F1F', icon: 'pricetag-outline' },
              { label: 'Gross Profit',                  value: p.grossProfit,  color: profitable ? '#27500A' : '#791F1F', icon: profitable ? 'trending-up' : 'trending-down' },
            ].map(row => (
              <View key={row.label} style={[styles.plRowItem, { borderTopColor: colors.border }]}>
                <Ionicons name={row.icon as any} size={13} color={row.color} />
                <Text style={{ flex: 1, fontSize: 12, color: colors.textMuted }}>{row.label}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: row.color }}>{fmt(row.value)}</Text>
              </View>
            ))}
          </View>
        );
      })}
      <View style={[styles.plOpexCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[{ fontSize: 14, fontWeight: '700', marginBottom: 6, color: colors.text }]}>Operating Expenses</Text>
        {catScaled.slice(0, 5).map(c => (
          <View key={c.cat} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>{c.cat}</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#791F1F' }}>{fmt(c.total)}</Text>
          </View>
        ))}
        {catScaled.length > 5 ? <Text style={{ fontSize: 11, color: colors.textSubtle }}>+ {catScaled.length - 5} more</Text> : null}
        <View style={[{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Total Operating Expenses</Text>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#791F1F' }}>{fmt(scaledExp)}</Text>
        </View>
      </View>
      <View style={[styles.plFinalCard, { backgroundColor: netProfitPnl >= 0 ? '#EAF3DE' : '#FCEBEB', borderColor: netProfitPnl >= 0 ? '#27500A33' : '#791F1F33' }]}>
        <View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: netProfitPnl >= 0 ? '#27500A' : '#791F1F' }}>
            {netProfitPnl >= 0 ? 'Net Profit' : 'Net Loss'}
          </Text>
          <Text style={{ fontSize: 10, marginTop: 3, color: netProfitPnl >= 0 ? '#3a6e1c' : '#aa2222' }}>
            Gross Profit − Operating Expenses
          </Text>
        </View>
        <Text style={{ fontSize: 22, fontWeight: '900', marginLeft: 'auto', color: netProfitPnl >= 0 ? '#27500A' : '#791F1F' }}>{fmt(netProfitPnl)}</Text>
      </View>
    </>
  );
}

function renderSalesSection(prodSales: any[], colors: any, roleColor: string, scaledSales: number) {
  return (
    <>
      <View style={[styles.totalPill, { backgroundColor: roleColor + '18', borderColor: roleColor + '33' }]}>
        <Text style={[styles.totalPillLabel, { color: roleColor }]}>Total Sales Revenue</Text>
        <Text style={[styles.totalPillValue, { color: roleColor }]}>{fmt(scaledSales)}</Text>
      </View>
      {prodSales.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="bar-chart-outline" size={36} color={colors.border} />
          <Text style={[{ fontSize: 14, color: colors.textMuted }]}>No sales data</Text>
        </View>
      ) : null}
      {prodSales.map(p => (
        <View key={p.prod} style={[styles.catRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.prodDot, { backgroundColor: p.color }]} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={[styles.catName, { color: colors.text }]}>{p.prod}</Text>
              <Text style={[styles.catAmt, { color: p.color }]}>{fmt(p.scaledRev)}</Text>
            </View>
            <Text style={[{ fontSize: 10, color: colors.textMuted }]}>{p.scaledL.toLocaleString()} L · ₦{p.price.toLocaleString()}/L</Text>
          </View>
        </View>
      ))}
    </>
  );
}

/* ─── Styles ─────────────────────────────────────────────── */
const styles = StyleSheet.create({
  scroll:              { padding: 16 },
  pill:                { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  pillText:            { fontSize: 12, fontWeight: '600' },
  pillRow:             { flexDirection: 'row', gap: 6, paddingBottom: 4 },
  builderCard:         { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16, gap: 12 },
  builderTitle:        { fontSize: 17, fontWeight: '800' },
  builderSub:          { fontSize: 12, lineHeight: 17, marginTop: -6 },
  builderLabel:        { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  typeGrid:            { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeCard:            { width: '47%', borderRadius: 12, borderWidth: 1.5, padding: 12, gap: 4 },
  typeCardLabel:       { fontSize: 13, fontWeight: '700' },
  typeCardDesc:        { fontSize: 10, lineHeight: 13 },
  dateRange:           { fontSize: 11, marginTop: -6 },
  generateBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, marginTop: 4 },
  generateBtnText:     { color: '#fff', fontSize: 15, fontWeight: '800' },
  reportHeader:        { borderRadius: 14, padding: 18, marginBottom: 14, gap: 4 },
  reportHeaderTop:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  reportHeaderTitle:   { color: '#fff', fontSize: 18, fontWeight: '800' },
  reportHeaderMeta:    { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  reportHeaderDate:    { color: 'rgba(255,255,255,0.55)', fontSize: 11 },
  reportHeaderFilter:  { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', marginTop: 2 },
  headerExportBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, alignSelf: 'flex-start', marginTop: 10 },
  headerExportBtnText: { fontSize: 13, fontWeight: '700' },
  kpiRow:              { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kpiCard:             { flex: 1, borderRadius: 12, borderWidth: 1, padding: 10, alignItems: 'center', gap: 3 },
  kpiLabel:            { fontSize: 9, fontWeight: '600', textTransform: 'uppercase' },
  kpiValue:            { fontSize: 13, fontWeight: '800' },
  marginRow:           { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 14 },
  marginLabel:         { fontSize: 12, fontWeight: '600', width: 80 },
  marginPct:           { fontSize: 14, fontWeight: '800', width: 42, textAlign: 'right' },
  progressBg:          { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBar:         { height: 6, borderRadius: 3 },
  sectionTitle:        { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  catRow:              { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  prodDot:             { width: 10, height: 10, borderRadius: 5 },
  catName:             { fontSize: 13, fontWeight: '600' },
  catAmt:              { fontSize: 13, fontWeight: '700' },
  branchRow:           { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  branchRowName:       { fontSize: 14, fontWeight: '700' },
  branchRowSub:        { fontSize: 11, marginTop: 2 },
  branchRowNet:        { fontSize: 16, fontWeight: '800' },
  totalPill:           { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 14, alignItems: 'center' },
  totalPillLabel:      { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  totalPillValue:      { fontSize: 28, fontWeight: '800' },
  expCard:             { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  emptyState:          { alignItems: 'center', paddingVertical: 40, gap: 10 },
  plHeader:            { borderRadius: 16, padding: 20, marginBottom: 14, gap: 4 },
  plHeaderLabel:       { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  plHeaderNet:         { color: '#fff', fontSize: 34, fontWeight: '800' },
  plHeaderSub:         { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 8 },
  plProdCard:          { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 8, backgroundColor: 'transparent' },
  plRowItem:           { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  plOpexCard:          { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  plFinalCard:         { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  priceHistRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8 },
  priceHistTag:        { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignItems: 'center', minWidth: 44 },
  notYetCard:          { borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', padding: 40, alignItems: 'center', gap: 14, marginTop: 8 },
  notYetText:          { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  bottomExportBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14, marginTop: 16, marginBottom: 8 },
  bottomExportBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
