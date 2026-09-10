import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const BIOMETRIC_KEY = 'petrotrack_biometric_creds_v2';
export const LEGACY_BIOMETRIC_KEY = 'petrotrack_biometric_creds';
const BIOMETRIC_ENABLED_KEY = 'petrotrack_biometric_enabled_v1';
const BIOMETRIC_ENABLED_VALUE = 'enabled';
const BIOMETRIC_DISABLED_VALUE = 'disabled';

export const BIOMETRIC_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Authenticate to sign in to Petrotrack',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

type BiometricCredentials = { username: string; password: string };

function parseCredentials(raw: string | null): BiometricCredentials | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.username === 'string' &&
      parsed.username.trim() &&
      typeof parsed.password === 'string' &&
      parsed.password
    ) {
      return { username: parsed.username, password: parsed.password };
    }
  } catch {
    // Treat malformed stored data like expired credentials.
  }
  return null;
}

export async function saveCredentials(username: string, password: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.setItemAsync(
    BIOMETRIC_KEY,
    JSON.stringify({ username, password }),
    BIOMETRIC_STORE_OPTIONS,
  );
}

export async function loadCredentials(): Promise<BiometricCredentials | null> {
  if (Platform.OS === 'web') return null;

  // Reading the protected item is the device-lock gate. Do not call
  // LocalAuthentication.authenticateAsync as well, or users get two prompts.
  try {
    const protectedCreds = parseCredentials(
      await SecureStore.getItemAsync(BIOMETRIC_KEY, BIOMETRIC_STORE_OPTIONS),
    );
    if (protectedCreds) {
      if (!(await isBiometricDisabled())) await setBiometricEnabled(true);
      return protectedCreds;
    }
  } catch {
    // Cancellation and invalidated biometric enrollment both land here.
    // Remove the unusable secret and leave the password form available.
    await clearCredentials();
    return null;
  }

  // Migrate the previous unprotected entry only after the protected read
  // completed without an authentication error. If protection cannot be
  // established, expire the legacy secret instead of leaving it reusable.
  try {
    const legacyCreds = parseCredentials(await SecureStore.getItemAsync(LEGACY_BIOMETRIC_KEY));
    if (!legacyCreds) {
      await SecureStore.deleteItemAsync(LEGACY_BIOMETRIC_KEY).catch(() => {});
      return null;
    }
    try {
      await saveCredentials(legacyCreds.username, legacyCreds.password);
      await SecureStore.deleteItemAsync(LEGACY_BIOMETRIC_KEY).catch(() => {});
      if (!(await isBiometricDisabled())) await setBiometricEnabled(true);
      return legacyCreds;
    } catch {
      await clearCredentials();
      return null;
    }
  } catch {
    return null;
  }
}

export async function clearCredentials(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Promise.all([
    SecureStore.deleteItemAsync(BIOMETRIC_KEY, BIOMETRIC_STORE_OPTIONS).catch(() => {}),
    SecureStore.deleteItemAsync(LEGACY_BIOMETRIC_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY).catch(() => {}),
  ]);
}

export async function isBiometricEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)) === BIOMETRIC_ENABLED_VALUE;
  } catch {
    return false;
  }
}

export async function isBiometricDisabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)) === BIOMETRIC_DISABLED_VALUE;
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.setItemAsync(
    BIOMETRIC_ENABLED_KEY,
    enabled ? BIOMETRIC_ENABLED_VALUE : BIOMETRIC_DISABLED_VALUE,
  );
}