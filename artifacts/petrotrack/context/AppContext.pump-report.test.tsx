import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState as NativeAppState } from 'react-native';

import { SHIFT_REPORT_OUTBOX_STORAGE_KEY, stateApi } from '@/lib/api';
import {
  AppProvider,
  calculateDailyOperationalStock,
  calculateDailyStockLogBalance,
  calculateStockBook,
  getCurrentTankStock,
  getLatestPumpReportForOpeningMeter,
  getPumpOpeningMeter,
  isFutureBusinessDate,
  mergePumpDailyReports,
  mergeDipRecords,
  salesRevenueByBranch,
  useApp,
} from './AppContext';
import type { Delivery, DipRecord, PumpDailyReport, PumpReportStatus } from './AppContext';
import { findLatestDipForProduct } from '../lib/dip-helpers';

type AppState = ReturnType<typeof useApp>;

let capturedApp: AppState | null = null;
let providerError: Error | null = null;
let renderer: ReactTestRenderer | null = null;

function ContextCapture() {
  capturedApp = useApp();
  return null;
}

class ProviderErrorBoundary extends React.Component<React.PropsWithChildren, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    providerError = error;
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

function reportWithStatus(status: PumpReportStatus, submittedBy = 'Original Attendant'): PumpDailyReport {
  return {
    id: 101,
    date: '2026-08-20',
    pumpId: 'pump-1',
    pumpName: 'PMS 1',
    product: 'PMS',
    branchId: 'branch-1',
    openingMeter: 1000,
    closingMeter: 1050,
    liters: 50,
    unitPrice: 700,
    grossAmount: 35000,
    posAmount: 10000,
    cashAmount: 25000,
    transferAmount: 0,
    creditAmount: 0,
    totalCollected: 35000,
    variance: 0,
    note: 'End-of-shift reading',
    submittedBy,
    submittedByName: submittedBy,
    submittedAt: '2026-08-20T10:00:00.000Z',
    status,
    mgrNote: 'Reviewed',
    accNote: 'Approved',
    accAt: '2026-08-20T11:00:00.000Z',
  };
}

function deliveryWithStatus(
  approvalStatus: Delivery['approvalStatus'],
  receivedBy = 'Original Manager',
): Omit<Delivery, 'id'> {
  return {
    dt: '2026-08-20',
    submittedAt: '2026-08-20T10:00:00.000Z',
    sup: 'Test Supplier',
    prod: 'PMS',
    wb: 'WB-DEL-1',
    ord: 100,
    rec: 100,
    st: 'ok',
    notes: 'Test receipt',
    receivedBy,
    approvalStatus,
    branchId: 'branch-1',
  };
}

function app(): AppState {
  if (!capturedApp) throw new Error('App context was not rendered');
  return capturedApp;
}

async function renderProvider(expectEmpty = true) {
  await act(async () => {
    renderer = create(
      <ProviderErrorBoundary>
        <AppProvider>
          <ContextCapture />
        </AppProvider>
      </ProviderErrorBoundary>,
    );
  });

  if (providerError) throw providerError;
  if (expectEmpty) expect(app().pumpDailyReports).toEqual([]);
}

async function submitReport(submittedBy = 'Original Attendant') {
  const { id: _id, status: _status, submittedAt: _submittedAt, ...input } = reportWithStatus('pending_manager', submittedBy);
  await act(async () => {
    app().submitPumpReport(input);
  });
  return app().pumpDailyReports[0];
}

async function createApprovedReport() {
  const submitted = await submitReport();
  await act(async () => {
    app().mgrForwardPumpReport(submitted.id, 'Manager review');
  });
  await act(async () => {
    app().accApprovePumpReport(app().pumpDailyReports[0], 'Accountant approval');
  });
  const approved = app().pumpDailyReports[0];
  expect(approved.status).toBe('approved');
  return approved;
}

async function createReturnedAttendantReport(
  submittedBy: string,
  status: Extract<PumpReportStatus, 'returned' | 'returned_attendant'> = 'returned_attendant',
) {
  const submitted = await submitReport(submittedBy);
  await act(async () => {
    app().mgrForwardPumpReport(submitted.id, 'Manager review');
  });
  await act(async () => {
    app().accRejectPumpReport(submitted.id, 'Please correct the reading');
  });
  if (status === 'returned_attendant') {
    await act(async () => {
      app().mgrReturnPumpReportToAttendant(submitted.id, 'Correct the meter reading');
    });
  }
  const returned = app().pumpDailyReports[0];
  expect(returned.status).toBe(status);
  return returned;
}

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  capturedApp = null;
  providerError = null;
  const storage = (AsyncStorage as typeof AsyncStorage & { __storage?: Map<string, string> }).__storage;
  storage?.clear();
  jest.clearAllMocks();
});

