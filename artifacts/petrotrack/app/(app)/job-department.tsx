import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, SCREEN_ROUTES, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { canAccessWorkspaceRoute, workspaceRouteAccess } from '@/lib/workspace-access';
import { REPORT_META, getPerms } from '@/lib/report-helpers';

type Job = { label: string; description: string; icon: string; route: string };
type Department = { title: string; subtitle: string; icon: string; jobs: Job[] };

const DEPARTMENTS: Record<string, Department> = {
  operations: { title: 'Operations', subtitle: 'Stock, tanks & deliveries', icon: 'construct-outline', jobs: [
    { label: 'Daily stock log', description: 'Trace opening stock, deliveries, sales and expected balance', icon: 'analytics-outline', route: SCREEN_ROUTES.ops },
    { label: 'Stock snapshot', description: 'Compare book stock, tank dips and variance', icon: 'layers-outline', route: SCREEN_ROUTES.stockSnapshot },
    { label: 'Maintenance', description: 'Log and follow up on station issues', icon: 'construct-outline', route: SCREEN_ROUTES.maint },
    { label: 'Tank dipping', description: 'Record physical tank readings and follow approval', icon: 'water-outline', route: SCREEN_ROUTES.tanks },
    { label: 'Product receiving', description: 'Submit product deliveries for cost-price review', icon: 'car-outline', route: SCREEN_ROUTES.recv },
    { label: 'Product inventory', description: 'View live stock by dip reading and branch balances', icon: 'cube-outline', route: SCREEN_ROUTES.inventory },
  ] },
  sales: { title: 'Sales', subtitle: 'Shifts, revenue & marketing', icon: 'trending-up-outline', jobs: [
    { label: 'Shift reports', description: 'Review pump shifts and cashier handovers', icon: 'swap-horizontal-outline', route: SCREEN_ROUTES.shift },
    { label: 'Sales overview', description: 'See product performance and revenue', icon: 'trending-up-outline', route: SCREEN_ROUTES.sales },
    { label: 'Marketing', description: 'Monitor market and competitor activity', icon: 'megaphone-outline', route: SCREEN_ROUTES.mktg },
  ] },
  finance: { title: 'Finance', subtitle: 'Spend, budgets & pricing', icon: 'wallet-outline', jobs: [
    { label: 'Financial status', description: 'View cash, assets and business position', icon: 'pie-chart-outline', route: SCREEN_ROUTES.acct },
    { label: 'Customer Profile', description: 'Manage credit customers, approvals, balances and advances', icon: 'people-outline', route: SCREEN_ROUTES.customerProfile },
    { label: 'Daily revenue log', description: 'Review revenue by business date', icon: 'calendar-outline', route: SCREEN_ROUTES.dailyRevenueLog },
    { label: 'Branch revenue log', description: 'Compare branches across business dates', icon: 'business-outline', route: SCREEN_ROUTES.branchRevenueLog },
    { label: 'Asset management', description: 'Track company assets and depreciation', icon: 'briefcase-outline', route: SCREEN_ROUTES.assets },
    { label: 'Expenses', description: 'Submit, review and approve expenses', icon: 'receipt-outline', route: SCREEN_ROUTES.exp },
    { label: 'Budgets', description: 'Plan spend and monitor performance', icon: 'calculator-outline', route: SCREEN_ROUTES.budget },
    { label: 'Prices', description: 'Review product prices and proposals', icon: 'pricetag-outline', route: SCREEN_ROUTES.prices },
  ] },
  hr: { title: 'Human Resources', subtitle: 'People, tasks & accountability', icon: 'people-circle-outline', jobs: [
    { label: 'People & HR', description: 'Staff, departments and employee records', icon: 'people-outline', route: SCREEN_ROUTES.hr },
    { label: 'Tasks & KPIs', description: 'Keep assigned work and targets moving', icon: 'checkmark-circle-outline', route: SCREEN_ROUTES.tasks },
    { label: 'Action items', description: 'Track ownership and close-out dates', icon: 'flash-outline', route: SCREEN_ROUTES.actionItems },
  ] },
  admin: { title: 'Administration', subtitle: 'Accounts, stations & controls', icon: 'settings-outline', jobs: [
    { label: 'Users', description: 'Manage user accounts and staff directory', icon: 'person-outline', route: SCREEN_ROUTES.users },
    { label: 'Branches', description: 'Manage stations and branch performance', icon: 'business-outline', route: SCREEN_ROUTES.branches },
    { label: 'Audit trail', description: 'Review activity across the business', icon: 'shield-checkmark-outline', route: SCREEN_ROUTES.audit },
    { label: 'System settings', description: 'Configure Petrotrack controls', icon: 'settings-outline', route: SCREEN_ROUTES.settings },
  ] },
  reports: { title: 'Reports', subtitle: 'Focused reports & exports', icon: 'document-text-outline', jobs: [] },
};

export default function JobDepartmentScreen() {
  const { department } = useLocalSearchParams<{ department?: string }>();
  const { role, navItems } = useApp();
  const colors = useColors();
  const router = useRouter();
  const current = DEPARTMENTS[department ?? ''] ?? DEPARTMENTS.operations;
  if (!role) return null;
  const allJobs = department === 'reports'
    ? getPerms(role).visible.map(type => ({ label: REPORT_META[type].label, description: REPORT_META[type].desc, icon: REPORT_META[type].icon, route: `${SCREEN_ROUTES.exprpt}/view?type=${type}` }))
    : current.jobs;
  const jobs = allJobs.filter(job => workspaceRouteAccess(job.route) && canAccessWorkspaceRoute(job.route, role, navItems));
  const accent = ROLE_COLORS[role] ?? colors.primary;

  return (
    <ScreenLayout title={current.title}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: accent }]}>
          <Ionicons name={current.icon as any} size={24} color="#fff" />
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.subtitle}>{current.subtitle}</Text>
        </View>
        {jobs.map(job => (
          <TouchableOpacity key={job.route} onPress={() => router.push(job.route as never)} activeOpacity={0.78} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.icon, { backgroundColor: accent + '16' }]}><Ionicons name={job.icon as any} size={20} color={accent} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.label, { color: colors.text }]}>{job.label}</Text><Text style={[styles.description, { color: colors.textMuted }]}>{job.description}</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 10, paddingBottom: 32 }, hero: { borderRadius: 20, padding: 20, gap: 6, marginBottom: 6 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' }, subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderRadius: 16 }, icon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '800' }, description: { fontSize: 11, lineHeight: 16, marginTop: 3 },
});
