import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const SETTINGS_SECTIONS = [
  {
    title: 'Company Information',
    icon: 'business',
    items: [
      { label: 'Company Name', value: 'PetroTrack Energy Ltd', type: 'text' },
      { label: 'RC Number', value: 'RC-0987654', type: 'text' },
      { label: 'Tax ID (TIN)', value: '0123456789-0001', type: 'text' },
      { label: 'Head Office Address', value: 'Plot 22, CBD, Abuja, FCT', type: 'text' },
    ],
  },
  {
    title: 'Financial Settings',
    icon: 'calculator',
    items: [
      { label: 'VAT Rate', value: '7.5%', type: 'text' },
      { label: 'WHT Rate', value: '5%', type: 'text' },
      { label: 'Reporting Currency', value: 'NGN (₦)', type: 'text' },
      { label: 'Fiscal Year Start', value: 'January', type: 'text' },
    ],
  },
  {
    title: 'Operations Settings',
    icon: 'construct',
    items: [
      { label: 'Low Stock Alert Threshold', value: '30%', type: 'text' },
      { label: 'Reorder Level', value: '25%', type: 'text' },
      { label: 'Daily Dip Required', value: 'Yes', type: 'toggle' },
      { label: 'Auto-Audit Logging', value: 'Yes', type: 'toggle' },
    ],
  },
  {
    title: 'System Settings',
    icon: 'settings',
    items: [
      { label: 'App Version', value: 'v2.5.1', type: 'readonly' },
      { label: 'Database Status', value: 'Online ✓', type: 'readonly' },
      { label: 'Last Backup', value: 'Today, 03:00 AM', type: 'readonly' },
      { label: 'Environment', value: 'Production', type: 'readonly' },
    ],
  },
];

export default function SystemSettingsScreen() {
  const { role } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'admin'] || colors.primary;
  const [toggles, setToggles] = useState<Record<string, boolean>>({ 'Daily Dip Required': true, 'Auto-Audit Logging': true });

  function handleSave() {
    Alert.alert('Settings Saved', 'All settings have been saved successfully.');
  }

  return (
    <ScreenLayout title="System Settings">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.banner, { backgroundColor: '#0a2318' }]}>
          <Ionicons name="settings" size={24} color="#4CAF50" />
          <View>
            <Text style={styles.bannerTitle}>System Configuration</Text>
            <Text style={styles.bannerSub}>Administrator access only</Text>
          </View>
        </View>

        {SETTINGS_SECTIONS.map(section => (
          <View key={section.title} style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: roleColor + '18' }]}>
                <Ionicons name={section.icon as any} size={16} color={roleColor} />
              </View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
            </View>
            {section.items.map((item, idx) => (
              <View key={item.label} style={[styles.settingRow, { borderTopColor: colors.border, borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth }]}>
                <Text style={[styles.settingLabel, { color: colors.textMuted }]}>{item.label}</Text>
                {item.type === 'toggle' ? (
                  <Switch
                    value={toggles[item.label] ?? true}
                    onValueChange={v => setToggles(t => ({ ...t, [item.label]: v }))}
                    trackColor={{ true: roleColor, false: colors.border }}
                    thumbColor="#fff"
                  />
                ) : item.type === 'readonly' ? (
                  <Text style={[styles.settingValue, { color: colors.text }]}>{item.value}</Text>
                ) : (
                  <TextInput
                    style={[styles.settingInput, { color: colors.text }]}
                    defaultValue={item.value}
                    editable={true}
                  />
                )}
              </View>
            ))}
          </View>
        ))}

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: roleColor }]} onPress={handleSave} activeOpacity={0.85}>
          <Ionicons name="save" size={18} color="#fff" />
          <Text style={styles.saveBtnText}>Save Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.dangerBtn, { borderColor: colors.errorBorder }]} onPress={() => Alert.alert('Confirm', 'Clear all cached data?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => {} }])} activeOpacity={0.85}>
          <Ionicons name="trash-outline" size={16} color={colors.error} />
          <Text style={[styles.dangerBtnText, { color: colors.error }]}>Clear Cache</Text>
        </TouchableOpacity>
        <View style={{ height: 16 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, marginBottom: 16 },
  bannerTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  bannerSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  section: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  settingLabel: { fontSize: 13, flex: 1 },
  settingValue: { fontSize: 13, fontWeight: '600', textAlign: 'right', maxWidth: '55%' },
  settingInput: { fontSize: 13, fontWeight: '500', textAlign: 'right', maxWidth: '55%' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginBottom: 10 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1 },
  dangerBtnText: { fontSize: 14, fontWeight: '600' },
});
