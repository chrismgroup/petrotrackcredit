import React from 'react';
import { Platform } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';

const mockReplace = jest.fn();
const mockLogin = jest.fn();
const mockApiLogin = jest.fn();
const mockHasHardware = jest.fn();
const mockIsEnrolled = jest.fn();
const mockSupportedTypes = jest.fn();
const mockAuthenticate = jest.fn();
const mockGetItem = jest.fn();

jest.mock('react-native', () => {
  const React = require('react');
  const primitive = (name: string) => ({ children, ...props }: any) =>
    React.createElement(name, props, children);
  return {
    Alert: { alert: jest.fn() },
    Image: primitive('Image'),
    Platform: {
      OS: 'web',
      select: (options: Record<string, unknown>) => options.web ?? options.default ?? options.native,
    },
    StyleSheet: { create: (styles: unknown) => styles },
    Text: primitive('Text'),
    TextInput: primitive('TextInput'),
    TouchableOpacity: primitive('TouchableOpacity'),
    View: primitive('View'),
  };
});

jest.mock('expo-router', () => ({
  Redirect: () => null,
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('expo-local-authentication', () => ({
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
  hasHardwareAsync: () => mockHasHardware(),
  isEnrolledAsync: () => mockIsEnrolled(),
  supportedAuthenticationTypesAsync: () => mockSupportedTypes(),
  authenticateAsync: (options: unknown) => mockAuthenticate(options),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: () => mockGetItem(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('@/context/AppContext', () => ({
  useApp: () => ({ role: null, login: mockLogin }),
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
  }),
}));

jest.mock('@/lib/api', () => ({
  apiLogin: (...args: unknown[]) => mockApiLogin(...args),
}));

jest.mock('@/components/KeyboardAwareScrollViewCompat', () => {
  const React = require('react');
  return {
    KeyboardAwareScrollViewCompat: ({ children }: { children: React.ReactNode }) =>
      React.createElement('KeyboardAwareScrollViewCompat', null, children),
  };
});

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 16, left: 0 }),
}));

import LoginScreen from '../app/index';

const credentials = JSON.stringify({ username: 'operator', password: 'secret' });

async function renderScreen(os: 'ios' | 'android'): Promise<ReactTestRenderer> {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<LoginScreen />);
    await Promise.resolve();
  });
  return renderer;
}

function renderedText(renderer: ReactTestRenderer): string {
  const collect = (node: ReactTestRenderer['root']): string =>
    node.children
      .map(child =>
        typeof child === 'string' || typeof child === 'number'
          ? String(child)
          : collect(child as ReactTestRenderer['root']),
      )
      .join('');
  return collect(renderer.root);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockHasHardware.mockResolvedValue(true);
  mockIsEnrolled.mockResolvedValue(true);
  mockGetItem.mockResolvedValue(credentials);
  mockLogin.mockResolvedValue(true);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

it.each([
  ['ios', 2, 'Face ID'],
  ['android', 1, 'Fingerprint'],
] as const)('completes biometric sign-in on %s', async (os, authType, label) => {
  mockSupportedTypes.mockResolvedValue([authType]);
  mockAuthenticate.mockResolvedValue({ success: true });
  mockApiLogin.mockResolvedValue({
    role: 'mgr',
    empName: 'Operator',
    staffId: 'staff-1',
    branchId: 'branch-1',
  });
  const renderer = await renderScreen(os);

  const button = renderer.root.findByProps({ testID: 'login-biometric' });
  expect(renderedText(renderer)).toContain(`Sign in with ${label}`);

  await act(async () => {
    await button.props.onPress();
  });

  expect(mockAuthenticate).toHaveBeenCalledWith(expect.objectContaining({
    cancelLabel: 'Use password',
    disableDeviceFallback: false,
  }));
  expect(mockApiLogin).toHaveBeenCalledWith('operator', 'secret');
  expect(mockLogin).toHaveBeenCalledWith('mgr', 'Operator', 'staff-1', 'branch-1');
  act(() => renderer.unmount());
});

it.each(['ios', 'android'] as const)('returns to the usable password form after biometric cancellation on %s', async os => {
  mockSupportedTypes.mockResolvedValue([os === 'ios' ? 2 : 1]);
  mockAuthenticate.mockResolvedValue({ success: false, error: 'user_cancel' });
  const renderer = await renderScreen(os);

  const button = renderer.root.findByProps({ testID: 'login-biometric' });
  await act(async () => {
    await button.props.onPress();
  });

  expect(renderer.root.findByProps({ testID: 'login-username' })).toBeTruthy();
  expect(renderer.root.findByProps({ testID: 'login-password' })).toBeTruthy();
  expect(renderer.root.findByProps({ testID: 'login-submit' }).props.disabled).toBe(false);
  expect(mockApiLogin).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

it.each(['ios', 'android'] as const)('shows password sign-in when biometrics are not enrolled on %s', async os => {
  mockIsEnrolled.mockResolvedValue(false);
  const renderer = await renderScreen(os);

  expect(renderer.root.findAllByProps({ testID: 'login-biometric' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'login-username' })).toBeTruthy();
  expect(renderer.root.findByProps({ testID: 'login-password' })).toBeTruthy();
  expect(renderer.root.findByProps({ testID: 'login-submit' }).props.disabled).toBe(false);
  expect(mockAuthenticate).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

it.each(['ios', 'android'] as const)('falls back to password sign-in if capability detection fails on %s', async os => {
  mockHasHardware.mockRejectedValue(new Error('native service unavailable'));
  const renderer = await renderScreen(os);

  expect(renderer.root.findAllByProps({ testID: 'login-biometric' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'login-submit' })).toBeTruthy();
  act(() => renderer.unmount());
});