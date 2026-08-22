import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Alert, Modal, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';

import {
  businessDateKey,
  calculateBusinessMonthRevenue,
  calendarMonthBusinessDateRange,
  fmt,
  fmtDateTime,
  getCurrentTankStock,
  isRevenueReportStatus,
  useApp,
  type BankLoan,
} from '@/context/AppContext';
import { computePumpReportCOGS, getLastKnownCostPrice } from '@/lib/report-helpers';
import { useColors } from '@/hooks/useColors';

const PROD_COLOR: Record<string, string> = {
  PMS: '#185FA5', AGO: '#BA7517', DPK: '#6B4F9E', LPG: '#1a6e3c', 'Lube Oil': '#A32D2D',
};
const PROD_UNIT: Record<string, string> = {
  PMS: 'L', AGO: 'L', DPK: 'L', LPG: 'kg', 'Lube Oil': 'L',
};

/* ─── helpers ─── */
function Row({ label, value, color, indent, bold }: {
  label: string; value: string; color?: string; indent?: boolean; bold?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[fStyles.row, indent && fStyles.rowIndent]}>
      <Text style={[fStyles.rowLabel, { color: colors.textMuted }, bold && { fontWeight: '700', color: colors.text }]}>{label}</Text>
      <Text style={[fStyles.rowValue, { color: color ?? colors.text }, bold && { fontWeight: '800' }]}>{value}</Text>
    </View>
  );
}

