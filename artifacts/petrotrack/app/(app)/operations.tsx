import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const PROD_COLORS: Record<string, string> = { PMS: '#27ae60', AGO: '#3498db', DPK: '#e67e22', LPG: '#1abc9c', 'Lube Oil': '#c0882e' };
const PROD_ICONS: Record<string, string>  = { PMS: 'water', AGO: 'cube', DPK: 'flame', LPG: 'cloud', 'Lube Oil': 'flask' };

// Animated rolling number that counts from its previous value to `target`
function RunningPrice({ target, textStyle }: { target: number; textStyle?: any }) {
  const [displayed, setDisplayed] = useState(0);
  const fromRef   = useRef(0);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const from = fromRef.current;
    const to   = target;
    let   step = 0;
    const STEPS = 22;
    const MS    = 28;
    timerRef.current = setInterval(() => {
      step++;
      const t    = step / STEPS;
      const ease = 1 - Math.pow(1 - t, 3);
      const v    = Math.round(from + (to - from) * ease);
      fromRef.current = v;
      setDisplayed(v);
      if (step >= STEPS) {
        fromRef.current = to;
        setDisplayed(to);
        clearInterval(timerRef.current!);
      }
    }, MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [target]);

  return <Text style={textStyle}>₦{displayed.toLocaleString()}</Text>;
}

// Blinking dot for "LIVE" indicator
function PulseDot() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.15, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(opacity, { toValue: 1,    duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
  }, []);
  return <Animated.View style={[styles.pulseDot, { opacity }]} />;
}

