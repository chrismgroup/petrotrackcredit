import type { Role } from '@/context/AppContext';
import { canonicalReportProduct, isProduct } from '@/lib/product-identity';

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
export const PROD_COLORS: Record<string, string> = {
  PMS:'#1a6e3c', AGO:'#185FA5', DPK:'#BA7517', LPG:'#633806', 'Lube Oil':'#5c3d11',
};

export type PriceValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'not_authorized'
        | 'missing_product'
        | 'missing_actor'
        | 'invalid_old_price'
        | 'invalid_new_price'
        | 'invalid_current_price'
        | 'invalid_proposed_price'
        | 'missing_branch';
    };

function isNonNegativeFinitePrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveFinitePrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasRequiredPriceLabel(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validatePriceChange(input: {
  prod: unknown;
  oldPrice: unknown;
  newPrice: unknown;
  by: unknown;
}): PriceValidationResult {
  if (!hasRequiredPriceLabel(input.prod)) return { ok: false, reason: 'missing_product' };
  if (!hasRequiredPriceLabel(input.by)) return { ok: false, reason: 'missing_actor' };
  if (!isNonNegativeFinitePrice(input.oldPrice)) return { ok: false, reason: 'invalid_old_price' };
  if (!isPositiveFinitePrice(input.newPrice)) return { ok: false, reason: 'invalid_new_price' };
  return { ok: true };
}

export function validatePriceProposal(input: {
  prod: unknown;
  currentPrice: unknown;
  proposedPrice: unknown;
  proposedBy: unknown;
}): PriceValidationResult {
  if (!hasRequiredPriceLabel(input.prod)) return { ok: false, reason: 'missing_product' };
  if (!hasRequiredPriceLabel(input.proposedBy)) return { ok: false, reason: 'missing_actor' };
  if (!isNonNegativeFinitePrice(input.currentPrice)) return { ok: false, reason: 'invalid_current_price' };
  if (!isPositiveFinitePrice(input.proposedPrice)) return { ok: false, reason: 'invalid_proposed_price' };
  return { ok: true };
}

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

/* ─── Role permission matrix ──────────────────────────────
 * Every signed-in role can read every report on screen.
 * Export permissions remain role-specific below. */
type PermSet = { visible: ReportType[]; canGenerate: ReportType[] };
const ALL = ALL_REPORT_TYPES;
const ROLE_PERMS: Partial<Record<Role, PermSet>> & { default: PermSet } = {
  admin:  { visible: ALL, canGenerate: ALL },
  ceo:    { visible: ALL, canGenerate: ALL },
  md:     { visible: ALL, canGenerate: ALL },
  acc:    { visible: ALL, canGenerate: ['summary','pnl','expenses','full'] },
  csm:    { visible: ALL, canGenerate: ['hr','summary','expenses'] },
  mktg:   { visible: ALL, canGenerate: ['sales','prices','marketing'] },
  mgr:    { visible: ALL, canGenerate: ['summary','expenses','sales','prices','operations'] },
  att:    { visible: ALL, canGenerate: [] },
  default: { visible: ALL, canGenerate: [] },
};

export function getPerms(role: Role | null): PermSet {
  if (!role) return ROLE_PERMS.default;
  return (ROLE_PERMS as Record<string, PermSet>)[role] ?? ROLE_PERMS.default;
}

/* ─── Helpers ────────────────────────────────────────────── */
export function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function periodRange(p: Period, anchor?: Date | string): { from: Date; to: Date } {
  const base = typeof anchor === 'string'
    ? new Date(`${anchor}T12:00:00`)
    : anchor
      ? new Date(anchor)
      : new Date();
  const day = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  let from: Date;
  let to: Date;

  if (p === 'Daily') {
    from = new Date(day);
    to = new Date(day);
  } else if (p === 'Weekly') {
    // Calendar weeks run Monday through Sunday.
    const mondayOffset = day.getDay() === 0 ? -6 : 1 - day.getDay();
    from = new Date(day);
    from.setDate(day.getDate() + mondayOffset);
    to = new Date(from);
    to.setDate(from.getDate() + 6);
  } else if (p === 'Monthly') {
    from = new Date(day.getFullYear(), day.getMonth(), 1);
    to = new Date(day.getFullYear(), day.getMonth() + 1, 0);
  } else if (p === 'Quarterly') {
    const quarterStartMonth = Math.floor(day.getMonth() / 3) * 3;
    from = new Date(day.getFullYear(), quarterStartMonth, 1);
    to = new Date(day.getFullYear(), quarterStartMonth + 3, 0);
  } else {
    from = new Date(day.getFullYear(), 0, 1);
    to = new Date(day.getFullYear(), 11, 31);
  }

  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export function matchesProd(pump: string | null | undefined, prod: string | null | undefined): boolean {
  return isProduct({ pump }, prod);
}

export type COGSDelivery = {
  id?: number;
  dt?: string;
  approvedAt?: string;
  prod: string;
  rec: number;
  costPrice?: number;
  approvalStatus?: string;
  branchId?: string;
};

export type COGSSale = {
  pumpName: string;
  product: string;
  liters: number;
  date?: string;
  branchId?: string;
};

export type OpeningInventoryCost = {
  product: string;
  branchId?: string;
  unitCost?: number;
  seedDate?: string;
  setAt?: string;
};

const validCost = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

function latestDeliveryFirst(a: COGSDelivery, b: COGSDelivery): number {
  const dateOrder = String(b.dt ?? '').slice(0, 10).localeCompare(String(a.dt ?? '').slice(0, 10));
  if (dateOrder !== 0) return dateOrder;
  const approvalOrder = String(b.approvedAt ?? '').localeCompare(String(a.approvedAt ?? ''));
  if (approvalOrder !== 0) return approvalOrder;
  return (b.id ?? 0) - (a.id ?? 0);
}

/** Returns the last approved cost price known for a product in the supplied
 * as-of delivery set. Callers should exclude deliveries after the report end
 * date and outside the selected branch before calling this function. */
export function getLastKnownCostPrice(
  deliveries: COGSDelivery[],
  prod: string,
  branchId?: string,
  asOfDate?: string,
  openingCosts: OpeningInventoryCost[] = [],
): number {
  const targetProduct = canonicalReportProduct(prod);
  if (!targetProduct) return 0;
  const eligible = deliveries
    .filter(d => canonicalReportProduct(d.prod) === targetProduct
      && validCost(d.costPrice) > 0
      && (d.approvalStatus === 'md_approved' || d.approvalStatus === 'approved')
      && (!asOfDate || String(d.dt ?? '').slice(0, 10) <= asOfDate.slice(0, 10)));
  const branchDeliveries = branchId
    ? eligible.filter(d => d.branchId === branchId)
    : eligible;
  const candidates = branchDeliveries.length > 0
    ? branchDeliveries
    : eligible.filter(d => !d.branchId);
  const latest = candidates.sort(latestDeliveryFirst)[0];
  const deliveryCost = validCost(latest?.costPrice);
  if (deliveryCost > 0) return deliveryCost;
  const opening = openingCosts
    .filter(item => canonicalReportProduct(item.product) === targetProduct
      && (!branchId || item.branchId === branchId)
      && (!asOfDate || String(item.seedDate ?? item.setAt ?? '').slice(0, 10) <= asOfDate.slice(0, 10)))
    .sort((a, b) => String(b.seedDate ?? b.setAt ?? '').localeCompare(String(a.seedDate ?? a.setAt ?? '')))[0];
  return validCost(opening?.unitCost);
}

/** Cost of goods sold: the total cost price of the products sold.
 *  Uses the last known approved delivery cost for each product multiplied by
 *  the volume sold. Products with no approved cost data contribute 0. */
export function computeCOGS(
  sales: Array<{ pump: string; product?: string; L: number }>,
  deliveries: COGSDelivery[],
  openingCosts: OpeningInventoryCost[] = [],
): number {
  const PRODS = ['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil', 'Others'];
  let total = 0;
  for (const prod of PRODS) {
    const vol = sales.filter(s => isProduct(s, prod)).reduce((sum, e) => sum + Math.max(0, safeNum(e.L)), 0);
    if (vol <= 0) continue;
    total += getLastKnownCostPrice(deliveries, prod, undefined, undefined, openingCosts) * vol;
  }
  return Math.round(total);
}

/** COGS for a shift-report revenue feed using its sold volume and the same
 * last-known approved delivery costs as computeCOGS.
 */
export function computePumpReportCOGS(
  reports: COGSSale[],
  deliveries: COGSDelivery[],
  openingCosts: OpeningInventoryCost[] = [],
): number {
  return Math.round(reports.reduce((total, report) => {
    const volume = Math.max(0, safeNum(report.liters));
    const cost = getLastKnownCostPrice(deliveries, report.product, report.branchId, report.date, openingCosts);
    return total + (volume * cost);
  }, 0));
}

export function missingPumpReportCostProducts(
  reports: COGSSale[],
  deliveries: COGSDelivery[],
  openingCosts: OpeningInventoryCost[] = [],
): string[] {
  return [...new Set(reports
    .filter(report => safeNum(report.liters) > 0
      && getLastKnownCostPrice(deliveries, report.product, report.branchId, report.date, openingCosts) <= 0)
    .map(report => report.product))];
}

/** Coerce any value to a finite number, returning `fallback` (default 0) when
 *  the value is undefined, null, NaN, or non-finite. Use this whenever a
 *  synced record field that should be numeric may arrive incomplete. */
export function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Returns true when the value represents a missing or non-numeric field —
 *  i.e. null, undefined, empty/blank string, or any value that does not
 *  parse to a finite number. Use this to flag records where a numeric field
 *  was absent during sync (before safeNum coercion hides the gap). */
export function isMissingNum(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return !Number.isFinite(Number(v));
}

/** Coerce any value to a non-empty string, returning `fallback` (default '—')
 *  when the value is undefined, null, or an empty/whitespace-only string. */
export function safeStr(v: unknown, fallback = '—'): string {
  const s = String(v ?? '').trim();
  return s.length > 0 ? s : fallback;
}

export function nfmt(n: number): string {
  return '₦' + safeNum(n).toLocaleString('en-NG', { maximumFractionDigits: 0 });
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
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
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
  /** If any records had a missing amount field that defaulted to ₦0, pass a
   *  human-readable warning here and it will appear as a footnote before the
   *  page footer so the reader knows the totals may be understated. */
  footnote?: string;
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
  const footnotePart = opts.footnote
    ? `<div class="footnote-warn">⚠ ${e(opts.footnote)}</div>`
    : '';
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
  .footnote-warn{background:#fff8e1;border:1.5px solid #f0c040;border-radius:6px;padding:10px 14px;
    font-size:11px;color:#7a5c00;margin-top:24px;margin-bottom:8px;line-height:1.5}
  .footer{text-align:center;font-size:10px;color:#999;margin-top:16px;border-top:1px solid #e5e5e3;padding-top:12px}
  </style></head><body>
  <div class="header"><h1>Petrotrack — ${e(opts.title)}</h1>
  <p>${e(opts.period)} &bull; ${e(opts.branchName)} &bull; By ${e(opts.generatedBy)}</p></div>
  <div class="meta">
    <div class="meta-item"><div class="k">Period</div><div class="v">${e(opts.period)}</div></div>
    <div class="meta-item"><div class="k">Branch</div><div class="v">${e(opts.branchName)}</div></div>
    <div class="meta-item"><div class="k">Generated by</div><div class="v">${e(opts.generatedBy)}</div></div>
    <div class="meta-item"><div class="k">Date</div><div class="v">${e(opts.generatedAt)}</div></div>
  </div>${sec}${tbl}${footnotePart}
  <div class="footer">Generated by Petrotrack &bull; Confidential &bull; ${e(opts.generatedAt)}</div>
  </body></html>`;
}
