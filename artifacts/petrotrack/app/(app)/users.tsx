import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';

import { ModalSheet } from '@/components/FormSheet';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, ROLE_LABELS, UserAccount, useApp, type Role } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type Tab = 'pending' | 'active' | 'staff';

const ROLE_OPTS: Role[] = ['ceo', 'md', 'mktg', 'csm', 'acc', 'mgr', 'att'];

const STATUS_COLORS: Record<string, string> = {
  active: '#174D36', pending: '#71805B', suspended: '#365A47', inactive: '#7f8c8d', rejected: '#888',
  pending_md: '#315F49', pending_admin: '#71805B',
};

const STATUS_LABELS: Record<string, string> = {
  pending_md:    'Awaiting MD',
  pending_admin: 'Awaiting Activation',
  pending:       'Pending',
  active:        'Active',
  suspended:     'Suspended',
  inactive:      'Inactive',
  rejected:      'Rejected',
};

export default function UsersScreen() {
  const {
    role, userName,
    userAccounts, branches, staff,
    addActiveUserAccount, enrollStaff,
    mdApproveEnrollment, mdRejectEnrollment,
    approveUserAccount, updateUserAccount,
    updateEnrollmentData,
    suspendUserAccount, reactivateUserAccount,
    rejectUserAccount, deleteUserAccount, deleteStaff, reconcileUserStaffDirectory,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'admin'] || colors.primary;
  const isAdmin = role === 'admin';
  const isHR    = role === 'csm';
  const isMD    = role === 'md';
  const canManageUsers = isAdmin || isHR;
  const defaultBranchId = branches.find(branch => branch.name.trim().toLowerCase() === 'head office')?.id
    ?? branches.find(branch => branch.st === 'Active')?.id
    ?? branches[0]?.id
    ?? '';

  const [tab, setTab]       = useState<Tab>('pending');
  const [search, setSearch] = useState('');

  /* ── approve modal state ── */
  const [approving, setApproving]         = useState<UserAccount | null>(null);
  const [aRole, setARole]                 = useState<Role>('att');
  const [aUsername, setAUsername]         = useState('');
  const [aPassword, setAPassword]         = useState('');
  const [aBranch, setABranch]             = useState('');
  const [showApprovePw, setShowApprovePw] = useState(false);
  const [isApproving, setIsApproving]     = useState(false);

  /* ── edit modal state (active accounts) ── */
  const [editing, setEditing]           = useState<UserAccount | null>(null);
  const [eUsername, setEUsername]       = useState('');
  const [ePassword, setEPassword]       = useState('');
  const [eRole, setERole]               = useState<Role>('att');
  const [eBranch, setEBranch]           = useState('');
  const [ePhone, setEPhone]             = useState('');
  const [showEditPw, setShowEditPw]     = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  /* ── view account modal (non-admin) ── */
  const [viewAcc, setViewAcc] = useState<UserAccount | null>(null);

  /* ── create account modal (admin only) ── */
  const [showCreate, setShowCreate]     = useState(false);
  const [cEmpName, setCEmpName]         = useState('');
  const [cUsername, setCUsername]       = useState('');
  const [cPassword, setCPassword]       = useState('');
  const [cRole, setCRole]               = useState<Role>('att');
  const [cBranch, setCBranch]           = useState('');
  const [cPhone, setCPhone]             = useState('');
  const [showCreatePw, setShowCreatePw] = useState(false);

  /* ── enroll staff modal (HR/CSM only) ── */
  const [showEnroll, setShowEnroll]                 = useState(false);
  const [nEmpName, setNEmpName]                     = useState('');
  const [nJobTitle, setNJobTitle]                   = useState('');
  const [nDept, setNDept]                           = useState('');
  const [nBranch, setNBranch]                       = useState('');
  const [nPhone, setNPhone]                         = useState('');
  const [nNin, setNNin]                             = useState('');
  const [nStaffAddress, setNStaffAddress]           = useState('');
  const [nGuarantorName, setNGuarantorName]         = useState('');
  const [nGuarantorPhone, setNGuarantorPhone]       = useState('');
  const [nGuarantorAddress, setNGuarantorAddress]   = useState('');
  const [nDocs, setNDocs]                           = useState<Set<string>>(new Set());

  /* ── enrollment review modal (MD view + Admin full review/edit) ── */
  const [viewEnroll, setViewEnroll]           = useState<UserAccount | null>(null);
  const [editingEnroll, setEditingEnroll]     = useState(false);
  const [veEmpName, setVeEmpName]             = useState('');
  const [veJobTitle, setVeJobTitle]           = useState('');
  const [veDept, setVeDept]                   = useState('');
  const [vePhone, setVePhone]                 = useState('');
  const [veNin, setVeNin]                     = useState('');
  const [veStaffAddr, setVeStaffAddr]         = useState('');
  const [veGuarantorName, setVeGuarantorName] = useState('');
  const [veGuarantorPhone, setVeGuarantorPhone] = useState('');
  const [veGuarantorAddr, setVeGuarantorAddr] = useState('');
  /* activation panel inside review modal (admin only) */
  const [vaRole, setVaRole]                   = useState<Role>('att');
  const [vaUsername, setVaUsername]           = useState('');
  const [vaPassword, setVaPassword]           = useState('');
  const [vaBranch, setVaBranch]               = useState('');
  const [showVaPw, setShowVaPw]               = useState(false);

  /* ── pending data per role ── */
  const pendingMdRecs    = userAccounts.filter(a => a.status === 'pending_md');
  const pendingAdminRecs = userAccounts.filter(a => a.status === 'pending_admin');
  const pendingLegacy    = userAccounts.filter(a => a.status === 'pending');
  const pendingForRole   = isMD
    ? pendingMdRecs
    : canManageUsers
      ? [...pendingAdminRecs, ...pendingLegacy, ...pendingMdRecs]
        : [];
  const active   = userAccounts.filter(a => ['active', 'suspended'].includes(a.status));
  const registeredUsers = canManageUsers ? userAccounts : active;
  const filtered = (tab === 'pending' ? pendingForRole : registeredUsers).filter(a =>
    !search || a.empName.toLowerCase().includes(search.toLowerCase()) ||
    a.username.toLowerCase().includes(search.toLowerCase())
  );
  const filteredStaff = staff.filter(member =>
    !search ||
    member.name.toLowerCase().includes(search.toLowerCase()) ||
    member.email.toLowerCase().includes(search.toLowerCase()) ||
    member.role.toLowerCase().includes(search.toLowerCase()) ||
    (member.branchId ?? '').toLowerCase().includes(search.toLowerCase())
  );

  /* ─── approve helpers (legacy flow for direct activation) ─── */
  function openApprove(acc: UserAccount) {
    if (!acc.phoneNumber) {
      Alert.alert(
        'Phone Number Missing',
        `${acc.empName} has no phone number on file. Edit the enrollment to add one before activating.`,
        [{ text: 'OK' }]
      );
      return;
    }
    const suggested = acc.empName.split(' ').map(w => w[0]?.toLowerCase()).join('') +
      (acc.empName.split(' ')[1] || '').toLowerCase().slice(0, 5);
    setARole('att'); setAUsername(suggested || ''); setAPassword('');
    setABranch(acc.branchId || defaultBranchId); setShowApprovePw(false);
    setApproving(acc);
  }

  async function handleApprove() {
    if (isApproving) return;
    if (!approving) return;
    if (!aUsername.trim()) { Alert.alert('Required', 'Username is required.'); return; }
    if (!aPassword.trim()) { Alert.alert('Required', 'Set a temporary password.'); return; }
    if (!aBranch) { Alert.alert('Required', 'Assign this user to a branch.'); return; }
    const dup = userAccounts.find(a => a.username === aUsername.trim() && a.id !== approving.id);
    if (dup) { Alert.alert('Username Taken', 'That username is already in use.'); return; }
    setIsApproving(true);
    await approveUserAccount(approving.id, aRole, aUsername.trim(), aPassword.trim(), userName || 'Admin', aBranch);
    setIsApproving(false);
    Alert.alert('Account Approved', `${approving.empName} can now log in as @${aUsername.trim()}.`);
    setApproving(null);
  }

  function handleReject(acc: UserAccount) {
    Alert.alert('Reject Account', `Reject ${acc.empName}'s account request?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => rejectUserAccount(acc.id) },
    ]);
  }

  /* ─── edit helpers (active accounts) ─── */
  function openEdit(acc: UserAccount) {
    setEUsername(acc.username); setEPassword('');
    setERole((acc.role as Role) || 'att');
    setEBranch(acc.branchId || defaultBranchId); setEPhone(acc.phoneNumber || '');
    setShowEditPw(false); setEditing(acc);
  }

  async function handleSaveEdit() {
    if (isSavingEdit) return;
    if (!editing) return;
    if (!eUsername.trim()) { Alert.alert('Required', 'Username cannot be empty.'); return; }
    if (!eBranch) { Alert.alert('Required', 'Assign this user to a branch.'); return; }
    if (ePassword.trim() && ePassword.trim().length < 6) {
      Alert.alert('Invalid', 'New password must be at least 6 characters.'); return;
    }
    const dup = userAccounts.find(a => a.username === eUsername.trim() && a.id !== editing.id);
    if (dup) { Alert.alert('Username Taken', 'That username is already in use.'); return; }
    const updates: { username?: string; password?: string; role?: Role; branchId?: string | null; phoneNumber?: string } = {
      username: eUsername.trim(), role: eRole, branchId: eBranch,
      phoneNumber: ePhone.trim() || undefined,
    };
    if (ePassword.trim()) updates.password = ePassword.trim();
    setIsSavingEdit(true);
    await updateUserAccount(editing.id, updates, userName || 'Admin');
    setIsSavingEdit(false);
    Alert.alert('Account Updated', `${editing.empName}'s account has been updated.`);
    setEditing(null);
  }

  function handleSuspend(acc: UserAccount) {
    Alert.alert(
      acc.status === 'active' ? 'Suspend Account' : 'Reactivate Account',
      `${acc.status === 'active' ? 'Suspend' : 'Reactivate'} ${acc.empName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => {
          acc.status === 'active' ? suspendUserAccount(acc.id) : reactivateUserAccount(acc.id);
          if (editing?.id === acc.id) setEditing(null);
        }},
      ]
    );
  }

  function handleDelete(acc: UserAccount) {
    if (acc.username === userName) {
      Alert.alert('Action Not Allowed', 'You cannot delete the account you are currently using.');
      return;
    }
    Alert.alert('Delete Account', `Permanently remove ${acc.empName}'s account? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const removed = await deleteUserAccount(acc.id);
        if (!removed) {
          Alert.alert('Delete Failed', 'The account could not be removed. Check your connection and try again.');
          return;
        }
        setEditing(null);
        setViewAcc(null);
        setViewEnroll(null);
        setEditingEnroll(false);
        Alert.alert('Account Deleted', `${acc.empName}'s account has been permanently removed.`);
      }},
    ]);
  }

  async function handleReconcileStaff() {
    const result = await reconcileUserStaffDirectory();
    Alert.alert(
      'Staff Directory Updated',
      `${result.linked} existing staff record${result.linked === 1 ? '' : 's'} linked and ${result.added} missing staff record${result.added === 1 ? '' : 's'} added.`
      + ` ${result.createdAccounts} missing user account${result.createdAccounts === 1 ? '' : 's'} created for activation.`
      + ` ${result.idsAssigned} permanent staff ID${result.idsAssigned === 1 ? '' : 's'} assigned.`
      + (result.idFailures ? ` ${result.idFailures} staff ID assignment${result.idFailures === 1 ? '' : 's'} failed and should be retried.` : '')
      + (result.ambiguousAccountIds.length
        ? ` ${result.ambiguousAccountIds.length} account records were skipped because their staff identity is ambiguous.`
        : '')
      + (result.unassigned ? ` ${result.unassigned} records still need a branch because no canonical branch is available.` : ''),
    );
  }

  /* ─── enroll helpers (CSM) ─── */
  const REQUIRED_DOCS = ['CV / Resume', 'Academic Certificates', 'Government-issued ID', "Guarantor's ID", 'Passport Photo'];
  const OPTIONAL_DOCS = ['Previous Employment Letter', 'Reference Letter', 'Medical Certificate'];

  function openEnroll() {
    setNEmpName(''); setNJobTitle(''); setNDept(''); setNBranch(defaultBranchId); setNPhone('');
    setNNin(''); setNStaffAddress('');
    setNGuarantorName(''); setNGuarantorPhone(''); setNGuarantorAddress('');
    setNDocs(new Set());
    setShowEnroll(true);
  }

  function toggleDoc(doc: string) {
    setNDocs(prev => {
      const next = new Set(prev);
      next.has(doc) ? next.delete(doc) : next.add(doc);
      return next;
    });
  }

  async function handleEnroll() {
    if (!nEmpName.trim()) { Alert.alert('Required', 'Full name is required.'); return; }
    if (!nBranch) { Alert.alert('Required', 'Assign this staff member to a branch.'); return; }
    const phone = nPhone.trim();
    if (!phone) { Alert.alert('Required', 'Phone number is required for Comms.'); return; }
    if (!/^(0[789]\d{9}|(\+?234)[789]\d{9})$/.test(phone.replace(/\s/g, ''))) {
      Alert.alert('Invalid Phone', 'Enter a valid Nigerian number, e.g. 08012345678.'); return;
    }
    const nin = nNin.trim();
    if (!nin) { Alert.alert('Required', 'NIN is required.'); return; }
    if (!/^\d{11}$/.test(nin)) { Alert.alert('Invalid NIN', 'NIN must be exactly 11 digits.'); return; }
    if (!nStaffAddress.trim()) { Alert.alert('Required', 'Staff residential address is required.'); return; }
    if (!nGuarantorName.trim()) { Alert.alert('Required', 'Guarantor full name is required.'); return; }
    const gPhone = nGuarantorPhone.trim();
    if (!gPhone) { Alert.alert('Required', 'Guarantor phone is required.'); return; }
    if (!/^(0[789]\d{9}|(\+?234)[789]\d{9})$/.test(gPhone.replace(/\s/g, ''))) {
      Alert.alert('Invalid Guarantor Phone', 'Enter a valid Nigerian number for the guarantor.'); return;
    }
    if (!nGuarantorAddress.trim()) { Alert.alert('Required', 'Guarantor address is required.'); return; }
    const missingDocs = REQUIRED_DOCS.filter(d => !nDocs.has(d));
    if (missingDocs.length > 0) {
      Alert.alert('Documents Missing', `Confirm receipt of all required documents:\n\n• ${missingDocs.join('\n• ')}`);
      return;
    }
    await enrollStaff({
      empName: nEmpName.trim(), jobTitle: nJobTitle.trim() || undefined,
      dept: nDept.trim() || undefined, branchId: nBranch,
      phoneNumber: phone, nin,
      staffAddress: nStaffAddress.trim(),
      guarantorName: nGuarantorName.trim(), guarantorPhone: gPhone,
      guarantorAddress: nGuarantorAddress.trim(),
      employmentDocs: [...nDocs],
    }, userName || 'HR');
    Alert.alert('Submitted to MD', `${nEmpName.trim()}'s enrollment has been sent to MD for approval.`);
    setShowEnroll(false);
  }

  /* ─── MD approve/reject helpers ─── */
  function handleMdApprove(acc: UserAccount) {
    Alert.alert(
      'Approve Enrollment',
      `Approve ${acc.empName}${acc.empId ? ` (${acc.empId})` : ''} and forward to Admin for account creation?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => {
          mdApproveEnrollment(acc.id, userName || 'MD');
          setViewEnroll(null);
        }},
      ]
    );
  }

  function handleMdReject(acc: UserAccount) {
    Alert.alert(
      'Reject Enrollment',
      `Reject ${acc.empName}'s enrollment? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => {
          mdRejectEnrollment(acc.id, userName || 'MD');
          setViewEnroll(null);
        }},
      ]
    );
  }

  /* ─── enrollment review modal helpers ─── */
  function openViewEnroll(acc: UserAccount) {
    setViewEnroll(acc);
    setEditingEnroll(false);
    setVeEmpName(acc.empName || '');
    setVeJobTitle(acc.jobTitle || '');
    setVeDept(acc.dept || '');
    setVePhone(acc.phoneNumber || '');
    setVeNin(acc.nin || '');
    setVeStaffAddr(acc.staffAddress || '');
    setVeGuarantorName(acc.guarantorName || '');
    setVeGuarantorPhone(acc.guarantorPhone || '');
    setVeGuarantorAddr(acc.guarantorAddress || '');
    const suggested = acc.empName.split(' ').map(w => w[0]?.toLowerCase()).join('') +
      (acc.empName.split(' ')[1] || '').toLowerCase().slice(0, 5);
    setVaRole('att');
    setVaUsername(suggested || '');
    setVaPassword(''); setVaBranch(acc.branchId || defaultBranchId); setShowVaPw(false);
  }

  async function handleSaveEnrollEdit() {
    if (!viewEnroll) return;
    const nin = veNin.trim();
    if (nin && !/^\d{11}$/.test(nin)) { Alert.alert('Invalid NIN', 'NIN must be exactly 11 digits.'); return; }
    const phone = vePhone.trim();
    if (phone && !/^(0[789]\d{9}|(\+?234)[789]\d{9})$/.test(phone.replace(/\s/g, ''))) {
      Alert.alert('Invalid Phone', 'Enter a valid Nigerian number.'); return;
    }
    const gPhone = veGuarantorPhone.trim();
    if (gPhone && !/^(0[789]\d{9}|(\+?234)[789]\d{9})$/.test(gPhone.replace(/\s/g, ''))) {
      Alert.alert('Invalid Guarantor Phone', 'Enter a valid Nigerian number.'); return;
    }
    await updateEnrollmentData(viewEnroll.id, {
      empName: veEmpName.trim() || undefined,
      jobTitle: veJobTitle.trim() || undefined,
      dept: veDept.trim() || undefined,
      phoneNumber: phone || undefined,
      nin: nin || undefined,
      staffAddress: veStaffAddr.trim() || undefined,
      guarantorName: veGuarantorName.trim() || undefined,
      guarantorPhone: gPhone || undefined,
      guarantorAddress: veGuarantorAddr.trim() || undefined,
    }, userName || 'Admin');
    Alert.alert('Saved', 'Enrollment details updated successfully.');
    setEditingEnroll(false);
    const updated = userAccounts.find(a => a.id === viewEnroll.id);
    if (updated) setViewEnroll(updated);
  }

  async function handleActivateFromReview() {
    if (!viewEnroll) return;
    if (!vaUsername.trim()) { Alert.alert('Required', 'Username is required.'); return; }
    if (!vaPassword.trim()) { Alert.alert('Required', 'Set a temporary password.'); return; }
    if (!vaBranch) { Alert.alert('Required', 'Assign this user to a branch.'); return; }
    const dup = userAccounts.find(a => a.username === vaUsername.trim() && a.id !== viewEnroll.id);
    if (dup) { Alert.alert('Username Taken', 'That username is already in use.'); return; }
    const phone = viewEnroll.phoneNumber || vePhone.trim();
    if (!phone) {
      Alert.alert('Phone Missing', 'Add a phone number to the enrollment before activating.');
      return;
    }
    await approveUserAccount(viewEnroll.id, vaRole, vaUsername.trim(), vaPassword.trim(), userName || 'Admin', vaBranch);
    Alert.alert('Account Activated', `${viewEnroll.empName} can now log in as @${vaUsername.trim()}.`);
    setViewEnroll(null);
  }

  function handleRejectFromReview(acc: UserAccount) {
    Alert.alert('Reject Enrollment', `Reject ${acc.empName}'s enrollment?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => {
        rejectUserAccount(acc.id);
        setViewEnroll(null);
      }},
    ]);
  }

  /* ─── create helpers (admin only) ─── */
  function openCreate() {
    setCEmpName(''); setCUsername(''); setCPassword('');
    setCRole('att'); setCBranch(defaultBranchId); setCPhone(''); setShowCreatePw(false);
    setShowCreate(true);
  }

  async function handleCreate() {
    if (!cEmpName.trim()) { Alert.alert('Required', 'Full name is required.'); return; }
    if (!cUsername.trim()) { Alert.alert('Required', 'Username is required.'); return; }
    if (!cPassword.trim() || cPassword.trim().length < 6) {
      Alert.alert('Required', 'Password must be at least 6 characters.'); return;
    }
    if (!cBranch) { Alert.alert('Required', 'Assign this user to a branch.'); return; }
    const dup = userAccounts.find(a => a.username === cUsername.trim());
    if (dup) { Alert.alert('Username Taken', 'That username is already in use.'); return; }
    await addActiveUserAccount({
      empName: cEmpName.trim(), username: cUsername.trim(), password: cPassword.trim(),
      role: cRole, branchId: cBranch, phoneNumber: cPhone.trim() || undefined,
      createdBy: userName || 'Admin',
    });
    Alert.alert('Account Created', `${cEmpName.trim()} can now log in as @${cUsername.trim()}.`);
    setShowCreate(false);
  }

  const initials = (name: string) =>
    name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const phoneOk = (v: string) => /^(0[789]\d{9}|(\+?234)[789]\d{9})$/.test(v.replace(/\s/g, ''));
  const tabs: { id: Tab; label: string; count: number }[] = canManageUsers
    ? [
        { id: 'pending', label: 'Pending Approval', count: pendingForRole.length },
        { id: 'active', label: 'All Registered Users', count: userAccounts.length },
        { id: 'staff', label: 'All Staff', count: staff.length },
      ]
    : [
        { id: 'pending', label: 'Pending Approval', count: pendingForRole.length },
        { id: 'active', label: 'Active Users', count: active.length },
      ];

  return (
    <ScreenLayout title="User Accounts">
      {/* Tab bar */}
      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {tabs.map(({ id, label, count: cnt }) => (
          <TouchableOpacity
            key={id}
            onPress={() => setTab(id)}
            style={[styles.tab, tab === id && { borderBottomColor: roleColor, borderBottomWidth: 2.5 }]}
          >
            <Text style={[styles.tabLabel, { color: tab === id ? roleColor : colors.textMuted, fontWeight: tab === id ? '700' : '400' }]}>
              {label}
            </Text>
            <View style={[styles.tabBadge, { backgroundColor: id === 'pending' ? (cnt > 0 ? '#71805B' : colors.border) : roleColor + '22' }]}>
              <Text style={[styles.tabBadgeText, { color: id === 'pending' && cnt > 0 ? '#fff' : (id === 'pending' ? colors.textMuted : roleColor) }]}>{cnt}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search + action buttons */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search by name or username…"
            placeholderTextColor={colors.textSubtle}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        {canManageUsers && tab === 'active' && (
          <TouchableOpacity
            onPress={openCreate}
            style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: roleColor, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="person-add" size={18} color="#fff" />
          </TouchableOpacity>
        )}
        {isHR && tab === 'pending' && (
          <TouchableOpacity
            onPress={openEnroll}
            style={{ height: 42, paddingHorizontal: 14, borderRadius: 12, backgroundColor: roleColor, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
          >
            <Ionicons name="person-add" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Enroll</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── PENDING TAB ── */}
        {tab === 'pending' && (
          <>
            {pendingForRole.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="checkmark-circle" size={36} color={colors.success} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>All clear</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                  {isHR ? 'No pending enrollments — tap Enroll to submit a new staff member' : 'No pending account requests'}
                </Text>
              </View>
            ) : (
              <>
                {canManageUsers && pendingForRole.length > 0 && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`View ${pendingForRole.length} enrollment${pendingForRole.length > 1 ? 's' : ''} awaiting review or activation`}
                    activeOpacity={0.75}
                    onPress={() => setSearch('')}
                    style={[styles.infoBanner, { backgroundColor: colors.warning + '18', borderColor: colors.warning }]}
                  >
                    <Ionicons name="information-circle" size={16} color={colors.warning} />
                    <Text style={[styles.infoBannerText, { color: colors.warning }]}>
                      {pendingForRole.length} enrollment{pendingForRole.length > 1 ? 's' : ''} awaiting review or activation.
                    </Text>
                  </TouchableOpacity>
                )}
                {isMD && pendingMdRecs.length > 0 && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`View ${pendingMdRecs.length} enrollment${pendingMdRecs.length > 1 ? 's' : ''} awaiting your review`}
                    activeOpacity={0.75}
                    onPress={() => setSearch('')}
                    style={[styles.infoBanner, { backgroundColor: colors.purple + '18', borderColor: colors.purple }]}
                  >
                    <Ionicons name="information-circle" size={16} color={colors.purple} />
                    <Text style={[styles.infoBannerText, { color: colors.purple }]}>
                      {pendingMdRecs.length} enrollment{pendingMdRecs.length > 1 ? 's' : ''} awaiting your review — tap to see full details.
                    </Text>
                  </TouchableOpacity>
                )}
                {isHR && pendingMdRecs.length > 0 && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`View ${pendingMdRecs.length} enrollment${pendingMdRecs.length > 1 ? 's' : ''} submitted, awaiting MD review`}
                    activeOpacity={0.75}
                    onPress={() => setSearch('')}
                    style={[styles.infoBanner, { backgroundColor: colors.info + '18', borderColor: colors.info }]}
                  >
                    <Ionicons name="information-circle" size={16} color={colors.info} />
                    <Text style={[styles.infoBannerText, { color: colors.info }]}>
                      {pendingMdRecs.length} enrollment{pendingMdRecs.length > 1 ? 's' : ''} submitted — awaiting MD review.
                    </Text>
                  </TouchableOpacity>
                )}

                {filtered.map(acc => {
                  const stCol = STATUS_COLORS[acc.status] || colors.warning;
                  return (
                    <TouchableOpacity
                      key={acc.id}
                      onPress={() => openViewEnroll(acc)}
                      activeOpacity={0.8}
                      style={[styles.accCard, { backgroundColor: colors.surface, borderColor: stCol + '44' }]}
                    >
                      <View style={[styles.avatar, { backgroundColor: stCol + '18' }]}>
                        <Text style={[styles.avatarText, { color: stCol }]}>{initials(acc.empName)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.accName, { color: colors.text }]}>{acc.empName}</Text>
                        {acc.jobTitle
                          ? <Text style={[styles.accSub, { color: colors.textMuted }]}>{acc.jobTitle}{acc.dept ? ` · ${acc.dept}` : ''}</Text>
                          : <Text style={[styles.accSub, { color: colors.textMuted }]}>No title assigned</Text>
                        }
                        {acc.empId && <Text style={[styles.accId, { color: colors.textSubtle }]}>{acc.empId}</Text>}
                        <Text style={[styles.accDate, { color: colors.textSubtle }]}>
                          Enrolled by {acc.createdBy} · {acc.createdAt.slice(0, 10)}
                        </Text>
                        <View style={[styles.stBadge, { backgroundColor: stCol + '18', marginTop: 4, alignSelf: 'flex-start' }]}>
                          <Text style={[styles.stText, { color: stCol }]}>
                            {STATUS_LABELS[acc.status] ?? acc.status}
                          </Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'center', gap: 4 }}>
                        <View style={[styles.viewBtn, { borderColor: stCol + '55', backgroundColor: stCol + '0e' }]}>
                          <Ionicons name="eye-outline" size={13} color={stCol} />
                          <Text style={[styles.viewBtnText, { color: stCol }]}>Review</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* ── ACTIVE TAB ── */}
        {tab === 'active' && (
          <>
            <View style={styles.statsRow}>
              {[
                { label: 'Active',    val: registeredUsers.filter(a => a.status === 'active').length,    color: '#174D36' },
                { label: 'Suspended', val: registeredUsers.filter(a => a.status === 'suspended').length, color: colors.error },
                { label: 'Inactive',  val: registeredUsers.filter(a => a.status === 'inactive').length,  color: colors.textMuted },
                { label: 'Rejected',  val: registeredUsers.filter(a => a.status === 'rejected').length,  color: '#888' },
                { label: 'Total',     val: registeredUsers.length,                                         color: colors.text },
              ].map(s => (
                <View key={s.label} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.statNum, { color: s.color }]}>{s.val}</Text>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            {!canManageUsers && (
              <View style={[styles.infoBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.infoBannerText, { color: colors.textMuted }]}>
                  View only — only Admin or HR can manage accounts
                </Text>
              </View>
            )}

            {filtered.length === 0 && (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="people-outline" size={36} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No registered users yet</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>Admin can create accounts directly using the + button</Text>
              </View>
            )}

            {filtered.map(acc => {
              const rc = ROLE_COLORS[acc.role || 'att'] || roleColor;
              const isSuspended = acc.status === 'suspended';
              const canToggleStatus = acc.status === 'active' || acc.status === 'suspended';
              return (
                <TouchableOpacity
                  key={acc.id}
                  onPress={() => canManageUsers ? openEdit(acc) : setViewAcc(acc)}
                  activeOpacity={0.8}
                  style={[styles.accCard, { backgroundColor: colors.surface, borderColor: isSuspended ? colors.errorBorder : colors.border }]}
                >
                  <View style={[styles.avatar, { backgroundColor: isSuspended ? colors.textSubtle + '33' : rc + '22' }]}>
                    <Text style={[styles.avatarText, { color: isSuspended ? colors.textSubtle : rc }]}>{initials(acc.empName)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.accName, { color: colors.text }]}>{acc.empName}</Text>
                    <Text style={[styles.accSub, { color: colors.textMuted }]}>
                      {ROLE_LABELS[acc.role || ''] ?? acc.role ?? 'Unknown role'}
                      {acc.branchId ? ` · ${acc.branchName ?? branches.find(branch => branch.id === acc.branchId)?.name ?? acc.branchId} (${acc.branchId})` : ' · Branch not assigned'}
                    </Text>
                    <Text style={[styles.accId, { color: colors.textSubtle }]}>@{acc.username}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[styles.stBadge, { backgroundColor: (STATUS_COLORS[acc.status] || '#888') + '22' }]}>
                      <Text style={[styles.stText, { color: STATUS_COLORS[acc.status] || '#888' }]}>
                        {STATUS_LABELS[acc.status] ?? acc.status}
                      </Text>
                    </View>
                    {canManageUsers && (
                      <View style={{ flexDirection: 'row', gap: 5 }}>
                        {canToggleStatus && <TouchableOpacity
                          onPress={e => { e.stopPropagation(); handleSuspend(acc); }}
                          style={[styles.iconBtn, { borderColor: colors.border }]}
                        >
                          <Ionicons name={isSuspended ? 'play' : 'pause'} size={12} color={colors.textMuted} />
                        </TouchableOpacity>}
                        <TouchableOpacity
                          onPress={e => { e.stopPropagation(); handleDelete(acc); }}
                          style={[styles.iconBtn, { borderColor: colors.errorBorder, backgroundColor: colors.errorBg }]}
                        >
                          <Ionicons name="trash-outline" size={12} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* ── ALL STAFF TAB ── */}
        {tab === 'staff' && canManageUsers && (
          <>
            <View style={styles.statsRow}>
              {[
                { label: 'Active', val: staff.filter(member => member.st === 'Active').length, color: '#174D36' },
                { label: 'Suspended', val: staff.filter(member => member.st === 'Suspended').length, color: colors.error },
                { label: 'Total', val: staff.length, color: colors.text },
              ].map(stat => (
                <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.statNum, { color: stat.color }]}>{stat.val}</Text>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>{stat.label}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.infoBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="people-outline" size={16} color={roleColor} />
              <Text style={[styles.infoBannerText, { color: colors.textMuted, flex: 1 }]}>
                All staff directory records are shown here. Admin and HR can remove staff and their linked login accounts.
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Reconcile users and staff"
              onPress={handleReconcileStaff}
              style={[styles.confirmBtn, { backgroundColor: roleColor, marginBottom: 12 }]}
            >
              <Ionicons name="sync" size={16} color="#fff" />
              <Text style={styles.confirmBtnText}>Sync Users to Staff Directory</Text>
            </TouchableOpacity>

            {filteredStaff.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="people-outline" size={36} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No staff records found</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>Try a different search term.</Text>
              </View>
            ) : filteredStaff.map(member => {
              const stCol = member.st === 'Active' ? '#174D36' : colors.error;
              const branchName = member.branchName ?? branches.find(branch => branch.id === member.branchId)?.name ?? 'Branch not assigned';
              return (
                <View key={member.id} style={[styles.accCard, { backgroundColor: colors.surface, borderColor: member.st === 'Active' ? colors.border : colors.errorBorder }]}>
                  <View style={[styles.avatar, { backgroundColor: stCol + '18' }]}>
                    <Text style={[styles.avatarText, { color: stCol }]}>{initials(member.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.accName, { color: colors.text }]}>{member.name}</Text>
                    <Text style={[styles.accSub, { color: colors.textMuted }]}>
                       {ROLE_LABELS[member.role] ?? member.role} · {branchName}{member.branchId ? ` (${member.branchId})` : ''}
                    </Text>
                    <Text style={[styles.accId, { color: colors.textSubtle }]}>
                      {member.email || 'No login email'}{member.dept ? ` · ${member.dept}` : ''}
                    </Text>
                    <View style={[styles.stBadge, { backgroundColor: stCol + '22', alignSelf: 'flex-start', marginTop: 5 }]}>
                      <Text style={[styles.stText, { color: stCol }]}>{member.st}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => Alert.alert('Delete Staff', `Permanently remove ${member.name} from staff and remove the linked login account if present? This cannot be undone.`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: async () => {
                        const removed = await deleteStaff(member.id);
                        Alert.alert(
                          removed ? 'Staff Removed' : 'Delete Failed',
                          removed ? `${member.name} was removed from staff and user records.` : 'The staff record could not be removed. Check your connection and try again.',
                        );
                      }},
                    ])}
                    style={[styles.iconBtn, { borderColor: colors.errorBorder, backgroundColor: colors.errorBg }]}
                    accessibilityLabel={`Delete ${member.name}`}
                  >
                    <Ionicons name="trash-outline" size={14} color={colors.error} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── ENROLLMENT REVIEW MODAL (MD + Admin) ── */}
      <ModalSheet visible={!!viewEnroll} onClose={() => { setViewEnroll(null); setEditingEnroll(false); }}>
        {viewEnroll && (
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={[styles.avatar, { width: 46, height: 46, borderRadius: 23, backgroundColor: (STATUS_COLORS[viewEnroll.status] || '#71805B') + '18' }]}>
                <Text style={[styles.avatarText, { color: STATUS_COLORS[viewEnroll.status] || '#71805B', fontSize: 16 }]}>{initials(viewEnroll.empName)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{viewEnroll.empName}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  {viewEnroll.empId && (
                    <Text style={[styles.modalSub, { color: colors.textSubtle }]}>{viewEnroll.empId}</Text>
                  )}
                  <View style={[styles.stBadge, { backgroundColor: (STATUS_COLORS[viewEnroll.status] || '#71805B') + '18' }]}>
                    <Text style={[styles.stText, { color: STATUS_COLORS[viewEnroll.status] || '#71805B' }]}>
                      {STATUS_LABELS[viewEnroll.status] ?? viewEnroll.status}
                    </Text>
                  </View>
                </View>
              </View>
              {canManageUsers && !editingEnroll && (
                <TouchableOpacity
                  onPress={() => setEditingEnroll(true)}
                  style={[styles.editToggleBtn, { borderColor: roleColor, backgroundColor: roleColor + '12' }]}
                >
                  <Ionicons name="create-outline" size={14} color={roleColor} />
                  <Text style={[styles.editToggleBtnText, { color: roleColor }]}>Edit</Text>
                </TouchableOpacity>
              )}
              {canManageUsers && editingEnroll && (
                <TouchableOpacity
                  onPress={() => { setEditingEnroll(false); openViewEnroll(viewEnroll); }}
                  style={[styles.editToggleBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.editToggleBtnText, { color: colors.textMuted }]}>Cancel Edit</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => { setViewEnroll(null); setEditingEnroll(false); }} style={{ marginLeft: 4 }}>
                <Ionicons name="close-circle" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollViewCompat showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bottomOffset={24}>

              {/* ── Enrollment meta ── */}
              <View style={[styles.enrollMetaRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.enrollMetaItem}>
                  <Text style={[styles.enrollMetaLabel, { color: colors.textMuted }]}>Enrolled by</Text>
                  <Text style={[styles.enrollMetaValue, { color: colors.text }]}>{viewEnroll.createdBy}</Text>
                </View>
                <View style={[styles.enrollMetaDivider, { backgroundColor: colors.border }]} />
                <View style={styles.enrollMetaItem}>
                  <Text style={[styles.enrollMetaLabel, { color: colors.textMuted }]}>Date</Text>
                  <Text style={[styles.enrollMetaValue, { color: colors.text }]}>{viewEnroll.createdAt.slice(0, 10)}</Text>
                </View>
                {viewEnroll.mdApprovedBy && (
                  <>
                    <View style={[styles.enrollMetaDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.enrollMetaItem}>
                      <Text style={[styles.enrollMetaLabel, { color: colors.textMuted }]}>MD Approved</Text>
                      <Text style={[styles.enrollMetaValue, { color: '#315F49' }]}>{viewEnroll.mdApprovedBy}</Text>
                    </View>
                  </>
                )}
              </View>

              {/* ── Personal & Job Info ── */}
              <View style={[styles.reviewSection, { borderColor: colors.border }]}>
                <View style={styles.reviewSectionHeader}>
                  <Ionicons name="briefcase-outline" size={13} color={roleColor} />
                  <Text style={[styles.reviewSectionTitle, { color: roleColor }]}>Employment Details</Text>
                </View>
                {editingEnroll ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Full Name *</Text>
                    <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name="person-outline" size={15} color={colors.textMuted} />
                      <TextInput style={[styles.input, { color: colors.text }]} value={veEmpName} onChangeText={setVeEmpName} placeholder="Full name" placeholderTextColor={colors.textSubtle} />
                    </View>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Job Title</Text>
                    <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name="briefcase-outline" size={15} color={colors.textMuted} />
                      <TextInput style={[styles.input, { color: colors.text }]} value={veJobTitle} onChangeText={setVeJobTitle} placeholder="e.g. Pump Attendant" placeholderTextColor={colors.textSubtle} />
                    </View>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Department</Text>
                    <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name="business-outline" size={15} color={colors.textMuted} />
                      <TextInput style={[styles.input, { color: colors.text }]} value={veDept} onChangeText={setVeDept} placeholder="e.g. Operations" placeholderTextColor={colors.textSubtle} />
                    </View>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Phone Number</Text>
                    <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: vePhone.trim() && !phoneOk(vePhone) ? colors.error : colors.border }]}>
                      <Ionicons name="call-outline" size={15} color={colors.textMuted} />
                      <TextInput style={[styles.input, { color: colors.text }]} value={vePhone} onChangeText={setVePhone} placeholder="e.g. 08012345678" placeholderTextColor={colors.textSubtle} keyboardType="phone-pad" />
                      {vePhone.trim().length > 0 && <Ionicons name={phoneOk(vePhone) ? 'checkmark-circle' : 'close-circle'} size={15} color={phoneOk(vePhone) ? colors.success : colors.error} />}
                    </View>
                  </>
                ) : (
                  <>
                    {[
                      { label: 'Full Name',    value: viewEnroll.empName },
                      { label: 'Job Title',    value: viewEnroll.jobTitle || '—' },
                      { label: 'Department',   value: viewEnroll.dept || '—' },
                      { label: 'Phone',        value: viewEnroll.phoneNumber || '—' },
                      { label: 'Branch Pref.', value: viewEnroll.branchId || '—' },
                    ].map((row, i) => (
                      <View key={row.label} style={[styles.detailRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{row.label}</Text>
                        <Text style={[styles.detailValue, { color: colors.text }]}>{row.value}</Text>
                      </View>
                    ))}
                  </>
                )}
              </View>

              {/* ── Identity ── */}
              <View style={[styles.reviewSection, { borderColor: colors.border }]}>
                <View style={styles.reviewSectionHeader}>
                  <Ionicons name="card-outline" size={13} color='#315F49' />
                  <Text style={[styles.reviewSectionTitle, { color: '#315F49' }]}>Identity & Address</Text>
                </View>
                {editingEnroll ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>NIN (11 digits)</Text>
                    <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: veNin.trim() && !/^\d{11}$/.test(veNin.trim()) ? colors.error : colors.border }]}>
                      <Ionicons name="finger-print-outline" size={15} color={colors.textMuted} />
                      <TextInput style={[styles.input, { color: colors.text }]} value={veNin} onChangeText={setVeNin} placeholder="11-digit NIN" placeholderTextColor={colors.textSubtle} keyboardType="number-pad" maxLength={11} />
                      {veNin.trim().length > 0 && <Ionicons name={/^\d{11}$/.test(veNin.trim()) ? 'checkmark-circle' : 'close-circle'} size={15} color={/^\d{11}$/.test(veNin.trim()) ? colors.success : colors.error} />}
                    </View>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Residential Address</Text>
                    <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border, minHeight: 70, alignItems: 'flex-start', paddingTop: 10 }]}>
                      <Ionicons name="home-outline" size={15} color={colors.textMuted} style={{ marginTop: 2 }} />
                      <TextInput style={[styles.input, { color: colors.text, height: 56, textAlignVertical: 'top' }]} value={veStaffAddr} onChangeText={setVeStaffAddr} placeholder="Full address" placeholderTextColor={colors.textSubtle} multiline numberOfLines={3} />
                    </View>
                  </>
                ) : (
                  <>
                    {[
                      { label: 'NIN',     value: viewEnroll.nin || '—', sensitive: true },
                      { label: 'Address', value: viewEnroll.staffAddress || '—', sensitive: false },
                    ].map((row, i) => (
                      <View key={row.label} style={[styles.detailRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{row.label}</Text>
                        <Text style={[styles.detailValue, { color: colors.text, flex: 1, textAlign: 'right' }]} numberOfLines={3}>{row.value}</Text>
                      </View>
                    ))}
                  </>
                )}
              </View>

              {/* ── Guarantor ── */}
              <View style={[styles.reviewSection, { borderColor: colors.border }]}>
                <View style={styles.reviewSectionHeader}>
                  <Ionicons name="people-outline" size={13} color='#71805B' />
                  <Text style={[styles.reviewSectionTitle, { color: '#71805B' }]}>Guarantor Details</Text>
                </View>
                {editingEnroll ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Guarantor Name</Text>
                    <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name="person-outline" size={15} color={colors.textMuted} />
                      <TextInput style={[styles.input, { color: colors.text }]} value={veGuarantorName} onChangeText={setVeGuarantorName} placeholder="Full name" placeholderTextColor={colors.textSubtle} />
                    </View>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Guarantor Phone</Text>
                    <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: veGuarantorPhone.trim() && !phoneOk(veGuarantorPhone) ? colors.error : colors.border }]}>
                      <Ionicons name="call-outline" size={15} color={colors.textMuted} />
                      <TextInput style={[styles.input, { color: colors.text }]} value={veGuarantorPhone} onChangeText={setVeGuarantorPhone} placeholder="e.g. 08012345678" placeholderTextColor={colors.textSubtle} keyboardType="phone-pad" />
                      {veGuarantorPhone.trim().length > 0 && <Ionicons name={phoneOk(veGuarantorPhone) ? 'checkmark-circle' : 'close-circle'} size={15} color={phoneOk(veGuarantorPhone) ? colors.success : colors.error} />}
                    </View>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Guarantor Address</Text>
                    <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border, minHeight: 70, alignItems: 'flex-start', paddingTop: 10 }]}>
                      <Ionicons name="home-outline" size={15} color={colors.textMuted} style={{ marginTop: 2 }} />
                      <TextInput style={[styles.input, { color: colors.text, height: 56, textAlignVertical: 'top' }]} value={veGuarantorAddr} onChangeText={setVeGuarantorAddr} placeholder="Full address" placeholderTextColor={colors.textSubtle} multiline numberOfLines={3} />
                    </View>
                  </>
                ) : (
                  <>
                    {[
                      { label: 'Name',    value: viewEnroll.guarantorName    || '—' },
                      { label: 'Phone',   value: viewEnroll.guarantorPhone   || '—' },
                      { label: 'Address', value: viewEnroll.guarantorAddress || '—' },
                    ].map((row, i) => (
                      <View key={row.label} style={[styles.detailRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{row.label}</Text>
                        <Text style={[styles.detailValue, { color: colors.text, flex: 1, textAlign: 'right' }]} numberOfLines={2}>{row.value}</Text>
                      </View>
                    ))}
                  </>
                )}
              </View>

              {/* ── Employment Docs ── */}
              {(viewEnroll.employmentDocs ?? []).length > 0 && (
                <View style={[styles.reviewSection, { borderColor: colors.border }]}>
                  <View style={styles.reviewSectionHeader}>
                    <Ionicons name="document-text-outline" size={13} color='#286247' />
                    <Text style={[styles.reviewSectionTitle, { color: '#286247' }]}>Documents Received</Text>
                  </View>
                  {(viewEnroll.employmentDocs ?? []).map(doc => (
                    <View key={doc} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 }}>
                      <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                      <Text style={{ color: colors.text, fontSize: 13 }}>{doc}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* ── Save edit button ── */}
              {editingEnroll && canManageUsers && (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <TouchableOpacity onPress={handleSaveEnrollEdit} style={[styles.confirmBtn, { backgroundColor: roleColor, flex: 1 }]} activeOpacity={0.85}>
                    <Ionicons name="save-outline" size={16} color="#fff" />
                    <Text style={styles.confirmBtnText}>Save Changes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEditingEnroll(false); openViewEnroll(viewEnroll); }} style={[styles.cancelBtn, { borderColor: colors.border, flex: 0.5 }]} activeOpacity={0.8}>
                    <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Discard</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ── ACTIVATION PANEL (Admin only) ── */}
              {canManageUsers && !editingEnroll && (
                <View style={[styles.activationPanel, { backgroundColor: colors.surface, borderColor: '#174D3644' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <Ionicons name="person-add" size={16} color='#174D36' />
                    <Text style={[styles.reviewSectionTitle, { color: '#174D36', fontSize: 13 }]}>Activate Account</Text>
                  </View>

                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Assign Role *</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {ROLE_OPTS.map(r => {
                      const rc = ROLE_COLORS[r] || roleColor;
                      return (
                        <TouchableOpacity
                          key={r}
                          onPress={() => setVaRole(r)}
                          style={[styles.roleChip, { backgroundColor: vaRole === r ? rc : colors.background, borderColor: vaRole === r ? rc : colors.border }]}
                        >
                          <Text style={[styles.roleChipText, { color: vaRole === r ? '#fff' : colors.textMuted }]}>
                            {ROLE_LABELS[r] ?? r}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                   <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Assign Location</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                     {branches.map(b => (
                          <TouchableOpacity
                            key={b.id}
                            onPress={() => setVaBranch(b.id)}
                            style={[styles.roleChip, { backgroundColor: vaBranch === b.id ? (ROLE_COLORS[vaRole] || roleColor) : colors.background, borderColor: vaBranch === b.id ? (ROLE_COLORS[vaRole] || roleColor) : colors.border }]}
                          >
                            <Text style={[styles.roleChipText, { color: vaBranch === b.id ? '#fff' : colors.textMuted }]}>{b.name}</Text>
                          </TouchableOpacity>
                         ))}
                  </View>

                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Username *</Text>
                  <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Ionicons name="at" size={15} color={colors.textMuted} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={vaUsername}
                      onChangeText={setVaUsername}
                      placeholder="e.g. ngozi.eze"
                      placeholderTextColor={colors.textSubtle}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>

                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Temporary Password *</Text>
                  <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Ionicons name="lock-closed-outline" size={15} color={colors.textMuted} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={vaPassword}
                      onChangeText={setVaPassword}
                      placeholder="e.g. Welcome@2024"
                      placeholderTextColor={colors.textSubtle}
                      secureTextEntry={!showVaPw}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity onPress={() => setShowVaPw(v => !v)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Ionicons name={showVaPw ? 'eye-off-outline' : 'eye-outline'} size={15} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <TouchableOpacity onPress={handleActivateFromReview} style={[styles.confirmBtn, { backgroundColor: '#174D36', flex: 1 }]} activeOpacity={0.85}>
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                      <Text style={styles.confirmBtnText}>Activate Account</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleRejectFromReview(viewEnroll)} style={[styles.cancelBtn, { borderColor: colors.errorBorder, flex: 0.5 }]} activeOpacity={0.8}>
                      <Text style={[styles.cancelBtnText, { color: colors.error }]}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* ── MD action buttons ── */}
              {isMD && viewEnroll.status === 'pending_md' && !editingEnroll && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 4 }}>
                  <TouchableOpacity onPress={() => handleMdApprove(viewEnroll)} style={[styles.confirmBtn, { backgroundColor: '#315F49', flex: 1 }]} activeOpacity={0.85}>
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <Text style={styles.confirmBtnText}>Approve → Admin</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleMdReject(viewEnroll)} style={[styles.cancelBtn, { borderColor: colors.errorBorder, flex: 0.5 }]} activeOpacity={0.8}>
                    <Text style={[styles.cancelBtnText, { color: colors.error }]}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}

              {canManageUsers && !editingEnroll && (
                <TouchableOpacity
                  onPress={() => handleDelete(viewEnroll)}
                  style={[styles.deleteBtn, { borderColor: colors.errorBorder, backgroundColor: colors.errorBg, marginTop: 4 }]}
                  activeOpacity={0.85}
                >
                  <Ionicons name="trash-outline" size={15} color={colors.error} />
                  <Text style={[styles.deleteBtnText, { color: colors.error }]}>Delete Enrollment</Text>
                </TouchableOpacity>
              )}

              <View style={{ height: 16 }} />
            </KeyboardAwareScrollViewCompat>
          </View>
        )}
      </ModalSheet>

      {/* ── APPROVE MODAL (legacy — kept for edge cases) ── */}
      <ModalSheet visible={!!approving} onClose={() => setApproving(null)}>
        <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <View style={[styles.modalIconBox, { backgroundColor: '#174D3622' }]}>
              <Ionicons name="person-add" size={20} color="#174D36" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Approve Account</Text>
              <Text style={[styles.modalSub, { color: colors.textMuted }]}>{approving?.empName}</Text>
            </View>
            <TouchableOpacity onPress={() => setApproving(null)}>
              <Ionicons name="close-circle" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <KeyboardAwareScrollViewCompat showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bottomOffset={24}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Assign Role *</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {ROLE_OPTS.map(r => {
                const rc = ROLE_COLORS[r] || roleColor;
                return (
                  <TouchableOpacity key={r} onPress={() => setARole(r)}
                    style={[styles.roleChip, { backgroundColor: aRole === r ? rc : colors.surface, borderColor: aRole === r ? rc : colors.border }]}
                  >
                    <Text style={[styles.roleChipText, { color: aRole === r ? '#fff' : colors.textMuted }]}>{ROLE_LABELS[r] ?? r}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
             <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Assign Location</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {branches.map(b => (
                <TouchableOpacity key={b.id} onPress={() => setABranch(b.id)}
                  style={[styles.roleChip, { backgroundColor: aBranch === b.id ? (ROLE_COLORS[aRole] || roleColor) : colors.surface, borderColor: aBranch === b.id ? (ROLE_COLORS[aRole] || roleColor) : colors.border }]}
                >
                  <Text style={[styles.roleChipText, { color: aBranch === b.id ? '#fff' : colors.textMuted }]}>{b.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Username *</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="at" size={16} color={colors.textMuted} />
              <TextInput style={[styles.input, { color: colors.text }]} value={aUsername} onChangeText={setAUsername} placeholder="e.g. ngozi.eze" placeholderTextColor={colors.textSubtle} autoCapitalize="none" autoCorrect={false} />
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Temporary Password *</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
              <TextInput style={[styles.input, { color: colors.text }]} value={aPassword} onChangeText={setAPassword} placeholder="e.g. Welcome@2024" placeholderTextColor={colors.textSubtle} secureTextEntry={!showApprovePw} autoCapitalize="none" />
              <TouchableOpacity onPress={() => setShowApprovePw(v => !v)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name={showApprovePw ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity onPress={handleApprove} style={[styles.confirmBtn, { backgroundColor: '#174D36', flex: 1, opacity: isApproving ? 0.6 : 1 }]} activeOpacity={0.85} disabled={isApproving}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.confirmBtnText}>{isApproving ? 'Approving\u2026' : 'Approve & Create'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setApproving(null)} style={[styles.cancelBtn, { borderColor: colors.border, flex: 0.55 }]} activeOpacity={0.8} disabled={isApproving}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </ModalSheet>

      {/* ── EDIT ACCOUNT MODAL (admin only) ── */}
      <ModalSheet visible={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.avatar, { width: 46, height: 46, borderRadius: 23, backgroundColor: roleColor + '22' }]}>
                <Text style={[styles.avatarText, { color: roleColor, fontSize: 16 }]}>{initials(editing.empName)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{editing.empName}</Text>
                <Text style={[styles.modalSub, { color: colors.textMuted }]}>Edit credentials &amp; role</Text>
              </View>
              <TouchableOpacity onPress={() => setEditing(null)}>
                <Ionicons name="close-circle" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <KeyboardAwareScrollViewCompat showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bottomOffset={24}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Role</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {ROLE_OPTS.map(r => {
                  const rc = ROLE_COLORS[r] || roleColor;
                  return (
                    <TouchableOpacity key={r} onPress={() => setERole(r)}
                      style={[styles.roleChip, { backgroundColor: eRole === r ? rc : colors.surface, borderColor: eRole === r ? rc : colors.border }]}
                    >
                      <Text style={[styles.roleChipText, { color: eRole === r ? '#fff' : colors.textMuted }]}>{ROLE_LABELS[r] ?? r}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
               <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Assign Location</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {branches.map(b => (
                  <TouchableOpacity key={b.id} onPress={() => setEBranch(b.id)}
                    style={[styles.roleChip, { backgroundColor: eBranch === b.id ? (ROLE_COLORS[eRole] || roleColor) : colors.surface, borderColor: eBranch === b.id ? (ROLE_COLORS[eRole] || roleColor) : colors.border }]}
                  >
                    <Text style={[styles.roleChipText, { color: eBranch === b.id ? '#fff' : colors.textMuted }]}>{b.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Username</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="at" size={16} color={colors.textMuted} />
                <TextInput style={[styles.input, { color: colors.text }]} value={eUsername} onChangeText={v => setEUsername(v.toLowerCase().replace(/\s/g, '.'))} placeholder="username" placeholderTextColor={colors.textSubtle} autoCapitalize="none" autoCorrect={false} />
              </View>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>New Password <Text style={{ fontWeight: '400' }}>(leave blank to keep current)</Text></Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                <TextInput style={[styles.input, { color: colors.text }]} value={ePassword} onChangeText={setEPassword} placeholder="New password (min 6 chars)" placeholderTextColor={colors.textSubtle} secureTextEntry={!showEditPw} autoCapitalize="none" />
                <TouchableOpacity onPress={() => setShowEditPw(v => !v)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name={showEditPw ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Phone Number <Text style={{ fontWeight: '400' }}>(for Comms)</Text></Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="call-outline" size={16} color={colors.textMuted} />
                <TextInput style={[styles.input, { color: colors.text }]} value={ePhone} onChangeText={setEPhone} placeholder="e.g. 08012345678" placeholderTextColor={colors.textSubtle} keyboardType="phone-pad" />
              </View>
              <View style={[styles.statusRow, { backgroundColor: (STATUS_COLORS[editing.status] || '#888') + '15', borderColor: (STATUS_COLORS[editing.status] || '#888') + '40' }]}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[editing.status] || '#888' }]} />
                <Text style={[styles.statusText, { color: STATUS_COLORS[editing.status] || '#888' }]}>
                  {STATUS_LABELS[editing.status] ?? editing.status}
                </Text>
                <TouchableOpacity onPress={() => handleSuspend(editing)} style={[styles.toggleStatusBtn, { borderColor: (STATUS_COLORS[editing.status] || '#888') + '80' }]}>
                  <Text style={[{ fontSize: 11, fontWeight: '600', color: STATUS_COLORS[editing.status] || '#888' }]}>
                    {editing.status === 'active' ? 'Suspend' : 'Reactivate'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity onPress={handleSaveEdit} style={[styles.confirmBtn, { backgroundColor: roleColor, flex: 1, opacity: isSavingEdit ? 0.6 : 1 }]} activeOpacity={0.85} disabled={isSavingEdit}>
                  <Ionicons name="save-outline" size={16} color="#fff" />
                  <Text style={styles.confirmBtnText}>{isSavingEdit ? 'Saving\u2026' : 'Save Changes'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditing(null)} style={[styles.cancelBtn, { borderColor: colors.border, flex: 0.55 }]} activeOpacity={0.8} disabled={isSavingEdit}>
                  <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => handleDelete(editing)} style={[styles.deleteBtn, { borderColor: colors.errorBorder, backgroundColor: colors.errorBg }]} activeOpacity={0.85}>
                <Ionicons name="trash-outline" size={15} color={colors.error} />
                <Text style={[styles.deleteBtnText, { color: colors.error }]}>Delete Account</Text>
              </TouchableOpacity>
            </KeyboardAwareScrollViewCompat>
          </View>
        )}
      </ModalSheet>

      {/* ── CREATE ACCOUNT MODAL (admin only) ── */}
      <ModalSheet visible={showCreate} onClose={() => setShowCreate(false)}>
        <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <View style={[styles.modalIconBox, { backgroundColor: roleColor + '18' }]}>
              <Ionicons name="person-add" size={20} color={roleColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Create User Account</Text>
              <Text style={[styles.modalSub, { color: colors.textMuted }]}>Directly activate a new login</Text>
            </View>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Ionicons name="close-circle" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled" keyboardDismissMode="none" bottomOffset={24}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Full Name *</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="person-outline" size={16} color={colors.textMuted} />
              <TextInput style={[styles.input, { color: colors.text }]} value={cEmpName} onChangeText={setCEmpName} placeholder="e.g. Amaka Okafor" placeholderTextColor={colors.textSubtle} />
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Role *</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {ROLE_OPTS.map(r => {
                const rc = ROLE_COLORS[r] || roleColor;
                return (
                  <TouchableOpacity key={r} onPress={() => setCRole(r)}
                    style={[styles.roleChip, { backgroundColor: cRole === r ? rc : colors.surface, borderColor: cRole === r ? rc : colors.border }]}
                  >
                    <Text style={[styles.roleChipText, { color: cRole === r ? '#fff' : colors.textMuted }]}>{ROLE_LABELS[r] ?? r}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Assign Location</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {branches.length === 0
                ? null
                : branches.map(b => (
                    <TouchableOpacity key={b.id} onPress={() => setCBranch(b.id)}
                      style={[styles.roleChip, { backgroundColor: cBranch === b.id ? (ROLE_COLORS[cRole] || roleColor) : colors.surface, borderColor: cBranch === b.id ? (ROLE_COLORS[cRole] || roleColor) : colors.border }]}
                    >
                      <Text style={[styles.roleChipText, { color: cBranch === b.id ? '#fff' : colors.textMuted }]}>{b.name}</Text>
                    </TouchableOpacity>
                  ))
              }
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Phone Number</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="call-outline" size={16} color={colors.textMuted} />
              <TextInput style={[styles.input, { color: colors.text }]} value={cPhone} onChangeText={setCPhone} placeholder="e.g. 08012345678" placeholderTextColor={colors.textSubtle} keyboardType="phone-pad" />
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Username *</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="at" size={16} color={colors.textMuted} />
              <TextInput style={[styles.input, { color: colors.text }]} value={cUsername} onChangeText={v => setCUsername(v.toLowerCase().replace(/\s/g, '.'))} placeholder="e.g. amaka.okafor" placeholderTextColor={colors.textSubtle} autoCapitalize="none" autoCorrect={false} />
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Password *</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
              <TextInput style={[styles.input, { color: colors.text }]} value={cPassword} onChangeText={setCPassword} placeholder="Min 6 characters" placeholderTextColor={colors.textSubtle} secureTextEntry={!showCreatePw} autoCapitalize="none" />
              <TouchableOpacity onPress={() => setShowCreatePw(v => !v)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name={showCreatePw ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity onPress={handleCreate} style={[styles.confirmBtn, { backgroundColor: roleColor, flex: 1 }]} activeOpacity={0.85}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.confirmBtnText}>Create Account</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowCreate(false)} style={[styles.cancelBtn, { borderColor: colors.border, flex: 0.55 }]} activeOpacity={0.8}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 16 }} />
          </KeyboardAwareScrollViewCompat>
        </View>
      </ModalSheet>

      {/* ── VIEW ACCOUNT MODAL (non-admin) ── */}
      <ModalSheet visible={!!viewAcc} onClose={() => setViewAcc(null)}>
        {viewAcc && (
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.avatar, { width: 46, height: 46, borderRadius: 23, backgroundColor: (ROLE_COLORS[viewAcc.role || 'att'] || roleColor) + '22' }]}>
                <Text style={[styles.avatarText, { color: ROLE_COLORS[viewAcc.role || 'att'] || roleColor, fontSize: 16 }]}>{initials(viewAcc.empName)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{viewAcc.empName}</Text>
                <Text style={[styles.modalSub, { color: colors.textMuted }]}>{ROLE_LABELS[viewAcc.role || ''] ?? viewAcc.role}</Text>
              </View>
              <TouchableOpacity onPress={() => setViewAcc(null)}>
                <Ionicons name="close-circle" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {[
              { label: 'Username',    value: `@${viewAcc.username}` },
              { label: 'Employee ID', value: viewAcc.empId || '—' },
              { label: 'Branch',      value: viewAcc.branchId ?? '—' },
              { label: 'Status',      value: STATUS_LABELS[viewAcc.status] ?? viewAcc.status },
              { label: 'Approved By', value: viewAcc.approvedBy || '—' },
              { label: 'Approved',    value: viewAcc.approvedAt ? viewAcc.approvedAt.slice(0, 10) : '—' },
            ].map((row, i) => (
              <View key={row.label} style={[styles.detailRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{row.label}</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{row.value}</Text>
              </View>
            ))}
          </View>
        )}
      </ModalSheet>

      {/* ── ENROLL STAFF MODAL (HR/CSM only) ── */}
      <ModalSheet visible={showEnroll} onClose={() => setShowEnroll(false)}>
        <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <View style={[styles.modalIconBox, { backgroundColor: roleColor + '18' }]}>
              <Ionicons name="person-add-outline" size={20} color={roleColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Enroll New Staff</Text>
              <Text style={[styles.modalSub, { color: colors.textMuted }]}>Staff ID auto-generated · MD reviews next</Text>
            </View>
            <TouchableOpacity onPress={() => setShowEnroll(false)}>
              <Ionicons name="close-circle" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled" keyboardDismissMode="none" bottomOffset={24}>
            {/* Personal & Job */}
            <View style={[styles.enrollSectionHeader, { borderTopWidth: 0 }]}>
              <Ionicons name="briefcase-outline" size={13} color={roleColor} />
              <Text style={[styles.enrollSectionTitle, { color: roleColor }]}>Employment Details</Text>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Full Name *</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="person-outline" size={16} color={colors.textMuted} />
              <TextInput style={[styles.input, { color: colors.text }]} value={nEmpName} onChangeText={setNEmpName} placeholder="e.g. Kelechi Nwosu" placeholderTextColor={colors.textSubtle} />
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Job Title</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="briefcase-outline" size={16} color={colors.textMuted} />
              <TextInput style={[styles.input, { color: colors.text }]} value={nJobTitle} onChangeText={setNJobTitle} placeholder="e.g. Pump Attendant" placeholderTextColor={colors.textSubtle} />
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Department</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="business-outline" size={16} color={colors.textMuted} />
              <TextInput style={[styles.input, { color: colors.text }]} value={nDept} onChangeText={setNDept} placeholder="e.g. Operations" placeholderTextColor={colors.textSubtle} />
            </View>

             <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Post to Branch</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
               {branches.length === 0
                 ? <Text style={{ color: colors.textMuted, fontSize: 12, fontStyle: 'italic', alignSelf: 'center' }}>No branches available yet.</Text>
                 : branches.map(b => (
                   <TouchableOpacity key={b.id} onPress={() => setNBranch(b.id)}
                     style={[styles.roleChip, { backgroundColor: nBranch === b.id ? roleColor : colors.surface, borderColor: nBranch === b.id ? roleColor : colors.border }]}
                   >
                     <Text style={[styles.roleChipText, { color: nBranch === b.id ? '#fff' : colors.text }]}>{b.name || b.id}</Text>
                   </TouchableOpacity>
                 ))
               }
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Phone Number <Text style={{ color: colors.error, fontWeight: '700' }}>*</Text></Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: nPhone.trim() && !phoneOk(nPhone) ? colors.error : colors.border }]}>
              <Ionicons name="call-outline" size={16} color={colors.textMuted} />
              <TextInput style={[styles.input, { color: colors.text }]} value={nPhone} onChangeText={setNPhone} placeholder="e.g. 08012345678" placeholderTextColor={colors.textSubtle} keyboardType="phone-pad" />
              {nPhone.trim().length > 0 && <Ionicons name={phoneOk(nPhone) ? 'checkmark-circle' : 'close-circle'} size={16} color={phoneOk(nPhone) ? colors.success : colors.error} />}
            </View>

            {/* Identity */}
            <View style={[styles.enrollSectionHeader, { borderTopColor: colors.border }]}>
              <Ionicons name="card-outline" size={13} color='#315F49' />
              <Text style={[styles.enrollSectionTitle, { color: '#315F49' }]}>Identity & Address</Text>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>NIN <Text style={{ color: colors.error, fontWeight: '700' }}>*</Text> <Text style={{ fontWeight: '400' }}>(11-digit National ID)</Text></Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: nNin.trim() && !/^\d{11}$/.test(nNin.trim()) ? colors.error : colors.border }]}>
              <Ionicons name="finger-print-outline" size={16} color={colors.textMuted} />
              <TextInput style={[styles.input, { color: colors.text }]} value={nNin} onChangeText={setNNin} placeholder="e.g. 12345678901" placeholderTextColor={colors.textSubtle} keyboardType="number-pad" maxLength={11} />
              {nNin.trim().length > 0 && <Ionicons name={/^\d{11}$/.test(nNin.trim()) ? 'checkmark-circle' : 'close-circle'} size={16} color={/^\d{11}$/.test(nNin.trim()) ? colors.success : colors.error} />}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Residential Address <Text style={{ color: colors.error, fontWeight: '700' }}>*</Text></Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border, minHeight: 72, alignItems: 'flex-start', paddingTop: 10 }]}>
              <Ionicons name="home-outline" size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
              <TextInput style={[styles.input, { color: colors.text, height: 60, textAlignVertical: 'top' }]} value={nStaffAddress} onChangeText={setNStaffAddress} placeholder="Full residential address" placeholderTextColor={colors.textSubtle} multiline numberOfLines={3} />
            </View>

            {/* Guarantor */}
            <View style={[styles.enrollSectionHeader, { borderTopColor: colors.border }]}>
              <Ionicons name="people-outline" size={13} color='#71805B' />
              <Text style={[styles.enrollSectionTitle, { color: '#71805B' }]}>Guarantor Details</Text>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Guarantor Full Name <Text style={{ color: colors.error, fontWeight: '700' }}>*</Text></Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="person-outline" size={16} color={colors.textMuted} />
              <TextInput style={[styles.input, { color: colors.text }]} value={nGuarantorName} onChangeText={setNGuarantorName} placeholder="e.g. Amaka Okafor" placeholderTextColor={colors.textSubtle} />
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Guarantor Phone <Text style={{ color: colors.error, fontWeight: '700' }}>*</Text></Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: nGuarantorPhone.trim() && !phoneOk(nGuarantorPhone) ? colors.error : colors.border }]}>
              <Ionicons name="call-outline" size={16} color={colors.textMuted} />
              <TextInput style={[styles.input, { color: colors.text }]} value={nGuarantorPhone} onChangeText={setNGuarantorPhone} placeholder="e.g. 08012345678" placeholderTextColor={colors.textSubtle} keyboardType="phone-pad" />
              {nGuarantorPhone.trim().length > 0 && <Ionicons name={phoneOk(nGuarantorPhone) ? 'checkmark-circle' : 'close-circle'} size={16} color={phoneOk(nGuarantorPhone) ? colors.success : colors.error} />}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Guarantor Address <Text style={{ color: colors.error, fontWeight: '700' }}>*</Text></Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border, minHeight: 72, alignItems: 'flex-start', paddingTop: 10 }]}>
              <Ionicons name="home-outline" size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
              <TextInput style={[styles.input, { color: colors.text, height: 60, textAlignVertical: 'top' }]} value={nGuarantorAddress} onChangeText={setNGuarantorAddress} placeholder="Guarantor's full address" placeholderTextColor={colors.textSubtle} multiline numberOfLines={3} />
            </View>

            {/* Documents */}
            <View style={[styles.enrollSectionHeader, { borderTopColor: colors.border }]}>
              <Ionicons name="document-text-outline" size={13} color='#286247' />
              <Text style={[styles.enrollSectionTitle, { color: '#286247' }]}>Employment Documents</Text>
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted, marginBottom: 8 }]}>
              Tick each document physically received from the applicant. All required documents must be confirmed.
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.textMuted, fontWeight: '700', marginBottom: 4 }]}>Required</Text>
            {REQUIRED_DOCS.map(doc => {
              const checked = nDocs.has(doc);
              return (
                <TouchableOpacity key={doc} onPress={() => toggleDoc(doc)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4 }} activeOpacity={0.7}>
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: checked ? colors.success : colors.border, backgroundColor: checked ? colors.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {checked && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                  <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{doc}</Text>
                  {!checked && <Text style={{ color: colors.error, fontSize: 11 }}>required</Text>}
                </TouchableOpacity>
              );
            })}

            <Text style={[styles.fieldLabel, { color: colors.textMuted, fontWeight: '700', marginTop: 8, marginBottom: 4 }]}>Optional</Text>
            {OPTIONAL_DOCS.map(doc => {
              const checked = nDocs.has(doc);
              return (
                <TouchableOpacity key={doc} onPress={() => toggleDoc(doc)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4 }} activeOpacity={0.7}>
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: checked ? roleColor : colors.border, backgroundColor: checked ? roleColor : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {checked && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                  <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{doc}</Text>
                </TouchableOpacity>
              );
            })}

            <View style={{ height: 12 }} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity onPress={handleEnroll} style={[styles.confirmBtn, { backgroundColor: roleColor, flex: 1 }]} activeOpacity={0.85}>
                <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                <Text style={styles.confirmBtnText}>Submit to MD</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowEnroll(false)} style={[styles.cancelBtn, { borderColor: colors.border, flex: 0.55 }]} activeOpacity={0.8}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 16 }} />
          </KeyboardAwareScrollViewCompat>
        </View>
      </ModalSheet>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  tabRow:             { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab:                { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11 },
  tabLabel:           { fontSize: 13 },
  tabBadge:           { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  tabBadgeText:       { fontSize: 11, fontWeight: '700' },
  searchBar:          { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput:        { flex: 1, fontSize: 14 },
  scroll:             { padding: 16 },
  statsRow:           { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard:           { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  statNum:            { fontSize: 22, fontWeight: '700' },
  statLabel:          { fontSize: 11, marginTop: 1 },
  infoBanner:         { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 14 },
  infoBannerText:     { flex: 1, fontSize: 12 },
  emptyCard:          { alignItems: 'center', padding: 36, borderRadius: 16, borderWidth: 1, gap: 8, marginTop: 20 },
  emptyTitle:         { fontSize: 17, fontWeight: '700' },
  emptySub:           { fontSize: 13, textAlign: 'center' },
  accCard:            { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  avatar:             { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText:         { fontSize: 15, fontWeight: '700' },
  accName:            { fontSize: 15, fontWeight: '600' },
  accSub:             { fontSize: 12, marginTop: 1 },
  accId:              { fontSize: 11, marginTop: 1 },
  accDate:            { fontSize: 10, marginTop: 2 },
  stBadge:            { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  stText:             { fontSize: 10, fontWeight: '700' },
  viewBtn:            { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  viewBtnText:        { fontSize: 11, fontWeight: '600' },
  iconBtn:            { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  modalCard:          { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 12, maxHeight: '95%' },
  modalHeader:        { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  modalIconBox:       { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalTitle:         { fontSize: 16, fontWeight: '700' },
  modalSub:           { fontSize: 12, marginTop: 1 },
  fieldLabel:         { fontSize: 11, fontWeight: '600', marginBottom: 6 },
  inputWrap:          { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, marginBottom: 12 },
  input:              { flex: 1, fontSize: 14 },
  roleChip:           { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  roleChipText:       { fontSize: 12, fontWeight: '600' },
  confirmBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  confirmBtnText:     { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn:          { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1 },
  cancelBtnText:      { fontSize: 14, fontWeight: '600' },
  deleteBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, marginTop: 10 },
  deleteBtnText:      { fontSize: 13, fontWeight: '700' },
  statusRow:          { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 4 },
  statusDot:          { width: 8, height: 8, borderRadius: 4 },
  statusText:         { flex: 1, fontSize: 13, fontWeight: '600' },
  toggleStatusBtn:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  detailRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  detailLabel:        { fontSize: 13 },
  detailValue:        { fontSize: 13, fontWeight: '600' },

  /* enrollment review modal styles */
  enrollMetaRow:      { flexDirection: 'row', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  enrollMetaItem:     { flex: 1, alignItems: 'center' },
  enrollMetaLabel:    { fontSize: 10, marginBottom: 2 },
  enrollMetaValue:    { fontSize: 12, fontWeight: '700' },
  enrollMetaDivider:  { width: 1, marginHorizontal: 8 },
  reviewSection:      { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  reviewSectionHeader:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  reviewSectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  editToggleBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  editToggleBtnText:  { fontSize: 12, fontWeight: '600' },
  activationPanel:    { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 10 },

  /* enroll form */
  enrollSectionHeader:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 16, marginTop: 4, marginBottom: 10, borderTopWidth: StyleSheet.hairlineWidth },
  enrollSectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
