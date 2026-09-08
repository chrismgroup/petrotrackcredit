import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { REPORT_META, getPerms, ReportType } from '@/lib/report-helpers';
import { ROLE_COLORS, SCREEN_ROUTES, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { canAccessWorkspaceRoute, workspaceRouteAccess } from '@/lib/workspace-access';

type JobItem = {
  id: string;
  label: string;
  description: string;
  icon: string;
  route: string;
  accent?: string;
};

const operations: JobItem[] = [
  { id: 'stock-log', label: 'Daily stock log', description: 'Trace opening stock, deliveries, sales and tank-dip variance', icon: 'analytics-outline', route: SCREEN_ROUTES.ops, accent: '#0D6E56' },
  { id: 'stock-snapshot', label: 'Stock snapshot', description: 'Compare book stock, tank dips and variance', icon: 'analytics-outline', route: SCREEN_ROUTES.stockSnapshot, accent: '#0F6E56' },
  { id: 'maint', label: 'Maintenance', description: 'Log and follow up on station issues', icon: 'construct-outline', route: SCREEN_ROUTES.maint, accent: '#B45309' },
  { id: 'dips', label: 'Tank dipping approvals', description: 'Review physical tank readings and approvals', icon: 'water-outline', route: SCREEN_ROUTES.ops, accent: '#28698B' },
  { id: 'receiving', label: 'Products receiving', description: 'Track deliveries, costs and variances', icon: 'car-outline', route: SCREEN_ROUTES.recv, accent: '#7C3AED' },
  { id: 'inventory', label: 'Product inventory', description: 'View live stock by dip reading and branch balances', icon: 'layers-outline', route: SCREEN_ROUTES.inventory, accent: '#0F6E56' },
];

const sales: JobItem[] = [
  { id: 'shift', label: 'Shift reports', description: 'Review pump shifts and cashier handovers', icon: 'swap-horizontal-outline', route: SCREEN_ROUTES.shift, accent: '#0D6E56' },
  { id: 'sales', label: 'Sales overview', description: 'See product performance and revenue', icon: 'trending-up-outline', route: SCREEN_ROUTES.sales, accent: '#1D4ED8' },
];

const finance: JobItem[] = [
  { id: 'financial-status', label: 'Financial status', description: 'View cash, assets and business position', icon: 'pie-chart-outline', route: SCREEN_ROUTES.acct, accent: '#0D5C2E' },
  { id: 'daily-revenue-log', label: 'Daily Business-Date Revenue Log', description: 'Review revenue grouped by the business date of each shift report', icon: 'calendar-outline', route: SCREEN_ROUTES.dailyRevenueLog, accent: '#1D4ED8' },
  { id: 'branch-revenue-log', label: 'Branch Revenue by Business Date', description: 'Compare each branch’s revenue across recorded business dates', icon: 'business-outline', route: SCREEN_ROUTES.branchRevenueLog, accent: '#0D6E56' },
  { id: 'assets', label: 'Asset Management', description: 'Track company assets and monthly depreciation by branch', icon: 'cube-outline', route: SCREEN_ROUTES.assets, accent: '#185FA5' },
  { id: 'expenses', label: 'Expenses', description: 'Submit, review and approve expenses', icon: 'receipt-outline', route: SCREEN_ROUTES.exp, accent: '#B91C1C' },
  { id: 'budgets', label: 'Budgets', description: 'Plan spend and monitor budget performance', icon: 'calculator-outline', route: SCREEN_ROUTES.budget, accent: '#92400E' },
];

const supportItems: JobItem[] = [
  { id: 'tasks', label: 'Tasks & KPIs', description: 'Keep assigned work and targets moving', icon: 'checkmark-circle-outline', route: SCREEN_ROUTES.tasks, accent: '#28698B' },
  { id: 'actionItems', label: 'Action Items', description: 'Track ownership, close-out dates and branch accountability', icon: 'flash-outline', route: SCREEN_ROUTES.actionItems, accent: '#B45309' },
  { id: 'prices', label: 'Prices', description: 'Review product prices and proposals', icon: 'pricetag-outline', route: SCREEN_ROUTES.prices, accent: '#7C3AED' },
  { id: 'marketing', label: 'Marketing', description: 'Monitor market and competitor activity', icon: 'megaphone-outline', route: SCREEN_ROUTES.mktg, accent: '#C2410C' },
  { id: 'people', label: 'People & HR', description: 'Staff, departments and employee records', icon: 'people-outline', route: SCREEN_ROUTES.hr, accent: '#0D6E56' },
  { id: 'branches', label: 'Branches', description: 'Manage stations and branch performance', icon: 'business-outline', route: SCREEN_ROUTES.branches, accent: '#1D4ED8' },
  { id: 'audit', label: 'Audit trail', description: 'Review activity across the business', icon: 'shield-checkmark-outline', route: SCREEN_ROUTES.audit, accent: '#64748B' },
  { id: 'settings', label: 'System settings', description: 'Configure Petrotrack controls', icon: 'settings-outline', route: SCREEN_ROUTES.settings, accent: '#475569' },
];

function SectionHeader({ icon, title, subtitle, colors }: { icon: string; title: string; subtitle: string; colors: any }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { backgroundColor: colors.primary + '14' }]}>
        <Ionicons name={icon as any} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

