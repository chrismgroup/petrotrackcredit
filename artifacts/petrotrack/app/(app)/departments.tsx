import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, ROLE_LABELS, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function DepartmentsScreen() {
  const { role, departments, staff } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'admin'] || colors.primary;

  return (
    <ScreenLayout title="Departments">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {departments.map(dept => (
            <View key={dept.id} style={[styles.card, { backgroundColor: dept.col.bg, borderColor: dept.col.fg + '33' }]}>
              <View style={[styles.icon, { backgroundColor: dept.col.fg + '22' }]}>
                <Ionicons name={dept.icon as any} size={24} color={dept.col.fg} />
              </View>
              <Text style={[styles.cardTitle, { color: dept.col.fg }]}>{dept.name}</Text>
              <Text style={[styles.cardRoles, { color: dept.col.fg + 'aa' }]}>{dept.roles.length} role{dept.roles.length > 1 ? 's' : ''}</Text>
              {dept.sys && (
                <View style={[styles.sysBadge, { backgroundColor: dept.col.fg + '22' }]}>
                  <Text style={[styles.sysText, { color: dept.col.fg }]}>System</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Role Access Overview</Text>
        {departments.map(dept => (
          <View key={dept.id} style={[styles.deptRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.rowIcon, { backgroundColor: dept.col.fg + '18' }]}>
              <Ionicons name={dept.icon as any} size={16} color={dept.col.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{dept.name}</Text>
              <View style={styles.rolesWrap}>
                {dept.roles.map(r => (
                  <View key={r} style={[styles.roleChip, { backgroundColor: ROLE_COLORS[r] + '18', borderColor: ROLE_COLORS[r] + '44' }]}>
                    <Text style={[styles.roleChipText, { color: ROLE_COLORS[r] }]}>{r.toUpperCase()}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))}
        <View style={{ height: 16 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  card: { width: '47.5%', padding: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  cardRoles: { fontSize: 11 },
  sysBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  sysText: { fontSize: 9, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  deptRow: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  rowTitle: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  rolesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  roleChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  roleChipText: { fontSize: 9, fontWeight: '700' },
});
