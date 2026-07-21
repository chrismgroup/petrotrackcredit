import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, Alert, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';

const ROLES = [
  { key: 'client', label: 'Client', desc: 'Charter vessels for cargo or operations' },
  { key: 'broker', label: 'Broker', desc: 'Facilitate charter party agreements' },
  { key: 'owner', label: 'Vessel Owner', desc: 'List and manage your vessels' },
];

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'client',
    company: '',
    phone: '',
  });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (key: string) => (val: string) => setForm(f => ({ ...f, [key]: val }));

  const submit = async () => {
    if (!form.name.trim()) { Alert.alert('Validation', 'Full name is required'); return; }
    if (!form.email.trim()) { Alert.alert('Validation', 'Email is required'); return; }
    if (form.password.length < 6) { Alert.alert('Validation', 'Password must be at least 6 characters'); return; }

    setLoading(true);
    const error = await register({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      role: form.role,
      company: form.company || undefined,
      phone: form.phone || undefined,
    });
    setLoading(false);

    if (error) { Alert.alert('Registration Failed', error); return; }
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
          <Ionicons name="boat" size={36} color={Colors.textInverse} />
        </View>
        <Text style={styles.appName}>Join NVM</Text>
        <Text style={styles.tagline}>Create your marketplace account</Text>
      </View>

      <View style={styles.form}>
        <Field label="Full Name *" value={form.name} onChange={set('name')} placeholder="Your name" icon="person-outline" />
        <Field label="Email Address *" value={form.email} onChange={set('email')} placeholder="your@email.com" icon="mail-outline" keyboardType="email-address" />
        <Field label="Password *" value={form.password} onChange={set('password')} placeholder="Min 6 characters" icon="lock-closed-outline" secure showToggle showPw={showPw} onToggle={() => setShowPw(s => !s)} />
        <Field label="Company / Organization" value={form.company} onChange={set('company')} placeholder="Optional" icon="business-outline" />
        <Field label="Phone Number" value={form.phone} onChange={set('phone')} placeholder="Optional" icon="call-outline" keyboardType="phone-pad" />

        <Text style={styles.roleLabel}>Account Type</Text>
        {ROLES.map(r => (
          <Pressable
            key={r.key}
            style={[styles.roleCard, form.role === r.key && styles.roleCardActive]}
            onPress={() => setForm(f => ({ ...f, role: r.key }))}
          >
            <View style={[styles.roleRadio, form.role === r.key && styles.roleRadioActive]}>
              {form.role === r.key && <View style={styles.roleRadioDot} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.roleCardTitle, form.role === r.key && styles.roleCardTitleActive]}>{r.label}</Text>
              <Text style={styles.roleCardDesc}>{r.desc}</Text>
            </View>
          </Pressable>
        ))}

        <Pressable
          style={[styles.submitBtn, loading && { opacity: 0.6 }]}
          onPress={submit}
          disabled={loading}
          testID="register-btn"
        >
          {loading ? <ActivityIndicator color={Colors.textInverse} /> : (
            <Text style={styles.submitBtnText}>Create Account</Text>
          )}
        </Pressable>

        <Pressable style={styles.loginLink} onPress={() => router.push('/auth/login')}>
          <Text style={styles.loginLinkText}>
            Already have an account? <Text style={styles.loginLinkBold}>Sign In</Text>
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Field({ label, value, onChange, placeholder, icon, keyboardType, secure, showPw, showToggle, onToggle }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; icon: React.ComponentProps<typeof Ionicons>['name'];
  keyboardType?: any; secure?: boolean; showPw?: boolean; showToggle?: boolean; onToggle?: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name={icon} size={18} color={Colors.textMuted} style={styles.inputIcon} />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          keyboardType={keyboardType ?? 'default'}
          secureTextEntry={secure && !showPw}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
          autoComplete={keyboardType === 'email-address' ? 'email' : secure ? 'password' : 'off'}
        />
        {showToggle && (
          <Pressable onPress={onToggle} style={{ paddingRight: 12 }}>
            <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.navy },
  content: { flexGrow: 1, padding: 24 },
  logoArea: { alignItems: 'center', paddingVertical: 28 },
  logo: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  appName: { fontSize: 22, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  tagline: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 4, fontFamily: 'Inter_400Regular' },
  form: { backgroundColor: Colors.card, borderRadius: Colors.radiusLg, padding: 20 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6, fontFamily: 'Inter_600SemiBold' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, borderRadius: Colors.radius, backgroundColor: Colors.background },
  inputIcon: { paddingLeft: 12 },
  input: { paddingHorizontal: 10, paddingVertical: 11, fontSize: 15, color: Colors.text, fontFamily: 'Inter_400Regular' },
  roleLabel: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 8, marginTop: 4, fontFamily: 'Inter_600SemiBold' },
  roleCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: Colors.radius, borderWidth: 1.5, borderColor: Colors.border, marginBottom: 8, backgroundColor: Colors.background, gap: 12 },
  roleCardActive: { borderColor: Colors.primary, backgroundColor: '#EEF3FB' },
  roleRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  roleRadioActive: { borderColor: Colors.primary },
  roleRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  roleCardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, fontFamily: 'Inter_700Bold' },
  roleCardTitleActive: { color: Colors.primary },
  roleCardDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontFamily: 'Inter_400Regular' },
  submitBtn: { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Colors.radius, alignItems: 'center', marginTop: 12 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  loginLink: { alignItems: 'center', paddingTop: 16 },
  loginLinkText: { fontSize: 14, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  loginLinkBold: { color: Colors.primary, fontFamily: 'Inter_600SemiBold' },
});
