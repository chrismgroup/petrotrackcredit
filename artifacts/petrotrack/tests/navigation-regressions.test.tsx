import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockUsePathname = jest.fn(() => '/home');
const mockUseApp = jest.fn();
const mockMarkNotificationRead = jest.fn(async () => undefined);
const mockAddNotificationResponseReceivedListener = jest.fn();
let mockNotificationResponseListener:
  | ((response: { notification: { request: { content: { data?: Record<string, unknown> } } } }) => void)
  | undefined;

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
    StyleSheet: { create: (styles: unknown) => styles },
    Text: primitive('Text'),
    TextInput: primitive('TextInput'),
    TouchableOpacity: primitive('TouchableOpacity'),
    View: primitive('View'),
    useWindowDimensions: () => ({ width: 420, height: 900, scale: 1, fontScale: 1 }),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  PermissionStatus: { GRANTED: 'granted' },
  addNotificationReceivedListener: () => ({ remove: jest.fn() }),
  addNotificationResponseReceivedListener: (listener: typeof mockNotificationResponseListener) => {
    mockNotificationResponseListener = listener;
    mockAddNotificationResponseReceivedListener(listener);
    return { remove: jest.fn() };
  },
  getPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));

jest.mock('react-native-svg', () => ({
  G: () => null,
  Rect: () => null,
  Svg: () => null,
  Text: () => null,
}));

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const React = require('react');
    return React.createElement('Redirect', { href });
  },
  Stack: Object.assign(() => {
    const React = require('react');
    return React.createElement('Stack');
  }, { Screen: () => null }),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  usePathname: () => mockUsePathname(),
}));

jest.mock('@/components/ScreenLayout', () => ({
  ScreenLayout: ({ children }: { children: React.ReactNode }) => {
    const React = require('react');
    return React.createElement('ScreenLayout', null, children);
  },
}));

jest.mock('@/components/ActionItemsTable', () => ({
  ActionItemsTable: () => null,
}));

jest.mock('@/components/FormSheet', () => ({
  ModalSheet: () => null,
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#fff',
    surface: '#f7f7f5',
    card: '#fff',
    border: '#ddd',
    inputBorder: '#ccc',
    text: '#111',
    textMuted: '#666',
    textSubtle: '#999',
    primary: '#1a6e3c',
    primaryDark: '#0d3b24',
    teal: '#0f6e56',
    blue: '#28698b',
    purple: '#633c99',
    coral: '#b45309',
    brown: '#795548',
    amber: '#ba7517',
    error: '#a32d2d',
    errorBg: '#fee2e2',
    errorBorder: '#d99',
    warning: '#ba7517',
    warningBg: '#fef3c7',
    success: '#1a6e3c',
    successBg: '#dcfce7',
    info: '#28698b',
    infoBg: '#e0f2fe',
    tabIconDefault: '#777',
  }),
}));

jest.mock('@/lib/report-helpers', () => ({
  REPORT_META: {
    sales: { label: 'Sales report', desc: 'Sales', icon: 'bar-chart', color: '#185fa5' },
  },
  getPerms: () => ({ visible: [] }),
}));

jest.mock('@/lib/dip-helpers', () => ({
  findLatestDipForProduct: () => undefined,
}));

jest.mock('@/lib/navigation-routing', () => {
  const actual = jest.requireActual('@/lib/navigation-routing');
  return actual;
});

