import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { BLANK_COMPANY_INFO, CompanyInfo, DEFAULT_MGR_PERMS, GLOBAL_OVERVIEW_ROLES, MGR_BRANCH_NAMES, MgrPermissions, Pump, ROLE_COLORS, ROLE_FULL_NAV, ROLE_LABELS as ROLE_LABELS_CTX, STOCK_SNAPSHOT_METRICS, StockProduct, Tank, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type Tab = 'company' | 'tanks' | 'startup' | 'pumps' | 'staff' | 'access' | 'snapshot' | 'system';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'company', label: 'Company', icon: 'business' },
  { id: 'tanks',   label: 'Tanks',   icon: 'water' },
  { id: 'startup', label: 'Start-up Stock', icon: 'cube' },
  { id: 'pumps',   label: 'Pumps',   icon: 'speedometer' },
  { id: 'staff',   label: 'Staff',   icon: 'people' },
  { id: 'access',  label: 'Access',  icon: 'lock-closed' },
  { id: 'snapshot', label: 'Stock Snapshot', icon: 'analytics' },
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
  PMS: '#1a6e3c', AGO: '#185FA5', DPK: '#BA7517', LPG: '#0F6E56', 'Lube Oil': '#7B3FA5',
};
const STARTUP_PRODUCTS: StockProduct[] = ['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil'];
const STOCK_METRIC_LABELS: Record<(typeof STOCK_SNAPSHOT_METRICS)[number], { label: string; description: string }> = {
  startupStock: { label: 'Start-up quantity', description: 'Admin-set opening quantity per branch' },
  deliveries: { label: 'Delivered quantity', description: 'Approved or MD-approved deliveries' },
  sales: { label: 'Quantity sold', description: 'Current sales records' },
  submittedTankDip: { label: 'Tank dip quantity', description: 'Today’s approved tank dip' },
  bookStock: { label: 'Book stock formula', description: 'Start-up + delivered − sold' },
  variance: { label: 'Variance and status', description: 'Book stock compared with tank dip' },
};
const ROLE_OPTS = ['admin', 'ceo', 'md', 'mktg', 'csm', 'acc', 'mgr', 'att'] as const;
const ROLE_LABELS: Record<string, string> = {
  admin: 'System Admin', ceo: 'CEO', md: 'MD', mktg: 'Marketing',
  csm: 'CSM', acc: 'Accountant', mgr: 'Station Manager', att: 'Pump Attendant',
};

