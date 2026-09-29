import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

const mockPush = jest.fn();

jest.mock('react-native', () => {
  const React = require('react');
  const primitive = (name: string) => ({ children, ...props }: any) =>
    React.createElement(name, props, children);

  return {
    Alert: { alert: jest.fn() },
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
    KeyboardAvoidingView: primitive('KeyboardAvoidingView'),
    View: primitive('View'),
    useColorScheme: jest.fn(() => 'light'),
  };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const primitive = (name: string) => ({ children, ...props }: any) =>
    React.createElement(name, props, children);
  return {
    G: primitive('G'),
    Rect: primitive('Rect'),
    Svg: primitive('Svg'),
    Text: primitive('SvgText'),
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/components/FormSheet', () => ({
  ModalSheet: ({ visible, children }: any) => (visible ? children : null),
}));

jest.mock('@/components/KeyboardAwareScrollViewCompat', () => {
  const React = require('react');
  return {
    KeyboardAwareScrollViewCompat: ({ children, ...props }: any) =>
      React.createElement('KeyboardAwareScrollViewCompat', props, children),
  };
});

jest.mock('@/components/AppliedDateField', () => {
  const React = require('react');
  return {
    AppliedDateField: ({ value, onChange }: any) => {
      const [open, setOpen] = React.useState(false);
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'TouchableOpacity',
          { testID: 'report-business-date', onPress: () => setOpen(true) },
          React.createElement('Text', null, value ? 'September 15, 2026' : 'Select the date this record applies to'),
        ),
        open && React.createElement('Text', null, 'Select applies-on date'),
        open && React.createElement(
          'TouchableOpacity',
          { testID: 'report-business-date-day-15', onPress: () => { onChange('2026-09-15'); setOpen(false); } },
          React.createElement('Text', null, 'September 15, 2026'),
        ),
      );
    },
  };
});

jest.mock('@/components/ScreenLayout', () => {
  const React = require('react');
  return {
    ScreenLayout: ({ children, rightAction }: any) =>
      React.createElement('ScreenLayout', null, rightAction, children),
  };
});

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    primary: '#0D5C2E',
    primaryDark: '#0A4824',
    primaryForeground: '#fff',
    purple: '#4C1D95',
    blue: '#1D4ED8',
    amber: '#D97706',
    coral: '#DC4E22',
    red: '#B91C1C',
    teal: '#0D6E56',
    brown: '#7C3F0E',
    background: '#EFF4F1',
    surface: '#fff',
    card: '#fff',
    text: '#0F172A',
    textMuted: '#64748B',
    textSubtle: '#94A3B8',
    border: '#DDE5E0',
    inputBorder: '#C8D5CD',
    tint: '#0D5C2E',
    tabIconDefault: '#94A3B8',
    tabIconSelected: '#0D5C2E',
    success: '#166534',
    successBg: '#DCFCE7',
    successBorder: '#86EFAC',
    warning: '#92400E',
    warningBg: '#FEF3C7',
    warningBorder: '#FCD34D',
    error: '#991B1B',
    errorBg: '#FEE2E2',
    errorBorder: '#FCA5A5',
    info: '#1D4ED8',
    infoBg: '#EFF6FF',
    messageMine: '#0D5C2E',
    messageOther: '#EFF4F1',
    radius: 14,
  }),
}));