jest.mock('@/context/AppContext', () => ({
  SCREEN_ROUTES: {
    home: '/(app)/home',
    users: '/(app)/users',
    depts: '/(app)/departments',
    audit: '/(app)/audit',
    settings: '/(app)/system-settings',
    ops: '/(app)/operations',
    tanks: '/(app)/tanks',
    acct: '/(app)/accounts',
    revenue: '/(app)/accounts',
    corp: '/(app)/corporate',
    assets: '/(app)/asset-management',
    branches: '/(app)/branches',
    maint: '/(app)/maintenance',
    sales: '/(app)/sales',
    budget: '/(app)/budget',
    exp: '/(app)/expenses',
    exprpt: '/(app)/reports',
    mktg: '/(app)/marketing',
    shift: '/(app)/shift',
    tasks: '/(app)/tasks',
    actionItems: '/(app)/action-items',
    dailyRevenueLog: '/(app)/daily-revenue-log',
    branchRevenueLog: '/(app)/branch-revenue-log',
    recv: '/(app)/receiving',
    stockSnapshot: '/(app)/stock-snapshot',
    inventory: '/(app)/inventory',
    hr: '/(app)/hr',
    prices: '/(app)/prices',
    comms: '/(app)/comms',
    jobs: '/(app)/jobs',
    messages: '/(app)/messages',
    notifications: '/(app)/notifications',
    profile: '/(app)/profile',
  },
  ROLE_COLORS: { admin: '#633806', mgr: '#1a6e3c', att: '#28698b', acc: '#185fa5' },
  ROLE_LABELS: { admin: 'Admin', mgr: 'Manager', att: 'Attendant', acc: 'Accountant' },
  UINFO: {
    admin: { initials: 'AD', name: 'Admin' },
    mgr: { initials: 'MG', name: 'Manager' },
    att: { initials: 'AT', name: 'Attendant' },
    acc: { initials: 'AC', name: 'Accountant' },
  },
  GLOBAL_OVERVIEW_ROLES: new Set(['admin', 'ceo', 'md', 'acc', 'csm']),
  ACTION_ITEMS_DASHBOARD_ACCESS_ID: 'actionItems',
  canViewActionItemsDashboard: () => false,
  calculateAccountsReceivable: () => 0,
  calculateBusinessMonthRevenue: () => 0,
  calculateDailyOperationalStock: () => ({
    startupStock: null, delivered: 0, sold: 0, bookStock: null,
  }),
  calculateDailyStockLogBalance: () => ({ variance: null }),
  calendarMonthBusinessDateRange: () => ({ from: '2026-09-01', to: '2026-09-30' }),
  businessDateKey: (value: string) => value,
  dipReadingToLiters: (value: number) => value,
  fmt: (value: number) => `₦${value.toLocaleString()}`,
  getActionItemUrgency: () => 'on-track',
  isRevenueReportStatus: () => false,
  salesRevenueByBranch: () => ({ byBranch: {} }),
  unitForProd: () => 'L',
  useBusinessDateKey: () => '2026-09-03',
  useApp: () => mockUseApp(),
}));

import HomeScreen from '../app/(app)/home';
import JobsScreen from '../app/(app)/jobs';
import NotificationsScreen from '../app/(app)/notifications';
import AppLayout from '../app/(app)/_layout';
import { Header } from '../components/Header';
import { TabBar } from '../components/TabBar';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { safeNotificationRoute } from '../lib/navigation-routing';
import { canAccessWorkspaceRoute, workspaceRouteAccess } from '../lib/workspace-access';

function nodeText(node: ReactTestInstance): string {
  return node.children
    .map(child => typeof child === 'string' || typeof child === 'number'
      ? String(child)
      : nodeText(child as ReactTestInstance))
    .join('');
}

function buttons(renderer: ReactTestRenderer): ReactTestInstance[] {
  return renderer.root.findAll(node => String(node.type) === 'TouchableOpacity');
}

function buttonWithText(renderer: ReactTestRenderer, text: string): ReactTestInstance {
  const matches = buttons(renderer).filter(button => nodeText(button).includes(text));
  expect(matches).toHaveLength(1);
  return matches[0];
}

function baseAppState(overrides: Record<string, unknown> = {}) {
  return {
    role: 'admin',
    userName: 'Test Admin',
    staffId: 'staff-1',
    branchId: null,
    userAccess: {},
    navItems: [],
    branches: [],
    tanks: [],
    lpgTanks: [],
    pumps: [],
    dips: [],
    deliveries: [],
    maintenance: [],
    expenses: [],
    budgets: [],
    financialEntry: {
      cashInHand: 0, posValue: 0, liabilities: 0, goodsOnTransit: 0,
    },
    priceProposals: [],
    pumpDailyReports: [],
    userAccounts: [],
    messages: {},
    notifications: [],
    sales: [],
    startupStocks: [],
    stockSnapshotConfig: {
      productsByBranch: {},
      metrics: {
        startupStock: true, deliveries: true, submittedTankDip: true, variance: true,
      },
    },
    myFolderFiles: [],
    actionItems: [],
    tasks: [],
    approveDip: jest.fn(),
    approveExpense: jest.fn(),
    approveDelivery: jest.fn(),
    approvePriceProposal: jest.fn(),
    markNotificationRead: mockMarkNotificationRead,
    markAllNotificationsRead: jest.fn(),
    ...overrides,
  };
}

