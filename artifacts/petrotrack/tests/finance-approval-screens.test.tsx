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
  useBusinessDateConfirmation: () => {
    const React = require('react');
    const [pending, setPending] = React.useState(
      null as null | { callback: () => void; actionLabel: string },
    );
    return {
      requestDateConfirmation: (
        _label: string,
        _date: string,
        callback: () => void,
        actionLabel = 'Confirm & submit',
      ) => setPending({ callback, actionLabel }),
      confirmationContent: pending
        ? React.createElement(
            'TouchableOpacity',
            {
              onPress: () => {
                const callback = pending.callback;
                setPending(null);
                callback();
              },
            },
            React.createElement('Text', null, pending.actionLabel),
          )
        : null,
      hasPendingConfirmation: pending !== null,
      confirmationModal: null,
    };
  },
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
    classifyBudgetBranch: jest.fn(async () => ({ ok: true })),
    consolidateBudgetMonth: jest.fn(async () => ({
      ok: true,
      result: { canonicalBudgets: [], archivedBudgetIds: [] },
    })),
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
  it('does not show the removed expense reporting and scorecard sections', () => {
    mockedUseApp.mockReturnValue(appState() as any);
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ExpensesScreen />); });
    const text = nodeText(renderer.root);
    expect(text).not.toContain('Reporting business date');
    expect(text).not.toContain('Expenses for a period');
    expect(text).not.toContain('Daily expenses');
    expect(text).not.toContain('Approved expense scorecards');
    act(() => renderer.unmount());
  });

  it('resolves an expense branch label from its canonical branch ID', () => {
    mockedUseApp.mockReturnValue(appState({
      expenses: [expense({
        branchId: 'branch-b',
        branchName: '',
        byName: 'Uyo Manager',
      })],
    }) as any);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ExpensesScreen />); });
    expect(nodeText(renderer.root)).toContain('Wuse Branch · by Uyo Manager');
    expect(nodeText(renderer.root)).not.toContain('Branch not assigned');
    act(() => renderer.unmount());
  });

  it('lets a branch manager select their fully approved legacy budget when its branch is inferred from ownership', () => {
    mockedUseApp.mockReturnValue(appState({
      role: 'mgr',
      userName: 'Iniobong Inyang Edward',
      branchId: 'branch-ikot-ekpene',
      budgets: [budget({
        id: 19,
        status: 'fully_approved',
        branchId: '',
        branchName: '',
        by: 'mgr',
        byName: 'Iniobong Inyang Edward',
      })],
    }) as any);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ExpensesScreen />); });
    const addButton = renderer.root.findAll(node =>
      String(node.type) === 'TouchableOpacity' && nodeText(node) === '',
    )[0];
    act(() => { addButton.props.onPress(); });

    expect(nodeText(renderer.root)).toContain('September 2026');
    expect(nodeText(renderer.root)).not.toContain('No approved budgets available');
    act(() => renderer.unmount());
  });

  it('refreshes approved budgets before opening a new expense and preselects the refreshed budget', async () => {
    const state = appState({
      role: 'mgr',
      userName: 'Iniobong Inyang Edward',
      branchId: 'branch-ikot-ekpene',
      budgets: [],
    }) as any;
    state.refreshFinanceState = jest.fn(async () => {
      state.budgets = [budget({
        id: 23,
        status: 'fully_approved',
        branchId: 'branch-ikot-ekpene',
        branchName: 'Ikot Ekpene Branch',
      })];
      return true;
    });
    mockedUseApp.mockReturnValue(state);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ExpensesScreen />); });
    const addButton = renderer.root.findAll(node =>
      String(node.type) === 'TouchableOpacity' && nodeText(node) === '',
    )[0];

    await act(async () => {
      await addButton.props.onPress();
    });

    expect(state.refreshFinanceState).toHaveBeenCalledTimes(1);
    const budgetChoice = touchableContaining(renderer, 'Ikot Ekpene Branch · September 2026');
    expect(budgetChoice.props.onPress).toEqual(expect.any(Function));
    expect(budgetChoice.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ backgroundColor: '#1a6e3c' }),
    ]));
    act(() => renderer.unmount());
  });

  it('keeps the expense form open and blocks stale submission when budget refresh fails', async () => {
    const addExpense = jest.fn(async () => ({ ok: true }));
    const state = appState({
      role: 'mgr',
      userName: 'Iniobong Inyang Edward',
      branchId: 'branch-ikot-ekpene',
      budgets: [budget({
        id: 24,
        status: 'fully_approved',
        branchId: 'branch-ikot-ekpene',
        branchName: 'Ikot Ekpene Branch',
      })],
      addExpense,
    }) as any;
    state.refreshFinanceState = jest.fn(async () => false);
    mockedUseApp.mockReturnValue(state);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ExpensesScreen />); });
    const addButton = renderer.root.findAll(node =>
      String(node.type) === 'TouchableOpacity' && nodeText(node) === '',
    )[0];

    await act(async () => {
      await addButton.props.onPress();
    });

    expect(nodeText(renderer.root)).toContain('New Expense');
    expect(nodeText(renderer.root)).toContain('Could not refresh approved budgets. Please retry before submitting this expense.');

    const inputs = renderer.root.findAll(node => String(node.type) === 'TextInput');
    act(() => {
      inputs[0].props.onChangeText('Stale budget should not submit');
      inputs[1].props.onChangeText('25000');
    });
    await act(async () => {
      await touchable(renderer, 'Submit Expense').props.onPress();
    });

    expect(addExpense).not.toHaveBeenCalled();
    expect(nodeText(renderer.root)).toContain('Please retry before submitting this expense.');
    act(() => renderer.unmount());
  });

  it('submits an expense against the manager fully approved branch budget', async () => {
    const addExpense = jest.fn(async () => ({ ok: true }));
    mockedUseApp.mockReturnValue(appState({
      role: 'mgr',
      userName: 'Iniobong Inyang Edward',
      branchId: 'B1784296845861',
      budgets: [budget({
        id: 1,
        status: 'fully_approved',
        branchId: 'B1784296845861',
        branchName: 'Ikot Ekpene Gas Plant',
      })],
      addExpense,
    }) as any);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ExpensesScreen />); });
    const addButton = renderer.root.findAll(node =>
      String(node.type) === 'TouchableOpacity' && nodeText(node) === '',
    )[0];
    act(() => { addButton.props.onPress(); });

    const inputs = renderer.root.findAll(node => String(node.type) === 'TextInput');
    act(() => {
      inputs[0].props.onChangeText('Station generator fuel');
      inputs[1].props.onChangeText('25000');
    });
    await act(async () => {
      await touchable(renderer, 'Submit Expense').props.onPress();
      await Promise.resolve();
    });
    expect(addExpense).not.toHaveBeenCalled();
    expect(nodeText(renderer.root)).toContain('Confirm & save');
    expect(nodeText(renderer.root)).not.toContain('New Expense');

    await act(async () => {
      await touchable(renderer, 'Confirm & save').props.onPress();
      await Promise.resolve();
    });

    expect(addExpense).toHaveBeenCalledWith(expect.objectContaining({
      budgetId: 1,
      by: 'mgr',
      byName: 'Iniobong Inyang Edward',
      desc: 'Station generator fuel',
      amt: 25000,
    }));
    act(() => renderer.unmount());
  });

  it('explains why a manager cannot submit until the new budget is fully approved', () => {
    mockedUseApp.mockReturnValue(appState({
      role: 'mgr',
      userName: 'Iniobong Inyang Edward',
      branchId: 'branch-ikot-ekpene',
      budgets: [budget({
        id: 20,
        status: 'submitted',
        branchId: 'branch-ikot-ekpene',
        branchName: 'Ikot Ekpene Branch',
      })],
    }) as any);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ExpensesScreen />); });
    const addButton = renderer.root.findAll(node =>
      String(node.type) === 'TouchableOpacity' && nodeText(node) === '',
    )[0];
    act(() => { addButton.props.onPress(); });

    expect(nodeText(renderer.root)).toContain('No approved budgets available');
    expect(nodeText(renderer.root)).toContain('Expenses can only be submitted against a fully approved budget');
    act(() => renderer.unmount());
  });

  it('lets the accountant review a pending expense and forward it to MD', async () => {
    const forwardExpenseToMDConfirmed = jest.fn(async () => ({ ok: true }));
    const rejectExpenseConfirmed = jest.fn(async () => ({ ok: true }));
    mockedUseApp.mockReturnValue(appState({
      expenses: [expense()],
      forwardExpenseToMDConfirmed,
      rejectExpenseConfirmed,
    }) as any);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ExpensesScreen />); });

    await act(async () => {
      await touchable(renderer, 'Forward to MD').props.onPress();
    });
    expect(forwardExpenseToMDConfirmed).toHaveBeenCalledWith(41);
    expect(Alert.alert).toHaveBeenCalledWith('Saved', 'Expense forwarded to MD.');

    await act(async () => {
      await touchable(renderer, 'Reject').props.onPress();
    });
    expect(rejectExpenseConfirmed).toHaveBeenCalledWith(41);

    act(() => renderer.unmount());
  });

  it('blocks duplicate expense forwards and recovers after a server rejection', async () => {
    let resolveApproval!: (result: { ok: boolean; error?: string }) => void;
    const forwardExpenseToMDConfirmed = jest.fn(() => new Promise<{ ok: boolean; error?: string }>(resolve => {
      resolveApproval = resolve;
    }));
    mockedUseApp.mockReturnValue(appState({
      expenses: [expense()],
      forwardExpenseToMDConfirmed,
    }) as any);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ExpensesScreen />); });
    const approveButton = touchable(renderer, 'Forward to MD');
    let pendingApproval!: Promise<unknown>;
    act(() => { pendingApproval = approveButton.props.onPress(); });

    expect(approveButton.props.disabled).toBe(true);
    act(() => { approveButton.props.onPress(); });
    expect(forwardExpenseToMDConfirmed).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveApproval({ ok: false, error: 'This expense was already reviewed.' });
      await pendingApproval;
    });

    expect(Alert.alert).not.toHaveBeenCalledWith('Saved', expect.anything());
    expect(touchable(renderer, 'Forward to MD').props.disabled).toBe(false);
    act(() => renderer.unmount());
  });

  it.each(['acc', 'admin'] as const)('lets %s open and run monthly budget consolidation', async role => {
    const consolidateBudgetMonth = jest.fn(async () => ({
      ok: true,
      result: { canonicalBudgets: [budget({ status: 'submitted' })], archivedBudgetIds: [8] },
    }));
    mockedUseApp.mockReturnValue(appState({
      role,
      budgets: [budget({ status: 'fully_approved' })],
      branches: [
        { id: 'branch-a', name: 'Maitama Branch', st: 'Active' },
        { id: 'head-office', name: 'Head office', st: 'Active' },
      ],
      consolidateBudgetMonth,
    }) as any);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<BudgetScreen />); });
    expect(touchable(renderer, 'Consolidate a month')).toBeTruthy();
    press(renderer, 'Consolidate a month');
    expect(nodeText(renderer.root)).toContain('Head office');

    await act(async () => {
      await touchable(renderer, 'Consolidate budgets').props.onPress();
    });
    expect(consolidateBudgetMonth).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      'head-office',
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Budgets consolidated',
      expect.stringContaining('1 branch budgets are now active'),
    );
    act(() => renderer.unmount());
  });

  it('shows near-exhaustion at 85% and overspent performance states', () => {
    mockedUseApp.mockReturnValue(appState({
      budgets: [
        budget({
          id: 7,
          label: 'September 2026',
          total: 100_000,
          items: [{ cat: 'Operations', amt: 100_000 }],
          status: 'fully_approved',
        }),
        budget({
          id: 8,
          label: 'October 2026',
          total: 100_000,
          items: [{ cat: 'Operations', amt: 100_000 }],
          status: 'fully_approved',
        }),
      ],
      expenses: [
        expense({ id: 51, budgetId: 7, status: 'approved', amt: 85_000 }),
        expense({ id: 52, budgetId: 8, status: 'approved', amt: 110_000 }),
      ],
    }) as any);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<BudgetScreen />); });
    press(renderer, 'All Budgets');

    act(() => { touchableContaining(renderer, 'September 2026 Budget').props.onPress(); });
    expect(nodeText(renderer.root)).toContain('85%');
    expect(nodeText(renderer.root)).toContain('⚠ Near');

    act(() => { touchableContaining(renderer, 'October 2026 Budget').props.onPress(); });
    expect(nodeText(renderer.root)).toContain('110%');
    expect(nodeText(renderer.root)).toContain('⬆ Over');
    act(() => renderer.unmount());
  });

  it(
    'lets MD approve or reject an Accountant-forwarded expense',
    async () => {
      const approveExpenseConfirmed = jest.fn(async () => ({ ok: true }));
      const rejectExpenseConfirmed = jest.fn(async () => ({ ok: true }));
      mockedUseApp.mockReturnValue(appState({
        role: 'md',
        expenses: [expense({ status: 'acc_forwarded' })],
        approveExpenseConfirmed,
        rejectExpenseConfirmed,
      }) as any);

      let renderer!: ReactTestRenderer;
      act(() => { renderer = create(<ExpensesScreen />); });
      await act(async () => { await touchable(renderer, 'Approve & Lock').props.onPress(); });
      expect(approveExpenseConfirmed).toHaveBeenCalledWith(41);
      expect(Alert.alert).toHaveBeenCalledWith('Saved', 'Expense approved.');
      await act(async () => { await touchable(renderer, 'Reject').props.onPress(); });
      expect(rejectExpenseConfirmed).toHaveBeenCalledWith(41);
      act(() => renderer.unmount());
    },
  );

  it('shows pending approval, approved, and all expense views without the workflow label', () => {
    mockedUseApp.mockReturnValue(appState({
      role: 'md',
      expenses: [
        expense({ id: 41, desc: 'Pending generator fuel', status: 'pending' }),
        expense({ id: 42, desc: 'Approved security', status: 'approved', approvedBy: 'Accountant' }),
        expense({ id: 43, desc: 'Returned utilities', status: 'rejected' }),
      ],
    }) as any);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ExpensesScreen />); });

    expect(nodeText(renderer.root)).toContain('Pending Approval');
    expect(nodeText(renderer.root).indexOf('Pending Approval')).toBeLessThan(nodeText(renderer.root).indexOf("Today's Net Balance"));
    expect(nodeText(renderer.root)).not.toContain('Workflow');
    expect(nodeText(renderer.root)).toContain('Pending generator fuel');

    press(renderer, 'Approved');
    expect(nodeText(renderer.root)).toContain('Approved security');
    expect(nodeText(renderer.root)).not.toContain('Pending generator fuel');

    press(renderer, 'All Expenses');
    expect(nodeText(renderer.root)).toContain('Pending generator fuel');
    expect(nodeText(renderer.root)).toContain('Approved security');
    expect(nodeText(renderer.root)).toContain('Returned utilities');
    act(() => renderer.unmount());
  });

  it.each(['ceo', 'admin'] as const)(
    'does not show expense decision controls to %s',
    role => {
      mockedUseApp.mockReturnValue(appState({
        role,
        expenses: [expense({ status: 'acc_forwarded' })],
      }) as any);

      let renderer!: ReactTestRenderer;
      act(() => { renderer = create(<ExpensesScreen />); });
      expect(touchables(renderer, 'Approve')).toHaveLength(0);
      expect(touchables(renderer, 'Reject')).toHaveLength(0);
      const repairControls = renderer.root.findAll(node =>
        node.props.accessibilityLabel === 'Repair legacy expense branches',
      );
      expect(repairControls.length > 0).toBe(role === 'admin');
      act(() => renderer.unmount());
    },
  );

  it('shows the server reason when the accountant rejection is refused', async () => {
    const rejectExpenseConfirmed = jest.fn(async () => ({
      ok: false,
      error: 'This record has already been approved by another reviewer.',
    }));
    mockedUseApp.mockReturnValue(appState({
      role: 'acc',
      expenses: [expense()],
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
  it('locks manager budget submission and ignores repeated confirmation taps', async () => {
    let resolveSubmit!: (result: { ok: boolean }) => void;
    const submitBudgetToAcc = jest.fn(() => new Promise<{ ok: boolean }>(resolve => {
      resolveSubmit = resolve;
    }));
    mockedUseApp.mockReturnValue(appState({
      role: 'mgr',
      userName: 'Station Manager',
      branchId: 'branch-a',
      budgets: [budget({
        status: 'draft',
        by: 'mgr',
        byName: 'Station Manager',
        branchId: 'branch-a',
        branchName: 'Maitama Branch',
      })],
      submitBudgetToAcc,
    }) as any);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<BudgetScreen />); });
    act(() => { touchableContaining(renderer, 'September 2026 Budget').props.onPress(); });
    act(() => { touchable(renderer, 'Submit to Accountant').props.onPress({ stopPropagation: jest.fn() }); });

    const alertCall = (Alert.alert as jest.Mock).mock.calls.at(-1);
    act(() => { alertCall[2][1].onPress(); });
    act(() => { alertCall[2][1].onPress(); });

    expect(submitBudgetToAcc).toHaveBeenCalledTimes(1);
    expect(submitBudgetToAcc).toHaveBeenCalledWith(7);
    const submittingButtons = touchables(renderer, 'Submitting…');
    expect(submittingButtons).toHaveLength(2);
    expect(submittingButtons.every(button => button.props.disabled)).toBe(true);

    await act(async () => {
      resolveSubmit({ ok: true });
      await Promise.resolve();
    });
    expect(touchables(renderer, 'Submitting…')).toHaveLength(0);
    act(() => renderer.unmount());
  });

  it('makes manager budget submission available again after the server rejects it', async () => {
    const submitBudgetToAcc = jest.fn(async () => ({ ok: false, error: 'Budget is already submitted.' }));
    mockedUseApp.mockReturnValue(appState({
      role: 'mgr',
      userName: 'Station Manager',
      branchId: 'branch-a',
      budgets: [budget({
        status: 'draft',
        by: 'mgr',
        byName: 'Station Manager',
        branchId: 'branch-a',
        branchName: 'Maitama Branch',
      })],
      submitBudgetToAcc,
    }) as any);

    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<BudgetScreen />); });
    act(() => { touchableContaining(renderer, 'September 2026 Budget').props.onPress(); });
    act(() => { touchable(renderer, 'Submit to Accountant').props.onPress({ stopPropagation: jest.fn() }); });

    let alertCall = (Alert.alert as jest.Mock).mock.calls.at(-1);
    await act(async () => {
      await alertCall[2][1].onPress();
    });

    const availableButtons = touchables(renderer, 'Submit to Accountant');
    expect(availableButtons).toHaveLength(2);
    expect(availableButtons.every(button => button.props.disabled)).toBe(false);

    act(() => { availableButtons[0].props.onPress({ stopPropagation: jest.fn() }); });
    alertCall = (Alert.alert as jest.Mock).mock.calls.at(-1);
    await act(async () => {
      await alertCall[2][1].onPress();
    });
    expect(submitBudgetToAcc).toHaveBeenCalledTimes(2);
    act(() => renderer.unmount());
  });

  it.each(['acc', 'md', 'ceo'] as const)(
    'lets %s classify an unassigned historical budget once',
    async role => {
      const classifyBudgetBranch = jest.fn(async () => ({ ok: true }));
      mockedUseApp.mockReturnValue(appState({
        role,
        budgets: [budget({ branchId: '', branchName: '', status: 'fully_approved' })],
        classifyBudgetBranch,
      }) as any);

      let renderer!: ReactTestRenderer;
      act(() => { renderer = create(<BudgetScreen />); });
      press(renderer, 'All Budgets');
      act(() => { touchableContaining(renderer, 'September 2026 Budget').props.onPress(); });
      expect(touchable(renderer, 'Confirm Branch Assignment').props.disabled).toBe(true);
      press(renderer, 'Wuse Branch');
      await act(async () => {
        await touchable(renderer, 'Confirm Branch Assignment').props.onPress();
      });

      expect(classifyBudgetBranch).toHaveBeenCalledWith(7, 'branch-b');
      act(() => renderer.unmount());
    },
  );

  it('lets the accountant forward a submitted budget from another branch to the MD', async () => {
    let resolveForward!: (result: { ok: boolean; error?: string }) => void;
    const forwardBudget = jest.fn(() => new Promise<{ ok: boolean; error?: string }>(resolve => {
      resolveForward = resolve;
    }));
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
    const confirmForward = touchables(renderer, 'Forward to MD').at(-1)!;
    let pendingForward!: Promise<unknown>;
    await act(async () => {
      pendingForward = confirmForward.props.onPress();
    });

    expect(forwardBudget).toHaveBeenCalledWith(7, 'All amounts verified.');
    expect(forwardBudget).toHaveBeenCalledTimes(1);
    expect(confirmForward.props.disabled).toBe(true);
    act(() => { confirmForward.props.onPress(); });
    expect(forwardBudget).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveForward({ ok: false, error: 'This budget was already forwarded.' });
      await pendingForward;
    });

    expect(Alert.alert).not.toHaveBeenCalledWith('Saved', expect.anything());
    expect(touchable(renderer, 'Forward to MD').props.disabled).toBeFalsy();
    expect(renderer.root.findByType('TextInput' as any).props.value).toBe('All amounts verified.');
    act(() => renderer.unmount());
  });

  it('confirms a successfully forwarded budget without confirming a rejected one', async () => {
    const forwardBudget = jest.fn(async () => ({ ok: true }));
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
      await touchables(renderer, 'Forward to MD').at(-1)!.props.onPress();
    });

    expect(forwardBudget).toHaveBeenCalledWith(7, 'All amounts verified.');
    expect(Alert.alert).toHaveBeenCalledWith('Saved', 'Budget forwarded to MD.');
    expect(renderer.root.findAll(node => String(node.type) === 'TextInput')).toHaveLength(0);
    act(() => renderer.unmount());
  });

  it.each(['md', 'ceo', 'admin'] as const)(
    'lets %s approve or reject a forwarded budget from another branch',
    async role => {
      const approveBudget = jest.fn(async () => ({ ok: true }));
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
      await act(async () => {
        await touchable(renderer, 'Confirm Approval').props.onPress();
      });
      expect(approveBudget).toHaveBeenCalledWith(7, 'Approved after review.');
      expect(Alert.alert).toHaveBeenCalledWith('Saved', 'Budget approved.');

      act(() => renderer.unmount());
    },
  );
});
