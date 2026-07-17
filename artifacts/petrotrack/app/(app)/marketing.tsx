import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ModalSheet } from '@/components/FormSheet';
import { ScreenLayout } from '@/components/ScreenLayout';
import { Prices, ROLE_COLORS, Role, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

// ─── Types ───────────────────────────────────────────────────────────────────

type Product = 'PMS' | 'AGO' | 'DPK' | 'LPG';

const PROD_UNIT: Record<Product, string> = {
  PMS: '/L', AGO: '/L', DPK: '/L', LPG: '/kg',
};

const PROD_COLOR: Record<Product, string> = {
  PMS: '#1a6e3c', AGO: '#185FA5', DPK: '#BA7517', LPG: '#0F6E56',
};

interface Competitor {
  id: string;
  name: string;
  location: string;
  pms: string;
  ago: string;
  dpk: string;
  lpg: string;
  updatedBy: string;
  updatedAt: string;
}

const STORAGE_KEY = 'marketCompetitors';

function parseNum(s: string): number {
  return parseFloat(s.replace(/,/g, '')) || 0;
}

// ─── Module-scope sub-components ─────────────────────────────────────────────
// All components here — never inside the render function (iOS keyboard rule).

type Colors = ReturnType<typeof useColors>;

function ProdTabBtn({
  prod, active, color, onPress,
}: { prod: Product; active: boolean; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.prodTab,
        { backgroundColor: active ? color : 'transparent', borderColor: active ? color : '#88888855' },
      ]}
    >
      <Text style={[styles.prodTabText, { color: active ? '#fff' : '#888' }]}>{prod}</Text>
    </TouchableOpacity>
  );
}

function DiffBadge({ ours, theirs }: { ours: number; theirs: number }) {
  if (!ours || !theirs) return null;
  const diff = ours - theirs;
  const pct = Math.round(Math.abs(diff / theirs) * 100);
  if (pct === 0) return (
    <View style={[styles.diffBadge, { backgroundColor: '#88888822' }]}>
      <Text style={[styles.diffText, { color: '#888' }]}>same</Text>
    </View>
  );
  const above = diff > 0;
  return (
    <View style={[styles.diffBadge, { backgroundColor: above ? '#e5393522' : '#1a6e3c22' }]}>
      <Ionicons name={above ? 'arrow-up' : 'arrow-down'} size={10} color={above ? '#e53935' : '#1a6e3c'} />
      <Text style={[styles.diffText, { color: above ? '#e53935' : '#1a6e3c' }]}>{pct}%</Text>
    </View>
  );
}

