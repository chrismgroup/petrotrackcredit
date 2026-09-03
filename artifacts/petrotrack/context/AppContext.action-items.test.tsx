import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';

import { stateApi } from '@/lib/api';
import {
  AppProvider,
  getActionItemUrgency,
  useApp,
} from './AppContext';

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

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  capturedApp = null;
  jest.clearAllMocks();
});

it('uses red for past targets, yellow for the next two weeks, and green beyond two weeks', () => {
  const now = new Date(2026, 8, 3, 12);
  expect(getActionItemUrgency('2026-09-02', now)).toBe('overdue');
  expect(getActionItemUrgency('2026-09-17', now)).toBe('due-soon');
  expect(getActionItemUrgency('2026-09-18', now)).toBe('on-track');
});

it('only lets the assigned action party or CEO close an action item, then locks it', async () => {
  jest.mocked(stateApi.getAll).mockResolvedValue({
    userAccounts: [],
    branches: [{ id: 'B1', name: 'Maitama Branch', st: 'Active', rev: 0, mgr: '', pumps: 0, tanks: 0 }],
    actionItems: [],
  });

  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContextCapture />
      </AppProvider>,
    );
  });
  await act(async () => {
    expect(await app().login('att', 'Attendant', 9, 'B1')).toBe(true);
  });

  let createdId = 0;
  await act(async () => {
    const created = app().addActionItem({
      title: 'Inspect nozzle seal',
      desc: 'Confirm the replacement is fitted.',
      actionPartyRole: 'md',
      actionPartyName: 'Managing Director',
      targetDate: '2026-09-20',
      branchId: 'B1',
      branchName: 'Maitama Branch',
    });
    createdId = created?.id ?? 0;
  });
  expect(createdId).toBeGreaterThan(0);
  let unauthorizedClose = true;
  await act(async () => {
    unauthorizedClose = app().updateActionItemStatus(createdId, 'closed');
  });
  expect(unauthorizedClose).toBe(false);

  await act(async () => {
    await app().logout();
    expect(await app().login('ceo', 'CEO', 1)).toBe(true);
  });
  let ceoClose = false;
  await act(async () => {
    ceoClose = app().updateActionItemStatus(createdId, 'closed');
  });
  expect(ceoClose).toBe(true);
  expect(app().actionItems[0]).toMatchObject({
    status: 'closed',
    archivedAt: expect.any(String),
    closedBy: 'CEO',
  });
  let reopen = true;
  await act(async () => {
    reopen = app().updateActionItemStatus(createdId, 'open');
  });
  expect(reopen).toBe(false);
});