describe('shift report delivery outbox', () => {
  beforeEach(() => {
    jest.mocked(stateApi.getAll).mockReset().mockResolvedValue(null);
    jest.mocked(stateApi.submitPumpReport).mockReset()
      .mockImplementation(async report => ({ ok: true, report }));
  });

  function pendingReportInput(submittedBy = 'Offline Attendant') {
    const {
      id: _id,
      status: _status,
      submittedAt: _submittedAt,
      ...input
    } = reportWithStatus('pending_manager', submittedBy);
    return input;
  }

  async function settleEffects() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('restores a queued report after the provider restarts', async () => {
    jest.mocked(stateApi.submitPumpReport).mockResolvedValueOnce(null);
    await renderProvider();

    let result: Awaited<ReturnType<AppState['submitPumpReportConfirmed']>>;
    await act(async () => {
      result = await app().submitPumpReportConfirmed(pendingReportInput());
    });
    expect(result!).toBe('queued');
    const queued = app().pumpDailyReports[0];
    expect(queued.deliveryStatus).toBe('queued');
    expect(queued.idempotencyKey).toBe(String(queued.id));
    expect(await AsyncStorage.getItem(SHIFT_REPORT_OUTBOX_STORAGE_KEY)).toContain(queued.idempotencyKey);

    act(() => renderer?.unmount());
    renderer = null;
    capturedApp = null;
    await renderProvider(false);

    expect(app().pumpDailyReports).toEqual(
      expect.arrayContaining([expect.objectContaining({
        id: queued.id,
        idempotencyKey: queued.idempotencyKey,
        deliveryStatus: 'queued',
      })]),
    );
  });

  it('repeats the same idempotent request until one retry is acknowledged', async () => {
    jest.mocked(stateApi.getAll).mockResolvedValue({ pumpDailyReports: [] });
    jest.mocked(stateApi.submitPumpReport)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async report => ({ ok: true, report }));
    await renderProvider();

    await act(async () => {
      expect(await app().submitPumpReportConfirmed(pendingReportInput())).toBe('queued');
    });
    const queued = app().pumpDailyReports[0];

    await act(async () => {
      expect(await app().login('att', 'Offline Attendant', 1, 'branch-1')).toBe(true);
    });
    await settleEffects();
    expect(app().pumpDailyReports[0].deliveryStatus).toBe('queued');

    await act(async () => {
      (NativeAppState as typeof NativeAppState & { __emitChange: (state: string) => void })
        .__emitChange('active');
      await Promise.resolve();
      await Promise.resolve();
    });
    await settleEffects();

    const calls = jest.mocked(stateApi.submitPumpReport).mock.calls;
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map(call => call[1]))).toEqual(new Set([queued.idempotencyKey]));
    expect(calls.every(call => (call[0] as PumpDailyReport).id === queued.id)).toBe(true);
    expect(app().pumpDailyReports[0].deliveryStatus).toBe('confirmed');
    expect(await AsyncStorage.getItem(SHIFT_REPORT_OUTBOX_STORAGE_KEY)).toBe('[]');
  });

  it('keeps queued reports immutable so a retry cannot resurrect stale edits or deletions', async () => {
    jest.mocked(stateApi.getAll).mockResolvedValue({ pumpDailyReports: [] });
    jest.mocked(stateApi.submitPumpReport)
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async report => ({ ok: true, report }));
    await renderProvider();

    await act(async () => {
      expect(await app().submitPumpReportConfirmed(pendingReportInput())).toBe('queued');
    });
    const queued = app().pumpDailyReports[0];
    let deleted = true;
    await act(async () => {
      app().updatePumpReport(queued.id, { closingMeter: 9999, note: 'Must not be retried' });
      deleted = await app().deletePumpReport(queued.id);
    });

    expect(deleted).toBe(false);
    expect(app().pumpDailyReports[0]).toMatchObject({
      id: queued.id,
      closingMeter: queued.closingMeter,
      note: queued.note,
      deliveryStatus: 'queued',
    });

    await act(async () => {
      expect(await app().login('att', 'Offline Attendant', 1, 'branch-1')).toBe(true);
    });
    await settleEffects();

    const retried = jest.mocked(stateApi.submitPumpReport).mock.calls[1][0] as PumpDailyReport;
    expect(retried).toMatchObject({
      id: queued.id,
      closingMeter: queued.closingMeter,
      note: queued.note,
    });
    expect(retried.note).not.toBe('Must not be retried');
    expect(app().pumpDailyReports[0].deliveryStatus).toBe('confirmed');
  });

  it('clears the outbox when sync finds a report committed after its response was lost', async () => {
    let committedReport: PumpDailyReport | null = null;
    jest.mocked(stateApi.submitPumpReport).mockImplementationOnce(async report => {
      committedReport = { ...(report as PumpDailyReport) };
      delete committedReport.deliveryStatus;
      return null;
    });
    await renderProvider();

    await act(async () => {
      expect(await app().submitPumpReportConfirmed(pendingReportInput())).toBe('queued');
    });
    expect(committedReport).not.toBeNull();

    act(() => renderer?.unmount());
    renderer = null;
    capturedApp = null;
    jest.mocked(stateApi.getAll).mockResolvedValue({ pumpDailyReports: [committedReport!] });
    await renderProvider(false);

    await act(async () => {
      expect(await app().login('att', 'Offline Attendant', 1, 'branch-1')).toBe(true);
    });
    await settleEffects();

    expect(app().pumpDailyReports).toEqual([
      expect.objectContaining({ id: committedReport!.id }),
    ]);
    expect(app().pumpDailyReports[0].deliveryStatus).not.toBe('queued');
    expect(await AsyncStorage.getItem(SHIFT_REPORT_OUTBOX_STORAGE_KEY)).toBe('[]');
    expect(jest.mocked(stateApi.submitPumpReport)).toHaveBeenCalledTimes(1);
  });
});

describe('approved pump report lock', () => {
  const actions: Array<{
    name: string;
    invoke: (report: PumpDailyReport) => void;
  }> = [
    { name: 'mgrForwardPumpReport', invoke: report => app().mgrForwardPumpReport(report.id, 'Forward again') },
    { name: 'mgrResubmitPumpReport', invoke: report => app().mgrResubmitPumpReport(report.id, 'Resubmit again') },
    { name: 'mgrReturnPumpReportToAttendant', invoke: report => app().mgrReturnPumpReportToAttendant(report.id, 'Correct this') },
    { name: 'attResubmitPumpReport', invoke: report => app().attResubmitPumpReport(report.id, 'Corrected') },
    { name: 'accApprovePumpReport', invoke: report => app().accApprovePumpReport(report, 'Approve again') },
    { name: 'accRejectPumpReport', invoke: report => app().accRejectPumpReport(report.id, 'Reject again') },
    { name: 'updatePumpReport', invoke: report => app().updatePumpReport(report.id, { closingMeter: 9999, note: 'Changed' }) },
    { name: 'deletePumpReport', invoke: report => app().deletePumpReport(report.id) },
  ];

  it.each(actions)('$name cannot change or remove an approved report', async ({ invoke }) => {
    await renderProvider();
    const approvedReport = await createApprovedReport();
    const reportsBefore = app().pumpDailyReports;
    const salesBefore = app().sales;
    const auditBefore = app().audit;

    await act(async () => invoke(approvedReport));

    expect(app().pumpDailyReports).toEqual(reportsBefore);
    expect(app().sales).toEqual(salesBefore);
    expect(app().audit).toEqual(auditBefore);
  });

  it('allows only an admin to correct an approved report business date and synchronizes its sales record', async () => {
    await renderProvider();
    jest.mocked(stateApi.getAll).mockResolvedValue({});
    await act(async () => {
      expect(await app().login('admin', 'Operations Admin', 1)).toBe(true);
    });
    const approvedReport = await createApprovedReport();
    const auditBefore = app().audit.length;

    let changed = false;
    await act(async () => {
      changed = app().correctApprovedPumpReportDate(approvedReport.id, '2026-08-22');
    });

    expect(changed).toBe(true);
    expect(app().pumpDailyReports[0]).toMatchObject({
      id: approvedReport.id,
      status: 'approved',
      date: '2026-08-22',
      dateCorrectedFrom: approvedReport.date,
      dateCorrectedBy: 'Operations Admin',
    });
    expect(app().pumpDailyReports[0].dateCorrectedAt).toEqual(expect.any(String));
    expect(app().sales.find(entry => entry.shiftReportId === approvedReport.id)).toMatchObject({
      L: approvedReport.liters,
      dt: '2026-08-22',
    });
    expect(calculateStockBook(
      undefined,
      'PMS',
      'branch-1',
      [],
      app().pumpDailyReports,
      approvedReport.date,
      [{ id: approvedReport.pumpId, branchId: 'branch-1' }],
    ).sold).toBe(0);
    expect(calculateStockBook(
      undefined,
      'PMS',
      'branch-1',
      [],
      app().pumpDailyReports,
      '2026-08-22',
      [{ id: approvedReport.pumpId, branchId: 'branch-1' }],
    ).sold).toBe(approvedReport.liters);
    expect(app().audit).toHaveLength(auditBefore + 1);
    expect(app().audit[0]).toMatchObject({
      action: 'Approved pump report date corrected',
      user: 'Operations Admin',
    });
  });

  it('does not allow a non-admin to correct an approved report date', async () => {
    await renderProvider();
    const approvedReport = await createApprovedReport();

    let changed = true;
    await act(async () => {
      changed = app().correctApprovedPumpReportDate(approvedReport.id, '2026-08-22');
    });

    expect(changed).toBe(false);
    expect(app().pumpDailyReports).toEqual([approvedReport]);
  });

  it('lets an admin delete an approved wrong-date report and restores its opening meter for re-entry', async () => {
    await renderProvider();
    jest.mocked(stateApi.getAll).mockResolvedValue({});
    await act(async () => {
      expect(await app().login('admin', 'Operations Admin', 1)).toBe(true);
    });
    const approvedReport = await createApprovedReport();

    let deleted = false;
    await act(async () => {
      deleted = await app().deletePumpReport(approvedReport.id);
    });

    expect(deleted).toBe(true);
    expect(app().pumpDailyReports).toEqual([]);
    expect(app().sales.find(entry => entry.shiftReportId === approvedReport.id)).toBeUndefined();
    expect(app().pumpInitialMeters[approvedReport.pumpId]).toBe(approvedReport.openingMeter);
    expect(app().pumpLockedMeters[approvedReport.pumpId]).toBeUndefined();
    expect(stateApi.deletePumpReport).toHaveBeenCalledWith(approvedReport.id);
    expect(app().audit[0]).toMatchObject({
      action: 'Approved pump report deleted for re-entry',
      user: 'Operations Admin',
    });
  });

  it('lets admin return an approved report through accountant, manager, and attendant date correction', async () => {
    await renderProvider();
    jest.mocked(stateApi.getAll).mockResolvedValue({});
    await act(async () => {
      expect(await app().login('admin', 'Operations Admin', 1)).toBe(true);
    });
    const approvedReport = await createApprovedReport();

    let returned = false;
    await act(async () => {
      returned = app().adminReturnApprovedPumpReport(approvedReport.id, 'The report was applied to the wrong business date.');
    });
    expect(returned).toBe(true);
    expect(app().pumpDailyReports[0]).toMatchObject({
      status: 'pending_accountant',
      adminReturnedBy: 'Operations Admin',
      adminReturnNote: 'The report was applied to the wrong business date.',
    });
    expect(app().sales.find(entry => entry.shiftReportId === approvedReport.id)).toBeUndefined();

    await act(async () => {
      expect(await app().login('acc', 'Station Accountant', 2)).toBe(true);
      app().accRejectPumpReport(approvedReport.id, 'Return it to the manager for a date correction.');
    });
    expect(app().pumpDailyReports[0].status).toBe('returned');

    await act(async () => {
      expect(await app().login('mgr', 'Station Manager', 3, 'branch-1')).toBe(true);
      app().mgrReturnPumpReportToAttendant(approvedReport.id, 'Ask the attendant to use the correct operating date.');
    });
    expect(app().pumpDailyReports[0].status).toBe('returned_attendant');

    await act(async () => {
      expect(await app().login('att', approvedReport.submittedBy, 4, 'branch-1')).toBe(true);
    });
    await act(async () => {
      app().updatePumpReport(approvedReport.id, { date: '2026-08-22' });
      app().attResubmitPumpReport(approvedReport.id, 'Corrected the business date.');
    });
    expect(app().pumpDailyReports[0]).toMatchObject({
      date: '2026-08-22',
      status: 'pending_manager',
    });

    await act(async () => {
      expect(await app().login('mgr', 'Station Manager', 3, 'branch-1')).toBe(true);
    });
    await act(async () => {
      app().mgrForwardPumpReport(approvedReport.id, 'Corrected date reviewed by manager.');
    });
    await act(async () => {
      expect(await app().login('acc', 'Station Accountant', 2)).toBe(true);
    });
    await act(async () => {
      app().accApprovePumpReport(app().pumpDailyReports[0], 'Corrected report approved.');
    });
    expect(app().pumpDailyReports[0].status).toBe('approved');
    expect(app().sales.find(entry => entry.shiftReportId === approvedReport.id)).toMatchObject({
      dt: '2026-08-22',
      L: approvedReport.liters,
    });
  });
});

