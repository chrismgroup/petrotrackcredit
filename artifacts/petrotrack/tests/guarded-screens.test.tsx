import React from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

import { safeNum, safeStr } from '@/lib/report-helpers';

const mockRouterPush = jest.fn();

jest.mock('react-native', () => {
  const React = require('react');
  const primitive = (name: string) => ({ children, ...props }: any) =>
    React.createElement(name, props, children);

  return {
    Alert: { alert: jest.fn() },
    Image: primitive('Image'),
    Modal: primitive('Modal'),
    Platform: { OS: 'web' },
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
  useLocalSearchParams: jest.fn(() => ({})),
  useRouter: jest.fn(() => ({
    push: mockRouterPush,
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    replace: jest.fn(),
  })),
}));

jest.mock('@/components/AppliedDateField', () => ({
  AppliedDateField: () => null,
}));

jest.mock('@/components/BusinessDateConfirmation', () => ({
  useBusinessDateConfirmation: () => ({
    requestDateConfirmation: (_label: string, _date: string, callback: () => void) => callback(),
    confirmationModal: null,
  }),
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
  MY_FOLDER_ALLOWED_ROLES: ['admin', 'acc', 'mktg', 'csm', 'md', 'ceo'],
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
import PricesScreen from '../app/(app)/prices';
import SalesScreen from '../app/(app)/sales';
import MaintenanceScreen from '../app/(app)/maintenance';
import CorporateScreen from '../app/(app)/corporate';
import CorporateWorkspaceScreen from '../app/(app)/corporate-workspace';
import DocumentPreviewScreen from '../app/(app)/document-preview';
import BudgetScreen from '../app/(app)/budget';
import { useApp } from '@/context/AppContext';

const mockedUseApp = jest.mocked(useApp);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);

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

function nodeText(node: ReactTestInstance): string {
  return node.children
    .map(child =>
      typeof child === 'string' || typeof child === 'number'
        ? String(child)
        : nodeText(child as ReactTestInstance),
    )
    .join('');
}

function documentAreaTiles(renderer: ReactTestRenderer): ReactTestInstance[] {
  return renderer.root.findAll(
    node => String(node.type) === 'TouchableOpacity' && node.props.accessibilityRole === 'tab',
  );
}

function documentAreaTile(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  const matches = documentAreaTiles(renderer).filter(tile => nodeText(tile).includes(label));
  expect(matches).toHaveLength(1);
  return matches[0];
}

function corporateAppState(overrides: Record<string, unknown> = {}) {
  return {
    ...baseAppState(),
    role: 'acc',
    docs: [],
    myFolders: [],
    myFolderFiles: [],
    legalMatters: [],
    corpProjects: [],
    meetingMinutes: [],
    addMyFolder: jest.fn(),
    addMyFolderFile: jest.fn(),
    removeMyFolderFile: jest.fn(),
    replaceMyFolderFile: jest.fn(),
    addLegalMatter: jest.fn(),
    updateLegalMatter: jest.fn(),
    updateLegalStatus: jest.fn(),
    deleteLegalMatter: jest.fn(),
    addCorpProject: jest.fn(),
    updateCorpProject: jest.fn(),
    updateProjectProgress: jest.fn(),
    deleteCorpProject: jest.fn(),
    addMeetingMinutes: jest.fn(),
    updateMeetingMinutes: jest.fn(),
    deleteMeetingMinutes: jest.fn(),
    addCorpAttachment: jest.fn(),
    removeCorpAttachment: jest.fn(),
    submitCorpItem: jest.fn(),
    approveCorpItem: jest.fn(),
    rejectCorpItem: jest.fn(),
    ...overrides,
  };
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
    priceHistory: [],
    priceProposals: [],
    updatePrice: jest.fn(),
    addPriceProposal: jest.fn(),
    approvePriceProposal: jest.fn(),
    updateAndApprovePriceProposal: jest.fn(),
    rejectPriceProposal: jest.fn(),
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
    maintenance: [],
    addMaintenance: jest.fn(),
    acknowledgeMaintenance: jest.fn(),
    assignMaintenance: jest.fn(),
    updateMaintenanceStatus: jest.fn(),
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

describe('budget ordering and accountant archives', () => {
  const budget = (id: number, month: number, year: number, status = 'fully_approved') => ({
    id,
    month,
    year,
    appliesOn: `${year}-${String(month).padStart(2, '0')}-01`,
    submittedAt: `${year}-${String(month).padStart(2, '0')}-01T08:00:00.000Z`,
    label: `${['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month]} ${year}`,
    by: 'mgr',
    byName: 'Station Manager',
    items: [{ cat: 'Operations', amt: 100000 }],
    total: 100000,
    status,
    workflow: [],
  });

  function budgetState(overrides: Record<string, unknown> = {}) {
    return {
      ...baseAppState(),
      role: 'acc',
      budgets: [],
      expenses: [],
      branches: [],
      addBudget: jest.fn(),
      updateBudget: jest.fn(),
      deleteBudget: jest.fn(),
      archiveBudgets: jest.fn(),
      submitBudgetToAcc: jest.fn(),
      forwardBudget: jest.fn(),
      approveBudget: jest.fn(),
      rejectBudget: jest.fn(),
      ...overrides,
    };
  }

  function touchable(renderer: ReactTestRenderer, label: string): ReactTestInstance {
    return renderer.root.find(
      node => String(node.type) === 'TouchableOpacity'
        && (node.props.accessibilityLabel === label || nodeText(node).includes(label)),
    );
  }

  it('shows the newest active budget first and exposes every requested archive age', () => {
    mockedUseApp.mockReturnValue(budgetState({
      budgets: [
        budget(1, 1, 2026),
        budget(2, 9, 2026),
        budget(3, 5, 2026),
      ],
    }) as any);
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<BudgetScreen />); });
    act(() => { touchable(renderer, 'All Budgets').props.onPress(); });

    const text = renderedText(renderer);
    expect(text.indexOf('September 2026 Budget')).toBeLessThan(text.indexOf('May 2026 Budget'));
    expect(text.indexOf('May 2026 Budget')).toBeLessThan(text.indexOf('January 2026 Budget'));
    for (const months of [1, 3, 6, 9, 12]) {
      expect(touchable(renderer, `Archive budgets older than ${months} month${months === 1 ? '' : 's'}`)).toBeTruthy();
    }
    act(() => renderer.unmount());
  });

  it('archives only old non-pending budgets and moves them to Archived', () => {
    const archiveBudgets = jest.fn();
    mockedUseApp.mockReturnValue(budgetState({
      budgets: [
        budget(1, 1, 2026),
        budget(2, 8, 2026),
        budget(3, 1, 2026, 'submitted'),
      ],
      archiveBudgets,
    }) as any);
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<BudgetScreen />); });

    act(() => {
      touchable(renderer, 'Archive eligible budgets older than 3 months').props.onPress();
    });
    const alertCall = jest.mocked(Alert.alert).mock.calls.at(-1);
    expect(alertCall?.[0]).toBe('Archive 1 budget?');
    const buttons = alertCall?.[2] as { text: string; onPress?: () => void }[];
    act(() => buttons.find(button => button.text === 'Archive budgets')?.onPress?.());
    expect(archiveBudgets).toHaveBeenCalledWith([1]);
    act(() => renderer.unmount());
  });
});

