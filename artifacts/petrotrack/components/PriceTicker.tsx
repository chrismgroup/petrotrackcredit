import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

interface CompetitorPrice {
  name: string;
  short: string;
  pms: number;
  ago: number;
  dpk: number;
  pmsPrev: number;
  agoPrev: number;
  dpkPrev: number;
}

const BASE_COMPETITORS: Omit<CompetitorPrice, 'pmsPrev' | 'agoPrev' | 'dpkPrev'>[] = [
  { name: 'NNPCL Retail',   short: 'NNPCL',  pms: 817, ago: 1035, dpk: 685 },
  { name: 'Conoil Abuja',   short: 'CONOIL', pms: 835, ago: 1060, dpk: 710 },
  { name: 'MRS Petroleum',  short: 'MRS',    pms: 828, ago: 1050, dpk: 698 },
  { name: 'Total Energies', short: 'TOTAL',  pms: 825, ago: 1048, dpk: 702 },
  { name: 'Ardova Plc',     short: 'ARDOVA', pms: 822, ago: 1042, dpk: 695 },
  { name: 'Rainoil Ltd',    short: 'RAIN',   pms: 829, ago: 1045, dpk: 700 },
];

function init(): CompetitorPrice[] {
  return BASE_COMPETITORS.map(c => ({ ...c, pmsPrev: c.pms, agoPrev: c.ago, dpkPrev: c.dpk }));
}

function nudge(price: number, base: number): number {
  const delta = Math.round((Math.random() - 0.5) * 6);
  const next = price + delta;
  return Math.max(base - 20, Math.min(base + 30, next));
}

const ITEM_WIDTH = 148;
const SEPARATOR = 8;
const UNIT = ITEM_WIDTH + SEPARATOR;

