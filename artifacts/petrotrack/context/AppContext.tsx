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
const INIT_MGR_PERMS: Record<string, MgrPermissions> = {
  HQ: { ...DEFAULT_MGR_PERMS },
  B1: { ...DEFAULT_MGR_PERMS },
  B2: { ...DEFAULT_MGR_PERMS },
};

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

const INIT_PUMPS: Pump[] = [
  { id: 'P1', name: 'Pump #1 PMS', prod: 'PMS', active: true },
  { id: 'P2', name: 'Pump #2 PMS', prod: 'PMS', active: true },
  { id: 'P3', name: 'Pump #3 AGO', prod: 'AGO', active: true },
  { id: 'P4', name: 'Pump #4 DPK', prod: 'DPK', active: true },
  { id: 'P5', name: 'LPG Pump', prod: 'LPG', active: true },
];
const INIT_TANKS: Tank[] = [
  { id: 'T1', name: 'PMS Tank 1', prod: 'PMS', cap: 25000, dip: 2500, op: 18200, rv: 0, sl: 1600 },
  { id: 'T2', name: 'PMS Tank 2', prod: 'PMS', cap: 25000, dip: 2500, op: 15800, rv: 0, sl: 0 },
  { id: 'T3', name: 'AGO Tank 3', prod: 'AGO', cap: 30000, dip: 3000, op: 12600, rv: 0, sl: 520 },
  { id: 'T4', name: 'DPK Tank 4', prod: 'DPK', cap: 20000, dip: 2000, op: 16200, rv: 0, sl: 120 },
];
const INIT_LPG: LPGTank[] = [
  { id: 'L1', name: 'LPG Tank 1', cap: 5000, op: 3200, rv: 0, sl: 400 },
  { id: 'L2', name: 'LPG Tank 2', cap: 3000, op: 1840, rv: 0, sl: 0 },
];
const INIT_DIPS: DipRecord[] = [
  { id: 1, dt: '2025-06-10T05:50', by: 'Chukwuma Adeyemi', rd: { T1: 1456, T2: 1264, T3: 1260, T4: 1620 }, lpg: { L1: 64, L2: 58 }, obs: 'T3 water sheen noted.', status: 'approved', approvedBy: 'Adaeze Obi', approvedDt: '2025-06-10T08:00' },
  { id: 2, dt: '2025-06-11T06:10', by: 'Ibrahim Sule', rd: { T1: 1380, T2: 1180, T3: 1100 }, lpg: {}, obs: '', status: 'pending' },
];
const INIT_RECS: Delivery[] = [
  { id: 1, dt: '2025-06-09T10:30', sup: 'NNPCL Abuja', prod: 'AGO', wb: 'WB-2025-041', ord: 20000, rec: 19600, st: 'short', notes: '400L short delivery.', costPrice: 980, receivedBy: 'Grace Adeyemi' },
  { id: 2, dt: '2025-06-05T08:00', sup: 'NNPCL Abuja', prod: 'PMS', wb: 'WB-2025-038', ord: 33000, rec: 33000, st: 'ok', notes: '', costPrice: 775, receivedBy: 'Grace Adeyemi' },
  { id: 3, dt: '2025-05-28T11:20', sup: 'Total Energies', prod: 'DPK', wb: 'WB-2025-031', ord: 15000, rec: 15000, st: 'ok', notes: '', costPrice: 640, receivedBy: 'Grace Adeyemi' },
  { id: 4, dt: '2025-06-01T09:00', sup: 'Ardova PLC', prod: 'LPG', wb: 'WB-2025-035', ord: 5000, rec: 5000, st: 'ok', notes: '', costPrice: 1050, receivedBy: 'Grace Adeyemi' },
  { id: 5, dt: '2025-05-20T14:00', sup: 'Total Energies', prod: 'Lube Oil', wb: 'WB-2025-028', ord: 500, rec: 500, st: 'ok', notes: 'Engine oil 5L packs — 100 units', costPrice: 3200, receivedBy: 'Grace Adeyemi' },
];
const INIT_PRICE_HISTORY: PriceChange[] = [
  { id: 1, prod: 'PMS',  oldPrice: 785,  newPrice: 830,  by: 'Adaeze Obi', dt: '2025-06-01T09:00' },
  { id: 2, prod: 'AGO',  oldPrice: 980,  newPrice: 1050, by: 'Adaeze Obi', dt: '2025-06-01T09:00' },
  { id: 3, prod: 'LPG',  oldPrice: 1150, newPrice: 1200, by: 'Adaeze Obi', dt: '2025-05-28T09:00' },
  { id: 4, prod: 'PMS',  oldPrice: 750,  newPrice: 785,  by: 'Adaeze Obi', dt: '2025-05-01T08:00' },
];
const INIT_MAINT: MaintenanceItem[] = [
  { id: 1, title: 'Pump #3 nozzle leak', pri: 'Urgent', by: 'Emeka', date: '2025-06-07', st: 'Open' },
  { id: 2, title: 'Generator oil service', pri: 'Medium', by: 'Bello', date: '2025-06-05', st: 'Open' },
  { id: 3, title: 'Pump #1 calibration', pri: 'Low', by: 'Chukwuma', date: '2025-05-28', st: 'Done', cost: 42000 },
];
const INIT_SALES: SalesEntry[] = [
  { id: 1, pump: 'Pump #1 PMS', by: 'Emeka', L: 880, price: 830, dt: '2025-06-10T07:30' },
  { id: 2, pump: 'Pump #3 AGO', by: 'Bello', L: 520, price: 1050, dt: '2025-06-10T08:15' },
  { id: 3, pump: 'Pump #2 PMS', by: 'Chukwuma', L: 640, price: 830, dt: '2025-06-10T09:00' },
  { id: 4, pump: 'Pump #4 DPK', by: 'Ibrahim', L: 310, price: 700, dt: '2025-06-10T09:45' },
  { id: 5, pump: 'LPG Pump',    by: 'Emeka',    L: 180, price: 1200, dt: '2025-06-10T10:30' },
];
const INIT_STAFF: Staff[] = [
  { id: 1, name: 'Amaka Osei', role: 'CEO', sal: 1200000, st: 'Active', email: 'ceo@petrotrack.ng' },
  { id: 2, name: 'Adaeze Obi', role: 'Managing Director', sal: 650000, st: 'Active', email: 'md@petrotrack.ng' },
  { id: 3, name: 'Funmi Adesanya', role: 'Marketing Manager', sal: 420000, st: 'Active', email: 'mktg@petrotrack.ng' },
  { id: 4, name: 'Ngozi Eze', role: 'Corp. Services Mgr', sal: 380000, st: 'Active', email: 'csm@petrotrack.ng' },
  { id: 5, name: 'Grace Adeyemi', role: 'Accountant', sal: 250000, st: 'Active', email: 'acc@petrotrack.ng' },
  { id: 6, name: 'Chukwuma Adeyemi', role: 'Station Manager', sal: 280000, st: 'Active', email: 'mgr.hq@petrotrack.ng' },
  { id: 9, name: 'Ibrahim Sule', role: 'Station Manager', sal: 280000, st: 'Active', email: 'mgr.maitama@petrotrack.ng' },
  { id: 10, name: 'Chidinma Nwosu', role: 'Station Manager', sal: 280000, st: 'Active', email: 'mgr.lugbe@petrotrack.ng' },
  { id: 7, name: 'Emeka Okafor', role: 'Pump Attendant', sal: 120000, st: 'Active', email: 'emeka@petrotrack.ng' },
  { id: 8, name: 'Bello Abubakar', role: 'Pump Attendant', sal: 120000, st: 'Active', email: 'bello@petrotrack.ng' },
];
const INIT_BRANCHES: Branch[] = [
  { id: 'HQ', name: 'HQ — Abuja CBD', st: 'Active', rev: 18400000, mgr: 'Chukwuma Adeyemi', pumps: 4, tanks: 4 },
  { id: 'B1', name: 'Maitama Branch', st: 'Active', rev: 11200000, mgr: 'Ibrahim Sule', pumps: 3, tanks: 3 },
  { id: 'B2', name: 'Lugbe Branch', st: 'Active', rev: 5200000, mgr: 'Chidinma Nwosu', pumps: 2, tanks: 2 },
];
const INIT_DOCS: ComplianceDoc[] = [
  { id: 1, name: 'NESREA Env. Permit', cat: 'Permit', iss: 'NESREA', exp: '2025-06-05', ref: 'NESREA/EI/0567' },
  { id: 2, name: 'NMDPRA Retail Licence', cat: 'Licence', iss: 'NMDPRA', exp: '2025-06-20', ref: 'NMD/R/ABJ/0234' },
  { id: 3, name: 'Fire Safety Certificate', cat: 'Certificate', iss: 'FSCE Abuja', exp: '2025-08-10', ref: 'FSCE/2024/441' },
  { id: 4, name: 'CAC Registration', cat: 'Registration', iss: 'CAC Nigeria', exp: '2026-03-01', ref: 'RC-0987654' },
];
const INIT_SHIFTS: ShiftReport[] = [
  { id: 1, dt: '2025-06-08T18:04', by: 'att', byName: 'Emeka Okonkwo', entries: 12, totalSales: 498600, totalPOS: 125000, expectedCash: 373600, actualCash: 373600, variance: 0, status: 'reviewed', note: '' },
  { id: 2, dt: '2025-06-09T18:11', by: 'att', byName: 'Emeka Okonkwo', entries: 9, totalSales: 312400, totalPOS: 80000, expectedCash: 232400, actualCash: 230000, variance: -2400, status: 'flagged', note: 'Short by ₦2,400 — one POS terminal disconnected mid-shift, investigating' },
  { id: 3, dt: '2025-06-10T17:55', by: 'att', byName: 'Emeka Okonkwo', entries: 11, totalSales: 421800, totalPOS: 95000, expectedCash: 326800, actualCash: 326800, variance: 0, status: 'submitted', note: '' },
];
const INIT_COMPANY_FILES: CompanyFile[] = [
  { id: 1, name: 'Corporate_Policy_Manual_2025.pdf', cat: 'Policy', by: 'Ngozi Eze', dt: '2025-05-01T09:00', size: '2.4 MB', fileType: 'pdf' },
  { id: 2, name: 'Employee_Handbook_v3.docx', cat: 'HR', by: 'Ngozi Eze', dt: '2025-04-15T14:30', size: '1.1 MB', fileType: 'docx' },
  { id: 3, name: 'Q1_2025_Financial_Report.xlsx', cat: 'Finance', by: 'Grace Adeyemi', dt: '2025-04-05T10:00', size: '0.8 MB', fileType: 'xlsx' },
  { id: 4, name: 'NNPCL_Dealership_Agreement.pdf', cat: 'Legal', by: 'Ngozi Eze', dt: '2025-03-20T11:00', size: '3.2 MB', fileType: 'pdf' },
  { id: 5, name: 'HSE_Safety_Procedures.pdf', cat: 'Compliance', by: 'Ngozi Eze', dt: '2025-03-10T09:30', size: '1.8 MB', fileType: 'pdf' },
];
const INIT_DELIVERY_EVIDENCE: DeliveryEvidence[] = [
  { id: 1, delivId: 1, type: 'photo', name: 'WB-2025-041_seal_intact.jpg', dt: '2025-06-09T10:35', by: 'Chukwuma Adeyemi' },
  { id: 2, delivId: 1, type: 'photo', name: 'WB-2025-041_offload_start.jpg', dt: '2025-06-09T10:42', by: 'Chukwuma Adeyemi' },
  { id: 3, delivId: 1, type: 'video', name: 'WB-2025-041_discharge_video.mp4', dt: '2025-06-09T11:00', by: 'Chukwuma Adeyemi' },
];
const INIT_EXPENSES: Expense[] = [
  { id: 1, dt: '2025-06-10T07:15', cat: 'Generator fuel', desc: 'AGO for gen set — 50L offload', amt: 52500, by: 'mgr', byName: 'Chukwuma Adeyemi', status: 'approved', approvedBy: 'Grace Adeyemi', approvedDt: '2025-06-10T09:00', budgetId: 1 },
  { id: 2, dt: '2025-06-10T09:00', cat: 'Security & guarding', desc: 'Daily security allowance — 3 guards', amt: 9000, by: 'mgr', byName: 'Chukwuma Adeyemi', status: 'approved', approvedBy: 'Grace Adeyemi', approvedDt: '2025-06-10T09:30', budgetId: 1 },
  { id: 3, dt: '2025-06-10T11:30', cat: 'Office supplies', desc: 'Printer paper, receipt books, pens', amt: 14500, by: 'mgr', byName: 'Chukwuma Adeyemi', status: 'pending', budgetId: 1 },
  { id: 4, dt: '2025-06-10T14:00', cat: 'Staff welfare', desc: 'Staff lunch — 8 persons', amt: 16000, by: 'mgr', byName: 'Chukwuma Adeyemi', status: 'pending', budgetId: 1 },
];
const INIT_BUDGETS: Budget[] = [
  {
    id: 1, month: 6, year: 2025, label: 'June 2025', by: 'mgr', byName: 'Chukwuma Adeyemi',
    items: [{ cat: 'Generator fuel', amt: 150000 }, { cat: 'Security & guarding', amt: 189000 }, { cat: 'Utilities', amt: 120000 }, { cat: 'Staff welfare', amt: 48000 }, { cat: 'Maintenance & repairs', amt: 85000 }, { cat: 'Office supplies', amt: 20000 }, { cat: 'Transport', amt: 15000 }, { cat: 'Miscellaneous', amt: 10000 }],
    total: 637000, status: 'fully_approved',
    workflow: [
      { stage: 'Submitted', by: 'Chukwuma Adeyemi', role: 'mgr', dt: '2025-05-28T09:00', action: 'submit', note: 'June 2025 monthly operating budget request.' },
      { stage: 'Accountant reviewed', by: 'Grace Adeyemi', role: 'acc', dt: '2025-05-30T14:00', action: 'forward', note: 'Reviewed — no corrections needed. Forwarded to MD and CEO.' },
      { stage: 'MD approved', by: 'Adaeze Obi', role: 'md', dt: '2025-05-31T10:00', action: 'approve', note: 'Approved. Ensure all expenses are properly documented.' },
      { stage: 'CEO final approval', by: 'Amaka Osei', role: 'ceo', dt: '2025-05-31T15:30', action: 'approve', note: 'Final approval granted. Station Manager may proceed.' },
    ],
  },
  {
    id: 2, month: 7, year: 2025, label: 'July 2025', by: 'mgr', byName: 'Chukwuma Adeyemi',
    items: [{ cat: 'Generator fuel', amt: 165000 }, { cat: 'Security & guarding', amt: 189000 }, { cat: 'Utilities', amt: 130000 }, { cat: 'Staff welfare', amt: 52000 }, { cat: 'Maintenance & repairs', amt: 90000 }, { cat: 'Office supplies', amt: 22000 }, { cat: 'Transport', amt: 18000 }, { cat: 'Miscellaneous', amt: 12000 }],
    total: 678000, status: 'acc_forwarded',
    workflow: [
      { stage: 'Submitted', by: 'Chukwuma Adeyemi', role: 'mgr', dt: '2025-06-08T09:00', action: 'submit', note: 'July 2025 budget — generator fuel increased due to NNPCL price hike.' },
      { stage: 'Accountant reviewed', by: 'Grace Adeyemi', role: 'acc', dt: '2025-06-09T14:00', action: 'forward', note: 'Reviewed. Miscellaneous corrected from ₦12,000 to ₦8,000. Forwarded to MD and CEO.' },
    ],
  },
  {
    id: 3, month: 8, year: 2025, label: 'August 2025', by: 'mgr', byName: 'Chukwuma Adeyemi',
    items: [{ cat: 'Generator fuel', amt: 170000 }, { cat: 'Security & guarding', amt: 200000 }, { cat: 'Utilities', amt: 135000 }, { cat: 'Staff welfare', amt: 55000 }, { cat: 'Maintenance & repairs', amt: 95000 }, { cat: 'Office supplies', amt: 25000 }, { cat: 'Transport', amt: 20000 }, { cat: 'Miscellaneous', amt: 15000 }],
    total: 715000, status: 'submitted',
    workflow: [
      { stage: 'Submitted', by: 'Chukwuma Adeyemi', role: 'mgr', dt: '2025-06-10T11:00', action: 'submit', note: 'August 2025 budget. Security increased — new contract with Omega Guard Services.' },
    ],
  },
];
const INIT_TASKS: Task[] = [
  { id: 1, title: 'Q3 Sales Target Review', desc: 'Compile and review Q3 sales performance across all branches and present findings.', assignedBy: 'ceo', assignedByName: 'Amaka Osei', assignedTo: 'md', assignedToName: 'Adaeze Obi', status: 'progressing', priority: 'High', cadence: 'quarterly', target: '35,000,000', targetUnit: '₦ revenue', dueDate: '2025-07-15', createdAt: '2025-06-01T09:00' },
  { id: 2, title: 'Station Safety Inspection', desc: 'Conduct full HSE safety inspection of HQ station and file NESREA compliance report.', assignedBy: 'md', assignedByName: 'Adaeze Obi', assignedTo: 'mgr', assignedToName: 'Chukwuma Adeyemi', status: 'commenced', priority: 'High', cadence: 'monthly', target: '100', targetUnit: '% completion', dueDate: '2025-06-20', createdAt: '2025-06-10T07:00' },
  { id: 3, title: 'June Payroll Processing', desc: 'Process June payroll for all staff members by month end. Confirm figures with HR.', assignedBy: 'md', assignedByName: 'Adaeze Obi', assignedTo: 'acc', assignedToName: 'Grace Adeyemi', status: 'commenced', priority: 'Medium', cadence: 'monthly', dueDate: '2025-06-30', createdAt: '2025-06-10T08:00' },
  { id: 4, title: 'Pump #3 Nozzle Repair Follow-up', desc: 'Monitor repair progress with contractor, confirm fix and get sign-off sheet.', assignedBy: 'mgr', assignedByName: 'Chukwuma Adeyemi', assignedTo: 'att', assignedToName: 'Emeka Okafor', status: 'commenced', priority: 'High', cadence: 'daily', dueDate: '2025-06-12', createdAt: '2025-06-10T10:00' },
  { id: 5, title: 'NMDPRA Licence Renewal', desc: 'Initiate renewal on ELPS portal. Deadline in 10 days — escalate if portal unresponsive.', assignedBy: 'md', assignedByName: 'Adaeze Obi', assignedTo: 'csm', assignedToName: 'Ngozi Eze', status: 'progressing', priority: 'High', cadence: 'monthly', target: '1', targetUnit: 'renewal filed', dueDate: '2025-06-20', createdAt: '2025-06-10T13:00' },
  { id: 6, title: 'Marketing Campaign Report', desc: 'Prepare June digital campaign ROI report for MD review.', assignedBy: 'md', assignedByName: 'Adaeze Obi', assignedTo: 'mktg', assignedToName: 'Funmi Adesanya', status: 'commenced', priority: 'Medium', cadence: 'monthly', target: '150', targetUnit: '% ROI', dueDate: '2025-06-25', createdAt: '2025-06-10T09:00' },
  { id: 7, title: 'Daily Opening Dip Reading', desc: 'Record and submit tank dip readings before 6:30 AM every morning.', assignedBy: 'mgr', assignedByName: 'Chukwuma Adeyemi', assignedTo: 'att', assignedToName: 'Emeka Okafor', status: 'progressing', priority: 'High', cadence: 'daily', target: '6', targetUnit: 'tanks dipped', dueDate: '2025-06-11', createdAt: '2025-06-10T05:00' },
  { id: 8, title: 'Weekly Sales Summary', desc: 'Compile weekly sales figures for all pumps and send summary to MD every Friday.', assignedBy: 'md', assignedByName: 'Adaeze Obi', assignedTo: 'mgr', assignedToName: 'Chukwuma Adeyemi', status: 'commenced', priority: 'Medium', cadence: 'weekly', target: '3,500,000', targetUnit: '₦ weekly sales', dueDate: '2025-06-14', createdAt: '2025-06-10T08:00' },
];
const INIT_KPIS: KPI[] = [
  { id: 1, title: 'Monthly Revenue Target', target: '15,000,000', unit: '₦', period: 'Monthly', assignedTo: 'mgr', assignedToName: 'All Station Managers', createdAt: '2025-06-01T09:00' },
  { id: 2, title: 'Expense Approval Turnaround', target: '24', unit: 'hours', period: 'Per request', assignedTo: 'acc', assignedToName: 'Grace Adeyemi', createdAt: '2025-06-01T09:00' },
  { id: 3, title: 'Zero Safety Incidents', target: '0', unit: 'incidents', period: 'Monthly', assignedTo: 'mgr', assignedToName: 'All Station Managers', createdAt: '2025-06-01T09:00' },
  { id: 4, title: 'NMDPRA Licence Compliance', target: '100', unit: '%', period: 'Annual', assignedTo: 'csm', assignedToName: 'Ngozi Eze', createdAt: '2025-06-01T09:00' },
];

