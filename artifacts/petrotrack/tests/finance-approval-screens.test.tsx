import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { Alert } from 'react-native';

import ExpensesScreen from '../app/(app)/expenses';
import BudgetScreen from '../app/(app)/budget';
import { useApp } from '@/context/AppContext';

const mockedUseApp = jest.mocked(useApp);

jest.mock('react-native', () => {
  const React = require('react');
  const primitive = (name: string) => ({ children, ...props }: any) =>
    React.createElement(name, props, children);

  return {
    Alert: { alert: jest.fn() },
    Modal: ({ visible, children, ...props }: any) =>
      visible ? React.createElement('Modal', props, children) : null,
    Platform: {
      OS: 'web',
      select: (options: Record<string, unknown>) => options.web ?? options.default ?? options.native,
    },
    ScrollView: primitive('ScrollView'),
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
    Text: primitive('Text'),
    TextInput: primitive('TextInput'),
    TouchableOpacity: primitive('TouchableOpacity'),
    View: primitive('View'),
    TurboModuleRegistry: { get: jest.fn(() => null), getEnforcing: jest.fn(() => null) },
  };
});

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

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
  ModalSheet: ({ visible, children }: any) => (visible ? children : null),
}));

jest.mock('@/components/ScreenLayout', () => {
  const React = require('react');
  return {
    ScreenLayout: ({ children, rightAction }: any) =>
      React.createElement('ScreenLayout', null, rightAction, children),
  };
});

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
    primaryDark: '#14552e',
    primaryForeground: '#fff',
    teal: '#0f6e56',
    blue: '#185fa5',
    purple: '#633806',
    success: '#27500a',
    successBg: '#eaf3de',
    successBorder: '#a9c98d',
    error: '#a32d2d',
    errorBg: '#fcebeb',
    errorBorder: '#e0a5a5',
    warning: '#ba7517',
    warningBg: '#faeeda',
    warningBorder: '#e5bf79',
    amber: '#ba7517',
    info: '#185fa5',
    infoBg: '#e6f1fb',
    radius: 14,
  }),
}));

jest.mock('@/context/AppContext', () => ({
  ROLE_COLORS: {
    admin: '#633806',
    acc: '#185fa5',
    ceo: '#633806',
    md: '#4527a0',
    mgr: '#1a6e3c',
  },
  fmt: (value: number) => `₦${Math.round(value).toLocaleString()}`,
  fmtDateTime: (value: string) => value || '—',
  useApp: jest.fn(),
}));

function nodeText(node: ReactTestInstance): string {
  return node.children
    .map(child => typeof child === 'string' ? child : nodeText(child as ReactTestInstance))
    .join('');
}

function touchables(renderer: ReactTestRenderer, label: string): ReactTestInstance[] {
  return renderer.root.findAll(node =>
    String(node.type) === 'TouchableOpacity' && nodeText(node).trim() === label,
  );
}

function touchable(renderer: ReactTestRenderer, label: string, index = 0): ReactTestInstance {
  const matches = touchables(renderer, label);
  if (!matches[index]) throw new Error(`Could not find TouchableOpacity containing "${label}"`);
  return matches[index];
}

function touchableContaining(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  const match = renderer.root.findAll(node =>
    String(node.type) === 'TouchableOpacity' && nodeText(node).includes(label),
  )[0];
  if (!match) throw new Error(`Could not find TouchableOpacity containing "${label}"`);
  return match;
}

function press(renderer: ReactTestRenderer, label: string, index = 0) {
  act(() => {
    touchable(renderer, label, index).props.onPress();
  });
}

function expense(overrides: Record<string, unknown> = {}) {
  return {
    id: 41,
    dt: '2026-09-08',
    submittedAt: '2026-09-08T08:00:00.000Z',
    cat: 'Utilities',
    desc: 'Branch generator fuel',
    amt: 125_000,
    by: 'mgr',
    byName: 'Station Manager',
    status: 'pending',
    budgetId: 7,
    branchId: 'branch-b',
    revision: 3,
    ...overrides,
  };
}

function budget(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    month: 9,
    year: 2026,
    appliesOn: '2026-09-01',
    submittedAt: '2026-09-01T08:00:00.000Z',
    label: 'September 2026',
    by: 'mgr',
    byName: 'Station Manager',
    items: [{ cat: 'Operations', amt: 250_000 }],
    total: 250_000,
    status: 'submitted',
    workflow: [],
    revision: 2,
    ...overrides,
  };
}