jest.mock('@/context/AppContext', () => {
  const roleLabels: Record<string, string> = {
    admin: 'Admin',
    ceo: 'Chief Executive Officer',
    md: 'Managing Director',
    acc: 'Accountant',
    csm: 'Corporate Services Manager / HR',
    mktg: 'Marketing Manager',
    mgr: 'Station Manager',
    att: 'Attendant',
  };
  const roleColors: Record<string, string> = {
    admin: '#633806',
    ceo: '#7B2CBF',
    md: '#4527A0',
    acc: '#185FA5',
    csm: '#7B3FA8',
    mktg: '#B45309',
    mgr: '#1A6E3C',
    att: '#64748B',
  };
  const urgency = (targetDate: string) => {
    const target = new Date(`${targetDate}T00:00:00`).getTime();
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const days = Math.ceil((target - startOfToday) / 86400000);
    if (days < 0) return 'overdue';
    if (days <= 14) return 'due-soon';
    return 'on-track';
  };
  const defaultActionRoles = new Set(['ceo', 'md', 'acc', 'csm', 'mktg', 'mgr', 'att']);

  return {
    ACTION_ITEMS_DASHBOARD_ACCESS_ID: 'actionItemsDashboard',
    GLOBAL_OVERVIEW_ROLES: new Set(['ceo', 'md', 'acc', 'csm']),
    ROLE_COLORS: roleColors,
    ROLE_LABELS: roleLabels,
    SCREEN_ROUTES: {
      acct: '/(app)/accounts',
      actionItems: '/(app)/action-items',
      branches: '/(app)/branches',
      corp: '/(app)/corporate',
      exprpt: '/(app)/reports',
      exp: '/(app)/expenses',
      hr: '/(app)/hr',
      maint: '/(app)/maintenance',
      messages: '/(app)/messages',
      notifications: '/(app)/notifications',
      ops: '/(app)/operations',
      prices: '/(app)/prices',
      recv: '/(app)/receiving',
      sales: '/(app)/sales',
      shift: '/(app)/shift',
      tasks: '/(app)/tasks',
      budget: '/(app)/budget',
      tanks: '/(app)/tanks',
    },
    canViewActionItemsDashboard: (
      targetRole: string | null,
      targetStaffId: number | null,
      access: Record<number, Record<string, boolean>>,
    ) => {
      if (!targetRole) return false;
      if (targetRole === 'admin') return true;
      const override = targetStaffId !== null
        ? access[targetStaffId]?.actionItemsDashboard
        : undefined;
      return override !== undefined ? override : defaultActionRoles.has(targetRole);
    },
    businessDateKey: (value: string) => value,
    calculateAccountsReceivable: () => 0,
    calculateBusinessMonthRevenue: () => 0,
    calculateDailyOperationalStock: () => ({
      startupStock: null,
      delivered: 0,
      sold: 0,
      bookStock: null,
    }),
    calculateDailyStockLogBalance: () => ({ variance: null }),
    calendarMonthBusinessDateRange: () => ({
      from: '2026-09-01',
      to: '2026-09-30',
    }),
    dipReadingToLiters: (value: number) => value,
    fmt: (value: number) => `₦${value.toLocaleString()}`,
    fmtDate: (value: string) => value || '—',
    getActionItemUrgency: urgency,
    isRevenueReportStatus: () => false,
    resolveUserInfo: (role: string) => ({
      name: roleLabels[role] ?? role,
      initials: (roleLabels[role] ?? role).slice(0, 2).toUpperCase(),
    }),
    salesRevenueByBranch: () => ({ byBranch: {} }),
    unitForProd: () => 'L',
    useApp: jest.fn(),
    useBusinessDateKey: () => '2026-09-03',
  };
});

import HomeScreen from '../app/(app)/home';
import ActionItemsScreen from '../app/(app)/action-items';
import { useApp } from '@/context/AppContext';
import { ActionItemsTable } from '@/components/ActionItemsTable';
import type { ActionItem as AppActionItem } from '@/context/AppContext';

const mockedUseApp = jest.mocked(useApp);

const colors = {
  primary: '#0D5C2E',
  surface: '#fff',
  background: '#EFF4F1',
  border: '#DDE5E0',
  text: '#0F172A',
  textMuted: '#64748B',
  textSubtle: '#94A3B8',
};

function item(overrides: Partial<AppActionItem> = {}): AppActionItem {
  return {
    id: 1001,
    title: 'Reconcile pump readings',
    desc: 'Confirm the variance with the station team.',
    actionPartyName: 'Station Manager',
    actionPartyRole: 'mgr',
    status: 'open',
    targetDate: '2026-09-20',
    branchId: 'B1',
    branchName: 'Maitama Branch',
    createdBy: 'CEO',
    createdByRole: 'ceo',
    createdAt: '2026-09-01',
    ...overrides,
  };
}

