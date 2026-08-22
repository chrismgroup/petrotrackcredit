import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearToken, notificationsApi, stateApi } from '@/lib/api';
import { AppProvider, messageActivityMs, useApp } from './AppContext';

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

async function bootAsAdmin() {
  jest.mocked(stateApi.getAll).mockResolvedValue({ userAccounts: accounts });
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

  it('keeps role-based chat alerts in the matching staff conversation and supports read/archive state', async () => {
    await bootAsAdmin();

    await act(async () => {
      app().addSystemNotification('mgr', {
        from: 'mgr',
        to: 'admin',
        type: 'alert',
        body: 'A manager alert',
        alrt: { title: 'Operational alert', pri: 'normal', detail: 'Review required.' },
      });
    });

    expect(app().getConversation('Station Manager')).toEqual([
      expect.objectContaining({ body: 'A manager alert', read: false }),
    ]);

    await act(async () => {
      app().markRead('Station Manager');
      app().archiveConversation('Station Manager');
    });

    const [message] = app().getConversation('Station Manager');
    expect(message.read).toBe(true);
    expect(message.archivedBy).toContain('Operations Admin');
    expect(message.archiveState?.['Operations Admin']?.archived).toBe(true);

    await act(async () => {
      app().unarchiveConversation('Station Manager');
    });

    expect(app().getConversation('Station Manager')[0].archiveState?.['Operations Admin']).toMatchObject({
      archived: false,
      updatedAt: expect.any(String),
    });
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