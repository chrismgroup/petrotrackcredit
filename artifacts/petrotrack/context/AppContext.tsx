import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { stateApi, versionApi, usersApi, StaffUserRecord, apiLogin, saveToken, clearToken } from '@/lib/api';
import { hashPassword, verifyPassword } from '@/lib/crypto';

export type Role = 'admin' | 'ceo' | 'md' | 'mktg' | 'csm' | 'acc' | 'mgr' | 'att';

export interface Tank {
  id: string; name: string; prod: 'PMS' | 'AGO' | 'DPK' | 'Lube Oil';
  cap: number; dip: number; op: number; rv: number; sl: number; branchId?: string;
}
export interface LPGTank { id: string; name: string; cap: number; op: number; rv: number; sl: number; branchId?: string; }
export interface Pump { id: string; name: string; prod: 'PMS' | 'AGO' | 'DPK' | 'LPG' | 'Lube Oil'; active: boolean; branchId?: string; }
export interface DipRecord { id: number; dt: string; by: string; rd: Record<string, number>; lpg: Record<string, number>; obs: string; status: 'pending' | 'approved' | 'rejected'; approvedBy?: string; approvedDt?: string; }
export interface Delivery { id: number; dt: string; sup: string; prod: string; wb: string; ord: number; rec: number; st: 'ok' | 'short' | 'spill' | 'seal'; notes: string; costPrice?: number; sellingPrice?: number; mdNote?: string; receivedBy?: string; approvalStatus?: 'draft' | 'pending' | 'pending_acc' | 'pending_md' | 'md_approved' | 'approved' | 'rejected'; approvedBy?: string; approvedAt?: string; rejectedNote?: string; branchId?: string; accNote?: string; accBy?: string; accAt?: string; mdBy?: string; mdAt?: string; }
export interface MaintenanceItem { id: number; title: string; pri: 'Urgent' | 'Medium' | 'Low'; by: string; date: string; st: 'Open' | 'Done'; cost?: number; }
export interface SalesEntry { id: number; pump: string; by: string; L: number; price: number; dt: string; pos?: number; branchId?: string; shiftReportId?: number; }
export interface Staff { id: number; name: string; role: string; sal: number; st: 'Active' | 'Suspended'; email: string; dept?: string; }
export interface Branch { id: string; name: string; st: 'Active' | 'Pending' | 'Suspended'; rev: number; mgr: string; pumps: number; tanks: number; }
export interface ComplianceDoc { id: number; name: string; cat: string; iss: string; exp: string; ref: string; }
export interface PriceProposal {
  id: number; prod: string; currentPrice: number; proposedPrice: number;
  proposedBy: string; proposedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string; reviewedAt?: string; note?: string;
}
export interface Expense { id: number; dt: string; cat: string; desc: string; amt: number; by: string; byName: string; status: 'pending' | 'acc_forwarded' | 'approved' | 'rejected'; approvedBy?: string; approvedDt?: string; budgetId: number; ref?: string; branchId?: string; }
export interface BudgetWorkflowStep { stage: string; by: string; role: string; dt: string; action: string; note: string; }
export interface Budget { id: number; month: number; year: number; label: string; by: string; byName: string; items: { cat: string; amt: number }[]; total: number; status: string; workflow: BudgetWorkflowStep[]; }
export interface BankLoan { bank: string; amount: number; }
export interface FinancialEntry {
  cashInBank: number; posValue: number; goodsOnTransit: number;
  cashInHand: number; debtsFromCustomers: number; capitalInjection: number;
  bankLoans: BankLoan[]; liabilities: number;
  updatedBy: string; updatedAt: string;
}
export interface NavItem { id: string; icon: string; label: string; }
export interface UserInfo { name: string; color: string; initials: string; role: string; online: boolean; }
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

export type AccountStatus = 'pending' | 'pending_md' | 'pending_admin' | 'active' | 'suspended' | 'rejected';
export interface UserAccount {
  id: number;
  empId?: string;
  empName: string;
  username: string;
  password: string;
  role: Role | null;
  branchId?: string;
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
export interface Prices { PMS: number; AGO: number; DPK: number; LPG: number; 'Lube Oil': number; }
export interface PriceChange { id: number; prod: string; oldPrice: number; newPrice: number; by: string; dt: string; reason?: string; }
export interface Message { id: number; from: string; to: string; type: 'txt' | 'req' | 'alert' | 'media'; body: string; ts: string; read: boolean; req?: { product: string; qty: number; sup: string; reason: string }; alrt?: { title: string; pri: string; detail: string }; media?: { uri: string; name: string; mimeType: string; size?: number }; }
export interface Broadcast { id: number; from: Role; fromName: string; title: string; body: string; audience: string; audienceName: string; ts: string; }
export interface CallRecord { id: number; from: Role; fromName: string; to: Role; toName: string; ts: string; status: 'ended' | 'missed' | 'declined'; duration?: string; }
export interface AuditEntry { id: number; action: string; user: string; detail: string; ts: string; }
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
export type TaskStatus = 'commenced' | 'progressing' | 'completed';
export type TaskPriority = 'High' | 'Medium' | 'Low';
export type TaskCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly';
export interface Task { id: number; title: string; desc: string; assignedBy: Role; assignedByName: string; assignedTo: Role; assignedToName: string; status: TaskStatus; priority: TaskPriority; cadence: TaskCadence; target?: string; targetUnit?: string; dueDate: string; createdAt: string; }
export interface KPI { id: number; title: string; target: string; unit: string; period: string; assignedTo: Role; assignedToName: string; createdAt: string; }
export interface DeliveryEvidence { id: number; delivId: number; type: 'photo' | 'video' | 'document'; name: string; dt: string; by: string; uri?: string; mimeType?: string; size?: number; }
export type PumpReportStatus = 'pending_manager' | 'pending_accountant' | 'returned' | 'approved';
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
    { id: 'settings', icon: 'settings',         label: 'Settings' },
  ],
};