const INIT_AUDIT: AuditEntry[] = [
  { id: 1, action: 'User login', user: 'Adaeze Obi (MD)', detail: 'Successful — Abuja', ts: '2025-06-10T06:02' },
  { id: 2, action: 'Price update', user: 'Adaeze Obi (MD)', detail: 'PMS set to ₦830/L — synced all forms', ts: '2025-06-10T06:30' },
  { id: 3, action: 'Dip submitted', user: 'Chukwuma Adeyemi (Mgr)', detail: 'All 6 tanks dipped. T3 anomaly flagged.', ts: '2025-06-10T05:52' },
  { id: 4, action: 'Short delivery', user: 'Chukwuma Adeyemi (Mgr)', detail: 'AGO WB-2025-041 — 400L dispute raised', ts: '2025-06-10T09:47' },
  { id: 5, action: 'Sales entry', user: 'Emeka Okafor (Att)', detail: 'Pump #1 PMS — 880L', ts: '2025-06-10T07:30' },
  { id: 6, action: 'Message sent', user: 'Ngozi Eze (CSM)', detail: 'Compliance alert to CEO — NMDPRA licence', ts: '2025-06-10T13:02' },
  { id: 7, action: 'Maintenance request', user: 'Emeka Okafor (Att)', detail: 'Pump #3 nozzle leak — Urgent', ts: '2025-06-07T10:30' },
];
const INIT_DEPTS: Department[] = [
  { id: 'd1', name: 'Operations', icon: 'construct', col: { bg: '#EAF3DE', fg: '#27500A' }, roles: ['md', 'mgr'], sys: true },
  { id: 'd2', name: 'Tank Dipping', icon: 'water', col: { bg: '#E6F1FB', fg: '#0C447C' }, roles: ['ceo', 'md', 'csm', 'acc', 'mgr'], sys: true },
  { id: 'd3', name: 'Accounting', icon: 'calculator', col: { bg: '#EEEDFE', fg: '#3C3489' }, roles: ['ceo', 'md', 'csm', 'acc'], sys: true },
  { id: 'd4', name: 'Corporate Services', icon: 'briefcase', col: { bg: '#E1F5EE', fg: '#085041' }, roles: ['ceo', 'csm'], sys: true },
  { id: 'd5', name: 'Marketing & Market Intel', icon: 'megaphone', col: { bg: '#FAECE7', fg: '#712B13' }, roles: ['ceo', 'md'], sys: true },
  { id: 'd6', name: 'Branches', icon: 'business', col: { bg: '#EAF3DE', fg: '#27500A' }, roles: ['ceo', 'md', 'csm', 'acc', 'mgr'], sys: true },
  { id: 'd7', name: 'Maintenance', icon: 'build', col: { bg: '#FAEEDA', fg: '#633806' }, roles: ['ceo', 'md', 'csm', 'acc', 'mgr', 'att'], sys: true },
  { id: 'd8', name: 'Sales', icon: 'bar-chart', col: { bg: '#E6F1FB', fg: '#0C447C' }, roles: ['ceo', 'md', 'csm', 'acc', 'mgr', 'att'], sys: true },
];
const INIT_MSGS: Record<string, Message[]> = {
  'acc-mgr': [
    { id: 1, from: 'mgr', to: 'acc', type: 'txt', body: 'Please approve June gen fuel expense — ₦52,500.', ts: '08:15', read: true },
    { id: 2, from: 'acc', to: 'mgr', type: 'txt', body: 'Reviewed. Approved — within budget. Receipt logged.', ts: '09:02', read: true },
  ],
  'ceo-md': [
    { id: 3, from: 'md', to: 'ceo', type: 'req', body: 'Product purchase request', req: { product: 'AGO', qty: 20000, sup: 'NNPCL Abuja', reason: 'Tank 3 at 42% — reorder level reached.' }, ts: '07:50', read: true },
    { id: 4, from: 'ceo', to: 'md', type: 'txt', body: '✅ Request approved. Please proceed with proper documentation.', ts: '08:30', read: true },
  ],
  'ceo-csm': [
    { id: 5, from: 'csm', to: 'ceo', type: 'alert', body: 'Operations alert', alrt: { title: 'NMDPRA licence expiry', pri: 'Urgent', detail: 'NMDPRA Retail Licence expires in 10 days. Renewal on ELPS portal required.' }, ts: '13:02', read: false },
  ],
  'att-mgr': [
    { id: 6, from: 'att', to: 'mgr', type: 'txt', body: 'Pump #3 nozzle still leaking. Getting worse.', ts: '06:50', read: true },
    { id: 7, from: 'mgr', to: 'att', type: 'txt', body: 'Noted. Maintenance request submitted. Do not use that pump.', ts: '07:05', read: true },
  ],
};

