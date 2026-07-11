import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { BLANK_COMPANY_INFO, DEFAULT_MGR_PERMS, MGR_BRANCH_NAMES, MgrPermissions, Pump, ROLE_COLORS, ROLE_FULL_NAV, ROLE_LABELS as ROLE_LABELS_CTX, Tank, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type Tab = 'company' | 'tanks' | 'pumps' | 'staff' | 'access' | 'system';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'company', label: 'Company', icon: 'business' },
  { id: 'tanks',   label: 'Tanks',   icon: 'water' },
  { id: 'pumps',   label: 'Pumps',   icon: 'speedometer' },
  { id: 'staff',   label: 'Staff',   icon: 'people' },
  { id: 'access',  label: 'Access',  icon: 'lock-closed' },
  { id: 'system',  label: 'System',  icon: 'settings' },
];

const MGR_PERM_LABELS: { key: keyof MgrPermissions; label: string; icon: string; sub?: string }[] = [
  { key: 'canDip',         label: 'Tank Dipping',      icon: 'water' },
  { key: 'canPetrolTanks', label: 'Petroleum Tanks',   icon: 'flame',       sub: 'PMS · AGO · DPK visibility' },
  { key: 'canLpgTanks',    label: 'LPG Tanks',         icon: 'thermometer', sub: 'Gas tank visibility' },
  { key: 'canSales',       label: 'Sales Recording',   icon: 'bar-chart' },
  { key: 'canExpenses',    label: 'Expenses',           icon: 'receipt' },
  { key: 'canMaintenance', label: 'Maintenance',        icon: 'build' },
  { key: 'canBudget',      label: 'Budget',             icon: 'wallet' },
  { key: 'canChat',        label: 'Messages / Chat',    icon: 'chatbubbles' },
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
const BLANK_STAFF = { name: '', email: '', role: 'att' as typeof ROLE_OPTS[number], sal: '', username: '', password: '', branchId: '' };

function autoUsername(name: string): string {
  const parts = name.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? '';
  return parts[0] + '.' + parts[parts.length - 1];
}

// ─── Module-level sub-components ─────────────────────────────────────────────
// IMPORTANT: These must live outside SystemSettingsScreen at module scope.
// Defining components inside a render function creates a new function reference
// on every parent re-render. React sees a new component type, unmounts the old
// one, and remounts — causing TextInput to lose focus and the iOS keyboard to
// dismiss on every keystroke. Moving them here fixes that.

type Colors = ReturnType<typeof useColors>;

function LockBanner({ staffTab = false, isAdmin, canManageStaff, colors }: {
  staffTab?: boolean;
  isAdmin: boolean;
  canManageStaff: boolean;
  colors: Colors;
}) {
  if (staffTab ? canManageStaff : isAdmin) return null;
  return (
    <View style={[styles.lockBanner, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
      <Ionicons name="lock-closed" size={16} color={colors.error} />
      <Text style={[styles.lockText, { color: colors.error }]}>View only — {staffTab ? 'Admin or CSM' : 'System Admin'} can make changes.</Text>
    </View>
  );
}

function AddBtn({ label, onPress, roleColor, colors }: {
  label: string;
  onPress: () => void;
  roleColor: string;
  colors: Colors;
}) {
  return (
    <TouchableOpacity style={[styles.addBtn, { borderColor: roleColor, backgroundColor: roleColor + '12' }]} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name="add-circle-outline" size={18} color={roleColor} />
      <Text style={[styles.addBtnText, { color: roleColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SaveBtn({ label, onPress, roleColor }: {
  label: string;
  onPress: () => void;
  roleColor: string;
}) {
  return (
    <TouchableOpacity style={[styles.saveBtn, { backgroundColor: roleColor }]} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name="save" size={16} color="#fff" />
      <Text style={styles.saveBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function FieldInput({
  label, value, onChangeText, keyboardType = 'default', placeholder = '',
  editable = true, autoCapitalize = 'sentences', colors,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'decimal-pad' | 'phone-pad' | 'url';
  placeholder?: string;
  editable?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  colors: Colors;
}) {
  return (
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
}

function ProdPicker({ value, onChange, opts, isAdmin, colors }: {
  value: string;
  onChange: (v: any) => void;
  opts: string[];
  isAdmin: boolean;
  colors: Colors;
}) {
  return (
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
}

function RolePicker({ value, onChange, isAdmin, colors, roleColor }: {
  value: string;
  onChange: (v: any) => void;
  isAdmin: boolean;
  colors: Colors;
  roleColor: string;
}) {
  return (
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
}
// ─────────────────────────────────────────────────────────────────────────────

export default function SystemSettingsScreen() {
  const {
    role, tanks, lpgTanks, pumps, staff, branches, mgrPerms, updateMgrPerms,
    roleAccess, updateRoleAccess,
    userAccess, updateUserAccess, clearUserAccess,
    addTank, addLpgTank, addPump, addStaff, addActiveUserAccount,
    updateTank, updateLpgTank, updatePump, updateStaff,
    deleteTank, deleteLpgTank, deletePump, deleteStaff,
    userAccounts, companyInfo, updateCompanyInfo,
    departments, assignStaffDept,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'admin'] || colors.primary;
  const isAdmin = role === 'admin';
  const isCsm = role === 'csm';
  const canManageStaff = isAdmin || isCsm;

  const [activeTab, setActiveTab] = useState<Tab>('company');
  const [expandedUsers, setExpandedUsers] = useState<Record<number, boolean>>({});

  /* ── company draft (local edits before save) ── */
  const [cDraft, setCDraft] = useState(companyInfo);
  useEffect(() => { setCDraft(companyInfo); }, [companyInfo]);

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

  async function createStaff() {
    const name = newStaff.name.trim();
    const email = newStaff.email.trim();
    const username = newStaff.username.trim();
    const password = newStaff.password.trim();
    if (!name)     { Alert.alert('Error', 'Full name is required.'); return; }
    if (!email)    { Alert.alert('Error', 'Email address is required.'); return; }
    if (!username) { Alert.alert('Error', 'Username is required.'); return; }
    if (!password) { Alert.alert('Error', 'Password is required.'); return; }
    if (password.length < 6) { Alert.alert('Error', 'Password must be at least 6 characters.'); return; }
    if (userAccounts.some(a => a.username === username)) {
      Alert.alert('Error', `Username "${username}" is already taken. Please choose another.`); return;
    }
    if (newStaff.role === 'mgr' && !newStaff.branchId) {
      Alert.alert('Error', 'Please select a branch for this Station Manager.'); return;
    }
    const sal = parseInt(newStaff.sal) || 0;
    const deptId = (newStaff as any).dept as string | undefined;
    addStaff({ name, email, role: newStaff.role, sal, st: 'Active', dept: deptId });
    await addActiveUserAccount({
      empName: name,
      username,
      password,
      role: newStaff.role,
      branchId: newStaff.role === 'mgr' ? newStaff.branchId : undefined,
      jobTitle: ROLE_LABELS[newStaff.role],
      createdBy: 'System Admin',
    });
    setNewStaff(BLANK_STAFF);
    setShowNewStaff(false);
    Alert.alert('User Created', `${name} has been added as ${ROLE_LABELS[newStaff.role]}.\n\nUsername: ${username}\n\nShare the login password you set securely — it is not displayed here.`);
  }

  return (
    <ScreenLayout title="System Settings">
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
                <Ionicons name="business" size={22} color="#4CAF50" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerTitle}>
                    {companyInfo.name ? companyInfo.name : 'Company Profile'}
                  </Text>
                  <Text style={styles.bannerSub}>
                    {companyInfo.rcNumber ? `RC: ${companyInfo.rcNumber}` : 'Configure your company details below'}
                  </Text>
                </View>
              </View>

              {/* ── Company Identity ── */}
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconBox, { backgroundColor: roleColor + '18' }]}>
                    <Ionicons name="business" size={15} color={roleColor} />
                  </View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Company Information</Text>
                </View>
                {([
                  { label: 'Company Name', key: 'name', placeholder: 'e.g. PetroTrack Stations Ltd', kb: 'default' },
                  { label: 'RC Number', key: 'rcNumber', placeholder: 'e.g. RC-123456', kb: 'default' },
                  { label: 'Tax ID (TIN)', key: 'tin', placeholder: 'e.g. 1234567-0001', kb: 'default' },
                  { label: 'Head Office Address', key: 'address', placeholder: 'Full address', kb: 'default' },
                  { label: 'Phone Number', key: 'phone', placeholder: 'e.g. +234 801 000 0000', kb: 'phone-pad' },
                  { label: 'Email Address', key: 'email', placeholder: 'info@company.com', kb: 'email-address' },
                  { label: 'Website', key: 'website', placeholder: 'https://company.com', kb: 'url' },
                ] as const).map((item, idx) => (
                  <View key={item.key} style={[styles.settingRow, { borderTopColor: colors.border, borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth }]}>
                    <Text style={[styles.settingLabel, { color: colors.textMuted }]}>{item.label}</Text>
                    <TextInput
                      style={[styles.settingInput, { color: colors.text }]}
                      value={cDraft[item.key]}
                      onChangeText={v => setCDraft(d => ({ ...d, [item.key]: v }))}
                      placeholder={item.placeholder}
                      placeholderTextColor={colors.textSubtle}
                      keyboardType={item.kb as any}
                      editable={isAdmin}
                      autoCapitalize={item.kb === 'email-address' || item.kb === 'url' ? 'none' : 'sentences'}
                    />
                  </View>
                ))}
              </View>

              {/* ── Financial Settings ── */}
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconBox, { backgroundColor: roleColor + '18' }]}>
                    <Ionicons name="calculator" size={15} color={roleColor} />
                  </View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Financial Settings</Text>
                </View>
                {([
                  { label: 'VAT Rate (%)', key: 'vatRate', placeholder: '7.5', kb: 'decimal-pad' },
                  { label: 'WHT Rate (%)', key: 'whtRate', placeholder: '5', kb: 'decimal-pad' },
                  { label: 'Currency', key: 'currency', placeholder: 'NGN', kb: 'default' },
                  { label: 'Fiscal Year Start', key: 'fiscalYearStart', placeholder: 'e.g. January', kb: 'default' },
                ] as const).map((item, idx) => (
                  <View key={item.key} style={[styles.settingRow, { borderTopColor: colors.border, borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth }]}>
                    <Text style={[styles.settingLabel, { color: colors.textMuted }]}>{item.label}</Text>
                    <TextInput
                      style={[styles.settingInput, { color: colors.text }]}
                      value={cDraft[item.key]}
                      onChangeText={v => setCDraft(d => ({ ...d, [item.key]: v }))}
                      placeholder={item.placeholder}
                      placeholderTextColor={colors.textSubtle}
                      keyboardType={item.kb as any}
                      editable={isAdmin}
                    />
                  </View>
                ))}
              </View>

              {/* ── Operations Settings ── */}
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconBox, { backgroundColor: roleColor + '18' }]}>
                    <Ionicons name="construct" size={15} color={roleColor} />
                  </View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Operations Settings</Text>
                </View>
                {([
                  { label: 'Low Stock Alert (%)', key: 'lowStockAlert', placeholder: '20', kb: 'numeric' },
                  { label: 'Reorder Level (%)',   key: 'reorderLevel',  placeholder: '30', kb: 'numeric' },
                ] as const).map((item, idx) => (
                  <View key={item.key} style={[styles.settingRow, { borderTopColor: colors.border, borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth }]}>
                    <Text style={[styles.settingLabel, { color: colors.textMuted }]}>{item.label}</Text>
                    <TextInput
                      style={[styles.settingInput, { color: colors.text }]}
                      value={cDraft[item.key]}
                      onChangeText={v => setCDraft(d => ({ ...d, [item.key]: v }))}
                      placeholder={item.placeholder}
                      placeholderTextColor={colors.textSubtle}
                      keyboardType={item.kb as any}
                      editable={isAdmin}
                    />
                  </View>
                ))}
                <View style={[styles.settingRow, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.settingLabel, { color: colors.textMuted }]}>Daily Dip Required</Text>
                  <Switch
                    value={cDraft.dailyDipRequired}
                    onValueChange={v => setCDraft(d => ({ ...d, dailyDipRequired: v }))}
                    trackColor={{ true: roleColor, false: colors.border }}
                    thumbColor="#fff"
                    disabled={!isAdmin}
                  />
                </View>
                <View style={[styles.settingRow, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.settingLabel, { color: colors.textMuted }]}>Auto-Audit Logging</Text>
                  <Switch
                    value={cDraft.autoAuditLogging}
                    onValueChange={v => setCDraft(d => ({ ...d, autoAuditLogging: v }))}
                    trackColor={{ true: roleColor, false: colors.border }}
                    thumbColor="#fff"
                    disabled={!isAdmin}
                  />
                </View>
              </View>

              {isAdmin && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <SaveBtn
                    label="Save Company Settings"
                    roleColor={roleColor}
                    onPress={() => {
                      if (!cDraft.name.trim()) { Alert.alert('Required', 'Company name cannot be empty.'); return; }
                      updateCompanyInfo(cDraft);
                      Alert.alert('Saved', 'Company details updated successfully.');
                    }}
                  />
                </View>
              )}
              {isAdmin && (
                <TouchableOpacity
                  onPress={() => Alert.alert('Reset', 'Clear all company details and start over?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Reset', style: 'destructive', onPress: () => { setCDraft(BLANK_COMPANY_INFO); updateCompanyInfo(BLANK_COMPANY_INFO); } },
                  ])}
                  style={[styles.dangerBtn, { borderColor: colors.errorBorder, marginBottom: 8 }]}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh-outline" size={15} color={colors.error} />
                  <Text style={[styles.dangerBtnText, { color: colors.error }]}>Reset Company Details</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* ── TANKS ── */}
          {activeTab === 'tanks' && (
            <>
              <LockBanner isAdmin={isAdmin} canManageStaff={canManageStaff} colors={colors} />

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
                      {isAdmin && (
                        <TouchableOpacity
                          onPress={() => Alert.alert('Delete Tank', `Remove "${tank.name}"? This cannot be undone.`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => deleteTank(tank.id) },
                          ])}
                          style={styles.deleteIconBtn}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.error} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <FieldInput colors={colors} editable={isAdmin} label="Tank Name" value={e.name} onChangeText={v => setTankEdits(t => ({ ...t, [tank.id]: { ...e, name: v } }))} placeholder="e.g. Main PMS Storage Tank" />
                    <View style={styles.twoCol}>
                      <View style={{ flex: 1 }}>
                        <FieldInput colors={colors} editable={isAdmin} label="Capacity (L)" value={e.cap} onChangeText={v => setTankEdits(t => ({ ...t, [tank.id]: { ...e, cap: v } }))} keyboardType="numeric" placeholder="25000" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <FieldInput colors={colors} editable={isAdmin} label="Full Dip (mm)" value={e.dip} onChangeText={v => setTankEdits(t => ({ ...t, [tank.id]: { ...e, dip: v } }))} keyboardType="numeric" placeholder="2500" />
                      </View>
                    </View>
                    <ProdPicker isAdmin={isAdmin} colors={colors} value={e.prod} onChange={v => setTankEdits(t => ({ ...t, [tank.id]: { ...e, prod: v } }))} opts={PROD_OPTS} />
                  </View>
                );
              })}

              {/* Add new petroleum tank */}
              {isAdmin && !showNewTank && <AddBtn roleColor={roleColor} colors={colors} label="Add New Petroleum Tank" onPress={() => { setShowNewTank(true); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200); }} />}
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
                  <FieldInput colors={colors} label="Tank Name *" value={newTank.name} onChangeText={v => setNewTank(n => ({ ...n, name: v }))} placeholder="e.g. PMS Tank 5" />
                  <View style={styles.twoCol}>
                    <View style={{ flex: 1 }}>
                      <FieldInput colors={colors} label="Capacity (L) *" value={newTank.cap} onChangeText={v => setNewTank(n => ({ ...n, cap: v }))} keyboardType="numeric" placeholder="25000" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FieldInput colors={colors} label="Full Dip (mm)" value={newTank.dip} onChangeText={v => setNewTank(n => ({ ...n, dip: v }))} keyboardType="numeric" placeholder="auto" />
                    </View>
                  </View>
                  <ProdPicker isAdmin={isAdmin} colors={colors} value={newTank.prod} onChange={v => setNewTank(n => ({ ...n, prod: v }))} opts={PROD_OPTS} />
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
                      {isAdmin && (
                        <TouchableOpacity
                          onPress={() => Alert.alert('Delete LPG Tank', `Remove "${tank.name}"? This cannot be undone.`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => deleteLpgTank(tank.id) },
                          ])}
                          style={styles.deleteIconBtn}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.error} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <FieldInput colors={colors} editable={isAdmin} label="Tank Name" value={e.name} onChangeText={v => setLpgEdits(l => ({ ...l, [tank.id]: { ...e, name: v } }))} />
                    <FieldInput colors={colors} editable={isAdmin} label="Capacity (kg)" value={e.cap} onChangeText={v => setLpgEdits(l => ({ ...l, [tank.id]: { ...e, cap: v } }))} keyboardType="numeric" />
                  </View>
                );
              })}

              {/* Add new LPG tank */}
              {isAdmin && !showNewLpg && <AddBtn roleColor={roleColor} colors={colors} label="Add New LPG Tank" onPress={() => { setShowNewLpg(true); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200); }} />}
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
                  <FieldInput colors={colors} label="Tank Name *" value={newLpg.name} onChangeText={v => setNewLpg(n => ({ ...n, name: v }))} placeholder="e.g. LPG Storage A" />
                  <FieldInput colors={colors} label="Capacity (kg) *" value={newLpg.cap} onChangeText={v => setNewLpg(n => ({ ...n, cap: v }))} keyboardType="numeric" placeholder="5000" />
                  <TouchableOpacity style={[styles.createBtn, { backgroundColor: '#0F6E56' }]} onPress={createLpgTank} activeOpacity={0.85}>
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <Text style={styles.createBtnText}>Create LPG Tank</Text>
                  </TouchableOpacity>
                </View>
              )}

              {isAdmin && (
                <SaveBtn roleColor={roleColor} label="Save Tank Configuration" onPress={saveTanks} />
              )}
            </>
          )}

          {/* ── PUMPS ── */}
          {activeTab === 'pumps' && (
            <>
              <LockBanner isAdmin={isAdmin} canManageStaff={canManageStaff} colors={colors} />
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
                      {isAdmin && (
                        <TouchableOpacity
                          onPress={() => Alert.alert('Delete Pump', `Remove "${pump.name}"? This cannot be undone.`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => deletePump(pump.id) },
                          ])}
                          style={styles.deleteIconBtn}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.error} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <FieldInput colors={colors} editable={isAdmin} label="Pump Name" value={e.name} onChangeText={v => setPumpEdits(p => ({ ...p, [pump.id]: { ...e, name: v } }))} placeholder="e.g. Forecourt Pump A" />
                    <ProdPicker isAdmin={isAdmin} colors={colors} value={e.prod} onChange={v => setPumpEdits(p => ({ ...p, [pump.id]: { ...e, prod: v } }))} opts={['PMS', 'AGO', 'DPK', 'LPG']} />
                  </View>
                );
              })}

              {/* Add new pump */}
              {isAdmin && !showNewPump && <AddBtn roleColor={roleColor} colors={colors} label="Add New Pump" onPress={() => { setShowNewPump(true); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200); }} />}
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
                  <FieldInput colors={colors} label="Pump Name *" value={newPump.name} onChangeText={v => setNewPump(n => ({ ...n, name: v }))} placeholder="e.g. Pump #6 PMS" />
                  <ProdPicker isAdmin={isAdmin} colors={colors} value={newPump.prod} onChange={v => setNewPump(n => ({ ...n, prod: v }))} opts={['PMS', 'AGO', 'DPK', 'LPG']} />
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

              {isAdmin && <SaveBtn roleColor={roleColor} label="Save Pump Configuration" onPress={savePumps} />}
            </>
          )}

          {/* ── STAFF ── */}
          {activeTab === 'staff' && (
            <>
              <LockBanner staffTab isAdmin={isAdmin} canManageStaff={canManageStaff} colors={colors} />
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
                      {isAdmin && (
                        <TouchableOpacity
                          onPress={() => Alert.alert('Delete Staff', `Remove "${member.name}" from the directory? This cannot be undone.`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => deleteStaff(member.id) },
                          ])}
                          style={styles.deleteIconBtn}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.error} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <FieldInput colors={colors} editable={canManageStaff} label="Full Name" value={e.name} onChangeText={v => setStaffEdits(s => ({ ...s, [member.id]: { ...e, name: v } }))} placeholder="Enter full name" autoCapitalize="words" />
                    <FieldInput colors={colors} editable={canManageStaff} label="Email Address" value={e.email} onChangeText={v => setStaffEdits(s => ({ ...s, [member.id]: { ...e, email: v } }))} keyboardType="email-address" autoCapitalize="none" placeholder="user@company.com" />
                    {/* Department assignment */}
                    {departments.length > 0 && canManageStaff && (
                      <View style={{ marginTop: 4 }}>
                        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Department</Text>
                        <View style={[styles.rolePickerRow, { flexWrap: 'wrap', gap: 6 }]}>
                          {departments.map(d => {
                            const sel = member.dept === d.id;
                            return (
                              <TouchableOpacity key={d.id}
                                onPress={() => assignStaffDept(member.id, sel ? null : d.id)}
                                style={[styles.roleChip, { borderColor: sel ? d.col.fg : colors.border, backgroundColor: sel ? d.col.bg : colors.surface }]}>
                                <Text style={[styles.roleChipText, { color: sel ? d.col.fg : colors.textMuted }]}>{d.name}</Text>
                              </TouchableOpacity>
                            );
                          })}
                          {member.dept && (
                            <TouchableOpacity onPress={() => assignStaffDept(member.id, null)}
                              style={[styles.roleChip, { borderColor: colors.error + '55', backgroundColor: colors.errorBg }]}>
                              <Text style={[styles.roleChipText, { color: colors.error }]}>Unpost</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Add new user */}
              {canManageStaff && !showNewStaff && <AddBtn roleColor={roleColor} colors={colors} label="Create New User" onPress={() => { setShowNewStaff(true); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200); }} />}
              {canManageStaff && showNewStaff && (
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
                  <FieldInput colors={colors} label="Full Name *" value={newStaff.name} onChangeText={v => setNewStaff(n => ({ ...n, name: v, username: autoUsername(v) }))} placeholder="e.g. Chukwuma Adeyemi" autoCapitalize="words" />
                  <FieldInput colors={colors} label="Email Address *" value={newStaff.email} onChangeText={v => setNewStaff(n => ({ ...n, email: v }))} keyboardType="email-address" autoCapitalize="none" placeholder="user@company.com" />
                  <FieldInput colors={colors} label="Monthly Salary (₦)" value={newStaff.sal} onChangeText={v => setNewStaff(n => ({ ...n, sal: v }))} keyboardType="numeric" placeholder="150000" />
                  <RolePicker isAdmin={isAdmin} colors={colors} roleColor={roleColor} value={newStaff.role} onChange={v => setNewStaff(n => ({ ...n, role: v, branchId: '' }))} />
                  {newStaff.role === 'mgr' && (
                    <View style={{ marginBottom: 10 }}>
                      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Branch *</Text>
                      {branches.length === 0
                        ? <Text style={[{ color: colors.textMuted, fontSize: 13, fontStyle: 'italic', marginTop: 4 }]}>No branches yet — add a branch first.</Text>
                        : <View style={[styles.rolePickerRow, { flexWrap: 'wrap', gap: 6 }]}>
                            {branches.map(b => (
                              <TouchableOpacity key={b.id} onPress={() => setNewStaff(n => ({ ...n, branchId: b.id }))}
                                style={[styles.roleChip, { borderColor: newStaff.branchId === b.id ? roleColor : colors.border, backgroundColor: newStaff.branchId === b.id ? roleColor + '18' : colors.surface }]}>
                                <Text style={[styles.roleChipText, { color: newStaff.branchId === b.id ? roleColor : colors.textMuted }]}>{b.name}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                      }
                    </View>
                  )}
                  {/* Department picker */}
                  {departments.length > 0 && (
                    <View style={{ marginBottom: 10 }}>
                      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Department (optional)</Text>
                      <View style={[styles.rolePickerRow, { flexWrap: 'wrap', gap: 6 }]}>
                        {departments.map(d => {
                          const sel = (newStaff as any).dept === d.id;
                          return (
                            <TouchableOpacity key={d.id}
                              onPress={() => setNewStaff(n => ({ ...n, dept: sel ? undefined : d.id } as any))}
                              style={[styles.roleChip, { borderColor: sel ? d.col.fg : colors.border, backgroundColor: sel ? d.col.bg : colors.surface }]}>
                              <Text style={[styles.roleChipText, { color: sel ? d.col.fg : colors.textMuted }]}>{d.name}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  <View style={[{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginVertical: 10, paddingTop: 10 }]}>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted, marginBottom: 6 }]}>Login Credentials</Text>
                    <FieldInput colors={colors} label="Username *" value={newStaff.username} onChangeText={v => setNewStaff(n => ({ ...n, username: v.toLowerCase().replace(/\s/g, '.') }))} autoCapitalize="none" placeholder="firstname.lastname" />
                    <FieldInput colors={colors} label="Password *" value={newStaff.password} onChangeText={v => setNewStaff(n => ({ ...n, password: v }))} autoCapitalize="none" placeholder="Min. 6 characters" />
                  </View>
                  <TouchableOpacity style={[styles.createBtn, { backgroundColor: roleColor }]} onPress={createStaff} activeOpacity={0.85}>
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <Text style={styles.createBtnText}>Create User</Text>
                  </TouchableOpacity>
                </View>
              )}

              {canManageStaff && <SaveBtn roleColor={roleColor} label="Save Staff Information" onPress={saveStaff} />}
            </>
          )}

          {/* ── MANAGERS ── */}
          {activeTab === 'managers' && (
            <>
              <View style={[styles.banner, { backgroundColor: '#3a1f00' }]}>
                <Ionicons name="construct" size={22} color={ROLE_COLORS.mgr} />
                <View>
                  <Text style={styles.bannerTitle}>Branch Manager Permissions</Text>
                  <Text style={styles.bannerSub}>Configure module access per station manager</Text>
                </View>
              </View>

              {Object.entries(MGR_BRANCH_NAMES).map(([bid, branchName]) => {
                const mgr = branches.find(b => b.id === bid);
                const perms = mgrPerms[bid] ?? DEFAULT_MGR_PERMS;
                const enabledCount = MGR_PERM_LABELS.filter(p => perms[p.key]).length;
                return (
                  <View key={bid} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 14 }]}>
                    {/* Branch header */}
                    <View style={[styles.mgrHeader, { borderBottomColor: colors.border }]}>
                      <View style={[styles.mgrBadge, { backgroundColor: ROLE_COLORS.mgr + '22' }]}>
                        <Ionicons name="location" size={14} color={ROLE_COLORS.mgr} />
                        <Text style={[styles.mgrBadgeText, { color: ROLE_COLORS.mgr }]}>{bid}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardHeader, { color: colors.text, marginBottom: 2 }]}>{branchName}</Text>
                        <Text style={[styles.subLabel, { color: colors.textMuted }]}>
                          {mgr?.mgr || 'Unassigned'} · {enabledCount}/{MGR_PERM_LABELS.length} modules enabled
                        </Text>
                      </View>
                    </View>

                    {/* Permission toggles */}
                    {MGR_PERM_LABELS.map(({ key, label, icon, sub }, idx) => (
                      <View key={key} style={[styles.permRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                        <View style={[styles.permIcon, { backgroundColor: perms[key] ? ROLE_COLORS.mgr + '22' : colors.border + '55' }]}>
                          <Ionicons name={icon as any} size={16} color={perms[key] ? ROLE_COLORS.mgr : colors.textMuted} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.permLabel, { color: perms[key] ? colors.text : colors.textMuted }]}>{label}</Text>
                          {sub && <Text style={[styles.subLabel, { color: colors.textMuted, fontSize: 10, marginTop: 1 }]}>{sub}</Text>}
                        </View>
                        <Switch
                          value={perms[key]}
                          onValueChange={v => isAdmin && updateMgrPerms(bid, { [key]: v })}
                          thumbColor={perms[key] ? ROLE_COLORS.mgr : '#aaa'}
                          trackColor={{ false: colors.border, true: ROLE_COLORS.mgr + '55' }}
                          disabled={!isAdmin}
                        />
                      </View>
                    ))}
                  </View>
                );
              })}
            </>
          )}

          {/* ── ACCESS CONTROL ── */}
          {activeTab === 'access' && (
            <>
              <View style={[styles.banner, { backgroundColor: '#1a0a2e' }]}>
                <Ionicons name="lock-closed" size={22} color={roleColor} />
                <View>
                  <Text style={styles.bannerTitle}>Role Access Control</Text>
                  <Text style={styles.bannerSub}>Toggle which panels each role can see</Text>
                </View>
              </View>

              {/* ── By Role ── */}
              <View style={styles.sectionRow}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>By Role</Text>
                <Text style={[styles.sectionCount, { color: colors.textMuted }]}>applies to all members of a role</Text>
              </View>

              {(Object.entries(ROLE_FULL_NAV) as [string, { id: string; icon: string; label: string }[]][])
                .filter(([r]) => r !== 'admin')
                .map(([r, modules]) => {
                  const rc = ROLE_COLORS[r] || roleColor;
                  const enabledCount = modules.filter(m => (roleAccess[r] ?? {})[m.id] !== false).length;
                  return (
                    <View key={r} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 14 }]}>
                      <View style={[styles.mgrHeader, { borderBottomColor: colors.border }]}>
                        <View style={[styles.mgrBadge, { backgroundColor: rc + '22' }]}>
                          <Ionicons name="people" size={14} color={rc} />
                          <Text style={[styles.mgrBadgeText, { color: rc }]}>{r.toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.cardTitle, { color: colors.text }]}>{ROLE_LABELS[r] ?? r}</Text>
                          <Text style={[styles.subLabel, { color: colors.textMuted }]}>{enabledCount}/{modules.length} panels enabled</Text>
                        </View>
                      </View>
                      {modules.map(({ id, icon, label }, idx) => {
                        const enabled = (roleAccess[r] ?? {})[id] !== false;
                        return (
                          <View key={id} style={[styles.permRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                            <View style={[styles.permIcon, { backgroundColor: enabled ? rc + '22' : colors.border + '55' }]}>
                              <Ionicons name={icon as any} size={16} color={enabled ? rc : colors.textMuted} />
                            </View>
                            <Text style={[styles.permLabel, { color: enabled ? colors.text : colors.textMuted }]}>{label}</Text>
                            <Switch
                              value={enabled}
                              onValueChange={v => isAdmin && updateRoleAccess(r, id, v)}
                              thumbColor={enabled ? rc : '#aaa'}
                              trackColor={{ false: colors.border, true: rc + '55' }}
                              disabled={!isAdmin}
                            />
                          </View>
                        );
                      })}
                    </View>
                  );
                })}

              {/* ── By User ── */}
              <View style={[styles.sectionRow, { marginTop: 8 }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>By User</Text>
                <Text style={[styles.sectionCount, { color: colors.textMuted }]}>overrides role defaults</Text>
              </View>

              {staff.filter(m => m.role !== 'admin').map(member => {
                const rc = ROLE_COLORS[member.role] || roleColor;
                const modules = ROLE_FULL_NAV[member.role] ?? [];
                const overrides = userAccess[member.id] ?? {};
                const hasOverrides = Object.keys(overrides).length > 0;
                const expanded = expandedUsers[member.id] ?? false;
                const initials = member.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

                const effectiveEnabled = (id: string) => {
                  if (overrides[id] !== undefined) return overrides[id];
                  return (roleAccess[member.role] ?? {})[id] !== false;
                };
                const enabledCount = modules.filter(m => effectiveEnabled(m.id)).length;

                return (
                  <View key={member.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: hasOverrides ? rc + '55' : colors.border, marginBottom: 10 }]}>
                    <TouchableOpacity
                      onPress={() => setExpandedUsers(e => ({ ...e, [member.id]: !expanded }))}
                      activeOpacity={0.7}
                      style={styles.userAccessHeader}
                    >
                      <View style={[styles.idBadge, { backgroundColor: rc + '18' }]}>
                        <Text style={[styles.initials, { color: rc }]}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemCurrent, { color: colors.text }]}>{member.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <View style={[styles.mgrBadge, { backgroundColor: rc + '18', paddingHorizontal: 6, paddingVertical: 2 }]}>
                            <Text style={[styles.mgrBadgeText, { color: rc, fontSize: 10 }]}>{(ROLE_LABELS[member.role] ?? member.role).toUpperCase()}</Text>
                          </View>
                          <Text style={[styles.subLabel, { color: colors.textMuted }]}>{enabledCount}/{modules.length} panels</Text>
                          {hasOverrides && (
                            <View style={[styles.stBadge, { backgroundColor: rc + '22' }]}>
                              <Text style={[styles.stText, { color: rc }]}>OVERRIDDEN</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
                    </TouchableOpacity>

                    {expanded && (
                      <>
                        {modules.map(({ id, icon, label }, idx) => {
                          const enabled = effectiveEnabled(id);
                          const isOverridden = overrides[id] !== undefined;
                          return (
                            <View key={id} style={[styles.permRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                              <View style={[styles.permIcon, { backgroundColor: enabled ? rc + '22' : colors.border + '55' }]}>
                                <Ionicons name={icon as any} size={16} color={enabled ? rc : colors.textMuted} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.permLabel, { color: enabled ? colors.text : colors.textMuted }]}>{label}</Text>
                                {isOverridden && (
                                  <Text style={[styles.subLabel, { color: rc, fontSize: 10 }]}>User override</Text>
                                )}
                              </View>
                              <Switch
                                value={enabled}
                                onValueChange={v => isAdmin && updateUserAccess(member.id, id, v)}
                                thumbColor={enabled ? rc : '#aaa'}
                                trackColor={{ false: colors.border, true: rc + '55' }}
                                disabled={!isAdmin}
                              />
                            </View>
                          );
                        })}
                        {isAdmin && hasOverrides && (
                          <TouchableOpacity
                            onPress={() => Alert.alert('Reset Access', `Reset "${member.name}" to role defaults?`, [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Reset', style: 'destructive', onPress: () => clearUserAccess(member.id) },
                            ])}
                            style={[styles.dangerBtn, { borderColor: colors.errorBorder, marginTop: 8 }]}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="refresh-outline" size={15} color={colors.error} />
                            <Text style={[styles.dangerBtnText, { color: colors.error, fontSize: 13 }]}>Reset to role defaults</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </View>
                );
              })}
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
  deleteIconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  subLabel:      { fontSize: 11 },
  mgrHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12, marginBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  mgrBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  mgrBadgeText:  { fontSize: 11, fontWeight: '800' },
  permRow:          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  permIcon:         { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  permLabel:        { flex: 1, fontSize: 14 },
  userAccessHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rolePickerRow:    { flexDirection: 'row', gap: 6 },
  roleChip:         { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  roleChipText:     { fontSize: 11, fontWeight: '600' },
});
