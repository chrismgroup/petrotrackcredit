import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import {
  CorpProject, LegalMatter,
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

// ── File helpers ────────────────────────────────────────────────────────────
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
const FILE_SIZES = ['0.4 MB', '0.8 MB', '1.1 MB', '1.6 MB', '2.2 MB', '3.4 MB'];

// ── Legal helpers ───────────────────────────────────────────────────────────
const LEGAL_TYPES: LegalMatter['type'][] = ['Contract', 'Dispute', 'Regulatory', 'Advisory', 'Other'];
const LEGAL_STATUS_META: Record<LegalMatter['status'], { color: string; bg: string }> = {
  Active:   { color: '#185FA5', bg: '#DCF0FF' },
  Pending:  { color: '#BA7517', bg: '#FAEEDA' },
  Resolved: { color: '#27500A', bg: '#EAF3DE' },
  Closed:   { color: '#7F8C8D', bg: '#F4F4F2' },
};
const LEGAL_PRIORITY_META: Record<LegalMatter['priority'], { color: string; bg: string }> = {
  High:   { color: '#791F1F', bg: '#FCEBEB' },
  Medium: { color: '#BA7517', bg: '#FAEEDA' },
  Low:    { color: '#27500A', bg: '#EAF3DE' },
};

// ── Project helpers ─────────────────────────────────────────────────────────
const PROJ_STATUS_META: Record<CorpProject['status'], { color: string; bg: string; icon: string }> = {
  Planning:   { color: '#185FA5', bg: '#DCF0FF',  icon: 'compass'         },
  Active:     { color: '#27500A', bg: '#EAF3DE',  icon: 'play-circle'     },
  'On Hold':  { color: '#BA7517', bg: '#FAEEDA',  icon: 'pause-circle'    },
  Completed:  { color: '#0F6E56', bg: '#D6F5EC',  icon: 'checkmark-circle'},
  Cancelled:  { color: '#7F8C8D', bg: '#F4F4F2',  icon: 'close-circle'    },
};

// ── Tab type ────────────────────────────────────────────────────────────────
type Tab = 'compliance' | 'legal' | 'projects' | 'minutes' | 'documents';

// ── Helpers ─────────────────────────────────────────────────────────────────
function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  const colors = useColors();
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon as any} size={40} color={colors.border} />
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>{text}</Text>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function CorporateScreen() {
  const {
    role, userName, docs, companyFiles, addCompanyFile,
    legalMatters, addLegalMatter, updateLegalStatus, deleteLegalMatter,
    corpProjects, addCorpProject, updateProjectProgress, deleteCorpProject,
    meetingMinutes, addMeetingMinutes, deleteMeetingMinutes,
  } = useApp();
  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'csm'] || colors.primary;
  const canEdit   = role === 'csm' || role === 'admin' || role === 'ceo' || role === 'md';

  const [activeTab, setActiveTab] = useState<Tab>('compliance');

  // ── Document upload state ──
  const [selCat,     setSelCat]     = useState(FILE_CATS[0]);
  const [selType,    setSelType]    = useState<typeof FILE_TYPES[number]>('pdf');
  const [uploadName, setUploadName] = useState('');

  // ── Legal form state ──
  const [showLegalForm, setShowLegalForm] = useState(false);
  const [lTitle,  setLTitle]  = useState('');
  const [lType,   setLType]   = useState<LegalMatter['type']>('Contract');
  const [lParty,  setLParty]  = useState('');
  const [lPri,    setLPri]    = useState<LegalMatter['priority']>('Medium');
  const [lNotes,  setLNotes]  = useState('');
  const [lStatus, setLStatus] = useState<LegalMatter['status']>('Active');

  // ── Project form state ──
  const [showProjForm,  setShowProjForm]  = useState(false);
  const [pTitle, setPTitle] = useState('');
  const [pDesc,  setPDesc]  = useState('');
  const [pLead,  setPLead]  = useState('');
  const [pStart, setPStart] = useState(new Date().toISOString().split('T')[0]);
  const [pDue,   setPDue]   = useState('');
  const [pStat,  setPStat]  = useState<CorpProject['status']>('Planning');

  // ── Minutes form state ──
  const [showMinForm,   setShowMinForm]   = useState(false);
  const [mTitle,   setMTitle]   = useState('');
  const [mDate,    setMDate]    = useState(new Date().toISOString().split('T')[0]);
  const [mVenue,   setMVenue]   = useState('');
  const [mAtt,     setMAtt]     = useState('');
  const [mSummary, setMSummary] = useState('');

  // ── Compliance stats ──
  const expiredDocs = docs.filter(d => daysLeft(d.exp) < 0);
  const urgentDocs  = docs.filter(d => daysLeft(d.exp) >= 0 && daysLeft(d.exp) < 14);
  const warnDocs    = docs.filter(d => daysLeft(d.exp) >= 14 && daysLeft(d.exp) < 30);
  const okDocs      = docs.filter(d => daysLeft(d.exp) >= 30);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleUpload() {
    const trimmed = uploadName.trim();
    if (!trimmed) { Alert.alert('Required', 'Please enter a file name.'); return; }
    const ext  = selType === 'img' ? 'jpg' : selType === 'other' ? 'zip' : selType;
    const name = trimmed.includes('.') ? trimmed : `${trimmed}.${ext}`;
    const size = FILE_SIZES[Math.floor(Math.random() * FILE_SIZES.length)];
    addCompanyFile({ name, cat: selCat, by: userName || 'System Admin', size, fileType: selType });
    setUploadName('');
    Alert.alert('Uploaded', `${name} saved to ${selCat}.`);
  }

  function handleAddLegal() {
    if (!lTitle.trim() || !lParty.trim()) {
      Alert.alert('Required', 'Title and party are required.');
      return;
    }
    addLegalMatter({ title: lTitle.trim(), type: lType, party: lParty.trim(), priority: lPri, status: lStatus, notes: lNotes.trim() });
    setLTitle(''); setLParty(''); setLNotes(''); setLType('Contract'); setLPri('Medium'); setLStatus('Active');
    setShowLegalForm(false);
    Alert.alert('Added', 'Legal matter recorded.');
  }

  function handleAddProject() {
    if (!pTitle.trim() || !pLead.trim() || !pDue) {
      Alert.alert('Required', 'Title, lead and due date are required.');
      return;
    }
    addCorpProject({ title: pTitle.trim(), description: pDesc.trim(), lead: pLead.trim(), startDate: pStart, dueDate: pDue, status: pStat, progress: 0 });
    setPTitle(''); setPDesc(''); setPLead(''); setPDue(''); setPStat('Planning');
    setShowProjForm(false);
    Alert.alert('Added', 'Project created successfully.');
  }

  function handleAddMinutes() {
    if (!mTitle.trim() || !mSummary.trim()) {
      Alert.alert('Required', 'Title and summary are required.');
      return;
    }
    addMeetingMinutes({ title: mTitle.trim(), date: mDate, venue: mVenue.trim() || 'HQ — Abuja CBD', attendees: mAtt.trim(), summary: mSummary.trim(), by: userName || 'System' });
    setMTitle(''); setMVenue(''); setMAtt(''); setMSummary('');
    setShowMinForm(false);
    Alert.alert('Saved', 'Meeting minutes recorded.');
  }

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'compliance', label: 'Compliance', icon: 'shield-checkmark' },
    { key: 'legal',      label: 'Legal',      icon: 'scale'            },
    { key: 'projects',   label: 'Projects',   icon: 'hammer'           },
    { key: 'minutes',    label: 'Minutes',    icon: 'reader'           },
    { key: 'documents',  label: 'Documents',  icon: 'folder'           },
  ];

  return (
    <ScreenLayout title="Corporate Services">
      {/* ── Tab bar ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabBar, { borderBottomColor: colors.border }]} contentContainerStyle={styles.tabBarContent}>
        {TABS.map(t => {
          const active = t.key === activeTab;
          return (
            <TouchableOpacity key={t.key} onPress={() => setActiveTab(t.key)}
              style={[styles.tabBtn, { borderBottomColor: active ? roleColor : 'transparent' }]}>
              <Ionicons name={t.icon as any} size={13} color={active ? roleColor : colors.textMuted} />
              <Text style={[styles.tabLabel, { color: active ? roleColor : colors.textMuted, fontWeight: active ? '700' : '400' }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ════════════════════════════════════════ COMPLIANCE */}
      {activeTab === 'compliance' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryRow}>
            {[
              { n: expiredDocs.length, label: 'Expired',  col: colors.error,   bg: colors.errorBg,   border: colors.errorBorder   },
              { n: urgentDocs.length,  label: '<14 days', col: colors.error,   bg: colors.errorBg,   border: colors.errorBorder   },
              { n: warnDocs.length,    label: '<30 days', col: colors.warning, bg: colors.warningBg, border: colors.warningBorder },
              { n: okDocs.length,      label: 'Current',  col: colors.success, bg: colors.successBg, border: colors.successBorder },
            ].map(s => (
              <View key={s.label} style={[styles.summaryCard, { backgroundColor: s.bg, borderColor: s.border }]}>
                <Text style={[styles.summaryNum, { color: s.col }]}>{s.n}</Text>
                <Text style={[styles.summaryLabel, { color: s.col }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {docs.map(doc => {
            const days = daysLeft(doc.exp);
            const st   = getDocStatus(days);
            return (
              <View key={doc.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIcon, { backgroundColor: roleColor + '18' }]}>
                    <Ionicons name="document-text" size={18} color={roleColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{doc.name}</Text>
                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>{doc.iss} · Ref: {doc.ref}</Text>
                  </View>
                  <Pill label={st.label} color={st.color} bg={st.bg} />
                </View>
                <View style={styles.infoRow}>
                  <View>
                    <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Category</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{doc.cat}</Text>
                  </View>
                  <View>
                    <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Expires</Text>
                    <Text style={[styles.infoValue, { color: st.color }]}>{fmtDate(doc.exp)}</Text>
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
          {docs.length === 0 && <EmptyState icon="shield-outline" text="No compliance documents" />}
          <View style={{ height: 16 }} />
        </ScrollView>
      )}

      {/* ════════════════════════════════════════ LEGAL */}
      {activeTab === 'legal' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Summary */}
          <View style={styles.summaryRow}>
            {(['Active', 'Pending', 'Resolved', 'Closed'] as LegalMatter['status'][]).map(s => {
              const m = LEGAL_STATUS_META[s];
              const n = legalMatters.filter(l => l.status === s).length;
              return (
                <View key={s} style={[styles.summaryCard, { backgroundColor: m.bg, borderColor: m.color + '44' }]}>
                  <Text style={[styles.summaryNum, { color: m.color }]}>{n}</Text>
                  <Text style={[styles.summaryLabel, { color: m.color }]}>{s}</Text>
                </View>
              );
            })}
          </View>

          {/* Add button */}
          {canEdit && (
            <TouchableOpacity onPress={() => setShowLegalForm(v => !v)}
              style={[styles.addBtn, { backgroundColor: roleColor }]}>
              <Ionicons name={showLegalForm ? 'close' : 'add'} size={16} color="#fff" />
              <Text style={styles.addBtnText}>{showLegalForm ? 'Cancel' : 'Add Legal Matter'}</Text>
            </TouchableOpacity>
          )}

          {/* Form */}
          {showLegalForm && (
            <View style={[styles.form, { backgroundColor: colors.surface, borderColor: roleColor + '44' }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>New Legal Matter</Text>

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Title *</Text>
              <TextInput value={lTitle} onChangeText={setLTitle} placeholder="e.g. Lease Agreement — Lugbe Branch" placeholderTextColor={colors.textMuted}
                style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Type</Text>
              <View style={styles.chipRow}>
                {LEGAL_TYPES.map(t => (
                  <TouchableOpacity key={t} onPress={() => setLType(t)}
                    style={[styles.chip, { backgroundColor: t === lType ? roleColor : colors.background, borderColor: t === lType ? roleColor : colors.border }]}>
                    <Text style={[styles.chipText, { color: t === lType ? '#fff' : colors.textMuted }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Counterparty / Lawyer *</Text>
              <TextInput value={lParty} onChangeText={setLParty} placeholder="e.g. FIRS, NNPC Legal, Aluko & Oyebode" placeholderTextColor={colors.textMuted}
                style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Priority</Text>
              <View style={styles.chipRow}>
                {(['High', 'Medium', 'Low'] as LegalMatter['priority'][]).map(p => {
                  const m = LEGAL_PRIORITY_META[p];
                  return (
                    <TouchableOpacity key={p} onPress={() => setLPri(p)}
                      style={[styles.chip, { backgroundColor: p === lPri ? m.color : colors.background, borderColor: p === lPri ? m.color : colors.border }]}>
                      <Text style={[styles.chipText, { color: p === lPri ? '#fff' : colors.textMuted }]}>{p}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Status</Text>
              <View style={styles.chipRow}>
                {(['Active', 'Pending', 'Resolved', 'Closed'] as LegalMatter['status'][]).map(s => (
                  <TouchableOpacity key={s} onPress={() => setLStatus(s)}
                    style={[styles.chip, { backgroundColor: s === lStatus ? roleColor : colors.background, borderColor: s === lStatus ? roleColor : colors.border }]}>
                    <Text style={[styles.chipText, { color: s === lStatus ? '#fff' : colors.textMuted }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Notes</Text>
              <TextInput value={lNotes} onChangeText={setLNotes} placeholder="Background, key terms, next steps…" placeholderTextColor={colors.textMuted}
                multiline numberOfLines={3}
                style={[styles.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />

              <TouchableOpacity onPress={handleAddLegal} style={[styles.submitBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>Save Legal Matter</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* List */}
          {legalMatters.length === 0 && <EmptyState icon="scale-outline" text="No legal matters recorded" />}
          {legalMatters.map(m => {
            const sm = LEGAL_STATUS_META[m.status];
            const pm = LEGAL_PRIORITY_META[m.priority];
            return (
              <View key={m.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIcon, { backgroundColor: '#8E44AD18' }]}>
                    <Ionicons name="scale" size={18} color="#8E44AD" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{m.title}</Text>
                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>{m.type} · {m.party}</Text>
                  </View>
                  <View style={{ gap: 4, alignItems: 'flex-end' }}>
                    <Pill label={m.status}   color={sm.color} bg={sm.bg} />
                    <Pill label={m.priority} color={pm.color} bg={pm.bg} />
                  </View>
                </View>
                {m.notes.length > 0 && (
                  <Text style={[styles.noteText, { color: colors.textMuted }]} numberOfLines={2}>{m.notes}</Text>
                )}
                <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                  <Text style={[styles.footerDate, { color: colors.textSubtle }]}>Opened {fmtDate(m.openedAt)}</Text>
                  {canEdit && (
                    <View style={styles.footerActions}>
                      {/* Quick status cycle */}
                      {m.status !== 'Closed' && (
                        <TouchableOpacity onPress={() => {
                          const next: LegalMatter['status'][] = ['Active', 'Pending', 'Resolved', 'Closed'];
                          const idx = next.indexOf(m.status);
                          updateLegalStatus(m.id, next[(idx + 1) % next.length]);
                        }} style={[styles.iconBtn, { borderColor: colors.border }]}>
                          <Ionicons name="arrow-forward-circle-outline" size={15} color={colors.textMuted} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => Alert.alert('Delete', `Remove "${m.title}"?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deleteLegalMatter(m.id) },
                      ])} style={[styles.iconBtn, { borderColor: colors.border }]}>
                        <Ionicons name="trash-outline" size={15} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
          <View style={{ height: 16 }} />
        </ScrollView>
      )}

      {/* ════════════════════════════════════════ PROJECTS */}
      {activeTab === 'projects' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Summary */}
          <View style={styles.summaryRow}>
            {(['Planning', 'Active', 'On Hold', 'Completed'] as CorpProject['status'][]).map(s => {
              const m = PROJ_STATUS_META[s];
              const n = corpProjects.filter(p => p.status === s).length;
              return (
                <View key={s} style={[styles.summaryCard, { backgroundColor: m.bg, borderColor: m.color + '44' }]}>
                  <Text style={[styles.summaryNum, { color: m.color }]}>{n}</Text>
                  <Text style={[styles.summaryLabel, { color: m.color }]}>{s}</Text>
                </View>
              );
            })}
          </View>

          {canEdit && (
            <TouchableOpacity onPress={() => setShowProjForm(v => !v)}
              style={[styles.addBtn, { backgroundColor: roleColor }]}>
              <Ionicons name={showProjForm ? 'close' : 'add'} size={16} color="#fff" />
              <Text style={styles.addBtnText}>{showProjForm ? 'Cancel' : 'New Project'}</Text>
            </TouchableOpacity>
          )}

          {showProjForm && (
            <View style={[styles.form, { backgroundColor: colors.surface, borderColor: roleColor + '44' }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>New Corporate Project</Text>

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Project Title *</Text>
              <TextInput value={pTitle} onChangeText={setPTitle} placeholder="e.g. Branch Renovation — Lugbe"
                placeholderTextColor={colors.textMuted}
                style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Description</Text>
              <TextInput value={pDesc} onChangeText={setPDesc} placeholder="Brief scope of work…"
                placeholderTextColor={colors.textMuted} multiline numberOfLines={2}
                style={[styles.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Project Lead *</Text>
              <TextInput value={pLead} onChangeText={setPLead} placeholder="e.g. Ngozi Okafor"
                placeholderTextColor={colors.textMuted}
                style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />

              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Start Date</Text>
                  <TextInput value={pStart} onChangeText={setPStart} placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Due Date *</Text>
                  <TextInput value={pDue} onChangeText={setPDue} placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Status</Text>
              <View style={styles.chipRow}>
                {(['Planning', 'Active'] as CorpProject['status'][]).map(s => {
                  const m = PROJ_STATUS_META[s];
                  return (
                    <TouchableOpacity key={s} onPress={() => setPStat(s)}
                      style={[styles.chip, { backgroundColor: s === pStat ? m.color : colors.background, borderColor: s === pStat ? m.color : colors.border }]}>
                      <Text style={[styles.chipText, { color: s === pStat ? '#fff' : colors.textMuted }]}>{s}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity onPress={handleAddProject} style={[styles.submitBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>Create Project</Text>
              </TouchableOpacity>
            </View>
          )}

          {corpProjects.length === 0 && <EmptyState icon="hammer-outline" text="No projects yet" />}
          {corpProjects.map(p => {
            const sm = PROJ_STATUS_META[p.status];
            const pct = Math.min(100, Math.max(0, p.progress));
            return (
              <View key={p.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIcon, { backgroundColor: sm.bg }]}>
                    <Ionicons name={sm.icon as any} size={18} color={sm.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{p.title}</Text>
                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>Lead: {p.lead}</Text>
                  </View>
                  <Pill label={p.status} color={sm.color} bg={sm.bg} />
                </View>
                {p.description.length > 0 && (
                  <Text style={[styles.noteText, { color: colors.textMuted }]} numberOfLines={2}>{p.description}</Text>
                )}
                {/* Progress bar */}
                <View style={styles.progressWrap}>
                  <View style={[styles.progressBg, { backgroundColor: colors.border }]}>
                    <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: sm.color }]} />
                  </View>
                  <Text style={[styles.progressLabel, { color: colors.textMuted }]}>{pct}%</Text>
                </View>
                <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                  <Text style={[styles.footerDate, { color: colors.textSubtle }]}>
                    {fmtDate(p.startDate)} → {fmtDate(p.dueDate)}
                  </Text>
                  {canEdit && (
                    <View style={styles.footerActions}>
                      {/* Increment progress by 25 */}
                      {p.status !== 'Completed' && p.status !== 'Cancelled' && (
                        <TouchableOpacity onPress={() => {
                          const newPct = Math.min(100, pct + 25);
                          const newStat: CorpProject['status'] = newPct >= 100 ? 'Completed' : p.status;
                          updateProjectProgress(p.id, newPct, newStat);
                        }} style={[styles.iconBtn, { borderColor: colors.border }]}>
                          <Ionicons name="trending-up-outline" size={15} color={colors.textMuted} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => Alert.alert('Delete', `Remove "${p.title}"?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deleteCorpProject(p.id) },
                      ])} style={[styles.iconBtn, { borderColor: colors.border }]}>
                        <Ionicons name="trash-outline" size={15} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
          <View style={{ height: 16 }} />
        </ScrollView>
      )}

      {/* ════════════════════════════════════════ MEETING MINUTES */}
      {activeTab === 'minutes' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {canEdit && (
            <TouchableOpacity onPress={() => setShowMinForm(v => !v)}
              style={[styles.addBtn, { backgroundColor: roleColor }]}>
              <Ionicons name={showMinForm ? 'close' : 'add'} size={16} color="#fff" />
              <Text style={styles.addBtnText}>{showMinForm ? 'Cancel' : 'Record Minutes'}</Text>
            </TouchableOpacity>
          )}

          {showMinForm && (
            <View style={[styles.form, { backgroundColor: colors.surface, borderColor: roleColor + '44' }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>Meeting Minutes</Text>

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Meeting Title *</Text>
              <TextInput value={mTitle} onChangeText={setMTitle} placeholder="e.g. Board Meeting — Q3 Review"
                placeholderTextColor={colors.textMuted}
                style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />

              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Date</Text>
                  <TextInput value={mDate} onChangeText={setMDate} placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Venue</Text>
                  <TextInput value={mVenue} onChangeText={setMVenue} placeholder="e.g. HQ Boardroom"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Attendees</Text>
              <TextInput value={mAtt} onChangeText={setMAtt} placeholder="e.g. CEO, MD, CSM, ACC"
                placeholderTextColor={colors.textMuted}
                style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Key Decisions / Summary *</Text>
              <TextInput value={mSummary} onChangeText={setMSummary} placeholder="Record agenda items, key decisions, and action points…"
                placeholderTextColor={colors.textMuted} multiline numberOfLines={5}
                style={[styles.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, minHeight: 100 }]} />

              <TouchableOpacity onPress={handleAddMinutes} style={[styles.submitBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>Save Minutes</Text>
              </TouchableOpacity>
            </View>
          )}

          {meetingMinutes.length === 0 && <EmptyState icon="reader-outline" text="No meeting minutes recorded" />}
          {meetingMinutes.map(m => (
            <View key={m.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardIcon, { backgroundColor: roleColor + '18' }]}>
                  <Ionicons name="reader" size={18} color={roleColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{m.title}</Text>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>{fmtDate(m.date)} · {m.venue}</Text>
                </View>
              </View>
              {m.attendees.length > 0 && (
                <View style={[styles.attendeeRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Ionicons name="people-outline" size={12} color={colors.textMuted} />
                  <Text style={[styles.attendeeText, { color: colors.textMuted }]}>{m.attendees}</Text>
                </View>
              )}
              <Text style={[styles.noteText, { color: colors.text }]}>{m.summary}</Text>
              <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                <Text style={[styles.footerDate, { color: colors.textSubtle }]}>Recorded by {m.by}</Text>
                {canEdit && (
                  <TouchableOpacity onPress={() => Alert.alert('Delete', `Remove "${m.title}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => deleteMeetingMinutes(m.id) },
                  ])} style={[styles.iconBtn, { borderColor: colors.border }]}>
                    <Ionicons name="trash-outline" size={15} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
          <View style={{ height: 16 }} />
        </ScrollView>
      )}

      {/* ════════════════════════════════════════ DOCUMENTS */}
      {activeTab === 'documents' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {canEdit && (
            <View style={[styles.uploadPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.uploadHeader}>
                <Ionicons name="cloud-upload" size={20} color={roleColor} />
                <Text style={[styles.uploadTitle, { color: colors.text }]}>Upload Corporate Document</Text>
              </View>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Category</Text>
              <View style={styles.chipRow}>
                {FILE_CATS.map(c => (
                  <TouchableOpacity key={c} onPress={() => setSelCat(c)}
                    style={[styles.chip, { backgroundColor: c === selCat ? roleColor : colors.background, borderColor: c === selCat ? roleColor : colors.border }]}>
                    <Text style={[styles.chipText, { color: c === selCat ? '#fff' : colors.textMuted }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>File Type</Text>
              <View style={styles.typeRow}>
                {FILE_TYPES.map(t => {
                  const ti = FILE_TYPE_ICONS[t];
                  return (
                    <TouchableOpacity key={t} onPress={() => setSelType(t)}
                      style={[styles.typeBtn, { backgroundColor: t === selType ? ti.color + '22' : colors.background, borderColor: t === selType ? ti.color : colors.border }]}>
                      <Ionicons name={ti.icon as any} size={16} color={t === selType ? ti.color : colors.textMuted} />
                      <Text style={[styles.typeBtnText, { color: t === selType ? ti.color : colors.textMuted }]}>{t.toUpperCase()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>File Name</Text>
              <TextInput
                style={[styles.textInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, marginBottom: 12 }]}
                value={uploadName} onChangeText={setUploadName}
                placeholder="e.g. Board_Resolution_July2026"
                placeholderTextColor={colors.textSubtle}
              />
              <TouchableOpacity onPress={handleUpload} style={[styles.submitBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="cloud-upload" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>Upload Document</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: colors.text }]}>Corporate Files ({companyFiles.length})</Text>
          {companyFiles.length === 0 && <EmptyState icon="folder-open-outline" text="No documents uploaded yet" />}
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
                <TouchableOpacity style={[styles.iconBtn, { borderColor: colors.border }]}>
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
  // ── Tab bar ──
  tabBar:        { borderBottomWidth: StyleSheet.hairlineWidth, flexGrow: 0 },
  tabBarContent: { flexDirection: 'row' },
  tabBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 2 },
  tabLabel:      { fontSize: 12 },

  scroll: { padding: 14 },

  // ── Summary ──
  summaryRow:   { flexDirection: 'row', gap: 8, marginBottom: 14 },
  summaryCard:  { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  summaryNum:   { fontSize: 20, fontWeight: '700' },
  summaryLabel: { fontSize: 9, marginTop: 2, textAlign: 'center' },

  // ── Buttons ──
  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, marginBottom: 14, alignSelf: 'flex-start' },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // ── Forms ──
  form:         { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 14, gap: 2 },
  formTitle:    { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  fieldLabel:   { fontSize: 12, fontWeight: '600', marginTop: 8, marginBottom: 4 },
  textInput:    { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  textArea:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, textAlignVertical: 'top' },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:         { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  chipText:     { fontSize: 11, fontWeight: '600' },
  twoCol:       { flexDirection: 'row', gap: 10 },
  submitBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, marginTop: 12 },
  submitBtnText:{ color: '#fff', fontSize: 14, fontWeight: '700' },

  // ── Cards ──
  card:       { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10, gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardIcon:   { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle:  { fontSize: 14, fontWeight: '600' },
  cardSub:    { fontSize: 11, marginTop: 2 },
  noteText:   { fontSize: 12, lineHeight: 17 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 2 },
  footerDate: { fontSize: 10 },
  footerActions:{ flexDirection: 'row', gap: 6 },
  iconBtn:    { padding: 6, borderRadius: 7, borderWidth: 1 },

  // ── Pill ──
  pill:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pillText: { fontSize: 10, fontWeight: '700' },

  // ── Compliance ──
  infoRow:    { flexDirection: 'row', gap: 24 },
  infoLabel:  { fontSize: 10 },
  infoValue:  { fontSize: 13, fontWeight: '600', marginTop: 1 },
  alertBanner:{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 10, borderRadius: 8 },
  alertText:  { flex: 1, fontSize: 12, lineHeight: 17 },

  // ── Projects ──
  progressWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBg:    { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: 6, borderRadius: 3 },
  progressLabel: { fontSize: 11, fontWeight: '600', width: 32, textAlign: 'right' },

  // ── Minutes ──
  attendeeRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  attendeeText: { fontSize: 11, flex: 1 },

  // ── Documents ──
  uploadPanel:  { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 16 },
  uploadHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  uploadTitle:  { fontSize: 15, fontWeight: '700' },
  typeRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  typeBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  typeBtnText:  { fontSize: 11, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  fileCard:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  fileIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fileName:     { fontSize: 13, fontWeight: '600' },
  fileMeta:     { fontSize: 11, marginTop: 2 },
  fileBy:       { fontSize: 10, marginTop: 2 },

  // ── Empty state ──
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText:  { fontSize: 14 },
});
