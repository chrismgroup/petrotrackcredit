import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { Alert } from 'react-native';

import type { CompanyAsset } from '@/lib/asset-depreciation';
import { useApp } from '@/context/AppContext';
import AssetManagementScreen from '../app/(app)/asset-management';
import { FinancialStatusCard } from '@/components/FinancialStatusCard';
import ReportsScreen from '../app/(app)/reports';
import ReportViewScreen from '../app/(app)/reports/view';
import { Header } from '@/components/Header';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
let mockRouteParams: Record<string, string> = { type: 'pnl' };
let mockPathname = '/reports';

jest.mock('react-native', () => {
  const React = require('react');
  const primitive = (name: string) => ({ children, ...props }: any) =>
    React.createElement(name, props, children);

  return {
    Alert: { alert: jest.fn() },
    Modal: primitive('Modal'),
    Platform: { OS: 'web', select: (options: Record<string, unknown>) => options.web ?? options.default ?? options.native },
    TurboModuleRegistry: { get: jest.fn(() => null), getEnforcing: jest.fn(() => null) },
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
jest.mock('expo-print', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => mockRouteParams),
  usePathname: jest.fn(() => mockPathname),
  useRouter: jest.fn(() => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  })),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/components/AppliedDateField', () => {
  const React = require('react');
  return {
    AppliedDateField: ({ value, onChange }: any) =>
      React.createElement(
        'TouchableOpacity',
        { testID: 'report-business-date', onPress: () => onChange('2026-09-15') },
        React.createElement('Text', null, value || 'Select the date this record applies to'),
      ),
  };
});

jest.mock('@/components/KeyboardAwareScrollViewCompat', () => {
  const React = require('react');
  return {
    KeyboardAwareScrollViewCompat: ({ children, ...props }: any) =>
      React.createElement('KeyboardAwareScrollViewCompat', props, children),
  };
});

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
    card: '#f0f3f1',
    border: '#ddd',
    inputBorder: '#ccc',
    text: '#111',
    textMuted: '#666',
    textSubtle: '#999',
    primary: '#1a6e3c',
    teal: '#0f6e56',
    blue: '#185fa5',
    purple: '#633806',
    success: '#27500a',
    error: '#a32d2d',
    warning: '#ba7517',
    amber: '#ba7517',
  }),
}));

jest.mock('@/context/AppContext', () => ({
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
    md: 'Managing Director',
  },
  UINFO: {
    admin: { initials: 'AD', name: 'Admin' },
    acc: { initials: 'AC', name: 'Accountant' },
    md: { initials: 'MD', name: 'Managing Director' },
  },
  SCREEN_ROUTES: {
    home: '/(app)/home',
    jobs: '/(app)/jobs',
    messages: '/(app)/messages',
    corp: '/(app)/corporate',
    profile: '/(app)/profile',
    notifications: '/(app)/notifications',
  },
  businessDateKey: (value?: string) => String(value ?? '').slice(0, 10),
  calculateAccountsReceivable: () => 0,
  calculateBusinessMonthRevenue: () => 1_000_000,
  calendarMonthBusinessDateRange: () => ({
    from: '2026-09-01',
    to: '2026-09-30',
  }),
  fmt: (value: number) => `₦${Math.round(value).toLocaleString()}`,
  fmtDate: (value: string) => value || '—',
  fmtDateTime: (value: string) => value || '—',
  getCurrentTankStock: () => 0,
  getPriceForProduct: () => 0,
  isRevenueReportStatus: () => true,
  useApp: jest.fn(),
}));

jest.mock('@/lib/report-helpers', () => {
  const actual = jest.requireActual('@/lib/report-helpers');
  return {
    ...actual,
    computePumpReportCOGS: jest.fn(() => 0),
  };
});

const mockedUseApp = jest.mocked(useApp);

const branchA = { id: 'branch-a', name: 'Maitama Branch', st: 'Active' };
const branchB = { id: 'branch-b', name: 'Wuse Branch', st: 'Active' };

function asset(overrides: Partial<CompanyAsset> = {}): CompanyAsset {
  return {
    id: 'asset-generator',
    name: 'Branch Generator',
    category: 'Generators',
    branchId: branchA.id,
    quantity: 1,
    initialCost: 1_300_000,
    endOfLifeValue: 100_000,
    usefulLifeYears: 5,
    acquiredOn: '2026-01-15',
    notes: '',
    createdBy: 'Test Accountant',
    createdAt: '2026-01-15T12:00:00.000Z',
    updatedBy: 'Test Accountant',
    updatedAt: '2026-01-15T12:00:00.000Z',
    ...overrides,
  };
}

