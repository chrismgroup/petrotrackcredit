// Expo 57's Jest preset defaults to a native runtime. The Petrotrack test
// harness uses web-compatible React Native mocks, so keep Expo's runtime
// branch consistent and avoid loading unavailable native logger modules.
process.env.EXPO_OS = 'web';

// Expo installs `fetch` as a lazy native getter. Accessing that getter after a
// test has completed can asynchronously load ExpoModulesCore and make Jest
// fail with "Cannot log after tests are done". Tests replace or spy on this
// stable function when they need HTTP behavior.
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  writable: true,
  value: jest.fn(),
});

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
    Platform: {
      OS: 'web',
      select: (options: Record<string, unknown>) => options.web ?? options.default ?? options.native,
    },
    TurboModuleRegistry: {
      get: jest.fn(() => null),
      getEnforcing: jest.fn(() => null),
    },
    Alert: { alert: jest.fn() },
  };
});

jest.mock('@/lib/api', () => {
  const outboxKey = 'pt_shift_report_outbox_v1';
  const readOutbox = async () => {
    const storage = jest.requireMock('@react-native-async-storage/async-storage').default;
    const raw = await storage.getItem(outboxKey);
    return raw ? JSON.parse(raw) : [];
  };
  const mockNotificationsApi = {
    list: jest.fn(async () => []),
    registerToken: jest.fn(async () => ({ ok: true })),
    unregisterToken: jest.fn(async () => ({ ok: true })),
    send: jest.fn(async (..._args: unknown[]) => ({ ok: true, recipients: 0 })),
    markRead: jest.fn(async () => ({ ok: true })),
    markAllRead: jest.fn(async () => ({ ok: true })),
  };
  const deliveryRecords = new Map<number, any>();
  const proposalRecords = new Map<number, any>();
  const nextRevision = (record: any, key: string) => ({ ...record, [key]: Number(record?.[key] ?? 0) + 1 });
  const deliveryResult = (id: number, updates: Record<string, unknown> = {}) => {
    const current = deliveryRecords.get(id);
    if (!current) return null;
    const delivery = nextRevision({ ...current, ...updates }, 'workflowVersion');
    deliveryRecords.set(id, delivery);
    return { delivery };
  };
  return {
    SHIFT_REPORT_OUTBOX_STORAGE_KEY: outboxKey,
    MAX_UPLOAD_BYTES: 20 * 1024 * 1024,
    uploadFailureMessage: jest.fn((error: unknown) =>
      error instanceof Error ? error.message : 'The file could not be uploaded. Please try again.'),
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
      putChecked: jest.fn(async () => ({ ok: true, data: {} })),
      upsertCompanyAsset: jest.fn(async (asset: unknown) => ({ ok: true, asset, assets: [asset] })),
      deleteCompanyAsset: jest.fn(async () => ({ ok: true, assets: [] })),
      submitPumpReport: jest.fn(async (report: unknown) => ({ ok: true, report })),
      resetOperational: jest.fn(async () => ({ ok: true })),
      deletePumpReport: jest.fn(async () => ({ ok: true })),
    },
    workflowApi: {
      deliveries: {
        create: jest.fn(async (delivery: any) => {
          const saved = { ...delivery, approvalStatus: delivery.approvalStatus ?? 'draft', workflowVersion: 0 };
          deliveryRecords.set(saved.id, saved);
          return { delivery: saved };
        }),
        update: jest.fn(async (id: number, updates: any) => deliveryResult(id, updates)),
        remove: jest.fn(async (id: number) => {
          const current = deliveryRecords.get(id);
          deliveryRecords.delete(id);
          return current ? { delivery: current } : null;
        }),
        submit: jest.fn(async (id: number) => deliveryResult(id, { approvalStatus: 'pending_acc' })),
        forward: jest.fn(async (id: number, costPrice: number, note: string) => deliveryResult(id, { approvalStatus: 'pending_md', costPrice, accNote: note })),
        recall: jest.fn(async (id: number) => deliveryResult(id, { approvalStatus: 'pending_acc' })),
        approve: jest.fn(async (id: number, sellingPrice: number, note: string) => deliveryResult(id, { approvalStatus: 'md_approved', sellingPrice, mdNote: note })),
        reject: jest.fn(async (id: number, note: string) => deliveryResult(id, { approvalStatus: 'returned', rejectedNote: note })),
      },
      expenses: {
        create: jest.fn(async () => null), update: jest.fn(async () => null), remove: jest.fn(async () => null),
        transition: jest.fn(async () => null),
      },
      budgets: {
        create: jest.fn(async (budget: any) => ({ record: { ...budget, id: Date.now(), workflow: [], revision: 0 } })),
        update: jest.fn(async () => null), updateAndSubmit: jest.fn(async () => null), remove: jest.fn(async () => null), archive: jest.fn(async () => null),
        transition: jest.fn(async () => null),
      },
      dips: {
        create: jest.fn(async () => null), update: jest.fn(async () => null), remove: jest.fn(async () => null),
        decide: jest.fn(async () => null),
      },
      priceProposals: {
        create: jest.fn(async (proposal: any) => {
          const saved = {
            ...proposal, id: Date.now(), currentPrice: 0, proposedBy: 'Managing Director',
            proposedAt: new Date().toISOString(), status: 'pending', workflowRevision: 0,
          };
          proposalRecords.set(saved.id, saved);
          return { proposal: saved };
        }),
        decide: jest.fn(async (id: number, decision: string) => {
          const current = proposalRecords.get(id);
          if (!current) return null;
          const proposal = nextRevision({ ...current, status: decision === 'approve' ? 'approved' : 'rejected' }, 'workflowRevision');
          proposalRecords.set(id, proposal);
          return { proposal };
        }),
      },
    },
    versionApi: { get: jest.fn(async () => ({ version: 'test' })) },
    usersApi: { list: jest.fn(async () => []) },
    notificationsApi: mockNotificationsApi,
    sendOperationalNotification: jest.fn(async (input: {
      target: string;
      branchId?: string;
      title: string;
      body: string;
      route: string;
      data?: Record<string, unknown>;
    }) => mockNotificationsApi.send({
      target: input.target,
      ...(input.branchId ? { branchId: input.branchId } : {}),
      type: 'operational',
      title: input.title,
      body: input.body,
      data: { route: input.route, ...(input.data ?? {}) },
    })),
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
