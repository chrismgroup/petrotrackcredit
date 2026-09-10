import React from 'react';
import { Alert } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';

import { workflowApi, stateApi } from '@/lib/api';
import { AppProvider, useApp, type Budget, type Expense } from './AppContext';

type AppState = ReturnType<typeof useApp>;
const actualWorkflowApi = jest.requireActual('@/lib/api').workflowApi as typeof workflowApi;

let capturedApp: AppState | null = null;
let renderer: ReactTestRenderer | null = null;

function ContextCapture() {
  capturedApp = useApp();
  return null;
}

function app(): AppState {
  if (!capturedApp) throw new Error('App context was not rendered');
  return capturedApp;
}

const expense = {
  id: 41,
  dt: '2026-09-08',
  submittedAt: '2026-09-08T08:00:00.000Z',
  cat: 'Utilities',
  desc: 'Branch generator fuel',
  amt: 125_000,
  by: 'mgr',
  byName: 'Station Manager',
  status: 'acc_forwarded' as const,
  budgetId: 7,
  branchId: 'branch-b',
  branchName: 'Branch B',
  revision: 3,
};

const budget = {
  id: 7,
  month: 9,
  year: 2026,
  appliesOn: '2026-09-01',
  submittedAt: '2026-09-01T08:00:00.000Z',
  label: 'September 2026',
  by: 'mgr',
  byName: 'Station Manager',
  items: [{ cat: 'Operations', amt: 250_000 }],
  total: 250_000,
  status: 'acc_forwarded',
  workflow: [],
  branchId: 'branch-b',
  branchName: 'Branch B',
  revision: 2,
};

let currentServerExpenses: Expense[] = [expense];
let currentServerBudgets: Budget[] = [budget];

function serverState() {
  return {
    userAccounts: [],
    branches: [],
    expenses: currentServerExpenses,
    budgets: currentServerBudgets,
  };
}

beforeEach(() => {
  currentServerExpenses = [expense];
  currentServerBudgets = [budget];
  jest.mocked(stateApi.getAll).mockImplementation(async () => serverState());
  jest.mocked(workflowApi.expenses.transition).mockResolvedValue({
    error: 'This expense was already approved by another reviewer.',
    status: 409,
  } as any);
  jest.mocked(workflowApi.budgets.transition).mockResolvedValue({
    error: 'This budget was already rejected by another reviewer.',
    status: 409,
  } as any);
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  capturedApp = null;
  jest.clearAllMocks();
});

async function mountAndLogin() {
  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContextCapture />
      </AppProvider>,
    );
  });
  await act(async () => {
    expect(await app().login('md', 'Managing Director', 12, 'branch-a')).toBe(true);
  });
}

it('surfaces an expense rejection reason and refreshes from the server', async () => {
  await mountAndLogin();
  const syncCallsAfterLogin = jest.mocked(stateApi.getAll).mock.calls.length;

  await act(async () => {
    app().rejectExpense(41);
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  expect(Alert.alert).toHaveBeenCalledWith(
    'Unable to save',
    expect.stringContaining('This expense was already approved by another reviewer.'),
  );
  expect(jest.mocked(stateApi.getAll).mock.calls.length).toBeGreaterThan(syncCallsAfterLogin);
  expect(app().expenses).toEqual([expense]);
});

it('surfaces a budget rejection reason and refreshes from the server', async () => {
  await mountAndLogin();
  const syncCallsAfterLogin = jest.mocked(stateApi.getAll).mock.calls.length;

  await act(async () => {
    app().rejectBudget(7, 'Conflict found');
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  expect(Alert.alert).toHaveBeenCalledWith(
    'Unable to save',
    expect.stringContaining('This budget was already rejected by another reviewer.'),
  );
  expect(jest.mocked(stateApi.getAll).mock.calls.length).toBeGreaterThan(syncCallsAfterLogin);
  expect(app().budgets).toEqual([budget]);
});

it('applies a successful accountant forward and keeps the expense forwarded after a fresh sync', async () => {
  const pendingExpense: Expense = { ...expense, status: 'pending' };
  const forwardedExpense: Expense = { ...pendingExpense, status: 'acc_forwarded', revision: 4 };
  currentServerExpenses = [pendingExpense];
  jest.mocked(workflowApi.expenses.transition).mockImplementationOnce(async () => {
    currentServerExpenses = [forwardedExpense];
    return { record: forwardedExpense };
  });

  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContextCapture />
      </AppProvider>,
    );
  });
  await act(async () => {
    expect(await app().login('acc', 'Accountant', 13, 'branch-a')).toBe(true);
  });

  await act(async () => {
    expect(await app().forwardExpenseToMDConfirmed(41, 'Reviewed')).toEqual({ ok: true });
  });
  expect(app().expenses).toEqual([forwardedExpense]);

  await act(async () => {
    expect(await app().login('acc', 'Accountant', 13, 'branch-a')).toBe(true);
  });
  expect(app().expenses).toEqual([forwardedExpense]);
});

it('applies a successful branch-assigned executive approval and keeps the expense approved after a fresh sync', async () => {
  const forwardedExpense: Expense = { ...expense, status: 'acc_forwarded' };
  const approvedExpense: Expense = {
    ...forwardedExpense,
    status: 'approved' as const,
    approvedBy: 'Managing Director',
    approvedDt: '2026-09-08T12:00:00.000Z',
    revision: 4,
  };
  currentServerExpenses = [forwardedExpense];
  jest.mocked(workflowApi.expenses.transition).mockImplementationOnce(async () => {
    currentServerExpenses = [approvedExpense];
    return { record: approvedExpense };
  });

  await mountAndLogin();
  await act(async () => {
    expect(await app().approveExpenseConfirmed(41)).toEqual({ ok: true });
  });
  expect(app().expenses).toEqual([approvedExpense]);

  await act(async () => {
    expect(await app().login('md', 'Managing Director', 12, 'branch-a')).toBe(true);
  });
  expect(app().expenses).toEqual([approvedExpense]);
});

it('applies a successful accountant budget forward and keeps it forwarded after a fresh sync', async () => {
  const submittedBudget: Budget = { ...budget, status: 'submitted' };
  const forwardedBudget: Budget = { ...submittedBudget, status: 'acc_forwarded', revision: 3 };
  currentServerBudgets = [submittedBudget];
  jest.mocked(workflowApi.budgets.transition).mockImplementationOnce(async () => {
    currentServerBudgets = [forwardedBudget];
    return { record: forwardedBudget };
  });

  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContextCapture />
      </AppProvider>,
    );
  });
  await act(async () => {
    expect(await app().login('acc', 'Accountant', 13, 'branch-a')).toBe(true);
  });

  await act(async () => {
    app().forwardBudget(7, 'Reviewed');
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(app().budgets).toEqual([forwardedBudget]);

  await act(async () => {
    expect(await app().login('acc', 'Accountant', 13, 'branch-a')).toBe(true);
  });
  expect(app().budgets).toEqual([forwardedBudget]);
});

