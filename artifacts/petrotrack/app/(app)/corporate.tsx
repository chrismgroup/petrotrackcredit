import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import {
  HRDocStatus, HRDocType,
  ROLE_COLORS, fmtDate, fmtDateTime, useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

// ── Compliance helpers ─────────────────────────────────────────────────────
function daysLeft(exp: string) {
  return Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000);
}
function getDocStatus(days: number) {
  if (days < 0)  return { label: 'Expired',     color: '#791F1F', bg: '#FCEBEB' };
  if (days < 14) return { label: `${days}d left`, color: '#791F1F', bg: '#FCEBEB' };
  if (days < 30) return { label: `${days}d left`, color: '#BA7517', bg: '#FAEEDA' };
  return             { label: `${days}d left`, color: '#27500A', bg: '#EAF3DE' };
}

// ── File helpers ───────────────────────────────────────────────────────────
const FILE_CATS  = ['Policy', 'HR', 'Finance', 'Legal', 'Operations', 'Compliance', 'Contract', 'Other'];
const FILE_TYPES = ['pdf', 'docx', 'xlsx', 'img', 'other'] as const;
const FILE_TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  pdf:   { icon: 'document-text', color: '#E74C3C' },
  docx:  { icon: 'document',      color: '#2980B9' },
  xlsx:  { icon: 'grid',          color: '#27AE60' },
  img:   { icon: 'image',         color: '#8E44AD' },
  mp4:   { icon: 'videocam',      color: '#E67E22' },
  other: { icon: 'attach',        color: '#7F8C8D' },
};
const MOCK_FILE_NAMES: Record<string, string[]> = {
  pdf:   ['Agreement_Signed.pdf', 'Policy_Update.pdf', 'Compliance_Cert.pdf', 'Annual_Report.pdf'],
  docx:  ['Employee_Contract.docx', 'Memo_Board.docx', 'HR_Policy.docx'],
  xlsx:  ['Budget_Q3.xlsx', 'Payroll_June.xlsx', 'Asset_Register.xlsx'],
  img:   ['Site_Photo.jpg', 'Board_Certificate.png', 'Signage_Approval.jpg'],
  other: ['Document_Scan.zip', 'Archive_2024.tar'],
};
const FILE_SIZES = ['0.4 MB', '0.8 MB', '1.1 MB', '1.6 MB', '2.2 MB', '3.4 MB'];

// ── HR Staff helpers ───────────────────────────────────────────────────────
const HR_DOC_META: Record<HRDocType, { label: string; icon: string; color: string }> = {
  contract:  { label: 'Employment Contract', icon: 'document-text', color: '#2980B9' },
  promotion: { label: 'Promotion Letter',    icon: 'ribbon',         color: '#8E44AD' },
  guarantor: { label: 'Guarantor Form',      icon: 'people',         color: '#E67E22' },
  biodata:   { label: 'Bio-Data Form',       icon: 'person',         color: '#27AE60' },
};
const STATUS_META: Record<HRDocStatus, { label: string; color: string; bg: string }> = {
  approved:  { label: 'Approved',   color: '#27500A', bg: '#EAF3DE' },
  submitted: { label: 'Submitted',  color: '#185FA5', bg: '#DCF0FF' },
  pending:   { label: 'Pending',    color: '#BA7517', bg: '#FAEEDA' },
  'n/a':     { label: 'N/A',        color: '#7F8C8D', bg: '#F4F4F2' },
};
const STATUS_CYCLE: HRDocStatus[] = ['pending', 'submitted', 'approved'];