function baseAppState(overrides: Record<string, unknown> = {}) {
  return {
    role: 'acc',
    userName: 'Test Accountant',
    branchId: null,
    notifications: [],
    logout: jest.fn(),
    changeOwnPassword: jest.fn(),
    branches: [branchA, branchB],
    companyAssets: [asset()],
    addCompanyAsset: jest.fn(() => true),
    updateCompanyAsset: jest.fn(() => true),
    deleteCompanyAsset: jest.fn(() => true),
    companyAssetSaveError: null,
    clearCompanyAssetSaveError: jest.fn(),
    tanks: [],
    lpgTanks: [],
    dips: [],
    deliveries: [],
    expenses: [],
    sales: [{
      id: 1,
      pump: 'PMS',
      L: 1_000,
      price: 1_000,
      dt: '2026-09-03',
      branchId: branchA.id,
    }],
    prices: {},
    priceHistory: [],
    priceProposals: [],
    maintenance: [],
    staff: [],
    hrEmployees: [],
    pumpDailyReports: [],
    companyInfo: { citaRate: '30', vatRate: '7.5' },
    financialEntry: {
      cashInBank: 0,
      posValue: 0,
      goodsOnTransit: 0,
      cashInHand: 0,
      capitalInjection: 0,
      bankCharges: 0,
      loanInterest: 0,
      liabilities: 0,
      bankLoans: [],
      startupCapital: 0,
      startupCapitalMonth: '2026-09',
      startupCapitalSource: 'admin',
      closingOperatingCapital: 0,
    },
    updateFinancialEntry: jest.fn(),
    ...overrides,
  };
}

function nodeText(node: ReactTestInstance): string {
  return node.children
    .map(child =>
      typeof child === 'string' || typeof child === 'number'
        ? String(child)
        : nodeText(child as ReactTestInstance),
    )
    .join('');
}

function renderedText(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAll(node => String(node.type) === 'Text')
    .map(nodeText)
    .join(' ');
}

function mount(element: React.ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | null = null;
  act(() => {
    renderer = create(element);
  });
  return renderer as unknown as ReactTestRenderer;
}

afterEach(() => {
  jest.clearAllMocks();
  mockRouteParams = { type: 'pnl' };
  mockPathname = '/reports';
});

