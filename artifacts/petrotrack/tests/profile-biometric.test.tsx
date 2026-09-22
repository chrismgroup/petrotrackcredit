import React from 'react';
import { Platform } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';

const mockAuthenticate = jest.fn();
const mockHasHardware = jest.fn();
const mockIsEnrolled = jest.fn();
const mockSupportedTypes = jest.fn();
const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockDeleteItem = jest.fn();
const mockApiLogin = jest.fn();

jest.mock('react-native', () => {
  const React = require('react');
  const primitive = (name: string) => ({ children, ...props }: any) =>
    React.createElement(name, props, children);
  return {
    Alert: { alert: jest.fn() },
    Linking: { canOpenURL: jest.fn(async () => true), openURL: jest.fn(async () => undefined) },
    Modal: primitive('Modal'),
    Platform: {
      OS: 'web',
      select: (options: Record<string, unknown>) => options.web ?? options.default ?? options.native,
    },
    ScrollView: primitive('ScrollView'),
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
    Switch: primitive('Switch'),
    Text: primitive('Text'),
    TextInput: primitive('TextInput'),
    TouchableOpacity: primitive('TouchableOpacity'),
    View: primitive('View'),
  };
});

jest.mock('expo-local-authentication', () => ({
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
  },
  hasHardwareAsync: () => mockHasHardware(),
  isEnrolledAsync: () => mockIsEnrolled(),
  supportedAuthenticationTypesAsync: () => mockSupportedTypes(),
  authenticateAsync: (options: unknown) => mockAuthenticate(options),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: (...args: unknown[]) => mockGetItem(...args),
  setItemAsync: (...args: unknown[]) => mockSetItem(...args),
  deleteItemAsync: (...args: unknown[]) => mockDeleteItem(...args),
}));

jest.mock('@/context/AppContext', () => ({
  ROLE_COLORS: { att: '#1a6e3c' },
  ROLE_LABELS: { att: 'Attendant' },
  UINFO: { att: { name: 'Attendant', initials: 'AT' } },
  useApp: () => ({
    role: 'att',
    userName: 'Attendant User',
    accountUsername: 'operator',
    branchId: 'branch-1',
    staffId: 1,
    navItems: [],
    unreadCount: () => 0,
    changeOwnPassword: jest.fn(),
    logout: jest.fn(async () => undefined),
  }),
}));

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
    error: '#b91c1c',
  }),
}));

jest.mock('@/lib/api', () => ({
  apiLogin: (...args: unknown[]) => mockApiLogin(...args),
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

jest.mock('@/components/ScreenLayout', () => ({
  ScreenLayout: ({ children }: any) => require('react').createElement('ScreenLayout', null, children),
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import ProfileScreen from '../app/(app)/profile';

async function renderProfile(os: 'web' | 'ios' | 'android'): Promise<ReactTestRenderer> {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ProfileScreen />);
    await Promise.resolve();
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHasHardware.mockResolvedValue(true);
  mockIsEnrolled.mockResolvedValue(true);
  mockSupportedTypes.mockResolvedValue([2]);
  mockGetItem.mockImplementation((key: string) => key === 'petrotrack_biometric_enabled_v1' ? 'enabled' : null);
  mockSetItem.mockResolvedValue(undefined);
  mockDeleteItem.mockResolvedValue(undefined);
  mockApiLogin.mockResolvedValue({
    token: 'token',
    role: 'att',
    empName: 'Attendant User',
    staffId: 1,
    branchId: 'branch-1',
  });
  mockAuthenticate.mockResolvedValue({ success: true });
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
});

it('does not show biometric settings on web or unsupported devices', async () => {
  const web = await renderProfile('web');
  expect(web.root.findAllByProps({ testID: 'profile-biometric-toggle' })).toHaveLength(0);
  act(() => web.unmount());

  mockHasHardware.mockResolvedValue(false);
  const unsupported = await renderProfile('android');
  expect(unsupported.root.findAllByProps({ testID: 'profile-biometric-toggle' })).toHaveLength(0);
  act(() => unsupported.unmount());
});

it('removes saved biometric material immediately when turned off', async () => {
  const renderer = await renderProfile('ios');
  const toggle = renderer.root.findByProps({ testID: 'profile-biometric-toggle' });
  expect(toggle.props.value).toBe(true);

  await act(async () => {
    toggle.props.onValueChange(false);
    await Promise.resolve();
  });

  expect(mockDeleteItem).toHaveBeenCalledWith('petrotrack_biometric_creds_v2', expect.anything());
  expect(mockDeleteItem).toHaveBeenCalledWith('petrotrack_biometric_creds');
  expect(mockSetItem).toHaveBeenCalledWith('petrotrack_biometric_enabled_v1', 'disabled');
  expect(renderer.root.findByProps({ testID: 'profile-biometric-toggle' }).props.value).toBe(false);
  act(() => renderer.unmount());
});

it('requires password verification and a successful biometric check when enabled', async () => {
  mockGetItem.mockResolvedValue(null);
  const renderer = await renderProfile('ios');
  const toggle = renderer.root.findByProps({ testID: 'profile-biometric-toggle' });

  await act(async () => {
    toggle.props.onValueChange(true);
    await Promise.resolve();
  });
  const password = renderer.root.findByType('TextInput' as React.ElementType);
  await act(async () => {
    password.props.onChangeText('secret');
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'profile-biometric-confirm' }).props.onPress();
    await Promise.resolve();
  });

  expect(mockApiLogin).toHaveBeenCalledWith('operator', 'secret');
  expect(mockAuthenticate).toHaveBeenCalledWith(expect.objectContaining({
    promptMessage: 'Confirm Face ID to enable biometric sign-in',
  }));
  expect(mockSetItem).toHaveBeenCalledWith(
    'petrotrack_biometric_creds_v2',
    JSON.stringify({ username: 'operator', password: 'secret' }),
    expect.objectContaining({ requireAuthentication: true }),
  );
  expect(mockSetItem).toHaveBeenCalledWith('petrotrack_biometric_enabled_v1', 'enabled');
  expect(renderer.root.findByProps({ testID: 'profile-biometric-toggle' }).props.value).toBe(true);
  act(() => renderer.unmount());
});