describe('stock book report eligibility', () => {
  it('uses an approved seed-period shift report on its applied business date', () => {
    const report = {
      ...reportWithStatus('approved'),
      date: '2026-08-14',
      submittedAt: '2026-08-15T09:00:00.000Z',
      accAt: '2026-08-15T10:00:00.000Z',
    };

    const result = calculateStockBook(
      undefined,
      'PMS',
      'branch-1',
      [],
      [report],
      '2026-08-14',
      [{ id: report.pumpId, branchId: 'branch-1' }],
    );

    expect(result.sold).toBe(50);
  });

  it('does not count a current-day shift report when calculating prior-day sales', () => {
    const priorDayReport = { ...reportWithStatus('approved'), date: '2026-08-14' };
    const currentDayReport = { ...reportWithStatus('approved'), id: 2, date: '2026-08-15' };

    const result = calculateStockBook(
      undefined,
      'PMS',
      'branch-1',
      [],
      [priorDayReport, currentDayReport],
      '2026-08-14',
      [{ id: priorDayReport.pumpId, branchId: 'branch-1' }],
    );

    expect(result.sold).toBe(50);
  });

  it('treats an incomplete delivery receipt as zero', () => {
    const result = calculateStockBook(
      {
        id: 'seed-pms',
        product: 'PMS',
        quantity: 100,
        branchId: 'branch-1',
        setBy: 'Admin',
        setAt: '2026-08-20T00:00:00.000Z',
        seedDate: '2026-08-20',
        locked: true,
      },
      'PMS',
      'branch-1',
      [{
        id: 1,
        dt: '2026-08-20',
        sup: 'Supplier',
        prod: 'PMS',
        wb: 'WB-1',
        rec: undefined as unknown as number,
        ord: 100,
        st: 'ok',
        notes: '',
        approvalStatus: 'approved',
        branchId: 'branch-1',
      }],
      [],
      '2026-08-20',
    );

    expect(result.delivered).toBe(0);
    expect(result.bookStock).toBe(100);
    expect(Number.isNaN(result.delivered)).toBe(false);
    expect(Number.isNaN(result.bookStock ?? NaN)).toBe(false);
  });

  it.each([
    ['openingMeter', undefined],
    ['openingMeter', null],
    ['openingMeter', ''],
    ['closingMeter', undefined],
    ['closingMeter', null],
    ['closingMeter', ''],
  ] as const)(
    'uses recorded litres when the %s is incomplete',
    (meterField, value) => {
      const report = reportWithStatus('approved');
      const incompleteReport = {
        ...report,
        [meterField]: value as unknown as number,
      };
      const result = calculateStockBook(
        {
          id: 'seed-pms',
          product: 'PMS',
          quantity: 100,
          branchId: 'branch-1',
          setBy: 'Admin',
          setAt: '2026-08-20T00:00:00.000Z',
          seedDate: '2026-08-20',
          locked: true,
        },
        'PMS',
        'branch-1',
        [],
        [incompleteReport],
        '2026-08-20',
      );

      expect(result.sold).toBe(50);
      expect(result.bookStock).toBe(50);
    },
  );

  it.each(['returned', 'returned_attendant'] as const)(
    'excludes a %s report from sold stock',
    status => {
      const result = calculateStockBook(
        {
          id: 'seed-pms',
          product: 'PMS',
          quantity: 100,
          branchId: 'branch-1',
          setBy: 'Admin',
          setAt: '2026-08-20T00:00:00.000Z',
          seedDate: '2026-08-20',
          locked: true,
        },
        'PMS',
        'branch-1',
        [],
        [reportWithStatus(status)],
        '2026-08-20',
      );

      expect(result.sold).toBe(0);
      expect(result.bookStock).toBe(100);
    },
  );
});