export function PriceTicker() {
  const { prices } = useApp();
  const colors = useColors();
  const [competitors, setCompetitors] = useState<CompetitorPrice[]>(init);
  const [activeProd, setActiveProd] = useState<'pms' | 'ago' | 'dpk'>('pms');
  const [pulse, setPulse] = useState(true);

  const translateX = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const totalWidth = BASE_COMPETITORS.length * UNIT;

  function startTicker() {
    animRef.current?.stop();
    translateX.setValue(0);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, {
          toValue: -totalWidth,
          duration: totalWidth * 40,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );
    animRef.current = anim;
    anim.start();
  }

  useEffect(() => {
    startTicker();
    return () => animRef.current?.stop();
  }, []);

  useEffect(() => {
    const priceInterval = setInterval(() => {
      setCompetitors(prev => {
        const idx = Math.floor(Math.random() * prev.length);
        return prev.map((c, i) => {
          if (i !== idx) return c;
          const base = BASE_COMPETITORS[i];
          return {
            ...c,
            pmsPrev: c.pms,
            agoPrev: c.ago,
            dpkPrev: c.dpk,
            pms: nudge(c.pms, base.pms),
            ago: nudge(c.ago, base.ago),
            dpk: nudge(c.dpk, base.dpk),
          };
        });
      });
    }, 5000);

    const prodInterval = setInterval(() => {
      setActiveProd(p => p === 'pms' ? 'ago' : p === 'ago' ? 'dpk' : 'pms');
    }, 8000);

    const pulseInterval = setInterval(() => setPulse(v => !v), 1000);

    return () => {
      clearInterval(priceInterval);
      clearInterval(prodInterval);
      clearInterval(pulseInterval);
    };
  }, []);

  const ourPrice = activeProd === 'pms' ? prices.PMS : activeProd === 'ago' ? prices.AGO : prices.DPK;
  const prodLabel = activeProd.toUpperCase();
  const prodColors: Record<string, string> = { pms: '#1a6e3c', ago: '#185FA5', dpk: '#BA7517' };
  const prodColor = prodColors[activeProd];

  const tickerItems = [...competitors, ...competitors];

  return (
    <View style={[styles.container, { backgroundColor: '#0a1a12', borderBottomColor: '#1a3a22' }]}>
      <View style={styles.leftPanel}>
        <View style={styles.liveRow}>
          <View style={[styles.liveDot, { backgroundColor: pulse ? '#4CAF50' : '#27500A' }]} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <Text style={[styles.ourPrice, { color: prodColor }]}>₦{ourPrice}</Text>
        <Text style={styles.ourLabel}>OUR {prodLabel}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.tickerWrap}>
        <Animated.View
          style={[styles.tickerTrack, { transform: [{ translateX }] }]}
        >
          {tickerItems.map((comp, idx) => {
            const price = comp[activeProd];
            const prev = comp[`${activeProd}Prev` as 'pmsPrev' | 'agoPrev' | 'dpkPrev'];
            const change = price - prev;
            const diff = price - ourPrice;
            const isUp = change > 0;
            const isDown = change < 0;
            const isCheaper = diff < 0;
            const isExpensive = diff > 0;

            return (
              <View key={`${comp.short}-${idx}`} style={[styles.tickerItem, { borderRightColor: '#1a3a22' }]}>
                <View style={styles.tickerTop}>
                  <Text style={styles.compShort}>{comp.short}</Text>
                  <View style={styles.moveWrap}>
                    {isUp && <Ionicons name="arrow-up" size={9} color="#E57373" />}
                    {isDown && <Ionicons name="arrow-down" size={9} color="#81C784" />}
                    {!isUp && !isDown && <View style={styles.flatDot} />}
                  </View>
                </View>
                <Text style={[styles.compPrice, {
                  color: isCheaper ? '#E57373' : isExpensive ? '#81C784' : '#e8f5e9',
                }]}>
                  ₦{price}
                </Text>
                <View style={styles.tickerBottom}>
                  <Text style={[styles.vsText, { color: isCheaper ? '#E57373' : isExpensive ? '#81C784' : '#4a7a5a' }]}>
                    {diff === 0 ? 'same' : `${isExpensive ? '+' : ''}${diff}`}
                  </Text>
                  {change !== 0 && (
                    <Text style={[styles.changeText, { color: isUp ? '#E57373' : '#81C784' }]}>
                      {isUp ? '+' : ''}{change}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </Animated.View>

        <View style={[styles.fadeLeft, { backgroundColor: '#0a1a12' }]} />
        <View style={[styles.fadeRight, { backgroundColor: '#0a1a12' }]} />
      </View>

      <View style={styles.rightPanel}>
        <Text style={styles.prodCycle}>{prodLabel}</Text>
        <View style={{ flexDirection: 'row', gap: 3, marginTop: 2 }}>
          {(['pms', 'ago', 'dpk'] as const).map(p => (
            <View key={p} style={[styles.prodDot, { backgroundColor: p === activeProd ? prodColor : '#1a3a22' }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1,
    height: 54,
  },
  leftPanel: {
    paddingHorizontal: 10, alignItems: 'center', minWidth: 70,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 1 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { color: '#4CAF50', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  ourPrice: { fontSize: 14, fontWeight: '800', lineHeight: 16 },
  ourLabel: { color: '#4a7a5a', fontSize: 7, fontWeight: '700', letterSpacing: 0.3, marginTop: 1 },
  divider: { width: 1, height: 34, backgroundColor: '#1a3a22', marginRight: 4 },
  tickerWrap: { flex: 1, overflow: 'hidden', height: 42, position: 'relative' },
  tickerTrack: { flexDirection: 'row', alignItems: 'center', height: 42 },
  tickerItem: {
    width: ITEM_WIDTH, marginRight: SEPARATOR,
    borderRightWidth: StyleSheet.hairlineWidth, paddingRight: 8, paddingVertical: 3,
  },
  tickerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  compShort: { color: '#8ab8a0', fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  moveWrap: { width: 12, alignItems: 'center' },
  flatDot: { width: 4, height: 1, backgroundColor: '#4a7a5a' },
  compPrice: { fontSize: 15, fontWeight: '800', lineHeight: 18 },
  tickerBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vsText: { fontSize: 8, fontWeight: '700' },
  changeText: { fontSize: 8, fontWeight: '600' },
  fadeLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 12, opacity: 0.9 },
  fadeRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 18, opacity: 0.9 },
  rightPanel: { paddingHorizontal: 8, alignItems: 'center' },
  prodCycle: { color: '#8ab8a0', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  prodDot: { width: 5, height: 5, borderRadius: 3 },
});
