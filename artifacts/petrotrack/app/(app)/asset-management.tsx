import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { ScreenLayout } from '@/components/ScreenLayout';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import {
  ASSET_CATEGORIES,
  annualAssetDepreciation,
  assetQuantity,
  monthlyAssetDepreciation,
  monthlyDepreciationTotal,
  type AssetInput,
  type CompanyAsset,
} from '@/lib/asset-depreciation';

const EMPTY_FORM: AssetInput = {
  name: '',
  category: 'Vehicles',
  branchId: '',
  quantity: 1,
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
    role, branchId, branches, companyAssets, addCompanyAsset, updateCompanyAsset, deleteCompanyAsset,
    companyAssetSaveError, clearCompanyAssetSaveError,
  } = useApp();
  const colors = useColors();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AssetInput>(EMPTY_FORM);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [expandedBranches, setExpandedBranches] = useState<Record<string, boolean>>({});
  const canManageAllBranches =
    role === 'admin' || role === 'ceo' || role === 'md' ||
    role === 'acc' || role === 'csm' || role === 'mktg';
  const isBranchManager = role === 'mgr';
  const canManage = canManageAllBranches || (isBranchManager && !!branchId);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const activeBranches = useMemo(() => branches.filter(branch => branch.st === 'Active'), [branches]);
  const effectiveBranchId = isBranchManager ? branchId ?? '' : selectedBranchId;
  const selectedBranch = activeBranches.find(branch => branch.id === effectiveBranchId);
  const visibleAssets = isBranchManager
    ? companyAssets.filter(asset => asset.branchId === branchId)
    : companyAssets;

  useEffect(() => {
    if (!companyAssetSaveError) return;
    Alert.alert('Asset save failed', companyAssetSaveError.message);
    clearCompanyAssetSaveError();
  }, [clearCompanyAssetSaveError, companyAssetSaveError]);

  const branchGroups = useMemo(() => branches
    .filter(branch => !isBranchManager || branch.id === branchId)
    .map(branch => ({
      branch,
      assets: companyAssets.filter(asset => asset.branchId === branch.id),
    }))
    .filter(group => group.assets.length > 0 || group.branch.st === 'Active'), [branches, companyAssets, isBranchManager, branchId]);

  const totalCost = visibleAssets.reduce((sum, asset) => sum + (asset.initialCost * assetQuantity(asset)), 0);
  const totalBookDepreciation = monthlyDepreciationTotal(visibleAssets, currentMonth);

  function openCreate() {
    if (!effectiveBranchId || !selectedBranch) {
      Alert.alert('Select a branch', 'Choose the branch that owns this asset before adding it.');
      return;
    }
    setEditingId(null);
    setForm({ ...EMPTY_FORM, branchId: effectiveBranchId });
    setShowForm(true);
  }

  function openEdit(asset: CompanyAsset) {
    if (!canManageAllBranches && asset.branchId !== branchId) return;
    if (canManageAllBranches) setSelectedBranchId(asset.branchId);
    setEditingId(asset.id);
    setForm({
      name: asset.name,
      category: asset.category,
      branchId: asset.branchId,
      quantity: assetQuantity(asset),
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
    const quantity = form.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1) {
      Alert.alert('Invalid asset number', 'Number of assets must be a whole number greater than zero.');
      return;
    }
    const savedBranchId = editingId
      ? companyAssets.find(asset => asset.id === editingId)?.branchId
      : effectiveBranchId;
    if (!savedBranchId || (isBranchManager && savedBranchId !== branchId)) {
      Alert.alert('Branch not permitted', 'This asset must be saved to your assigned branch.');
      return;
    }
    const payload = {
      ...form,
      branchId: savedBranchId,
      quantity,
      name: form.name.trim(),
      notes: form.notes?.trim(),
    };
    const saved = editingId ? updateCompanyAsset(editingId, payload) : addCompanyAsset(payload);
    if (!saved) {
      Alert.alert('Not permitted', 'This account can only change assets in its assigned branch.');
      return;
    }
    setShowForm(false);
    setEditingId(null);
  }

  function remove(asset: CompanyAsset) {
    if (!canManageAllBranches && asset.branchId !== branchId) return;
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
            <Text style={styles.heroTitle}>{visibleAssets.reduce((sum, asset) => sum + assetQuantity(asset), 0)} assets across {branchGroups.length} branches</Text>
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
          <View style={[styles.branchPickerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.branchPickerHeading}>
              <View style={[styles.branchPickerIcon, { backgroundColor: colors.primary + '16' }]}>
                <Ionicons name="business-outline" size={19} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.branchPickerTitle, { color: colors.text }]}>
                  {isBranchManager ? 'Your branch' : 'Select a branch'}
                </Text>
                <Text style={[styles.branchPickerText, { color: colors.textMuted }]}>
                  {isBranchManager
                    ? 'Assets you add are permanently assigned to your branch.'
                    : 'Choose the owning branch before opening the asset form.'}
                </Text>
              </View>
            </View>
            {isBranchManager ? (
              <View style={[styles.selectedBranchCard, { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]}>
                <Ionicons name="location-outline" size={16} color={colors.primary} />
                <Text style={[styles.selectedBranchText, { color: colors.primary }]}>
                  {selectedBranch?.name ?? 'No assigned active branch'}
                </Text>
              </View>
            ) : (
              <View style={styles.chips}>
                {activeBranches.map(branch => (
                  <TouchableOpacity
                    key={branch.id}
                    onPress={() => {
                      setSelectedBranchId(branch.id);
                      setExpandedBranches(prev => ({ ...prev, [branch.id]: true }));
                    }}
                    disabled={showForm}
                    accessibilityLabel={`Select ${branch.name} for asset registration`}
                    style={[styles.chip, {
                      borderColor: selectedBranchId === branch.id ? colors.primary : colors.border,
                      backgroundColor: selectedBranchId === branch.id ? colors.primary + '16' : colors.surface,
                      opacity: showForm && selectedBranchId !== branch.id ? 0.55 : 1,
                    }]}
                  >
                    <Text style={[styles.chipText, { color: selectedBranchId === branch.id ? colors.primary : colors.textMuted }]}>{branch.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TouchableOpacity
              style={[styles.primaryButton, {
                backgroundColor: colors.primary,
                opacity: showForm || selectedBranch ? 1 : 0.45,
              }]}
              onPress={showForm ? () => {
                setShowForm(false);
                setEditingId(null);
              } : openCreate}
              disabled={!showForm && !selectedBranch}
              testID="asset-form-toggle"
            >
              <Ionicons name={showForm ? 'close' : 'add'} size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>
                {showForm ? 'Cancel' : selectedBranch ? `Add asset to ${selectedBranch.name}` : 'Select a branch first'}
              </Text>
            </TouchableOpacity>
          </View>
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

            <Text style={[styles.label, { color: colors.textMuted }]}>Owning branch</Text>
            <View style={[styles.selectedBranchCard, { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]}>
              <Ionicons name="lock-closed-outline" size={15} color={colors.primary} />
              <View style={styles.flex}>
                <Text style={[styles.selectedBranchText, { color: colors.primary }]}>
                  {branches.find(branch => branch.id === form.branchId)?.name ?? 'Branch unavailable'}
                </Text>
                <Text style={[styles.branchLockText, { color: colors.textMuted }]}>
                  Branch ownership is locked after saving. Delete and register again to move an asset.
                </Text>
              </View>
            </View>

            <View>
              <View style={styles.flex}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Number of assets</Text>
                <View style={styles.quantityControl}>
                  <TouchableOpacity
                    onPress={() => setForm(prev => ({ ...prev, quantity: Math.max(1, (prev.quantity ?? 1) - 1) }))}
                    style={[styles.quantityButton, { borderColor: colors.border }]}
                    accessibilityLabel="Decrease number of assets"
                  >
                    <Ionicons name="remove" size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <TextInput
                    value={String(form.quantity ?? 1)}
                    onChangeText={value => setForm(prev => ({ ...prev, quantity: Math.max(0, Math.floor(numeric(value))) }))}
                    keyboardType="number-pad"
                    style={[styles.quantityInput, { color: colors.text, borderColor: colors.border }]}
                    accessibilityLabel="Number of assets"
                  />
                  <TouchableOpacity
                    onPress={() => setForm(prev => ({ ...prev, quantity: (prev.quantity ?? 1) + 1 }))}
                    style={[styles.quantityButton, { borderColor: colors.border }]}
                    accessibilityLabel="Increase number of assets"
                  >
                    <Ionicons name="add" size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.flex}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Initial cost</Text>
                <TextInput value={String(form.initialCost || '')} onChangeText={value => setForm(prev => ({ ...prev, initialCost: numeric(value) }))} keyboardType="numeric" style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Per unit" placeholderTextColor={colors.textSubtle} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.label, { color: colors.textMuted }]}>End value / unit</Text>
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
              <Text style={[styles.previewText, { color: colors.textMuted }]}>Annual depreciation per unit: {money(annualAssetDepreciation(form))}</Text>
              <Text style={[styles.previewValue, { color: colors.primary }]}>Monthly total ({form.quantity ?? 1} units): {money(monthlyAssetDepreciation(form) * (form.quantity ?? 1))}</Text>
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
          const branchQuantity = assets.reduce((sum, asset) => sum + assetQuantity(asset), 0);
          const grouped = ASSET_CATEGORIES
            .map(category => ({ category, assets: assets.filter(asset => asset.category === category) }))
            .filter(group => group.assets.length > 0);
          return (
            <View key={branch.id} style={[styles.branchCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TouchableOpacity style={styles.branchHeader} onPress={() => setExpandedBranches(prev => ({ ...prev, [branch.id]: !expanded }))}>
                <View style={[styles.branchIcon, { backgroundColor: colors.primary + '16' }]}><Ionicons name="business-outline" size={19} color={colors.primary} /></View>
                <View style={styles.flex}>
                  <Text style={[styles.branchName, { color: colors.text }]}>{branch.name}</Text>
                  <Text style={[styles.branchMeta, { color: colors.textMuted }]}>{branchQuantity} assets · {money(branchMonthly)}/month</Text>
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
                            <Text style={[styles.assetName, { color: colors.text }]}>{asset.name} <Text style={[styles.quantityBadge, { color: colors.primary }]}>×{assetQuantity(asset)}</Text></Text>
                            <Text style={[styles.assetMeta, { color: colors.textMuted }]}>Per unit: {money(asset.initialCost)} · End value {money(asset.endOfLifeValue)} · {asset.usefulLifeYears} years</Text>
                            <Text style={[styles.assetDepreciation, { color: colors.primary }]}>{money(monthlyAssetDepreciation(asset) * assetQuantity(asset))}/month total · {money(annualAssetDepreciation(asset) * assetQuantity(asset))}/year total</Text>
                          </View>
                          {(canManageAllBranches || (isBranchManager && asset.branchId === branchId)) && (
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
  branchPickerCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 12 },
  branchPickerHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  branchPickerIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  branchPickerTitle: { fontSize: 15, fontWeight: '800' },
  branchPickerText: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  selectedBranchCard: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectedBranchText: { fontSize: 13, fontWeight: '800' },
  branchLockText: { fontSize: 10, lineHeight: 14, marginTop: 2 },
  formCard: { borderWidth: 1, borderRadius: 18, padding: 15, gap: 8 },
  formTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  label: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14 },
  notes: { minHeight: 76, paddingTop: 12, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  chipText: { fontSize: 11, fontWeight: '700' },
  fieldRow: { flexDirection: 'row', gap: 10 },
  quantityControl: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  quantityButton: { width: 40, height: 46, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  quantityInput: { flex: 1, minWidth: 45, height: 46, borderWidth: 1, borderRadius: 11, textAlign: 'center', fontSize: 14, fontWeight: '800' },
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
  quantityBadge: { fontSize: 12, fontWeight: '900' },
  assetMeta: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  assetDepreciation: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4 },
  empty: { fontSize: 12, textAlign: 'center', paddingVertical: 16 },
});