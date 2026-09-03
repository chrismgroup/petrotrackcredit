import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';

const mockUseApp = jest.fn();
const mockRedirect = jest.fn(({ href }: { href: string }) =>
  React.createElement('Redirect', { href }),
);
const mockStack = jest.fn(() => React.createElement('Stack'));

jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => mockRedirect(props),
  Stack: Object.assign(() => mockStack(), {
    Screen: () => null,
  }),
  usePathname: () => '/maintenance',
}));

jest.mock('@/context/AppContext', () => ({
  SCREEN_ROUTES: {
    home: '/(app)/home',
    maint: '/(app)/maintenance',
  },
  useApp: () => mockUseApp(),
}));

import AppLayout from '../app/(app)/_layout';

afterEach(() => {
  jest.clearAllMocks();
});

it('does not redirect a deep link before saved authentication is hydrated', () => {
  mockUseApp.mockReturnValue({
    role: null,
    isServerAuthenticated: false,
    isHydrated: false,
    navItems: [],
  });

  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(<AppLayout />);
  });

  expect(mockRedirect).not.toHaveBeenCalled();
  expect(mockStack).not.toHaveBeenCalled();
  act(() => renderer!.unmount());
});

it('keeps an authenticated maintenance deep link after hydration', () => {
  mockUseApp.mockReturnValue({
    role: 'admin',
    isServerAuthenticated: true,
    isHydrated: true,
    navItems: [{ id: 'maint' }],
  });

  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(<AppLayout />);
  });

  expect(mockRedirect).not.toHaveBeenCalled();
  expect(mockStack).toHaveBeenCalledTimes(1);
  act(() => renderer!.unmount());
});