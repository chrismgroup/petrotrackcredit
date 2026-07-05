import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import {
  HRDocType, HRDocStatus, HREmployeeDoc,
  ROLE_COLORS, fmtDate, fmtDateTime, useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

// ── Helpers ────────────────────────────────────────────────────────────────
const FILE_TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  pdf:   { icon: 'document-text', color: '#E74C3C' },
  docx:  { icon: 'document',      color: '#2980B9' },
  xlsx:  { icon: 'grid',          color: '#27AE60' },
  img:   { icon: 'image',         color: '#8E44AD' },
  other: { icon: 'attach',        color: '#7F8C8D' },
};
const FILE_TYPES = ['pdf', 'docx', 'xlsx', 'img', 'other'] as const;

const DOC_CATS = ['Bio-Data', 'Contract', 'Certificate', 'ID Document', 'Medical', 'Reference', 'Guarantor', 'Promotion', 'Other'];
const HANDBOOK_CATS = ['Handbook', 'Policy', 'Procedure', 'Circular', 'Notice', 'Other'];

const MOCK_NAMES: Record<string, string[]> = {
  pdf:   ['Employee_Biodata.pdf', 'Appointment_Letter.pdf', 'Medical_Certificate.pdf', 'Reference_Letter.pdf', 'Guarantor_Form.pdf', 'NIN_Slip.pdf'],
  docx:  ['Biodata_Form.docx', 'Declaration_Form.docx', 'Next_of_Kin.docx'],
  xlsx:  ['Staff_Data.xlsx', 'Emergency_Contacts.xlsx'],
  img:   ['Passport_Photo.jpg', 'ID_Card_Scan.png', 'Certificate_Scan.jpg'],
  other: ['Document.zip', 'Signed_Form.scan'],
};

const HR_DOC_META: Record<HRDocType, { label: string; icon: string; color: string }> = {
  contract:  { label: 'Employment Contract', icon: 'document-text', color: '#2980B9' },
  promotion: { label: 'Promotion Letter',    icon: 'ribbon',         color: '#8E44AD' },
  guarantor: { label: 'Guarantor Form',      icon: 'people',         color: '#E67E22' },
  biodata:   { label: 'Bio-Data Form',       icon: 'person',         color: '#27AE60' },
};
const STATUS_META: Record<HRDocStatus, { label: string; color: string; bg: string }> = {
  approved:  { label: 'Approved',  color: '#27500A', bg: '#EAF3DE' },
  submitted: { label: 'Submitted', color: '#185FA5', bg: '#DCF0FF' },
  pending:   { label: 'Pending',   color: '#BA7517', bg: '#FAEEDA' },
  'n/a':     { label: 'N/A',       color: '#7F8C8D', bg: '#F4F4F2' },
};
const DEPT_COLORS: Record<string, string> = {
  Operations: '#27ae60', Finance: '#185FA5', Marketing: '#D85A30',
  Administration: '#0F6E56', Management: '#4527a0', IT: '#2980B9', Legal: '#8E44AD', HR: '#E67E22',
};
const DEPARTMENTS = ['Operations', 'Finance', 'Marketing', 'Administration', 'Management', 'IT', 'Legal', 'HR'];

const REC_META = {
  suspend:    { label: 'Suspension',         color: '#BA7517', bg: '#FAEEDA', icon: 'pause-circle'   },
  deactivate: { label: 'Account Deactivation', color: '#E74C3C', bg: '#FCEBEB', icon: 'close-circle'  },
  delete:     { label: 'Account Deletion',   color: '#7B1818', bg: '#FCEBEB', icon: 'trash'          },
};
const REC_STATUS_META = {
  pending:  { label: 'Pending Review', color: '#BA7517', bg: '#FAEEDA' },
  approved: { label: 'Approved',       color: '#27500A', bg: '#EAF3DE' },
  rejected: { label: 'Rejected',       color: '#7B1818', bg: '#FCEBEB' },
};

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

type Tab = 'employees' | 'handbooks' | 'recommendations';

