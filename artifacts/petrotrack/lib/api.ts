import AsyncStorage from '@react-native-async-storage/async-storage';

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;
const BASE = DOMAIN ? `https://${DOMAIN}/api` : null;
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

export interface LoginResult {
  token: string;
  role: string;
  empName: string;
  branchId: string | null;
}

export async function apiLogin(username: string, password: string): Promise<LoginResult | null> {
  if (!BASE) return null;
  try {
    const r = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!r.ok) return null;
    const result = await r.json() as LoginResult;
    await saveToken(result.token);
    return result;
  } catch {
    return null;
  }
}

export const stateApi = {
  getAll: () => get<Record<string, unknown>>('/state'),
  get: <T>(key: string) => get<T>(`/state/${key}`),
  put: (key: string, data: unknown) => put(`/state/${key}`, data),
};
