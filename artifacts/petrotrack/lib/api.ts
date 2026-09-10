import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

function getBase(): string {
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
    return `${window.location.origin}/api`;
  }
  const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? 'petrotrack.replit.app';
  return `https://${DOMAIN}/api`;
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
export type DipWorkflowResponse<T> = { dip: T; inventoryLog?: unknown[]; replayed?: boolean };
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

export const versionApi = {
  get: () => get<{ version: string }>('/version'),
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

export type DailyCallKind = 'audio' | 'video';
export interface DailyCallSession {
  callId: string;
  roomUrl: string;
  token: string;
  kind: DailyCallKind;
  peerName: string;
  expiresAt: number;
}

export const dailyCallsApi = {
  create: (data: {
    recipientUsername: string;
    recipientName: string;
    kind: DailyCallKind;
  }) => post<DailyCallSession>('/calls', data),
  token: (callId: string) => post<DailyCallSession>(`/calls/${encodeURIComponent(callId)}/token`, {}),
};

// ─── Staff Users API — dedicated DB table, real-time ─────────────────────────

export interface StaffUserRecord {
  id: number;
  empName: string;
  empId: string | null;
  username: string | null;
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

  /** Create a new staff user account (admin only) */
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

  /** Update enrollment fields; HR is limited to rejected records, admin has full access */
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

  /** Manage status transitions; HR may only re-submit rejected records */
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

/** Storage — presigned URL upload flow */
export const storageApi = {
  requestUploadUrl: async (name: string, size: number, contentType: string): Promise<{ uploadURL: string; objectPath: string } | null> => {
    if (!BASE) return null;
    try {
      const headers = await authHeaders();
      const r = await fetch(`${BASE}/storage/uploads/request-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ name, size, contentType }),
      });
      if (!r.ok) return null;
      return r.json() as Promise<{ uploadURL: string; objectPath: string }>;
    } catch {
      return null;
    }
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
