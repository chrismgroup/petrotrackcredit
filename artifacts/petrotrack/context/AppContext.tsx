import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Role = 'admin' | 'ceo' | 'md' | 'mktg' | 'csm' | 'acc' | 'mgr' | 'att';

export interface Tank {
  id: string; name: string; prod: 'PMS' | 'AGO' | 'DPK';
  cap: number; dip: number; op: number; rv: number; sl: number;
}
export interface LPGTank { id: string; name: string; cap: number; op: number; rv: number; sl: number; }
export interface Pump { id: string; name: string; prod: 'PMS' | 'AGO' | 'DPK' | 'LPG'; active: boolean; }
export interface DipRecord { id: number; dt: string; by: string; rd: Record<string, number>; lpg: Record<string, number>; obs: string; status: 'pending' | 'approved' | 'rejected'; approvedBy?: string; approvedDt?: string; }
export interface Delivery { id: number; dt: string; sup: string; prod: string; wb: string; ord: number; rec: number; st: 'ok' | 'short' | 'spill' | 'seal'; notes: string; costPrice?: number; receivedBy?: string; }
export interface MaintenanceItem { id: number; title: string; pri: 'Urgent' | 'Medium' | 'Low'; by: string; date: string; st: 'Open' | 'Done'; cost?: number; }
export interface SalesEntry { id: number; pump: string; by: string; L: number; price: number; dt: string; pos?: number; }
export interface Staff { id: number; name: string; role: string; sal: number; st: 'Active' | 'Suspended'; email: string; }
export interface Branch { id: string; name: string; st: 'Active' | 'Pending' | 'Suspended'; rev: number; mgr: string; pumps: number; tanks: number; }
export interface ComplianceDoc { id: number; name: string; cat: string; iss: string; exp: string; ref: string; }
export interface Expense { id: number; dt: string; cat: string; desc: string; amt: number; by: string; byName: string; status: 'pending' | 'approved' | 'rejected'; approvedBy?: string; approvedDt?: string; budgetId: number; ref?: string; }
export interface BudgetWorkflowStep { stage: string; by: string; role: string; dt: string; action: string; note: string; }
export interface Budget { id: number; month: number; year: number; label: string; by: string; byName: string; items: { cat: string; amt: number }[]; total: number; status: string; workflow: BudgetWorkflowStep[]; }
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

export type AccountStatus = 'pending' | 'active' | 'suspended' | 'rejected';
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
}
export const MGR_BRANCH_NAMES: Record<string, string> = {
  HQ: 'HQ — Abuja CBD', B1: 'Maitama Branch', B2: 'Lugbe Branch',
};
export interface Department { id: string; name: string; icon: string; col: { bg: string; fg: string }; roles: string[]; sys: boolean; }
export interface Prices { PMS: number; AGO: number; DPK: number; LPG: number; 'Lube Oil': number; }
export interface PriceChange { id: number; prod: string; oldPrice: number; newPrice: number; by: string; dt: string; }
export interface Message { id: number; from: Role; to: Role; type: 'txt' | 'req' | 'alert'; body: string; ts: string; read: boolean; req?: { product: string; qty: number; sup: string; reason: string }; alrt?: { title: string; pri: string; detail: string }; }
export interface AuditEntry { id: number; action: string; user: string; detail: string; ts: string; }
export interface CompanyInfo {
  name: string; rcNumber: string; tin: string; address: string;
  phone: string; email: string; website: string;
  vatRate: string; whtRate: string; currency: string; fiscalYearStart: string;
  lowStockAlert: string; reorderLevel: string;
  dailyDipRequired: boolean; autoAuditLogging: boolean;
}
export const BLANK_COMPANY_INFO: CompanyInfo = {
  name: '', rcNumber: '', tin: '', address: '',
  phone: '', email: '', website: '',
  vatRate: '7.5', whtRate: '5', currency: 'NGN', fiscalYearStart: 'January',
  lowStockAlert: '20', reorderLevel: '30',
  dailyDipRequired: true, autoAuditLogging: true,
};
export interface CompanyFile { id: number; name: string; cat: string; by: string; dt: string; size: string; fileType: 'pdf' | 'docx' | 'xlsx' | 'img' | 'mp4' | 'other'; }
export type TaskStatus = 'commenced' | 'progressing' | 'completed';
export type TaskPriority = 'High' | 'Medium' | 'Low';
export type TaskCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly';
export interface Task { id: number; title: string; desc: string; assignedBy: Role; assignedByName: string; assignedTo: Role; assignedToName: string; status: TaskStatus; priority: TaskPriority; cadence: TaskCadence; target?: string; targetUnit?: string; dueDate: string; createdAt: string; }
export interface KPI { id: number; title: string; target: string; unit: string; period: string; assignedTo: Role; assignedToName: string; createdAt: string; }
export interface DeliveryEvidence { id: number; delivId: number; type: 'photo' | 'video'; name: string; dt: string; by: string; }
export interface ShiftReport { id: number; dt: string; by: string; byName: string; entries: number; totalSales: number; totalPOS: number; expectedCash: number; actualCash: number; variance: number; status: 'submitted' | 'reviewed' | 'flagged'; note: string; }