describe('pump opening meter rollover', () => {
  it('applies a report received during authenticated sync as the next opening meter', async () => {
    await renderProvider();
    const remoteReport = {
      ...reportWithStatus('pending_manager', 'Remote Attendant'),
      id: 301,
      closingMeter: 1250,
      liters: 250,
      submittedAt: '2026-08-20T12:00:00.000Z',
    };
    jest.mocked(stateApi.getAll).mockResolvedValue({ pumpDailyReports: [remoteReport] });

    await act(async () => {
      expect(await app().login('att', 'Second Attendant', 2, 'branch-1')).toBe(true);
    });

    expect(app().pumpDailyReports).toEqual([remoteReport]);
    expect(getPumpOpeningMeter(app().pumpDailyReports, remoteReport.pumpId, {}, {})).toBe(1250);
  });

  it('carries a valid pending-manager submission into the next shift', async () => {
    await renderProvider();

    const firstReport = await submitReport();
    expect(firstReport.status).toBe('pending_manager');
    expect(getLatestPumpReportForOpeningMeter([firstReport], firstReport.pumpId)).toBe(firstReport);
    expect(getPumpOpeningMeter([firstReport], firstReport.pumpId, {}, {})).toBe(firstReport.closingMeter);

    const { id: _id, status: _status, submittedAt: _submittedAt, ...secondInput } = {
      ...firstReport,
      closingMeter: 1100,
      liters: 50,
      submittedAt: undefined,
    };
    await act(async () => {
      app().submitPumpReport({
        ...secondInput,
        openingMeter: firstReport.closingMeter,
      });
    });

    expect(app().pumpDailyReports[1]).toMatchObject({
      openingMeter: firstReport.closingMeter,
      closingMeter: 1100,
      status: 'pending_manager',
    });
  });

  it('prefers the later reviewed workflow record on the same business date', () => {
    const submitted = {
      ...reportWithStatus('pending_manager'),
      id: 201,
      closingMeter: 1100,
      submittedAt: '2026-08-20T12:00:00.000Z',
      mgrAt: undefined,
      accAt: undefined,
    };
    const reviewed = {
      ...reportWithStatus('pending_accountant'),
      id: 202,
      closingMeter: 1150,
      submittedAt: '2026-08-20T09:00:00.000Z',
      mgrAt: '2026-08-20T13:00:00.000Z',
      accAt: undefined,
    };

    expect(getPumpOpeningMeter([submitted, reviewed], 'pump-1', {}, {})).toBe(1150);
  });

  it.each<PumpReportStatus>(['returned', 'returned_attendant'])(
    'does not use a %s report as the opening meter',
    status => {
      const returned = { ...reportWithStatus(status), closingMeter: 1200 };
      expect(getPumpOpeningMeter([returned], returned.pumpId, {}, { [returned.pumpId]: 1000 })).toBe(1000);
    },
  );

  it('does not let a returned replacement hide the prior usable closing meter', () => {
    const priorUsable = {
      ...reportWithStatus('pending_manager'),
      id: 204,
      date: '2026-08-19',
      closingMeter: 1100,
      submittedAt: '2026-08-19T18:00:00.000Z',
    };
    const returnedReplacement = {
      ...reportWithStatus('returned_attendant'),
      id: 205,
      date: '2026-08-20',
      openingMeter: 1100,
      closingMeter: 1200,
      submittedAt: '2026-08-20T08:00:00.000Z',
      mgrAt: '2026-08-20T12:00:00.000Z',
    };

    expect(getPumpOpeningMeter(
      mergePumpDailyReports([priorUsable], [returnedReplacement]),
      priorUsable.pumpId,
      {},
      { [priorUsable.pumpId]: 1000 },
    )).toBe(1100);
  });

  it('keeps an approved reading on a stale device when a later stale copy downgrades it', () => {
    const approved = {
      ...reportWithStatus('approved'),
      id: 206,
      closingMeter: 1300,
      accAt: '2026-08-20T12:00:00.000Z',
    };
    const stalePending = {
      ...approved,
      status: 'pending_manager' as const,
      submittedAt: '2026-08-20T13:00:00.000Z',
      accAt: undefined,
      closingMeter: 1150,
    };

    expect(mergePumpDailyReports([approved], [stalePending])).toEqual([approved]);
    expect(getPumpOpeningMeter(
      mergePumpDailyReports([approved], [stalePending]),
      approved.pumpId,
      {},
      {},
    )).toBe(1300);
  });

  it('accepts an explicit Admin return during sync instead of keeping a stale approved copy', () => {
    const approved = {
      ...reportWithStatus('approved'),
      id: 207,
      closingMeter: 1400,
      accAt: '2026-08-20T12:00:00.000Z',
    };
    const adminReturned = {
      ...approved,
      status: 'pending_accountant' as const,
      adminReturnedAt: '2026-08-20T13:00:00.000Z',
      adminReturnedBy: 'Operations Admin',
    };
    const merged = mergePumpDailyReports([approved], [adminReturned]);

    expect(merged).toEqual([adminReturned]);
    expect(getPumpOpeningMeter(merged, approved.pumpId, {}, { [approved.pumpId]: 1000 })).toBe(1400);
  });

  it('uses workflow revisions when valid returned-report transitions have older device timestamps', () => {
    const returned = {
      ...reportWithStatus('returned'),
      workflowVersion: 2,
      accAt: '2026-08-20T12:00:00.000Z',
    };
    const withAttendant = {
      ...returned,
      status: 'returned_attendant' as const,
      workflowVersion: 3,
      mgrAt: '2026-08-20T09:00:00.000Z',
    };
    const resubmitted = {
      ...withAttendant,
      status: 'pending_manager' as const,
      workflowVersion: 4,
      submittedAt: '2026-08-20T08:00:00.000Z',
    };

    expect(mergePumpDailyReports([returned], [withAttendant])).toEqual([withAttendant]);
    expect(mergePumpDailyReports([withAttendant], [resubmitted])).toEqual([resubmitted]);
  });

  it('ignores incomplete meter intervals and falls back to the configured meter', () => {
    const incomplete = {
      ...reportWithStatus('pending_manager'),
      openingMeter: undefined as unknown as number,
      closingMeter: 1200,
    };

    expect(getPumpOpeningMeter([incomplete], incomplete.pumpId, {}, { [incomplete.pumpId]: 1000 })).toBe(1000);
  });

  it('uses the selected pump’s own latest meter', () => {
    const pumpOne = { ...reportWithStatus('pending_manager'), pumpId: 'pump-1', closingMeter: 1200 };
    const pumpTwo = { ...reportWithStatus('pending_manager'), id: 203, pumpId: 'pump-2', closingMeter: 2400 };

    expect(getPumpOpeningMeter([pumpOne, pumpTwo], 'pump-1', {}, {})).toBe(1200);
    expect(getPumpOpeningMeter([pumpOne, pumpTwo], 'pump-2', {}, {})).toBe(2400);
  });
});