function baseAppState(overrides: Record<string, unknown> = {}) {
  return {
    role: 'md',
    userName: 'Test User',
    staffId: 42,
    branchId: 'B1',
    userAccess: {},
    branches: [
      { id: 'B1', name: 'Maitama Branch', st: 'Active' },
      { id: 'B2', name: 'Wuse Branch', st: 'Active' },
    ],
    navItems: [
      { id: 'corp' },
      { id: 'stockSnapshot' },
      { id: 'tanks' },
      { id: 'recv' },
      { id: 'exp' },
      { id: 'prices' },
      { id: 'shift' },
      { id: 'budget' },
      { id: 'users' },
      { id: 'hr' },
      { id: 'actionItems' },
      { id: 'notifications' },
      { id: 'exprpt' },
      { id: 'maint' },
    ],
    tanks: [],
    lpgTanks: [],
    pumps: [],
    dips: [],
    deliveries: [],
    maintenance: [],
    expenses: [],
    budgets: [],
    financialEntry: {
      cashInHand: 0,
      posValue: 0,
      liabilities: 0,
      goodsOnTransit: 0,
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
        variance: true,
        startupStock: true,
        deliveries: true,
        submittedTankDip: true,
      },
    },
    myFolderFiles: [],
    actionItems: [],
    approveDip: jest.fn(),
    approveExpense: jest.fn(),
    approveDelivery: jest.fn(),
    approvePriceProposal: jest.fn(),
    addActionItem: jest.fn(),
    updateActionItemStatus: jest.fn(),
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

function touchableWithText(renderer: ReactTestRenderer, text: string): ReactTestInstance {
  const matches = renderer.root.findAll(
    node => String(node.type) === 'TouchableOpacity' && nodeText(node).includes(text),
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

function render(element: React.ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | null = null;
  act(() => {
    renderer = create(element);
  });
  return renderer as unknown as ReactTestRenderer;
}

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
});

afterAll(() => {
  jest.useRealTimers();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('Action Items table and dedicated view', () => {
  it('shows responsive action summaries without IDs or created dates', () => {
    const renderer = render(
      <ActionItemsTable
        items={[
          item({
            id: 123456,
            targetDate: '2026-09-02',
            status: 'open',
          }),
          item({
            id: 123457,
            title: 'Archive the signed handover',
            desc: '',
            actionPartyName: 'Managing Director',
            actionPartyRole: 'md',
            targetDate: '2026-09-20',
            status: 'closed',
          }),
        ]}
        colors={colors}
        showBranch
      />,
    );
    const text = renderedText(renderer);

    expect(text).toContain('Action party');
    expect(text).toContain('Close-out date');
    expect(text).toContain('Status');
    expect(text).toContain('Branch');
    expect(text).not.toContain('#123456');
    expect(text).not.toContain('2026-09-01');
    expect(text).toContain('Reconcile pump readings');
    expect(text).toContain('Confirm the variance with the station team.');
    expect(text).toContain('Station Manager');
    expect(text).toContain('2026-09-02');
    expect(text).toContain('Overdue');
    expect(text).toContain('Open');
    expect(text).toContain('Archive the signed handover');
    expect(text).toContain('Closed');
    expect(text).toContain('Locked');

    act(() => renderer.unmount());
  });

  it('opens a selected item with full details, workflow history, and action-party status controls', () => {
    const updateActionItemStatus = jest.fn(() => true);
    mockedUseApp.mockReturnValue(baseAppState({
      role: 'mgr',
      staffId: 42,
      actionItems: [item({
        actionPartyId: 42,
        history: [{
          action: 'Action item created',
          actor: 'CEO',
          actorRole: 'ceo',
          at: '2026-09-01T08:00:00.000Z',
          detail: 'Assigned to Station Manager.',
        }],
      })],
      updateActionItemStatus,
    }) as any);

    const renderer = render(<ActionItemsScreen />);
    const row = renderer.root.find(
      node =>
        String(node.type) === 'TouchableOpacity' &&
        node.props.accessibilityLabel === 'Open action item Reconcile pump readings',
    );
    act(() => row.props.onPress());

    const text = renderedText(renderer);
    expect(text).toContain('Full workflow');
    expect(text).toContain('Confirm the variance with the station team.');
    expect(text).toContain('Action party');
    expect(text).toContain('Close-out date');
    expect(text).toContain('Workflow history');
    expect(text).toContain('Action item created');
    expect(text).toContain('Update status');
    expect(text).toContain('#1001');
    expect(text).toContain('2026-09-01');

    const ongoing = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && node.props.testID === 'action-status-on-going',
    );
    act(() => ongoing.props.onPress());
    expect(updateActionItemStatus).toHaveBeenCalledWith(1001, 'on-going');

    act(() => renderer.unmount());
  });

  it('keeps the add form compact and selects an action party through search', () => {
    const addActionItem = jest.fn();
    mockedUseApp.mockReturnValue(baseAppState({
      role: 'md',
      userAccounts: [
        { id: 77, empName: 'Amina Yusuf', role: 'acc', status: 'active', branchId: 'B2' },
        { id: 78, empName: 'Bello Musa', role: 'mgr', status: 'active', branchId: 'B1' },
      ],
      addActionItem,
    }) as any);

    const renderer = render(<ActionItemsScreen />);
    const addButton = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && node.props.accessibilityLabel === 'Add action item',
    );
    act(() => addButton.props.onPress());

    let text = renderedText(renderer);
    expect(text).toContain('Search for an action party');
    expect(text).not.toContain('Amina Yusuf');
    expect(text).not.toContain('Bello Musa');

    const searchButton = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && node.props.testID === 'open-action-party-search',
    );
    act(() => searchButton.props.onPress());
    expect(renderedText(renderer)).toContain('Choose action party');

    const searchInput = renderer.root.find(
      node => String(node.type) === 'TextInput' && node.props.testID === 'action-party-search-input',
    );
    act(() => searchInput.props.onChangeText('Wuse'));
    expect(renderedText(renderer)).toContain('Amina Yusuf');
    expect(renderedText(renderer)).not.toContain('Bello Musa');
    act(() => searchInput.props.onChangeText('Accountant'));
    expect(renderedText(renderer)).toContain('Amina Yusuf');
    expect(renderedText(renderer)).not.toContain('Bello Musa');
    act(() => searchInput.props.onChangeText('Amina'));

    const result = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && node.props.testID === 'action-party-option-77',
    );
    act(() => result.props.onPress());
    expect(renderedText(renderer)).toContain('Amina Yusuf');
    expect(renderedText(renderer)).not.toContain('Choose action party');

    const dateField = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && node.props.testID === 'report-business-date',
    );
    act(() => dateField.props.onPress());
    expect(renderedText(renderer)).toContain('Select applies-on date');

    const day = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity' && node.props.testID === 'report-business-date-day-15',
    );
    act(() => day.props.onPress());
    text = renderedText(renderer);
    expect(text).toContain('September 15, 2026');

    act(() => renderer.unmount());
  });

  it('lets global roles choose any active branch, not only head office', () => {
    mockedUseApp.mockReturnValue(baseAppState({
      role: 'md',
      branchId: 'HQ',
      branches: [
        { id: 'HQ', name: 'Head Office', st: 'Active' },
        { id: 'B1', name: 'Maitama Branch', st: 'Active' },
        { id: 'B2', name: 'Wuse Branch', st: 'Suspended' },
      ],
    }) as any);

    const renderer = render(<ActionItemsScreen />);
    const addButton = renderer.root.find(
      node => String(node.type) === 'TouchableOpacity'
        && node.props.accessibilityLabel === 'Add action item',
    );
    act(() => addButton.props.onPress());

    const text = renderedText(renderer);
    expect(text).toContain('Head Office');
    expect(text).toContain('Maitama Branch');
    expect(text).not.toContain('Wuse Branch');
    act(() => renderer.unmount());
  });

  it('shows every branch to authorized viewers and keeps closed items in the archive', () => {
    mockedUseApp.mockReturnValue(baseAppState({
      role: 'mgr',
      actionItems: [
        item({ id: 1, title: 'Maitama open item', targetDate: '2026-09-20', branchId: 'B1' }),
        item({ id: 2, title: 'Wuse item is shared', targetDate: '2026-09-20', branchId: 'B2', branchName: 'Wuse Branch' }),
        item({ id: 3, title: 'Maitama archived item', status: 'closed', targetDate: '2026-09-02', branchId: 'B1' }),
      ],
    }) as any);

    const renderer = render(<ActionItemsScreen />);
    let text = renderedText(renderer);
    expect(text).toContain('Maitama open item');
    expect(text).toContain('Wuse item is shared');
    expect(text).not.toContain('Maitama archived item');

    act(() => touchableWithText(renderer, 'Branch archive').props.onPress());
    text = renderedText(renderer);
    expect(text).toContain('Maitama archived item');
    expect(text).toContain('Closed');
    expect(text).toContain('Locked');
    expect(text).not.toContain('Maitama open item');
    expect(text).not.toContain('Wuse item is shared');

    act(() => renderer.unmount());
  });

  it('renders safe empty messages for open items and the branch archive', () => {
    mockedUseApp.mockReturnValue(baseAppState({ role: 'mgr' }) as any);

    const renderer = render(<ActionItemsScreen />);
    expect(renderedText(renderer)).toContain('No open action items yet');

    act(() => touchableWithText(renderer, 'Branch archive').props.onPress());
    expect(renderedText(renderer)).toContain('No closed action items in this branch archive');

    act(() => renderer.unmount());
  });
});