export type HRDocType = 'biodata' | 'contract' | 'guarantor' | 'nin' | 'passport_photo' | 'certificate' | 'nysc' | 'medical' | 'reference' | 'bank_details' | 'tin' | 'pension';
export type HRDocStatus = 'pending' | 'submitted' | 'approved' | 'n/a';
export interface HRDoc { type: HRDocType; status: HRDocStatus; date?: string; note?: string; fileName?: string; }
export interface HREmployeeDoc { id: number; name: string; fileType: string; cat: string; uploadedBy: string; dt: string; approved: boolean; approvedBy?: string; approvedAt?: string; uri?: string; mimeType?: string; size?: number; }
export type OnboardingStatus = 'draft' | 'forwarded' | 'md_approved' | 'ceo_approved';
export interface OnboardingApproval { status: OnboardingStatus; forwardedAt?: string; forwardedBy?: string; mdApprovedBy?: string; mdApprovedAt?: string; ceoApprovedBy?: string; ceoApprovedAt?: string; }
export interface GeneratedLetter { id: number; type: 'appointment' | 'promotion'; title: string; content: string; generatedAt: string; generatedBy: string; newRole?: string; }
export interface HRRecommendation { id: number; empId: number; empName: string; type: 'suspend' | 'deactivate' | 'delete'; reason: string; by: string; dt: string; status: 'pending' | 'approved' | 'rejected'; resolvedBy?: string; resolvedAt?: string; }
export interface HREmployee { id: number; empId: string; serial: number; name: string; role: string; dept: string; phone: string; email: string; address: string; dob: string; joinDate: string; nextOfKin: string; status: 'active' | 'suspended' | 'inactive'; docs: HRDoc[]; uploads: HREmployeeDoc[]; onboarding: OnboardingApproval; letters: GeneratedLetter[]; }

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator', ceo: 'Chief Executive Officer', md: 'Managing Director',
  mktg: 'Marketing Manager', csm: 'Corp. Services Mgr', acc: 'Accountant',
  mgr: 'Station Manager', att: 'Pump Attendant',
};

export const ROLE_COLORS: Record<string, string> = {
  admin: '#0a2318', ceo: '#1a6e3c', md: '#4527a0', mktg: '#D85A30',
  csm: '#0F6E56', acc: '#185FA5', mgr: '#BA7517', att: '#633806',
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
  ceo: { name: 'Amaka Osei', color: '#1a6e3c', initials: 'AO', role: 'CEO', online: true },
  md: { name: 'Adaeze Obi', color: '#4527a0', initials: 'AD', role: 'MD', online: true },
  mktg: { name: 'Funmi Adesanya', color: '#D85A30', initials: 'FA', role: 'Mktg', online: false },
  csm: { name: 'Ngozi Eze', color: '#0F6E56', initials: 'NE', role: 'CSM', online: true },
  acc: { name: 'Grace Adeyemi', color: '#185FA5', initials: 'GA', role: 'Acct', online: true },
  mgr: { name: 'Chukwuma Adeyemi', color: '#BA7517', initials: 'CA', role: 'Mgr', online: true },
  att: { name: 'Emeka Okafor', color: '#633806', initials: 'EO', role: 'Att', online: true },
};

