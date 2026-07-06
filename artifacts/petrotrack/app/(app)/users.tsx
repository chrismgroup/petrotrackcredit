import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert, Modal, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, ROLE_LABELS, UserAccount, useApp, type Role } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type Tab = 'pending' | 'active';

const ROLE_OPTS: Role[] = ['ceo', 'md', 'mktg', 'csm', 'acc', 'mgr', 'att'];

const STATUS_COLORS: Record<string, string> = {
  active: '#1a6e3c', pending: '#BA7517', suspended: '#c0392b', rejected: '#888',
};

export default function UsersScreen() {
  const {
    role, userName,
    userAccounts, branches,
    approveUserAccount, updateUserAccount,
    suspendUserAccount, reactivateUserAccount,
    rejectUserAccount, deleteUserAccount,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'admin'] || colors.primary;
  const isAdmin = role === 'admin';

  const [tab, setTab]           = useState<Tab>('pending');
  const [search, setSearch]     = useState('');

  /* ── approve modal state ── */
  const [approving, setApproving] = useState<UserAccount | null>(null);
  const [aRole, setARole]       = useState<Role>('att');
  const [aUsername, setAUsername] = useState('');
  const [aPassword, setAPassword] = useState('');
  const [aBranch, setABranch]   = useState('');
  const [showApprovePw, setShowApprovePw] = useState(false);

  /* ── edit modal state ── */
  const [editing, setEditing]     = useState<UserAccount | null>(null);
  const [eUsername, setEUsername] = useState('');
  const [ePassword, setEPassword] = useState('');
  const [eRole, setERole]         = useState<Role>('att');
  const [eBranch, setEBranch]     = useState('');
  const [showEditPw, setShowEditPw] = useState(false);

  /* ── view modal state (non-admin) ── */
  const [viewAcc, setViewAcc] = useState<UserAccount | null>(null);

  const pending  = userAccounts.filter(a => a.status === 'pending');
  const active   = userAccounts.filter(a => ['active', 'suspended'].includes(a.status));
  const filtered = (tab === 'pending' ? pending : active).filter(a =>
    !search || a.empName.toLowerCase().includes(search.toLowerCase()) ||
    a.username.toLowerCase().includes(search.toLowerCase())
  );

  /* ─── approve helpers ─── */
  function openApprove(acc: UserAccount) {
    const suggested = acc.empName.split(' ').map(w => w[0]?.toLowerCase()).join('') +
      (acc.empName.split(' ')[1] || '').toLowerCase().slice(0, 5);
    setARole('att');
    setAUsername(suggested || '');
    setAPassword('');
    setABranch('');
    setShowApprovePw(false);
    setApproving(acc);
  }

  function handleApprove() {
    if (!approving) return;
    if (!aUsername.trim()) { Alert.alert('Required', 'Username is required.'); return; }
    if (!aPassword.trim()) { Alert.alert('Required', 'Set a temporary password.'); return; }
    if (aRole === 'mgr' && !aBranch) { Alert.alert('Required', 'Assign a branch for this Station Manager.'); return; }
    const duplicate = userAccounts.find(a => a.username === aUsername.trim() && a.id !== approving.id);
    if (duplicate) { Alert.alert('Username Taken', 'That username is already in use. Choose another.'); return; }
    approveUserAccount(approving.id, aRole, aUsername.trim(), aPassword.trim(), userName || 'Admin', aBranch || undefined);
    Alert.alert('Account Approved', `${approving.empName} can now log in as ${aUsername.trim()}.`);
    setApproving(null);
  }

  function handleReject(acc: UserAccount) {
    Alert.alert('Reject Account', `Reject ${acc.empName}'s account request?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => rejectUserAccount(acc.id) },
    ]);
  }

  /* ─── edit helpers ─── */
  function openEdit(acc: UserAccount) {
    setEUsername(acc.username);
    setEPassword('');
    setERole((acc.role as Role) || 'att');
    setEBranch(acc.branchId || '');
    setShowEditPw(false);
    setEditing(acc);
  }

  function handleSaveEdit() {
    if (!editing) return;
    if (!eUsername.trim()) { Alert.alert('Required', 'Username cannot be empty.'); return; }
    if (ePassword.trim() && ePassword.trim().length < 6) {
      Alert.alert('Invalid', 'New password must be at least 6 characters.'); return;
    }
    if (eRole === 'mgr' && !eBranch) {
      Alert.alert('Required', 'Please assign a branch for this Station Manager.'); return;
    }
    const duplicate = userAccounts.find(a => a.username === eUsername.trim() && a.id !== editing.id);
    if (duplicate) { Alert.alert('Username Taken', 'That username is already in use. Choose another.'); return; }

    const updates: { username?: string; password?: string; role?: Role; branchId?: string } = {
      username: eUsername.trim(),
      role: eRole,
      branchId: eRole === 'mgr' ? eBranch : undefined,
    };
    if (ePassword.trim()) updates.password = ePassword.trim();

    updateUserAccount(editing.id, updates, userName || 'Admin');
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
    Alert.alert('Delete Account', `Permanently remove ${acc.empName}'s account? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        deleteUserAccount(acc.id);
        setEditing(null);
        setViewAcc(null);
      }},
    ]);
  }

  const initials = (name: string) =>
    name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <ScreenLayout title="User Accounts">
      {/* Tab bar */}
      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {([['pending', 'Pending Approval', pending.length], ['active', 'Active Users', active.length]] as const).map(([id, label, cnt]) => (
          <TouchableOpacity
            key={id}
            onPress={() => setTab(id)}
            style={[styles.tab, tab === id && { borderBottomColor: roleColor, borderBottomWidth: 2.5 }]}
          >
            <Text style={[styles.tabLabel, { color: tab === id ? roleColor : colors.textMuted, fontWeight: tab === id ? '700' : '400' }]}>
              {label}
            </Text>
            <View style={[styles.tabBadge, { backgroundColor: id === 'pending' ? (cnt > 0 ? '#BA7517' : colors.border) : roleColor + '22' }]}>
              <Text style={[styles.tabBadgeText, { color: id === 'pending' && cnt > 0 ? '#fff' : (id === 'pending' ? colors.textMuted : roleColor) }]}>{cnt}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search by name or username…"
            placeholderTextColor={colors.textSubtle}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── PENDING TAB ── */}
        {tab === 'pending' && (
          <>
            {pending.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="checkmark-circle" size={36} color={colors.success} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>All clear</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>No pending account requests</Text>
              </View>
            ) : (
              <>
                {isAdmin && (
                  <View style={[styles.infoBanner, { backgroundColor: '#BA751722', borderColor: '#BA751744' }]}>
                    <Ionicons name="information-circle" size={16} color="#BA7517" />
                    <Text style={[styles.infoBannerText, { color: '#BA7517' }]}>
                      {pending.length} account{pending.length > 1 ? 's' : ''} awaiting your approval. Set a role and credentials for each.
                    </Text>
                  </View>
                )}
                {filtered.map(acc => (
                  <View key={acc.id} style={[styles.accCard, { backgroundColor: colors.surface, borderColor: '#BA751755' }]}>
                    <View style={[styles.avatar, { backgroundColor: '#BA751722' }]}>
                      <Text style={[styles.avatarText, { color: '#BA7517' }]}>{initials(acc.empName)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.accName, { color: colors.text }]}>{acc.empName}</Text>
                      {acc.jobTitle
                        ? <Text style={[styles.accSub, { color: colors.textMuted }]}>{acc.jobTitle}{acc.dept ? ` · ${acc.dept}` : ''}</Text>
                        : <Text style={[styles.accSub, { color: colors.textMuted }]}>No role assigned yet</Text>
                      }
                      {acc.empId && <Text style={[styles.accId, { color: colors.textSubtle }]}>{acc.empId}</Text>}
                      <Text style={[styles.accDate, { color: colors.textSubtle }]}>
                        Requested by {acc.createdBy} · {acc.createdAt.slice(0, 10)}
                      </Text>
                    </View>
                    {isAdmin ? (
                      <View style={{ gap: 6, alignItems: 'flex-end' }}>
                        <TouchableOpacity
                          onPress={() => openApprove(acc)}
                          style={[styles.approveBtn, { backgroundColor: '#1a6e3c' }]}
                        >
                          <Ionicons name="checkmark" size={13} color="#fff" />
                          <Text style={styles.approveBtnText}>Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleReject(acc)}
                          style={[styles.rejectBtn, { borderColor: colors.errorBorder }]}
                        >
                          <Text style={[styles.rejectBtnText, { color: colors.error }]}>Reject</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={[styles.stBadge, { backgroundColor: '#BA751722' }]}>
                        <Text style={[styles.stText, { color: '#BA7517' }]}>Pending</Text>
                      </View>
                    )}
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* ── ACTIVE TAB ── */}
        {tab === 'active' && (
          <>
            <View style={styles.statsRow}>
              {[
                { label: 'Active',    val: active.filter(a => a.status === 'active').length,    color: '#1a6e3c' },
                { label: 'Suspended', val: active.filter(a => a.status === 'suspended').length, color: colors.error },
                { label: 'Total',     val: active.length,                                        color: colors.text },
              ].map(s => (
                <View key={s.label} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.statNum, { color: s.color }]}>{s.val}</Text>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            {!isAdmin && (
              <View style={[styles.infoBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.infoBannerText, { color: colors.textMuted }]}>
                  View only — only System Admin can manage accounts
                </Text>
              </View>
            )}

            {filtered.length === 0 && (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="people-outline" size={36} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No accounts yet</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>Create staff in System Settings → Staff</Text>
              </View>
            )}

            {filtered.map(acc => {
              const rc = ROLE_COLORS[acc.role || 'att'] || roleColor;
              const isSuspended = acc.status === 'suspended';
              return (
                <TouchableOpacity
                  key={acc.id}
                  onPress={() => isAdmin ? openEdit(acc) : setViewAcc(acc)}
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
                      {acc.branchId ? ` · ${acc.branchId}` : ''}
                    </Text>
                    <Text style={[styles.accId, { color: colors.textSubtle }]}>@{acc.username}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[styles.stBadge, { backgroundColor: STATUS_COLORS[acc.status] + '22' }]}>
                      <Text style={[styles.stText, { color: STATUS_COLORS[acc.status] }]}>
                        {acc.status.charAt(0).toUpperCase() + acc.status.slice(1)}
                      </Text>
                    </View>
                    {isAdmin && (
                      <View style={{ flexDirection: 'row', gap: 5 }}>
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation(); handleSuspend(acc); }}
                          style={[styles.iconBtn, { borderColor: colors.border }]}
                        >
                          <Ionicons name={isSuspended ? 'play' : 'pause'} size={12} color={colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation(); handleDelete(acc); }}
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

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── APPROVE MODAL ── */}
      <Modal visible={!!approving} transparent animationType="slide" onRequestClose={() => setApproving(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setApproving(null)} />
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconBox, { backgroundColor: '#1a6e3c22' }]}>
                <Ionicons name="person-add" size={20} color="#1a6e3c" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Approve Account</Text>
                <Text style={[styles.modalSub, { color: colors.textMuted }]}>{approving?.empName}</Text>
              </View>
              <TouchableOpacity onPress={() => setApproving(null)}>
                <Ionicons name="close-circle" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Assign Role *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {ROLE_OPTS.map(r => {
                    const rc = ROLE_COLORS[r] || roleColor;
                    return (
                      <TouchableOpacity
                        key={r}
                        onPress={() => { setARole(r); if (r !== 'mgr') setABranch(''); }}
                        style={[styles.roleChip, { backgroundColor: aRole === r ? rc : colors.surface, borderColor: aRole === r ? rc : colors.border }]}
                      >
                        <Text style={[styles.roleChipText, { color: aRole === r ? '#fff' : colors.textMuted }]}>
                          {ROLE_LABELS[r] ?? r}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {aRole === 'mgr' && (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Assign Branch *</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    {branches.length === 0
                      ? <Text style={{ color: colors.textMuted, fontSize: 12, fontStyle: 'italic' }}>No branches yet — add one first.</Text>
                      : branches.map(b => (
                          <TouchableOpacity
                            key={b.id}
                            onPress={() => setABranch(b.id)}
                            style={[styles.roleChip, { backgroundColor: aBranch === b.id ? ROLE_COLORS.mgr : colors.surface, borderColor: aBranch === b.id ? ROLE_COLORS.mgr : colors.border }]}
                          >
                            <Text style={[styles.roleChipText, { color: aBranch === b.id ? '#fff' : colors.textMuted }]}>{b.name}</Text>
                          </TouchableOpacity>
                        ))
                    }
                  </View>
                </>
              )}

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Username *</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="at" size={16} color={colors.textMuted} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={aUsername}
                  onChangeText={setAUsername}
                  placeholder="e.g. ngozi.eze"
                  placeholderTextColor={colors.textSubtle}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Temporary Password *</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={aPassword}
                  onChangeText={setAPassword}
                  placeholder="e.g. Welcome@2024"
                  placeholderTextColor={colors.textSubtle}
                  secureTextEntry={!showApprovePw}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowApprovePw(v => !v)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name={showApprovePw ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity onPress={handleApprove} style={[styles.confirmBtn, { backgroundColor: '#1a6e3c', flex: 1 }]} activeOpacity={0.85}>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={styles.confirmBtnText}>Approve & Create</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setApproving(null)} style={[styles.cancelBtn, { borderColor: colors.border, flex: 0.55 }]} activeOpacity={0.8}>
                  <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── EDIT ACCOUNT MODAL (admin only) ── */}
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setEditing(null)} />
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

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Role */}
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Role</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {ROLE_OPTS.map(r => {
                      const rc = ROLE_COLORS[r] || roleColor;
                      return (
                        <TouchableOpacity
                          key={r}
                          onPress={() => { setERole(r); if (r !== 'mgr') setEBranch(''); }}
                          style={[styles.roleChip, { backgroundColor: eRole === r ? rc : colors.surface, borderColor: eRole === r ? rc : colors.border }]}
                        >
                          <Text style={[styles.roleChipText, { color: eRole === r ? '#fff' : colors.textMuted }]}>
                            {ROLE_LABELS[r] ?? r}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>

                {/* Branch — only for mgr */}
                {eRole === 'mgr' && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Branch *</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                      {branches.length === 0
                        ? <Text style={{ color: colors.textMuted, fontSize: 12, fontStyle: 'italic' }}>No branches yet — add one first.</Text>
                        : branches.map(b => (
                            <TouchableOpacity
                              key={b.id}
                              onPress={() => setEBranch(b.id)}
                              style={[styles.roleChip, { backgroundColor: eBranch === b.id ? ROLE_COLORS.mgr : colors.surface, borderColor: eBranch === b.id ? ROLE_COLORS.mgr : colors.border }]}
                            >
                              <Text style={[styles.roleChipText, { color: eBranch === b.id ? '#fff' : colors.textMuted }]}>{b.name}</Text>
                            </TouchableOpacity>
                          ))
                      }
                    </View>
                  </>
                )}

                {/* Username */}
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Username</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="at" size={16} color={colors.textMuted} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    value={eUsername}
                    onChangeText={v => setEUsername(v.toLowerCase().replace(/\s/g, '.'))}
                    placeholder="username"
                    placeholderTextColor={colors.textSubtle}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* New password */}
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>New Password <Text style={{ fontWeight: '400' }}>(leave blank to keep current)</Text></Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    value={ePassword}
                    onChangeText={setEPassword}
                    placeholder="New password (min 6 chars)"
                    placeholderTextColor={colors.textSubtle}
                    secureTextEntry={!showEditPw}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowEditPw(v => !v)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name={showEditPw ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* Status badge */}
                <View style={[styles.statusRow, { backgroundColor: STATUS_COLORS[editing.status] + '15', borderColor: STATUS_COLORS[editing.status] + '40' }]}>
                  <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[editing.status] }]} />
                  <Text style={[styles.statusText, { color: STATUS_COLORS[editing.status] }]}>
                    {editing.status.charAt(0).toUpperCase() + editing.status.slice(1)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleSuspend(editing)}
                    style={[styles.toggleStatusBtn, { borderColor: STATUS_COLORS[editing.status] + '80' }]}
                  >
                    <Text style={[{ fontSize: 11, fontWeight: '600', color: STATUS_COLORS[editing.status] }]}>
                      {editing.status === 'active' ? 'Suspend' : 'Reactivate'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Action buttons */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity onPress={handleSaveEdit} style={[styles.confirmBtn, { backgroundColor: roleColor, flex: 1 }]} activeOpacity={0.85}>
                    <Ionicons name="save-outline" size={16} color="#fff" />
                    <Text style={styles.confirmBtnText}>Save Changes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditing(null)} style={[styles.cancelBtn, { borderColor: colors.border, flex: 0.55 }]} activeOpacity={0.8}>
                    <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>

                {/* Delete button */}
                <TouchableOpacity
                  onPress={() => handleDelete(editing)}
                  style={[styles.deleteBtn, { borderColor: colors.errorBorder, backgroundColor: colors.errorBg }]}
                  activeOpacity={0.85}
                >
                  <Ionicons name="trash-outline" size={15} color={colors.error} />
                  <Text style={[styles.deleteBtnText, { color: colors.error }]}>Delete Account</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* ── VIEW ACCOUNT MODAL (non-admin) ── */}
      <Modal visible={!!viewAcc} transparent animationType="slide" onRequestClose={() => setViewAcc(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setViewAcc(null)} />
          {viewAcc && (
            <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
              <View style={styles.modalHeader}>
                <View style={[styles.avatar, { width: 46, height: 46, borderRadius: 23, backgroundColor: (ROLE_COLORS[viewAcc.role || 'att'] || roleColor) + '22' }]}>
                  <Text style={[styles.avatarText, { color: ROLE_COLORS[viewAcc.role || 'att'] || roleColor, fontSize: 16 }]}>{initials(viewAcc.empName)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>{viewAcc.empName}</Text>
                  <Text style={[styles.modalSub, { color: colors.textMuted }]}>
                    {ROLE_LABELS[viewAcc.role || ''] ?? viewAcc.role}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setViewAcc(null)}>
                  <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              {[
                { label: 'Username',    value: `@${viewAcc.username}` },
                { label: 'Employee ID', value: viewAcc.empId || '—' },
                { label: 'Branch',      value: viewAcc.branchId ?? '—' },
                { label: 'Status',      value: viewAcc.status.charAt(0).toUpperCase() + viewAcc.status.slice(1) },
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
        </View>
      </Modal>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  tabRow:         { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11 },
  tabLabel:       { fontSize: 13 },
  tabBadge:       { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  tabBadgeText:   { fontSize: 11, fontWeight: '700' },
  searchBar:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput:    { flex: 1, fontSize: 14 },
  scroll:         { padding: 16 },
  statsRow:       { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard:       { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  statNum:        { fontSize: 22, fontWeight: '700' },
  statLabel:      { fontSize: 11, marginTop: 1 },
  infoBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 14 },
  infoBannerText: { flex: 1, fontSize: 12 },
  emptyCard:      { alignItems: 'center', padding: 36, borderRadius: 16, borderWidth: 1, gap: 8, marginTop: 20 },
  emptyTitle:     { fontSize: 17, fontWeight: '700' },
  emptySub:       { fontSize: 13, textAlign: 'center' },
  accCard:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  avatar:         { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText:     { fontSize: 15, fontWeight: '700' },
  accName:        { fontSize: 15, fontWeight: '600' },
  accSub:         { fontSize: 12, marginTop: 1 },
  accId:          { fontSize: 11, marginTop: 1 },
  accDate:        { fontSize: 10, marginTop: 2 },
  stBadge:        { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  stText:         { fontSize: 10, fontWeight: '700' },
  approveBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  approveBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  rejectBtn:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  rejectBtnText:  { fontSize: 11, fontWeight: '600' },
  iconBtn:        { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 12, maxHeight: '92%' },
  modalHeader:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  modalIconBox:   { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalTitle:     { fontSize: 16, fontWeight: '700' },
  modalSub:       { fontSize: 12, marginTop: 1 },
  fieldLabel:     { fontSize: 11, fontWeight: '600', marginBottom: 6 },
  inputWrap:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, marginBottom: 12 },
  input:          { flex: 1, fontSize: 14 },
  roleChip:       { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  roleChipText:   { fontSize: 12, fontWeight: '600' },
  confirmBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  confirmBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn:      { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1 },
  cancelBtnText:  { fontSize: 14, fontWeight: '600' },
  deleteBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, marginTop: 10 },
  deleteBtnText:  { fontSize: 13, fontWeight: '700' },
  statusRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 4 },
  statusDot:      { width: 8, height: 8, borderRadius: 4 },
  statusText:     { flex: 1, fontSize: 13, fontWeight: '600' },
  toggleStatusBtn:{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  detailRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  detailLabel:    { fontSize: 13 },
  detailValue:    { fontSize: 13, fontWeight: '600' },
});
