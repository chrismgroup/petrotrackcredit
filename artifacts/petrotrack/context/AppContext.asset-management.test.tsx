import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { stateApi } from '@/lib/api';
import { AppProvider, useApp } from './AppContext';

let capturedApp: ReturnType<typeof useApp> | null = null;
let renderer: ReactTestRenderer | null = null;

function ContextCapture() {
  capturedApp = useApp();
  return null;
}

function app(): ReturnType<typeof useApp> {
  if (!capturedApp) throw new Error('App context was not rendered');
  return capturedApp;
}

const assetInput = {
  name: 'Test Branch Generator',
  category: 'Generators' as const,
  branchId: 'B1',
  quantity: 1,
  initialCost: 1_300_000,
  endOfLifeValue: 100_000,
  usefulLifeYears: 5,
  acquiredOn: '2026-09-01',
  notes: 'Asset register flow',
};

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  capturedApp = null;
  jest.clearAllMocks();
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('allows an authorized accountant to add, edit, and delete a company asset', async () => {
  jest.mocked(stateApi.getAll).mockResolvedValue({
    userAccounts: [],
    branches: [
      { id: 'B1', name: 'Maitama Branch', st: 'Active', rev: 0, mgr: '', pumps: 0, tanks: 0 },
      { id: 'B2', name: 'Wuse Branch', st: 'Active', rev: 0, mgr: '', pumps: 0, tanks: 0 },
    ],
    companyAssets: [],
  });

  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContextCapture />
      </AppProvider>,
    );
  });
  await act(async () => {
    expect(await app().login('acc', 'Test Accountant', 7, 'B1')).toBe(true);
  });

  let added = false;
  await act(async () => {
    added = app().addCompanyAsset(assetInput);
  });
  expect(added).toBe(true);
  expect(app().companyAssets).toHaveLength(1);
  const created = app().companyAssets[0];
  expect(created).toMatchObject({
    name: assetInput.name,
    branchId: 'B1',
    category: 'Generators',
  });

  let edited = false;
  await act(async () => {
    edited = app().updateCompanyAsset(created.id, {
      ...assetInput,
      name: 'Edited Branch Generator',
      category: 'Pumps',
    });
  });
  expect(edited).toBe(true);
  expect(app().companyAssets[0]).toMatchObject({
    name: 'Edited Branch Generator',
    branchId: 'B1',
    category: 'Pumps',
  });
  expect(app().updateCompanyAsset(created.id, {
    ...assetInput,
    branchId: 'B2',
  })).toBe(false);
  expect(app().companyAssets[0].branchId).toBe('B1');

  let deleted = false;
  await act(async () => {
    deleted = app().deleteCompanyAsset(created.id);
  });
  expect(deleted).toBe(true);
  expect(app().companyAssets).toEqual([]);
});

it.each(['csm', 'mktg'] as const)('allows %s to mutate company assets', async role => {
  jest.mocked(stateApi.getAll).mockResolvedValue({
    userAccounts: [],
    branches: [
      { id: 'B1', name: 'Maitama Branch', st: 'Active', rev: 0, mgr: '', pumps: 0, tanks: 0 },
      { id: 'B2', name: 'Wuse Branch', st: 'Active', rev: 0, mgr: '', pumps: 0, tanks: 0 },
    ],
    companyAssets: [],
  });

  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContextCapture />
      </AppProvider>,
    );
  });
  await act(async () => {
    expect(await app().login(role, `Test ${role}`, 8, 'B1')).toBe(true);
  });

  await act(async () => {
    expect(app().addCompanyAsset(assetInput)).toBe(true);
  });
  const created = app().companyAssets[0];
  expect(created.branchId).toBe('B1');
  expect(app().updateCompanyAsset(created.id, { ...assetInput, branchId: 'B2' })).toBe(false);
  await act(async () => {
    expect(app().deleteCompanyAsset(created.id)).toBe(true);
  });
  expect(app().companyAssets).toEqual([]);
});

it('removes an optimistically added asset when the save and recovery both fail', async () => {
  jest.mocked(stateApi.getAll).mockResolvedValue({
    userAccounts: [],
    branches: [
      { id: 'B1', name: 'Maitama Branch', st: 'Active', rev: 0, mgr: '', pumps: 0, tanks: 0 },
    ],
    companyAssets: [],
  });
  jest.mocked(stateApi.upsertCompanyAsset).mockResolvedValue(null);
  jest.mocked(stateApi.get).mockResolvedValue(null);

  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContextCapture />
      </AppProvider>,
    );
  });
  await act(async () => {
    expect(await app().login('acc', 'Test Accountant', 7, 'B1')).toBe(true);
  });

  await act(async () => {
    expect(app().addCompanyAsset(assetInput)).toBe(true);
  });

  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(app().companyAssets).toEqual([]);
  expect(app().companyAssetSaveError?.message).toContain('was not added');
  expect(app().companyAssetSaveError?.message).toContain('unsaved entry was removed');
});

