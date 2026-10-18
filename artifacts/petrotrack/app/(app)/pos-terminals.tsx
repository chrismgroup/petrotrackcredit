import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { paymentsApi, type PosPaymentMethod, type PosProviderStatus, type PosTerminal } from '@/lib/api';
import { nairaToKobo } from '@/lib/pos';

type Colors = ReturnType<typeof useColors>;

function Chip({ label, active, onPress, disabled, colors }: {
  label: string; active: boolean; onPress: () => void; disabled?: boolean; colors: Colors;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, {
        backgroundColor: active ? colors.primary : colors.surface,
        borderColor: active ? colors.primary : colors.border,
        opacity: disabled ? 0.45 : 1,
      }]}
    >
      <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TestPayment({ terminal, colors, onSent }: { terminal: PosTerminal; colors: Colors; onSent: () => void }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PosPaymentMethod>('card');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const amountKobo = nairaToKobo(amount);
    if (!amountKobo) {
      setMessage('Enter an amount in naira, e.g. 15000');
      return;
    }
    setBusy(true);
    const result = await paymentsApi.simulate({ terminalId: terminal.id, method, amountKobo });
    setBusy(false);
    if (!result || result.error) {
      setMessage(result?.error ?? 'Could not reach the server.');
      return;
    }
    setAmount('');
    setMessage('Simulated notification recorded. It now appears in POS Transactions.');
    onSent();
  };

  return (
    <View style={[styles.testBox, { borderColor: colors.border }]}>
      <Text style={[styles.testTitle, { color: colors.textMuted }]}>Simulate a POS notification (no money moves)</Text>
      <View style={styles.inline}>
        <Chip label="Card" active={method === 'card'} onPress={() => setMethod('card')} colors={colors} />
        <Chip label="Transfer" active={method === 'transfer'} onPress={() => setMethod('transfer')} colors={colors} />
      </View>
      <View style={styles.inline}>
        <TextInput
          accessibilityLabel={`Test amount for ${terminal.label}`}
          value={amount}
          onChangeText={setAmount}
          placeholder="Amount (₦)"
          placeholderTextColor={colors.textSubtle}
          keyboardType="decimal-pad"
          style={[styles.input, styles.flex, { borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.background }]}
        />
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          onPress={() => { void send(); }}
          style={[styles.smallBtn, { backgroundColor: colors.info }]}
        >
          <Text style={styles.smallBtnText}>{busy ? 'Sending…' : 'Send'}</Text>
        </TouchableOpacity>
      </View>
      {message ? <Text style={[styles.help, { color: colors.textMuted }]}>{message}</Text> : null}
    </View>
  );
}

