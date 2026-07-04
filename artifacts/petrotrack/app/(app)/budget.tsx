import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, fmtDateTime, useApp, type Budget } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  fully_approved: { label: 'Approved', color: '#27500A', bg: '#EAF3DE' },
  acc_forwarded: { label: 'Under Review', color: '#0C447C', bg: '#E6F1FB' },
  submitted: { label: 'Pending', color: '#BA7517', bg: '#FAEEDA' },
  rejected: { label: 'Rejected', color: '#791F1F', bg: '#FCEBEB' },
};

const STEP_ICONS: Record<string, string> = {
  submit: 'create', forward: 'share', approve: 'checkmark-circle', reject: 'close-circle',
};

export default function BudgetScreen() {
  const { role, budgets } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;
  const [selected, setSelected] = useState<Budget | null>(null);

  const canApprove = role === 'ceo' || role === 'md' || role === 'acc';

  return (
    <ScreenLayout title="Budget">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {budgets.map(b => {
          const st = STATUS_MAP[b.status] || STATUS_MAP['submitted'];
          const spent = 0;
          return (
            <TouchableOpacity key={b.id} onPress={() => setSelected(b)} activeOpacity={0.85} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{b.label} Budget</Text>
                  <Text style={[styles.cardBy, { color: colors.textMuted }]}>Submitted by {b.byName}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                  <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>
              <View style={styles.totalRow}>
                <Text style={[styles.totalAmount, { color: roleColor }]}>{fmt(b.total)}</Text>
                <Text style={[styles.totalLabel, { color: colors.textMuted }]}>Total Requested</Text>
              </View>
              <View style={styles.workflowDots}>
                {b.workflow.map((step, i) => (
                  <View key={i} style={[styles.stepDot, { backgroundColor: st.color }]} />
                ))}
                {b.workflow.length < 4 && Array.from({ length: 4 - b.workflow.length }).map((_, i) => (
                  <View key={`empty-${i}`} style={[styles.stepDot, { backgroundColor: colors.border }]} />
                ))}
              </View>
              <Text style={[styles.workflowLabel, { color: colors.textMuted }]}>{b.workflow.length}/4 approval steps · Tap for details</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected && (
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={[styles.modalHeader, { backgroundColor: roleColor, paddingTop: 52 }]}>
              <TouchableOpacity onPress={() => setSelected(null)} style={styles.closeBtn}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{selected.label} Budget</Text>
                <Text style={styles.modalSub}>{fmt(selected.total)} total</Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.scroll}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Budget Items</Text>
              {selected.items.map((item, i) => (
                <View key={i} style={[styles.itemRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.itemCat, { color: colors.text }]}>{item.cat}</Text>
                  <Text style={[styles.itemAmt, { color: roleColor }]}>{fmt(item.amt)}</Text>
                </View>
              ))}
              <View style={[styles.totalRow2, { borderTopColor: colors.border }]}>
                <Text style={[styles.totalLabel2, { color: colors.text }]}>TOTAL</Text>
                <Text style={[styles.totalAmt2, { color: roleColor }]}>{fmt(selected.total)}</Text>
              </View>

              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 16 }]}>Approval Workflow</Text>
              {selected.workflow.map((step, i) => (
                <View key={i} style={styles.workflowStep}>
                  <View style={styles.stepLine}>
                    <View style={[styles.stepIcon, { backgroundColor: step.action === 'approve' ? colors.successBg : step.action === 'reject' ? colors.errorBg : colors.infoBg }]}>
                      <Ionicons name={STEP_ICONS[step.action] as any} size={16} color={step.action === 'approve' ? colors.success : step.action === 'reject' ? colors.error : colors.info} />
                    </View>
                    {i < selected.workflow.length - 1 && <View style={[styles.stepConnector, { backgroundColor: colors.border }]} />}
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={[styles.stepName, { color: colors.text }]}>{step.stage}</Text>
                    <Text style={[styles.stepBy, { color: colors.textMuted }]}>by {step.by} · {fmtDateTime(step.dt)}</Text>
                    {step.note ? <Text style={[styles.stepNote, { color: colors.textMuted }]}>{step.note}</Text> : null}
                  </View>
                </View>
              ))}

              {canApprove && selected.status !== 'fully_approved' && (
                <View style={[styles.actionCard, { backgroundColor: colors.infoBg, borderColor: colors.border }]}>
                  <Text style={[styles.actionTitle, { color: colors.info }]}>Your Action Required</Text>
                  <Text style={[styles.actionSub, { color: colors.textMuted }]}>As {role?.toUpperCase()}, you can approve or request revisions.</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <TouchableOpacity style={[styles.approveBtn, { backgroundColor: colors.success }]}>
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={styles.approveBtnText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.rejectBtn, { borderColor: colors.error }]}>
                      <Text style={[styles.rejectBtnText, { color: colors.error }]}>Request Revision</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  card: { padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 12, gap: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardBy: { fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  totalAmount: { fontSize: 20, fontWeight: '700' },
  totalLabel: { fontSize: 12 },
  workflowDots: { flexDirection: 'row', gap: 4 },
  stepDot: { width: 20, height: 6, borderRadius: 3 },
  workflowLabel: { fontSize: 11 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalSub: { color: 'rgba(255,255,255,0.65)', fontSize: 13 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  itemCat: { fontSize: 14 },
  itemAmt: { fontSize: 14, fontWeight: '600' },
  totalRow2: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1.5, marginTop: 4 },
  totalLabel2: { fontSize: 14, fontWeight: '700' },
  totalAmt2: { fontSize: 18, fontWeight: '700' },
  workflowStep: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  stepLine: { alignItems: 'center' },
  stepIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  stepConnector: { width: 2, flex: 1, marginTop: 4, minHeight: 20 },
  stepContent: { flex: 1, paddingBottom: 8 },
  stepName: { fontSize: 13, fontWeight: '700' },
  stepBy: { fontSize: 11, marginTop: 2 },
  stepNote: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  actionCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 8 },
  actionTitle: { fontSize: 14, fontWeight: '700' },
  actionSub: { fontSize: 12, marginTop: 2 },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 10 },
  approveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rejectBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  rejectBtnText: { fontSize: 13, fontWeight: '600' },
});
