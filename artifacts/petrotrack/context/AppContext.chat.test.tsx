import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearToken, notificationsApi, stateApi } from '@/lib/api';
import { AppProvider, chatKey, messageActivityMs, useApp } from './AppContext';

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

const accounts = [
  {
    id: 1, username: 'ops-admin', empName: 'Operations Admin', role: 'admin' as const,
    status: 'active' as const, empId: 'EMP-001', jobTitle: 'Administrator',
  },
  {
    id: 2, username: 'station-manager', empName: 'Station Manager', role: 'mgr' as const,
    status: 'active' as const, empId: 'EMP-002', jobTitle: 'Station Manager',
  },
];

async function bootAsAdmin(state: Record<string, unknown> = {}) {
  jest.mocked(stateApi.getAll).mockResolvedValue({ userAccounts: accounts, ...state });
  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContextCapture />
      </AppProvider>,
    );
  });
  await act(async () => {
    expect(await app().login('admin', 'Operations Admin', 1)).toBe(true);
  });
}

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  capturedApp = null;
  jest.clearAllMocks();
});

describe('persistent chats stay separate from reports notifications', () => {
  it('stores a direct message with a stable activity timestamp without sending a notification', async () => {
    await bootAsAdmin();

    await act(async () => {
      app().sendMessage('Station Manager', {
        to: 'Station Manager',
        type: 'txt',
        body: 'Please review today’s report.',
      });
    });

    const conversation = app().getConversation('Station Manager');
    expect(conversation).toHaveLength(1);
    expect(conversation[0]).toMatchObject({
      from: 'Operations Admin',
      to: 'Station Manager',
      body: 'Please review today’s report.',
      read: false,
      createdAt: expect.any(String),
    });
    expect(notificationsApi.send).not.toHaveBeenCalled();
  });

  it('routes a workflow alert to the notification inbox instead of Chats', async () => {
    await AsyncStorage.removeItem('messages');
    await bootAsAdmin();

    await act(async () => {
      app().addBudget({
        month: 9,
        year: 2026,
        label: 'September operations',
        by: 'admin',
        byName: 'Operations Admin',
        items: [{ cat: 'Fuel', amt: 100000 }],
        total: 100000,
        status: 'submitted',
      });
    });

    expect(notificationsApi.send).toHaveBeenCalledWith(expect.objectContaining({
      target: 'acc',
      type: 'operational',
      title: 'Budget Awaiting Accountant Review',
      data: expect.objectContaining({
        route: '/(app)/budget',
        budgetId: expect.any(Number),
      }),
    }));
    expect(app().getConversation('Station Manager')).toEqual([]);
  });

  it('keeps legacy role-based alerts out of Chats and unread message counts', async () => {
    await AsyncStorage.removeItem('messages');
    const legacyAlert = {
      id: 901,
      from: 'mgr',
      to: 'admin',
      type: 'alert' as const,
      body: 'A manager alert',
      alrt: { title: 'Operational alert', pri: 'normal', detail: 'Review required.' },
      ts: '12:00',
      read: false,
    };
    await bootAsAdmin({ messages: { [chatKey('admin', 'mgr')]: [legacyAlert] } });

    expect(app().getConversation('Station Manager')).toEqual([]);
    expect(app().unreadCount()).toBe(0);
  });

  it('orders messages by their full activity timestamp, falling back to the message ID for legacy records', () => {
    expect(messageActivityMs({ id: 10, createdAt: '2026-08-20T10:00:00.000Z' }))
      .toBeLessThan(messageActivityMs({ id: 1, createdAt: '2026-08-21T10:00:00.000Z' }));
    expect(messageActivityMs({ id: 999 })).toBe(999);
  });

  it('cleans up the old session before safely persisting the next login', async () => {
    await bootAsAdmin();
    jest.clearAllMocks();
    const order: string[] = [];
    jest.mocked(notificationsApi.unregisterToken).mockImplementation(async () => {
      order.push('unregister');
      return { ok: true };
    });
    jest.mocked(clearToken).mockImplementation(async () => {
      order.push('clear-token');
    });
    jest.mocked(AsyncStorage.removeItem).mockImplementation(async (key: string) => {
      if (key === 'auth' || key === 'messages') order.push(`remove-${key}`);
    });
    jest.mocked(AsyncStorage.setItem).mockImplementation(async (key: string) => {
      if (key === 'auth') order.push('save-new-auth');
    });

    await act(async () => {
      await app().logout();
      expect(order).toEqual(['unregister', 'clear-token', 'remove-auth', 'remove-messages']);
      expect(await app().login('admin', 'Operations Admin', 1)).toBe(true);
    });

    expect(notificationsApi.unregisterToken).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['unregister', 'clear-token', 'remove-auth', 'remove-messages', 'save-new-auth']);
  });
});