import React from 'react';
import { Alert } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';

import { workflowApi, stateApi } from '@/lib/api';
import { AppProvider, useApp } from './AppContext';

type AppState = ReturnType<typeof useApp>;

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
  revision: 2,
};

function serverState() {
  return {
    userAccounts: [],
    branches: [],
    expenses: [expense],
    budgets: [budget],
  };
}

beforeEach(() => {
  jest.mocked(stateApi.getAll).mockResolvedValue(serverState());
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