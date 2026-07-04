import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const PUMPS = ['Pump #1 PMS', 'Pump #2 PMS', 'Pump #3 AGO', 'Pump #4 DPK', 'LPG Pump'];
const PUMP_PRODS: Record<string, string> = { 'Pump #1 PMS': 'PMS', 'Pump #2 PMS': 'PMS', 'Pump #3 AGO': 'AGO', 'Pump #4 DPK': 'DPK', 'LPG Pump': 'LPG' };

export default function SalesScreen() {
  const { role, sales, addSales, prices, userName } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'att'] || colors.primary;
  const canRecord = role === 'att' || role === 'mgr' || role === 'admin';

  const [pump, setPump] = useState(PUMPS[0]);
  const [openMeter, setOpenMeter] = useState('');
  const [closeMeter, setCloseMeter] = useState('');
  const [showForm, setShowForm] = useState(false);

  const todaySales = sales.filter(s => s.dt.startsWith(new Date().toISOString().slice(0, 10)));
  const totalL = todaySales.reduce((s, e) => s + e.L, 0);
  const totalAmt = todaySales.reduce((s, e) => s + e.L * e.price, 0);

  function handleSubmit() {
    const open = parseFloat(openMeter);
    const close = parseFloat(closeMeter);
    if (isNaN(open) || isNaN(close) || close <= open) {
      Alert.alert('Error', 'Closing meter must be greater than opening meter.');
      return;
    }
    const L = Math.round(close - open);
    const prod = PUMP_PRODS[pump] || 'PMS';
    const price = (prices as any)[prod] || 830;
    addSales({ pump, by: userName, L, price, dt: new Date().toISOString() });
    setOpenMeter(''); setCloseMeter('');
    setShowForm(false);
    Alert.alert('Sales Recorded', `${L.toLocaleString()}L of ${prod} — ${fmt(L * price)}`);
  }

  const pmsSales = todaySales.filter(s => s.pump.includes('PMS'));
  const agoSales = todaySales.filter(s => s.pump.includes('AGO'));
  const dkpSales = todaySales.filter(s => s.pump.includes('DPK'));

  return (
    <ScreenLayout title="Sales"
      rightAction={canRecord ? (
        <TouchableOpacity onPress={() => setShowForm(f => !f)} style={[styles.headerBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <Ionicons name={showForm ? 'close' : 'add'} size={20} color="#fff" />
        </TouchableOpacity>
      ) : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { backgroundColor: roleColor + '12', borderColor: roleColor + '33' }]}>
            <Text style={[styles.metricValue, { color: roleColor }]}>{fmt(totalAmt)}</Text>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Today's Revenue</Text>
          </View>
          <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.metricValue, { color: colors.text }]}>{totalL.toLocaleString()} L</Text>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Volume Sold</Text>
          </View>
          <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.metricValue, { color: colors.text }]}>{todaySales.length}</Text>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Entries</Text>
          </View>
        </View>

        <View style={styles.prodRow}>
          {[
            { label: 'PMS', L: pmsSales.reduce((s, e) => s + e.L, 0), color: colors.primary },
            { label: 'AGO', L: agoSales.reduce((s, e) => s + e.L, 0), color: colors.blue },
            { label: 'DPK', L: dkpSales.reduce((s, e) => s + e.L, 0), color: colors.amber },
          ].map(p => (
            <View key={p.label} style={[styles.prodCard, { backgroundColor: p.color + '12', borderColor: p.color + '33' }]}>
              <Text style={[styles.prodLabel, { color: p.color }]}>{p.label}</Text>
              <Text style={[styles.prodL, { color: colors.text }]}>{p.L.toLocaleString()}L</Text>
            </View>
          ))}
        </View>

        {showForm && canRecord && (
          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.formTitle, { color: colors.text }]}>Record Sales Entry</Text>
            <Text style={[styles.formLabel, { color: colors.textMuted }]}>Select Pump</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {PUMPS.map(p => (
                  <TouchableOpacity key={p} onPress={() => setPump(p)} style={[styles.pumpBtn, { backgroundColor: pump === p ? roleColor : colors.background, borderColor: pump === p ? roleColor : colors.border }]}>
                    <Text style={{ color: pump === p ? '#fff' : colors.textMuted, fontSize: 11, fontWeight: '600' }}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={styles.inputRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.formLabel, { color: colors.textMuted }]}>Opening Meter (L)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="numeric"
                  value={openMeter}
                  onChangeText={setOpenMeter}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.formLabel, { color: colors.textMuted }]}>Closing Meter (L)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="numeric"
                  value={closeMeter}
                  onChangeText={setCloseMeter}
                />
              </View>
            </View>
            {openMeter && closeMeter && parseFloat(closeMeter) > parseFloat(openMeter) && (
              <View style={[styles.calcPreview, { backgroundColor: roleColor + '12', borderColor: roleColor + '33' }]}>
                <Text style={[styles.calcText, { color: roleColor }]}>
                  {(parseFloat(closeMeter) - parseFloat(openMeter)).toFixed(0)}L · {fmt((parseFloat(closeMeter) - parseFloat(openMeter)) * ((prices as any)[PUMP_PRODS[pump]] || 830))}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleSubmit} activeOpacity={0.85}>
                <Text style={styles.submitBtnText}>Record Sales</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1, borderColor: colors.border }]} onPress={() => setShowForm(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Sales Log</Text>
        {sales.slice().reverse().map(entry => {
          const amt = entry.L * entry.price;
          return (
            <View key={entry.id} style={[styles.entryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.entryHeader}>
                <View>
                  <Text style={[styles.entryPump, { color: colors.text }]}>{entry.pump}</Text>
                  <Text style={[styles.entryMeta, { color: colors.textMuted }]}>by {entry.by} · {fmtDateTime(entry.dt)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.entryAmt, { color: roleColor }]}>{fmt(amt)}</Text>
                  <Text style={[styles.entryL, { color: colors.textMuted }]}>{entry.L.toLocaleString()}L @ ₦{entry.price}/L</Text>
                </View>
              </View>
            </View>
          );
        })}
        <View style={{ height: 16 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metricCard: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1 },
  metricValue: { fontSize: 16, fontWeight: '700' },
  metricLabel: { fontSize: 11, marginTop: 2 },
  prodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  prodCard: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  prodLabel: { fontSize: 12, fontWeight: '700' },
  prodL: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  formCard: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  formTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  formLabel: { fontSize: 11, marginBottom: 4 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  pumpBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  calcPreview: { padding: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center', marginTop: 6 },
  calcText: { fontSize: 15, fontWeight: '700' },
  submitBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12 },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  entryCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  entryPump: { fontSize: 14, fontWeight: '600' },
  entryMeta: { fontSize: 11, marginTop: 2 },
  entryAmt: { fontSize: 16, fontWeight: '700' },
  entryL: { fontSize: 11, marginTop: 2 },
  headerBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
