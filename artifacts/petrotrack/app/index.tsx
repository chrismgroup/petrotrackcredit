import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { Redirect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Image, Platform, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { type LoginError, apiLogin } from '@/lib/api';

const BIOMETRIC_KEY = 'petrotrack_biometric_creds';

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

const BG_DARK = '#071910';
const BG_MID  = '#0D2E1A';

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

  const [bioAvailable,  setBioAvailable]  = useState(false);
  const [bioType,       setBioType]       = useState<'face' | 'fingerprint' | 'biometric'>('biometric');
  const [bioLoading,    setBioLoading]    = useState(false);
  const [bioCreds,      setBioCreds]      = useState<{ username: string; password: string } | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  useEffect(() => {
    if (role) router.replace('/(app)/home');
  }, [role]);

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
      if (creds) { setBioCreds(creds); setBioAvailable(true); }
    })();
  }, []);

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
        promptMessage: 'Sign in to Petrotrack',
        cancelLabel: 'Use password',
        disableDeviceFallback: false,
      });
      if (!result.success) { setBioLoading(false); return; }
      const serverResult = await apiLogin(bioCreds.username, bioCreds.password);
      if (typeof serverResult === 'string') {
        setBioLoading(false);
        if (serverResult === 'network') {
          Alert.alert('No Connection', 'Cannot reach the server. Check your internet connection and try again.');
        } else {
          await clearCredentials();
          setBioAvailable(false); setBioCreds(null);
          Alert.alert('Sign-in Failed', 'Your saved credentials are no longer valid. Please sign in with your password.');
        }
      } else {
        const synced = await login(serverResult.role as Parameters<typeof login>[0], serverResult.empName, serverResult.staffId, serverResult.branchId ?? undefined);
        setBioLoading(false);
        if (!synced) {
          Alert.alert('Sign-in incomplete', 'Your credentials were accepted, but the latest app data could not be loaded. Please check your connection and try again.');
        }
      }
    } catch { setBioLoading(false); }
  }, [bioCreds, bioLoading, login]);

  async function handleLogin() {
    const u = username.trim();
    const p = password.trim();
    if (!u || !p) { Alert.alert('Required', 'Please enter your username and password.'); return; }
    setLoading(true);
    const serverResult = await apiLogin(u, p);
    if (typeof serverResult === 'string') {
      setLoading(false);
      if (serverResult === 'network') {
        Alert.alert('No Connection', 'Cannot reach the server. Check your internet connection and try again.');
      } else if (serverResult === 'credentials') {
        Alert.alert('Login Failed', 'Incorrect username or password. Please try again.');
      } else {
        Alert.alert('Server Error', 'Something went wrong on the server. Please try again shortly.');
      }
      return;
    }
    await saveCredentials(u, p);
    const synced = await login(serverResult.role as Parameters<typeof login>[0], serverResult.empName, serverResult.staffId, serverResult.branchId ?? undefined);
    setLoading(false);
    if (!synced) {
      Alert.alert('Sign-in incomplete', 'Your credentials were accepted, but the latest app data could not be loaded. Please check your connection and try again.');
    }
  }

  const bioIcon  = bioType === 'face' ? 'scan-outline' : 'finger-print-outline';
  const bioLabel = bioType === 'face' ? 'Face ID' : bioType === 'fingerprint' ? 'Fingerprint' : 'Biometrics';

  return (
    <View style={[styles.root, { backgroundColor: BG_DARK }]}>
      {/* ── Decorative background blobs ── */}
      <View style={styles.blob1} />
      <View style={styles.blob2} />

      {/* ── Hero section ── */}
      <View style={[styles.hero, { paddingTop: topPad + 20 }]}>
        <View style={styles.logoRing}>
          <Image source={require('@/assets/images/icon.png')} style={styles.logo} />
        </View>
        <Text style={styles.appName}>Petrotrack</Text>
        <Text style={styles.tagline}>Fuel Station Management System</Text>

        {/* Trust indicators */}
        <View style={styles.trustRow}>
          <View style={styles.trustChip}>
            <Ionicons name="shield-checkmark" size={11} color="rgba(255,255,255,0.7)" />
            <Text style={styles.trustTxt}>Secure</Text>
          </View>
          <View style={styles.trustDot} />
          <View style={styles.trustChip}>
            <Ionicons name="flash" size={11} color="rgba(255,255,255,0.7)" />
            <Text style={styles.trustTxt}>Real-time</Text>
          </View>
          <View style={styles.trustDot} />
          <View style={styles.trustChip}>
            <Ionicons name="cloud-done" size={11} color="rgba(255,255,255,0.7)" />
            <Text style={styles.trustTxt}>Cloud-synced</Text>
          </View>
        </View>
      </View>

      {/* ── Login card ── */}
      <KeyboardAwareScrollViewCompat
        style={[styles.card, { backgroundColor: colors.background }]}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: botPad + 28 }}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cardHandle} />

        <Text style={[styles.cardTitle, { color: colors.text }]}>Welcome back</Text>
        <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
          Sign in to continue to your dashboard
        </Text>

        {/* ── Biometric quick-sign-in ── */}
        {bioAvailable && bioCreds ? (
          <TouchableOpacity
            style={[styles.bioBtn, { borderColor: colors.primary + '40', backgroundColor: colors.primary + '0E' }]}
            onPress={handleBiometric}
            disabled={bioLoading}
            activeOpacity={0.8}
          >
            <View style={[styles.bioIconWrap, { backgroundColor: colors.primary }]}>
              <Ionicons name={bioIcon as any} size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bioTitle, { color: colors.text }]}>
                {bioLoading ? 'Authenticating…' : `Sign in with ${bioLabel}`}
              </Text>
              <Text style={[styles.bioSub, { color: colors.textMuted }]}>{bioCreds.username}</Text>
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

        {/* ── Username ── */}
        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Username</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.inputBorder }]}>
          <View style={[styles.inputIcon, { backgroundColor: colors.border }]}>
            <Ionicons name="person-outline" size={16} color={colors.textMuted} />
          </View>
          <TextInput
            testID="login-username"
            style={[styles.input, { color: colors.text }]}
            placeholder="Enter your username"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            value={username}
            onChangeText={setUsername}
            onSubmitEditing={() => pwRef.current?.focus()}
          />
        </View>

        {/* ── Password ── */}
        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Password</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.inputBorder }]}>
          <View style={[styles.inputIcon, { backgroundColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
          </View>
          <TextInput
            testID="login-password"
            ref={pwRef}
            style={[styles.input, { color: colors.text }]}
            placeholder="Enter your password"
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

        {/* ── Sign-in button ── */}
        <TouchableOpacity
          testID="login-submit"
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
          style={[styles.loginBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
        >
          {loading
            ? <Text style={styles.loginBtnText}>Signing in…</Text>
            : <>
                <Text style={styles.loginBtnText}>Sign In</Text>
                <View style={styles.loginBtnArrow}>
                  <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                </View>
              </>
          }
        </TouchableOpacity>

        {!bioAvailable && Platform.OS !== 'web' ? (
          <Text style={[styles.bioHint, { color: colors.textSubtle }]}>
            Sign in once with your password to enable {Platform.OS === 'ios' ? 'Face ID / Touch ID' : 'fingerprint'} for future logins.
          </Text>
        ) : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },

  // ── Decorative blobs ─────────────────────────────────────────
  blob1: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: '#16813E', opacity: 0.12,
    top: -80, right: -60,
  },
  blob2: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: '#0D5C2E', opacity: 0.20,
    top: 120, left: -50,
  },

  // ── Hero ─────────────────────────────────────────────────────
  hero:         { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 32 },
  logoRing: {
    width: 88, height: 88, borderRadius: 24, overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#22C55E', shadowOpacity: 0.4, shadowRadius: 20,
    elevation: 12,
  },
  logo:         { width: 88, height: 88 },
  appName:      { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: -0.8 },
  tagline:      { fontSize: 13, color: 'rgba(255,255,255,0.50)', marginTop: 4, letterSpacing: 0.4 },

  trustRow:     { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 8 },
  trustChip:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trustTxt:     { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '500' },
  trustDot:     { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.25)' },

  // ── Card ─────────────────────────────────────────────────────
  card:         { flex: 1, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 24 },
  cardHandle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDE5E0', alignSelf: 'center', marginTop: 12, marginBottom: 24 },
  cardTitle:    { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  cardSubtitle: { fontSize: 13, marginBottom: 28 },

  // ── Biometric ────────────────────────────────────────────────
  bioBtn:       { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, borderWidth: 1.5, padding: 14, marginBottom: 8 },
  bioIconWrap:  { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  bioTitle:     { fontSize: 15, fontWeight: '700' },
  bioSub:       { fontSize: 12, marginTop: 2 },
  dividerRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  dividerLine:  { flex: 1, height: 1 },
  dividerTxt:   { fontSize: 12, fontWeight: '500' },

  // ── Inputs ───────────────────────────────────────────────────
  fieldLabel:   { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 7 },
  inputWrap:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 14, paddingVertical: 3, borderRadius: 14, borderWidth: 1.5, marginBottom: 18, overflow: 'hidden' },
  inputIcon:    { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  input:        { flex: 1, fontSize: 15, height: 48 },

  // ── Button ───────────────────────────────────────────────────
  loginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16, borderRadius: 16, marginTop: 4,
  },
  loginBtnText:  { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  loginBtnArrow: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },

  bioHint:      { fontSize: 12, textAlign: 'center', marginTop: 20, lineHeight: 18 },
});