// All panels available to every non-admin user.
// Admin toggles which of these each role/user can actually see via Access Control.
export const FULL_NAV_CATALOG: NavItem[] = [
  { id: 'home',     icon: 'home',             label: 'Home'       },
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
  { id: 'corp',     icon: 'briefcase',        label: 'Corporate'  },
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

// Every module starts enabled for every role — admin restricts from here
function defaultRoleAccess(): Record<string, Record<string, boolean>> {
  const result: Record<string, Record<string, boolean>> = {};
  const roles = ['ceo','md','acc','csm','mktg','mgr','att'];
  for (const r of roles) {
    result[r] = Object.fromEntries(FULL_NAV_CATALOG.map(i => [i.id, true]));
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
};

export function chatKey(a: string, b: string) { return [a, b].sort().join('-'); }
export function mmToLiters(tank: Tank, mm: number) { if (!mm || !tank.dip) return 0; return Math.round((mm / tank.dip) * tank.cap); }
export function pctToKg(lpg: LPGTank, pct: number) { return Math.round((pct / 100) * lpg.cap); }
export function fmt(n: number) { return '₦' + n.toLocaleString(); }
export function fmtDate(dt: string) {
  try { const d = new Date(dt); return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return dt; }
}
export function fmtDateTime(dt: string) {
  try { const d = new Date(dt); return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }); } catch { return dt; }
}
function genId() { return Date.now() + Math.floor(Math.random() * 10000); }
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
  login: (role: Role, name: string, staffId?: number, branchId?: string) => void; logout: () => void;
  updateMgrPerms: (branchId: string, perms: Partial<MgrPermissions>) => void;
  prices: Prices; priceHistory: PriceChange[]; tanks: Tank[]; lpgTanks: LPGTank[]; pumps: Pump[];
  dips: DipRecord[]; deliveries: Delivery[]; maintenance: MaintenanceItem[];
  sales: SalesEntry[]; staff: Staff[]; branches: Branch[];
  docs: ComplianceDoc[]; expenses: Expense[]; budgets: Budget[];
  financialEntry: FinancialEntry;
  updateFinancialEntry: (updates: Partial<Omit<FinancialEntry, 'updatedBy' | 'updatedAt'>>) => void;
  addBudget: (b: Omit<Budget, 'id' | 'workflow'>) => void;
  updateBudget: (id: number, updates: { items: { cat: string; amt: number }[]; total: number; month: number; year: number; label: string }) => void;
  deleteBudget: (id: number) => void;
  submitBudgetToAcc: (id: number) => void;
  forwardBudget: (id: number, note: string) => void;
  approveBudget: (id: number, note: string) => void;
  rejectBudget: (id: number, note: string) => void;
  messages: Record<string, Message[]>; broadcasts: Broadcast[]; callLog: CallRecord[];
  addBroadcast: (b: Omit<Broadcast, 'id' | 'ts'>) => void;
  addCallRecord: (r: Omit<CallRecord, 'id' | 'ts'>) => void;
  audit: AuditEntry[]; departments: Department[];
  companyFiles: CompanyFile[]; deliveryEvidences: DeliveryEvidence[];
  pumpDailyReports: PumpDailyReport[];
  pumpInitialMeters: Record<string, number>;
  pumpLockedMeters: Record<string, number>;
  inventoryLog: InventoryLogEntry[];
  setPumpInitialMeter: (pumpId: string, meter: number) => void;
  lockPumpMeter: (pumpId: string, meter: number) => void;
  unlockPumpMeter: (pumpId: string) => void;
  resetOperationalData: () => void;
  submitPumpReport: (r: Omit<PumpDailyReport, 'id' | 'status' | 'submittedAt'>) => void;
  mgrForwardPumpReport: (id: number, mgrNote: string) => void;
  accApprovePumpReport: (report: PumpDailyReport, accNote: string) => void;
  accRejectPumpReport: (id: number, rejectionReason: string) => void;
  mgrResubmitPumpReport: (id: number, mgrNote: string) => void;
  deletePumpReport: (id: number) => void;
  updatePrice: (prod: string, price: number, by?: string, reason?: string) => void;
  priceProposals: PriceProposal[];
  addPriceProposal: (prod: string, proposedPrice: number) => void;
  approvePriceProposal: (id: number) => void;
  updateAndApprovePriceProposal: (id: number, updatedPrice: number) => void;
  rejectPriceProposal: (id: number, note?: string) => void;
  addTank: (t: Omit<Tank, 'id' | 'dip' | 'op' | 'rv' | 'sl'>) => void;
  addLpgTank: (t: Omit<LPGTank, 'id' | 'op' | 'rv' | 'sl'>) => void;
  addPump: (p: Omit<Pump, 'id'>) => Pump;
  updateTank: (id: string, updates: Partial<Pick<Tank, 'name' | 'cap' | 'prod' | 'dip' | 'branchId'>>) => void;
  updateLpgTank: (id: string, updates: Partial<Pick<LPGTank, 'name' | 'cap' | 'branchId'>>) => void;
  updatePump: (id: string, updates: Partial<Pick<Pump, 'name' | 'prod' | 'active' | 'branchId'>>) => void;
  updateStaff: (id: number, updates: Partial<Pick<Staff, 'name' | 'email' | 'sal' | 'dept'>>) => void;
  addExpense: (exp: Omit<Expense, 'id' | 'dt' | 'status'>) => void;
  updateExpense: (id: number, updates: Partial<Pick<Expense, 'cat' | 'desc' | 'amt' | 'ref'>>) => void;
  deleteExpense: (id: number) => void;
  forwardExpenseToMD: (id: number, note?: string) => void;
  addCompanyFile: (file: Omit<CompanyFile, 'id' | 'dt'>) => void;
  addDeliveryEvidence: (ev: Omit<DeliveryEvidence, 'id' | 'dt'>) => void;
  addDip: (dip: Omit<DipRecord, 'id'>) => void;
  approveDip: (id: number) => void;
  rejectDip: (id: number) => void;
  addDelivery: (rec: Omit<Delivery, 'id'>) => void;
  updateDelivery: (id: number, updates: Partial<Omit<Delivery, 'id'>>) => void;
  deleteDelivery: (id: number) => void;
  submitDeliveryForApproval: (id: number) => void;
  accForwardToMd: (id: number, costPrice: number, accNote: string) => void;
  approveDelivery: (id: number, sellingPrice: number, mdNote?: string) => void;
  rejectDelivery: (id: number, note?: string) => void;
  addMaintenance: (item: Omit<MaintenanceItem, 'id'>) => void;
  addSales: (entry: Omit<SalesEntry, 'id'>) => void;
  sendMessage: (toName: string, msg: Omit<Message, 'id' | 'from' | 'ts' | 'read'>) => void;
  addSystemNotification: (from: Role, msg: Omit<Message, 'id' | 'ts' | 'read'>) => void;
  markRead: (peerName: string) => void;
  approveExpense: (id: number) => void;
  rejectExpense: (id: number) => void;
  addStaff: (s: Omit<Staff, 'id'>) => void;
  toggleStaff: (id: number) => void;
  deleteStaff: (id: number) => void;
  addBranch: (b: Omit<Branch, 'id'>) => void;
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
  addActiveUserAccount: (acc: { empName: string; username: string; password: string; role: Role; branchId?: string; jobTitle?: string; dept?: string; phoneNumber?: string; createdBy: string }) => Promise<void>;
  updateUserAccount: (id: number, updates: { username?: string; password?: string; role?: Role; branchId?: string; phoneNumber?: string }, by: string) => Promise<void>;
  updateEnrollmentData: (id: number, data: { empName?: string; jobTitle?: string; dept?: string; phoneNumber?: string; nin?: string; staffAddress?: string; guarantorName?: string; guarantorPhone?: string; guarantorAddress?: string }, by: string) => Promise<void>;
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  enrollStaff: (acc: { empName: string; jobTitle?: string; dept?: string; branchId?: string; phoneNumber?: string; nin?: string; staffAddress?: string; guarantorName?: string; guarantorPhone?: string; guarantorAddress?: string; employmentDocs?: string[] }, by: string, initialStatus?: AccountStatus) => Promise<void>;
  mdApproveEnrollment: (id: number, by: string) => Promise<void>;
  mdRejectEnrollment: (id: number, by: string) => Promise<void>;
  approveUserAccount: (id: number, role: Role, username: string, password: string, by: string, branchId?: string) => Promise<void>;
  suspendUserAccount: (id: number) => Promise<void>;
  reactivateUserAccount: (id: number) => Promise<void>;
  rejectUserAccount: (id: number) => Promise<void>;
  rejectEnrollmentWithReason: (id: number, reason: string, by: string) => Promise<void>;
  resubmitEnrollment: (id: number, updates: { empName?: string; jobTitle?: string; dept?: string; phoneNumber?: string; nin?: string; staffAddress?: string; guarantorName?: string; guarantorPhone?: string; guarantorAddress?: string }, by: string) => Promise<void>;
  deleteUserAccount: (id: number) => Promise<void>;
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
  const [prices, setPrices] = useState<Prices>({ PMS: 0, AGO: 0, DPK: 0, LPG: 0, 'Lube Oil': 0 });
  const [priceHistory, setPriceHistory] = useState<PriceChange[]>(INIT_PRICE_HISTORY);
  const [tanks, setTanks] = useState<Tank[]>(INIT_TANKS);
  const [lpgTanks, setLpgTanks] = useState<LPGTank[]>(INIT_LPG);
  const [pumps, setPumps] = useState<Pump[]>(INIT_PUMPS);
  const [dips, setDips] = useState<DipRecord[]>(INIT_DIPS);
  const [deliveries, setDeliveries] = useState<Delivery[]>(INIT_RECS);
  const [maintenance, setMaintenance] = useState<MaintenanceItem[]>(INIT_MAINT);
  const [sales, setSales] = useState<SalesEntry[]>(INIT_SALES);
  const [staff, setStaff] = useState<Staff[]>(INIT_STAFF);
  const [branches, setBranches] = useState<Branch[]>(INIT_BRANCHES);
  const [docs] = useState<ComplianceDoc[]>(INIT_DOCS);
  const [expenses, setExpenses] = useState<Expense[]>(INIT_EXPENSES);
  const [budgets, setBudgets] = useState<Budget[]>(INIT_BUDGETS);
  const [messages, setMessages] = useState<Record<string, Message[]>>(INIT_MSGS);
  const [audit, setAudit] = useState<AuditEntry[]>(INIT_AUDIT);
  const [departments, setDepartments] = useState<Department[]>(INIT_DEPTS);
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>(INIT_USER_ACCOUNTS);
  const [companyFiles, setCompanyFiles] = useState<CompanyFile[]>(INIT_COMPANY_FILES);
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
  const [pumpInitialMeters, setPumpInitialMeters] = useState<Record<string, number>>({});
  const [pumpLockedMeters, setPumpLockedMeters] = useState<Record<string, number>>({});
  const [inventoryLog, setInventoryLog] = useState<InventoryLogEntry[]>(INIT_INVENTORY_LOG);
  const [financialEntry, setFinancialEntry] = useState<FinancialEntry>(INIT_FINANCIAL_ENTRY);

  /* ── persistence: load from AsyncStorage first (fast), then sync from API (authoritative) ── */
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const KEYS = [
      'auth', 'companyInfo', 'tanks', 'lpgTanks', 'pumps', 'staff', 'branches',
      'departments', 'userAccounts', 'prices', 'priceHistory', 'mgrPerms',
      'roleAccess', 'userAccess', 'expenses', 'budgets', 'sales', 'dips',
      'deliveries', 'maintenance', 'audit', 'messages', 'tasks', 'kpis',
      'companyFiles', 'deliveryEvidences', 'hrEmployees', 'hrHandbooks',
      'hrRecommendations', 'priceProposals', 'legalMatters', 'corpProjects', 'meetingMinutes',
      'broadcasts', 'callLog', 'pumpDailyReports', 'pumpInitialMeters', 'pumpLockedMeters', 'financialEntry', 'inventoryLog',
    ] as const;
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
      if (s.expenses)          setExpenses(s.expenses);
      if (s.budgets)           setBudgets(s.budgets);
      if (s.sales)             setSales(s.sales);
      if (s.dips)              setDips(s.dips);
      if (s.deliveries)        setDeliveries(s.deliveries);
      if (s.maintenance)       setMaintenance(s.maintenance);
      if (s.audit)             setAudit(s.audit);
      if (s.messages)          setMessages(s.messages);
      if (s.tasks)             setTasks(s.tasks);
      if (s.kpis)              setKpis(s.kpis);
      if (s.companyFiles)      setCompanyFiles(s.companyFiles);
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
      if (s.financialEntry)    setFinancialEntry(s.financialEntry);
      setLoaded(true);
    });
  }, []);

  /* ── Pending-writes tracker: keys with in-flight PUTs are skipped by syncFromServer ── */
  // Prevents the 3-second poll from overwriting data whose PUT hasn't landed yet.
  const pendingWritesRef = useRef<Set<string>>(new Set());

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
  const syncFromServer = useCallback(async () => {
    try {
      const p = pendingWritesRef.current;
      const [s, userRows] = await Promise.all([
        stateApi.getAll(),
        usersApi.list(),
      ]);
      if (!s) return;
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
      if (!p.has('dips'))            setDips(safeArray<DipRecord>(s.dips));
      if (!p.has('deliveries'))      setDeliveries(safeArray<Delivery>(s.deliveries));
      if (!p.has('maintenance'))     setMaintenance(safeArray<MaintenanceItem>(s.maintenance));
      if (Array.isArray(s.audit) && !p.has('audit'))          setAudit(s.audit as AuditEntry[]);
      // Messages: merge with local so read-flags are preserved
      if (s.messages && typeof s.messages === 'object' && !Array.isArray(s.messages)) {
        const serverMsgs = s.messages as Record<string, Message[]>;
        setMessages(prev => {
          const allKeys = new Set([...Object.keys(prev), ...Object.keys(serverMsgs)]);
          let changed = false;
          const merged: Record<string, Message[]> = {};
          for (const k of allKeys) {
            const serverList: Message[] = Array.isArray(serverMsgs[k]) ? serverMsgs[k] : [];
            const localList: Message[] = prev[k] ?? [];
            if (serverList.length !== localList.length) {
              const localById = new Map(localList.map(m => [m.id, m]));
              merged[k] = serverList.map(m => {
                const local = localById.get(m.id);
                return local ? { ...m, read: m.read || local.read } : m;
              });
              changed = true;
            } else {
              merged[k] = localList;
            }
          }
          return changed ? merged : prev;
        });
      }
      if (!p.has('inventoryLog'))      setInventoryLog(safeArray<InventoryLogEntry>(s.inventoryLog));
      if (!p.has('tasks'))             setTasks(safeArray<Task>(s.tasks));
      if (!p.has('kpis'))              setKpis(safeArray<KPI>(s.kpis));
      if (!p.has('companyFiles'))      setCompanyFiles(safeArray<CompanyFile>(s.companyFiles));
      if (!p.has('deliveryEvidences')) setDeliveryEvidences(safeArray<DeliveryEvidence>(s.deliveryEvidences));
      if (!p.has('hrEmployees'))       setHrEmployees(safeArray<HREmployee>(s.hrEmployees));
      if (!p.has('hrHandbooks'))       setHrHandbooks(safeArray<HREmployeeDoc>(s.hrHandbooks));
      if (!p.has('hrRecommendations')) setHrRecommendations(safeArray<HRRecommendation>(s.hrRecommendations));
      if (!p.has('priceProposals'))    setPriceProposals(safeArray<PriceProposal>(s.priceProposals));
      if (!p.has('legalMatters'))      setLegalMatters(safeArray<LegalMatter>(s.legalMatters));
      if (!p.has('corpProjects'))      setCorpProjects(safeArray<CorpProject>(s.corpProjects));
      if (!p.has('broadcasts'))        setBroadcasts(safeArray<Broadcast>(s.broadcasts));
      if (!p.has('callLog'))           setCallLog(safeArray<CallRecord>(s.callLog));
      if (!p.has('meetingMinutes'))    setMeetingMinutes(safeArray<MeetingMinutes>(s.meetingMinutes));
      if (!p.has('pumpDailyReports'))  setPumpDailyReports(safeArray<PumpDailyReport>(s.pumpDailyReports));
      if (s.pumpInitialMeters && typeof s.pumpInitialMeters === 'object' && !p.has('pumpInitialMeters')) setPumpInitialMeters(s.pumpInitialMeters as Record<string, number>);
      if (s.pumpLockedMeters && typeof s.pumpLockedMeters === 'object' && !p.has('pumpLockedMeters')) setPumpLockedMeters(s.pumpLockedMeters as Record<string, number>);
      if (s.financialEntry && !p.has('financialEntry'))                     setFinancialEntry(s.financialEntry as FinancialEntry);
      // Lift the startup write-gate ONLY on success: server state is now applied, safe to accept user writes.
      // If syncFromServer fails (no network, 500, etc.), the gate stays DOWN so the app's empty defaults
      // cannot overwrite whatever real data is on the server. The next poll (3 s) will retry.
      initialSyncDoneRef.current = true;
    } catch {
      // silently ignore — network errors must not break the UI.
      // CRITICAL: DO NOT lift the gate on error. If we do, the empty default state in useState([])
      // will be PUT to the server by the syncSlice effects, wiping all real data permanently.
      // The gate stays closed; the next 3-second poll will retry syncFromServer.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Initial server sync once AsyncStorage has loaded ── */
  useEffect(() => {
    if (loaded) syncFromServer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

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
  useEffect(() => { if (loaded) syncSlice('expenses',          expenses); },          [expenses, loaded]);
  useEffect(() => { if (loaded) syncSlice('budgets',           budgets); },           [budgets, loaded]);
  useEffect(() => { if (loaded) syncSlice('sales',             sales); },             [sales, loaded]);
  useEffect(() => { if (loaded) syncSlice('dips',              dips); },              [dips, loaded]);
  useEffect(() => { if (loaded) syncSlice('deliveries',        deliveries); },        [deliveries, loaded]);
  useEffect(() => { if (loaded) syncSlice('maintenance',       maintenance); },       [maintenance, loaded]);
  useEffect(() => { if (loaded) syncSlice('audit',             audit); },             [audit, loaded]);
  useEffect(() => { if (loaded) syncSlice('messages',          messages); },          [messages, loaded]);
  useEffect(() => { if (loaded) syncSlice('broadcasts',        broadcasts); },        [broadcasts, loaded]);
  useEffect(() => { if (loaded) syncSlice('callLog',           callLog); },           [callLog, loaded]);
  useEffect(() => { if (loaded) syncSlice('tasks',             tasks); },             [tasks, loaded]);
  useEffect(() => { if (loaded) syncSlice('kpis',              kpis); },              [kpis, loaded]);
  useEffect(() => { if (loaded) syncSlice('inventoryLog',     inventoryLog); },    [inventoryLog, loaded]);
  useEffect(() => { if (loaded) syncSlice('companyFiles',      companyFiles); },      [companyFiles, loaded]);
  useEffect(() => { if (loaded) syncSlice('deliveryEvidences', deliveryEvidences); }, [deliveryEvidences, loaded]);
  useEffect(() => { if (loaded) syncSlice('hrEmployees',       hrEmployees); },       [hrEmployees, loaded]);
  useEffect(() => { if (loaded) syncSlice('hrHandbooks',       hrHandbooks); },       [hrHandbooks, loaded]);
  useEffect(() => { if (loaded) syncSlice('hrRecommendations', hrRecommendations); }, [hrRecommendations, loaded]);
  useEffect(() => { if (loaded) syncSlice('priceProposals',    priceProposals); },    [priceProposals, loaded]);
  useEffect(() => { if (loaded) syncSlice('legalMatters',      legalMatters); },      [legalMatters, loaded]);
  useEffect(() => { if (loaded) syncSlice('corpProjects',      corpProjects); },      [corpProjects, loaded]);
  useEffect(() => { if (loaded) syncSlice('meetingMinutes',    meetingMinutes); },    [meetingMinutes, loaded]);
  useEffect(() => { if (loaded) syncSlice('pumpDailyReports', pumpDailyReports); },  [pumpDailyReports, loaded]);
  useEffect(() => { if (loaded) syncSlice('pumpInitialMeters', pumpInitialMeters); }, [pumpInitialMeters, loaded]);
  useEffect(() => { if (loaded) syncSlice('pumpLockedMeters',  pumpLockedMeters); },  [pumpLockedMeters, loaded]);
  useEffect(() => { if (loaded) syncSlice('financialEntry',    financialEntry); },    [financialEntry, loaded]);

  /* ── Version-check poll: 3 s lightweight ping → full sync only when data changed ── */
  // /api/version returns a ~50-byte timestamp. syncFromServer() only fires when it changes,
  // so a pump attendant's shift report appears on every permitted screen within ~3 seconds.
  const lastVersionRef = useRef<string>('');
  useEffect(() => {
    if (!role || !loaded) return;

    const check = async () => {
      try {
        const result = await versionApi.get();
        if (result?.version && result.version !== lastVersionRef.current) {
          lastVersionRef.current = result.version;
          await syncFromServer();
        }
      } catch {
        // silently ignore transient network errors
      }
    };

    // Fire immediately on login/app-open so new data appears within ~300 ms,
    // not after the first 3-second interval tick.
    check();

    // Poll every 3 seconds
    const id = setInterval(check, 3_000);

    // Also re-sync the moment the user brings the app to the foreground
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') check();
    });

    return () => { clearInterval(id); sub.remove(); };
  }, [role, loaded, syncFromServer]);

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

  const login = useCallback((r: Role, n: string, sid?: number, bid?: string) => {
    setRole(r); setUserName(n);
    setBranchId(bid ?? null); setStaffId(sid ?? null);
    setIsServerAuthenticated(true);
    AsyncStorage.setItem('auth', JSON.stringify({ r, n, sid: sid ?? null, bid: bid ?? null }));
  }, []);

  const logout = useCallback(() => {
    setRole(null); setUserName(''); setBranchId(null); setStaffId(null);
    setIsServerAuthenticated(false);
    AsyncStorage.removeItem('auth');
    clearToken();
  }, []);

  const updateMgrPerms = useCallback((bid: string, perms: Partial<MgrPermissions>) => {
    setMgrPerms(p => ({ ...p, [bid]: { ...(p[bid] ?? DEFAULT_MGR_PERMS), ...perms } }));
    setAudit(a => [{ id: genId(), action: 'Manager permissions updated', user: userName, detail: `Branch ${bid}: ${JSON.stringify(perms)}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const updatePrice = useCallback((prod: string, price: number, by?: string, reason?: string) => {
    const oldPrice = (prices as any)[prod] ?? 0;
    const actor = by ?? userName;
    setPrices(p => ({ ...p, [prod]: price }));
    setPriceHistory(h => [{ id: genId(), prod, oldPrice, newPrice: price, by: actor, dt: nowTs(), reason }, ...h]);
    setAudit(a => [{ id: genId(), action: 'Price update', user: actor, detail: `${prod}: ₦${oldPrice} → ₦${price}/L${reason ? ' — ' + reason : ''}`, ts: nowTs() }, ...a]);
  }, [userName, prices]);

  const addPriceProposal = useCallback((prod: string, proposedPrice: number) => {
    const currentPrice = (prices as any)[prod] ?? 0;
    setPriceProposals(ps => [
      { id: genId(), prod, currentPrice, proposedPrice, proposedBy: userName, proposedAt: nowTs(), status: 'pending' },
      ...ps,
    ]);
    setAudit(a => [{ id: genId(), action: 'Price proposal submitted', user: userName, detail: `${prod}: ₦${currentPrice} → ₦${proposedPrice}/L (awaiting CEO approval)`, ts: nowTs() }, ...a]);
  }, [userName, prices]);

  const approvePriceProposal = useCallback((id: number) => {
    const proposal = priceProposals.find(p => p.id === id && p.status === 'pending');
    if (!proposal) return;
    updatePrice(proposal.prod, proposal.proposedPrice, userName);
    setPriceProposals(ps => ps.map(p =>
      p.id === id ? { ...p, status: 'approved' as const, reviewedBy: userName, reviewedAt: nowTs() } : p
    ));
    const msgKey = chatKey('ceo', 'md');
    setMessages(m => ({
      ...m,
      [msgKey]: [...(m[msgKey] || []), {
        id: genId(), from: 'ceo' as Role, to: 'md' as Role, type: 'alert' as const,
        body: `Price approved: ${proposal.prod} is now ₦${proposal.proposedPrice.toLocaleString()}/L`,
        alrt: { title: 'Price Change Approved', pri: 'Low', detail: `${proposal.prod}: ₦${proposal.currentPrice.toLocaleString()} → ₦${proposal.proposedPrice.toLocaleString()}/L (effective immediately)` },
        ts: nowTime(), read: false,
      }],
    }));
  }, [userName, updatePrice, priceProposals]);

  const updateAndApprovePriceProposal = useCallback((id: number, updatedPrice: number) => {
    const proposal = priceProposals.find(p => p.id === id && p.status === 'pending');
    if (!proposal) return;
    updatePrice(proposal.prod, updatedPrice, userName);
    setPriceProposals(ps => ps.map(p =>
      p.id === id ? { ...p, proposedPrice: updatedPrice, status: 'approved' as const, reviewedBy: userName, reviewedAt: nowTs() } : p
    ));
    setAudit(a => [{ id: genId(), action: 'Price proposal updated & approved', user: userName, detail: `${proposal.prod}: ₦${proposal.proposedPrice.toLocaleString()} → ₦${updatedPrice.toLocaleString()}/L (CEO updated price)`, ts: nowTs() }, ...a]);
    const msgKey = chatKey('ceo', 'md');
    setMessages(m => ({
      ...m,
      [msgKey]: [...(m[msgKey] || []), {
        id: genId(), from: 'ceo' as Role, to: 'md' as Role, type: 'alert' as const,
        body: `Price updated & approved: ${proposal.prod} is now ₦${updatedPrice.toLocaleString()}/L (CEO adjusted from your ₦${proposal.proposedPrice.toLocaleString()}/L)`,
        alrt: { title: 'Price Updated & Approved', pri: 'Low', detail: `${proposal.prod}: You proposed ₦${proposal.proposedPrice.toLocaleString()}/L, CEO set it to ₦${updatedPrice.toLocaleString()}/L (effective immediately)` },
        ts: nowTime(), read: false,
      }],
    }));
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

  const updatePump = useCallback((id: string, updates: Partial<Pick<Pump, 'name' | 'prod' | 'active' | 'branchId'>>) => {
    setPumps(p => p.map(pump => pump.id === id ? { ...pump, ...updates } : pump));
    setAudit(a => [{ id: genId(), action: 'Pump configuration updated', user: userName, detail: `Pump ${id}: ${JSON.stringify(updates)}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const updateStaff = useCallback((id: number, updates: Partial<Pick<Staff, 'name' | 'email' | 'sal' | 'dept'>>) => {
    setStaff(s => s.map(m => m.id === id ? { ...m, ...updates } : m));
    setAudit(a => [{ id: genId(), action: 'Staff record updated', user: userName, detail: `Staff ID ${id} updated`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addDip = useCallback((dip: Omit<DipRecord, 'id'>) => {
    const status = dip.status ?? 'pending';
    setDips(d => [{ ...dip, id: genId(), status }, ...d]);
    setAudit(a => [{ id: genId(), action: 'Dip submitted', user: userName, detail: 'All tanks dipped — awaiting MD approval.', ts: nowTs() }, ...a]);
  }, [userName]);

  const approveDip = useCallback((id: number) => {
    const rec = dips.find(r => r.id === id);
    if (rec) {
      // Snapshot tank state BEFORE resetting to compute discrepancies
      const logEntries: InventoryLogEntry[] = [];
      for (const tank of tanks) {
        const lvl = rec.rd[tank.id];
        if (lvl !== undefined) {
          const expected = tank.op + tank.rv - tank.sl;
          const actual = lvl;
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

      setTanks(ts => ts.map(tank => {
        const lvl = rec.rd[tank.id];
        return lvl !== undefined ? { ...tank, op: lvl, rv: 0, sl: 0 } : tank;
      }));
      setLpgTanks(ts => ts.map(lt => {
        const lvl = rec.lpg[lt.id];
        return lvl !== undefined ? { ...lt, op: lvl, rv: 0, sl: 0 } : lt;
      }));

      if (logEntries.length > 0) {
        setInventoryLog(log => [...log, ...logEntries]);

        // Send notifications for discrepancies > 50L
        const notifRoles: Role[] = ['md', 'ceo', 'acc', 'csm'];
        for (const entry of logEntries) {
          if (Math.abs(entry.discrepancy) > 50) {
            const dir = entry.discrepancy < 0 ? 'Shortage' : 'Overage';
            const detail = `${entry.tankName} (${entry.product}): Expected ${entry.expected.toLocaleString()}L · Actual ${entry.actual.toLocaleString()}L · ${dir}: ${Math.abs(entry.discrepancy).toLocaleString()}L`;
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
  }, [userName, dips, tanks]);

  const rejectDip = useCallback((id: number) => {
    setDips(d => d.map(rec => rec.id === id ? { ...rec, status: 'rejected', approvedBy: userName, approvedDt: nowTs() } : rec));
    setAudit(a => [{ id: genId(), action: 'Dip rejected', user: userName, detail: `Dip record #${id} rejected.`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addDelivery = useCallback((rec: Omit<Delivery, 'id'>) => {
    setDeliveries(d => [{ ...rec, id: genId(), branchId: rec.branchId ?? branchId ?? undefined }, ...d]);
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

  const approveDelivery = useCallback((id: number, sellingPrice: number, mdNote?: string) => {
    const d = deliveries.find(d => d.id === id);
    if (!d) return;
    setDeliveries(ds => ds.map(rec => rec.id === id ? { ...rec, approvalStatus: 'md_approved' as const, sellingPrice, mdNote: mdNote || '', approvedBy: userName, approvedAt: nowTs(), mdBy: userName, mdAt: nowTs() } : rec));
    setTanks(ts => {
      const matching = ts.filter(t => t.prod === d.prod && (!d.branchId || !t.branchId || t.branchId === d.branchId));
      if (matching.length === 0) return ts;
      const share = d.rec / matching.length;
      const ids = new Set(matching.map(t => t.id));
      return ts.map(t => ids.has(t.id) ? { ...t, rv: t.rv + share } : t);
    });
    // Update global selling price for this product
    updatePrice(d.prod, sellingPrice, userName);
    setAudit(a => [{ id: genId(), action: 'Delivery MD-approved', user: userName, detail: `WB: ${d.wb} — ${d.prod} ${d.rec}L · Cost ₦${d.costPrice}/L · Sell ₦${sellingPrice}/L · permanently locked`, ts: nowTs() }, ...a]);
    const msgKey = chatKey('md', 'acc');
    setMessages(m => ({
      ...m,
      [msgKey]: [...(m[msgKey] || []), {
        id: genId(), from: 'md' as Role, to: 'acc' as Role, type: 'alert' as const,
        body: `Delivery approved by MD: ${d.prod} ${d.rec.toLocaleString()}L from ${d.sup} (WB: ${d.wb}). Selling price set to ₦${sellingPrice.toLocaleString()}/L. Record locked.`,
        alrt: { title: 'Delivery MD Approved — Price Updated', pri: 'Low', detail: `WB: ${d.wb} · ${d.prod} · ${d.rec.toLocaleString()}L · Sell ₦${sellingPrice.toLocaleString()}/L` },
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

  const addMaintenance = useCallback((item: Omit<MaintenanceItem, 'id'>) => {
    setMaintenance(m => [{ ...item, id: genId() }, ...m]);
    setAudit(a => [{ id: genId(), action: 'Maintenance request', user: userName, detail: item.title, ts: nowTs() }, ...a]);
  }, [userName]);

  const addSales = useCallback((entry: Omit<SalesEntry, 'id'>) => {
    setSales(s => [...s, { ...entry, id: genId(), branchId: entry.branchId ?? branchId ?? undefined }]);
    setAudit(a => [{ id: genId(), action: 'Sales entry', user: userName, detail: `${entry.pump} — ${entry.L}L`, ts: nowTs() }, ...a]);
  }, [userName, branchId]);

  const sendMessage = useCallback((toName: string, msg: Omit<Message, 'id' | 'from' | 'ts' | 'read'>) => {
    if (!userName) return;
    const key = chatKey(userName, toName);
    const newMsg: Message = { ...msg, id: genId(), from: userName, ts: nowTime(), read: false };
    setMessages(m => ({ ...m, [key]: [...(m[key] || []), newMsg] }));
  }, [userName]);

  const markRead = useCallback((peerName: string) => {
    if (!userName) return;
    const key = chatKey(userName, peerName);
    setMessages(m => ({
      ...m,
      [key]: (m[key] || []).map(msg => msg.to === userName ? { ...msg, read: true } : msg),
    }));
  }, [userName]);

  const approveExpense = useCallback((id: number) => {
    setExpenses(e => e.map(x => x.id === id ? { ...x, status: 'approved', approvedBy: userName, approvedDt: nowTs() } : x));
  }, [userName]);

  const rejectExpense = useCallback((id: number) => {
    setExpenses(e => e.map(x => x.id === id ? { ...x, status: 'rejected' } : x));
  }, []);

  const addBudget = useCallback((b: Omit<Budget, 'id' | 'workflow'>) => {
    const isDraft = b.status === 'draft';
    const newBudget: Budget = {
      ...b, id: genId(),
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

  const updateBudget = useCallback((id: number, updates: { items: { cat: string; amt: number }[]; total: number; month: number; year: number; label: string }) => {
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
    setStaff(st => [...st, { ...s, id: genId() }]);
    setAudit(a => [{ id: genId(), action: 'User created', user: userName, detail: `${s.name} added as ${s.role}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const toggleStaff = useCallback((id: number) => {
    setStaff(st => st.map(s => s.id === id ? { ...s, st: s.st === 'Active' ? 'Suspended' : 'Active' } : s));
  }, []);

  const deleteStaff = useCallback((id: number) => {
    setStaff(st => st.filter(s => s.id !== id));
    setAudit(a => [{ id: genId(), action: 'User deleted', user: userName, detail: `Staff ID ${id} removed`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addBranch = useCallback((b: Omit<Branch, 'id'>) => {
    setBranches(br => [...br, { ...b, id: `B${genId()}` }]);
    setAudit(a => [{ id: genId(), action: 'Branch created', user: userName, detail: b.name, ts: nowTs() }, ...a]);
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

  const addActiveUserAccount = useCallback(async (acc: { empName: string; username: string; password: string; role: Role; branchId?: string; jobTitle?: string; dept?: string; phoneNumber?: string; createdBy: string }) => {
    // Send plaintext — server hashes via ensureHashed
    const row = await usersApi.create({
      empName: acc.empName, username: acc.username, password: acc.password,
      role: acc.role, branchId: acc.branchId, jobTitle: acc.jobTitle,
      dept: acc.dept, phoneNumber: acc.phoneNumber ?? null, status: 'active',
    });
    if (row) {
      setUserAccounts(prev => [...prev, apiRowToUserAccount(row)]);
    } else {
      // Offline fallback: keep in local state until connectivity restored
      setUserAccounts(prev => [...prev, {
        id: genId(), createdAt: nowTs(), status: 'active',
        approvedBy: acc.createdBy, approvedAt: nowTs(),
        empName: acc.empName, username: acc.username, password: '',
        role: acc.role, branchId: acc.branchId, jobTitle: acc.jobTitle, dept: acc.dept,
        phoneNumber: acc.phoneNumber, createdBy: acc.createdBy,
      }]);
    }
    setAudit(a => [{ id: genId(), action: 'Account created', user: acc.createdBy, detail: `Login created for ${acc.empName} (${acc.username}) as ${acc.role}`, ts: nowTs() }, ...a]);
  }, []);

  const updateUserAccount = useCallback(async (id: number, updates: { username?: string; password?: string; role?: Role; branchId?: string; phoneNumber?: string }, by: string) => {
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
    await usersApi.setStatus(id, 'rejected');
    setUserAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'rejected' as AccountStatus } : a));
    setAudit(a => [{ id: genId(), action: 'Enrollment rejected by MD', user: by, detail: `Enrollment #${id} rejected`, ts: nowTs() }, ...a]);
  }, []);

  const updateEnrollmentData = useCallback(async (id: number, data: { empName?: string; jobTitle?: string; dept?: string; phoneNumber?: string; nin?: string; staffAddress?: string; guarantorName?: string; guarantorPhone?: string; guarantorAddress?: string }, by: string) => {
    const row = await usersApi.update(id, data);
    if (row) {
      setUserAccounts(prev => prev.map(a => a.id === id ? apiRowToUserAccount(row) : a));
    } else {
      setUserAccounts(prev => prev.map(a => a.id === id ? { ...a, ...data } : a));
    }
    setAudit(a => [{ id: genId(), action: 'Enrollment data updated', user: by, detail: `Enrollment #${id} details updated by admin`, ts: nowTs() }, ...a]);
  }, []);

  const approveUserAccount = useCallback(async (id: number, role: Role, username: string, password: string, by: string, branchId?: string) => {
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
        return [...prev, { id: genId(), name: empName, role, sal: 0, st: 'Active', email: `${username}@gastsmarts.com`, dept }];
      });
      setHrEmployees(prev => {
        if (prev.some(e => e.name === empName)) return prev;
        const serial  = prev.length + 1;
        const hEmpId  = empIdVal ?? ('PTNG-' + String(serial).padStart(4, '0'));
        return [...prev, {
          id: genId(), empId: hEmpId, serial, name: empName, role,
          dept: dept ?? '', phone, email: `${username}@gastsmarts.com`,
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
    await usersApi.setStatus(id, 'rejected');
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

  const resubmitEnrollment = useCallback(async (id: number, updates: { empName?: string; jobTitle?: string; dept?: string; phoneNumber?: string; nin?: string; staffAddress?: string; guarantorName?: string; guarantorPhone?: string; guarantorAddress?: string }, by: string) => {
    if (Object.keys(updates).length > 0) {
      await usersApi.update(id, updates);
    }
    const row = await usersApi.setStatus(id, 'pending_admin');
    if (row) {
      setUserAccounts(prev => prev.map(a => a.id === id
        ? { ...apiRowToUserAccount(row), ...updates, status: 'pending_admin' as AccountStatus, rejectionReason: undefined, rejectedBy: undefined, rejectedAt: undefined }
        : a
      ));
    } else {
      setUserAccounts(prev => prev.map(a => a.id === id
        ? { ...a, ...updates, status: 'pending_admin' as AccountStatus, rejectionReason: undefined, rejectedBy: undefined, rejectedAt: undefined }
        : a
      ));
    }
    setAudit(a => [{ id: genId(), action: 'Enrollment resubmitted', user: by, detail: `${updates.empName ?? 'Enrollment'} re-submitted for Admin review`, ts: nowTs() }, ...a]);
  }, []);

  const deleteUserAccount = useCallback(async (id: number) => {
    await usersApi.remove(id);
    setUserAccounts(prev => prev.filter(a => a.id !== id));
  }, []);

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

  const addExpense = useCallback((exp: Omit<Expense, 'id' | 'dt' | 'status'>) => {
    setExpenses(e => [...e, { ...exp, id: genId(), dt: nowTs(), status: 'pending', branchId: exp.branchId ?? branchId ?? undefined }]);
    setAudit(a => [{ id: genId(), action: 'Expense submitted', user: userName, detail: `${exp.cat} — ₦${exp.amt.toLocaleString()}`, ts: nowTs() }, ...a]);
  }, [userName, branchId]);

  const updateExpense = useCallback((id: number, updates: Partial<Pick<Expense, 'cat' | 'desc' | 'amt' | 'ref'>>) => {
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

  const resetOperationalData = useCallback(() => {
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
    // Audit must be written AFTER the arrays are cleared, not before, so it survives the reset.
    setAudit(a => [{ id: genId(), action: 'Operational data reset', user: userName, detail: 'All operational data cleared via System Settings', ts: nowTs() }, ...a]);
  }, [userName]);

  const submitPumpReport = useCallback((r: Omit<PumpDailyReport, 'id' | 'status' | 'submittedAt'>) => {
    setPumpDailyReports(rs => [...rs, { ...r, id: genId(), status: 'pending_manager', submittedAt: nowTs() }]);
    setAudit(a => [{ id: genId(), action: 'Pump report submitted', user: userName, detail: `${r.pumpName} · ${r.liters.toLocaleString()}L · variance: ₦${r.variance.toLocaleString()}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const mgrForwardPumpReport = useCallback((id: number, mgrNote: string) => {
    setPumpDailyReports(rs => rs.map(r => r.id === id ? { ...r, status: 'pending_accountant', mgrNote, mgrBy: userName, mgrAt: nowTs() } : r));
    setAudit(a => [{ id: genId(), action: 'Pump report forwarded to accountant', user: userName, detail: `Report #${id} — ${mgrNote}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const mgrResubmitPumpReport = useCallback((id: number, mgrNote: string) => {
    setPumpDailyReports(rs => rs.map(r => r.id === id ? { ...r, status: 'pending_accountant', mgrNote, mgrBy: userName, mgrAt: nowTs(), rejectionReason: undefined } : r));
    setAudit(a => [{ id: genId(), action: 'Pump report re-submitted to accountant', user: userName, detail: `Report #${id} — ${mgrNote}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const accApprovePumpReport = useCallback((report: PumpDailyReport, accNote: string) => {
    const id = report.id;
    setPumpDailyReports(rs => rs.map(r => r.id === id ? { ...r, status: 'approved', accNote, accBy: userName, accAt: nowTs() } : r));
    setSales(s => {
      if (s.some(e => e.shiftReportId === id)) return s;
      return [...s, {
        id: genId(),
        shiftReportId: id,
        pump: `${report.pumpName} (${report.product})`,
        by: report.submittedBy,
        L: report.liters,
        price: report.unitPrice,
        dt: report.date,
        pos: report.posAmount,
        branchId: report.branchId,
      }];
    });
    setTanks(ts => {
      const matching = ts.filter(t => t.prod === report.product && (!report.branchId || !t.branchId || t.branchId === report.branchId));
      if (matching.length === 0) return ts;
      const share = report.liters / matching.length;
      const ids = new Set(matching.map(t => t.id));
      return ts.map(t => ids.has(t.id) ? { ...t, sl: t.sl + share } : t);
    });
    setAudit(a => [{ id: genId(), action: 'Pump report approved', user: userName, detail: `Report #${id} — ${report.pumpName} · ${report.liters}L · sales record auto-created`, ts: nowTs() }, ...a]);
  }, [userName]);

  const accRejectPumpReport = useCallback((id: number, rejectionReason: string) => {
    setPumpDailyReports(rs => rs.map(r => r.id === id ? { ...r, status: 'returned', rejectionReason, accBy: userName, accAt: nowTs() } : r));
    setAudit(a => [{ id: genId(), action: 'Pump report rejected', user: userName, detail: `Report #${id} — ${rejectionReason}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const deletePumpReport = useCallback((id: number) => {
    setPumpDailyReports(rs => rs.filter(r => r.id !== id || r.status === 'approved'));
    setAudit(a => [{ id: genId(), action: 'Pump report deleted', user: userName, detail: `Report #${id} deleted by attendant`, ts: nowTs() }, ...a]);
  }, [userName]);

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
    setHrEmployees(prev => prev.filter(e => e.id !== id));
  }, []);

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
    const newMsg: Message = { ...msg, id: genId(), ts: nowTime(), read: false };
    setMessages(m => ({ ...m, [key]: [...(m[key] || []), newMsg] }));
  }, [role]);

  const getConversation = useCallback((peerName: string): Message[] => {
    if (!userName) return [];
    return messages[chatKey(userName, peerName)] || [];
  }, [userName, messages]);

  const unreadCount = useCallback((): number => {
    if (!userName) return 0;
    return Object.values(messages).reduce((sum, msgs) => {
      if (!Array.isArray(msgs)) return sum;
      return sum + msgs.filter(m => m.to === userName && !m.read).length;
    }, 0);
  }, [userName, messages]);

  const updateRoleAccess = useCallback((targetRole: string, moduleId: string, enabled: boolean) => {
    setRoleAccess(prev => ({
      ...prev,
      [targetRole]: { ...(prev[targetRole] ?? {}), [moduleId]: enabled },
    }));
  }, []);

  const updateUserAccess = useCallback((uid: number, moduleId: string, enabled: boolean) => {
    setUserAccess(prev => ({
      ...prev,
      [uid]: { ...(prev[uid] ?? {}), [moduleId]: enabled },
    }));
  }, []);

  const clearUserAccess = useCallback((uid: number) => {
    setUserAccess(prev => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  }, []);

  // Admin always sees their own fixed nav; every other role starts from FULL_NAV_CATALOG
  // then gets filtered by roleAccess (role-level toggles) and userAccess (per-user overrides).
  // Both are controlled exclusively by the admin via the Access Control panel.
  const baseNav: NavItem[] = role === 'admin'
    ? (NAVDEF.admin ?? [])
    : FULL_NAV_CATALOG;
  const addBroadcast = useCallback((b: Omit<Broadcast, 'id' | 'ts'>) => {
    setBroadcasts(prev => [{ ...b, id: genId(), ts: nowTs() }, ...prev]);
  }, []);

  const addCallRecord = useCallback((r: Omit<CallRecord, 'id' | 'ts'>) => {
    setCallLog(prev => [{ ...r, id: genId(), ts: nowTs() }, ...prev]);
  }, []);

  const updateFinancialEntry = useCallback((updates: Partial<Omit<FinancialEntry, 'updatedBy' | 'updatedAt'>>) => {
    setFinancialEntry(prev => ({ ...prev, ...updates, updatedBy: userName, updatedAt: nowTs() }));
  }, [userName]);

  const navItems: NavItem[] = role === 'admin'
    ? baseNav
    : baseNav.filter(item => {
        // Per-user override takes priority over role default
        if (staffId !== null) {
          const userLevel = (userAccess[staffId] ?? {})[item.id];
          if (userLevel !== undefined) return userLevel;
        }
        return (roleAccess[role ?? 'att'] ?? {})[item.id] !== false;
      });

  return (
    <AppContext.Provider value={{
      companyInfo, updateCompanyInfo,
      role, userName, branchId, staffId, isServerAuthenticated, navItems, mgrPerms,
      login, logout, updateMgrPerms, roleAccess, updateRoleAccess, userAccess, updateUserAccess, clearUserAccess,
      prices, priceHistory, tanks, lpgTanks, pumps, dips, deliveries,
      maintenance, sales, staff, branches, docs, expenses, budgets, financialEntry, updateFinancialEntry, messages, broadcasts, callLog,
      addBroadcast, addCallRecord,
      audit, departments, companyFiles, deliveryEvidences,
      priceProposals, addPriceProposal, approvePriceProposal, updateAndApprovePriceProposal, rejectPriceProposal,
      updatePrice, addTank, addLpgTank, addPump,
      updateTank, updateLpgTank, updatePump, updateStaff,
      addExpense, updateExpense, deleteExpense, forwardExpenseToMD, addBudget, updateBudget, deleteBudget, submitBudgetToAcc, forwardBudget, approveBudget, rejectBudget,
      addDip, approveDip, rejectDip, addDelivery, updateDelivery, deleteDelivery, submitDeliveryForApproval, accForwardToMd, approveDelivery, rejectDelivery, addMaintenance, addSales,
      addCompanyFile, addDeliveryEvidence,
      pumpDailyReports, pumpInitialMeters, pumpLockedMeters, inventoryLog, setPumpInitialMeter, lockPumpMeter, unlockPumpMeter, resetOperationalData,
      submitPumpReport, mgrForwardPumpReport, accApprovePumpReport, accRejectPumpReport, mgrResubmitPumpReport, deletePumpReport,
      sendMessage, addSystemNotification, markRead, approveExpense, rejectExpense,
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