it('applies a successful branch-assigned executive budget approval and keeps it approved after a fresh sync', async () => {
  const forwardedBudget: Budget = { ...budget, status: 'acc_forwarded' };
  const approvedBudget: Budget = {
    ...forwardedBudget,
    status: 'fully_approved',
    workflow: [{ stage: 'md', by: 'Managing Director', role: 'md', dt: '2026-09-08T12:00:00.000Z', action: 'approve', note: 'Approved' }],
    revision: 3,
  };
  currentServerBudgets = [forwardedBudget];
  jest.mocked(workflowApi.budgets.transition).mockImplementationOnce(async () => {
    currentServerBudgets = [approvedBudget];
    return { record: approvedBudget };
  });

  await mountAndLogin();
  await act(async () => {
    app().approveBudget(7, 'Approved');
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(app().budgets).toEqual([approvedBudget]);

  await act(async () => {
    expect(await app().login('md', 'Managing Director', 12, 'branch-a')).toBe(true);
  });
  expect(app().budgets).toEqual([approvedBudget]);
});

describe('finance transition response contracts', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    {
      name: 'forwards an expense',
      request: () => actualWorkflowApi.expenses.transition<Expense>(
        41,
        'forward',
        { expectedRevision: 3, idempotencyKey: 'expense-forward-41' },
      ),
      record: { ...expense, status: 'acc_forwarded' as const, revision: 4 },
    },
    {
      name: 'approves an expense',
      request: () => actualWorkflowApi.expenses.transition<Expense>(
        41,
        'approve',
        { expectedRevision: 3, idempotencyKey: 'expense-approve-41' },
      ),
      record: {
        ...expense,
        status: 'approved' as const,
        approvedBy: 'Managing Director',
        approvedDt: '2026-09-08T12:00:00.000Z',
        revision: 4,
      },
    },
  ])('$name with the canonical record, status, and revision', async ({ request, record }) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ record }),
    } as Response);

    const result = await request();

    expect(result).toEqual({ record });
    expect(result?.record).toEqual(record);
    expect(result?.record.status).toBe(record.status);
    expect(result?.record.revision).toBe(record.revision);
  });

  it.each([
    {
      name: 'forwards a budget',
      request: () => actualWorkflowApi.budgets.transition<Budget>(
        7,
        'forward',
        'Reviewed',
        { expectedRevision: 2, idempotencyKey: 'budget-forward-7' },
      ),
      record: { ...budget, status: 'acc_forwarded', revision: 3 },
    },
    {
      name: 'approves a budget',
      request: () => actualWorkflowApi.budgets.transition<Budget>(
        7,
        'approve',
        'Approved',
        { expectedRevision: 2, idempotencyKey: 'budget-approve-7' },
      ),
      record: {
        ...budget,
        status: 'fully_approved',
        workflow: [{
          stage: 'md',
          by: 'Managing Director',
          role: 'md',
          dt: '2026-09-08T12:00:00.000Z',
          action: 'approve',
          note: 'Approved',
        }],
        revision: 3,
      },
    },
  ])('$name with the canonical record, status, and revision', async ({ request, record }) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ record }),
    } as Response);

    const result = await request();

    expect(result).toEqual({ record });
    expect(result?.record).toEqual(record);
    expect(result?.record.status).toBe(record.status);
    expect(result?.record.revision).toBe(record.revision);
  });
});