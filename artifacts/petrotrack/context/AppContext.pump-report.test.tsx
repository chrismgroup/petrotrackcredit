import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';

import { stateApi } from '@/lib/api';
import {
  AppProvider,
  calculateStockBook,
  useApp,
} from './AppContext';
import type { PumpDailyReport, PumpReportStatus } from './AppContext';

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
});

describe('stock book report eligibility', () => {
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