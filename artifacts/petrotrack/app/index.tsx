import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { Redirect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Image, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { apiLogin } from '@/lib/api';

const BIOMETRIC_KEY = 'gastsmarts_biometric_creds';

async function saveCredentials(username: string, password: string) {
  if (Platform.OS === 'web') return;
  await SecureStore.setItemAsync(BIOMETRIC_KEY, JSON.stringify({ username, password }));
}

async function loadCredentials(): Promise<{ username: string; password: string } | null> {
  if (Platform.OS === 'web') return null;
  try {
    const raw = await SecureStore.getItemAsync(BIOMETRIC_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function clearCredentials() {
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(BIOMETRIC_KEY).catch(() => {});
}

export default function LoginScreen() {
  const { role, login } = useApp();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pwRef = useRef<TextInput>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);

  /* ── Biometric state ── */
  const [bioAvailable,  setBioAvailable]  = useState(false);
  const [bioType,       setBioType]       = useState<'face' | 'fingerprint' | 'biometric'>('biometric');
  const [bioLoading,    setBioLoading]    = useState(false);
  const [bioCreds,      setBioCreds]      = useState<{ username: string; password: string } | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  /* Redirect if already logged in */
  useEffect(() => {
    if (role) router.replace('/(app)/home');
  }, [role]);

  /* Check biometric availability + stored credentials on mount */
  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') return;
      const [hasHw, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHw || !enrolled) return;

      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBioType('face');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBioType('fingerprint');
      }

      const creds = await loadCredentials();
      if (creds) {
        setBioCreds(creds);
        setBioAvailable(true);
      }
    })();
  }, []);

  /* Auto-prompt biometrics when available */
  useEffect(() => {
    if (bioAvailable && bioCreds) {
      const t = setTimeout(handleBiometric, 400);
      return () => clearTimeout(t);
    }
  }, [bioAvailable, bioCreds]);

  const handleBiometric = useCallback(async () => {
    if (!bioCreds || bioLoading) return;
    setBioLoading(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Sign in to Gastsmarts',
        cancelLabel: 'Use password',
        disableDeviceFallback: false,
      });
      if (!result.success) { setBioLoading(false); return; }

      const serverResult = await apiLogin(bioCreds.username, bioCreds.password);
      setBioLoading(false);
      if (serverResult) {
        login(serverResult.role as Parameters<typeof login>[0], serverResult.empName, undefined, serverResult.branchId ?? undefined);
      } else {
        /* Stored credentials no longer valid — clear them */
        await clearCredentials();
        setBioAvailable(false);
        setBioCreds(null);
        Alert.alert('Sign-in failed', 'Your saved credentials are no longer valid. Please sign in with your password.');
      }
    } catch {
      setBioLoading(false);
    }
  }, [bioCreds, bioLoading, login]);

  async function handleLogin() {
    const u = username.trim();
    const p = password.trim();
    if (!u || !p) { Alert.alert('Required', 'Please enter your username and password.'); return; }

    setLoading(true);
    const serverResult = await apiLogin(u, p);
    if (serverResult) {
      /* Save credentials for future biometric use */
      await saveCredentials(u, p);
      setLoading(false);
      login(serverResult.role as Parameters<typeof login>[0], serverResult.empName, undefined, serverResult.branchId ?? undefined);
      return;
    }
    setLoading(false);
    Alert.alert('Login Failed', 'Unable to sign in. Check your username and password, or try again when the server is reachable.');
  }

  const bioIcon  = bioType === 'face' ? 'scan-outline' : 'finger-print-outline';
  const bioLabel = bioType === 'face' ? 'Face ID' : bioType === 'fingerprint' ? 'Fingerprint' : 'Biometrics';

  return (
    <View style={[styles.container, { backgroundColor: '#0f2718' }]}>
      <View style={[styles.header, { paddingTop: topPad + 24 }]}>
        <View style={styles.logoWrap}>
          <Image source={require('@/assets/images/icon.png')} style={styles.logo} />
        </View>
        <Text style={styles.appName}>Gastsmarts</Text>
        <Text style={styles.tagline}>Fuel Station Management System</Text>
      </View>

      <ScrollView
        style={[styles.card, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: botPad + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.cardTitle, { color: colors.text }]}>Sign In</Text>
        <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
          Enter your credentials to access the system
        </Text>

        {/* ── Biometric quick-sign-in ── */}
        {bioAvailable && bioCreds ? (
          <TouchableOpacity
            style={[styles.bioBtn, { borderColor: '#1a6e3c40', backgroundColor: '#1a6e3c12' }]}
            onPress={handleBiometric}
            disabled={bioLoading}
            activeOpacity={0.8}
          >
            <View style={[styles.bioIconWrap, { backgroundColor: '#1a6e3c' }]}>
              <Ionicons name={bioIcon as any} size={26} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bioTitle, { color: colors.text }]}>
                {bioLoading ? 'Authenticating…' : `Sign in with ${bioLabel}`}
              </Text>
              <Text style={[styles.bioSub, { color: colors.textMuted }]}>
                {bioCreds.username}
              </Text>
            </View>
            {!bioLoading && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
          </TouchableOpacity>
        ) : null}

        {bioAvailable && bioCreds ? (
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerTxt, { color: colors.textMuted }]}>or use password</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>
        ) : null}

        {/* Username */}
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="person-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="Username"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            value={username}
            onChangeText={setUsername}
            onSubmitEditing={() => pwRef.current?.focus()}
          />
        </View>

        {/* Password */}
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
          <TextInput
            ref={pwRef}
            style={[styles.input, { color: colors.text }]}
            placeholder="Password"
            placeholderTextColor={colors.textSubtle}
            secureTextEntry={!showPw}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
          />
          <TouchableOpacity onPress={() => setShowPw(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Login button */}
        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
          style={[styles.loginBtn, { backgroundColor: '#1a6e3c', opacity: loading ? 0.7 : 1 }]}
        >
          {loading
            ? <Text style={styles.loginBtnText}>Signing in…</Text>
            : <>
                <Text style={styles.loginBtnText}>Sign In</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
          }
        </TouchableOpacity>

        {/* Biometric hint for first-time users */}
        {!bioAvailable && Platform.OS !== 'web' ? (
          <Text style={[styles.bioHint, { color: colors.textSubtle }]}>
            Sign in once with your password to enable {Platform.OS === 'ios' ? 'Face ID / Touch ID' : 'fingerprint'} for future logins.
          </Text>
        ) : null}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1 },
  header:        { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 28 },
  logoWrap:      { width: 80, height: 80, borderRadius: 20, overflow: 'hidden', marginBottom: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  logo:          { width: 80, height: 80 },
  appName:       { fontSize: 28, fontWeight: '700', color: '#fff', letterSpacing: -0.5 },
  tagline:       { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 4, letterSpacing: 0.3 },
  card:          { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 28, paddingHorizontal: 22 },
  cardTitle:     { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  cardSubtitle:  { fontSize: 13, marginBottom: 24 },

  bioBtn:        { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, borderWidth: 1.5, padding: 14, marginBottom: 8 },
  bioIconWrap:   { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  bioTitle:      { fontSize: 15, fontWeight: '700' },
  bioSub:        { fontSize: 12, marginTop: 2 },
  dividerRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  dividerLine:   { flex: 1, height: 1 },
  dividerTxt:    { fontSize: 12, fontWeight: '500' },

  inputWrap:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, marginBottom: 12 },
  input:         { flex: 1, fontSize: 15 },
  loginBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 14, marginTop: 6 },
  loginBtnText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  bioHint:       { fontSize: 12, textAlign: 'center', marginTop: 18, lineHeight: 18 },
});
