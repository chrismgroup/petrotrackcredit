import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ROLE_COLORS, ROLE_LABELS, UINFO, useApp, type Role } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const ROLES: Role[] = ['admin', 'ceo', 'md', 'mktg', 'csm', 'acc', 'mgr', 'att'];

const ROLE_ICONS: Record<string, string> = {
  admin: 'shield-checkmark', ceo: 'star', md: 'briefcase', mktg: 'megaphone',
  csm: 'business', acc: 'calculator', mgr: 'construct', att: 'water',
};

export default function LoginScreen() {
  const { login } = useApp();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Role | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  function handleLogin() {
    if (!selected) return;
    const info = UINFO[selected];
    login(selected, info.name);
    router.replace('/(app)/home');
  }

  return (
    <View style={[styles.container, { backgroundColor: '#0f2718' }]}>
      <View style={[styles.header, { paddingTop: topPad + 24 }]}>
        <View style={styles.logoWrap}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.logo}
          />
        </View>
        <Text style={styles.appName}>PetroTrack NG</Text>
        <Text style={styles.tagline}>Fuel Station Management System</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.background }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Select Your Role</Text>
        <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
          Choose your access level to continue
        </Text>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.roleList}>
          <View style={styles.roleGrid}>
            {ROLES.map(r => {
              const isSelected = selected === r;
              const roleColor = ROLE_COLORS[r];
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setSelected(r)}
                  activeOpacity={0.8}
                  style={[
                    styles.roleCard,
                    { borderColor: isSelected ? roleColor : colors.border, backgroundColor: isSelected ? roleColor + '12' : colors.surface },
                  ]}
                >
                  <View style={[styles.roleIcon, { backgroundColor: isSelected ? roleColor : roleColor + '22' }]}>
                    <Ionicons name={ROLE_ICONS[r] as any} size={20} color={isSelected ? '#fff' : roleColor} />
                  </View>
                  <View style={styles.roleText}>
                    <Text style={[styles.roleLabel, { color: isSelected ? roleColor : colors.text }]} numberOfLines={1}>
                      {UINFO[r].name}
                    </Text>
                    <Text style={[styles.roleSub, { color: isSelected ? roleColor + 'bb' : colors.textMuted }]} numberOfLines={1}>
                      {ROLE_LABELS[r]}
                    </Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark-circle" size={18} color={roleColor} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <TouchableOpacity
          onPress={handleLogin}
          disabled={!selected}
          activeOpacity={0.85}
          style={[
            styles.loginBtn,
            { backgroundColor: selected ? ROLE_COLORS[selected] : colors.border, marginBottom: botPad + 8 },
          ]}
        >
          <Text style={styles.loginBtnText}>
            {selected ? `Sign in as ${UINFO[selected].initials}` : 'Select a role to continue'}
          </Text>
          {selected && <Ionicons name="arrow-forward" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 28 },
  logoWrap: { width: 80, height: 80, borderRadius: 20, overflow: 'hidden', marginBottom: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  logo: { width: 80, height: 80 },
  appName: { fontSize: 28, fontWeight: '700', color: '#fff', letterSpacing: -0.5 },
  tagline: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 4, letterSpacing: 0.3 },
  card: { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 24, paddingHorizontal: 20 },
  cardTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  cardSubtitle: { fontSize: 13, textAlign: 'center', marginBottom: 16 },
  roleList: { flex: 1 },
  roleGrid: { gap: 10, paddingBottom: 12 },
  roleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1.5 },
  roleIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  roleText: { flex: 1 },
  roleLabel: { fontSize: 14, fontWeight: '600' },
  roleSub: { fontSize: 11, marginTop: 1 },
  loginBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 14, marginTop: 8 },
  loginBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
