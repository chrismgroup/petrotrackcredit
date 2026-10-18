import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { getPerms } from '@/lib/report-helpers';
import { ROLE_COLORS, SCREEN_ROUTES, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { canAccessWorkspaceRoute, workspaceRouteAccess } from '@/lib/workspace-access';

type JobItem = {
  id: string;
  label: string;
  description: string;
  icon: string;
  route: string;
};

// Every item within a department shares one accent color drawn straight from
// the app's shared design tokens (constants/colors.ts) rather than a
// one-off hex per card. That keeps each department visually coherent and
// keeps the whole workspace on one consistent palette.
const operations: JobItem[] = [
  { id: 'stock-log', label: 'Daily stock log', description: 'Trace opening stock, deliveries, sales and expected balance', icon: 'analytics-outline', route: SCREEN_ROUTES.ops },
  { id: 'stock-snapshot', label: 'Stock snapshot', description: 'Compare book stock, tank dips and variance', icon: 'layers-outline', route: SCREEN_ROUTES.stockSnapshot },
  { id: 'maint', label: 'Maintenance', description: 'Log and follow up on station issues', icon: 'construct-outline', route: SCREEN_ROUTES.maint },
  { id: 'dips', label: 'Tank dipping', description: 'Record physical tank readings and follow approval', icon: 'water-outline', route: SCREEN_ROUTES.tanks },
  { id: 'receiving', label: 'Products receiving', description: 'Track deliveries, costs and variances', icon: 'car-outline', route: SCREEN_ROUTES.recv },
  { id: 'inventory', label: 'Product inventory', description: 'View live stock by dip reading and branch balances', icon: 'cube-outline', route: SCREEN_ROUTES.inventory },
];

const sales: JobItem[] = [
  { id: 'shift', label: 'Shift reports', description: 'Review pump shifts and cashier handovers', icon: 'swap-horizontal-outline', route: SCREEN_ROUTES.shift },
  { id: 'sales', label: 'Sales overview', description: 'See product performance and revenue', icon: 'trending-up-outline', route: SCREEN_ROUTES.sales },
  { id: 'marketing', label: 'Marketing', description: 'Monitor market and competitor activity', icon: 'megaphone-outline', route: SCREEN_ROUTES.mktg },
];

const finance: JobItem[] = [
  { id: 'financial-status', label: 'Financial status', description: 'View cash, assets and business position', icon: 'pie-chart-outline', route: SCREEN_ROUTES.acct },
  { id: 'customer-profile', label: 'Customer Profile', description: 'Manage credit customers, approvals, balances and advances', icon: 'people-outline', route: SCREEN_ROUTES.customerProfile },
  { id: 'daily-revenue-log', label: 'Daily Business-Date Revenue Log', description: 'Review revenue grouped by the business date of each shift report', icon: 'calendar-outline', route: SCREEN_ROUTES.dailyRevenueLog },
  { id: 'branch-revenue-log', label: 'Branch Revenue by Business Date', description: 'Compare each branch’s revenue across recorded business dates', icon: 'business-outline', route: SCREEN_ROUTES.branchRevenueLog },
  { id: 'assets', label: 'Asset management', description: 'Track company assets and monthly depreciation by branch', icon: 'briefcase-outline', route: SCREEN_ROUTES.assets },
  { id: 'expenses', label: 'Expenses', description: 'Submit, review and approve expenses', icon: 'receipt-outline', route: SCREEN_ROUTES.exp },
  { id: 'budgets', label: 'Budgets', description: 'Plan spend and monitor budget performance', icon: 'calculator-outline', route: SCREEN_ROUTES.budget },
  { id: 'prices', label: 'Prices', description: 'Review product prices and proposals', icon: 'pricetag-outline', route: SCREEN_ROUTES.prices },
  { id: 'creditFacility', label: 'Credit Facility', description: 'See indicative borrowing capacity from Petrotrack business data (pilot)', icon: 'shield-checkmark-outline', route: SCREEN_ROUTES.creditFacility },
  { id: 'posTransactions', label: 'POS Transactions', description: 'Card and transfer payments reported automatically by pump POS terminals', icon: 'card-outline', route: SCREEN_ROUTES.posTransactions },
  { id: 'posTerminals', label: 'POS Terminals', description: 'Assign each POS terminal (UUID) to a pump', icon: 'hardware-chip-outline', route: SCREEN_ROUTES.posTerminals },
];

const humanResources: JobItem[] = [
  { id: 'people', label: 'People & HR', description: 'Staff, departments and employee records', icon: 'people-outline', route: SCREEN_ROUTES.hr },
  { id: 'tasks', label: 'Tasks & KPIs', description: 'Keep assigned work and targets moving', icon: 'checkmark-circle-outline', route: SCREEN_ROUTES.tasks },
  { id: 'actionItems', label: 'Action items', description: 'Track ownership, close-out dates and branch accountability', icon: 'flash-outline', route: SCREEN_ROUTES.actionItems },
];

const administration: JobItem[] = [
  { id: 'users', label: 'Users', description: 'Manage user accounts and the complete staff directory', icon: 'person-outline', route: SCREEN_ROUTES.users },
  { id: 'branches', label: 'Branches', description: 'Manage stations and branch performance', icon: 'business-outline', route: SCREEN_ROUTES.branches },
  { id: 'audit', label: 'Audit trail', description: 'Review activity across the business', icon: 'shield-checkmark-outline', route: SCREEN_ROUTES.audit },
  { id: 'settings', label: 'System settings', description: 'Configure Petrotrack controls', icon: 'settings-outline', route: SCREEN_ROUTES.settings },
];

type DeptKey = 'operations' | 'sales' | 'finance' | 'reports' | 'hr' | 'admin';

function JobCard({ item, accent, onPress, colors }: { item: JobItem; accent: string; onPress: () => void; colors: any }) {
  return (
    <TouchableOpacity
      style={[styles.jobCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.78}
    >
      <View style={[styles.jobIcon, { backgroundColor: accent + '16' }]}>
        <Ionicons name={item.icon as any} size={19} color={accent} />
      </View>
      <View style={styles.jobCopy}>
        <Text style={[styles.jobTitle, { color: colors.text }]}>{item.label}</Text>
        <Text style={[styles.jobDescription, { color: colors.textMuted }]}>{item.description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.textSubtle} />
    </TouchableOpacity>
  );
}

function DepartmentTile({
  icon, title, subtitle, accent, count, badge, expanded, onPress, colors,
}: {
  icon: string; title: string; subtitle: string; accent: string; count: number; badge?: number;
  expanded: boolean; onPress: () => void; colors: any;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.deptTile,
        {
          backgroundColor: expanded ? accent : colors.surface,
          borderColor: expanded ? accent : colors.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${title} department, ${count} item${count === 1 ? '' : 's'}${badge ? `, ${badge} awaiting action` : ''}`}
    >
      <View style={[styles.deptIcon, { backgroundColor: expanded ? 'rgba(255,255,255,0.2)' : accent + '16' }]}>
        <Ionicons name={icon as any} size={20} color={expanded ? '#fff' : accent} />
      </View>
      <Text style={[styles.deptTitle, { color: expanded ? '#fff' : colors.text }]} numberOfLines={1}>{title}</Text>
      <Text style={[styles.deptSubtitle, { color: expanded ? 'rgba(255,255,255,0.78)' : colors.textMuted }]} numberOfLines={2}>{subtitle}</Text>
      <View style={styles.deptFooter}>
        <Text style={[styles.deptCount, { color: expanded ? 'rgba(255,255,255,0.85)' : colors.textSubtle }]}>
          {count} tool{count === 1 ? '' : 's'}
        </Text>
        {!!badge && badge > 0 && (
          <View style={[styles.deptBadge, { backgroundColor: expanded ? '#fff' : accent }]}>
            <Text style={[styles.deptBadgeText, { color: expanded ? accent : '#fff' }]}>{badge}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
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
    return canAccessWorkspaceRoute(item.route, role, navItems);
  };
  const visibleOperations = operations.filter(canSee);
  const visibleSales = sales.filter(canSee);
  const visibleFinance = finance.filter(canSee);
  const visibleHR = humanResources.filter(canSee);
  const visibleAdmin = administration.filter(canSee);
  const visibleReportTypes = getPerms(role).visible;
  const canSeeReports = canAccessWorkspaceRoute(SCREEN_ROUTES.exprpt, role, navItems) && visibleReportTypes.length > 0;

  const pending = dips.filter(d => d.status === 'pending').length;
  const openMaintenance = maintenance.filter(item => item.st === 'Open').length;
  const pendingDeliveries = deliveries.filter(item => item.approvalStatus === 'pending' || item.approvalStatus === 'pending_acc' || item.approvalStatus === 'pending_md').length;
  const pendingExpenses = expenses.filter(item => item.status === 'pending' || item.status === 'acc_forwarded').length;
  const pendingBudgets = budgets.filter(item => item.status === 'submitted' || item.status === 'acc_forwarded').length;
  const taskCount = tasks.filter(item => item.assignedTo === role && item.status !== 'completed').length;

  const canReviewDips = (role === 'md' || role === 'admin') && (allowed.has('ops') || allowed.has('tanks'));
  const canOpenMaintenance = role === 'admin' || allowed.has('maint');
  const canOpenReceiving = role === 'admin' || allowed.has('recv');
  const canOpenExpenses = role === 'admin' || allowed.has('exp');
  const canOpenTasks = role === 'admin' || allowed.has('tasks');
  const reviewCount = (canReviewDips ? pending : 0) + (canOpenMaintenance ? openMaintenance : 0);

  // Departments defined in one place so their accent colors, badges and
  // visible item lists all stay in sync as roles/permissions change.
  const departments: Array<{
    key: DeptKey; title: string; subtitle: string; icon: string; accent: string;
    items: JobItem[]; badge?: number;
  }> = [
    {
      key: 'operations' as const, title: 'Operations', subtitle: 'Stock, tanks & deliveries', icon: 'construct-outline',
      accent: colors.teal, items: visibleOperations,
      badge: (canOpenReceiving ? pendingDeliveries : 0) + (canOpenMaintenance ? openMaintenance : 0) + (canReviewDips ? pending : 0),
    },
    {
      key: 'sales' as const, title: 'Sales', subtitle: 'Shifts, revenue & marketing', icon: 'trending-up-outline',
      accent: colors.blue, items: visibleSales, badge: 0,
    },
    {
      key: 'finance' as const, title: 'Finance', subtitle: 'Spend, budgets & pricing', icon: 'wallet-outline',
      accent: colors.brown, items: visibleFinance,
      badge: (canOpenExpenses ? pendingExpenses : 0) + pendingBudgets,
    },
    {
      key: 'hr' as const, title: 'Human Resources', subtitle: 'People, tasks & accountability', icon: 'people-circle-outline',
      accent: colors.coral, items: visibleHR,
      badge: canOpenTasks ? taskCount : 0,
    },
    {
      key: 'admin' as const, title: 'Administration', subtitle: 'Accounts, stations & controls', icon: 'settings-outline',
      accent: colors.textMuted, items: visibleAdmin, badge: 0,
    },
  ].filter(dept => dept.items.length > 0);

  function openNeedsReview() {
    // Tank dip approvals and maintenance both contribute to this summary.
    // Open the most directly actionable queue first; if there are no pending
    // dips, take the user straight to the maintenance action list.
    if (canReviewDips && pending > 0) {
      router.push(SCREEN_ROUTES.tanks as never);
      return;
    }
    if (canOpenMaintenance) router.push(SCREEN_ROUTES.maint as never);
  }

  function openDepartment(key: DeptKey) {
    router.push(`/(app)/job-department?department=${key}` as never);
  }

  return (
    <ScreenLayout title="My Jobs">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: ROLE_COLORS[role] || colors.primary }]}>
          <View style={styles.heroGlow} />
          <Text style={styles.eyebrow}>WORKSPACE</Text>
          <Text style={styles.heroTitle}>Everything that needs your attention.</Text>
          <Text style={styles.heroSubtitle}>Tap a department below to open its tools. Each department is one tap away.</Text>
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

        {/* Each department opens as its own page, keeping My Jobs a clean
            launchpad and giving every tool list a dedicated navigation view. */}
        <View style={styles.deptGrid}>
          {departments.map(dept => (
            <DepartmentTile
              key={dept.key}
              icon={dept.icon}
              title={dept.title}
              subtitle={dept.subtitle}
              accent={dept.accent}
              count={dept.items.length}
              badge={dept.badge}
              expanded={false}
              onPress={() => openDepartment(dept.key)}
              colors={colors}
            />
          ))}
          {canSeeReports && (
            <DepartmentTile
              icon="document-text-outline"
              title="Reports"
              subtitle="Focused reports & exports"
              accent={colors.purple}
              count={visibleReportTypes.length}
              expanded={false}
              onPress={() => openDepartment('reports')}
              colors={colors}
            />
          )}
        </View>

        <View style={[styles.hintCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
          <Text style={[styles.hintText, { color: colors.textMuted }]}>Tap any department to open its tools on a new page.</Text>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 34, gap: 18 },
  hero: { borderRadius: 24, padding: 20, overflow: 'hidden', position: 'relative' },
  heroGlow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -85, top: -100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  eyebrow: { color: 'rgba(255,255,255,0.66)', fontSize: 10, letterSpacing: 1.6, fontWeight: '800' },
  heroTitle: { color: '#fff', fontSize: 23, lineHeight: 28, fontWeight: '800', marginTop: 8, maxWidth: 320 },
  heroSubtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 19, marginTop: 7, maxWidth: 340 },
  snapshotRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22, paddingTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.16)' },
  snapshotMetric: { flex: 1, minWidth: 0 },
  snapshotNumber: { color: '#fff', fontSize: 20, fontWeight: '800' },
  snapshotLabel: { color: 'rgba(255,255,255,0.68)', fontSize: 10, marginTop: 3 },

  deptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  deptTile: {
    width: '48%', borderRadius: 18, borderWidth: 1, padding: 14, gap: 2,
    shadowColor: '#14271D', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  deptIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  deptTitle: { fontSize: 14.5, fontWeight: '800' },
  deptSubtitle: { fontSize: 11, lineHeight: 15, marginTop: 1 },
  deptFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  deptCount: { fontSize: 10.5, fontWeight: '700' },
  deptBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  deptBadgeText: { fontSize: 11, fontWeight: '800' },

  section: { gap: 11 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 },
  sectionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  sectionSubtitle: { fontSize: 11, marginTop: 2 },
  jobList: { gap: 9 },
  jobCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 17, padding: 13, shadowColor: '#14271D', shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
  jobIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  jobCopy: { flex: 1 },
  jobTitle: { fontSize: 14, fontWeight: '700' },
  jobDescription: { fontSize: 11, lineHeight: 16, marginTop: 3 },

  hintCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, padding: 12 },
  hintText: { fontSize: 12, flex: 1 },
}) as any;
