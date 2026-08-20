import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

import { safeNum, safeStr } from '@/lib/report-helpers';

jest.mock('react-native', () => {
  const React = require('react');
  const primitive = (name: string) => ({ children, ...props }: any) =>
    React.createElement(name, props, children);

  return {
    Alert: { alert: jest.fn() },
    Image: primitive('Image'),
    ScrollView: primitive('ScrollView'),
    StyleSheet: {
      create: (styles: unknown) => styles,
      hairlineWidth: 1,
    },
    Text: primitive('Text'),
    TextInput: primitive('TextInput'),
    TouchableOpacity: primitive('TouchableOpacity'),
    View: primitive('View'),
  };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-file-system/legacy', () => ({}));

jest.mock('@/components/AppliedDateField', () => ({
  AppliedDateField: () => null,
}));

jest.mock('@/components/FormSheet', () => ({
  ModalSheet: () => null,
}));

jest.mock('@/components/ScreenLayout', () => {
  const React = require('react');
  return {
    ScreenLayout: ({ children }: any) =>
      React.createElement('ScreenLayout', null, children),
  };
});

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#fff',
    surface: '#f7f7f5',
    border: '#ddd',
    inputBorder: '#ccc',
    text: '#111',
    textMuted: '#666',
    textSubtle: '#999',
    primary: '#1a6e3c',
    teal: '#0f6e56',
    error: '#a32d2d',
    warning: '#ba7517',
    amber: '#ba7517',
  }),
}));

jest.mock('@/context/AppContext', () => ({
  DEFAULT_MGR_PERMS: {
    canDip: true,
    canSales: true,
    canExpenses: true,
    canMaintenance: true,
    canBudget: true,
    canChat: true,
    canPetrolTanks: true,
    canLpgTanks: true,
  },
  ROLE_COLORS: {
    admin: '#633806',
    acc: '#185fa5',
    csm: '#7b3fa8',
    mgr: '#1a6e3c',
    md: '#4527a0',
  },
  ROLE_LABELS: {
    admin: 'Admin',
    acc: 'Accountant',
    csm: 'Corp. Services',
    mgr: 'Manager',
    md: 'Managing Director',
  },
  calculateStockBook: () => ({
    startupStock: null,
    delivered: 0,
    sold: 0,
    bookStock: null,
  }),
  dipReadingToLiters: (reading: number) => reading,
  fmt: (value: number) => `₦${value.toLocaleString()}`,
  fmtDate: (value: string) => value || '—',
  fmtDateTime: (value: string) => value || '—',
  getCurrentTankStock: () => 0,
  getPriceForProduct: () => 0,
  previousBusinessDateKey: () => '2026-08-19',
  useBusinessDateKey: () => '2026-08-20',
  useApp: jest.fn(),
}));

import ReceivingScreen from '../app/(app)/receiving';
import TanksScreen from '../app/(app)/tanks';
import HRScreen from '../app/(app)/hr';
import { useApp } from '@/context/AppContext';

const mockedUseApp = jest.mocked(useApp);

function renderedText(renderer: ReactTestRenderer): string {
  const textContent = (node: ReactTestInstance): string =>
    node.children
      .map(child =>
        typeof child === 'string' || typeof child === 'number'
          ? String(child)
          : textContent(child as ReactTestInstance),
      )
      .join('');

  return renderer.root
    .findAll(node => String(node.type) === 'Text')
    .map(textContent)
    .join(' ');
}

function expectScreenToRender(element: React.ReactElement, expectedText: string) {
  let renderer: ReactTestRenderer | null = null;
  expect(() => {
    act(() => {
      renderer = create(element);
    });
  }).not.toThrow();
  const mounted = renderer as unknown as ReactTestRenderer;
  expect(renderedText(mounted)).toContain(expectedText);
  act(() => mounted.unmount());
}

