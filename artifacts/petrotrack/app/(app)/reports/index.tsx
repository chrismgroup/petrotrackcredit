import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useMemo, useState } from 'react';
import {
  Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { AppliedDateField } from '@/components/AppliedDateField';
import { Branch, getPriceForProduct, ROLE_COLORS, fmt, fmtDate, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import {
  PERIODS, PROD_COLORS, REPORT_META,
  Period, ReportType,
  buildPdf, getLastKnownCostPrice, getPerms, matchesProd, nfmt, periodRange,
  localDateKey, priBg, priColor, stColor, safeNum, safeStr, isMissingNum,
} from '@/lib/report-helpers';
import { useLocalSearchParams } from 'expo-router';

/* ═══════════════════════════════════════════════════════════
   EXPORT — iOS-native share sheet (no print dialog)
═══════════════════════════════════════════════════════════ */
async function shareAsPdf(html: string, title: string) {
  try {
    if (Platform.OS === 'web') {
      await Print.printAsync({ html });
      return;
    }

    const { uri } = await Print.printToFileAsync({ html });
    const available = await Sharing.isAvailableAsync();
    if (available) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Share ${title}`,
        UTI: 'com.adobe.pdf',
      });
    } else {
      Alert.alert('Sharing unavailable', 'PDF sharing is not available on this device.');
    }
  } catch (e: any) {
    if (!e?.message?.toLowerCase().includes('cancel')) {
      Alert.alert('Export failed', e?.message ?? 'Could not generate PDF');
    }
  }
}

/* ─── Small UI atoms ────────────────────────────────────── */
function SecTitle({ label, colors }: { label: string; colors: any }) {
  return <Text style={[s.secTitle, { color: colors.text }]}>{label}</Text>;
}
function EmptyState({ icon, label, colors }: { icon: string; label: string; colors: any }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon as any} size={34} color={colors.border} />
      <Text style={{ fontSize: 14, color: colors.textMuted }}>{label}</Text>
    </View>
  );
}
function KpiCards({ items, colors }: { items: Array<{ label: string; value: string | number; color: string; icon: string }>; colors: any }) {
  return (
    <View style={s.kpiRow}>
      {items.map(k => (
        <View key={k.label} style={[s.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name={k.icon as any} size={13} color={k.color} />
          <Text style={[s.kpiLabel, { color: colors.textMuted }]}>{k.label}</Text>
          <Text style={[s.kpiValue, { color: k.color }]}>{k.value}</Text>
        </View>
      ))}
    </View>
  );
}
function ProgressRow({ label, pct, colors }: { label: string; pct: number; colors: any }) {
  const pos = pct >= 0;
  return (
    <View style={[s.marginRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[s.marginLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={[s.progBg, { flex: 1, backgroundColor: colors.border, marginHorizontal: 10 }]}>
        <View style={[s.progBar, { width: `${Math.max(0, Math.min(Math.abs(pct), 100))}%` as any, backgroundColor: pos ? '#27500A' : '#791F1F' }]} />
      </View>
      <Text style={[s.marginPct, { color: pos ? '#27500A' : '#791F1F' }]}>{pct}%</Text>
    </View>
  );
}
function DiffBadge({ diff }: { diff: number }) {
  const pos = diff >= 0;
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: pos ? '#EAF3DE' : '#FCEBEB' }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: pos ? '#27500A' : '#791F1F' }}>
        {pos ? '+' : ''}₦{Math.abs(diff).toLocaleString()}
      </Text>
    </View>
  );
}
/** Small amber badge shown on any row whose key amount field was absent during
 *  sync and therefore defaulted to ₦0. Alerts operators to repair the record. */
function IncompleteBadge() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4,
      paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
      backgroundColor: '#fff8e1', borderWidth: 1, borderColor: '#f0c040', alignSelf: 'flex-start' }}>
      <Ionicons name="warning-outline" size={10} color="#7a5c00" />
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#7a5c00' }}>Incomplete record</Text>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN SCREEN
═══════════════════════════════════════════════════════════ */
export default function ReportsScreen() {
  const {
    role, userName, branchId,
    expenses, sales, branches, deliveries, prices, priceHistory, priceProposals,
    maintenance, dips, staff, hrEmployees, pumpDailyReports, companyInfo,
  } = useApp();
  const colors = useColors();
  const rc = ROLE_COLORS[role || 'acc'] || colors.primary;
  const isAtt = role === 'att';
  const isMgr = role === 'mgr' || role === 'csm' || role === 'mktg';
  const isBranchLocked = isAtt || role === 'mgr'; // att and mgr see only their own branch
  const perms = getPerms(role);
  const [exporting, setExporting] = useState(false);

  /* Safety guards — also normalise per-entry numeric/string fields so that
     partially-synced records never reach render or export with undefined values
     that would cause .toLocaleString() / arithmetic to throw. */
  const safeSales = (Array.isArray(sales) ? sales : []).map((s: any) => ({
    ...s,
    L:          safeNum(s.L),
    price:      safeNum(s.price),
    dt:         safeStr(s.dt, ''),
    _amtMissing: isMissingNum(s.L) || isMissingNum(s.price),
  }));
  const safeDeliveries = (Array.isArray(deliveries) ? deliveries : []).map((d: any) => ({
    ...d,
    costPrice: safeNum(d.costPrice),
    rec:       safeNum(d.rec),
    dt:        safeStr(d.dt, ''),
  }));
  const safeExpenses = (Array.isArray(expenses) ? expenses : []).map((e: any) => ({
    ...e,
    amt:         safeNum(e.amt),
    cat:         safeStr(e.cat, ''),
    desc:        safeStr(e.desc, ''),
    byName:      safeStr(e.byName, ''),
    approvedBy:  safeStr(e.approvedBy, ''),
    dt:          safeStr(e.dt, ''),
    _amtMissing: isMissingNum(e.amt),
  }));
  const safeBranches    = Array.isArray(branches)   ? branches   : [];
  const safeMaintenance = (Array.isArray(maintenance) ? maintenance : []).map((m: any) => ({
    ...m,
    cost:  safeNum(m.cost),
    title: safeStr(m.title, ''),
    pri:   safeStr(m.pri, ''),
    st:    safeStr(m.st, ''),
    by:    safeStr(m.by, ''),
    date:  safeStr(m.date, ''),
  }));
  const safeDips = (Array.isArray(dips) ? dips : []).map((d: any) => ({
    ...d,
    dt:     safeStr(d.dt, ''),
    by:     safeStr(d.by, ''),
    status: safeStr(d.status, ''),
    obs:    safeStr(d.obs, ''),
  }));
  const safeHrEmployees = (Array.isArray(hrEmployees) ? hrEmployees : []).map((e: any) => ({
    ...e,
    name:     safeStr(e.name, ''),
    role:     safeStr(e.role, ''),
    dept:     safeStr(e.dept, ''),
    status:   safeStr(e.status, ''),
    joinDate: safeStr(e.joinDate, ''),
  }));
  const safeProposals = (Array.isArray(priceProposals) ? priceProposals : []).map((p: any) => ({
    ...p,
    currentPrice:  safeNum(p.currentPrice),
    proposedPrice: safeNum(p.proposedPrice),
    prod:          safeStr(p.prod, ''),
    status:        safeStr(p.status, ''),
    proposedBy:    safeStr(p.proposedBy, ''),
    proposedAt:    safeStr(p.proposedAt, ''),
    id:            safeNum(p.id),
  }));
  const safePumpReports = (Array.isArray(pumpDailyReports) ? pumpDailyReports : []).map((r: any) => ({
    ...r,
    grossAmount: safeNum(r.grossAmount),
    liters:      safeNum(r.liters),
    date:        safeStr(r.date, ''),
    _amtMissing: isMissingNum(r.grossAmount),
  }));
  const safePriceHistory = (Array.isArray(priceHistory) ? priceHistory : []).map((h: any) => ({
    ...h,
    oldPrice: safeNum(h.oldPrice),
    newPrice: safeNum(h.newPrice),
    prod:     safeStr(h.prod, ''),
    by:       safeStr(h.by, ''),
    dt:       safeStr(h.dt, ''),
    id:       safeNum(h.id),
  }));
  const safeStaff       = Array.isArray(staff) ? staff : [];
  const safeCompanyInfo = companyInfo && typeof companyInfo === 'object' ? companyInfo : ({} as any);

  const params = useLocalSearchParams<{ type?: string }>();
  const requestedType = params.type as ReportType | undefined;
  const defaultType: ReportType = requestedType && perms.visible.includes(requestedType) ? requestedType : (perms.visible[0] ?? 'summary');
  // att and mgr are locked to their own branch; other roles can switch branches
  const [selBranch,  setSelBranch]  = useState<string | null>(isBranchLocked ? (branchId ?? null) : null);
  const [reportType, setReportType] = useState<ReportType>(defaultType);
  const [period,     setPeriod]     = useState<Period>('Monthly');
  const [anchorDate, setAnchorDate] = useState('');

  const { from, to } = useMemo(() => {
    return periodRange(period, anchorDate || undefined);
  }, [period, anchorDate]);
  const fromStr = localDateKey(from);
  const toStr   = localDateKey(to);
  const branchName  = selBranch === null ? 'All Branches' : (safeBranches.find(b => b.id === selBranch)?.name ?? selBranch);
  const periodStr   = `${fmtDate(`${fromStr}T12:00:00`)} – ${fmtDate(`${toStr}T12:00:00`)}`;
  const generatedAt = new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
  const canExport   = perms.canGenerate.includes(reportType);
  const meta        = REPORT_META[reportType] ?? REPORT_META.summary;

  /* Branch-filtered helpers */
  const fb = (arr: any[]) =>
    selBranch === null ? arr : arr.filter((x: any) => x.branchId === selBranch || !x.branchId);

  const fSales = useMemo(() => fb(safeSales).filter((s: any)      => s.dt   >= fromStr && s.dt   <= toStr), [safeSales,       selBranch, fromStr, toStr]);
  // Cost prices remain the cost basis for later sales. Include approved,
  // cost-priced deliveries up to the report end date rather than only
  // deliveries inside the sales window.
  const cogsDeliveries = useMemo(() => fb(safeDeliveries).filter((d: any) => {
    const deliveryDate = String(d.dt ?? '').slice(0, 10);
    return deliveryDate <= toStr
      && Number(d.costPrice) > 0
      && (d.approvalStatus === 'md_approved' || d.approvalStatus === 'approved');
  }), [safeDeliveries, selBranch, toStr]);
  const fExps  = useMemo(() => fb(safeExpenses).filter((e: any)   => e.dt   >= fromStr && e.dt   <= toStr), [safeExpenses,    selBranch, fromStr, toStr]);

  /* ── Shift-report-based sales ──────────────────────────── */
  const fPumpReports = useMemo(() =>
    safePumpReports.filter((r: any) =>
      r.status === 'approved' &&
      (selBranch === null || r.branchId === selBranch || !r.branchId) &&
      r.date >= fromStr && r.date <= toStr
    ),
    [safePumpReports, selBranch, fromStr, toStr]
  );

  const mgrBranchExps = useMemo(() =>
    fExps.filter((e: any) => e.by === 'mgr' && e.status === 'approved'),
    [fExps]
  );

  const shiftGross    = useMemo(() => Math.round(fPumpReports.reduce((s: number, r: any) => s + r.grossAmount, 0)), [fPumpReports]);
  const mgrExpScaled  = useMemo(() => Math.round(mgrBranchExps.reduce((s: number, e: any) => s + e.amt, 0)), [mgrBranchExps]);
  const netSalesFigure = shiftGross - mgrExpScaled;

  const shiftProdSales = useMemo(() =>
    (['PMS','AGO','DPK','LPG','Lube Oil'] as const).map(prod => {
      const color = PROD_COLORS[prod] || rc;
      const reps = fPumpReports.filter((r: any) => r.product === prod);
      const L    = reps.reduce((s: number, r: any) => s + r.liters, 0);
      const gross = reps.reduce((s: number, r: any) => s + r.grossAmount, 0);
      const hasIncomplete = reps.some((r: any) => r._amtMissing);
      return { prod, color, L, scaledL: Math.round(L), scaledGross: Math.round(gross), hasIncomplete };
    }).filter(p => p.L > 0),
    [fPumpReports, rc]
  );

  const approved    = useMemo(() => fExps.filter((e: any) => e.status === 'approved'), [fExps]);
  const totalExp    = useMemo(() => approved.reduce((s: number, e: any) => s + e.amt, 0), [approved]);

  /* Incomplete-record counts: records whose key amount field was absent during
     sync and was coerced to ₦0 by safeNum. Used for in-app badges and PDF footnotes. */
  const incompleteExpCount     = useMemo(() => approved.filter((e: any) => e._amtMissing).length, [approved]);
  const incompleteSalesCount   = useMemo(() => fSales.filter((s: any) => s._amtMissing).length, [fSales]);
  const incompletePumpCount    = useMemo(() => fPumpReports.filter((r: any) => r._amtMissing).length, [fPumpReports]);
  const incompleteMgrExpCount  = useMemo(() => mgrBranchExps.filter((e: any) => e._amtMissing).length, [mgrBranchExps]);

  function buildIncompleteFootnote(count: number): string | undefined {
    if (count <= 0) return undefined;
    return `${count} record${count === 1 ? '' : 's'} had a missing amount field and contributed \u20a60 to the totals shown. These figures may be understated. Please locate and repair the affected records to ensure accuracy.`;
  }
  const scaledExp   = Math.round(totalExp);
  const scaledRev   = shiftGross;
  const scaledSales = Math.round(fSales.reduce((s: number, e: any) => s + e.L * e.price, 0));
  const scaledNet   = scaledRev - scaledExp;
  const margin      = scaledRev > 0 ? Math.round((scaledNet / scaledRev) * 100) : 0;

  const allProds = useMemo(() => {
    const set = new Set<string>();
    cogsDeliveries.forEach((d: any) => {
      if (typeof d.prod === 'string' && d.prod.trim()) set.add(d.prod);
    });
    const K = ['PMS','AGO','DPK','LPG','Lube Oil','Others'];
    fSales.forEach((sale: any) => { const m = K.find(p => matchesProd(sale.pump, p)); if (m) set.add(m); });
    const order = ['PMS','AGO','LPG','Lube Oil','Others','DPK'];
    return [...order.filter(p => set.has(p)), ...[...set].filter(p => !order.includes(p))];
  }, [fSales, cogsDeliveries]);

  const pnlByProd = useMemo(() => allProds.map(prod => {
    const pe  = fSales.filter((sale: any) => matchesProd(sale.pump, prod));
    const vol = pe.reduce((sum: number, e: any) => sum + e.L, 0);
    const rev = pe.reduce((sum: number, e: any) => sum + e.L * e.price, 0);
    const sr  = Math.round(rev);
    const avg = vol > 0 ? Math.round(rev / vol) : getPriceForProduct(prices, prod, selBranch);
    const ac  = getLastKnownCostPrice(cogsDeliveries, prod);
    const cogs = Math.round(ac * vol);
    const gp   = sr - cogs;
    return {
      prod, totalVolumeSold: vol, avgSellPrice: avg,
      salesRevenue: sr, avgCostPerL: Math.round(ac), scaledCOGS: cogs, grossProfit: gp,
      grossMargin: sr > 0 ? Math.round((gp / sr) * 100) : null,
      hasCostData: ac > 0,
      priceChanges: safePriceHistory.filter(h => h.prod === prod).slice(0, 3),
      /** True when at least one underlying sale record for this product had a
       *  missing L or price field that safeNum coerced to 0, making the
       *  product's sales revenue and P&L figures potentially understated. */
      hasIncomplete: pe.some((e: any) => e._amtMissing),
    };
  }).filter(p => p.totalVolumeSold > 0 || p.scaledCOGS > 0), [allProds, fSales, cogsDeliveries, prices, safePriceHistory]);

  const totSR   = pnlByProd.reduce((s, p) => s + p.salesRevenue, 0);
  const totCOGS = pnlByProd.reduce((s, p) => s + p.scaledCOGS,  0);
  const totGP   = totSR - totCOGS;
  const gmPct   = totSR > 0 ? Math.round((totGP / totSR) * 100) : 0;
  const citaRate = parseFloat(safeCompanyInfo.citaRate || '30') / 100;
  const operatingProfit = totGP - scaledExp;
  const citaProvision = operatingProfit > 0 ? Math.round(operatingProfit * citaRate) : 0;
  const netPnl  = operatingProfit - citaProvision;
  const nmPct   = totSR > 0 ? Math.round((netPnl / totSR) * 100) : 0;

  const catTotals: Record<string, number> = {};
  for (const e of approved) catTotals[(e as any).cat] = (catTotals[(e as any).cat] || 0) + (e as any).amt;
  const catScaled = Object.entries(catTotals).map(([cat, total]) => ({
    cat, total: Math.round(total),
    pct: totalExp > 0 ? Math.round((total / totalExp) * 100) : 0,
  })).sort((a, b) => b.total - a.total);

  const prodSales = ['PMS','AGO','DPK','LPG'].map(prod => {
    const color = PROD_COLORS[prod] || rc;
    const entries = fSales.filter((sale: any) => matchesProd(sale.pump, prod));
    const L = entries.reduce((sum: number, e: any) => sum + e.L, 0);
    const rev = entries.reduce((sum: number, e: any) => sum + e.L * e.price, 0);
    const price = L > 0 ? Math.round(rev / L) : 0;
    return { prod, color, L, price, scaledL: Math.round(L), scaledRev: Math.round(rev) };
  }).filter(p => p.L > 0);

  const branchBD = useMemo(() => {
    if (selBranch !== null || safeBranches.length === 0) return [];
    return safeBranches.map(b => {
      const bPR = safePumpReports.filter((r: any) => r.status === 'approved' && r.branchId === b.id && r.date >= fromStr && r.date <= toStr);
      const bR  = Math.round(bPR.reduce((s: number, r: any) => s + r.grossAmount, 0));
      const bE  = safeExpenses.filter((e: any) => e.status === 'approved' && e.branchId === b.id && e.dt >= fromStr && e.dt <= toStr);
      const bX  = Math.round(bE.reduce((sum: number, e: any) => sum + e.amt, 0));
      const bSR = Math.round(safeSales.filter((s: any) => s.branchId === b.id && s.dt >= fromStr && s.dt <= toStr).reduce((sum: number, e: any) => sum + e.L * e.price, 0));
      return { id: b.id, name: b.name, rev: bR, exp: bX, salesRev: bSR, net: bR - bX };
    });
  }, [safeBranches, safePumpReports, safeSales, safeExpenses, selBranch, fromStr, toStr]);

  const maintOpen   = safeMaintenance.filter((m: any) => m.st === 'Open').length;
  const maintDone   = safeMaintenance.filter((m: any) => m.st === 'Done').length;
  const maintUrgent = safeMaintenance.filter((m: any) => m.pri === 'Urgent').length;
  const maintCost   = safeMaintenance.reduce((s: number, m: any) => s + (m.cost ?? 0), 0);
  const dipApproved = safeDips.filter((d: any) => d.status === 'approved').length;
  const dipPending  = safeDips.filter((d: any) => d.status === 'pending').length;
  const hrActive    = safeHrEmployees.filter((e: any) => e.status === 'active').length;
  const hrSuspended = safeHrEmployees.filter((e: any) => e.status === 'suspended').length;
  const hrInactive  = safeHrEmployees.filter((e: any) => e.status === 'inactive').length;
  const deptMap: Record<string, number> = {};
  safeHrEmployees.forEach((e: any) => { deptMap[e.dept] = (deptMap[e.dept] || 0) + 1; });
  const propPending  = safeProposals.filter((p: any) => p.status === 'pending').length;
  const propApproved = safeProposals.filter((p: any) => p.status === 'approved').length;
  const propRejected = safeProposals.filter((p: any) => p.status === 'rejected').length;

  /* ─ Export ─ */
  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const common = { branchName, generatedAt, generatedBy: userName, period: `${period} · ${periodStr}` };
      let html = '';
      if (reportType === 'summary') {
        const summaryIncomplete = incompleteExpCount + incompleteSalesCount + incompletePumpCount;
        html = buildPdf({ ...common, title: 'Summary Report',
        sections: [
          { heading: 'Financial Overview', rows: [
            { label: 'Total Revenue',  value: nfmt(scaledRev)   },
            { label: 'Total Sales',    value: nfmt(scaledSales) },
            { label: 'Total Expenses', value: nfmt(scaledExp)   },
            { label: 'Net Balance',    value: nfmt(scaledNet)   },
            { label: 'Margin',         value: `${margin}%`      },
          ]},
          { heading: 'Expense Breakdown', rows: catScaled.map(c => ({ label: c.cat, value: `${nfmt(c.total)} (${c.pct}%)` })) },
        ],
        tables: branchBD.length > 0 ? [{ heading: 'Branch Breakdown', headers: ['Branch','Revenue','Sales','Expenses','Net'],
          rows: branchBD.map(b => [b.name, nfmt(b.rev), nfmt(b.salesRev), nfmt(b.exp), nfmt(b.net)]) }] : [],
        footnote: buildIncompleteFootnote(summaryIncomplete),
        });
      } else if (reportType === 'pnl') {
        const pnlIncomplete = incompleteExpCount + incompleteSalesCount + incompletePumpCount;
        html = buildPdf({ ...common, title: 'P&L Report',
        sections: [{ heading: 'P&L Summary', rows: [
          { label: 'Sales Revenue',       value: nfmt(totSR)    },
          { label: 'Cost of Goods',       value: nfmt(totCOGS)  },
          { label: 'Gross Profit',        value: nfmt(totGP)    },
          { label: 'Gross Margin',        value: `${gmPct}%`    },
          { label: 'Operating Expenses',  value: nfmt(scaledExp)},
          { label: 'Net Profit/(Loss)',   value: nfmt(netPnl)   },
          { label: 'Net Margin',          value: `${nmPct}%`    },
        ]}],
        tables: [
          { heading: 'Product P&L', headers: ['Product','Volume (L)','Revenue','COGS','Gross Profit','Margin'],
            rows: pnlByProd.map(p => [p.prod, p.totalVolumeSold.toLocaleString(), nfmt(p.salesRevenue), nfmt(p.scaledCOGS), nfmt(p.grossProfit), p.grossMargin !== null ? `${p.grossMargin}%` : '—']) },
          { heading: 'Operating Expenses', headers: ['Category','Amount'], rows: catScaled.map(c => [c.cat, nfmt(c.total)]) },
        ],
        footnote: buildIncompleteFootnote(pnlIncomplete),
        });
      } else if (reportType === 'expenses') {
        html = buildPdf({ ...common, title: 'Expense Report',
        sections: [{ heading: 'Summary', rows: [
          { label: 'Total Approved', value: nfmt(scaledExp) },
          { label: 'Records',        value: `${approved.length}` },
        ]}],
        tables: [{ heading: 'Expense Records', headers: ['Category','Description','By','Amount','Approved By'],
          rows: [...approved].reverse().map((e: any) => [e.cat, e.desc, e.byName, nfmt(e.amt), e.approvedBy ?? '—']) }],
        footnote: buildIncompleteFootnote(incompleteExpCount),
        });
      } else if (reportType === 'sales') {
        // Sales report totals (shiftGross, netSalesFigure) derive from pump reports
        // and manager expenses — not from the legacy fSales entries.
        const salesIncomplete = incompletePumpCount + incompleteMgrExpCount;
        html = buildPdf({ ...common, title: 'Sales Report',
        sections: [{ heading: 'Sales Summary', rows: [
          { label: 'Gross Sales (Shift Reports)', value: nfmt(shiftGross)      },
          { label: 'Less: Manager Expenses',      value: `(${nfmt(mgrExpScaled)})` },
          { label: 'Net Sales',                   value: nfmt(netSalesFigure)  },
          { label: 'Shift Reports',               value: `${fPumpReports.length}` },
          { label: 'Manager Expense Items',       value: `${mgrBranchExps.length}` },
        ]}],
        tables: [
          { heading: 'Product Breakdown', headers: ['Product','Volume (L)','Gross Revenue'],
            rows: shiftProdSales.map(p => [p.prod, p.scaledL.toLocaleString(), nfmt(p.scaledGross)]) },
          ...(mgrBranchExps.length > 0 ? [{ heading: 'Manager Expenses Deducted', headers: ['Category','Description','By','Amount','Approved By'],
            rows: mgrBranchExps.map((e: any) => [e.cat, e.desc, e.byName, nfmt(e.amt), e.approvedBy ?? '—']) }] : []),
        ],
        footnote: buildIncompleteFootnote(salesIncomplete),
        });
      } else if (reportType === 'prices') {
        html = buildPdf({ ...common, title: 'Price Report',
        sections: [{ heading: 'Current Prices', rows: (['PMS','AGO','DPK','LPG','Lube Oil'] as const).map(prod => ({
          label: prod, value: getPriceForProduct(prices, prod, selBranch) > 0 ? `${nfmt(getPriceForProduct(prices, prod, selBranch))}/L` : 'Not set',
        }))}],
        tables: [{ heading: 'Price Change History', headers: ['Product','Old Price','New Price','Change','By','Date'],
          rows: [...safePriceHistory]
            .filter(h => selBranch === null || !h.branchId || h.branchId === selBranch)
            .sort((a,b) => b.id-a.id)
            .map(h => [h.prod, nfmt(h.oldPrice), nfmt(h.newPrice), `${h.newPrice>h.oldPrice?'+':''}${nfmt(h.newPrice-h.oldPrice)}`, h.by, fmtDate(h.dt)]) }],
        });
      } else if (reportType === 'maintenance') {
        html = buildPdf({ ...common, title: 'Maintenance Report',
        sections: [{ heading: 'Overview', rows: [
          { label: 'Total Items',  value: `${safeMaintenance.length}` },
          { label: 'Open',         value: `${maintOpen}` },
          { label: 'Done',         value: `${maintDone}` },
          { label: 'Urgent',       value: `${maintUrgent}` },
          { label: 'Total Cost',   value: nfmt(maintCost) },
        ]}],
        tables: [{ heading: 'Maintenance Log', headers: ['Title','Priority','Status','Cost','By','Date'],
          rows: safeMaintenance.map((m: any) => [m.title, m.pri, m.st, m.cost ? nfmt(m.cost) : '—', m.by, fmtDate(m.date)]) }],
        });
      } else if (reportType === 'operations') {
        html = buildPdf({ ...common, title: 'Operations Report',
        sections: [{ heading: 'Dip Records', rows: [
          { label: 'Total Dip Records', value: `${safeDips.length}` },
          { label: 'Approved',          value: `${dipApproved}` },
          { label: 'Pending',           value: `${dipPending}` },
          { label: 'Total Deliveries',  value: `${safeDeliveries.length}` },
        ]}],
        tables: [{ heading: 'Recent Dip Records', headers: ['Date','By','Status','Observations'],
          rows: [...safeDips].sort((a: any, b: any) => b.id-a.id).slice(0,30).map((d: any) => [fmtDate(d.dt), d.by, d.status, d.obs || '—']) }],
        });
      } else if (reportType === 'hr') {
        html = buildPdf({ ...common, title: 'HR Report',
        sections: [
          { heading: 'Staff Overview', rows: [
            { label: 'Total HR Records', value: `${safeHrEmployees.length}` },
            { label: 'Active',           value: `${hrActive}` },
            { label: 'Suspended',        value: `${hrSuspended}` },
            { label: 'Inactive',         value: `${hrInactive}` },
            { label: 'Staff Roster',     value: `${safeStaff.length}` },
          ]},
          { heading: 'By Department', rows: Object.entries(deptMap).map(([dept, count]) => ({ label: dept, value: `${count}` })) },
        ],
        tables: [{ heading: 'Employee Records', headers: ['Name','Role','Department','Status','Join Date'],
          rows: safeHrEmployees.map((e: any) => [e.name, e.role, e.dept, e.status, fmtDate(e.joinDate)]) }],
        });
      } else if (reportType === 'marketing') {
        html = buildPdf({ ...common, title: 'Marketing Report',
        sections: [{ heading: 'Price Proposals', rows: [
          { label: 'Total',    value: `${safeProposals.length}` },
          { label: 'Pending',  value: `${propPending}` },
          { label: 'Approved', value: `${propApproved}` },
          { label: 'Rejected', value: `${propRejected}` },
        ]}],
        tables: [
          { heading: 'Price Proposals', headers: ['Product','Current','Proposed','Change','Status','By','Date'],
            rows: [...safeProposals].sort((a: any,b: any) => b.id-a.id).map((p: any) => [
              p.prod, nfmt(p.currentPrice), nfmt(p.proposedPrice),
              `${p.proposedPrice>p.currentPrice?'+':''}${nfmt(p.proposedPrice-p.currentPrice)}`,
              p.status, p.proposedBy, fmtDate(p.proposedAt),
            ]) },
          { heading: 'Recent Price Changes', headers: ['Product','Old','New','Change','By','Date'],
            rows: [...safePriceHistory].sort((a,b) => b.id-a.id).slice(0,20).map(h => [
              h.prod, nfmt(h.oldPrice), nfmt(h.newPrice),
              `${h.newPrice>h.oldPrice?'+':''}${nfmt(h.newPrice-h.oldPrice)}`, h.by, fmtDate(h.dt),
            ]) },
        ],
        });
      } else {
        html = buildPdf({ ...common, title: 'Full Report',
        sections: [
          { heading: 'Financial Overview', rows: [
            { label: 'Total Revenue',  value: nfmt(scaledRev)   },
            { label: 'Total Sales',    value: nfmt(scaledSales) },
            { label: 'Total Expenses', value: nfmt(scaledExp)   },
            { label: 'Net Balance',    value: nfmt(scaledNet)   },
            { label: 'Net Profit',     value: nfmt(netPnl)      },
          ]},
          { heading: 'Maintenance', rows: [
            { label: 'Open Items', value: `${maintOpen}` },
            { label: 'Total Cost', value: nfmt(maintCost) },
          ]},
          { heading: 'HR', rows: [
            { label: 'Total Employees', value: `${safeHrEmployees.length}` },
            { label: 'Active',          value: `${hrActive}` },
          ]},
        ],
        tables: [
          ...(branchBD.length > 0 ? [{ heading: 'Branch Breakdown', headers: ['Branch','Revenue','Sales','Expenses','Net'],
            rows: branchBD.map(b => [b.name, nfmt(b.rev), nfmt(b.salesRev), nfmt(b.exp), nfmt(b.net)]) }] : []),
          { heading: 'Product P&L', headers: ['Product','Volume','Revenue','COGS','Gross Profit','Margin'],
            rows: pnlByProd.map(p => [p.prod, p.totalVolumeSold.toLocaleString(), nfmt(p.salesRevenue), nfmt(p.scaledCOGS), nfmt(p.grossProfit), p.grossMargin !== null ? `${p.grossMargin}%` : '—']) },
        ],
        footnote: buildIncompleteFootnote(incompleteExpCount + incompleteSalesCount + incompletePumpCount),
        });
      }
      await shareAsPdf(html, meta.label);
    } catch (e: any) {
      if (!e?.message?.toLowerCase().includes('cancel')) {
        Alert.alert('Export failed', e?.message ?? 'Could not generate PDF');
      }
    } finally {
      setExporting(false);
    }
  }

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <ScreenLayout title="Reports">

      {/* ── Compact top bar: Period + Branch ── */}
      <View style={[s.topBar, { borderBottomColor: colors.border }]}>
        <AppliedDateField
          value={anchorDate}
          onChange={setAnchorDate}
          label="View reports as at a date"
          accent={rc}
          helper={anchorDate ? 'The selected date anchors the chosen reporting period.' : 'Defaults to the current date until you select another business date.'}
        />
        {/* Period chips — wrap so all stay visible */}
        <View style={s.chipWrap}>
          {PERIODS.map(p => {
            const active = period === p;
            return (
              <TouchableOpacity key={p} onPress={() => setPeriod(p)}
                style={[s.periodChip, { backgroundColor: active ? rc : colors.surface, borderColor: active ? rc : colors.border }]}>
                <Text style={[s.periodChipTxt, { color: active ? '#fff' : colors.textMuted }]}>{p}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {/* Branch chips — hidden for att and mgr (locked to their branch) */}
        {!isBranchLocked && safeBranches.length > 0 && (
          <View style={s.chipWrap}>
            {([{ id: null, name: 'All' }, ...safeBranches.map(b => ({ id: b.id, name: b.name }))] as Array<{ id: string | null; name: string }>).map(b => {
              const active = selBranch === b.id;
              return (
                <TouchableOpacity key={String(b.id)} onPress={() => setSelBranch(b.id)}
                  style={[s.branchChip, { backgroundColor: active ? rc + '18' : 'transparent', borderColor: active ? rc : colors.border }]}>
                  {active && <Ionicons name="business" size={10} color={rc} />}
                  <Text style={[s.branchChipTxt, { color: active ? rc : colors.textMuted }]}>{b.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* ── Report type selector (horizontal chip strip) ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[s.typeScroll, { borderBottomColor: colors.border }]}
        contentContainerStyle={s.typeScrollContent}>
        {perms.visible.map(rt => {
          const m = REPORT_META[rt];
          const active = reportType === rt;
          return (
            <TouchableOpacity key={rt} onPress={() => setReportType(rt)} activeOpacity={0.75}
              style={[s.typeChip, { backgroundColor: active ? m.color : colors.surface, borderColor: active ? m.color : colors.border }]}>
              <View style={[s.typeChipIcon, { backgroundColor: active ? 'rgba(255,255,255,0.22)' : m.color + '1A' }]}>
                <Ionicons name={m.icon as any} size={14} color={active ? '#fff' : m.color} />
              </View>
              <Text style={[s.typeChipLabel, { color: active ? '#fff' : colors.text }]}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Data ── */}
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Report header strip (with inline export) ── */}
        <View style={[s.reportStrip, { backgroundColor: meta.color }]}>
          <View style={[s.stripIcon, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
            <Ionicons name={meta.icon as any} size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.stripTitle}>{meta.label}</Text>
            <Text style={s.stripSub}>{period} · {periodStr}</Text>
          </View>
          {canExport ? (
            <TouchableOpacity onPress={handleExport} disabled={exporting}
              style={[s.stripExportBtn, { opacity: exporting ? 0.6 : 1 }]}>
              <Ionicons name={exporting ? 'hourglass-outline' : 'share-outline'} size={13} color={meta.color} />
              <Text style={[s.stripExportTxt, { color: meta.color }]}>{exporting ? 'Exporting…' : 'Export PDF'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.viewOnlyPill}>
              <Ionicons name="lock-closed-outline" size={10} color="rgba(255,255,255,0.7)" />
              <Text style={s.viewOnlyBadge}>View only</Text>
            </View>
          )}
        </View>

        {/* ── SUMMARY ── */}
        {reportType === 'summary' || reportType === 'full' ? (
          <>
            <KpiCards colors={colors} items={[
              { label:'Revenue',  value: fmt(scaledRev),   color:'#27500A', icon:'trending-up-outline'  },
              { label:'Sales',    value: fmt(scaledSales), color:'#185FA5', icon:'bar-chart-outline'     },
              { label:'Expenses', value: fmt(scaledExp),   color:'#791F1F', icon:'trending-down-outline' },
              { label:'Net',      value: fmt(scaledNet),   color: scaledNet >= 0 ? '#27500A' : '#791F1F', icon:'wallet-outline' },
            ]} />
            <ProgressRow label="Net Margin" pct={margin} colors={colors} />
            {branchBD.length > 0 ? (
              <>
                <SecTitle label="Branch Breakdown" colors={colors} />
                {branchBD.map(b => (
                  <View key={b.id} style={[s.rowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.rowCardTitle, { color: colors.text }]}>{b.name}</Text>
                      <Text style={[s.rowCardSub, { color: colors.textMuted }]}>Rev {fmt(b.rev)} · Sales {fmt(b.salesRev)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: b.net >= 0 ? '#27500A' : '#791F1F' }}>{fmt(b.net)}</Text>
                      <Text style={{ fontSize: 10, color: colors.textMuted }}>Exp {fmt(b.exp)}</Text>
                    </View>
                  </View>
                ))}
              </>
            ) : null}
            <SecTitle label="Expense Breakdown" colors={colors} />
            {catScaled.length === 0 ? <EmptyState icon="receipt-outline" label="No approved expenses" colors={colors} /> : null}
            {catScaled.map(c => (
              <View key={c.cat} style={[s.catCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{c.cat}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: rc }}>{fmt(c.total)}</Text>
                </View>
                <View style={[s.progBg, { backgroundColor: colors.border }]}>
                  <View style={[s.progBar, { width: `${c.pct}%` as any, backgroundColor: rc }]} />
                </View>
                <Text style={{ fontSize: 10, marginTop: 4, color: colors.textMuted }}>{c.pct}% of expenses</Text>
              </View>
            ))}
            {reportType === 'full' ? (
              <>
                <SecTitle label="Profit & Loss" colors={colors} />
                <PnlBlock pnlByProd={pnlByProd} netPnl={netPnl} nmPct={nmPct} totSR={totSR} totCOGS={totCOGS} totGP={totGP} gmPct={gmPct} scaledExp={scaledExp} citaRate={citaRate} citaProvision={citaProvision} catScaled={catScaled} colors={colors} rc={rc} />
                <SecTitle label="Sales by Product" colors={colors} />
                {prodSales.length === 0 ? <EmptyState icon="bar-chart-outline" label="No sales data" colors={colors} /> : null}
                {prodSales.map(p => <ProdSaleRow key={p.prod} p={p} colors={colors} />)}
              </>
            ) : null}
          </>
        ) : null}

        {/* ── P&L ── */}
        {reportType === 'pnl' ? (
          <PnlBlock pnlByProd={pnlByProd} netPnl={netPnl} nmPct={nmPct} totSR={totSR} totCOGS={totCOGS} totGP={totGP} gmPct={gmPct} scaledExp={scaledExp} citaRate={citaRate} citaProvision={citaProvision} catScaled={catScaled} colors={colors} rc={rc} />
        ) : null}

        {/* ── EXPENSES ── */}
        {reportType === 'expenses' ? (
          <>
            <View style={[s.totalPill, { backgroundColor: rc + '18', borderColor: rc + '33' }]}>
              <Text style={[s.totalPillLabel, { color: rc }]}>Total Approved Expenses</Text>
              <Text style={[s.totalPillValue, { color: rc }]}>{fmt(scaledExp)}</Text>
            </View>
            {approved.length === 0 ? <EmptyState icon="receipt-outline" label="No approved expenses" colors={colors} /> : null}
            {[...approved].reverse().map((e: any) => (
              <View key={e.id} style={[s.rowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowCardTitle, { color: colors.text }]}>{e.cat}</Text>
                  <Text style={[s.rowCardSub, { color: colors.textMuted }]}>{e.desc}</Text>
                  <Text style={{ fontSize: 10, marginTop: 3, color: colors.textSubtle }}>by {e.byName} · Approved by {e.approvedBy}</Text>
                  {e._amtMissing && <IncompleteBadge />}
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: rc }}>{fmt(e.amt)}</Text>
              </View>
            ))}
          </>
        ) : null}

        {/* ── SALES ── */}
        {reportType === 'sales' ? (
          <>
            {/* Net Sales pill */}
            <View style={[s.totalPill, { backgroundColor: (netSalesFigure >= 0 ? '#27500A' : '#791F1F') + '18', borderColor: (netSalesFigure >= 0 ? '#27500A' : '#791F1F') + '33' }]}>
              <Text style={[s.totalPillLabel, { color: netSalesFigure >= 0 ? '#27500A' : '#791F1F' }]}>Net Sales</Text>
              <Text style={[s.totalPillValue, { color: netSalesFigure >= 0 ? '#27500A' : '#791F1F' }]}>{fmt(netSalesFigure)}</Text>
            </View>

            {/* Breakdown card */}
            <View style={[s.catCard, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 4 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                <Text style={{ fontSize: 13, color: colors.text }}>Gross Sales (shift reports)</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#185FA5' }}>{fmt(shiftGross)}</Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                <Text style={{ fontSize: 13, color: colors.text }}>Less: Manager Expenses</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#791F1F' }}>({fmt(mgrExpScaled)})</Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Net Sales</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: netSalesFigure >= 0 ? '#27500A' : '#791F1F' }}>{fmt(netSalesFigure)}</Text>
              </View>
            </View>

            {/* Manager expenses detail */}
            {mgrBranchExps.length > 0 && (
              <>
                <SecTitle label={`Manager Expenses (${mgrBranchExps.length})`} colors={colors} />
                {mgrBranchExps.map((e: any) => (
                  <View key={e.id} style={[s.rowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.rowCardTitle, { color: colors.text }]}>{e.cat}</Text>
                      <Text style={[s.rowCardSub, { color: colors.textMuted }]}>{e.desc}</Text>
                      <Text style={{ fontSize: 10, marginTop: 3, color: colors.textSubtle }}>by {e.byName} · Approved by {e.approvedBy}</Text>
                      {e._amtMissing && <IncompleteBadge />}
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#791F1F' }}>{fmt(e.amt)}</Text>
                  </View>
                ))}
              </>
            )}

            {/* Product breakdown from shift reports */}
            {shiftProdSales.length > 0 && <SecTitle label="Shift Report Breakdown by Product" colors={colors} />}
            {shiftProdSales.length === 0 && fPumpReports.length === 0 ? <EmptyState icon="bar-chart-outline" label="No approved shift reports" colors={colors} /> : null}
            {shiftProdSales.map(p => (
              <View key={p.prod} style={[s.catCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[s.prodDot, { backgroundColor: p.color }]} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{p.prod}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: p.color }}>{fmt(p.scaledGross)}</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>{p.scaledL.toLocaleString()} L</Text>
                  {p.hasIncomplete && <IncompleteBadge />}
                </View>
              </View>
            ))}
          </>
        ) : null}

        {/* ── PRICES ── */}
        {reportType === 'prices' ? (
          <>
            <SecTitle label="Current Selling Prices" colors={colors} />
            {(['PMS','AGO','DPK','LPG','Lube Oil'] as const).map(prod => {
              const price = getPriceForProduct(prices, prod, selBranch);
              const pc = PROD_COLORS[prod] || rc;
              const last = safePriceHistory
                .filter(h => h.prod === prod && (selBranch === null || !h.branchId || h.branchId === selBranch))
                .sort((a,b) => b.id-a.id)[0];
              return (
                <View key={prod} style={[s.catCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[s.prodDot, { backgroundColor: pc }]} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{prod}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: price > 0 ? pc : colors.textSubtle }}>
                        {price > 0 ? `₦${price.toLocaleString()}/L` : 'Not set'}
                      </Text>
                    </View>
                    {last ? <Text style={{ fontSize: 10, color: colors.textMuted }}>Last changed by {last.by} · {fmtDate(last.dt)}</Text> : null}
                  </View>
                </View>
              );
            })}
            <SecTitle label="Price Change History" colors={colors} />
            {safePriceHistory.length === 0 ? <EmptyState icon="pricetag-outline" label="No price changes recorded" colors={colors} /> : null}
            {[...safePriceHistory].sort((a,b) => b.id-a.id).map(h => {
              const pc = PROD_COLORS[h.prod] || rc;
              const up = h.newPrice > h.oldPrice;
              return (
                <View key={h.id} style={[s.histRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[s.histTag, { backgroundColor: pc + '18' }]}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: pc }}>{h.prod}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 13, textDecorationLine: 'line-through', color: colors.textMuted }}>₦{h.oldPrice.toLocaleString()}</Text>
                      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={12} color={up ? '#27500A' : '#791F1F'} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>₦{h.newPrice.toLocaleString()}</Text>
                      <DiffBadge diff={h.newPrice - h.oldPrice} />
                    </View>
                    <Text style={{ fontSize: 11, color: colors.textSubtle }}>{h.by} · {fmtDate(h.dt)}</Text>
                  </View>
                </View>
              );
            })}
          </>
        ) : null}

        {/* ── MAINTENANCE ── */}
        {reportType === 'maintenance' ? (
          <>
            <KpiCards colors={colors} items={[
              { label:'Open',   value: maintOpen,          color:'#791F1F', icon:'alert-circle-outline'   },
              { label:'Done',   value: maintDone,          color:'#27500A', icon:'checkmark-circle-outline'},
              { label:'Urgent', value: maintUrgent,        color:'#BA7517', icon:'warning-outline'         },
              { label:'Cost',   value: fmt(maintCost),     color:'#633806', icon:'cash-outline'            },
            ]} />
            {safeMaintenance.length === 0 ? <EmptyState icon="construct-outline" label="No maintenance records" colors={colors} /> : null}
            {safeMaintenance.map((m: any) => (
              <View key={m.id} style={[s.rowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[s.priBadge, { backgroundColor: priBg(m.pri) }]}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: priColor(m.pri) }}>{m.pri}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowCardTitle, { color: colors.text }]}>{m.title}</Text>
                  <Text style={[s.rowCardSub, { color: colors.textMuted }]}>by {m.by} · {fmtDate(m.date)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <View style={[s.stBadge, { backgroundColor: m.st === 'Open' ? '#FCEBEB' : '#EAF3DE' }]}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: m.st === 'Open' ? '#791F1F' : '#27500A' }}>{m.st}</Text>
                  </View>
                  {m.cost ? <Text style={{ fontSize: 12, fontWeight: '700', color: '#633806' }}>{fmt(m.cost)}</Text> : null}
                </View>
              </View>
            ))}
          </>
        ) : null}

        {/* ── OPERATIONS ── */}
        {reportType === 'operations' ? (
          <>
            <KpiCards colors={colors} items={[
              { label:'Total Dips',  value: safeDips.length,       color:'#185FA5', icon:'layers-outline'       },
              { label:'Approved',    value: dipApproved,           color:'#27500A', icon:'checkmark-done-outline'},
              { label:'Pending',     value: dipPending,            color:'#BA7517', icon:'time-outline'          },
              { label:'Deliveries',  value: safeDeliveries.length, color:'#633806', icon:'cube-outline'          },
            ]} />
            <SecTitle label="Recent Dip Records" colors={colors} />
            {safeDips.length === 0 ? <EmptyState icon="speedometer-outline" label="No dip records yet" colors={colors} /> : null}
            {[...safeDips].sort((a: any,b: any) => b.id-a.id).slice(0, 20).map((d: any) => (
              <View key={d.id} style={[s.rowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowCardTitle, { color: colors.text }]}>{fmtDate(d.dt)}</Text>
                  <Text style={[s.rowCardSub, { color: colors.textMuted }]}>by {d.by}{d.obs ? ` · ${d.obs}` : ''}</Text>
                </View>
                <View style={[s.stBadge, { backgroundColor: d.status === 'approved' ? '#EAF3DE' : d.status === 'rejected' ? '#FCEBEB' : '#FAEEDA' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: d.status === 'approved' ? '#27500A' : d.status === 'rejected' ? '#791F1F' : '#BA7517', textTransform: 'capitalize' }}>{d.status}</Text>
                </View>
              </View>
            ))}
          </>
        ) : null}

        {/* ── HR ── */}
        {reportType === 'hr' ? (
          <>
            <KpiCards colors={colors} items={[
              { label:'Total',     value: safeHrEmployees.length, color:'#7B3FA8', icon:'people-outline'       },
              { label:'Active',    value: hrActive,               color:'#27500A', icon:'person-outline'       },
              { label:'Suspended', value: hrSuspended,            color:'#791F1F', icon:'person-remove-outline'},
              { label:'Inactive',  value: hrInactive,             color:'#999',    icon:'person-outline'       },
            ]} />
            {Object.keys(deptMap).length > 0 ? (
              <>
                <SecTitle label="By Department" colors={colors} />
                {Object.entries(deptMap).sort((a,b) => b[1]-a[1]).map(([dept, count]) => (
                  <View key={dept} style={[s.catCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{dept}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#7B3FA8' }}>{count} {count === 1 ? 'person' : 'people'}</Text>
                    </View>
                    <View style={[s.progBg, { backgroundColor: colors.border }]}>
                      <View style={[s.progBar, { width: `${safeHrEmployees.length > 0 ? Math.round((count / safeHrEmployees.length) * 100) : 0}%` as any, backgroundColor: '#7B3FA8' }]} />
                    </View>
                  </View>
                ))}
              </>
            ) : null}
            <SecTitle label="Employee Records" colors={colors} />
            {safeHrEmployees.length === 0 ? <EmptyState icon="people-outline" label="No employee records" colors={colors} /> : null}
            {safeHrEmployees.map((e: any) => (
              <View key={e.id} style={[s.rowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowCardTitle, { color: colors.text }]}>{e.name}</Text>
                  <Text style={[s.rowCardSub, { color: colors.textMuted }]}>{e.role} · {e.dept}</Text>
                  <Text style={{ fontSize: 10, marginTop: 2, color: colors.textSubtle }}>Joined {fmtDate(e.joinDate)}</Text>
                </View>
                <View style={[s.stBadge, { backgroundColor: e.status === 'active' ? '#EAF3DE' : e.status === 'suspended' ? '#FCEBEB' : '#f5f5f3' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: stColor(e.status), textTransform: 'capitalize' }}>{e.status}</Text>
                </View>
              </View>
            ))}
          </>
        ) : null}

        {/* ── MARKETING ── */}
        {reportType === 'marketing' ? (
          <>
            <KpiCards colors={colors} items={[
              { label:'Proposals', value: safeProposals.length, color:'#C45C1A', icon:'megaphone-outline'},
              { label:'Pending',   value: propPending,          color:'#BA7517', icon:'time-outline'     },
              { label:'Approved',  value: propApproved,         color:'#27500A', icon:'checkmark-outline'},
              { label:'Rejected',  value: propRejected,         color:'#791F1F', icon:'close-outline'    },
            ]} />
            <SecTitle label="Price Proposals" colors={colors} />
            {safeProposals.length === 0 ? <EmptyState icon="megaphone-outline" label="No proposals yet" colors={colors} /> : null}
            {[...safeProposals].sort((a: any,b: any) => b.id-a.id).map((p: any) => {
              const pc = PROD_COLORS[p.prod] || rc;
              const up = p.proposedPrice > p.currentPrice;
              const sc = p.status==='approved' ? '#27500A' : p.status==='rejected' ? '#791F1F' : '#BA7517';
              const sb = p.status==='approved' ? '#EAF3DE' : p.status==='rejected' ? '#FCEBEB' : '#FAEEDA';
              return (
                <View key={p.id} style={[s.histRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[s.histTag, { backgroundColor: pc + '18' }]}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: pc }}>{p.prod}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 13, textDecorationLine: 'line-through', color: colors.textMuted }}>₦{p.currentPrice.toLocaleString()}</Text>
                      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={12} color={up ? '#27500A' : '#791F1F'} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>₦{p.proposedPrice.toLocaleString()}</Text>
                      <DiffBadge diff={p.proposedPrice - p.currentPrice} />
                    </View>
                    <Text style={{ fontSize: 11, color: colors.textSubtle }}>By {p.proposedBy}{p.reviewedBy ? ` · ${p.status==='approved'?'Approved':'Rejected'} by ${p.reviewedBy}` : ''} · {fmtDate(p.proposedAt)}</Text>
                  </View>
                  <View style={[s.stBadge, { backgroundColor: sb }]}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: sc, textTransform: 'capitalize' }}>{p.status}</Text>
                  </View>
                </View>
              );
            })}
            <SecTitle label="Recent Price Changes" colors={colors} />
            {[...safePriceHistory].sort((a,b) => b.id-a.id).slice(0, 15).map(h => {
              const pc = PROD_COLORS[h.prod] || rc;
              const up = h.newPrice > h.oldPrice;
              return (
                <View key={h.id} style={[s.histRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[s.histTag, { backgroundColor: pc + '18' }]}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: pc }}>{h.prod}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 13, textDecorationLine: 'line-through', color: colors.textMuted }}>₦{h.oldPrice.toLocaleString()}</Text>
                      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={12} color={up ? '#27500A' : '#791F1F'} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>₦{h.newPrice.toLocaleString()}</Text>
                      <DiffBadge diff={h.newPrice - h.oldPrice} />
                    </View>
                    <Text style={{ fontSize: 11, color: colors.textSubtle }}>{h.by} · {fmtDate(h.dt)}</Text>
                  </View>
                </View>
              );
            })}
          </>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

/* ─── P&L block ─────────────────────────────────────────── */
function PnlBlock({ pnlByProd, netPnl, nmPct, totSR, totCOGS, totGP, gmPct, scaledExp, citaRate, citaProvision, catScaled, colors, rc }: any) {
  return (
    <>
      <View style={[s.plHeader, { backgroundColor: netPnl >= 0 ? '#0a2318' : '#791F1F' }]}>
        <Text style={s.plHeaderLabel}>Profit & Loss</Text>
        <Text style={s.plHeaderNet}>{fmt(netPnl)}</Text>
        <Text style={s.plHeaderSub}>{netPnl >= 0 ? 'Net Profit' : 'Net Loss'} · {nmPct}% net margin</Text>
        <View style={{ flexDirection: 'row' }}>
          {[
            { label: 'Sales Revenue', value: totSR },
            { label: 'Cost of Goods', value: totCOGS },
            { label: 'Gross Profit',  value: totGP  },
            { label: 'CITA',          value: citaProvision },
          ].map(it => (
            <View key={it.label} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, marginBottom: 3 }}>{it.label}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: it.label === 'Cost of Goods' ? '#ffb3b3' : '#fff' }}>{fmt(it.value)}</Text>
            </View>
          ))}
        </View>
      </View>
      <ProgressRow label="Gross Margin" pct={gmPct} colors={colors} />
      {pnlByProd.length === 0 ? <EmptyState icon="trending-up-outline" label="No P&L data" colors={colors} /> : null}
      {pnlByProd.map((p: any) => {
        const pc = PROD_COLORS[p.prod] || rc;
        const profitable = p.grossProfit >= 0;
        return (
          <View key={p.prod} style={[s.plCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
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
            {p.hasIncomplete && <IncompleteBadge />}
            <View style={{ flexDirection: 'row', marginBottom: 8, marginTop: p.hasIncomplete ? 8 : 0 }}>
              {[
                { label: 'Volume Sold', val: `${p.totalVolumeSold.toLocaleString()} L` },
                { label: 'Avg Sell',    val: `₦${p.avgSellPrice.toLocaleString()}/L`, color: pc },
                { label: 'Avg Cost',    val: p.hasCostData ? `₦${p.avgCostPerL.toLocaleString()}/L` : '—' },
              ].map(g => (
                <View key={g.label} style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>{g.label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: (g as any).color ?? colors.text }}>{g.val}</Text>
                </View>
              ))}
            </View>
            {[
              { label: 'Sales Revenue', value: p.salesRevenue, color: '#185FA5', icon: 'cash-outline' },
              { label: 'COGS',          value: p.scaledCOGS,   color: '#791F1F', icon: 'pricetag-outline' },
              { label: 'Gross Profit',  value: p.grossProfit,  color: profitable ? '#27500A' : '#791F1F', icon: profitable ? 'trending-up' : 'trending-down' },
            ].map(row => (
              <View key={row.label} style={[s.plRow, { borderTopColor: colors.border }]}>
                <Ionicons name={row.icon as any} size={13} color={row.color} />
                <Text style={{ flex: 1, fontSize: 12, color: colors.textMuted }}>{row.label}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: row.color }}>{fmt(row.value)}</Text>
              </View>
            ))}
          </View>
        );
      })}
      <View style={[s.plOpex, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ fontSize: 14, fontWeight: '700', marginBottom: 6, color: colors.text }}>Operating Expenses</Text>
        {catScaled.slice(0, 5).map((c: any) => (
          <View key={c.cat} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>{c.cat}</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#791F1F' }}>{fmt(c.total)}</Text>
          </View>
        ))}
        {catScaled.length > 5 ? <Text style={{ fontSize: 11, color: colors.textSubtle }}>+ {catScaled.length - 5} more</Text> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Total</Text>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#791F1F' }}>{fmt(scaledExp)}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>CITA ({(citaRate * 100).toFixed(0)}%)</Text>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#BA7517' }}>{fmt(citaProvision)}</Text>
        </View>
      </View>
      <View style={[s.plFinal, { backgroundColor: netPnl >= 0 ? '#EAF3DE' : '#FCEBEB', borderColor: netPnl >= 0 ? '#27500A33' : '#791F1F33' }]}>
        <View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: netPnl >= 0 ? '#27500A' : '#791F1F' }}>{netPnl >= 0 ? 'Net Profit' : 'Net Loss'}</Text>
          <Text style={{ fontSize: 10, marginTop: 3, color: netPnl >= 0 ? '#3a6e1c' : '#aa2222' }}>Gross Profit − Operating Expenses − CITA</Text>
        </View>
        <Text style={{ fontSize: 22, fontWeight: '900', marginLeft: 'auto', color: netPnl >= 0 ? '#27500A' : '#791F1F' }}>{fmt(netPnl)}</Text>
      </View>
    </>
  );
}

function ProdSaleRow({ p, colors }: { p: any; colors: any }) {
  return (
    <View style={[s.catCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[s.prodDot, { backgroundColor: p.color }]} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{p.prod}</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: p.color }}>{fmt(p.scaledRev)}</Text>
        </View>
        <Text style={{ fontSize: 10, color: colors.textMuted }}>{p.scaledL.toLocaleString()} L · ₦{(p.price ?? 0).toLocaleString()}/L</Text>
      </View>
    </View>
  );
}

/* ─── Styles ─────────────────────────────────────────────── */
const s = StyleSheet.create({
  /* ── Top bar ── */
  topBar:         { paddingHorizontal: 14, paddingVertical: 8, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  chipWrap:       { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  periodChip:     { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  periodChipTxt:  { fontSize: 11, fontWeight: '600' },
  branchChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  branchChipTxt:  { fontSize: 11, fontWeight: '500' },

  /* ── Type chip strip ── */
  typeScroll:       { borderBottomWidth: StyleSheet.hairlineWidth },
  typeScrollContent:{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  typeChip:         { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  typeChipIcon:     { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  typeChipLabel:    { fontSize: 12, fontWeight: '700' },

  /* ── Report header strip ── */
  scroll:         { padding: 14 },
  reportStrip:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, marginBottom: 14 },
  stripIcon:      { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stripTitle:     { color: '#fff', fontSize: 15, fontWeight: '800' },
  stripSub:       { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  stripExportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: '#fff' },
  stripExportTxt: { fontSize: 11, fontWeight: '700' },
  viewOnlyPill:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)' },
  viewOnlyBadge:  { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontStyle: 'italic' },

  /* ── KPI cards ── */
  kpiRow:         { flexDirection: 'row', gap: 8, marginBottom: 14 },
  kpiCard:        { flex: 1, borderRadius: 12, borderWidth: 1, padding: 11, alignItems: 'center', gap: 4 },
  kpiLabel:       { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', textAlign: 'center' },
  kpiValue:       { fontSize: 13, fontWeight: '800' },

  /* ── Sections ── */
  secTitle:       { fontSize: 14, fontWeight: '700', marginBottom: 10, marginTop: 4 },
  marginRow:      { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 14 },
  marginLabel:    { fontSize: 12, fontWeight: '600', width: 90 },
  marginPct:      { fontSize: 14, fontWeight: '800', width: 42, textAlign: 'right' },
  progBg:         { height: 6, borderRadius: 3, overflow: 'hidden' },
  progBar:        { height: 6, borderRadius: 3 },
  rowCard:        { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  rowCardTitle:   { fontSize: 13, fontWeight: '700' },
  rowCardSub:     { fontSize: 11, marginTop: 2 },
  catCard:        { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  prodDot:        { width: 10, height: 10, borderRadius: 5 },
  histRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8 },
  histTag:        { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignItems: 'center', minWidth: 44 },
  totalPill:      { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 14, alignItems: 'center' },
  totalPillLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  totalPillValue: { fontSize: 28, fontWeight: '800' },
  priBadge:       { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  stBadge:        { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },

  /* ── P&L ── */
  plHeader:       { borderRadius: 16, padding: 20, marginBottom: 14, gap: 4 },
  plHeaderLabel:  { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  plHeaderNet:    { color: '#fff', fontSize: 34, fontWeight: '800' },
  plHeaderSub:    { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 8 },
  plCard:         { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  plRow:          { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  plOpex:         { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  plFinal:        { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 10 },

  /* ── Empty ── */
  empty:          { alignItems: 'center', paddingVertical: 40, gap: 10 },
});