export const NAVDEF: Record<string, NavItem[]> = {
  admin: [
    { id: 'home', icon: 'shield-checkmark', label: 'Admin' },
    { id: 'users', icon: 'people', label: 'Users' },
    { id: 'depts', icon: 'grid', label: 'Depts' },
    { id: 'branches', icon: 'business', label: 'Branches' },
    { id: 'audit', icon: 'list', label: 'Audit' },
    { id: 'settings', icon: 'settings', label: 'Settings' },
  ],
  ceo: [
    { id: 'home', icon: 'home', label: 'Home' },
    { id: 'tasks', icon: 'checkmark-circle', label: 'Tasks' },
    { id: 'hr', icon: 'people-circle', label: 'HR' },
    { id: 'msgs', icon: 'chatbubbles', label: 'Chat' },
    { id: 'acct', icon: 'calculator', label: 'Accounts' },
    { id: 'mktg', icon: 'megaphone', label: 'Mktg' },
  ],
  md: [
    { id: 'ops',      icon: 'construct',        label: 'Ops'      },
    { id: 'tasks',    icon: 'checkmark-circle', label: 'Tasks'    },
    { id: 'branches', icon: 'business',         label: 'Branches' },
    { id: 'hr',       icon: 'people-circle',    label: 'HR'       },
    { id: 'budget',   icon: 'wallet',           label: 'Budget'   },
    { id: 'msgs',     icon: 'chatbubbles',      label: 'Chat'     },
    { id: 'exprpt',   icon: 'analytics',        label: 'Reports'  },
    { id: 'sales',    icon: 'bar-chart',        label: 'Sales'    },
  ],
  mktg: [
    { id: 'mktg', icon: 'megaphone', label: 'Marketing' },
    { id: 'tasks', icon: 'checkmark-circle', label: 'Tasks' },
    { id: 'msgs', icon: 'chatbubbles', label: 'Chat' },
    { id: 'sales', icon: 'bar-chart', label: 'Sales' },
  ],
  csm: [
    { id: 'corp',  icon: 'briefcase',        label: 'Corporate'  },
    { id: 'hr',    icon: 'people-circle',    label: 'HR'         },
    { id: 'tasks', icon: 'checkmark-circle', label: 'Tasks'      },
    { id: 'msgs',  icon: 'chatbubbles',      label: 'Chat'       },
    { id: 'ops',   icon: 'construct',        label: 'Operations' },
  ],
  acc: [
    { id: 'acct',   icon: 'calculator',       label: 'Accounts' },
    { id: 'tasks',  icon: 'checkmark-circle', label: 'Tasks'    },
    { id: 'recv',   icon: 'cube',             label: 'Receive'  },
    { id: 'exp',    icon: 'receipt',          label: 'Expenses' },
    { id: 'budget', icon: 'wallet',           label: 'Budget'   },
    { id: 'msgs',   icon: 'chatbubbles',      label: 'Chat'     },
    { id: 'exprpt', icon: 'analytics',        label: 'Reports'  },
  ],
  mgr: [
    { id: 'ops',   icon: 'construct',        label: 'Operations' },
    { id: 'tasks', icon: 'checkmark-circle', label: 'Tasks'      },
    { id: 'exp',   icon: 'receipt',          label: 'Expenses'   },
    { id: 'msgs',  icon: 'chatbubbles',      label: 'Chat'       },
  ],
  att: [
    { id: 'ops',   icon: 'construct',        label: 'Operations' },
    { id: 'tasks', icon: 'checkmark-circle', label: 'Tasks'      },
    { id: 'shift', icon: 'calculator',       label: 'Shift'      },
    { id: 'msgs',  icon: 'chatbubbles',      label: 'Chat'       },
  ],
};

const MGR_NAV_ALL: NavItem[] = [
  { id: 'ops',    icon: 'construct',   label: 'Operations' },
  { id: 'exp',    icon: 'receipt',     label: 'Expenses'   },
  { id: 'budget', icon: 'wallet',      label: 'Budget'     },
  { id: 'msgs',   icon: 'chatbubbles', label: 'Chat'       },
];
const MGR_NAV_PERM: Record<string, keyof MgrPermissions> = {
  exp: 'canExpenses', budget: 'canBudget', msgs: 'canChat',
};
const INIT_MGR_PERMS: Record<string, MgrPermissions> = {};

// Full nav catalogue per role (mgr uses MGR_NAV_ALL, all others use NAVDEF)
export const ROLE_FULL_NAV: Record<string, NavItem[]> = {
  ...NAVDEF,
  mgr: MGR_NAV_ALL,
};

// Build a default roleAccess object with every module enabled
function defaultRoleAccess(): Record<string, Record<string, boolean>> {
  const result: Record<string, Record<string, boolean>> = {};
  for (const [r, items] of Object.entries(ROLE_FULL_NAV)) {
    if (r === 'admin') continue;
    result[r] = Object.fromEntries(items.map(i => [i.id, true]));
  }
  return result;
}

