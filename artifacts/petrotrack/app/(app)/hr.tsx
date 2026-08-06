import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';

import { ModalSheet } from '@/components/FormSheet';
import { ScreenLayout } from '@/components/ScreenLayout';
import {
  GeneratedLetter, HRDocType, HRDocStatus, HREmployee, OnboardingStatus,
  ROLE_COLORS, ROLE_LABELS, UserAccount, fmtDate, fmtDateTime, useApp, type Role,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { storageApi } from '@/lib/api';

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
  draft:        { label: 'Draft',            color: '#7F8C8D', bg: '#F4F4F2', step: 0 },
  forwarded:    { label: 'Pending Admin',    color: '#BA7517', bg: '#FAEEDA', step: 1 },
  md_approved:  { label: 'Admin Review',     color: '#185FA5', bg: '#DCF0FF', step: 2 },
  ceo_approved: { label: 'Admin Approved',   color: '#27500A', bg: '#EAF3DE', step: 3 },
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

const ROLE_OPTS: Role[] = ['ceo', 'md', 'mktg', 'csm', 'acc', 'mgr', 'att'];

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
  return `PETROTRACK LIMITED\nHR Department · Confidential\n\n${today}\n\nTo: ${emp.name}\n\nAPPOINTMENT LETTER\n\nDear ${emp.name.split(' ')[0]},\n\nWe are pleased to offer you employment with Petrotrack Limited in the capacity of ${emp.role}, effective ${fmtDate(emp.joinDate)}.\n\nPosition:    ${emp.role}\nDepartment:  ${emp.dept}\nStaff ID:    ${emp.empId}\nGrade Level: ${grade || 'As agreed'}\nAnnual Salary: ₦${salary ? Number(salary.replace(/,/g, '')).toLocaleString() : '—'}\n\nThis appointment is subject to:\n1. Satisfactory completion of all pre-employment documentation.\n2. A probationary period of three (3) months from the date of assumption of duties.\n3. Compliance with the Company's Code of Conduct and all HR policies.\n\nPlease sign and return a copy of this letter to confirm your acceptance.\n\nCongratulations and welcome to Petrotrack.\n\nYours sincerely,\n\n${by}\nCorp. Services Manager\nPetrotrack Limited`;
}

function buildPromotionLetter(emp: HREmployee, newRole: string, effDate: string, newGrade: string, by: string) {
  const today = new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
  const dateStr = effDate ? fmtDate(effDate) : today;
  return `PETROTRACK LIMITED\nHR Department · Confidential\n\n${today}\n\nTo: ${emp.name}\nStaff ID: ${emp.empId}\nCurrent Position: ${emp.role}\n\nLETTER OF PROMOTION\n\nDear ${emp.name.split(' ')[0]},\n\nOn behalf of Management of Petrotrack Limited, we are delighted to inform you of your promotion to the position of ${newRole}, effective ${dateStr}.\n\nNew Position: ${newRole}\nDepartment:   ${emp.dept}\nEffective:    ${dateStr}\nNew Grade:    ${newGrade || 'As communicated'}\n\nThis promotion is in recognition of your dedication, hard work, and consistent contribution to the growth of the organisation. We are confident that you will excel in your new role.\n\nApplicable salary and benefits adjustments will be communicated by the Finance department.\n\nCongratulations on this well-deserved achievement!\n\nYours sincerely,\n\n${by}\nCorp. Services Manager\nPetrotrack Limited`;
}

type TabId = 'employees' | 'handbooks' | 'recommendations' | 'approvals';

