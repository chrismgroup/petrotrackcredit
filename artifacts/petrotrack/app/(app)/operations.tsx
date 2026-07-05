import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const PROD_COLORS: Record<string, string> = { PMS: '#1a6e3c', AGO: '#185FA5', DPK: '#BA7517', LPG: '#0F6E56', 'Lube Oil': '#5c3d11', Others: '#4a4a4a' };
const PROD_ICONS: Record<string, string> = { PMS: 'water', AGO: 'cube', DPK: 'flame', LPG: 'cloud', 'Lube Oil': 'flask', Others: 'ellipsis-horizontal-circle' };

export default function OperationsScreen() {
  const { role, prices, updatePrice, tanks, dips } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'md'] || colors.primary;
  const canEdit = role === 'md' || role === 'admin';

  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  function handleEdit(prod: string) {
    setEditing(prod);
    setEditVal(String((prices as any)[prod]));
  }

  function handleSave(prod: string) {
    const val = parseFloat(editVal);
    if (isNaN(val) || val < 100) { Alert.alert('Invalid', 'Enter a valid price.'); return; }
    updatePrice(prod, val);
    setEditing(null);
    Alert.alert('Price Updated', `${prod} price set to ₦${val}/L`);
  }

  const lastDip = dips[0];

  return (
    <ScreenLayout title="Operations">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.priceBoard, { backgroundColor: '#0a2318' }]}>
          <Text style={styles.boardTitle}>CURRENT PUMP PRICES</Text>
          <View style={styles.priceGrid}>
            {Object.entries(prices).map(([prod, price]) => (
              <View key={prod} style={[styles.priceCell, { borderColor: 'rgba(255,255,255,0.1)' }]}>
                <Text style={styles.priceProd}>{prod}</Text>
                <Text style={styles.priceValue}>₦{price}</Text>
                <Text style={styles.priceUnit}>per litre</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Manage Prices</Text>
        {Object.entries(prices).map(([prod, price]) => {
          const isEditing = editing === prod;
          const col = PROD_COLORS[prod] || roleColor;
          return (
            <View key={prod} style={[styles.priceRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.prodIcon, { backgroundColor: col + '18' }]}>
                <Ionicons name={PROD_ICONS[prod] as any} size={18} color={col} />
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
                  <Text style={[styles.currentPrice, { color: col }]}>₦{price}/L</Text>
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

        {lastDip && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Latest Tank Summary</Text>
            {Object.entries(lastDip.rd).map(([tid, mm]) => {
              const tank = tanks.find(t => t.id === tid);
              if (!tank) return null;
              const pct = Math.round((mm / tank.dip) * 100);
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
        <View style={{ height: 16 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  priceBoard: { borderRadius: 16, padding: 20, marginBottom: 16 },
  boardTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 1, fontWeight: '700', marginBottom: 14, textAlign: 'center' },
  priceGrid: { flexDirection: 'row', gap: 1 },
  priceCell: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRightWidth: StyleSheet.hairlineWidth },
  priceProd: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '700' },
  priceValue: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 2 },
  priceUnit: { color: 'rgba(255,255,255,0.4)', fontSize: 9, marginTop: 1 },
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
  tankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  tankRowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  tankName: { fontSize: 13, fontWeight: '600' },
  tankPct: { fontSize: 13, fontWeight: '700' },
  tankMm: { fontSize: 12, width: 48, textAlign: 'right' },
  progressBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: 6, borderRadius: 3 },
});
