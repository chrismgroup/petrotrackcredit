import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { stateApi } from '@/lib/api';
import {
  AppProvider,
  canViewActionItemsDashboard,
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

it('gives every signed-in role action-item dashboard access by default', () => {
  for (const role of ['admin', 'ceo', 'md', 'acc', 'csm', 'mktg', 'mgr', 'att'] as const) {
    expect(canViewActionItemsDashboard(role, 1, {})).toBe(true);
  }
  expect(canViewActionItemsDashboard('att', 1, { 1: { actionItemsDashboard: false } })).toBe(false);
});

it('only lets the assigned action party or CEO close an action item, then locks it', async () => {
  let serverItems: any[] = [];
  jest.mocked(stateApi.getAll).mockImplementation(async () => ({
    userAccounts: [],
    branches: [{ id: 'B1', name: 'Maitama Branch', st: 'Active', rev: 0, mgr: '', pumps: 0, tanks: 0 }],
    actionItems: serverItems,
  }));
  jest.mocked(stateApi.putChecked).mockImplementation(async (key, items) => {
    if (key === 'actionItems') {
      for (const item of items as any[]) serverItems = [...serverItems.filter(value => value.id !== item.id), item];
      return { ok: true, data: { actionItems: serverItems } } as any;
    }
    return { ok: true, data: {} } as any;
  });

  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContextCapture />
      </AppProvider>,
    );
  });
  await act(async () => {
    expect(await app().login('att', 'Attendant', 9, 'B1', 'attendant')).toBe(true);
  });

  let createdId = 0;
  await act(async () => {
    const created = await app().addActionItem({
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
    unauthorizedClose = await app().updateActionItemStatus(createdId, 'closed');
  });
  expect(unauthorizedClose).toBe(false);

  await act(async () => {
    await app().logout();
    expect(await app().login('ceo', 'CEO', 1, undefined, 'ceo')).toBe(true);
  });
  let ceoClose = false;
  await act(async () => {
    ceoClose = await app().updateActionItemStatus(createdId, 'closed');
  });
  expect(ceoClose).toBe(true);
  expect(app().actionItems[0]).toMatchObject({
    status: 'closed',
    archivedAt: expect.any(String),
    closedBy: 'CEO',
  });
  let reopen = true;
  await act(async () => {
    reopen = await app().updateActionItemStatus(createdId, 'open');
  });
  expect(reopen).toBe(false);
});

it('keeps failed submissions out of the visible list and retries the saved outbox', async () => {
  let serverItems: any[] = [];
  let failFirstAction = true;
  jest.mocked(stateApi.getAll).mockImplementation(async () => ({ actionItems: serverItems }));
  jest.mocked(stateApi.putChecked)
    .mockImplementation(async (key, items) => {
      if (key === 'actionItems') {
        if (failFirstAction) {
          failFirstAction = false;
          return { ok: false, error: 'Offline' } as any;
        }
        serverItems = [...serverItems, ...(items as any[])];
        return { ok: true, data: { actionItems: serverItems } } as any;
      }
      return { ok: true, data: {} } as any;
    });

  await act(async () => {
    renderer = create(<AppProvider><ContextCapture /></AppProvider>);
  });
  await act(async () => {
    expect(await app().login('csm', 'CSM', 4, undefined, 'csm')).toBe(true);
  });
  await act(async () => {
    await app().addActionItem({
      title: 'Renew licence', desc: '', actionPartyRole: 'ceo',
      actionPartyName: 'CEO', targetDate: '2026-10-10',
      branchId: 'B1', branchName: 'Maitama Branch',
    });
  });
  expect(app().actionItems).toEqual([]);
  expect(JSON.parse((await AsyncStorage.getItem('pt_action_items_outbox_v1')) ?? '[]')).toHaveLength(1);

  await act(async () => {
    expect(await app().login('csm', 'CSM', 4, undefined, 'csm')).toBe(true);
  });
  expect(app().actionItems).toMatchObject([{ title: 'Renew licence' }]);
  expect(JSON.parse((await AsyncStorage.getItem('pt_action_items_outbox_v1')) ?? '[]')).toEqual([]);
});

it('lets an individually authorized user submit despite a denied role default', async () => {
  jest.mocked(stateApi.getAll).mockResolvedValue({
    actionItems: [],
    roleAccess: { att: { actionItems: false } },
    userAccess: { 9: { actionItems: true } },
  });
  jest.mocked(stateApi.putChecked).mockImplementation(async (key, items) =>
    key === 'actionItems'
      ? { ok: true, data: { actionItems: items } } as any
      : { ok: true, data: {} } as any,
  );
  await act(async () => {
    renderer = create(<AppProvider><ContextCapture /></AppProvider>);
  });
  await act(async () => {
    expect(await app().login('att', 'Attendant', 9, 'B1', 'attendant')).toBe(true);
  });
  await act(async () => {
    expect(await app().addActionItem({
      title: 'Check stock', desc: '', actionPartyRole: 'mgr',
      actionPartyName: 'Manager', targetDate: '2026-10-10',
      branchId: 'B1', branchName: 'Maitama Branch',
    })).toMatchObject({ title: 'Check stock' });
  });
  expect(app().actionItems).toMatchObject([{ title: 'Check stock' }]);
});
