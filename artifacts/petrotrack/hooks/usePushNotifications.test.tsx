import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();
const mockRegisterToken = jest.fn();
const mockRefreshNotifications = jest.fn();
const mockRemoveReceived = jest.fn();
const mockRemoveResponse = jest.fn();

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { eas: { projectId: 'test-project' } } },
  },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  PermissionStatus: {
    DENIED: 'denied',
    GRANTED: 'granted',
    UNDETERMINED: 'undetermined',
  },
  addNotificationReceivedListener: jest.fn(() => ({ remove: mockRemoveReceived })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: mockRemoveResponse })),
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  setNotificationChannelAsync: (...args: unknown[]) => mockSetNotificationChannelAsync(...args),
  setNotificationHandler: jest.fn(),
}));

jest.mock('@/context/AppContext', () => ({
  useApp: () => ({
    isServerAuthenticated: true,
    refreshNotifications: mockRefreshNotifications,
  }),
}));

jest.mock('@/lib/api', () => ({
  notificationsApi: {
    registerToken: (...args: unknown[]) => mockRegisterToken(...args),
  },
}));

import { Platform } from 'react-native';
import { usePushNotifications } from './usePushNotifications';

function NativeSession() {
  usePushNotifications();
  return React.createElement('Session', { screen: 'main-navigation' });
}

function expectMainNavigation(renderer: ReactTestRenderer) {
  expect(renderer.root.find(node => node.props.screen === 'main-navigation')).toBeTruthy();
}

async function renderSession(os: 'ios' | 'android') {
  Platform.OS = os;
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<NativeSession />);
  });
  return renderer;
}

describe.each(['ios', 'android'] as const)('%s notification permission startup', os => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: `${os}-push-token` });
    mockRegisterToken.mockResolvedValue({ ok: true });
    mockSetNotificationChannelAsync.mockResolvedValue(undefined);
  });

  it('keeps the authenticated session usable when permission is granted', async () => {
    mockGetPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
    });

    const renderer = await renderSession(os);

    expectMainNavigation(renderer);
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockRegisterToken).toHaveBeenCalledWith(`${os}-push-token`, os);
    act(() => renderer.unmount());
  });

  it('keeps the authenticated session usable after permission is denied', async () => {
    mockGetPermissionsAsync.mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
    });

    const renderer = await renderSession(os);

    expectMainNavigation(renderer);
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  it('keeps the authenticated session usable when the prompt is deferred', async () => {
    mockGetPermissionsAsync.mockResolvedValue({
      status: 'undetermined',
      granted: false,
      canAskAgain: true,
    });
    mockRequestPermissionsAsync.mockResolvedValue({
      status: 'undetermined',
      granted: false,
      canAskAgain: true,
    });

    const renderer = await renderSession(os);

    expectMainNavigation(renderer);
    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  it('keeps the authenticated session usable when native permission APIs fail', async () => {
    mockGetPermissionsAsync.mockRejectedValue(new Error('native permission unavailable'));

    const renderer = await renderSession(os);

    expectMainNavigation(renderer);
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });
});