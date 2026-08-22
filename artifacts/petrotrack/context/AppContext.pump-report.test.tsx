import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';

import { stateApi } from '@/lib/api';
import {
  AppProvider,
  calculateDailyOperationalStock,
  calculateDailyStockLogBalance,
  calculateStockBook,
  mergeDipRecords,
  useApp,
} from './AppContext';
import type { DipRecord, PumpDailyReport, PumpReportStatus } from './AppContext';

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

function app(): AppState {
  if (!capturedApp) throw new Error('App context was not rendered');
  return capturedApp;
}

async function renderProvider() {
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
  expect(app().pumpDailyReports).toEqual([]);
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

async function createReturnedAttendantReport(submittedBy: string) {
  const submitted = await submitReport(submittedBy);
  await act(async () => {
    app().mgrForwardPumpReport(submitted.id, 'Manager review');
  });
  await act(async () => {
    app().accRejectPumpReport(submitted.id, 'Please correct the reading');
  });
  await act(async () => {
    app().mgrReturnPumpReportToAttendant(submitted.id, 'Correct the meter reading');
  });
  const returned = app().pumpDailyReports[0];
  expect(returned.status).toBe('returned_attendant');
  return returned;
}

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  capturedApp = null;
  providerError = null;
  jest.clearAllMocks();
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
      dt: '2026-08-22',
    });
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

  it.each<PumpReportStatus>(['returned', 'returned_attendant'])(
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

describe('daily stock log balance', () => {
  it('uses only prior-day approved shift reports for the operational stock position', () => {
    const priorDayApproved = { ...reportWithStatus('approved'), date: '2026-08-14' };
    const priorDayPending = { ...reportWithStatus('pending_manager'), id: 102, date: '2026-08-14' };
    const currentDayApproved = { ...reportWithStatus('approved'), id: 103, date: '2026-08-15' };

    const result = calculateDailyOperationalStock(
      1_000,
      'PMS',
      'branch-1',
      [{
        id: 21,
        dt: '2026-08-15',
        sup: 'Supplier',
        prod: 'PMS',
        wb: 'WB-21',
        rec: 300,
        ord: 300,
        st: 'ok',
        notes: '',
        approvalStatus: 'approved',
        branchId: 'branch-1',
      }],
      [priorDayApproved, priorDayPending, currentDayApproved],
      '2026-08-15',
      [{ id: 'pump-1', branchId: 'branch-1' }],
    );

    expect(result).toEqual({
      startupStock: 1_000,
      delivered: 300,
      sold: 50,
      bookStock: 1_250,
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
});

describe('attendant report resubmission', () => {
  it('only allows the attendant who submitted the returned report to resubmit it', async () => {
    await renderProvider();
    jest.mocked(stateApi.getAll).mockResolvedValue({});

    await act(async () => {
      expect(await app().login('att', 'Another Attendant', 1, 'branch-1')).toBe(true);
    });
    const returnedReport = await createReturnedAttendantReport('Original Attendant');
    await act(async () => app().attResubmitPumpReport(returnedReport.id, 'I should not be able to do this'));
    expect(app().pumpDailyReports).toEqual([returnedReport]);

    await act(async () => {
      expect(await app().login('att', returnedReport.submittedBy, 2, 'branch-1')).toBe(true);
    });
    await act(async () => app().attResubmitPumpReport(returnedReport.id, 'Corrected reading'));

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