describe('maintenance handoff controls follow the signed-in staff role', () => {
  const submitted = {
    id: 91,
    taskId: 'MNT-2026-ABC12345',
    title: 'Repair forecourt light',
    pri: 'Urgent' as const,
    by: 'requester',
    date: '2026-09-01',
    submittedBy: 'requester',
    submittedByName: 'Maintenance Requester',
    submittedAt: '2026-09-01T08:00:00.000Z',
    status: 'pending' as const,
    st: 'Open' as const,
    history: [{
      id: 'history-1',
      action: 'Request submitted',
      actor: 'requester',
      at: '2026-09-01T08:00:00.000Z',
    }],
  };

  it.each(['md', 'ceo'] as const)('shows acknowledgement to the %s', role => {
    mockedUseApp.mockReturnValue({
      ...baseAppState(),
      role,
      userName: role === 'md' ? 'Maintenance MD' : 'Maintenance CEO',
      maintenance: [submitted],
    } as any);

    expectScreenToRender(<MaintenanceScreen />, 'Acknowledge receipt');
    expectScreenToRender(<MaintenanceScreen />, submitted.taskId);
  });

  it.each(['mgr', 'acc', 'csm', 'mktg', 'att'] as const)(
    'hides decision controls from the %s role',
    role => {
      mockedUseApp.mockReturnValue({
        ...baseAppState(),
        role,
        userName: `Maintenance ${role}`,
        maintenance: [submitted],
      } as any);

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<MaintenanceScreen />);
      });
      const mounted = renderer as unknown as ReactTestRenderer;
      const text = renderedText(mounted);
      expect(text).toContain(submitted.taskId);
      expect(text).not.toContain('Acknowledge receipt');
      expect(text).not.toContain('Assign task');
      act(() => mounted.unmount());
    },
  );

  it.each(['md', 'ceo'] as const)('shows assignment after acknowledgement to the %s', role => {
    mockedUseApp.mockReturnValue({
      ...baseAppState(),
      role,
      userName: role === 'md' ? 'Maintenance MD' : 'Maintenance CEO',
      maintenance: [{
        ...submitted,
        status: 'open',
        acknowledgedBy: 'maint_e2e_md',
        acknowledgedAt: '2026-09-01T08:05:00.000Z',
      }],
    } as any);

    expectScreenToRender(<MaintenanceScreen />, 'Assign task');
  });

  it('shows status transitions only to the assigned staff member', () => {
    mockedUseApp.mockReturnValue({
      ...baseAppState(),
      role: 'att',
      userName: 'Maintenance Assignee',
      maintenance: [{
        ...submitted,
        status: 'open',
        acknowledgedAt: '2026-09-01T08:05:00.000Z',
        assignedTo: 'maint_e2e_assignee',
        assignedToName: 'Maintenance Assignee',
      }],
    } as any);

    expectScreenToRender(<MaintenanceScreen />, 'Commenced');

    mockedUseApp.mockReturnValue({
      ...baseAppState(),
      role: 'att',
      userName: 'Maintenance Requester',
      maintenance: [{
        ...submitted,
        status: 'open',
        acknowledgedAt: '2026-09-01T08:05:00.000Z',
        assignedTo: 'maint_e2e_assignee',
        assignedToName: 'Maintenance Assignee',
      }],
    } as any);

    let renderer: ReactTestRenderer | null = null;
    act(() => {
      renderer = create(<MaintenanceScreen />);
    });
    const mounted = renderer as unknown as ReactTestRenderer;
    expect(renderedText(mounted)).not.toContain('Update status');
    act(() => mounted.unmount());
  });
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

  it('renders sales with incomplete report fields', () => {
    mockedUseApp.mockReturnValue({
      ...baseAppState(),
      pumpDailyReports: [{
        id: 1,
        pumpName: undefined,
        submittedByName: undefined,
        submittedAt: undefined,
        product: undefined,
        status: 'approved',
        openingMeter: undefined,
        closingMeter: undefined,
        liters: undefined,
        grossAmount: undefined,
        cashAmount: undefined,
        posAmount: undefined,
        transferAmount: undefined,
        creditAmount: undefined,
        variance: undefined,
      }],
    } as any);

    expect(safeStr(undefined)).toBe('—');
    expect(safeNum(undefined)).toBe(0);
    expectScreenToRender(<SalesScreen />, '—');
    expectScreenToRender(
      <SalesScreen />,
      `${safeNum(undefined).toLocaleString()} L`,
    );
  });

  it('renders prices with incomplete proposal and history fields', () => {
    mockedUseApp.mockReturnValue({
      ...baseAppState(),
      priceProposals: [{
        id: 1,
        prod: undefined,
        currentPrice: undefined,
        proposedPrice: undefined,
        proposedBy: undefined,
        proposedAt: undefined,
        status: 'approved',
      }],
      priceHistory: [{
        id: undefined,
        prod: undefined,
        oldPrice: undefined,
        newPrice: undefined,
        by: undefined,
        dt: undefined,
      }],
    } as any);

    expect(safeStr(undefined)).toBe('—');
    expect(safeNum(undefined)).toBe(0);
    expectScreenToRender(<PricesScreen />, safeStr(undefined));
    expectScreenToRender(
      <PricesScreen />,
      `₦${safeNum(undefined).toLocaleString()} → ₦${safeNum(undefined).toLocaleString()}`,
    );
  });
});

