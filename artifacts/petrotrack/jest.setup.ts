jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    multiGet: jest.fn(async (keys: string[]) => keys.map(key => [key, null])),
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('@/lib/api', () => ({
  stateApi: {
    getAll: jest.fn(async () => null),
    get: jest.fn(async () => null),
    put: jest.fn(async () => undefined),
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
}));