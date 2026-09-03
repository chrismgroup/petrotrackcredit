import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';

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
      branchId: 'B2',
      category: 'Pumps',
    });
  });
  expect(edited).toBe(true);
  expect(app().companyAssets[0]).toMatchObject({
    name: 'Edited Branch Generator',
    branchId: 'B2',
    category: 'Pumps',
  });

  let deleted = false;
  await act(async () => {
    deleted = app().deleteCompanyAsset(created.id);
  });
  expect(deleted).toBe(true);
  expect(app().companyAssets).toEqual([]);
});

it.each(['mgr', 'att', 'csm'] as const)(
  'rejects company asset mutations from unauthorized %s users',
  async role => {
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
      expect(await app().login(role, `Test ${role}`, 7, 'B1')).toBe(true);
    });

    expect(app().addCompanyAsset(assetInput)).toBe(false);
    expect(app().updateCompanyAsset('missing', assetInput)).toBe(false);
    expect(app().deleteCompanyAsset('missing')).toBe(false);
    expect(app().companyAssets).toEqual([]);
  },
);