afterEach(() => {
  jest.clearAllMocks();
  mockUsePathname.mockReturnValue('/home');
  mockCanGoBack.mockReturnValue(true);
  mockNotificationResponseListener = undefined;
});

describe('dashboard and workspace navigation', () => {
  it.each([
    ['Tank Dipping', '/(app)/tanks'],
    ['Sales', '/(app)/sales'],
    ['Expenses', '/(app)/expenses'],
    ['Reports', '/(app)/reports'],
  ])('opens the Home quick action %s in its intended screen', (label, route) => {
    mockUseApp.mockReturnValue(baseAppState());

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<HomeScreen />); });
    act(() => { buttonWithText(renderer, label).props.onPress(); });

    expect(mockPush).toHaveBeenCalledWith(route);
    act(() => renderer.unmount());
  });

  it('opens MD expense claims from Approvals & Actions in the read-only Expenses screen', () => {
    mockUseApp.mockReturnValue(baseAppState({
      role: 'md',
      navItems: [{ id: 'exp' }],
      expenses: [{
        id: 101,
        dt: '2026-09-05',
        cat: 'Utilities',
        desc: 'Generator service',
        amt: 25000,
        by: 'mgr',
        byName: 'Station Manager',
        status: 'acc_forwarded',
        budgetId: 1,
      }],
    }));

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<HomeScreen />); });
    act(() => { buttonWithText(renderer, 'Expense Claims').props.onPress(); });

    expect(mockPush).toHaveBeenCalledWith('/(app)/expenses');
    act(() => renderer.unmount());
  });

  it('lets CEO inspect expense workflow status on Home and in My Jobs', () => {
    mockUseApp.mockReturnValue(baseAppState({
      role: 'ceo',
      navItems: [{ id: 'exp', label: 'Expenses', icon: 'receipt-outline' }],
      expenses: [{
        id: 102,
        dt: '2026-09-05',
        cat: 'Utilities',
        desc: 'Generator service',
        amt: 25000,
        by: 'mgr',
        byName: 'Station Manager',
        status: 'acc_forwarded',
        budgetId: 1,
        branchId: 'branch-a',
        branchName: 'Maitama Branch',
      }],
    }));

    let homeRenderer!: ReactTestRenderer;
    act(() => { homeRenderer = create(<HomeScreen />); });
    expect(homeRenderer.root.findAll(node => String(node.type) === 'TouchableOpacity' && nodeText(node).includes('Expense Claims'))).toHaveLength(1);
    act(() => homeRenderer.unmount());

    let jobsRenderer!: ReactTestRenderer;
    act(() => { jobsRenderer = create(<JobsScreen />); });
    expect(jobsRenderer.root.findAll(node => String(node.type) === 'TouchableOpacity' && nodeText(node).includes('Expenses'))).toHaveLength(1);
    act(() => jobsRenderer.unmount());
  });

  it('shows legacy accountant-pending expenses to the Accountant on Home', () => {
    mockUseApp.mockReturnValue(baseAppState({
      role: 'acc',
      navItems: [{ id: 'exp' }],
      expenses: [{
        id: 103,
        dt: '2026-09-09',
        cat: 'Utilities',
        desc: 'Uyo generator diesel',
        amt: 50000,
        by: 'mgr',
        byName: 'Utibe Jimmy',
        status: 'acc_forwarded',
        budgetId: 3,
        branchId: 'B1784296733504',
        branchName: 'Uyo fuel station',
      }],
    }));

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<HomeScreen />); });
    expect(renderer.root.findAll(node =>
      String(node.type) === 'TouchableOpacity' && nodeText(node).includes('Expense Claims'),
    )).toHaveLength(1);
    act(() => renderer.unmount());
  });

  it.each([
    {
      label: 'MD tank-dip approval',
      role: 'md',
      title: 'Tank Dip Readings',
      route: '/(app)/tanks',
      state: {
        dips: [{
          id: 201, dt: '2026-09-05', by: 'manager', rd: {}, lpg: {},
          obs: '', status: 'pending',
        }],
      },
    },
    {
      label: 'CEO price approval',
      role: 'ceo',
      title: 'Price Proposals',
      route: '/(app)/prices',
      state: {
        priceProposals: [{
          id: 202, prod: 'PMS', currentPrice: 900, proposedPrice: 920,
          proposedBy: 'manager', proposedAt: '2026-09-05T08:00:00.000Z',
          status: 'pending',
        }],
      },
    },
    {
      label: 'Accountant delivery review',
      role: 'acc',
      title: 'Product Deliveries',
      route: '/(app)/receiving',
      state: {
        deliveries: [{
          id: 203, dt: '2026-09-05', sup: 'Supplier', prod: 'PMS', wb: 'WB-1',
          ord: 1000, rec: 1000, st: 'ok', notes: '', approvalStatus: 'pending_acc',
        }],
      },
    },
    {
      label: 'Manager pump-report review',
      role: 'mgr',
      title: 'Pump Daily Reports',
      route: '/(app)/shift?tab=review',
      state: {
        pumpDailyReports: [{
          id: 204, pumpId: 'pump-1', pumpName: 'Pump 1', product: 'PMS',
          date: '2026-09-05', submittedAt: '2026-09-05T08:00:00.000Z',
          submittedBy: 'attendant', submittedByName: 'Pump Attendant',
          status: 'pending_manager', openingMeter: 100, closingMeter: 110,
          liters: 10, grossAmount: 9000,
        }],
      },
    },
    {
      label: 'Attendant returned report correction',
      role: 'att',
      title: 'Pump Daily Reports',
      route: '/(app)/shift?tab=dashboard',
      state: {
        userName: 'Pump Attendant',
        pumpDailyReports: [{
          id: 205, pumpId: 'pump-1', pumpName: 'Pump 1', product: 'PMS',
          date: '2026-09-05', submittedAt: '2026-09-05T08:00:00.000Z',
          submittedBy: 'Pump Attendant', submittedByName: 'Pump Attendant',
          status: 'returned_attendant', openingMeter: 100, closingMeter: 110,
          liters: 10, grossAmount: 9000,
        }],
      },
    },
    {
      label: 'CSM returned delivery correction',
      role: 'csm',
      title: 'Product Deliveries',
      route: '/(app)/receiving',
      state: {
        userName: 'Corporate Services',
        deliveries: [{
          id: 206, dt: '2026-09-05', sup: 'Supplier', prod: 'AGO', wb: 'WB-2',
          ord: 500, rec: 490, st: 'short', notes: '', approvalStatus: 'returned',
          receivedBy: 'Corporate Services',
        }],
      },
    },
    {
      label: 'Admin staff activation',
      role: 'admin',
      title: 'Staff Enrolments',
      route: '/(app)/users',
      state: {
        userAccounts: [{
          id: 207, empName: 'New Staff', username: '', role: 'att',
          status: 'pending_admin', createdAt: '2026-09-05T08:00:00.000Z',
        }],
      },
    },
  ])('opens the actionable screen for $label', ({ role, title, route, state }) => {
    const permission = workspaceRouteAccess(route)?.permission;
    mockUseApp.mockReturnValue(baseAppState({
      role,
      navItems: permission ? [{ id: permission }] : [],
      ...state,
    }));

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<HomeScreen />); });
    act(() => { buttonWithText(renderer, title).props.onPress(); });

    expect(mockPush).toHaveBeenCalledWith(route);
    act(() => renderer.unmount());
  });

  it('opens the Home stock snapshot card in the stock snapshot screen', () => {
    mockUseApp.mockReturnValue(baseAppState());

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<HomeScreen />); });
    const card = renderer.root.find(node =>
      String(node.type) === 'TouchableOpacity' && node.props.accessibilityLabel === 'Open stock snapshot',
    );
    act(() => { card.props.onPress(); });

    expect(mockPush).toHaveBeenCalledWith('/(app)/stock-snapshot');
    act(() => renderer.unmount());
  });

  it('opens representative My Jobs cards and retains revenue-log entries', () => {
    mockUseApp.mockReturnValue(baseAppState({
      role: 'admin',
      navItems: [],
    }));

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<JobsScreen />); });
    act(() => { buttonWithText(renderer, 'Daily Business-Date Revenue Log').props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith('/(app)/daily-revenue-log');

    mockPush.mockClear();
    act(() => { buttonWithText(renderer, 'Stock snapshot').props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith('/(app)/stock-snapshot');
    act(() => renderer.unmount());
  });
});