function nextStatus(current: HRDocStatus): HRDocStatus {
  const i = STATUS_CYCLE.indexOf(current);
  return i === -1 ? 'pending' : STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

const DEPT_COLORS: Record<string, string> = {
  Operations:     '#27ae60',
  Finance:        '#185FA5',
  Marketing:      '#D85A30',
  Administration: '#0F6E56',
  Management:     '#4527a0',
  IT:             '#2980B9',
  Legal:          '#8E44AD',
  HR:             '#E67E22',
};

const DEPARTMENTS = ['Operations', 'Finance', 'Marketing', 'Administration', 'Management', 'IT', 'Legal', 'HR'];

// ── Main screen ────────────────────────────────────────────────────────────
type Tab = 'compliance' | 'files' | 'staff';

export default function CorporateScreen() {
  const { role, docs, companyFiles, addCompanyFile, hrEmployees, addHREmployee, updateHRDocStatus, removeHREmployee } = useApp();
  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'csm'] || colors.primary;
  const canEdit   = role === 'csm' || role === 'admin';

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>('staff');

  // File upload state
  const [selCat,  setSelCat]  = useState(FILE_CATS[0]);
  const [selType, setSelType] = useState<typeof FILE_TYPES[number]>('pdf');

  // Staff state
  const [search,      setSearch]      = useState('');
  const [expandedId,  setExpandedId]  = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName,     setNewName]     = useState('');
  const [newRole,     setNewRole]     = useState('');
  const [newDept,     setNewDept]     = useState(DEPARTMENTS[0]);
  const [newPhone,    setNewPhone]    = useState('');

  // Compliance stats
  const expiredDocs = docs.filter(d => daysLeft(d.exp) < 0);
  const urgentDocs  = docs.filter(d => daysLeft(d.exp) >= 0 && daysLeft(d.exp) < 14);
  const warnDocs    = docs.filter(d => daysLeft(d.exp) >= 14 && daysLeft(d.exp) < 30);
  const okDocs      = docs.filter(d => daysLeft(d.exp) >= 30);

  // Staff filters
  const filteredStaff = hrEmployees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.empId.toLowerCase().includes(search.toLowerCase()) ||
    e.dept.toLowerCase().includes(search.toLowerCase())
  );
  const pendingDocs = hrEmployees.reduce((n, e) => n + e.docs.filter(d => d.status === 'pending').length, 0);

  function handleUpload() {
    const names = MOCK_FILE_NAMES[selType] || MOCK_FILE_NAMES.other;
    const name  = names[Math.floor(Math.random() * names.length)];
    const size  = FILE_SIZES[Math.floor(Math.random() * FILE_SIZES.length)];
    addCompanyFile({ name, cat: selCat, by: role === 'csm' ? 'Ngozi Eze' : 'System Admin', size, fileType: selType });
    Alert.alert('Uploaded', `${name} uploaded successfully to ${selCat}.`);
  }

  function handleAddEmployee() {
    if (!newName.trim() || !newRole.trim()) { Alert.alert('Required', 'Name and role are required.'); return; }
    const today = new Date().toISOString().split('T')[0];
    addHREmployee({
      name: newName.trim(),
      role: newRole.trim(),
      dept: newDept,
      phone: newPhone.trim() || '—',
      joinDate: today,
      status: 'active',
      docs: [
        { type: 'contract',  status: 'pending' },
        { type: 'promotion', status: 'n/a'     },
        { type: 'guarantor', status: 'pending' },
        { type: 'biodata',   status: 'pending' },
      ],
    });
    setNewName(''); setNewRole(''); setNewPhone(''); setNewDept(DEPARTMENTS[0]);
    setShowAddForm(false);
    Alert.alert('Employee Added', `${newName.trim()} has been registered with a new company ID.`);
  }

  function handleCycleDoc(empId: number, docType: HRDocType, current: HRDocStatus) {
    if (!canEdit) return;
    if (current === 'n/a') return;
    updateHRDocStatus(empId, docType, nextStatus(current));
  }

  function handleRemove(empId: number, name: string) {
    Alert.alert('Remove Employee', `Remove ${name} from the staff registry?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeHREmployee(empId) },
    ]);
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'staff',      label: 'Staff' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'files',      label: 'Files' },
  ];

  return (
    <ScreenLayout title="Corporate Services">
      {/* ── Tab bar ── */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} onPress={() => setActiveTab(t.key)} style={[styles.tabBtn, { borderBottomColor: t.key === activeTab ? roleColor : 'transparent' }]}>
            <Text style={[styles.tabLabel, { color: t.key === activeTab ? roleColor : colors.textMuted, fontWeight: t.key === activeTab ? '700' : '400' }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ═══════════════════════════════════════════════════════════ STAFF TAB */}
      {activeTab === 'staff' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Summary cards */}
          <View style={styles.summaryRow}>
            {[
              { n: hrEmployees.length,                           label: 'Total Staff', col: roleColor,       bg: roleColor + '12',   border: roleColor + '30' },
              { n: hrEmployees.filter(e => e.status === 'active').length, label: 'Active',      col: '#27500A',       bg: '#EAF3DE',          border: '#C4E5B0' },
              { n: pendingDocs,                                  label: 'Docs Pending', col: colors.warning,  bg: colors.warningBg,   border: colors.warningBorder },
            ].map(s => (
              <View key={s.label} style={[styles.summaryCard, { backgroundColor: s.bg, borderColor: s.border }]}>
                <Text style={[styles.summaryNum, { color: s.col }]}>{s.n}</Text>
                <Text style={[styles.summaryLabel, { color: s.col }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Search + Add */}
          <View style={styles.searchRow}>
            <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={15} color={colors.textMuted} />
              <TextInput
                placeholder="Search by name, ID or dept…"
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                style={[styles.searchInput, { color: colors.text }]}
              />
            </View>
            {canEdit && (
              <TouchableOpacity onPress={() => setShowAddForm(v => !v)} style={[styles.addBtn, { backgroundColor: roleColor }]}>
                <Ionicons name={showAddForm ? 'close' : 'person-add'} size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {/* Add Employee form */}
          {showAddForm && (
            <View style={[styles.addForm, { backgroundColor: colors.surface, borderColor: roleColor + '44' }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>Register New Employee</Text>
              <Text style={[styles.formHint, { color: colors.textMuted }]}>A unique company ID will be generated automatically.</Text>

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Full Name *</Text>
              <TextInput value={newName} onChangeText={setNewName} placeholder="e.g. Kelechi Nwosu" placeholderTextColor={colors.textMuted}
                style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Job Title / Role *</Text>
              <TextInput value={newRole} onChangeText={setNewRole} placeholder="e.g. Senior Accountant" placeholderTextColor={colors.textMuted}
                style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Department</Text>
              <View style={styles.chipRow}>
                {DEPARTMENTS.map(d => (
                  <TouchableOpacity key={d} onPress={() => setNewDept(d)}
                    style={[styles.chip, { backgroundColor: d === newDept ? roleColor : colors.background, borderColor: d === newDept ? roleColor : colors.border }]}>
                    <Text style={[styles.chipText, { color: d === newDept ? '#fff' : colors.textMuted }]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Phone (optional)</Text>
              <TextInput value={newPhone} onChangeText={setNewPhone} placeholder="+234 8XX XXX XXXX" placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />

              <TouchableOpacity onPress={handleAddEmployee} style={[styles.submitBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>Register Employee</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Employee list */}
          {filteredStaff.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No employees found</Text>
            </View>
          )}

          {filteredStaff.map(emp => {
            const deptColor = DEPT_COLORS[emp.dept] ?? roleColor;
            const isExpanded = expandedId === emp.id;
            const docsPending = emp.docs.filter(d => d.status === 'pending').length;

            return (
              <View key={emp.id} style={[styles.empCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {/* Employee header row */}
                <TouchableOpacity style={styles.empHeader} onPress={() => setExpandedId(isExpanded ? null : emp.id)} activeOpacity={0.7}>
                  {/* Avatar with dept color */}
                  <View style={[styles.avatar, { backgroundColor: deptColor }]}>
                    <Text style={styles.avatarText}>{initials(emp.name)}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    {/* Company ID badge */}
                    <View style={styles.empTopRow}>
                      <View style={[styles.idBadge, { backgroundColor: deptColor + '18', borderColor: deptColor + '44' }]}>
                        <Text style={[styles.idBadgeText, { color: deptColor }]}>{emp.empId}</Text>
                      </View>
                      <View style={[styles.serialBadge, { backgroundColor: colors.border }]}>
                        <Text style={[styles.serialText, { color: colors.textMuted }]}>#{String(emp.serial).padStart(3, '0')}</Text>
                      </View>
                      {docsPending > 0 && (
                        <View style={styles.pendingBubble}>
                          <Text style={styles.pendingBubbleText}>{docsPending}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.empName, { color: colors.text }]}>{emp.name}</Text>
                    <Text style={[styles.empMeta, { color: colors.textMuted }]}>{emp.role} · {emp.dept}</Text>
                  </View>

                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
                </TouchableOpacity>

                {/* Doc status chips — always visible */}
                <View style={styles.docChipRow}>
                  {emp.docs.map(doc => {
                    const dm  = HR_DOC_META[doc.type];
                    const sm  = STATUS_META[doc.status];
                    return (
                      <View key={doc.type} style={[styles.docChip, { backgroundColor: sm.bg }]}>
                        <Ionicons name={dm.icon as any} size={10} color={sm.color} />
                        <Text style={[styles.docChipText, { color: sm.color }]}>{sm.label}</Text>
                      </View>
                    );
                  })}
                </View>

                {/* Expanded: full doc management */}
                {isExpanded && (
                  <View style={[styles.expandedPanel, { borderTopColor: colors.border }]}>
                    <Text style={[styles.panelTitle, { color: colors.text }]}>HR Documents</Text>
                    {emp.docs.map(doc => {
                      const dm  = HR_DOC_META[doc.type];
                      const sm  = STATUS_META[doc.status];
                      const tappable = canEdit && doc.status !== 'n/a';
                      return (
                        <View key={doc.type} style={[styles.docRow, { borderColor: colors.border }]}>
                          <View style={[styles.docRowIcon, { backgroundColor: dm.color + '18' }]}>
                            <Ionicons name={dm.icon as any} size={16} color={dm.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.docRowLabel, { color: colors.text }]}>{dm.label}</Text>
                            {doc.date && (
                              <Text style={[styles.docRowDate, { color: colors.textMuted }]}>{fmtDate(doc.date)}</Text>
                            )}
                          </View>
                          <TouchableOpacity
                            disabled={!tappable}
                            onPress={() => handleCycleDoc(emp.id, doc.type, doc.status)}
                            style={[styles.docStatusBtn, { backgroundColor: sm.bg, opacity: tappable ? 1 : 0.7 }]}
                          >
                            <Text style={[styles.docStatusText, { color: sm.color }]}>{sm.label}</Text>
                            {tappable && <Ionicons name="chevron-forward" size={10} color={sm.color} />}
                          </TouchableOpacity>
                        </View>
                      );
                    })}

                    {/* Employee info */}
                    <View style={[styles.infoGrid, { borderTopColor: colors.border }]}>
                      {[
                        { label: 'Phone',    value: emp.phone    },
                        { label: 'Joined',   value: fmtDate(emp.joinDate) },
                        { label: 'Status',   value: emp.status === 'active' ? 'Active' : 'Inactive' },
                        { label: 'Dept',     value: emp.dept     },
                      ].map(item => (
                        <View key={item.label} style={styles.infoItem}>
                          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{item.label}</Text>
                          <Text style={[styles.infoValue, { color: colors.text }]}>{item.value}</Text>
                        </View>
                      ))}
                    </View>

                    {canEdit && (
                      <TouchableOpacity onPress={() => handleRemove(emp.id, emp.name)} style={[styles.removeBtn, { borderColor: colors.error }]}>
                        <Ionicons name="trash-outline" size={13} color={colors.error} />
                        <Text style={[styles.removeBtnText, { color: colors.error }]}>Remove from Registry</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {/* ═══════════════════════════════════════════════════ COMPLIANCE TAB */}
      {activeTab === 'compliance' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryRow}>
            {[
              { n: expiredDocs.length, label: 'Expired',   col: colors.error,   bg: colors.errorBg,   border: colors.errorBorder },
              { n: urgentDocs.length,  label: '<14 days',  col: colors.error,   bg: colors.errorBg,   border: colors.errorBorder },
              { n: warnDocs.length,    label: '<30 days',  col: colors.warning, bg: colors.warningBg, border: colors.warningBorder },
              { n: okDocs.length,      label: 'Current',   col: colors.success, bg: colors.successBg, border: colors.successBorder },
            ].map(s => (
              <View key={s.label} style={[styles.summaryCard, { backgroundColor: s.bg, borderColor: s.border }]}>
                <Text style={[styles.summaryNum, { color: s.col }]}>{s.n}</Text>
                <Text style={[styles.summaryLabel, { color: s.col }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {docs.map(doc => {
            const days = daysLeft(doc.exp);
            const st = getDocStatus(days);
            return (
              <View key={doc.id} style={[styles.docCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.docHeader}>
                  <View style={[styles.docIcon, { backgroundColor: roleColor + '18' }]}>
                    <Ionicons name="document-text" size={18} color={roleColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.docName, { color: colors.text }]}>{doc.name}</Text>
                    <Text style={[styles.docIssuer, { color: colors.textMuted }]}>{doc.iss} · Ref: {doc.ref}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>
                <View style={styles.docDates}>
                  <View style={styles.dateItem}>
                    <Text style={[styles.dateLabel, { color: colors.textMuted }]}>Category</Text>
                    <Text style={[styles.dateValue, { color: colors.text }]}>{doc.cat}</Text>
                  </View>
                  <View style={styles.dateItem}>
                    <Text style={[styles.dateLabel, { color: colors.textMuted }]}>Expires</Text>
                    <Text style={[styles.dateValue, { color: st.color }]}>{fmtDate(doc.exp)}</Text>
                  </View>
                </View>
                {days < 30 && (
                  <View style={[styles.alertBanner, { backgroundColor: st.bg }]}>
                    <Ionicons name="warning" size={14} color={st.color} />
                    <Text style={[styles.alertText, { color: st.color }]}>
                      {days < 0 ? 'Expired. Immediate renewal required.' : `Renewal required within ${days} days.`}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ height: 16 }} />
        </ScrollView>
      )}

      {/* ═══════════════════════════════════════════════════════════ FILES TAB */}
      {activeTab === 'files' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {canEdit && (
            <View style={[styles.uploadPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.uploadHeader}>
                <Ionicons name="cloud-upload" size={20} color={roleColor} />
                <Text style={[styles.uploadTitle, { color: colors.text }]}>Upload Company File</Text>
              </View>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Category</Text>
              <View style={styles.chipRow}>
                {FILE_CATS.map(c => (
                  <TouchableOpacity key={c} onPress={() => setSelCat(c)} style={[styles.chip, { backgroundColor: c === selCat ? roleColor : colors.background, borderColor: c === selCat ? roleColor : colors.border }]}>
                    <Text style={[styles.chipText, { color: c === selCat ? '#fff' : colors.textMuted }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>File Type</Text>
              <View style={styles.typeRow}>
                {FILE_TYPES.map(t => {
                  const ti = FILE_TYPE_ICONS[t];
                  return (
                    <TouchableOpacity key={t} onPress={() => setSelType(t)} style={[styles.typeBtn, { backgroundColor: t === selType ? ti.color + '22' : colors.background, borderColor: t === selType ? ti.color : colors.border }]}>
                      <Ionicons name={ti.icon as any} size={16} color={t === selType ? ti.color : colors.textMuted} />
                      <Text style={[styles.typeBtnText, { color: t === selType ? ti.color : colors.textMuted }]}>{t.toUpperCase()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity onPress={handleUpload} style={[styles.uploadBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="cloud-upload" size={16} color="#fff" />
                <Text style={styles.uploadBtnText}>Upload File</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: colors.text }]}>Company Files ({companyFiles.length})</Text>
          {companyFiles.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No files uploaded yet</Text>
            </View>
          )}
          {[...companyFiles].reverse().map(f => {
            const ti = FILE_TYPE_ICONS[f.fileType] || FILE_TYPE_ICONS.other;
            return (
              <View key={f.id} style={[styles.fileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.fileIconWrap, { backgroundColor: ti.color + '18' }]}>
                  <Ionicons name={ti.icon as any} size={22} color={ti.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{f.name}</Text>
                  <Text style={[styles.fileMeta, { color: colors.textMuted }]}>{f.cat} · {f.size}</Text>
                  <Text style={[styles.fileBy, { color: colors.textSubtle }]}>by {f.by} · {fmtDateTime(f.dt)}</Text>
                </View>
                <TouchableOpacity style={[styles.viewBtn, { borderColor: colors.border }]}>
                  <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            );
          })}
          <View style={{ height: 16 }} />
        </ScrollView>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  tabBar:  { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:  { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2 },
  tabLabel:{ fontSize: 13 },
  scroll:  { padding: 14 },

  // ── Summary ──
  summaryRow:   { flexDirection: 'row', gap: 8, marginBottom: 14 },
  summaryCard:  { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  summaryNum:   { fontSize: 22, fontWeight: '700' },
  summaryLabel: { fontSize: 10, marginTop: 2, textAlign: 'center' },

  // ── Staff ──
  searchRow:   { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchWrap:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 13 },
  addBtn:      { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  addForm:     { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 14, gap: 4 },
  formTitle:   { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  formHint:    { fontSize: 11, marginBottom: 10 },
  fieldLabel:  { fontSize: 12, fontWeight: '600', marginTop: 8, marginBottom: 4 },
  textInput:   { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  chipText:    { fontSize: 11, fontWeight: '600' },
  submitBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, marginTop: 12 },
  submitBtnText:{ color: '#fff', fontSize: 14, fontWeight: '700' },

  empCard:      { borderRadius: 14, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  empHeader:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
  avatar:       { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { color: '#fff', fontSize: 14, fontWeight: '800' },
  empTopRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  idBadge:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  idBadgeText:  { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  serialBadge:  { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  serialText:   { fontSize: 9, fontWeight: '700' },
  pendingBubble:{ minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  pendingBubbleText:{ color: '#fff', fontSize: 9, fontWeight: '800' },
  empName:      { fontSize: 14, fontWeight: '700' },
  empMeta:      { fontSize: 11, marginTop: 1 },

  docChipRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingHorizontal: 13, paddingBottom: 12 },
  docChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  docChipText:  { fontSize: 9, fontWeight: '700' },

  expandedPanel:{ borderTopWidth: StyleSheet.hairlineWidth, padding: 13, gap: 8 },
  panelTitle:   { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  docRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  docRowIcon:   { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  docRowLabel:  { fontSize: 12, fontWeight: '600' },
  docRowDate:   { fontSize: 10, marginTop: 1 },
  docStatusBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7 },
  docStatusText:{ fontSize: 11, fontWeight: '700' },

  infoGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  infoItem:     { width: '45%' },
  infoLabel:    { fontSize: 10, marginBottom: 2 },
  infoValue:    { fontSize: 12, fontWeight: '600' },

  removeBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, alignSelf: 'flex-start', marginTop: 6 },
  removeBtnText:{ fontSize: 11, fontWeight: '600' },

  // ── Compliance docs ──
  docCard:   { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10, gap: 10 },
  docHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  docIcon:   { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  docName:   { fontSize: 14, fontWeight: '600' },
  docIssuer: { fontSize: 11, marginTop: 2 },
  statusBadge:{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  docDates:  { flexDirection: 'row', gap: 20 },
  dateItem:  {},
  dateLabel: { fontSize: 10 },
  dateValue: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  alertBanner:{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 10, borderRadius: 8 },
  alertText: { flex: 1, fontSize: 12, lineHeight: 17 },

  // ── Files ──
  uploadPanel:  { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 16 },
  uploadHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  uploadTitle:  { fontSize: 15, fontWeight: '700' },
  typeRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  typeBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  typeBtnText:  { fontSize: 11, fontWeight: '700' },
  uploadBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10 },
  uploadBtnText:{ color: '#fff', fontSize: 14, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  fileCard:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  fileIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fileName:     { fontSize: 13, fontWeight: '600' },
  fileMeta:     { fontSize: 11, marginTop: 2 },
  fileBy:       { fontSize: 10, marginTop: 2 },
  viewBtn:      { padding: 8, borderRadius: 8, borderWidth: 1 },
  emptyState:   { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText:    { fontSize: 14 },
});
