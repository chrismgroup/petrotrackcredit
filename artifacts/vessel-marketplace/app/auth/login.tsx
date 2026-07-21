import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, Alert, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) { Alert.alert('Validation', 'Email and password are required'); return; }
    setLoading(true);
    const error = await login(email.trim().toLowerCase(), password);
    setLoading(false);
    if (error) { Alert.alert('Login Failed', error); return; }
    router.replace('/(tabs)');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.logoArea}>
        <View style={styles.logo}>
          <Ionicons name="boat" size={40} color={Colors.textInverse} />
        </View>
        <Text style={styles.appName}>Nigerian Vessel Market</Text>
        <Text style={styles.tagline}>Sign in to your account</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Email Address</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              testID="email-input"
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry={!showPw}
              autoComplete="password"
              testID="password-input"
            />
            <Pressable onPress={() => setShowPw(s => !s)} style={{ paddingRight: 12 }}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <Pressable
          style={[styles.submitBtn, loading && { opacity: 0.6 }]}
          onPress={submit}
          disabled={loading}
          testID="login-btn"
        >
          {loading ? <ActivityIndicator color={Colors.textInverse} /> : (
            <Text style={styles.submitBtnText}>Sign In</Text>
          )}
        </Pressable>

        <Pressable style={styles.registerLink} onPress={() => router.push('/auth/register')}>
          <Text style={styles.registerLinkText}>
            Don't have an account? <Text style={styles.registerLinkBold}>Create one</Text>
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.navy },
  content: { flexGrow: 1, padding: 24 },
  logoArea: { alignItems: 'center', paddingVertical: 40 },
  logo: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  appName: { fontSize: 22, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  tagline: { fontSize: 15, color: 'rgba(255,255,255,0.6)', marginTop: 4, fontFamily: 'Inter_400Regular' },
  form: { backgroundColor: Colors.card, borderRadius: Colors.radiusLg, padding: 24 },
  field: { marginBottom: 18 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 8, fontFamily: 'Inter_600SemiBold' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, borderRadius: Colors.radius, backgroundColor: Colors.background },
  inputIcon: { paddingLeft: 12 },
  input: { flex: 1, paddingHorizontal: 10, paddingVertical: 12, fontSize: 15, color: Colors.text, fontFamily: 'Inter_400Regular' },
  submitBtn: { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Colors.radius, alignItems: 'center', marginTop: 8 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  registerLink: { alignItems: 'center', paddingTop: 18 },
  registerLinkText: { fontSize: 14, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  registerLinkBold: { color: Colors.primary, fontFamily: 'Inter_600SemiBold' },
});