describe('asset register screen', () => {
  it('shows a clear save failure and clears the one-shot error notice', () => {
    const clearCompanyAssetSaveError = jest.fn();
    mockedUseApp.mockReturnValue(baseAppState({
      companyAssetSaveError: {
        id: 1,
        message: 'Changes to "Branch Generator" were not saved. The last confirmed version was restored.',
      },
      clearCompanyAssetSaveError,
    }) as any);

    const renderer = mount(<AssetManagementScreen />);

    expect(Alert.alert).toHaveBeenCalledWith(
      'Asset save failed',
      'Changes to "Branch Generator" were not saved. The last confirmed version was restored.',
    );
    expect(clearCompanyAssetSaveError).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });

  it('exercises authorized add, edit, and delete flows without losing branch/category labels', () => {
    const addCompanyAsset = jest.fn(() => true);
    const updateCompanyAsset = jest.fn(() => true);
    const deleteCompanyAsset = jest.fn(() => true);
    mockedUseApp.mockReturnValue(baseAppState({
      role: 'acc',
      companyAssets: [
        asset(),
        asset({
          id: 'asset-pump',
          name: 'Wuse Pump',
          category: 'Pumps',
          branchId: branchB.id,
        }),
      ],
      addCompanyAsset,
      updateCompanyAsset,
      deleteCompanyAsset,
    }) as any);

    const renderer = mount(<AssetManagementScreen />);
    expect(renderedText(renderer)).toContain('Maitama Branch');
    expect(renderedText(renderer)).toContain('Wuse Branch');
    expect(renderedText(renderer)).toContain('Generators');
    expect(renderedText(renderer)).toContain('Pumps');

    const wuseBranch = renderer.root.find(
      node =>
        String(node.type) === 'TouchableOpacity' &&
        node.props.accessibilityLabel === `Select ${branchB.name} for asset registration`,
    );
    act(() => wuseBranch.props.onPress());
    const toggle = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && node.props.testID === 'asset-form-toggle',
    );
    act(() => toggle.props.onPress());

    const assetNameInput = renderer.root.find(
      node => String(node.type) === 'TextInput' && node.props.placeholder === 'e.g. Toyota Hilux',
    );
    act(() => assetNameInput.props.onChangeText('Branch Solar Array'));
    const solarCategory = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && nodeText(node) === 'Solar Systems',
    );
    act(() => solarCategory.props.onPress());
    const perUnitInput = renderer.root.find(
      node => String(node.type) === 'TextInput' && node.props.placeholder === 'Per unit',
    );
    act(() => perUnitInput.props.onChangeText('120000'));
    const save = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && node.props.testID === 'save-asset',
    );
    act(() => save.props.onPress());
    expect(addCompanyAsset).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Branch Solar Array',
      category: 'Solar Systems',
      branchId: branchB.id,
      initialCost: 120_000,
    }));

    const edit = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && node.props.accessibilityLabel === 'Edit Branch Generator',
    );
    act(() => edit.props.onPress());
    const editNameInput = renderer.root.find(
      node => String(node.type) === 'TextInput' && node.props.placeholder === 'e.g. Toyota Hilux',
    );
    act(() => editNameInput.props.onChangeText('Updated Generator'));
    const editSave = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && node.props.testID === 'save-asset',
    );
    act(() => editSave.props.onPress());
    expect(updateCompanyAsset).toHaveBeenCalledWith(
      'asset-generator',
      expect.objectContaining({ name: 'Updated Generator', branchId: branchA.id }),
    );

    const deleteButton = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && node.props.accessibilityLabel === 'Delete Branch Generator',
    );
    act(() => deleteButton.props.onPress());
    const alertCalls = (Alert.alert as jest.Mock).mock.calls;
    const deleteActions = alertCalls[alertCalls.length - 1][2] as Array<{ onPress?: () => void }>;
    act(() => deleteActions.find(action => action.onPress)?.onPress?.());
    expect(deleteCompanyAsset).toHaveBeenCalledWith('asset-generator');

    act(() => renderer.unmount());
  });

  it('exposes register mutations to a manager for the assigned branch', () => {
    const addCompanyAsset = jest.fn(() => true);
    const updateCompanyAsset = jest.fn(() => true);
    const deleteCompanyAsset = jest.fn(() => true);
    mockedUseApp.mockReturnValue(baseAppState({
      role: 'mgr',
      branchId: branchA.id,
      addCompanyAsset,
      updateCompanyAsset,
      deleteCompanyAsset,
    }) as any);

    const renderer = mount(<AssetManagementScreen />);
    expect(renderedText(renderer)).toContain('Branch Generator');
    expect(renderer.root.findAll(
      node => String(node.type) === 'TouchableOpacity' && node.props.testID === 'asset-form-toggle',
    )).toHaveLength(1);
    expect(renderer.root.findAll(
      node => String(node.type) === 'TouchableOpacity' && node.props.accessibilityLabel === 'Edit Branch Generator',
    )).toHaveLength(1);
    act(() => renderer.unmount());
  });

  it('does not expose register mutations to attendants', () => {
    mockedUseApp.mockReturnValue(baseAppState({
      role: 'att',
      branchId: branchA.id,
    }) as any);

    const renderer = mount(<AssetManagementScreen />);
    expect(renderedText(renderer)).toContain('Branch Generator');
    expect(renderer.root.findAll(
      node => String(node.type) === 'TouchableOpacity' && node.props.testID === 'asset-form-toggle',
    )).toHaveLength(0);
    act(() => renderer.unmount());
  });

  it.each(['csm', 'mktg'] as const)('exposes register mutations to authorized %s users', role => {
    const addCompanyAsset = jest.fn(() => true);
    const updateCompanyAsset = jest.fn(() => true);
    const deleteCompanyAsset = jest.fn(() => true);
    mockedUseApp.mockReturnValue(baseAppState({
      role,
      addCompanyAsset,
      updateCompanyAsset,
      deleteCompanyAsset,
    }) as any);

    const renderer = mount(<AssetManagementScreen />);
    expect(renderer.root.findAll(
      node => String(node.type) === 'TouchableOpacity' && node.props.testID === 'asset-form-toggle',
    )).toHaveLength(1);
    act(() => renderer.unmount());
  });
});

