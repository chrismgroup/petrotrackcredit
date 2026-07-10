import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import React, { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { Branch, Role, ROLE_COLORS, fmt, fmtDate, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

/* ─── Types ─────────────────────────────────────────────── */
type Period = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
type ReportType =
  | 'summary' | 'pnl' | 'expenses' | 'sales' | 'prices'
  | 'maintenance' | 'operations' | 'hr' | 'marketing' | 'full';

const ALL_REPORT_TYPES: ReportType[] = [
  'summary','pnl','expenses','sales','prices',
  'maintenance','operations','hr','marketing','full',
];

const PERIODS: Period[] = ['Daily','Weekly','Monthly','Quarterly','Yearly'];
const SCALE: Record<Period,number> = { Daily:1, Weekly:7, Monthly:30, Quarterly:90, Yearly:365 };
const PROD_COLORS: Record<string,string> = {
  PMS:'#1a6e3c', AGO:'#185FA5', DPK:'#BA7517', LPG:'#633806',
};

/* ─── Role permission matrix ─────────────────────────────── */
type PermSet = { visible: ReportType[]; canGenerate: ReportType[] };
const ALL = ALL_REPORT_TYPES;
const ROLE_PERMS: Partial<Record<Role, PermSet>> & { default: PermSet } = {
  // Executive — full access
  admin:  { visible: ALL, canGenerate: ALL },
  ceo:    { visible: ALL, canGenerate: ALL },
  md:     { visible: ALL, canGenerate: ALL },

  // Finance head — financial reports + view sales/prices
  acc:    {
    visible:     ['summary','pnl','expenses','sales','prices','full'],
    canGenerate: ['summary','pnl','expenses','full'],
  },

  // HR / Customer Service head — HR + branch-level financial overview
  csm:    {
    visible:     ['hr','summary','expenses','sales','prices','operations'],
    canGenerate: ['hr','summary','expenses'],
  },

  // Marketing head — sales, pricing & marketing reports
  mktg:   {
    visible:     ['sales','prices','marketing','summary','expenses'],
    canGenerate: ['sales','prices','marketing'],
  },

  // Station Manager — branch-scoped reports only (data already filtered by branchId)
  mgr:    {
    visible:     ['summary','expenses','sales','prices','operations','maintenance'],
    canGenerate: ['summary','expenses','sales','prices','operations'],
  },

  default: { visible: [], canGenerate: [] },
};

function getPerms(role: Role | null): PermSet {
  if (!role) return ROLE_PERMS.default;
  return (ROLE_PERMS as any)[role] ?? ROLE_PERMS.default;
}

/* ─── Report metadata ────────────────────────────────────── */
const REPORT_META: Record<ReportType, { label: string; icon: string; desc: string; dept: string; color: string }> = {
  summary:     { label:'Summary',              icon:'stats-chart-outline',  desc:'Revenue, expenses & net balance',       dept:'Finance',     color:'#185FA5' },
  pnl:         { label:'Profit & Loss',        icon:'trending-up-outline',  desc:'Gross / net profit with COGS',          dept:'Finance',     color:'#27500A' },
  expenses:    { label:'Expenses',             icon:'receipt-outline',      desc:'Approved expense ledger by category',   dept:'Finance',     color:'#791F1F' },
  sales:       { label:'Sales',                icon:'bar-chart-outline',    desc:'Product sales volume & revenue',        dept:'Marketing',   color:'#1a6e3c' },
  prices:      { label:'Prices',               icon:'pricetag-outline',     desc:'Current prices & change history',       dept:'Marketing',   color:'#BA7517' },
  maintenance: { label:'Maintenance',          icon:'construct-outline',    desc:'Equipment & facility work log',         dept:'Operations',  color:'#633806' },
  operations:  { label:'Operations',           icon:'speedometer-outline',  desc:'Dip records & tank level summary',      dept:'Operations',  color:'#185FA5' },
  hr:          { label:'Human Resources',      icon:'people-outline',       desc:'Staff headcount, roles & status',       dept:'HR',          color:'#7B3FA8' },
  marketing:   { label:'Marketing',            icon:'megaphone-outline',    desc:'Price proposals & promotional activity',dept:'Marketing',   color:'#C45C1A' },
  full:        { label:'Full Report',          icon:'document-text-outline',desc:'All sections combined in one PDF',      dept:'All',         color:'#0a3a1e' },
};

/* ─── Helpers ────────────────────────────────────────────── */
function periodRange(p: Period): { from: Date; to: Date } {
  const now = new Date(); const to = new Date(now); const from = new Date(now);
  from.setDate(from.getDate() - (SCALE[p] - 1)); from.setHours(0,0,0,0);
  return { from, to };
}
function matchesProd(pump: string, prod: string): boolean {
  const p = pump.toLowerCase();
  if (prod === 'Lube Oil') return p.includes('lube');
  if (prod === 'Others')   return p.includes('other');
  return p.includes(prod.toLowerCase());
}
function nfmt(n: number) { return '₦' + n.toLocaleString('en-NG', { maximumFractionDigits: 0 }); }
function priColor(pri: string) { return pri === 'Urgent' ? '#791F1F' : pri === 'Medium' ? '#BA7517' : '#185FA5'; }
function priBg(pri: string)    { return pri === 'Urgent' ? '#FCEBEB' : pri === 'Medium' ? '#FAEEDA' : '#EBF0FA'; }
function stColor(st: string)   { return st === 'active' ? '#27500A' : st === 'suspended' ? '#791F1F' : '#999'; }

/* ─── PDF builder ───────────────────────────────────────── */
function buildPdf(opts: {
  title: string; period: string; branchName: string; generatedAt: string; generatedBy: string;
  sections: Array<{ heading: string; rows: Array<{ label: string; value: string }> }>;
  tables?: Array<{ heading: string; headers: string[]; rows: string[][] }>;
}) {
  const sec = opts.sections.map(s => `<div class="section"><h3>${s.heading}</h3><table class="kv">
    ${s.rows.map(r => `<tr><td class="lbl">${r.label}</td><td class="val">${r.value}</td></tr>`).join('')}
    </table></div>`).join('');
  const tbl = (opts.tables ?? []).map(t => `<div class="section"><h3>${t.heading}</h3><table class="data">
    <thead><tr>${t.headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a;margin:0;padding:24px}
  .header{background:#0a3a1e;color:#fff;padding:20px 24px;border-radius:8px;margin-bottom:16px}
  .header h1{margin:0 0 4px;font-size:20px}.header p{margin:0;opacity:.7;font-size:12px}
  .meta{display:flex;gap:12px;margin-bottom:20px}
  .meta-item{flex:1;background:#f5f5f3;border-radius:6px;padding:10px 14px}
  .meta-item .k{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.5px}
  .meta-item .v{font-size:13px;font-weight:700;margin-top:2px}
  .section{margin-bottom:20px}
  .section h3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#444;
    border-bottom:1.5px solid #e5e5e3;padding-bottom:6px;margin-bottom:10px}
  table.kv{width:100%;border-collapse:collapse}
  table.kv tr:nth-child(even) td{background:#f9f9f7}
  table.kv td{padding:7px 10px;font-size:13px}
  table.kv td.lbl{color:#555;width:55%}table.kv td.val{font-weight:700;text-align:right}
  table.data{width:100%;border-collapse:collapse}
  table.data th{background:#0a3a1e;color:#fff;padding:8px 10px;font-size:11px;text-align:left}
  table.data td{padding:7px 10px;font-size:12px;border-bottom:1px solid #f0f0ee}
  table.data tr:nth-child(even) td{background:#f9f9f7}
  .footer{text-align:center;font-size:10px;color:#999;margin-top:32px;border-top:1px solid #e5e5e3;padding-top:12px}
  </style></head><body>
  <div class="header"><h1>PetroTrack NG — ${opts.title}</h1>
  <p>${opts.period} &bull; ${opts.branchName} &bull; By ${opts.generatedBy}</p></div>
  <div class="meta">
    <div class="meta-item"><div class="k">Period</div><div class="v">${opts.period}</div></div>
    <div class="meta-item"><div class="k">Branch</div><div class="v">${opts.branchName}</div></div>
    <div class="meta-item"><div class="k">Generated by</div><div class="v">${opts.generatedBy}</div></div>
    <div class="meta-item"><div class="k">Date</div><div class="v">${opts.generatedAt}</div></div>
  </div>${sec}${tbl}
  <div class="footer">Generated by PetroTrack NG &bull; Confidential &bull; ${opts.generatedAt}</div>
  </body></html>`;
}

async function doPrint(html: string) {
  try {
    if (Platform.OS === 'web') { await Print.printAsync({ html }); }
    else { const { uri } = await Print.printToFileAsync({ html }); await Print.printAsync({ uri }); }
  } catch (e: any) {
    if (!e?.message?.includes('cancel')) Alert.alert('Export failed', e?.message ?? 'Could not generate PDF');
  }
}

/* ─── Branch selector ───────────────────────────────────── */
function BranchBar({ branches, selected, onSelect, rc, colors }: {
  branches: Branch[]; selected: string | null; onSelect: (id: string | null) => void; rc: string; colors: any;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e3' }}
      contentContainerStyle={{ flexDirection:'row', gap:6, padding:10, paddingHorizontal:12 }}>
      {[{ id: null, name: 'All Branches', icon: 'layers-outline' }, ...branches.map(b => ({ id: b.id, name: b.name, icon: 'business-outline' }))].map(b => {
        const active = selected === b.id;
        return (
          <TouchableOpacity key={String(b.id)} onPress={() => onSelect(b.id as string | null)}
            style={[styles.pill, { backgroundColor: active ? rc : colors.surface, borderColor: active ? rc : colors.border }]}>
            <Ionicons name={b.icon as any} size={12} color={active ? '#fff' : colors.textMuted} />
            <Text style={[styles.pillText, { color: active ? '#fff' : colors.textMuted }]}>{b.name}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN SCREEN
═══════════════════════════════════════════════════════════ */
export default function ReportsScreen() {
  'use no memo';
  const {
    role, userName, branchId,
    expenses, sales, branches, deliveries, prices, priceHistory, priceProposals,
    maintenance, dips, staff, hrEmployees,
  } = useApp();
  const colors = useColors();
  const rc = ROLE_COLORS[role || 'acc'] || colors.primary;
  const isMgr = role === 'mgr' || role === 'csm' || role === 'mktg';
  const perms = getPerms(role);

  /* Safety guards: persisted state restored from AsyncStorage may occasionally
     arrive as a non-array (e.g. corrupted JSON → object). Guard here once so
     every downstream computation stays crash-free. */
  const safeSales        = Array.isArray(sales)         ? sales         : [];
  const safeDeliveries   = Array.isArray(deliveries)    ? deliveries    : [];
  const safeExpenses     = Array.isArray(expenses)      ? expenses      : [];
  const safeBranches     = Array.isArray(branches)      ? branches      : [];
  const safeMaintenance  = Array.isArray(maintenance)   ? maintenance   : [];
  const safeDips         = Array.isArray(dips)          ? dips          : [];
  const safeHrEmployees  = Array.isArray(hrEmployees)   ? hrEmployees   : [];
  const safeProposals    = Array.isArray(priceProposals) ? priceProposals : [];

  const [selBranch,  setSelBranch]  = useState<string | null>(isMgr ? (branchId ?? null) : null);
  const [reportType, setReportType] = useState<ReportType>(perms.canGenerate[0] ?? perms.visible[0] ?? 'summary');
  const [period,     setPeriod]     = useState<Period>('Monthly');
  const [prodFilter, setProdFilter] = useState<string | null>(null);
  const [catFilter,  setCatFilter]  = useState<string | null>(null);
  const [generated,  setGenerated]  = useState(false);

  const { from, to } = useMemo(() => periodRange(period), [period]);
  const scale = SCALE[period];
  const branchName = selBranch === null
    ? 'All Branches'
    : (safeBranches.find(b => b.id === selBranch)?.name ?? selBranch);
  const periodStr   = `${fmtDate(from.toISOString())} – ${fmtDate(to.toISOString())}`;
  const generatedAt = new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
  const canDownload = perms.canGenerate.includes(reportType);
  const meta = REPORT_META[reportType] ?? REPORT_META.summary;

  /* ─ Filtered data ─ */
  const fb = <T extends { branchId?: string }>(arr: T[]) =>
    selBranch === null ? arr : arr.filter(x => x.branchId === selBranch || !x.branchId);

  const fSales = useMemo(() => fb(safeSales),      [safeSales,      selBranch]);
  const fDelvs = useMemo(() => fb(safeDeliveries), [safeDeliveries, selBranch]);
  const fExps  = useMemo(() => fb(safeExpenses),   [safeExpenses,   selBranch]);

  const approved    = fExps.filter(e => e.status === 'approved');
  const totalExp    = approved.reduce((s, e) => s + e.amt, 0);
  const totalRev    = safeBranches.filter(b => selBranch === null || b.id === selBranch).reduce((s, b) => s + b.rev, 0);
  const scaledExp   = Math.round(totalExp / 30 * scale);
  const scaledRev   = Math.round(totalRev / 30 * scale);
  const scaledSales = Math.round(fSales.reduce((s, e) => s + e.L * e.price, 0) / 30 * scale);
  const scaledNet   = scaledRev - scaledExp;
  const margin      = scaledRev > 0 ? Math.round((scaledNet / scaledRev) * 100) : 0;

  /* products */
  const allProds = useMemo(() => {
    const set = new Set<string>();
    fDelvs.forEach(d => { if (d.costPrice) set.add(d.prod); });
    const K = ['PMS','AGO','DPK','LPG','Lube Oil','Others'];
    fSales.forEach(s => { const m = K.find(p => matchesProd(s.pump, p)); if (m) set.add(m); });
    const order = ['PMS','AGO','LPG','Lube Oil','Others','DPK'];
    return [...order.filter(p => set.has(p)), ...[...set].filter(p => !order.includes(p))];
  }, [fSales, fDelvs]);

  /* P&L */
  const pnlByProd = useMemo(() => allProds.map(prod => {
    const pe  = fSales.filter(s => matchesProd(s.pump, prod));
    const vol = pe.reduce((s, e) => s + e.L, 0);
    const rev = pe.reduce((s, e) => s + e.L * e.price, 0);
    const sr  = Math.round(rev * scale);
    const avg = vol > 0 ? Math.round(rev / vol) : ((prices as any)[prod] ?? 0);
    const dv  = fDelvs.filter(d => d.prod === prod && d.costPrice);
    const vr  = dv.reduce((s, d) => s + d.rec, 0);
    const ct  = dv.reduce((s, d) => s + d.rec * (d.costPrice ?? 0), 0);
    const ac  = vr > 0 ? ct / vr : 0;
    const cogs= Math.round(ac * vol * scale);
    const gp  = sr - cogs;
    return { prod, totalVolumeSold: vol, avgSellPrice: avg, currentSellPrice: (prices as any)[prod] ?? 0,
      salesRevenue: sr, avgCostPerL: Math.round(ac), scaledCOGS: cogs, grossProfit: gp,
      grossMargin: sr > 0 ? Math.round((gp / sr) * 100) : null,
      hasCostData: dv.length > 0,
      priceChanges: priceHistory.filter(h => h.prod === prod).slice(0, 3) };
  }).filter(p => p.totalVolumeSold > 0 || p.scaledCOGS > 0), [allProds, fSales, fDelvs, prices, priceHistory, scale]);

  const totSR  = pnlByProd.reduce((s, p) => s + p.salesRevenue, 0);
  const totCOGS= pnlByProd.reduce((s, p) => s + p.scaledCOGS,  0);
  const totGP  = totSR - totCOGS;
  const gmPct  = totSR > 0 ? Math.round((totGP / totSR) * 100) : 0;
  const netPnl = totGP - scaledExp;
  const nmPct  = totSR > 0 ? Math.round((netPnl / totSR) * 100) : 0;

  /* expense categories */
  const catTotals: Record<string, number> = {};
  for (const e of approved) catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amt;
  const allCats  = Object.keys(catTotals).sort();
  const catScaled= Object.entries(catTotals).map(([cat, total]) => ({
    cat, total: Math.round(total / 30 * scale),
    pct: totalExp > 0 ? Math.round((total / totalExp) * 100) : 0,
  })).sort((a, b) => b.total - a.total);

  /* prod sales */
  const prodSales = ['PMS','AGO','DPK','LPG'].map(prod => {
    const color = PROD_COLORS[prod] || rc;
    const L = fSales.filter(s => s.pump.includes(prod)).reduce((s, e) => s + e.L, 0);
    const price = (prices as any)[prod] ?? 0;
    return { prod, color, L, price, scaledL: Math.round(L * scale), scaledRev: Math.round(L * scale * price) };
  }).filter(p => p.L > 0);

  /* filtered by optional filter */
  const activeProd = (reportType === 'pnl' || reportType === 'sales') ? prodFilter : null;
  const activeCat  = reportType === 'expenses' ? catFilter : null;
  const visPnl  = activeProd ? pnlByProd.filter(p => p.prod === activeProd) : pnlByProd;
  const visExp  = (activeCat ? approved.filter(e => e.cat === activeCat) : approved).slice().reverse();
  const visProd = activeProd ? prodSales.filter(p => p.prod === activeProd) : prodSales;

  /* branch breakdown */
  const branchBD = useMemo(() => {
    if (selBranch !== null || safeBranches.length === 0) return [];
    return safeBranches.map(b => {
      const bS = safeSales.filter(s => s.branchId === b.id);
      const bE = safeExpenses.filter(e => e.status === 'approved' && e.branchId === b.id);
      const bR = Math.round(b.rev / 30 * scale);
      const bX = Math.round(bE.reduce((s, e) => s + e.amt, 0) / 30 * scale);
      const bSR= Math.round(bS.reduce((s, e) => s + e.L * e.price, 0) / 30 * scale);
      return { id: b.id, name: b.name, rev: bR, exp: bX, salesRev: bSR, net: bR - bX };
    });
  }, [safeBranches, safeSales, safeExpenses, selBranch, scale]);

  /* maintenance stats */
  const maintOpen   = safeMaintenance.filter(m => m.st === 'Open').length;
  const maintDone   = safeMaintenance.filter(m => m.st === 'Done').length;
  const maintUrgent = safeMaintenance.filter(m => m.pri === 'Urgent').length;
  const maintCost   = safeMaintenance.reduce((s, m) => s + (m.cost ?? 0), 0);

  /* operations stats */
  const dipApproved = safeDips.filter(d => d.status === 'approved').length;
  const dipPending  = safeDips.filter(d => d.status === 'pending').length;

  /* HR stats */
  const hrActive    = safeHrEmployees.filter(e => e.status === 'active').length;
  const hrSuspended = safeHrEmployees.filter(e => e.status === 'suspended').length;
  const hrInactive  = safeHrEmployees.filter(e => e.status === 'inactive').length;
  const deptMap: Record<string,number> = {};
  safeHrEmployees.forEach(e => { deptMap[e.dept] = (deptMap[e.dept] || 0) + 1; });

  /* marketing stats */
  const propPending  = safeProposals.filter(p => p.status === 'pending').length;
  const propApproved = safeProposals.filter(p => p.status === 'approved').length;
  const propRejected = safeProposals.filter(p => p.status === 'rejected').length;

  /* ─ PDF export ─ */
  function exportPdf() {
    const common = { branchName, generatedAt, generatedBy: userName, period: `${period} · ${periodStr}` };
    if (reportType === 'summary') {
      doPrint(buildPdf({ ...common, title: 'Summary Report',
        sections: [
          { heading:'Financial Overview', rows: [
            { label:'Total Revenue',   value: nfmt(scaledRev)   },
            { label:'Total Sales',     value: nfmt(scaledSales) },
            { label:'Total Expenses',  value: nfmt(scaledExp)   },
            { label:'Net Balance',     value: nfmt(scaledNet)   },
            { label:'Margin',          value: `${margin}%`      },
          ]},
          { heading:'Expense Breakdown', rows: catScaled.map(c => ({ label: c.cat, value: `${nfmt(c.total)} (${c.pct}%)` })) },
        ],
        tables: branchBD.length > 0 ? [{ heading:'Branch Breakdown', headers:['Branch','Revenue','Sales','Expenses','Net'],
          rows: branchBD.map(b => [b.name, nfmt(b.rev), nfmt(b.salesRev), nfmt(b.exp), nfmt(b.net)]) }] : [],
      }));
    } else if (reportType === 'pnl') {
      doPrint(buildPdf({ ...common, title: `P&L Report${activeProd ? ` — ${activeProd}` : ''}`,
        sections: [{ heading:'P&L Summary', rows: [
          { label:'Sales Revenue',     value: nfmt(visPnl.reduce((s,p)=>s+p.salesRevenue,0)) },
          { label:'Cost of Goods',     value: nfmt(visPnl.reduce((s,p)=>s+p.scaledCOGS,0))   },
          { label:'Gross Profit',      value: nfmt(visPnl.reduce((s,p)=>s+p.grossProfit,0))   },
          { label:'Gross Margin',      value: `${gmPct}%` },
          { label:'Operating Expenses',value: nfmt(scaledExp) },
          { label:'Net Profit/(Loss)', value: nfmt(netPnl) },
          { label:'Net Margin',        value: `${nmPct}%` },
        ]}],
        tables: [
          { heading:'Product P&L', headers:['Product','Volume (L)','Revenue','COGS','Gross Profit','Margin'],
            rows: visPnl.map(p => [p.prod, (p.totalVolumeSold*scale).toLocaleString(), nfmt(p.salesRevenue), nfmt(p.scaledCOGS), nfmt(p.grossProfit), p.grossMargin!==null?`${p.grossMargin}%`:'—']) },
          { heading:'Operating Expenses', headers:['Category','Amount'],
            rows: catScaled.map(c => [c.cat, nfmt(c.total)]) },
        ],
      }));
    } else if (reportType === 'expenses') {
      doPrint(buildPdf({ ...common, title: `Expense Report${activeCat ? ` — ${activeCat}` : ''}`,
        sections: [{ heading:'Summary', rows: [
          { label:'Total Approved Expenses', value: nfmt(scaledExp) },
          { label:'Records',                 value: `${visExp.length}` },
          ...(activeCat ? [{ label:'Category filter', value: activeCat }] : []),
        ]}],
        tables: [{ heading:'Expense Records', headers:['Category','Description','By','Amount','Approved By'],
          rows: visExp.map(e => [e.cat, e.desc, e.byName, nfmt(e.amt), e.approvedBy ?? '—']) }],
      }));
    } else if (reportType === 'sales') {
      doPrint(buildPdf({ ...common, title: `Sales Report${activeProd ? ` — ${activeProd}` : ''}`,
        sections: [{ heading:'Summary', rows: [{ label:'Total Sales Revenue', value: nfmt(scaledSales) }] }],
        tables: [{ heading:'Sales by Product', headers:['Product','Volume (L)','Unit Price','Revenue'],
          rows: visProd.map(p => [p.prod, p.scaledL.toLocaleString(), nfmt(p.price), nfmt(p.scaledRev)]) }],
      }));
    } else if (reportType === 'prices') {
      doPrint(buildPdf({ ...common, title: 'Price Report',
        sections: [{ heading:'Current Prices', rows: (['PMS','AGO','DPK','LPG','Lube Oil'] as const).map(prod => ({
          label: prod, value: (prices as any)[prod] > 0 ? `${nfmt((prices as any)[prod])}/L` : 'Not set',
        }))}],
        tables: [{ heading:'Price Change History', headers:['Product','Old Price','New Price','Change','By','Date'],
          rows: [...priceHistory].sort((a,b)=>b.id-a.id).map(h => [h.prod, nfmt(h.oldPrice), nfmt(h.newPrice),
            `${h.newPrice>h.oldPrice?'+':''}${nfmt(h.newPrice-h.oldPrice)}`, h.by, fmtDate(h.dt)]) }],
      }));
    } else if (reportType === 'maintenance') {
      doPrint(buildPdf({ ...common, title: 'Maintenance Report',
        sections: [{ heading:'Maintenance Overview', rows: [
          { label:'Total Items',    value: `${safeMaintenance.length}` },
          { label:'Open Items',     value: `${maintOpen}` },
          { label:'Done Items',     value: `${maintDone}` },
          { label:'Urgent Items',   value: `${maintUrgent}` },
          { label:'Total Cost',     value: nfmt(maintCost) },
        ]}],
        tables: [{ heading:'Maintenance Log', headers:['Title','Priority','Status','Cost','By','Date'],
          rows: safeMaintenance.map(m => [m.title, m.pri, m.st, m.cost ? nfmt(m.cost) : '—', m.by, fmtDate(m.date)]) }],
      }));
    } else if (reportType === 'operations') {
      doPrint(buildPdf({ ...common, title: 'Operations Report',
        sections: [{ heading:'Dip Records Overview', rows: [
          { label:'Total Dip Records',   value: `${safeDips.length}` },
          { label:'Approved Records',    value: `${dipApproved}` },
          { label:'Pending Approval',    value: `${dipPending}`  },
          { label:'Total Deliveries',    value: `${safeDeliveries.length}` },
        ]}],
        tables: [{ heading:'Recent Dip Records', headers:['Date','By','Status','Observations'],
          rows: [...safeDips].sort((a,b)=>b.id-a.id).slice(0,30).map(d => [fmtDate(d.dt), d.by, d.status, d.obs || '—']) }],
      }));
    } else if (reportType === 'hr') {
      doPrint(buildPdf({ ...common, title: 'HR Report',
        sections: [
          { heading:'Staff Overview', rows: [
            { label:'Total HR Records', value: `${safeHrEmployees.length}` },
            { label:'Active',           value: `${hrActive}` },
            { label:'Suspended',        value: `${hrSuspended}` },
            { label:'Inactive',         value: `${hrInactive}` },
            { label:'Staff Roster',     value: `${staff.length}` },
          ]},
          { heading:'Headcount by Department', rows: Object.entries(deptMap).map(([dept, count]) => ({ label: dept, value: `${count}` })) },
        ],
        tables: [{ heading:'Employee Records', headers:['Name','Role','Department','Status','Join Date'],
          rows: safeHrEmployees.map(e => [e.name, e.role, e.dept, e.status, fmtDate(e.joinDate)]) }],
      }));
    } else if (reportType === 'marketing') {
      doPrint(buildPdf({ ...common, title: 'Marketing Report',
        sections: [{ heading:'Price Proposals Summary', rows: [
          { label:'Total Proposals', value: `${safeProposals.length}` },
          { label:'Pending',         value: `${propPending}` },
          { label:'Approved',        value: `${propApproved}` },
          { label:'Rejected',        value: `${propRejected}` },
        ]}],
        tables: [
          { heading:'Price Proposals', headers:['Product','Current','Proposed','Change','Status','By','Date'],
            rows: [...safeProposals].sort((a,b)=>b.id-a.id).map(p => [
              p.prod, nfmt(p.currentPrice), nfmt(p.proposedPrice),
              `${p.proposedPrice>p.currentPrice?'+':''}${nfmt(p.proposedPrice-p.currentPrice)}`,
              p.status, p.proposedBy, fmtDate(p.proposedAt),
            ]) },
          { heading:'Recent Price Changes', headers:['Product','Old','New','Change','By','Date'],
            rows: [...priceHistory].sort((a,b)=>b.id-a.id).slice(0,20).map(h => [
              h.prod, nfmt(h.oldPrice), nfmt(h.newPrice),
              `${h.newPrice>h.oldPrice?'+':''}${nfmt(h.newPrice-h.oldPrice)}`, h.by, fmtDate(h.dt),
            ]) },
        ],
      }));
    } else if (reportType === 'full') {
      doPrint(buildPdf({ ...common, title: 'Full Report',
        sections: [
          { heading:'Financial Overview', rows: [
            { label:'Total Revenue',  value: nfmt(scaledRev)   },
            { label:'Total Sales',    value: nfmt(scaledSales) },
            { label:'Total Expenses', value: nfmt(scaledExp)   },
            { label:'Net Balance',    value: nfmt(scaledNet)   },
            { label:'P&L Net Profit', value: nfmt(netPnl)      },
          ]},
          { heading:'Maintenance', rows: [
            { label:'Open Items',   value: `${maintOpen}` },
            { label:'Total Cost',   value: nfmt(maintCost) },
          ]},
          { heading:'HR', rows: [
            { label:'Total Employees', value: `${safeHrEmployees.length}` },
            { label:'Active',          value: `${hrActive}` },
          ]},
          { heading:'Marketing', rows: [
            { label:'Price Proposals', value: `${safeProposals.length}` },
            { label:'Pending',         value: `${propPending}` },
          ]},
        ],
        tables: [
          ...(branchBD.length > 0 ? [{ heading:'Branch Breakdown', headers:['Branch','Revenue','Sales','Expenses','Net'],
            rows: branchBD.map(b => [b.name, nfmt(b.rev), nfmt(b.salesRev), nfmt(b.exp), nfmt(b.net)]) }] : []),
          { heading:'Product P&L', headers:['Product','Volume','Revenue','COGS','Gross Profit','Margin'],
            rows: pnlByProd.map(p => [p.prod, (p.totalVolumeSold*scale).toLocaleString(), nfmt(p.salesRevenue), nfmt(p.scaledCOGS), nfmt(p.grossProfit), p.grossMargin!==null?`${p.grossMargin}%`:'—']) },
          { heading:'Expense Records', headers:['Category','Description','By','Amount','Approved By'],
            rows: approved.slice().reverse().map(e => [e.cat, e.desc, e.byName, nfmt(e.amt), e.approvedBy ?? '—']) },
        ],
      }));
    }
  }

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <ScreenLayout title="Reports">
      {/* Branch selector */}
      {!isMgr && safeBranches.length > 0 ? (
        <BranchBar branches={safeBranches} selected={selBranch} onSelect={id => { setSelBranch(id); setGenerated(false); }} rc={rc} colors={colors} />
      ) : null}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ═══ BUILDER PANEL ═══ */}
        <View style={[styles.builderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.builderTitle, { color: colors.text }]}>Build Your Report</Text>
          <Text style={[styles.builderSub, { color: colors.textMuted }]}>
            Choose report type and timeframe, then generate.
          </Text>

          {/* Report type tiles */}
          <Text style={[styles.builderLabel, { color: colors.textMuted }]}>Report Type</Text>
          <View style={styles.typeGrid}>
            {perms.visible.map(rt => {
              const m = REPORT_META[rt];
              const active = reportType === rt;
              const canGen = perms.canGenerate.includes(rt);
              return (
                <TouchableOpacity key={rt} onPress={() => { setReportType(rt); setProdFilter(null); setCatFilter(null); setGenerated(false); }}
                  style={[styles.typeCard, {
                    backgroundColor: active ? m.color + '12' : colors.background,
                    borderColor: active ? m.color : colors.border,
                    borderWidth: active ? 2 : 1,
                  }]}>
                  <View style={styles.typeCardRow}>
                    <Ionicons name={m.icon as any} size={16} color={active ? m.color : colors.textMuted} />
                    {canGen ? (
                      <View style={[styles.deptTag, { backgroundColor: m.color + '18' }]}>
                        <Text style={[styles.deptTagText, { color: m.color }]}>{m.dept}</Text>
                      </View>
                    ) : (
                      <View style={[styles.deptTag, { backgroundColor: colors.border + '60' }]}>
                        <Ionicons name="eye-outline" size={9} color={colors.textSubtle} />
                        <Text style={[styles.deptTagText, { color: colors.textSubtle }]}>View</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.typeCardLabel, { color: active ? m.color : colors.text }]}>{m.label}</Text>
                  <Text style={[styles.typeCardDesc, { color: colors.textSubtle }]} numberOfLines={2}>{m.desc}</Text>
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
                  style={[styles.pill, { backgroundColor: active ? rc : colors.surface, borderColor: active ? rc : colors.border }]}>
                  <Text style={[styles.pillText, { color: active ? '#fff' : colors.textMuted }]}>{p}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Text style={[styles.dateRange, { color: colors.textSubtle }]}>
            {period} · {periodStr}
          </Text>

          {/* Optional product filter */}
          {(reportType === 'pnl' || reportType === 'sales') && allProds.length > 0 ? (
            <>
              <Text style={[styles.builderLabel, { color: colors.textMuted }]}>Filter by Product (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                {[{ id: null, label: 'All Products' }, ...allProds.map(p => ({ id: p, label: p }))].map(p => {
                  const active = prodFilter === p.id;
                  const pc = p.id ? (PROD_COLORS[p.id] || rc) : rc;
                  return (
                    <TouchableOpacity key={String(p.id)} onPress={() => { setProdFilter(p.id); setGenerated(false); }}
                      style={[styles.pill, { backgroundColor: active ? pc + '18' : colors.surface, borderColor: active ? pc : colors.border }]}>
                      <Text style={[styles.pillText, { color: active ? pc : colors.textMuted }]}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          {/* Optional category filter */}
          {reportType === 'expenses' && allCats.length > 0 ? (
            <>
              <Text style={[styles.builderLabel, { color: colors.textMuted }]}>Filter by Category (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                {[{ id: null, label: 'All Categories' }, ...allCats.map(c => ({ id: c, label: c }))].map(c => {
                  const active = catFilter === c.id;
                  return (
                    <TouchableOpacity key={String(c.id)} onPress={() => { setCatFilter(c.id); setGenerated(false); }}
                      style={[styles.pill, { backgroundColor: active ? rc + '18' : colors.surface, borderColor: active ? rc : colors.border }]}>
                      <Text style={[styles.pillText, { color: active ? rc : colors.textMuted }]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          {/* Generate button */}
          <TouchableOpacity onPress={() => setGenerated(true)}
            style={[styles.generateBtn, { backgroundColor: meta.color }]}>
            <Ionicons name="analytics-outline" size={16} color="#fff" />
            <Text style={styles.generateBtnText}>
              {canDownload ? `Generate ${meta.label}` : `View ${meta.label}`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ═══ GENERATED REPORT ═══ */}
        {generated ? (
          <>
            {/* Report header */}
            <View style={[styles.reportHeader, { backgroundColor: meta.color }]}>
              <View style={styles.reportHeaderTop}>
                <Ionicons name={meta.icon as any} size={20} color="rgba(255,255,255,0.9)" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.reportHeaderTitle}>{meta.label}</Text>
                  <Text style={styles.reportHeaderMeta}>{period} · {branchName}</Text>
                  <Text style={styles.reportHeaderDate}>{periodStr}</Text>
                  {activeProd ? <Text style={styles.reportHeaderFilter}>Product: {activeProd}</Text> : null}
                  {activeCat  ? <Text style={styles.reportHeaderFilter}>Category: {activeCat}</Text>  : null}
                </View>
              </View>

              {canDownload ? (
                <TouchableOpacity onPress={exportPdf} style={styles.headerDlBtn}>
                  <Ionicons name="download-outline" size={14} color={meta.color} />
                  <Text style={[styles.headerDlBtnText, { color: meta.color }]}>Download PDF</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.viewOnlyBadge]}>
                  <Ionicons name="eye-outline" size={13} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.viewOnlyText}>View only — your role cannot export this report</Text>
                </View>
              )}
            </View>

            {/* ── SUMMARY ── */}
            {reportType === 'summary' || reportType === 'full' ? (
              <>
                <View style={styles.kpiRow}>
                  {[
                    { label:'Revenue',  value: scaledRev,   color:'#27500A', icon:'trending-up-outline'   },
                    { label:'Sales',    value: scaledSales, color:'#185FA5', icon:'bar-chart-outline'      },
                    { label:'Expenses', value: scaledExp,   color:'#791F1F', icon:'trending-down-outline'  },
                    { label:'Net',      value: scaledNet,   color: scaledNet>=0 ? '#27500A' : '#791F1F', icon:'wallet-outline' },
                  ].map(k => (
                    <View key={k.label} style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name={k.icon as any} size={13} color={k.color} />
                      <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>{k.label}</Text>
                      <Text style={[styles.kpiValue, { color: k.color }]}>{fmt(k.value)}</Text>
                    </View>
                  ))}
                </View>
                <ProgressRow label="Net Margin" pct={margin} colors={colors} />
                {branchBD.length > 0 ? (
                  <>
                    <SectionTitle label="Branch Breakdown" colors={colors} />
                    {branchBD.map(b => (
                      <View key={b.id} style={[styles.branchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[{ fontSize:13, fontWeight:'700', color: colors.text }]}>{b.name}</Text>
                          <Text style={[{ fontSize:11, marginTop:2, color: colors.textMuted }]}>Rev {fmt(b.rev)} · Sales {fmt(b.salesRev)}</Text>
                        </View>
                        <View style={{ alignItems:'flex-end' }}>
                          <Text style={[{ fontSize:15, fontWeight:'800', color: b.net>=0 ? '#27500A' : '#791F1F' }]}>{fmt(b.net)}</Text>
                          <Text style={[{ fontSize:10, color: colors.textMuted }]}>Exp {fmt(b.exp)}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                ) : null}
                <SectionTitle label="Expense Breakdown" colors={colors} />
                {catScaled.map(c => (
                  <View key={c.cat} style={[styles.catRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:6 }}>
                        <Text style={[{ fontSize:13, fontWeight:'600', color: colors.text }]}>{c.cat}</Text>
                        <Text style={[{ fontSize:13, fontWeight:'700', color: rc }]}>{fmt(c.total)}</Text>
                      </View>
                      <View style={[styles.progressBg, { backgroundColor: colors.border }]}>
                        <View style={[styles.progressBar, { width:`${c.pct}%` as any, backgroundColor: rc }]} />
                      </View>
                      <Text style={[{ fontSize:10, marginTop:4, color: colors.textMuted }]}>{c.pct}% of expenses</Text>
                    </View>
                  </View>
                ))}
                {reportType === 'full' ? (
                  <>
                    <SectionTitle label="Profit & Loss" colors={colors} />
                    <PnlSection visPnl={pnlByProd} colors={colors} rc={rc} scale={scale} netPnl={netPnl} nmPct={nmPct} totSR={totSR} totCOGS={totCOGS} totGP={totGP} gmPct={gmPct} scaledExp={scaledExp} catScaled={catScaled} />
                    <SectionTitle label="Sales by Product" colors={colors} />
                    <SalesSection visProd={prodSales} colors={colors} rc={rc} scaledSales={scaledSales} />
                  </>
                ) : null}
              </>
            ) : null}

            {/* ── P&L ── */}
            {reportType === 'pnl' ? (
              <PnlSection visPnl={visPnl} colors={colors} rc={rc} scale={scale} netPnl={netPnl} nmPct={nmPct} totSR={totSR} totCOGS={totCOGS} totGP={totGP} gmPct={gmPct} scaledExp={scaledExp} catScaled={catScaled} />
            ) : null}

            {/* ── EXPENSES ── */}
            {reportType === 'expenses' ? (
              <>
                <TotalPill value={scaledExp} label="Total Approved Expenses" color={rc} />
                {visExp.length === 0 ? <EmptyState icon="receipt-outline" label="No approved expenses" colors={colors} /> : null}
                {visExp.map(e => (
                  <View key={e.id} style={[styles.expCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[{ fontSize:13, fontWeight:'700', color: colors.text }]}>{e.cat}</Text>
                      <Text style={[{ fontSize:12, marginTop:2, color: colors.textMuted }]}>{e.desc}</Text>
                      <Text style={[{ fontSize:10, marginTop:3, color: colors.textSubtle }]}>by {e.byName} · Approved by {e.approvedBy}</Text>
                    </View>
                    <Text style={[{ fontSize:15, fontWeight:'700', color: rc }]}>{fmt(e.amt)}</Text>
                  </View>
                ))}
              </>
            ) : null}

            {/* ── SALES ── */}
            {reportType === 'sales' ? (
              <SalesSection visProd={visProd} colors={colors} rc={rc} scaledSales={scaledSales} />
            ) : null}

            {/* ── PRICES ── */}
            {reportType === 'prices' ? (
              <>
                <SectionTitle label="Current Selling Prices" colors={colors} />
                {(['PMS','AGO','DPK','LPG','Lube Oil'] as const).map(prod => {
                  const price = (prices as any)[prod] ?? 0;
                  const pc = PROD_COLORS[prod] || rc;
                  const last = priceHistory.filter(h => h.prod === prod).sort((a,b)=>b.id-a.id)[0];
                  return (
                    <View key={prod} style={[styles.catRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={[styles.prodDot, { backgroundColor: pc }]} />
                      <View style={{ flex:1 }}>
                        <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:4 }}>
                          <Text style={[{ fontSize:13, fontWeight:'600', color: colors.text }]}>{prod}</Text>
                          <Text style={[{ fontSize:13, fontWeight:'700', color: price>0?pc:colors.textSubtle }]}>
                            {price > 0 ? `₦${price.toLocaleString()}/L` : 'Not set'}
                          </Text>
                        </View>
                        {last ? <Text style={[{ fontSize:10, color: colors.textMuted }]}>Last changed by {last.by} · {fmtDate(last.dt)}</Text> : null}
                      </View>
                    </View>
                  );
                })}
                <SectionTitle label="Price Change History" colors={colors} />
                {priceHistory.length === 0 ? <EmptyState icon="pricetag-outline" label="No price changes recorded" colors={colors} /> : null}
                {[...priceHistory].sort((a,b)=>b.id-a.id).map(h => {
                  const pc = PROD_COLORS[h.prod] || rc;
                  const up = h.newPrice > h.oldPrice;
                  return (
                    <View key={h.id} style={[styles.priceHistRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={[styles.priceHistTag, { backgroundColor: pc + '18' }]}>
                        <Text style={[{ fontSize:11, fontWeight:'700', color: pc }]}>{h.prod}</Text>
                      </View>
                      <View style={{ flex:1, gap:3 }}>
                        <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                          <Text style={[{ fontSize:13, textDecorationLine:'line-through', color: colors.textMuted }]}>₦{h.oldPrice.toLocaleString()}</Text>
                          <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={12} color={up ? '#27500A' : '#791F1F'} />
                          <Text style={[{ fontSize:13, fontWeight:'700', color: colors.text }]}>₦{h.newPrice.toLocaleString()}</Text>
                          <DiffBadge diff={h.newPrice - h.oldPrice} />
                        </View>
                        <Text style={[{ fontSize:11, color: colors.textSubtle }]}>{h.by} · {fmtDate(h.dt)}</Text>
                      </View>
                    </View>
                  );
                })}
              </>
            ) : null}

            {/* ── MAINTENANCE ── */}
            {reportType === 'maintenance' ? (
              <>
                <View style={styles.kpiRow}>
                  {[
                    { label:'Open',   value: maintOpen,   color:'#791F1F', icon:'alert-circle-outline'  },
                    { label:'Done',   value: maintDone,   color:'#27500A', icon:'checkmark-circle-outline'},
                    { label:'Urgent', value: maintUrgent, color:'#BA7517', icon:'warning-outline'        },
                    { label:'Cost',   value: maintCost,   color:'#633806', icon:'cash-outline', fmt: true },
                  ].map(k => (
                    <View key={k.label} style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name={k.icon as any} size={13} color={k.color} />
                      <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>{k.label}</Text>
                      <Text style={[styles.kpiValue, { color: k.color }]}>
                        {(k as any).fmt ? fmt(k.value) : k.value}
                      </Text>
                    </View>
                  ))}
                </View>
                {safeMaintenance.length === 0 ? <EmptyState icon="construct-outline" label="No maintenance records" colors={colors} /> : null}
                {safeMaintenance.map(m => (
                  <View key={m.id} style={[styles.maintCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={[styles.priBadge, { backgroundColor: priBg(m.pri) }]}>
                      <Text style={[styles.priBadgeText, { color: priColor(m.pri) }]}>{m.pri}</Text>
                    </View>
                    <View style={{ flex:1 }}>
                      <Text style={[{ fontSize:13, fontWeight:'700', color: colors.text }]}>{m.title}</Text>
                      <Text style={[{ fontSize:11, marginTop:2, color: colors.textMuted }]}>by {m.by} · {fmtDate(m.date)}</Text>
                    </View>
                    <View style={{ alignItems:'flex-end', gap:3 }}>
                      <View style={[styles.stBadge, { backgroundColor: m.st === 'Open' ? '#FCEBEB' : '#EAF3DE' }]}>
                        <Text style={[{ fontSize:11, fontWeight:'700', color: m.st === 'Open' ? '#791F1F' : '#27500A' }]}>{m.st}</Text>
                      </View>
                      {m.cost ? <Text style={[{ fontSize:12, fontWeight:'700', color: '#633806' }]}>{fmt(m.cost)}</Text> : null}
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            {/* ── OPERATIONS ── */}
            {reportType === 'operations' ? (
              <>
                <View style={styles.kpiRow}>
                  {[
                    { label:'Total Dips',   value: safeDips.length,        color:'#185FA5', icon:'layers-outline'         },
                    { label:'Approved',     value: dipApproved,            color:'#27500A', icon:'checkmark-done-outline'  },
                    { label:'Pending',      value: dipPending,             color:'#BA7517', icon:'time-outline'            },
                    { label:'Deliveries',   value: safeDeliveries.length,  color:'#633806', icon:'cube-outline'            },
                  ].map(k => (
                    <View key={k.label} style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name={k.icon as any} size={13} color={k.color} />
                      <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>{k.label}</Text>
                      <Text style={[styles.kpiValue, { color: k.color }]}>{k.value}</Text>
                    </View>
                  ))}
                </View>
                <SectionTitle label="Recent Dip Records" colors={colors} />
                {safeDips.length === 0 ? <EmptyState icon="speedometer-outline" label="No dip records yet" colors={colors} /> : null}
                {[...safeDips].sort((a,b)=>b.id-a.id).slice(0, 20).map(d => (
                  <View key={d.id} style={[styles.expCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex:1 }}>
                      <Text style={[{ fontSize:13, fontWeight:'700', color: colors.text }]}>{fmtDate(d.dt)}</Text>
                      <Text style={[{ fontSize:11, marginTop:2, color: colors.textMuted }]}>by {d.by}{d.obs ? ` · ${d.obs}` : ''}</Text>
                    </View>
                    <View style={[styles.stBadge, { backgroundColor: d.status === 'approved' ? '#EAF3DE' : d.status === 'rejected' ? '#FCEBEB' : '#FAEEDA' }]}>
                      <Text style={[{ fontSize:11, fontWeight:'700', color: d.status === 'approved' ? '#27500A' : d.status === 'rejected' ? '#791F1F' : '#BA7517', textTransform:'capitalize' }]}>{d.status}</Text>
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            {/* ── HR ── */}
            {reportType === 'hr' ? (
              <>
                <View style={styles.kpiRow}>
                  {[
                    { label:'Total',     value: safeHrEmployees.length, color:'#7B3FA8', icon:'people-outline'          },
                    { label:'Active',    value: hrActive,           color:'#27500A', icon:'person-outline'           },
                    { label:'Suspended', value: hrSuspended,        color:'#791F1F', icon:'person-remove-outline'    },
                    { label:'Inactive',  value: hrInactive,         color:'#999',    icon:'person-outline'           },
                  ].map(k => (
                    <View key={k.label} style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name={k.icon as any} size={13} color={k.color} />
                      <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>{k.label}</Text>
                      <Text style={[styles.kpiValue, { color: k.color }]}>{k.value}</Text>
                    </View>
                  ))}
                </View>
                {Object.keys(deptMap).length > 0 ? (
                  <>
                    <SectionTitle label="By Department" colors={colors} />
                    {Object.entries(deptMap).sort((a,b) => b[1]-a[1]).map(([dept, count]) => (
                      <View key={dept} style={[styles.catRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={{ flex:1 }}>
                          <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:6 }}>
                            <Text style={[{ fontSize:13, fontWeight:'600', color: colors.text }]}>{dept}</Text>
                            <Text style={[{ fontSize:13, fontWeight:'700', color:'#7B3FA8' }]}>{count} {count === 1 ? 'person' : 'people'}</Text>
                          </View>
                          <View style={[styles.progressBg, { backgroundColor: colors.border }]}>
                            <View style={[styles.progressBar, { width:`${safeHrEmployees.length > 0 ? Math.round((count/safeHrEmployees.length)*100) : 0}%` as any, backgroundColor:'#7B3FA8' }]} />
                          </View>
                        </View>
                      </View>
                    ))}
                  </>
                ) : null}
                <SectionTitle label="Employee Records" colors={colors} />
                {safeHrEmployees.length === 0 ? <EmptyState icon="people-outline" label="No employee records" colors={colors} /> : null}
                {safeHrEmployees.map(e => (
                  <View key={e.id} style={[styles.expCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex:1 }}>
                      <Text style={[{ fontSize:13, fontWeight:'700', color: colors.text }]}>{e.name}</Text>
                      <Text style={[{ fontSize:11, marginTop:2, color: colors.textMuted }]}>{e.role} · {e.dept}</Text>
                      <Text style={[{ fontSize:10, marginTop:2, color: colors.textSubtle }]}>Joined {fmtDate(e.joinDate)}</Text>
                    </View>
                    <View style={[styles.stBadge, { backgroundColor: e.status === 'active' ? '#EAF3DE' : e.status === 'suspended' ? '#FCEBEB' : '#f5f5f3' }]}>
                      <Text style={[{ fontSize:11, fontWeight:'700', color: stColor(e.status), textTransform:'capitalize' }]}>{e.status}</Text>
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            {/* ── MARKETING ── */}
            {reportType === 'marketing' ? (
              <>
                <View style={styles.kpiRow}>
                  {[
                    { label:'Proposals', value: safeProposals.length, color:'#C45C1A', icon:'megaphone-outline'   },
                    { label:'Pending',   value: propPending,           color:'#BA7517', icon:'time-outline'         },
                    { label:'Approved',  value: propApproved,          color:'#27500A', icon:'checkmark-outline'    },
                    { label:'Rejected',  value: propRejected,          color:'#791F1F', icon:'close-outline'        },
                  ].map(k => (
                    <View key={k.label} style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name={k.icon as any} size={13} color={k.color} />
                      <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>{k.label}</Text>
                      <Text style={[styles.kpiValue, { color: k.color }]}>{k.value}</Text>
                    </View>
                  ))}
                </View>
                <SectionTitle label="Price Proposals" colors={colors} />
                {safeProposals.length === 0 ? <EmptyState icon="megaphone-outline" label="No proposals yet" colors={colors} /> : null}
                {[...safeProposals].sort((a,b)=>b.id-a.id).map(p => {
                  const pc = PROD_COLORS[p.prod] || rc;
                  const up = p.proposedPrice > p.currentPrice;
                  const statusColor = p.status==='approved'?'#27500A':p.status==='rejected'?'#791F1F':'#BA7517';
                  const statusBg    = p.status==='approved'?'#EAF3DE':p.status==='rejected'?'#FCEBEB':'#FAEEDA';
                  return (
                    <View key={p.id} style={[styles.priceHistRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={[styles.priceHistTag, { backgroundColor: pc + '18' }]}>
                        <Text style={[{ fontSize:11, fontWeight:'700', color: pc }]}>{p.prod}</Text>
                      </View>
                      <View style={{ flex:1, gap:3 }}>
                        <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                          <Text style={[{ fontSize:13, textDecorationLine:'line-through', color: colors.textMuted }]}>₦{p.currentPrice.toLocaleString()}</Text>
                          <Ionicons name={up?'arrow-up':'arrow-down'} size={12} color={up?'#27500A':'#791F1F'} />
                          <Text style={[{ fontSize:13, fontWeight:'700', color: colors.text }]}>₦{p.proposedPrice.toLocaleString()}</Text>
                          <DiffBadge diff={p.proposedPrice - p.currentPrice} />
                        </View>
                        <Text style={[{ fontSize:11, color: colors.textSubtle }]}>
                          By {p.proposedBy}{p.reviewedBy ? ` · ${p.status==='approved'?'Approved':'Rejected'} by ${p.reviewedBy}` : ''} · {fmtDate(p.proposedAt)}
                        </Text>
                      </View>
                      <View style={[styles.stBadge, { backgroundColor: statusBg }]}>
                        <Text style={[{ fontSize:11, fontWeight:'700', color: statusColor, textTransform:'capitalize' }]}>{p.status}</Text>
                      </View>
                    </View>
                  );
                })}
                <SectionTitle label="Recent Price Changes" colors={colors} />
                {[...priceHistory].sort((a,b)=>b.id-a.id).slice(0,15).map(h => {
                  const pc = PROD_COLORS[h.prod] || rc;
                  const up = h.newPrice > h.oldPrice;
                  return (
                    <View key={h.id} style={[styles.priceHistRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={[styles.priceHistTag, { backgroundColor: pc+'18' }]}>
                        <Text style={[{ fontSize:11, fontWeight:'700', color: pc }]}>{h.prod}</Text>
                      </View>
                      <View style={{ flex:1, gap:3 }}>
                        <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                          <Text style={[{ fontSize:13, textDecorationLine:'line-through', color: colors.textMuted }]}>₦{h.oldPrice.toLocaleString()}</Text>
                          <Ionicons name={up?'arrow-up':'arrow-down'} size={12} color={up?'#27500A':'#791F1F'} />
                          <Text style={[{ fontSize:13, fontWeight:'700', color: colors.text }]}>₦{h.newPrice.toLocaleString()}</Text>
                          <DiffBadge diff={h.newPrice - h.oldPrice} />
                        </View>
                        <Text style={[{ fontSize:11, color: colors.textSubtle }]}>{h.by} · {fmtDate(h.dt)}</Text>
                      </View>
                    </View>
                  );
                })}
              </>
            ) : null}

            {/* Bottom export / view-only note */}
            {canDownload ? (
              <TouchableOpacity onPress={exportPdf} style={[styles.bottomBtn, { backgroundColor: meta.color }]}>
                <Ionicons name="download-outline" size={16} color="#fff" />
                <Text style={styles.bottomBtnText}>Download {meta.label} as PDF</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.viewOnlyBottom, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.viewOnlyBottomText, { color: colors.textMuted }]}>
                  PDF export for this report is available to authorised roles only.
                </Text>
              </View>
            )}
          </>
        ) : (
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

/* ─── Reusable sub-components ───────────────────────────── */
function SectionTitle({ label, colors }: { label: string; colors: any }) {
  return <Text style={[styles.sectionTitle, { color: colors.text }]}>{label}</Text>;
}
function TotalPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={[styles.totalPill, { backgroundColor: color + '18', borderColor: color + '33' }]}>
      <Text style={[styles.totalPillLabel, { color }]}>{label}</Text>
      <Text style={[styles.totalPillValue, { color }]}>{fmt(value)}</Text>
    </View>
  );
}
function EmptyState({ icon, label, colors }: { icon: string; label: string; colors: any }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon as any} size={36} color={colors.border} />
      <Text style={[{ fontSize:14, color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}
function ProgressRow({ label, pct, colors }: { label: string; pct: number; colors: any }) {
  const pos = pct >= 0;
  return (
    <View style={[styles.marginRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.marginLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={[styles.progressBg, { flex:1, backgroundColor: colors.border, marginHorizontal:10 }]}>
        <View style={[styles.progressBar, { width:`${Math.max(0,Math.min(Math.abs(pct),100))}%` as any, backgroundColor: pos?'#27500A':'#791F1F' }]} />
      </View>
      <Text style={[styles.marginPct, { color: pos?'#27500A':'#791F1F' }]}>{pct}%</Text>
    </View>
  );
}
function DiffBadge({ diff }: { diff: number }) {
  const pos = diff >= 0;
  return (
    <View style={{ paddingHorizontal:7, paddingVertical:2, borderRadius:5, backgroundColor: pos?'#EAF3DE':'#FCEBEB' }}>
      <Text style={{ fontSize:11, fontWeight:'700', color: pos?'#27500A':'#791F1F' }}>
        {pos?'+':''}₦{Math.abs(diff).toLocaleString()}
      </Text>
    </View>
  );
}

function PnlSection({ visPnl, colors, rc, scale, netPnl, nmPct, totSR, totCOGS, totGP, gmPct, scaledExp, catScaled }: any) {
  return (
    <>
      <View style={[styles.plHeader, { backgroundColor: netPnl >= 0 ? '#0a2318' : '#791F1F' }]}>
        <Text style={styles.plHeaderLabel}>Profit & Loss</Text>
        <Text style={styles.plHeaderNet}>{fmt(netPnl)}</Text>
        <Text style={styles.plHeaderSub}>{netPnl >= 0 ? 'Net Profit' : 'Net Loss'} · {nmPct}% net margin</Text>
        <View style={{ flexDirection:'row' }}>
          {[
            { label:'Sales Revenue', value: totSR },
            { label:'Cost of Goods', value: totCOGS },
            { label:'Gross Profit',  value: totGP  },
          ].map(it => (
            <View key={it.label} style={{ flex:1, alignItems:'center' }}>
              <Text style={{ color:'rgba(255,255,255,0.55)', fontSize:9, marginBottom:3 }}>{it.label}</Text>
              <Text style={{ fontSize:12, fontWeight:'700', color: it.label==='Cost of Goods'?'#ffb3b3':'#fff' }}>{fmt(it.value)}</Text>
            </View>
          ))}
        </View>
      </View>
      <ProgressRow label="Gross Margin" pct={gmPct} colors={colors} />
      {visPnl.map((p: any) => {
        const pc = PROD_COLORS[p.prod] || rc;
        const profitable = p.grossProfit >= 0;
        return (
          <View key={p.prod} style={[styles.plProdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
              <View style={{ paddingHorizontal:10, paddingVertical:4, borderRadius:8, backgroundColor: pc+'15' }}>
                <Text style={{ fontSize:12, fontWeight:'700', color: pc }}>{p.prod}</Text>
              </View>
              <View style={{ flex:1 }} />
              {p.grossMargin !== null ? (
                <View style={{ flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:8, paddingVertical:3, borderRadius:6, backgroundColor: profitable?'#EAF3DE':'#FCEBEB' }}>
                  <Ionicons name={profitable?'trending-up':'trending-down'} size={11} color={profitable?'#27500A':'#791F1F'} />
                  <Text style={{ fontSize:10, fontWeight:'700', color: profitable?'#27500A':'#791F1F' }}>{p.grossMargin}% gross margin</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection:'row' }}>
              {[
                { label:'Volume Sold', val: `${(p.totalVolumeSold*scale).toLocaleString()} L` },
                { label:'Avg Sell',    val: `₦${p.avgSellPrice.toLocaleString()}/L`, color: pc },
                { label:'Avg Cost',    val: p.hasCostData ? `₦${p.avgCostPerL.toLocaleString()}/L` : '—' },
              ].map(g => (
                <View key={g.label} style={{ flex:1, gap:2 }}>
                  <Text style={{ fontSize:10, color: colors.textMuted }}>{g.label}</Text>
                  <Text style={{ fontSize:13, fontWeight:'700', color: (g as any).color ?? colors.text }}>{g.val}</Text>
                </View>
              ))}
            </View>
            {[
              { label:'Sales Revenue (actual prices)', value: p.salesRevenue, color:'#185FA5', icon:'cash-outline' },
              { label:'Cost of Goods Sold',            value: p.scaledCOGS,   color:'#791F1F', icon:'pricetag-outline' },
              { label:'Gross Profit',                  value: p.grossProfit,  color: profitable?'#27500A':'#791F1F', icon: profitable?'trending-up':'trending-down' },
            ].map(row => (
              <View key={row.label} style={[styles.plRowItem, { borderTopColor: colors.border }]}>
                <Ionicons name={row.icon as any} size={13} color={row.color} />
                <Text style={{ flex:1, fontSize:12, color: colors.textMuted }}>{row.label}</Text>
                <Text style={{ fontSize:14, fontWeight:'700', color: row.color }}>{fmt(row.value)}</Text>
              </View>
            ))}
          </View>
        );
      })}
      <View style={[styles.plOpexCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[{ fontSize:14, fontWeight:'700', marginBottom:6, color: colors.text }]}>Operating Expenses</Text>
        {catScaled.slice(0,5).map((c: any) => (
          <View key={c.cat} style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:4 }}>
            <Text style={{ fontSize:12, color: colors.textMuted }}>{c.cat}</Text>
            <Text style={{ fontSize:12, fontWeight:'600', color:'#791F1F' }}>{fmt(c.total)}</Text>
          </View>
        ))}
        {catScaled.length > 5 ? <Text style={{ fontSize:11, color: colors.textSubtle }}>+ {catScaled.length - 5} more</Text> : null}
        <View style={{ flexDirection:'row', justifyContent:'space-between', paddingTop:8, marginTop:4, borderTopWidth:StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
          <Text style={{ fontSize:13, fontWeight:'700', color: colors.text }}>Total Operating Expenses</Text>
          <Text style={{ fontSize:14, fontWeight:'800', color:'#791F1F' }}>{fmt(scaledExp)}</Text>
        </View>
      </View>
      <View style={[styles.plFinalCard, { backgroundColor: netPnl>=0?'#EAF3DE':'#FCEBEB', borderColor: netPnl>=0?'#27500A33':'#791F1F33' }]}>
        <View>
          <Text style={{ fontSize:14, fontWeight:'700', color: netPnl>=0?'#27500A':'#791F1F' }}>
            {netPnl >= 0 ? 'Net Profit' : 'Net Loss'}
          </Text>
          <Text style={{ fontSize:10, marginTop:3, color: netPnl>=0?'#3a6e1c':'#aa2222' }}>Gross Profit − Operating Expenses</Text>
        </View>
        <Text style={{ fontSize:22, fontWeight:'900', marginLeft:'auto', color: netPnl>=0?'#27500A':'#791F1F' }}>{fmt(netPnl)}</Text>
      </View>
    </>
  );
}

function SalesSection({ visProd, colors, rc, scaledSales }: any) {
  return (
    <>
      <TotalPill value={scaledSales} label="Total Sales Revenue" color={rc} />
      {visProd.length === 0 ? <EmptyState icon="bar-chart-outline" label="No sales data" colors={colors} /> : null}
      {visProd.map((p: any) => (
        <View key={p.prod} style={[styles.catRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.prodDot, { backgroundColor: p.color }]} />
          <View style={{ flex:1 }}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:6 }}>
              <Text style={[{ fontSize:13, fontWeight:'600', color: colors.text }]}>{p.prod}</Text>
              <Text style={[{ fontSize:13, fontWeight:'700', color: p.color }]}>{fmt(p.scaledRev)}</Text>
            </View>
            <Text style={[{ fontSize:10, color: colors.textMuted }]}>{p.scaledL.toLocaleString()} L · ₦{p.price.toLocaleString()}/L</Text>
          </View>
        </View>
      ))}
    </>
  );
}

/* ─── Styles ─────────────────────────────────────────────── */
const styles = StyleSheet.create({
  scroll:              { padding:16 },
  pill:                { flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:12, paddingVertical:7, borderRadius:20, borderWidth:1 },
  pillText:            { fontSize:12, fontWeight:'600' },
  pillRow:             { flexDirection:'row', gap:6, paddingBottom:4 },
  builderCard:         { borderRadius:16, borderWidth:1, padding:16, marginBottom:16, gap:12 },
  builderTitle:        { fontSize:17, fontWeight:'800' },
  builderSub:          { fontSize:12, lineHeight:17, marginTop:-6 },
  builderLabel:        { fontSize:11, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.5 },
  typeGrid:            { flexDirection:'row', flexWrap:'wrap', gap:8 },
  typeCard:            { width:'47%', borderRadius:12, padding:12, gap:4 },
  typeCardRow:         { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:2 },
  typeCardLabel:       { fontSize:13, fontWeight:'700' },
  typeCardDesc:        { fontSize:10, lineHeight:13 },
  deptTag:             { flexDirection:'row', alignItems:'center', gap:3, paddingHorizontal:7, paddingVertical:2, borderRadius:10 },
  deptTagText:         { fontSize:9, fontWeight:'700' },
  dateRange:           { fontSize:11, marginTop:-6 },
  generateBtn:         { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, padding:14, borderRadius:12, marginTop:4 },
  generateBtnText:     { color:'#fff', fontSize:15, fontWeight:'800' },
  reportHeader:        { borderRadius:14, padding:18, marginBottom:14 },
  reportHeaderTop:     { flexDirection:'row', gap:12, marginBottom:10 },
  reportHeaderTitle:   { color:'#fff', fontSize:18, fontWeight:'800' },
  reportHeaderMeta:    { color:'rgba(255,255,255,0.7)', fontSize:12, marginTop:2 },
  reportHeaderDate:    { color:'rgba(255,255,255,0.55)', fontSize:11 },
  reportHeaderFilter:  { color:'rgba(255,255,255,0.85)', fontSize:12, fontWeight:'600', marginTop:1 },
  headerDlBtn:         { flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'#fff', paddingHorizontal:14, paddingVertical:8, borderRadius:8, alignSelf:'flex-start' },
  headerDlBtnText:     { fontSize:13, fontWeight:'700' },
  viewOnlyBadge:       { flexDirection:'row', alignItems:'center', gap:6, paddingVertical:6 },
  viewOnlyText:        { color:'rgba(255,255,255,0.65)', fontSize:11, fontStyle:'italic' },
  kpiRow:              { flexDirection:'row', gap:8, marginBottom:12 },
  kpiCard:             { flex:1, borderRadius:12, borderWidth:1, padding:10, alignItems:'center', gap:3 },
  kpiLabel:            { fontSize:9, fontWeight:'600', textTransform:'uppercase' },
  kpiValue:            { fontSize:13, fontWeight:'800' },
  marginRow:           { flexDirection:'row', alignItems:'center', padding:12, borderRadius:10, borderWidth:1, marginBottom:14 },
  marginLabel:         { fontSize:12, fontWeight:'600', width:90 },
  marginPct:           { fontSize:14, fontWeight:'800', width:42, textAlign:'right' },
  progressBg:          { height:6, borderRadius:3, overflow:'hidden' },
  progressBar:         { height:6, borderRadius:3 },
  sectionTitle:        { fontSize:14, fontWeight:'700', marginBottom:10 },
  branchRow:           { flexDirection:'row', alignItems:'center', padding:14, borderRadius:12, borderWidth:1, marginBottom:8 },
  catRow:              { flexDirection:'row', alignItems:'center', gap:10, padding:14, borderRadius:12, borderWidth:1, marginBottom:8 },
  prodDot:             { width:10, height:10, borderRadius:5 },
  totalPill:           { padding:16, borderRadius:12, borderWidth:1, marginBottom:14, alignItems:'center' },
  totalPillLabel:      { fontSize:12, fontWeight:'600', marginBottom:4 },
  totalPillValue:      { fontSize:28, fontWeight:'800' },
  expCard:             { flexDirection:'row', alignItems:'center', gap:8, padding:12, borderRadius:12, borderWidth:1, marginBottom:8 },
  emptyState:          { alignItems:'center', paddingVertical:40, gap:10 },
  plHeader:            { borderRadius:16, padding:20, marginBottom:14, gap:4 },
  plHeaderLabel:       { color:'rgba(255,255,255,0.6)', fontSize:12 },
  plHeaderNet:         { color:'#fff', fontSize:34, fontWeight:'800' },
  plHeaderSub:         { color:'rgba(255,255,255,0.6)', fontSize:12, marginBottom:8 },
  plProdCard:          { borderRadius:14, borderWidth:1, padding:14, marginBottom:10, gap:8 },
  plRowItem:           { flexDirection:'row', alignItems:'center', gap:8, paddingTop:8, borderTopWidth:StyleSheet.hairlineWidth },
  plOpexCard:          { borderRadius:14, borderWidth:1, padding:14, marginBottom:10 },
  plFinalCard:         { flexDirection:'row', alignItems:'center', gap:10, padding:16, borderRadius:14, borderWidth:1, marginBottom:10 },
  priceHistRow:        { flexDirection:'row', alignItems:'center', gap:10, borderRadius:10, borderWidth:1, padding:12, marginBottom:8 },
  priceHistTag:        { paddingHorizontal:8, paddingVertical:4, borderRadius:6, alignItems:'center', minWidth:44 },
  maintCard:           { flexDirection:'row', alignItems:'center', gap:10, padding:12, borderRadius:12, borderWidth:1, marginBottom:8 },
  priBadge:            { paddingHorizontal:8, paddingVertical:4, borderRadius:8 },
  priBadgeText:        { fontSize:10, fontWeight:'700' },
  stBadge:             { paddingHorizontal:8, paddingVertical:4, borderRadius:8 },
  notYetCard:          { borderRadius:16, borderWidth:1, borderStyle:'dashed', padding:40, alignItems:'center', gap:14, marginTop:8 },
  notYetText:          { fontSize:13, lineHeight:20, textAlign:'center' },
  bottomBtn:           { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, padding:16, borderRadius:14, marginTop:16, marginBottom:8 },
  bottomBtnText:       { color:'#fff', fontSize:15, fontWeight:'800' },
  viewOnlyBottom:      { flexDirection:'row', alignItems:'center', gap:10, padding:14, borderRadius:12, borderWidth:1, marginTop:16 },
  viewOnlyBottomText:  { flex:1, fontSize:12, lineHeight:17 },
});