/* ─── Edit modal for ACC ─── */
function EditModal({
  visible, onClose, entry, onSave, canSeedStartupCapital, currentMonthKey,
}: {
  visible: boolean;
  onClose: () => void;
  entry: ReturnType<typeof useApp>['financialEntry'];
  onSave: (updates: Partial<typeof entry>) => void;
  canSeedStartupCapital: boolean;
  currentMonthKey: string;
}) {
  const colors = useColors();

  const [cashInBank, setCashInBank]           = useState(String(entry.cashInBank));
  const [posValue, setPosValue]               = useState(String(entry.posValue));
  const [goodsOnTransit, setGoodsOnTransit]   = useState(String(entry.goodsOnTransit));
  const [cashInHand, setCashInHand]           = useState(String(entry.cashInHand));
  const [debts, setDebts]                     = useState(String(entry.debtsFromCustomers));
  const [liabilities, setLiabilities]        = useState(String(entry.liabilities));
  const [startupCapital, setStartupCapital]   = useState(String(entry.startupCapital ?? 0));
  const [loans, setLoans]                     = useState<BankLoan[]>(entry.bankLoans.length ? entry.bankLoans : [{ bank: '', amount: 0 }]);

  function n(v: string) { return parseFloat(v) || 0; }

  function addLoan() { setLoans(l => [...l, { bank: '', amount: 0 }]); }
  function updateLoan(i: number, field: 'bank' | 'amount', val: string) {
    setLoans(l => l.map((x, j) => j === i ? { ...x, [field]: field === 'amount' ? (parseFloat(val) || 0) : val } : x));
  }
  function removeLoan(i: number) { setLoans(l => l.filter((_, j) => j !== i)); }

  function handleSave() {
    onSave({
      cashInBank: n(cashInBank), posValue: n(posValue),
      goodsOnTransit: n(goodsOnTransit), cashInHand: n(cashInHand),
      debtsFromCustomers: n(debts),
      bankLoans: loans.filter(l => l.bank.trim()),
      liabilities: n(liabilities),
      ...(canSeedStartupCapital ? {
        startupCapital: n(startupCapital),
        startupCapitalMonth: currentMonthKey,
        startupCapitalSource: 'admin' as const,
      } : {}),
    });
    onClose();
  }

  const field = (label: string, val: string, set: (v: string) => void) => (
    <View key={label} style={fStyles.editField}>
      <Text style={[fStyles.editLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={[fStyles.editInputRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text style={[fStyles.naira, { color: colors.textMuted }]}>₦</Text>
        <TextInput
          value={val} onChangeText={set} keyboardType="numeric"
          style={[fStyles.editInput, { color: colors.text }]}
          placeholderTextColor={colors.textMuted} placeholder="0"
        />
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[fStyles.modalHeader, { backgroundColor: '#0C447C', paddingTop: 52 }]}>
          <TouchableOpacity onPress={onClose} style={fStyles.headerBack}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={fStyles.modalTitle}>Financial Entries</Text>
        </View>
        <ScrollView contentContainerStyle={fStyles.modalScroll} keyboardShouldPersistTaps="handled">
          <Text style={[fStyles.editSection, { color: colors.text }]}>Manual Financial Data</Text>
          {field('Cash in Bank', cashInBank, setCashInBank)}
          {field('POS Value (cash at POS terminals)', posValue, setPosValue)}
          {field('Cost of Goods on Transit', goodsOnTransit, setGoodsOnTransit)}
          {field('Cash in Hand', cashInHand, setCashInHand)}
          {field('Debts Owed by Customers', debts, setDebts)}
          {canSeedStartupCapital && (
            <>
              {field('Start-up Capital (current month opening)', startupCapital, setStartupCapital)}
              <Text style={[fStyles.editHint, { color: colors.textMuted }]}>
                This seeds the current month. Future months roll over the previous month’s closing operating capital automatically.
              </Text>
            </>
          )}
          {field('Total Liabilities', liabilities, setLiabilities)}

          <Text style={[fStyles.editSection, { color: colors.text, marginTop: 16 }]}>Bank Loans</Text>
          {loans.map((loan, i) => (
            <View key={i} style={[fStyles.loanRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                value={loan.bank} onChangeText={v => updateLoan(i, 'bank', v)}
                placeholder="Bank name" placeholderTextColor={colors.textMuted}
                style={[fStyles.loanBank, { color: colors.text, borderBottomColor: colors.border }]}
              />
              <View style={fStyles.loanAmtRow}>
                <Text style={[fStyles.naira, { color: colors.textMuted }]}>₦</Text>
                <TextInput
                  value={String(loan.amount || '')} onChangeText={v => updateLoan(i, 'amount', v)}
                  placeholder="0" placeholderTextColor={colors.textMuted}
                  keyboardType="numeric" style={[fStyles.loanAmt, { color: colors.text }]}
                />
                {loans.length > 1 && (
                  <TouchableOpacity onPress={() => removeLoan(i)}>
                    <Ionicons name="trash-outline" size={16} color="#791F1F" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={addLoan} style={[fStyles.addLoanBtn, { borderColor: '#0C447C' }]}>
            <Ionicons name="add" size={14} color="#0C447C" />
            <Text style={[fStyles.addLoanText, { color: '#0C447C' }]}>Add Bank Loan</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSave} style={[fStyles.saveBtn, { backgroundColor: '#0C447C' }]}>
            <Ionicons name="save" size={16} color="#fff" />
            <Text style={fStyles.saveBtnText}>Save Financial Data</Text>
          </TouchableOpacity>
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ═══════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════ */
export function FinancialStatusCard({ roleColor }: { roleColor: string }) {
  const {
    role, branchId, tanks, lpgTanks, dips, deliveries, branches, pumpDailyReports,
    expenses, companyInfo, financialEntry, updateFinancialEntry,
  } = useApp();
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const [showEdit, setShowEdit]  = useState(false);

  const isAcc = role === 'acc' || role === 'admin';
  const isGlobal = role === 'md' || role === 'ceo' || role === 'acc' || role === 'csm' || role === 'admin';
  const scopedBranchId = isGlobal ? null : branchId;
  const currentMonthRange = calendarMonthBusinessDateRange();
  const currentMonthKey = currentMonthRange.from.slice(0, 7);
  const inCurrentMonth = (value?: string) => {
    const businessDate = businessDateKey(value);
    return businessDate >= currentMonthRange.from && businessDate <= currentMonthRange.to;
  };
  const inRevenueScope = (recordBranchId?: string) =>
    !scopedBranchId || recordBranchId === scopedBranchId || !recordBranchId;
  const inFinancialScope = (recordBranchId?: string) =>
    isGlobal || !branchId || recordBranchId === branchId;

  /* ── last known cost price per product from approved deliveries ── */
  const PRODUCTS = ['PMS', 'AGO', 'DPK', 'LPG', 'Lube Oil'] as const;
  const cogsDeliveries = deliveries.filter(delivery =>
    businessDateKey(delivery.dt) <= currentMonthRange.to &&
    inFinancialScope(delivery.branchId),
  );
  const costPerProd: Record<string, number> = {};
  for (const prod of PRODUCTS) {
    costPerProd[prod] = getLastKnownCostPrice(cogsDeliveries, prod);
  }

  /* ── stock value per branch per product ── */
  const branchMap: Record<string, string> = {};
  for (const br of branches) branchMap[br.id] = br.name;

  interface StockItem { prod: string; stock: number; cost: number; value: number; branchId: string; }
  const stockItems: StockItem[] = [];

  for (const t of tanks) {
    const stock = getCurrentTankStock(t, dips);
    const cost  = costPerProd[t.prod] ?? 0;
    stockItems.push({ prod: t.prod, stock, cost, value: stock * cost, branchId: t.branchId ?? 'HQ' });
  }
  for (const lt of lpgTanks) {
    const stock = getCurrentTankStock(lt, dips, 'lpg');
    const cost  = costPerProd['LPG'] ?? 0;
    stockItems.push({ prod: 'LPG', stock, cost, value: stock * cost, branchId: lt.branchId ?? 'HQ' });
  }

  const stockValue = stockItems.reduce((s, i) => s + i.value, 0);

  /* per-branch summary for the expanded section */
  const byBranch: Record<string, { value: number; byProd: Record<string, { stock: number; value: number }> }> = {};
  for (const item of stockItems) {
    if (!byBranch[item.branchId]) byBranch[item.branchId] = { value: 0, byProd: {} };
    byBranch[item.branchId].value += item.value;
    if (!byBranch[item.branchId].byProd[item.prod]) byBranch[item.branchId].byProd[item.prod] = { stock: 0, value: 0 };
    byBranch[item.branchId].byProd[item.prod].stock += item.stock;
    byBranch[item.branchId].byProd[item.prod].value += item.value;
  }

  /* ── monthly net profit ── */
  const monthlyRevenueReports = pumpDailyReports.filter(r =>
    isRevenueReportStatus(r.status) &&
    inCurrentMonth(r.date) &&
    inRevenueScope(r.branchId),
  );
  const monthRevenue = calculateBusinessMonthRevenue(pumpDailyReports, scopedBranchId, currentMonthRange);
  const monthCOGS = computePumpReportCOGS(
    monthlyRevenueReports,
    cogsDeliveries,
  );
  const monthExpenses = expenses
    .filter(e => e.status === 'approved' && inCurrentMonth(e.dt) && inFinancialScope(e.branchId))
    .reduce((s, e) => s + e.amt, 0);
  const citaRate = parseFloat(companyInfo.citaRate || '30') / 100;
  const monthlyOperatingProfit = monthRevenue - monthCOGS - monthExpenses;
  const monthCita = monthlyOperatingProfit > 0
    ? Math.round(monthlyOperatingProfit * citaRate)
    : 0;
  const netProfit = monthlyOperatingProfit - monthCita;

  /* ── operating capital formula ── */
  const fe = financialEntry;
  const totalLoans = fe.bankLoans.reduce((s, l) => s + l.amount, 0);
  const isNewMonth = fe.startupCapitalMonth !== currentMonthKey;
  const startupCapital = isNewMonth
    ? (fe.closingOperatingCapital ?? fe.startupCapital)
    : fe.startupCapital;
  const startupCapitalSource = isNewMonth ? 'rollover' : fe.startupCapitalSource;
  const operatingCapital = startupCapital + netProfit;
  const isPositive = operatingCapital >= 0;

  useEffect(() => {
    if (
      fe.startupCapital === startupCapital
      && fe.startupCapitalMonth === currentMonthKey
      && fe.startupCapitalSource === startupCapitalSource
      && fe.closingOperatingCapital === operatingCapital
    ) return;
    updateFinancialEntry({
      startupCapital,
      startupCapitalMonth: currentMonthKey,
      startupCapitalSource,
      closingOperatingCapital: operatingCapital,
    });
  }, [
    currentMonthKey, fe.closingOperatingCapital, fe.startupCapital,
    fe.startupCapitalMonth, fe.startupCapitalSource, operatingCapital,
    startupCapital, startupCapitalSource, updateFinancialEntry,
  ]);

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => setExpanded(e => !e)}
        style={[fStyles.card, {
          backgroundColor: colors.surface,
          borderColor: isPositive ? '#27500A44' : '#791F1F44',
        }]}
      >
        {/* Header */}
        <View style={fStyles.cardHeader}>
          <View style={[fStyles.cardIcon, { backgroundColor: isPositive ? '#EAF3DE' : '#FCEBEB' }]}>
            <Ionicons name="stats-chart" size={18} color={isPositive ? '#27500A' : '#791F1F'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[fStyles.cardTitle, { color: colors.text }]}>Financial Status</Text>
            {fe.updatedAt ? (
              <Text style={[fStyles.cardSub, { color: colors.textMuted }]}>Updated {fmtDateTime(fe.updatedAt)}{fe.updatedBy ? ` by ${fe.updatedBy}` : ''}</Text>
            ) : null}
          </View>
          {isAcc && (
            <TouchableOpacity
              onPress={e => { e.stopPropagation?.(); setShowEdit(true); }}
              style={[fStyles.editBtn, { borderColor: '#0C447C' }]}
            >
              <Ionicons name="create-outline" size={13} color="#0C447C" />
              <Text style={[fStyles.editBtnText, { color: '#0C447C' }]}>Edit</Text>
            </TouchableOpacity>
          )}
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        </View>

        {/* Operating capital hero */}
        <View style={[fStyles.heroBg, { backgroundColor: isPositive ? '#EAF3DE' : '#FCEBEB', borderColor: isPositive ? '#27500A55' : '#791F1F55' }]}>
          <Text style={[fStyles.heroLabel, { color: isPositive ? '#27500A' : '#791F1F' }]}>Operating Capital</Text>
          <Text style={[fStyles.heroAmt, { color: isPositive ? '#27500A' : '#791F1F' }]}>{fmt(operatingCapital)}</Text>
        </View>

        {/* Quick stats */}
        <View style={fStyles.quickRow}>
          <View style={fStyles.quickItem}>
            <Text style={[fStyles.quickLabel, { color: colors.textMuted }]}>Stock Value</Text>
            <Text style={[fStyles.quickAmt, { color: '#185FA5' }]}>{fmt(stockValue)}</Text>
          </View>
          <View style={[fStyles.quickDivider, { backgroundColor: colors.border }]} />
          <View style={fStyles.quickItem}>
            <Text style={[fStyles.quickLabel, { color: colors.textMuted }]}>Net Profit (mo.)</Text>
            <Text style={[fStyles.quickAmt, { color: netProfit >= 0 ? '#27500A' : '#791F1F' }]}>{fmt(netProfit)}</Text>
          </View>
          <View style={[fStyles.quickDivider, { backgroundColor: colors.border }]} />
          <View style={fStyles.quickItem}>
            <Text style={[fStyles.quickLabel, { color: colors.textMuted }]}>Bank Loans</Text>
            <Text style={[fStyles.quickAmt, { color: totalLoans > 0 ? '#791F1F' : colors.textMuted }]}>{fmt(totalLoans)}</Text>
          </View>
        </View>

        {/* ── Expanded detail ── */}
        {expanded && (
          <View style={[fStyles.expandBox, { borderTopColor: colors.border }]}>

            {/* Stock breakdown */}
            <Text style={[fStyles.subSection, { color: colors.text }]}>📦 Stock Value by Branch</Text>
            {Object.entries(byBranch).map(([bid, data]) => (
              <View key={bid} style={[fStyles.branchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={fStyles.branchBoxHeader}>
                  <Text style={[fStyles.branchBoxName, { color: colors.text }]}>{branchMap[bid] ?? bid}</Text>
                  <Text style={[fStyles.branchBoxAmt, { color: '#185FA5' }]}>{fmt(data.value)}</Text>
                </View>
                {Object.entries(data.byProd).map(([prod, pd]) => (
                  pd.stock > 0 ? (
                    <View key={prod} style={fStyles.prodRow}>
                      <View style={[fStyles.prodDot, { backgroundColor: PROD_COLOR[prod] ?? '#888' }]} />
                      <Text style={[fStyles.prodLabel, { color: colors.textMuted }]}>{prod}</Text>
                      <Text style={[fStyles.prodStock, { color: colors.text }]}>{pd.stock.toLocaleString()} {PROD_UNIT[prod] ?? 'L'}</Text>
                      <Text style={[fStyles.prodValue, { color: PROD_COLOR[prod] ?? '#888' }]}>{fmt(pd.value)}</Text>
                    </View>
                  ) : null
                ))}
              </View>
            ))}
            {stockItems.length === 0 && (
              <Text style={[fStyles.emptyNote, { color: colors.textMuted }]}>No tank inventory data yet.</Text>
            )}

            {/* Formula */}
            <Text style={[fStyles.subSection, { color: colors.text, marginTop: 14 }]}>🧮 Capital Formula</Text>
            <Row
              label={`Start-up Capital (${startupCapitalSource === 'admin' ? 'admin seed' : 'rolled over'})`}
              value={fmt(startupCapital)}
              color="#185FA5"
            />
            <Row label={netProfit >= 0 ? '+ Net Profit (month)' : '- Net Loss (month)'} value={fmt(Math.abs(netProfit))} color={netProfit >= 0 ? '#27500A' : '#791F1F'} />
            <View style={[fStyles.totalRow, { borderTopColor: colors.border, borderTopWidth: 1.5 }]}>
              <Text style={[fStyles.totalLabel, { color: colors.text }]}>= Operating Capital</Text>
              <Text style={[fStyles.totalAmt, { color: isPositive ? '#27500A' : '#791F1F' }]}>{fmt(operatingCapital)}</Text>
            </View>

            {/* Net profit breakdown */}
            <Text style={[fStyles.subSection, { color: colors.text, marginTop: 14 }]}>📈 Net Profit Breakdown</Text>
            <Row label="Monthly Revenue" value={fmt(monthRevenue)} color="#27500A" />
            <Row label="− Monthly Cost of Goods" value={fmt(monthCOGS)} color="#791F1F" />
            <Row label="− Monthly Expenses" value={fmt(monthExpenses)} color="#791F1F" />
            <Row label={`− CITA (${(citaRate * 100).toFixed(0)}%)`} value={fmt(monthCita)} color="#BA7517" />
            <Row label="= Net Profit" value={fmt(netProfit)} color={netProfit >= 0 ? '#27500A' : '#791F1F'} bold />
          </View>
        )}
      </TouchableOpacity>

      <EditModal
        visible={showEdit}
        onClose={() => setShowEdit(false)}
        entry={financialEntry}
        onSave={updateFinancialEntry}
        canSeedStartupCapital={role === 'admin'}
        currentMonthKey={currentMonthKey}
      />
    </>
  );
}

const fStyles = StyleSheet.create({
  card:           { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 10, gap: 10 },
  cardHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardIcon:       { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cardTitle:      { fontSize: 14, fontWeight: '700' },
  cardSub:        { fontSize: 10, marginTop: 1 },
  editBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1.5 },
  editBtnText:    { fontSize: 11, fontWeight: '700' },
  heroBg:         { borderRadius: 12, borderWidth: 1, padding: 12, alignItems: 'center', gap: 2 },
  heroLabel:      { fontSize: 11, fontWeight: '700' },
  heroAmt:        { fontSize: 26, fontWeight: '800' },
  miniBarTrack:   { height: 6, borderRadius: 3, backgroundColor: '#E0E0E0', overflow: 'hidden' },
  miniBarFill:    { height: 6, borderRadius: 3 },
  quickRow:       { flexDirection: 'row', alignItems: 'center' },
  quickItem:      { flex: 1, alignItems: 'center', gap: 2 },
  quickDivider:   { width: 1, height: 34, marginHorizontal: 4 },
  quickLabel:     { fontSize: 10, fontWeight: '600' },
  quickAmt:       { fontSize: 13, fontWeight: '800' },
  expandBox:      { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 4 },
  subSection:     { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  branchBox:      { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 6, gap: 4 },
  branchBoxHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  branchBoxName:  { fontSize: 12, fontWeight: '700' },
  branchBoxAmt:   { fontSize: 13, fontWeight: '800' },
  prodRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  prodDot:        { width: 7, height: 7, borderRadius: 4 },
  prodLabel:      { fontSize: 11, flex: 1 },
  prodStock:      { fontSize: 11 },
  prodValue:      { fontSize: 11, fontWeight: '700', minWidth: 70, textAlign: 'right' },
  emptyNote:      { fontSize: 12, fontStyle: 'italic', marginBottom: 4 },
  row:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  rowIndent:      { paddingLeft: 12 },
  rowLabel:       { fontSize: 12, flex: 1 },
  rowValue:       { fontSize: 12, fontWeight: '600' },
  totalRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  totalLabel:     { fontSize: 14, fontWeight: '700' },
  totalAmt:       { fontSize: 18, fontWeight: '800' },
  /* Edit modal */
  modalHeader:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  headerBack:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  modalTitle:     { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
  modalScroll:    { padding: 16 },
  editSection:    { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  editField:      { marginBottom: 12 },
  editLabel:      { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  editHint:       { fontSize: 11, lineHeight: 16, marginTop: -6, marginBottom: 12 },
  editInputRow:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  naira:          { fontSize: 15, fontWeight: '600', marginRight: 4 },
  editInput:      { flex: 1, fontSize: 16, fontWeight: '600' },
  loanRow:        { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  loanBank:       { fontSize: 14, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  loanAmtRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  loanAmt:        { flex: 1, fontSize: 16, fontWeight: '600' },
  addLoanBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, marginBottom: 16, alignSelf: 'flex-start' },
  addLoanText:    { fontSize: 12, fontWeight: '700' },
  saveBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, marginTop: 8 },
  saveBtnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
});
