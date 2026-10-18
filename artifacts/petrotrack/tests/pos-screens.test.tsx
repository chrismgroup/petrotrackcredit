import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

import PosTerminalsScreen from '@/app/(app)/pos-terminals';
import PosTransactionsScreen from '@/app/(app)/pos-transactions';
import { ShiftPosSummary } from '@/components/ShiftPosSummary';
import { useApp } from '@/context/AppContext';
import { paymentsApi } from '@/lib/api';
import { formatKobo, nairaToKobo, rangeStart } from '@/lib/pos';

jest.mock('react-native', () => {
  const React = require('react');
  const primitive = (name: string) => ({ children, ...props }: any) =>
    React.createElement(name, props, children);
  return {
    ActivityIndicator: primitive('ActivityIndicator'),
    RefreshControl: primitive('RefreshControl'),
    ScrollView: primitive('ScrollView'),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: primitive('Text'),
    TextInput: primitive('TextInput'),
    TouchableOpacity: primitive('TouchableOpacity'),
    View: primitive('View'),
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/ScreenLayout', () => {
  const React = require('react');
  return { ScreenLayout: ({ children }: any) => React.createElement('ScreenLayout', null, children) };
});
jest.mock('@/hooks/useColors', () => ({
  useColors: () => new Proxy({}, { get: () => '#123456' }),
}));
jest.mock('@/context/AppContext', () => ({ useApp: jest.fn() }));
jest.mock('@/lib/api', () => ({
  paymentsApi: {
    config: jest.fn(),
    terminals: jest.fn(),
    registerTerminal: jest.fn(),
    disableTerminal: jest.fn(),
    transactions: jest.fn(),
    shiftSummary: jest.fn(),
    simulate: jest.fn(),
  },
}));

const mockedUseApp = useApp as jest.MockedFunction<typeof useApp>;
const api = paymentsApi as jest.Mocked<typeof paymentsApi>;

const branches = [{ id: 'b1', name: 'Uyo Main' }, { id: 'b2', name: 'Eket' }];
const pumps = [
  { id: 'p1', name: 'Pump 1', branchId: 'b1' },
  { id: 'p2', name: 'Pump 2', branchId: 'b1' },
];

function appState(role: string) {
  return { role, branches, pumps } as unknown as ReturnType<typeof useApp>;
}

function nodeText(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === 'string' ? child : nodeText(child as ReactTestInstance)).join('');
}

function allText(renderer: ReactTestRenderer): string {
  return nodeText(renderer.root);
}

function button(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  const match = renderer.root.findAll(node => String(node.type) === 'TouchableOpacity' && nodeText(node) === label);
  if (!match.length) throw new Error(`No button "${label}"`);
  return match[0];
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  jest.useFakeTimers();
  api.transactions.mockResolvedValue({
    transactions: [{
      id: 't1', provider: 'sandbox', providerTransactionId: 'txn_1', terminalId: 'u1', terminalLabel: 'Pump 1 POS',
      providerTerminalId: '2KUD0001', branchId: 'b1', pumpId: 'p1', method: 'card', status: 'successful',
      amountKobo: 1_500_000, occurredAt: '2026-10-18T10:00:00Z', recordedAt: '2026-10-18T10:00:01Z',
      reversalOfProviderTransactionId: null, metadata: { reference: 'RRN123' },
    }],
    totals: { count: 1, cardKobo: 1_500_000, transferKobo: 250_000, reversalKobo: 50_000, failedCount: 2, netKobo: 1_700_000 },
  });
  api.config.mockResolvedValue({ providers: [
    { id: 'sandbox', label: 'Petrotrack sandbox', ready: true },
    { id: 'moniepoint', label: 'Moniepoint POS', ready: false },
  ] });
  api.terminals.mockResolvedValue({ terminals: [{
    id: '11111111-2222-4333-8444-555555555555', provider: 'sandbox', providerTerminalId: '2KUD0001',
    branchId: 'b1', pumpId: 'p1', label: 'Pump 1 POS', status: 'active', createdAt: '', disabledAt: null,
  }] });
});

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('POS helpers', () => {
  it('formats kobo and parses naira input safely', () => {
    expect(formatKobo(1_500_050)).toBe('₦15,000.50');
    expect(nairaToKobo('15,000.5')).toBe(1_500_050);
    expect(nairaToKobo('₦ 200')).toBe(20_000);
    for (const bad of ['', '0', '-5', 'abc', '1.234']) expect(nairaToKobo(bad)).toBeNull();
  });

  it('computes local period starts', () => {
    const now = new Date(2026, 9, 18, 15, 30);
    expect(rangeStart('today', now)).toEqual(new Date(2026, 9, 18));
    expect(rangeStart('7d', now)).toEqual(new Date(2026, 9, 12));
  });
});

