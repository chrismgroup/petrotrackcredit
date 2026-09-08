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
import { ActionItemsTable } from '@/components/ActionItemsTable';
import { ModalSheet } from '@/components/FormSheet';
import {
  fmt,
  GLOBAL_OVERVIEW_ROLES,
  salesRevenueByBranch,
  businessDateKey,
  calculateAccountsReceivable,
  calculateBusinessMonthRevenue,
  calendarMonthBusinessDateRange,
  isRevenueReportStatus,
  ROLE_LABELS,
  SCREEN_ROUTES,
  calculateDailyOperationalStock,
  calculateDailyStockLogBalance,
  carryForwardApprovedDip,
  dipReadingToLiters,
  unitForProd,
  useBusinessDateKey,
  useApp,
  ACTION_ITEMS_DASHBOARD_ACCESS_ID,
  canViewActionItemsDashboard,
  type Budget,
  type Message,
  type MyFolderFile,
  type PumpDailyReport,
  type StockProduct,
  type ActionItem,
  getActionItemUrgency,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { getDashboardApprovalRoute } from '@/lib/dashboard-approval-routing';
import { findLatestDipForProduct } from '@/lib/dip-helpers';

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

const STOCK_SNAPSHOT_PRODUCTS = ['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil'] as const;
type StockSnapshotProduct = StockProduct;
interface ProductStockSnapshot {
  product: StockSnapshotProduct;
  startupStock: number | null;
  deliveries: number;
  sales: number;
  bookStock: number | null;
  submittedTankDip: number | null;
  dipBusinessDate?: string;
  variance: number | null;
  unit: string;
}
interface BranchStockSnapshot {
  branchId: string | null;
  branchName: string;
  products: ProductStockSnapshot[];
}

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatQuantity(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function folderExpiryDays(expiresAt?: string): number | null {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function folderExpiryState(days: number): { label: string; color: string; background: string; icon: keyof typeof Ionicons.glyphMap } {
  if (days < 0) return { label: 'Expired', color: '#B91C1C', background: '#FEE2E2', icon: 'alert-circle' };
  if (days <= 90) return { label: 'Due within 3 months', color: '#92400E', background: '#FEF3C7', icon: 'time' };
  return { label: 'Valid', color: '#166534', background: '#DCFCE7', icon: 'checkmark-circle' };
}

const FOLDER_SECTION_LABELS: Record<MyFolderFile['section'], string> = {
  compliance: 'Compliance',
  legal: 'Legal',
  minutes: 'Meeting minutes',
  projects: 'Projects',
  correspondences: 'Correspondences',
  general: 'General Library',
};

function DocumentExpiryCard({
  files,
  colors,
  onOpen,
}: {
  files: MyFolderFile[];
  colors: ReturnType<typeof useColors>;
  onOpen: (file: MyFolderFile) => void;
}) {
  const trackedFiles = files
    .filter(file => !file.deletedAt && folderExpiryDays(file.expiresAt) !== null)
    .sort((a, b) => (folderExpiryDays(a.expiresAt) ?? 0) - (folderExpiryDays(b.expiresAt) ?? 0));
  if (trackedFiles.length === 0) return null;

  const expiredCount = trackedFiles.filter(file => (folderExpiryDays(file.expiresAt) ?? 0) < 0).length;
  const dueSoonCount = trackedFiles.filter(file => {
    const days = folderExpiryDays(file.expiresAt) ?? 0;
    return days >= 0 && days <= 90;
  }).length;
  const validCount = trackedFiles.length - expiredCount - dueSoonCount;

  return (
    <Section label="DOCUMENT EXPIRY" colors={colors}>
      <View style={[s.expiryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.expirySummary}>
          {[
            { label: 'Expired', value: expiredCount, color: colors.error, background: colors.errorBg },
            { label: 'Due soon', value: dueSoonCount, color: colors.warning, background: colors.warningBg },
            { label: 'Valid', value: validCount, color: colors.success, background: colors.successBg },
          ].map(item => (
            <View key={item.label} style={[s.expirySummaryItem, { backgroundColor: item.background }]}>
              <Text style={[s.expirySummaryValue, { color: item.color }]}>{item.value}</Text>
              <Text style={[s.expirySummaryLabel, { color: item.color }]}>{item.label}</Text>
            </View>
          ))}
        </View>
        {trackedFiles.slice(0, 8).map(file => {
          const days = folderExpiryDays(file.expiresAt) ?? 0;
          const state = folderExpiryState(days);
          return (
            <TouchableOpacity
              key={file.id}
              onPress={() => onOpen(file)}
              activeOpacity={0.78}
              style={[s.expiryRow, { borderTopColor: colors.border }]}
              accessibilityLabel={`Open ${file.name}`}
            >
              <View style={[s.expiryIcon, { backgroundColor: state.background }]}>
                <Ionicons name={file.documentKind === 'certificate' ? 'ribbon-outline' : 'document-text-outline'} size={17} color={state.color} />
              </View>
              <View style={s.expiryBody}>
                <Text style={[s.expiryName, { color: colors.text }]} numberOfLines={1}>{file.name}</Text>
                <Text style={[s.expiryMeta, { color: colors.textMuted }]}>
                  {FOLDER_SECTION_LABELS[file.section]} · {file.expiresAt}
                </Text>
              </View>
              <View style={s.expiryRight}>
                <View style={[s.expiryStatus, { backgroundColor: state.background }]}>
                  <Ionicons name={state.icon} size={12} color={state.color} />
                  <Text style={[s.expiryStatusText, { color: state.color }]}>{state.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={colors.textSubtle} />
              </View>
            </TouchableOpacity>
          );
        })}
        {trackedFiles.length > 8 ? (
          <TouchableOpacity onPress={() => onOpen(trackedFiles[0])} style={s.expirySeeAll} activeOpacity={0.78}>
            <Text style={[s.expirySeeAllText, { color: colors.primary }]}>Open My Documents</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        ) : null}
      </View>
    </Section>
  );
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

interface ApprovalDetailRecord {
  id: string;
  title: string;
  meta: string;
  status: string;
  statusColor: string;
  facts: string[];
}

function ApprovalDetailsSheet({
  title,
  description,
  records,
  colors,
  onClose,
}: {
  title: string;
  description: string;
  records: ApprovalDetailRecord[];
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
}) {
  return (
    <ModalSheet visible onClose={onClose}>
      <View style={[s.approvalSheet, { backgroundColor: colors.background }]}>
        <View style={[s.approvalSheetHeader, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.approvalSheetEyebrow, { color: colors.primary }]}>APPROVALS & ACTIONS</Text>
            <Text style={[s.approvalSheetTitle, { color: colors.text }]}>{title}</Text>
            <Text style={[s.approvalSheetIntro, { color: colors.textMuted }]}>{description}</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={[s.approvalCloseButton, { backgroundColor: colors.surface }]}
            accessibilityRole="button"
            accessibilityLabel={`Close ${title}`}
          >
            <Ionicons name="close" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.approvalSheetContent}
          showsVerticalScrollIndicator={false}
        >
          {records.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="checkmark-circle-outline" size={32} color={colors.success} />
              <Text style={[s.emptyText, { color: colors.textMuted }]}>No records are available.</Text>
            </View>
          ) : records.map(record => (
            <View key={record.id} style={[s.approvalDetailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={s.approvalDetailTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.approvalDetailTitle, { color: colors.text }]}>{record.title}</Text>
                  <Text style={[s.approvalDetailMeta, { color: colors.textMuted }]}>{record.meta}</Text>
                </View>
                <View style={[s.approvalDetailStatus, { backgroundColor: record.statusColor + '18' }]}>
                  <View style={[s.approvalDetailDot, { backgroundColor: record.statusColor }]} />
                  <Text style={[s.approvalDetailStatusText, { color: record.statusColor }]}>{record.status}</Text>
                </View>
              </View>
              <View style={[s.approvalFacts, { borderTopColor: colors.border }]}>
                {record.facts.map((fact, index) => (
                  <Text key={`${record.id}-fact-${index}`} style={[s.approvalFact, { color: colors.textMuted }]}>
                    {fact}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </ModalSheet>
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
    role, userName, branchId, staffId, userAccess, branches, navItems,
    tanks, lpgTanks, pumps, dips,
    deliveries, maintenance, expenses, budgets,
    financialEntry, priceProposals,
    pumpDailyReports, userAccounts, messages, notifications,
    approveDip, approveExpense,
    approveDelivery, approvePriceProposal,
    sales, startupStocks, stockSnapshotConfig, myFolderFiles, actionItems,
  } = useApp();

  const colors = useColors();
  const router = useRouter();
  const todayKey = useBusinessDateKey();

  const [noteModal, setNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [approvalDetail, setApprovalDetail] = useState<'dips' | 'deliveries' | 'expenses' | 'prices' | 'pumpReports' | 'budgets' | 'accounts' | null>(null);

  if (!role) return null;

  const isApprover = role === 'md' || role === 'admin' || role === 'ceo';
  const canViewRevenue = role === 'admin' || navItems.some(item => item.id === 'revenue');
  // CEO, MD, Accountant and CSM are company-wide overview roles. Their
  // account may still contain a legacy branchId, but it must not narrow
  // their Home KPIs to one branch.
  const isGlobalOverview = role === 'admin' || (role ? GLOBAL_OVERVIEW_ROLES.has(role) : false);
  const scopedBranchId = isGlobalOverview ? null : branchId;
  const accountsReceivable = calculateAccountsReceivable(pumpDailyReports, scopedBranchId);
  const greeting = dayGreeting();
  const dayStamp = new Date().toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  // ── KPIs ──────────────────────────────────────────────────────────────
  const { byBranch: branchRev } = useMemo(() => salesRevenueByBranch(sales), [sales]);
  const currentMonthRange = calendarMonthBusinessDateRange();
  const monthlyRevenue = useMemo(
    () => calculateBusinessMonthRevenue(pumpDailyReports, scopedBranchId, currentMonthRange),
    [pumpDailyReports, scopedBranchId, currentMonthRange.from, currentMonthRange.to],
  );

  const branchStockSnapshots = useMemo<BranchStockSnapshot[]>(() => {
    function dipForProduct(
      record: typeof dips[number] | undefined,
      product: StockSnapshotProduct,
      petrolTanks: typeof tanks,
      branchLpgTanks: typeof lpgTanks,
    ): number | null {
      if (!record) return null;
      const numericReading = (value: unknown): number | null => {
        const reading = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(reading) ? reading : null;
      };
      if (product === 'LPG') {
        const readings = branchLpgTanks
          .map(tank => numericReading(record.lpg?.[tank.id]))
          .filter((reading): reading is number => reading !== null);
        return readings.length > 0 ? readings.reduce((sum, reading) => sum + reading, 0) : null;
      }
      const readings = petrolTanks
        .filter(tank => tank.prod === product)
        .map(tank => {
          const reading = numericReading(record.rd?.[tank.id]);
          return reading === null ? null : dipReadingToLiters(reading);
        })
        .filter((reading): reading is number => reading !== null);
      return readings.length > 0 ? readings.reduce((sum, reading) => sum + reading, 0) : null;
    }

    const hasAssignedStockAssets = (candidateBranchId: string | null | undefined) =>
      Boolean(candidateBranchId) &&
      (tanks.some(tank => tank.branchId === candidateBranchId) ||
        lpgTanks.some(tank => tank.branchId === candidateBranchId)) &&
      pumps.some(pump => pump.branchId === candidateBranchId);

    const branchScopes = branches
      .filter(branch => hasAssignedStockAssets(branch.id))
      .map(branch => ({ branchId: branch.id, branchName: branch.name }));

    const scopes: { branchId: string | null; branchName: string }[] = isGlobalOverview
      ? branchScopes
      : scopedBranchId && hasAssignedStockAssets(scopedBranchId)
        ? [{
            branchId: scopedBranchId,
            branchName: branches.find(branch => branch.id === scopedBranchId)?.name ?? 'My branch',
          }]
        : [];

    return scopes.map(scope => {
      // Only explicitly assigned assets and records belong in a branch
      // snapshot. Unassigned data is intentionally excluded.
      const inScope = (item: { branchId?: string }) => item.branchId === scope.branchId;
      const branchTanks = tanks.filter(inScope);
      const branchLpgTanks = lpgTanks.filter(inScope);
      const enabledProducts = scope.branchId
        ? stockSnapshotConfig.productsByBranch[scope.branchId]
        : undefined;
      const products = STOCK_SNAPSHOT_PRODUCTS
        .filter(product => enabledProducts?.[product] !== false)
        .map(product => {
         const startupRecord = startupStocks.find(stock =>
           stock.product === product &&
           stock.branchId === scope.branchId
          );
          const todayDip = findLatestDipForProduct(
             dips, todayKey, scope.branchId, product, branchTanks, branchLpgTanks,
             { onOrBeforeDate: true },
          );
          const stockBook = calculateDailyOperationalStock(
             startupRecord,
            product,
            scope.branchId,
            deliveries,
            pumpDailyReports,
            todayKey,
            pumps,
          );
        const dipBusinessDate = businessDateKey(todayDip?.dt);
        const approvedDip = dipForProduct(todayDip, product, branchTanks, branchLpgTanks);
        const dipDateBookStock = dipBusinessDate && dipBusinessDate !== todayKey
          ? calculateDailyOperationalStock(
              startupRecord, product, scope.branchId, deliveries, pumpDailyReports, dipBusinessDate, pumps,
            ).bookStock
          : stockBook.bookStock;
        const submittedTankDip = carryForwardApprovedDip(approvedDip, dipDateBookStock, stockBook.bookStock);
        const variance = calculateDailyStockLogBalance(
           stockBook.startupStock,
          stockBook.delivered,
          stockBook.sold,
          submittedTankDip,
        ).variance;

        return {
          product,
           startupStock: stockBook.startupStock,
          deliveries: stockBook.delivered,
          sales: stockBook.sold,
          bookStock: stockBook.bookStock,
          submittedTankDip,
           dipBusinessDate: dipBusinessDate || undefined,
          variance,
          unit: unitForProd(product),
        };
      });

      return { ...scope, products };
    });
  }, [branches, dips, deliveries, isGlobalOverview, lpgTanks, pumps, pumpDailyReports, scopedBranchId, startupStocks, stockSnapshotConfig, tanks, todayKey]);

  // ── Approval items ────────────────────────────────────────────────────
  const inApprovalScope = (item: { branchId?: string }) =>
    isGlobalOverview || !scopedBranchId || !item.branchId || item.branchId === scopedBranchId;
  const isAdmin = role === 'admin';
  const isExecutive = role === 'md' || role === 'ceo';
  const pendingDips = role === 'md' || isAdmin
    ? dips.filter(d => d.status === 'pending' && inApprovalScope(d))
    : [];
  const pendingDeliveries = deliveries.filter(delivery => {
    const status = delivery.approvalStatus;
    if (isAdmin) return status === 'pending' || status === 'pending_acc' || status === 'pending_md' || status === 'returned';
    if (role === 'acc') return status === 'pending' || status === 'pending_acc';
    if (isExecutive) return status === 'pending_md';
    if (role === 'mgr' || role === 'csm') {
      return status === 'returned' && (!delivery.receivedBy || delivery.receivedBy === userName);
    }
    return false;
  });
  const pendingExpenses = expenses.filter(expense => {
    if (isAdmin) return expense.status === 'pending' || expense.status === 'acc_forwarded' || expense.status === 'rejected';
    if (role === 'acc') return expense.status === 'pending' || expense.status === 'rejected';
    if (isExecutive) return expense.status === 'acc_forwarded';
    if (role === 'mgr' || role === 'csm' || role === 'mktg') {
      return expense.status === 'rejected' && (expense.by === role || expense.byName === userName);
    }
    return false;
  });
  const pendingPriceProps = role === 'ceo' || isAdmin
    ? priceProposals.filter(p => p.status === 'pending')
    : [];
  const pendingPumpReports = pumpDailyReports.filter(r =>
    (
      (isAdmin && ['pending_manager', 'pending_accountant', 'returned', 'returned_attendant'].includes(r.status)) ||
      (role === 'mgr' && (r.status === 'pending_manager' || r.status === 'returned')) ||
      (role === 'acc' && r.status === 'pending_accountant') ||
      (role === 'att' && r.status === 'returned_attendant' && r.submittedBy === userName)
    ) &&
    (isGlobalOverview || !scopedBranchId || r.branchId === scopedBranchId || !r.branchId),
  );
  const pendingBudgets = budgets.filter(budget => {
    if (isAdmin) return budget.status === 'submitted' || budget.status === 'acc_forwarded' || budget.status === 'rejected';
    if (role === 'acc') return budget.status === 'submitted' || budget.status === 'rejected';
    if (isExecutive) return budget.status === 'acc_forwarded';
    if (role === 'mgr' || role === 'csm' || role === 'mktg') {
      return budget.status === 'rejected' && (budget.by === role || budget.byName === userName);
    }
    return false;
  });
  const pendingAccounts = userAccounts.filter(a =>
    (role === 'md' && a.status === 'pending_md') ||
    (isAdmin && (a.status === 'pending' || a.status === 'pending_admin')) ||
    (role === 'csm' && a.status === 'pending_md'),
  );
  const shiftApprovalRoute = getDashboardApprovalRoute(
    { shiftReports: pendingPumpReports.length, deliveries: 0 },
    { shift: SCREEN_ROUTES.shift, receiving: SCREEN_ROUTES.recv, reports: SCREEN_ROUTES.exprpt },
    role,
  );
  const pendingReviewRoute = getDashboardApprovalRoute(
    { shiftReports: pendingPumpReports.length, deliveries: pendingDeliveries.length },
    { shift: SCREEN_ROUTES.shift, receiving: SCREEN_ROUTES.recv, reports: SCREEN_ROUTES.exprpt },
    role,
  );
  const primaryApprovalRoute =
    pendingDips.length > 0 ? `${SCREEN_ROUTES.ops}?tab=dip-approvals`
      : pendingDeliveries.length > 0 ? SCREEN_ROUTES.recv
        : pendingExpenses.length > 0 ? SCREEN_ROUTES.exp
          : pendingPriceProps.length > 0 ? SCREEN_ROUTES.prices
            : pendingPumpReports.length > 0 ? shiftApprovalRoute
              : pendingBudgets.length > 0 ? SCREEN_ROUTES.budget
                : pendingAccounts.length > 0 ? SCREEN_ROUTES.users
                  : SCREEN_ROUTES.exprpt;

  const canViewOutstandingActionItems = canViewActionItemsDashboard(role, staffId, userAccess);
  const outstandingActionItems = useMemo(() => {
    if (!canViewOutstandingActionItems) return [] as ActionItem[];
    const urgencyOrder: Record<string, number> = { overdue: 0, 'due-soon': 1, 'on-track': 2 };
    return actionItems
      .filter(item =>
        item.status !== 'closed'
        && (isGlobalOverview || !scopedBranchId || item.branchId === scopedBranchId),
      )
      .sort((a, b) => {
        const urgencyDiff = urgencyOrder[getActionItemUrgency(a.targetDate)] - urgencyOrder[getActionItemUrgency(b.targetDate)];
        if (urgencyDiff !== 0) return urgencyDiff;
        return new Date(`${a.targetDate}T00:00:00`).getTime() - new Date(`${b.targetDate}T00:00:00`).getTime();
      });
  }, [actionItems, canViewOutstandingActionItems, isGlobalOverview, scopedBranchId]);

  const totalApprovals =
    pendingDips.length + pendingDeliveries.length + pendingExpenses.length +
    pendingPriceProps.length + pendingPumpReports.length + pendingBudgets.length +
    pendingAccounts.length;

  const approvalDetailRecords: Record<Exclude<typeof approvalDetail, null>, ApprovalDetailRecord[]> = {
    dips: pendingDips.map(dip => {
      const branchName = branches.find(branch => branch.id === dip.branchId)?.name ?? dip.branchId ?? 'Branch not recorded';
      const readings = [
        ...Object.entries(dip.rd ?? {}).map(([tankId, value]) => `${tanks.find(tank => tank.id === tankId)?.name ?? tankId}: ${value.toLocaleString()} L`),
        ...Object.entries(dip.lpg ?? {}).map(([tankId, value]) => `${lpgTanks.find(tank => tank.id === tankId)?.name ?? tankId}: ${value.toLocaleString()} kg`),
      ];
      return {
        id: `dip-${dip.id}`,
        title: `Tank dip report #${dip.id}`,
        meta: `${dip.dt} · ${dip.by} · ${branchName}`,
        status: 'With MD for approval',
        statusColor: colors.amber,
        facts: [
          `Submitted by: ${dip.by}`,
          readings.length > 0 ? `Readings: ${readings.join(' · ')}` : 'Readings: No tank quantities recorded',
          dip.obs ? `Observation: ${dip.obs}` : 'Observation: None provided',
        ],
      };
    }),
    deliveries: pendingDeliveries.map(delivery => ({
      id: `delivery-${delivery.id}`,
      title: `${delivery.prod} delivery #${delivery.id}`,
      meta: `${delivery.dt} · ${delivery.sup} · ${branches.find(branch => branch.id === delivery.branchId)?.name ?? delivery.branchId ?? 'Branch not recorded'}`,
      status: delivery.approvalStatus === 'pending_md' ? 'With MD for approval' : 'With Accountant for review',
      statusColor: delivery.approvalStatus === 'pending_md' ? colors.amber : colors.blue,
      facts: [
        `Received: ${delivery.rec.toLocaleString()} · Ordered: ${delivery.ord.toLocaleString()}`,
        `Receipt condition: ${delivery.st}`,
        delivery.notes ? `Notes: ${delivery.notes}` : 'Notes: None provided',
      ],
    })),
    expenses: pendingExpenses.map(expense => ({
      id: `expense-${expense.id}`,
      title: expense.cat,
      meta: `${expense.dt} · ${expense.byName}`,
      status: expense.status === 'acc_forwarded' ? 'With MD for approval' : 'With Accountant for review',
      statusColor: expense.status === 'acc_forwarded' ? colors.amber : colors.blue,
      facts: [`Amount: ${fmt(expense.amt)}`, expense.desc || 'No description provided', expense.ref ? `Reference: ${expense.ref}` : 'Reference: None'],
    })),
    prices: pendingPriceProps.map(proposal => ({
      id: `price-${proposal.id}`,
      title: `${proposal.prod} price proposal`,
      meta: `${proposal.proposedAt} · ${proposal.proposedBy}`,
      status: 'With MD for approval',
      statusColor: colors.amber,
      facts: [`Current price: ${fmt(proposal.currentPrice)}`, `Proposed price: ${fmt(proposal.proposedPrice)}`, proposal.note ? `Note: ${proposal.note}` : 'Note: None provided'],
    })),
    pumpReports: pendingPumpReports.map(report => ({
      id: `pump-report-${report.id}`,
      title: `${report.pumpName} · ${report.product}`,
      meta: `${report.date} · ${report.submittedByName} · ${branches.find(branch => branch.id === report.branchId)?.name ?? report.branchId}`,
      status: report.status === 'pending_manager' ? 'With Manager for approval'
        : report.status === 'pending_accountant' ? 'With Accountant for approval'
          : 'Returned to Attendant',
      statusColor: report.status === 'pending_manager' ? colors.amber : report.status === 'pending_accountant' ? colors.blue : colors.error,
      facts: [
        `Meter: ${report.openingMeter.toLocaleString()} → ${report.closingMeter.toLocaleString()}`,
        `Volume: ${report.liters.toLocaleString()} · Gross: ${fmt(report.grossAmount)}`,
        report.note ? `Note: ${report.note}` : 'Note: None provided',
      ],
    })),
    budgets: pendingBudgets.map(budget => ({
      id: `budget-${budget.id}`,
      title: budget.label,
      meta: `${budget.appliesOn ?? `${budget.month}/${budget.year}`} · ${budget.byName}`,
      status: budget.status === 'forwarded' ? 'With MD for approval' : 'With MD for review',
      statusColor: colors.amber,
      facts: [`Total: ${fmt(budget.total)}`, `Line items: ${budget.items.length}`, budget.workflow?.length ? `Last workflow step: ${budget.workflow[budget.workflow.length - 1].action}` : 'No workflow step recorded'],
    })),
    accounts: pendingAccounts.map(account => ({
      id: `account-${account.id}`,
      title: account.empName,
      meta: `${account.jobTitle ?? ROLE_LABELS[account.role ?? 'att'] ?? 'Staff'} · ${account.branchId ?? 'No branch'}`,
      status: account.status === 'pending_admin' ? 'With Admin for activation' : 'With MD for approval',
      statusColor: account.status === 'pending_admin' ? colors.brown : colors.amber,
      facts: [`Username: ${account.username}`, account.dept ? `Department: ${account.dept}` : 'Department: Not provided', `Submitted: ${account.createdAt}`],
    })),
  };

  const approvalDetailConfig = approvalDetail ? {
    dips: { title: 'Tank Dip Readings', description: 'Review the submitted readings and see who currently owns the approval.', records: approvalDetailRecords.dips },
    deliveries: { title: 'Product Deliveries', description: 'Review receipt details and the current approval owner.', records: approvalDetailRecords.deliveries },
    expenses: { title: 'Expense Claims', description: 'Review each claim and see whether it is with the accountant or MD.', records: approvalDetailRecords.expenses },
    prices: { title: 'Price Proposals', description: 'Review proposed fuel price changes and their approval owner.', records: approvalDetailRecords.prices },
    pumpReports: { title: 'Pump Daily Reports', description: 'Review report readings and see whether the report is with the manager or accountant.', records: approvalDetailRecords.pumpReports },
    budgets: { title: 'Budget Submissions', description: 'Review budget totals and their current sign-off owner.', records: approvalDetailRecords.budgets },
    accounts: { title: 'Staff Enrolments', description: 'Review new staff details and their activation owner.', records: approvalDetailRecords.accounts },
  }[approvalDetail] : null;

  // ── Notification badge ────────────────────────────────────────────────
  const unread = notifications.filter(item => !item.read).length;
  const unreadMessages = useMemo(() => {
    const all: { key: string; msg: Message }[] = [];
    for (const [key, thread] of Object.entries(messages)) {
      const peer = key.split('-').find(p => p !== role) ?? key;
      const unreadInThread = (thread as Message[]).filter(m => m.type !== 'alert' && m.to === role && !m.read);
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

  function openFolderFile(file: MyFolderFile) {
    router.push({
      pathname: SCREEN_ROUTES.corp,
      params: { section: file.section, fileId: String(file.id) },
    } as never);
  }

  // ── 7-day revenue trend ───────────────────────────────────────────────
  const sevenDayRevenue = useMemo(() => {
    const days: { label: string; value: number }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayLabel = d.toLocaleDateString('en-NG', { weekday: 'short' }).slice(0, 2);
      const rev = pumpDailyReports
        .filter(report =>
           isRevenueReportStatus(report.status) &&
           businessDateKey(report.date) === iso &&
          (!scopedBranchId || report.branchId === scopedBranchId || !report.branchId),
        )
        .reduce((sum, report) => sum + report.grossAmount, 0);
      days.push({ label: dayLabel, value: rev });
    }
    return days;
  }, [pumpDailyReports, scopedBranchId]);

  // ── Branch sort by rev ────────────────────────────────────────────────
  const sortedBranches = useMemo(
    () => [...branches].sort((a, b) => (branchRev[b.id] ?? 0) - (branchRev[a.id] ?? 0)),
    [branches, branchRev],
  );
  const maxBranchRev = branchRev[sortedBranches[0]?.id ?? ''] ?? 1;

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
              onPress={() => router.push(SCREEN_ROUTES.notifications as never)}
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
              <TouchableOpacity
                onPress={() => router.push(primaryApprovalRoute as never)}
                style={[s.heroPill, { backgroundColor: colors.amber + '28', borderColor: colors.amber + '55' }]}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel={`${totalApprovals} items awaiting approval`}
              >
                <View style={[s.heroPillDot, { backgroundColor: colors.amber }]} />
                <Text style={[s.heroPillText, { color: '#FFE5A0' }]}>{totalApprovals} awaiting approval</Text>
              </TouchableOpacity>
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
          {canViewRevenue ? (
            <KpiTile
              icon="cash-outline"
              label="Revenue This Month"
              value={fmt(monthlyRevenue)}
              accent={colors.primary}
              colors={colors}
              onPress={() => router.push(SCREEN_ROUTES.acct as never)}
            />
          ) : null}
        </View>

        <DocumentExpiryCard files={myFolderFiles} colors={colors} onOpen={openFolderFile} />

        {/* ── Daily stock snapshot ───────────────────────────────────── */}
        <Section label="STOCK SNAPSHOT" route={SCREEN_ROUTES.stockSnapshot} colors={colors}>
            <TouchableOpacity
              style={[s.snapshotCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push(SCREEN_ROUTES.stockSnapshot as never)}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel="Open stock snapshot"
            >
              <View style={[s.snapshotIntro, { backgroundColor: colors.infoBg, borderColor: colors.info + '30' }]}>
                <Ionicons name="analytics-outline" size={16} color={colors.info} />
                    <Text style={[s.snapshotIntroText, { color: colors.textMuted }]}>
                   Latest approved tank dips are carried forward with subsequent deliveries and approved shift sales, keeping current physical stock and variance aligned
                </Text>
              </View>
              {branchStockSnapshots.filter(branchSnapshot => branchSnapshot.products.length > 0).map(branchSnapshot => (
                <View key={branchSnapshot.branchId ?? 'all'} style={s.snapshotBranchGroup}>
                  <View style={[s.snapshotBranchHeader, { borderTopColor: colors.border }]}>
                    <Ionicons name="business-outline" size={14} color={colors.primary} />
                    <Text style={[s.snapshotBranchName, { color: colors.text }]}>{branchSnapshot.branchName}</Text>
                  </View>
                  {branchSnapshot.products.map(snapshot => {
                const statusColor = snapshot.startupStock === null
                  ? colors.amber
                  : snapshot.variance === null
                    ? colors.textMuted
                  : snapshot.variance < 0 ? colors.error : colors.success;
                const statusLabel = snapshot.startupStock === null
                  ? 'Awaiting opening balance'
                  : snapshot.variance === null
                    ? 'Awaiting dip'
                  : snapshot.variance < 0 ? 'Shortage' : snapshot.variance > 0 ? 'Excess' : 'Balanced';
                return (
                  <View key={snapshot.product} style={[s.snapshotRow, { borderTopColor: colors.border }]}>
                    <View style={s.snapshotRowHead}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[s.snapshotProduct, { color: colors.text }]}>{snapshot.product}</Text>
                        {snapshot.dipBusinessDate ? (
                          <Text style={[s.snapshotValueLabel, { color: colors.textMuted }]}>Approved dip: {snapshot.dipBusinessDate}</Text>
                        ) : null}
                      </View>
                      {stockSnapshotConfig.metrics.variance ? (
                        <View style={[s.snapshotStatus, { backgroundColor: statusColor + '18' }]}>
                          <View style={[s.snapshotStatusDot, { backgroundColor: statusColor }]} />
                          <Text style={[s.snapshotStatusText, { color: statusColor }]}>{statusLabel}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={s.snapshotValues}>
                      {stockSnapshotConfig.metrics.startupStock ? (
                        <View style={s.snapshotValue}>
                          <Text style={[s.snapshotValueLabel, { color: colors.textSubtle }]}>Opening qty.</Text>
                          <Text style={[s.snapshotValueText, { color: colors.text }]}>{snapshot.startupStock === null ? '—' : `${formatQuantity(snapshot.startupStock)} ${snapshot.unit}`}</Text>
                        </View>
                      ) : null}
                      {stockSnapshotConfig.metrics.deliveries ? (
                        <View style={s.snapshotValue}>
                          <Text style={[s.snapshotValueLabel, { color: colors.textSubtle }]}>Delivered today</Text>
                          <Text style={[s.snapshotValueText, { color: colors.text }]}>
                            {formatQuantity(snapshot.deliveries)} {snapshot.unit}
                          </Text>
                        </View>
                      ) : null}
                      <View style={s.snapshotValue}>
                           <Text style={[s.snapshotValueLabel, { color: colors.textSubtle }]}>Sold today</Text>
                        <Text style={[s.snapshotValueText, { color: colors.text }]}>
                          {formatQuantity(snapshot.sales)} {snapshot.unit}
                        </Text>
                      </View>
                      {stockSnapshotConfig.metrics.submittedTankDip ? (
                        <View style={s.snapshotValue}>
                          <Text style={[s.snapshotValueLabel, { color: colors.textSubtle }]}>Tank dip qty.</Text>
                          <Text style={[s.snapshotValueText, { color: colors.text }]}>
                            {snapshot.submittedTankDip === null ? '—' : `${formatQuantity(snapshot.submittedTankDip)} ${snapshot.unit}`}
                          </Text>
                        </View>
                      ) : null}
                      {stockSnapshotConfig.metrics.variance ? (
                        <View style={[s.snapshotValue, s.snapshotVarianceValue]}>
                          <Text style={[s.snapshotValueLabel, { color: colors.textSubtle }]}>Variance</Text>
                          <Text style={[s.snapshotValueText, { color: statusColor }]}>
                            {snapshot.variance === null ? '—' : `${snapshot.variance > 0 ? '+' : ''}${formatQuantity(snapshot.variance)} ${snapshot.unit}`}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
                  })}
                </View>
              ))}
            </TouchableOpacity>
        </Section>

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
                onPress={() => router.push(`${SCREEN_ROUTES.ops}?tab=dip-approvals` as never)}
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
                // Expense claims have role-specific actions on the Expenses
                // screen. Open that screen directly so MD lands on the
                // "For Approval" tab instead of a read-only details sheet.
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
                meta={`${pendingPumpReports.length} shift report${pendingPumpReports.length > 1 ? 's' : ''} needing action`}
                count={pendingPumpReports.length}
                onPress={() => router.push(shiftApprovalRoute as never)}
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
                onPress={() => router.push(SCREEN_ROUTES.users as never)}
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

        {canViewOutstandingActionItems ? (
          <Section label="OUTSTANDING ACTION ITEMS" route={SCREEN_ROUTES.actionItems} colors={colors}>
            <View style={[s.actionItemsIntro, { backgroundColor: colors.infoBg, borderColor: colors.info + '30' }]}>
              <Ionicons name="flash-outline" size={15} color={colors.info} />
              <Text style={[s.actionItemsIntroText, { color: colors.textMuted }]}>
                Open follow-ups are sorted by urgency. Red is overdue, yellow is due within two weeks, and green is more than two weeks away.
              </Text>
            </View>
            <ActionItemsTable
              items={outstandingActionItems.slice(0, 8)}
              colors={colors}
              showBranch={isGlobalOverview}
              emptyText="No outstanding action items"
              onRowPress={() => router.push(SCREEN_ROUTES.actionItems as never)}
            />
            {outstandingActionItems.length > 8 ? (
              <TouchableOpacity onPress={() => router.push(SCREEN_ROUTES.actionItems as never)} style={[s.actionItemsSeeAll, { borderColor: colors.border }]} activeOpacity={0.78}>
                <Text style={[s.actionItemsSeeAllText, { color: colors.primary }]}>
                  View all {outstandingActionItems.length} outstanding items
                </Text>
                <Ionicons name="arrow-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            ) : null}
          </Section>
        ) : null}

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
              value={fmtK(accountsReceivable)}
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
          <TouchableOpacity
            style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push(SCREEN_ROUTES.budget as never)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Open budget status"
          >
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
          </TouchableOpacity>
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
                  rev={branchRev[branch.id] ?? 0}
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
        <Section label="REPORTS PENDING REVIEW" route={pendingReviewRoute} colors={colors}>
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
                onPress={() => router.push(shiftApprovalRoute as never)}
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
      {approvalDetailConfig ? (
        <ApprovalDetailsSheet
          title={approvalDetailConfig.title}
          description={approvalDetailConfig.description}
          records={approvalDetailConfig.records}
          colors={colors}
          onClose={() => setApprovalDetail(null)}
        />
      ) : null}
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
  expiryCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  expirySummary: { flexDirection: 'row', gap: 8, padding: 10 },
  expirySummaryItem: { flex: 1, borderRadius: 11, paddingVertical: 8, alignItems: 'center' },
  expirySummaryValue: { fontSize: 18, fontWeight: '800' },
  expirySummaryLabel: { fontSize: 9, fontWeight: '700', marginTop: 2 },
  expiryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  expiryIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  expiryBody: { flex: 1, minWidth: 0 },
  expiryName: { fontSize: 12, fontWeight: '800' },
  expiryMeta: { fontSize: 9, marginTop: 3 },
  expiryRight: { alignItems: 'flex-end', gap: 5, maxWidth: 132 },
  expiryStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 4 },
  expiryStatusText: { fontSize: 9, fontWeight: '800' },
  expirySeeAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12 },
  expirySeeAllText: { fontSize: 11, fontWeight: '800' },

  // card wrapper
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  actionItemsIntro: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 8, paddingHorizontal: 11, paddingVertical: 9,
    borderRadius: 11, borderWidth: 1,
  },
  actionItemsIntroText: { flex: 1, fontSize: 10, fontWeight: '600', lineHeight: 15 },
  actionItemsSeeAll: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionItemsSeeAllText: { fontSize: 11, fontWeight: '800' },
  // stock snapshot
  snapshotCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  snapshotIntro: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 10, paddingHorizontal: 11, paddingVertical: 9,
    borderRadius: 11, borderWidth: 1,
  },
  snapshotIntroText: { flex: 1, fontSize: 10, fontWeight: '600' },
  snapshotBranchGroup: { borderTopWidth: StyleSheet.hairlineWidth },
  snapshotBranchHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  snapshotBranchName: { fontSize: 12, fontWeight: '800' },
  snapshotRow: { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  snapshotRowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  snapshotProduct: { fontSize: 12, fontWeight: '800' },
  snapshotStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99,
  },
  snapshotStatusDot: { width: 6, height: 6, borderRadius: 3 },
  snapshotStatusText: { fontSize: 9, fontWeight: '800' },
  snapshotValues: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  snapshotValue: { width: '48%', minWidth: 0 },
  snapshotVarianceValue: { width: '100%', alignItems: 'flex-start' },
  snapshotValueLabel: { fontSize: 9, fontWeight: '600' },
  snapshotValueText: { fontSize: 11, fontWeight: '800', marginTop: 3 },

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
  approvalSheet: { flex: 1, minHeight: 420, maxHeight: 720 },
  approvalSheetHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 18, paddingTop: 18, paddingBottom: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  approvalSheetEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
  approvalSheetTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.35 },
  approvalSheetIntro: { fontSize: 12, lineHeight: 17, marginTop: 5 },
  approvalCloseButton: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  approvalSheetContent: { padding: 16, paddingBottom: 28, gap: 12 },
  approvalDetailCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  approvalDetailTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  approvalDetailTitle: { fontSize: 14, fontWeight: '800' },
  approvalDetailMeta: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  approvalDetailStatus: {
    maxWidth: 150, flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 99, paddingHorizontal: 9, paddingVertical: 6,
  },
  approvalDetailDot: { width: 6, height: 6, borderRadius: 3 },
  approvalDetailStatusText: { flexShrink: 1, fontSize: 10, fontWeight: '800' },
  approvalFacts: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 10, gap: 6 },
  approvalFact: { fontSize: 11, lineHeight: 16 },

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