describe('Home outstanding Action Items visibility, scope, and urgency', () => {
  const homeItems = [
    item({
      id: 1,
      title: 'Overdue Maitama item',
      targetDate: '2026-09-02',
      branchId: 'B1',
      branchName: 'Maitama Branch',
    }),
    item({
      id: 2,
      title: 'Due-soon Wuse item',
      targetDate: '2026-09-08',
      branchId: 'B2',
      branchName: 'Wuse Branch',
    }),
    item({
      id: 3,
      title: 'On-track Maitama item',
      targetDate: '2026-09-20',
      branchId: 'B1',
      branchName: 'Maitama Branch',
      status: 'on-going',
    }),
    item({
      id: 4,
      title: 'Closed item stays archived',
      targetDate: '2026-09-02',
      branchId: 'B1',
      status: 'closed',
    }),
  ];

  it.each(['ceo', 'md', 'acc', 'csm', 'mktg', 'mgr', 'att'] as const)(
    'shows outstanding items to the requested %s role',
    role => {
      mockedUseApp.mockReturnValue(baseAppState({
        role,
        actionItems: [homeItems[0]],
      }) as any);

      const renderer = render(<HomeScreen />);
      const text = renderedText(renderer);
      expect(text).toContain('OUTSTANDING ACTION ITEMS');
      expect(text).toContain('Overdue Maitama item');
      expect(text).toContain('Overdue');
      expect(text).toContain('Open');
      act(() => renderer.unmount());
    },
  );

  it('shows all branches to every authorized role', () => {
    mockedUseApp.mockReturnValue(baseAppState({
      role: 'md',
      actionItems: homeItems,
    }) as any);
    const globalRenderer = render(<HomeScreen />);
    const globalText = renderedText(globalRenderer);
    expect(globalText).toContain('Overdue Maitama item');
    expect(globalText).toContain('Due-soon Wuse item');
    expect(globalText).toContain('On-track Maitama item');
    expect(globalText).not.toContain('Closed item stays archived');
    expect(globalText.indexOf('Overdue Maitama item')).toBeLessThan(globalText.indexOf('Due-soon Wuse item'));
    expect(globalText.indexOf('Due-soon Wuse item')).toBeLessThan(globalText.indexOf('On-track Maitama item'));
    act(() => globalRenderer.unmount());

    mockedUseApp.mockReturnValue(baseAppState({
      role: 'mgr',
      actionItems: homeItems,
    }) as any);
    const managerRenderer = render(<HomeScreen />);
    const managerText = renderedText(managerRenderer);
    expect(managerText).toContain('Overdue Maitama item');
    expect(managerText).toContain('On-track Maitama item');
    expect(managerText).toContain('Due-soon Wuse item');
    expect(managerText).not.toContain('Closed item stays archived');
    act(() => managerRenderer.unmount());
  });

  it('shows a readable empty state when an allowed role has no outstanding items', () => {
    mockedUseApp.mockReturnValue(baseAppState({
      role: 'acc',
      actionItems: [],
    }) as any);

    const renderer = render(<HomeScreen />);
    const text = renderedText(renderer);
    expect(text).toContain('OUTSTANDING ACTION ITEMS');
    expect(text).toContain('No outstanding action items');
    act(() => renderer.unmount());
  });

  it('surfaces the HR queues owned by CSM/HR on Home', () => {
    mockedUseApp.mockReturnValue(baseAppState({
      role: 'csm',
      hrRecommendations: [{ id: 1, empName: 'Ada Staff', type: 'promotion', status: 'pending' }],
      hrHandbooks: [{ id: 2, name: 'Staff Handbook', approved: false }],
    }) as any);

    const renderer = render(<HomeScreen />);
    const text = renderedText(renderer);
    expect(text).toContain('HR Recommendations');
    expect(text).toContain('2 HR items needing your attention');
    expect(text).toContain('items needing attention');
    act(() => renderer.unmount());
  });

  it.each([
    ['md', 'forwarded'],
    ['ceo', 'md_approved'],
  ] as const)('surfaces %s onboarding approvals on Home', (role, status) => {
    mockedUseApp.mockReturnValue(baseAppState({
      role,
      hrEmployees: [{ id: 3, name: 'New Starter', onboarding: { status } }],
    }) as any);

    const renderer = render(<HomeScreen />);
    const text = renderedText(renderer);
    expect(text).toContain('HR Onboarding');
    expect(text).toContain('1 HR item needing your attention');
    act(() => renderer.unmount());
  });

  it('opens pending tank dips in the dedicated Tank Dipping screen', () => {
    mockedUseApp.mockReturnValue(baseAppState({
      role: 'md',
      tanks: [{ id: 'T1', name: 'PMS Tank 1', prod: 'PMS', cap: 20000, dip: 0, op: 0, rv: 0, sl: 0, branchId: 'B1' }],
      dips: [{
        id: 701,
        dt: '2026-09-03',
        by: 'Maitama Manager',
        rd: { T1: 12500 },
        lpg: {},
        obs: 'Morning physical reading',
        status: 'pending',
        branchId: 'B1',
      }],
    }) as any);

    const renderer = render(<HomeScreen />);
    act(() => touchableWithText(renderer, 'Tank Dip Readings').props.onPress());

    expect(mockPush).toHaveBeenCalledWith('/(app)/tanks');
    act(() => renderer.unmount());
  });

  it.each([
    ['mgr', 'pending_manager', '/(app)/shift?tab=review'],
    ['acc', 'pending_accountant', '/(app)/shift?tab=pending_acc'],
  ])('opens a %s pump-report queue in its actionable tab', (role, status, route) => {
    mockedUseApp.mockReturnValue(baseAppState({
      role,
      pumpDailyReports: [{
        id: 801,
        date: '2026-09-03',
        pumpId: 'P1',
        pumpName: 'Pump 1',
        product: 'PMS',
        branchId: 'B1',
        openingMeter: 1000,
        closingMeter: 1150,
        liters: 150,
        unitPrice: 700,
        grossAmount: 105000,
        posAmount: 50000,
        cashAmount: 55000,
        transferAmount: 0,
        creditAmount: 0,
        totalCollected: 105000,
        variance: 0,
        note: 'Balanced shift',
        submittedBy: 'att-1',
        submittedByName: 'Pump Attendant',
        submittedAt: '2026-09-03T08:00:00.000Z',
        status,
      }],
    }) as any);

    const renderer = render(<HomeScreen />);
    act(() => touchableWithText(renderer, 'Pump Daily Reports').props.onPress());

    expect(mockPush).toHaveBeenCalledWith(route);
    act(() => renderer.unmount());
  });
});