describe('POS Transactions screen', () => {
  it('shows webhook-recorded transactions with totals and refreshes periodically', async () => {
    mockedUseApp.mockReturnValue(appState('acc'));
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<PosTransactionsScreen />); });
    await flush();

    const text = allText(renderer);
    expect(text).toContain('₦17,000.00');
    expect(text).toContain('₦15,000.00');
    expect(text).toContain('Pump 1 POS');
    expect(text).toContain('Pump 1');
    expect(text).toContain('Uyo Main');
    expect(text).toContain('RRN123');
    expect(renderer.root.findAll(node => node.props.testID === 'pos-transaction-row' && String(node.type) === 'View')).toHaveLength(1);

    expect(api.transactions).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(30_000); });
    await flush();
    expect(api.transactions).toHaveBeenCalledTimes(2);
    act(() => renderer.unmount());
  });

  it('filters by branch, pump and payment type', async () => {
    mockedUseApp.mockReturnValue(appState('admin'));
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<PosTransactionsScreen />); });
    await flush();
    act(() => { button(renderer, 'Uyo Main').props.onPress(); });
    await flush();
    act(() => { button(renderer, 'Pump 2').props.onPress(); });
    await flush();
    act(() => { button(renderer, 'Transfer').props.onPress(); });
    await flush();
    expect(api.transactions).toHaveBeenLastCalledWith(expect.objectContaining({ branchId: 'b1', pumpId: 'p2', method: 'transfer' }));
    act(() => renderer.unmount());
  });

  it('renders nothing for attendants', () => {
    mockedUseApp.mockReturnValue(appState('att'));
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<PosTransactionsScreen />); });
    expect(renderer.toJSON()).toBeNull();
    act(() => renderer.unmount());
  });
});

describe('POS Terminals screen', () => {
  it('lists terminals with their UUID and blocks pumps that already have a terminal', async () => {
    mockedUseApp.mockReturnValue(appState('admin'));
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<PosTerminalsScreen />); });
    await flush();

    expect(allText(renderer)).toContain('UUID 11111111-2222-4333-8444-555555555555');
    expect(allText(renderer)).toContain('Awaiting Moniepoint webhook docs');
    act(() => { button(renderer, 'Uyo Main').props.onPress(); });
    expect(button(renderer, 'Pump 1 (has POS)').props.disabled).toBe(true);
    expect(button(renderer, 'Pump 2').props.disabled).toBeFalsy();
    act(() => renderer.unmount());
  });

  it('registers a terminal against the selected branch and pump', async () => {
    mockedUseApp.mockReturnValue(appState('admin'));
    api.registerTerminal.mockResolvedValue({ terminal: {} as never });
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<PosTerminalsScreen />); });
    await flush();

    const inputs = renderer.root.findAll(node => String(node.type) === 'TextInput');
    act(() => { inputs.find(i => i.props.accessibilityLabel === 'Terminal ID')!.props.onChangeText('2KUD0002'); });
    act(() => { inputs.find(i => i.props.accessibilityLabel === 'Terminal label')!.props.onChangeText('Pump 2 POS'); });
    act(() => { button(renderer, 'Uyo Main').props.onPress(); });
    act(() => { button(renderer, 'Pump 2').props.onPress(); });
    await act(async () => { await button(renderer, 'Register terminal').props.onPress(); });

    expect(api.registerTerminal).toHaveBeenCalledWith({
      provider: 'sandbox', providerTerminalId: '2KUD0002', label: 'Pump 2 POS', branchId: 'b1', pumpId: 'p2',
    });
    act(() => renderer.unmount());
  });

  it('shows the server error when registration is rejected', async () => {
    mockedUseApp.mockReturnValue(appState('admin'));
    api.registerTerminal.mockResolvedValue({ error: 'This terminal ID is already registered.', status: 409 } as never);
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<PosTerminalsScreen />); });
    await flush();
    const inputs = renderer.root.findAll(node => String(node.type) === 'TextInput');
    act(() => { inputs.find(i => i.props.accessibilityLabel === 'Terminal ID')!.props.onChangeText('2KUD0001'); });
    act(() => { inputs.find(i => i.props.accessibilityLabel === 'Terminal label')!.props.onChangeText('Dup'); });
    act(() => { button(renderer, 'Uyo Main').props.onPress(); });
    act(() => { button(renderer, 'Pump 2').props.onPress(); });
    await act(async () => { await button(renderer, 'Register terminal').props.onPress(); });
    expect(allText(renderer)).toContain('This terminal ID is already registered.');
    act(() => renderer.unmount());
  });

  it('requires a second tap before disabling a terminal', async () => {
    mockedUseApp.mockReturnValue(appState('admin'));
    api.disableTerminal.mockResolvedValue({ terminal: {} as never });
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<PosTerminalsScreen />); });
    await flush();
    act(() => { button(renderer, 'Disable terminal').props.onPress(); });
    expect(api.disableTerminal).not.toHaveBeenCalled();
    await act(async () => { await button(renderer, 'Tap again to confirm').props.onPress(); });
    expect(api.disableTerminal).toHaveBeenCalledWith('11111111-2222-4333-8444-555555555555');
    act(() => renderer.unmount());
  });

  it('is admin-only', () => {
    mockedUseApp.mockReturnValue(appState('mgr'));
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<PosTerminalsScreen />); });
    expect(renderer.toJSON()).toBeNull();
    act(() => renderer.unmount());
  });
});

