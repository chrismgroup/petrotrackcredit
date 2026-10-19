import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

function getBase(): string {
  const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (configuredApiUrl) {
    const normalizedUrl = configuredApiUrl.startsWith('http')
      ? configuredApiUrl
      : `https://${configuredApiUrl}`;
    return normalizedUrl.replace(/\/$/, '') + '/api';
  }

  if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
    return `${window.location.origin}/api`;
  }

  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) return '';
  return `https://${domain.replace(/\/$/, '')}/api`;
}

const BASE = getBase();
const TOKEN_KEY = 'pt_auth_token';

export const SHIFT_REPORT_OUTBOX_STORAGE_KEY = 'pt_shift_report_outbox_v1';
async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function get<T>(path: string): Promise<T | null> {
  if (!BASE) return null;
  try {
    const headers = await authHeaders();
    const r = await fetch(`${BASE}${path}`, {
      headers: { Accept: 'application/json', ...headers },
    });
    if (!r.ok) return null;
    return r.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function put<T = unknown>(path: string, data: unknown): Promise<T | null> {
  if (!BASE) return null;
  try {
    const headers = await authHeaders();
    const r = await fetch(`${BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
    if (!r.ok) return null;
    return await r.json() as T;
  } catch {
    return null;
  }
}

export type CheckedApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

/** PUT variant for shared slices that must surface persistence failures. */
async function putChecked<T = unknown>(path: string, data: unknown): Promise<CheckedApiResult<T>> {
  if (!BASE) return { ok: false, error: 'The API is not configured.' };
  try {
    const headers = await authHeaders();
    const response = await fetch(`${BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = body && typeof body === 'object' && 'error' in body
        ? String((body as { error?: unknown }).error ?? '')
        : '';
      return {
        ok: false,
        error: error || `The server rejected this submission (${response.status}).`,
        status: response.status,
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return {
      ok: false,
      error: 'The submission could not reach the server. Check the connection and try again.',
    };
  }
}

async function post<T>(path: string, data: unknown): Promise<T | null> {
  if (!BASE) return null;
  try {
    const headers = await authHeaders();
    const r = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
    if (!r.ok) return null;
    return r.json() as Promise<T>;
  } catch {
    return null;
  }
}

export type JsonCommandMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export type WorkflowCommandResult<T> = (T & { error?: string; status?: number }) | null;

/** Executes an authenticated JSON workflow command and returns its canonical response. */
export async function authenticatedJsonCommand<T>(
  method: JsonCommandMethod,
  path: string,
  data: unknown,
): Promise<WorkflowCommandResult<T>> {
  if (!BASE) return null;
  try {
    const headers = await authHeaders();
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'error' in body
        ? String((body as { error?: unknown }).error ?? '')
        : '';
      return {
        ...(body && typeof body === 'object' ? body : {}),
        error: message || `Request failed (${response.status})`,
        status: response.status,
      } as WorkflowCommandResult<T>;
    }
    return body as WorkflowCommandResult<T>;
  } catch {
    return null;
  }
}

async function putR<T>(path: string, data: unknown): Promise<T | null> {
  if (!BASE) return null;
  try {
    const headers = await authHeaders();
    const r = await fetch(`${BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
    if (!r.ok) return null;
    return r.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function patchR<T>(path: string, data: unknown): Promise<T | null> {
  if (!BASE) return null;
  try {
    const headers = await authHeaders();
    const r = await fetch(`${BASE}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
    if (!r.ok) return null;
    return r.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function del(path: string): Promise<boolean> {
  if (!BASE) return false;
  try {
    const headers = await authHeaders();
    const r = await fetch(`${BASE}${path}`, { method: 'DELETE', headers });
    return r.ok;
  } catch {
    return false;
  }
}

export interface LoginResult {
  token: string;
  staffId: number;
  role: string;
  empName: string;
  branchId: string | null;
}

export type LoginError = 'network' | 'credentials' | 'server';

export async function apiLogin(username: string, password: string): Promise<LoginResult | LoginError> {
  if (!BASE) return 'network';
  try {
    const r = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (r.status === 401) return 'credentials';
    if (!r.ok) return 'server';
    const result = await r.json() as LoginResult;
    await saveToken(result.token);
    return result;
  } catch {
    return 'network';
  }
}

export interface LiveIdentity { username: string; empName: string | null; role: string; branchId: string | null }

export const authApi = {
  /** The caller's current role and branch as stored in the database. */
  me: () => get<LiveIdentity>('/auth/me'),
  /** Changes the password for the account identified by the current JWT. */
  changeOwnPassword: (currentPassword: string, newPassword: string) =>
    post<{ ok: true }>('/auth/change-password', { currentPassword, newPassword }),
};

export const stateApi = {
  getAll: () => get<Record<string, unknown>>('/state'),
  get: <T>(key: string) => get<T>(`/state/${key}`),
  put: <T = unknown>(key: string, data: unknown) => put<T>(`/state/${key}`, data),
  putDeliveries: <T = unknown>(data: unknown) => put<T>('/state/deliveries', data),
  putExpenses: <T = unknown>(data: unknown) => put<T>('/state/expenses', data),
  putChecked: <T = unknown>(key: string, data: unknown) => putChecked<T>(`/state/${key}`, data),
  upsertCompanyAsset: <T>(asset: T, baseRevision: number | null) =>
    post<{ ok: boolean; asset: T; assets: T[] }>('/state/company-assets/upsert', { asset, baseRevision }),
  deleteCompanyAsset: (id: string) =>
    post<{ ok: boolean; assets: unknown[] }>(`/state/company-assets/${encodeURIComponent(id)}/delete`, {}),
  submitPumpReport: <T>(report: T, idempotencyKey?: string) =>
    post<{ ok: boolean; report: T }>('/pump-reports', {
      report,
      idempotencyKey: idempotencyKey ?? String((report as { id?: unknown })?.id ?? ''),
    }),
  resetOperational: () => post<{ ok: boolean; seedMeters?: Record<string, number> }>('/state/reset-operational', {}),
  deletePumpReport: (id: number) => post<{ ok: boolean }>(`/state/pump-reports/${id}/delete`, {}),
};

export interface WorkflowCommand {
  expectedRevision: number;
  idempotencyKey: string;
}
export type WorkflowRecordResponse<T> = { record: T; deleted?: boolean; replay?: boolean };
export type DeliveryWorkflowResponse<T> = { delivery: T; replayed?: boolean };
export type DipWorkflowResponse<T> = { dip: T; inventoryLog?: unknown[]; replayed?: boolean; supersededDipIds?: number[] };
export type PriceProposalWorkflowResponse<T> = {
  proposal: T; prices?: unknown; priceHistory?: unknown; replayed?: boolean;
};
export type PriceWorkflowResponse = {
  prices: unknown; priceHistory: unknown; replayed?: boolean;
};

const workflowPath = (id: string | number) => encodeURIComponent(String(id));
export const workflowApi = {
  deliveries: {
    create: <T>(delivery: T, command: WorkflowCommand) =>
      authenticatedJsonCommand<DeliveryWorkflowResponse<T>>('POST', '/deliveries', { delivery, ...command }),
    update: <T>(id: number, delivery: Partial<T>, command: WorkflowCommand) =>
      authenticatedJsonCommand<DeliveryWorkflowResponse<T>>('PUT', `/deliveries/${workflowPath(id)}`, { delivery, ...command }),
    remove: <T>(id: number, command: WorkflowCommand) =>
      authenticatedJsonCommand<DeliveryWorkflowResponse<T>>('DELETE', `/deliveries/${workflowPath(id)}`, command),
    submit: <T>(id: number, command: WorkflowCommand) =>
      authenticatedJsonCommand<DeliveryWorkflowResponse<T>>('POST', `/deliveries/${workflowPath(id)}/submit`, command),
    forward: <T>(id: number, costPrice: number, note: string, command: WorkflowCommand) =>
      authenticatedJsonCommand<DeliveryWorkflowResponse<T>>('POST', `/deliveries/${workflowPath(id)}/forward`, { costPrice, note, ...command }),
    recall: <T>(id: number, command: WorkflowCommand) =>
      authenticatedJsonCommand<DeliveryWorkflowResponse<T>>('POST', `/deliveries/${workflowPath(id)}/recall`, command),
    approve: <T>(id: number, sellingPrice: number, note: string, command: WorkflowCommand) =>
      authenticatedJsonCommand<DeliveryWorkflowResponse<T>>('POST', `/deliveries/${workflowPath(id)}/approve`, { sellingPrice, note, ...command }),
    reject: <T>(id: number, note: string, command: WorkflowCommand) =>
      authenticatedJsonCommand<DeliveryWorkflowResponse<T>>('POST', `/deliveries/${workflowPath(id)}/reject`, { note, ...command }),
  },
  expenses: {
    create: <T>(expense: T, command: WorkflowCommand) => authenticatedJsonCommand<WorkflowRecordResponse<T>>('POST', '/finance/expenses', { expense, ...command }),
    update: <T>(id: number, expense: Partial<T>, command: WorkflowCommand) => authenticatedJsonCommand<WorkflowRecordResponse<T>>('PATCH', `/finance/expenses/${workflowPath(id)}`, { expense, ...command }),
    remove: <T>(id: number, command: WorkflowCommand) => authenticatedJsonCommand<WorkflowRecordResponse<T>>('DELETE', `/finance/expenses/${workflowPath(id)}`, command),
    transition: <T>(id: number, action: 'forward' | 'approve' | 'reject', command: WorkflowCommand) => authenticatedJsonCommand<WorkflowRecordResponse<T>>('POST', `/finance/expenses/${workflowPath(id)}/${action}`, command),
    repairBranches: () => authenticatedJsonCommand<{ repaired: number; unresolvedIds: Array<string | number>; total: number }>('POST', '/finance/expenses/repair-branches', {}),
  },
  budgets: {
    create: <T>(budget: T, command: WorkflowCommand) => authenticatedJsonCommand<WorkflowRecordResponse<T>>('POST', '/finance/budgets', { budget, ...command }),
    update: <T>(id: number, budget: Partial<T>, command: WorkflowCommand) => authenticatedJsonCommand<WorkflowRecordResponse<T>>('PATCH', `/finance/budgets/${workflowPath(id)}`, { budget, ...command }),
    updateAndSubmit: <T>(id: number, budget: Partial<T>, command: WorkflowCommand) => authenticatedJsonCommand<WorkflowRecordResponse<T>>('POST', `/finance/budgets/${workflowPath(id)}/update-submit`, { budget, ...command }),
    remove: <T>(id: number, command: WorkflowCommand) => authenticatedJsonCommand<WorkflowRecordResponse<T>>('DELETE', `/finance/budgets/${workflowPath(id)}`, command),
    archive: <T>(id: number, command: WorkflowCommand) => authenticatedJsonCommand<WorkflowRecordResponse<T>>('POST', `/finance/budgets/${workflowPath(id)}/archive`, command),
    classifyBranch: <T>(id: number, branchId: string, command: WorkflowCommand) => authenticatedJsonCommand<WorkflowRecordResponse<T>>('POST', `/finance/budgets/${workflowPath(id)}/classify-branch`, { branchId, ...command }),
    transition: <T>(id: number, action: 'submit' | 'forward' | 'approve' | 'reject', note: string, command: WorkflowCommand) => authenticatedJsonCommand<WorkflowRecordResponse<T>>('POST', `/finance/budgets/${workflowPath(id)}/${action}`, { note, ...command }),
    consolidateMonth: <T>(year: number, month: number, headOfficeBranchId: string, command: WorkflowCommand) =>
      authenticatedJsonCommand<T>('POST', '/finance/budgets/consolidate-month', { year, month, headOfficeBranchId, ...command }),
  },
  dips: {
    create: <T>(dip: T, command: WorkflowCommand) => authenticatedJsonCommand<DipWorkflowResponse<T>>('POST', '/workflows/dips', { dip, ...command }),
    update: <T>(id: number, dip: Partial<T>, command: WorkflowCommand) => authenticatedJsonCommand<DipWorkflowResponse<T>>('PATCH', `/workflows/dips/${workflowPath(id)}`, { dip, ...command }),
    remove: <T>(id: number, command: WorkflowCommand) => authenticatedJsonCommand<DipWorkflowResponse<T>>('DELETE', `/workflows/dips/${workflowPath(id)}`, command),
    decide: <T>(id: number, decision: 'approve' | 'reject', command: WorkflowCommand) => authenticatedJsonCommand<DipWorkflowResponse<T>>('POST', `/workflows/dips/${workflowPath(id)}/${decision}`, command),
  },
  priceProposals: {
    create: <T>(proposal: T, command: WorkflowCommand) => authenticatedJsonCommand<PriceProposalWorkflowResponse<T>>('POST', '/workflows/price-proposals', { proposal, ...command }),
    decide: <T>(id: number, decision: 'approve' | 'reject', command: WorkflowCommand & { editedPrice?: number; note?: string }) => authenticatedJsonCommand<PriceProposalWorkflowResponse<T>>('POST', `/workflows/price-proposals/${workflowPath(id)}/${decision}`, command),
  },
  prices: {
    update: (product: string, price: number, reason: string | undefined, branchId: string | undefined, command: WorkflowCommand) =>
      authenticatedJsonCommand<PriceWorkflowResponse>(
        'POST',
        `/workflows/prices/${workflowPath(product)}`,
        { price, reason, branchId, ...command },
      ),
  },
};

export const realtimeApi = {
  connect: async (): Promise<WebSocket | null> => {
    const token = await getToken();
    if (!token) return null;
    const httpBase = BASE.replace(/\/api$/, '');
    const wsBase = httpBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    return new WebSocket(`${wsBase}/api/realtime`, ['petrotrack', token]);
  },
};

export type MaintenanceWorkflowStatus =
  | 'pending'
  | 'awaiting_approval'
  | 'commenced'
  | 'open'
  | 'done'
  | 'closed';

export interface MaintenanceWorkflowRecord {
  id: number;
  taskId: string;
  title: string;
  pri: 'Urgent' | 'Medium' | 'Low';
  by: string;
  date: string;
  submittedAt: string;
  submittedBy: string;
  submittedByName?: string;
  status: MaintenanceWorkflowStatus;
  st: 'Open' | 'Done';
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
  history: Array<{ id: string; action: string; actor: string; detail?: string; at: string }>;
}

export const maintenanceApi = {
  list: () => get<MaintenanceWorkflowRecord[]>('/maintenance'),
  create: (data: { title: string; pri: 'Urgent' | 'Medium' | 'Low'; date: string }) =>
    post<{ maintenance: MaintenanceWorkflowRecord }>('/maintenance', data),
  acknowledge: (taskId: string) =>
    post<{ maintenance: MaintenanceWorkflowRecord }>(`/maintenance/${encodeURIComponent(taskId)}/acknowledge`, {}),
  assign: (taskId: string, username: string) =>
    post<{ maintenance: MaintenanceWorkflowRecord }>(`/maintenance/${encodeURIComponent(taskId)}/assign`, { username }),
  updateStatus: (taskId: string, status: MaintenanceWorkflowStatus) =>
    post<{ maintenance: MaintenanceWorkflowRecord }>(`/maintenance/${encodeURIComponent(taskId)}/status`, { status }),
  remove: (taskId: string) =>
    del(`/maintenance/${encodeURIComponent(taskId)}`),
};

export type PayrollStatus = 'draft' | 'acc_review' | 'md_review' | 'returned' | 'released';
export type PayrollOverrideField = 'pensionEmployee' | 'nhis' | 'paye';

export interface PayrollEntry {
  id: number;
  runId: number;
  period: string;
  staffKey: string;
  staffUserId: number | null;
  username: string | null;
  empName: string;
  empId: string | null;
  jobTitle: string | null;
  role: string | null;
  dept: string | null;
  branchId: string | null;
  branchName: string | null;
  bankName: string;
  accountNumber: string;
  basic: number; housing: number; transport: number; otherAllowances: number; overtime: number; bonus: number;
  gross: number;
  pensionEmployee: number; pensionEmployer: number; nhis: number; taxable: number; paye: number;
  loan: number; otherDeductions: number; otherDeductionsLabel: string;
  totalDeductions: number; net: number;
  overrides: Partial<Record<PayrollOverrideField, number>>;
  note: string;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
  runStatus?: PayrollStatus;
  releasedAt?: string | null;
}

export interface PayrollRunTotals {
  staff: number; gross: number; paye: number; pensionEmployee: number; pensionEmployer: number;
  nhis: number; loan: number; otherDeductions: number; totalDeductions: number; net: number;
}

export interface PayrollRun {
  id: number;
  period: string;
  status: PayrollStatus;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  submittedBy: string | null; submittedAt: string | null;
  reviewedBy: string | null; reviewedAt: string | null;
  approvedBy: string | null; approvedAt: string | null;
  releasedAt: string | null;
  history: Array<{ action: string; by: string; role: string; at: string; note?: string }>;
  totals: PayrollRunTotals;
}

export interface PayrollEntryInput {
  empName?: string; empId?: string | null; jobTitle?: string | null; dept?: string | null;
  bankName?: string; accountNumber?: string;
  basic?: number; housing?: number; transport?: number; otherAllowances?: number; overtime?: number; bonus?: number;
  loan?: number; otherDeductions?: number; otherDeductionsLabel?: string;
  pensionEmployee?: number | null; nhis?: number | null; paye?: number | null;
  monthlyGross?: number;
  note?: string;
  reason?: string;
}

export interface PayrollRevision {
  version: number;
  snapshot: PayrollEntry;
  reason: string;
  changedBy: string;
  changedAt: string;
}

type RunDetail = { run: PayrollRun; entries: PayrollEntry[] };
const payrollRunPath = (runId: number) => `/payroll/runs/${encodeURIComponent(String(runId))}`;

export const payrollApi = {
  listRuns: () => get<{ runs: PayrollRun[] }>('/payroll/runs'),
  getRun: (runId: number) => get<RunDetail>(payrollRunPath(runId)),
  createRun: (period: string, notes = '') =>
    authenticatedJsonCommand<RunDetail>('POST', '/payroll/runs', { period, notes }),
  updateNotes: (runId: number, notes: string) =>
    authenticatedJsonCommand<RunDetail>('PATCH', payrollRunPath(runId), { notes }),
  deleteRun: (runId: number) =>
    authenticatedJsonCommand<{ ok: true }>('DELETE', payrollRunPath(runId), {}),
  syncStaff: (runId: number) =>
    authenticatedJsonCommand<RunDetail & { added: number }>('POST', `${payrollRunPath(runId)}/sync`, {}),
  addEntry: (runId: number, input: PayrollEntryInput) =>
    authenticatedJsonCommand<{ entry: PayrollEntry }>('POST', `${payrollRunPath(runId)}/entries`, input),
  updateEntry: (runId: number, entryId: number, input: PayrollEntryInput) =>
    authenticatedJsonCommand<{ entry: PayrollEntry; revised: boolean }>('PATCH', `${payrollRunPath(runId)}/entries/${entryId}`, input),
  removeEntry: (runId: number, entryId: number) =>
    authenticatedJsonCommand<{ ok: true }>('DELETE', `${payrollRunPath(runId)}/entries/${entryId}`, {}),
  revisions: (entryId: number) => get<{ revisions: PayrollRevision[] }>(`/payroll/entries/${entryId}/revisions`),
  transition: (runId: number, action: 'submit' | 'approve' | 'return', note = '') =>
    authenticatedJsonCommand<{ run: PayrollRun }>('POST', `${payrollRunPath(runId)}/${action}`, { note }),
  myPayslips: () => get<{ payslips: PayrollEntry[] }>('/payroll/my-payslips'),
};

export const CHAT_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '👏', '✅'] as const;

export interface ChatMedia {
  objectPath?: string;
  uri?: string;
  name: string;
  mimeType: string;
  size?: number;
}

export interface ChatMember {
  username: string;
  empName: string;
  appRole: string | null;
  role: 'admin' | 'member';
  joinedAt: string;
}

export interface ChatReply {
  id: number;
  sender: string | null;
  senderName: string;
  kind: string;
  body: string;
  media: ChatMedia | null;
  deleted: boolean;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  sender: string | null;
  senderName: string;
  kind: 'text' | 'media' | 'system';
  body: string;
  media: ChatMedia | null;
  replyTo: ChatReply | null;
  forwarded: boolean;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  pinnedAt: string | null;
  pinnedBy: string | null;
  reactions: { emoji: string; usernames: string[] }[];
  seenCount: number;
  recipientCount: number;
}

export interface ChatConversation {
  id: number;
  kind: 'direct' | 'group';
  name: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  myRole: 'admin' | 'member';
  archived: boolean;
  unread: number;
  lastReadMessageId: number;
  members: ChatMember[];
  lastMessage: ChatMessage | null;
}

export interface ChatMessageInfo {
  seenBy: { username: string; empName: string; readAt: string | null }[];
  notSeenBy: { username: string; empName: string }[];
}

const chatConversationPath = (id: number) => `/chat/conversations/${encodeURIComponent(String(id))}`;
const chatMessagePath = (id: number) => `/chat/messages/${encodeURIComponent(String(id))}`;

export const chatApi = {
  conversations: () => get<{ conversations: ChatConversation[] }>('/chat/conversations'),
  unread: () => get<{ total: number }>('/chat/unread'),
  conversation: (id: number) => get<{ conversation: ChatConversation }>(chatConversationPath(id)),
  openDirect: (username: string) =>
    authenticatedJsonCommand<{ conversation: ChatConversation }>('POST', '/chat/conversations', { kind: 'direct', username }),
  createGroup: (name: string, members: string[]) =>
    authenticatedJsonCommand<{ conversation: ChatConversation }>('POST', '/chat/conversations', { kind: 'group', name, members }),
  renameGroup: (id: number, name: string) =>
    authenticatedJsonCommand<{ conversation: ChatConversation }>('PATCH', chatConversationPath(id), { name }),
  addMembers: (id: number, usernames: string[]) =>
    authenticatedJsonCommand<{ conversation: ChatConversation }>('POST', `${chatConversationPath(id)}/members`, { usernames }),
  removeMember: (id: number, username: string) =>
    authenticatedJsonCommand<{ ok: true; left: boolean }>('DELETE', `${chatConversationPath(id)}/members/${encodeURIComponent(username)}`, {}),
  setMemberRole: (id: number, username: string, role: 'admin' | 'member') =>
    authenticatedJsonCommand<{ conversation: ChatConversation }>('POST', `${chatConversationPath(id)}/members/${encodeURIComponent(username)}/role`, { role }),
  setArchived: (id: number, archived: boolean) =>
    authenticatedJsonCommand<{ ok: true }>('POST', `${chatConversationPath(id)}/archive`, { archived }),
  markRead: (id: number, upToId?: number) =>
    authenticatedJsonCommand<{ ok: true; lastReadMessageId: number }>('POST', `${chatConversationPath(id)}/read`, upToId ? { upToId } : {}),
  messages: (id: number, opts: { before?: number; limit?: number; q?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.before) params.set('before', String(opts.before));
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.q) params.set('q', opts.q);
    const query = params.toString();
    return get<{ messages: ChatMessage[]; hasMore: boolean }>(`${chatConversationPath(id)}/messages${query ? `?${query}` : ''}`);
  },
  pinned: (id: number) => get<{ messages: ChatMessage[] }>(`${chatConversationPath(id)}/pinned`),
  send: (id: number, input: { body?: string; media?: ChatMedia; replyToId?: number }) =>
    authenticatedJsonCommand<{ message: ChatMessage }>('POST', `${chatConversationPath(id)}/messages`, input),
  forward: (messageId: number, conversationIds: number[]) =>
    authenticatedJsonCommand<{ ok: true; conversationIds: number[] }>('POST', `${chatMessagePath(messageId)}/forward`, { conversationIds }),
  edit: (messageId: number, body: string) =>
    authenticatedJsonCommand<{ message: ChatMessage }>('PATCH', chatMessagePath(messageId), { body }),
  remove: (messageId: number, scope: 'me' | 'everyone') =>
    authenticatedJsonCommand<{ ok: true; scope: 'me' | 'everyone'; conversationId: number }>('DELETE', `${chatMessagePath(messageId)}?scope=${scope}`, { scope }),
  react: (messageId: number, emoji: string) =>
    authenticatedJsonCommand<{ message: ChatMessage }>('POST', `${chatMessagePath(messageId)}/reactions`, { emoji }),
  pin: (messageId: number, pinned: boolean) =>
    authenticatedJsonCommand<{ message: ChatMessage }>('POST', `${chatMessagePath(messageId)}/pin`, { pinned }),
  info: (messageId: number) => get<ChatMessageInfo>(`${chatMessagePath(messageId)}/info`),
};

export const versionApi = {
  get: () => get<{ version: string }>('/version'),
};

export type PosPaymentMethod = 'card' | 'transfer';
export type PosPaymentStatus = 'successful' | 'failed' | 'reversal';

export interface PosTerminal {
  id: string;
  provider: 'sandbox' | 'moniepoint';
  providerTerminalId: string;
  branchId: string;
  pumpId: string | null;
  label: string;
  status: 'active' | 'disabled';
  createdAt: string;
  disabledAt: string | null;
}

export interface PosTransaction {
  id: string;
  provider: string;
  providerTransactionId: string;
  terminalId: string | null;
  terminalLabel: string | null;
  providerTerminalId: string | null;
  branchId: string;
  pumpId: string | null;
  method: PosPaymentMethod;
  status: PosPaymentStatus;
  amountKobo: number;
  occurredAt: string;
  recordedAt: string;
  reversalOfProviderTransactionId: string | null;
  metadata: Record<string, string>;
}

export interface PosTransactionTotals {
  count: number;
  cardKobo: number;
  transferKobo: number;
  reversalKobo: number;
  failedCount: number;
  netKobo: number;
  cardNetKobo?: number;
  transferNetKobo?: number;
  firstAt?: string | null;
  lastAt?: string | null;
}

export interface PosShiftSummary {
  transactions: PosTransaction[];
  totals: PosTransactionTotals;
  terminals: Array<Pick<PosTerminal, 'id' | 'label' | 'provider' | 'providerTerminalId' | 'status'>>;
  window: { from: string; to: string };
}

export interface PosProviderStatus { id: string; label: string; ready: boolean }

export interface PosTransactionFilters {
  branchId?: string;
  pumpId?: string;
  terminalId?: string;
  method?: PosPaymentMethod;
  from?: string;
  to?: string;
  limit?: number;
}

export const paymentsApi = {
  config: () => get<{ providers: PosProviderStatus[] }>('/payments/config'),
  terminals: () => get<{ terminals: PosTerminal[] }>('/payments/terminals'),
  registerTerminal: (data: { provider: string; providerTerminalId: string; branchId: string; pumpId: string; label: string }) =>
    authenticatedJsonCommand<{ terminal: PosTerminal }>('POST', '/payments/terminals', data),
  disableTerminal: (id: string) =>
    authenticatedJsonCommand<{ terminal: PosTerminal }>('POST', `/payments/terminals/${encodeURIComponent(id)}/disable`, {}),
  transactions: (filters: PosTransactionFilters = {}) => {
    const params = Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
    return get<{ transactions: PosTransaction[]; totals: PosTransactionTotals }>(
      `/payments/transactions${params ? `?${params}` : ''}`,
    );
  },
  shiftSummary: (params: { pumpId: string; date: string; branchId?: string }) => {
    const query = [`pumpId=${encodeURIComponent(params.pumpId)}`, `date=${encodeURIComponent(params.date)}`];
    if (params.branchId) query.push(`branchId=${encodeURIComponent(params.branchId)}`);
    return get<PosShiftSummary>(`/payments/shift-summary?${query.join('&')}`);
  },
  simulate: (data: { terminalId: string; method: PosPaymentMethod; amountKobo: number }) =>
    authenticatedJsonCommand<{ recorded?: true; replayed?: true; transactionId?: string }>('POST', '/payments/sandbox/simulate', data),
};

export interface AppNotification {
  id: number;
  username: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export type NotificationType = 'report_attention' | 'report_update' | 'document_expiry' | 'operational';

export const notificationsApi = {
  list: () => get<AppNotification[]>('/notifications'),
  registerToken: (token: string, platform: string) =>
    post<{ ok: boolean }>('/notifications/tokens', { token, platform }),
  unregisterToken: () =>
    post<{ ok: boolean }>('/notifications/tokens/unregister', {}),
  send: (data: {
    target: string;
    branchId?: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }) => post<{ ok: boolean; recipients: number }>('/notifications', data),
  markRead: (id: number) => patchR<{ ok: boolean }>(`/notifications/${id}/read`, {}),
  markAllRead: () => post<{ ok: boolean }>('/notifications/read-all', {}),
};

export interface OperationalNotificationInput {
  target: string;
  branchId?: string;
  title: string;
  body: string;
  route: string;
  data?: Record<string, unknown>;
}

export function sendOperationalNotification(input: OperationalNotificationInput) {
  return notificationsApi.send({
    target: input.target,
    ...(input.branchId ? { branchId: input.branchId } : {}),
    type: 'operational',
    title: input.title,
    body: input.body,
    data: { route: input.route, ...(input.data ?? {}) },
  });
}

// ─── Staff Users API — dedicated DB table, real-time ─────────────────────────

export interface StaffUserRecord {
  id: number;
  empName: string;
  empId: string | null;
  username: string | null;
  role: string | null;
  branchId: string | null;
  branchName: string | null;
  status: string;
  jobTitle: string | null;
  dept: string | null;
  phoneNumber: string | null;
  nin: string | null;
  staffAddress: string | null;
  guarantorName: string | null;
  guarantorPhone: string | null;
  guarantorAddress: string | null;
  employmentDocs: string[] | null;
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  mdApprovedBy: string | null;
  mdApprovedAt: string | null;
  rejectionReason: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
}

export const usersApi = {
  /** Fetch all staff user accounts from the database */
  list: () => get<StaffUserRecord[]>('/users'),

  /** Create a new staff user account (Admin or HR) */
  create: (data: {
    empName: string;
    empId?: string | null;
    username?: string | null;
    password?: string;
    role?: string | null;
    branchId?: string | null;
    status?: string;
    jobTitle?: string | null;
    dept?: string | null;
    phoneNumber?: string | null;
    nin?: string | null;
    staffAddress?: string | null;
    guarantorName?: string | null;
    guarantorPhone?: string | null;
    guarantorAddress?: string | null;
    employmentDocs?: string[];
  }) => post<StaffUserRecord>('/users', data),

  /** Update user or enrollment fields (Admin or HR) */
  update: (id: number, data: Partial<{
    empName: string;
    empId: string | null;
    username: string | null;
    password: string;
    role: string | null;
    branchId: string | null;
    status: string;
    jobTitle: string | null;
    dept: string | null;
    phoneNumber: string | null;
    nin: string | null;
    staffAddress: string | null;
    guarantorName: string | null;
    guarantorPhone: string | null;
    guarantorAddress: string | null;
    employmentDocs: string[];
  }>) => putR<StaffUserRecord>(`/users/${id}`, data),

  /** Manage status transitions (Admin or HR; MD retains enrollment review only) */
  setStatus: (id: number, status: string, extra?: {
    username?: string;
    password?: string;
    role?: string;
    branchId?: string | null;
    rejectionReason?: string;
    rejectedBy?: string;
  }) => patchR<StaffUserRecord>(`/users/${id}/status`, { status, ...extra }),

  /** Permanently delete a user account (admin only) */
  remove: (id: number) => del(`/users/${id}`),
};

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface UploadableFile {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  /** Browser File object provided by expo-document-picker on web. */
  file?: Blob | null;
}

export type FileCategory =
  | 'general'
  | 'my_folder'
  | 'meeting_minutes'
  | 'hr_enrollment'
  | 'hr_document'
  | 'hr_handbook'
  | 'delivery_evidence'
  | 'chat_media';

/** Links an uploaded file to the app record it belongs to in the database. */
export interface UploadLink {
  category: FileCategory;
  relatedId?: string | number | null;
}

export interface UploadedFile {
  objectPath: string;
  name: string;
  mimeType: string;
  size: number;
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

export function uploadErrorMessage(status: number, serverMessage?: string | null): string {
  if (status === 401) return 'Your session has expired. Please sign out and sign in again, then retry.';
  if (status === 403) return 'You do not have permission to upload files here.';
  if (status === 413) return `The file is too large. The maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`;
  if (serverMessage) return serverMessage;
  if (status === 0) return 'Could not reach the server. Check your internet connection and try again.';
  return `The server could not save the file (error ${status}). Please try again.`;
}

export function uploadFailureMessage(error: unknown): string {
  return error instanceof UploadError
    ? error.message
    : 'The file could not be uploaded. Please try again.';
}

function parseServerError(body: string | null | undefined): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error : null;
  } catch {
    return null;
  }
}

/** Storage — files are uploaded through the API and stored in PostgreSQL. */
export const storageApi = {
  uploadFile: async (asset: UploadableFile, link?: UploadLink): Promise<UploadedFile> => {
    if (!BASE) throw new UploadError('The app is not connected to a server.');
    if (asset.size != null && asset.size > MAX_UPLOAD_BYTES) {
      throw new UploadError(uploadErrorMessage(413));
    }
    const mimeType = asset.mimeType || 'application/octet-stream';
    const headers = {
      ...(await authHeaders()),
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(asset.name || 'document'),
      'X-File-Type': mimeType,
      'X-File-Category': link?.category ?? 'general',
      ...(link?.relatedId != null && link.relatedId !== ''
        ? { 'X-Related-Id': encodeURIComponent(String(link.relatedId)) }
        : {}),
    };
    const url = `${BASE}/storage/uploads`;

    let status = 0;
    let body: string | null = null;
    try {
      if (Platform.OS === 'web') {
        const blob = asset.file ?? await (await fetch(asset.uri)).blob();
        if (blob.size > MAX_UPLOAD_BYTES) throw new UploadError(uploadErrorMessage(413));
        const response = await fetch(url, { method: 'POST', headers, body: blob });
        status = response.status;
        body = await response.text();
      } else {
        const result = await FileSystem.uploadAsync(url, asset.uri, {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers,
        });
        status = result.status;
        body = result.body;
      }
    } catch (error) {
      if (error instanceof UploadError) throw error;
      throw new UploadError(uploadErrorMessage(0));
    }

    if (status < 200 || status >= 300) {
      throw new UploadError(uploadErrorMessage(status, parseServerError(body)));
    }
    let saved: { objectPath?: unknown; size?: unknown } = {};
    try {
      saved = JSON.parse(body ?? '{}');
    } catch {
      // handled below
    }
    if (typeof saved.objectPath !== 'string' || !saved.objectPath.startsWith('/objects/')) {
      throw new UploadError('The server did not confirm the upload. Please try again.');
    }
    return {
      objectPath: saved.objectPath,
      name: asset.name,
      mimeType,
      size: typeof saved.size === 'number' && saved.size > 0 ? saved.size : Math.max(1, asset.size ?? 1),
    };
  },
  /** Authenticated URL for streaming a stored file (e.g. an image) without saving it on the device. */
  objectSource: async (objectPath: string): Promise<{ uri: string; headers: Record<string, string> } | null> => {
    if (!BASE || !objectPath.startsWith('/objects/')) return null;
    const encodedPath = objectPath.slice('/objects/'.length).split('/').map(encodeURIComponent).join('/');
    return { uri: `${BASE}/storage/objects/${encodedPath}`, headers: await authHeaders() };
  },
  deleteObject: async (objectPath: string): Promise<boolean> => {
    if (!BASE || !objectPath.startsWith('/objects/')) return false;
    try {
      const headers = await authHeaders();
      const encodedPath = objectPath.slice('/objects/'.length).split('/').map(encodeURIComponent).join('/');
      const r = await fetch(`${BASE}/storage/objects/${encodedPath}`, {
        method: 'DELETE',
        headers,
      });
      return r.ok;
    } catch {
      return false;
    }
  },
  downloadObject: async (objectPath: string, destinationUri: string): Promise<string | null> => {
    if (!BASE || !objectPath.startsWith('/objects/')) return null;
    try {
      const headers = await authHeaders();
      const encodedPath = objectPath.slice('/objects/'.length).split('/').map(encodeURIComponent).join('/');
      const result = await FileSystem.downloadAsync(
        `${BASE}/storage/objects/${encodedPath}`,
        destinationUri,
        { headers },
      );
      return result.status >= 200 && result.status < 300 ? result.uri : null;
    } catch {
      return null;
    }
  },
  fetchObject: async (objectPath: string): Promise<{ blob: Blob; contentType: string } | null> => {
    if (!BASE || !objectPath.startsWith('/objects/')) return null;
    try {
      const headers = await authHeaders();
      const encodedPath = objectPath.slice('/objects/'.length).split('/').map(encodeURIComponent).join('/');
      const response = await fetch(`${BASE}/storage/objects/${encodedPath}`, { headers });
      if (!response.ok) return null;
      return {
        blob: await response.blob(),
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      };
    } catch {
      return null;
    }
  },
};

function withOutboxLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = outboxOperation.then(operation, operation);
  outboxOperation = next.then(() => undefined, () => undefined);
  return next;
}

export function enqueueShiftReportOutbox<T>(
  item: ShiftReportOutboxItem<T>,
): Promise<ShiftReportOutboxItem<T>[]> {
  return withOutboxLock(async () => {
    const current = await readShiftReportOutbox<T>();
    const next = [
      ...current.filter(existing => existing.idempotencyKey !== item.idempotencyKey),
      item,
    ];
    await AsyncStorage.setItem(SHIFT_REPORT_OUTBOX_STORAGE_KEY, JSON.stringify(next));
    return next;
  });
}

export interface ShiftReportOutboxItem<T = unknown> {
  idempotencyKey: string;
  report: T;
  queuedAt: string;
}

export function removeShiftReportOutbox(
  idempotencyKey: string,
): Promise<boolean> {
  return withOutboxLock(async () => {
    const current = await readShiftReportOutbox();
    const next = current.filter(item => item.idempotencyKey !== idempotencyKey);
    if (next.length === current.length) return false;
    await AsyncStorage.setItem(SHIFT_REPORT_OUTBOX_STORAGE_KEY, JSON.stringify(next));
    return true;
  });
}

async function readShiftReportOutbox<T>(): Promise<ShiftReportOutboxItem<T>[]> {
  const raw = await AsyncStorage.getItem(SHIFT_REPORT_OUTBOX_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ShiftReportOutboxItem<T> => (
      !!item &&
      typeof item === 'object' &&
      typeof (item as ShiftReportOutboxItem<T>).idempotencyKey === 'string' &&
      (item as ShiftReportOutboxItem<T>).idempotencyKey.length > 0 &&
      typeof (item as ShiftReportOutboxItem<T>).queuedAt === 'string' &&
      'report' in item
    ));
  } catch {
    return [];
  }
}

export function loadShiftReportOutbox<T>(): Promise<ShiftReportOutboxItem<T>[]> {
  return withOutboxLock(() => readShiftReportOutbox<T>());
}

let outboxOperation = Promise.resolve();
