import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { AuthResult, Vessel, VesselContact, VesselPhoto, VesselWithContacts, CharterParty, VesselNotification, VesselUser } from './types';

const TOKEN_KEY = 'vm_auth_token';

function getBase(): string {
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
    return `${window.location.origin}/api`;
  }
  const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? '';
  return `https://${DOMAIN}/api`;
}

const BASE = getBase();
const VESSEL_BASE = `${BASE}/vessels`;
const CHARTER_BASE = `${BASE}/charter-parties`;

async function getToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return sessionStorage.getItem(TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    sessionStorage.setItem(TOKEN_KEY, token);
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === 'web') {
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface ApiError { error: string; }

async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<{ data: T | null; error: string | null; status: number }> {
  try {
    const headers = await authHeaders();
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...headers,
        ...(options.headers as Record<string, string>),
      },
    });
    if (res.status === 204) return { data: null, error: null, status: 204 };
    const body = await res.json();
    if (!res.ok) {
      const err = (body as ApiError).error || `HTTP ${res.status}`;
      return { data: null, error: err, status: res.status };
    }
    return { data: body as T, error: null, status: res.status };
  } catch {
    return { data: null, error: 'Network error', status: 0 };
  }
}

async function get<T>(url: string) { return request<T>(url, { method: 'GET' }); }
async function post<T>(url: string, body: unknown) { return request<T>(url, { method: 'POST', body: JSON.stringify(body) }); }
async function put<T>(url: string, body: unknown) { return request<T>(url, { method: 'PUT', body: JSON.stringify(body) }); }
async function patch<T>(url: string, body?: unknown) { return request<T>(url, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }); }
async function del(url: string) { return request<null>(url, { method: 'DELETE' }); }

export async function requestUploadUrl(file: { name: string; size: number; contentType: string }) {
  return post<{ uploadURL: string; objectPath: string }>(`${BASE}/storage/uploads/request-url`, file);
}

export async function uploadToPresignedUrl(uploadURL: string, blob: Blob, contentType: string): Promise<boolean> {
  try {
    const res = await fetch(uploadURL, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const vmAuth = {
  register: (data: { name: string; email: string; password: string; role: string; company?: string; phone?: string }) =>
    post<AuthResult>(`${VESSEL_BASE}/auth/register`, data),
  login: (email: string, password: string) =>
    post<AuthResult>(`${VESSEL_BASE}/auth/login`, { email, password }),
};

export interface VesselsFilter {
  vesselType?: string;
  status?: string;
  tradingArea?: string;
  search?: string;
}

export const vmVessels = {
  list: (filters?: VesselsFilter) => {
    const params = new URLSearchParams();
    if (filters?.vesselType) params.set('vesselType', filters.vesselType);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.tradingArea) params.set('tradingArea', filters.tradingArea);
    if (filters?.search) params.set('search', filters.search);
    const q = params.toString();
    return get<Vessel[]>(`${VESSEL_BASE}${q ? `?${q}` : ''}`);
  },
  get: (id: number) => get<VesselWithContacts>(`${VESSEL_BASE}/${id}`),
  create: (data: Partial<Vessel> & { contacts?: Partial<VesselContact>[] }) =>
    post<Vessel>(VESSEL_BASE, data),
  update: (id: number, data: Partial<Vessel> & { contacts?: Partial<VesselContact>[] }) =>
    put<Vessel>(`${VESSEL_BASE}/${id}`, data),
  setStatus: (id: number, status: string) =>
    patch<Vessel>(`${VESSEL_BASE}/${id}/status`, { status }),
  getPhotos: (id: number) => get<VesselPhoto[]>(`${VESSEL_BASE}/${id}/photos`),
  addPhoto: (id: number, objectPath: string) =>
    post<VesselPhoto>(`${VESSEL_BASE}/${id}/photos`, { objectPath }),
  deletePhoto: (vesselId: number, photoId: number) =>
    del(`${VESSEL_BASE}/${vesselId}/photos/${photoId}`),
  setCover: (vesselId: number, photoId: number) =>
    patch<VesselPhoto>(`${VESSEL_BASE}/${vesselId}/photos/${photoId}`, { sortOrder: 0 }),
};

export const vmCharters = {
  submit: (vesselId: number, data: Partial<CharterParty>) =>
    post<CharterParty>(`${VESSEL_BASE}/${vesselId}/charter`, data),
  list: () => get<CharterParty[]>(CHARTER_BASE),
  update: (id: number, data: Partial<CharterParty>) =>
    put<CharterParty>(`${CHARTER_BASE}/${id}`, data),
  confirm: (id: number) => post<CharterParty>(`${CHARTER_BASE}/${id}/confirm`, {}),
  decline: (id: number) => post<CharterParty>(`${CHARTER_BASE}/${id}/decline`, {}),
  terminate: (id: number) => post<CharterParty>(`${CHARTER_BASE}/${id}/terminate`, {}),
};

export const vmNotifications = {
  list: () => get<VesselNotification[]>(`${BASE}/vessel-notifications`),
  markRead: (id: number) => patch<VesselNotification>(`${BASE}/vessel-notifications/${id}/read`),
  markAllRead: () => post<{ ok: boolean }>(`${BASE}/vessel-notifications/read-all`, {}),
};

export const vmAdmin = {
  listUsers: () => get<VesselUser[]>(`${BASE}/vessel-admin/users`),
  updateUserRole: (id: number, role: string) =>
    patch<VesselUser>(`${BASE}/vessel-admin/users/${id}/role`, { role }),
};