function CompetitorCard({
  item, ourPrice, prod, canEdit, colors, roleColor, onEdit, onDelete,
}: {
  item: Competitor; ourPrice: number; prod: Product; canEdit: boolean;
  colors: Colors; roleColor: string;
  onEdit: (c: Competitor) => void;
  onDelete: (id: string) => void;
}) {
  const key = prod.toLowerCase() as keyof Pick<Competitor, 'pms' | 'ago' | 'dpk' | 'lpg'>;
  const theirPrice = parseNum(item[key]);

  return (
    <View style={[styles.compCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.compName, { color: colors.text }]}>{item.name}</Text>
        {!!item.location && (
          <Text style={[styles.compLoc, { color: colors.textMuted }]}>
            <Ionicons name="location-outline" size={11} /> {item.location}
          </Text>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {(['pms', 'ago', 'dpk', 'lpg'] as const).map(p => {
            const v = parseNum(item[p]);
            if (!v) return null;
            const label = p.toUpperCase() as Product;
            const isActive = p === prod.toLowerCase();
            return (
              <View key={p} style={[styles.priceChip, {
                backgroundColor: isActive ? PROD_COLOR[label] + '22' : colors.background,
                borderColor:     isActive ? PROD_COLOR[label] + '66' : colors.border,
              }]}>
                <Text style={[styles.priceChipLabel, { color: isActive ? PROD_COLOR[label] : colors.textMuted }]}>{label}</Text>
                <Text style={[styles.priceChipVal,   { color: isActive ? PROD_COLOR[label] : colors.text   }]}>
                  ₦{v.toLocaleString()}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={[styles.compUpdated, { color: colors.textSubtle }]}>
          Updated by {item.updatedBy} · {item.updatedAt.slice(0, 10)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        {theirPrice > 0 && <DiffBadge ours={ourPrice} theirs={theirPrice} />}
        {canEdit && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity onPress={() => onEdit(item)} style={[styles.iconBtn, { borderColor: colors.border }]}>
              <Ionicons name="pencil" size={13} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDelete(item.id)} style={[styles.iconBtn, { borderColor: colors.errorBorder }]}>
              <Ionicons name="trash-outline" size={13} color={colors.error} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

function SuggestionCard({
  ourPrice, competitors, prod, colors, roleColor, onBroadcast, canBroadcast,
}: {
  ourPrice: number; competitors: Competitor[]; prod: Product;
  colors: Colors; roleColor: string;
  onBroadcast: () => void; canBroadcast: boolean;
}) {
  const key = prod.toLowerCase() as keyof Pick<Competitor, 'pms' | 'ago' | 'dpk' | 'lpg'>;
  const compPrices = competitors.map(c => parseNum(c[key])).filter(v => v > 0);
  const unit = PROD_UNIT[prod];

  if (!ourPrice) {
    return (
      <View style={[styles.suggCard, { backgroundColor: '#88888818', borderColor: '#88888833' }]}>
        <Ionicons name="alert-circle-outline" size={18} color="#888" />
        <Text style={[styles.suggText, { color: colors.textMuted }]}>
          Set our {prod} selling price in the Prices screen to see market analysis.
        </Text>
      </View>
    );
  }

  if (compPrices.length === 0) {
    return (
      <View style={[styles.suggCard, { backgroundColor: '#88888818', borderColor: '#88888833' }]}>
        <Ionicons name="analytics-outline" size={18} color="#888" />
        <Text style={[styles.suggText, { color: colors.textMuted }]}>
          Add competitor {prod} prices below to unlock price analysis and marketing suggestions.
        </Text>
      </View>
    );
  }

  const avg    = Math.round(compPrices.reduce((a, b) => a + b, 0) / compPrices.length);
  const minP   = Math.min(...compPrices);
  const maxP   = Math.max(...compPrices);
  const diffAvg = ourPrice - avg;
  const priceStr = `₦${ourPrice.toLocaleString()}${unit}`;

  let icon: string, bg: string, border: string, textColor: string, title: string, body: string;

  if (ourPrice <= minP) {
    icon = 'trophy-outline'; bg = '#1a6e3c18'; border = '#1a6e3c44'; textColor = '#1a6e3c';
    title = 'Best Price in Market!';
    body  = `We offer the lowest ${prod} price at ${priceStr} — ₦${(minP - ourPrice).toLocaleString()} cheaper than the next competitor. Broadcast this to attract fleet buyers and retail customers now!`;
  } else if (diffAvg <= 0) {
    icon = 'thumbs-up-outline'; bg = '#185FA518'; border = '#185FA544'; textColor = '#185FA5';
    title = 'Competitive Positioning';
    body  = `Our ${prod} price (${priceStr}) is ₦${Math.abs(diffAvg).toLocaleString()} below market average (₦${avg.toLocaleString()}). Well-positioned — push targeted promotions for fleet, corporate, and bulk accounts.`;
  } else if (diffAvg / avg <= 0.03) {
    icon = 'information-circle-outline'; bg = '#BA751718'; border = '#BA751744'; textColor = '#BA7517';
    title = 'Slight Premium';
    body  = `Our ${prod} price is ₦${diffAvg.toLocaleString()} above market average. Emphasise service quality, fast dispensing, genuine product, and loyalty rewards to justify the premium.`;
  } else {
    icon = 'warning-outline'; bg = '#e5393518'; border = '#e5393544'; textColor = '#e53935';
    title = 'Above Market — Action Needed';
    body  = `We're ₦${diffAvg.toLocaleString()} above the ${prod} market average (₦${avg.toLocaleString()}${unit}). Consider a price review, bundle promotion, or loyalty programme to retain customers.`;
  }

  return (
    <View style={{ gap: 10 }}>
      {/* Stats row */}
      <View style={[styles.statsBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {[
          { label: 'Our Price', val: `₦${ourPrice.toLocaleString()}`, color: roleColor },
          { label: 'Mkt Min',   val: `₦${minP.toLocaleString()}`,    color: '#1a6e3c' },
          { label: 'Mkt Avg',   val: `₦${avg.toLocaleString()}`,     color: colors.text },
          { label: 'Mkt Max',   val: `₦${maxP.toLocaleString()}`,    color: '#e53935' },
        ].map((s, i) => (
          <View
            key={s.label}
            style={[styles.statCell, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}
          >
            <Text style={[styles.statVal,   { color: s.color }]}>{s.val}</Text>
            <Text style={[styles.statLabel, { color: colors.textSubtle }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Suggestion */}
      <View style={[styles.suggCard, { backgroundColor: bg, borderColor: border }]}>
        <Ionicons name={icon as any} size={20} color={textColor} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.suggTitle, { color: textColor }]}>{title}</Text>
          <Text style={[styles.suggText, { color: colors.text }]}>{body}</Text>
        </View>
      </View>

      {/* Broadcast button */}
      {canBroadcast && (
        <TouchableOpacity onPress={onBroadcast} style={[styles.broadcastBtn, { backgroundColor: roleColor }]} activeOpacity={0.85}>
          <Ionicons name="megaphone-outline" size={16} color="#fff" />
          <Text style={styles.broadcastBtnText}>Publish Price Intelligence to Staff</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function FieldBlock({
  label, value, onChangeText, keyboardType = 'decimal-pad', placeholder = '', colors,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'decimal-pad'; placeholder?: string; colors: Colors;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || '—'}
        placeholderTextColor={colors.textSubtle}
        keyboardType={keyboardType}
      />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MarketingScreen() {
  const { role, userName, prices, addBroadcast } = useApp();
  const colors   = useColors();
  const roleColor = ROLE_COLORS[role || 'mktg'] || colors.primary;

  const [prodTab,      setProdTab]      = useState<Product>('PMS');
  const [competitors,  setCompetitors]  = useState<Competitor[]>([]);
  const [loaded,       setLoaded]       = useState(false);

  /* form state */
  const [showForm,  setShowForm]  = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName,     setFName]     = useState('');
  const [fLoc,      setFLoc]      = useState('');
  const [fPms,      setFPms]      = useState('');
  const [fAgo,      setFAgo]      = useState('');
  const [fDpk,      setFDpk]      = useState('');
  const [fLpg,      setFLpg]      = useState('');

  const isCSM   = role === 'csm';
  const isMktg  = role === 'mktg';
  const isAdmin = role === 'admin';
  const canEdit      = isCSM || isMktg || isAdmin;
  const canBroadcast = isCSM || isMktg || isAdmin;

  /* load / save competitors */
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val) {
        try { setCompetitors(JSON.parse(val)); } catch { /* ignore */ }
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(competitors));
  }, [competitors, loaded]);

  const ourPrice: number = (prices as unknown as Record<string, number>)[prodTab] || 0;

  /* ── form helpers ── */
  function openAdd() {
    setEditingId(null);
    setFName(''); setFLoc(''); setFPms(''); setFAgo(''); setFDpk(''); setFLpg('');
    setShowForm(true);
  }

  function openEdit(c: Competitor) {
    setEditingId(c.id);
    setFName(c.name); setFLoc(c.location);
    setFPms(c.pms);  setFAgo(c.ago);
    setFDpk(c.dpk);  setFLpg(c.lpg);
    setShowForm(true);
  }

  function handleSave() {
    if (!fName.trim()) { Alert.alert('Required', 'Station name is required.'); return; }
    const now = new Date().toISOString();
    if (editingId) {
      setCompetitors(prev => prev.map(c =>
        c.id === editingId
          ? { ...c, name: fName.trim(), location: fLoc.trim(), pms: fPms, ago: fAgo, dpk: fDpk, lpg: fLpg, updatedBy: userName || 'CSM', updatedAt: now }
          : c
      ));
    } else {
      const nc: Competitor = {
        id: String(Date.now()),
        name: fName.trim(), location: fLoc.trim(),
        pms: fPms, ago: fAgo, dpk: fDpk, lpg: fLpg,
        updatedBy: userName || 'CSM', updatedAt: now,
      };
      setCompetitors(prev => [nc, ...prev]);
    }
    setShowForm(false);
  }

  function handleDelete(id: string) {
    Alert.alert('Remove Station', 'Remove this competitor from the list?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setCompetitors(prev => prev.filter(c => c.id !== id)) },
    ]);
  }

  function handleBroadcast() {
    const key = prodTab.toLowerCase() as keyof Pick<Competitor, 'pms' | 'ago' | 'dpk' | 'lpg'>;
    const compPrices = competitors.map(c => parseNum(c[key])).filter(v => v > 0);
    const avg  = compPrices.length > 0 ? Math.round(compPrices.reduce((a, b) => a + b, 0) / compPrices.length) : 0;
    const minP = compPrices.length > 0 ? Math.min(...compPrices) : 0;
    const unit = PROD_UNIT[prodTab];
    const count = compPrices.length;

    let verdict = '';
    if (ourPrice && avg) {
      verdict = ourPrice <= minP ? '✅ We have the BEST price in the market!'
        : ourPrice < avg        ? '✅ We are below the market average.'
        : ourPrice === avg      ? '➡️ We are at the market average.'
        :                         '⚠️ We are above the market average.';
    }

    const body = [
      `📊 ${prodTab} Market Intelligence Report`,
      `📍 ${count} competitor station${count !== 1 ? 's' : ''} surveyed`,
      ``,
      `Our Selling Price: ₦${ourPrice.toLocaleString()}${unit}`,
      avg ? `Market Average:    ₦${avg.toLocaleString()}${unit}` : '',
      avg ? `Market Minimum:    ₦${minP.toLocaleString()}${unit}` : '',
      verdict ? `\n${verdict}` : '',
    ].filter(Boolean).join('\n');

    Alert.alert(
      'Publish to Staff',
      `Send this market intelligence update to all staff via Comms broadcasts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          onPress: () => {
            addBroadcast({
              from:         role!,
              fromName:     userName || 'Marketing',
              title:        `Market Intelligence — ${prodTab} Update`,
              body,
              audience:     'all',
              audienceName: 'All Staff',
            });
            Alert.alert('Published!', 'Price intelligence has been broadcast to all staff via Comms.');
          },
        },
      ]
    );
  }

  /* ── UI ── */
  return (
    <ScreenLayout title="Marketing">
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={[styles.heroCard, { backgroundColor: roleColor }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>Market Intelligence</Text>
            <Text style={styles.heroSub}>Competitor tracking · Price analysis · Broadcast</Text>
          </View>
          <Ionicons name="analytics" size={32} color="rgba(255,255,255,0.3)" />
        </View>

        {/* Product tabs — PMS | AGO | DPK | LPG */}
        <View style={styles.prodTabs}>
          {(['PMS', 'AGO', 'DPK', 'LPG'] as const).map(p => (
            <ProdTabBtn
              key={p}
              prod={p}
              active={prodTab === p}
              color={PROD_COLOR[p]}
              onPress={() => setProdTab(p)}
            />
          ))}
        </View>

        {/* Our price card */}
        <View style={[styles.ourPriceCard, { backgroundColor: PROD_COLOR[prodTab] + '12', borderColor: PROD_COLOR[prodTab] + '44' }]}>
          <View style={[styles.prodDot, { backgroundColor: PROD_COLOR[prodTab] }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.ourPriceLabel, { color: colors.textMuted }]}>Our Current {prodTab} Price</Text>
            <Text style={[styles.ourPriceVal, { color: PROD_COLOR[prodTab] }]}>
              {ourPrice > 0 ? `₦${ourPrice.toLocaleString()}${PROD_UNIT[prodTab]}` : 'Not set'}
            </Text>
          </View>
          {ourPrice === 0 && (
            <Text style={[styles.setPriceHint, { color: colors.textMuted }]}>Set in Prices screen →</Text>
          )}
        </View>

        {/* Analysis & Suggestions */}
        <View style={styles.sectionRow}>
          <Ionicons name="bulb-outline" size={15} color={roleColor} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Analysis & Suggestions</Text>
        </View>

        <SuggestionCard
          ourPrice={ourPrice}
          competitors={competitors}
          prod={prodTab}
          colors={colors}
          roleColor={roleColor}
          onBroadcast={handleBroadcast}
          canBroadcast={canBroadcast}
        />

        {/* Competitor list */}
        <View style={[styles.sectionRow, { marginTop: 22 }]}>
          <Ionicons name="business-outline" size={15} color={roleColor} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Competitor Stations</Text>
          {canEdit && (
            <TouchableOpacity onPress={openAdd} style={[styles.addBtn, { backgroundColor: roleColor }]}>
              <Ionicons name="add" size={15} color="#fff" />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>

        {competitors.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="business-outline" size={36} color={colors.textSubtle} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No competitor data yet</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              {canEdit
                ? 'Tap "Add" to record a competitor station\'s prices for all products.'
                : 'CSM or Marketing will add competitor station data here.'}
            </Text>
          </View>
        ) : (
          competitors.map(c => (
            <CompetitorCard
              key={c.id}
              item={c}
              ourPrice={ourPrice}
              prod={prodTab}
              canEdit={canEdit}
              colors={colors}
              roleColor={roleColor}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))
        )}

        <View style={{ height: 28 }} />
      </ScrollView>

      {/* ── Add / Edit Competitor Modal ── */}
      <ModalSheet visible={showForm} onClose={() => setShowForm(false)}>
        <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <View style={[styles.modalIconBox, { backgroundColor: roleColor + '18' }]}>
              <Ionicons name="business-outline" size={20} color={roleColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingId ? 'Edit Competitor' : 'Add Competitor Station'}
              </Text>
              <Text style={[styles.modalSub, { color: colors.textMuted }]}>
                Leave a price blank if that product is not sold there
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowForm(false)}>
              <Ionicons name="close-circle" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="none" showsVerticalScrollIndicator={false}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Station Name *</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={fName}
              onChangeText={setFName}
              placeholder="e.g. TotalEnergies VI, NNPCL Kano"
              placeholderTextColor={colors.textSubtle}
              autoCapitalize="words"
            />

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Location / Landmark</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={fLoc}
              onChangeText={setFLoc}
              placeholder="e.g. Ahmadu Bello Way, V/I"
              placeholderTextColor={colors.textSubtle}
            />

            <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 10, fontWeight: '700', fontSize: 12 }]}>
              Prices (₦)
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <FieldBlock label="PMS ₦/L"  value={fPms} onChangeText={setFPms} colors={colors} />
              <FieldBlock label="AGO ₦/L"  value={fAgo} onChangeText={setFAgo} colors={colors} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
              <FieldBlock label="DPK ₦/L"  value={fDpk} onChangeText={setFDpk} colors={colors} />
              <FieldBlock label="LPG ₦/kg" value={fLpg} onChangeText={setFLpg} colors={colors} />
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={handleSave}
                style={[styles.saveBtn, { backgroundColor: roleColor, flex: 1 }]}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                <Text style={styles.saveBtnText}>{editingId ? 'Save Changes' : 'Add Station'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowForm(false)}
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 16 }} />
          </ScrollView>
        </View>
      </ModalSheet>
    </ScreenLayout>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll:         { padding: 16 },

  heroCard:       { borderRadius: 16, padding: 20, marginBottom: 16, flexDirection: 'row', alignItems: 'center' },
  heroLabel:      { color: '#fff', fontSize: 19, fontWeight: '800' },
  heroSub:        { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 3 },

  prodTabs:       { flexDirection: 'row', gap: 8, marginBottom: 14 },
  prodTab:        { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1.5 },
  prodTabText:    { fontSize: 13, fontWeight: '800' },

  prodDot:        { width: 10, height: 10, borderRadius: 5 },
  ourPriceCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 20 },
  ourPriceLabel:  { fontSize: 12, marginBottom: 2 },
  ourPriceVal:    { fontSize: 24, fontWeight: '800' },
  setPriceHint:   { fontSize: 11 },

  sectionRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle:   { fontSize: 14, fontWeight: '700', flex: 1 },
  addBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addBtnText:     { color: '#fff', fontSize: 13, fontWeight: '700' },

  statsBar:       { flexDirection: 'row', borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  statCell:       { flex: 1, alignItems: 'center', paddingVertical: 10 },
  statVal:        { fontSize: 14, fontWeight: '700' },
  statLabel:      { fontSize: 10, marginTop: 2 },

  suggCard:       { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'flex-start' },
  suggTitle:      { fontSize: 13, fontWeight: '700', marginBottom: 3 },
  suggText:       { fontSize: 13, lineHeight: 19 },

  broadcastBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12 },
  broadcastBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  compCard:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  compName:       { fontSize: 14, fontWeight: '600' },
  compLoc:        { fontSize: 11 },
  priceChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  priceChipLabel: { fontSize: 10, fontWeight: '700' },
  priceChipVal:   { fontSize: 12, fontWeight: '600' },
  compUpdated:    { fontSize: 10, marginTop: 4 },

  diffBadge:      { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  diffText:       { fontSize: 11, fontWeight: '700' },

  iconBtn:        { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  emptyBox:       { alignItems: 'center', paddingVertical: 36, gap: 8, borderRadius: 14, borderWidth: 1, marginBottom: 14 },
  emptyTitle:     { fontSize: 15, fontWeight: '700' },
  emptySub:       { fontSize: 13, textAlign: 'center', paddingHorizontal: 24, lineHeight: 18 },

  modalCard:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 12, maxHeight: '92%' },
  modalHeader:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  modalIconBox:   { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalTitle:     { fontSize: 16, fontWeight: '700' },
  modalSub:       { fontSize: 12, marginTop: 1 },
  fieldLabel:     { fontSize: 11, fontWeight: '600', marginBottom: 6 },
  fieldInput:     { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 4 },

  saveBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  saveBtnText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn:      { paddingHorizontal: 18, paddingVertical: 13, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText:  { fontSize: 14, fontWeight: '600' },
});