function baseAppState() {
  return {
    role: 'acc',
    userName: 'Test Accountant',
    branchId: 'branch-1',
    tanks: [],
    lpgTanks: [],
    dips: [],
    deliveries: [],
    prices: {},
    branches: [],
    pumps: [],
    pumpDailyReports: [],
    startupStocks: [],
    deliveryEvidences: [],
    addDeliveryEvidence: jest.fn(),
    addDelivery: jest.fn(),
    updateDelivery: jest.fn(),
    deleteDelivery: jest.fn(),
    submitDeliveryForApproval: jest.fn(),
    accForwardToMd: jest.fn(),
    accRecallDelivery: jest.fn(),
    approveDelivery: jest.fn(),
    rejectDelivery: jest.fn(),
    sales: [],
    sendMessage: jest.fn(),
    addDip: jest.fn(),
    updateDip: jest.fn(),
    deleteDip: jest.fn(),
    approveDip: jest.fn(),
    rejectDip: jest.fn(),
    mgrPerms: {},
    removeHREmployee: jest.fn(),
    enrollStaff: jest.fn(),
    approveUserAccount: jest.fn(),
    updateEnrollmentData: jest.fn(),
    rejectUserAccount: jest.fn(),
    rejectEnrollmentWithReason: jest.fn(),
    resubmitEnrollment: jest.fn(),
    deleteUserAccount: jest.fn(),
    uploadHRDocFile: jest.fn(),
    approveHRUpload: jest.fn(),
    addHRRecommendation: jest.fn(),
    resolveHRRecommendation: jest.fn(),
    addHRHandbook: jest.fn(),
    approveHRHandbook: jest.fn(),
    forwardOnboardingForApproval: jest.fn(),
    approveOnboarding: jest.fn(),
    addGeneratedLetter: jest.fn(),
    hrEmployees: [],
    hrRecommendations: [],
    hrHandbooks: [],
    userAccounts: [],
  };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('screens tolerate incomplete synced records', () => {
  it('renders receiving with a missing received quantity and cost price', () => {
    mockedUseApp.mockReturnValue({
      ...baseAppState(),
      deliveries: [{
        id: 1,
        dt: '2026-08-20',
        sup: 'Incomplete Supplier',
        prod: 'PMS',
        wb: 'WB-1',
        ord: 100,
        rec: undefined,
        st: 'ok',
        notes: '',
        approvalStatus: 'pending_md',
        costPrice: null,
      }],
      role: 'md',
      prices: { PMS: 700 },
    } as any);

    expectScreenToRender(<ReceivingScreen />, 'Incomplete Supplier');
    expectScreenToRender(
      <ReceivingScreen />,
      `Received: ${safeNum(undefined).toLocaleString()}L`,
    );
  });

  it('renders tanks with an incomplete numeric tank record', () => {
    mockedUseApp.mockReturnValue({
      ...baseAppState(),
      role: 'mgr',
      tanks: [{
        id: 'tank-1',
        name: 'Tank with missing capacity',
        prod: 'PMS',
        cap: undefined,
        dip: undefined,
        op: undefined,
        rv: undefined,
        sl: undefined,
      }],
    } as any);

    expectScreenToRender(<TanksScreen />, 'Tank with missing capacity');
    expectScreenToRender(
      <TanksScreen />,
      `Capacity: ${safeNum(undefined).toLocaleString()}L`,
    );
  });

  it('renders HR with an employee whose string fields are missing', () => {
    mockedUseApp.mockReturnValue({
      ...baseAppState(),
      role: 'csm',
      hrEmployees: [{
        id: 1,
        empId: 'EMP-MISSING-FIELDS',
        serial: 1,
        name: null,
        role: null,
        dept: null,
        phone: null,
        email: null,
        address: null,
        dob: null,
        joinDate: null,
        nextOfKin: null,
        status: 'active',
        docs: [],
        uploads: [],
        onboarding: undefined,
        letters: [],
      }],
    } as any);

    expect(safeStr(null)).toBe('—');
    expectScreenToRender(<HRScreen />, 'EMP-MISSING-FIELDS');
  });
});