describe('Shift report POS summary', () => {
  const summary = {
    transactions: [
      { id: 'a', method: 'card', status: 'successful', amountKobo: 1_500_000, occurredAt: '2026-10-18T08:00:00Z' },
      { id: 'b', method: 'transfer', status: 'successful', amountKobo: 250_000, occurredAt: '2026-10-18T09:00:00Z' },
      { id: 'c', method: 'card', status: 'reversal', amountKobo: 50_000, occurredAt: '2026-10-18T10:00:00Z' },
    ],
    totals: {
      count: 3, cardKobo: 1_500_000, transferKobo: 250_000, reversalKobo: 50_000, failedCount: 1,
      netKobo: 1_700_000, cardNetKobo: 1_450_000, transferNetKobo: 250_000,
      firstAt: '2026-10-18T08:00:00Z', lastAt: '2026-10-18T10:00:00Z',
    },
    terminals: [{ id: 'u1', label: 'Pump 1 POS', provider: 'sandbox', providerTerminalId: '2KUD0001', status: 'active' }],
    window: { from: '2026-10-17T23:00:00Z', to: '2026-10-18T23:00:00Z' },
  };

  beforeEach(() => { api.shiftSummary.mockResolvedValue(summary as never); });

  it.each(['att', 'mgr', 'md', 'acc', 'ceo', 'csm', 'mktg', 'admin'])('shows the whole-shift POS total to %s', async role => {
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ShiftPosSummary role={role} pumpId="p1" branchId="b1" date="2026-10-18" />); });
    await flush();
    expect(api.shiftSummary).toHaveBeenCalledWith({ pumpId: 'p1', date: '2026-10-18', branchId: 'b1' });
    const total = renderer.root.find(node => node.props.testID === 'shift-pos-total' && String(node.type) === 'Text');
    expect(nodeText(total)).toBe('₦17,000.00');
    act(() => renderer.unmount());
  });

  it('is hidden for unknown roles and does not call the API', () => {
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ShiftPosSummary role={null} pumpId="p1" date="2026-10-18" />); });
    expect(renderer.toJSON()).toBeNull();
    expect(api.shiftSummary).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  it('shows the breakdown, terminal, comparison with entered amounts and transactions', async () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<ShiftPosSummary role="mgr" pumpId="p1" date="2026-10-18" reportedPos={14500} reportedTransfer={3000} />);
    });
    await flush();
    const text = allText(renderer);
    expect(text).toContain('₦14,500.00');
    expect(text).toContain('₦2,500.00');
    expect(text).toContain('₦500.00');
    expect(text).toContain('3 (1 failed)');
    expect(text).toContain('Pump 1 POS (2KUD0001)');
    expect(text).toContain('Matches terminal');
    expect(text).toContain('+₦500.00 vs terminal');
    act(() => { button(renderer, 'Show 3 transactions').props.onPress(); });
    expect(renderer.root.findAll(node => node.props.testID === 'shift-pos-row' && String(node.type) === 'View')).toHaveLength(3);
    act(() => renderer.unmount());
  });

  it('explains when the pump has no terminal and refreshes while live', async () => {
    api.shiftSummary.mockResolvedValue({ ...summary, transactions: [], terminals: [], totals: { ...summary.totals, count: 0, netKobo: 0 } } as never);
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ShiftPosSummary role="att" pumpId="p1" date="2026-10-18" live />); });
    await flush();
    expect(allText(renderer)).toContain('No POS terminal is assigned to this pump yet.');
    act(() => { jest.advanceTimersByTime(30_000); });
    await flush();
    expect(api.shiftSummary).toHaveBeenCalledTimes(2);
    act(() => renderer.unmount());
  });
});
