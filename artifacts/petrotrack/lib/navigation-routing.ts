import { SCREEN_ROUTES } from '@/context/AppContext';

export function isKnownScreenRoute(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return Object.values(SCREEN_ROUTES).some(route =>
    value === route || value.startsWith(`${route}?`),
  );
}

export function safeNotificationRoute(value: unknown): string {
  return isKnownScreenRoute(value) ? value : SCREEN_ROUTES.home;
}