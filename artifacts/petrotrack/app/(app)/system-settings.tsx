import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
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
const PROD_COLORS: Record<string, string> = {
  PMS: '#1a6e3c', AGO: '#185FA5', DPK: '#BA7517', LPG: '#0F6E56',
};
const ROLE_OPTS = ['admin', 'ceo', 'md', 'mktg', 'csm', 'acc', 'mgr', 'att'] as const;
const ROLE_LABELS: Record<string, string> = {
  admin: 'System Admin', ceo: 'CEO', md: 'MD', mktg: 'Marketing',
  csm: 'CSM', acc: 'Accountant', mgr: 'Station Manager', att: 'Pump Attendant',
};

const BLANK_TANK  = { name: '', cap: '', dip: '', prod: 'PMS' as Tank['prod'] };
const BLANK_LPG   = { name: '', cap: '' };
const BLANK_PUMP  = { name: '', prod: 'PMS' as Pump['prod'], active: true };
const BLANK_STAFF = { name: '', email: '', role: 'att' as typeof ROLE_OPTS[number], sal: '' };

export default function SystemSettingsScreen() {
  const {
    role, tanks, lpgTanks, pumps, staff,
    addTank, addLpgTank, addPump, addStaff,
    updateTank, updateLpgTank, updatePump, updateStaff,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'admin'] || colors.primary;
  const isAdmin = role === 'admin';

  const [activeTab, setActiveTab] = useState<Tab>('company');
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    'Daily Dip Required': true, 'Auto-Audit Logging': true,
  });

  /* ── edit state (existing items) ── */
  const [tankEdits, setTankEdits] = useState<Record<string, { name: string; cap: string; dip: string; prod: Tank['prod'] }>>({});
  const [lpgEdits,  setLpgEdits]  = useState<Record<string, { name: string; cap: string }>>({});
  const [pumpEdits, setPumpEdits] = useState<Record<string, { name: string; prod: Pump['prod']; active: boolean }>>({});
  const [staffEdits,setStaffEdits]= useState<Record<number, { name: string; email: string }>>({});

  /* ── new-item forms ── */
  const [showNewTank,  setShowNewTank]  = useState(false);
  const [showNewLpg,   setShowNewLpg]   = useState(false);
  const [showNewPump,  setShowNewPump]  = useState(false);
  const [showNewStaff, setShowNewStaff] = useState(false);
  const [newTank,  setNewTank]  = useState(BLANK_TANK);
  const [newLpg,   setNewLpg]   = useState(BLANK_LPG);
  const [newPump,  setNewPump]  = useState(BLANK_PUMP);
  const [newStaff, setNewStaff] = useState(BLANK_STAFF);

  const scrollRef = useRef<ScrollView>(null);

  /* sync edits when context changes */
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

  /* ── save handlers ── */
  function saveTanks() {
    for (const [id, e] of Object.entries(tankEdits)) {
      const cap = parseInt(e.cap); const dip = parseInt(e.dip);
      if (!e.name.trim()) { Alert.alert('Error', `Tank ${id} name cannot be empty.`); return; }
      if (!cap || cap < 1000) { Alert.alert('Error', `Tank ${id} capacity must be at least 1,000 L.`); return; }
      updateTank(id, { name: e.name.trim(), cap, dip: dip || Math.round(cap / 10), prod: e.prod });
    }
    for (const [id, e] of Object.entries(lpgEdits)) {
      const cap = parseInt(e.cap);
      if (!e.name.trim()) { Alert.alert('Error', `LPG Tank ${id} name cannot be empty.`); return; }
      if (!cap || cap < 100) { Alert.alert('Error', `LPG Tank ${id} capacity must be at least 100 kg.`); return; }
      updateLpgTank(id, { name: e.name.trim(), cap });
    }
    Alert.alert('Saved', 'All tank configurations updated. Changes are reflected across all screens.');
  }

  function savePumps() {
    for (const [id, e] of Object.entries(pumpEdits)) {
      if (!e.name.trim()) { Alert.alert('Error', `Pump ${id} name cannot be empty.`); return; }
      updatePump(id, { name: e.name.trim(), prod: e.prod, active: e.active });
    }
    Alert.alert('Saved', `${pumps.length} pump configuration(s) updated.`);
  }

  function saveStaff() {
    for (const [idStr, e] of Object.entries(staffEdits)) {
      if (!e.name.trim()) { Alert.alert('Error', 'Staff name cannot be empty.'); return; }
      updateStaff(parseInt(idStr), { name: e.name.trim(), email: e.email.trim() });
    }
    Alert.alert('Saved', 'Staff information updated.');
  }

  /* ── create handlers ── */
  function createTank() {
    const cap = parseInt(newTank.cap);
    if (!newTank.name.trim()) { Alert.alert('Error', 'Tank name is required.'); return; }
    if (!cap || cap < 1000)   { Alert.alert('Error', 'Capacity must be at least 1,000 L.'); return; }
    addTank({ name: newTank.name.trim(), cap, prod: newTank.prod });
    setNewTank(BLANK_TANK);
    setShowNewTank(false);
    Alert.alert('Tank Added', `"${newTank.name.trim()}" has been added and is now visible on the Tanks screen.`);
  }

  function createLpgTank() {
    const cap = parseInt(newLpg.cap);
    if (!newLpg.name.trim()) { Alert.alert('Error', 'LPG tank name is required.'); return; }
    if (!cap || cap < 100)   { Alert.alert('Error', 'Capacity must be at least 100 kg.'); return; }
    addLpgTank({ name: newLpg.name.trim(), cap });
    setNewLpg(BLANK_LPG);
    setShowNewLpg(false);
    Alert.alert('LPG Tank Added', `"${newLpg.name.trim()}" has been added.`);
  }

  function createPump() {
    if (!newPump.name.trim()) { Alert.alert('Error', 'Pump name is required.'); return; }
    addPump({ name: newPump.name.trim(), prod: newPump.prod, active: newPump.active });
    setNewPump(BLANK_PUMP);
    setShowNewPump(false);
    Alert.alert('Pump Added', `"${newPump.name.trim()}" is now available in the Sales screen.`);
  }

  function createStaff() {
    if (!newStaff.name.trim())  { Alert.alert('Error', 'Full name is required.'); return; }
    if (!newStaff.email.trim()) { Alert.alert('Error', 'Email address is required.'); return; }
    const sal = parseInt(newStaff.sal) || 0;
    addStaff({ name: newStaff.name.trim(), email: newStaff.email.trim(), role: newStaff.role, sal, st: 'Active' });
    setNewStaff(BLANK_STAFF);
    setShowNewStaff(false);
    Alert.alert('User Created', `${newStaff.name.trim()} has been added as ${ROLE_LABELS[newStaff.role]}.`);
  }

  /* ── helpers ── */
  const LockBanner = () => isAdmin ? null : (
    <View style={[styles.lockBanner, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
      <Ionicons name="lock-closed" size={16} color={colors.error} />
      <Text style={[styles.lockText, { color: colors.error }]}>View only — System Admin can make changes.</Text>
    </View>
  );

  const AddBtn = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <TouchableOpacity style={[styles.addBtn, { borderColor: roleColor, backgroundColor: roleColor + '12' }]} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name="add-circle-outline" size={18} color={roleColor} />
      <Text style={[styles.addBtnText, { color: roleColor }]}>{label}</Text>
    </TouchableOpacity>
  );

  const SaveBtn = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <TouchableOpacity style={[styles.saveBtn, { backgroundColor: roleColor }]} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name="save" size={16} color="#fff" />
      <Text style={styles.saveBtnText}>{label}</Text>
    </TouchableOpacity>
  );

  const FieldInput = ({
    label, value, onChangeText, keyboardType = 'default', placeholder = '', editable = isAdmin, autoCapitalize = 'sentences',
  }: {
    label: string; value: string; onChangeText: (v: string) => void;
    keyboardType?: 'default' | 'numeric' | 'email-address'; placeholder?: string;
    editable?: boolean; autoCapitalize?: 'none' | 'sentences' | 'words';
  }) => (
    <View style={{ marginBottom: 4 }}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text, opacity: editable ? 1 : 0.55 }]}
        value={value} onChangeText={onChangeText} editable={editable}
        keyboardType={keyboardType} placeholder={placeholder} placeholderTextColor={colors.textSubtle}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );

  const ProdPicker = ({
    value, onChange, opts,
  }: { value: string; onChange: (v: any) => void; opts: string[] }) => (
    <View style={{ marginBottom: 4 }}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Product Type</Text>
      <View style={styles.prodRow}>
        {opts.map(p => (
          <TouchableOpacity key={p} disabled={!isAdmin}
            onPress={() => onChange(p)}
            style={[styles.prodChip, { backgroundColor: value === p ? PROD_COLORS[p] : colors.background, borderColor: value === p ? PROD_COLORS[p] : colors.border }]}
          >
            <Text style={[styles.prodChipText, { color: value === p ? '#fff' : colors.textMuted }]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const RolePicker = ({ value, onChange }: { value: string; onChange: (v: any) => void }) => (
    <View style={{ marginBottom: 4 }}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Role</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.prodRow}>
          {ROLE_OPTS.map(r => (
            <TouchableOpacity key={r} disabled={!isAdmin}
              onPress={() => onChange(r)}
              style={[styles.prodChip, { backgroundColor: value === r ? roleColor : colors.background, borderColor: value === r ? roleColor : colors.border }]}
            >
              <Text style={[styles.prodChipText, { color: value === r ? '#fff' : colors.textMuted }]}>{ROLE_LABELS[r]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  return (
    <ScreenLayout title="System Settings">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Tab bar */}
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
            {TABS.map(t => (
              <TouchableOpacity key={t.id} onPress={() => setActiveTab(t.id)}
                style={[styles.tab, { borderBottomColor: t.id === activeTab ? roleColor : 'transparent', borderBottomWidth: 2 }]}
              >
                <Ionicons name={t.icon as any} size={14} color={t.id === activeTab ? roleColor : colors.textMuted} />
                <Text style={[styles.tabLabel, { color: t.id === activeTab ? roleColor : colors.textMuted, fontWeight: t.id === activeTab ? '700' : '400' }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── COMPANY ── */}
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
                  { label: 'Company Name', v: 'PetroTrack Energy Ltd' }, { label: 'RC Number', v: 'RC-0987654' },
                  { label: 'Tax ID (TIN)', v: '0123456789-0001' }, { label: 'Head Office Address', v: 'Plot 22, CBD, Abuja, FCT' },
                ]},
                { title: 'Financial Settings', icon: 'calculator', items: [
                  { label: 'VAT Rate (%)', v: '7.5' }, { label: 'WHT Rate (%)', v: '5' },
                  { label: 'Currency', v: 'NGN (₦)' }, { label: 'Fiscal Year Start', v: 'January' },
                ]},
                { title: 'Operations Settings', icon: 'construct', items: [
                  { label: 'Low Stock Alert (%)', v: '30' }, { label: 'Reorder Level (%)', v: '25' },
                ]},
              ].map(section => (
                <View key={section.title} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.iconBox, { backgroundColor: roleColor + '18' }]}>
                      <Ionicons name={section.icon as any} size={15} color={roleColor} />
                    </View>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{section.title}</Text>
                  </View>
                  {section.items.map((item, idx) => (
                    <View key={item.label} style={[styles.settingRow, { borderTopColor: colors.border, borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth }]}>
                      <Text style={[styles.settingLabel, { color: colors.textMuted }]}>{item.label}</Text>
                      <TextInput style={[styles.settingInput, { color: colors.text }]} defaultValue={item.v} editable={isAdmin} />
                    </View>
                  ))}
                  {section.title === 'Operations Settings' && (
                    <>
                      {['Daily Dip Required', 'Auto-Audit Logging'].map(lbl => (
                        <View key={lbl} style={[styles.settingRow, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                          <Text style={[styles.settingLabel, { color: colors.textMuted }]}>{lbl}</Text>
                          <Switch value={toggles[lbl]} onValueChange={v => setToggles(t => ({ ...t, [lbl]: v }))} trackColor={{ true: roleColor, false: colors.border }} thumbColor="#fff" disabled={!isAdmin} />
                        </View>
                      ))}
                    </>
                  )}
                </View>
              ))}
              {isAdmin && <SaveBtn label="Save Company Settings" onPress={() => Alert.alert('Settings Saved', 'Company settings updated successfully.')} />}
            </>
          )}

          {/* ── TANKS ── */}
          {activeTab === 'tanks' && (
            <>
              <LockBanner />

              {/* Petroleum tanks — existing */}
              <View style={styles.sectionRow}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Petroleum Tanks</Text>
                <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{tanks.length} tanks</Text>
              </View>
              {tanks.map(tank => {
                const e = tankEdits[tank.id] ?? { name: tank.name, cap: String(tank.cap), dip: String(tank.dip), prod: tank.prod };
                return (
                  <View key={tank.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.itemHeader}>
                      <View style={[styles.idBadge, { backgroundColor: roleColor + '18' }]}>
                        <Text style={[styles.idText, { color: roleColor }]}>{tank.id}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemCurrent, { color: colors.textMuted }]}>Current: {tank.name}</Text>
                        <Text style={[styles.itemSub, { color: colors.textSubtle }]}>{tank.cap.toLocaleString()} L</Text>
                      </View>
                      <View style={[styles.prodPill, { backgroundColor: PROD_COLORS[tank.prod] + '22', borderColor: PROD_COLORS[tank.prod] + '55' }]}>
                        <Text style={[styles.prodPillText, { color: PROD_COLORS[tank.prod] }]}>{tank.prod}</Text>
                      </View>
                    </View>
                    <FieldInput label="Tank Name" value={e.name} onChangeText={v => setTankEdits(t => ({ ...t, [tank.id]: { ...e, name: v } }))} placeholder="e.g. Main PMS Storage Tank" />
                    <View style={styles.twoCol}>
                      <View style={{ flex: 1 }}>
                        <FieldInput label="Capacity (L)" value={e.cap} onChangeText={v => setTankEdits(t => ({ ...t, [tank.id]: { ...e, cap: v } }))} keyboardType="numeric" placeholder="25000" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <FieldInput label="Full Dip (mm)" value={e.dip} onChangeText={v => setTankEdits(t => ({ ...t, [tank.id]: { ...e, dip: v } }))} keyboardType="numeric" placeholder="2500" />
                      </View>
                    </View>
                    <ProdPicker value={e.prod} onChange={v => setTankEdits(t => ({ ...t, [tank.id]: { ...e, prod: v } }))} opts={PROD_OPTS} />
                  </View>
                );
              })}

              {/* Add new petroleum tank */}
              {isAdmin && !showNewTank && <AddBtn label="Add New Petroleum Tank" onPress={() => { setShowNewTank(true); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200); }} />}
              {isAdmin && showNewTank && (
                <View style={[styles.newCard, { backgroundColor: colors.infoBg, borderColor: roleColor + '55' }]}>
                  <View style={styles.newCardHeader}>
                    <View style={[styles.idBadge, { backgroundColor: roleColor + '22' }]}>
                      <Ionicons name="add" size={16} color={roleColor} />
                    </View>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>New Petroleum Tank</Text>
                    <TouchableOpacity onPress={() => { setShowNewTank(false); setNewTank(BLANK_TANK); }}>
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <FieldInput label="Tank Name *" value={newTank.name} onChangeText={v => setNewTank(n => ({ ...n, name: v }))} placeholder="e.g. PMS Tank 5" />
                  <View style={styles.twoCol}>
                    <View style={{ flex: 1 }}>
                      <FieldInput label="Capacity (L) *" value={newTank.cap} onChangeText={v => setNewTank(n => ({ ...n, cap: v }))} keyboardType="numeric" placeholder="25000" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FieldInput label="Full Dip (mm)" value={newTank.dip} onChangeText={v => setNewTank(n => ({ ...n, dip: v }))} keyboardType="numeric" placeholder="auto" />
                    </View>
                  </View>
                  <ProdPicker value={newTank.prod} onChange={v => setNewTank(n => ({ ...n, prod: v }))} opts={PROD_OPTS} />
                  <TouchableOpacity style={[styles.createBtn, { backgroundColor: roleColor }]} onPress={createTank} activeOpacity={0.85}>
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <Text style={styles.createBtnText}>Create Tank</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* LPG tanks — existing */}
              <View style={[styles.sectionRow, { marginTop: 16 }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>LPG Tanks</Text>
                <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{lpgTanks.length} tanks</Text>
              </View>
              {lpgTanks.map(tank => {
                const e = lpgEdits[tank.id] ?? { name: tank.name, cap: String(tank.cap) };
                return (
                  <View key={tank.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.itemHeader}>
                      <View style={[styles.idBadge, { backgroundColor: '#0F6E5618' }]}>
                        <Text style={[styles.idText, { color: '#0F6E56' }]}>{tank.id}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemCurrent, { color: colors.textMuted }]}>Current: {tank.name}</Text>
                        <Text style={[styles.itemSub, { color: colors.textSubtle }]}>{tank.cap.toLocaleString()} kg</Text>
                      </View>
                      <View style={[styles.prodPill, { backgroundColor: '#0F6E5622', borderColor: '#0F6E5655' }]}>
                        <Text style={[styles.prodPillText, { color: '#0F6E56' }]}>LPG</Text>
                      </View>
                    </View>
                    <FieldInput label="Tank Name" value={e.name} onChangeText={v => setLpgEdits(l => ({ ...l, [tank.id]: { ...e, name: v } }))} />
                    <FieldInput label="Capacity (kg)" value={e.cap} onChangeText={v => setLpgEdits(l => ({ ...l, [tank.id]: { ...e, cap: v } }))} keyboardType="numeric" />
                  </View>
                );
              })}

              {/* Add new LPG tank */}
              {isAdmin && !showNewLpg && <AddBtn label="Add New LPG Tank" onPress={() => { setShowNewLpg(true); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200); }} />}
              {isAdmin && showNewLpg && (
                <View style={[styles.newCard, { backgroundColor: colors.infoBg, borderColor: '#0F6E5655' }]}>
                  <View style={styles.newCardHeader}>
                    <View style={[styles.idBadge, { backgroundColor: '#0F6E5618' }]}>
                      <Ionicons name="add" size={16} color="#0F6E56" />
                    </View>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>New LPG Tank</Text>
                    <TouchableOpacity onPress={() => { setShowNewLpg(false); setNewLpg(BLANK_LPG); }}>
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <FieldInput label="Tank Name *" value={newLpg.name} onChangeText={v => setNewLpg(n => ({ ...n, name: v }))} placeholder="e.g. LPG Storage A" />
                  <FieldInput label="Capacity (kg) *" value={newLpg.cap} onChangeText={v => setNewLpg(n => ({ ...n, cap: v }))} keyboardType="numeric" placeholder="5000" />
                  <TouchableOpacity style={[styles.createBtn, { backgroundColor: '#0F6E56' }]} onPress={createLpgTank} activeOpacity={0.85}>
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <Text style={styles.createBtnText}>Create LPG Tank</Text>
                  </TouchableOpacity>
                </View>
              )}

              {isAdmin && (
                <SaveBtn label="Save Tank Configuration" onPress={saveTanks} />
              )}
            </>
          )}

          {/* ── PUMPS ── */}
          {activeTab === 'pumps' && (
            <>
              <LockBanner />
              <View style={styles.sectionRow}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Pump Configuration</Text>
                <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{pumps.filter(p => p.active).length}/{pumps.length} active</Text>
              </View>

              {pumps.map(pump => {
                const e = pumpEdits[pump.id] ?? { name: pump.name, prod: pump.prod, active: pump.active };
                return (
                  <View key={pump.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.itemHeader}>
                      <View style={[styles.idBadge, { backgroundColor: (PROD_COLORS[e.prod] || roleColor) + '18' }]}>
                        <Text style={[styles.idText, { color: PROD_COLORS[e.prod] || roleColor }]}>{pump.id}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemCurrent, { color: colors.textMuted }]}>Current: {pump.name}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.fieldLabel, { color: colors.textMuted, marginBottom: 0 }]}>Active</Text>
                        <Switch value={e.active} onValueChange={v => setPumpEdits(p => ({ ...p, [pump.id]: { ...e, active: v } }))} trackColor={{ true: roleColor, false: colors.border }} thumbColor="#fff" disabled={!isAdmin} />
                      </View>
                    </View>
                    <FieldInput label="Pump Name" value={e.name} onChangeText={v => setPumpEdits(p => ({ ...p, [pump.id]: { ...e, name: v } }))} placeholder="e.g. Forecourt Pump A" />
                    <ProdPicker value={e.prod} onChange={v => setPumpEdits(p => ({ ...p, [pump.id]: { ...e, prod: v } }))} opts={['PMS', 'AGO', 'DPK', 'LPG']} />
                  </View>
                );
              })}

              {/* Add new pump */}
              {isAdmin && !showNewPump && <AddBtn label="Add New Pump" onPress={() => { setShowNewPump(true); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200); }} />}
              {isAdmin && showNewPump && (
                <View style={[styles.newCard, { backgroundColor: colors.infoBg, borderColor: roleColor + '55' }]}>
                  <View style={styles.newCardHeader}>
                    <View style={[styles.idBadge, { backgroundColor: roleColor + '22' }]}>
                      <Ionicons name="add" size={16} color={roleColor} />
                    </View>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>New Pump</Text>
                    <TouchableOpacity onPress={() => { setShowNewPump(false); setNewPump(BLANK_PUMP); }}>
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <FieldInput label="Pump Name *" value={newPump.name} onChangeText={v => setNewPump(n => ({ ...n, name: v }))} placeholder="e.g. Pump #6 PMS" />
                  <ProdPicker value={newPump.prod} onChange={v => setNewPump(n => ({ ...n, prod: v }))} opts={['PMS', 'AGO', 'DPK', 'LPG']} />
                  <View style={[styles.settingRow, { borderTopWidth: 0, paddingTop: 4 }]}>
                    <Text style={[styles.settingLabel, { color: colors.textMuted }]}>Active from the start</Text>
                    <Switch value={newPump.active} onValueChange={v => setNewPump(n => ({ ...n, active: v }))} trackColor={{ true: roleColor, false: colors.border }} thumbColor="#fff" />
                  </View>
                  <TouchableOpacity style={[styles.createBtn, { backgroundColor: roleColor }]} onPress={createPump} activeOpacity={0.85}>
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <Text style={styles.createBtnText}>Create Pump</Text>
                  </TouchableOpacity>
                </View>
              )}

              {isAdmin && <SaveBtn label="Save Pump Configuration" onPress={savePumps} />}
            </>
          )}

          {/* ── STAFF ── */}
          {activeTab === 'staff' && (
            <>
              <LockBanner />
              <View style={styles.sectionRow}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Staff Directory</Text>
                <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{staff.filter(m => m.st === 'Active').length} active</Text>
              </View>

              {staff.map(member => {
                const e = staffEdits[member.id] ?? { name: member.name, email: member.email };
                const initials = (e.name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                return (
                  <View key={member.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.itemHeader}>
                      <View style={[styles.idBadge, { backgroundColor: roleColor + '18' }]}>
                        <Text style={[styles.initials, { color: roleColor }]}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemCurrent, { color: colors.textMuted }]}>{ROLE_LABELS[member.role] ?? member.role}</Text>
                      </View>
                      <View style={[styles.stBadge, { backgroundColor: member.st === 'Active' ? colors.successBg : colors.errorBg }]}>
                        <Text style={[styles.stText, { color: member.st === 'Active' ? colors.success : colors.error }]}>{member.st}</Text>
                      </View>
                    </View>
                    <FieldInput label="Full Name" value={e.name} onChangeText={v => setStaffEdits(s => ({ ...s, [member.id]: { ...e, name: v } }))} placeholder="Enter full name" autoCapitalize="words" />
                    <FieldInput label="Email Address" value={e.email} onChangeText={v => setStaffEdits(s => ({ ...s, [member.id]: { ...e, email: v } }))} keyboardType="email-address" autoCapitalize="none" placeholder="user@company.com" />
                  </View>
                );
              })}

              {/* Add new user */}
              {isAdmin && !showNewStaff && <AddBtn label="Create New User" onPress={() => { setShowNewStaff(true); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200); }} />}
              {isAdmin && showNewStaff && (
                <View style={[styles.newCard, { backgroundColor: colors.infoBg, borderColor: roleColor + '55' }]}>
                  <View style={styles.newCardHeader}>
                    <View style={[styles.idBadge, { backgroundColor: roleColor + '22' }]}>
                      <Ionicons name="person-add" size={16} color={roleColor} />
                    </View>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>New User</Text>
                    <TouchableOpacity onPress={() => { setShowNewStaff(false); setNewStaff(BLANK_STAFF); }}>
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <FieldInput label="Full Name *" value={newStaff.name} onChangeText={v => setNewStaff(n => ({ ...n, name: v }))} placeholder="e.g. Chukwuma Adeyemi" autoCapitalize="words" />
                  <FieldInput label="Email Address *" value={newStaff.email} onChangeText={v => setNewStaff(n => ({ ...n, email: v }))} keyboardType="email-address" autoCapitalize="none" placeholder="user@company.com" />
                  <FieldInput label="Monthly Salary (₦)" value={newStaff.sal} onChangeText={v => setNewStaff(n => ({ ...n, sal: v }))} keyboardType="numeric" placeholder="150000" />
                  <RolePicker value={newStaff.role} onChange={v => setNewStaff(n => ({ ...n, role: v }))} />
                  <TouchableOpacity style={[styles.createBtn, { backgroundColor: roleColor }]} onPress={createStaff} activeOpacity={0.85}>
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <Text style={styles.createBtnText}>Create User</Text>
                  </TouchableOpacity>
                </View>
              )}

              {isAdmin && <SaveBtn label="Save Staff Information" onPress={saveStaff} />}
            </>
          )}

          {/* ── SYSTEM ── */}
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
                { label: 'Petroleum Tanks',  value: `${tanks.length} configured` },
                { label: 'LPG Tanks',        value: `${lpgTanks.length} configured` },
                { label: 'Active Pumps',     value: `${pumps.filter(p => p.active).length} of ${pumps.length}` },
                { label: 'Registered Staff', value: `${staff.length} users (${staff.filter(m => m.st === 'Active').length} active)` },
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

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  tabBar:        { borderBottomWidth: StyleSheet.hairlineWidth },
  tabScroll:     { paddingHorizontal: 8, paddingVertical: 2 },
  tab:           { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 11 },
  tabLabel:      { fontSize: 12 },
  scroll:        { padding: 16 },
  banner:        { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, marginBottom: 16 },
  bannerTitle:   { color: '#fff', fontSize: 14, fontWeight: '700' },
  bannerSub:     { color: 'rgba(255,255,255,0.55)', fontSize: 11 },
  lockBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  lockText:      { flex: 1, fontSize: 13, fontWeight: '600' },
  card:          { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 2 },
  newCard:       { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 10, gap: 2 },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  newCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  iconBox:       { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardTitle:     { fontSize: 14, fontWeight: '700', flex: 1 },
  sectionRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle:  { fontSize: 15, fontWeight: '700' },
  sectionCount:  { fontSize: 12 },
  itemHeader:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  idBadge:       { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  idText:        { fontSize: 11, fontWeight: '800' },
  initials:      { fontSize: 13, fontWeight: '800' },
  itemCurrent:   { fontSize: 12, fontWeight: '600' },
  itemSub:       { fontSize: 11, marginTop: 1 },
  prodPill:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  prodPillText:  { fontSize: 11, fontWeight: '700' },
  settingRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  settingLabel:  { fontSize: 13, flex: 1 },
  settingValue:  { fontSize: 13, fontWeight: '600' },
  settingInput:  { fontSize: 13, fontWeight: '500', textAlign: 'right', maxWidth: '55%' },
  fieldLabel:    { fontSize: 11, fontWeight: '600', marginBottom: 5, marginTop: 4 },
  fieldInput:    { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginBottom: 4 },
  twoCol:        { flexDirection: 'row', gap: 8 },
  prodRow:       { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 4 },
  prodChip:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  prodChipText:  { fontSize: 12, fontWeight: '700' },
  stBadge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  stText:        { fontSize: 10, fontWeight: '700' },
  addBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', marginBottom: 10 },
  addBtnText:    { fontSize: 14, fontWeight: '700' },
  createBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  createBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  saveBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginBottom: 10 },
  saveBtnText:   { color: '#fff', fontSize: 15, fontWeight: '700' },
  dangerBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1, marginTop: 8 },
  dangerBtnText: { fontSize: 14, fontWeight: '600' },
});