// ── Main screen ─────────────────────────────────────────────────────────────
export default function HRScreen() {
  const {
    role, userName,
    hrEmployees, hrRecommendations, hrHandbooks,
    addHREmployee, removeHREmployee,
    addHRUpload, approveHRUpload,
    addHRRecommendation, resolveHRRecommendation,
    addHRHandbook, approveHRHandbook,
  } = useApp();
  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'csm'] || colors.primary;
  const isHR      = role === 'csm';
  const isAdmin   = role === 'admin';
  const canAct    = isHR || isAdmin;

  const [activeTab, setActiveTab] = useState<Tab>('employees');

  // Employee search / expand
  const [search,     setSearch]     = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Add employee form
  const [showAdd,   setShowAdd]   = useState(false);
  const [newName,   setNewName]   = useState('');
  const [newJobRole,setNewJobRole]= useState('');
  const [newDept,   setNewDept]   = useState(DEPARTMENTS[0]);
  const [newPhone,  setNewPhone]  = useState('');
  const [newEmail,  setNewEmail]  = useState('');
  const [newAddr,   setNewAddr]   = useState('');
  const [newDob,    setNewDob]    = useState('');
  const [newKin,    setNewKin]    = useState('');

  // Upload doc for employee
  const [uploadEmpId,  setUploadEmpId]  = useState<number | null>(null);
  const [uploadCat,    setUploadCat]    = useState(DOC_CATS[0]);
  const [uploadType,   setUploadType]   = useState<typeof FILE_TYPES[number]>('pdf');

  // Handbook upload
  const [hbCat,  setHbCat]  = useState(HANDBOOK_CATS[0]);
  const [hbType, setHbType] = useState<typeof FILE_TYPES[number]>('pdf');

  // Recommendation
  const [recEmpId,  setRecEmpId]  = useState<number | null>(null);
  const [recType,   setRecType]   = useState<'suspend' | 'deactivate' | 'delete'>('suspend');
  const [recReason, setRecReason] = useState('');

  const filteredStaff = hrEmployees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.empId.toLowerCase().includes(search.toLowerCase()) ||
    e.dept.toLowerCase().includes(search.toLowerCase())
  );
  const pendingRecs  = hrRecommendations.filter(r => r.status === 'pending').length;
  const pendingBooks = hrHandbooks.filter(h => !h.approved).length;

  function handleAddEmployee() {
    if (!newName.trim() || !newJobRole.trim()) { Alert.alert('Required', 'Name and job title are required.'); return; }
    const today = new Date().toISOString().split('T')[0];
    addHREmployee({
      name: newName.trim(), role: newJobRole.trim(), dept: newDept,
      phone: newPhone.trim() || '—', email: newEmail.trim() || '—',
      address: newAddr.trim() || '—', dob: newDob.trim() || '—',
      joinDate: today, nextOfKin: newKin.trim() || '—',
      status: 'active',
      docs: [
        { type: 'contract',  status: 'pending' },
        { type: 'promotion', status: 'n/a'     },
        { type: 'guarantor', status: 'pending' },
        { type: 'biodata',   status: 'pending' },
      ],
      uploads: [],
    });
    setNewName(''); setNewJobRole(''); setNewPhone(''); setNewEmail('');
    setNewAddr(''); setNewDob(''); setNewKin(''); setNewDept(DEPARTMENTS[0]);
    setShowAdd(false);
    Alert.alert('Onboarded', `${newName.trim()} has been registered. A unique company ID has been assigned.`);
  }

  function handleUploadDoc(empId: number) {
    const names = MOCK_NAMES[uploadType] || MOCK_NAMES.other;
    const name  = names[Math.floor(Math.random() * names.length)];
    addHRUpload(empId, { name, fileType: uploadType, cat: uploadCat, uploadedBy: userName || 'HR' });
    setUploadEmpId(null);
    Alert.alert('Uploaded', `${name} uploaded. Awaiting admin approval.`);
  }

  function handleUploadHandbook() {
    const names = MOCK_NAMES[hbType] || MOCK_NAMES.other;
    const n = ['Employee_Handbook_2025.pdf', 'HR_Policy_Update.pdf', 'Code_of_Conduct.pdf', 'Circular_July.pdf'][Math.floor(Math.random() * 4)];
    addHRHandbook({ name: n, fileType: hbType, cat: hbCat, uploadedBy: userName || 'HR' });
    Alert.alert('Uploaded', `${n} uploaded. Awaiting admin approval.`);
  }

  function handleRecommend(empId: number) {
    if (!recReason.trim()) { Alert.alert('Reason Required', 'Please provide a reason for the recommendation.'); return; }
    const emp = hrEmployees.find(e => e.id === empId);
    if (!emp) return;
    addHRRecommendation({ empId, empName: emp.name, type: recType, reason: recReason.trim(), by: userName || 'HR' });
    setRecEmpId(null); setRecReason('');
    Alert.alert('Recommendation Sent', `Recommendation for ${recType} of ${emp.name} sent to Admin for review.`);
  }

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'employees',      label: 'Staff'    },
    { key: 'handbooks',      label: 'Library',      badge: pendingBooks },
    { key: 'recommendations',label: 'Actions', badge: pendingRecs  },
  ];

  return (
    <ScreenLayout title="HR Panel">
      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} onPress={() => setActiveTab(t.key)}
            style={[styles.tabBtn, { borderBottomColor: t.key === activeTab ? roleColor : 'transparent' }]}>
            <View style={styles.tabBtnInner}>
              <Text style={[styles.tabLabel, { color: t.key === activeTab ? roleColor : colors.textMuted, fontWeight: t.key === activeTab ? '700' : '400' }]}>
                {t.label}
              </Text>
              {!!t.badge && (
                <View style={[styles.tabBadge, { backgroundColor: '#E74C3C' }]}>
                  <Text style={styles.tabBadgeText}>{t.badge}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ═══════════════════════════════════════ EMPLOYEES TAB */}
      {activeTab === 'employees' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Stats */}
          <View style={styles.statsRow}>
            {[
              { n: hrEmployees.length,                                        label: 'Total',     col: roleColor,       bg: roleColor + '12' },
              { n: hrEmployees.filter(e => e.status === 'active').length,     label: 'Active',    col: '#27500A',       bg: '#EAF3DE' },
              { n: hrEmployees.filter(e => e.status === 'suspended').length,  label: 'Suspended', col: '#BA7517',       bg: '#FAEEDA' },
              { n: hrEmployees.filter(e => e.status === 'inactive').length,   label: 'Inactive',  col: colors.error,    bg: colors.errorBg },
            ].map(s => (
              <View key={s.label} style={[styles.statCard, { backgroundColor: s.bg }]}>
                <Text style={[styles.statNum, { color: s.col }]}>{s.n}</Text>
                <Text style={[styles.statLabel, { color: s.col }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Search + Add */}
          <View style={styles.searchRow}>
            <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={15} color={colors.textMuted} />
              <TextInput placeholder="Search name, ID, department…" placeholderTextColor={colors.textMuted}
                value={search} onChangeText={setSearch}
                style={[styles.searchInput, { color: colors.text }]} />
            </View>
            {isHR && (
              <TouchableOpacity onPress={() => setShowAdd(v => !v)} style={[styles.addBtn, { backgroundColor: roleColor }]}>
                <Ionicons name={showAdd ? 'close' : 'person-add'} size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {/* Onboarding form */}
          {showAdd && isHR && (
            <View style={[styles.form, { backgroundColor: colors.surface, borderColor: roleColor + '44' }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>Onboard New Employee</Text>
              <Text style={[styles.formHint, { color: colors.textMuted }]}>Company ID (PTNG-XXXX) auto-assigned on save.</Text>

              {[
                { label: 'Full Name *',      val: newName,    set: setNewName,    ph: 'e.g. Kelechi Nwosu' },
                { label: 'Job Title *',      val: newJobRole, set: setNewJobRole, ph: 'e.g. Senior Accountant' },
                { label: 'Phone',            val: newPhone,   set: setNewPhone,   ph: '+234 8XX XXX XXXX' },
                { label: 'Email',            val: newEmail,   set: setNewEmail,   ph: 'name@petrotrack.ng' },
                { label: 'Date of Birth',    val: newDob,     set: setNewDob,     ph: 'YYYY-MM-DD' },
                { label: 'Home Address',     val: newAddr,    set: setNewAddr,    ph: 'Street, City' },
                { label: 'Next of Kin',      val: newKin,     set: setNewKin,     ph: 'Full name' },
              ].map(f => (
                <View key={f.label}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{f.label}</Text>
                  <TextInput value={f.val} onChangeText={f.set} placeholder={f.ph} placeholderTextColor={colors.textMuted}
                    style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                </View>
              ))}

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Department</Text>
              <View style={styles.chipRow}>
                {DEPARTMENTS.map(d => (
                  <TouchableOpacity key={d} onPress={() => setNewDept(d)}
                    style={[styles.chip, { backgroundColor: d === newDept ? roleColor : colors.background, borderColor: d === newDept ? roleColor : colors.border }]}>
                    <Text style={[styles.chipText, { color: d === newDept ? '#fff' : colors.textMuted }]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity onPress={handleAddEmployee} style={[styles.submitBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>Onboard Employee</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Employee list */}
          {filteredStaff.map(emp => {
            const deptColor  = DEPT_COLORS[emp.dept] ?? roleColor;
            const isExpanded = expandedId === emp.id;
            const statusColors = emp.status === 'active' ? { col: '#27500A', bg: '#EAF3DE' }
              : emp.status === 'suspended' ? { col: '#BA7517', bg: '#FAEEDA' }
              : { col: '#7B1818', bg: '#FCEBEB' };

            return (
              <View key={emp.id} style={[styles.empCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {/* Header */}
                <TouchableOpacity style={styles.empHeader} onPress={() => setExpandedId(isExpanded ? null : emp.id)} activeOpacity={0.7}>
                  <View style={[styles.avatar, { backgroundColor: deptColor }]}>
                    <Text style={styles.avatarText}>{initials(emp.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.empTopRow}>
                      <View style={[styles.idBadge, { backgroundColor: deptColor + '18', borderColor: deptColor + '44' }]}>
                        <Text style={[styles.idText, { color: deptColor }]}>{emp.empId}</Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: statusColors.bg }]}>
                        <Text style={[styles.statusPillText, { color: statusColors.col }]}>{emp.status}</Text>
                      </View>
                    </View>
                    <Text style={[styles.empName, { color: colors.text }]}>{emp.name}</Text>
                    <Text style={[styles.empSub,  { color: colors.textMuted }]}>{emp.role} · {emp.dept}</Text>
                  </View>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
                </TouchableOpacity>

                {/* Quick doc status chips */}
                <View style={styles.docChipRow}>
                  {emp.docs.map(doc => {
                    const sm = STATUS_META[doc.status];
                    const dm = HR_DOC_META[doc.type];
                    return (
                      <View key={doc.type} style={[styles.docChip, { backgroundColor: sm.bg }]}>
                        <Ionicons name={dm.icon as any} size={9} color={sm.color} />
                        <Text style={[styles.docChipText, { color: sm.color }]}>{dm.label.split(' ')[0]}</Text>
                      </View>
                    );
                  })}
                  {emp.uploads.length > 0 && (
                    <View style={[styles.docChip, { backgroundColor: colors.border }]}>
                      <Ionicons name="attach" size={9} color={colors.textMuted} />
                      <Text style={[styles.docChipText, { color: colors.textMuted }]}>{emp.uploads.length} file{emp.uploads.length > 1 ? 's' : ''}</Text>
                    </View>
                  )}
                </View>

                {/* Expanded panel */}
                {isExpanded && (
                  <View style={[styles.expanded, { borderTopColor: colors.border }]}>

                    {/* Bio-data grid */}
                    <Text style={[styles.panelSection, { color: colors.text }]}>Personal Information</Text>
                    <View style={styles.bioGrid}>
                      {[
                        { label: 'Company ID', value: emp.empId },
                        { label: 'Serial No.',  value: `#${String(emp.serial).padStart(3, '0')}` },
                        { label: 'Phone',       value: emp.phone },
                        { label: 'Email',       value: emp.email },
                        { label: 'Date of Birth',value: emp.dob },
                        { label: 'Join Date',   value: fmtDate(emp.joinDate) },
                        { label: 'Next of Kin', value: emp.nextOfKin },
                        { label: 'Address',     value: emp.address },
                      ].map(item => (
                        <View key={item.label} style={styles.bioItem}>
                          <Text style={[styles.bioLabel, { color: colors.textMuted }]}>{item.label}</Text>
                          <Text style={[styles.bioValue, { color: colors.text }]}>{item.value}</Text>
                        </View>
                      ))}
                    </View>

                    {/* HR document checklist */}
                    <Text style={[styles.panelSection, { color: colors.text }]}>HR Document Checklist</Text>
                    {emp.docs.map(doc => {
                      const dm = HR_DOC_META[doc.type];
                      const sm = STATUS_META[doc.status];
                      return (
                        <View key={doc.type} style={[styles.docRow, { borderColor: colors.border }]}>
                          <View style={[styles.docRowIcon, { backgroundColor: dm.color + '18' }]}>
                            <Ionicons name={dm.icon as any} size={15} color={dm.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.docRowLabel, { color: colors.text }]}>{dm.label}</Text>
                            {doc.date && <Text style={[styles.docRowDate, { color: colors.textMuted }]}>{fmtDate(doc.date)}</Text>}
                          </View>
                          <View style={[styles.statusPill, { backgroundColor: sm.bg }]}>
                            <Text style={[styles.statusPillText, { color: sm.color }]}>{sm.label}</Text>
                          </View>
                        </View>
                      );
                    })}

                    {/* Uploaded files */}
                    {emp.uploads.length > 0 && (
                      <>
                        <Text style={[styles.panelSection, { color: colors.text }]}>Uploaded Files</Text>
                        {emp.uploads.map(u => {
                          const ti = FILE_TYPE_ICONS[u.fileType] ?? FILE_TYPE_ICONS.other;
                          return (
                            <View key={u.id} style={[styles.uploadRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                              <View style={[styles.fileIcon, { backgroundColor: ti.color + '18' }]}>
                                <Ionicons name={ti.icon as any} size={14} color={ti.color} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{u.name}</Text>
                                <Text style={[styles.fileMeta, { color: colors.textMuted }]}>{u.cat} · {fmtDateTime(u.dt)}</Text>
                              </View>
                              {u.approved ? (
                                <View style={[styles.statusPill, { backgroundColor: '#EAF3DE' }]}>
                                  <Text style={[styles.statusPillText, { color: '#27500A' }]}>Approved</Text>
                                </View>
                              ) : isAdmin ? (
                                <TouchableOpacity onPress={() => approveHRUpload(emp.id, u.id, userName || 'Admin')}
                                  style={[styles.approveBtn, { backgroundColor: roleColor }]}>
                                  <Text style={styles.approveBtnText}>Approve</Text>
                                </TouchableOpacity>
                              ) : (
                                <View style={[styles.statusPill, { backgroundColor: '#FAEEDA' }]}>
                                  <Text style={[styles.statusPillText, { color: '#BA7517' }]}>Pending</Text>
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </>
                    )}

                    {/* Upload doc panel (HR only) */}
                    {isHR && (
                      <>
                        <TouchableOpacity onPress={() => setUploadEmpId(uploadEmpId === emp.id ? null : emp.id)}
                          style={[styles.sectionToggle, { borderColor: roleColor + '55', backgroundColor: roleColor + '0a' }]}>
                          <Ionicons name="cloud-upload-outline" size={14} color={roleColor} />
                          <Text style={[styles.sectionToggleText, { color: roleColor }]}>
                            {uploadEmpId === emp.id ? 'Close Upload' : 'Upload Document'}
                          </Text>
                        </TouchableOpacity>

                        {uploadEmpId === emp.id && (
                          <View style={[styles.uploadPanel, { backgroundColor: colors.background, borderColor: colors.border }]}>
                            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Document Category</Text>
                            <View style={styles.chipRow}>
                              {DOC_CATS.map(c => (
                                <TouchableOpacity key={c} onPress={() => setUploadCat(c)}
                                  style={[styles.chip, { backgroundColor: c === uploadCat ? roleColor : colors.surface, borderColor: c === uploadCat ? roleColor : colors.border }]}>
                                  <Text style={[styles.chipText, { color: c === uploadCat ? '#fff' : colors.textMuted }]}>{c}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>File Type</Text>
                            <View style={styles.typeRow}>
                              {FILE_TYPES.map(t => {
                                const ti = FILE_TYPE_ICONS[t];
                                return (
                                  <TouchableOpacity key={t} onPress={() => setUploadType(t)}
                                    style={[styles.typeBtn, { backgroundColor: t === uploadType ? ti.color + '22' : colors.surface, borderColor: t === uploadType ? ti.color : colors.border }]}>
                                    <Ionicons name={ti.icon as any} size={13} color={t === uploadType ? ti.color : colors.textMuted} />
                                    <Text style={[styles.typeBtnText, { color: t === uploadType ? ti.color : colors.textMuted }]}>{t.toUpperCase()}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                            <TouchableOpacity onPress={() => handleUploadDoc(emp.id)} style={[styles.submitBtn, { backgroundColor: roleColor }]}>
                              <Ionicons name="cloud-upload" size={14} color="#fff" />
                              <Text style={styles.submitBtnText}>Upload File</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </>
                    )}

                    {/* Recommend action (HR only) */}
                    {isHR && emp.status === 'active' && (
                      <>
                        <TouchableOpacity onPress={() => setRecEmpId(recEmpId === emp.id ? null : emp.id)}
                          style={[styles.sectionToggle, { borderColor: '#E74C3C55', backgroundColor: '#E74C3C0a' }]}>
                          <Ionicons name="alert-circle-outline" size={14} color="#E74C3C" />
                          <Text style={[styles.sectionToggleText, { color: '#E74C3C' }]}>
                            {recEmpId === emp.id ? 'Close' : 'Recommend Action'}
                          </Text>
                        </TouchableOpacity>

                        {recEmpId === emp.id && (
                          <View style={[styles.uploadPanel, { backgroundColor: colors.background, borderColor: '#E74C3C44' }]}>
                            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Action Type</Text>
                            <View style={styles.chipRow}>
                              {(['suspend', 'deactivate', 'delete'] as const).map(t => {
                                const rm = REC_META[t];
                                return (
                                  <TouchableOpacity key={t} onPress={() => setRecType(t)}
                                    style={[styles.recTypeBtn, { backgroundColor: t === recType ? rm.color + '22' : colors.surface, borderColor: t === recType ? rm.color : colors.border }]}>
                                    <Ionicons name={rm.icon as any} size={13} color={t === recType ? rm.color : colors.textMuted} />
                                    <Text style={[styles.typeBtnText, { color: t === recType ? rm.color : colors.textMuted }]}>{rm.label}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Reason *</Text>
                            <TextInput value={recReason} onChangeText={setRecReason}
                              placeholder="Briefly explain the reason…" placeholderTextColor={colors.textMuted}
                              multiline numberOfLines={3}
                              style={[styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
                            <TouchableOpacity onPress={() => handleRecommend(emp.id)} style={[styles.submitBtn, { backgroundColor: '#E74C3C' }]}>
                              <Ionicons name="send" size={14} color="#fff" />
                              <Text style={styles.submitBtnText}>Send to Admin</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ═══════════════════════════════════════ HANDBOOKS TAB */}
      {activeTab === 'handbooks' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Upload panel (HR only) */}
          {isHR && (
            <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.formHeaderRow}>
                <Ionicons name="library" size={18} color={roleColor} />
                <Text style={[styles.formTitle, { color: colors.text }]}>Upload HR Document</Text>
              </View>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Category</Text>
              <View style={styles.chipRow}>
                {HANDBOOK_CATS.map(c => (
                  <TouchableOpacity key={c} onPress={() => setHbCat(c)}
                    style={[styles.chip, { backgroundColor: c === hbCat ? roleColor : colors.background, borderColor: c === hbCat ? roleColor : colors.border }]}>
                    <Text style={[styles.chipText, { color: c === hbCat ? '#fff' : colors.textMuted }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>File Type</Text>
              <View style={styles.typeRow}>
                {FILE_TYPES.map(t => {
                  const ti = FILE_TYPE_ICONS[t];
                  return (
                    <TouchableOpacity key={t} onPress={() => setHbType(t)}
                      style={[styles.typeBtn, { backgroundColor: t === hbType ? ti.color + '22' : colors.background, borderColor: t === hbType ? ti.color : colors.border }]}>
                      <Ionicons name={ti.icon as any} size={13} color={t === hbType ? ti.color : colors.textMuted} />
                      <Text style={[styles.typeBtnText, { color: t === hbType ? ti.color : colors.textMuted }]}>{t.toUpperCase()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity onPress={handleUploadHandbook} style={[styles.submitBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="cloud-upload" size={14} color="#fff" />
                <Text style={styles.submitBtnText}>Upload Document</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={[styles.sectionHeading, { color: colors.text }]}>HR Library ({hrHandbooks.length})</Text>
          {hrHandbooks.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="library-outline" size={38} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No documents uploaded yet</Text>
            </View>
          )}
          {hrHandbooks.map(doc => {
            const ti = FILE_TYPE_ICONS[doc.fileType] ?? FILE_TYPE_ICONS.other;
            return (
              <View key={doc.id} style={[styles.fileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.fileIconWrap, { backgroundColor: ti.color + '18' }]}>
                  <Ionicons name={ti.icon as any} size={20} color={ti.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{doc.name}</Text>
                  <Text style={[styles.fileMeta, { color: colors.textMuted }]}>{doc.cat} · by {doc.uploadedBy}</Text>
                  <Text style={[styles.fileDate, { color: colors.textSubtle }]}>{fmtDateTime(doc.dt)}</Text>
                  {doc.approved && <Text style={[styles.approvedBy, { color: '#27500A' }]}>✓ Approved by {doc.approvedBy}</Text>}
                </View>
                {doc.approved ? (
                  <View style={[styles.statusPill, { backgroundColor: '#EAF3DE' }]}>
                    <Text style={[styles.statusPillText, { color: '#27500A' }]}>Live</Text>
                  </View>
                ) : isAdmin ? (
                  <TouchableOpacity onPress={() => approveHRHandbook(doc.id, userName || 'Admin')}
                    style={[styles.approveBtn, { backgroundColor: roleColor }]}>
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.statusPill, { backgroundColor: '#FAEEDA' }]}>
                    <Text style={[styles.statusPillText, { color: '#BA7517' }]}>Pending</Text>
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ═══════════════════════════════════════ RECOMMENDATIONS TAB */}
      {activeTab === 'recommendations' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Summary */}
          <View style={styles.statsRow}>
            {(['pending', 'approved', 'rejected'] as const).map(s => {
              const sm  = REC_STATUS_META[s];
              const cnt = hrRecommendations.filter(r => r.status === s).length;
              return (
                <View key={s} style={[styles.statCard, { backgroundColor: sm.bg }]}>
                  <Text style={[styles.statNum, { color: sm.color }]}>{cnt}</Text>
                  <Text style={[styles.statLabel, { color: sm.color }]}>{sm.label}</Text>
                </View>
              );
            })}
          </View>

          {hrRecommendations.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={38} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No recommendations submitted yet</Text>
            </View>
          )}

          {hrRecommendations.map(rec => {
            const rm  = REC_META[rec.type];
            const sm  = REC_STATUS_META[rec.status];
            return (
              <View key={rec.id} style={[styles.recCard, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: rm.color }]}>
                <View style={styles.recHeader}>
                  <View style={[styles.recIconWrap, { backgroundColor: rm.bg }]}>
                    <Ionicons name={rm.icon as any} size={18} color={rm.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.recName, { color: colors.text }]}>{rec.empName}</Text>
                    <Text style={[styles.recType, { color: rm.color }]}>{rm.label}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: sm.bg }]}>
                    <Text style={[styles.statusPillText, { color: sm.color }]}>{sm.label}</Text>
                  </View>
                </View>

                <View style={[styles.recBody, { borderTopColor: colors.border }]}>
                  <Text style={[styles.recReason, { color: colors.text }]}>{rec.reason}</Text>
                  <Text style={[styles.recMeta, { color: colors.textMuted }]}>
                    Recommended by {rec.by} · {fmtDateTime(rec.dt)}
                  </Text>
                  {rec.resolvedBy && (
                    <Text style={[styles.recMeta, { color: colors.textMuted }]}>
                      {rec.status === 'approved' ? 'Approved' : 'Rejected'} by {rec.resolvedBy} · {rec.resolvedAt ? fmtDateTime(rec.resolvedAt) : ''}
                    </Text>
                  )}
                </View>

                {isAdmin && rec.status === 'pending' && (
                  <View style={styles.recActions}>
                    <TouchableOpacity onPress={() => {
                      Alert.alert('Approve Recommendation', `Approve ${rm.label} for ${rec.empName}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Approve', style: 'destructive', onPress: () => resolveHRRecommendation(rec.id, 'approved', userName || 'Admin') },
                      ]);
                    }} style={[styles.recActionBtn, { backgroundColor: '#E74C3C' }]}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                      <Text style={styles.recActionText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => resolveHRRecommendation(rec.id, 'rejected', userName || 'Admin')}
                      style={[styles.recActionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                      <Ionicons name="close" size={14} color={colors.textMuted} />
                      <Text style={[styles.recActionText, { color: colors.textMuted }]}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  tabBar:      { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:      { flex: 1, alignItems: 'center', paddingVertical: 11, borderBottomWidth: 2 },
  tabBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabLabel:    { fontSize: 13 },
  tabBadge:    { minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeText:{ color: '#fff', fontSize: 9, fontWeight: '800' },
  scroll:      { padding: 14 },

  statsRow:  { flexDirection: 'row', gap: 7, marginBottom: 14 },
  statCard:  { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center' },
  statNum:   { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '600', marginTop: 2, textAlign: 'center' },

  searchRow:   { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchWrap:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 13 },
  addBtn:      { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  form:        { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 14, gap: 2 },
  formHeaderRow:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  formTitle:   { fontSize: 15, fontWeight: '700' },
  formHint:    { fontSize: 11, marginBottom: 8 },
  fieldLabel:  { fontSize: 11, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  textInput:   { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  textArea:    { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, minHeight: 72, textAlignVertical: 'top' },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  chipText:    { fontSize: 11, fontWeight: '600' },
  typeRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  recTypeBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  typeBtnText: { fontSize: 10, fontWeight: '700' },
  submitBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 10, marginTop: 12 },
  submitBtnText:{ color: '#fff', fontSize: 14, fontWeight: '700' },

  empCard:     { borderRadius: 14, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  empHeader:   { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 },
  avatar:      { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { color: '#fff', fontSize: 14, fontWeight: '800' },
  empTopRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  idBadge:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  idText:      { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  statusPill:  { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  statusPillText:{ fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  empName:     { fontSize: 14, fontWeight: '700' },
  empSub:      { fontSize: 11, marginTop: 1 },

  docChipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingHorizontal: 13, paddingBottom: 12 },
  docChip:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 },
  docChipText: { fontSize: 9, fontWeight: '700' },

  expanded:    { borderTopWidth: StyleSheet.hairlineWidth, padding: 13, gap: 6 },
  panelSection:{ fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  bioGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  bioItem:     { width: '47%' },
  bioLabel:    { fontSize: 10, marginBottom: 1 },
  bioValue:    { fontSize: 12, fontWeight: '600' },

  docRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  docRowIcon:  { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  docRowLabel: { fontSize: 12, fontWeight: '600' },
  docRowDate:  { fontSize: 10, marginTop: 1 },

  uploadRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9, borderRadius: 9, borderWidth: 1, marginBottom: 5 },
  fileIcon:    { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  fileName:    { fontSize: 12, fontWeight: '600' },
  fileMeta:    { fontSize: 10, marginTop: 1 },
  fileDate:    { fontSize: 10 },
  approvedBy:  { fontSize: 10, marginTop: 1 },

  sectionToggle:    { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 9, borderRadius: 9, borderWidth: 1, marginTop: 8 },
  sectionToggleText:{ fontSize: 12, fontWeight: '700' },
  uploadPanel:      { borderRadius: 10, borderWidth: 1, padding: 12, marginTop: 6, gap: 4 },

  approveBtn:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  approveBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  sectionHeading:{ fontSize: 14, fontWeight: '700', marginBottom: 10 },
  fileCard:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  fileIconWrap:  { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  empty:         { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText:     { fontSize: 14 },

  recCard:    { borderRadius: 14, borderWidth: 1, borderLeftWidth: 4, marginBottom: 10, overflow: 'hidden' },
  recHeader:  { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12 },
  recIconWrap:{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recName:    { fontSize: 14, fontWeight: '700' },
  recType:    { fontSize: 11, fontWeight: '600', marginTop: 1 },
  recBody:    { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 4 },
  recReason:  { fontSize: 13 },
  recMeta:    { fontSize: 10 },
  recActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  recActionBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 9 },
  recActionText:  { fontSize: 13, fontWeight: '700', color: '#fff' },
});
