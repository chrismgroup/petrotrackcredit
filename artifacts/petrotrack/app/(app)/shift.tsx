import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Alert, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  submitted: { label: 'Submitted',  color: '#185FA5', bg: '#E6F1FB', icon: 'time' },
  reviewed:  { label: 'Reviewed',   color: '#27500A', bg: '#EAF3DE', icon: 'checkmark-circle' },
  flagged:   { label: 'Flagged',    color: '#791F1F', bg: '#FCEBEB', icon: 'flag' },
};

export default function ShiftScreen() {
  const { role, sales, shiftReports, addShiftReport, reviewShift, flagShift, userName } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'att'] || colors.primary;
  const isAtt = role === 'att';
  const isMgr = role === 'mgr' || role === 'admin' || role === 'acc' || role === 'ceo' || role === 'md';

  const [cashInput, setCashInput] = useState('');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const todaySales = useMemo(() => sales.filter(s => s.dt.startsWith(today)), [sales, today]);
  const totalSaleAmt = todaySales.reduce((s, e) => s + e.L * e.price, 0);
  const totalPOS     = todaySales.reduce((s, e) => s + (e.pos || 0), 0);
  const expectedCash = totalSaleAmt - totalPOS;

  const cashVal  = parseFloat(cashInput.replace(/,/g, '')) || 0;
  const variance = cashVal - expectedCash;
  const hasInput = cashInput.trim().length > 0 && cashVal > 0;

  const todayAlreadySubmitted = shiftReports.some(r => r.dt.startsWith(today) && r.by === role);

  function handleSubmit() {
    if (!hasInput) { Alert.alert('Error', 'Please enter the cash amount in the drawer.'); return; }
    if (todayAlreadySubmitted) { Alert.alert('Already Submitted', 'You have already submitted a shift report for today.'); return; }
    addShiftReport({
      by: role || 'att', byName: userName || 'Attendant',
      entries: todaySales.length, totalSales: totalSaleAmt,
      totalPOS, expectedCash, actualCash: cashVal,
      variance, note: note.trim(),
    });
    setCashInput(''); setNote(''); setSubmitted(true);
    if (variance < 0) {
      Alert.alert('Shortage Flagged', `Your shift report shows a cash shortage of ${fmt(Math.abs(variance))}. It has been flagged for manager review.`);
    } else {
      Alert.alert('Shift Report Submitted', variance > 0 ? `Overage of ${fmt(variance)} noted. Report sent to manager.` : 'Balanced. Report submitted successfully.');
    }
  }

  const sortedReports = [...shiftReports].sort((a, b) => b.dt.localeCompare(a.dt));

  return (
    <ScreenLayout title="Shift Reconciliation">
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ─── Attendant view ─── */}
          {isAtt && (
            <>
              <View style={[styles.shiftCard, { backgroundColor: roleColor }]}>
                <Text style={styles.shiftCardTitle}>Today's Shift Summary</Text>
                <Text style={styles.shiftCardDate}>{new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
                <View style={styles.shiftStatsRow}>
                  <View style={styles.shiftStat}>
                    <Text style={styles.shiftStatVal}>{todaySales.length}</Text>
                    <Text style={styles.shiftStatLabel}>Entries</Text>
                  </View>
                  <View style={styles.shiftStatDiv} />
                  <View style={styles.shiftStat}>
                    <Text style={styles.shiftStatVal}>{fmt(totalSaleAmt)}</Text>
                    <Text style={styles.shiftStatLabel}>Total Sales</Text>
                  </View>
                  <View style={styles.shiftStatDiv} />
                  <View style={styles.shiftStat}>
                    <Text style={styles.shiftStatVal}>{fmt(totalPOS)}</Text>
                    <Text style={styles.shiftStatLabel}>POS / Transfer</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.expectedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.expectedRow}>
                  <Ionicons name="cash-outline" size={18} color={colors.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.expectedLabel, { color: colors.textMuted }]}>Expected Cash in Drawer</Text>
                    <Text style={[styles.expectedValue, { color: colors.success }]}>{fmt(expectedCash)}</Text>
                  </View>
                </View>
                <Text style={[styles.expectedCalc, { color: colors.textSubtle }]}>
                  Total Sales {fmt(totalSaleAmt)} − POS {fmt(totalPOS)} = {fmt(expectedCash)}
                </Text>
              </View>

              {todayAlreadySubmitted ? (
                <View style={[styles.doneCard, { backgroundColor: colors.successBg, borderColor: colors.successBorder }]}>
                  <Ionicons name="checkmark-circle" size={28} color={colors.success} />
                  <Text style={[styles.doneText, { color: colors.success }]}>Shift report already submitted today</Text>
                </View>
              ) : (
                <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.formTitle, { color: colors.text }]}>Close Out Shift</Text>

                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Cash in Drawer (₦)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                    placeholder="Count and enter total cash" placeholderTextColor={colors.textSubtle}
                    keyboardType="numeric" value={cashInput} onChangeText={setCashInput}
                  />

                  {hasInput && (
                    <View style={[styles.varianceCard, {
                      backgroundColor: variance === 0 ? colors.successBg : variance > 0 ? colors.warningBg : colors.errorBg,
                      borderColor: variance === 0 ? colors.successBorder : variance > 0 ? colors.warningBorder : colors.errorBorder,
                    }]}>
                      <Ionicons
                        name={variance === 0 ? 'checkmark-circle' : variance > 0 ? 'arrow-up-circle' : 'alert-circle'}
                        size={28}
                        color={variance === 0 ? colors.success : variance > 0 ? colors.warning : colors.error}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.varianceLabel, { color: variance === 0 ? colors.success : variance > 0 ? colors.warning : colors.error }]}>
                          {variance === 0 ? 'Balanced ✓' : variance > 0 ? `Overage — extra ${fmt(variance)}` : `Shortage — short ${fmt(Math.abs(variance))}`}
                        </Text>
                        <Text style={[styles.varianceSub, { color: colors.textMuted }]}>
                          Expected {fmt(expectedCash)} · Counted {fmt(cashVal)}
                        </Text>
                      </View>
                    </View>
                  )}

                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Note (optional)</Text>
                  <TextInput
                    style={[styles.input, styles.noteInput, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                    placeholder="Any discrepancy explanation, issues, or remarks..." placeholderTextColor={colors.textSubtle}
                    multiline numberOfLines={3} value={note} onChangeText={setNote}
                  />

                  <TouchableOpacity onPress={handleSubmit} style={[styles.submitBtn, { backgroundColor: roleColor }]}>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={styles.submitBtnText}>Submit Shift Report</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {/* ─── Manager / review view ─── */}
          {isMgr && (
            <>
              <View style={styles.mgrSummaryRow}>
                {[
                  { n: shiftReports.filter(r => r.status === 'submitted').length, label: 'Pending Review', color: colors.blue, bg: colors.infoBg },
                  { n: shiftReports.filter(r => r.variance < 0).length, label: 'Shortages', color: colors.error, bg: colors.errorBg },
                  { n: shiftReports.filter(r => r.variance > 0).length, label: 'Overages', color: colors.warning, bg: colors.warningBg },
                  { n: shiftReports.filter(r => r.status === 'reviewed').length, label: 'Reviewed', color: colors.success, bg: colors.successBg },
                ].map(s => (
                  <View key={s.label} style={[styles.mgrMetric, { backgroundColor: s.bg }]}>
                    <Text style={[styles.mgrMetricNum, { color: s.color }]}>{s.n}</Text>
                    <Text style={[styles.mgrMetricLabel, { color: s.color }]}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ─── Shift report list (both roles) ─── */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {isAtt ? 'My Shift Reports' : 'All Shift Reports'}
          </Text>
          {sortedReports.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No shift reports yet</Text>
            </View>
          )}
          {sortedReports.map(r => {
            const st = STATUS_META[r.status] || STATUS_META.submitted;
            const varColor = r.variance === 0 ? colors.success : r.variance > 0 ? colors.warning : colors.error;
            const varBg    = r.variance === 0 ? colors.successBg : r.variance > 0 ? colors.warningBg : colors.errorBg;
            const varBorder= r.variance === 0 ? colors.successBorder : r.variance > 0 ? colors.warningBorder : colors.errorBorder;
            return (
              <View key={r.id} style={[styles.reportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.reportHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reportBy, { color: colors.text }]}>{r.byName}</Text>
                    <Text style={[styles.reportDt, { color: colors.textMuted }]}>{fmtDateTime(r.dt)} · {r.entries} entries</Text>
                  </View>
                  <View style={[styles.stBadge, { backgroundColor: st.bg }]}>
                    <Ionicons name={st.icon as any} size={11} color={st.color} />
                    <Text style={[styles.stText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>

                <View style={styles.reportNums}>
                  <View style={styles.reportNum}>
                    <Text style={[styles.reportNumLabel, { color: colors.textMuted }]}>Total Sales</Text>
                    <Text style={[styles.reportNumVal, { color: colors.text }]}>{fmt(r.totalSales)}</Text>
                  </View>
                  <View style={styles.reportNum}>
                    <Text style={[styles.reportNumLabel, { color: colors.textMuted }]}>POS</Text>
                    <Text style={[styles.reportNumVal, { color: '#185FA5' }]}>{fmt(r.totalPOS)}</Text>
                  </View>
                  <View style={styles.reportNum}>
                    <Text style={[styles.reportNumLabel, { color: colors.textMuted }]}>Expected Cash</Text>
                    <Text style={[styles.reportNumVal, { color: colors.success }]}>{fmt(r.expectedCash)}</Text>
                  </View>
                  <View style={styles.reportNum}>
                    <Text style={[styles.reportNumLabel, { color: colors.textMuted }]}>Counted</Text>
                    <Text style={[styles.reportNumVal, { color: colors.text }]}>{fmt(r.actualCash)}</Text>
                  </View>
                </View>

                <View style={[styles.variancePill, { backgroundColor: varBg, borderColor: varBorder }]}>
                  <Ionicons
                    name={r.variance === 0 ? 'checkmark-circle' : r.variance > 0 ? 'arrow-up-circle' : 'alert-circle'}
                    size={14}
                    color={varColor}
                  />
                  <Text style={[styles.variancePillText, { color: varColor }]}>
                    {r.variance === 0
                      ? 'Balanced — no discrepancy'
                      : r.variance > 0
                      ? `Overage: +${fmt(r.variance)}`
                      : `Shortage: −${fmt(Math.abs(r.variance))}`}
                  </Text>
                </View>

                {r.note ? (
                  <Text style={[styles.reportNote, { color: colors.textMuted, borderColor: colors.border }]}>
                    💬 {r.note}
                  </Text>
                ) : null}

                {isMgr && r.status === 'submitted' && (
                  <View style={styles.reviewRow}>
                    <TouchableOpacity onPress={() => reviewShift(r.id)} style={[styles.reviewBtn, { backgroundColor: colors.successBg, borderColor: colors.successBorder }]}>
                      <Ionicons name="checkmark" size={14} color={colors.success} />
                      <Text style={[styles.reviewBtnText, { color: colors.success }]}>Mark Reviewed</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => flagShift(r.id)} style={[styles.flagBtn, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
                      <Ionicons name="flag" size={14} color={colors.error} />
                      <Text style={[styles.flagBtnText, { color: colors.error }]}>Flag</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ height: 20 }} />
        </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  shiftCard: { borderRadius: 16, padding: 20, marginBottom: 14 },
  shiftCardTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 2 },
  shiftCardDate: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  shiftStatsRow: { flexDirection: 'row', alignItems: 'center' },
  shiftStat: { flex: 1, alignItems: 'center' },
  shiftStatVal: { color: '#fff', fontSize: 15, fontWeight: '700' },
  shiftStatLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 10, marginTop: 2, textAlign: 'center' },
  shiftStatDiv: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.25)' },
  expectedCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 14, gap: 8 },
  expectedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  expectedLabel: { fontSize: 11, marginBottom: 2 },
  expectedValue: { fontSize: 24, fontWeight: '800' },
  expectedCalc: { fontSize: 11 },
  doneCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  doneText: { fontSize: 14, fontWeight: '600' },
  formCard: { padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 14, gap: 4 },
  formTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, marginBottom: 12 },
  noteInput: { minHeight: 80, textAlignVertical: 'top', fontSize: 13 },
  varianceCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  varianceLabel: { fontSize: 15, fontWeight: '700' },
  varianceSub: { fontSize: 11, marginTop: 2 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 4 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  mgrSummaryRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  mgrMetric: { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center' },
  mgrMetricNum: { fontSize: 20, fontWeight: '700' },
  mgrMetricLabel: { fontSize: 9, marginTop: 2, textAlign: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14 },
  reportCard: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10, gap: 10 },
  reportHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reportBy: { fontSize: 14, fontWeight: '700' },
  reportDt: { fontSize: 11, marginTop: 2 },
  stBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  stText: { fontSize: 11, fontWeight: '700' },
  reportNums: { flexDirection: 'row', gap: 4 },
  reportNum: { flex: 1 },
  reportNumLabel: { fontSize: 9, marginBottom: 2 },
  reportNumVal: { fontSize: 12, fontWeight: '700' },
  variancePill: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 8, borderWidth: 1 },
  variancePillText: { fontSize: 12, fontWeight: '700', flex: 1 },
  reportNote: { fontSize: 12, lineHeight: 17, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  reviewRow: { flexDirection: 'row', gap: 8 },
  reviewBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  reviewBtnText: { fontSize: 12, fontWeight: '700' },
  flagBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  flagBtnText: { fontSize: 12, fontWeight: '700' },
});
