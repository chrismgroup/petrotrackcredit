import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { PriceTicker } from '@/components/PriceTicker';
import { SalesForecastCard } from '@/components/SalesForecastCard';
import { ScreenLayout } from '@/components/ScreenLayout';
import {
  ROLE_COLORS, UINFO, fmt, fmtDateTime, useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function HomeScreen() {
  const { role, branchId, userName, tanks, lpgTanks, maintenance, expenses, audit, branches, staff, departments, dips, unreadCount, companyInfo, pumpDailyReports } = useApp();
  const colors = useColors();
  const router = useRouter();

  if (!role) return null;

  const today = new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' });
  const roleColor = ROLE_COLORS[role] || colors.primary;
  const info = UINFO[role];

  const openMaint = maintenance.filter(m => m.st === 'Open');
  const pendingExp = expenses.filter(e => e.status === 'pending');
  const monthKey = new Date().toISOString().slice(0, 7);
  const totalRev = pumpDailyReports
    .filter(r => r.status === 'approved' && r.date.startsWith(monthKey) && (!branchId || !r.branchId || r.branchId === branchId))
    .reduce((s, r) => s + r.grossAmount, 0);
  const activeBranches = branches.filter(b => b.st === 'Active').length;
  const myTanks = tanks.filter(t => !branchId || !t.branchId || t.branchId === branchId);
  const totalStockL = myTanks.reduce((s, t) => s + (t.op - t.sl), 0);
  const unread = unreadCount();

  function expDaysLeft(exp: string) {
    const d = (new Date(exp).getTime() - Date.now()) / 86400000;
    return Math.ceil(d);
  }

  if (role === 'admin') {
    const sysStats = [
      { label: 'Total Staff', value: String(staff.length), icon: 'people', color: colors.primary },
      { label: 'Branches', value: String(branches.length), icon: 'business', color: colors.blue },
      { label: 'Departments', value: String(departments.length), icon: 'grid', color: colors.purple },
      { label: 'System Status', value: 'Live', icon: 'radio', color: '#27500A' },
    ];
    return (
      <ScreenLayout title="System Admin">
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.adminBanner, { backgroundColor: '#0a2318' }]}>
            <Ionicons name="shield-checkmark" size={32} color="#4CAF50" />
            <View style={{ flex: 1 }}>
              <Text style={styles.adminBannerTitle}>{companyInfo.name || 'Administrator Portal'}</Text>
              <Text style={styles.adminBannerSub}>
                {companyInfo.name
                  ? (companyInfo.rcNumber ? `RC: ${companyInfo.rcNumber}` : 'Full system access')
                  : 'Gastsmarts — Full system access'}
              </Text>
            </View>
          </View>
          {!companyInfo.name && (
            <TouchableOpacity
              onPress={() => router.push('/(app)/system-settings')}
              activeOpacity={0.85}
              style={[styles.setupPrompt, { backgroundColor: '#BA751718', borderColor: '#BA751744' }]}
            >
              <Ionicons name="alert-circle-outline" size={18} color="#BA7517" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#BA7517', fontSize: 13, fontWeight: '700' }}>Company info not set up</Text>
                <Text style={{ color: '#BA7517', fontSize: 11, marginTop: 1 }}>Tap to fill in your company name, address, tax IDs and more.</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="#BA7517" />
            </TouchableOpacity>
          )}
          <View style={styles.statsGrid}>
            {sysStats.map(stat => (
              <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.statIcon, { backgroundColor: stat.color + '18' }]}>
                  <Ionicons name={stat.icon as any} size={22} color={stat.color} />
                </View>
                <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>{stat.label}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Audit Log</Text>
            {(Array.isArray(audit) ? audit : []).slice(0, 5).map(a => (
              <View key={a.id} style={styles.auditRow}>
                <View style={[styles.auditDot, { backgroundColor: roleColor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.auditAction, { color: colors.text }]}>{a.action}</Text>
                  <Text style={[styles.auditDetail, { color: colors.textMuted }]} numberOfLines={1}>{a.detail}</Text>
                </View>
                <Text style={[styles.auditTime, { color: colors.textSubtle }]}>{fmtDateTime(a.ts)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </ScreenLayout>
    );
  }

  const metrics = [
    { label: 'Monthly Revenue', value: fmt(totalRev), icon: 'trending-up', col: colors.primary, sub: 'All branches' },
    { label: 'Fuel Stock', value: totalStockL.toLocaleString() + ' L', icon: 'water', col: colors.blue, sub: `${myTanks.length} tanks` },
    { label: 'Open Maintenance', value: String(openMaint.length), icon: 'build', col: openMaint.length > 0 ? colors.warning : colors.success, sub: openMaint.length > 0 ? `${openMaint.filter(m => m.pri === 'Urgent').length} urgent` : 'All clear' },
    { label: 'Unread Messages', value: String(unread), icon: 'chatbubbles', col: unread > 0 ? colors.coral : colors.primary, sub: unread > 0 ? 'Tap to view' : 'All read' },
  ];

  const lastDip = dips[0];

  const showTicker = role === 'ceo' || role === 'md' || role === 'mgr' || role === 'mktg' || role === 'csm';

  return (
    <ScreenLayout title="Overview" subHeader={showTicker ? <PriceTicker /> : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.greeting, { backgroundColor: roleColor + '18', borderColor: roleColor + '33' }]}>
          <View>
            <Text style={[styles.greetingTop, { color: colors.textMuted }]}>
              {companyInfo.name ? `${companyInfo.name} · ` : ''}{today}
            </Text>
            <Text style={[styles.greetingName, { color: colors.text }]}>Good day, {(userName || info?.name || '').split(' ')[0]} 👋</Text>
          </View>
          <View style={[styles.greetingBadge, { backgroundColor: roleColor }]}>
            <Text style={styles.greetingBadgeText}>
              {userName
                ? userName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
                : info?.initials}
            </Text>
          </View>
        </View>

        <View style={styles.metricsGrid}>
          {metrics.map(m => (
            <TouchableOpacity key={m.label} style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]} activeOpacity={0.85}>
              <View style={[styles.metricIcon, { backgroundColor: m.col + '18' }]}>
                <Ionicons name={m.icon as any} size={20} color={m.col} />
              </View>
              <Text style={[styles.metricValue, { color: colors.text }]}>{m.value}</Text>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{m.label}</Text>
              <Text style={[styles.metricSub, { color: m.col }]}>{m.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {lastDip && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Last Tank Dip</Text>
            <Text style={[styles.dipMeta, { color: colors.textMuted }]}>{fmtDateTime(lastDip.dt)} by {lastDip.by}</Text>
            <View style={styles.dipGrid}>
              {Object.entries(lastDip.rd).map(([tid, litres]) => {
                const tank = myTanks.find(t => t.id === tid);
                if (!tank) return null;
                const pct = tank.cap > 0 ? Math.round((Number(litres) / tank.cap) * 100) : 0;
                return (
                  <View key={tid} style={[styles.dipItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.dipTankName, { color: colors.text }]}>{tank.name}</Text>
                    <Text style={[styles.dipReading, { color: roleColor }]}>{Number(litres).toLocaleString()}L</Text>
                    <View style={[styles.progressBg, { backgroundColor: colors.border }]}>
                      <View style={[styles.progressBar, { width: `${Math.min(pct, 100)}%` as any, backgroundColor: pct < 30 ? colors.error : pct < 60 ? colors.amber : colors.primary }]} />
                    </View>
                    <Text style={[styles.dipPct, { color: colors.textMuted }]}>{pct}%</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {openMaint.length > 0 && (
          <View style={[styles.alertCard, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
            <Ionicons name="warning" size={18} color={colors.warning} />
            <Text style={[styles.alertText, { color: colors.warning }]}>
              {openMaint.length} open maintenance {openMaint.length === 1 ? 'item' : 'items'} — {openMaint.filter(m => m.pri === 'Urgent').length} urgent
            </Text>
          </View>
        )}

        {pendingExp.length > 0 && (role === 'acc' || role === 'ceo' || role === 'md') && (
          <View style={[styles.alertCard, { backgroundColor: colors.infoBg, borderColor: colors.border }]}>
            <Ionicons name="receipt" size={18} color={colors.info} />
            <Text style={[styles.alertText, { color: colors.info }]}>
              {pendingExp.length} expense{pendingExp.length > 1 ? 's' : ''} awaiting approval ({fmt(pendingExp.reduce((s, e) => s + e.amt, 0))})
            </Text>
          </View>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 },
  greeting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  greetingTop: { fontSize: 12, marginBottom: 2 },
  greetingName: { fontSize: 18, fontWeight: '700' },
  greetingBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  greetingBadgeText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  metricCard: { width: '47.5%', padding: 14, borderRadius: 14, borderWidth: 1, gap: 4 },
  metricIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  metricValue: { fontSize: 20, fontWeight: '700' },
  metricLabel: { fontSize: 12 },
  metricSub: { fontSize: 11, fontWeight: '600' },
  section: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  auditRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  auditDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  auditAction: { fontSize: 13, fontWeight: '600' },
  auditDetail: { fontSize: 11, marginTop: 1 },
  auditTime: { fontSize: 10 },
  dipMeta: { fontSize: 11, marginBottom: 10 },
  dipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dipItem: { width: '47.5%', padding: 10, borderRadius: 10, borderWidth: 1, gap: 3 },
  dipTankName: { fontSize: 11, fontWeight: '600' },
  dipReading: { fontSize: 16, fontWeight: '700' },
  progressBg: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressBar: { height: 4, borderRadius: 2 },
  dipPct: { fontSize: 10 },
  alertCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  alertText: { flex: 1, fontSize: 13, fontWeight: '500' },
  adminBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 14, marginBottom: 10 },
  setupPrompt: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  adminBannerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  adminBannerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: { width: '47.5%', padding: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 6 },
  statIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 12, textAlign: 'center' },
});
