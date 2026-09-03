import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { ScreenLayout } from '@/components/ScreenLayout';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import {
  ASSET_CATEGORIES,
  annualAssetDepreciation,
  monthlyAssetDepreciation,
  monthlyDepreciationTotal,
  type AssetCategory,
  type AssetInput,
  type CompanyAsset,
} from '@/lib/asset-depreciation';

const EMPTY_FORM: AssetInput = {
  name: '',
  category: 'Vehicles',
  branchId: '',
  initialCost: 0,
  endOfLifeValue: 0,
  usefulLifeYears: 1,
  acquiredOn: new Date().toISOString().slice(0, 10),
  notes: '',
};

function money(value: number) {
  return `₦${Math.round(value).toLocaleString()}`;
}

function numeric(value: string) {
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function AssetManagementScreen() {
  const {
    role, branches, companyAssets, addCompanyAsset, updateCompanyAsset, deleteCompanyAsset,
  } = useApp();
  const colors = useColors();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AssetInput>(EMPTY_FORM);
  const [expandedBranches, setExpandedBranches] = useState<Record<string, boolean>>({});
  const canManage = role === 'admin' || role === 'ceo' || role === 'md' || role === 'acc';
  const currentMonth = new Date().toISOString().slice(0, 7);

  const branchGroups = useMemo(() => branches
    .map(branch => ({
      branch,
      assets: companyAssets.filter(asset => asset.branchId === branch.id),
    }))
    .filter(group => group.assets.length > 0 || group.branch.st === 'Active'), [branches, companyAssets]);

  const totalCost = companyAssets.reduce((sum, asset) => sum + asset.initialCost, 0);
  const totalBookDepreciation = monthlyDepreciationTotal(companyAssets, currentMonth);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, branchId: branches.find(branch => branch.st === 'Active')?.id ?? '' });
    setShowForm(true);
  }

  function openEdit(asset: CompanyAsset) {
    setEditingId(asset.id);
    setForm({
      name: asset.name,
      category: asset.category,
      branchId: asset.branchId,
      initialCost: asset.initialCost,
      endOfLifeValue: asset.endOfLifeValue,
      usefulLifeYears: asset.usefulLifeYears,
      acquiredOn: asset.acquiredOn,
      notes: asset.notes ?? '',
    });
    setShowForm(true);
  }

  function save() {
    if (!form.name.trim() || !form.branchId || !form.acquiredOn.trim()) {
      Alert.alert('Missing information', 'Enter the asset name, branch and acquisition date.');
      return;
    }
    if (form.initialCost < 0 || form.endOfLifeValue < 0 || form.endOfLifeValue > form.initialCost) {
      Alert.alert('Invalid asset values', 'End-of-life value must be between zero and the initial cost.');
      return;
    }
    if (form.usefulLifeYears <= 0) {
      Alert.alert('Invalid useful life', 'Useful life must be greater than zero years.');
      return;
    }
    const payload = { ...form, name: form.name.trim(), notes: form.notes?.trim() };
    const saved = editingId ? updateCompanyAsset(editingId, payload) : addCompanyAsset(payload);
    if (!saved) {
      Alert.alert('Not permitted', 'Only Admin, CEO, Managing Director and Accountant can change the asset register.');
      return;
    }
    setShowForm(false);
    setEditingId(null);
  }

  function remove(asset: CompanyAsset) {
    Alert.alert('Delete asset?', `${asset.name} will be removed from the company asset register.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCompanyAsset(asset.id) },
    ]);
  }

  return (
    <ScreenLayout title="Asset Management">
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={styles.scroll}
        bottomOffset={72}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View>
            <Text style={styles.heroEyebrow}>COMPANY ASSET REGISTER</Text>
            <Text style={styles.heroTitle}>{companyAssets.length} assets across {branchGroups.length} branches</Text>
          </View>
          <View style={styles.heroMetrics}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Initial cost</Text>
              <Text style={styles.heroMetricValue}>{money(totalCost)}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Monthly depreciation</Text>
              <Text style={styles.heroMetricValue}>{money(totalBookDepreciation)}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.formulaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="calculator-outline" size={21} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={[styles.formulaTitle, { color: colors.text }]}>Straight-line depreciation</Text>
            <Text style={[styles.formulaText, { color: colors.textMuted }]}>
              Annual = (Initial cost − End-of-life value) ÷ Useful life
            </Text>
            <Text style={[styles.formulaText, { color: colors.textMuted }]}>
              Monthly = Annual depreciation ÷ 12
            </Text>
          </View>
        </View>

        {canManage && (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={showForm ? () => setShowForm(false) : openCreate}
            testID="asset-form-toggle"
          >
            <Ionicons name={showForm ? 'close' : 'add'} size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>{showForm ? 'Cancel' : 'Add asset'}</Text>
          </TouchableOpacity>
        )}

        {showForm && (
          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.formTitle, { color: colors.text }]}>{editingId ? 'Edit asset' : 'Register an asset'}</Text>
            <Text style={[styles.label, { color: colors.textMuted }]}>Asset name</Text>
            <TextInput value={form.name} onChangeText={name => setForm(prev => ({ ...prev, name }))} style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="e.g. Toyota Hilux" placeholderTextColor={colors.textSubtle} />

            <Text style={[styles.label, { color: colors.textMuted }]}>Category</Text>
            <View style={styles.chips}>
              {ASSET_CATEGORIES.map(category => (
                <TouchableOpacity key={category} onPress={() => setForm(prev => ({ ...prev, category }))} style={[styles.chip, { borderColor: form.category === category ? colors.primary : colors.border, backgroundColor: form.category === category ? colors.primary + '16' : colors.surface }]}>
                  <Text style={[styles.chipText, { color: form.category === category ? colors.primary : colors.textMuted }]}>{category}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.textMuted }]}>Branch</Text>
            <View style={styles.chips}>
              {branches.filter(branch => branch.st === 'Active').map(branch => (
                <TouchableOpacity key={branch.id} onPress={() => setForm(prev => ({ ...prev, branchId: branch.id }))} style={[styles.chip, { borderColor: form.branchId === branch.id ? colors.primary : colors.border, backgroundColor: form.branchId === branch.id ? colors.primary + '16' : colors.surface }]}>
                  <Text style={[styles.chipText, { color: form.branchId === branch.id ? colors.primary : colors.textMuted }]}>{branch.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.flex}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Initial cost</Text>
                <TextInput value={String(form.initialCost || '')} onChangeText={value => setForm(prev => ({ ...prev, initialCost: numeric(value) }))} keyboardType="numeric" style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="0" placeholderTextColor={colors.textSubtle} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.label, { color: colors.textMuted }]}>End-of-life value</Text>
                <TextInput value={String(form.endOfLifeValue || '')} onChangeText={value => setForm(prev => ({ ...prev, endOfLifeValue: numeric(value) }))} keyboardType="numeric" style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="0" placeholderTextColor={colors.textSubtle} />
              </View>
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.flex}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Useful life (years)</Text>
                <TextInput value={String(form.usefulLifeYears || '')} onChangeText={value => setForm(prev => ({ ...prev, usefulLifeYears: numeric(value) }))} keyboardType="decimal-pad" style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="1" placeholderTextColor={colors.textSubtle} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Acquisition date</Text>
                <TextInput value={form.acquiredOn} onChangeText={acquiredOn => setForm(prev => ({ ...prev, acquiredOn }))} style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSubtle} />
              </View>
            </View>
            <Text style={[styles.label, { color: colors.textMuted }]}>Notes</Text>
            <TextInput value={form.notes} onChangeText={notes => setForm(prev => ({ ...prev, notes }))} multiline style={[styles.input, styles.notes, { color: colors.text, borderColor: colors.border }]} placeholder="Optional asset details" placeholderTextColor={colors.textSubtle} />
            <View style={[styles.preview, { backgroundColor: colors.card }]}>
              <Text style={[styles.previewText, { color: colors.textMuted }]}>Annual depreciation: {money(annualAssetDepreciation(form))}</Text>
              <Text style={[styles.previewValue, { color: colors.primary }]}>Monthly: {money(monthlyAssetDepreciation(form))}</Text>
            </View>
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={save} testID="save-asset">
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Save asset</Text>
            </TouchableOpacity>
          </View>
        )}

        {branchGroups.map(({ branch, assets }) => {
          const expanded = expandedBranches[branch.id] !== false;
          const branchMonthly = monthlyDepreciationTotal(assets, currentMonth);
          const grouped = ASSET_CATEGORIES
            .map(category => ({ category, assets: assets.filter(asset => asset.category === category) }))
            .filter(group => group.assets.length > 0);
          return (
            <View key={branch.id} style={[styles.branchCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TouchableOpacity style={styles.branchHeader} onPress={() => setExpandedBranches(prev => ({ ...prev, [branch.id]: !expanded }))}>
                <View style={[styles.branchIcon, { backgroundColor: colors.primary + '16' }]}><Ionicons name="business-outline" size={19} color={colors.primary} /></View>
                <View style={styles.flex}>
                  <Text style={[styles.branchName, { color: colors.text }]}>{branch.name}</Text>
                  <Text style={[styles.branchMeta, { color: colors.textMuted }]}>{assets.length} assets · {money(branchMonthly)}/month</Text>
                </View>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
              </TouchableOpacity>
              {expanded && (
                <View style={styles.categories}>
                  {grouped.map(group => (
                    <View key={group.category}>
                      <Text style={[styles.categoryTitle, { color: colors.primary }]}>{group.category}</Text>
                      {group.assets.map(asset => (
                        <View key={asset.id} style={[styles.assetRow, { borderTopColor: colors.border }]}>
                          <View style={styles.flex}>
                            <Text style={[styles.assetName, { color: colors.text }]}>{asset.name}</Text>
                            <Text style={[styles.assetMeta, { color: colors.textMuted }]}>Cost {money(asset.initialCost)} · End value {money(asset.endOfLifeValue)} · {asset.usefulLifeYears} years</Text>
                            <Text style={[styles.assetDepreciation, { color: colors.primary }]}>{money(monthlyAssetDepreciation(asset))}/month · {money(annualAssetDepreciation(asset))}/year</Text>
                          </View>
                          {canManage && (
                            <View style={styles.actions}>
                              <TouchableOpacity onPress={() => openEdit(asset)} accessibilityLabel={`Edit ${asset.name}`}><Ionicons name="create-outline" size={19} color={colors.primary} /></TouchableOpacity>
                              <TouchableOpacity onPress={() => remove(asset)} accessibilityLabel={`Delete ${asset.name}`}><Ionicons name="trash-outline" size={19} color={colors.red} /></TouchableOpacity>
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  ))}
                  {assets.length === 0 && <Text style={[styles.empty, { color: colors.textMuted }]}>No assets registered for this branch.</Text>}
                </View>
              )}
            </View>
          );
        })}
      </KeyboardAwareScrollViewCompat>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },
  hero: { padding: 20, borderRadius: 22, gap: 18 },
  heroEyebrow: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  heroTitle: { color: '#fff', fontSize: 22, lineHeight: 28, fontWeight: '800', marginTop: 6 },
  heroMetrics: { flexDirection: 'row', gap: 12 },
  heroMetric: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.3)', paddingTop: 10 },
  heroMetricLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
  heroMetricValue: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 3 },
  formulaCard: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14 },
  formulaTitle: { fontSize: 14, fontWeight: '800' },
  formulaText: { fontSize: 11, lineHeight: 17, marginTop: 3 },
  flex: { flex: 1 },
  primaryButton: { minHeight: 48, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  formCard: { borderWidth: 1, borderRadius: 18, padding: 15, gap: 8 },
  formTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  label: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14 },
  notes: { minHeight: 76, paddingTop: 12, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  chipText: { fontSize: 11, fontWeight: '700' },
  fieldRow: { flexDirection: 'row', gap: 10 },
  preview: { padding: 12, borderRadius: 11, gap: 3 },
  previewText: { fontSize: 11 },
  previewValue: { fontSize: 14, fontWeight: '800' },
  branchCard: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  branchHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14 },
  branchIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  branchName: { fontSize: 15, fontWeight: '800' },
  branchMeta: { fontSize: 11, marginTop: 3 },
  categories: { paddingHorizontal: 14, paddingBottom: 14, gap: 12 },
  categoryTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 3 },
  assetRow: { flexDirection: 'row', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 11 },
  assetName: { fontSize: 13, fontWeight: '800' },
  assetMeta: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  assetDepreciation: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4 },
  empty: { fontSize: 12, textAlign: 'center', paddingVertical: 16 },
});