describe('current tank stock', () => {
  it('uses the full Uyo PMS dip total without double-counting tank counters', () => {
    const dip = {
      id: 1,
      dt: '2026-08-23',
      by: 'Operations',
      rd: {
        'tank-uyo-pms-1': 100,
        'tank-uyo-pms-2': 15_000,
        'tank-uyo-pms-3': 100,
        'tank-uyo-pms-4': 9_000,
      },
      lpg: {},
      obs: '',
      status: 'approved' as const,
    };

    const tankInputs: Array<[string, number]> = [
      ['tank-uyo-pms-1', 100],
      ['tank-uyo-pms-2', 100],
      ['tank-uyo-pms-3', 100],
      ['tank-uyo-pms-4', 11_550],
    ];
    const tanks = tankInputs.map(([id, opening]) => getCurrentTankStock({
      id,
      cap: 45_000,
      dip: 4_500,
      op: opening,
      rv: 7_500,
      sl: 763.5,
    }, [dip]));

    expect(tanks).toEqual([100, 15_000, 100, 9_000]);
    expect(tanks.reduce((total, stock) => total + stock, 0)).toBe(24_200);
  });
});

describe('daily stock log balance', () => {
  const startupSeed = {
    id: 'seed-pms',
    product: 'PMS' as const,
    quantity: 2_000,
    branchId: 'branch-1',
    setBy: 'Admin',
    setAt: '2026-08-14T00:00:00.000Z',
    seedDate: '2026-08-14',
    locked: true,
  };

  it('starts from the 14.08.2026 seed and applies same-day delivery and approved sales', () => {
    const result = calculateDailyOperationalStock(
      startupSeed,
      'PMS',
      'branch-1',
      [{
        id: 22,
        dt: '2026-08-14',
        sup: 'Supplier',
        prod: 'PMS',
        wb: 'WB-22',
        rec: 500,
        ord: 500,
        st: 'ok',
        notes: '',
        approvalStatus: 'draft',
        branchId: 'branch-1',
      }],
      [{ ...reportWithStatus('approved'), date: '2026-08-14', openingMeter: 0, closingMeter: 1_000, liters: 1_000 }],
      '2026-08-14',
      [{ id: 'pump-1', branchId: 'branch-1' }],
    );

    expect(result).toEqual({
      startupStock: 2_000,
      delivered: 500,
      sold: 1_000,
      bookStock: 1_500,
    });
  });

  it('rolls yesterday expected stock into the next opening and excludes unapproved sales', () => {
    const result = calculateDailyOperationalStock(
      startupSeed,
      'PMS',
      'branch-1',
      [{
        id: 21,
        dt: '2026-08-15',
        sup: 'Supplier',
        prod: 'PMS',
        wb: 'WB-21',
        rec: 0,
        ord: 0,
        st: 'ok',
        notes: '',
        approvalStatus: 'approved',
        branchId: 'branch-1',
      }],
      [
        { ...reportWithStatus('approved'), date: '2026-08-14', openingMeter: 0, closingMeter: 1_000, liters: 1_000 },
        { ...reportWithStatus('pending_manager'), id: 102, date: '2026-08-15', liters: 200 },
      ],
      '2026-08-15',
      [{ id: 'pump-1', branchId: 'branch-1' }],
    );

    expect(result).toEqual({
      startupStock: 1_000,
      delivered: 0,
      sold: 0,
      bookStock: 1_000,
    });
  });

  it('rolls forward across a day with no saved movements', () => {
    const result = calculateDailyOperationalStock(
      startupSeed,
      'PMS',
      'branch-1',
      [],
      [{ ...reportWithStatus('approved'), date: '2026-08-14', openingMeter: 0, closingMeter: 1_000, liters: 1_000 }],
      '2026-08-16',
      [{ id: 'pump-1', branchId: 'branch-1' }],
    );

    expect(result).toEqual({
      startupStock: 1_000,
      delivered: 0,
      sold: 0,
      bookStock: 1_000,
    });
  });

  it('uses same-day movements after the rollover opening', () => {
    const result = calculateDailyOperationalStock(
      startupSeed,
      'PMS',
      'branch-1',
      [{
        id: 23,
        dt: '2026-08-15',
        sup: 'Supplier',
        prod: 'PMS',
        wb: 'WB-23',
        rec: 300,
        ord: 300,
        st: 'ok',
        notes: '',
        approvalStatus: 'approved',
        branchId: 'branch-1',
      }],
      [{ ...reportWithStatus('approved'), date: '2026-08-14', openingMeter: 0, closingMeter: 1_000, liters: 1_000 }],
      '2026-08-15',
      [{ id: 'pump-1', branchId: 'branch-1' }],
    );

    expect(result).toEqual({
      startupStock: 1_000,
      delivered: 300,
      sold: 0,
      bookStock: 1_300,
    });
  });

  it('counts only approved same-day sales in the selected branch and product', () => {
    const result = calculateDailyOperationalStock(
      startupSeed,
      'PMS',
      'branch-1',
      [],
      [
        { ...reportWithStatus('approved'), date: '2026-08-15', openingMeter: 0, closingMeter: 300, liters: 300 },
        { ...reportWithStatus('pending_manager'), id: 102, date: '2026-08-15', liters: 200 },
        { ...reportWithStatus('returned'), id: 103, date: '2026-08-15', liters: 100 },
        { ...reportWithStatus('approved'), id: 104, date: '2026-08-15', product: 'AGO', liters: 400 },
        { ...reportWithStatus('approved'), id: 105, date: '2026-08-15', branchId: 'branch-2', liters: 500 },
      ],
      '2026-08-15',
      [{ id: 'pump-1', branchId: 'branch-1' }],
    );

    expect(result.sold).toBe(300);
    expect(result.bookStock).toBe(1_700);
  });

  it('isolates deliveries by branch and product while rolling the selected ledger', () => {
    const result = calculateDailyOperationalStock(
      startupSeed,
      'PMS',
      'branch-1',
      [
        {
          id: 31,
          dt: '2026-08-15',
          sup: 'Selected supplier',
          prod: 'PMS',
          wb: 'WB-31',
          rec: 250,
          ord: 250,
          st: 'ok',
          notes: '',
          approvalStatus: 'approved',
          branchId: 'branch-1',
        },
        {
          id: 32,
          dt: '2026-08-15',
          sup: 'Other branch',
          prod: 'PMS',
          wb: 'WB-32',
          rec: 900,
          ord: 900,
          st: 'ok',
          notes: '',
          approvalStatus: 'approved',
          branchId: 'branch-2',
        },
        {
          id: 33,
          dt: '2026-08-15',
          sup: 'Other product',
          prod: 'AGO',
          wb: 'WB-33',
          rec: 700,
          ord: 700,
          st: 'ok',
          notes: '',
          approvalStatus: 'approved',
          branchId: 'branch-1',
        },
      ],
      [],
      '2026-08-15',
      [{ id: 'pump-1', branchId: 'branch-1' }],
    );

    expect(result.delivered).toBe(250);
    expect(result.bookStock).toBe(2_250);
  });

  it('counts received delivery stock when submitted and keeps it counted after approval', () => {
    const submittedDelivery = {
      id: 24,
      ...deliveryWithStatus('pending_acc'),
      dt: '2026-08-14',
      rec: 400,
    };
    const submitted = calculateDailyOperationalStock(
      startupSeed,
      'PMS',
      'branch-1',
      [submittedDelivery],
      [],
      '2026-08-14',
      [{ id: 'pump-1', branchId: 'branch-1' }],
    );
    const approved = calculateDailyOperationalStock(
      startupSeed,
      'PMS',
      'branch-1',
      [{ ...submittedDelivery, approvalStatus: 'approved' }],
      [],
      '2026-08-14',
      [{ id: 'pump-1', branchId: 'branch-1' }],
    );
    const rejected = calculateDailyOperationalStock(
      startupSeed,
      'PMS',
      'branch-1',
      [{ ...submittedDelivery, approvalStatus: 'rejected' }],
      [],
      '2026-08-14',
      [{ id: 'pump-1', branchId: 'branch-1' }],
    );

    expect(submitted.delivered).toBe(400);
    expect(submitted.bookStock).toBe(2_400);
    expect(approved.delivered).toBe(400);
    expect(approved.bookStock).toBe(2_400);
    expect(rejected.delivered).toBe(0);
    expect(rejected.bookStock).toBe(2_000);
  });

  it('still surfaces today\'s delivered and sold totals when no admin opening baseline exists', () => {
    const result = calculateDailyOperationalStock(
      undefined,
      'PMS',
      'branch-1',
      [{
        id: 40,
        dt: '2026-08-15',
        sup: 'Supplier',
        prod: 'PMS',
        wb: 'WB-40',
        rec: 500,
        ord: 500,
        st: 'ok',
        notes: '',
        approvalStatus: 'approved',
        branchId: 'branch-1',
      }],
      [{ ...reportWithStatus('approved'), date: '2026-08-15', openingMeter: 0, closingMeter: 200, liters: 200 }],
      '2026-08-15',
      [{ id: 'pump-1', branchId: 'branch-1' }],
    );

    expect(result).toEqual({
      startupStock: null,
      delivered: 500,
      sold: 200,
      bookStock: null,
    });
  });

  it('marks a higher physical dip as excess', () => {
    const result = calculateDailyStockLogBalance(1_000, 300, 200, 1_150);

    expect(result.bookStock).toBe(1_100);
    expect(result.variance).toBe(50);
  });

  it('marks a lower physical dip as shortage', () => {
    const result = calculateDailyStockLogBalance(1_000, 300, 200, 1_050);

    expect(result.bookStock).toBe(1_100);
    expect(result.variance).toBe(-50);
  });

  it('waits for an opening quantity or current dip before calculating variance', () => {
    expect(calculateDailyStockLogBalance(null, 300, 200, 1_050)).toEqual({
      bookStock: null,
      variance: null,
    });
    expect(calculateDailyStockLogBalance(1_000, 300, 200, null)).toEqual({
      bookStock: 1_100,
      variance: null,
    });
  });
});

