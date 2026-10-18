import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import {
  paymentsApi,
  type PosPaymentMethod,
  type PosTransaction,
  type PosTransactionTotals,
} from '@/lib/api';
import { formatKobo, POS_REFRESH_MS, POS_VIEW_ROLES, rangeStart, type PosRangeKey } from '@/lib/pos';

type RangeKey = PosRangeKey;
const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
];

function Chip({ label, active, onPress, colors }: {
  label: string; active: boolean; onPress: () => void; colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, {
        backgroundColor: active ? colors.primary : colors.surface,
        borderColor: active ? colors.primary : colors.border,
      }]}
    >
      <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function StatCard({ label, value, icon, accent, colors }: {
  label: string; value: string; icon: keyof typeof Ionicons.glyphMap; accent: string; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: `${accent}18` }]}>
        <Ionicons name={icon} size={16} color={accent} />
      </View>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

export default function PosTransactionsScreen() {
  const { role, branches, pumps } = useApp();
  const colors = useColors();
  const [range, setRange] = useState<RangeKey>('today');
  const [branchId, setBranchId] = useState('');
  const [pumpId, setPumpId] = useState('');
  const [method, setMethod] = useState<PosPaymentMethod | ''>('');
  const [transactions, setTransactions] = useState<PosTransaction[]>([]);
  const [totals, setTotals] = useState<PosTransactionTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const branchName = useMemo(() => new Map(branches.map(b => [b.id, b.name])), [branches]);
  const pumpName = useMemo(() => new Map(pumps.map(p => [p.id, p.name])), [pumps]);
  const branchPumps = useMemo(() => pumps.filter(p => p.branchId === branchId), [pumps, branchId]);

  const load = useCallback(async () => {
    const result = await paymentsApi.transactions({
      branchId: branchId || undefined,
      pumpId: pumpId || undefined,
      method: method || undefined,
      from: rangeStart(range).toISOString(),
      limit: 200,
    });
    if (result) {
      setTransactions(result.transactions);
      setTotals(result.totals);
      setError('');
      setLastUpdated(new Date());
    } else {
      setError('Could not load POS transactions. Check your connection and try again.');
    }
    setLoading(false);
  }, [branchId, pumpId, method, range]);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = setInterval(() => { void load(); }, POS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (!POS_VIEW_ROLES.has(role ?? '')) return null;

  const statusTone = (status: PosTransaction['status']) => status === 'successful'
    ? { bg: colors.successBg, fg: colors.success, label: 'Successful' }
    : status === 'reversal'
      ? { bg: colors.warningBg, fg: colors.warning, label: 'Reversal' }
      : { bg: colors.errorBg, fg: colors.error, label: 'Failed' };

  return (
    <ScreenLayout
      title="POS Transactions"
      rightAction={(
        <TouchableOpacity accessibilityLabel="Refresh POS transactions" onPress={() => { setLoading(true); void load(); }}>
          <Ionicons name="refresh" size={22} color={colors.text} />
        </TouchableOpacity>
      )}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { void load(); }} />}
      >
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View style={styles.heroRow}>
            <Ionicons name="card" size={20} color="#fff" />
            <Text style={styles.heroKicker}>Net POS receipts · {RANGES.find(r => r.key === range)?.label}</Text>
          </View>
          <Text style={styles.heroValue}>{totals ? formatKobo(totals.netKobo) : '—'}</Text>
          <Text style={styles.heroHint}>
            Recorded automatically from signed terminal notifications. Attendants cannot edit these entries.
          </Text>
          {lastUpdated ? (
            <Text style={styles.heroHint}>Updated {lastUpdated.toLocaleTimeString('en-NG')} · refreshes every 30s</Text>
          ) : null}
        </View>

        <View style={styles.statsGrid}>
          <StatCard label="Card" value={totals ? formatKobo(totals.cardKobo) : '—'} icon="card-outline" accent={colors.primary} colors={colors} />
          <StatCard label="Transfers" value={totals ? formatKobo(totals.transferKobo) : '—'} icon="swap-horizontal" accent={colors.info} colors={colors} />
          <StatCard label="Reversals" value={totals ? formatKobo(totals.reversalKobo) : '—'} icon="return-down-back" accent={colors.warning} colors={colors} />
          <StatCard label="Failed attempts" value={totals ? String(totals.failedCount) : '—'} icon="close-circle-outline" accent={colors.error} colors={colors} />
        </View>

        <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Period</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {RANGES.map(r => <Chip key={r.key} label={r.label} active={range === r.key} onPress={() => setRange(r.key)} colors={colors} />)}
        </ScrollView>

        {branches.length > 1 ? (
          <>
            <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Branch</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip label="All branches" active={!branchId} onPress={() => { setBranchId(''); setPumpId(''); }} colors={colors} />
              {branches.map(b => (
                <Chip key={b.id} label={b.name} active={branchId === b.id} onPress={() => { setBranchId(b.id); setPumpId(''); }} colors={colors} />
              ))}
            </ScrollView>
          </>
        ) : null}

        {branchId && branchPumps.length ? (
          <>
            <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Pump</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip label="All pumps" active={!pumpId} onPress={() => setPumpId('')} colors={colors} />
              {branchPumps.map(p => <Chip key={p.id} label={p.name} active={pumpId === p.id} onPress={() => setPumpId(p.id)} colors={colors} />)}
            </ScrollView>
          </>
        ) : null}

        <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Payment type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All" active={!method} onPress={() => setMethod('')} colors={colors} />
          <Chip label="Card" active={method === 'card'} onPress={() => setMethod('card')} colors={colors} />
          <Chip label="Transfer" active={method === 'transfer'} onPress={() => setMethod('transfer')} colors={colors} />
        </ScrollView>

        {error ? (
          <View style={[styles.notice, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
            <Text style={{ color: colors.error }}>{error}</Text>
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Transactions {totals ? `(${totals.count})` : ''}
        </Text>

        {loading && !transactions.length ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : !transactions.length ? (
          <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="hardware-chip-outline" size={28} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No POS transactions in this period</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Transactions appear here once a terminal is registered to a pump in POS Terminals and the provider sends its notifications.
            </Text>
          </View>
        ) : transactions.map(tx => {
          const tone = statusTone(tx.status);
          return (
            <View key={tx.id} testID="pos-transaction-row" style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.rowIcon, { backgroundColor: `${tx.method === 'card' ? colors.primary : colors.info}18` }]}>
                <Ionicons name={tx.method === 'card' ? 'card-outline' : 'swap-horizontal'} size={18} color={tx.method === 'card' ? colors.primary : colors.info} />
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={[styles.rowAmount, { color: colors.text }]}>
                    {tx.status === 'reversal' ? '−' : ''}{formatKobo(tx.amountKobo)}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.badgeText, { color: tone.fg }]}>{tone.label}</Text>
                  </View>
                </View>
                <Text style={[styles.rowMeta, { color: colors.textMuted }]}>
                  {tx.method === 'card' ? 'Card' : 'Transfer'} · {tx.terminalLabel ?? tx.providerTerminalId ?? 'Unknown terminal'}
                  {tx.pumpId ? ` · ${pumpName.get(tx.pumpId) ?? tx.pumpId}` : ''}
                  {` · ${branchName.get(tx.branchId) ?? tx.branchId}`}
                </Text>
                <Text style={[styles.rowMeta, { color: colors.textSubtle }]}>
                  {new Date(tx.occurredAt).toLocaleString('en-NG')} · Ref {tx.metadata?.reference ?? tx.providerTransactionId}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 10 },
  hero: { borderRadius: 18, padding: 18, gap: 6 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroKicker: { color: '#E5F1E9', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  heroValue: { color: '#fff', fontSize: 32, fontWeight: '800' },
  heroHint: { color: '#CFE3D6', fontSize: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 },
  statIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 12, fontWeight: '600' },
  statValue: { fontSize: 17, fontWeight: '800' },
  filterLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 4 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },
  notice: { borderWidth: 1, borderRadius: 12, padding: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginTop: 8 },
  empty: { borderWidth: 1, borderRadius: 14, padding: 20, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptyText: { fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12 },
  rowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowAmount: { fontSize: 16, fontWeight: '800' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  rowMeta: { fontSize: 12 },
});
