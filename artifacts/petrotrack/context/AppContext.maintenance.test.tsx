import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';

import { maintenanceApi, notificationsApi, stateApi, type MaintenanceWorkflowRecord } from '@/lib/api';
import { AppProvider, FULL_NAV_CATALOG, useApp, type MaintenanceItem } from './AppContext';

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

const submitted: MaintenanceWorkflowRecord = {
  id: 41,
  taskId: 'MNT-2026-ABC12345',
  title: 'Replace pump display',
  pri: 'Urgent',
  by: 'requester',
  date: '2026-09-01',
  submittedAt: '2026-09-01T08:00:00.000Z',
  submittedBy: 'requester',
  submittedByName: 'Requester',
  status: 'pending',
  st: 'Open',
  history: [{
    id: 'history-1',
    action: 'Request submitted',
    actor: 'requester',
    at: '2026-09-01T08:00:00.000Z',
  }],
};

const acknowledged: MaintenanceWorkflowRecord = {
  ...submitted,
  status: 'open',
  acknowledgedBy: 'md-user',
  acknowledgedAt: '2026-09-01T08:05:00.000Z',
  receivedBy: 'md-user',
  receivedAt: '2026-09-01T08:05:00.000Z',
  history: [
    ...submitted.history,
    {
      id: 'history-2',
      action: 'Receipt acknowledged',
      actor: 'md-user',
      detail: 'Acknowledgement sent to the submitter.',
      at: '2026-09-01T08:05:00.000Z',
    },
  ],
};

const assigned: MaintenanceWorkflowRecord = {
  ...acknowledged,
  assignedTo: 'attendant',
  assignedToName: 'Assigned Attendant',
  assignedBy: 'md-user',
  assignedAt: '2026-09-01T08:06:00.000Z',
  history: [
    ...acknowledged.history,
    {
      id: 'history-3',
      action: 'Task assigned',
      actor: 'md-user',
      detail: 'Assigned to Assigned Attendant.',
      at: '2026-09-01T08:06:00.000Z',
    },
  ],
};

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  capturedApp = null;
  jest.clearAllMocks();
});

it('makes maintenance available as its own permission for every non-admin staff role', () => {
  expect(FULL_NAV_CATALOG).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'maint', label: 'Maintenance' }),
  ]));
});

it('keeps the server task ID and handoff history through the requester and assignee actions', async () => {
  jest.mocked(stateApi.getAll).mockResolvedValue({
    userAccounts: [],
    maintenance: [],
  });
  jest.mocked(maintenanceApi.create).mockResolvedValue({ maintenance: submitted });
  jest.mocked(maintenanceApi.acknowledge).mockResolvedValue({ maintenance: acknowledged });
  jest.mocked(maintenanceApi.assign).mockResolvedValue({ maintenance: assigned });
  jest.mocked(maintenanceApi.updateStatus)
    .mockResolvedValueOnce({ maintenance: { ...assigned, status: 'commenced' } })
    .mockResolvedValueOnce({ maintenance: { ...assigned, status: 'done', st: 'Done' } });
  jest.mocked(notificationsApi.list).mockResolvedValue([{
    id: 7,
    username: 'requester',
    type: 'report_update',
    title: 'Maintenance request received',
    body: 'MNT-2026-ABC12345 has been acknowledged by md-user.',
    data: { route: '/(app)/maintenance', taskId: submitted.taskId },
    read: false,
    createdAt: '2026-09-01T08:05:00.000Z',
  }]);

  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContextCapture />
      </AppProvider>,
    );
  });
  await act(async () => {
    expect(await app().login('att', 'Assigned Attendant', 9)).toBe(true);
  });

  let created: MaintenanceItem | null = null;
  await act(async () => {
    created = await app().addMaintenance({
      title: submitted.title,
      pri: submitted.pri,
      date: submitted.date,
    });
  });
  expect(created).toMatchObject({ taskId: submitted.taskId });
  expect(app().maintenance[0]).toMatchObject({ taskId: submitted.taskId });

  await act(async () => {
    expect(await app().acknowledgeMaintenance(submitted.taskId!)).toBe(true);
    expect(await app().assignMaintenance(submitted.taskId!, 'attendant')).toBe(true);
    expect(await app().updateMaintenanceStatus(submitted.taskId!, 'commenced')).toBe(true);
    expect(await app().updateMaintenanceStatus(submitted.taskId!, 'done')).toBe(true);
    await app().refreshNotifications();
  });

  expect(maintenanceApi.acknowledge).toHaveBeenCalledWith(submitted.taskId);
  expect(maintenanceApi.assign).toHaveBeenCalledWith(submitted.taskId, 'attendant');
  expect(maintenanceApi.updateStatus).toHaveBeenNthCalledWith(1, submitted.taskId, 'commenced');
  expect(maintenanceApi.updateStatus).toHaveBeenNthCalledWith(2, submitted.taskId, 'done');
  expect(app().notifications).toEqual(expect.arrayContaining([
    expect.objectContaining({ title: 'Maintenance request received', data: expect.objectContaining({ taskId: submitted.taskId }) }),
  ]));
});

it('replaces the local request with the server history after a fresh authenticated sync', async () => {
  const reloaded: MaintenanceWorkflowRecord = { ...assigned, status: 'done', st: 'Done' };
  jest.mocked(stateApi.getAll).mockResolvedValue({
    userAccounts: [],
    maintenance: [reloaded],
  });

  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContextCapture />
      </AppProvider>,
    );
  });
  await act(async () => {
    expect(await app().login('att', 'Assigned Attendant', 9)).toBe(true);
  });

  expect(app().maintenance).toEqual([reloaded]);
  expect(app().maintenance[0].history).toHaveLength(3);
  expect(app().maintenance[0].status).toBe('done');
});