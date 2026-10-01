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

export default function BranchRevenueLogScreen() {
  const { role, branchId, branches, pumpDailyReports } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'acc'] || colors.primary;
  const isGlobal = role === 'md' || role === 'ceo' || role === 'acc' || role === 'csm' || role === 'admin';
  const scopedBranchId = isGlobal ? null : branchId;
  const scopedRevenueReports = pumpDailyReports.filter(report =>
    isRevenueReportStatus(report.status) &&
    (!scopedBranchId || report.branchId === scopedBranchId),
  );
  const num = (value: number) => (Number.isFinite(value) ? value : 0);

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
    <ScreenLayout title="Branch Revenue Log">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.introCard, { backgroundColor: roleColor + '12', borderColor: roleColor + '30' }]}>
          <Text style={[styles.introEyebrow, { color: roleColor }]}>BRANCH PERFORMANCE</Text>
          <Text style={[styles.introTitle, { color: colors.text }]}>Branch Revenue by Business Date</Text>
          <Text style={[styles.introCopy, { color: colors.textMuted }]}>
            Compare each branch’s revenue for every recorded business date from approved shift reports.
          </Text>
        </View>

        <View style={[styles.logCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {dailyBranchRevenueLog.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textMuted }]}>No branch revenue recorded yet.</Text>
          ) : (
            dailyBranchRevenueLog.map(entry => (
              <View key={entry.date} style={[styles.branchDay, { borderTopColor: colors.border }]}>
                <View style={styles.branchHeader}>
                  <Text style={[styles.date, { color: colors.text }]}>{formatBusinessDate(entry.date)}</Text>
                  <Text style={[styles.total, { color: roleColor }]}>{fmt(entry.total)}</Text>
                </View>
                {entry.branches.map(branch => (
                  <View key={`${entry.date}-${branch.id}`} style={styles.branchRow}>
                    <View style={[styles.dot, { backgroundColor: roleColor }]} />
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
  logCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  empty: { fontSize: 13, padding: 14 },
  branchDay: { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  branchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  date: { fontSize: 14, fontWeight: '600' },
  total: { fontSize: 15, fontWeight: '700' },
  branchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingLeft: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
  branchName: { flex: 1, fontSize: 13 },
  branchRevenue: { fontSize: 13, fontWeight: '600', marginLeft: 8 },
});
