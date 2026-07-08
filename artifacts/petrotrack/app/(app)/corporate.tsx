import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert, Modal, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import {
  CorpApproval, CorpAttachment, CorpProject, CorpRecordType,
  LegalMatter, MeetingMinutes,
  ROLE_COLORS, fmtDate, fmtDateTime, useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

// ── Compliance helpers ──────────────────────────────────────────────────────
function daysLeft(exp: string) {
  return Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000);
}
function getDocStatus(days: number) {
  if (days < 0)  return { label: 'Expired',       color: '#791F1F', bg: '#FCEBEB' };
  if (days < 14) return { label: `${days}d left`,  color: '#791F1F', bg: '#FCEBEB' };
  if (days < 30) return { label: `${days}d left`,  color: '#BA7517', bg: '#FAEEDA' };
  return             { label: `${days}d left`,  color: '#27500A', bg: '#EAF3DE' };
}

// ── File-type helpers ───────────────────────────────────────────────────────
const FILE_CATS  = ['Policy','HR','Finance','Legal','Operations','Compliance','Contract','Other'];
const DOC_FILE_TYPES = ['pdf','docx','xlsx','pptx','img','mp4','audio','zip','other'] as const;
const ATT_FILE_TYPES = [
  { key: 'pdf',   label: 'PDF',   icon: 'document-text', color: '#E74C3C' },
  { key: 'docx',  label: 'DOCX',  icon: 'document',      color: '#2980B9' },
  { key: 'xlsx',  label: 'XLSX',  icon: 'grid',          color: '#27AE60' },
  { key: 'pptx',  label: 'PPTX',  icon: 'easel',         color: '#E67E22' },
  { key: 'img',   label: 'Image', icon: 'image',         color: '#8E44AD' },
  { key: 'mp4',   label: 'Video', icon: 'videocam',      color: '#D85A30' },
  { key: 'audio', label: 'Audio', icon: 'musical-notes', color: '#0F6E56' },
  { key: 'zip',   label: 'ZIP',   icon: 'archive',       color: '#4527a0' },
  { key: 'other', label: 'Other', icon: 'attach',        color: '#7F8C8D' },
] as const;
const FILE_TYPE_MAP: Record<string, { icon: string; color: string }> = Object.fromEntries(
  ATT_FILE_TYPES.map(t => [t.key, { icon: t.icon, color: t.color }])
);
const FILE_SIZES = ['0.3 MB','0.6 MB','1.1 MB','1.8 MB','2.5 MB','4.2 MB','7.0 MB'];

// ── Legal / Project status helpers ──────────────────────────────────────────
const LEGAL_TYPES: LegalMatter['type'][] = ['Contract','Dispute','Regulatory','Advisory','Other'];
const LEGAL_STATUS_META: Record<LegalMatter['status'], { color: string; bg: string }> = {
  Active:   { color: '#185FA5', bg: '#DCF0FF' },
  Pending:  { color: '#BA7517', bg: '#FAEEDA' },
  Resolved: { color: '#27500A', bg: '#EAF3DE' },
  Closed:   { color: '#7F8C8D', bg: '#F4F4F2' },
};
const LEGAL_PRI_META: Record<LegalMatter['priority'], { color: string; bg: string }> = {
  High:   { color: '#791F1F', bg: '#FCEBEB' },
  Medium: { color: '#BA7517', bg: '#FAEEDA' },
  Low:    { color: '#27500A', bg: '#EAF3DE' },
};
const PROJ_STATUS_META: Record<CorpProject['status'], { color: string; bg: string; icon: string }> = {
  Planning:   { color: '#185FA5', bg: '#DCF0FF',  icon: 'compass'          },
  Active:     { color: '#27500A', bg: '#EAF3DE',  icon: 'play-circle'      },
  'On Hold':  { color: '#BA7517', bg: '#FAEEDA',  icon: 'pause-circle'     },
  Completed:  { color: '#0F6E56', bg: '#D6F5EC',  icon: 'checkmark-circle' },
  Cancelled:  { color: '#7F8C8D', bg: '#F4F4F2',  icon: 'close-circle'     },
};

// ── Approval status helpers ─────────────────────────────────────────────────
const APPROVAL_META: Record<CorpApproval['status'], { label: string; color: string; bg: string; icon: string }> = {
  draft:     { label: 'Draft',     color: '#7F8C8D', bg: '#F4F4F2', icon: 'create-outline'        },
  submitted: { label: 'Submitted', color: '#185FA5', bg: '#DCF0FF', icon: 'paper-plane-outline'   },
  approved:  { label: 'Approved',  color: '#27500A', bg: '#EAF3DE', icon: 'checkmark-circle'      },
  rejected:  { label: 'Rejected',  color: '#791F1F', bg: '#FCEBEB', icon: 'close-circle-outline'  },
};

// ── Tab definition ──────────────────────────────────────────────────────────
type Tab = 'compliance' | 'legal' | 'projects' | 'minutes';

// ── Shared micro-components ─────────────────────────────────────────────────
function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return <View style={[sp.pill, { backgroundColor: bg }]}><Text style={[sp.pillText, { color }]}>{label}</Text></View>;
}

