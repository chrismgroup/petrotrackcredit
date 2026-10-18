import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useColors } from '@/hooks/useColors';
import { paymentsApi, type PosShiftSummary } from '@/lib/api';
import { formatKobo, POS_REFRESH_MS, SHIFT_POS_VIEW_ROLES } from '@/lib/pos';

type Props = {
  role: string | null;
  pumpId: string;
  branchId?: string;
  date: string;
  /** Amounts entered on the shift report in naira, for comparison. */
  reportedPos?: number;
  reportedTransfer?: number;
  /** Poll while the shift is still being filled in. */
  live?: boolean;
};

function time(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—';
}

function DiffLine({ label, terminalKobo, reported, colors }: {
  label: string; terminalKobo: number; reported: number; colors: ReturnType<typeof useColors>;
}) {
  const diffKobo = Math.round(reported * 100) - terminalKobo;
  const tone = diffKobo === 0 ? colors.success : colors.error;
  return (
    <View style={styles.diffRow}>
      <Text style={[styles.diffLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.diffValue, { color: tone }]}>
        {diffKobo === 0 ? 'Matches terminal' : `${diffKobo > 0 ? '+' : '−'}${formatKobo(Math.abs(diffKobo))} vs terminal`}
      </Text>
    </View>
  );
}

/** Read-only POS terminal evidence for one shift report (pump + business date). */
export function ShiftPosSummary({ role, pumpId, branchId, date, reportedPos, reportedTransfer, live }: Props) {
  const colors = useColors();
  const allowed = SHIFT_POS_VIEW_ROLES.has(role ?? '');
  const [summary, setSummary] = useState<PosShiftSummary | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    const result = await paymentsApi.shiftSummary({ pumpId, date, branchId });
    if (result) {
      setSummary(result);
      setError(false);
    } else {
      setError(true);
    }
    setLoading(false);
  }, [pumpId, date, branchId]);

  useEffect(() => {
    if (!allowed || !pumpId || !date) return;
    setLoading(true);
    setSummary(null);
    void load();
    if (!live) return;
    const timer = setInterval(() => { void load(); }, POS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [allowed, pumpId, date, live, load]);

  if (!allowed || !pumpId || !date) return null;

  const totals = summary?.totals;
  const hasTerminal = !!summary?.terminals.length;
  const cardNet = totals?.cardNetKobo ?? totals?.cardKobo ?? 0;
  const transferNet = totals?.transferNetKobo ?? totals?.transferKobo ?? 0;

  return (
    <View testID="shift-pos-summary" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: `${colors.primary}18` }]}>
          <Ionicons name="card" size={18} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: colors.text }]}>POS terminal total for this shift</Text>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Reported by the pump's POS terminal · read-only
          </Text>
        </View>
        <TouchableOpacity accessibilityLabel="Refresh POS total" onPress={() => { setLoading(true); void load(); }}>
          <Ionicons name="refresh" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {loading && !summary ? (
        <ActivityIndicator color={colors.primary} />
      ) : error && !summary ? (
        <Text style={[styles.hint, { color: colors.error }]}>POS data is unavailable right now. Tap refresh to try again.</Text>
      ) : summary && totals ? (
        <>
          <Text testID="shift-pos-total" style={[styles.total, { color: colors.text }]}>{formatKobo(totals.netKobo)}</Text>
          {!hasTerminal ? (
            <Text style={[styles.hint, { color: colors.textMuted }]}>No POS terminal is assigned to this pump yet.</Text>
          ) : null}

          <View style={styles.grid}>
            <View style={styles.cell}>
              <Text style={[styles.cellLabel, { color: colors.textMuted }]}>Card (net)</Text>
              <Text style={[styles.cellValue, { color: colors.text }]}>{formatKobo(cardNet)}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={[styles.cellLabel, { color: colors.textMuted }]}>Transfers (net)</Text>
              <Text style={[styles.cellValue, { color: colors.text }]}>{formatKobo(transferNet)}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={[styles.cellLabel, { color: colors.textMuted }]}>Reversals</Text>
              <Text style={[styles.cellValue, { color: colors.text }]}>{formatKobo(totals.reversalKobo)}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={[styles.cellLabel, { color: colors.textMuted }]}>Transactions</Text>
              <Text style={[styles.cellValue, { color: colors.text }]}>
                {totals.count}{totals.failedCount ? ` (${totals.failedCount} failed)` : ''}
              </Text>
            </View>
          </View>

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            First {time(totals.firstAt)} · Last {time(totals.lastAt)}
            {hasTerminal ? ` · ${summary.terminals.map(t => `${t.label} (${t.providerTerminalId}${t.status === 'active' ? '' : ', disabled'})`).join(', ')}` : ''}
          </Text>

          {reportedPos !== undefined || reportedTransfer !== undefined ? (
            <View style={[styles.diffBox, { borderColor: colors.border }]}>
              {reportedPos !== undefined ? <DiffLine label="POS entered" terminalKobo={cardNet} reported={reportedPos} colors={colors} /> : null}
              {reportedTransfer !== undefined ? <DiffLine label="Transfer entered" terminalKobo={transferNet} reported={reportedTransfer} colors={colors} /> : null}
            </View>
          ) : null}

          {summary.transactions.length ? (
            <TouchableOpacity accessibilityRole="button" onPress={() => setExpanded(v => !v)} style={styles.toggle}>
              <Text style={[styles.toggleText, { color: colors.primary }]}>
                {expanded ? 'Hide transactions' : `Show ${summary.transactions.length} transactions`}
              </Text>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
            </TouchableOpacity>
          ) : null}

          {expanded ? summary.transactions.map(tx => (
            <View key={tx.id} testID="shift-pos-row" style={[styles.txRow, { borderColor: colors.border }]}>
              <Ionicons name={tx.method === 'card' ? 'card-outline' : 'swap-horizontal'} size={14} color={colors.textMuted} />
              <Text style={[styles.txText, { color: colors.text }]}>
                {time(tx.occurredAt)} · {tx.method === 'card' ? 'Card' : 'Transfer'}
                {tx.status === 'successful' ? '' : tx.status === 'reversal' ? ' · Reversal' : ' · Failed'}
              </Text>
              <Text style={[styles.txAmount, { color: tx.status === 'successful' ? colors.text : colors.textMuted }]}>
                {tx.status === 'reversal' ? '−' : ''}{formatKobo(tx.amountKobo)}
              </Text>
            </View>
          )) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  title: { fontSize: 14, fontWeight: '800' },
  hint: { fontSize: 12 },
  total: { fontSize: 28, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  cell: { width: '50%', gap: 2 },
  cellLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  cellValue: { fontSize: 14, fontWeight: '700' },
  diffBox: { borderTopWidth: 1, paddingTop: 8, gap: 4 },
  diffRow: { flexDirection: 'row', justifyContent: 'space-between' },
  diffLabel: { fontSize: 12 },
  diffValue: { fontSize: 12, fontWeight: '700' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toggleText: { fontSize: 13, fontWeight: '700' },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 6 },
  txText: { flex: 1, fontSize: 12 },
  txAmount: { fontSize: 12, fontWeight: '700' },
});