it('restores the confirmed asset after an edit cannot be saved or recovered', async () => {
  const confirmed = {
    ...assetInput,
    id: 'asset-confirmed',
    createdBy: 'Test Accountant',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedBy: 'Test Accountant',
    updatedAt: '2026-09-01T09:00:00.000Z',
    revision: 4,
  };
  jest.mocked(stateApi.getAll).mockResolvedValue({
    userAccounts: [],
    branches: [
      { id: 'B1', name: 'Maitama Branch', st: 'Active', rev: 0, mgr: '', pumps: 0, tanks: 0 },
    ],
    companyAssets: [confirmed],
  });
  jest.mocked(stateApi.upsertCompanyAsset).mockResolvedValue(null);
  jest.mocked(stateApi.get).mockResolvedValue(null);

  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContextCapture />
      </AppProvider>,
    );
  });
  await act(async () => {
    expect(await app().login('acc', 'Test Accountant', 7, 'B1')).toBe(true);
  });

  await act(async () => {
    expect(app().updateCompanyAsset(confirmed.id, {
      ...confirmed,
      name: 'Unsaved Generator Edit',
    })).toBe(true);
  });

  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(app().companyAssets).toEqual([confirmed]);
  expect(app().companyAssetSaveError?.message).toContain('were not saved');
  expect(app().companyAssetSaveError?.message).toContain('last confirmed version was restored');
});

it('refreshes the canonical server asset after a revision conflict', async () => {
  const confirmed = {
    ...assetInput,
    id: 'asset-conflict',
    createdBy: 'Test Accountant',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedBy: 'Test Accountant',
    updatedAt: '2026-09-01T09:00:00.000Z',
    revision: 2,
  };
  const serverVersion = { ...confirmed, name: 'Edited On Another Device', revision: 3 };
  jest.mocked(stateApi.getAll).mockResolvedValue({
    userAccounts: [],
    branches: [
      { id: 'B1', name: 'Maitama Branch', st: 'Active', rev: 0, mgr: '', pumps: 0, tanks: 0 },
    ],
    companyAssets: [confirmed],
  });
  jest.mocked(stateApi.upsertCompanyAsset).mockResolvedValue(null);
  jest.mocked(stateApi.get).mockResolvedValue([serverVersion]);

  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContextCapture />
      </AppProvider>,
    );
  });
  await act(async () => {
    expect(await app().login('acc', 'Test Accountant', 7, 'B1')).toBe(true);
  });

  await act(async () => {
    expect(app().updateCompanyAsset(confirmed.id, {
      ...confirmed,
      name: 'Stale Device Edit',
    })).toBe(true);
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  expect(app().companyAssets).toEqual([serverVersion]);
  expect(app().companyAssetSaveError?.message).toContain('server version');
});

it('allows branch managers to mutate only assets in their assigned branch', async () => {
  const foreignAsset = {
    ...assetInput,
    id: 'asset-foreign',
    branchId: 'B2',
    createdBy: 'Test Accountant',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedBy: 'Test Accountant',
    updatedAt: '2026-09-01T09:00:00.000Z',
    revision: 1,
  };
  jest.mocked(stateApi.getAll).mockResolvedValue({
    userAccounts: [],
    branches: [
      { id: 'B1', name: 'Maitama Branch', st: 'Active', rev: 0, mgr: '', pumps: 0, tanks: 0 },
      { id: 'B2', name: 'Wuse Branch', st: 'Active', rev: 0, mgr: '', pumps: 0, tanks: 0 },
    ],
    companyAssets: [foreignAsset],
  });
  jest.mocked(stateApi.deleteCompanyAsset).mockResolvedValue({
    ok: true,
    assets: [foreignAsset],
  });

  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContextCapture />
      </AppProvider>,
    );
  });
  await act(async () => {
    expect(await app().login('mgr', 'Test Manager', 7, 'B1')).toBe(true);
  });

  expect(app().addCompanyAsset({ ...assetInput, branchId: 'B2' })).toBe(false);
  expect(app().updateCompanyAsset(foreignAsset.id, { ...assetInput, branchId: 'B2' })).toBe(false);
  expect(app().deleteCompanyAsset(foreignAsset.id)).toBe(false);

  await act(async () => {
    expect(app().addCompanyAsset(assetInput)).toBe(true);
  });
  const created = app().companyAssets.find(value => value.branchId === 'B1');
  expect(created).toBeDefined();
  await act(async () => {
    expect(app().updateCompanyAsset(created!.id, {
      ...assetInput,
      name: 'Manager Edited Generator',
    })).toBe(true);
  });
  expect(app().updateCompanyAsset(created!.id, { ...assetInput, branchId: 'B2' })).toBe(false);
  await act(async () => {
    expect(app().deleteCompanyAsset(created!.id)).toBe(true);
  });
  expect(app().companyAssets).toEqual([foreignAsset]);
});

it('rejects company asset mutations from attendants', async () => {
  jest.mocked(stateApi.getAll).mockResolvedValue({
    userAccounts: [],
    branches: [{ id: 'B1', name: 'Maitama Branch', st: 'Active', rev: 0, mgr: '', pumps: 0, tanks: 0 }],
    companyAssets: [],
  });

  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContextCapture />
      </AppProvider>,
    );
  });
  await act(async () => {
    expect(await app().login('att', 'Test Attendant', 7, 'B1')).toBe(true);
  });

  expect(app().addCompanyAsset(assetInput)).toBe(false);
  expect(app().updateCompanyAsset('missing', assetInput)).toBe(false);
  expect(app().deleteCompanyAsset('missing')).toBe(false);
  expect(app().companyAssets).toEqual([]);
});