describe('branch performance revenue', () => {
  it('counts only sales inside the selected business month', () => {
    const result = salesRevenueByBranch([
      { id: 1, pump: 'PMS 1', by: 'Attendant', L: 100, price: 1_000, dt: '2026-08-31', branchId: 'uyo' },
      { id: 2, pump: 'PMS 1', by: 'Attendant', L: 200, price: 1_000, dt: '2026-09-01', branchId: 'uyo' },
      { id: 3, pump: 'AGO 1', by: 'Attendant', L: 50, price: 1_200, dt: '2026-09-30', branchId: 'ikot' },
      { id: 4, pump: 'PMS 1', by: 'Attendant', L: 300, price: 1_000, dt: '2026-10-01', branchId: 'uyo' },
    ], { from: '2026-09-01', to: '2026-09-30' });

    expect(result.total).toBe(260_000);
    expect(result.byBranch).toEqual({ uyo: 200_000, ikot: 60_000 });
  });
});

describe('tank dip synchronization', () => {
  const baseDip = (status: DipRecord['status'], submittedAt: string, approvedDt?: string): DipRecord => ({
    id: 501,
    dt: '2026-08-20',
    by: 'Uyo manager',
    rd: { 'tank-uyo-pms': 12000 },
    lpg: {},
    obs: '',
    status,
    submittedAt,
    approvedDt,
    branchId: 'uyo-fuel',
  });

  it('keeps an approved dip when a later stale pending copy arrives', () => {
    const approved = baseDip('approved', '2026-08-20T08:00:00.000Z', '2026-08-20T10:00:00.000Z');
    const stalePending = baseDip('pending', '2026-08-20T11:00:00.000Z');

    expect(mergeDipRecords([approved], [stalePending])).toEqual([approved]);
  });

  it('allows an approved copy to replace a pending copy', () => {
    const pending = baseDip('pending', '2026-08-20T08:00:00.000Z');
    const approved = baseDip('approved', '2026-08-20T08:00:00.000Z', '2026-08-20T10:00:00.000Z');

    expect(mergeDipRecords([pending], [approved])).toEqual([approved]);
  });

  it('keeps an earlier product dip visible when a later approved dip is for another product', () => {
    const pmsDip = baseDip('approved', '2026-08-20T08:00:00.000Z', '2026-08-20T09:00:00.000Z');
    const agoDip: DipRecord = {
      ...baseDip('approved', '2026-08-20T08:30:00.000Z', '2026-08-20T10:00:00.000Z'),
      id: 502,
      rd: { 'tank-uyo-ago': 8_000 },
    };

    expect(findLatestDipForProduct(
      [pmsDip, agoDip],
      '2026-08-20',
      'uyo-fuel',
      'PMS',
      [{ id: 'tank-uyo-pms', prod: 'PMS' }],
      [],
    )).toEqual(pmsDip);
  });

  it('uses an approved product dip when a newer pending dip exists', () => {
    const approved = baseDip('approved', '2026-08-20T08:00:00.000Z', '2026-08-20T09:00:00.000Z');
    const pending: DipRecord = {
      ...baseDip('pending', '2026-08-20T10:00:00.000Z'),
      id: 503,
      rd: { 'tank-uyo-pms': 7_500 },
    };

    expect(findLatestDipForProduct(
      [approved, pending],
      '2026-08-20',
      'uyo-fuel',
      'PMS',
      [{ id: 'tank-uyo-pms', prod: 'PMS' }],
      [],
    )).toEqual(approved);
  });

  it('uses a pending product dip so the MD can see the variance before approving', () => {
    const pending = baseDip('pending', '2026-08-20T10:00:00.000Z');

    expect(findLatestDipForProduct(
      [pending],
      '2026-08-20',
      'uyo-fuel',
      'PMS',
      [{ id: 'tank-uyo-pms', prod: 'PMS' }],
      [],
    )).toEqual(pending);
  });

  it('does not use a rejected dip as a physical stock snapshot', () => {
    const rejected = baseDip('rejected', '2026-08-20T10:00:00.000Z');

    expect(findLatestDipForProduct(
      [rejected],
      '2026-08-20',
      'uyo-fuel',
      'PMS',
      [{ id: 'tank-uyo-pms', prod: 'PMS' }],
      [],
    )).toBeUndefined();
  });

  it('does not use a product reading submitted for another branch', () => {
    const otherBranchDip: DipRecord = {
      ...baseDip('approved', '2026-08-20T08:00:00.000Z', '2026-08-20T09:00:00.000Z'),
      branchId: 'lagos-fuel',
    };

    expect(findLatestDipForProduct(
      [otherBranchDip],
      '2026-08-20',
      'uyo-fuel',
      'PMS',
      [{ id: 'tank-uyo-pms', prod: 'PMS' }],
      [],
    )).toBeUndefined();
  });

  it('does not carry an earlier approved dip into a later business day', () => {
    const priorDay = baseDip('approved', '2026-08-20T08:00:00.000Z', '2026-08-20T09:00:00.000Z');

    expect(findLatestDipForProduct(
      [priorDay],
      '2026-08-21',
      'uyo-fuel',
      'PMS',
      [{ id: 'tank-uyo-pms', prod: 'PMS' }],
      [],
    )).toBeUndefined();
  });

});