export default function HRScreen() {
  const {
    role, userName,
    hrEmployees, hrRecommendations, hrHandbooks,
    userAccounts, branches,
    removeHREmployee,
    enrollStaff,
    approveUserAccount, updateEnrollmentData,
    rejectUserAccount, rejectEnrollmentWithReason, resubmitEnrollment, deleteUserAccount,
    uploadHRDocFile, approveHRUpload,
    addHRRecommendation, resolveHRRecommendation,
    addHRHandbook, approveHRHandbook,
    forwardOnboardingForApproval, approveOnboarding, addGeneratedLetter,
  } = useApp();

  const colors    = useColors();
  const isHR      = role === 'csm';
  const isMD      = role === 'md';
  const isAdmin   = role === 'admin';
  const roleColor = ROLE_COLORS[role || 'csm'] || colors.primary;

  /* ── tab state ── */
  const [activeTab, setActiveTab] = useState<TabId>(isAdmin ? 'approvals' : 'employees');
  const [search, setSearch]       = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  /* ── enrollment form state (HR only) ── */
  const [showAdd,            setShowAdd]           = useState(false);
  const [newName,            setNewName]            = useState('');
  const [newJobRole,         setNewJobRole]         = useState('');
  const [newDept,            setNewDept]            = useState(DEPARTMENTS[0]);
  const [newPhone,           setNewPhone]           = useState('');
  const [newEmail,           setNewEmail]           = useState('');
  const [newAddr,            setNewAddr]            = useState('');
  const [newDob,             setNewDob]             = useState('');
  const [newKin,             setNewKin]             = useState('');
  const [newNin,             setNewNin]             = useState('');
  const [newSalary,          setNewSalary]          = useState('');
  const [newGrade,           setNewGrade]           = useState('');
  const [newGuarantorName,   setNewGuarantorName]   = useState('');
  const [newGuarantorPhone,  setNewGuarantorPhone]  = useState('');
  const [newGuarantorAddr,   setNewGuarantorAddr]   = useState('');
  const [newBranch,          setNewBranch]          = useState('');
  const [enrollDocs,         setEnrollDocs]         = useState<{ name: string; objectPath?: string; uploading?: boolean }[]>([]);
  const [enrollDocUploading, setEnrollDocUploading] = useState(false);

  /* ── admin: approve enrollment modal ── */
  const [approvingEnrollment,  setApprovingEnrollment] = useState<UserAccount | null>(null);
  const [aRole,                setARole]               = useState<Role>('att');
  const [aUsername,            setAUsername]           = useState('');
  const [aPassword,            setAPassword]           = useState('');
  const [aBranch,              setABranch]             = useState('');
  const [showApprovePw,        setShowApprovePw]       = useState(false);

  /* ── admin: edit enrollment modal ── */
  const [editingEnrollment,   setEditingEnrollment] = useState<UserAccount | null>(null);
  const [eEmpName,            setEEmpName]          = useState('');
  const [eJobTitle,           setEJobTitle]         = useState('');
  const [eDept,               setEDept]             = useState(DEPARTMENTS[0]);
  const [ePhone,              setEPhone]            = useState('');
  const [eNin,                setENin]              = useState('');
  const [eAddr,               setEAddr]             = useState('');
  const [eGuarantorName,      setEGuarantorName]    = useState('');
  const [eGuarantorPhone,     setEGuarantorPhone]   = useState('');
  const [eGuarantorAddr,      setEGuarantorAddr]    = useState('');

  /* ── admin: reject enrollment with reason modal ── */
  const [rejectingEnrollment, setRejectingEnrollment] = useState<UserAccount | null>(null);
  const [rejectReasonText,    setRejectReasonText]    = useState('');

  /* ── admin: approve loading state ── */
  const [isApproving, setIsApproving] = useState(false);

  /* ── admin: multi-select delete ── */
  const [selectMode,   setSelectMode]   = useState(false);
  const [selectedIds,  setSelectedIds]  = useState<Set<number>>(new Set());
  const [isDeleting,   setIsDeleting]   = useState(false);

  /* ── HR: re-submit rejected enrollment modal ── */
  const [resubmittingEnrollment, setResubmittingEnrollment] = useState<UserAccount | null>(null);

  /* ── other state ── */
  const [hbCat,     setHbCat]     = useState(HANDBOOK_CATS[0]);
  const [recEmpId,  setRecEmpId]  = useState<number | null>(null);
  const [recType,   setRecType]   = useState<'suspend' | 'deactivate' | 'delete'>('suspend');
  const [recReason, setRecReason] = useState('');

  const [letterModal,    setLetterModal]    = useState<null | 'appointment' | 'promotion'>(null);
  const [letterEmpId,    setLetterEmpId]    = useState<number | null>(null);
  const [letterGrade,    setLetterGrade]    = useState('');
  const [letterSalary,   setLetterSalary]   = useState('');
  const [letterNewRole,  setLetterNewRole]  = useState('');
  const [letterEffDate,  setLetterEffDate]  = useState('');
  const [letterNewGrade, setLetterNewGrade] = useState('');
  const [viewLetter,     setViewLetter]     = useState<GeneratedLetter | null>(null);

  /* ── derived data ── */
  const filteredStaff = hrEmployees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.empId.toLowerCase().includes(search.toLowerCase()) ||
    e.dept.toLowerCase().includes(search.toLowerCase())
  );
  const pendingEnrollments  = userAccounts.filter(a => a.status === 'pending_admin');
  const rejectedEnrollments = userAccounts.filter(a => a.status === 'rejected');
  const pendingRecs   = hrRecommendations.filter(r => r.status === 'pending').length;
  const pendingBooks  = hrHandbooks.filter(h => !h.approved).length;

  /* ═══════════════════════════════════════════════════
     HANDLERS — HR ENROLLMENT
  ═══════════════════════════════════════════════════ */
  async function handleEnrollEmployee() {
    if (!newName.trim())    { Alert.alert('Required', 'Full name is required.');           return; }
    if (!newJobRole.trim()) { Alert.alert('Required', 'Job title is required.');           return; }
    if (!newNin.trim())     { Alert.alert('Required', 'NIN is required for enrollment.'); return; }
    if (!newPhone.trim())   { Alert.alert('Required', 'Phone number is required.');        return; }
    if (enrollDocUploading) { Alert.alert('Please wait', 'A document is still uploading. Wait for it to finish.'); return; }

    const docMeta: string[] = [];
    for (const d of enrollDocs) {
      if (d.objectPath) docMeta.push(`DOC:${d.name}:${d.objectPath}`);
      else if (!d.uploading) docMeta.push(`DOC:${d.name}`);
    }
    if (newSalary.trim()) docMeta.push(`SALARY:${newSalary.trim()}`);
    if (newGrade.trim())  docMeta.push(`GRADE:${newGrade.trim()}`);
    if (newEmail.trim())  docMeta.push(`EMAIL:${newEmail.trim()}`);
    if (newDob.trim())    docMeta.push(`DOB:${newDob.trim()}`);
    if (newKin.trim())    docMeta.push(`NEXTOFKIN:${newKin.trim()}`);

    await enrollStaff({
      empName:          newName.trim(),
      jobTitle:         newJobRole.trim(),
      dept:             newDept,
      branchId:         newBranch || undefined,
      phoneNumber:      newPhone.trim(),
      nin:              newNin.trim(),
      staffAddress:     newAddr.trim() || undefined,
      guarantorName:    newGuarantorName.trim() || undefined,
      guarantorPhone:   newGuarantorPhone.trim() || undefined,
      guarantorAddress: newGuarantorAddr.trim() || undefined,
      employmentDocs:   docMeta,
    }, userName || 'HR', 'pending_admin');

    setNewName(''); setNewJobRole(''); setNewPhone(''); setNewEmail('');
    setNewAddr(''); setNewDob(''); setNewKin(''); setNewDept(DEPARTMENTS[0]);
    setNewNin(''); setNewSalary(''); setNewGrade(''); setNewBranch('');
    setNewGuarantorName(''); setNewGuarantorPhone(''); setNewGuarantorAddr('');
    setEnrollDocs([]);
    setShowAdd(false);
    Alert.alert('Enrollment Submitted', `${newName.trim()} enrolled successfully.\n\nSubmitted to Admin for review and approval.`);
  }

  async function handlePickEnrollDoc() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      const idx = Date.now();
      const placeholder = { name: file.name, uploading: true };
      setEnrollDocs(prev => [...prev, placeholder]);
      setEnrollDocUploading(true);
      try {
        const fileInfo = await FileSystem.getInfoAsync(file.uri);
        const size = fileInfo.exists ? (fileInfo as FileSystem.FileInfo & { size?: number }).size ?? 1 : 1;
        const mimeType = file.mimeType ?? 'application/octet-stream';
        const upload = await storageApi.requestUploadUrl(file.name, size, mimeType);
        if (!upload) throw new Error('No upload URL returned');
        const uploadResult = await FileSystem.uploadAsync(upload.uploadURL, file.uri, {
          httpMethod: 'PUT',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': mimeType },
        });
        if (uploadResult.status < 200 || uploadResult.status >= 300) throw new Error(`Upload failed: ${uploadResult.status}`);
        setEnrollDocs(prev => prev.map(d => d === placeholder ? { name: file.name, objectPath: upload.objectPath } : d));
      } catch (err) {
        setEnrollDocs(prev => prev.map(d => d === placeholder ? { name: file.name, objectPath: undefined } : d));
        Alert.alert('Upload failed', 'File was attached locally but could not be uploaded to the server.');
      } finally {
        setEnrollDocUploading(false);
      }
    } catch {
      Alert.alert('Error', 'Could not pick file. Please try again.');
    }
  }

  /* ═══════════════════════════════════════════════════
     HANDLERS — ADMIN ENROLLMENT REVIEW
  ═══════════════════════════════════════════════════ */
  function openApproveModal(acc: UserAccount) {
    const suggested = (acc.empName ?? '')
      .split(' ').map((w: string) => w[0]?.toLowerCase()).join('') +
      ((acc.empName ?? '').split(' ')[1] ?? '').toLowerCase().slice(0, 5);
    setApprovingEnrollment(acc);
    setARole('att');
    setAUsername(suggested || '');
    setAPassword('');
    setABranch(acc.branchId ?? (branches[0]?.id ?? ''));
    setShowApprovePw(false);
  }

  async function handleConfirmApprove() {
    if (!approvingEnrollment) return;
    if (!aUsername.trim())            { Alert.alert('Required', 'Username is required.');               return; }
    if (aPassword.trim().length < 6)  { Alert.alert('Required', 'Password must be at least 6 characters.'); return; }
    if (!aBranch)                     { Alert.alert('Required', 'Please assign a branch.');             return; }
    const dup = userAccounts.find(a => a.username === aUsername.trim() && a.id !== approvingEnrollment.id && a.status === 'active');
    if (dup) { Alert.alert('Username Taken', 'That username is already in use.'); return; }
    setIsApproving(true);
    try {
      await approveUserAccount(approvingEnrollment.id, aRole, aUsername.trim().toLowerCase(), aPassword.trim(), userName || 'Admin', aBranch);
      const name = approvingEnrollment.empName;
      setApprovingEnrollment(null);
      Alert.alert('Account Activated ✓', `${name} can now log in.\n\nUsername: @${aUsername.trim().toLowerCase()}\nStaff record created automatically.`);
    } catch (err: any) {
      Alert.alert('Activation Failed', err?.message ?? 'Could not activate account. Check your connection and try again.');
    } finally {
      setIsApproving(false);
    }
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    Alert.alert(
      `Delete ${selectedIds.size} Enrollment${selectedIds.size > 1 ? 's' : ''}`,
      `Permanently remove ${selectedIds.size} selected enrollment${selectedIds.size > 1 ? 's' : ''} from the database?\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete All', style: 'destructive', onPress: async () => {
          setIsDeleting(true);
          try {
            for (const id of selectedIds) {
              const removed = await deleteUserAccount(id);
              if (!removed) throw new Error('One or more enrollments could not be deleted. Check your connection and try again.');
            }
            setSelectedIds(new Set());
            setSelectMode(false);
          } catch (err: any) {
            Alert.alert('Delete Failed', err?.message ?? 'Could not delete the selected enrollments.');
          } finally {
            setIsDeleting(false);
          }
        }},
      ]
    );
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleRejectEnrollment(acc: UserAccount) {
    setRejectingEnrollment(acc);
    setRejectReasonText('');
  }

  async function handleConfirmReject() {
    if (!rejectingEnrollment) return;
    if (!rejectReasonText.trim()) { Alert.alert('Required', 'Please enter a reason for rejection so HR can act on it.'); return; }
    await rejectEnrollmentWithReason(rejectingEnrollment.id, rejectReasonText.trim(), userName || 'Admin');
    const name = rejectingEnrollment.empName;
    setRejectingEnrollment(null);
    setRejectReasonText('');
    Alert.alert('Enrollment Rejected', `${name}'s enrollment has been rejected.\n\nHR has been notified and can edit and re-submit.`);
  }

  function handleDeleteEnrollment(acc: UserAccount) {
    Alert.alert('Delete Enrollment', `Permanently delete enrollment for ${acc.empName}?\n\nThis cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const removed = await deleteUserAccount(acc.id);
        if (!removed) Alert.alert('Delete Failed', 'Could not delete this enrollment. Check your connection and try again.');
      }},
    ]);
  }

  function openEditModal(acc: UserAccount) {
    setEditingEnrollment(acc);
    setEEmpName(acc.empName ?? '');
    setEJobTitle(acc.jobTitle ?? '');
    setEDept(acc.dept ?? DEPARTMENTS[0]);
    setEPhone(acc.phoneNumber ?? '');
    setENin(acc.nin ?? '');
    setEAddr(acc.staffAddress ?? '');
    setEGuarantorName(acc.guarantorName ?? '');
    setEGuarantorPhone(acc.guarantorPhone ?? '');
    setEGuarantorAddr(acc.guarantorAddress ?? '');
  }

  async function handleSaveEdit() {
    if (!editingEnrollment) return;
    if (!eEmpName.trim()) { Alert.alert('Required', 'Full name is required.'); return; }
    const updated = await updateEnrollmentData(editingEnrollment.id, {
      empName:          eEmpName.trim(),
      jobTitle:         eJobTitle.trim() || undefined,
      dept:             eDept || undefined,
      phoneNumber:      ePhone.trim() || undefined,
      nin:              eNin.trim() || undefined,
      staffAddress:     eAddr.trim() || undefined,
      guarantorName:    eGuarantorName.trim() || undefined,
      guarantorPhone:   eGuarantorPhone.trim() || undefined,
      guarantorAddress: eGuarantorAddr.trim() || undefined,
    }, userName || 'Admin');
    if (!updated) {
      Alert.alert('Update Failed', 'Could not save enrollment details. Check your connection and try again.');
      return;
    }
    setEditingEnrollment(null);
    Alert.alert('Updated', 'Enrollment details updated successfully.');
  }

  function openResubmitModal(acc: UserAccount) {
    setResubmittingEnrollment(acc);
    setEEmpName(acc.empName ?? '');
    setEJobTitle(acc.jobTitle ?? '');
    setEDept(acc.dept ?? DEPARTMENTS[0]);
    setEPhone(acc.phoneNumber ?? '');
    setENin(acc.nin ?? '');
    setEAddr(acc.staffAddress ?? '');
    setEGuarantorName(acc.guarantorName ?? '');
    setEGuarantorPhone(acc.guarantorPhone ?? '');
    setEGuarantorAddr(acc.guarantorAddress ?? '');
  }

  async function handleResubmitSave() {
    if (!resubmittingEnrollment) return;
    if (!eEmpName.trim()) { Alert.alert('Required', 'Full name is required.'); return; }
    const resubmitted = await resubmitEnrollment(resubmittingEnrollment.id, {
      empName:          eEmpName.trim(),
      jobTitle:         eJobTitle.trim() || undefined,
      dept:             eDept || undefined,
      phoneNumber:      ePhone.trim() || undefined,
      nin:              eNin.trim() || undefined,
      staffAddress:     eAddr.trim() || undefined,
      guarantorName:    eGuarantorName.trim() || undefined,
      guarantorPhone:   eGuarantorPhone.trim() || undefined,
      guarantorAddress: eGuarantorAddr.trim() || undefined,
    }, userName || 'HR');
    if (!resubmitted) {
      Alert.alert('Re-submit Failed', 'Could not re-submit this enrollment. Check your connection and try again.');
      return;
    }
    setResubmittingEnrollment(null);
    Alert.alert('Re-submitted ✓', `${eEmpName.trim()} enrollment has been re-submitted to Admin for review.`);
  }

  /* ═══════════════════════════════════════════════════
     HANDLERS — HR DOCS / LETTERS / HANDBOOKS / RECS
  ═══════════════════════════════════════════════════ */
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
      : 'All documents uploaded. Forward for final approval?';
    Alert.alert('Forward for Approval', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Forward', onPress: () => {
        forwardOnboardingForApproval(emp.id, userName || 'HR');
        Alert.alert('Forwarded', 'Onboarding forwarded to Admin for final approval.');
      }},
    ]);
  }

  function handleApprove(empId: number, stage: 'md' | 'ceo') {
    Alert.alert('Confirm Approval', 'Confirm final approval for this employee onboarding?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => {
        approveOnboarding(empId, stage, userName || '');
        Alert.alert('Approved', 'Onboarding approval recorded successfully.');
      }},
    ]);
  }

  function handleRecommend(empId: number) {
    if (!recReason.trim()) { Alert.alert('Required', 'Please provide a reason.'); return; }
    const emp = hrEmployees.find(e => e.id === empId);
    if (!emp) return;
    addHRRecommendation({ empId, empName: emp.name, type: recType, reason: recReason.trim(), by: userName || 'HR' });
    setRecEmpId(null); setRecReason('');
    Alert.alert('Sent', `Recommendation for ${emp.name} sent for Admin review.`);
  }

  function handleGenerateLetter() {
    const emp = hrEmployees.find(e => e.id === letterEmpId);
    if (!emp || !letterModal) return;
    let content = '';
    let title   = '';
    if (letterModal === 'appointment') {
      content = buildAppointmentLetter(emp, letterGrade, letterSalary, userName || 'HR');
      title   = `Appointment Letter — ${emp.name}`;
    } else {
      if (!letterNewRole.trim()) { Alert.alert('Required', 'New position is required.'); return; }
      content = buildPromotionLetter(emp, letterNewRole.trim(), letterEffDate, letterNewGrade, userName || 'HR');
      title   = `Promotion Letter — ${emp.name} → ${letterNewRole.trim()}`;
    }
    addGeneratedLetter(emp.id, { type: letterModal, title, content, generatedBy: userName || 'HR', newRole: letterNewRole || undefined });
    setLetterModal(null); setLetterEmpId(null);
    setLetterGrade(''); setLetterSalary(''); setLetterNewRole(''); setLetterEffDate(''); setLetterNewGrade('');
    Alert.alert('Letter Generated', `${title}\n\nSaved to employee file.`);
  }

  function docProgress(emp: HREmployee) {
    const total     = emp.docs.length;
    const submitted = emp.docs.filter(d => d.status !== 'pending').length;
    return { submitted, total, pct: total ? submitted / total : 0 };
  }

  /* ═══════════════════════════════════════════════════
     TABS
  ═══════════════════════════════════════════════════ */
  const TABS: { key: TabId; label: string; badge?: number }[] = isAdmin ? [
    { key: 'approvals',       label: 'Approvals',  badge: pendingEnrollments.length || undefined },
    { key: 'employees',       label: 'Staff' },
    { key: 'handbooks',       label: 'Library' },
    { key: 'recommendations', label: 'Actions',    badge: pendingRecs || undefined },
  ] : [
    { key: 'employees',       label: 'Staff' },
    { key: 'handbooks',       label: 'Library',    badge: pendingBooks || undefined },
    { key: 'recommendations', label: 'Actions',    badge: pendingRecs  || undefined },
  ];

  /* ═══════════════════════════════════════════════════
     RENDER HELPERS
  ═══════════════════════════════════════════════════ */
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
              {isHR && (doc.status === 'pending' || doc.status === 'n/a') && (
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
        {isHR && (
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
      { label: 'Submitted',      done: ob.status !== 'draft',       by: ob.forwardedBy,   at: ob.forwardedAt },
      { label: 'Admin Review',   done: ob.status === 'md_approved' || ob.status === 'ceo_approved', by: ob.mdApprovedBy, at: ob.mdApprovedAt },
      { label: 'Admin Approved', done: ob.status === 'ceo_approved', by: ob.ceoApprovedBy, at: ob.ceoApprovedAt },
    ];
    return (
      <View style={[styles.onboardSection, { borderColor: meta.bg, backgroundColor: meta.bg + '88' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <View style={[styles.onboardBadge, { backgroundColor: meta.bg, borderColor: meta.color + '44' }]}>
            <Text style={[styles.onboardBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          {isHR && (ob.status === 'draft' || ob.status === 'forwarded') && (
            <TouchableOpacity onPress={() => handleForward(emp)}
              style={[styles.forwardBtn, { backgroundColor: roleColor }]}>
              <Ionicons name="send" size={12} color="#fff" />
              <Text style={styles.forwardBtnText}>{ob.status === 'draft' ? 'Forward for Approval' : 'Re-Forward'}</Text>
            </TouchableOpacity>
          )}
          {isAdmin && (ob.status === 'forwarded' || ob.status === 'md_approved') && (
            <TouchableOpacity onPress={() => handleApprove(emp.id, 'ceo')}
              style={[styles.forwardBtn, { backgroundColor: '#1a6e3c' }]}>
              <Ionicons name="checkmark-circle" size={12} color="#fff" />
              <Text style={styles.forwardBtnText}>Approve Onboarding</Text>
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

  function renderEnrollmentCard(acc: UserAccount) {
    const deptColor = DEPT_COLORS[acc.dept ?? ''] ?? '#4527a0';
    const salaryMeta = (acc.employmentDocs ?? []).find((d: string) => d.startsWith('SALARY:'));
    const gradeMeta  = (acc.employmentDocs ?? []).find((d: string) => d.startsWith('GRADE:'));
    const fileDocs   = (acc.employmentDocs ?? []).filter((d: string) =>
      !d.startsWith('SALARY:') && !d.startsWith('GRADE:') && !d.startsWith('EMAIL:') &&
      !d.startsWith('DOB:') && !d.startsWith('NEXTOFKIN:')
    );
    return (
      <View key={acc.id} style={[styles.enrollCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <View style={[styles.avatar, { backgroundColor: deptColor }]}>
            <Text style={styles.avatarText}>{initials(acc.empName ?? '?')}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.empName, { color: colors.text }]}>{acc.empName}</Text>
            <Text style={[styles.empSub, { color: colors.textMuted }]}>{acc.jobTitle ?? '—'} · {acc.dept ?? '—'}</Text>
            <Text style={[styles.empSub, { color: colors.textSubtle }]}>{acc.empId}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: '#FAEEDA' }]}>
            <Text style={[styles.pillText, { color: '#BA7517' }]}>Pending Admin</Text>
          </View>
        </View>

        {/* Key fields */}
        <View style={[styles.enrollInfoGrid, { borderColor: colors.border }]}>
          {[
            { label: 'NIN',       value: acc.nin           || '—' },
            { label: 'Phone',     value: acc.phoneNumber   || '—' },
            { label: 'Salary',    value: salaryMeta ? '₦' + salaryMeta.replace('SALARY:', '') : '—' },
            { label: 'Grade',     value: gradeMeta  ? gradeMeta.replace('GRADE:', '') : '—' },
            { label: 'Guarantor', value: acc.guarantorName || '—' },
            { label: 'Address',   value: acc.staffAddress  || '—' },
          ].map(item => (
            <View key={item.label} style={styles.enrollInfoItem}>
              <Text style={[styles.bioLabel, { color: colors.textMuted }]}>{item.label}</Text>
              <Text style={[styles.bioValue, { color: colors.text }]} numberOfLines={1}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* Uploaded docs */}
        {fileDocs.length > 0 && (
          <View style={{ marginTop: 6, marginBottom: 4 }}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted, marginBottom: 4 }]}>Attached Files ({fileDocs.length})</Text>
            {fileDocs.map((d: string, i: number) => (
              <View key={i} style={[styles.enrollDocRow, { borderColor: colors.border }]}>
                <Ionicons name="document-attach-outline" size={13} color={colors.textMuted} />
                <Text style={[styles.enrollDocName, { color: colors.textMuted }]} numberOfLines={1}>{d}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Select mode checkbox OR action buttons */}
        {selectMode ? (
          <TouchableOpacity onPress={() => toggleSelect(acc.id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingVertical: 4 }}>
            <View style={{
              width: 22, height: 22, borderRadius: 6, borderWidth: 2,
              borderColor: selectedIds.has(acc.id) ? '#E74C3C' : colors.border,
              backgroundColor: selectedIds.has(acc.id) ? '#E74C3C' : colors.background,
              alignItems: 'center', justifyContent: 'center',
            }}>
              {selectedIds.has(acc.id) && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={{ fontSize: 13, color: selectedIds.has(acc.id) ? '#E74C3C' : colors.textMuted, fontWeight: '500' }}>
              {selectedIds.has(acc.id) ? 'Selected for deletion' : 'Tap to select'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <TouchableOpacity onPress={() => openEditModal(acc)}
              style={[styles.enrollActionBtn, { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 }]}>
              <Ionicons name="create-outline" size={14} color={colors.text} />
              <Text style={[styles.enrollActionText, { color: colors.text }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleRejectEnrollment(acc)}
              style={[styles.enrollActionBtn, { backgroundColor: '#FAEEDA', borderColor: '#BA7517', borderWidth: 1 }]}>
              <Ionicons name="close-circle-outline" size={14} color="#BA7517" />
              <Text style={[styles.enrollActionText, { color: '#BA7517' }]}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteEnrollment(acc)}
              style={[styles.enrollActionBtn, { backgroundColor: '#FCEBEB', borderColor: '#E74C3C', borderWidth: 1 }]}>
              <Ionicons name="trash-outline" size={14} color="#E74C3C" />
              <Text style={[styles.enrollActionText, { color: '#E74C3C' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openApproveModal(acc)}
              style={[styles.enrollApproveBtn, { backgroundColor: '#1a6e3c' }]}>
              <Ionicons name="checkmark-circle" size={14} color="#fff" />
              <Text style={styles.enrollApproveBtnText}>Activate Account</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  function renderRejectedAdminCard(acc: UserAccount) {
    const deptColor = DEPT_COLORS[acc.dept ?? ''] ?? '#7B1818';
    return (
      <View key={acc.id} style={[styles.rejectedCard, { backgroundColor: colors.surface, borderColor: '#E74C3C44' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <View style={[styles.miniAvatar, { backgroundColor: '#FCEBEB' }]}>
            <Text style={[styles.miniAvatarText, { color: '#E74C3C' }]}>{initials(acc.empName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{acc.empName}</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>{acc.jobTitle ?? '—'} · {acc.dept ?? '—'}</Text>
            <Text style={{ fontSize: 11, color: colors.textSubtle, marginTop: 1 }}>{acc.empId ?? 'No company ID'}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: '#FCEBEB' }]}>
            <Text style={[styles.pillText, { color: '#E74C3C' }]}>Rejected</Text>
          </View>
        </View>

        {acc.rejectionReason ? (
          <View style={[styles.rejectionReasonBox, { backgroundColor: '#FFF0F0', borderColor: '#E74C3C44' }]}>
            <Ionicons name="alert-circle" size={14} color="#E74C3C" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#7B1818', marginBottom: 2 }}>Reason for rejection</Text>
              <Text style={{ fontSize: 12, color: '#7B1818', lineHeight: 17 }}>{acc.rejectionReason}</Text>
            </View>
          </View>
        ) : null}

        <Text style={{ fontSize: 11, color: colors.textSubtle, marginTop: 4, marginBottom: 8 }}>
          Rejected by {acc.rejectedBy ?? 'Admin'}{acc.rejectedAt ? ` · ${fmtDateTime(acc.rejectedAt)}` : ''}
        </Text>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => openEditModal(acc)}
            style={[styles.enrollActionBtn, { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, flex: 1, justifyContent: 'center' }]}>
            <Ionicons name="create-outline" size={14} color={colors.text} />
            <Text style={[styles.enrollActionText, { color: colors.text }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeleteEnrollment(acc)}
            style={[styles.enrollActionBtn, { backgroundColor: '#FCEBEB', borderColor: '#E74C3C', borderWidth: 1, flex: 1, justifyContent: 'center' }]}>
            <Ionicons name="trash-outline" size={14} color="#E74C3C" />
            <Text style={[styles.enrollActionText, { color: '#E74C3C' }]}>Delete</Text>
          </TouchableOpacity>
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

            {isHR && renderLetters(emp)}

            <Text style={[styles.panelSection, { color: colors.text }]}>Onboarding Approval</Text>
            {renderOnboardingStatus(emp)}

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

  /* ═══════════════════════════════════════════════════
     MAIN RENDER
  ═══════════════════════════════════════════════════ */
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

      {/* ── APPROVALS TAB (Admin only) ── */}
      {activeTab === 'approvals' && isAdmin && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">

          {/* Select-mode toolbar */}
          {pendingEnrollments.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              {selectMode ? (
                <>
                  <TouchableOpacity onPress={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                    style={[styles.enrollActionBtn, { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Ionicons name="close" size={14} color={colors.textMuted} />
                    <Text style={[styles.enrollActionText, { color: colors.textMuted }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setSelectedIds(
                      selectedIds.size === pendingEnrollments.length
                        ? new Set()
                        : new Set(pendingEnrollments.map(a => a.id))
                    )}
                    style={[styles.enrollActionBtn, { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Ionicons name={selectedIds.size === pendingEnrollments.length ? 'checkbox' : 'square-outline'} size={14} color={colors.text} />
                    <Text style={[styles.enrollActionText, { color: colors.text }]}>
                      {selectedIds.size === pendingEnrollments.length ? 'Deselect All' : 'Select All'}
                    </Text>
                  </TouchableOpacity>
                  {selectedIds.size > 0 && (
                    <TouchableOpacity onPress={handleDeleteSelected} disabled={isDeleting}
                      style={[styles.enrollActionBtn, { backgroundColor: '#E74C3C', flex: 1, justifyContent: 'center' }]}>
                      <Ionicons name={isDeleting ? 'hourglass' : 'trash'} size={14} color="#fff" />
                      <Text style={[styles.enrollActionText, { color: '#fff' }]}>
                        {isDeleting ? 'Deleting…' : `Delete ${selectedIds.size} Selected`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <>
                  <View style={[styles.infoBox, { flex: 1, marginBottom: 0, backgroundColor: '#DCF0FF', borderColor: '#185FA5' + '44' }]}>
                    <Ionicons name="information-circle" size={14} color="#185FA5" />
                    <Text style={[styles.infoText, { color: '#185FA5' }]}>
                      Verify details then tap <Text style={{ fontWeight: '700' }}>Activate Account</Text> to create login instantly.
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => { setSelectMode(true); setSelectedIds(new Set()); }}
                    style={[styles.enrollActionBtn, { borderWidth: 1, borderColor: '#E74C3C44', backgroundColor: '#FFF5F5' }]}>
                    <Ionicons name="trash-outline" size={14} color="#E74C3C" />
                    <Text style={[styles.enrollActionText, { color: '#E74C3C' }]}>Select</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {pendingEnrollments.length === 0 ? (
            <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Ionicons name="checkmark-done-circle-outline" size={40} color={colors.textSubtle} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No pending enrollments</Text>
              <Text style={[styles.emptySubText, { color: colors.textSubtle }]}>HR will submit new staff enrollments here for your review</Text>
            </View>
          ) : (
            pendingEnrollments.map(acc => renderEnrollmentCard(acc))
          )}

          {rejectedEnrollments.length > 0 && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E74C3C44', marginTop: 12, marginBottom: 4 }}>
                <Ionicons name="close-circle" size={15} color="#E74C3C" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#E74C3C', flex: 1 }}>
                  Rejected Enrollments ({rejectedEnrollments.length})
                </Text>
              </View>
              <Text style={[styles.formHint, { color: colors.textMuted, marginBottom: 8 }]}>
                Edit rejected forms to correct their details, or delete forms that are no longer needed.
              </Text>
              {rejectedEnrollments.map(acc => renderRejectedAdminCard(acc))}
            </>
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ── EMPLOYEES TAB ── */}
      {activeTab === 'employees' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
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
            {isHR && (
              <TouchableOpacity onPress={() => setShowAdd(v => !v)}
                style={[styles.addBtn, { backgroundColor: roleColor }]}>
                <Ionicons name={showAdd ? 'close' : 'person-add'} size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {/* ── ENROLLMENT FORM (HR only) ── */}
          {showAdd && isHR && (
            <View style={[styles.form, { backgroundColor: colors.surface, borderColor: roleColor + '44' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Ionicons name="person-add" size={18} color={roleColor} />
                <Text style={[styles.formTitle, { color: colors.text }]}>Enrol New Staff</Text>
              </View>
              <Text style={[styles.formHint, { color: colors.textMuted }]}>
                Fill all required fields (*). Company ID is auto-assigned. Submitted to Admin for approval.
              </Text>

              {/* Required fields */}
              <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 8 }]}>Personal Details</Text>
              {[
                { label: 'Full Name *',      val: newName,    set: setNewName,    ph: 'e.g. Kelechi Nwosu',       kb: 'default' as const },
                { label: 'Job Title *',      val: newJobRole, set: setNewJobRole, ph: 'e.g. Senior Accountant',   kb: 'default' as const },
                { label: 'NIN *',            val: newNin,     set: setNewNin,     ph: '11-digit NIN number',      kb: 'numeric' as const },
                { label: 'Phone Number *',   val: newPhone,   set: setNewPhone,   ph: '+234 8XX XXX XXXX',        kb: 'phone-pad' as const },
                { label: 'Annual Salary ₦',  val: newSalary,  set: setNewSalary,  ph: 'e.g. 1200000',            kb: 'numeric' as const },
                { label: 'Grade Level',      val: newGrade,   set: setNewGrade,   ph: 'e.g. GL 08',               kb: 'default' as const },
                { label: 'Email',            val: newEmail,   set: setNewEmail,   ph: 'name@petrotrack.com',      kb: 'email-address' as const },
                { label: 'Date of Birth',    val: newDob,     set: setNewDob,     ph: 'YYYY-MM-DD',               kb: 'default' as const },
                { label: 'Home Address',     val: newAddr,    set: setNewAddr,    ph: 'Street, City, State',      kb: 'default' as const },
                { label: 'Next of Kin',      val: newKin,     set: setNewKin,     ph: 'Full name',                kb: 'default' as const },
              ].map(f => (
                <View key={f.label}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{f.label}</Text>
                  <TextInput value={f.val} onChangeText={f.set} placeholder={f.ph}
                    keyboardType={f.kb}
                    placeholderTextColor={colors.textMuted}
                    style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                </View>
              ))}

              {/* Guarantor */}
              <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 8 }]}>Guarantor Information</Text>
              {[
                { label: 'Guarantor Name',    val: newGuarantorName,  set: setNewGuarantorName,  ph: 'Full name' },
                { label: 'Guarantor Phone',   val: newGuarantorPhone, set: setNewGuarantorPhone, ph: '+234 8XX XXX XXXX' },
                { label: 'Guarantor Address', val: newGuarantorAddr,  set: setNewGuarantorAddr,  ph: 'Street, City, State' },
              ].map(f => (
                <View key={f.label}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{f.label}</Text>
                  <TextInput value={f.val} onChangeText={f.set} placeholder={f.ph}
                    placeholderTextColor={colors.textMuted}
                    style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                </View>
              ))}

              {/* Department */}
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Department</Text>
              <View style={styles.chipRow}>
                {DEPARTMENTS.map(d => (
                  <TouchableOpacity key={d} onPress={() => setNewDept(d)}
                    style={[styles.chip, { backgroundColor: d === newDept ? roleColor : colors.background, borderColor: d === newDept ? roleColor : colors.border }]}>
                    <Text style={[styles.chipText, { color: d === newDept ? '#fff' : colors.textMuted }]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Branch assignment */}
              <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 8 }]}>Assigned Branch</Text>
              <View style={styles.chipRow}>
                {[{ id: '', name: 'Not assigned yet' }, ...branches.map(b => ({ id: b.id, name: b.name }))].map(b => (
                  <TouchableOpacity key={b.id} onPress={() => setNewBranch(b.id)}
                    style={[styles.chip, { backgroundColor: b.id === newBranch ? roleColor : colors.background, borderColor: b.id === newBranch ? roleColor : colors.border }]}>
                    <Text style={[styles.chipText, { color: b.id === newBranch ? '#fff' : colors.textMuted }]}>{b.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Document upload */}
              <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 8 }]}>Supporting Documents</Text>
              <Text style={[styles.formHint, { color: colors.textMuted }]}>Attach relevant files (PDF, image, Word, etc.)</Text>
              <TouchableOpacity onPress={handlePickEnrollDoc}
                style={[styles.uploadDocBtn, { borderColor: roleColor + '66', backgroundColor: roleColor + '0a' }]}>
                <Ionicons name="cloud-upload-outline" size={16} color={roleColor} />
                <Text style={[styles.uploadDocBtnText, { color: roleColor }]}>Attach File (any format)</Text>
              </TouchableOpacity>
              {enrollDocs.length > 0 && (
                <View style={{ marginTop: 6 }}>
                  {enrollDocs.map((d, i) => (
                    <View key={i} style={[styles.enrollDocRow, {
                      borderColor: d.uploading ? roleColor + '88' : d.objectPath ? '#1a6e3c44' : colors.border,
                      backgroundColor: d.uploading ? roleColor + '08' : d.objectPath ? '#EAF3DE' : colors.background,
                    }]}>
                      <Ionicons
                        name={d.uploading ? 'cloud-upload-outline' : d.objectPath ? 'checkmark-circle' : 'document-attach-outline'}
                        size={13}
                        color={d.uploading ? roleColor : d.objectPath ? '#1a6e3c' : colors.textMuted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.enrollDocName, { color: colors.text }]} numberOfLines={1}>{d.name}</Text>
                        {d.uploading && <Text style={{ fontSize: 10, color: roleColor, marginTop: 1 }}>Uploading…</Text>}
                        {d.objectPath && !d.uploading && <Text style={{ fontSize: 10, color: '#1a6e3c', marginTop: 1 }}>Uploaded ✓</Text>}
                        {!d.objectPath && !d.uploading && <Text style={{ fontSize: 10, color: colors.textSubtle, marginTop: 1 }}>Attached locally</Text>}
                      </View>
                      {!d.uploading && (
                        <TouchableOpacity onPress={() => setEnrollDocs(prev => prev.filter((_, j) => j !== i))}>
                          <Ionicons name="close-circle" size={15} color="#E74C3C" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity onPress={handleEnrollEmployee}
                style={[styles.submitBtn, { backgroundColor: roleColor, marginTop: 16 }]}>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>Submit Enrollment to Admin</Text>
              </TouchableOpacity>
            </View>
          )}

          {filteredStaff.map(emp => renderEmployeeCard(emp))}

          {/* ── Rejected Enrollments (HR only) ── */}
          {isHR && rejectedEnrollments.length > 0 && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E74C3C44', marginTop: 12, marginBottom: 4 }}>
                <Ionicons name="close-circle" size={15} color="#E74C3C" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#E74C3C', flex: 1 }}>
                  Returned Enrollments ({rejectedEnrollments.length})
                </Text>
              </View>
              <Text style={[styles.formHint, { color: colors.textMuted, marginBottom: 8 }]}>
                Admin returned these enrollments. Review the reason, correct the details, and re-submit.
              </Text>
              {rejectedEnrollments.map(acc => (
                <View key={acc.id} style={[styles.rejectedCard, { backgroundColor: colors.surface, borderColor: '#E74C3C44' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <View style={[styles.miniAvatar, { backgroundColor: '#FCEBEB' }]}>
                      <Text style={[styles.miniAvatarText, { color: '#E74C3C' }]}>{initials(acc.empName)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{acc.empName}</Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>{acc.jobTitle ?? '—'}</Text>
                    </View>
                    <View style={[styles.pill, { backgroundColor: '#FCEBEB' }]}>
                      <Text style={[styles.pillText, { color: '#E74C3C' }]}>Returned</Text>
                    </View>
                  </View>

                  {acc.rejectionReason ? (
                    <View style={[styles.rejectionReasonBox, { backgroundColor: '#FFF0F0', borderColor: '#E74C3C44' }]}>
                      <Ionicons name="alert-circle" size={14} color="#E74C3C" style={{ marginTop: 1 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#7B1818', marginBottom: 2 }}>Admin Note</Text>
                        <Text style={{ fontSize: 12, color: '#7B1818', lineHeight: 17 }}>{acc.rejectionReason}</Text>
                      </View>
                    </View>
                  ) : null}

                  <Text style={{ fontSize: 11, color: colors.textSubtle, marginTop: 4, marginBottom: 8 }}>
                    Returned by {acc.rejectedBy ?? 'Admin'}{acc.rejectedAt ? ` · ${acc.rejectedAt}` : ''}
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => openResubmitModal(acc)}
                      style={[styles.enrollActionBtn, { backgroundColor: '#DCF0FF', borderColor: '#185FA5', borderWidth: 1, flex: 1, justifyContent: 'center' }]}>
                      <Ionicons name="refresh-circle-outline" size={14} color="#185FA5" />
                      <Text style={[styles.enrollActionText, { color: '#185FA5' }]}>Edit & Re-submit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteEnrollment(acc)}
                      style={[styles.enrollActionBtn, { backgroundColor: '#FCEBEB', borderColor: '#E74C3C', borderWidth: 1 }]}>
                      <Ionicons name="trash-outline" size={14} color="#E74C3C" />
                      <Text style={[styles.enrollActionText, { color: '#E74C3C' }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ── HANDBOOKS TAB ── */}
      {activeTab === 'handbooks' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          {isHR && (
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

      {/* ── RECOMMENDATIONS TAB ── */}
      {activeTab === 'recommendations' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
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

      {/* ═══════════════════════════════════════════════════
           MODALS
      ═══════════════════════════════════════════════════ */}

      {/* ── Admin: Approve Enrollment Modal ── */}
      <ModalSheet visible={!!approvingEnrollment} onClose={() => setApprovingEnrollment(null)}>
        <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Ionicons name="checkmark-circle" size={20} color="#1a6e3c" />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Approve Enrollment</Text>
          </View>
          <Text style={[styles.formHint, { color: colors.textMuted, marginBottom: 12 }]}>
            Set login credentials and role for {approvingEnrollment?.empName}. A staff record and user account will be created automatically.
          </Text>

          <View style={[styles.enrollInfoGrid, { borderColor: colors.border, marginBottom: 12 }]}>
            <View style={styles.enrollInfoItem}>
              <Text style={[styles.bioLabel, { color: colors.textMuted }]}>Name</Text>
              <Text style={[styles.bioValue, { color: colors.text }]}>{approvingEnrollment?.empName}</Text>
            </View>
            <View style={styles.enrollInfoItem}>
              <Text style={[styles.bioLabel, { color: colors.textMuted }]}>Role/Title</Text>
              <Text style={[styles.bioValue, { color: colors.text }]}>{approvingEnrollment?.jobTitle ?? '—'}</Text>
            </View>
            <View style={styles.enrollInfoItem}>
              <Text style={[styles.bioLabel, { color: colors.textMuted }]}>NIN</Text>
              <Text style={[styles.bioValue, { color: colors.text }]}>{approvingEnrollment?.nin ?? '—'}</Text>
            </View>
            <View style={styles.enrollInfoItem}>
              <Text style={[styles.bioLabel, { color: colors.textMuted }]}>Phone</Text>
              <Text style={[styles.bioValue, { color: colors.text }]}>{approvingEnrollment?.phoneNumber ?? '—'}</Text>
            </View>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>System Role *</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4, marginBottom: 10 }}>
            {ROLE_OPTS.map(r => (
              <TouchableOpacity key={r} onPress={() => setARole(r)}
                style={[styles.chip, {
                  backgroundColor: r === aRole ? ROLE_COLORS[r] + '22' : colors.surface,
                  borderColor: r === aRole ? ROLE_COLORS[r] : colors.border,
                }]}>
                <Text style={[styles.chipText, { color: r === aRole ? ROLE_COLORS[r] : colors.textMuted }]}>
                  {ROLE_LABELS[r] ?? r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Username *</Text>
          <TextInput value={aUsername} onChangeText={setAUsername}
            placeholder="e.g. kelechi.nwosu" placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Temporary Password *</Text>
          <View style={[styles.pwRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TextInput value={aPassword} onChangeText={setAPassword}
              placeholder="Min. 6 characters" placeholderTextColor={colors.textMuted}
              secureTextEntry={!showApprovePw} style={[styles.pwInput, { color: colors.text }]} />
            <TouchableOpacity onPress={() => setShowApprovePw(v => !v)}>
              <Ionicons name={showApprovePw ? 'eye-off' : 'eye'} size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Assign Branch *</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4, marginBottom: 12 }}>
            {branches.map(b => (
              <TouchableOpacity key={b.id} onPress={() => setABranch(b.id)}
                style={[styles.chip, {
                  backgroundColor: b.id === aBranch ? '#1a6e3c22' : colors.surface,
                  borderColor: b.id === aBranch ? '#1a6e3c' : colors.border,
                }]}>
                <Text style={[styles.chipText, { color: b.id === aBranch ? '#1a6e3c' : colors.textMuted }]}>{b.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity onPress={handleConfirmApprove} disabled={isApproving}
            style={[styles.submitBtn, { backgroundColor: isApproving ? '#555' : '#1a6e3c' }]}>
            <Ionicons name={isApproving ? 'hourglass' : 'flash'} size={16} color="#fff" />
            <Text style={styles.submitBtnText}>{isApproving ? 'Activating…' : 'Activate Account Now'}</Text>
          </TouchableOpacity>
          <View style={{ height: 32 }} />
        </ScrollView>
      </ModalSheet>

      {/* ── Admin: Edit Enrollment Modal ── */}
      <ModalSheet visible={!!editingEnrollment} onClose={() => setEditingEnrollment(null)}>
        <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Ionicons name="create" size={18} color={roleColor} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Edit Enrollment</Text>
          </View>
          <Text style={[styles.formHint, { color: colors.textMuted, marginBottom: 10 }]}>
            Update enrollment details for {editingEnrollment?.empName}.
          </Text>

          {[
            { label: 'Full Name *',     val: eEmpName,       set: setEEmpName,       ph: 'Full name' },
            { label: 'Job Title',       val: eJobTitle,      set: setEJobTitle,      ph: 'e.g. Senior Accountant' },
            { label: 'NIN',             val: eNin,           set: setENin,           ph: '11-digit NIN' },
            { label: 'Phone',           val: ePhone,         set: setEPhone,         ph: '+234 8XX XXX XXXX' },
            { label: 'Address',         val: eAddr,          set: setEAddr,          ph: 'Street, City, State' },
            { label: 'Guarantor Name',  val: eGuarantorName, set: setEGuarantorName, ph: 'Full name' },
            { label: 'Guarantor Phone', val: eGuarantorPhone,set: setEGuarantorPhone,ph: '+234 8XX XXX XXXX' },
            { label: 'Guarantor Addr',  val: eGuarantorAddr, set: setEGuarantorAddr, ph: 'Street, City, State' },
          ].map(f => (
            <View key={f.label}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{f.label}</Text>
              <TextInput value={f.val} onChangeText={f.set} placeholder={f.ph}
                placeholderTextColor={colors.textMuted}
                style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
            </View>
          ))}

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Department</Text>
          <View style={styles.chipRow}>
            {DEPARTMENTS.map(d => (
              <TouchableOpacity key={d} onPress={() => setEDept(d)}
                style={[styles.chip, { backgroundColor: d === eDept ? roleColor : colors.background, borderColor: d === eDept ? roleColor : colors.border }]}>
                <Text style={[styles.chipText, { color: d === eDept ? '#fff' : colors.textMuted }]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity onPress={handleSaveEdit}
            style={[styles.submitBtn, { backgroundColor: roleColor, marginTop: 12 }]}>
            <Ionicons name="save" size={15} color="#fff" />
            <Text style={styles.submitBtnText}>Save Changes</Text>
          </TouchableOpacity>
          <View style={{ height: 32 }} />
        </ScrollView>
      </ModalSheet>

      {/* ── Admin: Reject Enrollment with Reason Modal ── */}
      <ModalSheet visible={!!rejectingEnrollment} onClose={() => setRejectingEnrollment(null)}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Ionicons name="close-circle" size={20} color="#E74C3C" />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Reject Enrollment</Text>
          </View>
          <Text style={[styles.formHint, { color: colors.textMuted, marginBottom: 12 }]}>
            Provide a clear reason so HR can correct and re-submit the enrollment for {rejectingEnrollment?.empName}.
          </Text>

          <View style={[styles.infoBox, { backgroundColor: '#FFF0F0', borderColor: '#E74C3C44', marginBottom: 12 }]}>
            <Ionicons name="information-circle" size={14} color="#E74C3C" />
            <Text style={[styles.infoText, { color: '#7B1818' }]}>
              HR will be notified immediately. The enrollment form will be returned to them with your note pre-displayed.
            </Text>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Reason for Rejection *</Text>
          <TextInput
            value={rejectReasonText}
            onChangeText={setRejectReasonText}
            placeholder="e.g. NIN number is invalid, guarantor details incomplete, salary grade not approved for this role…"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
            style={[styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, marginBottom: 16 }]}
          />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={() => setRejectingEnrollment(null)}
              style={[styles.enrollActionBtn, { flex: 1, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.enrollActionText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleConfirmReject}
              style={[styles.submitBtn, { flex: 2, backgroundColor: '#E74C3C' }]}>
              <Ionicons name="close-circle" size={15} color="#fff" />
              <Text style={styles.submitBtnText}>Reject & Notify HR</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 16 }} />
        </View>
      </ModalSheet>

      {/* ── HR: Re-submit Rejected Enrollment Modal ── */}
      <ModalSheet visible={!!resubmittingEnrollment} onClose={() => setResubmittingEnrollment(null)}>
        <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Ionicons name="refresh-circle" size={20} color="#185FA5" />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Edit & Re-submit</Text>
          </View>
          <Text style={[styles.formHint, { color: colors.textMuted, marginBottom: 8 }]}>
            Correct the details below and re-submit to Admin for review.
          </Text>

          {resubmittingEnrollment?.rejectionReason ? (
            <View style={[styles.rejectionReasonBox, { backgroundColor: '#FFF0F0', borderColor: '#E74C3C44', marginBottom: 12 }]}>
              <Ionicons name="alert-circle" size={14} color="#E74C3C" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#7B1818', marginBottom: 2 }}>
                  Admin Note — Reason for Return
                </Text>
                <Text style={{ fontSize: 13, color: '#7B1818', lineHeight: 18 }}>
                  {resubmittingEnrollment.rejectionReason}
                </Text>
                <Text style={{ fontSize: 11, color: '#BA7517', marginTop: 4 }}>
                  Returned by {resubmittingEnrollment.rejectedBy ?? 'Admin'}
                </Text>
              </View>
            </View>
          ) : null}

          {[
            { label: 'Full Name *',     val: eEmpName,       set: setEEmpName,       ph: 'Full name' },
            { label: 'Job Title',       val: eJobTitle,      set: setEJobTitle,      ph: 'e.g. Senior Accountant' },
            { label: 'NIN',             val: eNin,           set: setENin,           ph: '11-digit NIN' },
            { label: 'Phone',           val: ePhone,         set: setEPhone,         ph: '+234 8XX XXX XXXX' },
            { label: 'Address',         val: eAddr,          set: setEAddr,          ph: 'Street, City, State' },
            { label: 'Guarantor Name',  val: eGuarantorName, set: setEGuarantorName, ph: 'Full name' },
            { label: 'Guarantor Phone', val: eGuarantorPhone,set: setEGuarantorPhone,ph: '+234 8XX XXX XXXX' },
            { label: 'Guarantor Addr',  val: eGuarantorAddr, set: setEGuarantorAddr, ph: 'Street, City, State' },
          ].map(f => (
            <View key={f.label}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{f.label}</Text>
              <TextInput value={f.val} onChangeText={f.set} placeholder={f.ph}
                placeholderTextColor={colors.textMuted}
                style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
            </View>
          ))}

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Department</Text>
          <View style={styles.chipRow}>
            {DEPARTMENTS.map(d => (
              <TouchableOpacity key={d} onPress={() => setEDept(d)}
                style={[styles.chip, { backgroundColor: d === eDept ? '#185FA5' : colors.background, borderColor: d === eDept ? '#185FA5' : colors.border }]}>
                <Text style={[styles.chipText, { color: d === eDept ? '#fff' : colors.textMuted }]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity onPress={handleResubmitSave}
            style={[styles.submitBtn, { backgroundColor: '#185FA5', marginTop: 12 }]}>
            <Ionicons name="send" size={15} color="#fff" />
            <Text style={styles.submitBtnText}>Re-submit to Admin</Text>
          </TouchableOpacity>
          <View style={{ height: 32 }} />
        </ScrollView>
      </ModalSheet>

      {/* ── Generate Letter Modal ── */}
      <ModalSheet visible={!!letterModal} onClose={() => setLetterModal(null)}>
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
                {letterEmpId === emp.id && <Ionicons name="checkmark-circle" size={16} color={roleColor} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={handleGenerateLetter}
            style={[styles.submitBtn, { backgroundColor: letterModal === 'promotion' ? '#8E44AD' : '#2980B9', marginTop: 12 }]}>
            <Ionicons name="document-text" size={15} color="#fff" />
            <Text style={styles.submitBtnText}>Generate & Save Letter</Text>
          </TouchableOpacity>
          <View style={{ height: 32 }} />
        </ScrollView>
      </ModalSheet>

      {/* ── View Letter Modal ── */}
      <ModalSheet visible={!!viewLetter} onClose={() => setViewLetter(null)}>
        <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]}>
          {viewLetter && (
            <>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{viewLetter.title}</Text>
              <Text style={[styles.letterMeta, { color: colors.textMuted }]}>
                Generated by {viewLetter.generatedBy} · {fmtDateTime(viewLetter.generatedAt)}
              </Text>
              <View style={[styles.letterContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.letterText, { color: colors.text }]}>{viewLetter.content}</Text>
              </View>
            </>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      </ModalSheet>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll:          { padding: 14, paddingBottom: 40 },
  tabBar:          { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn:          { flex: 1, paddingVertical: 11, alignItems: 'center', borderBottomWidth: 2 },
  tabBtnInner:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabLabel:        { fontSize: 12 },
  tabBadge:        { minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeText:    { fontSize: 9, color: '#fff', fontWeight: '700' },

  statsRow:        { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard:        { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  statNum:         { fontSize: 22, fontWeight: '800' },
  statLabel:       { fontSize: 10, fontWeight: '600', marginTop: 2 },

  searchRow:       { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchWrap:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, height: 40 },
  searchInput:     { flex: 1, fontSize: 13 },
  addBtn:          { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  form:            { borderRadius: 12, borderWidth: 1.5, padding: 14, marginBottom: 14 },
  formTitle:       { fontSize: 15, fontWeight: '700' },
  formHint:        { fontSize: 12, marginTop: 2, marginBottom: 4, lineHeight: 17 },

  sectionHeading:  { fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 4 },
  fieldLabel:      { fontSize: 12, marginBottom: 4, marginTop: 8, fontWeight: '500' },
  textInput:       { borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13 },
  textArea:        { borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13, minHeight: 70, textAlignVertical: 'top' },

  chipRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip:            { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  chipText:        { fontSize: 11, fontWeight: '500' },

  submitBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10 },
  submitBtnText:   { color: '#fff', fontSize: 13, fontWeight: '700' },

  uploadDocBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', marginTop: 4 },
  uploadDocBtnText:{ fontSize: 13, fontWeight: '600' },
  enrollDocRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderRadius: 7, marginBottom: 4 },
  enrollDocName:   { fontSize: 12 },

  empCard:         { borderRadius: 12, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  empHeader:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13 },
  avatar:          { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText:      { color: '#fff', fontWeight: '800', fontSize: 14 },
  empName:         { fontSize: 14, fontWeight: '700' },
  empSub:          { fontSize: 12, marginTop: 1 },
  idBadge:         { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  idText:          { fontSize: 10, fontWeight: '700' },
  pill:            { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  pillText:        { fontSize: 10, fontWeight: '600' },
  progLabel:       { fontSize: 11 },
  progBar:         { height: 4, borderRadius: 2 },
  progFill:        { height: 4, borderRadius: 2 },

  expanded:        { borderTopWidth: 1, padding: 13 },
  panelSection:    { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 10, marginBottom: 6, letterSpacing: 0.5 },
  bioGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 },
  bioItem:         { width: '48%' },
  bioLabel:        { fontSize: 10, fontWeight: '600' },
  bioValue:        { fontSize: 12, fontWeight: '500', marginTop: 1 },

  docCheckRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 8, borderWidth: 1, borderRadius: 8, marginBottom: 5 },
  docCheckIcon:    { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  docCheckLabel:   { fontSize: 12, fontWeight: '500' },
  docCheckFile:    { fontSize: 11, marginTop: 1 },
  docCheckDate:    { fontSize: 10, marginTop: 1 },
  docStatusBadge:  { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  docStatusText:   { fontSize: 9, fontWeight: '700' },
  uploadBtn:       { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  uploadBtnText:   { color: '#fff', fontSize: 10, fontWeight: '600' },

  noLetters:       { fontSize: 12, marginBottom: 8 },
  letterBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1 },
  letterBtnText:   { fontSize: 11, fontWeight: '600' },
  letterCard:      { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 9, borderWidth: 1, marginBottom: 5 },
  letterCardTitle: { fontSize: 12, fontWeight: '600' },
  letterCardMeta:  { fontSize: 11, marginTop: 1 },

  onboardSection:  { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 8 },
  onboardBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  onboardBadgeText:{ fontSize: 11, fontWeight: '700' },
  forwardBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  forwardBtnText:  { color: '#fff', fontSize: 11, fontWeight: '600' },
  stepsRow:        { flexDirection: 'row', alignItems: 'flex-start' },
  stepDot:         { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  stepLabel:       { fontSize: 9, fontWeight: '600', textAlign: 'center', marginTop: 4, maxWidth: 60 },
  stepBy:          { fontSize: 8, textAlign: 'center', maxWidth: 60 },
  stepLine:        { flex: 1, height: 2, marginTop: 10 },

  sectionToggle:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  sectionToggleText:{ fontSize: 12, fontWeight: '600' },
  panel:           { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 8 },

  empty:           { borderRadius: 12, borderWidth: 1, padding: 28, alignItems: 'center', gap: 8, marginBottom: 12 },
  emptyText:       { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  emptySubText:    { fontSize: 12, textAlign: 'center', maxWidth: 240 },

  enrollCard:      { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  enrollInfoGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 0, borderWidth: 1, borderRadius: 9, padding: 8, marginBottom: 4 },
  enrollInfoItem:  { width: '50%', paddingHorizontal: 4, paddingVertical: 4 },
  enrollActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  enrollActionText:{ fontSize: 12, fontWeight: '600' },
  enrollApproveBtn:{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flex: 1, justifyContent: 'center' },
  enrollApproveBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  rejectedCard:       { borderRadius: 12, borderWidth: 1.5, padding: 14, marginBottom: 12 },
  rejectionReasonBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 9, borderWidth: 1, marginBottom: 4 },

  infoBox:         { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  infoText:        { flex: 1, fontSize: 12, lineHeight: 17 },

  fileCard:        { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  fileIconWrap:    { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fileName:        { fontSize: 13, fontWeight: '600' },
  fileMeta:        { fontSize: 11, marginTop: 2 },
  fileDate:        { fontSize: 10, marginTop: 1 },
  approvedBy:      { fontSize: 10, marginTop: 2, fontWeight: '600' },
  approveBtn:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  approveBtnText:  { color: '#fff', fontSize: 11, fontWeight: '700' },

  recCard:         { borderRadius: 10, borderWidth: 1, borderLeftWidth: 4, marginBottom: 10, overflow: 'hidden' },
  recHeader:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  recIcon:         { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recName:         { fontSize: 13, fontWeight: '700' },
  recType:         { fontSize: 11, fontWeight: '600', marginTop: 2 },
  recBody:         { borderTopWidth: 1, padding: 10 },
  recReason:       { fontSize: 13 },
  recMeta:         { fontSize: 11, marginTop: 4 },
  recActions:      { flexDirection: 'row', gap: 8, padding: 10, paddingTop: 0 },
  recActionBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, flex: 1, justifyContent: 'center' },
  recActionText:   { color: '#fff', fontSize: 12, fontWeight: '600' },

  approvalCard:    { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  approvalMeta:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  approvalMetaText:{ fontSize: 11, fontWeight: '600' },

  sheet:           { padding: 18 },
  sheetTitle:      { fontSize: 17, fontWeight: '800', marginBottom: 6 },
  pwRow:           { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 4 },
  pwInput:         { flex: 1, fontSize: 13 },

  empPickRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9, borderRadius: 8, borderWidth: 1, marginBottom: 5 },
  miniAvatar:      { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  miniAvatarText:  { color: '#fff', fontWeight: '700', fontSize: 11 },
  empPickName:     { fontSize: 13, fontWeight: '600' },
  empPickRole:     { fontSize: 11, marginTop: 1 },

  letterMeta:      { fontSize: 12, marginBottom: 12 },
  letterContent:   { borderRadius: 10, borderWidth: 1, padding: 14, marginTop: 4 },
  letterText:      { fontSize: 12, lineHeight: 20, fontFamily: 'monospace' },
});