describe('asset depreciation financial screens', () => {
  const secondBranchAsset = asset({
    id: 'asset-wuse-pump',
    name: 'Wuse Pump',
    category: 'Pumps',
    branchId: branchB.id,
    initialCost: 120_000,
    endOfLifeValue: 0,
    usefulLifeYears: 1,
    acquiredOn: '2026-09-01',
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses the same branch-aware monthly depreciation and CITA calculation in Financial Status', () => {
    mockedUseApp.mockReturnValue(baseAppState({
      role: 'md',
      companyAssets: [asset(), secondBranchAsset],
    }) as any);

    const renderer = mount(<FinancialStatusCard roleColor="#4527a0" />);
    const card = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && nodeText(node).includes('Financial Status'),
    );
    act(() => card.props.onPress());
    const text = renderedText(renderer);

    expect(text).toContain('Monthly Asset Depreciation ₦30,000');
    expect(text).toContain('CITA (30%) ₦291,000');
    expect(text).toContain('= Net Profit ₦679,000');
    act(() => renderer.unmount());
  });

  it('keeps a branch-scoped financial status from including another branch asset', () => {
    mockedUseApp.mockReturnValue(baseAppState({
      role: 'mgr',
      branchId: branchA.id,
      companyAssets: [asset(), secondBranchAsset],
    }) as any);

    const renderer = mount(<FinancialStatusCard roleColor="#1a6e3c" />);
    const card = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && nodeText(node).includes('Financial Status'),
    );
    act(() => card.props.onPress());

    expect(renderedText(renderer)).toContain('Monthly Asset Depreciation ₦20,000');
    expect(renderedText(renderer)).not.toContain('Monthly Asset Depreciation ₦30,000');
    act(() => renderer.unmount());
  });

  it('deducts the same monthly depreciation before CITA in the P&L report', () => {
    mockedUseApp.mockReturnValue(baseAppState({
      role: 'md',
      companyAssets: [asset(), secondBranchAsset],
    }) as any);

    const renderer = mount(<ReportsScreen detail />);
    const text = renderedText(renderer);

    expect(text).toContain('Profit & Loss');
    expect(text).toContain('Asset Depreciation ₦30,000');
    expect(text).toContain('CITA (30%) ₦291,000');
    expect(text).toContain('Profit & Loss ₦679,000');
    act(() => renderer.unmount());
  });

  it('keeps the report launcher compact and sends the selected report context to the viewer', () => {
    mockRouteParams = {};
    mockedUseApp.mockReturnValue(baseAppState({
      role: 'md',
      branches: [branchA, branchB],
    }) as any);

    const renderer = mount(<ReportsScreen />);
    const reportButtons = renderer.root.findAll(
      node =>
        String(node.type) === 'TouchableOpacity' &&
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.endsWith(' report'),
    );

    expect(reportButtons).toHaveLength(10);
    expect(reportButtons.every(button => button.props.style?.[0]?.width === '100%')).toBe(true);

    const weekly = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && nodeText(node) === 'Weekly',
    );
    act(() => weekly.props.onPress());

    const wuseBranch = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && nodeText(node) === branchB.name,
    );
    act(() => wuseBranch.props.onPress());

    const dateField = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && node.props.testID === 'report-business-date',
    );
    act(() => dateField.props.onPress());

    const pnl = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && node.props.accessibilityLabel === 'P&L report',
    );
    act(() => pnl.props.onPress());

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/reports/view',
      params: {
        type: 'pnl',
        period: 'Weekly',
        date: '2026-09-15',
        branch: branchB.id,
      },
    });
    act(() => renderer.unmount());
  });

  it('renders the dedicated viewer from route context and returns through back navigation without changing records', () => {
    const state = baseAppState({
      role: 'md',
      branches: [branchA, branchB],
      sales: [{
        id: 1,
        pump: 'PMS',
        L: 1_000,
        price: 1_000,
        dt: '2026-09-15',
        branchId: branchB.id,
      }],
    });
    const originalSales = state.sales;
    mockRouteParams = {
      type: 'pnl',
      period: 'Weekly',
      date: '2026-09-15',
      branch: branchB.id,
    };
    mockPathname = '/reports/view';
    mockedUseApp.mockReturnValue(state as any);

    const viewer = mount(<ReportViewScreen />);
    const viewerText = renderedText(viewer);
    expect(viewerText).toContain('P&L');
    expect(viewerText).toContain('Weekly report');
    expect(viewerText).toContain('2026-09-15');
    expect(viewerText).toContain(branchB.name);
    expect(viewerText).not.toContain('Choose a report');
    act(() => viewer.unmount());

    const header = mount(<Header title="Report viewer" />);
    const back = header.root.find(
      node =>
        String(node.type) === 'TouchableOpacity' &&
        node.props.accessibilityLabel === 'Go back to previous page',
    );
    act(() => back.props.onPress());

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(state.sales).toBe(originalSales);
    expect(state.sales).toEqual([expect.objectContaining({ id: 1, branchId: branchB.id })]);
    act(() => header.unmount());
  });

  it('falls back to safe report defaults for an invalid or missing deep-link value', () => {
    mockRouteParams = {
      type: 'not-a-report',
      period: 'not-a-period',
      date: 'not-a-date',
      branch: 'missing-branch',
    };
    mockPathname = '/reports/view';
    mockedUseApp.mockReturnValue(baseAppState({
      role: 'md',
      branches: [branchA, branchB],
    }) as any);

    const viewer = mount(<ReportViewScreen />);
    const viewerText = renderedText(viewer);

    expect(viewerText).toContain('Summary');
    expect(viewerText).toContain('Monthly report');
    expect(viewerText).toContain('All Branches');
    expect(viewerText).not.toContain('not-a-report');
    expect(viewerText).not.toContain('not-a-period');
    expect(viewerText).not.toContain('missing-branch');
    act(() => viewer.unmount());
  });
});