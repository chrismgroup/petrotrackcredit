import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const PROD_META: Record<string, { color: string; icon: string; unit: string }> = {
  PMS:       { color: '#34d399', icon: 'water-outline',  unit: 'per litre' },
  AGO:       { color: '#60a5fa', icon: 'cube-outline',   unit: 'per litre' },
  DPK:       { color: '#fb923c', icon: 'flame-outline',  unit: 'per litre' },
  LPG:       { color: '#a78bfa', icon: 'cloud-outline',  unit: 'per kg'    },
  'Lube Oil':{ color: '#fbbf24', icon: 'flask-outline',  unit: 'per litre' },
};

function RunningPrice({ target, textStyle }: { target: number; textStyle?: any }) {
  const [displayed, setDisplayed] = useState(0);
  const fromRef  = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const from = fromRef.current;
    const to   = target;
    let step   = 0;
    const STEPS = 24, MS = 26;
    timerRef.current = setInterval(() => {
      step++;
      const ease = 1 - Math.pow(1 - step / STEPS, 3);
      const v    = Math.round(from + (to - from) * ease);
      fromRef.current = v;
      setDisplayed(v);
      if (step >= STEPS) { fromRef.current = to; setDisplayed(to); clearInterval(timerRef.current!); }
    }, MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [target]);

  return <Text style={textStyle}>₦{displayed.toLocaleString()}</Text>;
}

function PulseDot({ color = '#4ade80' }: { color?: string }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.9)).current;
  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale,   { toValue: 1.5, duration: 800, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          Animated.timing(scale,   { toValue: 1,   duration: 800, useNativeDriver: true, easing: Easing.in(Easing.ease)  }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.2, duration: 800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.9, duration: 800, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);
  return (
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, transform: [{ scale }], opacity }} />
    </View>
  );
}

export default function OperationsScreen() {
  const { role, prices, updatePrice, tanks, dips } = useApp();
  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'md'] || colors.primary;
  const canEdit   = role === 'md' || role === 'admin';

  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [nowStr,  setNowStr]  = useState('');
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    function tick() {
      const d = new Date();
      setNowStr(d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDateStr(d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  function handleEdit(prod: string) { setEditing(prod); setEditVal(String((prices as any)[prod])); }
  function handleSave(prod: string) {
    const val = parseFloat(editVal);
    if (isNaN(val) || val < 100) { Alert.alert('Invalid', 'Enter a valid price above ₦100.'); return; }
    updatePrice(prod, val);
    setEditing(null);
    Alert.alert('Price Updated', `${prod} updated to ₦${val.toLocaleString()}/L`);
  }

  const boardEntries = Object.entries(prices).filter(([p]) => p !== 'Others' && p !== 'DPK');
  const manageEntries = Object.entries(prices).filter(([p]) => p !== 'Others');
  const lastDip = dips[0];

  return (
    <ScreenLayout title="Operations">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── PRICE BOARD ── */}
        <View style={styles.board}>
          {/* Board header bar */}
          <View style={styles.boardTopBar}>
            <View style={styles.boardTopLeft}>
              <PulseDot color="#4ade80" />
              <Text style={styles.liveLabel}>LIVE</Text>
              <View style={styles.dividerV} />
              <Text style={styles.boardTagline}>PUMP PRICES</Text>
            </View>
            <View style={styles.boardTopRight}>
              <Text style={styles.boardDate}>{dateStr}</Text>
              <Text style={styles.boardClock}>{nowStr}</Text>
            </View>
          </View>

          {/* Thin colored gradient bar across the top */}
          <View style={styles.boardRainbow}>
            {boardEntries.map(([prod]) => (
              <View key={prod} style={[styles.boardRainbowSlice, { backgroundColor: (PROD_META[prod]?.color ?? '#888') + 'cc' }]} />
            ))}
          </View>

          {/* Product cards grid */}
          <View style={styles.boardGrid}>
            {boardEntries.map(([prod, price]) => {
              const meta = PROD_META[prod] ?? { color: '#aaa', icon: 'pricetag-outline', unit: 'per litre' };
              return (
                <View key={prod} style={[styles.boardCard, { borderColor: meta.color + '28' }]}>
                  {/* Left accent bar */}
                  <View style={[styles.cardAccent, { backgroundColor: meta.color }]} />

                  <View style={styles.cardInner}>
                    {/* Product row */}
                    <View style={styles.cardProdRow}>
                      <View style={[styles.cardIconWrap, { backgroundColor: meta.color + '22' }]}>
                        <Ionicons name={meta.icon as any} size={13} color={meta.color} />
                      </View>
                      <Text style={[styles.cardProdName, { color: meta.color }]}>{prod}</Text>
                    </View>

                    {/* Price */}
                    <RunningPrice target={price as number} textStyle={[styles.cardPrice, { color: '#fff' }]} />

                    {/* Unit */}
                    <Text style={[styles.cardUnit, { color: meta.color + 'aa' }]}>{meta.unit}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── MANAGE PRICES ── */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Manage Prices</Text>
        {manageEntries.map(([prod, price]) => {
          const isEditing = editing === prod;
          const col = PROD_META[prod]?.color ?? roleColor;
          return (
            <View key={prod} style={[styles.priceRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.prodIcon, { backgroundColor: col + '18' }]}>
                <Ionicons name={(PROD_META[prod]?.icon ?? 'pricetag') as any} size={18} color={col} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.prodName, { color: colors.text }]}>{prod}</Text>
                {isEditing ? (
                  <TextInput
                    style={[styles.priceInput, { backgroundColor: colors.background, borderColor: col, color: colors.text }]}
                    value={editVal} onChangeText={setEditVal} keyboardType="numeric" autoFocus
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
                  <TouchableOpacity onPress={() => handleEdit(prod)} style={[styles.editBtn, { borderColor: col + '55' }]}>
                    <Ionicons name="pencil" size={13} color={col} />
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
  scroll: { padding: 14 },

  // ── Board ──
  board: { borderRadius: 20, backgroundColor: '#060f0a', marginBottom: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },

  boardTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  boardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveLabel: { color: '#4ade80', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  dividerV: { width: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.15)' },
  boardTagline: { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  boardTopRight: { alignItems: 'flex-end', gap: 1 },
  boardDate: { color: 'rgba(255,255,255,0.25)', fontSize: 9, fontWeight: '500' },
  boardClock: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },

  boardRainbow: { flexDirection: 'row', height: 2, marginHorizontal: 14, borderRadius: 1, overflow: 'hidden', marginBottom: 12 },
  boardRainbowSlice: { flex: 1 },

  boardGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, paddingBottom: 14, gap: 8 },
  boardCard: {
    width: '47%',
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  cardAccent: { width: 3, borderRadius: 3 },
  cardInner: { flex: 1, padding: 12, gap: 4 },
  cardProdRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  cardIconWrap: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  cardProdName: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  cardPrice: { fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'] },
  cardUnit: { fontSize: 8, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },

  // ── Manage ──
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  prodIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  prodName: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  currentPrice: { fontSize: 17, fontWeight: '700' },
  priceInput: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16, fontWeight: '700', width: 100 },
  saveBtn: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cancelIconBtn: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  editBtnText: { fontSize: 11, fontWeight: '600' },

  // ── Tanks ──
  tankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  tankRowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  tankName: { fontSize: 12, fontWeight: '600' },
  tankPct: { fontSize: 12, fontWeight: '700' },
  tankMm: { fontSize: 11, width: 44, textAlign: 'right' },
  progressBg: { height: 5, borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: 5, borderRadius: 3 },
});