const BLANK_TANK  = { name: '', cap: '', dip: '', prod: 'PMS' as Tank['prod'], branchId: '' };
const BLANK_LPG   = { name: '', cap: '', branchId: '' };
const BLANK_PUMP  = { name: '', prod: 'PMS' as Pump['prod'], active: true, branchId: '', openingMeter: '', lpgCategory: '' as 'single' | 'distributor' | '' };
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
    departments, assignStaffDept, setPumpInitialMeter, resetOperationalData, pumpInitialMeters,
    startupStocks, addStartupStock, updateStartupStock, deleteStartupStock,
    stockSnapshotConfig, updateStockSnapshotMetric, updateStockSnapshotProduct,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'admin'] || colors.primary;
  const isAdmin = role === 'admin';
  const isCsm = role === 'csm';
  const canManageStaff = isAdmin || isCsm;
  const headOfficeUsers = userAccounts.filter(
    account => account.status === 'active' && account.role && account.role !== 'admin' &&
      (GLOBAL_OVERVIEW_ROLES.has(account.role) || !account.branchId || account.branchId === 'HQ'),
  );
  const homeAccessModules = [
    { id: 'revenue', label: 'Total Revenue', icon: 'cash-outline' },
    { id: 'fuelStock', label: 'Fuel Stock', icon: 'water-outline' },
  ] as const;

  function headOfficeModuleEnabled(moduleId: string): boolean {
    return headOfficeUsers.length > 0 && headOfficeUsers.every(account => {
      const override = (userAccess[account.id] ?? {})[moduleId];
      if (override !== undefined) return override;
      return (roleAccess[account.role ?? 'att'] ?? {})[moduleId] !== false;
    });
  }

  function setHeadOfficeModuleAccess(moduleId: string, enabled: boolean) {
    if (!isAdmin) return;
    for (const account of headOfficeUsers) updateUserAccess(account.id, moduleId, enabled);
  }

  const [activeTab, setActiveTab] = useState<Tab>('company');
  const [expandedUsers, setExpandedUsers] = useState<Record<number, boolean>>({});

  /* ── company draft (local edits before save) ── */
  const [cDraft, setCDraft] = useState(companyInfo);
  const [cSaved, setCSaved] = useState(false);
  const cDirtyRef = useRef(false);
  // Only sync draft from context when the user has NOT started typing locally.
  // Without this guard, the 3-second server poll resets companyInfo which
  // triggers this effect and wipes whatever the admin is currently typing.
  useEffect(() => {
    if (!cDirtyRef.current) setCDraft(companyInfo);
  }, [companyInfo]);
  const hasUnsaved = JSON.stringify(cDraft) !== JSON.stringify(companyInfo);
  function patchDraft(updates: Partial<CompanyInfo>) {
    cDirtyRef.current = true;
    setCDraft(d => ({ ...d, ...updates }));
  }

  /* ── edit state (existing items) ── */
  const [tankEdits, setTankEdits] = useState<Record<string, { name: string; cap: string; dip: string; prod: Tank['prod']; branchId: string }>>({});
  const [lpgEdits,  setLpgEdits]  = useState<Record<string, { name: string; cap: string; branchId: string }>>({});
  const [pumpEdits, setPumpEdits] = useState<Record<string, { name: string; prod: Pump['prod']; active: boolean; branchId: string; openingMeter: string; lpgCategory: 'single' | 'distributor' | '' }>>({});
  const [staffEdits,setStaffEdits]= useState<Record<number, { name: string; email: string; branchId: string }>>({});
  const [startupEdits, setStartupEdits] = useState<Record<string, string>>({});

  /* ── new-item forms ── */
  const [showNewTank,  setShowNewTank]  = useState(false);
  const [showNewLpg,   setShowNewLpg]   = useState(false);
  const [showNewPump,  setShowNewPump]  = useState(false);
  const [showNewStaff, setShowNewStaff] = useState(false);
  const [showNewStartup, setShowNewStartup] = useState(false);
  const [newTank,  setNewTank]  = useState(BLANK_TANK);
  const [newLpg,   setNewLpg]   = useState(BLANK_LPG);
  const [newPump,  setNewPump]  = useState(BLANK_PUMP);
  const [newStaff, setNewStaff] = useState(BLANK_STAFF);
  const [newStartup, setNewStartup] = useState<{ product: StockProduct; quantity: string; branchId: string }>({ product: 'PMS', quantity: '', branchId: '' });

  const scrollRef = useRef<ScrollView>(null);

  /* sync edits when context changes */
  useEffect(() => {
    const te: typeof tankEdits = {};
    for (const t of tanks) te[t.id] = { name: t.name, cap: String(t.cap), dip: String(t.dip), prod: t.prod, branchId: t.branchId ?? '' };
    setTankEdits(te);
  }, [tanks]);
  useEffect(() => {
    const le: typeof lpgEdits = {};
    for (const l of lpgTanks) le[l.id] = { name: l.name, cap: String(l.cap), branchId: l.branchId ?? '' };
    setLpgEdits(le);
  }, [lpgTanks]);
  useEffect(() => {
    const pe: typeof pumpEdits = {};
    for (const p of pumps) pe[p.id] = { name: p.name, prod: p.prod, active: p.active, branchId: p.branchId ?? '', openingMeter: String(pumpInitialMeters[p.id] ?? ''), lpgCategory: p.lpgCategory ?? '' };
    setPumpEdits(pe);
  }, [pumps, pumpInitialMeters]);
  useEffect(() => {
    const se: typeof staffEdits = {};
    for (const m of staff) se[m.id] = { name: m.name, email: m.email, branchId: m.branchId ?? '' };
    setStaffEdits(se);
  }, [staff]);
  useEffect(() => {
    const edits: Record<string, string> = {};
    for (const stock of startupStocks) edits[stock.id] = String(stock.quantity);
    setStartupEdits(edits);
  }, [startupStocks]);

  /* ── save handlers ── */
  function saveTanks() {
    for (const [id, e] of Object.entries(tankEdits)) {
      const cap = parseInt(e.cap); const dip = parseInt(e.dip);
      if (!e.name.trim()) { Alert.alert('Error', `Tank ${id} name cannot be empty.`); return; }
      if (!cap || cap < 1000) { Alert.alert('Error', `Tank ${id} capacity must be at least 1,000 L.`); return; }
      updateTank(id, { name: e.name.trim(), cap, dip: dip || Math.round(cap / 10), prod: e.prod, branchId: e.branchId || undefined });
    }
    for (const [id, e] of Object.entries(lpgEdits)) {
      const cap = parseInt(e.cap);
      if (!e.name.trim()) { Alert.alert('Error', `LPG Tank ${id} name cannot be empty.`); return; }
      if (!cap || cap < 100) { Alert.alert('Error', `LPG Tank ${id} capacity must be at least 100 kg.`); return; }
      updateLpgTank(id, { name: e.name.trim(), cap, branchId: e.branchId || undefined });
    }
    Alert.alert('Saved', 'All tank configurations updated. Changes are reflected across all screens.');
  }

  function savePumps() {
    for (const [id, e] of Object.entries(pumpEdits)) {
      if (!e.name.trim()) { Alert.alert('Error', `Pump ${id} name cannot be empty.`); return; }
      if (e.prod === 'LPG' && !e.lpgCategory) { Alert.alert('Error', `Pump ${id} is LPG — select Single Buyer or Distributor category.`); return; }
      updatePump(id, { name: e.name.trim(), prod: e.prod, active: e.active, branchId: e.branchId || undefined, lpgCategory: e.prod === 'LPG' && e.lpgCategory ? e.lpgCategory : undefined });
      const om = parseFloat(e.openingMeter.replace(/,/g, ''));
      if (!isNaN(om) && om >= 0) {
        setPumpInitialMeter(id, om);
      }
    }
    Alert.alert('Saved', `${pumps.length} pump configuration(s) updated. Opening meter readings seeded.`);
  }

  function saveStaff() {
    for (const [idStr, e] of Object.entries(staffEdits)) {
      if (!e.name.trim()) { Alert.alert('Error', 'Staff name cannot be empty.'); return; }
      updateStaff(parseInt(idStr), { name: e.name.trim(), email: e.email.trim(), branchId: e.branchId || undefined });
    }
    Alert.alert('Saved', 'Staff information updated.');
  }

  function saveStartupStock(id: string) {
    const quantity = parseFloat((startupEdits[id] ?? '').replace(/,/g, ''));
    if (!Number.isFinite(quantity) || quantity < 0) {
      Alert.alert('Error', 'Start-up stock must be a valid quantity of 0 or more.');
      return;
    }
    updateStartupStock(id, quantity);
    Alert.alert('Updated', 'Start-up stock updated and remains locked for non-admin users.');
  }

  /* ── create handlers ── */
  function createTank() {
    const cap = parseInt(newTank.cap);
    if (!newTank.name.trim()) { Alert.alert('Error', 'Tank name is required.'); return; }
    if (!cap || cap < 1000)   { Alert.alert('Error', 'Capacity must be at least 1,000 L.'); return; }
    addTank({ name: newTank.name.trim(), cap, prod: newTank.prod, branchId: newTank.branchId || undefined });
    setNewTank(BLANK_TANK);
    setShowNewTank(false);
    Alert.alert('Tank Added', `"${newTank.name.trim()}" has been added and is now visible on the Tanks screen.`);
  }

  function createLpgTank() {
    const cap = parseInt(newLpg.cap);
    if (!newLpg.name.trim()) { Alert.alert('Error', 'LPG tank name is required.'); return; }
    if (!cap || cap < 100)   { Alert.alert('Error', 'Capacity must be at least 100 kg.'); return; }
    addLpgTank({ name: newLpg.name.trim(), cap, branchId: newLpg.branchId || undefined });
    setNewLpg(BLANK_LPG);
    setShowNewLpg(false);
    Alert.alert('LPG Tank Added', `"${newLpg.name.trim()}" has been added.`);
  }

  function createPump() {
    if (!newPump.name.trim()) { Alert.alert('Error', 'Pump name is required.'); return; }
    if (newPump.prod === 'LPG' && !newPump.lpgCategory) { Alert.alert('Error', 'Select Single Buyer or Distributor for this LPG pump.'); return; }
    const pump = addPump({ name: newPump.name.trim(), prod: newPump.prod, active: newPump.active, branchId: newPump.branchId || undefined, lpgCategory: newPump.prod === 'LPG' && newPump.lpgCategory ? newPump.lpgCategory : undefined });
    const om = parseFloat(newPump.openingMeter.replace(/,/g, ''));
    if (!isNaN(om) && om >= 0) setPumpInitialMeter(pump.id, om);
    setNewPump(BLANK_PUMP);
    setShowNewPump(false);
    Alert.alert('Pump Added', `"${newPump.name.trim()}" is now available in the Sales screen.`);
  }

  function createStartupStock() {
    const quantity = parseFloat(newStartup.quantity.replace(/,/g, ''));
    if (!Number.isFinite(quantity) || quantity < 0) {
      Alert.alert('Error', 'Start-up stock must be a valid quantity of 0 or more.');
      return;
    }
    if (!newStartup.branchId) {
      Alert.alert('Branch required', 'Select the branch this product quantity applies to.');
      return;
    }
    if (startupStocks.some(stock => stock.product === newStartup.product && stock.branchId === newStartup.branchId)) {
      Alert.alert('Already set', `${newStartup.product} already has start-up stock for this branch. Edit the existing locked record instead.`);
      return;
    }
    addStartupStock({ product: newStartup.product, quantity, branchId: newStartup.branchId });
    setNewStartup({ product: 'PMS', quantity: '', branchId: '' });
    setShowNewStartup(false);
    Alert.alert('Start-up stock set', 'The branch opening quantity is now locked for non-admin users and will be used in the Home Stock Snapshot.');
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
    const sal = parseInt(newStaff.sal) || 0;
    const deptId = (newStaff as any).dept as string | undefined;
    const staffBranchId = GLOBAL_OVERVIEW_ROLES.has(newStaff.role) ? undefined : (newStaff.branchId || undefined);
    const localStaffId = addStaff({ name, email, role: newStaff.role, sal, st: 'Active', dept: deptId, branchId: staffBranchId });
    const accountId = await addActiveUserAccount({
      empName: name,
      username,
      password,
      role: newStaff.role,
      branchId: staffBranchId || null,
      jobTitle: ROLE_LABELS[newStaff.role],
      createdBy: 'System Admin',
    });
    if (accountId !== null) updateStaff(localStaffId, { accountId });
    setNewStaff(BLANK_STAFF);
    setShowNewStaff(false);
    Alert.alert('User Created', `${name} has been added as ${ROLE_LABELS[newStaff.role]}.\n\nUsername: ${username}\n\nShare the login password you set securely — it is not displayed here.`);
  }

  return (
    <ScreenLayout title="System Settings">
        {/* Tab bar */}
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          <View style={styles.tabScroll}>
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
          </View>
        </View>

        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── COMPANY ── */}
          {activeTab === 'company' && (
            <>
              <View style={[styles.banner, { backgroundColor: '#0a2318' }]}>
                <Ionicons name="business" size={22} color="#4CAF50" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerTitle}>
                    {companyInfo.name || 'Company Profile'}
                  </Text>
                  <Text style={styles.bannerSub}>
                    {companyInfo.rcNumber
                      ? `RC: ${companyInfo.rcNumber}${companyInfo.tin ? '  ·  TIN: ' + companyInfo.tin : ''}`
                      : companyInfo.name ? 'Tap the fields below to update details' : 'Fill in your company details and tap Save'}
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
                {!isAdmin && (
                  <View style={[styles.lockBanner, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder, marginBottom: 8 }]}>
                    <Ionicons name="lock-closed" size={14} color={colors.error} />
                    <Text style={[styles.lockText, { color: colors.error }]}>View only — System Admin can edit these details.</Text>
                  </View>
                )}
                <FieldInput colors={colors} editable={isAdmin} label="Company Name *"
                  value={cDraft.name}
                  onChangeText={v => patchDraft({ name: v })}
                  placeholder="e.g. PetroTrack Stations Ltd"
                  autoCapitalize="words"
                />
                <FieldInput colors={colors} editable={isAdmin} label="RC Number"
                  value={cDraft.rcNumber}
                  onChangeText={v => patchDraft({ rcNumber: v })}
                  placeholder="e.g. RC-123456"
                />
                <FieldInput colors={colors} editable={isAdmin} label="Tax ID (TIN)"
                  value={cDraft.tin}
                  onChangeText={v => patchDraft({ tin: v })}
                  placeholder="e.g. 1234567-0001"
                />
                <FieldInput colors={colors} editable={isAdmin} label="Head Office Address"
                  value={cDraft.address}
                  onChangeText={v => patchDraft({ address: v })}
                  placeholder="Full address"
                />
                <FieldInput colors={colors} editable={isAdmin} label="Phone Number"
                  value={cDraft.phone}
                  onChangeText={v => patchDraft({ phone: v })}
                  placeholder="e.g. +234 801 000 0000"
                  keyboardType="phone-pad"
                />
                <FieldInput colors={colors} editable={isAdmin} label="Email Address"
                  value={cDraft.email}
                  onChangeText={v => patchDraft({ email: v })}
                  placeholder="info@company.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <FieldInput colors={colors} editable={isAdmin} label="Website"
                  value={cDraft.website}
                  onChangeText={v => patchDraft({ website: v })}
                  placeholder="https://company.com"
                  keyboardType="url"
                  autoCapitalize="none"
                />
              </View>

              {/* ── Financial Settings ── */}
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconBox, { backgroundColor: roleColor + '18' }]}>
                    <Ionicons name="calculator" size={15} color={roleColor} />
                  </View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Financial Settings</Text>
                </View>
                <FieldInput colors={colors} editable={isAdmin} label="VAT Rate (%)"
                  value={cDraft.vatRate}
                  onChangeText={v => patchDraft({ vatRate: v })}
                  placeholder="7.5"
                  keyboardType="decimal-pad"
                />
                <FieldInput colors={colors} editable={isAdmin} label="CITA Rate (%)"
                  value={cDraft.citaRate}
                  onChangeText={v => patchDraft({ citaRate: v })}
                  placeholder="30"
                  keyboardType="decimal-pad"
                />
                <FieldInput colors={colors} editable={isAdmin} label="Currency"
                  value={cDraft.currency}
                  onChangeText={v => patchDraft({ currency: v })}
                  placeholder="NGN"
                />
                <FieldInput colors={colors} editable={isAdmin} label="Fiscal Year Start"
                  value={cDraft.fiscalYearStart}
                  onChangeText={v => patchDraft({ fiscalYearStart: v })}
                  placeholder="e.g. January"
                />
              </View>

              {/* ── Operations Settings ── */}
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconBox, { backgroundColor: roleColor + '18' }]}>
                    <Ionicons name="construct" size={15} color={roleColor} />
                  </View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Operations Settings</Text>
                </View>
                <FieldInput colors={colors} editable={isAdmin} label="Low Stock Alert (%)"
                  value={cDraft.lowStockAlert}
                  onChangeText={v => patchDraft({ lowStockAlert: v })}
                  placeholder="20"
                  keyboardType="numeric"
                />
                <FieldInput colors={colors} editable={isAdmin} label="Reorder Level (%)"
                  value={cDraft.reorderLevel}
                  onChangeText={v => patchDraft({ reorderLevel: v })}
                  placeholder="30"
                  keyboardType="numeric"
                />
                <View style={[styles.settingRow, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.settingLabel, { color: colors.textMuted }]}>Daily Dip Required</Text>
                  <Switch
                    value={cDraft.dailyDipRequired}
                    onValueChange={v => patchDraft({ dailyDipRequired: v })}
                    trackColor={{ true: roleColor, false: colors.border }}
                    thumbColor="#fff"
                    disabled={!isAdmin}
                  />
                </View>
                <View style={[styles.settingRow, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.settingLabel, { color: colors.textMuted }]}>Auto-Audit Logging</Text>
                  <Switch
                    value={cDraft.autoAuditLogging}
                    onValueChange={v => patchDraft({ autoAuditLogging: v })}
                    trackColor={{ true: roleColor, false: colors.border }}
                    thumbColor="#fff"
                    disabled={!isAdmin}
                  />
                </View>
              </View>

              {isAdmin && hasUnsaved && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: '#BA751714', borderWidth: 1, borderColor: '#BA751740', marginBottom: 2 }}>
                  <Ionicons name="alert-circle-outline" size={15} color="#BA7517" />
                  <Text style={{ color: '#BA7517', fontSize: 12, flex: 1 }}>You have unsaved changes — tap Save to apply them.</Text>
                </View>
              )}
              {isAdmin && cSaved && !hasUnsaved && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: '#1a6e3c14', borderWidth: 1, borderColor: '#1a6e3c40', marginBottom: 2 }}>
                  <Ionicons name="checkmark-circle" size={15} color="#1a6e3c" />
                  <Text style={{ color: '#1a6e3c', fontSize: 12, flex: 1 }}>Company information saved — changes are active across the app.</Text>
                </View>
              )}
              {isAdmin && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <SaveBtn
                    label={hasUnsaved ? 'Save Company Settings' : 'Settings Saved ✓'}
                    roleColor={hasUnsaved ? roleColor : '#1a6e3c'}
                    onPress={() => {
                      if (!cDraft.name.trim()) { Alert.alert('Required', 'Company name cannot be empty.'); return; }
                      updateCompanyInfo(cDraft);
                      cDirtyRef.current = false;
                      setCSaved(true);
                      setTimeout(() => setCSaved(false), 4000);
                    }}
                  />
                </View>
              )}
              {isAdmin && (
                <TouchableOpacity
                  onPress={() => Alert.alert('Reset', 'Clear all company details and start over?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Reset', style: 'destructive', onPress: () => { cDirtyRef.current = false; setCDraft(BLANK_COMPANY_INFO); updateCompanyInfo(BLANK_COMPANY_INFO); } },
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
                    <FieldInput colors={colors} editable={isAdmin} label="Capacity (L)" value={e.cap} onChangeText={v => setTankEdits(t => ({ ...t, [tank.id]: { ...e, cap: v } }))} keyboardType="numeric" placeholder="25000" />
                    <ProdPicker isAdmin={isAdmin} colors={colors} value={e.prod} onChange={v => setTankEdits(t => ({ ...t, [tank.id]: { ...e, prod: v } }))} opts={PROD_OPTS} />
                    {branches.length > 0 && (
                      <View style={{ marginBottom: 4 }}>
                        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Branch Assignment</Text>
                        <View style={[styles.rolePickerRow, { flexWrap: 'wrap', gap: 6 }]}>
                          <TouchableOpacity onPress={() => isAdmin && setTankEdits(t => ({ ...t, [tank.id]: { ...e, branchId: '' } }))}
                            style={[styles.roleChip, { borderColor: !e.branchId ? roleColor : colors.border, backgroundColor: !e.branchId ? roleColor + '18' : colors.surface, opacity: isAdmin ? 1 : 0.6 }]}>
                            <Text style={[styles.roleChipText, { color: !e.branchId ? roleColor : colors.textMuted }]}>All Branches</Text>
                          </TouchableOpacity>
                          {branches.map(b => (
                            <TouchableOpacity key={b.id} onPress={() => isAdmin && setTankEdits(t => ({ ...t, [tank.id]: { ...e, branchId: b.id } }))}
                              style={[styles.roleChip, { borderColor: e.branchId === b.id ? roleColor : colors.border, backgroundColor: e.branchId === b.id ? roleColor + '18' : colors.surface, opacity: isAdmin ? 1 : 0.6 }]}>
                              <Text style={[styles.roleChipText, { color: e.branchId === b.id ? roleColor : colors.textMuted }]}>{b.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}
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
                  <FieldInput colors={colors} label="Capacity (L) *" value={newTank.cap} onChangeText={v => setNewTank(n => ({ ...n, cap: v }))} keyboardType="numeric" placeholder="25000" />
                  <ProdPicker isAdmin={isAdmin} colors={colors} value={newTank.prod} onChange={v => setNewTank(n => ({ ...n, prod: v }))} opts={PROD_OPTS} />
                  <View style={{ marginBottom: 10 }}>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Branch Assignment</Text>
                    {branches.length === 0
                      ? <Text style={[{ color: colors.textMuted, fontSize: 13, fontStyle: 'italic', marginTop: 4 }]}>No branches yet — add a branch first.</Text>
                      : <View style={[styles.rolePickerRow, { flexWrap: 'wrap', gap: 6 }]}>
                          <TouchableOpacity onPress={() => setNewTank(n => ({ ...n, branchId: '' }))}
                            style={[styles.roleChip, { borderColor: !newTank.branchId ? roleColor : colors.border, backgroundColor: !newTank.branchId ? roleColor + '18' : colors.surface }]}>
                            <Text style={[styles.roleChipText, { color: !newTank.branchId ? roleColor : colors.textMuted }]}>All Branches</Text>
                          </TouchableOpacity>
                          {branches.map(b => (
                            <TouchableOpacity key={b.id} onPress={() => setNewTank(n => ({ ...n, branchId: b.id }))}
                              style={[styles.roleChip, { borderColor: newTank.branchId === b.id ? roleColor : colors.border, backgroundColor: newTank.branchId === b.id ? roleColor + '18' : colors.surface }]}>
                              <Text style={[styles.roleChipText, { color: newTank.branchId === b.id ? roleColor : colors.textMuted }]}>{b.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                    }
                  </View>
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
                    {branches.length > 0 && (
                      <View style={{ marginBottom: 4 }}>
                        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Branch Assignment</Text>
                        <View style={[styles.rolePickerRow, { flexWrap: 'wrap', gap: 6 }]}>
                          <TouchableOpacity onPress={() => isAdmin && setLpgEdits(l => ({ ...l, [tank.id]: { ...e, branchId: '' } }))}
                            style={[styles.roleChip, { borderColor: !e.branchId ? '#0F6E56' : colors.border, backgroundColor: !e.branchId ? '#0F6E5618' : colors.surface, opacity: isAdmin ? 1 : 0.6 }]}>
                            <Text style={[styles.roleChipText, { color: !e.branchId ? '#0F6E56' : colors.textMuted }]}>All Branches</Text>
                          </TouchableOpacity>
                          {branches.map(b => (
                            <TouchableOpacity key={b.id} onPress={() => isAdmin && setLpgEdits(l => ({ ...l, [tank.id]: { ...e, branchId: b.id } }))}
                              style={[styles.roleChip, { borderColor: e.branchId === b.id ? '#0F6E56' : colors.border, backgroundColor: e.branchId === b.id ? '#0F6E5618' : colors.surface, opacity: isAdmin ? 1 : 0.6 }]}>
                              <Text style={[styles.roleChipText, { color: e.branchId === b.id ? '#0F6E56' : colors.textMuted }]}>{b.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}
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
                  <View style={{ marginBottom: 10 }}>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Branch Assignment</Text>
                    {branches.length === 0
                      ? <Text style={[{ color: colors.textMuted, fontSize: 13, fontStyle: 'italic', marginTop: 4 }]}>No branches yet — add a branch first.</Text>
                      : <View style={[styles.rolePickerRow, { flexWrap: 'wrap', gap: 6 }]}>
                          <TouchableOpacity onPress={() => setNewLpg(n => ({ ...n, branchId: '' }))}
                            style={[styles.roleChip, { borderColor: !newLpg.branchId ? '#0F6E56' : colors.border, backgroundColor: !newLpg.branchId ? '#0F6E5618' : colors.surface }]}>
                            <Text style={[styles.roleChipText, { color: !newLpg.branchId ? '#0F6E56' : colors.textMuted }]}>All Branches</Text>
                          </TouchableOpacity>
                          {branches.map(b => (
                            <TouchableOpacity key={b.id} onPress={() => setNewLpg(n => ({ ...n, branchId: b.id }))}
                              style={[styles.roleChip, { borderColor: newLpg.branchId === b.id ? '#0F6E56' : colors.border, backgroundColor: newLpg.branchId === b.id ? '#0F6E5618' : colors.surface }]}>
                              <Text style={[styles.roleChipText, { color: newLpg.branchId === b.id ? '#0F6E56' : colors.textMuted }]}>{b.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                    }
                  </View>
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

          {/* ── START-UP STOCK ── */}
          {activeTab === 'startup' && (
            <>
              <LockBanner isAdmin={isAdmin} canManageStaff={canManageStaff} colors={colors} />
              <View style={[styles.banner, { backgroundColor: '#12304a' }]}>
                <Ionicons name="lock-closed" size={22} color="#8ec5ff" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerTitle}>Branch start-up stock</Text>
                  <Text style={styles.bannerSub}>Set the opening quantity for each product and branch before daily deliveries and sales are recorded. These admin-set quantities are the authoritative baseline; tank dipping is not used to create them.</Text>
                </View>
              </View>
              <View style={styles.sectionRow}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Configured baselines</Text>
                <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{startupStocks.length} set</Text>
              </View>

              {startupStocks.length === 0 && (
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.itemCurrent, { color: colors.text }]}>No start-up stock has been set.</Text>
                  <Text style={[styles.itemSub, { color: colors.textMuted }]}>Home will show “Set baseline” until an admin configures each product.</Text>
                </View>
              )}

              {startupStocks.map(stock => {
                const branchName = stock.branchId ? branches.find(b => b.id === stock.branchId)?.name ?? 'Assigned branch' : 'All branches';
                return (
                  <View key={stock.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.itemHeader}>
                      <View style={[styles.idBadge, { backgroundColor: (PROD_COLORS[stock.product] ?? roleColor) + '18' }]}>
                        <Ionicons name="water" size={17} color={PROD_COLORS[stock.product] ?? roleColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>{stock.product}</Text>
                        <Text style={[styles.itemSub, { color: colors.textMuted }]}>{branchName} · set by {stock.setBy}</Text>
                      </View>
                      <View style={[styles.stBadge, { backgroundColor: '#0F6E5618' }]}>
                        <Ionicons name="lock-closed" size={11} color="#0F6E56" />
                        <Text style={[styles.stText, { color: '#0F6E56' }]}>LOCKED</Text>
                      </View>
                    </View>
                    <FieldInput
                      colors={colors}
                      editable={isAdmin}
                      label={`Start-up quantity (${stock.product === 'LPG' ? 'kg' : 'L'})`}
                      value={startupEdits[stock.id] ?? String(stock.quantity)}
                      onChangeText={value => setStartupEdits(prev => ({ ...prev, [stock.id]: value }))}
                      keyboardType="decimal-pad"
                    />
                    {isAdmin && (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                        <TouchableOpacity style={[styles.createBtn, { flex: 1, backgroundColor: roleColor, marginTop: 0 }]} onPress={() => saveStartupStock(stock.id)} activeOpacity={0.85}>
                          <Ionicons name="save-outline" size={16} color="#fff" />
                          <Text style={styles.createBtnText}>Update</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.dangerBtn, { flex: 1, borderColor: colors.errorBorder, marginTop: 0 }]}
                          onPress={() => Alert.alert('Delete start-up stock?', `Remove the ${stock.product} baseline for ${branchName}? Home will show it as not set.`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => deleteStartupStock(stock.id) },
                          ])}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.error} />
                          <Text style={[styles.dangerBtnText, { color: colors.error }]}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}

              {isAdmin && !showNewStartup && (
                <AddBtn roleColor={roleColor} colors={colors} label="Set Product Start-up Stock" onPress={() => { setShowNewStartup(true); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200); }} />
              )}
              {isAdmin && showNewStartup && (
                <View style={[styles.newCard, { backgroundColor: colors.infoBg, borderColor: roleColor + '55' }]}>
                  <View style={styles.newCardHeader}>
                    <View style={[styles.idBadge, { backgroundColor: roleColor + '22' }]}>
                      <Ionicons name="add" size={16} color={roleColor} />
                    </View>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>New start-up stock</Text>
                    <TouchableOpacity onPress={() => { setShowNewStartup(false); setNewStartup({ product: 'PMS', quantity: '', branchId: '' }); }}>
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <ProdPicker isAdmin={isAdmin} colors={colors} value={newStartup.product} onChange={value => setNewStartup(prev => ({ ...prev, product: value as StockProduct }))} opts={STARTUP_PRODUCTS} />
                  <FieldInput
                    colors={colors}
                    label={`Start-up quantity (${newStartup.product === 'LPG' ? 'kg' : 'L'}) *`}
                    value={newStartup.quantity}
                    onChangeText={value => setNewStartup(prev => ({ ...prev, quantity: value }))}
                    keyboardType="decimal-pad"
                    placeholder={newStartup.product === 'LPG' ? 'e.g. 5000' : 'e.g. 25000'}
                  />
                  <View style={{ marginBottom: 10 }}>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Branch Assignment *</Text>
                    <View style={[styles.rolePickerRow, { flexWrap: 'wrap', gap: 6 }]}>
                      {branches.map(branch => (
                        <TouchableOpacity key={branch.id} onPress={() => setNewStartup(prev => ({ ...prev, branchId: branch.id }))}
                          style={[styles.roleChip, { borderColor: newStartup.branchId === branch.id ? roleColor : colors.border, backgroundColor: newStartup.branchId === branch.id ? roleColor + '18' : colors.surface }]}>
                          <Text style={[styles.roleChipText, { color: newStartup.branchId === branch.id ? roleColor : colors.textMuted }]}>{branch.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <TouchableOpacity style={[styles.createBtn, { backgroundColor: roleColor }]} onPress={createStartupStock} activeOpacity={0.85}>
                    <Ionicons name="lock-closed" size={16} color="#fff" />
                    <Text style={styles.createBtnText}>Set & Lock Stock</Text>
                  </TouchableOpacity>
                </View>
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
                    <ProdPicker isAdmin={isAdmin} colors={colors} value={e.prod} onChange={v => setPumpEdits(p => ({ ...p, [pump.id]: { ...e, prod: v, lpgCategory: v === 'LPG' ? e.lpgCategory : '' } }))} opts={['PMS', 'AGO', 'DPK', 'LPG']} />
                    {e.prod === 'LPG' && (
                      <View style={{ marginBottom: 10 }}>
                        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>LPG Category *</Text>
                        <View style={[styles.rolePickerRow, { flexWrap: 'wrap', gap: 6 }]}>
                          {(['single', 'distributor'] as const).map(c => (
                            <TouchableOpacity key={c} onPress={() => isAdmin && setPumpEdits(p => ({ ...p, [pump.id]: { ...e, lpgCategory: c } }))}
                              style={[styles.roleChip, { borderColor: e.lpgCategory === c ? roleColor : colors.border, backgroundColor: e.lpgCategory === c ? roleColor + '18' : colors.surface, opacity: isAdmin ? 1 : 0.6 }]}>
                              <Text style={[styles.roleChipText, { color: e.lpgCategory === c ? roleColor : colors.textMuted }]}>{c === 'single' ? 'Single Buyer' : 'Distributor'}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}
                    <FieldInput colors={colors} editable={isAdmin} label={`Opening Meter Reading (${e.prod === 'LPG' ? 'kg' : 'L'})`} value={e.openingMeter} onChangeText={v => setPumpEdits(p => ({ ...p, [pump.id]: { ...e, openingMeter: v } }))} placeholder="e.g. 12500" keyboardType="decimal-pad" />
                    {branches.length > 0 && (
                      <View style={{ marginBottom: 4 }}>
                        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Branch Assignment</Text>
                        <View style={[styles.rolePickerRow, { flexWrap: 'wrap', gap: 6 }]}>
                          <TouchableOpacity onPress={() => isAdmin && setPumpEdits(p => ({ ...p, [pump.id]: { ...e, branchId: '' } }))}
                            style={[styles.roleChip, { borderColor: !e.branchId ? roleColor : colors.border, backgroundColor: !e.branchId ? roleColor + '18' : colors.surface, opacity: isAdmin ? 1 : 0.6 }]}>
                            <Text style={[styles.roleChipText, { color: !e.branchId ? roleColor : colors.textMuted }]}>All Branches</Text>
                          </TouchableOpacity>
                          {branches.map(b => (
                            <TouchableOpacity key={b.id} onPress={() => isAdmin && setPumpEdits(p => ({ ...p, [pump.id]: { ...e, branchId: b.id } }))}
                              style={[styles.roleChip, { borderColor: e.branchId === b.id ? roleColor : colors.border, backgroundColor: e.branchId === b.id ? roleColor + '18' : colors.surface, opacity: isAdmin ? 1 : 0.6 }]}>
                              <Text style={[styles.roleChipText, { color: e.branchId === b.id ? roleColor : colors.textMuted }]}>{b.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}
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
                  <ProdPicker isAdmin={isAdmin} colors={colors} value={newPump.prod} onChange={v => setNewPump(n => ({ ...n, prod: v, lpgCategory: v === 'LPG' ? '' : '' }))} opts={['PMS', 'AGO', 'DPK', 'LPG']} />
                  {newPump.prod === 'LPG' && (
                    <View style={{ marginBottom: 10 }}>
                      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>LPG Category *</Text>
                      <View style={[styles.rolePickerRow, { flexWrap: 'wrap', gap: 6 }]}>
                        {(['single', 'distributor'] as const).map(c => (
                          <TouchableOpacity key={c} onPress={() => setNewPump(n => ({ ...n, lpgCategory: c }))}
                            style={[styles.roleChip, { borderColor: newPump.lpgCategory === c ? roleColor : colors.border, backgroundColor: newPump.lpgCategory === c ? roleColor + '18' : colors.surface }]}>
                            <Text style={[styles.roleChipText, { color: newPump.lpgCategory === c ? roleColor : colors.textMuted }]}>{c === 'single' ? 'Single Buyer' : 'Distributor'}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                  <View style={{ marginBottom: 10 }}>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Branch Assignment *</Text>
                    {branches.length === 0
                      ? <Text style={[{ color: colors.textMuted, fontSize: 13, fontStyle: 'italic', marginTop: 4 }]}>No branches yet — add a branch first.</Text>
                      : <View style={[styles.rolePickerRow, { flexWrap: 'wrap', gap: 6 }]}>
                          <TouchableOpacity onPress={() => setNewPump(n => ({ ...n, branchId: '' }))}
                            style={[styles.roleChip, { borderColor: !newPump.branchId ? roleColor : colors.border, backgroundColor: !newPump.branchId ? roleColor + '18' : colors.surface }]}>
                            <Text style={[styles.roleChipText, { color: !newPump.branchId ? roleColor : colors.textMuted }]}>All Branches</Text>
                          </TouchableOpacity>
                          {branches.map(b => (
                            <TouchableOpacity key={b.id} onPress={() => setNewPump(n => ({ ...n, branchId: b.id }))}
                              style={[styles.roleChip, { borderColor: newPump.branchId === b.id ? roleColor : colors.border, backgroundColor: newPump.branchId === b.id ? roleColor + '18' : colors.surface }]}>
                              <Text style={[styles.roleChipText, { color: newPump.branchId === b.id ? roleColor : colors.textMuted }]}>{b.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                    }
                  </View>
                  <FieldInput colors={colors} label="Opening Meter Reading (L)" value={newPump.openingMeter} onChangeText={v => setNewPump(n => ({ ...n, openingMeter: v }))} placeholder="e.g. 12500 (optional)" keyboardType="decimal-pad" />
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
                const e = staffEdits[member.id] ?? { name: member.name, email: member.email, branchId: member.branchId ?? '' };
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
                            { text: 'Delete', style: 'destructive', onPress: async () => {
                              const removed = await deleteStaff(member.id);
                              Alert.alert(
                                removed ? 'Staff Deleted' : 'Delete Failed',
                                removed
                                  ? `"${member.name}" and the associated login account were deleted.`
                                  : 'The staff account could not be deleted. Check your connection and try again.',
                              );
                            } },
                          ])}
                          style={styles.deleteIconBtn}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.error} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <FieldInput colors={colors} editable={canManageStaff} label="Full Name" value={e.name} onChangeText={v => setStaffEdits(s => ({ ...s, [member.id]: { ...e, name: v } }))} placeholder="Enter full name" autoCapitalize="words" />
                    <FieldInput colors={colors} editable={canManageStaff} label="Email Address" value={e.email} onChangeText={v => setStaffEdits(s => ({ ...s, [member.id]: { ...e, email: v } }))} keyboardType="email-address" autoCapitalize="none" placeholder="user@company.com" />
                    <View style={{ marginBottom: 4 }}>
                      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Branch Assignment</Text>
                      <View style={[styles.rolePickerRow, { flexWrap: 'wrap', gap: 6 }]}>
                        <TouchableOpacity
                          disabled={!canManageStaff}
                          onPress={() => setStaffEdits(s => ({ ...s, [member.id]: { ...e, branchId: '' } }))}
                          style={[styles.roleChip, { borderColor: !e.branchId ? roleColor : colors.border, backgroundColor: !e.branchId ? roleColor + '18' : colors.surface, opacity: canManageStaff ? 1 : 0.6 }]}
                        >
                          <Text style={[styles.roleChipText, { color: !e.branchId ? roleColor : colors.textMuted }]}>Head Office / Global</Text>
                        </TouchableOpacity>
                        {branches.map(b => (
                          <TouchableOpacity
                            key={b.id}
                            disabled={!canManageStaff}
                            onPress={() => setStaffEdits(s => ({ ...s, [member.id]: { ...e, branchId: b.id } }))}
                            style={[styles.roleChip, { borderColor: e.branchId === b.id ? roleColor : colors.border, backgroundColor: e.branchId === b.id ? roleColor + '18' : colors.surface, opacity: canManageStaff ? 1 : 0.6 }]}
                          >
                            <Text style={[styles.roleChipText, { color: e.branchId === b.id ? roleColor : colors.textMuted }]}>{b.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
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
                  <RolePicker isAdmin={isAdmin} colors={colors} roleColor={roleColor} value={newStaff.role} onChange={v => setNewStaff(n => ({ ...n, role: v, branchId: GLOBAL_OVERVIEW_ROLES.has(v) ? '' : n.branchId }))} />
                  <View style={{ marginBottom: 10 }}>
                     <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Assign Location</Text>
                     {GLOBAL_OVERVIEW_ROLES.has(newStaff.role)
                       ? <Text style={[{ color: roleColor, fontSize: 13, fontWeight: '600', marginTop: 4 }]}>Global role — this user automatically sees all branches.</Text>
                       : branches.length === 0
                      ? <Text style={[{ color: colors.textMuted, fontSize: 13, fontStyle: 'italic', marginTop: 4 }]}>No branches yet — add a branch first.</Text>
                       : <View style={[styles.rolePickerRow, { flexWrap: 'wrap', gap: 6 }]}>
                           <TouchableOpacity onPress={() => setNewStaff(n => ({ ...n, branchId: '' }))}
                             style={[styles.roleChip, { borderColor: !newStaff.branchId ? roleColor : colors.border, backgroundColor: !newStaff.branchId ? roleColor + '18' : colors.surface }]}>
                             <Text style={[styles.roleChipText, { color: !newStaff.branchId ? roleColor : colors.textMuted }]}>Head Office / Global</Text>
                           </TouchableOpacity>
                          {branches.map(b => (
                            <TouchableOpacity key={b.id} onPress={() => setNewStaff(n => ({ ...n, branchId: b.id }))}
                              style={[styles.roleChip, { borderColor: newStaff.branchId === b.id ? roleColor : colors.border, backgroundColor: newStaff.branchId === b.id ? roleColor + '18' : colors.surface }]}>
                              <Text style={[styles.roleChipText, { color: newStaff.branchId === b.id ? roleColor : colors.textMuted }]}>{b.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                    }
                  </View>
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
          {activeTab === 'staff' && (
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
                          onValueChange={v => { if (isAdmin) updateMgrPerms(bid, { [key]: v }); }}
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
                              onValueChange={v => { if (isAdmin) updateRoleAccess(r, id, v); }}
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

              {/* ── Head Office / Global Users ── */}
              <View style={[styles.sectionRow, { marginTop: 8 }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Head Office / Global Users</Text>
                <Text style={[styles.sectionCount, { color: colors.textMuted }]}>
                  {headOfficeUsers.length} active user{headOfficeUsers.length === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 14 }]}>
                <View style={[styles.lockBanner, { backgroundColor: roleColor + '10', borderColor: roleColor + '35', marginBottom: 0 }]}>
                  <Ionicons name="globe-outline" size={15} color={roleColor} />
                  <Text style={[styles.lockText, { color: colors.text }]}>
                    These switches apply to every active user assigned to Head Office / Global access. Their Home totals remain company-wide.
                  </Text>
                </View>
                {homeAccessModules.map(({ id, label, icon }, idx) => {
                  const enabled = headOfficeModuleEnabled(id);
                  return (
                    <View key={id} style={[styles.permRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                      <View style={[styles.permIcon, { backgroundColor: enabled ? roleColor + '22' : colors.border + '55' }]}>
                        <Ionicons name={icon as any} size={16} color={enabled ? roleColor : colors.textMuted} />
                      </View>
                      <Text style={[styles.permLabel, { color: enabled ? colors.text : colors.textMuted }]}>{label}</Text>
                      <Switch
                        value={enabled}
                        onValueChange={value => setHeadOfficeModuleAccess(id, value)}
                        thumbColor={enabled ? roleColor : '#aaa'}
                        trackColor={{ false: colors.border, true: roleColor + '55' }}
                        disabled={!isAdmin || headOfficeUsers.length === 0}
                      />
                    </View>
                  );
                })}
                {headOfficeUsers.length === 0 && (
                  <Text style={[styles.subLabel, { color: colors.textMuted, padding: 14 }]}>
                    No active users are currently assigned to Head Office / Global access.
                  </Text>
                )}
              </View>

              {/* ── By User ── */}
              <View style={[styles.sectionRow, { marginTop: 8 }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>By User</Text>
                <Text style={[styles.sectionCount, { color: colors.textMuted }]}>overrides role defaults</Text>
              </View>

              {userAccounts.filter(m => m.status === 'active' && m.role && m.role !== 'admin').map(member => {
                const memberRole = member.role ?? 'att';
                const rc = ROLE_COLORS[memberRole] || roleColor;
                const modules = ROLE_FULL_NAV[memberRole] ?? [];
                const overrides = userAccess[member.id] ?? {};
                const hasOverrides = Object.keys(overrides).length > 0;
                const expanded = expandedUsers[member.id] ?? false;
                const initials = member.empName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

                const effectiveEnabled = (id: string) => {
                  if (overrides[id] !== undefined) return overrides[id];
                  return (roleAccess[memberRole] ?? {})[id] !== false;
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
                         <Text style={[styles.itemCurrent, { color: colors.text }]}>{member.empName}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <View style={[styles.mgrBadge, { backgroundColor: rc + '18', paddingHorizontal: 6, paddingVertical: 2 }]}>
                             <Text style={[styles.mgrBadgeText, { color: rc, fontSize: 10 }]}>{(ROLE_LABELS[memberRole] ?? memberRole).toUpperCase()}</Text>
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
                                onValueChange={v => { if (isAdmin) updateUserAccess(member.id, id, v); }}
                                thumbColor={enabled ? rc : '#aaa'}
                                trackColor={{ false: colors.border, true: rc + '55' }}
                                disabled={!isAdmin}
                              />
                            </View>
                          );
                        })}
                        {isAdmin && hasOverrides && (
                          <TouchableOpacity
                            onPress={() => Alert.alert('Reset Access', `Reset "${member.empName}" to role defaults?`, [
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

          {/* ── STOCK SNAPSHOT ── */}
          {activeTab === 'snapshot' && (
            <>
              <View style={[styles.banner, { backgroundColor: '#102a43' }]}>
                <Ionicons name="analytics" size={22} color="#7dd3fc" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerTitle}>Stock Snapshot Display</Text>
                  <Text style={styles.bannerSub}>Choose which information and products appear on Home</Text>
                </View>
              </View>
              {!isAdmin && (
                <LockBanner isAdmin={false} canManageStaff={false} colors={colors} />
              )}

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconBox, { backgroundColor: roleColor + '18' }]}>
                    <Ionicons name="list" size={15} color={roleColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>Information shown</Text>
                    <Text style={[styles.subLabel, { color: colors.textMuted }]}>Applies to every branch snapshot</Text>
                  </View>
                </View>
                {STOCK_SNAPSHOT_METRICS.map((metric, idx) => {
                  const option = STOCK_METRIC_LABELS[metric];
                  const enabled = stockSnapshotConfig.metrics[metric];
                  return (
                    <View key={metric} style={[styles.permRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                      <View style={[styles.permIcon, { backgroundColor: enabled ? roleColor + '22' : colors.border + '55' }]}>
                        <Ionicons name={enabled ? 'eye' : 'eye-off'} size={16} color={enabled ? roleColor : colors.textMuted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.permLabel, { color: enabled ? colors.text : colors.textMuted }]}>{option.label}</Text>
                        <Text style={[styles.subLabel, { color: colors.textMuted, fontSize: 10 }]}>{option.description}</Text>
                      </View>
                      <Switch
                        value={enabled}
                        onValueChange={value => updateStockSnapshotMetric(metric, value)}
                        thumbColor={enabled ? roleColor : '#aaa'}
                        trackColor={{ false: colors.border, true: roleColor + '55' }}
                        disabled={!isAdmin}
                      />
                    </View>
                  );
                })}
              </View>

              <View style={[styles.sectionRow, { marginTop: 8 }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Products by branch</Text>
                <Text style={[styles.sectionCount, { color: colors.textMuted }]}>hide products not offered</Text>
              </View>
              {branches.filter(branch => branch.st !== 'Suspended').length === 0 ? (
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.subLabel, { color: colors.textMuted, padding: 14 }]}>No branches configured</Text>
                </View>
              ) : (
                branches.filter(branch => branch.st !== 'Suspended').map(branch => (
                  <View key={branch.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 12 }]}>
                    <View style={[styles.mgrHeader, { borderBottomColor: colors.border }]}>
                      <View style={[styles.mgrBadge, { backgroundColor: roleColor + '22' }]}>
                        <Ionicons name="business" size={14} color={roleColor} />
                        <Text style={[styles.mgrBadgeText, { color: roleColor }]}>{branch.name}</Text>
                      </View>
                      <Text style={[styles.subLabel, { color: colors.textMuted }]}>Products offered</Text>
                    </View>
                    {STARTUP_PRODUCTS.map((product, idx) => {
                      const enabled = stockSnapshotConfig.productsByBranch[branch.id]?.[product] !== false;
                      return (
                        <View key={product} style={[styles.permRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                          <View style={[styles.permIcon, { backgroundColor: enabled ? (PROD_COLORS[product] ?? roleColor) + '22' : colors.border + '55' }]}>
                            <Ionicons name={enabled ? 'checkmark-circle' : 'close-circle'} size={16} color={enabled ? (PROD_COLORS[product] ?? roleColor) : colors.textMuted} />
                          </View>
                          <Text style={[styles.permLabel, { color: enabled ? colors.text : colors.textMuted }]}>{product}</Text>
                          <Switch
                            value={enabled}
                            onValueChange={value => updateStockSnapshotProduct(branch.id, product, value)}
                            thumbColor={enabled ? (PROD_COLORS[product] ?? roleColor) : '#aaa'}
                            trackColor={{ false: colors.border, true: (PROD_COLORS[product] ?? roleColor) + '55' }}
                            disabled={!isAdmin}
                          />
                        </View>
                      );
                    })}
                  </View>
                ))
              )}
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
                <>
                  <TouchableOpacity
                    style={[styles.dangerBtn, { borderColor: colors.errorBorder }]}
                    onPress={() => Alert.alert('Confirm', 'Clear all cached data?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => {} }])}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                    <Text style={[styles.dangerBtnText, { color: colors.error }]}>Clear Cache</Text>
                  </TouchableOpacity>

                  <View style={{ marginTop: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Ionicons name="warning" size={16} color="#C0392B" />
                      <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.5, color: '#C0392B', textTransform: 'uppercase' }}>Production Reset</Text>
                    </View>
                    <View style={[styles.card, { backgroundColor: '#FDF2F0', borderColor: '#C0392B33', marginBottom: 0 }]}>
                      <Text style={{ fontSize: 13, color: '#C0392B', lineHeight: 20, marginBottom: 12 }}>
                        Clears all test/operational data — shift reports, sales, expenses, deliveries, messages, HR records, and more.{'\n\n'}
                        <Text style={{ fontWeight: '700' }}>Admin settings are preserved:</Text> pumps, tanks, staff, branches, prices, user accounts, and role permissions stay intact.
                      </Text>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#C0392B', paddingVertical: 13, borderRadius: 12 }}
                        activeOpacity={0.85}
                        onPress={() => {
                          const runReset = async () => {
                            await resetOperationalData();
                            Alert.alert('Done', 'All operational data has been cleared. The app is ready for live use. Pump opening meters were preserved from the latest shift reports.');
                          };
                          const confirmTyped = () => {
                            if (typeof Alert.prompt === 'function') {
                              Alert.prompt(
                                'Type RESET to confirm',
                                'Enter RESET below to permanently erase all operational data. This action is audited.',
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  {
                                    text: 'Erase Data',
                                    style: 'destructive',
                                    onPress: (value?: string) => {
                                      if (value?.trim().toUpperCase() !== 'RESET') {
                                        Alert.alert('Cancelled', 'You did not type RESET exactly. No data was erased.');
                                        return;
                                      }
                                      runReset();
                                    },
                                  },
                                ],
                                'plain-text',
                                '',
                                'RESET'
                              );
                            } else {
                              // Web fallback: Alert.prompt is not available on web.
                              Alert.alert(
                                'Final confirmation',
                                'This is the last step. All operational data will be permanently erased. This cannot be undone.',
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  { text: 'Erase Everything', style: 'destructive', onPress: runReset },
                                ]
                              );
                            }
                          };
                          Alert.alert(
                            'Reset for Production?',
                            'This will permanently delete all operational data (shift reports, sales, expenses, deliveries, messages, HR records, etc.).\n\nAdmin settings, pumps, staff, prices and user accounts will NOT be touched.\n\nThis cannot be undone.',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'I understand — continue',
                                style: 'destructive',
                                onPress: confirmTyped,
                              },
                            ]
                          );
                        }}
                      >
                        <Ionicons name="refresh-circle-outline" size={18} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Reset for Production</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
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
  tabScroll:     { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingVertical: 2 },
  tab:           { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 9 },
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
