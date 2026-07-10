import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Image, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { apiLogin } from '@/lib/api';

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

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  useEffect(() => {
    if (role) {
      router.replace('/(app)/home');
    }
  }, [role]);

  async function handleLogin() {
    const u = username.trim();
    const p = password.trim();
    if (!u || !p) { Alert.alert('Required', 'Please enter your username and password.'); return; }

    setLoading(true);

    // Try server-side authentication first (issues a JWT for all subsequent API calls)
    const serverResult = await apiLogin(u, p);
    if (serverResult) {
      setLoading(false);
      login(serverResult.role as Parameters<typeof login>[0], serverResult.empName, undefined, serverResult.branchId ?? undefined);
      return;
    }

    setLoading(false);
    // Server authentication is required — no local credential fallback.
    Alert.alert('Login Failed', 'Unable to sign in. Check your username and password, or try again when the server is reachable.');
  }

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

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1 },
  header:          { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 28 },
  logoWrap:        { width: 80, height: 80, borderRadius: 20, overflow: 'hidden', marginBottom: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  logo:            { width: 80, height: 80 },
  appName:         { fontSize: 28, fontWeight: '700', color: '#fff', letterSpacing: -0.5 },
  tagline:         { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 4, letterSpacing: 0.3 },
  card:            { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 28, paddingHorizontal: 22 },
  cardTitle:       { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  cardSubtitle:    { fontSize: 13, marginBottom: 24 },
  inputWrap:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, marginBottom: 12 },
  input:           { flex: 1, fontSize: 15 },
  loginBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 14, marginTop: 6 },
  loginBtnText:    { color: '#fff', fontSize: 16, fontWeight: '700' },
});
