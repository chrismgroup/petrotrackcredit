import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, fmt, fmtDateTime, mmToLiters, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const TABS = ['Dip Form', 'Log & Delivery', 'Inventory'];
const STATUS_LABELS: Record<string, string> = { ok: 'OK', short: 'Short', spill: 'Spill', seal: 'Seal Broken' };
const STATUS_COLORS: Record<string, string> = { ok: '#27500A', short: '#BA7517', spill: '#A32D2D', seal: '#4527a0' };

export default function TanksScreen() {
  const { role, tanks, lpgTanks, dips, deliveries, addDip, addDelivery, prices, deliveryEvidences, addDeliveryEvidence, userName } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'mgr'] || colors.primary;
  const [activeTab, setActiveTab] = useState(0);
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [lpgReadings, setLpgReadings] = useState<Record<string, string>>({});
  const [obs, setObs] = useState('');
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [delForm, setDelForm] = useState({ prod: 'PMS', sup: '', wb: '', ord: '', rec: '', st: 'ok', notes: '' });

  const canEdit = role === 'mgr' || role === 'att' || role === 'admin';

  function handleDipSubmit() {
    const rd: Record<string, number> = {};
    const lpg: Record<string, number> = {};
    for (const t of tanks) { rd[t.id] = parseFloat(readings[t.id] || '0') || 0; }
    for (const l of lpgTanks) { lpg[l.id] = parseFloat(lpgReadings[l.id] || '0') || 0; }
    addDip({ dt: new Date().toISOString(), by: 'Current User', rd, lpg, obs });
    setReadings({}); setLpgReadings({}); setObs('');
    Alert.alert('Dip Submitted', 'Tank readings recorded successfully.');
  }

  function handleDeliverySubmit() {
    addDelivery({ dt: new Date().toISOString(), sup: delForm.sup, prod: delForm.prod, wb: delForm.wb, ord: parseFloat(delForm.ord) || 0, rec: parseFloat(delForm.rec) || 0, st: delForm.st as any, notes: delForm.notes });
    setDelForm({ prod: 'PMS', sup: '', wb: '', ord: '', rec: '', st: 'ok', notes: '' });
    setShowDeliveryForm(false);
    Alert.alert('Delivery Recorded', 'Delivery entry saved.');
  }

  function stockPct(t: { op: number; sl: number; rv: number; cap: number }) {
    const stock = t.op + t.rv - t.sl;
    return Math.round((stock / t.cap) * 100);
  }

  return (
    <ScreenLayout title="Tank Dipping">
      <View style={styles.tabBar}>
        {TABS.map((t, i) => (
          <TouchableOpacity key={t} onPress={() => setActiveTab(i)} style={[styles.tabBtn, { borderBottomColor: i === activeTab ? roleColor : 'transparent', borderBottomWidth: 2 }]}>
            <Text style={[styles.tabLabel, { color: i === activeTab ? roleColor : colors.textMuted, fontWeight: i === activeTab ? '700' : '400' }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 0 && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.formSection, { color: colors.text }]}>Petroleum Tanks</Text>
          {tanks.map(t => {
            const mm = parseFloat(readings[t.id] || '');
            const L = !isNaN(mm) ? mmToLiters(t, mm) : null;
            return (
              <View key={t.id} style={[styles.dipCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.dipCardHeader}>
                  <Text style={[styles.dipCardTitle, { color: colors.text }]}>{t.name}</Text>
                  <View style={[styles.prodBadge, { backgroundColor: roleColor + '18' }]}>
                    <Text style={[styles.prodText, { color: roleColor }]}>{t.prod}</Text>
                  </View>
                </View>
                <Text style={[styles.dipCapacity, { color: colors.textMuted }]}>Cap: {t.cap.toLocaleString()}L · Current stock: {(t.op - t.sl).toLocaleString()}L</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                  placeholder={`Reading in mm (max ${t.dip}mm)`}
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="numeric"
                  value={readings[t.id] || ''}
                  onChangeText={v => setReadings(r => ({ ...r, [t.id]: v }))}
                  editable={canEdit}
                />
                {L !== null && <Text style={[styles.calcResult, { color: roleColor }]}>≈ {L.toLocaleString()} L ({Math.round((L / t.cap) * 100)}% full)</Text>}
              </View>
            );
          })}

          <Text style={[styles.formSection, { color: colors.text }]}>LPG Tanks</Text>
          {lpgTanks.map(l => (
            <View key={l.id} style={[styles.dipCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.dipCardTitle, { color: colors.text }]}>{l.name}</Text>
              <Text style={[styles.dipCapacity, { color: colors.textMuted }]}>Cap: {l.cap.toLocaleString()} kg</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder="Fill percentage (0-100)"
                placeholderTextColor={colors.textSubtle}
                keyboardType="numeric"
                value={lpgReadings[l.id] || ''}
                onChangeText={v => setLpgReadings(r => ({ ...r, [l.id]: v }))}
                editable={canEdit}
              />
              {lpgReadings[l.id] ? <Text style={[styles.calcResult, { color: roleColor }]}>≈ {Math.round((parseFloat(lpgReadings[l.id] || '0') / 100) * l.cap).toLocaleString()} kg</Text> : null}
            </View>
          ))}

          <TextInput
            style={[styles.obsInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            placeholder="Observations (anomalies, water sheen, etc.)"
            placeholderTextColor={colors.textSubtle}
            multiline numberOfLines={3}
            value={obs}
            onChangeText={setObs}
            editable={canEdit}
          />

          {canEdit && (
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: roleColor }]} onPress={handleDipSubmit} activeOpacity={0.85}>
              <Ionicons name="save" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Submit Dip Record</Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.formSection, { color: colors.text }]}>Record Delivery</Text>
          {!showDeliveryForm ? (
            <TouchableOpacity style={[styles.addBtn, { borderColor: roleColor }]} onPress={() => setShowDeliveryForm(true)}>
              <Ionicons name="add" size={18} color={roleColor} />
              <Text style={[styles.addBtnText, { color: roleColor }]}>Record New Delivery</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.dipCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {['PMS', 'AGO', 'DPK', 'LPG'].map(p => (
                <TouchableOpacity key={p} onPress={() => setDelForm(f => ({ ...f, prod: p }))} style={[styles.prodBtn, { backgroundColor: delForm.prod === p ? roleColor : colors.background, borderColor: delForm.prod === p ? roleColor : colors.border }]}>
                  <Text style={{ color: delForm.prod === p ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '600' }}>{p}</Text>
                </TouchableOpacity>
              ))}
              {[
                { key: 'sup', label: 'Supplier Name' }, { key: 'wb', label: 'Waybill Number' },
                { key: 'ord', label: 'Ordered Qty (L)' }, { key: 'rec', label: 'Received Qty (L)' },
                { key: 'notes', label: 'Notes' },
              ].map(f => (
                <TextInput
                  key={f.key}
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                  placeholder={f.label}
                  placeholderTextColor={colors.textSubtle}
                  keyboardType={['ord', 'rec'].includes(f.key) ? 'numeric' : 'default'}
                  value={(delForm as any)[f.key]}
                  onChangeText={v => setDelForm(fv => ({ ...fv, [f.key]: v }))}
                />
              ))}
              <View style={styles.prodRow}>
                {['ok', 'short', 'spill', 'seal'].map(s => (
                  <TouchableOpacity key={s} onPress={() => setDelForm(f => ({ ...f, st: s }))} style={[styles.prodBtn, { backgroundColor: delForm.st === s ? roleColor : colors.background, borderColor: delForm.st === s ? roleColor : colors.border }]}>
                    <Text style={{ color: delForm.st === s ? '#fff' : colors.textMuted, fontSize: 11, fontWeight: '600' }}>{STATUS_LABELS[s]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: roleColor }]} onPress={handleDeliverySubmit} activeOpacity={0.85}>
                  <Text style={styles.submitBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cancelBtn, { flex: 1, borderColor: colors.border }]} onPress={() => setShowDeliveryForm(false)}>
                  <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <View style={{ height: 16 }} />
        </ScrollView>
      )}

      {activeTab === 1 && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Dip Records</Text>
          {dips.map(dip => (
            <View key={dip.id} style={[styles.logCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.logHeader}>
                <Text style={[styles.logDate, { color: colors.text }]}>{fmtDateTime(dip.dt)}</Text>
                <Text style={[styles.logBy, { color: colors.textMuted }]}>by {dip.by}</Text>
              </View>
              <View style={styles.readingsGrid}>
                {Object.entries(dip.rd).map(([tid, mm]) => {
                  const tank = tanks.find(t => t.id === tid);
                  return (
                    <View key={tid} style={[styles.readingChip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Text style={[styles.readingLabel, { color: colors.textMuted }]}>{tank?.name.replace('Tank ', 'T')}</Text>
                      <Text style={[styles.readingVal, { color: roleColor }]}>{mm}mm</Text>
                    </View>
                  );
                })}
              </View>
              {dip.obs ? <Text style={[styles.dipObs, { color: colors.warning }]}>⚠ {dip.obs}</Text> : null}
            </View>
          ))}

          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 12 }]}>Delivery Records</Text>
          {deliveries.map(rec => {
            const evidence = deliveryEvidences.filter(e => e.delivId === rec.id);
            return (
              <View key={rec.id} style={[styles.logCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.logHeader}>
                  <View>
                    <Text style={[styles.logDate, { color: colors.text }]}>{rec.prod} — {rec.sup}</Text>
                    <Text style={[styles.logBy, { color: colors.textMuted }]}>WB: {rec.wb} · {fmtDateTime(rec.dt)}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[rec.st] + '22' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[rec.st] }]}>{STATUS_LABELS[rec.st]}</Text>
                  </View>
                </View>
                <View style={styles.deliveryStats}>
                  <Text style={[styles.deliveryStatItem, { color: colors.textMuted }]}>Ordered: <Text style={{ color: colors.text, fontWeight: '600' }}>{rec.ord.toLocaleString()}L</Text></Text>
                  <Text style={[styles.deliveryStatItem, { color: colors.textMuted }]}>Received: <Text style={{ color: roleColor, fontWeight: '700' }}>{rec.rec.toLocaleString()}L</Text></Text>
                  {rec.ord !== rec.rec && <Text style={{ color: STATUS_COLORS[rec.st], fontSize: 12 }}>Diff: {(rec.rec - rec.ord).toLocaleString()}L</Text>}
                </View>
                {rec.notes ? <Text style={[styles.dipObs, { color: colors.textMuted }]}>{rec.notes}</Text> : null}

                <View style={[styles.evidenceSection, { borderTopColor: colors.border }]}>
                  <View style={styles.evidenceHeader}>
                    <Ionicons name="camera" size={13} color={colors.textMuted} />
                    <Text style={[styles.evidenceTitle, { color: colors.textMuted }]}>Delivery Evidence ({evidence.length})</Text>
                    {canEdit && (
                      <View style={styles.evidenceBtns}>
                        <TouchableOpacity
                          onPress={() => { const n = `WB-${rec.wb}_photo_${Date.now()}.jpg`; addDeliveryEvidence({ delivId: rec.id, type: 'photo', name: n, by: userName || 'Manager' }); Alert.alert('Photo Added', n); }}
                          style={[styles.evidenceAddBtn, { backgroundColor: roleColor + '18', borderColor: roleColor + '44' }]}
                        >
                          <Ionicons name="camera" size={11} color={roleColor} />
                          <Text style={[styles.evidenceAddText, { color: roleColor }]}>Photo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => { const n = `WB-${rec.wb}_video_${Date.now()}.mp4`; addDeliveryEvidence({ delivId: rec.id, type: 'video', name: n, by: userName || 'Manager' }); Alert.alert('Video Added', n); }}
                          style={[styles.evidenceAddBtn, { backgroundColor: '#8E44AD' + '18', borderColor: '#8E44AD' + '44' }]}
                        >
                          <Ionicons name="videocam" size={11} color="#8E44AD" />
                          <Text style={[styles.evidenceAddText, { color: '#8E44AD' }]}>Video</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  {evidence.length === 0 && (
                    <Text style={[styles.evidenceEmpty, { color: colors.textSubtle }]}>No evidence attached — tap Photo or Video to upload</Text>
                  )}
                  {evidence.map(ev => (
                    <View key={ev.id} style={[styles.evidenceItem, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Ionicons name={ev.type === 'photo' ? 'image' : 'videocam'} size={14} color={ev.type === 'photo' ? roleColor : '#8E44AD'} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.evidenceName, { color: colors.text }]} numberOfLines={1}>{ev.name}</Text>
                        <Text style={[styles.evidenceMeta, { color: colors.textSubtle }]}>by {ev.by} · {fmtDateTime(ev.dt)}</Text>
                      </View>
                      <View style={[styles.evidenceTypeBadge, { backgroundColor: ev.type === 'photo' ? roleColor + '18' : '#8E44AD' + '18' }]}>
                        <Text style={[styles.evidenceTypeText, { color: ev.type === 'photo' ? roleColor : '#8E44AD' }]}>{ev.type.toUpperCase()}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
          <View style={{ height: 16 }} />
        </ScrollView>
      )}

      {activeTab === 2 && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Petroleum Tanks</Text>
          {tanks.map(t => {
            const stock = t.op + t.rv - t.sl;
            const pct = stockPct(t);
            const barColor = pct < 30 ? colors.error : pct < 60 ? colors.amber : colors.primary;
            return (
              <View key={t.id} style={[styles.invCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.invHeader}>
                  <View>
                    <Text style={[styles.invName, { color: colors.text }]}>{t.name}</Text>
                    <Text style={[styles.invProd, { color: colors.textMuted }]}>Capacity: {t.cap.toLocaleString()}L</Text>
                  </View>
                  <View style={[styles.prodBadge, { backgroundColor: roleColor + '18' }]}>
                    <Text style={[styles.prodText, { color: roleColor }]}>{t.prod}</Text>
                  </View>
                </View>
                <View style={[styles.progressBg, { backgroundColor: colors.border, marginVertical: 10 }]}>
                  <View style={[styles.progressBar, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                </View>
                <View style={styles.invStats}>
                  <View style={styles.invStat}>
                    <Text style={[styles.invStatVal, { color: colors.text }]}>{stock.toLocaleString()}L</Text>
                    <Text style={[styles.invStatLabel, { color: colors.textMuted }]}>Current Stock</Text>
                  </View>
                  <View style={styles.invStat}>
                    <Text style={[styles.invStatVal, { color: barColor }]}>{pct}%</Text>
                    <Text style={[styles.invStatLabel, { color: colors.textMuted }]}>Fill Level</Text>
                  </View>
                  <View style={styles.invStat}>
                    <Text style={[styles.invStatVal, { color: colors.text }]}>{t.sl.toLocaleString()}L</Text>
                    <Text style={[styles.invStatLabel, { color: colors.textMuted }]}>Today Sales</Text>
                  </View>
                </View>
              </View>
            );
          })}

          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 8 }]}>LPG Tanks</Text>
          {lpgTanks.map(l => {
            const stock = l.op + l.rv - l.sl;
            const pct = Math.round((stock / l.cap) * 100);
            return (
              <View key={l.id} style={[styles.invCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.invHeader}>
                  <View>
                    <Text style={[styles.invName, { color: colors.text }]}>{l.name}</Text>
                    <Text style={[styles.invProd, { color: colors.textMuted }]}>Cap: {l.cap.toLocaleString()} kg</Text>
                  </View>
                  <View style={[styles.prodBadge, { backgroundColor: colors.teal + '18' }]}>
                    <Text style={[styles.prodText, { color: colors.teal }]}>LPG</Text>
                  </View>
                </View>
                <View style={[styles.progressBg, { backgroundColor: colors.border, marginVertical: 10 }]}>
                  <View style={[styles.progressBar, { width: `${pct}%` as any, backgroundColor: colors.teal }]} />
                </View>
                <Text style={[styles.invStatVal, { color: colors.teal }]}>{stock.toLocaleString()} kg ({pct}%)</Text>
              </View>
            );
          })}
          <View style={{ height: 16 }} />
        </ScrollView>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e3' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabLabel: { fontSize: 13 },
  scroll: { padding: 16 },
  formSection: { fontSize: 14, fontWeight: '700', marginBottom: 10, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  dipCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 12, gap: 8 },
  dipCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dipCardTitle: { fontSize: 14, fontWeight: '600' },
  dipCapacity: { fontSize: 11 },
  prodBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  prodText: { fontSize: 11, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  calcResult: { fontSize: 13, fontWeight: '600' },
  obsInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 16, minHeight: 80, textAlignVertical: 'top' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12, marginBottom: 16 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  evidenceSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 6 },
  evidenceHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  evidenceTitle: { flex: 1, fontSize: 12, fontWeight: '600' },
  evidenceBtns: { flexDirection: 'row', gap: 6 },
  evidenceAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  evidenceAddText: { fontSize: 10, fontWeight: '700' },
  evidenceItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, borderWidth: 1 },
  evidenceName: { fontSize: 11, fontWeight: '600' },
  evidenceMeta: { fontSize: 10, marginTop: 1 },
  evidenceTypeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  evidenceTypeText: { fontSize: 9, fontWeight: '700' },
  evidenceEmpty: { fontSize: 11, fontStyle: 'italic', paddingVertical: 4 },
  cancelBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', marginBottom: 16 },
  addBtnText: { fontSize: 14, fontWeight: '600' },
  prodRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  prodBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  logCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  logDate: { fontSize: 14, fontWeight: '600' },
  logBy: { fontSize: 11, marginTop: 2 },
  readingsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  readingChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  readingLabel: { fontSize: 9 },
  readingVal: { fontSize: 13, fontWeight: '700' },
  dipObs: { fontSize: 12, marginTop: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '700' },
  deliveryStats: { flexDirection: 'row', gap: 12, marginTop: 4 },
  deliveryStatItem: { fontSize: 12 },
  invCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  invHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  invName: { fontSize: 14, fontWeight: '600' },
  invProd: { fontSize: 11, marginTop: 2 },
  invStats: { flexDirection: 'row', gap: 12 },
  invStat: {},
  invStatVal: { fontSize: 16, fontWeight: '700' },
  invStatLabel: { fontSize: 11, marginTop: 1 },
  progressBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressBar: { height: 8, borderRadius: 4 },
});