function appState(overrides: Record<string, unknown> = {}) {
  return {
    role: 'acc',
    userName: 'Test Accountant',
    branchId: 'branch-a',
    expenses: [],
    budgets: [],
    sales: [],
    branches: [
      { id: 'branch-a', name: 'Maitama Branch', st: 'Active' },
      { id: 'branch-b', name: 'Wuse Branch', st: 'Active' },
    ],
    addExpense: jest.fn(async () => ({ ok: true })),
    updateExpenseConfirmed: jest.fn(async () => ({ ok: true })),
    deleteExpense: jest.fn(),
    forwardExpenseToMDConfirmed: jest.fn(async () => ({ ok: true })),
    approveExpenseConfirmed: jest.fn(async () => ({ ok: true })),
    rejectExpenseConfirmed: jest.fn(async () => ({ ok: true })),
    addBudget: jest.fn(),
    updateBudget: jest.fn(),
    updateAndSubmitBudget: jest.fn(),
    deleteBudget: jest.fn(),
    archiveBudgets: jest.fn(),
    submitBudgetToAcc: jest.fn(),
    forwardBudget: jest.fn(),
    approveBudget: jest.fn(),
    rejectBudget: jest.fn(),
    ...overrides,
  };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('expense approval controls', () => {
  it('lets the accountant forward a pending expense from another branch to the MD', async () => {
    const forwardExpenseToMDConfirmed = jest.fn(async () => ({ ok: true }));
    mockedUseApp.mockReturnValue(appState({
      expenses: [expense()],
      forwardExpenseToMDConfirmed,
    }) as any);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ExpensesScreen />); });

    expect(touchable(renderer, 'Forward to MD')).toBeTruthy();
    press(renderer, 'Forward to MD');

    const forwardButtons = touchables(renderer, 'Forward to MD');
    await act(async () => {
      await forwardButtons.at(-1)?.props.onPress();
    });
    expect(forwardExpenseToMDConfirmed).toHaveBeenCalledWith(41, undefined);

    act(() => renderer.unmount());
  });

  it.each(['md', 'ceo', 'admin'] as const)(
    'shows %s approve and reject controls for an expense assigned to another branch',
    async role => {
      const approveExpenseConfirmed = jest.fn(async () => ({ ok: true }));
      const rejectExpenseConfirmed = jest.fn(async () => ({ ok: true }));
      mockedUseApp.mockReturnValue(appState({
        role,
        userName: role === 'md' ? 'Managing Director' : role === 'ceo' ? 'Chief Executive Officer' : 'Admin',
        expenses: [expense({ status: 'acc_forwarded' })],
        approveExpenseConfirmed,
        rejectExpenseConfirmed,
      }) as any);

      let renderer!: ReactTestRenderer;
      act(() => { renderer = create(<ExpensesScreen />); });

      expect(touchable(renderer, 'Approve')).toBeTruthy();
      expect(touchable(renderer, 'Reject')).toBeTruthy();

      await act(async () => {
        await touchable(renderer, 'Approve').props.onPress();
      });
      expect(approveExpenseConfirmed).toHaveBeenCalledWith(41);

      await act(async () => {
        await touchable(renderer, 'Reject').props.onPress();
      });
      expect(rejectExpenseConfirmed).toHaveBeenCalledWith(41);

      act(() => renderer.unmount());
    },
  );

  it('shows the server reason when an executive rejection is refused', async () => {
    const rejectExpenseConfirmed = jest.fn(async () => ({
      ok: false,
      error: 'This record has already been approved by another reviewer.',
    }));
    mockedUseApp.mockReturnValue(appState({
      role: 'md',
      userName: 'Managing Director',
      expenses: [expense({ status: 'acc_forwarded' })],
      rejectExpenseConfirmed,
    }) as any);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ExpensesScreen />); });
    await act(async () => {
      await touchable(renderer, 'Reject').props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Expense not rejected',
      'This record has already been approved by another reviewer.',
    );
    act(() => renderer.unmount());
  });
});

describe('budget approval controls', () => {
  it('lets the accountant forward a submitted budget from another branch to the MD', async () => {
    const forwardBudget = jest.fn();
    mockedUseApp.mockReturnValue(appState({
      budgets: [budget()],
      forwardBudget,
    }) as any);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<BudgetScreen />); });
    act(() => { touchableContaining(renderer, 'September 2026 Budget').props.onPress(); });
    act(() => { touchables(renderer, 'Forward to MD').at(-1)?.props.onPress(); });

    const noteInput = renderer.root.findByType('TextInput' as any);
    act(() => { noteInput.props.onChangeText('All amounts verified.'); });
    await act(async () => {
      await touchables(renderer, 'Forward to MD').at(-1)?.props.onPress();
    });

    expect(forwardBudget).toHaveBeenCalledWith(7, 'All amounts verified.');
    act(() => renderer.unmount());
  });

  it.each(['md', 'ceo', 'admin'] as const)(
    'lets %s approve or reject a forwarded budget from another branch',
    async role => {
      const approveBudget = jest.fn();
      const rejectBudget = jest.fn();
      mockedUseApp.mockReturnValue(appState({
        role,
        userName: role === 'md' ? 'Managing Director' : role === 'ceo' ? 'Chief Executive Officer' : 'Admin',
        budgets: [budget({ status: 'acc_forwarded' })],
        approveBudget,
        rejectBudget,
      }) as any);

      let renderer!: ReactTestRenderer;
      act(() => { renderer = create(<BudgetScreen />); });
      act(() => { touchableContaining(renderer, 'September 2026 Budget').props.onPress(); });
      expect(touchable(renderer, 'Approve')).toBeTruthy();
      expect(touchable(renderer, 'Reject')).toBeTruthy();

      press(renderer, 'Approve');
      const noteInput = renderer.root.findByType('TextInput' as any);
      act(() => { noteInput.props.onChangeText('Approved after review.'); });
      press(renderer, 'Confirm Approval');
      expect(approveBudget).toHaveBeenCalledWith(7, 'Approved after review.');

      act(() => renderer.unmount());
    },
  );
});