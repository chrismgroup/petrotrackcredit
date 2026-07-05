import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function SalesScreen() {
  const { role, sales, addSales, prices, userName, pumps } = useApp();
  const activePumps = pumps.filter(p => p.active);
  const PUMP_PRODS = Object.fromEntries(activePumps.map(p => [p.name, p.prod]));
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'att'] || colors.primary;
  const canRecord = role === 'att' || role === 'mgr' || role === 'admin';
  const isAtt = role === 'att';

  const [pump, setPump] = useState(() => activePumps[0]?.name || '');
  const [openMeter, setOpenMeter] = useState('');
  const [closeMeter, setCloseMeter] = useState('');
  const [posAmt, setPosAmt] = useState('');
  const [showForm, setShowForm] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter(s => s.dt.startsWith(today));
  const totalL = todaySales.reduce((s, e) => s + e.L, 0);
  const totalAmt = todaySales.reduce((s, e) => s + e.L * e.price, 0);
  const totalPOS = todaySales.reduce((s, e) => s + (e.pos || 0), 0);
  const totalCash = totalAmt - totalPOS;

  const pmsSales = todaySales.filter(s => s.pump.includes('PMS'));
  const agoSales = todaySales.filter(s => s.pump.includes('AGO'));
  const dkpSales = todaySales.filter(s => s.pump.includes('DPK'));

  const openVal = parseFloat(openMeter);
  const closeVal = parseFloat(closeMeter);
  const liters = (!isNaN(openVal) && !isNaN(closeVal) && closeVal > openVal) ? Math.round(closeVal - openVal) : 0;
  const prod = PUMP_PRODS[pump] || 'PMS';
  const unitPrice = (prices as any)[prod] || 830;
  const saleAmt = liters * unitPrice;
  const posVal = parseFloat(posAmt.replace(/,/g, '')) || 0;
  const cashAmt = saleAmt - posVal;

  function handleSubmit() {
    if (!liters || liters <= 0) {
      Alert.alert('Error', 'Closing meter must be greater than opening meter.');
      return;
    }
    if (posVal < 0 || posVal > saleAmt) {
      Alert.alert('Error', `POS amount cannot exceed total sale of ${fmt(saleAmt)}.`);
      return;
    }
    addSales({ pump, by: userName, L: liters, price: unitPrice, dt: new Date().toISOString(), pos: posVal > 0 ? posVal : undefined });
    setOpenMeter(''); setCloseMeter(''); setPosAmt('');
    setShowForm(false);
    const parts = [`${liters.toLocaleString()}L of ${prod}`, `Total: ${fmt(saleAmt)}`];
    if (posVal > 0) {
      parts.push(`POS: ${fmt(posVal)}`, `Cash: ${fmt(saleAmt - posVal)}`);
    }
    Alert.alert('Sales Recorded', parts.join('\n'));
  }

  return (
    <ScreenLayout
      title="Sales"
      rightAction={canRecord ? (
        <TouchableOpacity onPress={() => setShowForm(f => !f)} style={[styles.headerBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <Ionicons name={showForm ? 'close' : 'add'} size={20} color="#fff" />
        </TouchableOpacity>
      ) : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Summary metrics */}
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

        {/* Cash vs POS breakdown — shown when there are POS transactions */}
        {totalPOS > 0 && (
          <View style={[styles.cashPosCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cashPosTitle, { color: colors.text }]}>Today's Payment Breakdown</Text>
            <View style={styles.cashPosRow}>
              <View style={[styles.cashPosItem, { backgroundColor: '#27500A' + '12', borderColor: '#27500A' + '33' }]}>
                <Ionicons name="cash-outline" size={16} color="#27500A" />
                <Text style={[styles.cashPosValue, { color: '#27500A' }]}>{fmt(totalCash)}</Text>
                <Text style={[styles.cashPosLabel, { color: colors.textMuted }]}>Cash Collected</Text>
              </View>
              <View style={[styles.cashPosItem, { backgroundColor: '#185FA5' + '12', borderColor: '#185FA5' + '33' }]}>
                <Ionicons name="card-outline" size={16} color="#185FA5" />
                <Text style={[styles.cashPosValue, { color: '#185FA5' }]}>{fmt(totalPOS)}</Text>
                <Text style={[styles.cashPosLabel, { color: colors.textMuted }]}>POS / Transfer</Text>
              </View>
            </View>
            <View style={[styles.posBar, { backgroundColor: colors.border }]}>
              <View style={[styles.posBarCash, { flex: totalCash, backgroundColor: '#27500A' }]} />
              <View style={[styles.posBarPos, { flex: totalPOS, backgroundColor: '#185FA5' }]} />
            </View>
            <Text style={[styles.posBarLabel, { color: colors.textSubtle }]}>
              Cash {totalAmt > 0 ? Math.round((totalCash / totalAmt) * 100) : 0}% · POS {totalAmt > 0 ? Math.round((totalPOS / totalAmt) * 100) : 0}%
            </Text>
          </View>
        )}

        {/* Product breakdown */}
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

        {/* Sales recording form */}
        {showForm && canRecord && (
          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.formTitle, { color: colors.text }]}>Record Sales Entry</Text>

            <Text style={[styles.formLabel, { color: colors.textMuted }]}>Select Pump</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {activePumps.map(p => (
                  <TouchableOpacity key={p.name} onPress={() => setPump(p.name)} style={[styles.pumpBtn, { backgroundColor: pump === p.name ? roleColor : colors.background, borderColor: pump === p.name ? roleColor : colors.border }]}>
                    <Text style={{ color: pump === p.name ? '#fff' : colors.textMuted, fontSize: 11, fontWeight: '600' }}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.inputRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.formLabel, { color: colors.textMuted }]}>Opening Meter (L)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                  placeholder="0.00" placeholderTextColor={colors.textSubtle}
                  keyboardType="numeric" value={openMeter} onChangeText={setOpenMeter}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.formLabel, { color: colors.textMuted }]}>Closing Meter (L)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                  placeholder="0.00" placeholderTextColor={colors.textSubtle}
                  keyboardType="numeric" value={closeMeter} onChangeText={setCloseMeter}
                />
              </View>
            </View>

            {/* POS Amount field */}
            <Text style={[styles.formLabel, { color: colors.textMuted }]}>POS / Transfer Amount (₦) — optional</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: posVal > saleAmt && saleAmt > 0 ? colors.error : colors.inputBorder, color: colors.text }]}
              placeholder="Enter POS or bank transfer amount, leave 0 for full cash"
              placeholderTextColor={colors.textSubtle}
              keyboardType="numeric" value={posAmt} onChangeText={setPosAmt}
            />

            {/* Live calculation preview */}
            {liters > 0 && (
              <View style={[styles.calcPreview, { backgroundColor: roleColor + '10', borderColor: roleColor + '30' }]}>
                <View style={styles.calcRow}>
                  <Text style={[styles.calcLabel, { color: colors.textMuted }]}>Volume</Text>
                  <Text style={[styles.calcValue, { color: colors.text }]}>{liters.toLocaleString()} L</Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={[styles.calcLabel, { color: colors.textMuted }]}>Total Sale</Text>
                  <Text style={[styles.calcValue, { color: roleColor }]}>{fmt(saleAmt)}</Text>
                </View>
                {posVal > 0 && (
                  <>
                    <View style={[styles.calcDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.calcRow}>
                      <View style={styles.calcLabelRow}>
                        <Ionicons name="card-outline" size={12} color="#185FA5" />
                        <Text style={[styles.calcLabel, { color: '#185FA5' }]}>POS / Transfer</Text>
                      </View>
                      <Text style={[styles.calcValue, { color: '#185FA5' }]}>− {fmt(posVal)}</Text>
                    </View>
                    <View style={styles.calcRow}>
                      <View style={styles.calcLabelRow}>
                        <Ionicons name="cash-outline" size={12} color="#27500A" />
                        <Text style={[styles.calcLabel, { color: '#27500A' }]}>Cash to Collect</Text>
                      </View>
                      <Text style={[styles.calcValue, { color: '#27500A', fontWeight: '800' }]}>{fmt(Math.max(0, cashAmt))}</Text>
                    </View>
                  </>
                )}
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleSubmit} activeOpacity={0.85}>
                <Text style={styles.submitBtnText}>Record Sales</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1, borderColor: colors.border }]} onPress={() => { setShowForm(false); setPosAmt(''); }}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Sales log */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Sales Log</Text>
        {sales.slice().reverse().map(entry => {
          const amt = entry.L * entry.price;
          const pos = entry.pos || 0;
          const cash = amt - pos;
          return (
            <View key={entry.id} style={[styles.entryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.entryHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.entryPump, { color: colors.text }]}>{entry.pump}</Text>
                  <Text style={[styles.entryMeta, { color: colors.textMuted }]}>by {entry.by} · {fmtDateTime(entry.dt)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.entryAmt, { color: roleColor }]}>{fmt(amt)}</Text>
                  <Text style={[styles.entryL, { color: colors.textMuted }]}>{entry.L.toLocaleString()}L @ ₦{entry.price}/L</Text>
                </View>
              </View>
              {pos > 0 && (
                <View style={styles.posBreakdown}>
                  <View style={[styles.posChip, { backgroundColor: '#27500A' + '12', borderColor: '#27500A' + '30' }]}>
                    <Ionicons name="cash-outline" size={11} color="#27500A" />
                    <Text style={[styles.posChipText, { color: '#27500A' }]}>Cash {fmt(cash)}</Text>
                  </View>
                  <View style={[styles.posChip, { backgroundColor: '#185FA5' + '12', borderColor: '#185FA5' + '30' }]}>
                    <Ionicons name="card-outline" size={11} color="#185FA5" />
                    <Text style={[styles.posChipText, { color: '#185FA5' }]}>POS {fmt(pos)}</Text>
                  </View>
                </View>
              )}
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
  cashPosCard: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  cashPosTitle: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  cashPosRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  cashPosItem: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', gap: 3 },
  cashPosValue: { fontSize: 17, fontWeight: '700' },
  cashPosLabel: { fontSize: 10 },
  posBar: { height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row', marginBottom: 4 },
  posBarCash: { borderRadius: 3 },
  posBarPos: { borderRadius: 3 },
  posBarLabel: { fontSize: 10, textAlign: 'center' },
  prodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  prodCard: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  prodLabel: { fontSize: 12, fontWeight: '700' },
  prodL: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  formCard: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  formTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  formLabel: { fontSize: 11, marginBottom: 4 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12 },
  pumpBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  calcPreview: { padding: 12, borderRadius: 10, borderWidth: 1, gap: 6, marginBottom: 4 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calcLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  calcLabel: { fontSize: 12 },
  calcValue: { fontSize: 14, fontWeight: '700' },
  calcDivider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
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
  posBreakdown: { flexDirection: 'row', gap: 6, marginTop: 8 },
  posChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1 },
  posChipText: { fontSize: 11, fontWeight: '600' },
  headerBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
