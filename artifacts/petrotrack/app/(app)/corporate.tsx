import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmtDate, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

function daysLeft(exp: string) {
  return Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000);
}
function getDocStatus(days: number) {
  if (days < 0) return { label: 'Expired', color: '#791F1F', bg: '#FCEBEB' };
  if (days < 14) return { label: `${days}d left`, color: '#791F1F', bg: '#FCEBEB' };
  if (days < 30) return { label: `${days}d left`, color: '#BA7517', bg: '#FAEEDA' };
  return { label: `${days}d left`, color: '#27500A', bg: '#EAF3DE' };
}

const FILE_CATS = ['Policy', 'HR', 'Finance', 'Legal', 'Operations', 'Compliance', 'Contract', 'Other'];
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

const FILE_SIZES = ['0.4 MB', '0.8 MB', '1.1 MB', '1.6 MB', '2.2 MB', '3.4 MB', '4.1 MB'];

export default function CorporateScreen() {
  const { role, docs, companyFiles, addCompanyFile } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'csm'] || colors.primary;
  const canUpload = role === 'csm' || role === 'admin';

  const [activeTab, setActiveTab] = useState<'compliance' | 'files'>('compliance');
  const [selCat, setSelCat] = useState(FILE_CATS[0]);
  const [selType, setSelType] = useState<typeof FILE_TYPES[number]>('pdf');

  const expiredDocs = docs.filter(d => daysLeft(d.exp) < 0);
  const urgentDocs  = docs.filter(d => daysLeft(d.exp) >= 0 && daysLeft(d.exp) < 14);
  const warnDocs    = docs.filter(d => daysLeft(d.exp) >= 14 && daysLeft(d.exp) < 30);
  const okDocs      = docs.filter(d => daysLeft(d.exp) >= 30);

  function handleUpload() {
    const names = MOCK_FILE_NAMES[selType] || MOCK_FILE_NAMES.other;
    const name = names[Math.floor(Math.random() * names.length)];
    const size = FILE_SIZES[Math.floor(Math.random() * FILE_SIZES.length)];
    addCompanyFile({ name, cat: selCat, by: role === 'csm' ? 'Ngozi Eze' : 'System Admin', size, fileType: selType });
    Alert.alert('Uploaded', `${name} uploaded successfully to ${selCat}.`);
  }

  return (
    <ScreenLayout title="Corporate Services">
      <View style={styles.tabBar}>
        {(['compliance', 'files'] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setActiveTab(t)} style={[styles.tabBtn, { borderBottomColor: t === activeTab ? roleColor : 'transparent' }]}>
            <Text style={[styles.tabLabel, { color: t === activeTab ? roleColor : colors.textMuted, fontWeight: t === activeTab ? '700' : '400' }]}>
              {t === 'compliance' ? 'Compliance Docs' : 'Company Files'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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

      {activeTab === 'files' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {canUpload && (
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
  tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e3' },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2 },
  tabLabel: { fontSize: 13 },
  scroll: { padding: 16 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  summaryNum: { fontSize: 22, fontWeight: '700' },
  summaryLabel: { fontSize: 10, marginTop: 2, textAlign: 'center' },
  docCard: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10, gap: 10 },
  docHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  docIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  docName: { fontSize: 14, fontWeight: '600' },
  docIssuer: { fontSize: 11, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  docDates: { flexDirection: 'row', gap: 20 },
  dateItem: {},
  dateLabel: { fontSize: 10 },
  dateValue: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  alertBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 10, borderRadius: 8 },
  alertText: { flex: 1, fontSize: 12, lineHeight: 17 },
  uploadPanel: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 16 },
  uploadHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  uploadTitle: { fontSize: 15, fontWeight: '700' },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  chipText: { fontSize: 11, fontWeight: '600' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  typeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  typeBtnText: { fontSize: 11, fontWeight: '700' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10 },
  uploadBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  fileIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 13, fontWeight: '600' },
  fileMeta: { fontSize: 11, marginTop: 2 },
  fileBy: { fontSize: 10, marginTop: 2 },
  viewBtn: { padding: 8, borderRadius: 8, borderWidth: 1 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14 },
});
