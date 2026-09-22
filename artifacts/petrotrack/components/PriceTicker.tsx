import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

import { getPriceForProduct, useApp } from '@/context/AppContext';

const PRODS = [
  { key: 'PMS' as const, color: '#174D36' },
  { key: 'AGO' as const, color: '#286247' },
  { key: 'DPK' as const, color: '#71805B' },
  { key: 'LPG' as const, color: '#49614F' },
];

export function PriceTicker() {
  const { prices, branchId } = useApp();
  const router = useRouter();
  const [active, setActive] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true, easing: Easing.out(Easing.ease) }).start(() => {
        setActive(a => (a + 1) % PRODS.length);
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true, easing: Easing.in(Easing.ease) }).start();
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.liveRow}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE PRICES</Text>
      </View>
      <View style={styles.pricesRow}>
        {PRODS.map((p, i) => {
          const val = getPriceForProduct(prices, p.key, branchId);
          return (
            <TouchableOpacity key={p.key} onPress={() => router.push('/(app)/prices' as never)} activeOpacity={0.8} style={styles.priceItem}>
              <Text style={[styles.prodKey, { color: '#8ab8a0' }]}>{p.key}</Text>
              <Text style={[styles.prodVal, { color: val > 0 ? p.color : '#4a7a5a' }]}>
                {val > 0 ? `₦${val.toLocaleString()}` : '—'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#0a1a12', borderBottomWidth: 1, borderBottomColor: '#1a3a22', gap: 14,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1F6848' },
  liveText: { color: '#1F6848', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  pricesRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  priceItem: { alignItems: 'center', gap: 1 },
  prodKey: { fontSize: 8, fontWeight: '700', letterSpacing: 0.3 },
  prodVal: { fontSize: 13, fontWeight: '800' },
});