describe('attendant report resubmission', () => {
  it.each(['returned', 'returned_attendant'] as const)(
  'only allows the original attendant to resubmit a $status report',
  async status => {
    await renderProvider();
    jest.mocked(stateApi.getAll).mockResolvedValue({});

    await act(async () => {
      expect(await app().login('att', 'Another Attendant', 1, 'branch-1')).toBe(true);
    });
    const returnedReport = await createReturnedAttendantReport('Original Attendant', status);
    await act(async () => {
      app().attResubmitPumpReport(returnedReport.id, 'I should not be able to do this');
    });
    expect(app().pumpDailyReports).toEqual([returnedReport]);
    let deleted = true;
    await act(async () => {
      deleted = await app().deletePumpReport(returnedReport.id);
    });
    expect(deleted).toBe(false);
    expect(app().pumpDailyReports).toEqual([returnedReport]);

    await act(async () => {
      expect(await app().login('att', returnedReport.submittedBy, 2, 'branch-1')).toBe(true);
    });
    await act(async () => {
      app().attResubmitPumpReport(returnedReport.id, 'Corrected reading');
    });

    expect(app().pumpDailyReports[0]).toMatchObject({
      id: returnedReport.id,
      status: 'pending_manager',
      note: 'Corrected reading',
      rejectionReason: undefined,
    });
  });

  it('uses an applied business date rather than the approval timestamp', () => {
    const report = {
      ...reportWithStatus('approved'),
      date: '2026-08-19',
      submittedAt: '2026-08-20T01:15:00.000Z',
      accAt: '2026-08-20T02:00:00.000Z',
    };
    const yesterday = calculateStockBook(
      {
        id: 'seed-pms',
        product: 'PMS',
        quantity: 100,
        branchId: 'branch-1',
        setBy: 'Admin',
        setAt: '2026-08-19T00:00:00.000Z',
        seedDate: '2026-08-19',
        locked: true,
      },
      'PMS',
      'branch-1',
      [],
      [report],
      '2026-08-19',
    );
    const today = calculateStockBook(
      {
        id: 'seed-pms',
        product: 'PMS',
        quantity: 100,
        branchId: 'branch-1',
        setBy: 'Admin',
        setAt: '2026-08-19T00:00:00.000Z',
        seedDate: '2026-08-19',
        locked: true,
      },
      'PMS',
      'branch-1',
      [],
      [report],
      '2026-08-20',
      [],
      50,
    );

    expect(yesterday.sold).toBe(50);
    expect(yesterday.bookStock).toBe(50);
    expect(today.sold).toBe(0);
    expect(today.bookStock).toBe(50);
  });

  it.each<{ status: 'returned' | 'returned_attendant' }>([
    { status: 'returned' },
    { status: 'returned_attendant' },
  ])(
  'lets the original attendant edit and durably delete a $status report',
  async ({ status }) => {
    await renderProvider();
    jest.mocked(stateApi.getAll).mockResolvedValue({});
    jest.mocked(stateApi.deletePumpReport).mockResolvedValue({ ok: true });

    await act(async () => {
      expect(await app().login('att', 'Original Attendant', 1, 'branch-1')).toBe(true);
    });
    const returnedReport = await createReturnedAttendantReport('Original Attendant', status);

    await act(async () => {
      app().updatePumpReport(returnedReport.id, {
        date: '2026-08-21',
        closingMeter: 1060,
        note: 'Corrected returned report',
      });
    });
    expect(app().pumpDailyReports[0]).toMatchObject({
      date: '2026-08-21',
      closingMeter: 1060,
      note: 'Corrected returned report',
      status,
      workflowVersion: expect.any(Number),
    });

    let deleted = false;
    await act(async () => {
      deleted = await app().deletePumpReport(returnedReport.id);
    });
    expect(deleted).toBe(true);
    expect(stateApi.deletePumpReport).toHaveBeenCalledWith(returnedReport.id);
    expect(app().pumpDailyReports).toEqual([]);
  });

  it('keeps another attendant from editing or deleting a rejected report', async () => {
    await renderProvider();
    jest.mocked(stateApi.getAll).mockResolvedValue({});
    jest.mocked(stateApi.deletePumpReport).mockResolvedValue({ ok: true });

    await act(async () => {
      expect(await app().login('att', 'Original Attendant', 1, 'branch-1')).toBe(true);
    });
    const returnedReport = await createReturnedAttendantReport('Different Attendant', 'returned');
    const originalVersion = returnedReport.workflowVersion;

    await act(async () => {
      app().updatePumpReport(returnedReport.id, {
        closingMeter: 1060,
        note: 'Unauthorized edit',
      });
    });
    expect(app().pumpDailyReports[0]).toMatchObject({
      closingMeter: returnedReport.closingMeter,
      note: returnedReport.note,
      workflowVersion: originalVersion,
    });

    let deleted = true;
    await act(async () => {
      deleted = await app().deletePumpReport(returnedReport.id);
    });
    expect(deleted).toBe(false);
    expect(stateApi.deletePumpReport).not.toHaveBeenCalled();
    expect(app().pumpDailyReports).toHaveLength(1);
  });

  it('does not let an attendant re-submit a returned report dated in the future', async () => {
    await renderProvider();
    jest.mocked(stateApi.getAll).mockResolvedValue({});

    await act(async () => {
      expect(await app().login('att', 'Original Attendant', 1, 'branch-1')).toBe(true);
    });
    const returnedReport = await createReturnedAttendantReport('Original Attendant');
    await act(async () => {
      app().updatePumpReport(returnedReport.id, { date: '2099-01-01' });
    });

    let resubmitted = true;
    await act(async () => {
      resubmitted = app().attResubmitPumpReport(returnedReport.id, 'Corrected reading');
    });

    expect(resubmitted).toBe(false);
    expect(app().pumpDailyReports[0]).toMatchObject({
      id: returnedReport.id,
      date: '2099-01-01',
      status: 'returned_attendant',
    });
  });
});

