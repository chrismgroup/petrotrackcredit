import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  stateApi, versionApi, usersApi, notificationsApi, maintenanceApi,
  AppNotification, StaffUserRecord, apiLogin, saveToken, clearToken,
  type MaintenanceWorkflowStatus,
} from '@/lib/api';
import { hashPassword, verifyPassword } from '@/lib/crypto';
import {
  isMissingNum,
  safeNum,
  validatePriceChange,
  validatePriceProposal,
  type PriceValidationResult,
} from '@/lib/report-helpers';

export type Role = 'admin' | 'ceo' | 'md' | 'mktg' | 'csm' | 'acc' | 'mgr' | 'att';

export interface Tank {
  id: string; name: string; prod: 'PMS' | 'AGO' | 'DPK' | 'Lube Oil';
  cap: number; dip: number; op: number; rv: number; sl: number; branchId?: string;
}
export interface LPGTank { id: string; name: string; cap: number; op: number; rv: number; sl: number; branchId?: string; }
export interface Pump { id: string; name: string; prod: 'PMS' | 'AGO' | 'DPK' | 'LPG' | 'Lube Oil'; active: boolean; branchId?: string; lpgCategory?: 'single' | 'distributor'; }
export interface DipRecord { id: number; dt: string; submittedAt?: string; by: string; rd: Record<string, number>; lpg: Record<string, number>; obs: string; status: 'pending' | 'approved' | 'rejected'; approvedBy?: string; approvedDt?: string; branchId?: string; }
export interface Delivery { id: number; dt: string; submittedAt?: string; sup: string; prod: string; wb: string; ord: number; rec: number; st: 'ok' | 'short' | 'spill' | 'seal'; notes: string; costPrice?: number; sellingPrice?: number; mdNote?: string; receivedBy?: string; approvalStatus?: 'draft' | 'pending' | 'pending_acc' | 'pending_md' | 'md_approved' | 'approved' | 'rejected'; approvedBy?: string; approvedAt?: string; rejectedNote?: string; branchId?: string; accNote?: string; accBy?: string; accAt?: string; mdBy?: string; mdAt?: string; }
export interface MaintenanceHistoryEntry {
  id: string;
  action: string;
  actor: string;
  detail?: string;
  at: string;
}
export interface MaintenanceItem {
  id: number;
  taskId?: string;
  title: string;
  pri: 'Urgent' | 'Medium' | 'Low';
  by: string;
  date: string;
  submittedAt?: string;
  submittedBy?: string;
  submittedByName?: string;
  st: 'Open' | 'Done';
  status?: MaintenanceWorkflowStatus;
  cost?: number;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  receivedBy?: string;
  receivedAt?: string;
  assignedTo?: string;
  assignedToName?: string;
  assignedBy?: string;
  assignedAt?: string;
  statusUpdatedBy?: string;
  statusUpdatedAt?: string;
  updatedAt?: string;
  history?: MaintenanceHistoryEntry[];
}
export interface SalesEntry { id: number; pump: string; by: string; L: number; price: number; dt: string; pos?: number; branchId?: string; shiftReportId?: number; pumpId?: string; lpgCategory?: 'single' | 'distributor'; }
export type StockProduct = 'PMS' | 'AGO' | 'DPK' | 'LPG' | 'Lube Oil';
export const STOCK_SNAPSHOT_METRICS = [
  'startupStock', 'deliveries', 'sales', 'submittedTankDip', 'bookStock', 'variance',
] as const;
export type StockSnapshotMetric = typeof STOCK_SNAPSHOT_METRICS[number];
export interface StockSnapshotConfig {
  metrics: Record<StockSnapshotMetric, boolean>;
  productsByBranch: Record<string, Partial<Record<StockProduct, boolean>>>;
}
export const DEFAULT_STOCK_SNAPSHOT_CONFIG: StockSnapshotConfig = {
  metrics: {
    startupStock: true,
    deliveries: true,
    sales: true,
    submittedTankDip: true,
    bookStock: true,
    variance: true,
  },
  productsByBranch: {},
};
export interface StartupStock {
  id: string;
  product: StockProduct;
  quantity: number;
  branchId?: string;
  setBy: string;
  setAt: string;
  /** Business date from which this baseline applies. Legacy records use setAt. */
  seedDate?: string;
  locked: boolean;
}
const HISTORICAL_BASELINE_REPAIRS: ReadonlyArray<{
  branchName: string;
  product: StockProduct;
  quantity: number;
  seedDate: string;
}> = [
  { branchName: 'uyo gas plant', product: 'LPG', quantity: 7000, seedDate: '2026-08-14' },
  { branchName: 'uyo fuel station', product: 'PMS', quantity: 18800, seedDate: '2026-08-14' },
];
export interface MarketCompetitor { id: string; name: string; location: string; pms: string; ago: string; dpk: string; lpg: string; updatedBy: string; updatedAt: string; }
export interface Staff { id: number; name: string; role: string; sal: number; st: 'Active' | 'Suspended'; email: string; dept?: string; branchId?: string; accountId?: number; }
export interface Branch { id: string; name: string; st: 'Active' | 'Pending' | 'Suspended'; rev: number; mgr: string; pumps: number; tanks: number; }
export interface ComplianceDoc { id: number; name: string; cat: string; iss: string; exp: string; ref: string; }
export interface PriceProposal {
  id: number; prod: string; currentPrice: number; proposedPrice: number;
  proposedBy: string; proposedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  branchId?: string;
  reviewedBy?: string; reviewedAt?: string; note?: string;
}
export interface Expense { id: number; dt: string; submittedAt?: string; cat: string; desc: string; amt: number; by: string; byName: string; status: 'pending' | 'acc_forwarded' | 'approved' | 'rejected'; approvedBy?: string; approvedDt?: string; budgetId: number; ref?: string; branchId?: string; }
export interface BudgetWorkflowStep { stage: string; by: string; role: string; dt: string; action: string; note: string; }
export interface Budget { id: number; month: number; year: number; appliesOn?: string; submittedAt?: string; label: string; by: string; byName: string; items: { cat: string; amt: number }[]; total: number; status: string; workflow: BudgetWorkflowStep[]; }
export interface BankLoan { bank: string; amount: number; }
export interface FinancialEntry {
  cashInBank: number; posValue: number; goodsOnTransit: number;
  cashInHand: number; debtsFromCustomers: number; capitalInjection: number;
  bankLoans: BankLoan[]; liabilities: number;
  updatedBy: string; updatedAt: string;
}
export interface NavItem { id: string; icon: string; label: string; }
export interface UserInfo { name: string; color: string; initials: string; role: string; online: boolean; }

/**
 * Returns the current physical stock for a tank.
 *
 * Tank balances are normally maintained as opening + receipts - sales. An
 * approved dip is also used as the physical source of truth when a previous
 * approval stored the direct litre reading as a millimetre-converted opening.
 */
export function getCurrentTankStock(
  tank: Pick<Tank | LPGTank, 'op' | 'rv' | 'sl' | 'id'> & Partial<Pick<Tank, 'cap' | 'dip'>>,
  dips: DipRecord[],
  productKind: 'petrol' | 'lpg' = 'petrol',
): number {
  const balance = Math.max(0, safeNum(tank.op) + safeNum(tank.rv) - safeNum(tank.sl));

  const latestDip = dips
    .filter(d => d.status === 'approved')
    .filter(d => productKind === 'lpg' ? d.lpg[tank.id] !== undefined : d.rd[tank.id] !== undefined)
    .sort((a, b) => {
      const aTime = new Date(a.approvedDt ?? a.dt).getTime();
      const bTime = new Date(b.approvedDt ?? b.dt).getTime();
      return bTime - aTime;
    })[0];

  const reading = productKind === 'lpg'
    ? latestDip?.lpg[tank.id]
    : latestDip?.rd[tank.id];
  if (reading !== undefined) {
    // Older approvals stored litre readings as millimetres and inflated the
    // tank opening by cap / dip. Correct that legacy opening transparently,
    // while preserving normal post-dip deliveries and sales.
    if (
      productKind === 'petrol' &&
      typeof tank.cap === 'number' &&
      typeof tank.dip === 'number' &&
      tank.cap > 0 &&
      tank.dip > 0 &&
      Math.abs(safeNum(tank.op) - Math.round((safeNum(reading) / safeNum(tank.dip)) * safeNum(tank.cap))) <= 0.01
    ) {
      return Math.max(0, dipReadingToLiters(safeNum(reading)) + safeNum(tank.rv) - safeNum(tank.sl));
    }
    return Math.max(0, (productKind === 'lpg' ? safeNum(reading) : dipReadingToLiters(safeNum(reading))) + safeNum(tank.rv) - safeNum(tank.sl));
  }
  return balance;
}
/** Live revenue derived from actual sales records (auto-created when pump
 *  reports are approved, plus any manual entries). Replaces the static
 *  `branch.rev` field which is never updated by operations. */
export function salesRevenueByBranch(sales: SalesEntry[]): { total: number; byBranch: Record<string, number> } {
  const byBranch: Record<string, number> = {};
  let total = 0;
  for (const e of sales) {
    const amt = safeNum(e.L) * safeNum(e.price);
    if (!Number.isFinite(amt)) continue;
    total += amt;
    if (e.branchId) byBranch[e.branchId] = (byBranch[e.branchId] || 0) + amt;
  }
  return { total, byBranch };
}

export interface MgrPermissions {
  canDip: boolean; canSales: boolean; canExpenses: boolean;
  canMaintenance: boolean; canBudget: boolean; canChat: boolean;
  canPetrolTanks: boolean; canLpgTanks: boolean;
}
export const DEFAULT_MGR_PERMS: MgrPermissions = {
  canDip: true, canSales: true, canExpenses: true,
  canMaintenance: true, canBudget: true, canChat: true,
  canPetrolTanks: true, canLpgTanks: true,
};

export type AccountStatus = 'pending' | 'pending_md' | 'pending_admin' | 'active' | 'suspended' | 'inactive' | 'rejected';
export interface UserAccount {
  id: number;
  empId?: string;
  empName: string;
  username: string;
  password: string;
  role: Role | null;
  branchId?: string | null;
  status: AccountStatus;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  jobTitle?: string;
  dept?: string;
  phoneNumber?: string;
  nin?: string;
  staffAddress?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  guarantorAddress?: string;
  employmentDocs?: string[];
  mdApprovedBy?: string;
  mdApprovedAt?: string;
  rejectionReason?: string;
  rejectedBy?: string;
  rejectedAt?: string;
}
export const MGR_BRANCH_NAMES: Record<string, string> = {
  HQ: 'HQ — Abuja CBD', B1: 'Maitama Branch', B2: 'Lugbe Branch',
};
export interface Department { id: string; name: string; icon: string; col: { bg: string; fg: string }; roles: string[]; sys: boolean; }
export type PriceProduct = 'PMS' | 'AGO' | 'DPK' | 'LPG' | 'LPG_Single' | 'LPG_Distributor' | 'Lube Oil';
export interface Prices {
  PMS: number; AGO: number; DPK: number; LPG: number;
  LPG_Single: number; LPG_Distributor: number; 'Lube Oil': number;
  /** Branch overrides take precedence over the network fallback prices. */
  branchPrices?: Record<string, Partial<Record<PriceProduct, number>>>;
}
export type FuelProduct = PriceProduct;
export const lpgPriceKey = (cat?: 'single' | 'distributor'): PriceProduct => cat === 'distributor' ? 'LPG_Distributor' : 'LPG_Single';
export const unitForProd = (p: string) => p === 'LPG' ? 'kg' : 'L';
export function getPriceForProduct(prices: Prices, prod: string, branchId?: string | null): number {
  const branchPrice = branchId ? prices.branchPrices?.[branchId]?.[prod as PriceProduct] : undefined;
  if (typeof branchPrice === 'number' && branchPrice > 0) return branchPrice;
  return typeof (prices as any)[prod] === 'number' ? (prices as any)[prod] : 0;
}
export const getPriceForPump = (pump: Pump, prices: Prices): number => {
  if (pump.prod === 'LPG') {
    return getPriceForProduct(prices, lpgPriceKey(pump.lpgCategory), pump.branchId)
      || getPriceForProduct(prices, 'LPG', pump.branchId);
  }
  return getPriceForProduct(prices, pump.prod, pump.branchId);
};
export interface PriceChange { id: number; prod: string; oldPrice: number; newPrice: number; by: string; dt: string; branchId?: string; reason?: string; }
export interface Message { id: number; from: string; to: string; type: 'txt' | 'req' | 'alert' | 'media' | 'call'; body: string; ts: string; createdAt?: string; read: boolean; archivedBy?: string[]; archiveState?: Record<string, { archived: boolean; updatedAt: string }>; req?: { product: string; qty: number; sup: string; reason: string }; alrt?: { title: string; pri: string; detail: string }; media?: { uri: string; name: string; mimeType: string; size?: number }; call?: { callId: string; kind: 'audio' | 'video'; roomUrl: string }; }
export type { AppNotification };
export interface Broadcast { id: number; from: Role; fromName: string; title: string; body: string; audience: string; audienceName: string; ts: string; }
export interface CallRecord { id: number; from: Role; fromName: string; to: Role; toName: string; ts: string; status: 'ended' | 'missed' | 'declined'; kind?: 'audio' | 'video'; duration?: string; }
export interface AuditEntry { id: number; action: string; user: string; detail: string; ts: string; }
export interface ShiftHandoverNote { id: number; body: string; by: string; ts: string; branchId?: string; }
export interface InventoryLogEntry {
  id: number;
  dipId: number;
  dt: string;
  approvedBy: string;
  tankId: string;
  tankName: string;
  product: string;
  opening: number;
  received: number;
  sold: number;
  expected: number;
  actual: number;
  discrepancy: number;
  branchId?: string;
}
export type StockLogStatus = 'balanced' | 'shortage' | 'excess' | 'awaiting_opening' | 'awaiting_dip';
export type StockLogOpeningSource = 'startup_seed' | 'previous_log' | 'previous_dip' | 'unavailable';
export interface StockLogEntry {
  id: string;
  branchId: string;
  product: StockProduct;
  businessDate: string;
  openingQuantity: number | null;
  delivered: number;
  sold: number;
  bookStock: number | null;
  tankDip: number | null;
  discrepancy: number | null;
  unit: 'L' | 'kg';
  status: StockLogStatus;
  openingSource?: StockLogOpeningSource;
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}
export interface CompanyInfo {
  name: string; rcNumber: string; tin: string; address: string;
  phone: string; email: string; website: string;
  vatRate: string; citaRate: string; currency: string; fiscalYearStart: string;
  lowStockAlert: string; reorderLevel: string;
  dailyDipRequired: boolean; autoAuditLogging: boolean;
}
export const BLANK_COMPANY_INFO: CompanyInfo = {
  name: '', rcNumber: '', tin: '', address: '',
  phone: '', email: '', website: '',
  vatRate: '7.5', citaRate: '30', currency: 'NGN', fiscalYearStart: 'January',
  lowStockAlert: '20', reorderLevel: '30',
  dailyDipRequired: true, autoAuditLogging: true,
};
export interface CompanyFile { id: number; name: string; cat: string; by: string; dt: string; size: string; fileType: 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'img' | 'mp4' | 'audio' | 'zip' | 'other'; }
export type MyFolderSection = 'compliance' | 'legal' | 'minutes' | 'projects' | 'correspondences' | 'general';
export interface MyFolder {
  id: number; section: MyFolderSection; name: string; createdBy: string; createdAt: string;
}
export interface MyFolderFile {
  id: number; section: MyFolderSection; folderId: number | null; name: string;
  objectPath?: string; mimeType: string; size: number;
  uploadedBy: string; uploadedAt: string; deletedAt?: string;
  documentKind?: 'certificate' | 'document';
  expiresAt?: string;
  expiryReminderSentAt?: string;
}
export type TaskStatus = 'commenced' | 'progressing' | 'completed';
export type TaskPriority = 'High' | 'Medium' | 'Low';
export type TaskCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly';
export interface Task { id: number; title: string; desc: string; assignedBy: Role; assignedByName: string; assignedTo: Role; assignedToName: string; status: TaskStatus; priority: TaskPriority; cadence: TaskCadence; target?: string; targetUnit?: string; dueDate: string; createdAt: string; }
export interface KPI { id: number; title: string; target: string; unit: string; period: string; assignedTo: Role; assignedToName: string; createdAt: string; }
export interface DeliveryEvidence { id: number; delivId: number; type: 'photo' | 'video' | 'document'; name: string; dt: string; by: string; uri?: string; mimeType?: string; size?: number; }
export type PumpReportStatus = 'pending_manager' | 'pending_accountant' | 'returned' | 'returned_attendant' | 'approved';
export interface PumpDailyReport {
  id: number;
  date: string;
  pumpId: string;
  pumpName: string;
  product: string;
  branchId: string;
  openingMeter: number;
  closingMeter: number;
  liters: number;
  unitPrice: number;
  grossAmount: number;
  posAmount: number;
  cashAmount: number;
  transferAmount: number;
  creditAmount: number;
  totalCollected: number;
  variance: number;
  note: string;
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  status: PumpReportStatus;
  mgrNote?: string;
  mgrBy?: string;
  mgrAt?: string;
  accNote?: string;
  accBy?: string;
  accAt?: string;
  rejectionReason?: string;
  dateCorrectedFrom?: string;
  dateCorrectedBy?: string;
  dateCorrectedAt?: string;
  adminReturnNote?: string;
  adminReturnedBy?: string;
  adminReturnedAt?: string;
}

/** Timestamp of the latest completed workflow step for meter carry-forward. */
export function getPumpReportWorkflowAt(
  report: Pick<PumpDailyReport, 'submittedAt' | 'mgrAt' | 'accAt'>,
): string {
  return report.accAt ?? report.mgrAt ?? report.submittedAt;
}

export interface StockBookCalculation {
  startupStock: number | null;
  delivered: number;
  sold: number;
  bookStock: number | null;
}

export interface DailyStockLogBalance {
  bookStock: number | null;
  variance: number | null;
}

/**
 * Expected stock is opening + same-day deliveries - prior-day approved sales.
 * Variance is physical tank stock minus expected stock, so positive values are
 * excess and negative values are shortage.
 */
export function calculateDailyStockLogBalance(
  openingQuantity: number | null,
  delivered: number,
  sold: number,
  tankDip: number | null,
): DailyStockLogBalance {
  const bookStock = openingQuantity === null
    ? null
    : openingQuantity + safeNum(delivered) - safeNum(sold);
  const physicalStock = tankDip === null || !Number.isFinite(tankDip) ? null : tankDip;
  return {
    bookStock,
    variance: bookStock === null || physicalStock === null ? null : physicalStock - bookStock,
  };
}

/**
 * Shift reports can be submitted more than once for the same meter interval.
 * Count the meter-range union instead of summing every report, while retaining
 * the report litres value as a fallback for legacy records with bad meters.
 */
function sumUniquePumpReportVolumes(reports: PumpDailyReport[]): number {
  const intervalsByPump = new Map<string, { start: number; end: number }[]>();
  let fallbackVolume = 0;

  for (const report of reports) {
    const meterValue = (value: unknown) => isMissingNum(value) ? NaN : Number(value);
    const start = meterValue(report.openingMeter);
    const end = meterValue(report.closingMeter);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      const key = `${report.pumpId}|${report.product}`;
      const intervals = intervalsByPump.get(key) ?? [];
      intervals.push({ start, end });
      intervalsByPump.set(key, intervals);
    } else {
      fallbackVolume += safeNum(report.liters);
    }
  }

  let uniqueVolume = fallbackVolume;
  for (const intervals of intervalsByPump.values()) {
    intervals.sort((a, b) => a.start - b.start || a.end - b.end);
    let rangeStart: number | null = null;
    let rangeEnd: number | null = null;

    for (const interval of intervals) {
      if (rangeStart === null || rangeEnd === null) {
        rangeStart = interval.start;
        rangeEnd = interval.end;
        continue;
      }
      if (interval.start > rangeEnd) {
        uniqueVolume += rangeEnd - rangeStart;
        rangeStart = interval.start;
        rangeEnd = interval.end;
      } else {
        rangeEnd = Math.max(rangeEnd, interval.end);
      }
    }

    if (rangeStart !== null && rangeEnd !== null) {
      uniqueVolume += rangeEnd - rangeStart;
    }
  }

  return Number(uniqueVolume.toFixed(4));
}

function stockProductFromDelivery(product: string): StockProduct | null {
  if (product === 'LPG' || product === 'LPG_Single' || product === 'LPG_Distributor') return 'LPG';
  if (product === 'PMS' || product === 'AGO' || product === 'DPK' || product === 'Lube Oil') return product;
  return null;
}

export function businessDateKey(value?: string): string {
  return value?.slice(0, 10) ?? '';
}

export function startupStockSeedDate(stock?: Pick<StartupStock, 'setAt' | 'seedDate'>): string {
  return stock?.seedDate ?? businessDateKey(stock?.setAt);
}

export function currentBusinessDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function useBusinessDateKey(): string {
  const [dateKey, setDateKey] = useState(() => currentBusinessDateKey());

  useEffect(() => {
    const refresh = () => {
      const nextDateKey = currentBusinessDateKey();
      setDateKey(previousDateKey => previousDateKey === nextDateKey ? previousDateKey : nextDateKey);
    };
    const timer = setInterval(refresh, 60_000);
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      appStateSubscription.remove();
    };
  }, []);

  return dateKey;
}