describe('global navigation safeguards', () => {
  it('shows a back control on detail screens and returns through the existing stack', () => {
    mockUseApp.mockReturnValue(baseAppState());
    mockUsePathname.mockReturnValue('/daily-revenue-log');

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<Header title="Daily Revenue Log" />); });
    const back = renderer.root.find(node =>
      String(node.type) === 'TouchableOpacity' && node.props.accessibilityLabel === 'Go back to previous page',
    );
    act(() => { back.props.onPress(); });

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  it('falls back to My Jobs when a detail screen has no back stack', () => {
    mockUseApp.mockReturnValue(baseAppState());
    mockUsePathname.mockReturnValue('/daily-revenue-log');
    mockCanGoBack.mockReturnValue(false);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<Header title="Daily Revenue Log" />); });
    const back = renderer.root.find(node =>
      String(node.type) === 'TouchableOpacity' && node.props.accessibilityLabel === 'Go back to previous page',
    );
    act(() => { back.props.onPress(); });

    expect(mockReplace).toHaveBeenCalledWith('/(app)/jobs');
    expect(mockBack).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  it('keeps My Jobs selected for daily and branch revenue-log routes', () => {
    mockUseApp.mockReturnValue(baseAppState());

    for (const pathname of ['/daily-revenue-log', '/branch-revenue-log']) {
      mockUsePathname.mockReturnValue(pathname);
      let renderer!: ReactTestRenderer;
      act(() => { renderer = create(<TabBar />); });

      const tabs = renderer.root.findAll(node =>
        String(node.type) === 'TouchableOpacity' && node.props.accessibilityRole === 'tab',
      );
      const selected = tabs.filter(tab => tab.props.accessibilityState?.selected);
      expect(selected).toHaveLength(1);
      expect(selected[0].props.accessibilityLabel).toBe('My Jobs');
      act(() => renderer.unmount());
    }
  });
});

