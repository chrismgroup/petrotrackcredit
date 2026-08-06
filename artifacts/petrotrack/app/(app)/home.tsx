import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import {
  getCurrentTankStock,
  ROLE_LABELS,
  SCREEN_ROUTES,
  unitForProd,
  useApp,
  type Budget,
  type Message,
  type PumpDailyReport,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

// ─── helpers ───────────────────────────────────────────────────────────────
import { G, Rect, Svg, Text as SvgText } from 'react-native-svg';

function fmtK(n: number): string {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n.toLocaleString()}`;
}

function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function dayGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── sub-components ────────────────────────────────────────────────────────

interface SectionProps {
  label: string;
  route?: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}

function Section({ label, route, children, colors }: SectionProps) {
  const router = useRouter();
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>{label}</Text>
        {route ? (
          <TouchableOpacity onPress={() => router.push(route as never)} activeOpacity={0.7}>
            <Text style={[s.sectionMore, { color: colors.primary }]}>See all</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

interface KpiTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  sub?: string;
  accent: string;
  colors: ReturnType<typeof useColors>;
  onPress?: () => void;
}

function KpiTile({ icon, label, value, sub, accent, colors, onPress }: KpiTileProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.78 : 1}
      style={[s.kpiTile, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[s.kpiIconWrap, { backgroundColor: accent + '18' }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <Text style={[s.kpiValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
      <Text style={[s.kpiLabel, { color: colors.textMuted }]} numberOfLines={1}>{label}</Text>
      {sub ? <Text style={[s.kpiSub, { color: sub.startsWith('+') ? colors.success : colors.textSubtle }]}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

interface ApprovalRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  title: string;
  meta: string;
  count?: number;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}

function ApprovalRow({ icon, accent, title, meta, count, onPress, colors }: ApprovalRowProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.78} style={[s.approvalRow, { borderBottomColor: colors.border }]}>
      <View style={[s.approvalIcon, { backgroundColor: accent + '18' }]}>
        <Ionicons name={icon} size={16} color={accent} />
      </View>
      <View style={s.approvalBody}>
        <Text style={[s.approvalTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[s.approvalMeta, { color: colors.textMuted }]}>{meta}</Text>
      </View>
      <View style={s.approvalRight}>
        {count !== undefined && count > 0 ? (
          <View style={[s.countBadge, { backgroundColor: accent }]}>
            <Text style={s.countBadgeText}>{count}</Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={15} color={colors.textSubtle} />
      </View>
    </TouchableOpacity>
  );
}

interface MsgRowProps {
  msg: Message;
  from: string;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}

function MsgRow({ msg, from, colors, onPress }: MsgRowProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.78} style={[s.msgRow, { borderBottomColor: colors.border }]}>
      <View style={[s.msgAvatar, { backgroundColor: colors.primary + '22' }]}>
        <Text style={[s.msgAvatarText, { color: colors.primary }]}>
          {from.slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <View style={s.msgBody}>
        <View style={s.msgTopLine}>
          <Text style={[s.msgFrom, { color: colors.text }]} numberOfLines={1}>{from}</Text>
          <Text style={[s.msgTime, { color: colors.textSubtle }]}>{relTime(msg.ts)}</Text>
        </View>
        <Text style={[s.msgPreview, { color: colors.textMuted }]} numberOfLines={1}>{msg.body}</Text>
      </View>
      <View style={[s.unreadDot, { backgroundColor: colors.primary }]} />
    </TouchableOpacity>
  );
}

interface BranchBarProps {
  name: string;
  rev: number;
  maxRev: number;
  st: string;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}

function BranchBar({ name, rev, maxRev, st, colors, onPress }: BranchBarProps) {
  const pct = maxRev > 0 ? (rev / maxRev) * 100 : 0;
  const stColor = st === 'Active' ? colors.success : st === 'Suspended' ? colors.error : colors.warning;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.78} style={s.branchRow}>
      <View style={s.branchLeft}>
        <Text style={[s.branchName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
        <View style={[s.branchTrack, { backgroundColor: colors.border }]}>
          <View style={[s.branchFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: colors.primary }]} />
        </View>
      </View>
      <View style={s.branchRight}>
        <Text style={[s.branchRev, { color: colors.text }]}>{fmtK(rev)}</Text>
        <View style={[s.statusPip, { backgroundColor: stColor + '22' }]}>
          <View style={[s.statusPipDot, { backgroundColor: stColor }]} />
          <Text style={[s.statusPipText, { color: stColor }]}>{st}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

interface FinancialCellProps {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  colors: ReturnType<typeof useColors>;
}

function FinancialCell({ label, value, icon, accent, colors }: FinancialCellProps) {
  return (
    <View style={[s.finCell, { borderColor: colors.border }]}>
      <Ionicons name={icon} size={14} color={accent} style={{ marginBottom: 6 }} />
      <Text style={[s.finValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
      <Text style={[s.finLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

interface RevenueTrendChartProps {
  dailyRevenue: { label: string; value: number }[];
  accent: string;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}

// ─── main screen ───────────────────────────────────────────────────────────

export default function HomeScreen() {
  const {
    role, userName, branchId, branches,
    tanks, lpgTanks, dips,
    deliveries, maintenance, expenses, budgets,
    financialEntry, priceProposals,
    pumpDailyReports, userAccounts, messages,
    unreadCount, approveDip, approveExpense,
    approveDelivery, approvePriceProposal,
    sales,
  } = useApp();

  const colors = useColors();
  const router = useRouter();

  const [noteModal, setNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');

  if (!role) return null;

  const isApprover = role === 'md' || role === 'admin' || role === 'ceo';
  const greeting = dayGreeting();
  const dayStamp = new Date().toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  // ── KPIs ──────────────────────────────────────────────────────────────
  const totalRevenue = useMemo(() => branches.reduce((s, b) => s + b.rev, 0), [branches]);

  const totalPetrolStock = useMemo(
    () => tanks.filter(t => !branchId || t.branchId === branchId)
      .reduce((s, t) => s + getCurrentTankStock(t, dips), 0),
    [tanks, dips, branchId],
  );
  const totalLpgStock = useMemo(
    () => lpgTanks.filter(t => !branchId || t.branchId === branchId)
      .reduce((s, t) => s + getCurrentTankStock(t, dips, 'lpg'), 0),
    [lpgTanks, dips, branchId],
  );

  const activeBranches = branches.filter(b => b.st === 'Active').length;

  // ── Approval items ────────────────────────────────────────────────────
  const pendingDips = dips.filter(d => d.status === 'pending');
  const pendingDeliveries = deliveries.filter(d =>
    d.approvalStatus === 'pending' || d.approvalStatus === 'pending_acc' || d.approvalStatus === 'pending_md',
  );
  const pendingExpenses = expenses.filter(e => e.status === 'pending' || e.status === 'acc_forwarded');
  const pendingPriceProps = priceProposals.filter(p => p.status === 'pending');
  const pendingPumpReports = pumpDailyReports.filter(r =>
    r.status === 'pending_manager' || r.status === 'pending_accountant',
  );
  const pendingBudgets = budgets.filter(b =>
    b.status === 'submitted' || b.status === 'forwarded',
  );
  const pendingAccounts = userAccounts.filter(a =>
    a.status === 'pending' || a.status === 'pending_md' || a.status === 'pending_admin',
  );

  const totalApprovals =
    pendingDips.length + pendingDeliveries.length + pendingExpenses.length +
    pendingPriceProps.length + pendingPumpReports.length + pendingBudgets.length +
    pendingAccounts.length;

  // ── Unread messages ───────────────────────────────────────────────────
  const unread = unreadCount();
  const unreadMessages = useMemo(() => {
    const all: { key: string; msg: Message }[] = [];
    for (const [key, thread] of Object.entries(messages)) {
      const peer = key.split('-').find(p => p !== role) ?? key;
      const unreadInThread = (thread as Message[]).filter(m => m.to === role && !m.read);
      for (const msg of unreadInThread) all.push({ key: peer, msg });
    }
    return all
      .sort((a, b) => new Date(b.msg.ts).getTime() - new Date(a.msg.ts).getTime())
      .slice(0, 5);
  }, [messages, role]);

  // ── Maintenance ────────────────────────────────────────────────────────
  const urgentMaintenance = maintenance.filter(m => m.st === 'Open' && m.pri === 'Urgent');
  const openMaintenance = maintenance.filter(m => m.st === 'Open');

  // ── Budget ────────────────────────────────────────────────────────────
  const currentBudget = useMemo<Budget | undefined>(() => {
    const now = new Date();
    return budgets.find(b => b.month === now.getMonth() + 1 && b.year === now.getFullYear()) ?? budgets[budgets.length - 1];
  }, [budgets]);

  const budgetSpent = useMemo(() =>
    expenses
      .filter(e => currentBudget && e.budgetId === currentBudget.id && e.status === 'approved')
      .reduce((s, e) => s + e.amt, 0),
    [expenses, currentBudget],
  );

  const budgetPct = currentBudget && currentBudget.total > 0
    ? Math.min(100, Math.round((budgetSpent / currentBudget.total) * 100))
    : 0;

  const budgetColor = budgetPct >= 90 ? colors.error : budgetPct >= 70 ? colors.warning : colors.success;

  // ── 7-day revenue trend ───────────────────────────────────────────────
  const sevenDayRevenue = useMemo(() => {
    const days: { label: string; value: number }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const dayLabel = d.toLocaleDateString('en-NG', { weekday: 'short' }).slice(0, 2);
      const rev = sales
        .filter(entry => entry.dt && entry.dt.startsWith(iso))
        .reduce((sum, entry) => sum + entry.L * entry.price, 0);
      days.push({ label: dayLabel, value: rev });
    }
    return days;
  }, [sales]);

  // ── Branch sort by rev ────────────────────────────────────────────────
  const sortedBranches = useMemo(
    () => [...branches].sort((a, b) => b.rev - a.rev),
    [branches],
  );
  const maxBranchRev = sortedBranches[0]?.rev ?? 1;

  return (
    <ScreenLayout title="Home">
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[]}
      >
        {/* ── Hero ────────────────────────────────────────────────── */}
        <View style={[s.hero, { backgroundColor: colors.primaryDark }]}>
          <View style={s.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.heroEyebrow}>PETROTRACK COMMAND</Text>
              <Text style={s.heroGreeting}>{greeting},</Text>
              <Text style={s.heroName}>{userName || ROLE_LABELS[role] || role}</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push(SCREEN_ROUTES.messages as never)}
              style={s.heroNotif}
              activeOpacity={0.8}
            >
              <Ionicons name="notifications-outline" size={20} color="#F0FFF4" />
              {unread > 0 ? (
                <View style={[s.notifBadge, { backgroundColor: colors.amber }]}>
                  <Text style={s.notifBadgeText}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>

          <Text style={s.heroDate}>{dayStamp}</Text>

          {/* summary pills */}
          <View style={s.heroPills}>
            {urgentMaintenance.length > 0 ? (
              <TouchableOpacity
                onPress={() => router.push(SCREEN_ROUTES.maint as never)}
                style={[s.heroPill, { backgroundColor: colors.error + '28', borderColor: colors.error + '55' }]}
                activeOpacity={0.8}
              >
                <View style={[s.heroPillDot, { backgroundColor: colors.error }]} />
                <Text style={[s.heroPillText, { color: '#FFD4D4' }]}>{urgentMaintenance.length} urgent alert{urgentMaintenance.length > 1 ? 's' : ''}</Text>
              </TouchableOpacity>
            ) : null}
            {totalApprovals > 0 ? (
              <View style={[s.heroPill, { backgroundColor: colors.amber + '28', borderColor: colors.amber + '55' }]}>
                <View style={[s.heroPillDot, { backgroundColor: colors.amber }]} />
                <Text style={[s.heroPillText, { color: '#FFE5A0' }]}>{totalApprovals} awaiting approval</Text>
              </View>
            ) : (
              <View style={[s.heroPill, { backgroundColor: colors.success + '22', borderColor: colors.success + '44' }]}>
                <View style={[s.heroPillDot, { backgroundColor: '#6EE89B' }]} />
                <Text style={[s.heroPillText, { color: '#B6F5C8' }]}>All clear — no pending actions</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── KPI Grid ────────────────────────────────────────────── */}
        <View style={s.kpiGrid}>
          <KpiTile
            icon="cash-outline"
            label="Total Revenue"
            value={fmtK(totalRevenue)}
            accent={colors.primary}
            colors={colors}
            onPress={() => router.push(SCREEN_ROUTES.acct as never)}
          />
          <KpiTile
            icon="business-outline"
            label="Cash in Bank"
            value={fmtK(financialEntry.cashInBank)}
            accent={colors.blue}
            colors={colors}
            onPress={() => router.push(SCREEN_ROUTES.acct as never)}
          />
          <KpiTile
            icon="water-outline"
            label="Fuel Stock"
            value={`${(totalPetrolStock / 1000).toFixed(1)}kL`}
            sub={`+ ${totalLpgStock.toLocaleString()} kg LPG`}
            accent={colors.teal}
            colors={colors}
            onPress={() => router.push(`${SCREEN_ROUTES.ops}?tab=inventory` as never)}
          />
          <KpiTile
            icon="storefront-outline"
            label="Active Branches"
            value={`${activeBranches}`}
            sub={`of ${branches.length} total`}
            accent={colors.purple}
            colors={colors}
            onPress={() => router.push(SCREEN_ROUTES.branches as never)}
          />
        </View>

        {/* ── Approvals Inbox ─────────────────────────────────────── */}
        <Section label="APPROVALS & ACTIONS" colors={colors}>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {totalApprovals === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="checkmark-circle-outline" size={32} color={colors.success} />
                <Text style={[s.emptyText, { color: colors.textMuted }]}>No pending approvals</Text>
              </View>
            ) : null}

            {pendingDips.length > 0 ? (
              <ApprovalRow
                icon="water-outline"
                accent={colors.amber}
                title="Tank Dip Readings"
                meta={`${pendingDips.length} reading${pendingDips.length > 1 ? 's' : ''} awaiting approval`}
                count={pendingDips.length}
                onPress={() => router.push(SCREEN_ROUTES.ops as never)}
                colors={colors}
              />
            ) : null}

            {pendingDeliveries.length > 0 ? (
              <ApprovalRow
                icon="cube-outline"
                accent={colors.blue}
                title="Product Deliveries"
                meta={`${pendingDeliveries.length} delivery receipt${pendingDeliveries.length > 1 ? 's' : ''} pending review`}
                count={pendingDeliveries.length}
                onPress={() => router.push(SCREEN_ROUTES.recv as never)}
                colors={colors}
              />
            ) : null}

            {pendingExpenses.length > 0 ? (
              <ApprovalRow
                icon="receipt-outline"
                accent={colors.teal}
                title="Expense Claims"
                meta={`${pendingExpenses.length} claim${pendingExpenses.length > 1 ? 's' : ''} waiting for decision`}
                count={pendingExpenses.length}
                onPress={() => router.push(SCREEN_ROUTES.exp as never)}
                colors={colors}
              />
            ) : null}

            {pendingPriceProps.length > 0 ? (
              <ApprovalRow
                icon="pricetag-outline"
                accent={colors.purple}
                title="Price Proposals"
                meta={`${pendingPriceProps.length} fuel price change${pendingPriceProps.length > 1 ? 's' : ''} to review`}
                count={pendingPriceProps.length}
                onPress={() => router.push(SCREEN_ROUTES.prices as never)}
                colors={colors}
              />
            ) : null}

            {pendingPumpReports.length > 0 ? (
              <ApprovalRow
                icon="speedometer-outline"
                accent={colors.coral}
                title="Pump Daily Reports"
                meta={`${pendingPumpReports.length} shift report${pendingPumpReports.length > 1 ? 's' : ''} pending approval`}
                count={pendingPumpReports.length}
                onPress={() => router.push(SCREEN_ROUTES.shift as never)}
                colors={colors}
              />
            ) : null}

            {pendingBudgets.length > 0 ? (
              <ApprovalRow
                icon="wallet-outline"
                accent={colors.brown}
                title="Budget Submissions"
                meta={`${pendingBudgets.length} budget${pendingBudgets.length > 1 ? 's' : ''} awaiting sign-off`}
                count={pendingBudgets.length}
                onPress={() => router.push(SCREEN_ROUTES.budget as never)}
                colors={colors}
              />
            ) : null}

            {pendingAccounts.length > 0 ? (
              <ApprovalRow
                icon="person-add-outline"
                accent={colors.primary}
                title="Staff Enrolments"
                meta={`${pendingAccounts.length} new account${pendingAccounts.length > 1 ? 's' : ''} awaiting activation`}
                count={pendingAccounts.length}
                onPress={() => router.push(SCREEN_ROUTES.hr as never)}
                colors={colors}
              />
            ) : null}

            {urgentMaintenance.length > 0 ? (
              <ApprovalRow
                icon="warning-outline"
                accent={colors.error}
                title="Urgent Maintenance"
                meta={urgentMaintenance.slice(0, 2).map(m => m.title).join(' · ')}
                count={urgentMaintenance.length}
                onPress={() => router.push(SCREEN_ROUTES.maint as never)}
                colors={colors}
              />
            ) : null}
          </View>
        </Section>

        {/* ── Financial Status ─────────────────────────────────────── */}
        <Section label="FINANCIAL STATUS" route={SCREEN_ROUTES.acct} colors={colors}>
          <RevenueTrendChart
            dailyRevenue={sevenDayRevenue}
            accent={colors.primary}
            colors={colors}
            onPress={() => router.push(SCREEN_ROUTES.exprpt as never)}
          />
          <View style={s.finGrid}>
            <FinancialCell
              label="Cash in Bank"
              value={fmtK(financialEntry.cashInBank)}
              icon="business-outline"
              accent={colors.blue}
              colors={colors}
            />
            <FinancialCell
              label="Cash in Hand"
              value={fmtK(financialEntry.cashInHand)}
              icon="hand-left-outline"
              accent={colors.primary}
              colors={colors}
            />
            <FinancialCell
              label="POS Receipts"
              value={fmtK(financialEntry.posValue)}
              icon="card-outline"
              accent={colors.teal}
              colors={colors}
            />
            <FinancialCell
              label="Debtors"
              value={fmtK(financialEntry.debtsFromCustomers)}
              icon="people-outline"
              accent={colors.amber}
              colors={colors}
            />
            <FinancialCell
              label="Liabilities"
              value={fmtK(financialEntry.liabilities)}
              icon="trending-down-outline"
              accent={colors.coral}
              colors={colors}
            />
            <FinancialCell
              label="In Transit"
              value={fmtK(financialEntry.goodsOnTransit)}
              icon="car-outline"
              accent={colors.purple}
              colors={colors}
            />
          </View>
        </Section>

        {/* ── Budget Status ────────────────────────────────────────── */}
        <Section label="BUDGET STATUS" route={SCREEN_ROUTES.budget} colors={colors}>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {currentBudget ? (
              <>
                <View style={s.budgetHead}>
                  <View>
                    <Text style={[s.budgetLabel, { color: colors.text }]}>{currentBudget.label}</Text>
                    <Text style={[s.budgetSub, { color: colors.textMuted }]}>
                      {currentBudget.status} · by {currentBudget.byName}
                    </Text>
                  </View>
                  <View style={[s.budgetStatus, { backgroundColor: budgetColor + '18', borderColor: budgetColor + '44' }]}>
                    <Text style={[s.budgetStatusText, { color: budgetColor }]}>
                      {budgetPct}% used
                    </Text>
                  </View>
                </View>
                <View style={[s.budgetTrack, { backgroundColor: colors.border }]}>
                  <View style={[s.budgetFill, { width: `${budgetPct}%`, backgroundColor: budgetColor }]} />
                </View>
                <View style={s.budgetFooter}>
                  <Text style={[s.budgetFooterText, { color: colors.textMuted }]}>
                    Spent: {fmtK(budgetSpent)}
                  </Text>
                  <Text style={[s.budgetFooterText, { color: colors.textMuted }]}>
                    Total: {fmtK(currentBudget.total)}
                  </Text>
                </View>

                {/* Per-category bars */}
                {currentBudget.items.length > 0 ? (
                  <View style={[s.budgetItems, { borderTopColor: colors.border }]}>
                    {currentBudget.items.slice(0, 5).map((item: { cat: string; amt: number }, i: number) => (
                      <View key={i} style={s.budgetItem}>
                        <Text style={[s.budgetItemCat, { color: colors.textMuted }]} numberOfLines={1}>{item.cat}</Text>
                        <View style={[s.budgetItemTrack, { backgroundColor: colors.border }]}>
                          <View style={[s.budgetItemFill, {
                            width: currentBudget.total > 0 ? `${Math.min(100, Math.round((item.amt / currentBudget.total) * 100))}%` : '0%',
                            backgroundColor: colors.primary + 'AA',
                          }]} />
                        </View>
                        <Text style={[s.budgetItemAmt, { color: colors.text }]}>{fmtK(item.amt)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <View style={s.emptyState}>
                <Ionicons name="wallet-outline" size={28} color={colors.textSubtle} />
                <Text style={[s.emptyText, { color: colors.textMuted }]}>No budget for this period</Text>
              </View>
            )}
          </View>
        </Section>

        {/* ── Branch Performance ───────────────────────────────────── */}
        <Section label="BRANCH PERFORMANCE" route={SCREEN_ROUTES.branches} colors={colors}>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {branches.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="business-outline" size={28} color={colors.textSubtle} />
                <Text style={[s.emptyText, { color: colors.textMuted }]}>No branches configured</Text>
              </View>
            ) : (
              sortedBranches.map(branch => (
                <BranchBar
                  key={branch.id}
                  name={branch.name}
                  rev={branch.rev}
                  maxRev={maxBranchRev}
                  st={branch.st}
                  colors={colors}
                  onPress={() => router.push(SCREEN_ROUTES.branches as never)}
                />
              ))
            )}
          </View>
        </Section>

        {/* ── Unread Messages ──────────────────────────────────────── */}
        <Section label="UNREAD MESSAGES" route={SCREEN_ROUTES.messages} colors={colors}>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {unreadMessages.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="chatbubble-ellipses-outline" size={28} color={colors.textSubtle} />
                <Text style={[s.emptyText, { color: colors.textMuted }]}>No unread messages</Text>
              </View>
            ) : (
              unreadMessages.map(({ key, msg }) => (
                <MsgRow
                  key={msg.id}
                  msg={msg}
                  from={key.replace(/_/g, ' ')}
                  colors={colors}
                  onPress={() => router.push(SCREEN_ROUTES.messages as never)}
                />
              ))
            )}
          </View>
        </Section>

        {/* ── Reports Awaiting Approval ────────────────────────────── */}
        <Section label="REPORTS PENDING REVIEW" route={SCREEN_ROUTES.exprpt} colors={colors}>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {pendingPumpReports.length === 0 && pendingDeliveries.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="documents-outline" size={28} color={colors.textSubtle} />
                <Text style={[s.emptyText, { color: colors.textMuted }]}>All reports reviewed</Text>
              </View>
            ) : null}

            {pendingPumpReports.slice(0, 5).map(r => (
              <ApprovalRow
                key={r.id}
                icon="speedometer-outline"
                accent={colors.coral}
                title={`${r.pumpName} · ${r.date}`}
                meta={`${r.submittedByName} · ${fmtK(r.grossAmount)} gross · ${r.status.replace(/_/g, ' ')}`}
                onPress={() => router.push(SCREEN_ROUTES.shift as never)}
                colors={colors}
              />
            ))}

            {pendingDeliveries.slice(0, 3).map(d => (
              <ApprovalRow
                key={d.id}
                icon="cube-outline"
                accent={colors.blue}
                title={`${d.prod} delivery · ${d.sup}`}
                meta={`${d.rec.toLocaleString()}${unitForProd(d.prod)} · ${d.approvalStatus?.replace(/_/g, ' ') ?? 'pending'}`}
                onPress={() => router.push(SCREEN_ROUTES.recv as never)}
                colors={colors}
              />
            ))}
          </View>
        </Section>

        {/* ── Quick Actions ────────────────────────────────────────── */}
        <View style={s.quickActions}>
          {[
            { icon: 'water-outline' as const, label: 'Tank Dipping', route: SCREEN_ROUTES.ops, accent: colors.teal },
            { icon: 'bar-chart-outline' as const, label: 'Sales', route: SCREEN_ROUTES.sales, accent: colors.primary },
            { icon: 'receipt-outline' as const, label: 'Expenses', route: SCREEN_ROUTES.exp, accent: colors.amber },
            { icon: 'analytics-outline' as const, label: 'Reports', route: SCREEN_ROUTES.exprpt, accent: colors.purple },
          ].map(({ icon, label, route, accent }) => (
            <TouchableOpacity
              key={label}
              onPress={() => router.push(route as never)}
              activeOpacity={0.78}
              style={[s.quickAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[s.quickActionIcon, { backgroundColor: accent + '18' }]}>
                <Ionicons name={icon} size={20} color={accent} />
              </View>
              <Text style={[s.quickActionLabel, { color: colors.textMuted }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

// ─── styles ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  scroll: { paddingBottom: 32 },

  // hero
  hero: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 22 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start' },
  heroEyebrow: { color: '#7CB89A', fontSize: 9, fontWeight: '800', letterSpacing: 1.6, marginBottom: 6 },
  heroGreeting: { color: '#C8DED0', fontSize: 13, fontWeight: '400' },
  heroName: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  heroDate: { color: '#9BBBA3', fontSize: 11, marginTop: 14 },
  heroNotif: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
  },
  notifBadge: {
    position: 'absolute', top: 7, right: 7,
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  heroPills: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 99, borderWidth: 1,
  },
  heroPillDot: { width: 6, height: 6, borderRadius: 3 },
  heroPillText: { fontSize: 11, fontWeight: '600' },

  // kpi grid
  kpiGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 14, gap: 10, marginTop: 16,
  },
  kpiTile: {
    width: '47.5%', borderRadius: 16, borderWidth: 1,
    padding: 14,
    shadowColor: '#0A4824', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  kpiIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  kpiValue: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  kpiLabel: { fontSize: 10, fontWeight: '600', marginTop: 3 },
  kpiSub: { fontSize: 9, marginTop: 4 },

  // sections
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  sectionMore: { fontSize: 11, fontWeight: '700' },

  // card wrapper
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },

  // approval rows
  approvalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  approvalIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  approvalBody: { flex: 1, minWidth: 0 },
  approvalTitle: { fontSize: 12, fontWeight: '700' },
  approvalMeta: { fontSize: 10, marginTop: 2 },
  approvalRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  countBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  // messages
  msgRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  msgAvatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  msgAvatarText: { fontSize: 12, fontWeight: '800' },
  msgBody: { flex: 1, minWidth: 0 },
  msgTopLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  msgFrom: { fontSize: 12, fontWeight: '700', flex: 1 },
  msgTime: { fontSize: 9, fontWeight: '600' },
  msgPreview: { fontSize: 11, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },

  // branch bars
  branchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  branchLeft: { flex: 1, gap: 5 },
  branchName: { fontSize: 12, fontWeight: '700' },
  branchTrack: { height: 5, borderRadius: 4, overflow: 'hidden' },
  branchFill: { height: '100%', borderRadius: 4 },
  branchRight: { alignItems: 'flex-end', gap: 4 },
  branchRev: { fontSize: 13, fontWeight: '800' },
  statusPip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99 },
  statusPipDot: { width: 5, height: 5, borderRadius: 3 },
  statusPipText: { fontSize: 9, fontWeight: '700' },

  // revenue trend chart
  trendWrap: {
    borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10,
    marginBottom: 10,
  },
  trendHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  trendTitle: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  trendLink: { fontSize: 10, fontWeight: '700' },
  trendEmpty: { fontSize: 10, textAlign: 'center', paddingBottom: 4 },

  // financial grid
  finGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  finCell: {
    width: '31%', borderRadius: 14, borderWidth: 1,
    padding: 12, alignItems: 'flex-start',
  },
  finValue: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  finLabel: { fontSize: 9, fontWeight: '600', marginTop: 3 },

  // budget
  budgetHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 14 },
  budgetLabel: { fontSize: 13, fontWeight: '800' },
  budgetSub: { fontSize: 10, marginTop: 3 },
  budgetStatus: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, borderWidth: 1 },
  budgetStatusText: { fontSize: 11, fontWeight: '700' },
  budgetTrack: { height: 7, borderRadius: 5, overflow: 'hidden', marginHorizontal: 14, marginTop: 12 },
  budgetFill: { height: '100%', borderRadius: 5 },
  budgetFooter: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 14, marginTop: 8 },
  budgetFooterText: { fontSize: 10 },
  budgetItems: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  budgetItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  budgetItemCat: { fontSize: 10, width: 80 },
  budgetItemTrack: { flex: 1, height: 4, borderRadius: 3, overflow: 'hidden' },
  budgetItemFill: { height: '100%', borderRadius: 3 },
  budgetItemAmt: { fontSize: 10, fontWeight: '700', width: 52, textAlign: 'right' },

  // quick actions
  quickActions: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 24,
  },
  quickAction: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    borderRadius: 14, borderWidth: 1, gap: 8,
  },
  quickActionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickActionLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  // empty
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28, gap: 8 },
  emptyText: { fontSize: 12 },
});

function RevenueTrendChart({ dailyRevenue, accent, colors, onPress }: RevenueTrendChartProps) {
  const W = 280;
  const H = 64;
  const PADDING = { top: 6, bottom: 18, left: 4, right: 4 };
  const chartW = W - PADDING.left - PADDING.right;
  const chartH = H - PADDING.top - PADDING.bottom;

  const maxVal = Math.max(...dailyRevenue.map(d => d.value), 1);
  const n = dailyRevenue.length;
  const gap = 4;
  const barW = Math.floor((chartW - gap * (n - 1)) / n);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.78} style={[s.trendWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.trendHeader}>
        <Text style={[s.trendTitle, { color: colors.textMuted }]}>7-DAY REVENUE TREND</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[s.trendLink, { color: accent }]}>View reports</Text>
          <Ionicons name="chevron-forward" size={11} color={accent} />
        </View>
      </View>
      <Svg width={W} height={H} style={{ alignSelf: 'center' }}>
        <G x={PADDING.left} y={PADDING.top}>
          {dailyRevenue.map((d, i) => {
            const barH = maxVal > 0 ? Math.max(2, Math.round((d.value / maxVal) * chartH)) : 2;
            const x = i * (barW + gap);
            const y = chartH - barH;
            const isToday = i === n - 1;
            return (
              <G key={i}>
                <Rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={3}
                  fill={isToday ? accent : accent + '55'}
                />
                <SvgText
                  x={x + barW / 2}
                  y={chartH + 13}
                  fontSize={8}
                  fontWeight={isToday ? '700' : '400'}
                  fill={isToday ? accent : colors.textSubtle}
                  textAnchor="middle"
                >
                  {d.label}
                </SvgText>
              </G>
            );
          })}
        </G>
      </Svg>
      {maxVal <= 1 ? (
        <Text style={[s.trendEmpty, { color: colors.textSubtle }]}>No sales data for this period</Text>
      ) : null}
    </TouchableOpacity>
  );
}
