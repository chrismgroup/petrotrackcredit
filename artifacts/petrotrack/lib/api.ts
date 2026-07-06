const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${BASE}${path}`);
    if (!r.ok) return null;
    return r.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function put(path: string, data: unknown): Promise<void> {
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
