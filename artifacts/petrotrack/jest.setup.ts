jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      __storage: storage,
      multiGet: jest.fn(async (keys: string[]) => keys.map(key => [key, storage.get(key) ?? null])),
      getItem: jest.fn(async (key: string) => storage.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        storage.delete(key);
      }),
      clear: jest.fn(async () => {
        storage.clear();
      }),
    },
  };
});

jest.mock('react-native', () => {
  const listeners = new Set();
  return {
    AppState: {
      __emitChange: (nextState: string) => listeners.forEach((listener: any) => listener(nextState)),
      addEventListener: jest.fn((_event: string, listener: (nextState: string) => void) => {
        listeners.add(listener);
        return { remove: jest.fn(() => listeners.delete(listener)) };
      }),
    },
  };
});

jest.mock('@/lib/api', () => {
  const outboxKey = 'pt_shift_report_outbox_v1';
  const readOutbox = async () => {
    const storage = jest.requireMock('@react-native-async-storage/async-storage').default;
    const raw = await storage.getItem(outboxKey);
    return raw ? JSON.parse(raw) : [];
  };
  return {
    SHIFT_REPORT_OUTBOX_STORAGE_KEY: outboxKey,
    loadShiftReportOutbox: jest.fn(readOutbox),
    enqueueShiftReportOutbox: jest.fn(async (item: { idempotencyKey: string }) => {
      const storage = jest.requireMock('@react-native-async-storage/async-storage').default;
      const current = await readOutbox();
      const next = [...current.filter((entry: { idempotencyKey: string }) =>
        entry.idempotencyKey !== item.idempotencyKey), item];
      await storage.setItem(outboxKey, JSON.stringify(next));
      return next;
    }),
    removeShiftReportOutbox: jest.fn(async (idempotencyKey: string) => {
      const storage = jest.requireMock('@react-native-async-storage/async-storage').default;
      const current = await readOutbox();
      const next = current.filter((entry: { idempotencyKey: string }) =>
        entry.idempotencyKey !== idempotencyKey);
      if (current.length === next.length) return false;
      await storage.setItem(outboxKey, JSON.stringify(next));
      return true;
    }),
    stateApi: {
      getAll: jest.fn(async () => null),
      get: jest.fn(async () => null),
      put: jest.fn(async () => undefined),
      submitPumpReport: jest.fn(async (report: unknown) => ({ ok: true, report })),
      resetOperational: jest.fn(async () => ({ ok: true })),
      deleteApprovedPumpReport: jest.fn(async () => ({ ok: true })),
    },
    versionApi: { get: jest.fn(async () => ({ version: 'test' })) },
    usersApi: { list: jest.fn(async () => []) },
    notificationsApi: {
      list: jest.fn(async () => []),
      registerToken: jest.fn(async () => ({ ok: true })),
      unregisterToken: jest.fn(async () => ({ ok: true })),
      send: jest.fn(async () => ({ ok: true, recipients: 0 })),
      markRead: jest.fn(async () => ({ ok: true })),
      markAllRead: jest.fn(async () => ({ ok: true })),
    },
    maintenanceApi: {
      list: jest.fn(async () => []),
      create: jest.fn(async () => null),
      acknowledge: jest.fn(async () => null),
      assign: jest.fn(async () => null),
      updateStatus: jest.fn(async () => null),
    },
    apiLogin: jest.fn(),
    saveToken: jest.fn(async () => undefined),
    clearToken: jest.fn(async () => undefined),
  };
});