import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MGR_BRANCH_NAMES, ROLE_COLORS, useApp, type Role } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type LoginProfile = {
  profileId: string;
  role: Role;
  name: string;
  sub: string;
  icon: string;
  staffId?: number;
  branchId?: string;
};

const LOGIN_PROFILES: LoginProfile[] = [
  { profileId: 'admin', role: 'admin', name: 'System Admin',      sub: 'Administrator',          icon: 'shield-checkmark' },
  { profileId: 'ceo',   role: 'ceo',   name: 'Amaka Osei',        sub: 'Chief Executive Officer', icon: 'star' },
  { profileId: 'md',    role: 'md',    name: 'Adaeze Obi',         sub: 'Managing Director',       icon: 'briefcase' },
  { profileId: 'mktg',  role: 'mktg',  name: 'Funmi Adesanya',     sub: 'Marketing Manager',       icon: 'megaphone' },
  { profileId: 'csm',   role: 'csm',   name: 'Ngozi Eze',          sub: 'Corp. Services Mgr',      icon: 'business' },
  { profileId: 'acc',   role: 'acc',   name: 'Grace Adeyemi',      sub: 'Accountant',              icon: 'calculator' },
  { profileId: 'mgrHQ', role: 'mgr',   name: 'Chukwuma Adeyemi',   sub: MGR_BRANCH_NAMES.HQ,       icon: 'construct', staffId: 6,  branchId: 'HQ' },
  { profileId: 'mgrB1', role: 'mgr',   name: 'Ibrahim Sule',       sub: MGR_BRANCH_NAMES.B1,       icon: 'construct', staffId: 9,  branchId: 'B1' },
  { profileId: 'mgrB2', role: 'mgr',   name: 'Chidinma Nwosu',     sub: MGR_BRANCH_NAMES.B2,       icon: 'construct', staffId: 10, branchId: 'B2' },
  { profileId: 'att',   role: 'att',   name: 'Emeka Okafor',       sub: 'Pump Attendant',           icon: 'water' },
];

export default function LoginScreen() {
  const { login } = useApp();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const selectedProfile = LOGIN_PROFILES.find(p => p.profileId === selected);

  function handleLogin() {
    if (!selectedProfile) return;
    login(selectedProfile.role, selectedProfile.name, selectedProfile.staffId, selectedProfile.branchId);
    router.replace('/(app)/home');
  }

  return (
    <View style={[styles.container, { backgroundColor: '#0f2718' }]}>
      <View style={[styles.header, { paddingTop: topPad + 24 }]}>
        <View style={styles.logoWrap}>
          <Image source={require('@/assets/images/icon.png')} style={styles.logo} />
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
            {LOGIN_PROFILES.map(p => {
              const isSelected = selected === p.profileId;
              const roleColor = ROLE_COLORS[p.role];
              const isMgr = p.role === 'mgr';
              return (
                <TouchableOpacity
                  key={p.profileId}
                  onPress={() => setSelected(p.profileId)}
                  activeOpacity={0.8}
                  style={[
                    styles.roleCard,
                    isMgr && styles.mgrCard,
                    { borderColor: isSelected ? roleColor : colors.border, backgroundColor: isSelected ? roleColor + '12' : colors.surface },
                  ]}
                >
                  {isMgr && (
                    <View style={[styles.branchTag, { backgroundColor: roleColor + '22' }]}>
                      <Ionicons name="location" size={9} color={roleColor} />
                      <Text style={[styles.branchTagText, { color: roleColor }]}>
                        {p.branchId === 'HQ' ? 'HQ' : p.branchId === 'B1' ? 'Maitama' : 'Lugbe'}
                      </Text>
                    </View>
                  )}
                  <View style={[styles.roleIcon, { backgroundColor: isSelected ? roleColor : roleColor + '22' }]}>
                    <Ionicons name={p.icon as any} size={20} color={isSelected ? '#fff' : roleColor} />
                  </View>
                  <View style={styles.roleText}>
                    <Text style={[styles.roleLabel, { color: isSelected ? roleColor : colors.text }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={[styles.roleSub, { color: isSelected ? roleColor + 'bb' : colors.textMuted }]} numberOfLines={1}>
                      {p.sub}
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
          disabled={!selectedProfile}
          activeOpacity={0.85}
          style={[
            styles.loginBtn,
            { backgroundColor: selectedProfile ? ROLE_COLORS[selectedProfile.role] : colors.border, marginBottom: botPad + 8 },
          ]}
        >
          <Text style={styles.loginBtnText}>
            {selectedProfile ? `Sign in as ${selectedProfile.name.split(' ')[0]}` : 'Select a role to continue'}
          </Text>
          {selectedProfile && <Ionicons name="arrow-forward" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  header:       { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 28 },
  logoWrap:     { width: 80, height: 80, borderRadius: 20, overflow: 'hidden', marginBottom: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  logo:         { width: 80, height: 80 },
  appName:      { fontSize: 28, fontWeight: '700', color: '#fff', letterSpacing: -0.5 },
  tagline:      { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 4, letterSpacing: 0.3 },
  card:         { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 24, paddingHorizontal: 20 },
  cardTitle:    { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  cardSubtitle: { fontSize: 13, textAlign: 'center', marginBottom: 16 },
  roleList:     { flex: 1 },
  roleGrid:     { gap: 10, paddingBottom: 12 },
  roleCard:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1.5 },
  mgrCard:      { paddingTop: 20 },
  branchTag:    { position: 'absolute', top: 6, left: 12, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  branchTagText:{ fontSize: 9, fontWeight: '700' },
  roleIcon:     { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  roleText:     { flex: 1 },
  roleLabel:    { fontSize: 14, fontWeight: '600' },
  roleSub:      { fontSize: 11, marginTop: 1 },
  loginBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 14, marginTop: 8 },
  loginBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