function EmptySlate({ icon, text }: { icon: string; text: string }) {
  const c = useColors();
  return (
    <View style={sp.empty}>
      <Ionicons name={icon as any} size={38} color={c.border} />
      <Text style={[sp.emptyTxt, { color: c.textMuted }]}>{text}</Text>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function CorporateScreen() {
  const {
    role, userName,
    docs, companyFiles, addCompanyFile,
    legalMatters, addLegalMatter, updateLegalMatter, updateLegalStatus, deleteLegalMatter,
    corpProjects, addCorpProject, updateCorpProject, updateProjectProgress, deleteCorpProject,
    meetingMinutes, addMeetingMinutes, updateMeetingMinutes, deleteMeetingMinutes,
    addCorpAttachment, removeCorpAttachment,
    submitCorpItem, approveCorpItem, rejectCorpItem,
  } = useApp();

  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'csm'] || colors.primary;
  const isCSM     = role === 'csm';
  const isCEO     = role === 'ceo' || role === 'md';
  const isAdmin   = role === 'admin';
  const canCreate = isCSM || isAdmin;

  // ── Tab ──
  const [activeTab, setActiveTab] = useState<Tab>('compliance');

  // ── Expansion (which card shows its full panel) ──
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // ── Attachment form state ──
  const [attachingTo, setAttachingTo] = useState<{ type: CorpRecordType; id: number } | null>(null);
  const [attName,   setAttName]   = useState('');
  const [attType,   setAttType]   = useState('pdf');

  // ── Submit modal ──
  const [submitTarget, setSubmitTarget] = useState<{ type: CorpRecordType; id: number } | null>(null);
  const [submitTo,     setSubmitTo]     = useState<'CEO' | 'MD' | 'Both'>('CEO');

  // ── Reject modal ──
  const [rejectTarget, setRejectTarget] = useState<{ type: CorpRecordType; id: number } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // ── Edit-mode record (id per type) ──
  const [editId, setEditId] = useState<number | null>(null);

  // ── Legal create/edit form ──
  const [showLegalForm, setShowLegalForm] = useState(false);
  const [lTitle,  setLTitle]  = useState('');
  const [lType,   setLType]   = useState<LegalMatter['type']>('Contract');
  const [lParty,  setLParty]  = useState('');
  const [lPri,    setLPri]    = useState<LegalMatter['priority']>('Medium');
  const [lNotes,  setLNotes]  = useState('');
  const [lStatus, setLStatus] = useState<LegalMatter['status']>('Active');

  // ── Project create/edit form ──
  const [showProjForm, setShowProjForm] = useState(false);
  const [pTitle, setPTitle] = useState('');
  const [pDesc,  setPDesc]  = useState('');
  const [pLead,  setPLead]  = useState('');
  const [pStart, setPStart] = useState(new Date().toISOString().split('T')[0]);
  const [pDue,   setPDue]   = useState('');
  const [pStat,  setPStat]  = useState<CorpProject['status']>('Planning');

  // ── Minutes create/edit form ──
  const [showMinForm,  setShowMinForm]  = useState(false);
  const [mTitle,   setMTitle]   = useState('');
  const [mDate,    setMDate]    = useState(new Date().toISOString().split('T')[0]);
  const [mVenue,   setMVenue]   = useState('');
  const [mAtt,     setMAtt]     = useState('');
  const [mSummary, setMSummary] = useState('');

  // ── Document upload ──
  const [selCat,     setSelCat]     = useState(FILE_CATS[0]);
  const [selType,    setSelType]    = useState<typeof DOC_FILE_TYPES[number]>('pdf');
  const [uploadName, setUploadName] = useState('');

  // ── Compliance stats ──
  const expiredDocs = docs.filter(d => daysLeft(d.exp) < 0);
  const urgentDocs  = docs.filter(d => daysLeft(d.exp) >= 0 && daysLeft(d.exp) < 14);
  const warnDocs    = docs.filter(d => daysLeft(d.exp) >= 14 && daysLeft(d.exp) < 30);
  const okDocs      = docs.filter(d => daysLeft(d.exp) >= 30);

  // ── Helpers ─────────────────────────────────────────────────────────────

  function resetLegalForm() { setLTitle(''); setLParty(''); setLNotes(''); setLType('Contract'); setLPri('Medium'); setLStatus('Active'); }
  function resetProjForm()  { setPTitle(''); setPDesc(''); setPLead(''); setPDue(''); setPStat('Planning'); setPStart(new Date().toISOString().split('T')[0]); }
  function resetMinForm()   { setMTitle(''); setMVenue(''); setMAtt(''); setMSummary(''); setMDate(new Date().toISOString().split('T')[0]); }

  function loadLegalForEdit(m: LegalMatter) {
    setLTitle(m.title); setLType(m.type); setLParty(m.party); setLPri(m.priority); setLNotes(m.notes); setLStatus(m.status);
    setEditId(m.id); setShowLegalForm(true);
  }
  function loadProjForEdit(p: CorpProject) {
    setPTitle(p.title); setPDesc(p.description); setPLead(p.lead); setPStart(p.startDate); setPDue(p.dueDate); setPStat(p.status);
    setEditId(p.id); setShowProjForm(true);
  }
  function loadMinForEdit(m: MeetingMinutes) {
    setMTitle(m.title); setMDate(m.date); setMVenue(m.venue); setMAtt(m.attendees); setMSummary(m.summary);
    setEditId(m.id); setShowMinForm(true);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSaveLegal() {
    if (!lTitle.trim() || !lParty.trim()) { Alert.alert('Required', 'Title and party are required.'); return; }
    if (editId !== null) {
      updateLegalMatter(editId, { title: lTitle.trim(), type: lType, party: lParty.trim(), priority: lPri, status: lStatus, notes: lNotes.trim() });
      setEditId(null);
    } else {
      addLegalMatter({ title: lTitle.trim(), type: lType, party: lParty.trim(), priority: lPri, status: lStatus, notes: lNotes.trim() });
    }
    resetLegalForm(); setShowLegalForm(false);
  }

  function handleSaveProject() {
    if (!pTitle.trim() || !pLead.trim() || !pDue) { Alert.alert('Required', 'Title, lead and due date are required.'); return; }
    if (editId !== null) {
      updateCorpProject(editId, { title: pTitle.trim(), description: pDesc.trim(), lead: pLead.trim(), startDate: pStart, dueDate: pDue, status: pStat });
      setEditId(null);
    } else {
      addCorpProject({ title: pTitle.trim(), description: pDesc.trim(), lead: pLead.trim(), startDate: pStart, dueDate: pDue, status: pStat, progress: 0 });
    }
    resetProjForm(); setShowProjForm(false);
  }

  function handleSaveMinutes() {
    if (!mTitle.trim() || !mSummary.trim()) { Alert.alert('Required', 'Title and summary are required.'); return; }
    if (editId !== null) {
      updateMeetingMinutes(editId, { title: mTitle.trim(), date: mDate, venue: mVenue.trim() || 'HQ — Abuja CBD', attendees: mAtt.trim(), summary: mSummary.trim() });
      setEditId(null);
    } else {
      addMeetingMinutes({ title: mTitle.trim(), date: mDate, venue: mVenue.trim() || 'HQ — Abuja CBD', attendees: mAtt.trim(), summary: mSummary.trim(), by: userName || 'System' });
    }
    resetMinForm(); setShowMinForm(false);
  }

  function handleAddAttachment() {
    if (!attachingTo || !attName.trim()) { Alert.alert('Required', 'Please enter a file name.'); return; }
    const ext  = attType === 'img' ? 'jpg' : attType === 'audio' ? 'mp3' : attType === 'zip' ? 'zip' : attType === 'other' ? 'bin' : attType;
    const name = attName.trim().includes('.') ? attName.trim() : `${attName.trim()}.${ext}`;
    const size = FILE_SIZES[Math.floor(Math.random() * FILE_SIZES.length)];
    addCorpAttachment(attachingTo.type, attachingTo.id, { name, fileType: attType, size, uploadedBy: userName || 'System' });
    setAttName(''); setAttType('pdf');
    setAttachingTo(null);
    Alert.alert('Attached', `${name} attached successfully.`);
  }

  function handleSubmit() {
    if (!submitTarget) return;
    submitCorpItem(submitTarget.type, submitTarget.id, submitTo);
    setSubmitTarget(null);
    Alert.alert('Submitted', `Record submitted to ${submitTo} for approval.`);
  }

  function handleApprove(type: CorpRecordType, id: number) {
    Alert.alert('Approve Record', 'Approve this record? It will be locked and cannot be edited further.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => approveCorpItem(type, id) },
    ]);
  }

  function handleReject() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) { Alert.alert('Required', 'Please state a reason for rejection.'); return; }
    rejectCorpItem(rejectTarget.type, rejectTarget.id, rejectReason.trim());
    setRejectTarget(null); setRejectReason('');
    Alert.alert('Rejected', 'Record rejected. CSM has been notified to make corrections.');
  }

  function handleDocUpload() {
    const trimmed = uploadName.trim();
    if (!trimmed) { Alert.alert('Required', 'Please enter a file name.'); return; }
    const ext  = selType === 'img' ? 'jpg' : selType === 'other' ? 'zip' : selType;
    const name = trimmed.includes('.') ? trimmed : `${trimmed}.${ext}`;
    const size = FILE_SIZES[Math.floor(Math.random() * FILE_SIZES.length)];
    addCompanyFile({ name, cat: selCat, by: userName || 'System Admin', size, fileType: selType });
    setUploadName('');
    Alert.alert('Uploaded', `${name} saved to ${selCat}.`);
  }

  // ── Shared card panel renderer ───────────────────────────────────────────

  function ApprovalPanel({ type, approval, id }: { type: CorpRecordType; approval: CorpApproval; id: number }) {
    const am = APPROVAL_META[approval.status];
    const locked  = approval.status === 'approved';
    const canAct  = isCEO || isAdmin;
    const canSubmit = (isCSM || isAdmin) && (approval.status === 'draft' || approval.status === 'rejected');

    return (
      <View style={[sty.approvalWrap, { borderColor: am.color + '40', backgroundColor: am.bg + '80' }]}>
        {/* Status header */}
        <View style={sty.approvalHeader}>
          <Ionicons name={am.icon as any} size={16} color={am.color} />
          <Text style={[sty.approvalStatus, { color: am.color }]}>{am.label}</Text>
          {approval.submittedTo && approval.status !== 'draft' && (
            <Text style={[sty.approvalSub, { color: am.color }]}>→ {approval.submittedTo}</Text>
          )}
        </View>

        {/* Rejection reason */}
        {approval.status === 'rejected' && approval.rejectionReason && (
          <View style={[sty.rejectionBox, { backgroundColor: '#FCEBEB', borderColor: '#791F1F40' }]}>
            <Ionicons name="alert-circle" size={14} color="#791F1F" />
            <View style={{ flex: 1 }}>
              <Text style={sty.rejectionLabel}>Rejection Reason</Text>
              <Text style={sty.rejectionText}>{approval.rejectionReason}</Text>
              {approval.reviewedBy && (
                <Text style={sty.rejectionBy}>— {approval.reviewedBy}, {fmtDate(approval.reviewedAt ?? '')}</Text>
              )}
            </View>
          </View>
        )}

        {/* Approved banner */}
        {locked && (
          <Text style={[sty.approvedBy, { color: '#27500A' }]}>
            Approved by {approval.reviewedBy} · {fmtDate(approval.reviewedAt ?? '')}
          </Text>
        )}

        {/* Submitted info */}
        {approval.status === 'submitted' && approval.submittedBy && (
          <Text style={[sty.approvedBy, { color: '#185FA5' }]}>
            Submitted by {approval.submittedBy} · {fmtDate(approval.submittedAt ?? '')}
          </Text>
        )}

        {/* Action buttons */}
        <View style={sty.approvalActions}>
          {canSubmit && (
            <TouchableOpacity onPress={() => setSubmitTarget({ type, id })}
              style={[sty.actionBtn, { backgroundColor: roleColor }]}>
              <Ionicons name="paper-plane" size={13} color="#fff" />
              <Text style={sty.actionBtnTxt}>{approval.status === 'rejected' ? 'Edit & Resubmit' : 'Submit for Approval'}</Text>
            </TouchableOpacity>
          )}
          {canAct && approval.status === 'submitted' && (
            <>
              <TouchableOpacity onPress={() => handleApprove(type, id)}
                style={[sty.actionBtn, { backgroundColor: '#27500A' }]}>
                <Ionicons name="checkmark-circle" size={13} color="#fff" />
                <Text style={sty.actionBtnTxt}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setRejectTarget({ type, id })}
                style={[sty.actionBtn, { backgroundColor: '#791F1F' }]}>
                <Ionicons name="close-circle" size={13} color="#fff" />
                <Text style={sty.actionBtnTxt}>Reject</Text>
              </TouchableOpacity>
            </>
          )}
          {locked && (
            <View style={[sty.lockedTag, { borderColor: '#27500A40' }]}>
              <Ionicons name="lock-closed" size={12} color="#27500A" />
              <Text style={[sty.lockedTxt, { color: '#27500A' }]}>Locked — Approved</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  function AttachmentsPanel({ type, id, attachments, locked }: {
    type: CorpRecordType; id: number; attachments: CorpAttachment[]; locked: boolean;
  }) {
    const isOpen = attachingTo?.type === type && attachingTo?.id === id;
    return (
      <View style={sty.attWrap}>
        <View style={sty.attHeader}>
          <Ionicons name="attach" size={14} color={colors.textMuted} />
          <Text style={[sty.attTitle, { color: colors.text }]}>Attachments ({attachments.length})</Text>
          {!locked && (canCreate || isCEO || isAdmin) && (
            <TouchableOpacity onPress={() => {
              if (isOpen) { setAttachingTo(null); setAttName(''); }
              else { setAttachingTo({ type, id }); }
            }} style={[sty.attAddBtn, { borderColor: roleColor }]}>
              <Ionicons name={isOpen ? 'close' : 'add'} size={13} color={roleColor} />
              <Text style={[sty.attAddTxt, { color: roleColor }]}>{isOpen ? 'Cancel' : 'Attach'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Attach form */}
        {isOpen && (
          <View style={[sty.attForm, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>File Name *</Text>
            <TextInput value={attName} onChangeText={setAttName}
              placeholder="e.g. Contract_Draft_v2"
              placeholderTextColor={colors.textMuted}
              style={[sty.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
            <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>File Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={sty.typeRow}>
                {ATT_FILE_TYPES.map(t => (
                  <TouchableOpacity key={t.key} onPress={() => setAttType(t.key)}
                    style={[sty.typeBtn, { backgroundColor: t.key === attType ? t.color + '22' : colors.surface, borderColor: t.key === attType ? t.color : colors.border }]}>
                    <Ionicons name={t.icon as any} size={14} color={t.key === attType ? t.color : colors.textMuted} />
                    <Text style={[sty.typeBtnTxt, { color: t.key === attType ? t.color : colors.textMuted }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity onPress={handleAddAttachment}
              style={[sty.attSubmitBtn, { backgroundColor: roleColor }]}>
              <Ionicons name="cloud-upload" size={14} color="#fff" />
              <Text style={sty.attSubmitTxt}>Attach File</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Attachment list */}
        {attachments.map(a => {
          const fi = FILE_TYPE_MAP[a.fileType] || FILE_TYPE_MAP.other;
          return (
            <View key={a.id} style={[sty.attItem, { borderColor: colors.border }]}>
              <View style={[sty.attIcon, { backgroundColor: fi.color + '18' }]}>
                <Ionicons name={fi.icon as any} size={16} color={fi.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[sty.attName, { color: colors.text }]} numberOfLines={1}>{a.name}</Text>
                <Text style={[sty.attMeta, { color: colors.textMuted }]}>{a.size} · {fmtDate(a.uploadedAt)} · {a.uploadedBy}</Text>
              </View>
              {!locked && (canCreate || isAdmin) && (
                <TouchableOpacity onPress={() => removeCorpAttachment(type, id, a.id)}
                  style={sty.attRemove}>
                  <Ionicons name="trash-outline" size={14} color={colors.error} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        {attachments.length === 0 && (
          <Text style={[sty.attEmpty, { color: colors.textMuted }]}>No attachments yet</Text>
        )}
      </View>
    );
  }

  // ── Tab bar ─────────────────────────────────────────────────────────────
  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'compliance', label: 'Compliance', icon: 'shield-checkmark' },
    { key: 'legal',      label: 'Legal',      icon: 'scale'            },
    { key: 'projects',   label: 'Projects',   icon: 'hammer'           },
    { key: 'minutes',    label: 'Minutes',    icon: 'reader'           },
  ];

  return (
    <ScreenLayout title="Corporate Services">

      {/* ── Tab bar ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[sty.tabBar, { borderBottomColor: colors.border }]}
        contentContainerStyle={sty.tabBarContent}>
        {TABS.map(t => {
          const active = t.key === activeTab;
          return (
            <TouchableOpacity key={t.key} onPress={() => { setActiveTab(t.key); setExpandedId(null); setEditId(null); setShowLegalForm(false); setShowProjForm(false); setShowMinForm(false); }}
              style={[sty.tabBtn, { borderBottomColor: active ? roleColor : 'transparent' }]}>
              <Ionicons name={t.icon as any} size={13} color={active ? roleColor : colors.textMuted} />
              <Text style={[sty.tabLabel, { color: active ? roleColor : colors.textMuted, fontWeight: active ? '700' : '400' }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ════════════════════════════════════════ COMPLIANCE */}
      {activeTab === 'compliance' && (
        <ScrollView contentContainerStyle={sty.scroll} showsVerticalScrollIndicator={false}>
          <View style={sty.summaryRow}>
            {[
              { n: expiredDocs.length, label: 'Expired',  col: colors.error,   bg: colors.errorBg,   border: colors.errorBorder   },
              { n: urgentDocs.length,  label: '<14 days', col: colors.error,   bg: colors.errorBg,   border: colors.errorBorder   },
              { n: warnDocs.length,    label: '<30 days', col: colors.warning, bg: colors.warningBg, border: colors.warningBorder },
              { n: okDocs.length,      label: 'Current',  col: colors.success, bg: colors.successBg, border: colors.successBorder },
            ].map(s => (
              <View key={s.label} style={[sty.summaryCard, { backgroundColor: s.bg, borderColor: s.border }]}>
                <Text style={[sty.summaryNum, { color: s.col }]}>{s.n}</Text>
                <Text style={[sty.summaryLabel, { color: s.col }]}>{s.label}</Text>
              </View>
            ))}
          </View>
          {docs.map(doc => {
            const days = daysLeft(doc.exp);
            const st   = getDocStatus(days);
            return (
              <View key={doc.id} style={[sty.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={sty.cardHeader}>
                  <View style={[sty.cardIcon, { backgroundColor: roleColor + '18' }]}>
                    <Ionicons name="document-text" size={18} color={roleColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[sty.cardTitle, { color: colors.text }]}>{doc.name}</Text>
                    <Text style={[sty.cardSub, { color: colors.textMuted }]}>{doc.iss} · Ref: {doc.ref}</Text>
                  </View>
                  <Pill label={st.label} color={st.color} bg={st.bg} />
                </View>
                <View style={sty.infoRow}>
                  <View><Text style={[sty.infoLabel, { color: colors.textMuted }]}>Category</Text><Text style={[sty.infoValue, { color: colors.text }]}>{doc.cat}</Text></View>
                  <View><Text style={[sty.infoLabel, { color: colors.textMuted }]}>Expires</Text><Text style={[sty.infoValue, { color: st.color }]}>{fmtDate(doc.exp)}</Text></View>
                </View>
                {days < 30 && (
                  <View style={[sty.alertBanner, { backgroundColor: st.bg }]}>
                    <Ionicons name="warning" size={14} color={st.color} />
                    <Text style={[sty.alertText, { color: st.color }]}>
                      {days < 0 ? 'Expired. Immediate renewal required.' : `Renewal required within ${days} days.`}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
          {docs.length === 0 && <EmptySlate icon="shield-outline" text="No compliance documents" />}

          {/* ── Corporate Documents upload ── */}
          <View style={[sty.divider, { borderColor: colors.border }]} />
          <Text style={[sty.sectionTitle, { color: colors.text }]}>Corporate Documents</Text>

          {(canCreate || isAdmin) && (
            <View style={[sty.uploadPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={sty.uploadHeader}>
                <Ionicons name="cloud-upload" size={20} color={roleColor} />
                <Text style={[sty.uploadTitle, { color: colors.text }]}>Upload Document</Text>
              </View>
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Category</Text>
              <View style={sty.chipRow}>
                {FILE_CATS.map(c => (
                  <TouchableOpacity key={c} onPress={() => setSelCat(c)}
                    style={[sty.chip, { backgroundColor: c === selCat ? roleColor : colors.background, borderColor: c === selCat ? roleColor : colors.border }]}>
                    <Text style={[sty.chipTxt, { color: c === selCat ? '#fff' : colors.textMuted }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>File Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                <View style={sty.typeRow}>
                  {DOC_FILE_TYPES.map(t => {
                    const fi = FILE_TYPE_MAP[t];
                    return (
                      <TouchableOpacity key={t} onPress={() => setSelType(t)}
                        style={[sty.typeBtn, { backgroundColor: t === selType ? fi.color + '22' : colors.background, borderColor: t === selType ? fi.color : colors.border }]}>
                        <Ionicons name={fi.icon as any} size={15} color={t === selType ? fi.color : colors.textMuted} />
                        <Text style={[sty.typeBtnTxt, { color: t === selType ? fi.color : colors.textMuted }]}>{t.toUpperCase()}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>File Name</Text>
              <TextInput
                style={[sty.textInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, marginBottom: 12 }]}
                value={uploadName} onChangeText={setUploadName}
                placeholder="e.g. Board_Resolution_July2026" placeholderTextColor={colors.textSubtle} />
              <TouchableOpacity onPress={handleDocUpload} style={[sty.submitBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="cloud-upload" size={16} color="#fff" />
                <Text style={sty.submitBtnTxt}>Upload Document</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={[sty.subSectionTitle, { color: colors.textMuted }]}>Uploaded Files ({companyFiles.length})</Text>
          {companyFiles.length === 0 && <EmptySlate icon="folder-open-outline" text="No documents uploaded yet" />}
          {[...companyFiles].reverse().map(f => {
            const fi = FILE_TYPE_MAP[f.fileType] || FILE_TYPE_MAP.other;
            return (
              <View key={f.id} style={[sty.fileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[sty.fileIconWrap, { backgroundColor: fi.color + '18' }]}>
                  <Ionicons name={fi.icon as any} size={22} color={fi.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[sty.fileName, { color: colors.text }]} numberOfLines={1}>{f.name}</Text>
                  <Text style={[sty.fileMeta, { color: colors.textMuted }]}>{f.cat} · {f.size}</Text>
                  <Text style={[sty.fileBy, { color: colors.textSubtle }]}>by {f.by} · {fmtDateTime(f.dt)}</Text>
                </View>
                <TouchableOpacity style={[sty.iconBtn, { borderColor: colors.border }]}>
                  <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            );
          })}

          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {/* ════════════════════════════════════════ LEGAL */}
      {activeTab === 'legal' && (
        <ScrollView contentContainerStyle={sty.scroll} showsVerticalScrollIndicator={false}>
          {/* Summary */}
          <View style={sty.summaryRow}>
            {(['Active','Pending','Resolved','Closed'] as LegalMatter['status'][]).map(s => {
              const m = LEGAL_STATUS_META[s];
              return (
                <View key={s} style={[sty.summaryCard, { backgroundColor: m.bg, borderColor: m.color + '44' }]}>
                  <Text style={[sty.summaryNum, { color: m.color }]}>{legalMatters.filter(l => l.status === s).length}</Text>
                  <Text style={[sty.summaryLabel, { color: m.color }]}>{s}</Text>
                </View>
              );
            })}
          </View>

          {/* Create / edit form */}
          {canCreate && (
            <TouchableOpacity onPress={() => { if (showLegalForm && editId === null) { setShowLegalForm(false); resetLegalForm(); } else if (!showLegalForm) { setShowLegalForm(true); setEditId(null); resetLegalForm(); } }}
              style={[sty.addBtn, { backgroundColor: showLegalForm && editId === null ? colors.border : roleColor }]}>
              <Ionicons name={showLegalForm && editId === null ? 'close' : 'add'} size={16} color={showLegalForm && editId === null ? colors.textMuted : '#fff'} />
              <Text style={[sty.addBtnTxt, { color: showLegalForm && editId === null ? colors.textMuted : '#fff' }]}>
                {showLegalForm && editId === null ? 'Cancel' : 'Add Legal Matter'}
              </Text>
            </TouchableOpacity>
          )}

          {showLegalForm && (
            <View style={[sty.form, { backgroundColor: colors.surface, borderColor: roleColor + '44' }]}>
              <Text style={[sty.formTitle, { color: colors.text }]}>{editId ? 'Edit Legal Matter' : 'New Legal Matter'}</Text>
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Title *</Text>
              <TextInput value={lTitle} onChangeText={setLTitle} placeholder="e.g. Lease Agreement — Lugbe Branch" placeholderTextColor={colors.textMuted}
                style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Type</Text>
              <View style={sty.chipRow}>
                {LEGAL_TYPES.map(t => (
                  <TouchableOpacity key={t} onPress={() => setLType(t)} style={[sty.chip, { backgroundColor: t === lType ? roleColor : colors.background, borderColor: t === lType ? roleColor : colors.border }]}>
                    <Text style={[sty.chipTxt, { color: t === lType ? '#fff' : colors.textMuted }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Counterparty / Lawyer *</Text>
              <TextInput value={lParty} onChangeText={setLParty} placeholder="e.g. FIRS, Aluko & Oyebode" placeholderTextColor={colors.textMuted}
                style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Priority</Text>
              <View style={sty.chipRow}>
                {(['High','Medium','Low'] as LegalMatter['priority'][]).map(p => {
                  const m = LEGAL_PRI_META[p];
                  return (
                    <TouchableOpacity key={p} onPress={() => setLPri(p)} style={[sty.chip, { backgroundColor: p === lPri ? m.color : colors.background, borderColor: p === lPri ? m.color : colors.border }]}>
                      <Text style={[sty.chipTxt, { color: p === lPri ? '#fff' : colors.textMuted }]}>{p}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Status</Text>
              <View style={sty.chipRow}>
                {(['Active','Pending','Resolved','Closed'] as LegalMatter['status'][]).map(s => (
                  <TouchableOpacity key={s} onPress={() => setLStatus(s)} style={[sty.chip, { backgroundColor: s === lStatus ? roleColor : colors.background, borderColor: s === lStatus ? roleColor : colors.border }]}>
                    <Text style={[sty.chipTxt, { color: s === lStatus ? '#fff' : colors.textMuted }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Notes</Text>
              <TextInput value={lNotes} onChangeText={setLNotes} placeholder="Background, key terms, next steps…" placeholderTextColor={colors.textMuted}
                multiline numberOfLines={3} style={[sty.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
              <TouchableOpacity onPress={handleSaveLegal} style={[sty.submitBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={sty.submitBtnTxt}>{editId ? 'Save Changes' : 'Create Legal Matter'}</Text>
              </TouchableOpacity>
              {editId && (
                <TouchableOpacity onPress={() => { setEditId(null); resetLegalForm(); setShowLegalForm(false); }}
                  style={[sty.cancelEditBtn, { borderColor: colors.border }]}>
                  <Text style={[sty.cancelEditTxt, { color: colors.textMuted }]}>Cancel Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {legalMatters.length === 0 && <EmptySlate icon="scale-outline" text="No legal matters recorded" />}
          {legalMatters.map(m => {
            const sm = LEGAL_STATUS_META[m.status];
            const pm = LEGAL_PRI_META[m.priority];
            const am = APPROVAL_META[m.approval.status];
            const locked = m.approval.status === 'approved';
            const expanded = expandedId === m.id;
            return (
              <View key={m.id} style={[sty.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity style={sty.cardHeader} onPress={() => setExpandedId(expanded ? null : m.id)} activeOpacity={0.7}>
                  <View style={[sty.cardIcon, { backgroundColor: '#8E44AD18' }]}>
                    <Ionicons name="scale" size={18} color="#8E44AD" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[sty.cardTitle, { color: colors.text }]}>{m.title}</Text>
                    <Text style={[sty.cardSub, { color: colors.textMuted }]}>{m.type} · {m.party}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Pill label={m.status}         color={sm.color} bg={sm.bg} />
                    <Pill label={m.approval.status} color={am.color} bg={am.bg} />
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textMuted} style={{ marginLeft: 6 }} />
                </TouchableOpacity>

                {m.notes.length > 0 && !expanded && (
                  <Text style={[sty.noteText, { color: colors.textMuted }]} numberOfLines={1}>{m.notes}</Text>
                )}

                {expanded && (
                  <View style={[sty.expandBody, { borderTopColor: colors.border }]}>
                    {m.notes.length > 0 && <Text style={[sty.noteText, { color: colors.textMuted }]}>{m.notes}</Text>}
                    <Pill label={m.priority} color={pm.color} bg={pm.bg} />
                    <Text style={[sty.metaTxt, { color: colors.textSubtle }]}>Opened {fmtDate(m.openedAt)}</Text>

                    <AttachmentsPanel type="legal" id={m.id} attachments={m.attachments} locked={locked} />
                    <ApprovalPanel type="legal" id={m.id} approval={m.approval} />

                    {!locked && canCreate && (
                      <View style={sty.cardActions}>
                        <TouchableOpacity onPress={() => { loadLegalForEdit(m); window.scrollTo?.(0, 0); }}
                          style={[sty.editBtn, { borderColor: roleColor }]}>
                          <Ionicons name="create-outline" size={14} color={roleColor} />
                          <Text style={[sty.editBtnTxt, { color: roleColor }]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => Alert.alert('Delete', `Remove "${m.title}"?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => deleteLegalMatter(m.id) },
                        ])} style={[sty.deleteBtn, { borderColor: colors.error }]}>
                          <Ionicons name="trash-outline" size={14} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {/* ════════════════════════════════════════ PROJECTS */}
      {activeTab === 'projects' && (
        <ScrollView contentContainerStyle={sty.scroll} showsVerticalScrollIndicator={false}>
          <View style={sty.summaryRow}>
            {(['Planning','Active','On Hold','Completed'] as CorpProject['status'][]).map(s => {
              const m = PROJ_STATUS_META[s];
              return (
                <View key={s} style={[sty.summaryCard, { backgroundColor: m.bg, borderColor: m.color + '44' }]}>
                  <Text style={[sty.summaryNum, { color: m.color }]}>{corpProjects.filter(p => p.status === s).length}</Text>
                  <Text style={[sty.summaryLabel, { color: m.color }]}>{s}</Text>
                </View>
              );
            })}
          </View>

          {canCreate && (
            <TouchableOpacity onPress={() => { if (showProjForm && editId === null) { setShowProjForm(false); resetProjForm(); } else if (!showProjForm) { setShowProjForm(true); setEditId(null); resetProjForm(); } }}
              style={[sty.addBtn, { backgroundColor: showProjForm && editId === null ? colors.border : roleColor }]}>
              <Ionicons name={showProjForm && editId === null ? 'close' : 'add'} size={16} color={showProjForm && editId === null ? colors.textMuted : '#fff'} />
              <Text style={[sty.addBtnTxt, { color: showProjForm && editId === null ? colors.textMuted : '#fff' }]}>
                {showProjForm && editId === null ? 'Cancel' : 'New Project'}
              </Text>
            </TouchableOpacity>
          )}

          {showProjForm && (
            <View style={[sty.form, { backgroundColor: colors.surface, borderColor: roleColor + '44' }]}>
              <Text style={[sty.formTitle, { color: colors.text }]}>{editId ? 'Edit Project' : 'New Corporate Project'}</Text>
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Project Title *</Text>
              <TextInput value={pTitle} onChangeText={setPTitle} placeholder="e.g. Branch Renovation — Lugbe" placeholderTextColor={colors.textMuted}
                style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Description</Text>
              <TextInput value={pDesc} onChangeText={setPDesc} placeholder="Brief scope of work…" placeholderTextColor={colors.textMuted} multiline numberOfLines={2}
                style={[sty.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Project Lead *</Text>
              <TextInput value={pLead} onChangeText={setPLead} placeholder="e.g. Ngozi Okafor" placeholderTextColor={colors.textMuted}
                style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
              <View style={sty.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Start Date</Text>
                  <TextInput value={pStart} onChangeText={setPStart} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted}
                    style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Due Date *</Text>
                  <TextInput value={pDue} onChangeText={setPDue} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted}
                    style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                </View>
              </View>
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Status</Text>
              <View style={sty.chipRow}>
                {(['Planning','Active','On Hold'] as CorpProject['status'][]).map(s => {
                  const m = PROJ_STATUS_META[s];
                  return (
                    <TouchableOpacity key={s} onPress={() => setPStat(s)} style={[sty.chip, { backgroundColor: s === pStat ? m.color : colors.background, borderColor: s === pStat ? m.color : colors.border }]}>
                      <Text style={[sty.chipTxt, { color: s === pStat ? '#fff' : colors.textMuted }]}>{s}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity onPress={handleSaveProject} style={[sty.submitBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={sty.submitBtnTxt}>{editId ? 'Save Changes' : 'Create Project'}</Text>
              </TouchableOpacity>
              {editId && (
                <TouchableOpacity onPress={() => { setEditId(null); resetProjForm(); setShowProjForm(false); }}
                  style={[sty.cancelEditBtn, { borderColor: colors.border }]}>
                  <Text style={[sty.cancelEditTxt, { color: colors.textMuted }]}>Cancel Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {corpProjects.length === 0 && <EmptySlate icon="hammer-outline" text="No projects yet" />}
          {corpProjects.map(p => {
            const sm = PROJ_STATUS_META[p.status];
            const am = APPROVAL_META[p.approval.status];
            const locked   = p.approval.status === 'approved';
            const expanded = expandedId === p.id;
            const pct = Math.min(100, Math.max(0, p.progress));
            return (
              <View key={p.id} style={[sty.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity style={sty.cardHeader} onPress={() => setExpandedId(expanded ? null : p.id)} activeOpacity={0.7}>
                  <View style={[sty.cardIcon, { backgroundColor: sm.bg }]}>
                    <Ionicons name={sm.icon as any} size={18} color={sm.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[sty.cardTitle, { color: colors.text }]}>{p.title}</Text>
                    <Text style={[sty.cardSub, { color: colors.textMuted }]}>Lead: {p.lead}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Pill label={p.status}          color={sm.color} bg={sm.bg} />
                    <Pill label={p.approval.status} color={am.color} bg={am.bg} />
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textMuted} style={{ marginLeft: 6 }} />
                </TouchableOpacity>

                {/* Progress bar always visible */}
                <View style={sty.progressWrap}>
                  <View style={[sty.progressBg, { backgroundColor: colors.border }]}>
                    <View style={[sty.progressFill, { width: `${pct}%` as any, backgroundColor: sm.color }]} />
                  </View>
                  <Text style={[sty.progressLabel, { color: colors.textMuted }]}>{pct}%</Text>
                </View>

                {expanded && (
                  <View style={[sty.expandBody, { borderTopColor: colors.border }]}>
                    {p.description.length > 0 && <Text style={[sty.noteText, { color: colors.textMuted }]}>{p.description}</Text>}
                    <Text style={[sty.metaTxt, { color: colors.textSubtle }]}>{fmtDate(p.startDate)} → {fmtDate(p.dueDate)}</Text>

                    {/* Progress controls */}
                    {!locked && (canCreate || isCEO || isAdmin) && p.status !== 'Completed' && p.status !== 'Cancelled' && (
                      <TouchableOpacity onPress={() => {
                        const newPct = Math.min(100, pct + 25);
                        updateProjectProgress(p.id, newPct, newPct >= 100 ? 'Completed' : p.status);
                      }} style={[sty.progressBtn, { borderColor: sm.color }]}>
                        <Ionicons name="trending-up-outline" size={14} color={sm.color} />
                        <Text style={[sty.progressBtnTxt, { color: sm.color }]}>Advance Progress +25%</Text>
                      </TouchableOpacity>
                    )}

                    <AttachmentsPanel type="project" id={p.id} attachments={p.attachments} locked={locked} />
                    <ApprovalPanel type="project" id={p.id} approval={p.approval} />

                    {!locked && canCreate && (
                      <View style={sty.cardActions}>
                        <TouchableOpacity onPress={() => loadProjForEdit(p)} style={[sty.editBtn, { borderColor: roleColor }]}>
                          <Ionicons name="create-outline" size={14} color={roleColor} />
                          <Text style={[sty.editBtnTxt, { color: roleColor }]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => Alert.alert('Delete', `Remove "${p.title}"?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => deleteCorpProject(p.id) },
                        ])} style={[sty.deleteBtn, { borderColor: colors.error }]}>
                          <Ionicons name="trash-outline" size={14} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {/* ════════════════════════════════════════ MEETING MINUTES */}
      {activeTab === 'minutes' && (() => {
        const isStaffOnly = !isCSM && !isCEO && !isAdmin;
        const sharedMinutes = meetingMinutes.filter(m => m.shared);

        /* ── Staff-only view: read-only shared minutes ── */
        if (isStaffOnly) return (
          <ScrollView contentContainerStyle={sty.scroll} showsVerticalScrollIndicator={false}>
            <View style={[sty.sharedBanner, { backgroundColor: '#DCF0FF', borderColor: '#185FA540' }]}>
              <Ionicons name="share-social" size={16} color="#185FA5" />
              <Text style={[sty.sharedBannerTxt, { color: '#185FA5' }]}>
                Minutes shared with you by Corporate Services
              </Text>
            </View>
            {sharedMinutes.length === 0 && <EmptySlate icon="reader-outline" text="No minutes have been shared with staff yet" />}
            {sharedMinutes.map(m => {
              const expanded = expandedId === m.id;
              return (
                <View key={m.id} style={[sty.card, { backgroundColor: colors.surface, borderColor: '#185FA540' }]}>
                  <TouchableOpacity style={sty.cardHeader} onPress={() => setExpandedId(expanded ? null : m.id)} activeOpacity={0.7}>
                    <View style={[sty.cardIcon, { backgroundColor: '#185FA518' }]}>
                      <Ionicons name="reader" size={18} color="#185FA5" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[sty.cardTitle, { color: colors.text }]}>{m.title}</Text>
                      <Text style={[sty.cardSub, { color: colors.textMuted }]}>{fmtDate(m.date)} · {m.venue}</Text>
                    </View>
                    <View style={[sty.sharedPill, { backgroundColor: '#DCF0FF' }]}>
                      <Ionicons name="share-social" size={10} color="#185FA5" />
                      <Text style={[sty.sharedPillTxt, { color: '#185FA5' }]}>Shared</Text>
                    </View>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textMuted} style={{ marginLeft: 6 }} />
                  </TouchableOpacity>

                  {m.attendees.length > 0 && (
                    <View style={[sty.attendeeRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Ionicons name="people-outline" size={12} color={colors.textMuted} />
                      <Text style={[sty.attendeeTxt, { color: colors.textMuted }]}>{m.attendees}</Text>
                    </View>
                  )}
                  <Text style={[sty.noteText, { color: colors.text }]} numberOfLines={expanded ? undefined : 2}>{m.summary}</Text>

                  {expanded && m.attachments.length > 0 && (
                    <View style={[sty.expandBody, { borderTopColor: colors.border }]}>
                      <Text style={[sty.attTitle, { color: colors.text, marginBottom: 6 }]}>
                        <Ionicons name="attach" size={13} color={colors.textMuted} /> Attachments ({m.attachments.length})
                      </Text>
                      {m.attachments.map(a => {
                        const fi = FILE_TYPE_MAP[a.fileType] || FILE_TYPE_MAP.other;
                        return (
                          <View key={a.id} style={[sty.attItem, { borderColor: colors.border }]}>
                            <View style={[sty.attIcon, { backgroundColor: fi.color + '18' }]}>
                              <Ionicons name={fi.icon as any} size={16} color={fi.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[sty.attName, { color: colors.text }]} numberOfLines={1}>{a.name}</Text>
                              <Text style={[sty.attMeta, { color: colors.textMuted }]}>{a.size} · {fmtDate(a.uploadedAt)}</Text>
                            </View>
                          </View>
                        );
                      })}
                      {m.sharedBy && (
                        <Text style={[sty.metaTxt, { color: colors.textSubtle, marginTop: 6 }]}>
                          Shared by {m.sharedBy} · {fmtDate(m.sharedAt ?? '')}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            <View style={{ height: 20 }} />
          </ScrollView>
        );

        /* ── CSM / CEO / Admin view: full management ── */
        return (
          <ScrollView contentContainerStyle={sty.scroll} showsVerticalScrollIndicator={false}>
            {/* Sharing summary */}
            {sharedMinutes.length > 0 && (
              <View style={[sty.sharedBanner, { backgroundColor: '#EAF3DE', borderColor: '#27500A40' }]}>
                <Ionicons name="share-social" size={15} color="#27500A" />
                <Text style={[sty.sharedBannerTxt, { color: '#27500A' }]}>
                  {sharedMinutes.length} {sharedMinutes.length === 1 ? 'record' : 'records'} shared with all staff
                </Text>
              </View>
            )}

            {canCreate && (
              <TouchableOpacity onPress={() => { if (showMinForm && editId === null) { setShowMinForm(false); resetMinForm(); } else if (!showMinForm) { setShowMinForm(true); setEditId(null); resetMinForm(); } }}
                style={[sty.addBtn, { backgroundColor: showMinForm && editId === null ? colors.border : roleColor }]}>
                <Ionicons name={showMinForm && editId === null ? 'close' : 'add'} size={16} color={showMinForm && editId === null ? colors.textMuted : '#fff'} />
                <Text style={[sty.addBtnTxt, { color: showMinForm && editId === null ? colors.textMuted : '#fff' }]}>
                  {showMinForm && editId === null ? 'Cancel' : 'Record Minutes'}
                </Text>
              </TouchableOpacity>
            )}

            {showMinForm && (
              <View style={[sty.form, { backgroundColor: colors.surface, borderColor: roleColor + '44' }]}>
                <Text style={[sty.formTitle, { color: colors.text }]}>{editId ? 'Edit Meeting Minutes' : 'Meeting Minutes'}</Text>
                <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Meeting Title *</Text>
                <TextInput value={mTitle} onChangeText={setMTitle} placeholder="e.g. Board Meeting — Q3 Review" placeholderTextColor={colors.textMuted}
                  style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                <View style={sty.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Date</Text>
                    <TextInput value={mDate} onChangeText={setMDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted}
                      style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Venue</Text>
                    <TextInput value={mVenue} onChangeText={setMVenue} placeholder="e.g. HQ Boardroom" placeholderTextColor={colors.textMuted}
                      style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                  </View>
                </View>
                <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Attendees</Text>
                <TextInput value={mAtt} onChangeText={setMAtt} placeholder="e.g. CEO, MD, CSM, ACC" placeholderTextColor={colors.textMuted}
                  style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Key Decisions / Summary *</Text>
                <TextInput value={mSummary} onChangeText={setMSummary}
                  placeholder="Record agenda items, key decisions, and action points…"
                  placeholderTextColor={colors.textMuted} multiline numberOfLines={5}
                  style={[sty.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, minHeight: 100 }]} />
                <TouchableOpacity onPress={handleSaveMinutes} style={[sty.submitBtn, { backgroundColor: roleColor }]}>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={sty.submitBtnTxt}>{editId ? 'Save Changes' : 'Save Minutes'}</Text>
                </TouchableOpacity>
                {editId && (
                  <TouchableOpacity onPress={() => { setEditId(null); resetMinForm(); setShowMinForm(false); }}
                    style={[sty.cancelEditBtn, { borderColor: colors.border }]}>
                    <Text style={[sty.cancelEditTxt, { color: colors.textMuted }]}>Cancel Edit</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {meetingMinutes.length === 0 && <EmptySlate icon="reader-outline" text="No meeting minutes recorded" />}
            {meetingMinutes.map(m => {
              const am = APPROVAL_META[m.approval.status];
              const locked   = m.approval.status === 'approved';
              const expanded = expandedId === m.id;
              return (
                <View key={m.id} style={[sty.card, { backgroundColor: colors.surface, borderColor: m.shared ? '#185FA540' : colors.border }]}>
                  <TouchableOpacity style={sty.cardHeader} onPress={() => setExpandedId(expanded ? null : m.id)} activeOpacity={0.7}>
                    <View style={[sty.cardIcon, { backgroundColor: roleColor + '18' }]}>
                      <Ionicons name="reader" size={18} color={roleColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[sty.cardTitle, { color: colors.text }]}>{m.title}</Text>
                      <Text style={[sty.cardSub, { color: colors.textMuted }]}>{fmtDate(m.date)} · {m.venue}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Pill label={m.approval.status} color={am.color} bg={am.bg} />
                      {m.shared && (
                        <View style={[sty.sharedPill, { backgroundColor: '#DCF0FF' }]}>
                          <Ionicons name="share-social" size={10} color="#185FA5" />
                          <Text style={[sty.sharedPillTxt, { color: '#185FA5' }]}>Shared</Text>
                        </View>
                      )}
                    </View>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textMuted} style={{ marginLeft: 6 }} />
                  </TouchableOpacity>

                  {m.attendees.length > 0 && (
                    <View style={[sty.attendeeRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Ionicons name="people-outline" size={12} color={colors.textMuted} />
                      <Text style={[sty.attendeeTxt, { color: colors.textMuted }]}>{m.attendees}</Text>
                    </View>
                  )}

                  {!expanded && (
                    <Text style={[sty.noteText, { color: colors.text }]} numberOfLines={2}>{m.summary}</Text>
                  )}

                  {expanded && (
                    <View style={[sty.expandBody, { borderTopColor: colors.border }]}>
                      <Text style={[sty.noteText, { color: colors.text }]}>{m.summary}</Text>
                      <Text style={[sty.metaTxt, { color: colors.textSubtle }]}>Recorded by {m.by}</Text>

                      <AttachmentsPanel type="minutes" id={m.id} attachments={m.attachments} locked={locked} />
                      <ApprovalPanel type="minutes" id={m.id} approval={m.approval} />

                      <View style={sty.cardActions}>
                        {!locked && canCreate && (
                          <>
                            <TouchableOpacity onPress={() => loadMinForEdit(m)} style={[sty.editBtn, { borderColor: roleColor }]}>
                              <Ionicons name="create-outline" size={14} color={roleColor} />
                              <Text style={[sty.editBtnTxt, { color: roleColor }]}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => Alert.alert('Delete', `Remove "${m.title}"?`, [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: () => deleteMeetingMinutes(m.id) },
                            ])} style={[sty.deleteBtn, { borderColor: colors.error }]}>
                              <Ionicons name="trash-outline" size={14} color={colors.error} />
                            </TouchableOpacity>
                          </>
                        )}
                        {/* Share toggle — CSM and admin */}
                        {canCreate && (
                          <TouchableOpacity
                            onPress={() => {
                              if (m.shared) {
                                Alert.alert('Stop Sharing', `Remove "${m.title}" from staff view?`, [
                                  { text: 'Cancel', style: 'cancel' },
                                  { text: 'Stop Sharing', style: 'destructive', onPress: () => updateMeetingMinutes(m.id, { shared: false, sharedAt: undefined, sharedBy: undefined }) },
                                ]);
                              } else {
                                updateMeetingMinutes(m.id, { shared: true, sharedAt: new Date().toISOString(), sharedBy: userName || 'System' });
                                Alert.alert('Shared', 'These minutes are now visible to all staff.');
                              }
                            }}
                            style={[sty.shareBtn, {
                              backgroundColor: m.shared ? '#DCF0FF' : colors.background,
                              borderColor: m.shared ? '#185FA5' : colors.border,
                            }]}>
                            <Ionicons name={m.shared ? 'share-social' : 'share-social-outline'} size={13} color={m.shared ? '#185FA5' : colors.textMuted} />
                            <Text style={[sty.shareBtnTxt, { color: m.shared ? '#185FA5' : colors.textMuted }]}>
                              {m.shared ? 'Shared' : 'Share with Staff'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
            <View style={{ height: 20 }} />
          </ScrollView>
        );
      })()}

      {/* ════════════════════════════════ SUBMIT MODAL */}
      <Modal visible={!!submitTarget} transparent animationType="fade">
        <View style={sty.modalBackdrop}>
          <View style={[sty.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[sty.modalTitle, { color: colors.text }]}>Submit for Approval</Text>
            <Text style={[sty.modalSub, { color: colors.textMuted }]}>Select who should review this record:</Text>
            <View style={sty.chipRow}>
              {(['CEO', 'MD', 'Both'] as const).map(opt => (
                <TouchableOpacity key={opt} onPress={() => setSubmitTo(opt)}
                  style={[sty.chip, { backgroundColor: opt === submitTo ? roleColor : colors.background, borderColor: opt === submitTo ? roleColor : colors.border, flex: 1, justifyContent: 'center' }]}>
                  <Text style={[sty.chipTxt, { color: opt === submitTo ? '#fff' : colors.textMuted, textAlign: 'center' }]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={sty.modalActions}>
              <TouchableOpacity onPress={() => setSubmitTarget(null)} style={[sty.modalCancelBtn, { borderColor: colors.border }]}>
                <Text style={[sty.modalCancelTxt, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSubmit} style={[sty.modalConfirmBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="paper-plane" size={14} color="#fff" />
                <Text style={sty.modalConfirmTxt}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════ REJECT MODAL */}
      <Modal visible={!!rejectTarget} transparent animationType="fade">
        <View style={sty.modalBackdrop}>
          <View style={[sty.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[sty.modalTitle, { color: colors.text }]}>Reject Record</Text>
            <Text style={[sty.modalSub, { color: colors.textMuted }]}>State the reason for rejection so CSM can correct:</Text>
            <TextInput value={rejectReason} onChangeText={setRejectReason}
              placeholder="e.g. Incorrect party details, missing supporting documents…"
              placeholderTextColor={colors.textMuted} multiline numberOfLines={4}
              style={[sty.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, minHeight: 80 }]} />
            <View style={sty.modalActions}>
              <TouchableOpacity onPress={() => { setRejectTarget(null); setRejectReason(''); }} style={[sty.modalCancelBtn, { borderColor: colors.border }]}>
                <Text style={[sty.modalCancelTxt, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleReject} style={[sty.modalConfirmBtn, { backgroundColor: '#791F1F' }]}>
                <Ionicons name="close-circle" size={14} color="#fff" />
                <Text style={sty.modalConfirmTxt}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScreenLayout>
  );
}

// ── Shared pill styles ──────────────────────────────────────────────────────
const sp = StyleSheet.create({
  pill:    { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  pillText:{ fontSize: 10, fontWeight: '700' },
  empty:   { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTxt:{ fontSize: 14 },
});

// ── Main styles ─────────────────────────────────────────────────────────────
const sty = StyleSheet.create({
  tabBar:        { borderBottomWidth: StyleSheet.hairlineWidth, flexGrow: 0 },
  tabBarContent: { flexDirection: 'row' },
  tabBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 2 },
  tabLabel:      { fontSize: 12 },

  scroll:        { padding: 14 },

  summaryRow:    { flexDirection: 'row', gap: 8, marginBottom: 14 },
  summaryCard:   { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  summaryNum:    { fontSize: 20, fontWeight: '700' },
  summaryLabel:  { fontSize: 9, marginTop: 2, textAlign: 'center' },

  addBtn:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, marginBottom: 14, alignSelf: 'flex-start' },
  addBtnTxt:     { fontSize: 13, fontWeight: '700' },

  form:          { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 14, gap: 2 },
  formTitle:     { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  fieldLabel:    { fontSize: 12, fontWeight: '600', marginTop: 8, marginBottom: 4 },
  textInput:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  textArea:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, textAlignVertical: 'top' },
  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:          { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  chipTxt:       { fontSize: 11, fontWeight: '600' },
  twoCol:        { flexDirection: 'row', gap: 10 },
  submitBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, marginTop: 12 },
  submitBtnTxt:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelEditBtn: { alignItems: 'center', paddingVertical: 10, borderRadius: 10, marginTop: 6, borderWidth: 1 },
  cancelEditTxt: { fontSize: 13, fontWeight: '600' },

  card:          { borderRadius: 14, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13 },
  cardIcon:      { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle:     { fontSize: 14, fontWeight: '600' },
  cardSub:       { fontSize: 11, marginTop: 2 },
  noteText:      { fontSize: 12, lineHeight: 17, paddingHorizontal: 13 },
  expandBody:    { borderTopWidth: StyleSheet.hairlineWidth, padding: 13, gap: 10 },
  metaTxt:       { fontSize: 10 },
  cardActions:   { flexDirection: 'row', gap: 8, marginTop: 4 },
  editBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  editBtnTxt:    { fontSize: 12, fontWeight: '600' },
  deleteBtn:     { padding: 7, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  iconBtn:       { padding: 7, borderRadius: 8, borderWidth: 1 },

  infoRow:       { flexDirection: 'row', gap: 24, padding: 13, paddingTop: 0 },
  infoLabel:     { fontSize: 10 },
  infoValue:     { fontSize: 13, fontWeight: '600', marginTop: 1 },
  alertBanner:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 10, margin: 13, marginTop: 0, borderRadius: 8 },
  alertText:     { flex: 1, fontSize: 12, lineHeight: 17 },

  progressWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, paddingBottom: 10 },
  progressBg:    { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: 5, borderRadius: 3 },
  progressLabel: { fontSize: 11, fontWeight: '600', width: 32, textAlign: 'right' },
  progressBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, alignSelf: 'flex-start' },
  progressBtnTxt:{ fontSize: 12, fontWeight: '600' },

  attendeeRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 13, marginBottom: 6, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  attendeeTxt:   { fontSize: 11, flex: 1 },

  // Approval panel
  approvalWrap:     { borderRadius: 10, borderWidth: 1, padding: 12, gap: 8 },
  approvalHeader:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  approvalStatus:   { fontSize: 13, fontWeight: '700' },
  approvalSub:      { fontSize: 11, opacity: 0.8 },
  rejectionBox:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 8, borderWidth: 1 },
  rejectionLabel:   { fontSize: 10, fontWeight: '700', color: '#791F1F', marginBottom: 2 },
  rejectionText:    { fontSize: 12, lineHeight: 17, color: '#791F1F' },
  rejectionBy:      { fontSize: 10, color: '#791F1F', marginTop: 4, fontStyle: 'italic' },
  approvedBy:       { fontSize: 11, fontWeight: '600' },
  approvalActions:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  actionBtnTxt:     { color: '#fff', fontSize: 12, fontWeight: '700' },
  lockedTag:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  lockedTxt:        { fontSize: 11, fontWeight: '700' },

  // Attachment panel
  attWrap:       { gap: 6 },
  attHeader:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attTitle:      { flex: 1, fontSize: 12, fontWeight: '700' },
  attAddBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, borderWidth: 1 },
  attAddTxt:     { fontSize: 11, fontWeight: '700' },
  attForm:       { borderRadius: 10, borderWidth: 1, padding: 10, gap: 2 },
  typeRow:       { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  typeBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  typeBtnTxt:    { fontSize: 10, fontWeight: '700' },
  attSubmitBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8, marginTop: 6 },
  attSubmitTxt:  { color: '#fff', fontSize: 13, fontWeight: '700' },
  attItem:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  attIcon:       { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  attName:       { fontSize: 12, fontWeight: '600' },
  attMeta:       { fontSize: 10, marginTop: 1 },
  attRemove:     { padding: 6 },
  attEmpty:      { fontSize: 11, fontStyle: 'italic', paddingVertical: 6 },

  divider:         { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 18 },
  subSectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 4 },

  sharedBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  sharedBannerTxt: { flex: 1, fontSize: 12, fontWeight: '600' },
  sharedPill:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  sharedPillTxt:   { fontSize: 10, fontWeight: '700' },
  shareBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  shareBtnTxt:     { fontSize: 12, fontWeight: '600' },

  // Documents section
  uploadPanel:   { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 16 },
  uploadHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  uploadTitle:   { fontSize: 15, fontWeight: '700' },
  sectionTitle:  { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  fileCard:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  fileIconWrap:  { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fileName:      { fontSize: 13, fontWeight: '600' },
  fileMeta:      { fontSize: 11, marginTop: 2 },
  fileBy:        { fontSize: 10, marginTop: 2 },

  // Modals
  modalBackdrop:   { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard:       { width: '100%', maxWidth: 360, borderRadius: 16, padding: 20, gap: 12 },
  modalTitle:      { fontSize: 17, fontWeight: '700' },
  modalSub:        { fontSize: 13 },
  modalActions:    { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancelBtn:  { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1 },
  modalCancelTxt:  { fontSize: 14, fontWeight: '600' },
  modalConfirmBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10 },
  modalConfirmTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
