import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import {
  businessDateKey,
  isRevenueReportStatus,
  ROLE_COLORS,
  fmt,
  useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

function formatBusinessDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function DailyRevenueLogScreen() {
  const { role, branchId, branches, pumpDailyReports } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'acc'] || colors.primary;
  const isGlobal = role === 'md' || role === 'ceo' || role === 'acc' || role === 'csm' || role === 'admin';
  const scopedBranchId = isGlobal ? null : branchId;
  const scopedRevenueReports = pumpDailyReports.filter(report =>
    isRevenueReportStatus(report.status) &&
    (!scopedBranchId || report.branchId === scopedBranchId || !report.branchId),
  );
  const num = (value: number) => (Number.isFinite(value) ? value : 0);

  const dailyRevenueLog = Array.from(
    scopedRevenueReports.reduce((log, report) => {
      const date = businessDateKey(report.date);
      if (!date) return log;
      const current = log.get(date) ?? { date, revenue: 0, reports: 0 };
      current.revenue += num(report.grossAmount);
      current.reports += 1;
      log.set(date, current);
      return log;
    }, new Map<string, { date: string; revenue: number; reports: number }>())
      .values(),
  ).sort((a, b) => b.date.localeCompare(a.date));

  const dailyBranchRevenueLog = Array.from(
    scopedRevenueReports.reduce((log, report) => {
      const date = businessDateKey(report.date);
      if (!date) return log;
      const reportBranchId = report.branchId || 'unassigned';
      const current = log.get(date) ?? { date, total: 0, byBranch: new Map<string, number>() };
      current.total += num(report.grossAmount);
      current.byBranch.set(reportBranchId, (current.byBranch.get(reportBranchId) || 0) + num(report.grossAmount));
      log.set(date, current);
      return log;
    }, new Map<string, { date: string; total: number; byBranch: Map<string, number> }>())
      .values(),
  )
    .map(entry => ({
      date: entry.date,
      total: Math.round(entry.total),
      branches: Array.from(entry.byBranch.entries())
        .map(([id, revenue]) => ({
          id,
          name: id === 'unassigned'
            ? 'Unassigned / Company-level'
            : branches.find(branch => branch.id === id)?.name || 'Unknown branch',
          revenue: Math.round(revenue),
        }))
        .sort((a, b) => b.revenue - a.revenue),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <ScreenLayout title="Daily Revenue Log">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.introCard, { backgroundColor: roleColor + '12', borderColor: roleColor + '30' }]}>
          <Text style={[styles.introEyebrow, { color: roleColor }]}>SALES CONTROL</Text>
          <Text style={[styles.introTitle, { color: colors.text }]}>Daily Business-Date Revenue Log</Text>
          <Text style={[styles.introCopy, { color: colors.textMuted }]}>
            Revenue is grouped by the shift report business date, not by the time the report was submitted.
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Revenue by Business Date</Text>
        <View style={[styles.dailyLogCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {dailyRevenueLog.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textMuted }]}>No business-date revenue recorded yet.</Text>
          ) : (
            dailyRevenueLog.map(entry => (
              <View key={entry.date} style={[styles.dailyLogRow, { borderTopColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dailyLogDate, { color: colors.text }]}>{formatBusinessDate(entry.date)}</Text>
                  <Text style={[styles.dailyLogMeta, { color: colors.textMuted }]}>
                    {entry.reports} shift report{entry.reports === 1 ? '' : 's'}
                  </Text>
                </View>
                <Text style={[styles.dailyLogRevenue, { color: roleColor }]}>{fmt(Math.round(entry.revenue))}</Text>
              </View>
            ))
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Branch Revenue by Business Date</Text>
        <View style={[styles.dailyLogCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Compare each branch’s revenue for every recorded business date.
          </Text>
          {dailyBranchRevenueLog.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textMuted }]}>No branch revenue recorded yet.</Text>
          ) : (
            dailyBranchRevenueLog.map(entry => (
              <View key={entry.date} style={[styles.branchDay, { borderTopColor: colors.border }]}>
                <View style={styles.branchHeader}>
                  <Text style={[styles.dailyLogDate, { color: colors.text }]}>{formatBusinessDate(entry.date)}</Text>
                  <Text style={[styles.dailyLogRevenue, { color: roleColor }]}>{fmt(entry.total)}</Text>
                </View>
                {entry.branches.map(branch => (
                  <View key={`${entry.date}-${branch.id}`} style={styles.branchRow}>
                    <View style={[styles.branchDot, { backgroundColor: roleColor }]} />
                    <Text style={[styles.branchName, { color: colors.text }]} numberOfLines={1}>{branch.name}</Text>
                    <Text style={[styles.branchRevenue, { color: colors.text }]}>{fmt(branch.revenue)}</Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
        <View style={{ height: 20 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 34 },
  introCard: { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 22 },
  introEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  introTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', marginTop: 7 },
  introCopy: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  dailyLogCard: { borderRadius: 14, borderWidth: 1, marginBottom: 18, overflow: 'hidden' },
  hint: { fontSize: 12, lineHeight: 17, padding: 14, paddingBottom: 8 },
  empty: { fontSize: 13, padding: 14, paddingTop: 4 },
  dailyLogRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  dailyLogDate: { fontSize: 14, fontWeight: '600' },
  dailyLogMeta: { fontSize: 11, marginTop: 2 },
  dailyLogRevenue: { fontSize: 15, fontWeight: '700' },
  branchDay: { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  branchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  branchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingLeft: 4 },
  branchDot: { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
  branchName: { flex: 1, fontSize: 13 },
  branchRevenue: { fontSize: 13, fontWeight: '600', marginLeft: 8 },
});