describe('My Documents area navigation', () => {
  it.each(['mgr', 'att'] as const)('shows only General to restricted %s users', role => {
    mockedUseApp.mockReturnValue(corporateAppState({ role }) as any);

    let renderer: ReactTestRenderer | null = null;
    act(() => {
      renderer = create(<CorporateScreen />);
    });
    const mounted = renderer as unknown as ReactTestRenderer;

    expect(documentAreaTiles(mounted).map(node => nodeText(node))).toEqual([
      expect.stringContaining('General'),
    ]);
    expect(documentAreaTiles(mounted).map(node => nodeText(node)).join(' ')).not.toContain('Compliance');
    expect(documentAreaTiles(mounted).map(node => nodeText(node)).join(' ')).not.toContain('Legal Documents');
    expect(documentAreaTiles(mounted).map(node => nodeText(node)).join(' ')).not.toContain('Projects');
    expect(documentAreaTiles(mounted).map(node => nodeText(node)).join(' ')).not.toContain('Minutes of Meetings');
    expect(documentAreaTiles(mounted).map(node => nodeText(node)).join(' ')).not.toContain('Correspondences');

    act(() => mounted.unmount());
  });

  it.each(['admin', 'acc', 'mktg', 'csm', 'md', 'ceo'] as const)(
    'shows all six document areas to authorized %s users',
    role => {
      mockedUseApp.mockReturnValue(corporateAppState({ role }) as any);

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<CorporateScreen />);
      });
      const mounted = renderer as unknown as ReactTestRenderer;
      const labels = documentAreaTiles(mounted).map(node => nodeText(node));

      expect(labels).toHaveLength(6);
      expect(labels.join(' ')).toEqual(expect.stringContaining('Compliance'));
      expect(labels.join(' ')).toEqual(expect.stringContaining('Legal Documents'));
      expect(labels.join(' ')).toEqual(expect.stringContaining('Projects'));
      expect(labels.join(' ')).toEqual(expect.stringContaining('Minutes of Meetings'));
      expect(labels.join(' ')).toEqual(expect.stringContaining('Correspondences'));
      expect(labels.join(' ')).toEqual(expect.stringContaining('General'));

      act(() => mounted.unmount());
    },
  );

  it('keeps readable labels on every document area tile', () => {
    mockedUseApp.mockReturnValue(corporateAppState({ role: 'acc' }) as any);

    let renderer: ReactTestRenderer | null = null;
    act(() => {
      renderer = create(<CorporateScreen />);
    });
    const mounted = renderer as unknown as ReactTestRenderer;
    const labels = documentAreaTiles(mounted).map(node => nodeText(node));

    expect(labels).toEqual(expect.arrayContaining([
      expect.stringContaining('Compliance'),
      expect.stringContaining('Legal Documents'),
      expect.stringContaining('Projects'),
      expect.stringContaining('Minutes of Meetings'),
      expect.stringContaining('Correspondences'),
      expect.stringContaining('General'),
    ]));

    act(() => mounted.unmount());
  });

  it('opens each document area in its dedicated workspace route', () => {
    mockedUseApp.mockReturnValue(corporateAppState({ role: 'acc' }) as any);
    mockRouterPush.mockClear();

    let renderer: ReactTestRenderer | null = null;
    act(() => {
      renderer = create(<CorporateScreen />);
    });
    const mounted = renderer as unknown as ReactTestRenderer;

    act(() => {
      documentAreaTile(mounted, 'Legal Documents').props.onPress();
    });

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(app)/corporate-workspace',
      params: { section: 'legal' },
    });
    act(() => mounted.unmount());
  });

  it('renders the selected workspace as a full page with file management actions', () => {
    mockedUseLocalSearchParams.mockReturnValue({ section: 'general' } as any);
    mockedUseApp.mockReturnValue(corporateAppState({
      role: 'acc',
      myFolders: [{ id: 10, section: 'general', name: 'Handbooks', createdBy: 'CSM', createdAt: '2026-09-01' }],
      myFolderFiles: [{
        id: 21,
        section: 'general',
        folderId: null,
        name: 'Safety Manual.pdf',
        objectPath: '/objects/safety-manual',
        mimeType: 'application/pdf',
        size: 1024,
        uploadedBy: 'CSM',
        uploadedAt: '2026-09-01',
      }],
    }) as any);

    let renderer: ReactTestRenderer | null = null;
    act(() => {
      renderer = create(<CorporateWorkspaceScreen />);
    });
    const mounted = renderer as unknown as ReactTestRenderer;
    const text = renderedText(mounted);

    expect(text).toContain('General Library');
    expect(text).toContain('Safety Manual.pdf');
    expect(text).toContain('Preview');
    expect(text).toContain('Download');
    expect(text).toContain('Print');
    act(() => mounted.unmount());
  });

  it('opens a selected file on its own preview page', () => {
    mockedUseLocalSearchParams.mockReturnValue({ fileId: '21', section: 'general' } as any);
    mockedUseApp.mockReturnValue(corporateAppState({
      role: 'acc',
      myFolderFiles: [{
        id: 21,
        section: 'general',
        folderId: null,
        name: 'Safety Manual.pdf',
        objectPath: '/objects/safety-manual',
        mimeType: 'application/pdf',
        size: 1024,
        uploadedBy: 'CSM',
        uploadedAt: '2026-09-01',
      }],
    }) as any);

    let renderer: ReactTestRenderer | null = null;
    act(() => {
      renderer = create(<DocumentPreviewScreen />);
    });
    const mounted = renderer as unknown as ReactTestRenderer;
    const text = renderedText(mounted);

    expect(text).toContain('Selected file');
    expect(text).toContain('Safety Manual.pdf');
    expect(text).toContain('Load preview');
    expect(text).toContain('Download');
    expect(text).toContain('Print');
    expect(text).toContain('File details');
    act(() => mounted.unmount());
  });

  it('updates the active area and clears expanded, edit, and form state when switching tiles', () => {
    mockedUseApp.mockReturnValue(corporateAppState({
      role: 'csm',
      legalMatters: [{
        id: 1,
        title: 'Lease Review',
        type: 'Contract',
        status: 'Active',
        party: 'Company Counsel',
        openedAt: '2026-08-20',
        priority: 'High',
        notes: 'Legal notes',
        approval: { status: 'draft' },
        attachments: [],
      }],
    }) as any);

    let renderer: ReactTestRenderer | null = null;
    act(() => {
      renderer = create(<CorporateScreen />);
    });
    const mounted = renderer as unknown as ReactTestRenderer;

    act(() => {
      documentAreaTile(mounted, 'Legal Documents').props.onPress();
    });
    expect(documentAreaTile(mounted, 'Legal Documents').props.accessibilityState).toEqual({ selected: true });

    const legalCardHeader = mounted.root.find(
      node => String(node.type) === 'TouchableOpacity' && nodeText(node).includes('Lease Review'),
    );
    act(() => {
      legalCardHeader.props.onPress();
    });
    expect(renderedText(mounted)).toContain('Attachments (0)');

    const editButton = mounted.root.find(
      node => String(node.type) === 'TouchableOpacity' && nodeText(node) === 'Edit',
    );
    act(() => {
      editButton.props.onPress();
    });
    expect(renderedText(mounted)).toContain('Edit Legal Matter');

    act(() => {
      documentAreaTile(mounted, 'Projects').props.onPress();
    });
    expect(documentAreaTile(mounted, 'Projects').props.accessibilityState).toEqual({ selected: true });
    expect(renderedText(mounted)).not.toContain('Edit Legal Matter');
    expect(renderedText(mounted)).not.toContain('Attachments (0)');

    act(() => {
      documentAreaTile(mounted, 'Legal Documents').props.onPress();
    });
    expect(documentAreaTile(mounted, 'Legal Documents').props.accessibilityState).toEqual({ selected: true });
    expect(renderedText(mounted)).not.toContain('New Legal Matter');
    expect(renderedText(mounted)).not.toContain('Edit Legal Matter');
    expect(renderedText(mounted)).not.toContain('Attachments (0)');

    act(() => mounted.unmount());
  });
});