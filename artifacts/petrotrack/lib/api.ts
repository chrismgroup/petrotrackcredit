const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;
const BASE = DOMAIN ? `https://${DOMAIN}/api` : null;

async function get<T>(path: string): Promise<T | null> {
  if (!BASE) return null;
  try {
    const r = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    return r.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function put(path: string, data: unknown): Promise<void> {
  if (!BASE) return;
  try {
    await fetch(`${BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
  }
}

export const stateApi = {
  getAll: () => get<Record<string, unknown>>('/state'),
  get: <T>(key: string) => get<T>(`/state/${key}`),
  put: (key: string, data: unknown) => put(`/state/${key}`, data),
};
