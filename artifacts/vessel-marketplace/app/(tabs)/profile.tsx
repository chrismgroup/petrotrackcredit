import React from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { vmAdmin } from '@/lib/api';

const ROLE_LABELS: Record<string, string> = {
  client: 'Client',
  broker: 'Broker',
  owner: 'Vessel Owner',
  admin: 'Administrator',
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated, isAdmin, logout } = useAuth();

  const { data: allUsers, refetch: refetchUsers } = useQuery({
    queryKey: ['vessel-admin-users'],
    queryFn: async () => {
      const { data } = await vmAdmin.listUsers();
      return data ?? [];
    },
    enabled: isAdmin,
  });

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await logout(); } },
    ]);
  };

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <View style={styles.header}><Text style={styles.headerTitle}>Profile</Text></View>
        <View style={styles.centered}>
          <Ionicons name="person-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.guestTitle}>Welcome to NVM</Text>
          <Text style={styles.guestText}>Nigerian Vessel Marketplace</Text>
          <Pressable style={styles.loginBtn} onPress={() => router.push('/auth/login')}>
            <Text style={styles.loginBtnText}>Sign In</Text>
          </Pressable>
          <Pressable style={styles.registerBtn} onPress={() => router.push('/auth/register')}>
            <Text style={styles.registerBtnText}>Create Account</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View style={styles.header}><Text style={styles.headerTitle}>Profile</Text></View>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 24 }]}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user!.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.userName}>{user!.name}</Text>
          <Text style={styles.userEmail}>{user!.email}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{ROLE_LABELS[user!.role] ?? user!.role}</Text>
          </View>
        </View>

        {user!.company && (
          <View style={styles.section}>
            <InfoRow icon="business-outline" label="Company" value={user!.company} />
          </View>
        )}
        {user!.phone && (
          <View style={styles.section}>
            <InfoRow icon="call-outline" label="Phone" value={user!.phone} />
          </View>
        )}

        {isAdmin && (
          <View style={styles.adminSection}>
            <Text style={styles.sectionTitle}>Admin — User Management</Text>
            {(allUsers ?? []).map(u => (
              <View key={u.id} style={styles.userRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.adminUserName}>{u.name}</Text>
                  <Text style={styles.adminUserEmail}>{u.email}</Text>
                </View>
                <View style={styles.roleSelector}>
                  {(['client', 'broker', 'owner', 'admin'] as const).map(r => (
                    <Pressable
                      key={r}
                      style={[styles.roleOption, u.role === r && styles.roleOptionActive]}
                      onPress={async () => {
                        await vmAdmin.updateUserRole(u.id, r);
                        refetchUsers();
                      }}
                    >
                      <Text style={[styles.roleOptionText, u.role === r && styles.roleOptionTextActive]}>
                        {r.charAt(0).toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        <Pressable style={styles.logoutBtn} onPress={handleLogout} testID="logout-btn">
          <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={Colors.textMuted} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.navy, paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  scroll: { padding: 20, gap: 16 },
  profileCard: { backgroundColor: Colors.card, borderRadius: Colors.radiusLg, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: Colors.borderLight },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontSize: 32, fontWeight: '700', color: Colors.textInverse, fontFamily: 'Inter_700Bold' },
  userName: { fontSize: 20, fontWeight: '700', color: Colors.text, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  userEmail: { fontSize: 14, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginBottom: 12 },
  roleBadge: { backgroundColor: Colors.borderLight, paddingHorizontal: 14, paddingVertical: 6, borderRadius: Colors.radiusFull },
  roleText: { fontSize: 13, color: Colors.primaryLight, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  section: { backgroundColor: Colors.card, borderRadius: Colors.radius, borderWidth: 1, borderColor: Colors.borderLight },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  infoLabel: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 15, color: Colors.text, fontFamily: 'Inter_500Medium', marginTop: 2 },
  adminSection: { backgroundColor: Colors.card, borderRadius: Colors.radius, padding: 16, borderWidth: 1, borderColor: Colors.borderLight },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 12, fontFamily: 'Inter_700Bold' },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  adminUserName: { fontSize: 14, fontWeight: '600', color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  adminUserEmail: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  roleSelector: { flexDirection: 'row', gap: 4 },
  roleOption: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.greyLight, alignItems: 'center', justifyContent: 'center' },
  roleOptionActive: { backgroundColor: Colors.primary },
  roleOptionText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  roleOptionTextActive: { color: Colors.textInverse },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, backgroundColor: Colors.card, borderRadius: Colors.radius, borderWidth: 1, borderColor: Colors.borderLight },
  logoutText: { color: Colors.danger, fontSize: 16, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  guestTitle: { fontSize: 24, fontWeight: '700', color: Colors.text, marginTop: 20, fontFamily: 'Inter_700Bold' },
  guestText: { fontSize: 14, color: Colors.textMuted, marginTop: 4, fontFamily: 'Inter_400Regular' },
  loginBtn: { marginTop: 32, backgroundColor: Colors.primary, paddingHorizontal: 48, paddingVertical: 14, borderRadius: Colors.radius, width: '100%', alignItems: 'center' },
  loginBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: 16, fontFamily: 'Inter_700Bold' },
  registerBtn: { marginTop: 12, paddingVertical: 12, width: '100%', alignItems: 'center', borderRadius: Colors.radius, borderWidth: 1, borderColor: Colors.border },
  registerBtnText: { color: Colors.text, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
});
