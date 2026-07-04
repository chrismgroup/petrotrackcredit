import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const ACTION_ICONS: Record<string, string> = {
  'User login': 'log-in',
  'Price update': 'pricetag',
  'Dip submitted': 'water',
  'Short delivery': 'alert-circle',
  'Delivery recorded': 'cube',
  'Sales entry': 'bar-chart',
  'Message sent': 'chatbubble',
  'Maintenance request': 'build',
  'User created': 'person-add',
  'Expense approved': 'checkmark-circle',
  'Budget approved': 'wallet',
};

const ACTION_COLORS: Record<string, string> = {
  'User login': '#185FA5',
  'Price update': '#4527a0',
  'Dip submitted': '#1a6e3c',
  'Short delivery': '#A32D2D',
  'Delivery recorded': '#0F6E56',
  'Sales entry': '#1a6e3c',
  'Message sent': '#185FA5',
  'Maintenance request': '#BA7517',
  'User created': '#0F6E56',
  'Expense approved': '#27500A',
};

export default function AuditScreen() {
  const { role, audit } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'admin'] || colors.primary;
  const [search, setSearch] = useState('');

  const filtered = audit.filter(a =>
    a.action.toLowerCase().includes(search.toLowerCase()) ||
    a.user.toLowerCase().includes(search.toLowerCase()) ||
    a.detail.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ScreenLayout title="Audit Log">
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search audit log..."
            placeholderTextColor={colors.textSubtle}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.countText, { color: colors.textMuted }]}>{filtered.length} event{filtered.length !== 1 ? 's' : ''}</Text>
        {filtered.map((entry, idx) => {
          const acCol = ACTION_COLORS[entry.action] || roleColor;
          const icon = ACTION_ICONS[entry.action] || 'ellipse';
          return (
            <View key={entry.id} style={styles.entryRow}>
              <View style={styles.timeline}>
                <View style={[styles.entryIcon, { backgroundColor: acCol + '18' }]}>
                  <Ionicons name={icon as any} size={14} color={acCol} />
                </View>
                {idx < filtered.length - 1 && <View style={[styles.connector, { backgroundColor: colors.border }]} />}
              </View>
              <View style={[styles.entryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.entryHeader}>
                  <Text style={[styles.entryAction, { color: colors.text }]}>{entry.action}</Text>
                  <Text style={[styles.entryTime, { color: colors.textSubtle }]}>{fmtDateTime(entry.ts)}</Text>
                </View>
                <Text style={[styles.entryUser, { color: acCol }]}>{entry.user}</Text>
                <Text style={[styles.entryDetail, { color: colors.textMuted }]}>{entry.detail}</Text>
              </View>
            </View>
          );
        })}
        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={40} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No matching audit entries</Text>
          </View>
        )}
        <View style={{ height: 16 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 4 },
  searchInput: { flex: 1, fontSize: 14 },
  countText: { fontSize: 12, marginBottom: 12 },
  entryRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  timeline: { alignItems: 'center', width: 34 },
  entryIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  connector: { width: 2, flex: 1, marginTop: 4, minHeight: 16 },
  entryCard: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, gap: 3 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  entryAction: { fontSize: 13, fontWeight: '700', flex: 1 },
  entryTime: { fontSize: 10 },
  entryUser: { fontSize: 12, fontWeight: '600' },
  entryDetail: { fontSize: 12, lineHeight: 17 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14 },
});
