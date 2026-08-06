import type { Role } from '@/context/AppContext';

/* ─── Types ─────────────────────────────────────────────── */
export type Period = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
export type ReportType =
  | 'summary' | 'pnl' | 'expenses' | 'sales' | 'prices'
  | 'maintenance' | 'operations' | 'hr' | 'marketing' | 'full';

/* ─── Constants ─────────────────────────────────────────── */
export const ALL_REPORT_TYPES: ReportType[] = [
  'summary','pnl','expenses','sales','prices',
  'maintenance','operations','hr','marketing','full',
];
export const PERIODS: Period[] = ['Daily','Weekly','Monthly','Quarterly','Yearly'];
export const SCALE: Record<Period, number> = { Daily:1, Weekly:7, Monthly:30, Quarterly:90, Yearly:365 };
export const PROD_COLORS: Record<string, string> = {
  PMS:'#1a6e3c', AGO:'#185FA5', DPK:'#BA7517', LPG:'#633806', 'Lube Oil':'#5c3d11',
};

export const REPORT_META: Record<ReportType, { label: string; icon: string; desc: string; dept: string; color: string }> = {
  summary:     { label:'Summary',       icon:'stats-chart-outline',   desc:'Revenue, expenses & net balance',        dept:'Finance',    color:'#185FA5' },
  pnl:         { label:'P&L',           icon:'trending-up-outline',   desc:'Gross / net profit with COGS',           dept:'Finance',    color:'#27500A' },
  expenses:    { label:'Expenses',      icon:'receipt-outline',       desc:'Approved expense ledger',                dept:'Finance',    color:'#791F1F' },
  sales:       { label:'Sales',         icon:'bar-chart-outline',     desc:'Product sales volume & revenue',         dept:'Marketing',  color:'#1a6e3c' },
  prices:      { label:'Prices',        icon:'pricetag-outline',      desc:'Current prices & change history',        dept:'Marketing',  color:'#BA7517' },
  maintenance: { label:'Maintenance',   icon:'construct-outline',     desc:'Equipment & facility work log',          dept:'Operations', color:'#633806' },
  operations:  { label:'Operations',   icon:'speedometer-outline',   desc:'Dip records & tank level summary',       dept:'Operations', color:'#185FA5' },
  hr:          { label:'HR',            icon:'people-outline',        desc:'Staff headcount, roles & status',        dept:'HR',         color:'#7B3FA8' },
  marketing:   { label:'Marketing',     icon:'megaphone-outline',     desc:'Price proposals & activity',             dept:'Marketing',  color:'#C45C1A' },
  full:        { label:'Full Report',   icon:'document-text-outline', desc:'All sections combined',                  dept:'All',        color:'#0a3a1e' },
};

/* ─── Role permission matrix ────────────────────────────── */
type PermSet = { visible: ReportType[]; canGenerate: ReportType[] };
const ALL = ALL_REPORT_TYPES;
const ROLE_PERMS: Partial<Record<Role, PermSet>> & { default: PermSet } = {
  admin:  { visible: ALL, canGenerate: ALL },
  ceo:    { visible: ALL, canGenerate: ALL },
  md:     { visible: ALL, canGenerate: ALL },
  acc:    { visible: ['summary','pnl','expenses','sales','prices','full'], canGenerate: ['summary','pnl','expenses','full'] },
  csm:    { visible: ['hr','summary','expenses','sales','prices','operations'], canGenerate: ['hr','summary','expenses'] },
  mktg:   { visible: ['sales','prices','marketing','summary','expenses'], canGenerate: ['sales','prices','marketing'] },
  mgr:    { visible: ['summary','expenses','sales','prices','operations','maintenance'], canGenerate: ['summary','expenses','sales','prices','operations'] },
  default: { visible: [], canGenerate: [] },
};

export function getPerms(role: Role | null): PermSet {
  if (!role) return ROLE_PERMS.default;
  return (ROLE_PERMS as Record<string, PermSet>)[role] ?? ROLE_PERMS.default;
}

/* ─── Helpers ────────────────────────────────────────────── */
export function periodRange(p: Period): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (SCALE[p] - 1));
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export function matchesProd(pump: string, prod: string): boolean {
  const p = pump.toLowerCase();
  if (prod === 'Lube Oil') return p.includes('lube');
  if (prod === 'Others')   return p.includes('other');
  return p.includes(prod.toLowerCase());
}

export function nfmt(n: number): string {
  return '₦' + n.toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

export function priColor(pri: string): string {
  return pri === 'Urgent' ? '#791F1F' : pri === 'Medium' ? '#BA7517' : '#185FA5';
}
export function priBg(pri: string): string {
  return pri === 'Urgent' ? '#FCEBEB' : pri === 'Medium' ? '#FAEEDA' : '#EBF0FA';
}
export function stColor(st: string): string {
  return st === 'active' ? '#27500A' : st === 'suspended' ? '#791F1F' : '#999';
}

/* ─── HTML output encoding ──────────────────────────────── */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ─── PDF builder ───────────────────────────────────────── */
export function buildPdf(opts: {
  title: string; period: string; branchName: string; generatedAt: string; generatedBy: string;
  sections: Array<{ heading: string; rows: Array<{ label: string; value: string }> }>;
  tables?: Array<{ heading: string; headers: string[]; rows: string[][] }>;
}): string {
  const e = escapeHtml;
  const sec = opts.sections.map(s =>
    `<div class="section"><h3>${e(s.heading)}</h3><table class="kv">
    ${s.rows.map(r => `<tr><td class="lbl">${e(r.label)}</td><td class="val">${e(r.value)}</td></tr>`).join('')}
    </table></div>`
  ).join('');
  const tbl = (opts.tables ?? []).map(t =>
    `<div class="section"><h3>${e(t.heading)}</h3><table class="data">
    <thead><tr>${t.headers.map(h => `<th>${e(h)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map(r => `<tr>${r.map(c => `<td>${e(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`
  ).join('');
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
  <div class="header"><h1>Petrotrack — ${e(opts.title)}</h1>
  <p>${e(opts.period)} &bull; ${e(opts.branchName)} &bull; By ${e(opts.generatedBy)}</p></div>
  <div class="meta">
    <div class="meta-item"><div class="k">Period</div><div class="v">${e(opts.period)}</div></div>
    <div class="meta-item"><div class="k">Branch</div><div class="v">${e(opts.branchName)}</div></div>
    <div class="meta-item"><div class="k">Generated by</div><div class="v">${e(opts.generatedBy)}</div></div>
    <div class="meta-item"><div class="k">Date</div><div class="v">${e(opts.generatedAt)}</div></div>
  </div>${sec}${tbl}
  <div class="footer">Generated by Petrotrack &bull; Confidential &bull; ${e(opts.generatedAt)}</div>
  </body></html>`;
}