function JobCard({ item, onPress, colors }: { item: JobItem; onPress: () => void; colors: any }) {
  const accent = item.accent || colors.primary;
  return (
    <TouchableOpacity
      style={[styles.jobCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.78}
    >
      <View style={[styles.jobIcon, { backgroundColor: accent + '16' }]}>
        <Ionicons name={item.icon as any} size={20} color={accent} />
      </View>
      <View style={styles.jobCopy}>
        <Text style={[styles.jobTitle, { color: colors.text }]}>{item.label}</Text>
        <Text style={[styles.jobDescription, { color: colors.textMuted }]}>{item.description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.textSubtle} />
    </TouchableOpacity>
  );
}

function JobSection({ icon, title, subtitle, items, onPress, colors }: {
  icon: string; title: string; subtitle: string; items: JobItem[]; onPress: (item: JobItem) => void; colors: any;
}) {
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <SectionHeader icon={icon} title={title} subtitle={subtitle} colors={colors} />
      <View style={styles.jobList}>
        {items.map(item => <JobCard key={item.id} item={item} onPress={() => onPress(item)} colors={colors} />)}
      </View>
    </View>
  );
}

export default function JobsScreen() {
  const { role, navItems, maintenance, dips, deliveries, expenses, budgets, tasks } = useApp();
  const colors = useColors();
  const router = useRouter();
  if (!role) return null;

  const allowed = new Set(navItems.map(item => item.id));
  const canSee = (item: JobItem) => {
    if (!workspaceRouteAccess(item.route)) return false;
    if (item.id === 'expenses' && role === 'ceo') return false;
    if (item.id === 'dips') return role === 'md' && (allowed.has('ops') || allowed.has('tanks'));
    return canAccessWorkspaceRoute(item.route, role, navItems);
  };
  const visibleOperations = operations.filter(canSee);
  const visibleSales = sales.filter(canSee);
  const visibleFinance = finance.filter(canSee);
  const visibleSupport = supportItems.filter(canSee);
  const visibleReportTypes = getPerms(role).visible;
  const pending = dips.filter(d => d.status === 'pending').length;
  const openMaintenance = maintenance.filter(item => item.st === 'Open').length;
  const pendingDeliveries = deliveries.filter(item => item.approvalStatus === 'pending' || item.approvalStatus === 'pending_acc' || item.approvalStatus === 'pending_md').length;
  const pendingExpenses = expenses.filter(item => item.status === 'pending' || item.status === 'acc_forwarded').length;
  const taskCount = tasks.filter(item => item.assignedTo === role && item.status !== 'completed').length;
  const canReviewDips = (role === 'md' || role === 'admin') && (allowed.has('ops') || allowed.has('tanks'));
  const canOpenMaintenance = role === 'admin' || allowed.has('maint');
  const canOpenReceiving = role === 'admin' || allowed.has('recv');
  const canOpenExpenses = role === 'admin' || allowed.has('exp');
  const canOpenTasks = role === 'admin' || allowed.has('tasks');
  const reviewCount = (canReviewDips ? pending : 0) + (canOpenMaintenance ? openMaintenance : 0);

  function openNeedsReview() {
    // Tank dip approvals and maintenance both contribute to this summary.
    // Open the most directly actionable queue first; if there are no pending
    // dips, take the user straight to the maintenance action list.
    if (canReviewDips && pending > 0) {
      router.push(`${SCREEN_ROUTES.ops}?tab=dip-approvals` as never);
      return;
    }
    if (canOpenMaintenance) router.push(SCREEN_ROUTES.maint as never);
  }

  function openJob(item: JobItem) {
    if (item.id === 'stock-log') {
      router.push(`${SCREEN_ROUTES.ops}?tab=stock` as never);
      return;
    }
    if (item.id === 'dips') {
      router.push(`${SCREEN_ROUTES.ops}?tab=dip-approvals` as never);
      return;
    }
    router.push(item.route as never);
  }

  function openReport(type: ReportType) {
    router.push(`${SCREEN_ROUTES.exprpt}/view?type=${type}` as never);
  }

  return (
    <ScreenLayout title="My Jobs">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: ROLE_COLORS[role] || colors.primary }]}>
          <View style={styles.heroGlow} />
          <Text style={styles.eyebrow}>WORKSPACE</Text>
          <Text style={styles.heroTitle}>Everything that needs your attention.</Text>
          <Text style={styles.heroSubtitle}>Your operational work is organized by department, with each action one tap away.</Text>
          <View style={styles.snapshotRow}>
            {(canReviewDips || canOpenMaintenance) ? (
              <TouchableOpacity
                style={styles.snapshotMetric}
                onPress={openNeedsReview}
                activeOpacity={0.72}
                accessibilityRole="button"
                accessibilityLabel={`${reviewCount} items need review`}
              >
                <Text style={styles.snapshotNumber}>{reviewCount}</Text>
                <Text style={styles.snapshotLabel}>Needs review</Text>
              </TouchableOpacity>
            ) : null}
            {canOpenReceiving ? (
              <TouchableOpacity
                style={styles.snapshotMetric}
                onPress={() => router.push(SCREEN_ROUTES.recv as never)}
                activeOpacity={0.72}
                accessibilityRole="button"
                accessibilityLabel={`${pendingDeliveries} deliveries pending review`}
              >
                <Text style={styles.snapshotNumber}>{pendingDeliveries}</Text>
                <Text style={styles.snapshotLabel}>Deliveries</Text>
              </TouchableOpacity>
            ) : null}
            {canOpenExpenses ? (
              <TouchableOpacity
                style={styles.snapshotMetric}
                onPress={() => router.push(SCREEN_ROUTES.exp as never)}
                activeOpacity={0.72}
                accessibilityRole="button"
                accessibilityLabel={`${pendingExpenses} finance items pending review`}
              >
                <Text style={styles.snapshotNumber}>{pendingExpenses}</Text>
                <Text style={styles.snapshotLabel}>Finance queue</Text>
              </TouchableOpacity>
            ) : null}
            {canOpenTasks ? (
              <TouchableOpacity
                style={styles.snapshotMetric}
                onPress={() => router.push(SCREEN_ROUTES.tasks as never)}
                activeOpacity={0.72}
                accessibilityRole="button"
                accessibilityLabel={`${taskCount} open tasks assigned to you`}
              >
                <Text style={styles.snapshotNumber}>{taskCount}</Text>
                <Text style={styles.snapshotLabel}>Open tasks</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <JobSection icon="construct-outline" title="Operations" subtitle="Keep the station running" items={visibleOperations} onPress={openJob} colors={colors} />
        <JobSection icon="trending-up-outline" title="Sales" subtitle="Track shifts and commercial performance" items={visibleSales} onPress={openJob} colors={colors} />
        <JobSection icon="wallet-outline" title="Finance" subtitle="Stay ahead of spend and financial health" items={visibleFinance} onPress={openJob} colors={colors} />

        {canAccessWorkspaceRoute(SCREEN_ROUTES.exprpt, role, navItems) && (
          <View style={styles.section}>
            <SectionHeader icon="document-text-outline" title="Reports" subtitle="Open a focused report or export the full picture" colors={colors} />
            <View style={styles.reportGrid}>
              {visibleReportTypes.map(type => {
                const meta = REPORT_META[type];
                return (
                  <TouchableOpacity key={type} style={[styles.reportCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => openReport(type)} activeOpacity={0.78}>
                    <View style={[styles.reportIcon, { backgroundColor: meta.color + '18' }]}><Ionicons name={meta.icon as any} size={18} color={meta.color} /></View>
                    <Text style={[styles.reportLabel, { color: colors.text }]}>{meta.label}</Text>
                    <Text style={[styles.reportDesc, { color: colors.textMuted }]} numberOfLines={2}>{meta.desc}</Text>
                    <Ionicons name="arrow-forward" size={14} color={meta.color} style={styles.reportArrow} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <JobSection icon="grid-outline" title="Other work" subtitle="People, controls and business support" items={visibleSupport} onPress={openJob} colors={colors} />
        <View style={{ height: 20 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 34, gap: 22 },
  hero: { borderRadius: 24, padding: 20, overflow: 'hidden', position: 'relative' },
  heroGlow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -85, top: -100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  eyebrow: { color: 'rgba(255,255,255,0.66)', fontSize: 10, letterSpacing: 1.6, fontWeight: '800' },
  heroTitle: { color: '#fff', fontSize: 23, lineHeight: 28, fontWeight: '800', marginTop: 8, maxWidth: 320 },
  heroSubtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 19, marginTop: 7, maxWidth: 340 },
  snapshotRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22, paddingTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.16)' },
  snapshotMetric: { flex: 1, minWidth: 0 },
  snapshotNumber: { color: '#fff', fontSize: 20, fontWeight: '800' },
  snapshotLabel: { color: 'rgba(255,255,255,0.68)', fontSize: 10, marginTop: 3 },
  section: { gap: 11 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 },
  sectionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  sectionSubtitle: { fontSize: 11, marginTop: 2 },
  jobList: { gap: 9 },
  jobCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 17, padding: 13, shadowColor: '#0F172A', shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
  jobIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  jobCopy: { flex: 1 },
  jobTitle: { fontSize: 14, fontWeight: '700' },
  jobDescription: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  reportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  reportCard: { width: '48.5%', minHeight: 142, borderWidth: 1, borderRadius: 17, padding: 13, position: 'relative' },
  reportIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  reportLabel: { fontSize: 13, fontWeight: '800', paddingRight: 4 },
  reportDesc: { fontSize: 10, lineHeight: 14, marginTop: 5, paddingRight: 5 },
  reportArrow: { position: 'absolute', right: 13, bottom: 13 },
}) as any;
