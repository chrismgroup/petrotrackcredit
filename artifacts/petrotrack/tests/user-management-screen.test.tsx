import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

import UsersScreen from '@/app/(app)/users';
import { useApp } from '@/context/AppContext';

jest.mock('react-native', () => {
  const React = require('react');
  const primitive = (name: string) => ({ children, ...props }: any) =>
    React.createElement(name, props, children);
  return {
    Alert: { alert: jest.fn() },
    Platform: { OS: 'web', select: (options: Record<string, unknown>) => options.web ?? options.default ?? options.native },
    ScrollView: primitive('ScrollView'),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: primitive('Text'),
    TextInput: primitive('TextInput'),
    TouchableOpacity: primitive('TouchableOpacity'),
    TurboModuleRegistry: { get: jest.fn(() => null), getEnforcing: jest.fn(() => null) },
    View: primitive('View'),
  };
});

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/FormSheet', () => ({ ModalSheet: () => null }));
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
    ScreenLayout: ({ children }: any) => React.createElement('ScreenLayout', null, children),
  };
});
jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#fff', surface: '#fafafa', border: '#ddd', inputBorder: '#ccc',
    text: '#111', textMuted: '#666', textSubtle: '#999', primary: '#185fa5',
    success: '#1a6e3c', error: '#a32d2d', errorBg: '#fcebeb', errorBorder: '#e0a5a5',
  }),
}));
jest.mock('@/context/AppContext', () => ({
  GLOBAL_OVERVIEW_ROLES: new Set(['admin', 'ceo', 'md', 'mktg', 'csm', 'acc']),
  ROLE_COLORS: { admin: '#633806', csm: '#0d6e56', att: '#374151' },
  ROLE_LABELS: { admin: 'Admin', csm: 'HR', att: 'Attendant' },
  useApp: jest.fn(),
}));

const mockedUseApp = useApp as jest.MockedFunction<typeof useApp>;

function nodeText(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === 'string' ? child : nodeText(child as ReactTestInstance)).join('');
}

async function press(renderer: ReactTestRenderer, label: string) {
  const target = renderer.root.findAll(node =>
    String(node.type) === 'TouchableOpacity' && nodeText(node).includes(label),
  )[0];
  if (!target) throw new Error(`Missing button: ${label}`);
  await act(async () => { await target.props.onPress(); });
}

test('HR can manage registered users and reconcile the staff directory', async () => {
  const reconcileUserStaffDirectory = jest.fn(async () => ({
    added: 1,
    linked: 1,
    createdAccounts: 0,
    idsAssigned: 2,
    idFailures: 0,
    ambiguousAccountIds: [],
    unassigned: 0,
  }));
  mockedUseApp.mockReturnValue({
    role: 'csm',
    userName: 'hr.manager',
    userAccounts: [],
    branches: [{ id: 'HQ', name: 'Head Office', st: 'Active', rev: 0, mgr: '', pumps: 0, tanks: 0 }],
    staff: [],
    addActiveUserAccount: jest.fn(),
    enrollStaff: jest.fn(),
    mdApproveEnrollment: jest.fn(),
    mdRejectEnrollment: jest.fn(),
    approveUserAccount: jest.fn(),
    updateUserAccount: jest.fn(),
    updateEnrollmentData: jest.fn(),
    suspendUserAccount: jest.fn(),
    reactivateUserAccount: jest.fn(),
    rejectUserAccount: jest.fn(),
    deleteUserAccount: jest.fn(),
    deleteStaff: jest.fn(),
    reconcileUserStaffDirectory,
  } as any);

  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<UsersScreen />); });
  expect(nodeText(renderer.root)).toContain('All Registered Users');
  expect(nodeText(renderer.root)).toContain('All Staff');
  expect(nodeText(renderer.root)).toContain('Enroll');

  await press(renderer, 'All Staff');
  expect(nodeText(renderer.root)).toContain('Sync Users to Staff Directory');
  await press(renderer, 'Sync Users to Staff Directory');
  expect(reconcileUserStaffDirectory).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});