export default function PosTerminalsScreen() {
  const { role, branches, pumps } = useApp();
  const colors = useColors();
  const [terminals, setTerminals] = useState<PosTerminal[]>([]);
  const [providers, setProviders] = useState<PosProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [provider, setProvider] = useState('');
  const [providerTerminalId, setProviderTerminalId] = useState('');
  const [label, setLabel] = useState('');
  const [branchId, setBranchId] = useState('');
  const [pumpId, setPumpId] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState('');

  const branchName = useMemo(() => new Map(branches.map(b => [b.id, b.name])), [branches]);
  const pumpName = useMemo(() => new Map(pumps.map(p => [p.id, p.name])), [pumps]);
  const pumpsWithActiveTerminal = useMemo(
    () => new Set(terminals.filter(t => t.status === 'active').map(t => `${t.branchId}::${t.pumpId}`)),
    [terminals],
  );
  const branchPumps = useMemo(() => pumps.filter(p => p.branchId === branchId), [pumps, branchId]);

  const load = useCallback(async () => {
    const [terminalResult, configResult] = await Promise.all([paymentsApi.terminals(), paymentsApi.config()]);
    if (terminalResult) {
      setTerminals(terminalResult.terminals);
      setLoadError('');
    } else {
      setLoadError('Could not load terminals. Check your connection and try again.');
    }
    if (configResult) {
      setProviders(configResult.providers);
      setProvider(current => current || configResult.providers.find(p => p.ready)?.id || '');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (role !== 'admin') return null;

  const register = async () => {
    setFormError('');
    if (!provider) return setFormError('Choose a provider that is ready.');
    if (!providerTerminalId.trim()) return setFormError('Enter the terminal ID printed on the POS.');
    if (!label.trim()) return setFormError('Enter a label, e.g. "Pump 2 POS".');
    if (!branchId) return setFormError('Choose a branch.');
    if (!pumpId) return setFormError('Choose the pump this terminal serves.');
    setSaving(true);
    const result = await paymentsApi.registerTerminal({
      provider, providerTerminalId: providerTerminalId.trim(), label: label.trim(), branchId, pumpId,
    });
    setSaving(false);
    if (!result || result.error) return setFormError(result?.error ?? 'Could not reach the server.');
    setProviderTerminalId('');
    setLabel('');
    setPumpId('');
    void load();
  };

  const disable = async (id: string) => {
    if (confirmDisable !== id) {
      setConfirmDisable(id);
      return;
    }
    setConfirmDisable('');
    const result = await paymentsApi.disableTerminal(id);
    if (!result || result.error) setLoadError(result?.error ?? 'Could not disable the terminal.');
    void load();
  };

  const ready = providers.filter(p => p.ready);

  return (
    <ScreenLayout title="POS Terminals">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View style={styles.inline}>
            <Ionicons name="hardware-chip" size={20} color="#fff" />
            <Text style={styles.heroKicker}>One terminal per pump</Text>
          </View>
          <Text style={styles.heroText}>
            Each POS terminal gets a Petrotrack UUID and is assigned to exactly one pump. Petrotrack never processes payments: the POS provider
            does. Petrotrack only records what the terminal reports, against that pump and branch.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Provider status</Text>
          {providers.map(p => (
            <View key={p.id} style={styles.providerRow}>
              <Ionicons name={p.ready ? 'checkmark-circle' : 'time-outline'} size={18} color={p.ready ? colors.success : colors.textMuted} />
              <Text style={[styles.providerText, { color: colors.text }]}>{p.label}</Text>
              <Text style={[styles.help, { color: p.ready ? colors.success : colors.textMuted }]}>
                {p.ready ? 'Ready' : p.id === 'moniepoint' ? 'Awaiting Moniepoint webhook docs' : 'Not enabled on this server'}
              </Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Register a terminal</Text>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Provider</Text>
          <View style={styles.wrap}>
            {providers.map(p => (
              <Chip key={p.id} label={p.label} active={provider === p.id} disabled={!p.ready} onPress={() => setProvider(p.id)} colors={colors} />
            ))}
          </View>
          {!ready.length && !loading ? (
            <Text style={[styles.help, { color: colors.textMuted }]}>No provider is enabled yet, so terminals cannot be registered.</Text>
          ) : null}

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Terminal ID (from the POS)</Text>
          <TextInput
            accessibilityLabel="Terminal ID"
            value={providerTerminalId}
            onChangeText={setProviderTerminalId}
            autoCapitalize="characters"
            placeholder="e.g. 2KUD0001"
            placeholderTextColor={colors.textSubtle}
            style={[styles.input, { borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.background }]}
          />

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Label</Text>
          <TextInput
            accessibilityLabel="Terminal label"
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Pump 2 POS"
            placeholderTextColor={colors.textSubtle}
            style={[styles.input, { borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.background }]}
          />

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Branch</Text>
          <View style={styles.wrap}>
            {branches.map(b => (
              <Chip key={b.id} label={b.name} active={branchId === b.id} onPress={() => { setBranchId(b.id); setPumpId(''); }} colors={colors} />
            ))}
            {!branches.length ? <Text style={[styles.help, { color: colors.textMuted }]}>Add a branch first.</Text> : null}
          </View>

          {branchId ? (
            <>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Pump</Text>
              <View style={styles.wrap}>
                {branchPumps.map(p => {
                  const taken = pumpsWithActiveTerminal.has(`${branchId}::${p.id}`);
                  return (
                    <Chip
                      key={p.id}
                      label={taken ? `${p.name} (has POS)` : p.name}
                      active={pumpId === p.id}
                      disabled={taken}
                      onPress={() => setPumpId(p.id)}
                      colors={colors}
                    />
                  );
                })}
                {!branchPumps.length ? <Text style={[styles.help, { color: colors.textMuted }]}>This branch has no pumps yet.</Text> : null}
              </View>
            </>
          ) : null}

          {formError ? <Text style={[styles.help, { color: colors.error }]}>{formError}</Text> : null}
          <TouchableOpacity
            accessibilityRole="button"
            disabled={saving}
            onPress={() => { void register(); }}
            style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
          >
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>{saving ? 'Registering…' : 'Register terminal'}</Text>
          </TouchableOpacity>
        </View>

        {loadError ? (
          <View style={[styles.card, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
            <Text style={{ color: colors.error }}>{loadError}</Text>
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Terminals ({terminals.length})</Text>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {terminals.map(t => (
          <View key={t.id} testID="pos-terminal-row" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.terminalTop}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t.label}</Text>
              <View style={[styles.badge, { backgroundColor: t.status === 'active' ? colors.successBg : colors.errorBg }]}>
                <Text style={[styles.badgeText, { color: t.status === 'active' ? colors.success : colors.error }]}>
                  {t.status === 'active' ? 'Active' : 'Disabled'}
                </Text>
              </View>
            </View>
            <Text style={[styles.help, { color: colors.textMuted }]}>
              {branchName.get(t.branchId) ?? t.branchId} · {t.pumpId ? pumpName.get(t.pumpId) ?? t.pumpId : 'No pump'} · {t.provider} {t.providerTerminalId}
            </Text>
            <Text selectable style={[styles.uuid, { color: colors.textSubtle }]}>UUID {t.id}</Text>
            {t.status === 'active' ? (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => { void disable(t.id); }}
                style={[styles.outlineBtn, { borderColor: colors.errorBorder }]}
              >
                <Text style={{ color: colors.error, fontWeight: '700' }}>
                  {confirmDisable === t.id ? 'Tap again to confirm' : 'Disable terminal'}
                </Text>
              </TouchableOpacity>
            ) : null}
            {t.status === 'active' && t.provider === 'sandbox' && providers.some(p => p.id === 'sandbox' && p.ready) ? (
              <TestPayment terminal={t} colors={colors} onSent={() => { void load(); }} />
            ) : null}
          </View>
        ))}
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  hero: { borderRadius: 18, padding: 18, gap: 8 },
  heroKicker: { color: '#E5F1E9', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  heroText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  providerText: { flex: 1, fontSize: 14, fontWeight: '600' },
  fieldLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  help: { fontSize: 12 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 12, marginTop: 6 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  terminalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  uuid: { fontSize: 11, fontFamily: 'monospace' },
  outlineBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  testBox: { borderTopWidth: 1, paddingTop: 10, gap: 8 },
  testTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  smallBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 },
  smallBtnText: { color: '#fff', fontWeight: '800' },
});