describe('role-aware route access and stale notification links', () => {
  it.each([
    ['Stock snapshot', '/(app)/stock-snapshot', 'stockSnapshot'],
    ['Daily Business-Date Revenue Log', '/(app)/daily-revenue-log', 'dailyRevenueLog'],
    ['Branches', '/(app)/branches', 'branches'],
  ])('keeps the %s card and direct route aligned for restricted roles', (label, route, permission) => {
    const navItems = [{ id: permission }];
    mockUseApp.mockReturnValue(baseAppState({ role: 'att', navItems }));

    let jobsRenderer!: ReactTestRenderer;
    act(() => { jobsRenderer = create(<JobsScreen />); });
    expect(buttons(jobsRenderer).some(button => nodeText(button).includes(label))).toBe(true);
    expect(canAccessWorkspaceRoute(route, 'att', navItems)).toBe(true);
    act(() => jobsRenderer.unmount());

    mockUseApp.mockReturnValue(baseAppState({ role: 'att', navItems: [] }));
    act(() => { jobsRenderer = create(<JobsScreen />); });
    expect(buttons(jobsRenderer).some(button => nodeText(button).includes(label))).toBe(false);
    expect(canAccessWorkspaceRoute(route, 'att', [])).toBe(false);
    act(() => jobsRenderer.unmount());
  });

  it('keeps protected workspace cards and routes available to admins', () => {
    mockUseApp.mockReturnValue(baseAppState({ role: 'admin', navItems: [] }));

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<JobsScreen />); });

    expect(buttons(renderer).some(button => nodeText(button).includes('System settings'))).toBe(true);
    expect(canAccessWorkspaceRoute('/(app)/system-settings', 'admin', [])).toBe(true);
    act(() => renderer.unmount());
  });

  it('requires each protected My Jobs destination to be declared in the shared policy', () => {
    expect(workspaceRouteAccess('/(app)/stock-snapshot')).toEqual(expect.objectContaining({ permission: 'stockSnapshot' }));
    expect(workspaceRouteAccess('/(app)/future-workspace')).toBeUndefined();
    expect(canAccessWorkspaceRoute('/(app)/future-workspace', 'mgr', [{ id: 'home' }])).toBe(false);
  });

  it('lets an Admin user override take priority over the role page default', () => {
    const roleAccess = { mgr: { exp: true } };
    expect(canAccessWorkspaceRoute(
      '/(app)/expenses',
      'mgr',
      [{ id: 'exp' }],
      roleAccess,
      { 42: { exp: false } },
      42,
    )).toBe(false);
    expect(canAccessWorkspaceRoute(
      '/(app)/expenses',
      'mgr',
      [],
      { mgr: { exp: false } },
      { 42: { exp: true } },
      42,
    )).toBe(true);
  });

  it('redirects a restricted role to its first permitted primary module', () => {
    mockUseApp.mockReturnValue({
      role: 'att',
      isServerAuthenticated: true,
      isHydrated: true,
      navItems: [{ id: 'shift' }],
    });
    mockUsePathname.mockReturnValue('/(app)/accounts');

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<AppLayout />); });
    const redirect = renderer.root.find(node => String(node.type) === 'Redirect');

    expect(redirect.props.href).toBe('/(app)/shift');
    act(() => renderer.unmount());
  });

  it('keeps admin-only routes available to admins', () => {
    mockUseApp.mockReturnValue({
      role: 'admin',
      isServerAuthenticated: true,
      isHydrated: true,
      navItems: [],
    });
    mockUsePathname.mockReturnValue('/(app)/system-settings');

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<AppLayout />); });

    expect(renderer.root.findAll(node => String(node.type) === 'Redirect')).toHaveLength(0);
    expect(renderer.root.findAll(node => String(node.type) === 'Stack')).toHaveLength(1);
    act(() => renderer.unmount());
  });

  it('marks an unknown notification route as Home instead of navigating stale data', async () => {
    mockUseApp.mockReturnValue(baseAppState({
      notifications: [{
        id: 12,
        type: 'report_update',
        title: 'Old report link',
        body: 'This route is no longer available.',
        createdAt: '2026-09-03T09:00:00.000Z',
        read: false,
        data: { route: '/(app)/removed-screen' },
      }],
    }));

    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<NotificationsScreen />); });
    const notification = buttonWithText(renderer, 'Old report link');
    await act(async () => { await notification.props.onPress(); });

    expect(mockMarkNotificationRead).toHaveBeenCalledWith(12);
    expect(mockPush).toHaveBeenCalledWith('/(app)/home');
    expect(safeNotificationRoute('/(app)/reports?type=sales')).toBe('/(app)/reports?type=sales');
    expect(safeNotificationRoute('/(app)/removed-screen')).toBe('/(app)/home');
    act(() => renderer.unmount());
  });

  it('falls back to Home when a native push response contains a stale route', () => {
    const refreshNotifications = jest.fn();
    mockUseApp.mockReturnValue(baseAppState({
      isServerAuthenticated: true,
      refreshNotifications,
    }));
    function PushNotificationHarness() {
      usePushNotifications();
      return null;
    }

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<PushNotificationHarness />); });
    expect(mockAddNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);

    act(() => {
      mockNotificationResponseListener?.({
        notification: {
          request: {
            content: { data: { route: '/(app)/removed-screen' } },
          },
        },
      });
    });

    expect(mockPush).toHaveBeenCalledWith('/(app)/home');
    expect(refreshNotifications).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });
});