describe('delivery returned and approved permissions', () => {
  it('returns an MD-rejected delivery to its originating manager for editing and deletion', async () => {
    await renderProvider();
    jest.mocked(stateApi.getAll).mockResolvedValue({});

    await act(async () => {
      expect(await app().login('mgr', 'Original Manager', 3, 'branch-1')).toBe(true);
      app().addDelivery(deliveryWithStatus('draft'));
    });
    const delivery = app().deliveries[0];
    await act(async () => {
      app().submitDeliveryForApproval(delivery.id);
      app().accForwardToMd(delivery.id, 650, 'Cost entered');
    });

    await act(async () => {
      expect(await app().login('md', 'Managing Director', 4)).toBe(true);
    });
    await act(async () => {
      app().rejectDelivery(delivery.id, 'Correct the applies-on date and receipt details.');
    });
    expect(app().deliveries[0]).toMatchObject({
      id: delivery.id,
      approvalStatus: 'returned',
      rejectedNote: 'Correct the applies-on date and receipt details.',
    });

    let updated = false;
    await act(async () => {
      expect(await app().login('mgr', 'Original Manager', 3, 'branch-1')).toBe(true);
    });
    await act(async () => {
      updated = app().updateDelivery(delivery.id, {
        dt: '2026-08-21',
        notes: 'Corrected receipt details',
        approvalStatus: 'draft',
      });
    });
    expect(updated).toBe(true);
    expect(app().deliveries[0]).toMatchObject({
      dt: '2026-08-21',
      notes: 'Corrected receipt details',
      approvalStatus: 'draft',
    });

    let deleted = false;
    await act(async () => {
      deleted = app().deleteDelivery(delivery.id);
    });
    expect(deleted).toBe(true);
    expect(app().deliveries).toEqual([]);
  });

  it('does not let another manager edit or delete a returned delivery', async () => {
    await renderProvider();
    jest.mocked(stateApi.getAll).mockResolvedValue({});

    await act(async () => {
      expect(await app().login('mgr', 'Original Manager', 3, 'branch-1')).toBe(true);
      app().addDelivery(deliveryWithStatus('returned'));
    });
    const delivery = app().deliveries[0];
    await act(async () => {
      expect(await app().login('mgr', 'Another Manager', 5, 'branch-1')).toBe(true);
    });

    let updated = true;
    let deleted = true;
    await act(async () => {
      updated = app().updateDelivery(delivery.id, { notes: 'Unauthorized edit' });
      deleted = app().deleteDelivery(delivery.id);
    });
    expect(updated).toBe(false);
    expect(deleted).toBe(false);
    expect(app().deliveries).toEqual([delivery]);
  });

  it('locks approved deliveries for edits and allows deletion only for admin', async () => {
    await renderProvider();
    jest.mocked(stateApi.getAll).mockResolvedValue({});

    await act(async () => {
      expect(await app().login('mgr', 'Original Manager', 3, 'branch-1')).toBe(true);
      app().addDelivery(deliveryWithStatus('approved'));
    });
    const delivery = app().deliveries[0];

    let updated = true;
    let deleted = true;
    await act(async () => {
      updated = app().updateDelivery(delivery.id, { notes: 'Unauthorized edit' });
      deleted = app().deleteDelivery(delivery.id);
    });
    expect(updated).toBe(false);
    expect(deleted).toBe(false);
    expect(app().deliveries).toEqual([delivery]);

    await act(async () => {
      expect(await app().login('admin', 'Operations Admin', 1)).toBe(true);
    });
    await act(async () => {
      deleted = app().deleteDelivery(delivery.id);
    });
    expect(deleted).toBe(true);
    expect(app().deliveries).toEqual([]);
  });
});

describe('future shift-report business dates', () => {
  it('recognizes future dates but allows today and earlier', () => {
    expect(isFutureBusinessDate('2026-08-28', '2026-08-27')).toBe(true);
    expect(isFutureBusinessDate('2026-08-27', '2026-08-27')).toBe(false);
    expect(isFutureBusinessDate('2026-08-26', '2026-08-27')).toBe(false);
  });

  it('rejects a future-dated new report for an attendant in shared state', async () => {
    await renderProvider();
    jest.mocked(stateApi.getAll).mockResolvedValue({});

    await act(async () => {
      expect(await app().login('att', 'Original Attendant', 1, 'branch-1')).toBe(true);
    });

    const { id: _id, status: _status, submittedAt: _submittedAt, ...input } = {
      ...reportWithStatus('pending_manager'),
      date: '2099-01-01',
      submittedBy: 'Original Attendant',
      submittedByName: 'Original Attendant',
    };
    let submitted = true;
    await act(async () => {
      submitted = app().submitPumpReport(input);
    });

    expect(submitted).toBe(false);
    expect(app().pumpDailyReports).toEqual([]);
  });
});

describe('price write validation', () => {
  it('rejects malformed direct price updates without changing prices, history, or audit', async () => {
    await renderProvider();
    await act(async () => {
      expect(await app().login('ceo', 'CEO User', 1)).toBe(true);
    });

    const pricesBefore = app().prices;
    const historyBefore = app().priceHistory;
    const auditBefore = app().audit;

    let result: ReturnType<AppState['updatePrice']>;
    let missingProduct: ReturnType<AppState['updatePrice']>;
    let missingActor: ReturnType<AppState['updatePrice']>;
    await act(async () => {
      result = app().updatePrice('PMS', Number.NaN);
      missingProduct = app().updatePrice('   ', 700);
      missingActor = app().updatePrice('PMS', 700, '   ');
    });

    expect(result!).toEqual({ ok: false, reason: 'invalid_new_price' });
    expect(missingProduct!).toEqual({ ok: false, reason: 'missing_product' });
    expect(missingActor!).toEqual({ ok: false, reason: 'missing_actor' });
    expect(app().prices).toEqual(pricesBefore);
    expect(app().priceHistory).toEqual(historyBefore);
    expect(app().audit).toEqual(auditBefore);
  });

  it('accepts valid direct price updates and records their actor and history', async () => {
    await renderProvider();
    await act(async () => {
      expect(await app().login('ceo', 'CEO User', 1)).toBe(true);
    });

    let result: ReturnType<AppState['updatePrice']>;
    await act(async () => {
      result = app().updatePrice('PMS', 700);
    });

    expect(result!).toEqual({ ok: true });
    expect(app().prices.PMS).toBe(700);
    expect(app().priceHistory[0]).toMatchObject({
      prod: 'PMS',
      oldPrice: 0,
      newPrice: 700,
      by: 'CEO User',
    });
  });

  it('rejects proposals with missing product or actor without saving them', async () => {
    await renderProvider();
    let missingActor: ReturnType<AppState['addPriceProposal']>;
    await act(async () => {
      missingActor = app().addPriceProposal('PMS', 700);
    });

    await act(async () => {
      expect(await app().login('att', 'Attendant User', 1, 'branch-1')).toBe(true);
    });

    let missingProduct: ReturnType<AppState['addPriceProposal']>;
    await act(async () => {
      missingProduct = app().addPriceProposal('   ', 700);
    });

    expect(missingProduct!).toEqual({ ok: false, reason: 'missing_product' });
    expect(missingActor!).toEqual({ ok: false, reason: 'missing_actor' });
    expect(app().priceProposals).toHaveLength(0);
  });

  it('accepts valid proposals and rejects non-finite proposed prices', async () => {
    await renderProvider();
    await act(async () => {
      expect(await app().login('att', 'Attendant User', 1, 'branch-1')).toBe(true);
    });

    let invalid: ReturnType<AppState['addPriceProposal']>;
    let valid: ReturnType<AppState['addPriceProposal']>;
    await act(async () => {
      invalid = app().addPriceProposal('PMS', Number.POSITIVE_INFINITY);
      valid = app().addPriceProposal('AGO', 850);
    });

    expect(invalid!).toEqual({ ok: false, reason: 'invalid_proposed_price' });
    expect(valid!).toEqual({ ok: true });
    expect(app().priceProposals).toHaveLength(1);
    expect(app().priceProposals[0]).toMatchObject({ prod: 'AGO', currentPrice: 0, proposedPrice: 850 });
  });
});