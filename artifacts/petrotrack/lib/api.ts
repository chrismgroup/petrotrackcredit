import AsyncStorage from '@react-native-async-storage/async-storage';

function getBase(): string {
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
    return `${window.location.origin}/api`;
  }
  const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? 'petrotrack.replit.app';
  return `https://${DOMAIN}/api`;
}

const BASE = getBase();
const TOKEN_KEY = 'pt_auth_token';

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

async function put(path: string, data: unknown): Promise<void> {
  if (!BASE) return;
  try {
    const headers = await authHeaders();
    await fetch(`${BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
  } catch {
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
  put: (key: string, data: unknown) => put(`/state/${key}`, data),
  resetOperational: () => post<{ ok: boolean; seedMeters?: Record<string, number> }>('/state/reset-operational', {}),
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

export const notificationsApi = {
  list: () => get<AppNotification[]>('/notifications'),
  registerToken: (token: string, platform: string) =>
    post<{ ok: boolean }>('/notifications/tokens', { token, platform }),
  unregisterToken: () =>
    post<{ ok: boolean }>('/notifications/tokens/unregister', {}),
  send: (data: {
    target: string;
    branchId?: string;
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }) => post<{ ok: boolean; recipients: number }>('/notifications', data),
  markRead: (id: number) => patchR<{ ok: boolean }>(`/notifications/${id}/read`, {}),
  markAllRead: () => post<{ ok: boolean }>('/notifications/read-all', {}),
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
};
