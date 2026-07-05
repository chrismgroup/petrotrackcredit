import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { Pump, ROLE_COLORS, Tank, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type Tab = 'company' | 'tanks' | 'pumps' | 'staff' | 'system';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'company', label: 'Company', icon: 'business' },
  { id: 'tanks',   label: 'Tanks',   icon: 'water' },
  { id: 'pumps',   label: 'Pumps',   icon: 'speedometer' },
  { id: 'staff',   label: 'Staff',   icon: 'people' },
  { id: 'system',  label: 'System',  icon: 'settings' },
];

const PROD_OPTS: Tank['prod'][] = ['PMS', 'AGO', 'DPK'];
const PROD_COLORS: Record<string, string> = { PMS: '#1a6e3c', AGO: '#185FA5', DPK: '#BA7517', LPG: '#0F6E56' };

export default function SystemSettingsScreen() {
  const { role, tanks, lpgTanks, pumps, staff, updateTank, updateLpgTank, updatePump, updateStaff } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'admin'] || colors.primary;
  const isAdmin = role === 'admin';

  const [activeTab, setActiveTab] = useState<Tab>('company');
  const [toggles, setToggles] = useState<Record<string, boolean>>({ 'Daily Dip Required': true, 'Auto-Audit Logging': true });

  const [companySettings] = useState({
    companyName: 'PetroTrack Energy Ltd',
    rcNumber: 'RC-0987654',
    tin: '0123456789-0001',
    address: 'Plot 22, CBD, Abuja, FCT',
    vatRate: '7.5',
    whtRate: '5',
    currency: 'NGN (₦)',
    fiscalYear: 'January',
    lowStockAlert: '30',
    reorderLevel: '25',
  });

  const [tankEdits, setTankEdits] = useState<Record<string, { name: string; cap: string; dip: string; prod: Tank['prod'] }>>({});
  const [lpgEdits, setLpgEdits] = useState<Record<string, { name: string; cap: string }>>({});
  const [pumpEdits, setPumpEdits] = useState<Record<string, { name: string; prod: Pump['prod']; active: boolean }>>({});
  const [staffEdits, setStaffEdits] = useState<Record<number, { name: string; email: string }>>({});

  useEffect(() => {
    const te: typeof tankEdits = {};
    for (const t of tanks) te[t.id] = { name: t.name, cap: String(t.cap), dip: String(t.dip), prod: t.prod };
    setTankEdits(te);
  }, [tanks]);

  useEffect(() => {
    const le: typeof lpgEdits = {};
    for (const l of lpgTanks) le[l.id] = { name: l.name, cap: String(l.cap) };
    setLpgEdits(le);
  }, [lpgTanks]);

  useEffect(() => {
    const pe: typeof pumpEdits = {};
    for (const p of pumps) pe[p.id] = { name: p.name, prod: p.prod, active: p.active };
    setPumpEdits(pe);
  }, [pumps]);

  useEffect(() => {
    const se: typeof staffEdits = {};
    for (const m of staff) se[m.id] = { name: m.name, email: m.email };
    setStaffEdits(se);
  }, [staff]);

  function saveTanks() {
    let saved = 0;
    for (const [id, e] of Object.entries(tankEdits)) {
      const cap = parseInt(e.cap); const dip = parseInt(e.dip);
      if (!e.name.trim()) { Alert.alert('Error', `Tank ${id} name cannot be empty.`); return; }
      if (!cap || cap < 1000) { Alert.alert('Error', `Tank ${id} capacity must be at least 1,000L.`); return; }
      updateTank(id, { name: e.name.trim(), cap, dip: dip || Math.round(cap / 10), prod: e.prod });
      saved++;
    }
    for (const [id, e] of Object.entries(lpgEdits)) {
      const cap = parseInt(e.cap);
      if (!e.name.trim()) { Alert.alert('Error', `LPG Tank ${id} name cannot be empty.`); return; }
      if (!cap || cap < 100) { Alert.alert('Error', `LPG Tank ${id} capacity must be at least 100 kg.`); return; }
      updateLpgTank(id, { name: e.name.trim(), cap });
    }
    Alert.alert('Saved', `${saved + lpgTanks.length} tank configurations updated. Changes are now reflected across all screens.`);
  }

  function savePumps() {
    for (const [id, e] of Object.entries(pumpEdits)) {
      if (!e.name.trim()) { Alert.alert('Error', `Pump ${id} name cannot be empty.`); return; }
      updatePump(id, { name: e.name.trim(), prod: e.prod, active: e.active });
    }
    Alert.alert('Saved', `${pumps.length} pump configurations updated.`);
  }

  function saveStaff() {
    for (const [idStr, e] of Object.entries(staffEdits)) {
      const id = parseInt(idStr);
      if (!e.name.trim()) { Alert.alert('Error', 'Staff name cannot be empty.'); return; }
      updateStaff(id, { name: e.name.trim(), email: e.email.trim() });
    }
    Alert.alert('Saved', 'Staff names and contact details updated.');
  }

  return (
    <ScreenLayout title="System Settings">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
            {TABS.map(t => (
              <TouchableOpacity key={t.id} onPress={() => setActiveTab(t.id)} style={[styles.tab, { borderBottomColor: t.id === activeTab ? roleColor : 'transparent', borderBottomWidth: 2 }]}>
                <Ionicons name={t.icon as any} size={14} color={t.id === activeTab ? roleColor : colors.textMuted} />
                <Text style={[styles.tabLabel, { color: t.id === activeTab ? roleColor : colors.textMuted, fontWeight: t.id === activeTab ? '700' : '400' }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ─── Company Tab ─── */}
          {activeTab === 'company' && (
            <>
              <View style={[styles.banner, { backgroundColor: '#0a2318' }]}>
                <Ionicons name="settings" size={22} color="#4CAF50" />
                <View>
                  <Text style={styles.bannerTitle}>System Configuration</Text>
                  <Text style={styles.bannerSub}>Administrator access only</Text>
                </View>
              </View>
              {[
                { title: 'Company Information', icon: 'business', items: [
                  { label: 'Company Name', key: 'companyName' }, { label: 'RC Number', key: 'rcNumber' },
                  { label: 'Tax ID (TIN)', key: 'tin' }, { label: 'Head Office Address', key: 'address' },
                ]},
                { title: 'Financial Settings', icon: 'calculator', items: [
                  { label: 'VAT Rate (%)', key: 'vatRate' }, { label: 'WHT Rate (%)', key: 'whtRate' },
                  { label: 'Currency', key: 'currency' }, { label: 'Fiscal Year Start', key: 'fiscalYear' },
                ]},
                { title: 'Operations Settings', icon: 'construct', items: [
                  { label: 'Low Stock Alert (%)', key: 'lowStockAlert' }, { label: 'Reorder Level (%)', key: 'reorderLevel' },
                ]},
              ].map(section => (
                <View key={section.title} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.cardIcon, { backgroundColor: roleColor + '18' }]}>
                      <Ionicons name={section.icon as any} size={15} color={roleColor} />
                    </View>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{section.title}</Text>
                  </View>
                  {section.items.map((item, idx) => (
                    <View key={item.label} style={[styles.settingRow, { borderTopColor: colors.border, borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth }]}>
                      <Text style={[styles.settingLabel, { color: colors.textMuted }]}>{item.label}</Text>
                      <TextInput
                        style={[styles.settingInput, { color: colors.text }]}
                        defaultValue={(companySettings as any)[item.key]}
                        editable={isAdmin}
                      />
                    </View>
                  ))}
                  <View style={[styles.settingRow, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={[styles.settingLabel, { color: colors.textMuted }]}>Daily Dip Required</Text>
                    <Switch value={toggles['Daily Dip Required']} onValueChange={v => setToggles(t => ({ ...t, 'Daily Dip Required': v }))} trackColor={{ true: roleColor, false: colors.border }} thumbColor="#fff" disabled={!isAdmin} />
                  </View>
                  <View style={[styles.settingRow, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={[styles.settingLabel, { color: colors.textMuted }]}>Auto-Audit Logging</Text>
                    <Switch value={toggles['Auto-Audit Logging']} onValueChange={v => setToggles(t => ({ ...t, 'Auto-Audit Logging': v }))} trackColor={{ true: roleColor, false: colors.border }} thumbColor="#fff" disabled={!isAdmin} />
                  </View>
                </View>
              ))}
              {isAdmin && (
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: roleColor }]} onPress={() => Alert.alert('Settings Saved', 'Company settings updated successfully.')} activeOpacity={0.85}>
                  <Ionicons name="save" size={16} color="#fff" />
                  <Text style={styles.saveBtnText}>Save Company Settings</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* ─── Tanks Tab ─── */}
          {activeTab === 'tanks' && (
            <>
              {!isAdmin && (
                <View style={[styles.lockBanner, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
                  <Ionicons name="lock-closed" size={16} color={colors.error} />
                  <Text style={[styles.lockText, { color: colors.error }]}>Only System Admin can edit tank configurations.</Text>
                </View>
              )}

              <Text style={[styles.sectionTitle, { color: colors.text }]}>Petroleum Tanks</Text>
              {tanks.map(tank => {
                const e = tankEdits[tank.id] || { name: tank.name, cap: String(tank.cap), dip: String(tank.dip), prod: tank.prod };
                return (
                  <View key={tank.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.tankCardHeader}>
                      <View style={[styles.tankIdBadge, { backgroundColor: roleColor + '18' }]}>
                        <Text style={[styles.tankIdText, { color: roleColor }]}>{tank.id}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.tankCurrentName, { color: colors.textMuted }]}>Current: {tank.name}</Text>
                        <Text style={[styles.tankCurrentCap, { color: colors.textSubtle }]}>{tank.cap.toLocaleString()}L capacity</Text>
                      </View>
                    </View>

                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Tank Name</Text>
                    <TextInput
                      style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                      value={e.name}
                      onChangeText={v => setTankEdits(t => ({ ...t, [tank.id]: { ...e, name: v } }))}
                      editable={isAdmin}
                      placeholder="e.g. Main PMS Storage Tank"
                      placeholderTextColor={colors.textSubtle}
                    />

                    <View style={styles.twoCol}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Capacity (L)</Text>
                        <TextInput
                          style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                          value={e.cap}
                          onChangeText={v => setTankEdits(t => ({ ...t, [tank.id]: { ...e, cap: v } }))}
                          keyboardType="numeric" editable={isAdmin}
                          placeholder="25000"
                          placeholderTextColor={colors.textSubtle}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Full-tank Dip (mm)</Text>
                        <TextInput
                          style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                          value={e.dip}
                          onChangeText={v => setTankEdits(t => ({ ...t, [tank.id]: { ...e, dip: v } }))}
                          keyboardType="numeric" editable={isAdmin}
                          placeholder="2500"
                          placeholderTextColor={colors.textSubtle}
                        />
                      </View>
                    </View>

                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Product Type</Text>
                    <View style={styles.prodRow}>
                      {PROD_OPTS.map(p => (
                        <TouchableOpacity
                          key={p} disabled={!isAdmin}
                          onPress={() => setTankEdits(t => ({ ...t, [tank.id]: { ...e, prod: p } }))}
                          style={[styles.prodChip, { backgroundColor: e.prod === p ? PROD_COLORS[p] : colors.background, borderColor: e.prod === p ? PROD_COLORS[p] : colors.border }]}
                        >
                          <Text style={[styles.prodChipText, { color: e.prod === p ? '#fff' : colors.textMuted }]}>{p}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              })}

              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 8 }]}>LPG Tanks</Text>
              {lpgTanks.map(tank => {
                const e = lpgEdits[tank.id] || { name: tank.name, cap: String(tank.cap) };
                return (
                  <View key={tank.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.tankCardHeader}>
                      <View style={[styles.tankIdBadge, { backgroundColor: '#0F6E5618' }]}>
                        <Text style={[styles.tankIdText, { color: '#0F6E56' }]}>{tank.id}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.tankCurrentName, { color: colors.textMuted }]}>Current: {tank.name}</Text>
                        <Text style={[styles.tankCurrentCap, { color: colors.textSubtle }]}>{tank.cap.toLocaleString()} kg capacity</Text>
                      </View>
                    </View>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Tank Name</Text>
                    <TextInput
                      style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                      value={e.name}
                      onChangeText={v => setLpgEdits(l => ({ ...l, [tank.id]: { ...e, name: v } }))}
                      editable={isAdmin}
                      placeholderTextColor={colors.textSubtle}
                    />
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Capacity (kg)</Text>
                    <TextInput
                      style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                      value={e.cap}
                      onChangeText={v => setLpgEdits(l => ({ ...l, [tank.id]: { ...e, cap: v } }))}
                      keyboardType="numeric" editable={isAdmin}
                      placeholderTextColor={colors.textSubtle}
                    />
                  </View>
                );
              })}

              {isAdmin && (
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: roleColor }]} onPress={saveTanks} activeOpacity={0.85}>
                  <Ionicons name="save" size={16} color="#fff" />
                  <Text style={styles.saveBtnText}>Save Tank Configuration</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* ─── Pumps Tab ─── */}
          {activeTab === 'pumps' && (
            <>
              {!isAdmin && (
                <View style={[styles.lockBanner, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
                  <Ionicons name="lock-closed" size={16} color={colors.error} />
                  <Text style={[styles.lockText, { color: colors.error }]}>Only System Admin can edit pump configurations.</Text>
                </View>
              )}
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Pump Configuration</Text>
              {pumps.map(pump => {
                const e = pumpEdits[pump.id] || { name: pump.name, prod: pump.prod, active: pump.active };
                return (
                  <View key={pump.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.pumpCardHeader}>
                      <View style={[styles.tankIdBadge, { backgroundColor: (PROD_COLORS[e.prod] || roleColor) + '18' }]}>
                        <Text style={[styles.tankIdText, { color: PROD_COLORS[e.prod] || roleColor }]}>{pump.id}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.tankCurrentName, { color: colors.textMuted }]}>Current: {pump.name}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.fieldLabel, { color: colors.textMuted, marginBottom: 0 }]}>Active</Text>
                        <Switch
                          value={e.active}
                          onValueChange={v => setPumpEdits(p => ({ ...p, [pump.id]: { ...e, active: v } }))}
                          trackColor={{ true: roleColor, false: colors.border }}
                          thumbColor="#fff"
                          disabled={!isAdmin}
                        />
                      </View>
                    </View>

                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Pump Name</Text>
                    <TextInput
                      style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                      value={e.name}
                      onChangeText={v => setPumpEdits(p => ({ ...p, [pump.id]: { ...e, name: v } }))}
                      editable={isAdmin}
                      placeholder="e.g. Forecourt Pump A"
                      placeholderTextColor={colors.textSubtle}
                    />

                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Product</Text>
                    <View style={styles.prodRow}>
                      {(['PMS', 'AGO', 'DPK', 'LPG'] as const).map(p => (
                        <TouchableOpacity
                          key={p} disabled={!isAdmin}
                          onPress={() => setPumpEdits(ps => ({ ...ps, [pump.id]: { ...e, prod: p } }))}
                          style={[styles.prodChip, { backgroundColor: e.prod === p ? PROD_COLORS[p] : colors.background, borderColor: e.prod === p ? PROD_COLORS[p] : colors.border }]}
                        >
                          <Text style={[styles.prodChipText, { color: e.prod === p ? '#fff' : colors.textMuted }]}>{p}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              })}

              {isAdmin && (
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: roleColor }]} onPress={savePumps} activeOpacity={0.85}>
                  <Ionicons name="save" size={16} color="#fff" />
                  <Text style={styles.saveBtnText}>Save Pump Configuration</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* ─── Staff Tab ─── */}
          {activeTab === 'staff' && (
            <>
              {!isAdmin && (
                <View style={[styles.lockBanner, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
                  <Ionicons name="lock-closed" size={16} color={colors.error} />
                  <Text style={[styles.lockText, { color: colors.error }]}>Only System Admin can edit staff information.</Text>
                </View>
              )}
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Staff Directory</Text>
              {staff.map(member => {
                const e = staffEdits[member.id] || { name: member.name, email: member.email };
                return (
                  <View key={member.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.pumpCardHeader}>
                      <View style={[styles.tankIdBadge, { backgroundColor: roleColor + '18' }]}>
                        <Text style={[styles.initials, { color: roleColor }]}>{(e.name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('')}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.tankCurrentName, { color: colors.textMuted }]}>{member.role.toUpperCase()}</Text>
                        <View style={[styles.stBadge, { backgroundColor: member.st === 'Active' ? colors.successBg : colors.errorBg }]}>
                          <Text style={[styles.stText, { color: member.st === 'Active' ? colors.success : colors.error }]}>{member.st}</Text>
                        </View>
                      </View>
                    </View>

                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Full Name</Text>
                    <TextInput
                      style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                      value={e.name}
                      onChangeText={v => setStaffEdits(s => ({ ...s, [member.id]: { ...e, name: v } }))}
                      editable={isAdmin}
                      placeholder="Enter full name"
                      placeholderTextColor={colors.textSubtle}
                    />

                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Email Address</Text>
                    <TextInput
                      style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                      value={e.email}
                      onChangeText={v => setStaffEdits(s => ({ ...s, [member.id]: { ...e, email: v } }))}
                      editable={isAdmin}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholder="user@company.com"
                      placeholderTextColor={colors.textSubtle}
                    />
                  </View>
                );
              })}

              {isAdmin && (
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: roleColor }]} onPress={saveStaff} activeOpacity={0.85}>
                  <Ionicons name="save" size={16} color="#fff" />
                  <Text style={styles.saveBtnText}>Save Staff Information</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* ─── System Tab ─── */}
          {activeTab === 'system' && (
            <>
              <View style={[styles.banner, { backgroundColor: '#0a2318' }]}>
                <Ionicons name="server" size={22} color="#4CAF50" />
                <View>
                  <Text style={styles.bannerTitle}>System Information</Text>
                  <Text style={styles.bannerSub}>Read-only diagnostic data</Text>
                </View>
              </View>
              {[
                { label: 'App Version',      value: 'v2.5.1' },
                { label: 'Database Status',  value: 'Online ✓' },
                { label: 'Last Backup',      value: 'Today, 03:00 AM' },
                { label: 'Environment',      value: 'Production' },
                { label: 'Total Tanks',      value: `${tanks.length} fuel + ${lpgTanks.length} LPG` },
                { label: 'Active Pumps',     value: `${pumps.filter(p => p.active).length} of ${pumps.length}` },
                { label: 'Registered Staff', value: `${staff.length} users` },
              ].map((item, idx) => (
                <View key={item.label} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.settingRow, { borderTopWidth: 0 }]}>
                    <Text style={[styles.settingLabel, { color: colors.textMuted }]}>{item.label}</Text>
                    <Text style={[styles.settingValue, { color: colors.text }]}>{item.value}</Text>
                  </View>
                </View>
              ))}
              {isAdmin && (
                <TouchableOpacity
                  style={[styles.dangerBtn, { borderColor: colors.errorBorder }]}
                  onPress={() => Alert.alert('Confirm', 'Clear all cached data?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => {} }])}
                  activeOpacity={0.85}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                  <Text style={[styles.dangerBtnText, { color: colors.error }]}>Clear Cache</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  tabScroll: { paddingHorizontal: 8, paddingVertical: 2 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 11 },
  tabLabel: { fontSize: 12 },
  scroll: { padding: 16 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, marginBottom: 16 },
  bannerTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  bannerSub: { color: 'rgba(255,255,255,0.55)', fontSize: 11 },
  lockBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  lockText: { flex: 1, fontSize: 13, fontWeight: '600' },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12, gap: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  settingLabel: { fontSize: 13, flex: 1 },
  settingValue: { fontSize: 13, fontWeight: '600', textAlign: 'right' },
  settingInput: { fontSize: 13, fontWeight: '500', textAlign: 'right', maxWidth: '55%' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  tankCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  tankIdBadge: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tankIdText: { fontSize: 11, fontWeight: '800' },
  initials: { fontSize: 13, fontWeight: '800' },
  tankCurrentName: { fontSize: 12, fontWeight: '600' },
  tankCurrentCap: { fontSize: 11, marginTop: 1 },
  pumpCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '600', marginBottom: 5, marginTop: 4 },
  fieldInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginBottom: 4 },
  twoCol: { flexDirection: 'row', gap: 8 },
  prodRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  prodChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  prodChipText: { fontSize: 12, fontWeight: '700' },
  stBadge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, marginTop: 3 },
  stText: { fontSize: 10, fontWeight: '700' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginBottom: 10 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1, marginTop: 8 },
  dangerBtnText: { fontSize: 14, fontWeight: '600' },
});