export const SCREEN_ROUTES: Record<string, string> = {
  home: '/(app)/home', users: '/(app)/users', depts: '/(app)/departments',
  audit: '/(app)/audit', settings: '/(app)/system-settings', ops: '/(app)/operations',
  tanks: '/(app)/tanks', acct: '/(app)/accounts', corp: '/(app)/corporate',
  branches: '/(app)/branches', maint: '/(app)/maintenance', sales: '/(app)/sales',
  msgs: '/(app)/messages', budget: '/(app)/budget', exp: '/(app)/expenses',
  exprpt: '/(app)/reports', mktg: '/(app)/marketing', shift: '/(app)/shift',
  tasks: '/(app)/tasks',
  recv: '/(app)/receiving',
  hr: '/(app)/hr',
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
const INIT_SHIFTS: ShiftReport[] = [];
const INIT_COMPANY_FILES: CompanyFile[] = [];
const INIT_DELIVERY_EVIDENCE: DeliveryEvidence[] = [];
const INIT_EXPENSES: Expense[] = [];
const INIT_BUDGETS: Budget[] = [];
const INIT_TASKS: Task[] = [];
const INIT_KPIS: KPI[] = [];
const INIT_AUDIT: AuditEntry[] = [];
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

interface AppContextType {
  companyInfo: CompanyInfo; updateCompanyInfo: (updates: Partial<CompanyInfo>) => void;
  role: Role | null; userName: string; branchId: string | null; staffId: number | null;
  navItems: NavItem[]; mgrPerms: Record<string, MgrPermissions>;
  login: (role: Role, name: string, staffId?: number, branchId?: string) => void; logout: () => void;
  updateMgrPerms: (branchId: string, perms: Partial<MgrPermissions>) => void;
  prices: Prices; priceHistory: PriceChange[]; tanks: Tank[]; lpgTanks: LPGTank[]; pumps: Pump[];
  dips: DipRecord[]; deliveries: Delivery[]; maintenance: MaintenanceItem[];
  sales: SalesEntry[]; staff: Staff[]; branches: Branch[];
  docs: ComplianceDoc[]; expenses: Expense[]; budgets: Budget[];
  addBudget: (b: Omit<Budget, 'id' | 'workflow'>) => void;
  forwardBudget: (id: number, note: string) => void;
  approveBudget: (id: number, note: string) => void;
  rejectBudget: (id: number, note: string) => void;
  messages: Record<string, Message[]>; audit: AuditEntry[]; departments: Department[];
  companyFiles: CompanyFile[]; deliveryEvidences: DeliveryEvidence[]; shiftReports: ShiftReport[];
  updatePrice: (prod: string, price: number) => void;
  addTank: (t: Omit<Tank, 'id' | 'dip' | 'op' | 'rv' | 'sl'>) => void;
  addLpgTank: (t: Omit<LPGTank, 'id' | 'op' | 'rv' | 'sl'>) => void;
  addPump: (p: Omit<Pump, 'id'>) => void;
  updateTank: (id: string, updates: Partial<Pick<Tank, 'name' | 'cap' | 'prod' | 'dip'>>) => void;
  updateLpgTank: (id: string, updates: Partial<Pick<LPGTank, 'name' | 'cap'>>) => void;
  updatePump: (id: string, updates: Partial<Pick<Pump, 'name' | 'prod' | 'active'>>) => void;
  updateStaff: (id: number, updates: Partial<Pick<Staff, 'name' | 'email' | 'sal'>>) => void;
  addExpense: (exp: Omit<Expense, 'id' | 'dt' | 'status'>) => void;
  addCompanyFile: (file: Omit<CompanyFile, 'id' | 'dt'>) => void;
  addDeliveryEvidence: (ev: Omit<DeliveryEvidence, 'id' | 'dt'>) => void;
  addShiftReport: (r: Omit<ShiftReport, 'id' | 'dt' | 'status'>) => void;
  reviewShift: (id: number) => void;
  flagShift: (id: number) => void;
  addDip: (dip: Omit<DipRecord, 'id'>) => void;
  approveDip: (id: number) => void;
  rejectDip: (id: number) => void;
  addDelivery: (rec: Omit<Delivery, 'id'>) => void;
  addMaintenance: (item: Omit<MaintenanceItem, 'id'>) => void;
  addSales: (entry: Omit<SalesEntry, 'id'>) => void;
  sendMessage: (to: Role, msg: Omit<Message, 'id' | 'from' | 'ts' | 'read'>) => void;
  addSystemNotification: (from: Role, msg: Omit<Message, 'id' | 'ts' | 'read'>) => void;
  markRead: (peer: Role) => void;
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
  deleteDepartment: (id: string) => void;
  userAccounts: UserAccount[];
  addUserAccount: (acc: Omit<UserAccount, 'id' | 'createdAt' | 'status' | 'username' | 'password' | 'role'>) => void;
  addActiveUserAccount: (acc: { empName: string; username: string; password: string; role: Role; branchId?: string; jobTitle?: string; dept?: string; createdBy: string }) => void;
  updateUserAccount: (id: number, updates: { username?: string; password?: string; role?: Role; branchId?: string }, by: string) => void;
  changeOwnPassword: (currentPassword: string, newPassword: string) => boolean;
  approveUserAccount: (id: number, role: Role, username: string, password: string, by: string, branchId?: string) => void;
  suspendUserAccount: (id: number) => void;
  reactivateUserAccount: (id: number) => void;
  rejectUserAccount: (id: number) => void;
  deleteUserAccount: (id: number) => void;
  validateCredentials: (username: string, password: string) => UserAccount | null;
  getConversation: (peer: Role) => Message[];
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
  const [shiftReports, setShiftReports] = useState<ShiftReport[]>(INIT_SHIFTS);
  const [tasks, setTasks] = useState<Task[]>(INIT_TASKS);
  const [kpis, setKpis] = useState<KPI[]>(INIT_KPIS);
  const [hrEmployees, setHrEmployees] = useState<HREmployee[]>(INIT_HR_EMPLOYEES);
  const [hrRecommendations, setHrRecommendations] = useState<HRRecommendation[]>(INIT_HR_RECOMMENDATIONS);
  const [hrHandbooks, setHrHandbooks] = useState<HREmployeeDoc[]>(INIT_HR_HANDBOOKS);

  useEffect(() => {
    AsyncStorage.getItem('auth').then(v => {
      if (v) { const { r, n, sid, bid } = JSON.parse(v); setRole(r); setUserName(n); setStaffId(sid ?? null); setBranchId(bid ?? null); }
    });
  }, []);

  const login = useCallback((r: Role, n: string, sid?: number, bid?: string) => {
    setRole(r); setUserName(n);
    setBranchId(bid ?? null); setStaffId(sid ?? null);
    AsyncStorage.setItem('auth', JSON.stringify({ r, n, sid: sid ?? null, bid: bid ?? null }));
  }, []);

  const logout = useCallback(() => {
    setRole(null); setUserName(''); setBranchId(null); setStaffId(null);
    AsyncStorage.removeItem('auth');
  }, []);

  const updateMgrPerms = useCallback((bid: string, perms: Partial<MgrPermissions>) => {
    setMgrPerms(p => ({ ...p, [bid]: { ...(p[bid] ?? DEFAULT_MGR_PERMS), ...perms } }));
    setAudit(a => [{ id: genId(), action: 'Manager permissions updated', user: userName, detail: `Branch ${bid}: ${JSON.stringify(perms)}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const updatePrice = useCallback((prod: string, price: number) => {
    const oldPrice = (prices as any)[prod] ?? 0;
    setPrices(p => ({ ...p, [prod]: price }));
    setPriceHistory(h => [{ id: genId(), prod, oldPrice, newPrice: price, by: userName, dt: nowTs() }, ...h]);
    setAudit(a => [{ id: genId(), action: 'Price update', user: userName, detail: `${prod}: ₦${oldPrice} → ₦${price}/L`, ts: nowTs() }, ...a]);
  }, [userName, prices]);

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

  const addPump = useCallback((p: Omit<Pump, 'id'>) => {
    const id = `P${Date.now()}`;
    setPumps(ps => [...ps, { ...p, id }]);
    setAudit(a => [{ id: genId(), action: 'Pump added', user: userName, detail: `${p.name} (${p.prod})`, ts: nowTs() }, ...a]);
  }, [userName]);

  const updateTank = useCallback((id: string, updates: Partial<Pick<Tank, 'name' | 'cap' | 'prod' | 'dip'>>) => {
    setTanks(t => t.map(tank => tank.id === id ? { ...tank, ...updates } : tank));
    setAudit(a => [{ id: genId(), action: 'Tank configuration updated', user: userName, detail: `Tank ${id}: ${JSON.stringify(updates)}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const updateLpgTank = useCallback((id: string, updates: Partial<Pick<LPGTank, 'name' | 'cap'>>) => {
    setLpgTanks(t => t.map(tank => tank.id === id ? { ...tank, ...updates } : tank));
    setAudit(a => [{ id: genId(), action: 'LPG tank configuration updated', user: userName, detail: `LPG Tank ${id}: ${JSON.stringify(updates)}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const updatePump = useCallback((id: string, updates: Partial<Pick<Pump, 'name' | 'prod' | 'active'>>) => {
    setPumps(p => p.map(pump => pump.id === id ? { ...pump, ...updates } : pump));
    setAudit(a => [{ id: genId(), action: 'Pump configuration updated', user: userName, detail: `Pump ${id}: ${JSON.stringify(updates)}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const updateStaff = useCallback((id: number, updates: Partial<Pick<Staff, 'name' | 'email' | 'sal'>>) => {
    setStaff(s => s.map(m => m.id === id ? { ...m, ...updates } : m));
    setAudit(a => [{ id: genId(), action: 'Staff record updated', user: userName, detail: `Staff ID ${id} updated`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addDip = useCallback((dip: Omit<DipRecord, 'id'>) => {
    const status = dip.status ?? 'pending';
    setDips(d => [{ ...dip, id: genId(), status }, ...d]);
    setAudit(a => [{ id: genId(), action: 'Dip submitted', user: userName, detail: 'All tanks dipped — awaiting MD approval.', ts: nowTs() }, ...a]);
  }, [userName]);

  const approveDip = useCallback((id: number) => {
    setDips(d => d.map(rec => rec.id === id ? { ...rec, status: 'approved', approvedBy: userName, approvedDt: nowTs() } : rec));
    setAudit(a => [{ id: genId(), action: 'Dip approved', user: userName, detail: `Dip record #${id} approved.`, ts: nowTs() }, ...a]);
  }, [userName]);

  const rejectDip = useCallback((id: number) => {
    setDips(d => d.map(rec => rec.id === id ? { ...rec, status: 'rejected', approvedBy: userName, approvedDt: nowTs() } : rec));
    setAudit(a => [{ id: genId(), action: 'Dip rejected', user: userName, detail: `Dip record #${id} rejected.`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addDelivery = useCallback((rec: Omit<Delivery, 'id'>) => {
    setDeliveries(d => [{ ...rec, id: genId() }, ...d]);
    setAudit(a => [{ id: genId(), action: 'Delivery recorded', user: userName, detail: `${rec.prod} — ${rec.rec}L from ${rec.sup}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addMaintenance = useCallback((item: Omit<MaintenanceItem, 'id'>) => {
    setMaintenance(m => [{ ...item, id: genId() }, ...m]);
    setAudit(a => [{ id: genId(), action: 'Maintenance request', user: userName, detail: item.title, ts: nowTs() }, ...a]);
  }, [userName]);

  const addSales = useCallback((entry: Omit<SalesEntry, 'id'>) => {
    setSales(s => [...s, { ...entry, id: genId() }]);
    setAudit(a => [{ id: genId(), action: 'Sales entry', user: userName, detail: `${entry.pump} — ${entry.L}L`, ts: nowTs() }, ...a]);
  }, [userName]);

  const sendMessage = useCallback((to: Role, msg: Omit<Message, 'id' | 'from' | 'ts' | 'read'>) => {
    if (!role) return;
    const key = chatKey(role, to);
    const newMsg: Message = { ...msg, id: genId(), from: role, ts: nowTime(), read: false };
    setMessages(m => ({ ...m, [key]: [...(m[key] || []), newMsg] }));
  }, [role]);

  const markRead = useCallback((peer: Role) => {
    if (!role) return;
    const key = chatKey(role, peer);
    setMessages(m => ({
      ...m,
      [key]: (m[key] || []).map(msg => msg.to === role ? { ...msg, read: true } : msg),
    }));
  }, [role]);

  const approveExpense = useCallback((id: number) => {
    setExpenses(e => e.map(x => x.id === id ? { ...x, status: 'approved', approvedBy: userName, approvedDt: nowTs() } : x));
  }, [userName]);

  const rejectExpense = useCallback((id: number) => {
    setExpenses(e => e.map(x => x.id === id ? { ...x, status: 'rejected' } : x));
  }, []);

  const addBudget = useCallback((b: Omit<Budget, 'id' | 'workflow'>) => {
    const newBudget: Budget = {
      ...b, id: genId(),
      workflow: [{ stage: 'Submitted', by: userName, role: b.by, dt: nowTs(), action: 'submit', note: `${b.items.length} items submitted for ${b.label}.` }],
    };
    setBudgets(prev => [...prev, newBudget]);
    setAudit(a => [{ id: genId(), action: 'Budget submitted', user: userName, detail: `${b.label} — ₦${b.total.toLocaleString()}`, ts: nowTs() }, ...a]);
  }, [userName]);

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

  const deleteDepartment = useCallback((id: string) => {
    setDepartments(ds => ds.filter(d => d.id !== id || d.sys));
    setAudit(a => [{ id: genId(), action: 'Department deleted', user: userName, detail: `Department ${id} removed`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addUserAccount = useCallback((acc: Omit<UserAccount, 'id' | 'createdAt' | 'status' | 'username' | 'password' | 'role'>) => {
    setUserAccounts(prev => [...prev, { ...acc, id: genId(), createdAt: nowTs(), status: 'pending', username: '', password: '', role: null }]);
  }, []);

  const addActiveUserAccount = useCallback((acc: { empName: string; username: string; password: string; role: Role; branchId?: string; jobTitle?: string; dept?: string; createdBy: string }) => {
    setUserAccounts(prev => [...prev, {
      id: genId(), createdAt: nowTs(), status: 'active',
      approvedBy: acc.createdBy, approvedAt: nowTs(),
      empName: acc.empName, username: acc.username, password: acc.password,
      role: acc.role, branchId: acc.branchId, jobTitle: acc.jobTitle, dept: acc.dept, createdBy: acc.createdBy,
    }]);
    setAudit(a => [{ id: genId(), action: 'Account created', user: acc.createdBy, detail: `Login created for ${acc.empName} (${acc.username}) as ${acc.role}`, ts: nowTs() }, ...a]);
  }, []);

  const updateUserAccount = useCallback((id: number, updates: { username?: string; password?: string; role?: Role; branchId?: string }, by: string) => {
    setUserAccounts(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    setAudit(a => [{ id: genId(), action: 'Account updated', user: by, detail: `Account #${id} credentials/role updated`, ts: nowTs() }, ...a]);
  }, []);

  const changeOwnPassword = useCallback((currentPassword: string, newPassword: string): boolean => {
    const acc = userAccounts.find(a => a.username === userName && a.password === currentPassword);
    if (!acc) return false;
    setUserAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, password: newPassword } : a));
    setAudit(a => [{ id: genId(), action: 'Password changed', user: userName, detail: `${userName} changed their own password`, ts: nowTs() }, ...a]);
    return true;
  }, [userAccounts, userName]);

  const approveUserAccount = useCallback((id: number, role: Role, username: string, password: string, by: string, branchId?: string) => {
    setUserAccounts(prev => prev.map(a => a.id === id ? { ...a, role, username, password, status: 'active', approvedBy: by, approvedAt: nowTs(), branchId: branchId ?? a.branchId } : a));
    setAudit(a => [{ id: genId(), action: 'Account approved', user: by, detail: `Account for ${username} approved as ${role}`, ts: nowTs() }, ...a]);
  }, []);

  const suspendUserAccount = useCallback((id: number) => {
    setUserAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'suspended' } : a));
  }, []);

  const reactivateUserAccount = useCallback((id: number) => {
    setUserAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'active' } : a));
  }, []);

  const rejectUserAccount = useCallback((id: number) => {
    setUserAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'rejected' } : a));
  }, []);

  const deleteUserAccount = useCallback((id: number) => {
    setUserAccounts(prev => prev.filter(a => a.id !== id));
  }, []);

  const validateCredentials = useCallback((username: string, password: string): UserAccount | null => {
    if (username.toLowerCase() === 'admin' && password === 'Admin@2024') {
      return { id: 0, empName: 'System Admin', username: 'admin', password: 'Admin@2024', role: 'admin', status: 'active', createdBy: 'system', createdAt: '' };
    }
    return userAccounts.find(a => a.username === username && a.password === password && a.status === 'active') ?? null;
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
    setExpenses(e => [...e, { ...exp, id: genId(), dt: nowTs(), status: 'pending' }]);
    setAudit(a => [{ id: genId(), action: 'Expense submitted', user: userName, detail: `${exp.cat} — ₦${exp.amt.toLocaleString()}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addCompanyFile = useCallback((file: Omit<CompanyFile, 'id' | 'dt'>) => {
    setCompanyFiles(f => [...f, { ...file, id: genId(), dt: nowTs() }]);
    setAudit(a => [{ id: genId(), action: 'File uploaded', user: userName, detail: `${file.name} (${file.cat})`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addDeliveryEvidence = useCallback((ev: Omit<DeliveryEvidence, 'id' | 'dt'>) => {
    setDeliveryEvidences(e => [...e, { ...ev, id: genId(), dt: nowTs() }]);
    setAudit(a => [{ id: genId(), action: 'Delivery evidence added', user: userName, detail: `${ev.name} for delivery #${ev.delivId}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const addShiftReport = useCallback((r: Omit<ShiftReport, 'id' | 'dt' | 'status'>) => {
    const status: ShiftReport['status'] = r.variance < 0 ? 'flagged' : 'submitted';
    setShiftReports(s => [...s, { ...r, id: genId(), dt: nowTs(), status }]);
    setAudit(a => [{ id: genId(), action: 'Shift report submitted', user: userName, detail: `${r.byName} — variance: ₦${r.variance.toLocaleString()}`, ts: nowTs() }, ...a]);
  }, [userName]);

  const reviewShift = useCallback((id: number) => {
    setShiftReports(s => s.map(r => r.id === id ? { ...r, status: 'reviewed' } : r));
  }, []);

  const flagShift = useCallback((id: number) => {
    setShiftReports(s => s.map(r => r.id === id ? { ...r, status: 'flagged' } : r));
  }, []);

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

  const getConversation = useCallback((peer: Role): Message[] => {
    if (!role) return [];
    return messages[chatKey(role, peer)] || [];
  }, [role, messages]);

  const unreadCount = useCallback((): number => {
    if (!role) return 0;
    return Object.values(messages).reduce((sum, msgs) => {
      return sum + msgs.filter(m => m.to === role && !m.read).length;
    }, 0);
  }, [role, messages]);

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

  // Base nav from NAVDEF / mgrPerms, then filtered by role access, then by per-user overrides
  const baseNav: NavItem[] = role === 'mgr'
    ? MGR_NAV_ALL.filter(item => {
        const key = MGR_NAV_PERM[item.id];
        return !key || (mgrPerms[branchId ?? ''] ?? DEFAULT_MGR_PERMS)[key];
      })
    : (NAVDEF[role ?? 'att'] ?? []);
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
      role, userName, branchId, staffId, navItems, mgrPerms,
      login, logout, updateMgrPerms, roleAccess, updateRoleAccess, userAccess, updateUserAccess, clearUserAccess,
      prices, priceHistory, tanks, lpgTanks, pumps, dips, deliveries,
      maintenance, sales, staff, branches, docs, expenses, budgets, messages,
      audit, departments, companyFiles, deliveryEvidences, shiftReports,
      updatePrice, addTank, addLpgTank, addPump,
      updateTank, updateLpgTank, updatePump, updateStaff,
      addExpense, addBudget, forwardBudget, approveBudget, rejectBudget,
      addDip, approveDip, rejectDip, addDelivery, addMaintenance, addSales,
      addCompanyFile, addDeliveryEvidence, addShiftReport, reviewShift, flagShift,
      sendMessage, addSystemNotification, markRead, approveExpense, rejectExpense,
      addStaff, toggleStaff, deleteStaff, addBranch, updateBranch, deleteBranch, addAudit, getConversation, unreadCount,
      deleteTank, deleteLpgTank, deletePump,
      addDepartment, deleteDepartment,
      userAccounts, addUserAccount, addActiveUserAccount, updateUserAccount, changeOwnPassword, approveUserAccount, suspendUserAccount, reactivateUserAccount, rejectUserAccount, deleteUserAccount, validateCredentials,
      tasks, kpis, addTask, updateTaskStatus, deleteTask, addKpi, deleteKpi,
      hrEmployees, hrRecommendations, hrHandbooks,
      addHREmployee, updateHRDocStatus, removeHREmployee,
      uploadHRDocFile, addHRUpload, approveHRUpload,
      addHRRecommendation, resolveHRRecommendation,
      addHRHandbook, approveHRHandbook,
      forwardOnboardingForApproval, approveOnboarding, addGeneratedLetter,
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
