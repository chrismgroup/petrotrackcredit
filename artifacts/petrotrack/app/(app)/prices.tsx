import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { PriceChange, Prices, ROLE_COLORS, fmt, fmtDateTime, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const PRODUCTS: (keyof Prices)[] = ['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil'];
const PROD_COLORS: Record<string, string> = {
  PMS: '#1a6e3c', AGO: '#185FA5', DPK: '#BA7517', LPG: '#0F6E56', 'Lube Oil': '#5c3d11',
};
const PROD_ICONS: Record<string, string> = {
  PMS: 'flame', AGO: 'car', DPK: 'bulb', LPG: 'thermometer', 'Lube Oil': 'settings',
};

export default function PricesScreen() {
  const { role, prices, priceHistory, updatePrice } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'md'] || colors.primary;

  const canEdit = role === 'admin' || role === 'md' || role === 'ceo';

  const [editProd, setEditProd] = useState<keyof Prices | null>(null);
  const [draft, setDraft] = useState('');

  function openEdit(prod: keyof Prices) {
    setEditProd(prod);
    setDraft(String((prices as any)[prod] || ''));
  }

  function handleSave() {
    if (!editProd) return;
    const val = parseFloat(draft);
    if (!draft || isNaN(val) || val <= 0) {
      Alert.alert('Invalid', 'Enter a valid price greater than 0.');
      return;
    }
    updatePrice(editProd, val);
    setEditProd(null);
    setDraft('');
  }

  const recentHistory = [...priceHistory].sort((a, b) => b.id - a.id).slice(0, 20);

  return (
    <ScreenLayout title="Selling Prices">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Current prices grid */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Current Prices</Text>
        <View style={styles.grid}>
          {PRODUCTS.map(prod => {
            const price = (prices as any)[prod] ?? 0;
            const pc = PROD_COLORS[prod] || roleColor;
            return (
              <View key={prod} style={[styles.priceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.prodIcon, { backgroundColor: pc + '18' }]}>
                  <Ionicons name={(PROD_ICONS[prod] || 'pricetag') as any} size={20} color={pc} />
                </View>
                <Text style={[styles.prodName, { color: colors.textMuted }]}>{prod}</Text>
                <Text style={[styles.prodPrice, { color: price > 0 ? colors.text : colors.textSubtle }]}>
                  {price > 0 ? fmt(price) : '—'}
                </Text>
                <Text style={[styles.perL, { color: colors.textSubtle }]}>/litre</Text>
                {canEdit && (
                  <TouchableOpacity
                    style={[styles.editBtn, { backgroundColor: pc + '15', borderColor: pc + '40' }]}
                    onPress={() => openEdit(prod)}
                  >
                    <Ionicons name="pencil" size={12} color={pc} />
                    <Text style={[styles.editBtnText, { color: pc }]}>Update</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* Price change history */}
        {recentHistory.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Price History</Text>
            {recentHistory.map(h => {
              const pc = PROD_COLORS[h.prod] || roleColor;
              const up = h.newPrice > h.oldPrice;
              return (
                <View key={h.id} style={[styles.histRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.histIcon, { backgroundColor: pc + '18' }]}>
                    <Text style={[styles.histProd, { color: pc }]}>{h.prod}</Text>
                  </View>
                  <View style={styles.histMid}>
                    <View style={styles.histPrices}>
                      <Text style={[styles.histOld, { color: colors.textMuted }]}>₦{h.oldPrice.toLocaleString()}</Text>
                      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={12} color={up ? '#27500A' : '#791F1F'} />
                      <Text style={[styles.histNew, { color: colors.text }]}>₦{h.newPrice.toLocaleString()}</Text>
                    </View>
                    <Text style={[styles.histBy, { color: colors.textSubtle }]}>by {h.by} · {fmtDateTime(h.dt)}</Text>
                  </View>
                  <View style={[styles.changeBadge, {
                    backgroundColor: up ? '#EAF3DE' : '#FCEBEB',
                    borderColor: up ? '#27500A' : '#791F1F',
                  }]}>
                    <Text style={[styles.changeText, { color: up ? '#27500A' : '#791F1F' }]}>
                      {up ? '+' : ''}₦{(h.newPrice - h.oldPrice).toLocaleString()}
                    </Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {recentHistory.length === 0 && (
          <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="pricetag-outline" size={36} color={colors.textSubtle} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No price changes recorded yet</Text>
          </View>
        )}

      </ScrollView>

      {/* Edit modal */}
      <Modal visible={editProd !== null} transparent animationType="fade">
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setEditProd(null)} />
          <View style={[styles.modal, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIcon, { backgroundColor: (PROD_COLORS[editProd || ''] || roleColor) + '18' }]}>
                <Ionicons name="pricetag" size={20} color={PROD_COLORS[editProd || ''] || roleColor} />
              </View>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Update {editProd} Price</Text>
                <Text style={[styles.modalSub, { color: colors.textMuted }]}>
                  Current: {editProd ? fmt((prices as any)[editProd] || 0) : '—'}/L
                </Text>
              </View>
            </View>
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>New Price per Litre (₦)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              keyboardType="numeric"
              value={draft}
              onChangeText={setDraft}
              placeholder="e.g. 950"
              placeholderTextColor={colors.textSubtle}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setEditProd(null)}>
                <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: PROD_COLORS[editProd || ''] || roleColor }]}
                onPress={handleSave}
              >
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.saveBtnText}>Save Price</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll:       { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 10, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  priceCard:    { width: '47%', borderRadius: 12, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  prodIcon:     { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  prodName:     { fontSize: 12, fontWeight: '500' },
  prodPrice:    { fontSize: 20, fontWeight: '700' },
  perL:         { fontSize: 11, marginTop: -4 },
  editBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, marginTop: 6 },
  editBtnText:  { fontSize: 12, fontWeight: '600' },
  histRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8 },
  histIcon:     { width: 42, height: 42, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  histProd:     { fontSize: 11, fontWeight: '700' },
  histMid:      { flex: 1, gap: 3 },
  histPrices:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  histOld:      { fontSize: 13, textDecorationLine: 'line-through' },
  histNew:      { fontSize: 13, fontWeight: '700' },
  histBy:       { fontSize: 11 },
  changeBadge:  { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  changeText:   { fontSize: 12, fontWeight: '700' },
  emptyBox:     { borderRadius: 12, borderWidth: 1, padding: 32, alignItems: 'center', gap: 8 },
  emptyText:    { fontSize: 14 },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modal:        { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 16 },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalIcon:    { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  modalTitle:   { fontSize: 16, fontWeight: '700' },
  modalSub:     { fontSize: 13, marginTop: 2 },
  inputLabel:   { fontSize: 13, fontWeight: '500', marginBottom: -8 },
  input:        { borderRadius: 10, borderWidth: 1, padding: 14, fontSize: 16 },
  modalBtns:    { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn:    { flex: 1, borderRadius: 10, borderWidth: 1, padding: 14, alignItems: 'center' },
  cancelText:   { fontSize: 15, fontWeight: '600' },
  saveBtn:      { flex: 2, borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
});