export function previousBusinessDateKey(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function calendarMonthBusinessDateRange(anchor = new Date()): { from: string; to: string } {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  return {
    from: `${year}-${String(month + 1).padStart(2, '0')}-01`,
    to: `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`,
  };
}

export function isRevenueReportStatus(status: PumpReportStatus): boolean {
  return status === 'pending_accountant' || status === 'approved';
}

export function calculateBusinessMonthRevenue(
  reports: PumpDailyReport[],
  scopedBranchId: string | null,
  range = calendarMonthBusinessDateRange(),
): number {
  return Math.round(reports
    .filter(report => {
      const businessDate = businessDateKey(report.date);
      return (
        isRevenueReportStatus(report.status) &&
        businessDate >= range.from &&
        businessDate <= range.to &&
        (!scopedBranchId || report.branchId === scopedBranchId || !report.branchId)
      );
    })
    .reduce((sum, report) => sum + safeNum(report.grossAmount), 0));
}

function recordBusinessDate(value?: string): string {
  return businessDateKey(value);
}

function timestampMs(value?: string): number {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferLegacyBranchId(assetName: string, branches: Branch[]): string | undefined {
  const name = assetName.toLowerCase();
  const findBranch = (pattern: RegExp) => branches.find(branch => pattern.test(branch.name.toLowerCase()))?.id;

  if (name.includes('ikot') || name.includes('ekpene')) {
    return findBranch(/ikot|ekpene/);
  }
  if (name.includes('ring road')) {
    return findBranch(/ring road/);
  }
  if (name.includes('uyo') && name.includes('gas')) {
    return findBranch(/uyo.*gas|gas.*uyo/);
  }
  return undefined;
}

/**
 * Returns the latest validated closing meter for a pump.
 *
 * Business date is authoritative for rollover. Workflow timestamps are only a
 * tie-breaker because an older report can be approved after a newer report.
 */
export function getLatestValidatedPumpReport(
  reports: PumpDailyReport[],
  pumpId: string,
): PumpDailyReport | undefined {
  return reports
    .filter(report =>
      report.pumpId === pumpId &&
      (report.status === 'approved' || report.status === 'pending_accountant'),
    )
    .sort((a, b) =>
      recordBusinessDate(b.date).localeCompare(recordBusinessDate(a.date))
      || timestampMs(getPumpReportWorkflowAt(b)) - timestampMs(getPumpReportWorkflowAt(a))
      || b.id - a.id
    )[0];
}

/**
 * Calculates one business day's branch/product stock snapshot. The admin seed
 * is used only on its own business date. On later dates, callers pass a
 * previous stock-log book balance (or a previous tank dip when no log exists)
 * as the opening quantity. Delivered and sold values are intentionally
 * date-specific rather than cumulative, unless includeHistoricalEvents is set.
 */
export function calculateStockBook(
  startupStock: StartupStock | undefined,
  product: StockProduct,
  branchId: string | null,
  deliveries: Delivery[],
  reports: PumpDailyReport[],
  asOfDate: string,
  pumps: Pick<Pump, 'id' | 'branchId'>[] = [],
  openingStockOverride?: number | null,
  includeHistoricalEvents = false,
): StockBookCalculation {
  if (branchId === null || (startupStock && startupStock.branchId !== branchId)) {
    return { startupStock: null, delivered: 0, sold: 0, bookStock: null };
  }

  const seedAt = startupStock ? timestampMs(startupStock.setAt) : 0;
  const seedDate = startupStock ? startupStockSeedDate(startupStock) : '';
  const hasExplicitSeedDate = Boolean(startupStock?.seedDate);
  const isAfterSeed = (eventAt: string | undefined, businessDate: string) => {
    // An explicit business seed date is authoritative. Approval/submission
    // timestamps may be later or earlier than the day the baseline applies.
    if (hasExplicitSeedDate) return businessDate >= seedDate;
    const eventAtMs = timestampMs(eventAt);
    if (seedAt > 0 && eventAtMs > 0) return eventAtMs >= seedAt;
    return !seedDate || businessDate >= seedDate;
  };
  const isInSeedWindow = (businessDate: string, eventAt: string | undefined) =>
    startupStock
      ? Boolean(businessDate) &&
        businessDate >= seedDate &&
        businessDate <= asOfDate &&
        isAfterSeed(eventAt, businessDate)
      : businessDate === asOfDate;

  const liveDeliveriesById = new Map<number, Delivery>();
  deliveries
    .filter(delivery =>
      delivery.branchId === branchId &&
      stockProductFromDelivery(delivery.prod) === product &&
      delivery.approvalStatus !== 'draft' &&
      delivery.approvalStatus !== 'rejected',
    )
    .forEach(delivery => liveDeliveriesById.set(delivery.id, delivery));

  const liveReportsById = new Map<number, PumpDailyReport>();
  reports
    .filter(report =>
      (report.branchId || pumps.find(pump => pump.id === report.pumpId)?.branchId) === branchId &&
      report.product === product &&
      // Reports withdrawn for correction (rejected or sent back to the
      // attendant) must not count as sold stock until re-submitted.
      report.status !== 'returned' &&
      report.status !== 'returned_attendant',
    )
    .forEach(report => liveReportsById.set(report.id, report));

  let delivered = 0;
  let sold = 0;

  for (const delivery of liveDeliveriesById.values()) {
    const businessDate = recordBusinessDate(delivery.dt);
    const eventAt = delivery.approvedAt ?? delivery.mdAt ?? delivery.accAt ?? delivery.submittedAt ?? delivery.dt;
    if (!isInSeedWindow(businessDate, eventAt)) continue;
    if (includeHistoricalEvents || businessDate === asOfDate) delivered += safeNum(delivery.rec);
  }

  const eligibleReportsByDate = new Map<string, PumpDailyReport[]>();
  for (const report of liveReportsById.values()) {
    // The applied/business date on the shift report is authoritative. Workflow
    // timestamps only determine whether the report was submitted after the
    // admin seed; they must never replace or shift the report's business date.
    const businessDate = recordBusinessDate(report.date);
    if (!businessDate) continue;
    if (!isInSeedWindow(businessDate, getPumpReportWorkflowAt(report))) continue;
    const reportsForDate = eligibleReportsByDate.get(businessDate) ?? [];
    reportsForDate.push(report);
    eligibleReportsByDate.set(businessDate, reportsForDate);
  }

  for (const [businessDate, reportsForDate] of eligibleReportsByDate) {
    if (includeHistoricalEvents || businessDate === asOfDate) {
      sold += sumUniquePumpReportVolumes(reportsForDate);
    }
  }

  const openingStock = startupStock && (asOfDate === seedDate || includeHistoricalEvents)
    ? startupStock.quantity
    : openingStockOverride ?? null;
  return {
    startupStock: openingStock,
    delivered,
    sold,
    bookStock: openingStock === null ? null : openingStock + delivered - sold,
  };
}

/**
 * Calculates the operational stock position for business date D. Both the
 * Home Stock Snapshot and Daily Stock Log must call this helper so their day
 * boundaries cannot drift apart: deliveries belong to D; approved shift sales
 * belong to D−1.
 */
export function calculateDailyOperationalStock(
  openingStock: number | null,
  product: StockProduct,
  branchId: string | null,
  deliveries: Delivery[],
  reports: PumpDailyReport[],
  businessDate: string,
  pumps: Pick<Pump, 'id' | 'branchId'>[] = [],
): StockBookCalculation {
  const deliveryResult = calculateStockBook(
    undefined,
    product,
    branchId,
    deliveries,
    [],
    businessDate,
    pumps,
  );
  const salesResult = calculateStockBook(
    undefined,
    product,
    branchId,
    [],
    reports.filter(report => report.status === 'approved'),
    previousBusinessDateKey(businessDate),
    pumps,
  );

  return {
    startupStock: openingStock,
    delivered: deliveryResult.delivered,
    sold: salesResult.sold,
    bookStock: openingStock === null
      ? null
      : openingStock + deliveryResult.delivered - salesResult.sold,
  };
}

const PUMP_REPORT_STATUS_RANK: Record<string, number> = {
  pending_manager: 1,
  returned: 2,
  returned_attendant: 3,
  pending_accountant: 4,
  approved: 5,
};

const DIP_STATUS_RANK: Record<DipRecord['status'], number> = {
  pending: 1,
  rejected: 2,
  approved: 3,
};

function pumpReportActivityMs(report: PumpDailyReport): number {
  const timestamps = [report.submittedAt, report.mgrAt, report.accAt, report.dateCorrectedAt]
    .map(value => Date.parse(value ?? ''))
    .filter(value => Number.isFinite(value));
  return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

function mergePumpDailyReports(current: PumpDailyReport[], incoming: PumpDailyReport[]): PumpDailyReport[] {
  const merged = new Map<number, PumpDailyReport>();

  const add = (report: PumpDailyReport) => {
    const existing = merged.get(report.id);
    if (!existing) {
      merged.set(report.id, report);
      return;
    }

    const currentActivity = pumpReportActivityMs(existing);
    const incomingActivity = pumpReportActivityMs(report);
    const currentRank = PUMP_REPORT_STATUS_RANK[existing.status] ?? 0;
    const incomingRank = PUMP_REPORT_STATUS_RANK[report.status] ?? 0;

    if (
      incomingActivity > currentActivity ||
      (incomingActivity === currentActivity && incomingRank >= currentRank)
    ) {
      merged.set(report.id, report);
    }
  };

  current.forEach(add);
  incoming.forEach(add);
  return Array.from(merged.values());
}

function dipActivityMs(dip: DipRecord): number {
  return Math.max(
    Date.parse(dip.submittedAt ?? ''),
    Date.parse(dip.approvedDt ?? ''),
    0,
  );
}

export function mergeDipRecords(current: DipRecord[], incoming: DipRecord[]): DipRecord[] {
  const merged = new Map<number, DipRecord>();

  const add = (dip: DipRecord) => {
    const existing = merged.get(dip.id);
    if (!existing) {
      merged.set(dip.id, dip);
      return;
    }

    const currentRank = DIP_STATUS_RANK[existing.status] ?? 0;
    const incomingRank = DIP_STATUS_RANK[dip.status] ?? 0;
    if (
      incomingRank > currentRank ||
      (incomingRank === currentRank && dipActivityMs(dip) >= dipActivityMs(existing))
    ) {
      merged.set(dip.id, dip);
    }
  };

  current.forEach(add);
  incoming.forEach(add);
  return Array.from(merged.values());
}

export type HRDocType = 'biodata' | 'contract' | 'guarantor' | 'nin' | 'passport_photo' | 'certificate' | 'nysc' | 'medical' | 'reference' | 'bank_details' | 'tin' | 'pension';
export type HRDocStatus = 'pending' | 'submitted' | 'approved' | 'n/a';
export interface HRDoc { type: HRDocType; status: HRDocStatus; date?: string; note?: string; fileName?: string; }
export interface HREmployeeDoc { id: number; name: string; fileType: string; cat: string; uploadedBy: string; dt: string; approved: boolean; approvedBy?: string; approvedAt?: string; uri?: string; mimeType?: string; size?: number; }
export type OnboardingStatus = 'draft' | 'forwarded' | 'md_approved' | 'ceo_approved';
export interface OnboardingApproval { status: OnboardingStatus; forwardedAt?: string; forwardedBy?: string; mdApprovedBy?: string; mdApprovedAt?: string; ceoApprovedBy?: string; ceoApprovedAt?: string; }
export interface GeneratedLetter { id: number; type: 'appointment' | 'promotion'; title: string; content: string; generatedAt: string; generatedBy: string; newRole?: string; }
export interface HRRecommendation { id: number; empId: number; empName: string; type: 'suspend' | 'deactivate' | 'delete'; reason: string; by: string; dt: string; status: 'pending' | 'approved' | 'rejected'; resolvedBy?: string; resolvedAt?: string; }
export interface HREmployee { id: number; empId: string; serial: number; name: string; role: string; dept: string; phone: string; email: string; address: string; dob: string; joinDate: string; nextOfKin: string; status: 'active' | 'suspended' | 'inactive'; docs: HRDoc[]; uploads: HREmployeeDoc[]; onboarding: OnboardingApproval; letters: GeneratedLetter[]; }

export interface CorpAttachment {
  id: number; name: string; fileType: string; size: string;
  uploadedBy: string; uploadedAt: string;
  objectPath?: string; mimeType?: string;
}
export type CorpApprovalStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export interface CorpApproval {
  status: CorpApprovalStatus;
  submittedBy?: string; submittedAt?: string; submittedTo?: string;
  reviewedBy?: string; reviewedAt?: string; rejectionReason?: string;
}
export type CorpRecordType = 'legal' | 'project' | 'minutes';

export interface LegalMatter {
  id: number; title: string;
  type: 'Contract' | 'Dispute' | 'Regulatory' | 'Advisory' | 'Other';
  status: 'Active' | 'Pending' | 'Resolved' | 'Closed';
  party: string; openedAt: string; priority: 'High' | 'Medium' | 'Low'; notes: string;
  approval: CorpApproval; attachments: CorpAttachment[];
}
export interface CorpProject {
  id: number; title: string; description: string;
  status: 'Planning' | 'Active' | 'On Hold' | 'Completed' | 'Cancelled';
  lead: string; startDate: string; dueDate: string; progress: number;
  approval: CorpApproval; attachments: CorpAttachment[];
}
export interface MeetingMinutes {
  id: number; title: string; date: string; venue: string;
  attendees: string; summary: string; by: string;
  approval: CorpApproval; attachments: CorpAttachment[];
  shared?: boolean; sharedAt?: string; sharedBy?: string;
}

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator', ceo: 'Chief Executive Officer', md: 'Managing Director',
  mktg: 'Marketing Manager', csm: 'Corp. Services Mgr', acc: 'Accountant',
  mgr: 'Station Manager', att: 'Pump Attendant',
};

export const ROLE_COLORS: Record<string, string> = {
  admin: '#0C1E14', ceo: '#0D5C2E', md: '#4C1D95', mktg: '#B45309',
  csm: '#0D6E56', acc: '#1E3A8A', mgr: '#1D5FA5', att: '#374151',
};

// Sensitive My Folder sections are limited to approved corporate roles.
// General Library is visible to all signed-in users.
export const MY_FOLDER_ALLOWED_ROLES: Role[] = ['admin', 'acc', 'mktg', 'csm', 'md', 'ceo'];

export const TASK_CAN_ASSIGN: Record<string, Role[]> = {
  ceo:   ['md', 'mktg', 'csm', 'acc', 'mgr', 'att'],
  md:    [],
  csm:   [],
  acc:   [],
  mgr:   [],
  mktg:  [],
  att:   [],
  admin: [],
};

export const UINFO: Record<string, UserInfo> = {
  admin: { name: 'System Admin', color: '#0a2318', initials: 'SA', role: 'Admin', online: true },
  ceo: { name: 'CEO', color: '#1a6e3c', initials: 'CE', role: 'CEO', online: true },
  md: { name: 'MD', color: '#4527a0', initials: 'MD', role: 'MD', online: true },
  mktg: { name: 'Marketing', color: '#D85A30', initials: 'MK', role: 'Mktg', online: false },
  csm: { name: 'CSM', color: '#0F6E56', initials: 'CS', role: 'CSM', online: true },
  acc: { name: 'Accountant', color: '#185FA5', initials: 'AC', role: 'Acct', online: true },
  mgr: { name: 'Manager', color: '#BA7517', initials: 'MG', role: 'Mgr', online: true },
  att: { name: 'Attendant', color: '#633806', initials: 'AT', role: 'Att', online: true },
};

/** Resolve a real display name + initials for any role, using live userAccounts first. */
export function resolveUserInfo(
  role: string,
  accounts: UserAccount[],
): { name: string; initials: string; color: string } {
  const acc = accounts.find(a => a.role === role && a.status === 'active');
  const base = UINFO[role];
  const name = acc?.empName || base?.name || role;
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || role.slice(0, 2).toUpperCase();
  const color = base?.color || ROLE_COLORS[role] || '#1a6e3c';
  return { name, initials, color };
}

// Admin-only nav (system management panels not shown to other roles)
export const NAVDEF: Record<string, NavItem[]> = {
  admin: [
    { id: 'home',     icon: 'shield-checkmark', label: 'Admin'    },
    { id: 'users',    icon: 'people',           label: 'Users'    },
    { id: 'depts',    icon: 'grid',             label: 'Depts'    },
    { id: 'branches', icon: 'business',         label: 'Branches' },
    { id: 'audit',    icon: 'list',             label: 'Audit'    },
    { id: 'exprpt',   icon: 'analytics',        label: 'Reports'  },
    { id: 'settings', icon: 'settings',         label: 'Settings' },
  ],
};

// All panels available to every non-admin user.
// Admin toggles which of these each role/user can actually see via Access Control.
export const FULL_NAV_CATALOG: NavItem[] = [
  { id: 'home',     icon: 'home',             label: 'Home'       },
  { id: 'revenue',  icon: 'cash',              label: 'Total Revenue' },
  { id: 'ops',      icon: 'construct',        label: 'Operations' },
  { id: 'tasks',    icon: 'checkmark-circle', label: 'Tasks'      },
  { id: 'hr',       icon: 'people-circle',    label: 'HR'         },
  { id: 'acct',     icon: 'calculator',       label: 'Accounts'   },
  { id: 'mktg',     icon: 'megaphone',        label: 'Marketing'  },
  { id: 'prices',   icon: 'pricetag',         label: 'Prices'     },
  { id: 'branches', icon: 'business',         label: 'Branches'   },
  { id: 'budget',   icon: 'wallet',           label: 'Budget'     },
  { id: 'exprpt',   icon: 'analytics',        label: 'Reports'    },
  { id: 'sales',    icon: 'bar-chart',        label: 'Sales'      },
  { id: 'exp',      icon: 'receipt',          label: 'Expenses'   },
  { id: 'recv',     icon: 'cube',             label: 'Receiving'  },
  { id: 'shift',    icon: 'speedometer',      label: 'Shift Report' },
  { id: 'corp',     icon: 'folder',            label: 'My Documents'  },
  { id: 'comms',    icon: 'chatbubbles',      label: 'Comms'      },
];

const INIT_MGR_PERMS: Record<string, MgrPermissions> = {};

// Used by the Access Control screen in system-settings to enumerate panels per role.
// All non-admin roles share the same full catalog; admin controls visibility per role/user.
export const ROLE_FULL_NAV: Record<string, NavItem[]> = {
  admin: NAVDEF.admin,
  ceo: FULL_NAV_CATALOG,
  md:  FULL_NAV_CATALOG,
  acc: FULL_NAV_CATALOG,
  csm: FULL_NAV_CATALOG,
  mktg:FULL_NAV_CATALOG,
  mgr: FULL_NAV_CATALOG,
  att: FULL_NAV_CATALOG,
};

// These roles receive the complete operational overview. This intentionally
// excludes admin-only system management panels (users, settings, audit).
export const GLOBAL_OVERVIEW_ROLES = new Set(['ceo', 'md', 'acc', 'csm']);

// Reports are opt-in for non-admin users. Admin grants the module by role or
// by individual user through System Settings > Access Control.
const REPORT_ACCESS_POLICY_VERSION = 1;

function readReportAccessPolicyVersion(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'version' in value) {
    const version = (value as { version?: unknown }).version;
    return typeof version === 'number' && Number.isFinite(version) ? version : 0;
  }
  return 0;
}

function defaultRoleAccess(): Record<string, Record<string, boolean>> {
  const result: Record<string, Record<string, boolean>> = {};
  const roles = ['ceo','md','acc','csm','mktg','mgr','att'];
  for (const r of roles) {
    result[r] = Object.fromEntries(FULL_NAV_CATALOG.map(i => [i.id, i.id !== 'exprpt']));
  }
  return result;
}

export const SCREEN_ROUTES: Record<string, string> = {
  home: '/(app)/home', users: '/(app)/users', depts: '/(app)/departments',
  audit: '/(app)/audit', settings: '/(app)/system-settings', ops: '/(app)/operations',
  tanks: '/(app)/tanks', acct: '/(app)/accounts', corp: '/(app)/corporate',
  branches: '/(app)/branches', maint: '/(app)/maintenance', sales: '/(app)/sales',
  budget: '/(app)/budget', exp: '/(app)/expenses',
  exprpt: '/(app)/reports', mktg: '/(app)/marketing', shift: '/(app)/shift',
  tasks: '/(app)/tasks',
  recv: '/(app)/receiving',
  hr: '/(app)/hr',
  prices: '/(app)/prices',
  comms: '/(app)/comms',
  jobs: '/(app)/jobs',
  messages: '/(app)/messages',
  notifications: '/(app)/notifications',
  profile: '/(app)/profile',
};

export function chatKey(a: string, b: string) { return [a, b].sort().join('-'); }
export function messageActivityMs(message: Pick<Message, 'id' | 'createdAt'>): number {
  const timestamp = Date.parse(message.createdAt ?? '');
  return Number.isFinite(timestamp) ? timestamp : Number(message.id) || 0;
}
function mergeArchiveState(
  serverState?: Message['archiveState'],
  localState?: Message['archiveState'],
): Message['archiveState'] | undefined {
  const entries = new Map<string, { archived: boolean; updatedAt: string }>();
  for (const state of [serverState, localState]) {
    for (const [user, value] of Object.entries(state || {})) {
      const current = entries.get(user);
      if (!current || Date.parse(value.updatedAt) >= Date.parse(current.updatedAt)) entries.set(user, value);
    }
  }
  return entries.size > 0 ? Object.fromEntries(entries) : undefined;
}
/** Petrol dip readings are entered as litres; LPG readings are entered as kg. */
export function dipReadingToLiters(reading: number) {
  if (!Number.isFinite(reading) || reading <= 0) return 0;
  return Math.round(reading * 100) / 100;
}
export function pctToKg(lpg: LPGTank, pct: number) { return Math.round((pct / 100) * lpg.cap); }
export function fmt(n: number) { return '₦' + n.toLocaleString(); }
export function fmtDate(dt: string) {
  try { const d = new Date(dt); return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return dt; }
}
export function fmtDateTime(dt: string) {
  try { const d = new Date(dt); return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }); } catch { return dt; }
}
function genId() { return Date.now() + Math.floor(Math.random() * 10000); }
const MAX_AUDIT_ENTRIES = 500; // cap audit trail so sync payloads stay small
function nowTs() { return new Date().toISOString(); }
function generateEmpId(existing: UserAccount[]): string {
  const now = new Date();
  const prefix = `GS-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const sameMonth = existing.filter(a => a.empId?.startsWith(prefix));
  return `${prefix}-${String(sameMonth.length + 1).padStart(3, '0')}`;
}

function apiRowToUserAccount(r: StaffUserRecord): UserAccount {
  return {
    id:               r.id,
    empName:          r.empName,
    empId:            r.empId            ?? undefined,
    username:         r.username         ?? '',
    password:         '',
    role:             (r.role as Role)   ?? null,
    branchId:         r.branchId         ?? undefined,
    status:           (r.status          as AccountStatus),
    createdBy:        r.createdBy,
    createdAt:        r.createdAt,
    approvedBy:       r.approvedBy       ?? undefined,
    approvedAt:       r.approvedAt       ?? undefined,
    jobTitle:         r.jobTitle         ?? undefined,
    dept:             r.dept             ?? undefined,
    phoneNumber:      r.phoneNumber      ?? undefined,
    nin:              r.nin              ?? undefined,
    staffAddress:     r.staffAddress     ?? undefined,
    guarantorName:    r.guarantorName    ?? undefined,
    guarantorPhone:   r.guarantorPhone   ?? undefined,
    guarantorAddress: r.guarantorAddress ?? undefined,
    employmentDocs:   r.employmentDocs   ?? undefined,
    mdApprovedBy:     r.mdApprovedBy     ?? undefined,
    mdApprovedAt:     r.mdApprovedAt     ?? undefined,
    rejectionReason:  r.rejectionReason  ?? undefined,
    rejectedBy:       r.rejectedBy       ?? undefined,
    rejectedAt:       r.rejectedAt       ?? undefined,
  };
}
function nowTime() { return new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }); }

const INIT_PUMPS: Pump[] = [];
const INIT_TANKS: Tank[] = [];
const INIT_LPG: LPGTank[] = [];
const INIT_DIPS: DipRecord[] = [];
const INIT_RECS: Delivery[] = [];
const INIT_PRICE_HISTORY: PriceChange[] = [];
const INIT_MAINT: MaintenanceItem[] = [];
const INIT_SALES: SalesEntry[] = [];
const INIT_STAFF: Staff[] = [];
const INIT_BRANCHES: Branch[] = [];
const INIT_DOCS: ComplianceDoc[] = [];
const INIT_COMPANY_FILES: CompanyFile[] = [];
const INIT_DELIVERY_EVIDENCE: DeliveryEvidence[] = [];
const INIT_EXPENSES: Expense[] = [];
const INIT_BUDGETS: Budget[] = [];
const INIT_TASKS: Task[] = [];
const INIT_KPIS: KPI[] = [];
const INIT_AUDIT: AuditEntry[] = [];
const INIT_INVENTORY_LOG: InventoryLogEntry[] = [];
const INIT_STARTUP_STOCK: StartupStock[] = [];
const INIT_DEPTS: Department[] = [];
const INIT_MSGS: Record<string, Message[]> = {};

const INIT_USER_ACCOUNTS: UserAccount[] = [];

const ALL_HR_DOC_TYPES: HRDocType[] = ['biodata', 'contract', 'guarantor', 'nin', 'passport_photo', 'certificate', 'nysc', 'medical', 'reference', 'bank_details', 'tin', 'pension'];
function mkDocs(statuses: Partial<Record<HRDocType, HRDocStatus>> = {}, date?: string): HRDoc[] {
  return ALL_HR_DOC_TYPES.map(type => ({
    type,
    status: statuses[type] ?? 'pending',
    date: (statuses[type] && statuses[type] !== 'n/a' && statuses[type] !== 'pending') ? date : undefined,
  }));
}
const FULLY_APPROVED = { biodata: 'approved', contract: 'approved', guarantor: 'approved', nin: 'approved', passport_photo: 'approved', certificate: 'approved', nysc: 'approved', medical: 'approved', reference: 'approved', bank_details: 'approved', tin: 'approved', pension: 'approved' } as Partial<Record<HRDocType, HRDocStatus>>;
const CEO_ONBOARDED: OnboardingApproval = { status: 'ceo_approved', forwardedBy: 'System Admin', forwardedAt: '2020-01-01T00:00:00Z', mdApprovedBy: 'System Admin', mdApprovedAt: '2020-01-01T00:00:00Z', ceoApprovedBy: 'System Admin', ceoApprovedAt: '2020-01-01T00:00:00Z' };
const INIT_HR_EMPLOYEES: HREmployee[] = [];
const INIT_HR_RECOMMENDATIONS: HRRecommendation[] = [];
const INIT_HR_HANDBOOKS: HREmployeeDoc[] = [];
const INIT_LEGAL: LegalMatter[] = [];
const INIT_CORP_PROJECTS: CorpProject[] = [];
const INIT_MEETING_MINUTES: MeetingMinutes[] = [];
const INIT_FINANCIAL_ENTRY: FinancialEntry = {
  cashInBank: 0, posValue: 0, goodsOnTransit: 0, cashInHand: 0,
  debtsFromCustomers: 0, capitalInjection: 0, bankLoans: [], liabilities: 0,
  updatedBy: '', updatedAt: '',
};

interface AppContextType {
  companyInfo: CompanyInfo; updateCompanyInfo: (updates: Partial<CompanyInfo>) => void;
  role: Role | null; userName: string; branchId: string | null; staffId: number | null;
  isServerAuthenticated: boolean;
  navItems: NavItem[]; mgrPerms: Record<string, MgrPermissions>;
  login: (role: Role, name: string, staffId?: number, branchId?: string) => Promise<boolean>; logout: () => void;
  updateMgrPerms: (branchId: string, perms: Partial<MgrPermissions>) => void;
  prices: Prices; priceHistory: PriceChange[]; tanks: Tank[]; lpgTanks: LPGTank[]; pumps: Pump[];
  dips: DipRecord[]; deliveries: Delivery[]; maintenance: MaintenanceItem[];
  sales: SalesEntry[]; staff: Staff[]; branches: Branch[];
  marketCompetitors: MarketCompetitor[];
  addMarketCompetitor: (competitor: Omit<MarketCompetitor, 'id'>) => void;
  updateMarketCompetitor: (id: string, updates: Partial<Omit<MarketCompetitor, 'id'>>) => void;
  deleteMarketCompetitor: (id: string) => void;
  docs: ComplianceDoc[]; expenses: Expense[]; budgets: Budget[];
  financialEntry: FinancialEntry;
  updateFinancialEntry: (updates: Partial<Omit<FinancialEntry, 'updatedBy' | 'updatedAt'>>) => void;
  addBudget: (b: Omit<Budget, 'id' | 'workflow'>) => void;
  updateBudget: (id: number, updates: { items: { cat: string; amt: number }[]; total: number; month: number; year: number; label: string; appliesOn?: string }) => void;
  deleteBudget: (id: number) => void;
  submitBudgetToAcc: (id: number) => void;
  forwardBudget: (id: number, note: string) => void;
  approveBudget: (id: number, note: string) => void;
  rejectBudget: (id: number, note: string) => void;
  messages: Record<string, Message[]>; broadcasts: Broadcast[]; callLog: CallRecord[];
  notifications: AppNotification[];
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: number) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  addBroadcast: (b: Omit<Broadcast, 'id' | 'ts'>) => void;
  addCallRecord: (r: Omit<CallRecord, 'id' | 'ts'>) => void;
  audit: AuditEntry[]; departments: Department[];
  handoverNotes: ShiftHandoverNote[];
  addShiftHandoverNote: (body: string) => void;
  companyFiles: CompanyFile[]; deliveryEvidences: DeliveryEvidence[];
  myFolders: MyFolder[]; myFolderFiles: MyFolderFile[];
  addMyFolder: (section: MyFolderSection, name: string) => void;
  addMyFolderFile: (file: Omit<MyFolderFile, 'id' | 'uploadedAt'>) => void;
  removeMyFolderFile: (id: number) => void;
  replaceMyFolderFile: (id: number, file: Omit<MyFolderFile, 'id' | 'uploadedAt'>) => void;
  pumpDailyReports: PumpDailyReport[];
  pumpInitialMeters: Record<string, number>;
  pumpLockedMeters: Record<string, number>;
  inventoryLog: InventoryLogEntry[];
  stockLogs: StockLogEntry[];
  upsertStockLogs: (entries: Omit<StockLogEntry, 'id' | 'createdBy' | 'createdAt'>[]) => void;
  startupStocks: StartupStock[];
  addStartupStock: (stock: { product: StockProduct; quantity: number; branchId: string }) => void;
  updateStartupStock: (id: string, quantity: number) => void;
  deleteStartupStock: (id: string) => void;
  stockSnapshotConfig: StockSnapshotConfig;
  updateStockSnapshotMetric: (metric: StockSnapshotMetric, enabled: boolean) => void;
  updateStockSnapshotProduct: (branchId: string, product: StockProduct, enabled: boolean) => void;
  setPumpInitialMeter: (pumpId: string, meter: number) => void;
  lockPumpMeter: (pumpId: string, meter: number) => void;
  unlockPumpMeter: (pumpId: string) => void;
  resetOperationalData: () => Promise<void>;
  submitPumpReport: (r: Omit<PumpDailyReport, 'id' | 'status' | 'submittedAt'>) => void;
  mgrForwardPumpReport: (id: number, mgrNote: string) => void;
  accApprovePumpReport: (report: PumpDailyReport, accNote: string) => void;
  accRejectPumpReport: (id: number, rejectionReason: string) => void;
  mgrResubmitPumpReport: (id: number, mgrNote: string) => void;
  mgrReturnPumpReportToAttendant: (id: number, mgrNote: string) => void;
  attResubmitPumpReport: (id: number, note: string) => void;
  adminReturnApprovedPumpReport: (id: number, note: string) => boolean;
  deletePumpReport: (id: number) => Promise<boolean>;
  updatePumpReport: (id: number, updates: Partial<Omit<PumpDailyReport, 'id' | 'status' | 'submittedAt' | 'submittedBy' | 'submittedByName'>>) => void;
  correctApprovedPumpReportDate: (id: number, date: string) => boolean;
  updatePrice: (prod: string, price: number, by?: string, reason?: string, targetBranchId?: string) => PriceValidationResult;
  priceProposals: PriceProposal[];
  addPriceProposal: (prod: string, proposedPrice: number) => PriceValidationResult;
  approvePriceProposal: (id: number) => PriceValidationResult;
  updateAndApprovePriceProposal: (id: number, updatedPrice: number) => PriceValidationResult;
  rejectPriceProposal: (id: number, note?: string) => void;
  addTank: (t: Omit<Tank, 'id' | 'dip' | 'op' | 'rv' | 'sl'>) => void;
  addLpgTank: (t: Omit<LPGTank, 'id' | 'op' | 'rv' | 'sl'>) => void;
  addPump: (p: Omit<Pump, 'id'>) => Pump;
  updateTank: (id: string, updates: Partial<Pick<Tank, 'name' | 'cap' | 'prod' | 'dip' | 'branchId'>>) => void;
  updateLpgTank: (id: string, updates: Partial<Pick<LPGTank, 'name' | 'cap' | 'branchId'>>) => void;
  updatePump: (id: string, updates: Partial<Pick<Pump, 'name' | 'prod' | 'active' | 'branchId' | 'lpgCategory'>>) => void;
  updateStaff: (id: number, updates: Partial<Pick<Staff, 'name' | 'email' | 'sal' | 'dept' | 'branchId' | 'accountId'>>) => void;
  addExpense: (exp: Omit<Expense, 'id' | 'status' | 'submittedAt'>) => void;
  updateExpense: (id: number, updates: Partial<Pick<Expense, 'cat' | 'desc' | 'amt' | 'ref' | 'dt'>>) => void;
  deleteExpense: (id: number) => void;
  forwardExpenseToMD: (id: number, note?: string) => void;
  addCompanyFile: (file: Omit<CompanyFile, 'id' | 'dt'>) => void;
  addDeliveryEvidence: (ev: Omit<DeliveryEvidence, 'id' | 'dt'>) => void;
  addDip: (dip: Omit<DipRecord, 'id'>) => void;
  updateDip: (id: number, updates: Partial<Omit<DipRecord, 'id'>>) => void;
  deleteDip: (id: number) => void;
  approveDip: (id: number) => void;
  rejectDip: (id: number) => void;
  addDelivery: (rec: Omit<Delivery, 'id'>) => void;
  updateDelivery: (id: number, updates: Partial<Omit<Delivery, 'id'>>) => void;
  accRecallDelivery: (id: number) => void;
  deleteDelivery: (id: number) => void;
  submitDeliveryForApproval: (id: number) => void;
  accForwardToMd: (id: number, costPrice: number, accNote: string) => void;
  approveDelivery: (id: number, sellingPrice: number, mdNote?: string) => void;
  rejectDelivery: (id: number, note?: string) => void;
  addMaintenance: (item: { title: string; pri: MaintenanceItem['pri']; date: string }) => Promise<boolean>;
  acknowledgeMaintenance: (taskId: string) => Promise<boolean>;
  assignMaintenance: (taskId: string, username: string) => Promise<boolean>;
  updateMaintenanceStatus: (taskId: string, status: MaintenanceWorkflowStatus) => Promise<boolean>;
  addSales: (entry: Omit<SalesEntry, 'id'>) => void;
  updateSales: (id: number, updates: Partial<Pick<SalesEntry, 'pump' | 'L' | 'price' | 'pos' | 'dt'>>) => void;
  deleteSales: (id: number) => void;
  sendMessage: (toName: string, msg: Omit<Message, 'id' | 'from' | 'ts' | 'read'>) => void;
  addSystemNotification: (from: Role, msg: Omit<Message, 'id' | 'ts' | 'read'>) => void;
  markRead: (peerName: string) => void;
  archiveConversation: (peerName: string) => void;
  unarchiveConversation: (peerName: string) => void;
  approveExpense: (id: number) => void;
  rejectExpense: (id: number) => void;
  addStaff: (s: Omit<Staff, 'id'>) => number;
  toggleStaff: (id: number) => void;
  deleteStaff: (id: number) => Promise<boolean>;
  addBranch: (b: Omit<Branch, 'id'>) => Branch;
  updateBranch: (id: string, updates: Partial<Pick<Branch, 'st' | 'mgr' | 'name' | 'pumps' | 'tanks'>>) => void;
  deleteBranch: (id: string) => void;
  addAudit: (entry: Omit<AuditEntry, 'id' | 'ts'>) => void;
  deleteTank: (id: string) => void;
  deleteLpgTank: (id: string) => void;
  deletePump: (id: string) => void;
  addDepartment: (d: Omit<Department, 'id' | 'sys'>) => void;
  updateDepartment: (id: string, updates: Partial<Pick<Department, 'name' | 'icon' | 'col' | 'roles'>>) => void;
  deleteDepartment: (id: string) => void;
  assignStaffDept: (staffId: number, deptId: string | null) => void;
  userAccounts: UserAccount[];
  refreshUsers: () => Promise<void>;
  addUserAccount: (acc: Omit<UserAccount, 'id' | 'createdAt' | 'status' | 'username' | 'password' | 'role'>) => void;
  addActiveUserAccount: (acc: { empName: string; username: string; password: string; role: Role; branchId?: string | null; jobTitle?: string; dept?: string; phoneNumber?: string; createdBy: string }) => Promise<number | null>;
  updateUserAccount: (id: number, updates: { username?: string; password?: string; role?: Role; branchId?: string | null; phoneNumber?: string }, by: string) => Promise<void>;
  updateEnrollmentData: (id: number, data: { empName?: string; jobTitle?: string; dept?: string; phoneNumber?: string; nin?: string; staffAddress?: string; guarantorName?: string; guarantorPhone?: string; guarantorAddress?: string }, by: string) => Promise<boolean>;
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  enrollStaff: (acc: { empName: string; jobTitle?: string; dept?: string; branchId?: string; phoneNumber?: string; nin?: string; staffAddress?: string; guarantorName?: string; guarantorPhone?: string; guarantorAddress?: string; employmentDocs?: string[] }, by: string, initialStatus?: AccountStatus) => Promise<void>;
  mdApproveEnrollment: (id: number, by: string) => Promise<void>;
  mdRejectEnrollment: (id: number, by: string) => Promise<void>;
  approveUserAccount: (id: number, role: Role, username: string, password: string, by: string, branchId?: string | null) => Promise<void>;
  suspendUserAccount: (id: number) => Promise<void>;
  reactivateUserAccount: (id: number) => Promise<void>;
  rejectUserAccount: (id: number) => Promise<void>;
  rejectEnrollmentWithReason: (id: number, reason: string, by: string) => Promise<void>;
  resubmitEnrollment: (id: number, updates: { empName?: string; jobTitle?: string; dept?: string; phoneNumber?: string; nin?: string; staffAddress?: string; guarantorName?: string; guarantorPhone?: string; guarantorAddress?: string }, by: string) => Promise<boolean>;
  deleteUserAccount: (id: number) => Promise<boolean>;
  validateCredentials: (username: string, password: string) => Promise<UserAccount | null>;
  getConversation: (peerName: string) => Message[];
  unreadCount: () => number;
  tasks: Task[];
  kpis: KPI[];
  addTask: (t: Omit<Task, 'id' | 'createdAt'>) => void;
  updateTaskStatus: (id: number, status: TaskStatus) => void;
  deleteTask: (id: number) => void;
  addKpi: (k: Omit<KPI, 'id' | 'createdAt'>) => void;
  deleteKpi: (id: number) => void;
  hrEmployees: HREmployee[];
  hrRecommendations: HRRecommendation[];
  hrHandbooks: HREmployeeDoc[];
  addHREmployee: (e: Omit<HREmployee, 'id' | 'empId' | 'serial'>) => void;
  updateHRDocStatus: (empId: number, docType: HRDocType, status: HRDocStatus, note?: string) => void;
  removeHREmployee: (id: number) => void;
  uploadHRDocFile: (empId: number, docType: HRDocType, fileName: string, uri?: string, mimeType?: string, size?: number) => void;
  addHRUpload: (empId: number, doc: Omit<HREmployeeDoc, 'id' | 'dt' | 'approved'>) => void;
  approveHRUpload: (empId: number, docId: number, by: string) => void;
  addHRRecommendation: (rec: Omit<HRRecommendation, 'id' | 'dt' | 'status'>) => void;
  resolveHRRecommendation: (id: number, action: 'approved' | 'rejected', by: string) => void;
  addHRHandbook: (doc: Omit<HREmployeeDoc, 'id' | 'dt' | 'approved'>) => void;
  approveHRHandbook: (docId: number, by: string) => void;
  forwardOnboardingForApproval: (empId: number, by: string) => void;
  approveOnboarding: (empId: number, stage: 'md' | 'ceo', by: string) => void;
  addGeneratedLetter: (empId: number, letter: Omit<GeneratedLetter, 'id' | 'generatedAt'>) => void;
  legalMatters: LegalMatter[];
  corpProjects: CorpProject[];
  meetingMinutes: MeetingMinutes[];
  addLegalMatter: (m: Omit<LegalMatter, 'id' | 'openedAt' | 'approval' | 'attachments'>) => void;
  updateLegalMatter: (id: number, updates: Partial<Omit<LegalMatter, 'id' | 'openedAt' | 'approval' | 'attachments'>>) => void;
  updateLegalStatus: (id: number, status: LegalMatter['status']) => void;
  deleteLegalMatter: (id: number) => void;
  addCorpProject: (p: Omit<CorpProject, 'id' | 'approval' | 'attachments'>) => void;
  updateCorpProject: (id: number, updates: Partial<Omit<CorpProject, 'id' | 'approval' | 'attachments'>>) => void;
  updateProjectProgress: (id: number, progress: number, status: CorpProject['status']) => void;
  deleteCorpProject: (id: number) => void;
  addMeetingMinutes: (m: Omit<MeetingMinutes, 'id' | 'approval' | 'attachments'>) => void;
  updateMeetingMinutes: (id: number, updates: Partial<Omit<MeetingMinutes, 'id' | 'approval' | 'attachments'>>) => void;
  deleteMeetingMinutes: (id: number) => void;
  addCorpAttachment: (type: CorpRecordType, id: number, att: Omit<CorpAttachment, 'id' | 'uploadedAt'>) => void;
  removeCorpAttachment: (type: CorpRecordType, id: number, attId: number) => void;
  submitCorpItem: (type: CorpRecordType, id: number, submittedTo: string) => void;
  approveCorpItem: (type: CorpRecordType, id: number) => void;
  rejectCorpItem: (type: CorpRecordType, id: number, reason: string) => void;
  roleAccess: Record<string, Record<string, boolean>>;
  updateRoleAccess: (role: string, moduleId: string, enabled: boolean) => void;
  userAccess: Record<number, Record<string, boolean>>;
  updateUserAccess: (staffId: number, moduleId: string, enabled: boolean) => void;
  clearUserAccess: (staffId: number) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(BLANK_COMPANY_INFO);
  const updateCompanyInfo = useCallback((updates: Partial<CompanyInfo>) => {
    setCompanyInfo(prev => ({ ...prev, ...updates }));
  }, []);

  const [role, setRole] = useState<Role | null>(null);
  const [userName, setUserName] = useState('');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [isServerAuthenticated, setIsServerAuthenticated] = useState(false);
  const [mgrPerms, setMgrPerms] = useState<Record<string, MgrPermissions>>(INIT_MGR_PERMS);
  const [roleAccess, setRoleAccess] = useState<Record<string, Record<string, boolean>>>(defaultRoleAccess);
  const [userAccess, setUserAccess] = useState<Record<number, Record<string, boolean>>>({});
  const [reportAccessPolicyVersion, setReportAccessPolicyVersion] = useState(0);
  const [prices, setPrices] = useState<Prices>({ PMS: 0, AGO: 0, DPK: 0, LPG: 0, LPG_Single: 0, LPG_Distributor: 0, 'Lube Oil': 0 });
  const [priceHistory, setPriceHistory] = useState<PriceChange[]>(INIT_PRICE_HISTORY);
  const [tanks, setTanks] = useState<Tank[]>(INIT_TANKS);
  const [lpgTanks, setLpgTanks] = useState<LPGTank[]>(INIT_LPG);
  const [pumps, setPumps] = useState<Pump[]>(INIT_PUMPS);
  const [dips, setDips] = useState<DipRecord[]>(INIT_DIPS);
  const [deliveries, setDeliveries] = useState<Delivery[]>(INIT_RECS);
  const [maintenance, setMaintenance] = useState<MaintenanceItem[]>(INIT_MAINT);
  const [sales, setSales] = useState<SalesEntry[]>(INIT_SALES);
  const [marketCompetitors, setMarketCompetitors] = useState<MarketCompetitor[]>([]);
  const [staff, setStaff] = useState<Staff[]>(INIT_STAFF);
  const [branches, setBranches] = useState<Branch[]>(INIT_BRANCHES);
  const [docs] = useState<ComplianceDoc[]>(INIT_DOCS);
  const [expenses, setExpenses] = useState<Expense[]>(INIT_EXPENSES);
  const [budgets, setBudgets] = useState<Budget[]>(INIT_BUDGETS);
  const [messages, setMessages] = useState<Record<string, Message[]>>(INIT_MSGS);
  const [audit, setAudit] = useState<AuditEntry[]>(INIT_AUDIT);
  const [handoverNotes, setHandoverNotes] = useState<ShiftHandoverNote[]>([]);
  const [departments, setDepartments] = useState<Department[]>(INIT_DEPTS);
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>(INIT_USER_ACCOUNTS);
  const [companyFiles, setCompanyFiles] = useState<CompanyFile[]>(INIT_COMPANY_FILES);
  const [myFolders, setMyFolders] = useState<MyFolder[]>([]);
  const [myFolderFiles, setMyFolderFiles] = useState<MyFolderFile[]>([]);
  const [deliveryEvidences, setDeliveryEvidences] = useState<DeliveryEvidence[]>(INIT_DELIVERY_EVIDENCE);
  const [tasks, setTasks] = useState<Task[]>(INIT_TASKS);
  const [kpis, setKpis] = useState<KPI[]>(INIT_KPIS);
  const [hrEmployees, setHrEmployees] = useState<HREmployee[]>(INIT_HR_EMPLOYEES);
  const [hrRecommendations, setHrRecommendations] = useState<HRRecommendation[]>(INIT_HR_RECOMMENDATIONS);
  const [hrHandbooks, setHrHandbooks] = useState<HREmployeeDoc[]>(INIT_HR_HANDBOOKS);
  const [priceProposals, setPriceProposals] = useState<PriceProposal[]>([]);
  const [legalMatters, setLegalMatters] = useState<LegalMatter[]>(INIT_LEGAL);
  const [corpProjects, setCorpProjects] = useState<CorpProject[]>(INIT_CORP_PROJECTS);
  const [meetingMinutes, setMeetingMinutes] = useState<MeetingMinutes[]>(INIT_MEETING_MINUTES);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [callLog, setCallLog] = useState<CallRecord[]>([]);
  const [pumpDailyReports, setPumpDailyReports] = useState<PumpDailyReport[]>([]);
  // Approval side effects must be idempotent even if an accountant taps
  // approve twice before the state update causes a re-render.
  const appliedPumpReportApprovals = useRef<Set<number>>(new Set());
  const [pumpInitialMeters, setPumpInitialMeters] = useState<Record<string, number>>({});
  const [pumpLockedMeters, setPumpLockedMeters] = useState<Record<string, number>>({});
  const [inventoryLog, setInventoryLog] = useState<InventoryLogEntry[]>(INIT_INVENTORY_LOG);
  const [stockLogs, setStockLogs] = useState<StockLogEntry[]>([]);
  const [startupStocks, setStartupStocks] = useState<StartupStock[]>(INIT_STARTUP_STOCK);
  const [stockSnapshotConfig, setStockSnapshotConfig] = useState<StockSnapshotConfig>(DEFAULT_STOCK_SNAPSHOT_CONFIG);
  const [financialEntry, setFinancialEntry] = useState<FinancialEntry>(INIT_FINANCIAL_ENTRY);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const refreshNotifications = useCallback(async () => {
    if (!isServerAuthenticated) return;
    const rows = await notificationsApi.list();
    if (rows) setNotifications(rows);
  }, [isServerAuthenticated]);

  const markNotificationRead = useCallback(async (id: number) => {
    setNotifications(prev => prev.map(item => item.id === id ? { ...item, read: true } : item));
    await notificationsApi.markRead(id);
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications(prev => prev.map(item => ({ ...item, read: true })));
    await notificationsApi.markAllRead();
  }, []);

  /* ── persistence: load from AsyncStorage first (fast), then sync from API (authoritative) ── */
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const loadedResolveRef = useRef<(() => void) | null>(null);
  const loadedPromiseRef = useRef<Promise<void> | null>(null);
  if (!loadedPromiseRef.current) {
    loadedPromiseRef.current = new Promise<void>(resolve => {
      loadedResolveRef.current = resolve;
    });
  }
  const [stateSyncReadyTick, setStateSyncReadyTick] = useState(0);
  const stockBaselineRepairRef = useRef(false);
  useEffect(() => {
    const KEYS = [
      'auth', 'companyInfo', 'tanks', 'lpgTanks', 'pumps', 'staff', 'branches',
      'departments', 'userAccounts', 'prices', 'priceHistory', 'mgrPerms',
      'roleAccess', 'userAccess', 'reportAccessPolicyVersion', 'expenses', 'budgets', 'sales', 'dips',
      'deliveries', 'maintenance', 'audit', 'handoverNotes', 'messages', 'tasks', 'kpis',
      'companyFiles', 'deliveryEvidences', 'hrEmployees', 'hrHandbooks',
      'hrRecommendations', 'priceProposals', 'legalMatters', 'corpProjects', 'meetingMinutes',
      'broadcasts', 'callLog', 'pumpDailyReports', 'pumpInitialMeters', 'pumpLockedMeters', 'financialEntry', 'inventoryLog',
      'marketCompetitors', 'myFolders', 'myFolderFiles', 'startupStocks', 'stockSnapshotConfig', 'stockLogs',
    ] as const;
    const markLoaded = () => {
      loadedRef.current = true;
      setLoaded(true);
      loadedResolveRef.current?.();
      loadedResolveRef.current = null;
    };
    AsyncStorage.multiGet([...KEYS]).then(pairs => {
      const s: Record<string, any> = {};
      for (const [k, v] of pairs) if (v) s[k] = JSON.parse(v);
      if (s.auth) {
        const { r, n, sid, bid } = s.auth;
        // Clear legacy auto-admin session (solomon.okon) — require explicit login
        if (n === 'Solomon Okon' && !sid) {
          AsyncStorage.removeItem('auth');
        } else {
          // Only restore session if a server-issued JWT token is also present
          AsyncStorage.getItem('pt_auth_token').then(token => {
            if (token) {
              setRole(r); setUserName(n); setStaffId(sid ?? null); setBranchId(bid ?? null);
              setIsServerAuthenticated(true);
            } else {
              // No token means no valid server session; discard the stale auth record
              AsyncStorage.removeItem('auth');
            }
          });
        }
      }
       if (s.companyInfo)       setCompanyInfo(s.companyInfo);
      if (s.tanks)             setTanks(s.tanks);
      if (s.lpgTanks)          setLpgTanks(s.lpgTanks);
      if (s.pumps)             setPumps(s.pumps);
      if (s.staff)             setStaff(s.staff);
      if (s.branches)          setBranches(s.branches);
      if (s.departments)       setDepartments(s.departments);
      if (s.userAccounts)      setUserAccounts(s.userAccounts);
      if (s.prices)            setPrices(s.prices);
      if (s.priceHistory)      setPriceHistory(s.priceHistory);
      if (s.mgrPerms)          setMgrPerms(s.mgrPerms);
      if (s.roleAccess)        setRoleAccess(s.roleAccess);
      if (s.userAccess)        setUserAccess(s.userAccess);
       setReportAccessPolicyVersion(readReportAccessPolicyVersion(s.reportAccessPolicyVersion));
      if (s.expenses)          setExpenses(s.expenses);
      if (s.budgets)           setBudgets(s.budgets);
      if (s.sales)             setSales(s.sales);
      if (s.dips)              setDips(s.dips);
      if (s.deliveries)        setDeliveries(s.deliveries);
      if (s.maintenance)       setMaintenance(s.maintenance);
      if (s.audit)             setAudit(s.audit);
      if (s.handoverNotes)    setHandoverNotes(s.handoverNotes);
      if (s.messages)          setMessages(s.messages);
      if (s.tasks)             setTasks(s.tasks);
      if (s.kpis)              setKpis(s.kpis);
      if (s.companyFiles)      setCompanyFiles(s.companyFiles);
      if (s.myFolders)         setMyFolders(s.myFolders);
      if (s.myFolderFiles)     setMyFolderFiles(s.myFolderFiles);
       if (s.startupStocks)     setStartupStocks(s.startupStocks);
       if (s.stockLogs)         setStockLogs(s.stockLogs);
       // Inventory discrepancy logs were retired. Do not restore stale local
       // or server history, but keep dips/tank balances for Stock Snapshot.
       AsyncStorage.removeItem('inventoryLog');
      if (s.stockSnapshotConfig) {
         setStockSnapshotConfig({
          ...DEFAULT_STOCK_SNAPSHOT_CONFIG,
          ...s.stockSnapshotConfig,
           metrics: { ...DEFAULT_STOCK_SNAPSHOT_CONFIG.metrics, ...(s.stockSnapshotConfig.metrics ?? {}), sales: true },
          productsByBranch: s.stockSnapshotConfig.productsByBranch ?? {},
        });
      }
      if (s.deliveryEvidences) setDeliveryEvidences(s.deliveryEvidences);
      if (s.hrEmployees)       setHrEmployees(s.hrEmployees);
      if (s.hrHandbooks)       setHrHandbooks(s.hrHandbooks);
      if (s.hrRecommendations) setHrRecommendations(s.hrRecommendations);
      if (s.priceProposals)    setPriceProposals(s.priceProposals);
      if (s.legalMatters)      setLegalMatters(s.legalMatters);
      if (s.corpProjects)      setCorpProjects(s.corpProjects);
      if (s.meetingMinutes)    setMeetingMinutes(s.meetingMinutes);
      if (s.broadcasts)        setBroadcasts(s.broadcasts);
      if (s.callLog)           setCallLog(s.callLog);
      if (s.marketCompetitors) setMarketCompetitors(s.marketCompetitors);
      if (s.financialEntry)    setFinancialEntry(s.financialEntry);
       markLoaded();
     }).catch(() => {
       // The authenticated server sync can still recover the app if the local
       // cache is unavailable, so never leave login waiting indefinitely.
       markLoaded();
     });
  }, []);

  /* ── Pending-writes tracker: keys with in-flight PUTs are skipped by syncFromServer ── */
  // Prevents the 3-second poll from overwriting data whose PUT hasn't landed yet.
  const pendingWritesRef = useRef<Set<string>>(new Set());
  const inventoryPurgeRequestedRef = useRef(false);

  /* ── Initial-sync gate: block all server PUTs until the first syncFromServer completes ──
     On startup React fires every syncSlice effect the moment `loaded` becomes true.
     Without this gate those effects would PUT the stale AsyncStorage snapshot to the
     server, silently overwriting data that other users submitted (e.g. a manager's
     delivery that the accountant hasn't pulled yet).  The gate is lifted the moment the
     initial syncFromServer resolves, so every subsequent user-triggered change flows
     through to the server normally. */
  const initialSyncDoneRef = useRef(false);

  /* ── syncFromServer: fetch ALL state from the server and apply it locally ── */
  // Called once on startup and then every 3 s so every device stays in sync.
  const syncFromServer = useCallback(async (): Promise<boolean> => {
    try {
      const p = pendingWritesRef.current;
      const [s, userRows] = await Promise.all([
        stateApi.getAll(),
        usersApi.list(),
      ]);
      if (!s) return false;
      if (s.companyInfo && !p.has('companyInfo'))             setCompanyInfo(s.companyInfo as CompanyInfo);
      if (s.tanks && !p.has('tanks'))                         setTanks(s.tanks as Tank[]);
      if (s.lpgTanks && !p.has('lpgTanks'))                   setLpgTanks(s.lpgTanks as LPGTank[]);
      if (s.pumps && !p.has('pumps'))                         setPumps(s.pumps as Pump[]);
      if (s.staff && !p.has('staff'))                         setStaff(s.staff as Staff[]);
      if (s.branches && !p.has('branches'))                   setBranches(s.branches as Branch[]);
      if (s.departments && !p.has('departments'))             setDepartments(s.departments as Department[]);
      // Users come from the dedicated DB table (authoritative) — overrides blob
      if (userRows && userRows.length > 0) {
        setUserAccounts(userRows.map(apiRowToUserAccount));
      } else if (s.userAccounts && !p.has('userAccounts')) {
        setUserAccounts(s.userAccounts as UserAccount[]);
      }
      if (s.prices && !p.has('prices'))                       setPrices(s.prices as Prices);
      if (s.priceHistory && !p.has('priceHistory'))           setPriceHistory(s.priceHistory as PriceChange[]);
      if (s.mgrPerms && !p.has('mgrPerms'))                   setMgrPerms(s.mgrPerms as Record<string, MgrPermissions>);
      if (s.roleAccess && !p.has('roleAccess'))               setRoleAccess(s.roleAccess as Record<string, Record<string, boolean>>);
      if (s.userAccess && !p.has('userAccess'))               setUserAccess(s.userAccess as Record<number, Record<string, boolean>>);
       if (!p.has('reportAccessPolicyVersion')) {
         setReportAccessPolicyVersion(readReportAccessPolicyVersion(s.reportAccessPolicyVersion));
       }
      if (s.stockSnapshotConfig && !p.has('stockSnapshotConfig')) {
        const incoming = s.stockSnapshotConfig as Partial<StockSnapshotConfig>;
        setStockSnapshotConfig({
          ...DEFAULT_STOCK_SNAPSHOT_CONFIG,
          ...incoming,
          metrics: { ...DEFAULT_STOCK_SNAPSHOT_CONFIG.metrics, ...(incoming.metrics ?? {}), sales: true },
          productsByBranch: incoming.productsByBranch ?? {},
        });
      }
      // Safety rule: never overwrite a non-empty local array with an empty server array.
      // This prevents a single accidental reset (or an empty server key) from wiping data
      // on every device that opens the app. The functional setter reads the latest local
      // state, so it never uses stale closure values from the initial render.
      const safeArray = <T,>(server: unknown) => (prev: T[]) => {
        const arr = Array.isArray(server) ? (server as T[]) : null;
        if (!arr) return prev;
        if (arr.length === 0 && prev.length > 0) return prev; // protect against empty wipe
        return arr;
      };
      if (s.expenses && !p.has('expenses'))                   setExpenses(s.expenses as Expense[]);
      if (s.budgets && !p.has('budgets'))                     setBudgets(s.budgets as Budget[]);
      if (!p.has('sales'))           setSales(safeArray<SalesEntry>(s.sales));
       if (!p.has('dips')) {
         setDips(prev => mergeDipRecords(
           prev,
           Array.isArray(s.dips) ? s.dips as DipRecord[] : [],
         ));
       }
      if (!p.has('deliveries'))      setDeliveries(safeArray<Delivery>(s.deliveries));
      if (!p.has('maintenance'))     setMaintenance(Array.isArray(s.maintenance) ? s.maintenance as MaintenanceItem[] : []);
      if (Array.isArray(s.audit) && !p.has('audit'))          setAudit(s.audit as AuditEntry[]);
      if (Array.isArray(s.handoverNotes) && !p.has('handoverNotes')) setHandoverNotes(s.handoverNotes as ShiftHandoverNote[]);
      // Messages are shared conversations. Merge every message ID instead of
      // accepting a whole conversation snapshot from one device.
      if (s.messages && typeof s.messages === 'object' && !Array.isArray(s.messages)) {
        const serverMsgs = s.messages as Record<string, Message[]>;
        setMessages(prev => {
          const allKeys = new Set([...Object.keys(prev), ...Object.keys(serverMsgs)]);
          const merged: Record<string, Message[]> = {};
          for (const k of allKeys) {
            const serverList: Message[] = Array.isArray(serverMsgs[k]) ? serverMsgs[k] : [];
            const localList: Message[] = prev[k] ?? [];
            const localById = new Map(localList.map(message => [message.id, message]));
            const mergedById = new Map<number, Message>();

            for (const serverMessage of serverList) {
              const localMessage = localById.get(serverMessage.id);
              if (!localMessage) {
                mergedById.set(serverMessage.id, serverMessage);
                continue;
              }
              const archivedBy = Array.from(new Set([
                ...(serverMessage.archivedBy || []),
                ...(localMessage.archivedBy || []),
              ]));
              const archiveState = mergeArchiveState(serverMessage.archiveState, localMessage.archiveState);
              const read = serverMessage.read || localMessage.read;
              const unchanged = read === localMessage.read
                && archivedBy.length === (localMessage.archivedBy || []).length
                && archivedBy.every(name => localMessage.archivedBy?.includes(name))
                && JSON.stringify(archiveState) === JSON.stringify(localMessage.archiveState);
              mergedById.set(serverMessage.id, unchanged
                ? localMessage
                : {
                    ...localMessage,
                    read,
                    ...(archivedBy.length > 0 ? { archivedBy } : {}),
                    ...(archiveState ? { archiveState } : {}),
                  }
              );
            }
            for (const localMessage of localList) {
              if (!mergedById.has(localMessage.id)) mergedById.set(localMessage.id, localMessage);
            }
            merged[k] = Array.from(mergedById.values())
              .sort((a, b) => messageActivityMs(a) - messageActivityMs(b));
          }
          return JSON.stringify(merged) === JSON.stringify(prev) ? prev : merged;
        });
      }
       if (!p.has('inventoryLog')) {
         setInventoryLog([]);
         if (!inventoryPurgeRequestedRef.current && Array.isArray(s.inventoryLog) && s.inventoryLog.length > 0) {
           inventoryPurgeRequestedRef.current = true;
           pendingWritesRef.current.add('inventoryLog');
           stateApi.put('inventoryLog', []).finally(() => pendingWritesRef.current.delete('inventoryLog'));
         }
       }
      if (!p.has('tasks'))             setTasks(safeArray<Task>(s.tasks));
      if (!p.has('kpis'))              setKpis(safeArray<KPI>(s.kpis));
      if (!p.has('companyFiles'))      setCompanyFiles(safeArray<CompanyFile>(s.companyFiles));
      if (!p.has('myFolders'))         setMyFolders(safeArray<MyFolder>(s.myFolders));
      if (!p.has('myFolderFiles'))     setMyFolderFiles(safeArray<MyFolderFile>(s.myFolderFiles));
      if (!p.has('deliveryEvidences')) setDeliveryEvidences(safeArray<DeliveryEvidence>(s.deliveryEvidences));
      if (!p.has('hrEmployees'))       setHrEmployees(safeArray<HREmployee>(s.hrEmployees));
      if (!p.has('hrHandbooks'))       setHrHandbooks(safeArray<HREmployeeDoc>(s.hrHandbooks));
      if (!p.has('hrRecommendations')) setHrRecommendations(safeArray<HRRecommendation>(s.hrRecommendations));
      if (!p.has('priceProposals'))    setPriceProposals(safeArray<PriceProposal>(s.priceProposals));
      if (!p.has('legalMatters'))      setLegalMatters(safeArray<LegalMatter>(s.legalMatters));
      if (!p.has('corpProjects'))      setCorpProjects(safeArray<CorpProject>(s.corpProjects));
      if (!p.has('broadcasts'))        setBroadcasts(safeArray<Broadcast>(s.broadcasts));
      if (!p.has('callLog'))           setCallLog(safeArray<CallRecord>(s.callLog));
      if (!p.has('marketCompetitors')) setMarketCompetitors(safeArray<MarketCompetitor>(s.marketCompetitors));
      if (!p.has('meetingMinutes'))    setMeetingMinutes(safeArray<MeetingMinutes>(s.meetingMinutes));
      if (!p.has('pumpDailyReports') && Array.isArray(s.pumpDailyReports)) {
        setPumpDailyReports(prev => mergePumpDailyReports(prev, s.pumpDailyReports as PumpDailyReport[]));
      }
      if (s.pumpInitialMeters && typeof s.pumpInitialMeters === 'object' && !p.has('pumpInitialMeters')) setPumpInitialMeters(s.pumpInitialMeters as Record<string, number>);
      if (s.pumpLockedMeters && typeof s.pumpLockedMeters === 'object' && !p.has('pumpLockedMeters')) setPumpLockedMeters(s.pumpLockedMeters as Record<string, number>);
      if (s.financialEntry && !p.has('financialEntry'))                     setFinancialEntry(s.financialEntry as FinancialEntry);
       if (!p.has('startupStocks'))       setStartupStocks(safeArray<StartupStock>(s.startupStocks));
       if (!p.has('stockLogs'))           setStockLogs(safeArray<StockLogEntry>(s.stockLogs));
      // Lift the startup write-gate ONLY on success: server state is now applied, safe to accept user writes.
      // If syncFromServer fails (no network, 500, etc.), the gate stays DOWN so the app's empty defaults
      // cannot overwrite whatever real data is on the server. The next poll (3 s) will retry.
      initialSyncDoneRef.current = true;
      // Trigger deferred writes for records created while the app was still
      // unauthenticated and therefore blocked by the startup write gate.
      setStateSyncReadyTick(t => t + 1);
      return true;
    } catch {
      // silently ignore — network errors must not break the UI.
      // CRITICAL: DO NOT lift the gate on error. If we do, the empty default state in useState([])
      // will be PUT to the server by the syncSlice effects, wiping all real data permanently.
      // The gate stays closed; the next 3-second poll will retry syncFromServer.
      return false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Initial server sync once AsyncStorage has loaded ── */
  useEffect(() => {
    if (loaded && isServerAuthenticated) syncFromServer();
  }, [loaded, isServerAuthenticated, syncFromServer]);

  /**
   * One-time repair for historical baselines whose administrative save date
   * differed from the business date they apply from. This is data migration
   * logic, not a new default: once seedDate is present, later admin edits are
   * left alone.
   */
  useEffect(() => {
    if (
      !loaded ||
      !isServerAuthenticated ||
      !initialSyncDoneRef.current ||
      stateSyncReadyTick === 0 ||
      role !== 'admin' ||
      stockBaselineRepairRef.current
    ) return;

    const matchingRepairs = HISTORICAL_BASELINE_REPAIRS.filter(repair =>
      branches.some(item => item.name.trim().toLowerCase() === repair.branchName),
    );
    if (matchingRepairs.length === 0) return;

    const repairsToApply = matchingRepairs.flatMap(repair => {
      const branch = branches.find(item => item.name.trim().toLowerCase() === repair.branchName);
      if (!branch) return [];
      const existing = startupStocks.find(stock =>
        stock.branchId === branch.id && stock.product === repair.product,
      );
      if (existing && startupStockSeedDate(existing) === repair.seedDate) return [];
      return [{ ...repair, branchId: branch.id, existingId: existing?.id }];
    });

    if (repairsToApply.length === 0) {
      stockBaselineRepairRef.current = true;
      return;
    }

    stockBaselineRepairRef.current = true;
    setStartupStocks(prev => {
      let next = [...prev];
      for (const repair of repairsToApply) {
        const existingIndex = next.findIndex(stock =>
          stock.branchId === repair.branchId && stock.product === repair.product,
        );
        if (existingIndex >= 0) {
          next[existingIndex] = {
            ...next[existingIndex],
            quantity: repair.quantity,
            seedDate: repair.seedDate,
          };
        } else {
          next.push({
            id: `startup-${repair.branchId}-${repair.product}-${repair.seedDate.replace(/-/g, '')}`,
            product: repair.product,
            quantity: repair.quantity,
            branchId: repair.branchId,
            setBy: userName || 'System',
            setAt: `${repair.seedDate}T00:00:00.000Z`,
            seedDate: repair.seedDate,
            locked: true,
          });
        }
      }
      return next;
    });
    // Stock logs are derived from the source records. Drop the stale chains so
    // Operations rebuilds them from the corrected seed dates.
    setStockLogs(prev => prev.filter(entry =>
      !repairsToApply.some(repair =>
        entry.branchId === repair.branchId && entry.product === repair.product,
      ),
    ));
    setAudit(prev => [{
      id: genId(),
      action: 'Historical stock baselines repaired',
      user: userName || 'System',
      detail: repairsToApply
        .map(repair => `${repair.branchName}: ${repair.quantity.toLocaleString()}${repair.product === 'LPG' ? 'kg' : 'L'} from ${repair.seedDate}`)
        .join(' · '),
      ts: nowTs(),
    }, ...prev]);
  }, [
    branches,
    isServerAuthenticated,
    loaded,
    role,
    setAudit,
    startupStocks,
    stateSyncReadyTick,
    userName,
  ]);

  // Existing installations used to give every non-admin role access to
  // Reports by default. Revoke those role-wide defaults once, while keeping
  // any explicit per-user override that an admin may already have set.
  useEffect(() => {
    if (role !== 'admin' || !loaded || !initialSyncDoneRef.current || reportAccessPolicyVersion >= REPORT_ACCESS_POLICY_VERSION) return;

    setRoleAccess(prev => {
      const next = { ...prev };
      for (const roleName of Object.keys(ROLE_FULL_NAV)) {
        if (roleName === 'admin') continue;
        next[roleName] = { ...(prev[roleName] ?? {}), exprpt: false };
      }
      return next;
    });
    setReportAccessPolicyVersion(REPORT_ACCESS_POLICY_VERSION);
  }, [loaded, reportAccessPolicyVersion, role, stateSyncReadyTick]);

  /* ── One-time repair for openings written by the removed mm conversion ── */
  useEffect(() => {
    if (!loaded || !isServerAuthenticated || !initialSyncDoneRef.current || dips.length === 0) return;
    let changed = false;
    const repaired = tanks.map(tank => {
      const latestDip = dips
        .filter(d => d.status === 'approved' && d.rd[tank.id] !== undefined)
        .sort((a, b) => new Date(b.approvedDt ?? b.dt).getTime() - new Date(a.approvedDt ?? a.dt).getTime())[0];
      const reading = latestDip?.rd[tank.id];
      if (
        reading === undefined ||
        !Number.isFinite(reading) ||
        reading < 0 ||
        tank.cap <= 0 ||
        tank.dip <= 0 ||
        Math.abs(tank.op - Math.round((reading / tank.dip) * tank.cap)) > 0.01
      ) {
        return tank;
      }
      const correctedOpening = dipReadingToLiters(reading);
      if (Math.abs(tank.op - correctedOpening) <= 0.01) return tank;
      changed = true;
      return { ...tank, op: correctedOpening };
    });
    if (changed) setTanks(repaired);
  }, [dips, isServerAuthenticated, loaded, tanks]);

  /* ── Repair legacy branch-less assets using their unambiguous names ── */
  useEffect(() => {
    if (!loaded || !isServerAuthenticated || !initialSyncDoneRef.current || branches.length === 0) return;

    let tanksChanged = false;
    let lpgTanksChanged = false;
    let pumpsChanged = false;
    const inferCountBasedBranch = (
      assets: Array<{ branchId?: string }>,
      countKey: 'tanks' | 'pumps',
    ): string | undefined => {
      const unassignedCount = assets.filter(asset => !asset.branchId).length;
      if (unassignedCount === 0) return undefined;
      const candidates = branches.filter(branch =>
        branch.st === 'Active' &&
        branch[countKey] === assets.filter(asset => asset.branchId === branch.id).length + unassignedCount,
      );
      return candidates.length === 1 ? candidates[0].id : undefined;
    };
    // Generic legacy names cannot identify a branch by themselves. The count
    // fallback is allowed only when the configured branch asset count makes
    // exactly one branch possible (for this dataset, five unassigned petrol
    // tanks and seven pumps resolve uniquely to Uyo fuel station).
    const countBasedTankBranchId = inferCountBasedBranch(tanks, 'tanks');
    const countBasedPumpBranchId = inferCountBasedBranch(pumps, 'pumps');
    const repairedTanks = tanks.map(tank => {
      if (tank.branchId) return tank;
      const branchId = inferLegacyBranchId(tank.name, branches) ?? countBasedTankBranchId;
      if (!branchId) return tank;
      tanksChanged = true;
      return { ...tank, branchId };
    });
    const repairedLpgTanks = lpgTanks.map(tank => {
      if (tank.branchId) return tank;
      const branchId = inferLegacyBranchId(tank.name, branches);
      if (!branchId) return tank;
      lpgTanksChanged = true;
      return { ...tank, branchId };
    });
    const repairedPumps = pumps.map(pump => {
      if (pump.branchId) return pump;
      const branchId = inferLegacyBranchId(pump.name, branches) ?? countBasedPumpBranchId;
      if (!branchId) return pump;
      pumpsChanged = true;
      return { ...pump, branchId };
    });

    if (!tanksChanged && !lpgTanksChanged && !pumpsChanged) return;
    if (tanksChanged) setTanks(repairedTanks);
    if (lpgTanksChanged) setLpgTanks(repairedLpgTanks);
    if (pumpsChanged) setPumps(repairedPumps);
    setAudit(a => [{
      id: genId(),
      action: 'Legacy branch assignments repaired',
      user: userName,
      detail: 'Assigned branch IDs to legacy tank and pump records using unambiguous asset names.',
      ts: nowTs(),
    }, ...a]);
  }, [branches, isServerAuthenticated, loaded, lpgTanks, pumps, tanks, userName]);

  useEffect(() => {
    if (!loaded || !isServerAuthenticated) return;
    void refreshNotifications();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (stopped) return;
      await refreshNotifications();
      if (!stopped) timer = setTimeout(poll, 5_000);
    };
    timer = setTimeout(poll, 5_000);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [loaded, isServerAuthenticated, refreshNotifications]);

  /* ── persistence: save each state slice to AsyncStorage + API when it changes ── */
  function syncSlice(key: string, value: unknown) {
    AsyncStorage.setItem(key, JSON.stringify(value));
    // Block server writes until the initial syncFromServer has completed so that
    // stale AsyncStorage snapshots can't overwrite data written by other users.
    if (!initialSyncDoneRef.current) return;
    pendingWritesRef.current.add(key);
    stateApi.put(key, value).finally(() => pendingWritesRef.current.delete(key));
  }
  useEffect(() => { if (loaded) syncSlice('companyInfo',       companyInfo); },       [companyInfo, loaded]);
  useEffect(() => { if (loaded) syncSlice('tanks',             tanks); },             [tanks, loaded]);
  useEffect(() => { if (loaded) syncSlice('lpgTanks',          lpgTanks); },          [lpgTanks, loaded]);
  useEffect(() => { if (loaded) syncSlice('pumps',             pumps); },             [pumps, loaded]);
  useEffect(() => { if (loaded) syncSlice('staff',             staff); },             [staff, loaded]);
  useEffect(() => { if (loaded) syncSlice('branches',          branches); },          [branches, loaded]);
  useEffect(() => { if (loaded) syncSlice('departments',       departments); },       [departments, loaded]);
  useEffect(() => { if (loaded) syncSlice('userAccounts',      userAccounts); },      [userAccounts, loaded]);
  useEffect(() => { if (loaded) syncSlice('prices',            prices); },            [prices, loaded]);
  useEffect(() => { if (loaded) syncSlice('priceHistory',      priceHistory); },      [priceHistory, loaded]);
  useEffect(() => { if (loaded) syncSlice('mgrPerms',          mgrPerms); },          [mgrPerms, loaded]);
  useEffect(() => { if (loaded) syncSlice('roleAccess',        roleAccess); },        [roleAccess, loaded]);
  useEffect(() => { if (loaded) syncSlice('userAccess',        userAccess); },        [userAccess, loaded]);
  useEffect(() => {
    if (loaded && role === 'admin') {
      syncSlice('reportAccessPolicyVersion', { version: reportAccessPolicyVersion });
    }
  }, [reportAccessPolicyVersion, loaded, role]);
  useEffect(() => { if (loaded) syncSlice('expenses',          expenses); },          [expenses, loaded]);
  useEffect(() => { if (loaded) syncSlice('budgets',           budgets); },           [budgets, loaded]);
  useEffect(() => { if (loaded) syncSlice('sales',             sales); },             [sales, loaded]);
  useEffect(() => { if (loaded) syncSlice('dips',              dips); },              [dips, loaded]);
  useEffect(() => { if (loaded) syncSlice('deliveries',        deliveries); },        [deliveries, loaded]);
  // Audit log is capped to the most recent MAX_AUDIT_ENTRIES to keep payloads small.
  useEffect(() => {
    if (audit.length > MAX_AUDIT_ENTRIES) { setAudit(a => a.slice(0, MAX_AUDIT_ENTRIES)); return; }
    if (loaded) syncSlice('audit', audit);
  }, [audit, loaded]);
  useEffect(() => { if (loaded) syncSlice('handoverNotes',    handoverNotes); },       [handoverNotes, loaded]);
  useEffect(() => { if (loaded) syncSlice('messages',          messages); },          [messages, loaded]);
  useEffect(() => { if (loaded) syncSlice('broadcasts',        broadcasts); },        [broadcasts, loaded]);
  useEffect(() => { if (loaded) syncSlice('callLog',           callLog); },           [callLog, loaded]);
  useEffect(() => { if (loaded) syncSlice('marketCompetitors', marketCompetitors); }, [marketCompetitors, loaded]);
  useEffect(() => { if (loaded) syncSlice('tasks',             tasks); },             [tasks, loaded]);
  useEffect(() => { if (loaded) syncSlice('kpis',              kpis); },              [kpis, loaded]);
  useEffect(() => { if (loaded) syncSlice('inventoryLog',     inventoryLog); },    [inventoryLog, loaded]);
   useEffect(() => { if (loaded) syncSlice('stockLogs',         stockLogs); },        [stockLogs, loaded]);
  useEffect(() => { if (loaded) syncSlice('companyFiles',      companyFiles); },      [companyFiles, loaded]);
  useEffect(() => { if (loaded) syncSlice('myFolders',          myFolders); },          [myFolders, loaded]);
  useEffect(() => { if (loaded) syncSlice('myFolderFiles',     myFolderFiles); },     [myFolderFiles, loaded]);
  useEffect(() => { if (loaded) syncSlice('deliveryEvidences', deliveryEvidences); }, [deliveryEvidences, loaded]);
  useEffect(() => { if (loaded) syncSlice('hrEmployees',       hrEmployees); },       [hrEmployees, loaded]);
  useEffect(() => { if (loaded) syncSlice('hrHandbooks',       hrHandbooks); },       [hrHandbooks, loaded]);
  useEffect(() => { if (loaded) syncSlice('hrRecommendations', hrRecommendations); }, [hrRecommendations, loaded]);
  useEffect(() => { if (loaded) syncSlice('priceProposals',    priceProposals); },    [priceProposals, loaded]);
  useEffect(() => { if (loaded) syncSlice('legalMatters',      legalMatters); },      [legalMatters, loaded]);
  useEffect(() => { if (loaded) syncSlice('corpProjects',      corpProjects); },      [corpProjects, loaded]);
  useEffect(() => { if (loaded) syncSlice('meetingMinutes',    meetingMinutes); },    [meetingMinutes, loaded]);
  useEffect(() => { if (loaded) syncSlice('pumpDailyReports', pumpDailyReports); },  [pumpDailyReports, loaded]);
  // If a report was submitted before the JWT-backed initial sync completed,
  // its local value may not change during syncFromServer (safeArray preserves
  // it when the server is empty), so the normal dependency effect above will
  // not run. Flush it once the authenticated sync has completed.
  useEffect(() => {
    if (loaded && stateSyncReadyTick > 0) syncSlice('pumpDailyReports', pumpDailyReports);
  }, [loaded, stateSyncReadyTick, pumpDailyReports]);
  // A dip can be submitted from a locally restored session before the first
  // authenticated sync completes. safeArray intentionally preserves that
  // local record when the server is empty, so flush it once the sync gate opens.
  useEffect(() => {
    if (loaded && stateSyncReadyTick > 0) syncSlice('dips', dips);
  }, [dips, loaded, stateSyncReadyTick]);
  useEffect(() => { if (loaded) syncSlice('pumpInitialMeters', pumpInitialMeters); }, [pumpInitialMeters, loaded]);
  useEffect(() => { if (loaded) syncSlice('pumpLockedMeters',  pumpLockedMeters); },  [pumpLockedMeters, loaded]);
  useEffect(() => { if (loaded) syncSlice('financialEntry',    financialEntry); },    [financialEntry, loaded]);
  useEffect(() => { if (loaded) syncSlice('startupStocks',    startupStocks); },      [startupStocks, loaded]);
  useEffect(() => { if (loaded) syncSlice('stockSnapshotConfig', stockSnapshotConfig); }, [stockSnapshotConfig, loaded]);

  /* ── Version-check poll: 3 s lightweight ping → full sync only when data changed ── */
  // /api/version returns a ~50-byte timestamp. syncFromServer() only fires when it changes,
  // so a pump attendant's shift report appears on every permitted screen within ~3 seconds.
  const lastVersionRef = useRef<string>('');
  useEffect(() => {
    if (!role || !loaded || !isServerAuthenticated) return;

    let stopped = false;
    let checking = false;
    const check = async () => {
      if (checking || stopped) return;
      checking = true;
      try {
        const result = await versionApi.get();
        if (result?.version && result.version !== lastVersionRef.current) {
          lastVersionRef.current = result.version;
          await syncFromServer();
        }
      } catch {
        // silently ignore transient network errors
      } finally {
        checking = false;
      }
    };

    // Fire immediately on login/app-open so new data appears within ~300 ms,
    // not after the first 3-second interval tick.
    void check();

    // Schedule the next check only after the previous one has finished so
    // slow full-sync requests cannot overlap and reorder state updates.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (!stopped) timer = setTimeout(async () => { await check(); schedule(); }, 3_000);
    };
    schedule();

    // Also re-sync the moment the user brings the app to the foreground
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void check();
    });

    return () => { stopped = true; if (timer) clearTimeout(timer); sub.remove(); };
  }, [role, loaded, isServerAuthenticated, syncFromServer]);

  const DRAFT_APPROVAL: CorpApproval = { status: 'draft' };

  const addLegalMatter = useCallback((m: Omit<LegalMatter, 'id' | 'openedAt' | 'approval' | 'attachments'>) => {
    setLegalMatters(prev => [{ ...m, id: genId(), openedAt: nowTs(), approval: { status: 'draft' }, attachments: [] }, ...prev]);
  }, []);
  const updateLegalMatter = useCallback((id: number, updates: Partial<Omit<LegalMatter, 'id' | 'openedAt' | 'approval' | 'attachments'>>) => {
    setLegalMatters(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  }, []);
  const updateLegalStatus = useCallback((id: number, status: LegalMatter['status']) => {
    setLegalMatters(prev => prev.map(m => m.id === id ? { ...m, status } : m));
  }, []);
  const deleteLegalMatter = useCallback((id: number) => {
    setLegalMatters(prev => prev.filter(m => m.id !== id));
  }, []);

  const addCorpProject = useCallback((p: Omit<CorpProject, 'id' | 'approval' | 'attachments'>) => {
    setCorpProjects(prev => [{ ...p, id: genId(), approval: { status: 'draft' }, attachments: [] }, ...prev]);
  }, []);
  const updateCorpProject = useCallback((id: number, updates: Partial<Omit<CorpProject, 'id' | 'approval' | 'attachments'>>) => {
    setCorpProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);
  const updateProjectProgress = useCallback((id: number, progress: number, status: CorpProject['status']) => {
    setCorpProjects(prev => prev.map(p => p.id === id ? { ...p, progress, status } : p));
  }, []);
  const deleteCorpProject = useCallback((id: number) => {
    setCorpProjects(prev => prev.filter(p => p.id !== id));
  }, []);

  const addMeetingMinutes = useCallback((m: Omit<MeetingMinutes, 'id' | 'approval' | 'attachments'>) => {
    setMeetingMinutes(prev => [{ ...m, id: genId(), approval: { status: 'draft' }, attachments: [] }, ...prev]);
  }, []);
  const updateMeetingMinutes = useCallback((id: number, updates: Partial<Omit<MeetingMinutes, 'id' | 'approval' | 'attachments'>>) => {
    setMeetingMinutes(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  }, []);
  const deleteMeetingMinutes = useCallback((id: number) => {
    setMeetingMinutes(prev => prev.filter(m => m.id !== id));
  }, []);

  // ── Corporate record attachment & approval workflow ──
  const addCorpAttachment = useCallback((type: CorpRecordType, id: number, att: Omit<CorpAttachment, 'id' | 'uploadedAt'>) => {
    const newAtt: CorpAttachment = { ...att, id: genId(), uploadedAt: nowTs() };
    if (type === 'legal')   setLegalMatters(prev => prev.map(m => m.id === id ? { ...m, attachments: [...m.attachments, newAtt] } : m));
    if (type === 'project') setCorpProjects(prev => prev.map(p => p.id === id ? { ...p, attachments: [...p.attachments, newAtt] } : p));
    if (type === 'minutes') setMeetingMinutes(prev => prev.map(m => m.id === id ? { ...m, attachments: [...m.attachments, newAtt] } : m));
  }, []);

  const removeCorpAttachment = useCallback((type: CorpRecordType, id: number, attId: number) => {
    if (type === 'legal')   setLegalMatters(prev => prev.map(m => m.id === id ? { ...m, attachments: m.attachments.filter(a => a.id !== attId) } : m));
    if (type === 'project') setCorpProjects(prev => prev.map(p => p.id === id ? { ...p, attachments: p.attachments.filter(a => a.id !== attId) } : p));
    if (type === 'minutes') setMeetingMinutes(prev => prev.map(m => m.id === id ? { ...m, attachments: m.attachments.filter(a => a.id !== attId) } : m));
  }, []);

  const submitCorpItem = useCallback((type: CorpRecordType, id: number, submittedTo: string) => {
    const approval: CorpApproval = { status: 'submitted', submittedBy: userName, submittedAt: nowTs(), submittedTo };
    if (type === 'legal')   setLegalMatters(prev => prev.map(m => m.id === id ? { ...m, approval } : m));
    if (type === 'project') setCorpProjects(prev => prev.map(p => p.id === id ? { ...p, approval } : p));
    if (type === 'minutes') setMeetingMinutes(prev => prev.map(m => m.id === id ? { ...m, approval } : m));
  }, [userName]);

  const approveCorpItem = useCallback((type: CorpRecordType, id: number) => {
    const approval: CorpApproval = { status: 'approved', reviewedBy: userName, reviewedAt: nowTs() };
    if (type === 'legal')   setLegalMatters(prev => prev.map(m => m.id === id ? { ...m, approval: { ...m.approval, ...approval } } : m));
    if (type === 'project') setCorpProjects(prev => prev.map(p => p.id === id ? { ...p, approval: { ...p.approval, ...approval } } : p));
    if (type === 'minutes') setMeetingMinutes(prev => prev.map(m => m.id === id ? { ...m, approval: { ...m.approval, ...approval } } : m));
  }, [userName]);

  const rejectCorpItem = useCallback((type: CorpRecordType, id: number, reason: string) => {
    const approval: Partial<CorpApproval> = { status: 'rejected', reviewedBy: userName, reviewedAt: nowTs(), rejectionReason: reason };
    if (type === 'legal')   setLegalMatters(prev => prev.map(m => m.id === id ? { ...m, approval: { ...m.approval, ...approval } } : m));
    if (type === 'project') setCorpProjects(prev => prev.map(p => p.id === id ? { ...p, approval: { ...p.approval, ...approval } } : p));
    if (type === 'minutes') setMeetingMinutes(prev => prev.map(m => m.id === id ? { ...m, approval: { ...m.approval, ...approval } } : m));
  }, [userName]);

  const login = useCallback(async (r: Role, n: string, sid?: number, bid?: string): Promise<boolean> => {
    // apiLogin saves the JWT before this callback runs. Complete the full
    // authenticated state refresh before exposing the role to the router, so
    // new and returning users never see a dashboard built from empty defaults.
    if (!loadedRef.current && loadedPromiseRef.current) {
      await loadedPromiseRef.current;
    }
    const synced = await syncFromServer();
    if (!synced) return false;

    setRole(r); setUserName(n);
    setBranchId(bid ?? null); setStaffId(sid ?? null);
    setIsServerAuthenticated(true);
    AsyncStorage.setItem('auth', JSON.stringify({ r, n, sid: sid ?? null, bid: bid ?? null }));
    return true;
  }, [syncFromServer]);

  const logout = useCallback(() => {
    setRole(null); setUserName(''); setBranchId(null); setStaffId(null);
    setIsServerAuthenticated(false);
    setNotifications([]);
    // Chats are account-scoped. Do not leave the previous user's local
    // conversation cache visible when another person signs in on this device.
    setMessages({});
    void notificationsApi.unregisterToken();
    AsyncStorage.removeItem('auth');
    AsyncStorage.removeItem('messages');
    clearToken();
  }, []);

  const updateMgrPerms = useCallback((bid: string, perms: Partial<MgrPermissions>) => {
    setMgrPerms(p => ({ ...p, [bid]: { ...(p[bid] ?? DEFAULT_MGR_PERMS), ...perms } }));
    setAudit(a => [{ id: genId(), action: 'Manager permissions updated', user: userName, detail: `Branch ${bid}: ${JSON.stringify(perms)}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const updatePrice = useCallback((prod: string, price: number, by?: string, reason?: string, targetBranchId?: string): PriceValidationResult => {
    if (!['admin', 'ceo', 'md', 'mgr'].includes(role ?? '')) return { ok: false, reason: 'not_authorized' };
    const scopedBranchId = targetBranchId ?? (role === 'mgr' ? branchId ?? undefined : undefined);
    if (role === 'mgr' && !scopedBranchId) return { ok: false, reason: 'missing_branch' };
    const oldPrice = getPriceForProduct(prices, prod, scopedBranchId);
    const actor = by ?? userName;
    const validation = validatePriceChange({ prod, oldPrice, newPrice: price, by: actor });
    if (!validation.ok) return validation;
    setPrices(p => {
      if (!scopedBranchId) return { ...p, [prod]: price };
      return {
        ...p,
        branchPrices: {
          ...(p.branchPrices ?? {}),
          [scopedBranchId]: {
            ...(p.branchPrices?.[scopedBranchId] ?? {}),
            [prod as PriceProduct]: price,
          },
        },
      };
    });
    setPriceHistory(h => [{
      id: genId(), prod, oldPrice, newPrice: price, by: actor, dt: nowTs(),
      branchId: scopedBranchId, reason,
    }, ...h]);
    const unit = prod === 'LPG' || prod.startsWith('LPG') ? 'kg' : 'L';
    const scopeLabel = scopedBranchId ? ` at branch ${scopedBranchId}` : ' network-wide';
    setAudit(a => [{ id: genId(), action: 'Price update', user: actor, detail: `${prod}: ₦${oldPrice} → ₦${price}/${unit}${scopeLabel}${reason ? ' — ' + reason : ''}`, ts: nowTs() }, ...a]);
    return { ok: true };
  }, [userName, prices, role, branchId]);

  const addPriceProposal = useCallback((prod: string, proposedPrice: number): PriceValidationResult => {
    const proposalBranchId = branchId ?? undefined;
    const currentPrice = getPriceForProduct(prices, prod, proposalBranchId);
    const validation = validatePriceProposal({
      prod,
      currentPrice,
      proposedPrice,
      proposedBy: userName,
    });
    if (!validation.ok) return validation;
    setPriceProposals(ps => [
      { id: genId(), prod, currentPrice, proposedPrice, proposedBy: userName, proposedAt: nowTs(), status: 'pending', branchId: proposalBranchId },
      ...ps,
    ]);
    const unit = prod === 'LPG' || prod.startsWith('LPG') ? 'kg' : 'L';
    const scopeLabel = proposalBranchId ? ` at branch ${proposalBranchId}` : '';
    setAudit(a => [{ id: genId(), action: 'Price proposal submitted', user: userName, detail: `${prod}: ₦${currentPrice} → ₦${proposedPrice}/${unit}${scopeLabel} (awaiting CEO approval)`, ts: nowTs() }, ...a]);
    return { ok: true };
  }, [userName, prices, branchId]);

  const approvePriceProposal = useCallback((id: number): PriceValidationResult => {
    const proposal = priceProposals.find(p => p.id === id && p.status === 'pending');
    if (!proposal) return { ok: false, reason: 'invalid_proposed_price' };
    const proposalValidation = validatePriceProposal(proposal);
    if (!proposalValidation.ok) return proposalValidation;
    const priceResult = updatePrice(proposal.prod, proposal.proposedPrice, userName, undefined, proposal.branchId);
    if (!priceResult.ok) return priceResult;
    setPriceProposals(ps => ps.map(p =>
      p.id === id ? { ...p, status: 'approved' as const, reviewedBy: userName, reviewedAt: nowTs() } : p
    ));
    const msgKey = chatKey('ceo', 'md');
    setMessages(m => ({
      ...m,
      [msgKey]: [...(m[msgKey] || []), {
        id: genId(), from: 'ceo' as Role, to: 'md' as Role, type: 'alert' as const,
        body: `Price approved: ${proposal.prod} is now ₦${proposal.proposedPrice.toLocaleString()}/${unitForProd(proposal.prod)}`,
        alrt: { title: 'Price Change Approved', pri: 'Low', detail: `${proposal.prod}: ₦${proposal.currentPrice.toLocaleString()} → ₦${proposal.proposedPrice.toLocaleString()}/${unitForProd(proposal.prod)} (effective immediately)` },
        ts: nowTime(), read: false,
      }],
    }));
    return { ok: true };
  }, [userName, updatePrice, priceProposals]);

  const updateAndApprovePriceProposal = useCallback((id: number, updatedPrice: number): PriceValidationResult => {
    const proposal = priceProposals.find(p => p.id === id && p.status === 'pending');
    if (!proposal) return { ok: false, reason: 'invalid_proposed_price' };
    const proposalValidation = validatePriceProposal(proposal);
    if (!proposalValidation.ok) return proposalValidation;
    const priceResult = updatePrice(proposal.prod, updatedPrice, userName, undefined, proposal.branchId);
    if (!priceResult.ok) return priceResult;
    setPriceProposals(ps => ps.map(p =>
      p.id === id ? { ...p, proposedPrice: updatedPrice, status: 'approved' as const, reviewedBy: userName, reviewedAt: nowTs() } : p
    ));
    setAudit(a => [{ id: genId(), action: 'Price proposal updated & approved', user: userName, detail: `${proposal.prod}: ₦${proposal.proposedPrice.toLocaleString()} → ₦${updatedPrice.toLocaleString()}/${unitForProd(proposal.prod)} (CEO updated price)`, ts: nowTs() }, ...a]);
    const msgKey = chatKey('ceo', 'md');
    setMessages(m => ({
      ...m,
      [msgKey]: [...(m[msgKey] || []), {
        id: genId(), from: 'ceo' as Role, to: 'md' as Role, type: 'alert' as const,
        body: `Price updated & approved: ${proposal.prod} is now ₦${updatedPrice.toLocaleString()}/${unitForProd(proposal.prod)} (CEO adjusted from your ₦${proposal.proposedPrice.toLocaleString()}/${unitForProd(proposal.prod)})`,
        alrt: { title: 'Price Updated & Approved', pri: 'Low', detail: `${proposal.prod}: You proposed ₦${proposal.proposedPrice.toLocaleString()}/${unitForProd(proposal.prod)}, CEO set it to ₦${updatedPrice.toLocaleString()}/${unitForProd(proposal.prod)} (effective immediately)` },
        ts: nowTime(), read: false,
      }],
    }));
    return { ok: true };
  }, [userName, updatePrice, priceProposals]);

  const rejectPriceProposal = useCallback((id: number, note?: string) => {
    const proposal = priceProposals.find(p => p.id === id && p.status === 'pending');
    setPriceProposals(ps => ps.map(p =>
      p.id === id && p.status === 'pending'
        ? { ...p, status: 'rejected' as const, reviewedBy: userName, reviewedAt: nowTs(), note }
        : p
    ));
    setAudit(a => [{ id: genId(), action: 'Price proposal rejected', user: userName, detail: `Proposal #${id}${note ? ': ' + note : ''}`, ts: nowTs() }, ...a]);
    if (proposal) {
      const msgKey = chatKey('ceo', 'md');
      setMessages(m => ({
        ...m,
        [msgKey]: [...(m[msgKey] || []), {
          id: genId(), from: 'ceo' as Role, to: 'md' as Role, type: 'alert' as const,
          body: `Price proposal rejected: ${proposal.prod} ₦${proposal.proposedPrice.toLocaleString()}/L was not approved${note ? ` — ${note}` : ''}`,
          alrt: { title: 'Price Change Rejected', pri: 'Medium', detail: note || 'No reason given' },
          ts: nowTime(), read: false,
        }],
      }));
    }
  }, [userName, priceProposals]);

  const addTank = useCallback((t: Omit<Tank, 'id' | 'dip' | 'op' | 'rv' | 'sl'>) => {
    const id = `T${Date.now()}`;
    setTanks(ts => [...ts, { ...t, id, dip: Math.round(t.cap / 10), op: 0, rv: 0, sl: 0 }]);
    setAudit(a => [{ id: genId(), action: 'Tank added', user: userName, detail: `${t.name} (${t.prod}, ${t.cap.toLocaleString()}L)`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addLpgTank = useCallback((t: Omit<LPGTank, 'id' | 'op' | 'rv' | 'sl'>) => {
    const id = `L${Date.now()}`;
    setLpgTanks(ts => [...ts, { ...t, id, op: 0, rv: 0, sl: 0 }]);
    setAudit(a => [{ id: genId(), action: 'LPG tank added', user: userName, detail: `${t.name} (${t.cap.toLocaleString()} kg)`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addPump = useCallback((p: Omit<Pump, 'id'>): Pump => {
    const id = `P${Date.now()}`;
    const pump: Pump = { ...p, id };
    setPumps(ps => [...ps, pump]);
    setAudit(a => [{ id: genId(), action: 'Pump added', user: userName, detail: `${p.name} (${p.prod})`, ts: nowTs() }, ...a]);
    return pump;
  }, [userName]);

  const updateTank = useCallback((id: string, updates: Partial<Pick<Tank, 'name' | 'cap' | 'prod' | 'dip' | 'branchId'>>) => {
    setTanks(t => t.map(tank => tank.id === id ? { ...tank, ...updates } : tank));
    setAudit(a => [{ id: genId(), action: 'Tank configuration updated', user: userName, detail: `Tank ${id}: ${JSON.stringify(updates)}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const updateLpgTank = useCallback((id: string, updates: Partial<Pick<LPGTank, 'name' | 'cap' | 'branchId'>>) => {
    setLpgTanks(t => t.map(tank => tank.id === id ? { ...tank, ...updates } : tank));
    setAudit(a => [{ id: genId(), action: 'LPG tank configuration updated', user: userName, detail: `LPG Tank ${id}: ${JSON.stringify(updates)}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const updatePump = useCallback((id: string, updates: Partial<Pick<Pump, 'name' | 'prod' | 'active' | 'branchId' | 'lpgCategory'>>) => {
    setPumps(p => p.map(pump => {
      if (pump.id !== id) return pump;
      const next = { ...pump, ...updates };
      // Clear category when pump is no longer LPG
      if (next.prod !== 'LPG') next.lpgCategory = undefined;
      return next;
    }));
    setAudit(a => [{ id: genId(), action: 'Pump configuration updated', user: userName, detail: `Pump ${id}: ${JSON.stringify(updates)}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const updateStaff = useCallback((id: number, updates: Partial<Pick<Staff, 'name' | 'email' | 'sal' | 'dept' | 'branchId' | 'accountId'>>) => {
    setStaff(s => s.map(m => m.id === id ? { ...m, ...updates } : m));
    setAudit(a => [{ id: genId(), action: 'Staff record updated', user: userName, detail: `Staff ID ${id} updated`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addDip = useCallback((dip: Omit<DipRecord, 'id'>) => {
    const status = dip.status ?? 'pending';
    setDips(d => [{ ...dip, id: genId(), status, branchId: dip.branchId ?? branchId ?? undefined, submittedAt: dip.submittedAt ?? nowTs() }, ...d]);
    setAudit(a => [{ id: genId(), action: 'Dip submitted', user: userName, detail: 'All tanks dipped — awaiting MD approval.', ts: nowTs() }, ...a]);
  }, [userName, branchId]);

  const approveDip = useCallback((id: number) => {
    const rec = dips.find(r => r.id === id);
    if (rec) {
      // Snapshot tank state BEFORE resetting to compute discrepancies
      const logEntries: InventoryLogEntry[] = [];
      for (const tank of tanks) {
        const lvl = rec.rd[tank.id];
        if (lvl !== undefined) {
          const expected = getCurrentTankStock(tank, dips);
          const actual = dipReadingToLiters(lvl);
          logEntries.push({
            id: genId(),
            dipId: id,
            dt: nowTs(),
            approvedBy: userName ?? 'admin',
            tankId: tank.id,
            tankName: tank.name,
            product: tank.prod,
            opening: tank.op,
            received: tank.rv,
            sold: tank.sl,
            expected,
            actual,
            discrepancy: actual - expected,
            branchId: tank.branchId,
          });
        }
      }
      for (const tank of lpgTanks) {
        const lvl = rec.lpg[tank.id];
        if (lvl !== undefined) {
          const expected = getCurrentTankStock(tank, dips, 'lpg');
          const actual = lvl;
          logEntries.push({
            id: genId(),
            dipId: id,
            dt: nowTs(),
            approvedBy: userName ?? 'admin',
            tankId: tank.id,
            tankName: tank.name,
            product: 'LPG',
            opening: tank.op,
            received: tank.rv,
            sold: tank.sl,
            expected,
            actual,
            discrepancy: actual - expected,
            branchId: tank.branchId,
          });
        }
      }

      setTanks(ts => ts.map(tank => {
        const lvl = rec.rd[tank.id];
        return lvl !== undefined ? { ...tank, op: dipReadingToLiters(lvl), rv: 0, sl: 0 } : tank;
      }));
      setLpgTanks(ts => ts.map(lt => {
        const lvl = rec.lpg[lt.id];
        return lvl !== undefined ? { ...lt, op: lvl, rv: 0, sl: 0 } : lt;
      }));

      if (logEntries.length > 0) {
        // Send notifications for discrepancies > 50L
        const notifRoles: Role[] = ['md', 'ceo', 'acc', 'csm'];
        for (const entry of logEntries) {
          if (Math.abs(entry.discrepancy) > 50) {
            const dir = entry.discrepancy < 0 ? 'Shortage' : 'Overage';
             const unit = unitForProd(entry.product);
             const detail = `${entry.tankName} (${entry.product}): Expected ${entry.expected.toLocaleString()}${unit} · Actual ${entry.actual.toLocaleString()}${unit} · ${dir}: ${Math.abs(entry.discrepancy).toLocaleString()}${unit}`;
            for (const toRole of notifRoles) {
              const msgKey = chatKey('admin', toRole);
              setMessages(m => ({
                ...m,
                [msgKey]: [...(m[msgKey] || []), {
                  id: genId(),
                  from: 'admin',
                  to: toRole,
                  type: 'alert' as const,
                  body: detail,
                  ts: nowTs(),
                  read: false,
                  alrt: { title: `⚠️ Inventory Discrepancy — ${entry.tankName}`, pri: 'high', detail },
                } satisfies Message],
              }));
            }
          }
        }
      }
    }
    setDips(d => d.map(r => r.id === id ? { ...r, status: 'approved', approvedBy: userName, approvedDt: nowTs() } : r));
    setAudit(a => [{ id: genId(), action: 'Dip approved', user: userName, detail: `Dip record #${id} approved.`, ts: nowTs() }, ...a]);
  }, [userName, dips, tanks, lpgTanks]);

  const rejectDip = useCallback((id: number) => {
    setDips(d => d.map(rec => rec.id === id ? { ...rec, status: 'rejected', approvedBy: userName, approvedDt: nowTs() } : rec));
    setAudit(a => [{ id: genId(), action: 'Dip rejected', user: userName, detail: `Dip record #${id} rejected.`, ts: nowTs() }, ...a]);
  }, [userName]);

  const updateDip = useCallback((id: number, updates: Partial<Omit<DipRecord, 'id'>>) => {
    setDips(ds => ds.map(d => d.id === id ? { ...d, ...updates } : d));
    setAudit(a => [{ id: genId(), action: 'Dip record updated', user: userName, detail: `Dip #${id} edited`, ts: nowTs() }, ...a]);
  }, [userName]);

  const deleteDip = useCallback((id: number) => {
    setDips(ds => ds.filter(d => d.id !== id));
    setInventoryLog(log => log.filter(e => e.dipId !== id));
    setAudit(a => [{ id: genId(), action: 'Dip record deleted', user: userName, detail: `Dip #${id} deleted`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addDelivery = useCallback((rec: Omit<Delivery, 'id'>) => {
    setDeliveries(d => [{ ...rec, id: genId(), submittedAt: rec.submittedAt ?? nowTs(), branchId: rec.branchId ?? branchId ?? undefined }, ...d]);
    setAudit(a => [{ id: genId(), action: 'Delivery recorded', user: userName, detail: `${rec.prod} — ${rec.rec}L from ${rec.sup}`, ts: nowTs() }, ...a]);
  }, [userName, branchId]);

  const updateDelivery = useCallback((id: number, updates: Partial<Omit<Delivery, 'id'>>) => {
    setDeliveries(ds => ds.map(d => d.id === id ? { ...d, ...updates } : d));
    setAudit(a => [{ id: genId(), action: 'Delivery updated', user: userName, detail: `Delivery #${id} edited`, ts: nowTs() }, ...a]);
  }, [userName]);

  const deleteDelivery = useCallback((id: number) => {
    setDeliveries(ds => {
      const d = ds.find(r => r.id === id);
      if (d?.approvalStatus === 'md_approved' || d?.approvalStatus === 'approved') return ds;
      return ds.filter(r => r.id !== id);
    });
    setAudit(a => [{ id: genId(), action: 'Delivery deleted', user: userName, detail: `Delivery #${id} removed`, ts: nowTs() }, ...a]);
  }, [userName]);

  const submitDeliveryForApproval = useCallback((id: number) => {
    const d = deliveries.find(d => d.id === id);
    if (!d) return;
    setDeliveries(ds => ds.map(rec => rec.id === id ? { ...rec, approvalStatus: 'pending_acc' as const } : rec));
    setAudit(a => [{ id: genId(), action: 'Delivery forwarded to accountant', user: userName, detail: `WB: ${d.wb} — ${d.prod} ${d.rec}L from ${d.sup}`, ts: nowTs() }, ...a]);
    const msgKey = chatKey('mgr', 'acc');
    setMessages(m => ({
      ...m,
      [msgKey]: [...(m[msgKey] || []), {
        id: genId(), from: 'mgr' as Role, to: 'acc' as Role, type: 'alert' as const,
        body: `Product receipt forwarded for cost pricing: ${d.prod} ${d.rec.toLocaleString()}L from ${d.sup} (WB: ${d.wb})`,
        alrt: { title: 'Delivery Awaiting Cost Entry', pri: 'Medium', detail: `${d.prod} · ${d.rec.toLocaleString()}L · Supplier: ${d.sup} · WB: ${d.wb}` },
        ts: nowTime(), read: false,
      }],
    }));
  }, [userName, deliveries]);

  const accForwardToMd = useCallback((id: number, costPrice: number, accNote: string) => {
    const d = deliveries.find(d => d.id === id);
    if (!d) return;
    setDeliveries(ds => ds.map(rec => rec.id === id ? { ...rec, approvalStatus: 'pending_md' as const, costPrice, accNote, accBy: userName, accAt: nowTs() } : rec));
    setAudit(a => [{ id: genId(), action: 'Delivery forwarded to MD', user: userName, detail: `WB: ${d.wb} — ${d.prod} ${d.rec}L · Cost ₦${costPrice}/L`, ts: nowTs() }, ...a]);
    const msgKey = chatKey('acc', 'md');
    setMessages(m => ({
      ...m,
      [msgKey]: [...(m[msgKey] || []), {
        id: genId(), from: 'acc' as Role, to: 'md' as Role, type: 'alert' as const,
        body: `Delivery record awaiting MD approval: ${d.prod} ${d.rec.toLocaleString()}L · Cost ₦${costPrice.toLocaleString()}/L (WB: ${d.wb})`,
        alrt: { title: 'Delivery Awaiting MD Approval', pri: 'High', detail: `${d.prod} · ${d.rec.toLocaleString()}L · ₦${costPrice.toLocaleString()}/L · WB: ${d.wb}` },
        ts: nowTime(), read: false,
      }],
    }));
  }, [userName, deliveries]);

  const accRecallDelivery = useCallback((id: number) => {
    const d = deliveries.find(d => d.id === id);
    if (!d) return;
    setDeliveries(ds => ds.map(rec => rec.id === id ? { ...rec, approvalStatus: 'pending_acc' as const } : rec));
    setAudit(a => [{ id: genId(), action: 'Delivery recalled from MD', user: userName, detail: `WB: ${d.wb} — ${d.prod} ${d.rec}L`, ts: nowTs() }, ...a]);
  }, [userName, deliveries]);

  const approveDelivery = useCallback((id: number, sellingPrice: number, mdNote?: string) => {
    const d = deliveries.find(d => d.id === id);
    if (!d) return;
    const priceResult = updatePrice(d.prod, sellingPrice, userName, undefined, d.branchId);
    if (!priceResult.ok) return priceResult;
    setDeliveries(ds => ds.map(rec => rec.id === id ? { ...rec, approvalStatus: 'md_approved' as const, sellingPrice, mdNote: mdNote || '', approvedBy: userName, approvedAt: nowTs(), mdBy: userName, mdAt: nowTs() } : rec));
    setTanks(ts => {
      const matching = ts.filter(t => t.prod === d.prod && (!d.branchId || !t.branchId || t.branchId === d.branchId));
      if (matching.length === 0) return ts;
      const share = d.rec / matching.length;
      const ids = new Set(matching.map(t => t.id));
      return ts.map(t => ids.has(t.id) ? { ...t, rv: t.rv + share } : t);
    });
    // A delivery price belongs to the delivery's branch. Keep other branches
    // independent, while the global fallback remains available for branches
    // without a local override.
    // For LPG, seed both category prices in the same branch if they are unset
    // so single-buyer and distributor pumps inherit this delivery price.
    if (d.prod === 'LPG') {
      setPrices(p => {
        if (d.branchId) {
          const branch = p.branchPrices?.[d.branchId] ?? {};
          return {
            ...p,
            branchPrices: {
              ...(p.branchPrices ?? {}),
              [d.branchId]: {
                ...branch,
                LPG_Single: branch.LPG_Single || sellingPrice,
                LPG_Distributor: branch.LPG_Distributor || sellingPrice,
              },
            },
          };
        }
        return {
          ...p,
          LPG_Single: p.LPG_Single || sellingPrice,
          LPG_Distributor: p.LPG_Distributor || sellingPrice,
        };
      });
    }
    const unit = unitForProd(d.prod);
    setAudit(a => [{ id: genId(), action: 'Delivery MD-approved', user: userName, detail: `WB: ${d.wb} — ${d.prod} ${d.rec}${unit} · Cost ₦${d.costPrice}/${unit} · Sell ₦${sellingPrice}/${unit} · permanently locked`, ts: nowTs() }, ...a]);
    const msgKey = chatKey('md', 'acc');
    setMessages(m => ({
      ...m,
      [msgKey]: [...(m[msgKey] || []), {
        id: genId(), from: 'md' as Role, to: 'acc' as Role, type: 'alert' as const,
        body: `Delivery approved by MD: ${d.prod} ${d.rec.toLocaleString()}${unit} from ${d.sup} (WB: ${d.wb}). Selling price set to ₦${sellingPrice.toLocaleString()}/${unit}. Record locked.`,
        alrt: { title: 'Delivery MD Approved — Price Updated', pri: 'Low', detail: `WB: ${d.wb} · ${d.prod} · ${d.rec.toLocaleString()}${unit} · Sell ₦${sellingPrice.toLocaleString()}/${unit}` },
        ts: nowTime(), read: false,
      }],
    }));
  }, [userName, deliveries, updatePrice]);

  const rejectDelivery = useCallback((id: number, note?: string) => {
    const d = deliveries.find(d => d.id === id);
    if (!d) return;
    setDeliveries(ds => ds.map(rec => rec.id === id ? { ...rec, approvalStatus: 'pending_acc' as const, rejectedNote: note } : rec));
    setAudit(a => [{ id: genId(), action: 'Delivery rejected by MD', user: userName, detail: `WB: ${d.wb}${note ? ' — ' + note : ''} · returned to accountant`, ts: nowTs() }, ...a]);
    const msgKey = chatKey('md', 'acc');
    setMessages(m => ({
      ...m,
      [msgKey]: [...(m[msgKey] || []), {
        id: genId(), from: 'md' as Role, to: 'acc' as Role, type: 'alert' as const,
        body: `Delivery rejected: ${d.prod} WB: ${d.wb}${note ? ' — ' + note : ''}. Please revise and resubmit.`,
        alrt: { title: 'Delivery Returned by MD', pri: 'Medium', detail: note || 'No reason given' },
        ts: nowTime(), read: false,
      }],
    }));
  }, [userName, deliveries]);

  const applyMaintenanceRecord = useCallback((record: MaintenanceItem) => {
    setMaintenance(previous => {
      const exists = previous.some(item => item.taskId === record.taskId);
      const next = exists
        ? previous.map(item => item.taskId === record.taskId ? record : item)
        : [record, ...previous];
      void AsyncStorage.setItem('maintenance', JSON.stringify(next));
      return next;
    });
  }, []);

  const addMaintenance = useCallback(async (item: { title: string; pri: MaintenanceItem['pri']; date: string }) => {
    const result = await maintenanceApi.create(item);
    if (!result?.maintenance) return false;
    applyMaintenanceRecord(result.maintenance as MaintenanceItem);
    return true;
  }, [applyMaintenanceRecord]);

  const acknowledgeMaintenance = useCallback(async (taskId: string) => {
    const result = await maintenanceApi.acknowledge(taskId);
    if (!result?.maintenance) return false;
    applyMaintenanceRecord(result.maintenance as MaintenanceItem);
    return true;
  }, [applyMaintenanceRecord]);

  const assignMaintenance = useCallback(async (taskId: string, username: string) => {
    const result = await maintenanceApi.assign(taskId, username);
    if (!result?.maintenance) return false;
    applyMaintenanceRecord(result.maintenance as MaintenanceItem);
    return true;
  }, [applyMaintenanceRecord]);

  const updateMaintenanceStatus = useCallback(async (taskId: string, status: MaintenanceWorkflowStatus) => {
    const result = await maintenanceApi.updateStatus(taskId, status);
    if (!result?.maintenance) return false;
    applyMaintenanceRecord(result.maintenance as MaintenanceItem);
    return true;
  }, [applyMaintenanceRecord]);

  const addSales = useCallback((entry: Omit<SalesEntry, 'id'>) => {
    setSales(s => [...s, { ...entry, id: genId(), branchId: entry.branchId ?? branchId ?? undefined }]);
    const unit = entry.lpgCategory || entry.pump.includes('LPG') ? 'kg' : 'L';
    setAudit(a => [{ id: genId(), action: 'Sales entry', user: userName, detail: `${entry.pump} — ${entry.L}${unit}`, ts: nowTs() }, ...a]);
  }, [userName, branchId]);

  const updateSales = useCallback((id: number, updates: Partial<Pick<SalesEntry, 'pump' | 'L' | 'price' | 'pos' | 'dt'>>) => {
    setSales(s => s.map(e => e.id === id ? { ...e, ...updates } : e));
    setAudit(a => [{ id: genId(), action: 'Sales entry updated', user: userName, detail: `Sales #${id} edited`, ts: nowTs() }, ...a]);
  }, [userName]);

  const deleteSales = useCallback((id: number) => {
    setSales(s => s.filter(e => e.id !== id));
    setAudit(a => [{ id: genId(), action: 'Sales entry deleted', user: userName, detail: `Sales #${id} deleted`, ts: nowTs() }, ...a]);
  }, [userName]);

  const sendMessage = useCallback((toName: string, msg: Omit<Message, 'id' | 'from' | 'ts' | 'read'>) => {
    if (!userName) return;
    const key = chatKey(userName, toName);
    const newMsg: Message = {
      ...msg, id: genId(), from: userName, ts: nowTime(), createdAt: nowTs(), read: false,
    };
    setMessages(m => ({ ...m, [key]: [...(m[key] || []), newMsg] }));
  }, [userName]);

  const conversationKeys = useCallback((peerName: string): string[] => {
    if (!userName) return [];
    const peer = userAccounts.find(account =>
      account.empName === peerName || account.username === peerName,
    );
    const selfIds = [userName, role].filter((value): value is string => !!value);
    const peerIds = [peerName, peer?.username, peer?.role].filter((value): value is string => !!value);
    return Array.from(new Set(
      selfIds.flatMap(selfId => peerIds.map(peerId => chatKey(selfId, peerId))),
    ));
  }, [role, userAccounts, userName]);

  const markRead = useCallback((peerName: string) => {
    if (!userName) return;
    const keys = new Set(conversationKeys(peerName));
    setMessages(m => ({
      ...m,
      ...Object.fromEntries(Object.entries(m).map(([key, messages]) => [
        key,
        keys.has(key)
          ? messages.map(msg => msg.to === userName || msg.to === role ? { ...msg, read: true } : msg)
          : messages,
      ])),
    }));
  }, [conversationKeys, role, userName]);

  const setConversationArchived = useCallback((peerName: string, archived: boolean) => {
    if (!userName) return;
    const keys = new Set(conversationKeys(peerName));
    setMessages(m => ({
      ...m,
      ...Object.fromEntries(Object.entries(m).map(([key, messages]) => [
        key,
        keys.has(key)
          ? messages.map(msg => {
              const archivedBy = new Set(msg.archivedBy || []);
              if (archived) archivedBy.add(userName);
              else archivedBy.delete(userName);
              return {
                ...msg,
                archivedBy: Array.from(archivedBy),
                archiveState: {
                  ...(msg.archiveState || {}),
                  [userName]: { archived, updatedAt: nowTs() },
                },
              };
            })
          : messages,
      ])),
    }));
  }, [conversationKeys, userName]);

  const archiveConversation = useCallback((peerName: string) => {
    setConversationArchived(peerName, true);
  }, [setConversationArchived]);

  const unarchiveConversation = useCallback((peerName: string) => {
    setConversationArchived(peerName, false);
  }, [setConversationArchived]);

  const approveExpense = useCallback((id: number) => {
    setExpenses(e => e.map(x => x.id === id ? { ...x, status: 'approved', approvedBy: userName, approvedDt: nowTs() } : x));
  }, [userName]);

  const rejectExpense = useCallback((id: number) => {
    setExpenses(e => e.map(x => x.id === id ? { ...x, status: 'rejected' } : x));
  }, []);

  const addBudget = useCallback((b: Omit<Budget, 'id' | 'workflow'>) => {
    const isDraft = b.status === 'draft';
    const newBudget: Budget = {
      ...b, id: genId(), submittedAt: b.submittedAt ?? nowTs(),
      workflow: isDraft ? [] : [{ stage: 'Submitted to Accountant', by: userName, role: b.by, dt: nowTs(), action: 'submit', note: `${b.items.length} line items — ₦${b.total.toLocaleString()}` }],
    };
    setBudgets(prev => [...prev, newBudget]);
    setAudit(a => [{ id: genId(), action: isDraft ? 'Budget saved as draft' : 'Budget submitted to Accountant', user: userName, detail: `${b.label} — ₦${b.total.toLocaleString()}`, ts: nowTs() }, ...a]);
    if (!isDraft) {
      const msgKey = chatKey(b.by, 'acc');
      setMessages(m => ({
        ...m,
        [msgKey]: [...(m[msgKey] || []), {
          id: genId(), from: b.by as Role, to: 'acc' as Role, type: 'alert' as const,
          body: `Budget submitted for review: ${b.label} — ₦${b.total.toLocaleString()} (${b.items.length} items)`,
          alrt: { title: 'Budget Awaiting Accountant Review', pri: 'Medium', detail: `${b.label} · ₦${b.total.toLocaleString()} · Submitted by ${b.byName}` },
          ts: nowTime(), read: false,
        }],
      }));
    }
  }, [userName]);

  const updateBudget = useCallback((id: number, updates: { items: { cat: string; amt: number }[]; total: number; month: number; year: number; label: string; appliesOn?: string }) => {
    setBudgets(prev => prev.map(b => b.id !== id ? b : { ...b, ...updates }));
    setAudit(a => [{ id: genId(), action: 'Budget updated', user: userName, detail: `Budget #${id} edited`, ts: nowTs() }, ...a]);
  }, [userName]);

  const deleteBudget = useCallback((id: number) => {
    setBudgets(prev => prev.filter(b => b.id !== id));
    setAudit(a => [{ id: genId(), action: 'Budget deleted', user: userName, detail: `Budget #${id} removed`, ts: nowTs() }, ...a]);
  }, [userName]);

  const submitBudgetToAcc = useCallback((id: number) => {
    const b = budgets.find(b => b.id === id);
    if (!b) return;
    setBudgets(prev => prev.map(bud => bud.id !== id ? bud : {
      ...bud, status: 'submitted',
      workflow: [...bud.workflow, { stage: 'Submitted to Accountant', by: userName, role: bud.by, dt: nowTs(), action: 'submit', note: `${bud.items.length} line items — ₦${bud.total.toLocaleString()}` }],
    }));
    setAudit(a => [{ id: genId(), action: 'Budget submitted to Accountant', user: userName, detail: `${b.label} — ₦${b.total.toLocaleString()}`, ts: nowTs() }, ...a]);
    const msgKey = chatKey(b.by, 'acc');
    setMessages(m => ({
      ...m,
      [msgKey]: [...(m[msgKey] || []), {
        id: genId(), from: b.by as Role, to: 'acc' as Role, type: 'alert' as const,
        body: `Budget submitted for review: ${b.label} — ₦${b.total.toLocaleString()} (${b.items.length} items)`,
        alrt: { title: 'Budget Awaiting Accountant Review', pri: 'Medium', detail: `${b.label} · ₦${b.total.toLocaleString()} · Submitted by ${userName}` },
        ts: nowTime(), read: false,
      }],
    }));
  }, [userName, budgets]);

  const forwardBudget = useCallback((id: number, note: string) => {
    setBudgets(prev => prev.map(b => b.id !== id ? b : {
      ...b, status: 'acc_forwarded',
      workflow: [...b.workflow, { stage: 'Accountant reviewed', by: userName, role: 'acc', dt: nowTs(), action: 'forward', note }],
    }));
    setAudit(a => [{ id: genId(), action: 'Budget forwarded to MD', user: userName, detail: `Budget #${id}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const approveBudget = useCallback((id: number, note: string) => {
    setBudgets(prev => prev.map(b => b.id !== id ? b : {
      ...b, status: 'fully_approved',
      workflow: [...b.workflow, { stage: 'MD approved', by: userName, role: 'md', dt: nowTs(), action: 'approve', note }],
    }));
    setAudit(a => [{ id: genId(), action: 'Budget approved by MD', user: userName, detail: `Budget #${id}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const rejectBudget = useCallback((id: number, note: string) => {
    setBudgets(prev => prev.map(b => b.id !== id ? b : {
      ...b, status: 'rejected',
      workflow: [...b.workflow, { stage: 'Rejected', by: userName, role: 'md', dt: nowTs(), action: 'reject', note }],
    }));
    setAudit(a => [{ id: genId(), action: 'Budget rejected', user: userName, detail: `Budget #${id}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addStaff = useCallback((s: Omit<Staff, 'id'>) => {
    const id = genId();
    setStaff(st => [...st, { ...s, id }]);
    setAudit(a => [{ id: genId(), action: 'User created', user: userName, detail: `${s.name} added as ${s.role}`, ts: nowTs() }, ...a]);
    return id;
  }, [userName]);

  const toggleStaff = useCallback((id: number) => {
    setStaff(st => st.map(s => s.id === id ? { ...s, st: s.st === 'Active' ? 'Suspended' : 'Active' } : s));
  }, []);

  const deleteStaff = useCallback(async (id: number): Promise<boolean> => {
    if (role !== 'admin') return false;
    const member = staff.find(s => s.id === id);
    if (!member) return false;

    // The staff directory and the authoritative login table are separate
    // records. Delete the linked login first so a failed API request does not
    // leave the UI looking deleted while the account can still sign in.
    const linkedAccount = userAccounts.find(account =>
      (member.accountId !== undefined && account.id === member.accountId) ||
      (account.empName.trim().toLowerCase() === member.name.trim().toLowerCase() &&
        (!member.email || !account.username || `${account.username}@petrotrack.com`.toLowerCase() === member.email.trim().toLowerCase()))
    );
    if (linkedAccount) {
      const removed = await usersApi.remove(linkedAccount.id);
      if (!removed) return false;
      setUserAccounts(prev => prev.filter(account => account.id !== linkedAccount.id));
      setUserAccess(prev => {
        if (!(linkedAccount.id in prev)) return prev;
        const next = { ...prev };
        delete next[linkedAccount.id];
        return next;
      });
    }

    setStaff(st => st.filter(s => s.id !== id));
    setAudit(a => [{ id: genId(), action: 'User deleted', user: userName, detail: `Staff ID ${id} removed`, ts: nowTs() }, ...a]);
    return true;
  }, [role, staff, userAccounts, userName]);

  const addBranch = useCallback((b: Omit<Branch, 'id'>) => {
    const branch: Branch = { ...b, id: `B${genId()}` };
    setBranches(br => [...br, branch]);
    setAudit(a => [{ id: genId(), action: 'Branch created', user: userName, detail: b.name, ts: nowTs() }, ...a]);
    return branch;
  }, [userName]);

  const updateBranch = useCallback((id: string, updates: Partial<Pick<Branch, 'st' | 'mgr' | 'name' | 'pumps' | 'tanks'>>) => {
    setBranches(br => br.map(b => b.id === id ? { ...b, ...updates } : b));
    setAudit(a => [{ id: genId(), action: 'Branch updated', user: userName, detail: `Branch ${id}: ${JSON.stringify(updates)}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const deleteBranch = useCallback((id: string) => {
    setBranches(br => br.filter(b => b.id !== id));
    setAudit(a => [{ id: genId(), action: 'Branch deleted', user: userName, detail: `Branch ${id} removed`, ts: nowTs() }, ...a]);
  }, [userName]);

  const deleteTank = useCallback((id: string) => {
    setTanks(t => t.filter(tank => tank.id !== id));
    setAudit(a => [{ id: genId(), action: 'Tank deleted', user: userName, detail: `Tank ${id} removed`, ts: nowTs() }, ...a]);
  }, [userName]);

  const deleteLpgTank = useCallback((id: string) => {
    setLpgTanks(t => t.filter(tank => tank.id !== id));
    setAudit(a => [{ id: genId(), action: 'LPG tank deleted', user: userName, detail: `LPG Tank ${id} removed`, ts: nowTs() }, ...a]);
  }, [userName]);

  const deletePump = useCallback((id: string) => {
    setPumps(p => p.filter(pump => pump.id !== id));
    setAudit(a => [{ id: genId(), action: 'Pump deleted', user: userName, detail: `Pump ${id} removed`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addDepartment = useCallback((d: Omit<Department, 'id' | 'sys'>) => {
    setDepartments(ds => [...ds, { ...d, id: `dept${genId()}`, sys: false }]);
    setAudit(a => [{ id: genId(), action: 'Department created', user: userName, detail: d.name, ts: nowTs() }, ...a]);
  }, [userName]);

  const updateDepartment = useCallback((id: string, updates: Partial<Pick<Department, 'name' | 'icon' | 'col' | 'roles'>>) => {
    setDepartments(ds => ds.map(d => d.id === id ? { ...d, ...updates } : d));
    setAudit(a => [{ id: genId(), action: 'Department updated', user: userName, detail: `Department ${id} updated`, ts: nowTs() }, ...a]);
  }, [userName]);

  const assignStaffDept = useCallback((sid: number, deptId: string | null) => {
    setStaff(s => s.map(m => m.id === sid ? { ...m, dept: deptId ?? undefined } : m));
    setAudit(a => [{ id: genId(), action: 'Staff posted to department', user: userName, detail: `Staff #${sid} → ${deptId ?? 'unassigned'}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const deleteDepartment = useCallback((id: string) => {
    setDepartments(ds => ds.filter(d => d.id !== id || d.sys));
    setAudit(a => [{ id: genId(), action: 'Department deleted', user: userName, detail: `Department ${id} removed`, ts: nowTs() }, ...a]);
  }, [userName]);

  const refreshUsers = useCallback(async () => {
    const rows = await usersApi.list();
    if (rows) setUserAccounts(rows.map(apiRowToUserAccount));
  }, []);

  const addUserAccount = useCallback((acc: Omit<UserAccount, 'id' | 'createdAt' | 'status' | 'username' | 'password' | 'role'>) => {
    const localId = genId();
    setUserAccounts(prev => [...prev, { ...acc, id: localId, createdAt: nowTs(), status: 'pending', username: '', password: '', role: null }]);
    // Persist to DB immediately so admin can track pending requests
    usersApi.create({ empName: acc.empName, empId: acc.empId, branchId: acc.branchId, jobTitle: acc.jobTitle, dept: acc.dept, status: 'pending' })
      .then(row => { if (row) setUserAccounts(prev => prev.map(a => a.id === localId ? apiRowToUserAccount(row) : a)); });
  }, []);

  const addActiveUserAccount = useCallback(async (acc: { empName: string; username: string; password: string; role: Role; branchId?: string | null; jobTitle?: string; dept?: string; phoneNumber?: string; createdBy: string }): Promise<number | null> => {
    // Send plaintext — server hashes via ensureHashed
    const row = await usersApi.create({
      empName: acc.empName, username: acc.username, password: acc.password,
      role: acc.role, branchId: acc.branchId, jobTitle: acc.jobTitle,
      dept: acc.dept, phoneNumber: acc.phoneNumber ?? null, status: 'active',
    });
    if (row) {
      setUserAccounts(prev => [...prev, apiRowToUserAccount(row)]);
      setAudit(a => [{ id: genId(), action: 'Account created', user: acc.createdBy, detail: `Login created for ${acc.empName} (${acc.username}) as ${acc.role}`, ts: nowTs() }, ...a]);
      return row.id;
    } else {
      // Offline fallback: keep in local state until connectivity restored
      const localId = genId();
      setUserAccounts(prev => [...prev, {
        id: localId, createdAt: nowTs(), status: 'active',
        approvedBy: acc.createdBy, approvedAt: nowTs(),
        empName: acc.empName, username: acc.username, password: '',
        role: acc.role, branchId: acc.branchId, jobTitle: acc.jobTitle, dept: acc.dept,
        phoneNumber: acc.phoneNumber, createdBy: acc.createdBy,
      }]);
      setAudit(a => [{ id: genId(), action: 'Account created', user: acc.createdBy, detail: `Login created for ${acc.empName} (${acc.username}) as ${acc.role}`, ts: nowTs() }, ...a]);
      return localId;
    }
  }, []);

  const updateUserAccount = useCallback(async (id: number, updates: { username?: string; password?: string; role?: Role; branchId?: string | null; phoneNumber?: string }, by: string) => {
    // Send plaintext password — server hashes via ensureHashed
    const resolved: Record<string, unknown> = { ...updates };
    // Write to DB so login works on all devices immediately
    const row = await usersApi.update(id, resolved as Parameters<typeof usersApi.update>[1]);
    if (row) {
      setUserAccounts(prev => prev.map(a => a.id === id ? { ...apiRowToUserAccount(row), password: a.password } : a));
    } else {
      setUserAccounts(prev => prev.map(a => a.id === id ? { ...a, ...resolved } : a));
    }
    setAudit(a => [{ id: genId(), action: 'Account updated', user: by, detail: `Account #${id} credentials/role updated`, ts: nowTs() }, ...a]);
  }, []);

  const changeOwnPassword = useCallback(async (currentPassword: string, newPassword: string): Promise<boolean> => {
    const acc = userAccounts.find(a => a.username === userName);
    if (!acc) return false;
    // API responses never include passwords — skip local check, server validates on next login
    // Send plaintext; server hashes via ensureHashed
    await usersApi.update(acc.id, { password: newPassword });
    setAudit(a => [{ id: genId(), action: 'Password changed', user: userName, detail: `${userName} changed their own password`, ts: nowTs() }, ...a]);
    return true;
  }, [userAccounts, userName]);

  const enrollStaff = useCallback(async (acc: { empName: string; jobTitle?: string; dept?: string; branchId?: string; phoneNumber?: string; nin?: string; staffAddress?: string; guarantorName?: string; guarantorPhone?: string; guarantorAddress?: string; employmentDocs?: string[] }, by: string, initialStatus: AccountStatus = 'pending_md') => {
    const empId = generateEmpId(userAccounts);
    const row = await usersApi.create({
      empName:          acc.empName,
      empId,
      branchId:         acc.branchId         ?? null,
      jobTitle:         acc.jobTitle         ?? null,
      dept:             acc.dept             ?? null,
      phoneNumber:      acc.phoneNumber      ?? null,
      nin:              acc.nin              ?? null,
      staffAddress:     acc.staffAddress     ?? null,
      guarantorName:    acc.guarantorName    ?? null,
      guarantorPhone:   acc.guarantorPhone   ?? null,
      guarantorAddress: acc.guarantorAddress ?? null,
      employmentDocs:   acc.employmentDocs   ?? [],
      status:           initialStatus,
    });
    if (row) {
      setUserAccounts(prev => [...prev, apiRowToUserAccount(row)]);
    } else {
      setUserAccounts(prev => [...prev, {
        id: genId(), createdAt: nowTs(), status: initialStatus,
        empName: acc.empName, empId, username: '', password: '', role: null,
        branchId: acc.branchId, jobTitle: acc.jobTitle, dept: acc.dept,
        phoneNumber: acc.phoneNumber, nin: acc.nin,
        staffAddress: acc.staffAddress, guarantorName: acc.guarantorName,
        guarantorPhone: acc.guarantorPhone, guarantorAddress: acc.guarantorAddress,
        employmentDocs: acc.employmentDocs, createdBy: by,
      }]);
    }
    const dest = initialStatus === 'pending_admin' ? 'Admin' : 'MD';
    setAudit(a => [{ id: genId(), action: 'Staff enrolled', user: by, detail: `${acc.empName} (${empId}) enrolled — forwarded to ${dest} for approval`, ts: nowTs() }, ...a]);
  }, [userAccounts]);

  const mdApproveEnrollment = useCallback(async (id: number, by: string) => {
    const row = await usersApi.setStatus(id, 'pending_admin');
    if (row) {
      setUserAccounts(prev => prev.map(a => a.id === id ? apiRowToUserAccount(row) : a));
    } else {
      setUserAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'pending_admin' as AccountStatus } : a));
    }
    setAudit(a => [{ id: genId(), action: 'Enrollment approved by MD', user: by, detail: `Enrollment #${id} forwarded to Admin for account creation`, ts: nowTs() }, ...a]);
  }, []);

  const mdRejectEnrollment = useCallback(async (id: number, by: string) => {
    await usersApi.setStatus(id, 'rejected', { rejectedBy: by });
    setUserAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'rejected' as AccountStatus } : a));
    setAudit(a => [{ id: genId(), action: 'Enrollment rejected by MD', user: by, detail: `Enrollment #${id} rejected`, ts: nowTs() }, ...a]);
  }, []);

  const updateEnrollmentData = useCallback(async (id: number, data: { empName?: string; jobTitle?: string; dept?: string; phoneNumber?: string; nin?: string; staffAddress?: string; guarantorName?: string; guarantorPhone?: string; guarantorAddress?: string }, by: string): Promise<boolean> => {
    const row = await usersApi.update(id, data);
    if (!row) return false;
    setUserAccounts(prev => prev.map(a => a.id === id ? apiRowToUserAccount(row) : a));
    setAudit(a => [{ id: genId(), action: 'Enrollment data updated', user: by, detail: `Enrollment #${id} details updated by admin`, ts: nowTs() }, ...a]);
    return true;
  }, []);

  const approveUserAccount = useCallback(async (id: number, role: Role, username: string, password: string, by: string, branchId?: string | null) => {
    // Send plaintext password — server hashes via ensureHashed, new user can log in immediately
    const row = await usersApi.setStatus(id, 'active', { username, password, role, branchId });
    const activated = row ? apiRowToUserAccount(row) : null;
    if (row) {
      setUserAccounts(prev => prev.map(a => a.id === id ? apiRowToUserAccount(row) : a));
    } else {
      setUserAccounts(prev => prev.map(a => {
        if (a.id !== id) return a;
        return { ...a, role, username, password: '', status: 'active', approvedBy: by, approvedAt: nowTs(), branchId: branchId ?? a.branchId };
      }));
    }
    // Auto-add to staff directory and HR records on activation
    if (role !== 'admin') {
      const empName  = activated?.empName ?? '';
      const dept     = activated?.dept;
      const phone    = activated?.phoneNumber ?? '';
      const empIdVal = activated?.empId;
      setStaff(prev => {
        if (prev.some(s => s.name === empName)) return prev;
         return [...prev, { id: genId(), accountId: id, name: empName, role, sal: 0, st: 'Active', email: `${username}@petrotrack.com`, dept, branchId: branchId ?? undefined }];
      });
      setHrEmployees(prev => {
        if (prev.some(e => e.name === empName)) return prev;
        const serial  = prev.length + 1;
        const hEmpId  = empIdVal ?? ('PTNG-' + String(serial).padStart(4, '0'));
        return [...prev, {
          id: genId(), empId: hEmpId, serial, name: empName, role,
          dept: dept ?? '', phone, email: `${username}@petrotrack.com`,
          address: '', dob: '', joinDate: nowTs(), nextOfKin: '',
          status: 'active' as const, docs: [], uploads: [],
          onboarding: { status: 'draft' as OnboardingStatus }, letters: [],
        }];
      });
    }
    setAudit(a => [{ id: genId(), action: 'Account approved', user: by, detail: `Account for ${username} approved as ${role}`, ts: nowTs() }, ...a]);
  }, []);

  const suspendUserAccount = useCallback(async (id: number) => {
    await usersApi.setStatus(id, 'suspended');
    setUserAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'suspended' } : a));
  }, []);

  const reactivateUserAccount = useCallback(async (id: number) => {
    await usersApi.setStatus(id, 'active');
    setUserAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'active' } : a));
  }, []);

  const rejectUserAccount = useCallback(async (id: number) => {
    await usersApi.setStatus(id, 'rejected');
    setUserAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'rejected' } : a));
  }, []);

  const rejectEnrollmentWithReason = useCallback(async (id: number, reason: string, by: string) => {
    await usersApi.setStatus(id, 'rejected', { rejectionReason: reason, rejectedBy: by });
    setUserAccounts(prev => {
      const acc = prev.find(a => a.id === id);
      const next = prev.map(a => a.id === id
        ? { ...a, status: 'rejected' as AccountStatus, rejectionReason: reason, rejectedBy: by, rejectedAt: nowTs() }
        : a
      );
      if (acc) {
        const msgKey = chatKey('admin', 'csm');
        setMessages(m => ({
          ...m,
          [msgKey]: [...(m[msgKey] || []), {
            id: genId(), from: 'admin' as Role, to: 'csm' as Role, type: 'alert' as const,
            body: `Enrollment rejected: ${acc.empName} — "${reason}"`,
            alrt: { title: 'Enrollment Rejected by Admin', pri: 'High' as const, detail: `${acc.empName} (${acc.empId ?? ''}) — Reason: ${reason}. Please update and re-submit.` },
            ts: nowTime(), read: false,
          }],
        }));
        setAudit(a => [{ id: genId(), action: 'Enrollment rejected by Admin', user: by, detail: `${acc.empName} — ${reason}`, ts: nowTs() }, ...a]);
      }
      return next;
    });
  }, []);

  const resubmitEnrollment = useCallback(async (id: number, updates: { empName?: string; jobTitle?: string; dept?: string; phoneNumber?: string; nin?: string; staffAddress?: string; guarantorName?: string; guarantorPhone?: string; guarantorAddress?: string }, by: string): Promise<boolean> => {
    if (Object.keys(updates).length > 0) {
      const updated = await usersApi.update(id, updates);
      if (!updated) return false;
    }
    const row = await usersApi.setStatus(id, 'pending_admin');
    if (!row) return false;
    setUserAccounts(prev => prev.map(a => a.id === id
      ? { ...apiRowToUserAccount(row), ...updates, status: 'pending_admin' as AccountStatus, rejectionReason: undefined, rejectedBy: undefined, rejectedAt: undefined }
      : a
    ));
    setAudit(a => [{ id: genId(), action: 'Enrollment resubmitted', user: by, detail: `${updates.empName ?? 'Enrollment'} re-submitted for Admin review`, ts: nowTs() }, ...a]);
    return true;
  }, []);

  const deleteUserAccount = useCallback(async (id: number): Promise<boolean> => {
    const account = userAccounts.find(a => a.id === id);
    // Admin may remove any record; HR retains its existing rejected-enrollment
    // cleanup permission, which the API enforces independently.
    if (role !== 'admin' && !(role === 'csm' && account?.status === 'rejected')) return false;
    const removed = await usersApi.remove(id);
    if (!removed) return false;
    setUserAccounts(prev => prev.filter(a => a.id !== id));
    setStaff(prev => prev.filter(member =>
      member.accountId !== id &&
      !(account && member.name.trim().toLowerCase() === account.empName.trim().toLowerCase() &&
        (!member.email || !account.username || `${account.username}@petrotrack.com`.toLowerCase() === member.email.trim().toLowerCase()))
    ));
    setUserAccess(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setAudit(a => [{ id: genId(), action: 'Account deleted', user: userName, detail: `User account #${id} permanently removed`, ts: nowTs() }, ...a]);
    return true;
  }, [role, userAccounts, userName]);

  const validateCredentials = useCallback(async (username: string, password: string): Promise<UserAccount | null> => {
    const candidates = userAccounts.filter(a => a.username === username && a.status === 'active');
    for (const acc of candidates) {
      const ok = await verifyPassword(password, acc.password);
      if (ok) return acc;
    }
    return null;
  }, [userAccounts]);

  const addAudit = useCallback((entry: Omit<AuditEntry, 'id' | 'ts'>) => {
    setAudit(a => [{ ...entry, id: genId(), ts: nowTs() }, ...a]);
  }, []);

  const addShiftHandoverNote = useCallback((body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    const note: ShiftHandoverNote = { id: genId(), body: trimmed, by: userName, ts: nowTs(), branchId: branchId ?? undefined };
    setHandoverNotes(notes => [note, ...notes]);
    setAudit(a => [{ id: genId(), action: 'Shift handover note added', user: userName, detail: trimmed, ts: nowTs() }, ...a]);
  }, [branchId, userName]);

  const addTask = useCallback((t: Omit<Task, 'id' | 'createdAt'>) => {
    setTasks(ts => [...ts, { ...t, id: genId(), createdAt: nowTs() }]);
    setAudit(a => [{ id: genId(), action: 'Task assigned', user: userName, detail: `"${t.title}" → ${t.assignedToName}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const updateTaskStatus = useCallback((id: number, status: TaskStatus) => {
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status } : t));
    setAudit(a => [{ id: genId(), action: 'Task status updated', user: userName, detail: `Task #${id} → ${status}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const deleteTask = useCallback((id: number) => {
    setTasks(ts => ts.filter(t => t.id !== id));
    setAudit(a => [{ id: genId(), action: 'Task deleted', user: userName, detail: `Task #${id} removed`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addKpi = useCallback((k: Omit<KPI, 'id' | 'createdAt'>) => {
    setKpis(ks => [...ks, { ...k, id: genId(), createdAt: nowTs() }]);
    setAudit(a => [{ id: genId(), action: 'KPI set', user: userName, detail: `"${k.title}" → ${k.assignedToName}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const deleteKpi = useCallback((id: number) => {
    setKpis(ks => ks.filter(k => k.id !== id));
    setAudit(a => [{ id: genId(), action: 'KPI removed', user: userName, detail: `KPI #${id} deleted`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addExpense = useCallback((exp: Omit<Expense, 'id' | 'status' | 'submittedAt'>) => {
    setExpenses(e => [...e, { ...exp, id: genId(), submittedAt: nowTs(), status: 'pending', branchId: exp.branchId ?? branchId ?? undefined }]);
    setAudit(a => [{ id: genId(), action: 'Expense submitted', user: userName, detail: `${exp.cat} — ₦${exp.amt.toLocaleString()}`, ts: nowTs() }, ...a]);
  }, [userName, branchId]);

  const updateExpense = useCallback((id: number, updates: Partial<Pick<Expense, 'cat' | 'desc' | 'amt' | 'ref' | 'dt'>>) => {
    setExpenses(e => e.map(x => x.id === id ? { ...x, ...updates } : x));
    setAudit(a => [{ id: genId(), action: 'Expense updated', user: userName, detail: `Expense #${id} edited`, ts: nowTs() }, ...a]);
  }, [userName]);

  const deleteExpense = useCallback((id: number) => {
    setExpenses(e => e.filter(x => x.id !== id));
    setAudit(a => [{ id: genId(), action: 'Expense deleted', user: userName, detail: `Expense #${id} removed`, ts: nowTs() }, ...a]);
  }, [userName]);

  const forwardExpenseToMD = useCallback((id: number, note?: string) => {
    const exp = expenses.find(e => e.id === id);
    if (!exp) return;
    setExpenses(e => e.map(x => x.id === id ? { ...x, status: 'acc_forwarded' as const } : x));
    setAudit(a => [{ id: genId(), action: 'Expense forwarded to MD', user: userName, detail: `${exp.cat} — ₦${exp.amt.toLocaleString()}${note ? ' · ' + note : ''}`, ts: nowTs() }, ...a]);
    const msgKey = chatKey('acc', 'md');
    setMessages(m => ({
      ...m,
      [msgKey]: [...(m[msgKey] || []), {
        id: genId(), from: 'acc' as Role, to: 'md' as Role, type: 'alert' as const,
        body: `Expense forwarded for approval: ${exp.cat} — ₦${exp.amt.toLocaleString()} by ${exp.byName}`,
        alrt: { title: 'Expense Awaiting MD Approval', pri: 'Medium', detail: `${exp.cat} · ₦${exp.amt.toLocaleString()} · ${exp.desc}${note ? '\nNote: ' + note : ''}` },
        ts: nowTime(), read: false,
      }],
    }));
  }, [userName, expenses]);

  const addCompanyFile = useCallback((file: Omit<CompanyFile, 'id' | 'dt'>) => {
    setCompanyFiles(f => [...f, { ...file, id: genId(), dt: nowTs() }]);
    setAudit(a => [{ id: genId(), action: 'File uploaded', user: userName, detail: `${file.name} (${file.cat})`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addMyFolder = useCallback((section: MyFolderSection, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setMyFolders(prev => [
      ...prev,
      { id: genId(), section, name: trimmed, createdBy: userName || 'System', createdAt: nowTs() },
    ]);
  }, [userName]);

  const addMyFolderFile = useCallback((file: Omit<MyFolderFile, 'id' | 'uploadedAt'>) => {
    setMyFolderFiles(prev => [...prev, { ...file, id: genId(), uploadedAt: nowTs() }]);
    setAudit(a => [{
      id: genId(),
      action: 'My Documents file uploaded',
      user: userName,
      detail: `${file.name} (${file.mimeType})`,
      ts: nowTs(),
    }, ...a]);
  }, [userName]);

  const removeMyFolderFile = useCallback((id: number) => {
    // Keep a tombstone in the shared slice so a stale device cannot
    // resurrect a file after another user deletes it.
    setMyFolderFiles(prev => prev.map(file =>
      file.id === id ? { ...file, deletedAt: nowTs() } : file,
    ));
    setAudit(a => [{
      id: genId(),
      action: 'My Documents file deleted',
      user: userName,
      detail: `File #${id}`,
      ts: nowTs(),
    }, ...a]);
  }, [userName]);

  const replaceMyFolderFile = useCallback((id: number, file: Omit<MyFolderFile, 'id' | 'uploadedAt'>) => {
    setMyFolderFiles(prev => prev.map(existing =>
      existing.id === id ? { ...file, id, uploadedAt: nowTs() } : existing,
    ));
    setAudit(a => [{
      id: genId(),
      action: 'My Documents file replaced',
      user: userName,
      detail: `${file.name} (${file.mimeType})`,
      ts: nowTs(),
    }, ...a]);
  }, [userName]);

  const addStartupStock = useCallback((stock: { product: StockProduct; quantity: number; branchId: string }) => {
    if (role !== 'admin' || !Number.isFinite(stock.quantity) || stock.quantity < 0 || !stock.branchId) return;
    const branchId = stock.branchId;
    setStartupStocks(prev => {
      if (prev.some(item => item.product === stock.product && item.branchId === branchId)) return prev;
      return [...prev, {
        id: `startup-${genId()}`,
        product: stock.product,
        quantity: stock.quantity,
        branchId,
        setBy: userName,
        setAt: nowTs(),
        locked: true,
      }];
    });
    setAudit(a => [{
      id: genId(),
      action: 'Start-up stock set',
      user: userName,
      detail: `${stock.product} · ${stock.quantity.toLocaleString()} ${unitForProd(stock.product)} · branch ${branchId}`,
      ts: nowTs(),
    }, ...a]);
  }, [role, userName]);

  const updateStartupStock = useCallback((id: string, quantity: number) => {
    if (role !== 'admin' || !Number.isFinite(quantity) || quantity < 0) return;
    setStartupStocks(prev => prev.map(item => item.id === id
      ? { ...item, quantity, locked: true, setBy: userName, setAt: nowTs() }
      : item
    ));
    setAudit(a => [{ id: genId(), action: 'Start-up stock updated', user: userName, detail: `Start-up stock #${id} updated to ${quantity.toLocaleString()}`, ts: nowTs() }, ...a]);
  }, [role, userName]);

  const deleteStartupStock = useCallback((id: string) => {
    if (role !== 'admin') return;
    setStartupStocks(prev => prev.filter(item => item.id !== id));
    setAudit(a => [{ id: genId(), action: 'Start-up stock deleted', user: userName, detail: `Start-up stock #${id} removed`, ts: nowTs() }, ...a]);
  }, [role, userName]);

  const upsertStockLogs = useCallback((entries: Omit<StockLogEntry, 'id' | 'createdBy' | 'createdAt'>[]) => {
    if (entries.length === 0) return;
    const createdAt = nowTs();
    setStockLogs(prev => {
      const next = new Map<string, StockLogEntry>(
        prev.map(entry => [`${entry.branchId}|${entry.product}|${entry.businessDate}`, entry]),
      );
      entries.forEach(entry => {
        const key = `${entry.branchId}|${entry.product}|${entry.businessDate}`;
        const existing = next.get(key);
        next.set(key, {
          ...entry,
          id: existing?.id ?? `stock-log-${genId()}`,
          createdBy: existing?.createdBy ?? userName,
          createdAt: existing?.createdAt ?? createdAt,
          updatedBy: userName,
          updatedAt: createdAt,
        });
      });
      return Array.from(next.values()).sort((a, b) =>
        b.businessDate.localeCompare(a.businessDate) || a.branchId.localeCompare(b.branchId) || a.product.localeCompare(b.product),
      );
    });
    setAudit(a => [{
      id: genId(),
      action: 'Stock log created',
      user: userName,
      detail: `${entries.length} branch/product stock calculation${entries.length === 1 ? '' : 's'} recorded.`,
      ts: createdAt,
    }, ...a]);
  }, [userName]);

  const addDeliveryEvidence = useCallback((ev: Omit<DeliveryEvidence, 'id' | 'dt'>) => {
    setDeliveryEvidences(e => [...e, { ...ev, id: genId(), dt: nowTs() }]);
    setAudit(a => [{ id: genId(), action: 'Delivery evidence added', user: userName, detail: `${ev.name} for delivery #${ev.delivId}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const setPumpInitialMeter = useCallback((pumpId: string, meter: number) => {
    setPumpInitialMeters(m => ({ ...m, [pumpId]: meter }));
    setAudit(a => [{ id: genId(), action: 'Pump initial meter set', user: userName, detail: `Pump ${pumpId}: ${meter.toLocaleString()} L`, ts: nowTs() }, ...a]);
  }, [userName]);

  const lockPumpMeter = useCallback((pumpId: string, meter: number) => {
    setPumpLockedMeters(m => ({ ...m, [pumpId]: meter }));
    setAudit(a => [{ id: genId(), action: 'Pump opening meter locked', user: userName, detail: `Pump ${pumpId}: ${meter.toLocaleString()} L (opening meter pinned by admin)`, ts: nowTs() }, ...a]);
  }, [userName]);

  const unlockPumpMeter = useCallback((pumpId: string) => {
    setPumpLockedMeters(m => { const n = { ...m }; delete n[pumpId]; return n; });
    setAudit(a => [{ id: genId(), action: 'Pump opening meter unlocked', user: userName, detail: `Pump ${pumpId}: opening meter released to auto-carry`, ts: nowTs() }, ...a]);
  }, [userName]);

  const resetOperationalData = useCallback(async () => {
    // Compute seed meters locally BEFORE we clear anything, using the same logic as the
    // shift report screen: the latest manager-approved closing meter wins, then a
    // configured lock, then the existing pumpInitialMeters value.
    const localSeedMeters: Record<string, number> = {};
    for (const pump of pumps) {
      if (!pump?.id) continue;
      const pumpId = pump.id;
      const latestValidatedReport = getLatestValidatedPumpReport(pumpDailyReports, pumpId);
      if (latestValidatedReport) {
        localSeedMeters[pumpId] = Number(latestValidatedReport.closingMeter);
        continue;
      }
      if (pumpLockedMeters[pumpId] !== undefined) {
        localSeedMeters[pumpId] = Number(pumpLockedMeters[pumpId]);
        continue;
      }
      if (pumpInitialMeters[pumpId] !== undefined) {
        localSeedMeters[pumpId] = Number(pumpInitialMeters[pumpId]);
      }
    }

    // Ask the server to clear the authoritative server copy and compute its own seed meters.
    // If the server has no shift reports, we still have the locally computed seed meters.
    await stateApi.resetOperational();

    // Clear local operational data so the device mirrors the freshly reset server state.
    setSales([]);
    setExpenses([]);
    setBudgets([]);
    setDips([]);
    setDeliveries([]);
    setMaintenance([]);
    setMessages({});
    setTasks([]);
    setKpis([]);
    setCompanyFiles([]);
    setDeliveryEvidences([]);
    setHrEmployees([]);
    setHrHandbooks([]);
    setHrRecommendations([]);
    setPriceProposals([]);
    setLegalMatters([]);
    setCorpProjects([]);
    setMeetingMinutes([]);
    setBroadcasts([]);
    setCallLog([]);
    setPumpDailyReports([]);
    setPumpLockedMeters({});
    setPriceHistory([]);
    setFinancialEntry(INIT_FINANCIAL_ENTRY);
    // Apply the preserved pump seed meters so the next shift reports start from the last known readings.
    setPumpInitialMeters(localSeedMeters);
    // Audit must be written AFTER the arrays are cleared, not before, so it survives the reset.
    setAudit(a => [{ id: genId(), action: 'Operational data reset', user: userName, detail: `All operational data cleared via System Settings; pump seed meters preserved for ${Object.keys(localSeedMeters).length} pump(s).`, ts: nowTs() }, ...a]);
  }, [userName, pumps, pumpDailyReports, pumpInitialMeters, pumpLockedMeters]);

  const submitPumpReport = useCallback((r: Omit<PumpDailyReport, 'id' | 'status' | 'submittedAt'>) => {
    const reportId = genId();
    setPumpDailyReports(rs => [...rs, { ...r, id: reportId, status: 'pending_manager', submittedAt: nowTs() }]);
    setAudit(a => [{ id: genId(), action: 'Pump report submitted', user: userName, detail: `${r.pumpName} · ${r.liters.toLocaleString()}L · variance: ₦${r.variance.toLocaleString()}`, ts: nowTs() }, ...a]);
    void notificationsApi.send({
      target: 'mgr',
      branchId: r.branchId,
      type: 'report_attention',
      title: 'Pump Report Awaiting Review',
      body: `${r.submittedByName} submitted ${r.pumpName} for manager review.`,
      data: { route: SCREEN_ROUTES.shift, reportId },
    });
  }, [userName]);

  const mgrForwardPumpReport = useCallback((id: number, mgrNote: string) => {
    const report = pumpDailyReports.find(r => r.id === id);
    // Only reports awaiting manager review may be forwarded — this also keeps
    // approved reports permanently locked against re-entering the workflow.
    if (!report || report.status !== 'pending_manager') return;
    setPumpDailyReports(rs => rs.map(r => r.id === id && r.status === 'pending_manager' ? { ...r, status: 'pending_accountant', mgrNote, mgrBy: userName, mgrAt: nowTs() } : r));
    setAudit(a => [{ id: genId(), action: 'Pump report forwarded to accountant', user: userName, detail: `Report #${id} — ${mgrNote}`, ts: nowTs() }, ...a]);
    if (report) void notificationsApi.send({
      target: 'acc',
      type: 'report_attention',
      title: 'Pump Report Awaiting Accountant Review',
      body: `${report.submittedByName}'s ${report.pumpName} report was forwarded for approval.`,
      data: { route: SCREEN_ROUTES.shift, reportId: id },
    });
  }, [userName, pumpDailyReports]);

  const mgrResubmitPumpReport = useCallback((id: number, mgrNote: string) => {
    const report = pumpDailyReports.find(r => r.id === id);
    // Only accountant-rejected reports may be re-submitted; approved reports
    // stay permanently locked.
    if (!report || report.status !== 'returned') return;
    setPumpDailyReports(rs => rs.map(r => r.id === id && r.status === 'returned' ? { ...r, status: 'pending_accountant', mgrNote, mgrBy: userName, mgrAt: nowTs(), rejectionReason: undefined } : r));
    setAudit(a => [{ id: genId(), action: 'Pump report re-submitted to accountant', user: userName, detail: `Report #${id} — ${mgrNote}`, ts: nowTs() }, ...a]);
    if (report) void notificationsApi.send({
      target: 'acc',
      type: 'report_attention',
      title: 'Pump Report Re-submitted',
      body: `${report.submittedByName}'s ${report.pumpName} report is ready for accountant approval.`,
      data: { route: SCREEN_ROUTES.shift, reportId: id },
    });
  }, [userName, pumpDailyReports]);

  const mgrReturnPumpReportToAttendant = useCallback((id: number, mgrNote: string) => {
    const report = pumpDailyReports.find(r => r.id === id);
    // Only accountant-rejected reports can be pushed back to the attendant.
    if (!report || report.status !== 'returned') return;
    setPumpDailyReports(rs => rs.map(r => r.id === id ? { ...r, status: 'returned_attendant', mgrNote, mgrBy: userName, mgrAt: nowTs() } : r));
    setAudit(a => [{ id: genId(), action: 'Pump report returned to attendant', user: userName, detail: `Report #${id} — ${mgrNote}`, ts: nowTs() }, ...a]);
    void notificationsApi.send({
      target: report.submittedBy,
      type: 'report_update',
      title: 'Pump Report Sent Back to You',
      body: `${report.pumpName} · ${report.date} needs correction: ${mgrNote}`,
      data: { route: SCREEN_ROUTES.shift, reportId: id },
    });
  }, [userName, pumpDailyReports]);

  const attResubmitPumpReport = useCallback((id: number, note: string) => {
    const report = pumpDailyReports.find(r => r.id === id);
    // Only reports sitting with the attendant can be re-submitted, and only by
    // the attendant who originally generated the report.
    if (!report || report.status !== 'returned_attendant' || report.submittedBy !== userName) return;
    setPumpDailyReports(rs => rs.map(r => r.id === id
      ? { ...r, status: 'pending_manager', note: note || r.note, submittedAt: nowTs(), rejectionReason: undefined }
      : r
    ));
    setAudit(a => [{ id: genId(), action: 'Pump report re-submitted by attendant', user: userName, detail: `Report #${id} — ${report.pumpName}`, ts: nowTs() }, ...a]);
    void notificationsApi.send({
      target: 'mgr',
      branchId: report.branchId,
      type: 'report_attention',
      title: 'Corrected Pump Report Re-submitted',
      body: `${report.submittedByName} re-submitted ${report.pumpName} for manager review.`,
      data: { route: SCREEN_ROUTES.shift, reportId: id },
    });
  }, [userName, pumpDailyReports]);

  const reverseApprovedPumpReportEffects = useCallback((report: PumpDailyReport) => {
    const pump = pumps.find(candidate => candidate.id === report.pumpId);
    const resolvedBranchId = report.branchId || pump?.branchId || '';
    setSales(entries => entries.filter(entry => entry.shiftReportId !== report.id));
    if (report.product === 'LPG') {
      setLpgTanks(entries => {
        const matching = entries.filter(tank => !resolvedBranchId || !tank.branchId || tank.branchId === resolvedBranchId);
        if (matching.length === 0) return entries;
        const share = report.liters / matching.length;
        const matchingIds = new Set(matching.map(tank => tank.id));
        return entries.map(tank => matchingIds.has(tank.id)
          ? { ...tank, sl: Math.max(0, tank.sl - share) }
          : tank
        );
      });
      return;
    }
    setTanks(entries => {
      const matching = entries.filter(tank =>
        tank.prod === report.product &&
        (!resolvedBranchId || !tank.branchId || tank.branchId === resolvedBranchId)
      );
      if (matching.length === 0) return entries;
      const share = report.liters / matching.length;
      const matchingIds = new Set(matching.map(tank => tank.id));
      return entries.map(tank => matchingIds.has(tank.id)
        ? { ...tank, sl: Math.max(0, tank.sl - share) }
        : tank
      );
    });
  }, [pumps]);

  const adminReturnApprovedPumpReport = useCallback((id: number, note: string): boolean => {
    if (role !== 'admin') return false;
    const report = pumpDailyReports.find(candidate => candidate.id === id);
    const returnNote = note.trim();
    if (!report || report.status !== 'approved' || !returnNote) return false;

    const returnedAt = nowTs();
    appliedPumpReportApprovals.current.delete(id);
    setPumpDailyReports(reports => reports.map(candidate => candidate.id === id
      ? {
          ...candidate,
          status: 'pending_accountant',
          adminReturnNote: returnNote,
          adminReturnedBy: userName,
          adminReturnedAt: returnedAt,
        }
      : candidate
    ));
    reverseApprovedPumpReportEffects(report);
    setAudit(entries => [{
      id: genId(),
      action: 'Approved pump report returned to accountant',
      user: userName,
      detail: `Report #${id} — ${report.pumpName}: ${returnNote}; approved sales reversed pending accountant review`,
      ts: returnedAt,
    }, ...entries]);
    void notificationsApi.send({
      target: 'acc',
      branchId: report.branchId,
      type: 'report_attention',
      title: 'Approved Pump Report Returned for Review',
      body: `${report.pumpName} was returned by Admin for accountant review: ${returnNote}`,
      data: { route: SCREEN_ROUTES.shift, reportId: id },
    });
    return true;
  }, [role, userName, pumpDailyReports, reverseApprovedPumpReportEffects]);

  const accApprovePumpReport = useCallback((report: PumpDailyReport, accNote: string) => {
    const id = report.id;
    const currentReport = pumpDailyReports.find(candidate => candidate.id === id);
    const adminReturnMs = Date.parse(currentReport?.adminReturnedAt ?? '');
    const priorApprovalMs = Date.parse(currentReport?.accAt ?? '');
    if (Number.isFinite(adminReturnMs) && (!Number.isFinite(priorApprovalMs) || adminReturnMs > priorApprovalMs)) {
      appliedPumpReportApprovals.current.delete(id);
    }
    if (
      !currentReport ||
      currentReport.status !== 'pending_accountant' ||
      appliedPumpReportApprovals.current.has(id)
    ) return;
    appliedPumpReportApprovals.current.add(id);
    const pump = pumps.find(p => p.id === currentReport.pumpId);
    const resolvedBranchId = currentReport.branchId || pump?.branchId || '';
    setPumpDailyReports(rs => rs.map(r => r.id === id
      ? { ...r, branchId: r.branchId || resolvedBranchId, status: 'approved', accNote, accBy: userName, accAt: nowTs() }
      : r
    ));
    setSales(s => {
      if (s.some(e => e.shiftReportId === id)) return s;
      return [...s, {
        id: genId(),
        shiftReportId: id,
        pump: `${currentReport.pumpName} (${currentReport.product})`,
        pumpId: currentReport.pumpId,
        lpgCategory: currentReport.product === 'LPG' ? pump?.lpgCategory ?? 'single' : undefined,
        by: currentReport.submittedBy,
        L: currentReport.liters,
        price: currentReport.unitPrice,
        dt: currentReport.date,
        pos: currentReport.posAmount,
          branchId: resolvedBranchId,
      }];
    });
    if (currentReport.product === 'LPG') {
      setLpgTanks(ts => {
        const matching = ts.filter(t => !resolvedBranchId || !t.branchId || t.branchId === resolvedBranchId);
        if (matching.length === 0) return ts;
        const share = currentReport.liters / matching.length;
        const ids = new Set(matching.map(t => t.id));
        return ts.map(t => ids.has(t.id) ? { ...t, sl: t.sl + share } : t);
      });
    } else {
      setTanks(ts => {
        const matching = ts.filter(t => t.prod === currentReport.product && (!resolvedBranchId || !t.branchId || t.branchId === resolvedBranchId));
        if (matching.length === 0) return ts;
        const share = currentReport.liters / matching.length;
        const ids = new Set(matching.map(t => t.id));
        return ts.map(t => ids.has(t.id) ? { ...t, sl: t.sl + share } : t);
      });
    }
    const unit = currentReport.product === 'LPG' ? 'kg' : 'L';
    setAudit(a => [{ id: genId(), action: 'Pump report approved', user: userName, detail: `Report #${id} — ${currentReport.pumpName} · ${currentReport.liters}${unit} · sales record auto-created`, ts: nowTs() }, ...a]);
    void notificationsApi.send({
      target: currentReport.submittedBy,
      type: 'report_update',
      title: 'Pump Report Approved',
      body: `${currentReport.pumpName} · ${currentReport.date} was approved by the accountant.`,
      data: { route: SCREEN_ROUTES.shift, reportId: id },
    });
  }, [userName, pumps, pumpDailyReports]);

  const accRejectPumpReport = useCallback((id: number, rejectionReason: string) => {
    const report = pumpDailyReports.find(r => r.id === id);
    // Only reports awaiting accountant review may be rejected — approved
    // reports are permanently locked and cannot re-enter the workflow.
    if (!report || report.status !== 'pending_accountant') return;
    setPumpDailyReports(rs => rs.map(r => r.id === id && r.status === 'pending_accountant' ? { ...r, status: 'returned', rejectionReason, accBy: userName, accAt: nowTs() } : r));
    setAudit(a => [{ id: genId(), action: 'Pump report rejected', user: userName, detail: `Report #${id} — ${rejectionReason}`, ts: nowTs() }, ...a]);
    if (report) void notificationsApi.send({
      target: report.submittedBy,
      type: 'report_update',
      title: 'Pump Report Returned',
      body: `${report.pumpName} was returned for correction: ${rejectionReason}`,
      data: { route: SCREEN_ROUTES.shift, reportId: id },
    });
  }, [userName, pumpDailyReports]);

  const deletePumpReport = useCallback((id: number) => {
    const report = pumpDailyReports.find(r => r.id === id);
    if (!report) return Promise.resolve(false);
    if (report.status === 'approved' && role !== 'admin') return Promise.resolve(false);
    if (report.status === 'approved') {
      return stateApi.deleteApprovedPumpReport(id).then(result => {
        if (!result?.ok) return false;
        appliedPumpReportApprovals.current.delete(id);
        setPumpDailyReports(reports => reports.filter(candidate => candidate.id !== id));
        reverseApprovedPumpReportEffects(report);
        setPumpLockedMeters(meters => {
          const next = { ...meters };
          delete next[report.pumpId];
          return next;
        });
        setPumpInitialMeters(meters => ({ ...meters, [report.pumpId]: report.openingMeter }));
        setAudit(entries => [{
          id: genId(),
          action: 'Approved pump report deleted for re-entry',
          user: userName,
          detail: `Report #${id} deleted after wrong-date review; ${report.pumpName} opening meter reset to ${report.openingMeter.toLocaleString()} for attendant re-entry`,
          ts: nowTs(),
        }, ...entries]);
        return true;
      });
    }
    setPumpDailyReports(rs => rs.filter(r => r.id !== id));
    setSales(s => s.filter(e => e.shiftReportId !== id));
    setAudit(a => [{
      id: genId(),
      action: 'Pump report deleted',
      user: userName,
      detail: `Report #${id} deleted`,
      ts: nowTs(),
    }, ...a]);
    return Promise.resolve(true);
  }, [role, userName, pumpDailyReports, reverseApprovedPumpReportEffects]);

  const updatePumpReport = useCallback((id: number, updates: Partial<Omit<PumpDailyReport, 'id' | 'status' | 'submittedAt' | 'submittedBy' | 'submittedByName'>>) => {
    const prev = pumpDailyReports.find(r => r.id === id);
    // Accountant-approved reports are permanently locked — no role, including
    // Admin, may edit them.
    if (!prev || prev.status === 'approved') return;
    const merged = { ...prev, ...updates } as PumpDailyReport;
    // Recalculate derived values when meter or price values change.
    const liters = merged.closingMeter > merged.openingMeter ? parseFloat((merged.closingMeter - merged.openingMeter).toFixed(4)) : 0;
    const grossAmount = liters * merged.unitPrice;
    const totalCollected = merged.posAmount + merged.cashAmount + merged.transferAmount;
    const variance = totalCollected + merged.creditAmount - grossAmount;
    const next: PumpDailyReport = { ...merged, liters, grossAmount, totalCollected, variance };
    setPumpDailyReports(rs => rs.map(r => r.id === id ? next : r));
    // Keep a linked sales record synchronized when an editable report changes.
    setSales(current => current.map(entry => entry.shiftReportId === id
      ? {
          ...entry,
          L: next.liters,
          price: next.unitPrice,
          dt: next.date,
          pos: next.posAmount,
          branchId: next.branchId,
        }
      : entry
    ));
    setAudit(a => [{
      id: genId(),
      action: 'Pump report updated',
      user: userName,
      detail: `Report #${id} edited`,
      ts: nowTs(),
    }, ...a]);
  }, [role, userName, pumpDailyReports]);

  const correctApprovedPumpReportDate = useCallback((id: number, date: string): boolean => {
    if (role !== 'admin') return false;
    const normalizedDate = date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) return false;
    const parsed = new Date(`${normalizedDate}T00:00:00`);
    if (!Number.isFinite(parsed.getTime()) || currentBusinessDateKey(parsed) !== normalizedDate) return false;

    const previous = pumpDailyReports.find(report => report.id === id);
    if (!previous || previous.status !== 'approved' || previous.date === normalizedDate) return false;

    const correctedAt = nowTs();
    const corrected: PumpDailyReport = {
      ...previous,
      date: normalizedDate,
      dateCorrectedFrom: previous.date,
      dateCorrectedBy: userName,
      dateCorrectedAt: correctedAt,
    };
    setPumpDailyReports(reports => reports.map(report => report.id === id ? corrected : report));
    const pump = pumps.find(candidate => candidate.id === previous.pumpId);
    const resolvedBranchId = previous.branchId || pump?.branchId || '';
    setSales(entries => {
      let linked = false;
      const next = entries.map(entry => {
        if (entry.shiftReportId !== id) return entry;
        linked = true;
        return {
          ...entry,
          pump: `${previous.pumpName} (${previous.product})`,
          by: previous.submittedBy,
          L: previous.liters,
          price: previous.unitPrice,
          dt: normalizedDate,
          pos: previous.posAmount,
          branchId: resolvedBranchId,
          pumpId: previous.pumpId,
          lpgCategory: previous.product === 'LPG' ? pump?.lpgCategory ?? entry.lpgCategory ?? 'single' : undefined,
        };
      });
      if (linked) return next;
      return [...next, {
        id: genId(),
        shiftReportId: id,
        pump: `${previous.pumpName} (${previous.product})`,
        by: previous.submittedBy,
        L: previous.liters,
        price: previous.unitPrice,
        dt: normalizedDate,
        pos: previous.posAmount,
        branchId: resolvedBranchId,
        pumpId: previous.pumpId,
        lpgCategory: previous.product === 'LPG' ? pump?.lpgCategory ?? 'single' : undefined,
      }];
    });
    setAudit(entries => [{
      id: genId(),
      action: 'Approved pump report date corrected',
      user: userName,
      detail: `Report #${id} — ${previous.pumpName}: ${previous.date} → ${normalizedDate}; linked sales date synchronized`,
      ts: correctedAt,
    }, ...entries]);
    return true;
  }, [pumps, role, userName, pumpDailyReports]);

  const addHREmployee = useCallback((e: Omit<HREmployee, 'id' | 'empId' | 'serial'>) => {
    setHrEmployees(prev => {
      const serial = prev.length + 1;
      const empId  = 'PTNG-' + String(serial).padStart(4, '0');
      return [...prev, { ...e, id: genId(), empId, serial, onboarding: e.onboarding ?? { status: 'draft' }, letters: e.letters ?? [] }];
    });
  }, []);

  const updateHRDocStatus = useCallback((empId: number, docType: HRDocType, status: HRDocStatus, note?: string) => {
    setHrEmployees(prev => prev.map(emp =>
      emp.id === empId
        ? { ...emp, docs: emp.docs.map(d => d.type === docType ? { ...d, status, date: nowTs(), note: note ?? d.note } : d) }
        : emp
    ));
  }, []);

  const removeHREmployee = useCallback((id: number) => {
    if (role !== 'admin') return;
    setHrEmployees(prev => prev.filter(e => e.id !== id));
  }, [role]);

  const addHRUpload = useCallback((empId: number, doc: Omit<HREmployeeDoc, 'id' | 'dt' | 'approved'>) => {
    setHrEmployees(prev => prev.map(emp =>
      emp.id === empId
        ? { ...emp, uploads: [...(emp.uploads ?? []), { ...doc, id: genId(), dt: nowTs(), approved: false }] }
        : emp
    ));
  }, []);

  const approveHRUpload = useCallback((empId: number, docId: number, by: string) => {
    setHrEmployees(prev => prev.map(emp =>
      emp.id === empId
        ? { ...emp, uploads: emp.uploads.map(u => u.id === docId ? { ...u, approved: true, approvedBy: by, approvedAt: nowTs() } : u) }
        : emp
    ));
  }, []);

  const addHRRecommendation = useCallback((rec: Omit<HRRecommendation, 'id' | 'dt' | 'status'>) => {
    setHrRecommendations(prev => [{ ...rec, id: genId(), dt: nowTs(), status: 'pending' }, ...prev]);
  }, []);

  const resolveHRRecommendation = useCallback((id: number, action: 'approved' | 'rejected', by: string) => {
    setHrRecommendations(prev => prev.map(r => r.id === id ? { ...r, status: action, resolvedBy: by, resolvedAt: nowTs() } : r));
    if (action === 'approved') {
      setHrRecommendations(prev => {
        const rec = prev.find(r => r.id === id);
        if (rec) {
          setHrEmployees(emps => emps.map(e =>
            e.id === rec.empId
              ? { ...e, status: rec.type === 'delete' ? 'inactive' : rec.type === 'suspend' ? 'suspended' : 'inactive' }
              : e
          ));
        }
        return prev;
      });
    }
  }, []);

  const addHRHandbook = useCallback((doc: Omit<HREmployeeDoc, 'id' | 'dt' | 'approved'>) => {
    setHrHandbooks(prev => [{ ...doc, id: genId(), dt: nowTs(), approved: false }, ...prev]);
  }, []);

  const approveHRHandbook = useCallback((docId: number, by: string) => {
    setHrHandbooks(prev => prev.map(d => d.id === docId ? { ...d, approved: true, approvedBy: by, approvedAt: nowTs() } : d));
  }, []);

  const uploadHRDocFile = useCallback((empId: number, docType: HRDocType, fileName: string, uri?: string, mimeType?: string, size?: number) => {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? 'other';
    setHrEmployees(prev => prev.map(emp => {
      if (emp.id !== empId) return emp;
      return {
        ...emp,
        docs: emp.docs.map(d => d.type === docType ? { ...d, status: 'submitted' as HRDocStatus, date: nowTs(), fileName } : d),
        uploads: [...(emp.uploads ?? []), { id: genId(), name: fileName, fileType: ext, cat: docType, uploadedBy: userName, dt: nowTs(), approved: false, uri, mimeType, size }],
      };
    }));
    setAudit(a => [{ id: genId(), action: 'HR document uploaded', user: userName, detail: `${docType}: ${fileName}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const forwardOnboardingForApproval = useCallback((empId: number, by: string) => {
    setHrEmployees(prev => prev.map(emp =>
      emp.id === empId
        ? { ...emp, onboarding: { ...emp.onboarding, status: 'forwarded' as OnboardingStatus, forwardedAt: nowTs(), forwardedBy: by } }
        : emp
    ));
    setAudit(a => [{ id: genId(), action: 'Onboarding forwarded for approval', user: by, detail: `Employee #${empId} forwarded to MD and CEO`, ts: nowTs() }, ...a]);
  }, []);

  const approveOnboarding = useCallback((empId: number, stage: 'md' | 'ceo', by: string) => {
    setHrEmployees(prev => prev.map(emp => {
      if (emp.id !== empId) return emp;
      if (stage === 'md') return { ...emp, onboarding: { ...emp.onboarding, status: 'md_approved' as OnboardingStatus, mdApprovedBy: by, mdApprovedAt: nowTs() } };
      return { ...emp, onboarding: { ...emp.onboarding, status: 'ceo_approved' as OnboardingStatus, ceoApprovedBy: by, ceoApprovedAt: nowTs() } };
    }));
    setAudit(a => [{ id: genId(), action: `Onboarding ${stage === 'md' ? 'MD' : 'CEO'} approved`, user: by, detail: `Employee #${empId}`, ts: nowTs() }, ...a]);
  }, []);

  const addGeneratedLetter = useCallback((empId: number, letter: Omit<GeneratedLetter, 'id' | 'generatedAt'>) => {
    setHrEmployees(prev => prev.map(emp =>
      emp.id === empId
        ? { ...emp, letters: [...(emp.letters ?? []), { ...letter, id: genId(), generatedAt: nowTs() }] }
        : emp
    ));
    setAudit(a => [{ id: genId(), action: 'Letter generated', user: userName, detail: `${letter.type} letter for employee #${empId}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addSystemNotification = useCallback((from: Role, msg: Omit<Message, 'id' | 'ts' | 'read'>) => {
    if (!role) return;
    const key = chatKey(from, role);
    const newMsg: Message = { ...msg, id: genId(), ts: nowTime(), createdAt: nowTs(), read: false };
    setMessages(m => ({ ...m, [key]: [...(m[key] || []), newMsg] }));
  }, [role]);

  const getConversation = useCallback((peerName: string): Message[] => {
    const keys = new Set(conversationKeys(peerName));
    const seen = new Set<number>();
    return Object.entries(messages)
      .filter(([key]) => keys.has(key))
      .flatMap(([, entries]) => Array.isArray(entries) ? entries : [])
      .filter(message => {
        if (seen.has(message.id)) return false;
        seen.add(message.id);
        return true;
      })
      .sort((a, b) => messageActivityMs(a) - messageActivityMs(b));
  }, [conversationKeys, messages]);

  const unreadCount = useCallback((): number => {
    if (!userName) return 0;
    return Object.values(messages).reduce((sum, msgs) => {
      if (!Array.isArray(msgs)) return sum;
      return sum + msgs.filter(m => (m.to === userName || m.to === role) && !m.read).length;
    }, 0);
  }, [role, userName, messages]);

  const updateRoleAccess = useCallback((targetRole: string, moduleId: string, enabled: boolean) => {
    if (role !== 'admin') return;
    setRoleAccess(prev => ({
      ...prev,
      [targetRole]: { ...(prev[targetRole] ?? {}), [moduleId]: enabled },
    }));
  }, [role]);

  const updateStockSnapshotMetric = useCallback((metric: StockSnapshotMetric, enabled: boolean) => {
    if (role !== 'admin' || metric === 'sales') return;
    setStockSnapshotConfig(prev => ({
      ...prev,
      metrics: { ...prev.metrics, [metric]: enabled },
    }));
  }, [role]);

  const updateStockSnapshotProduct = useCallback((branchId: string, product: StockProduct, enabled: boolean) => {
    if (role !== 'admin') return;
    setStockSnapshotConfig(prev => ({
      ...prev,
      productsByBranch: {
        ...prev.productsByBranch,
        [branchId]: {
          ...(prev.productsByBranch[branchId] ?? {}),
          [product]: enabled,
        },
      },
    }));
  }, [role]);

  const updateUserAccess = useCallback((uid: number, moduleId: string, enabled: boolean) => {
    if (role !== 'admin') return;
    setUserAccess(prev => ({
      ...prev,
      [uid]: { ...(prev[uid] ?? {}), [moduleId]: enabled },
    }));
  }, [role]);

  const clearUserAccess = useCallback((uid: number) => {
    if (role !== 'admin') return;
    setUserAccess(prev => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  }, [role]);

  // Admin always sees their own fixed nav. Every other role starts from the
  // full catalog, then gets filtered by the admin-managed role defaults and
  // per-user overrides. No business role bypasses Access Control.
  const baseNav: NavItem[] = role === 'admin'
    ? (NAVDEF.admin ?? [])
    : FULL_NAV_CATALOG;
  const addBroadcast = useCallback((b: Omit<Broadcast, 'id' | 'ts'>) => {
    setBroadcasts(prev => [{ ...b, id: genId(), ts: nowTs() }, ...prev]);
  }, []);

  const addCallRecord = useCallback((r: Omit<CallRecord, 'id' | 'ts'>) => {
    setCallLog(prev => [{ ...r, id: genId(), ts: nowTs() }, ...prev]);
  }, []);

  const addMarketCompetitor = useCallback((competitor: Omit<MarketCompetitor, 'id'>) => {
    setMarketCompetitors(prev => [{ ...competitor, id: String(genId()) }, ...prev]);
  }, []);

  const updateMarketCompetitor = useCallback((id: string, updates: Partial<Omit<MarketCompetitor, 'id'>>) => {
    setMarketCompetitors(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const deleteMarketCompetitor = useCallback((id: string) => {
    setMarketCompetitors(prev => prev.filter(item => item.id !== id));
  }, []);

  const updateFinancialEntry = useCallback((updates: Partial<Omit<FinancialEntry, 'updatedBy' | 'updatedAt'>>) => {
    setFinancialEntry(prev => ({ ...prev, ...updates, updatedBy: userName, updatedAt: nowTs() }));
  }, [userName]);

  // General Library is available to every signed-in user; sensitive sections
  // are gated within the My Folder dashboard itself.
  const folderVisible = !!role;
  const filterFolder = (items: NavItem[]) => items.filter(item => item.id !== 'corp' || folderVisible);
  const navItems: NavItem[] = role === 'admin'
    ? filterFolder(baseNav)
    : filterFolder(baseNav.filter(item => {
        // Per-user override takes priority over the role default.
        // This applies equally to CEO, MD, accountant, CSM, manager,
        // marketing, and attendant accounts.
        if (staffId !== null) {
          const userLevel = (userAccess[staffId] ?? {})[item.id];
          if (userLevel !== undefined) return userLevel;
        }
        return (roleAccess[role ?? 'att'] ?? {})[item.id] !== false;
      }));

  return (
    <AppContext.Provider value={{
      companyInfo, updateCompanyInfo,
      role, userName, branchId, staffId, isServerAuthenticated, navItems, mgrPerms,
      login, logout, updateMgrPerms, roleAccess, updateRoleAccess, userAccess, updateUserAccess, clearUserAccess,
      prices, priceHistory, tanks, lpgTanks, pumps, dips, deliveries,
       maintenance, sales, staff, branches, docs, expenses, budgets, financialEntry, updateFinancialEntry, messages, broadcasts, callLog,
       handoverNotes, addShiftHandoverNote,
       marketCompetitors, addMarketCompetitor, updateMarketCompetitor, deleteMarketCompetitor,
       addBroadcast, addCallRecord,
      audit, departments, companyFiles, deliveryEvidences, myFolders, myFolderFiles,
      priceProposals, addPriceProposal, approvePriceProposal, updateAndApprovePriceProposal, rejectPriceProposal,
      updatePrice, addTank, addLpgTank, addPump,
      updateTank, updateLpgTank, updatePump, updateStaff,
      addExpense, updateExpense, deleteExpense, forwardExpenseToMD, addBudget, updateBudget, deleteBudget, submitBudgetToAcc, forwardBudget, approveBudget, rejectBudget,
      addDip, updateDip, deleteDip, approveDip, rejectDip, addDelivery, updateDelivery, deleteDelivery, submitDeliveryForApproval, accForwardToMd, accRecallDelivery, approveDelivery, rejectDelivery, addMaintenance, acknowledgeMaintenance, assignMaintenance, updateMaintenanceStatus, addSales, updateSales, deleteSales,
      addCompanyFile, addDeliveryEvidence, addMyFolder, addMyFolderFile, removeMyFolderFile, replaceMyFolderFile,
        pumpDailyReports, pumpInitialMeters, pumpLockedMeters, inventoryLog, stockLogs, upsertStockLogs, startupStocks, addStartupStock, updateStartupStock, deleteStartupStock,
        stockSnapshotConfig, updateStockSnapshotMetric, updateStockSnapshotProduct,
        setPumpInitialMeter, lockPumpMeter, unlockPumpMeter, resetOperationalData,
      submitPumpReport, mgrForwardPumpReport, accApprovePumpReport, accRejectPumpReport, mgrResubmitPumpReport, mgrReturnPumpReportToAttendant, attResubmitPumpReport, adminReturnApprovedPumpReport, deletePumpReport, updatePumpReport, correctApprovedPumpReportDate,
        sendMessage, addSystemNotification, markRead, archiveConversation, unarchiveConversation, approveExpense, rejectExpense,
       notifications, refreshNotifications, markNotificationRead, markAllNotificationsRead,
      addStaff, toggleStaff, deleteStaff, addBranch, updateBranch, deleteBranch, addAudit, getConversation, unreadCount,
      deleteTank, deleteLpgTank, deletePump,
       addDepartment, updateDepartment, assignStaffDept, deleteDepartment,
      userAccounts, refreshUsers, addUserAccount, addActiveUserAccount, updateUserAccount, updateEnrollmentData, changeOwnPassword, enrollStaff, mdApproveEnrollment, mdRejectEnrollment, approveUserAccount, suspendUserAccount, reactivateUserAccount, rejectUserAccount, rejectEnrollmentWithReason, resubmitEnrollment, deleteUserAccount, validateCredentials,
      tasks, kpis, addTask, updateTaskStatus, deleteTask, addKpi, deleteKpi,
      hrEmployees, hrRecommendations, hrHandbooks,
      addHREmployee, updateHRDocStatus, removeHREmployee,
      uploadHRDocFile, addHRUpload, approveHRUpload,
      addHRRecommendation, resolveHRRecommendation,
      addHRHandbook, approveHRHandbook,
      forwardOnboardingForApproval, approveOnboarding, addGeneratedLetter,
      legalMatters, corpProjects, meetingMinutes,
      addLegalMatter, updateLegalMatter, updateLegalStatus, deleteLegalMatter,
      addCorpProject, updateCorpProject, updateProjectProgress, deleteCorpProject,
      addMeetingMinutes, updateMeetingMinutes, deleteMeetingMinutes,
      addCorpAttachment, removeCorpAttachment,
      submitCorpItem, approveCorpItem, rejectCorpItem,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
