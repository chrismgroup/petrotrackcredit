import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import {
  Alert, Modal, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import {
  GeneratedLetter, HRDocType, HRDocStatus, HREmployee, OnboardingStatus,
  ROLE_COLORS, fmtDate, fmtDateTime, useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const REQUIRED_DOCS: { type: HRDocType; label: string; icon: string; color: string }[] = [
  { type: 'biodata',        label: 'Bio-Data Form',         icon: 'person',            color: '#27AE60' },
  { type: 'contract',       label: 'Appointment Letter',    icon: 'document-text',     color: '#2980B9' },
  { type: 'guarantor',      label: 'Guarantor Form',        icon: 'people',            color: '#E67E22' },
  { type: 'nin',            label: 'NIN / National ID',     icon: 'card',              color: '#8E44AD' },
  { type: 'passport_photo', label: 'Passport Photograph',  icon: 'image',             color: '#D85A30' },
  { type: 'certificate',    label: 'Academic Certificate', icon: 'school',            color: '#0F6E56' },
  { type: 'nysc',           label: 'NYSC Certificate',     icon: 'ribbon',            color: '#185FA5' },
  { type: 'medical',        label: 'Medical Certificate',  icon: 'medkit',            color: '#E74C3C' },
  { type: 'reference',      label: 'Reference Letter',     icon: 'mail',              color: '#4527a0' },
  { type: 'bank_details',   label: 'Bank Details / Cheque',icon: 'wallet',            color: '#BA7517' },
  { type: 'tin',            label: 'Tax ID Number (TIN)',   icon: 'receipt',           color: '#633806' },
  { type: 'pension',        label: 'Pension Form (RSA)',    icon: 'shield-checkmark',  color: '#1a6e3c' },
];

const DOC_STATUS_META: Record<HRDocStatus, { label: string; color: string; bg: string; icon: string }> = {
  approved:  { label: 'Approved',  color: '#27500A', bg: '#EAF3DE', icon: 'checkmark-circle'  },
  submitted: { label: 'Uploaded',  color: '#185FA5', bg: '#DCF0FF', icon: 'cloud-done'        },
  pending:   { label: 'Missing',   color: '#BA7517', bg: '#FAEEDA', icon: 'alert-circle'      },
  'n/a':     { label: 'N/A',       color: '#7F8C8D', bg: '#F4F4F2', icon: 'remove-circle'     },
};

const ONBOARD_META: Record<OnboardingStatus, { label: string; color: string; bg: string; step: number }> = {
  draft:        { label: 'Draft',          color: '#7F8C8D', bg: '#F4F4F2', step: 0 },
  forwarded:    { label: 'Pending MD',     color: '#BA7517', bg: '#FAEEDA', step: 1 },
  md_approved:  { label: 'Pending CEO',    color: '#185FA5', bg: '#DCF0FF', step: 2 },
  ceo_approved: { label: 'Fully Approved', color: '#27500A', bg: '#EAF3DE', step: 3 },
};

const DEPARTMENTS = ['Operations', 'Finance', 'Marketing', 'Administration', 'Management', 'IT', 'Legal', 'HR'];
const DEPT_COLORS: Record<string, string> = {
  Operations: '#27ae60', Finance: '#185FA5', Marketing: '#D85A30',
  Administration: '#0F6E56', Management: '#4527a0', IT: '#2980B9', Legal: '#8E44AD', HR: '#E67E22',
};
const HANDBOOK_CATS = ['Handbook', 'Policy', 'Procedure', 'Circular', 'Notice', 'Other'];
const REC_META = {
  suspend:    { label: 'Suspension',           color: '#BA7517', bg: '#FAEEDA', icon: 'pause-circle'  },
  deactivate: { label: 'Account Deactivation', color: '#E74C3C', bg: '#FCEBEB', icon: 'close-circle'  },
  delete:     { label: 'Account Deletion',     color: '#7B1818', bg: '#FCEBEB', icon: 'trash'         },
};
const REC_STATUS_META = {
  pending:  { label: 'Pending Review', color: '#BA7517', bg: '#FAEEDA' },
  approved: { label: 'Approved',       color: '#27500A', bg: '#EAF3DE' },
  rejected: { label: 'Rejected',       color: '#7B1818', bg: '#FCEBEB' },
};

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
function fmtSize(b?: number) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function buildAppointmentLetter(emp: HREmployee, grade: string, salary: string, by: string) {
  const today = new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
  return `PETROTRACK NG LIMITED\nHR Department · Confidential\n\n${today}\n\nTo: ${emp.name}\n\nAPPOINTMENT LETTER\n\nDear ${emp.name.split(' ')[0]},\n\nWe are pleased to offer you employment with PetroTrack NG Limited in the capacity of ${emp.role}, effective ${fmtDate(emp.joinDate)}.\n\nPosition:    ${emp.role}\nDepartment:  ${emp.dept}\nStaff ID:    ${emp.empId}\nGrade Level: ${grade || 'As agreed'}\nAnnual Salary: ₦${salary ? Number(salary.replace(/,/g, '')).toLocaleString() : '—'}\n\nThis appointment is subject to:\n1. Satisfactory completion of all pre-employment documentation.\n2. A probationary period of three (3) months from the date of assumption of duties.\n3. Compliance with the Company's Code of Conduct and all HR policies.\n\nPlease sign and return a copy of this letter to confirm your acceptance.\n\nCongratulations and welcome to PetroTrack NG.\n\nYours sincerely,\n\n${by}\nCorporate Services Manager\nPetroTrack NG Limited`;
}

function buildPromotionLetter(emp: HREmployee, newRole: string, effDate: string, newGrade: string, by: string) {
  const today = new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
  const dateStr = effDate ? fmtDate(effDate) : today;
  return `PETROTRACK NG LIMITED\nHR Department · Confidential\n\n${today}\n\nTo: ${emp.name}\nStaff ID: ${emp.empId}\nCurrent Position: ${emp.role}\n\nLETTER OF PROMOTION\n\nDear ${emp.name.split(' ')[0]},\n\nOn behalf of Management of PetroTrack NG Limited, we are delighted to inform you of your promotion to the position of ${newRole}, effective ${dateStr}.\n\nNew Position: ${newRole}\nDepartment:   ${emp.dept}\nEffective:    ${dateStr}\nNew Grade:    ${newGrade || 'As communicated'}\n\nThis promotion is in recognition of your dedication, hard work, and consistent contribution to the growth of the organisation. We are confident that you will excel in your new role.\n\nApplicable salary and benefits adjustments will be communicated by the Finance department.\n\nCongratulations on this well-deserved achievement!\n\nYours sincerely,\n\n${by}\nCorporate Services Manager\nPetroTrack NG Limited`;
}

type TabId = 'employees' | 'handbooks' | 'recommendations' | 'approvals';

export default function HRScreen() {
  const {
    role, userName,
    hrEmployees, hrRecommendations, hrHandbooks,
    addHREmployee, removeHREmployee,
    addUserAccount,
    uploadHRDocFile, approveHRUpload,
    addHRRecommendation, resolveHRRecommendation,
    addHRHandbook, approveHRHandbook,
    forwardOnboardingForApproval, approveOnboarding, addGeneratedLetter,
  } = useApp();

  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'csm'] || colors.primary;
  const isCSM     = role === 'csm';
  const isMD      = role === 'md';
  const isCEO     = role === 'ceo';
  const isAdmin   = role === 'admin';
  const canApprove = isMD || isCEO;

  const [activeTab, setActiveTab] = useState<TabId>(canApprove ? 'approvals' : 'employees');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [showAdd,    setShowAdd]    = useState(false);
  const [newName,    setNewName]    = useState('');
  const [newJobRole, setNewJobRole] = useState('');
  const [newDept,    setNewDept]    = useState(DEPARTMENTS[0]);
  const [newPhone,   setNewPhone]   = useState('');
  const [newEmail,   setNewEmail]   = useState('');
  const [newAddr,    setNewAddr]    = useState('');
  const [newDob,     setNewDob]     = useState('');
  const [newKin,     setNewKin]     = useState('');

  const [hbCat, setHbCat] = useState(HANDBOOK_CATS[0]);

  const [recEmpId,  setRecEmpId]  = useState<number | null>(null);
  const [recType,   setRecType]   = useState<'suspend' | 'deactivate' | 'delete'>('suspend');
  const [recReason, setRecReason] = useState('');

  const [letterModal,   setLetterModal]   = useState<null | 'appointment' | 'promotion'>(null);
  const [letterEmpId,   setLetterEmpId]   = useState<number | null>(null);
  const [letterGrade,   setLetterGrade]   = useState('');
  const [letterSalary,  setLetterSalary]  = useState('');
  const [letterNewRole, setLetterNewRole] = useState('');
  const [letterEffDate, setLetterEffDate] = useState('');
  const [letterNewGrade,setLetterNewGrade]= useState('');
  const [viewLetter,    setViewLetter]    = useState<GeneratedLetter | null>(null);

  const filteredStaff = hrEmployees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.empId.toLowerCase().includes(search.toLowerCase()) ||
    e.dept.toLowerCase().includes(search.toLowerCase())
  );

  const pendingRecs  = hrRecommendations.filter(r => r.status === 'pending').length;
  const pendingBooks = hrHandbooks.filter(h => !h.approved).length;
  const pendingApprovals = hrEmployees.filter(e => {
    if (isMD)  return e.onboarding?.status === 'forwarded';
    if (isCEO) return e.onboarding?.status === 'forwarded' || e.onboarding?.status === 'md_approved';
    return false;
  }).length;

  function handleAddEmployee() {
    if (!newName.trim() || !newJobRole.trim()) { Alert.alert('Required', 'Name and job title are required.'); return; }
    const today = new Date().toISOString().split('T')[0];
    addHREmployee({
      name: newName.trim(), role: newJobRole.trim(), dept: newDept,
      phone: newPhone.trim() || '—', email: newEmail.trim() || '—',
      address: newAddr.trim() || '—', dob: newDob.trim() || '—',
      joinDate: today, nextOfKin: newKin.trim() || '—',
      status: 'active', docs: [], uploads: [],
      onboarding: { status: 'draft' }, letters: [],
    });
    addUserAccount({ empName: newName.trim(), jobTitle: newJobRole.trim(), dept: newDept, createdBy: userName || 'CSM' });
    setNewName(''); setNewJobRole(''); setNewPhone(''); setNewEmail('');
    setNewAddr(''); setNewDob(''); setNewKin(''); setNewDept(DEPARTMENTS[0]);
    setShowAdd(false);
    Alert.alert('Onboarded', `${newName.trim()} registered.\n\nUpload the required documents below, then forward to MD & CEO for final approval.`);
  }

  async function handlePickDocFile(empId: number, docType: HRDocType) {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      uploadHRDocFile(empId, docType, file.name, file.uri, file.mimeType ?? undefined, file.size ?? undefined);
      Alert.alert('Uploaded', `${file.name} uploaded successfully.`);
    } catch {
      Alert.alert('Error', 'Could not pick file. Please try again.');
    }
  }

  async function handlePickHandbook() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'other';
      addHRHandbook({ name: file.name, fileType: ext, cat: hbCat, uploadedBy: userName || 'HR' });
      Alert.alert('Uploaded', `${file.name} uploaded. Awaiting approval.`);
    } catch {
      Alert.alert('Error', 'Could not pick file. Please try again.');
    }
  }

  function handleForward(emp: HREmployee) {
    const missing = emp.docs.filter(d => d.status === 'pending').length;
    const msg = missing > 0
      ? `${missing} document(s) still missing.\n\nForward anyway for partial review?`
      : 'All documents uploaded. Forward to MD & CEO for final approval?';
    Alert.alert('Forward for Approval', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Forward', onPress: () => {
        forwardOnboardingForApproval(emp.id, userName || 'CSM');
        Alert.alert('Forwarded', 'Onboarding forwarded to MD and CEO for final approval.');
      }},
    ]);
  }

  function handleApprove(empId: number, stage: 'md' | 'ceo') {
    Alert.alert(`${stage === 'md' ? 'MD' : 'CEO'} Approval`, 'Confirm final approval for this employee onboarding?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => {
        approveOnboarding(empId, stage, userName || '');
        Alert.alert('Approved', `${stage === 'md' ? 'MD' : 'CEO'} approval recorded successfully.`);
      }},
    ]);
  }

  function handleRecommend(empId: number) {
    if (!recReason.trim()) { Alert.alert('Required', 'Please provide a reason.'); return; }
    const emp = hrEmployees.find(e => e.id === empId);
    if (!emp) return;
    addHRRecommendation({ empId, empName: emp.name, type: recType, reason: recReason.trim(), by: userName || 'HR' });
    setRecEmpId(null); setRecReason('');
    Alert.alert('Sent', `Recommendation for ${emp.name} sent for review.`);
  }

  function handleGenerateLetter() {
    const emp = hrEmployees.find(e => e.id === letterEmpId);
    if (!emp || !letterModal) return;
    let content = '';
    let title   = '';
    if (letterModal === 'appointment') {
      content = buildAppointmentLetter(emp, letterGrade, letterSalary, userName || 'CSM');
      title   = `Appointment Letter — ${emp.name}`;
    } else {
      if (!letterNewRole.trim()) { Alert.alert('Required', 'New position is required.'); return; }
      content = buildPromotionLetter(emp, letterNewRole.trim(), letterEffDate, letterNewGrade, userName || 'CSM');
      title   = `Promotion Letter — ${emp.name} → ${letterNewRole.trim()}`;
    }
    addGeneratedLetter(emp.id, { type: letterModal, title, content, generatedBy: userName || 'CSM', newRole: letterNewRole || undefined });
    setLetterModal(null); setLetterEmpId(null);
    setLetterGrade(''); setLetterSalary(''); setLetterNewRole(''); setLetterEffDate(''); setLetterNewGrade('');
    Alert.alert('Letter Generated', `${title}\n\nSaved to employee file.`);
  }

  function docProgress(emp: HREmployee) {
    const total     = emp.docs.length;
    const submitted = emp.docs.filter(d => d.status !== 'pending').length;
    return { submitted, total, pct: total ? submitted / total : 0 };
  }

  const TABS: { key: TabId; label: string; badge?: number }[] = canApprove ? [
    { key: 'approvals',  label: 'Approvals', badge: pendingApprovals },
    { key: 'employees',  label: 'Staff' },
    { key: 'handbooks',  label: 'Library' },
  ] : [
    { key: 'employees',      label: 'Staff' },
    { key: 'handbooks',      label: 'Library',  badge: pendingBooks },
    { key: 'recommendations',label: 'Actions',  badge: pendingRecs  },
  ];

  function renderDocChecklist(emp: HREmployee) {
    if (!emp.docs.length) return null;
    return (
      <>
        <Text style={[styles.panelSection, { color: colors.text }]}>Required Documents</Text>
        {REQUIRED_DOCS.map(rd => {
          const doc = emp.docs.find(d => d.type === rd.type);
          if (!doc) return null;
          const sm = DOC_STATUS_META[doc.status];
          return (
            <View key={rd.type} style={[styles.docCheckRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <View style={[styles.docCheckIcon, { backgroundColor: rd.color + '18' }]}>
                <Ionicons name={rd.icon as any} size={14} color={rd.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.docCheckLabel, { color: colors.text }]}>{rd.label}</Text>
                {doc.fileName && <Text style={[styles.docCheckFile, { color: colors.textMuted }]} numberOfLines={1}>{doc.fileName}</Text>}
                {doc.date && <Text style={[styles.docCheckDate, { color: colors.textSubtle }]}>{fmtDate(doc.date)}</Text>}
              </View>
              <View style={[styles.docStatusBadge, { backgroundColor: sm.bg }]}>
                <Ionicons name={sm.icon as any} size={10} color={sm.color} />
                <Text style={[styles.docStatusText, { color: sm.color }]}>{sm.label}</Text>
              </View>
              {isCSM && (doc.status === 'pending' || doc.status === 'n/a') && (
                <TouchableOpacity
                  onPress={() => handlePickDocFile(emp.id, rd.type)}
                  style={[styles.uploadBtn, { backgroundColor: roleColor }]}
                >
                  <Ionicons name="cloud-upload-outline" size={11} color="#fff" />
                  <Text style={styles.uploadBtnText}>Upload</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </>
    );
  }

  function renderLetters(emp: HREmployee) {
    return (
      <>
        <Text style={[styles.panelSection, { color: colors.text }]}>Generated Letters</Text>
        {isCSM && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <TouchableOpacity
              onPress={() => { setLetterEmpId(emp.id); setLetterModal('appointment'); }}
              style={[styles.letterBtn, { backgroundColor: '#2980B9' + '18', borderColor: '#2980B9' + '44' }]}
            >
              <Ionicons name="document-text-outline" size={13} color="#2980B9" />
              <Text style={[styles.letterBtnText, { color: '#2980B9' }]}>Appointment Letter</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setLetterEmpId(emp.id); setLetterModal('promotion'); }}
              style={[styles.letterBtn, { backgroundColor: '#8E44AD' + '18', borderColor: '#8E44AD' + '44' }]}
            >
              <Ionicons name="ribbon-outline" size={13} color="#8E44AD" />
              <Text style={[styles.letterBtnText, { color: '#8E44AD' }]}>Promotion Letter</Text>
            </TouchableOpacity>
          </View>
        )}
        {(emp.letters ?? []).length === 0 ? (
          <Text style={[styles.noLetters, { color: colors.textMuted }]}>No letters generated yet.</Text>
        ) : (emp.letters ?? []).map(l => (
          <TouchableOpacity key={l.id} onPress={() => setViewLetter(l)}
            style={[styles.letterCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name={l.type === 'promotion' ? 'ribbon' : 'document-text'} size={16} color={l.type === 'promotion' ? '#8E44AD' : '#2980B9'} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.letterCardTitle, { color: colors.text }]} numberOfLines={1}>{l.title}</Text>
              <Text style={[styles.letterCardMeta, { color: colors.textMuted }]}>By {l.generatedBy} · {fmtDateTime(l.generatedAt)}</Text>
            </View>
            <Ionicons name="eye-outline" size={15} color={colors.textSubtle} />
          </TouchableOpacity>
        ))}
      </>
    );
  }

  function renderOnboardingStatus(emp: HREmployee) {
    const ob = emp.onboarding ?? { status: 'draft' };
    const meta = ONBOARD_META[ob.status];
    const steps = [
      { label: 'Submitted',    done: ob.status !== 'draft',       by: ob.forwardedBy,   at: ob.forwardedAt },
      { label: 'MD Approved',  done: ob.status === 'md_approved' || ob.status === 'ceo_approved', by: ob.mdApprovedBy, at: ob.mdApprovedAt },
      { label: 'CEO Approved', done: ob.status === 'ceo_approved', by: ob.ceoApprovedBy, at: ob.ceoApprovedAt },
    ];
    return (
      <View style={[styles.onboardSection, { borderColor: meta.bg, backgroundColor: meta.bg + '88' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <View style={[styles.onboardBadge, { backgroundColor: meta.bg, borderColor: meta.color + '44' }]}>
            <Text style={[styles.onboardBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          {isCSM && (ob.status === 'draft' || ob.status === 'forwarded') && (
            <TouchableOpacity onPress={() => handleForward(emp)}
              style={[styles.forwardBtn, { backgroundColor: roleColor }]}>
              <Ionicons name="send" size={12} color="#fff" />
              <Text style={styles.forwardBtnText}>{ob.status === 'draft' ? 'Forward for Approval' : 'Re-Forward'}</Text>
            </TouchableOpacity>
          )}
          {isMD && ob.status === 'forwarded' && (
            <TouchableOpacity onPress={() => handleApprove(emp.id, 'md')}
              style={[styles.forwardBtn, { backgroundColor: '#4527a0' }]}>
              <Ionicons name="checkmark-circle" size={12} color="#fff" />
              <Text style={styles.forwardBtnText}>MD Approve</Text>
            </TouchableOpacity>
          )}
          {isCEO && (ob.status === 'forwarded' || ob.status === 'md_approved') && (
            <TouchableOpacity onPress={() => handleApprove(emp.id, 'ceo')}
              style={[styles.forwardBtn, { backgroundColor: '#1a6e3c' }]}>
              <Ionicons name="checkmark-circle" size={12} color="#fff" />
              <Text style={styles.forwardBtnText}>CEO Approve</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.stepsRow}>
          {steps.map((s, i) => (
            <React.Fragment key={s.label}>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <View style={[styles.stepDot, { backgroundColor: s.done ? '#27500A' : colors.border, borderColor: s.done ? '#27500A' : colors.border }]}>
                  <Ionicons name={s.done ? 'checkmark' : 'ellipse-outline'} size={10} color={s.done ? '#fff' : colors.textSubtle} />
                </View>
                <Text style={[styles.stepLabel, { color: s.done ? '#27500A' : colors.textSubtle }]}>{s.label}</Text>
                {s.done && s.by && <Text style={[styles.stepBy, { color: colors.textSubtle }]}>{s.by}</Text>}
              </View>
              {i < steps.length - 1 && (
                <View style={[styles.stepLine, { backgroundColor: steps[i + 1].done ? '#27500A' : colors.border }]} />
              )}
            </React.Fragment>
          ))}
        </View>
      </View>
    );
  }

  function renderEmployeeCard(emp: HREmployee) {
    const deptColor  = DEPT_COLORS[emp.dept] ?? roleColor;
    const isExpanded = expandedId === emp.id;
    const stCol = emp.status === 'active' ? { col: '#27500A', bg: '#EAF3DE' }
      : emp.status === 'suspended' ? { col: '#BA7517', bg: '#FAEEDA' }
      : { col: '#7B1818', bg: '#FCEBEB' };
    const { submitted, total, pct } = docProgress(emp);
    const ob = emp.onboarding ?? { status: 'draft' };
    const obMeta = ONBOARD_META[ob.status];

    return (
      <View key={emp.id} style={[styles.empCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity style={styles.empHeader} onPress={() => setExpandedId(isExpanded ? null : emp.id)} activeOpacity={0.7}>
          <View style={[styles.avatar, { backgroundColor: deptColor }]}>
            <Text style={styles.avatarText}>{initials(emp.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <View style={[styles.idBadge, { backgroundColor: deptColor + '18', borderColor: deptColor + '44' }]}>
                <Text style={[styles.idText, { color: deptColor }]}>{emp.empId}</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: stCol.bg }]}>
                <Text style={[styles.pillText, { color: stCol.col }]}>{emp.status}</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: obMeta.bg }]}>
                <Text style={[styles.pillText, { color: obMeta.color }]}>{obMeta.label}</Text>
              </View>
            </View>
            <Text style={[styles.empName, { color: colors.text }]}>{emp.name}</Text>
            <Text style={[styles.empSub,  { color: colors.textMuted }]}>{emp.role} · {emp.dept}</Text>
          </View>
          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {total > 0 && (
          <View style={{ paddingHorizontal: 13, paddingBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text style={[styles.progLabel, { color: colors.textMuted }]}>Documents</Text>
              <Text style={[styles.progLabel, { color: colors.textMuted }]}>{submitted}/{total}</Text>
            </View>
            <View style={[styles.progBar, { backgroundColor: colors.border }]}>
              <View style={[styles.progFill, { width: `${pct * 100}%` as any, backgroundColor: pct === 1 ? '#27500A' : roleColor }]} />
            </View>
          </View>
        )}

        {isExpanded && (
          <View style={[styles.expanded, { borderTopColor: colors.border }]}>
            <Text style={[styles.panelSection, { color: colors.text }]}>Personal Information</Text>
            <View style={styles.bioGrid}>
              {[
                { label: 'Company ID', value: emp.empId },
                { label: 'Dept',       value: emp.dept   },
                { label: 'Phone',      value: emp.phone  },
                { label: 'Email',      value: emp.email  },
                { label: 'Date of Birth', value: emp.dob },
                { label: 'Join Date',  value: fmtDate(emp.joinDate) },
                { label: 'Next of Kin',value: emp.nextOfKin },
                { label: 'Address',   value: emp.address  },
              ].map(item => (
                <View key={item.label} style={styles.bioItem}>
                  <Text style={[styles.bioLabel, { color: colors.textMuted }]}>{item.label}</Text>
                  <Text style={[styles.bioValue, { color: colors.text }]}>{item.value}</Text>
                </View>
              ))}
            </View>

            {renderDocChecklist(emp)}

            {isCSM && renderLetters(emp)}

            <Text style={[styles.panelSection, { color: colors.text }]}>Onboarding Approval</Text>
            {renderOnboardingStatus(emp)}

            {isCSM && emp.status === 'active' && (
              <>
                <TouchableOpacity onPress={() => setRecEmpId(recEmpId === emp.id ? null : emp.id)}
                  style={[styles.sectionToggle, { borderColor: '#E74C3C55', backgroundColor: '#E74C3C0a' }]}>
                  <Ionicons name="alert-circle-outline" size={14} color="#E74C3C" />
                  <Text style={[styles.sectionToggleText, { color: '#E74C3C' }]}>
                    {recEmpId === emp.id ? 'Close' : 'Recommend Action'}
                  </Text>
                </TouchableOpacity>
                {recEmpId === emp.id && (
                  <View style={[styles.panel, { backgroundColor: colors.background, borderColor: '#E74C3C44' }]}>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Action Type</Text>
                    <View style={styles.chipRow}>
                      {(['suspend', 'deactivate', 'delete'] as const).map(t => {
                        const rm = REC_META[t];
                        return (
                          <TouchableOpacity key={t} onPress={() => setRecType(t)}
                            style={[styles.chip, { backgroundColor: t === recType ? rm.color + '22' : colors.surface, borderColor: t === recType ? rm.color : colors.border }]}>
                            <Ionicons name={rm.icon as any} size={12} color={t === recType ? rm.color : colors.textMuted} />
                            <Text style={[styles.chipText, { color: t === recType ? rm.color : colors.textMuted }]}>{rm.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Reason *</Text>
                    <TextInput value={recReason} onChangeText={setRecReason}
                      placeholder="Briefly explain…" placeholderTextColor={colors.textMuted}
                      multiline numberOfLines={3}
                      style={[styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
                    <TouchableOpacity onPress={() => handleRecommend(emp.id)}
                      style={[styles.submitBtn, { backgroundColor: '#E74C3C' }]}>
                      <Ionicons name="send" size={13} color="#fff" />
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
  }

  return (
    <ScreenLayout title="HR Panel">
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

      {activeTab === 'employees' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.statsRow}>
            {[
              { n: hrEmployees.length,                                       label: 'Total',     col: roleColor,    bg: roleColor + '12' },
              { n: hrEmployees.filter(e => e.status === 'active').length,    label: 'Active',    col: '#27500A',    bg: '#EAF3DE' },
              { n: hrEmployees.filter(e => e.status === 'suspended').length, label: 'Suspended', col: '#BA7517',    bg: '#FAEEDA' },
              { n: hrEmployees.filter(e => e.onboarding?.status === 'ceo_approved').length, label: 'Approved', col: '#185FA5', bg: '#DCF0FF' },
            ].map(s => (
              <View key={s.label} style={[styles.statCard, { backgroundColor: s.bg }]}>
                <Text style={[styles.statNum, { color: s.col }]}>{s.n}</Text>
                <Text style={[styles.statLabel, { color: s.col }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.searchRow}>
            <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={15} color={colors.textMuted} />
              <TextInput placeholder="Search name, ID, department…" placeholderTextColor={colors.textMuted}
                value={search} onChangeText={setSearch}
                style={[styles.searchInput, { color: colors.text }]} />
            </View>
            {isCSM && (
              <TouchableOpacity onPress={() => setShowAdd(v => !v)}
                style={[styles.addBtn, { backgroundColor: roleColor }]}>
                <Ionicons name={showAdd ? 'close' : 'person-add'} size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {showAdd && isCSM && (
            <View style={[styles.form, { backgroundColor: colors.surface, borderColor: roleColor + '44' }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>Onboard New Employee</Text>
              <Text style={[styles.formHint, { color: colors.textMuted }]}>Company ID (PTNG-XXXX) auto-assigned on save.</Text>
              {[
                { label: 'Full Name *',   val: newName,    set: setNewName,    ph: 'e.g. Kelechi Nwosu' },
                { label: 'Job Title *',   val: newJobRole, set: setNewJobRole, ph: 'e.g. Senior Accountant' },
                { label: 'Phone',         val: newPhone,   set: setNewPhone,   ph: '+234 8XX XXX XXXX' },
                { label: 'Email',         val: newEmail,   set: setNewEmail,   ph: 'name@petrotrack.ng' },
                { label: 'Date of Birth', val: newDob,     set: setNewDob,     ph: 'YYYY-MM-DD' },
                { label: 'Home Address',  val: newAddr,    set: setNewAddr,    ph: 'Street, City' },
                { label: 'Next of Kin',   val: newKin,     set: setNewKin,     ph: 'Full name' },
              ].map(f => (
                <View key={f.label}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{f.label}</Text>
                  <TextInput value={f.val} onChangeText={f.set} placeholder={f.ph}
                    placeholderTextColor={colors.textMuted}
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
              <TouchableOpacity onPress={handleAddEmployee}
                style={[styles.submitBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>Onboard Employee</Text>
              </TouchableOpacity>
            </View>
          )}

          {filteredStaff.map(emp => renderEmployeeCard(emp))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {activeTab === 'approvals' && canApprove && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {(() => {
            const list = hrEmployees.filter(e => {
              if (isMD)  return e.onboarding?.status === 'forwarded';
              if (isCEO) return e.onboarding?.status === 'forwarded' || e.onboarding?.status === 'md_approved';
              return false;
            });
            if (list.length === 0) return (
              <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Ionicons name="checkmark-done-circle-outline" size={40} color={colors.textSubtle} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No pending onboarding approvals</Text>
              </View>
            );
            return list.map(emp => {
              const ob = emp.onboarding;
              const { submitted, total } = docProgress(emp);
              const deptColor = DEPT_COLORS[emp.dept] ?? roleColor;
              return (
                <View key={emp.id} style={[styles.approvalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <View style={[styles.avatar, { backgroundColor: deptColor }]}>
                      <Text style={styles.avatarText}>{initials(emp.name)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.empName, { color: colors.text }]}>{emp.name}</Text>
                      <Text style={[styles.empSub, { color: colors.textMuted }]}>{emp.role} · {emp.dept}</Text>
                      <Text style={[styles.empSub, { color: colors.textSubtle }]}>{emp.empId}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    {[
                      { label: `${submitted}/${total} docs uploaded`, icon: 'document', color: submitted === total ? '#27500A' : '#BA7517' },
                      ...(ob.forwardedBy ? [{ label: `Fwd by ${ob.forwardedBy}`, icon: 'send', color: '#185FA5' }] : []),
                      ...(ob.mdApprovedBy ? [{ label: `MD: ${ob.mdApprovedBy}`, icon: 'checkmark-circle', color: '#27500A' }] : []),
                    ].map((b, i) => (
                      <View key={i} style={[styles.approvalMeta, { backgroundColor: b.color + '12' }]}>
                        <Ionicons name={b.icon as any} size={10} color={b.color} />
                        <Text style={[styles.approvalMetaText, { color: b.color }]}>{b.label}</Text>
                      </View>
                    ))}
                  </View>

                  {renderOnboardingStatus(emp)}
                </View>
              );
            });
          })()}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {activeTab === 'handbooks' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {isCSM && (
            <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
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
              <TouchableOpacity onPress={handlePickHandbook}
                style={[styles.submitBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="cloud-upload" size={14} color="#fff" />
                <Text style={styles.submitBtnText}>Choose & Upload File (any format)</Text>
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
          {hrHandbooks.map(doc => (
            <View key={doc.id} style={[styles.fileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.fileIconWrap, { backgroundColor: '#185FA5' + '18' }]}>
                <Ionicons name="document-attach" size={20} color="#185FA5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{doc.name}</Text>
                <Text style={[styles.fileMeta, { color: colors.textMuted }]}>{doc.cat} · by {doc.uploadedBy}</Text>
                <Text style={[styles.fileDate, { color: colors.textSubtle }]}>{fmtDateTime(doc.dt)}</Text>
                {doc.approved && <Text style={[styles.approvedBy, { color: '#27500A' }]}>✓ Approved by {doc.approvedBy}</Text>}
              </View>
              {doc.approved ? (
                <View style={[styles.pill, { backgroundColor: '#EAF3DE' }]}>
                  <Text style={[styles.pillText, { color: '#27500A' }]}>Live</Text>
                </View>
              ) : isAdmin ? (
                <TouchableOpacity onPress={() => approveHRHandbook(doc.id, userName || 'Admin')}
                  style={[styles.approveBtn, { backgroundColor: roleColor }]}>
                  <Text style={styles.approveBtnText}>Approve</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.pill, { backgroundColor: '#FAEEDA' }]}>
                  <Text style={[styles.pillText, { color: '#BA7517' }]}>Pending</Text>
                </View>
              )}
            </View>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {activeTab === 'recommendations' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No recommendations yet</Text>
            </View>
          )}
          {hrRecommendations.map(rec => {
            const rm = REC_META[rec.type];
            const sm = REC_STATUS_META[rec.status];
            return (
              <View key={rec.id} style={[styles.recCard, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: rm.color }]}>
                <View style={styles.recHeader}>
                  <View style={[styles.recIcon, { backgroundColor: rm.bg }]}>
                    <Ionicons name={rm.icon as any} size={18} color={rm.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.recName, { color: colors.text }]}>{rec.empName}</Text>
                    <Text style={[styles.recType, { color: rm.color }]}>{rm.label}</Text>
                  </View>
                  <View style={[styles.pill, { backgroundColor: sm.bg }]}>
                    <Text style={[styles.pillText, { color: sm.color }]}>{sm.label}</Text>
                  </View>
                </View>
                <View style={[styles.recBody, { borderTopColor: colors.border }]}>
                  <Text style={[styles.recReason, { color: colors.text }]}>{rec.reason}</Text>
                  <Text style={[styles.recMeta, { color: colors.textMuted }]}>By {rec.by} · {fmtDateTime(rec.dt)}</Text>
                </View>
                {isAdmin && rec.status === 'pending' && (
                  <View style={styles.recActions}>
                    <TouchableOpacity onPress={() => {
                      Alert.alert('Approve', `Approve ${rm.label} for ${rec.empName}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Approve', style: 'destructive', onPress: () => resolveHRRecommendation(rec.id, 'approved', userName || 'Admin') },
                      ]);
                    }} style={[styles.recActionBtn, { backgroundColor: '#E74C3C' }]}>
                      <Ionicons name="checkmark" size={13} color="#fff" />
                      <Text style={styles.recActionText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => resolveHRRecommendation(rec.id, 'rejected', userName || 'Admin')}
                      style={[styles.recActionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                      <Ionicons name="close" size={13} color={colors.textMuted} />
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

      {/* ── Generate Letter Modal ── */}
      <Modal visible={!!letterModal} transparent animationType="slide" onRequestClose={() => setLetterModal(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setLetterModal(null)} />
          <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {letterModal === 'appointment' ? 'Generate Appointment Letter' : 'Generate Promotion Letter'}
            </Text>
            {letterModal === 'appointment' && (
              <>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Grade Level (optional)</Text>
                <TextInput value={letterGrade} onChangeText={setLetterGrade}
                  placeholder="e.g. GL 08" placeholderTextColor={colors.textMuted}
                  style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Annual Salary ₦ (optional)</Text>
                <TextInput value={letterSalary} onChangeText={setLetterSalary}
                  placeholder="e.g. 1200000" placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
              </>
            )}
            {letterModal === 'promotion' && (
              <>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>New Position *</Text>
                <TextInput value={letterNewRole} onChangeText={setLetterNewRole}
                  placeholder="e.g. Senior Accountant" placeholderTextColor={colors.textMuted}
                  style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>New Grade Level</Text>
                <TextInput value={letterNewGrade} onChangeText={setLetterNewGrade}
                  placeholder="e.g. GL 10" placeholderTextColor={colors.textMuted}
                  style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Effective Date</Text>
                <TextInput value={letterEffDate} onChangeText={setLetterEffDate}
                  placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted}
                  style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
              </>
            )}
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Employee</Text>
            <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
              {hrEmployees.map(emp => (
                <TouchableOpacity key={emp.id} onPress={() => setLetterEmpId(emp.id)}
                  style={[styles.empPickRow, {
                    backgroundColor: letterEmpId === emp.id ? roleColor + '12' : colors.surface,
                    borderColor: letterEmpId === emp.id ? roleColor : colors.border,
                  }]}>
                  <View style={[styles.miniAvatar, { backgroundColor: DEPT_COLORS[emp.dept] ?? roleColor }]}>
                    <Text style={styles.miniAvatarText}>{initials(emp.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.empPickName, { color: letterEmpId === emp.id ? roleColor : colors.text }]}>{emp.name}</Text>
                    <Text style={[styles.empPickRole, { color: colors.textMuted }]}>{emp.role}</Text>
                  </View>
                  {letterEmpId === emp.id && <Ionicons name="checkmark-circle" size={18} color={roleColor} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 32 }}>
              <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleGenerateLetter}>
                <Ionicons name="document-text" size={14} color="#fff" />
                <Text style={styles.submitBtnText}>Generate Letter</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setLetterModal(null)}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── View Letter Modal ── */}
      <Modal visible={!!viewLetter} transparent animationType="slide" onRequestClose={() => setViewLetter(null)}>
        <View style={[styles.overlay, { justifyContent: 'flex-end' }]}>
          <View style={[styles.sheet, { backgroundColor: colors.background, maxHeight: '90%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Ionicons name={viewLetter?.type === 'promotion' ? 'ribbon' : 'document-text'} size={18}
                color={viewLetter?.type === 'promotion' ? '#8E44AD' : '#2980B9'} />
              <Text style={[styles.sheetTitle, { color: colors.text, flex: 1, marginBottom: 0 }]} numberOfLines={2}>
                {viewLetter?.title}
              </Text>
              <TouchableOpacity onPress={() => setViewLetter(null)}>
                <Ionicons name="close-circle" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.letterMeta, { color: colors.textMuted }]}>
              Generated by {viewLetter?.generatedBy} · {viewLetter ? fmtDateTime(viewLetter.generatedAt) : ''}
            </Text>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator>
              <View style={[styles.letterContent, { backgroundColor: '#f9f9f7', borderColor: colors.border }]}>
                <Text style={styles.letterText}>{viewLetter?.content}</Text>
              </View>
            </ScrollView>
            <TouchableOpacity onPress={() => setViewLetter(null)}
              style={[styles.submitBtn, { backgroundColor: colors.surface, marginTop: 10 }]}>
              <Text style={[styles.submitBtnText, { color: colors.text }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  tabBar:      { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:      { flex: 1, alignItems: 'center', paddingVertical: 11, borderBottomWidth: 2 },
  tabBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabLabel:    { fontSize: 12 },
  tabBadge:    { minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeText:{ color: '#fff', fontSize: 9, fontWeight: '800' },
  scroll:      { padding: 14 },

  statsRow:  { flexDirection: 'row', gap: 6, marginBottom: 14 },
  statCard:  { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center' },
  statNum:   { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '600', marginTop: 2, textAlign: 'center' },

  searchRow:   { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchWrap:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 13 },
  addBtn:      { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  form:        { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 14, gap: 2 },
  formTitle:   { fontSize: 15, fontWeight: '700' },
  formHint:    { fontSize: 11, marginBottom: 8 },
  fieldLabel:  { fontSize: 11, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  textInput:   { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  textArea:    { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, minHeight: 72, textAlignVertical: 'top' },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  chipText:    { fontSize: 11, fontWeight: '600' },
  submitBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 10, marginTop: 12 },
  submitBtnText:{ color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn:   { borderRadius: 10, marginTop: 12, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ccc' },
  cancelBtnText:{ fontSize: 14, fontWeight: '600' },

  empCard:    { borderRadius: 14, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  empHeader:  { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 },
  avatar:     { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  idBadge:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  idText:     { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  pill:       { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  pillText:   { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  empName:    { fontSize: 14, fontWeight: '700' },
  empSub:     { fontSize: 11, marginTop: 1 },

  progLabel:  { fontSize: 10, fontWeight: '600' },
  progBar:    { height: 4, borderRadius: 2, overflow: 'hidden' },
  progFill:   { height: '100%', borderRadius: 2 },

  expanded:     { borderTopWidth: StyleSheet.hairlineWidth, padding: 13, gap: 6 },
  panelSection: { fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  bioGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  bioItem:      { width: '47%' },
  bioLabel:     { fontSize: 10, marginBottom: 1 },
  bioValue:     { fontSize: 12, fontWeight: '600' },

  docCheckRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 9, borderWidth: 1, marginBottom: 5 },
  docCheckIcon:   { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  docCheckLabel:  { fontSize: 12, fontWeight: '600' },
  docCheckFile:   { fontSize: 10, marginTop: 1 },
  docCheckDate:   { fontSize: 10 },
  docStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 },
  docStatusText:  { fontSize: 9, fontWeight: '700' },
  uploadBtn:      { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6 },
  uploadBtnText:  { color: '#fff', fontSize: 10, fontWeight: '700' },

  letterBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  letterBtnText: { fontSize: 11, fontWeight: '600', flex: 1 },
  letterCard:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 9, borderWidth: 1, marginBottom: 5 },
  letterCardTitle:{ fontSize: 12, fontWeight: '600', flex: 1 },
  letterCardMeta: { fontSize: 10, marginTop: 2 },
  noLetters:      { fontSize: 11, fontStyle: 'italic', marginBottom: 4 },

  onboardSection: { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 4 },
  onboardBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  onboardBadgeText:{ fontSize: 10, fontWeight: '700' },
  forwardBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  forwardBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  stepsRow:       { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 4 },
  stepDot:        { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, marginBottom: 3 },
  stepLabel:      { fontSize: 9, fontWeight: '600', textAlign: 'center' },
  stepBy:         { fontSize: 9, textAlign: 'center' },
  stepLine:       { flex: 1, height: 1.5, marginTop: 9 },

  sectionToggle:     { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 9, borderRadius: 8, borderWidth: 1, marginTop: 8 },
  sectionToggleText: { fontSize: 12, fontWeight: '600' },
  panel:             { borderRadius: 10, borderWidth: 1, padding: 11, marginTop: 6 },

  approvalCard:     { borderRadius: 14, borderWidth: 1, padding: 13, marginBottom: 10 },
  approvalMeta:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  approvalMetaText: { fontSize: 10, fontWeight: '600' },

  sectionHeading: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  fileCard:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  fileIconWrap:   { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fileName:       { fontSize: 12, fontWeight: '600' },
  fileMeta:       { fontSize: 11, marginTop: 2 },
  fileDate:       { fontSize: 10, marginTop: 1 },
  approvedBy:     { fontSize: 10, marginTop: 2, fontWeight: '600' },
  approveBtn:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  approveBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  recCard:    { borderRadius: 12, borderWidth: 1, borderLeftWidth: 4, marginBottom: 10, overflow: 'hidden' },
  recHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11 },
  recIcon:    { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  recName:    { fontSize: 13, fontWeight: '700' },
  recType:    { fontSize: 11, fontWeight: '600', marginTop: 1 },
  recBody:    { borderTopWidth: StyleSheet.hairlineWidth, padding: 11 },
  recReason:  { fontSize: 12, lineHeight: 18 },
  recMeta:    { fontSize: 10, marginTop: 4 },
  recActions: { flexDirection: 'row', gap: 8, padding: 11, paddingTop: 0 },
  recActionBtn:{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  recActionText:{ color: '#fff', fontSize: 12, fontWeight: '700' },

  empty:     { borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 36, gap: 10, marginVertical: 20 },
  emptyText: { fontSize: 13 },

  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '88%' },
  sheetTitle: { fontSize: 17, fontWeight: '800', marginBottom: 14 },

  empPickRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 9, borderWidth: 1, marginBottom: 5 },
  miniAvatar:     { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  miniAvatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  empPickName:    { fontSize: 13, fontWeight: '600' },
  empPickRole:    { fontSize: 11 },

  letterMeta:    { fontSize: 11, marginBottom: 12 },
  letterContent: { borderRadius: 8, borderWidth: 1, padding: 14, marginBottom: 8 },
  letterText:    { fontSize: 12, lineHeight: 20, fontFamily: 'monospace' },
});