const INIT_USER_ACCOUNTS: UserAccount[] = [
  { id: 1,  empId: 'PTNG-0006', empName: 'Adaeze Obi',      username: 'adaeze.obi',    password: 'MD@2024',   role: 'md',    status: 'active', createdBy: 'System Admin', createdAt: '2020-06-01T00:00:00Z', approvedBy: 'System Admin', approvedAt: '2020-06-01T00:00:00Z', jobTitle: 'Managing Director',      dept: 'Management'     },
  { id: 2,                       empName: 'Amaka Osei',       username: 'amaka.osei',    password: 'Ceo@2024',  role: 'ceo',   status: 'active', createdBy: 'System Admin', createdAt: '2020-01-01T00:00:00Z', approvedBy: 'System Admin', approvedAt: '2020-01-01T00:00:00Z', jobTitle: 'Chief Executive Officer', dept: 'Executive'      },
  { id: 3,  empId: 'PTNG-0004', empName: 'Funmi Adesanya',   username: 'funmi.adesanya',password: 'Mktg@2024', role: 'mktg',  status: 'active', createdBy: 'System Admin', createdAt: '2023-02-20T00:00:00Z', approvedBy: 'System Admin', approvedAt: '2023-02-20T00:00:00Z', jobTitle: 'Marketing Manager',      dept: 'Marketing'     },
  { id: 4,  empId: 'PTNG-0005', empName: 'Ngozi Eze',        username: 'ngozi.eze',     password: 'Csm@2024',  role: 'csm',   status: 'active', createdBy: 'System Admin', createdAt: '2021-01-10T00:00:00Z', approvedBy: 'System Admin', approvedAt: '2021-01-10T00:00:00Z', jobTitle: 'Corp. Services Mgr',     dept: 'Administration' },
  { id: 5,  empId: 'PTNG-0003', empName: 'Grace Adeyemi',    username: 'grace.adeyemi', password: 'Acc@2024',  role: 'acc',   status: 'active', createdBy: 'System Admin', createdAt: '2022-09-05T00:00:00Z', approvedBy: 'System Admin', approvedAt: '2022-09-05T00:00:00Z', jobTitle: 'Accountant',             dept: 'Finance'       },
  { id: 6,  empId: 'PTNG-0002', empName: 'Chukwuma Adeyemi', username: 'chukwuma.a',    password: 'Mgr@2024',  role: 'mgr',   branchId: 'HQ', status: 'active', createdBy: 'System Admin', createdAt: '2021-07-01T00:00:00Z', approvedBy: 'System Admin', approvedAt: '2021-07-01T00:00:00Z', jobTitle: 'Station Manager', dept: 'Operations' },
  { id: 7,                       empName: 'Ibrahim Sule',     username: 'ibrahim.sule',  password: 'Mgr@2024',  role: 'mgr',   branchId: 'B1', status: 'active', createdBy: 'System Admin', createdAt: '2021-07-01T00:00:00Z', approvedBy: 'System Admin', approvedAt: '2021-07-01T00:00:00Z', jobTitle: 'Station Manager', dept: 'Operations' },
  { id: 8,                       empName: 'Chidinma Nwosu',   username: 'chidinma.n',    password: 'Mgr@2024',  role: 'mgr',   branchId: 'B2', status: 'active', createdBy: 'System Admin', createdAt: '2021-07-01T00:00:00Z', approvedBy: 'System Admin', approvedAt: '2021-07-01T00:00:00Z', jobTitle: 'Station Manager', dept: 'Operations' },
  { id: 9,  empId: 'PTNG-0001', empName: 'Emeka Okafor',     username: 'emeka.okafor',  password: 'Att@2024',  role: 'att',   status: 'active', createdBy: 'System Admin', createdAt: '2022-03-15T00:00:00Z', approvedBy: 'System Admin', approvedAt: '2022-03-15T00:00:00Z', jobTitle: 'Pump Attendant',         dept: 'Operations'    },
];

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
const INIT_HR_EMPLOYEES: HREmployee[] = [
  { id: 10001, empId: 'PTNG-0001', serial: 1, name: 'Emeka Okafor',     role: 'Pump Attendant',     dept: 'Operations',     phone: '+234 803 100 0001', email: 'emeka.okafor@petrotrack.ng',     address: '14 Zaria Rd, Kano',       dob: '1995-06-12', joinDate: '2022-03-15', nextOfKin: 'Chioma Okafor',   status: 'active',    docs: mkDocs(FULLY_APPROVED, '2022-03-15'), uploads: [], onboarding: CEO_ONBOARDED, letters: [] },
  { id: 10002, empId: 'PTNG-0002', serial: 2, name: 'Chukwuma Adeyemi', role: 'Station Manager',    dept: 'Operations',     phone: '+234 803 100 0002', email: 'c.adeyemi@petrotrack.ng',        address: '7 Broad St, Ibadan',      dob: '1988-11-04', joinDate: '2021-07-01', nextOfKin: 'Bola Adeyemi',    status: 'active',    docs: mkDocs(FULLY_APPROVED, '2021-07-01'), uploads: [], onboarding: CEO_ONBOARDED, letters: [] },
  { id: 10003, empId: 'PTNG-0003', serial: 3, name: 'Grace Adeyemi',    role: 'Accountant',         dept: 'Finance',        phone: '+234 803 100 0003', email: 'grace.adeyemi@petrotrack.ng',    address: '33 Marina Ave, Lagos',    dob: '1992-03-21', joinDate: '2022-09-05', nextOfKin: 'Tunde Adeyemi',   status: 'active',    docs: mkDocs(FULLY_APPROVED, '2022-09-05'), uploads: [], onboarding: CEO_ONBOARDED, letters: [] },
  { id: 10004, empId: 'PTNG-0004', serial: 4, name: 'Funmi Adesanya',   role: 'Marketing Manager',  dept: 'Marketing',      phone: '+234 803 100 0004', email: 'funmi.adesanya@petrotrack.ng',   address: '2 Adeola Odeku, VI',      dob: '1990-07-15', joinDate: '2023-02-20', nextOfKin: 'Seun Adesanya',   status: 'active',    docs: mkDocs(FULLY_APPROVED, '2023-02-20'), uploads: [], onboarding: CEO_ONBOARDED, letters: [] },
  { id: 10005, empId: 'PTNG-0005', serial: 5, name: 'Ngozi Eze',        role: 'Corp. Services Mgr', dept: 'Administration', phone: '+234 803 100 0005', email: 'ngozi.eze@petrotrack.ng',        address: '9 Asokoro, Abuja',        dob: '1985-01-30', joinDate: '2021-01-10', nextOfKin: 'Chidi Eze',       status: 'active',    docs: mkDocs(FULLY_APPROVED, '2021-01-10'), uploads: [], onboarding: CEO_ONBOARDED, letters: [] },
  { id: 10006, empId: 'PTNG-0006', serial: 6, name: 'Adaeze Obi',       role: 'Managing Director',  dept: 'Management',     phone: '+234 803 100 0006', email: 'adaeze.obi@petrotrack.ng',       address: '5 Maitama Close, Abuja',  dob: '1982-09-08', joinDate: '2020-06-01', nextOfKin: 'Emeka Obi',       status: 'active',    docs: mkDocs(FULLY_APPROVED, '2020-06-01'), uploads: [], onboarding: CEO_ONBOARDED, letters: [] },
];
const INIT_HR_RECOMMENDATIONS: HRRecommendation[] = [];
const INIT_HR_HANDBOOKS: HREmployeeDoc[] = [
  { id: 1, name: 'Employee Handbook 2024.pdf', fileType: 'pdf', cat: 'Handbook', uploadedBy: 'Ngozi Eze', dt: '2024-01-15T09:00:00Z', approved: true, approvedBy: 'System Admin', approvedAt: '2024-01-16T10:00:00Z' },
  { id: 2, name: 'Code of Conduct.pdf',        fileType: 'pdf', cat: 'Policy',   uploadedBy: 'Ngozi Eze', dt: '2024-02-01T08:30:00Z', approved: true, approvedBy: 'System Admin', approvedAt: '2024-02-02T09:00:00Z' },
];

interface AppContextType {
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
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [userName, setUserName] = useState('');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [mgrPerms, setMgrPerms] = useState<Record<string, MgrPermissions>>(INIT_MGR_PERMS);
  const [prices, setPrices] = useState<Prices>({ PMS: 830, AGO: 1050, DPK: 700, LPG: 1200, 'Lube Oil': 4500 });
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

  const navItems: NavItem[] = role === 'mgr'
    ? MGR_NAV_ALL.filter(item => {
        const key = MGR_NAV_PERM[item.id];
        return !key || (mgrPerms[branchId ?? ''] ?? DEFAULT_MGR_PERMS)[key];
      })
    : (NAVDEF[role ?? 'att'] ?? []);

  return (
    <AppContext.Provider value={{
      role, userName, branchId, staffId, navItems, mgrPerms,
      login, logout, updateMgrPerms,
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
      userAccounts, addUserAccount, approveUserAccount, suspendUserAccount, reactivateUserAccount, rejectUserAccount, deleteUserAccount, validateCredentials,
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
