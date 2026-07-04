import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmtDate, useApp } from '@/context/AppContext';
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

export default function CorporateScreen() {
  const { role, docs } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'csm'] || colors.primary;

  const expiredDocs = docs.filter(d => daysLeft(d.exp) < 0);
  const urgentDocs = docs.filter(d => daysLeft(d.exp) >= 0 && daysLeft(d.exp) < 14);
  const warnDocs = docs.filter(d => daysLeft(d.exp) >= 14 && daysLeft(d.exp) < 30);
  const okDocs = docs.filter(d => daysLeft(d.exp) >= 30);

  return (
    <ScreenLayout title="Corporate Services">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
            <Text style={[styles.summaryNum, { color: colors.error }]}>{expiredDocs.length}</Text>
            <Text style={[styles.summaryLabel, { color: colors.error }]}>Expired</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
            <Text style={[styles.summaryNum, { color: colors.error }]}>{urgentDocs.length}</Text>
            <Text style={[styles.summaryLabel, { color: colors.error }]}>&lt;14 days</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
            <Text style={[styles.summaryNum, { color: colors.warning }]}>{warnDocs.length}</Text>
            <Text style={[styles.summaryLabel, { color: colors.warning }]}>&lt;30 days</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.successBg, borderColor: colors.successBorder }]}>
            <Text style={[styles.summaryNum, { color: colors.success }]}>{okDocs.length}</Text>
            <Text style={[styles.summaryLabel, { color: colors.success }]}>Current</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Compliance Documents</Text>
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
                    {days < 0 ? 'This document has expired. Immediate renewal required.' : `Renewal required within ${days} days via the appropriate agency portal.`}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
        <View style={{ height: 16 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  summaryNum: { fontSize: 22, fontWeight: '700' },
  summaryLabel: { fontSize: 10, marginTop: 2, textAlign: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
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
});