export default function OperationsScreen() {
  const { role, prices, updatePrice, tanks, dips } = useApp();
  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'md'] || colors.primary;
  const canEdit   = role === 'md' || role === 'admin';

  const [editing, setEditing]   = useState<string | null>(null);
  const [editVal, setEditVal]   = useState('');
  const [nowStr,  setNowStr]    = useState('');

  // Live clock — updates every second
  useEffect(() => {
    function tick() {
      const d = new Date();
      setNowStr(d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  function handleEdit(prod: string) {
    setEditing(prod);
    setEditVal(String((prices as any)[prod]));
  }

  function handleSave(prod: string) {
    const val = parseFloat(editVal);
    if (isNaN(val) || val < 100) { Alert.alert('Invalid', 'Enter a valid price above ₦100.'); return; }
    updatePrice(prod, val);
    setEditing(null);
    Alert.alert('Price Updated', `${prod} set to ₦${val.toLocaleString()}/L`);
  }

  // Only show products that have a price set (> 0) and aren't 'Others'/'DPK' unless > 0
  const boardEntries = Object.entries(prices).filter(([prod]) => prod !== 'Others' && prod !== 'DPK');
  const manageEntries = Object.entries(prices).filter(([prod]) => prod !== 'Others');
  const lastDip = dips[0];

  return (
    <ScreenLayout title="Operations">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── LIVE PRICE BOARD ── */}
        <View style={styles.boardOuter}>
          <View style={styles.boardHeader}>
            <PulseDot />
            <Text style={styles.boardLiveLabel}>LIVE</Text>
            <Text style={styles.boardTitle}>CURRENT PUMP PRICES</Text>
            <Text style={styles.boardClock}>{nowStr}</Text>
          </View>

          <View style={styles.boardGrid}>
            {boardEntries.map(([prod, price], idx) => {
              const col = PROD_COLORS[prod] || '#aaa';
              const isLast = idx === boardEntries.length - 1;
              return (
                <View
                  key={prod}
                  style={[
                    styles.boardCell,
                    !isLast && styles.boardCellBorder,
                    { flex: prod === 'Lube Oil' ? 1.3 : 1 },
                  ]}
                >
                  <View style={[styles.boardProdPill, { backgroundColor: col + '28' }]}>
                    <Text style={[styles.boardProdText, { color: col }]}>{prod}</Text>
                  </View>
                  <RunningPrice target={price as number} textStyle={[styles.boardPrice, { color: '#fff' }]} />
                  <Text style={styles.boardUnit}>per litre</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── MANAGE PRICES ── */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Manage Prices</Text>
        {manageEntries.map(([prod, price]) => {
          const isEditing = editing === prod;
          const col = PROD_COLORS[prod] || roleColor;
          return (
            <View key={prod} style={[styles.priceRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.prodIcon, { backgroundColor: col + '18' }]}>
                <Ionicons name={(PROD_ICONS[prod] ?? 'pricetag') as any} size={18} color={col} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.prodName, { color: colors.text }]}>{prod}</Text>
                {isEditing ? (
                  <TextInput
                    style={[styles.priceInput, { backgroundColor: colors.background, borderColor: col, color: colors.text }]}
                    value={editVal}
                    onChangeText={setEditVal}
                    keyboardType="numeric"
                    autoFocus
                  />
                ) : (
                  <Text style={[styles.currentPrice, { color: col }]}>₦{(price as number).toLocaleString()}/L</Text>
                )}
              </View>
              {canEdit && (
                isEditing ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity onPress={() => handleSave(prod)} style={[styles.saveBtn, { backgroundColor: col }]}>
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditing(null)} style={[styles.cancelIconBtn, { borderColor: colors.border }]}>
                      <Ionicons name="close" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => handleEdit(prod)} style={[styles.editBtn, { borderColor: col + '44' }]}>
                    <Ionicons name="pencil" size={14} color={col} />
                    <Text style={[styles.editBtnText, { color: col }]}>Edit</Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          );
        })}

        {/* ── TANK SUMMARY ── */}
        {lastDip && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Latest Tank Summary</Text>
            {Object.entries(lastDip.rd).map(([tid, mm]) => {
              const tank = tanks.find(t => t.id === tid);
              if (!tank) return null;
              const pct      = Math.round((mm / tank.dip) * 100);
              const barColor = pct < 30 ? colors.error : pct < 60 ? colors.amber : colors.primary;
              return (
                <View key={tid} style={[styles.tankRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.tankRowHeader}>
                      <Text style={[styles.tankName, { color: colors.text }]}>{tank.name}</Text>
                      <Text style={[styles.tankPct, { color: barColor }]}>{pct}%</Text>
                    </View>
                    <View style={[styles.progressBg, { backgroundColor: colors.border }]}>
                      <View style={[styles.progressBar, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                    </View>
                  </View>
                  <Text style={[styles.tankMm, { color: colors.textMuted }]}>{mm}mm</Text>
                </View>
              );
            })}
          </>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  // Board
  boardOuter: { borderRadius: 18, backgroundColor: '#04150e', marginBottom: 20, overflow: 'hidden' },
  boardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  pulseDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4caf50', marginRight: 5 },
  boardLiveLabel: { color: '#4caf50', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginRight: 8 },
  boardTitle: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '700', letterSpacing: 1, flex: 1 },
  boardClock: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  boardGrid: { flexDirection: 'row', paddingVertical: 18, paddingHorizontal: 8 },
  boardCell: { alignItems: 'center', gap: 5 },
  boardCellBorder: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: 'rgba(255,255,255,0.1)' },
  boardProdPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  boardProdText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  boardPrice: { fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  boardUnit: { color: 'rgba(255,255,255,0.3)', fontSize: 8, fontWeight: '600', letterSpacing: 0.5 },
  // Manage
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  prodIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  prodName: { fontSize: 14, fontWeight: '600', marginBottom: 3 },
  currentPrice: { fontSize: 18, fontWeight: '700' },
  priceInput: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16, fontWeight: '700', width: 100 },
  saveBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cancelIconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  editBtnText: { fontSize: 12, fontWeight: '600' },
  // Tanks
  tankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  tankRowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  tankName: { fontSize: 13, fontWeight: '600' },
  tankPct: { fontSize: 13, fontWeight: '700' },
  tankMm: { fontSize: 12, width: 48, textAlign: 'right' },
  progressBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: 6, borderRadius: 3 },
});
