import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Alert, Modal, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';

import {
  businessDateKey,
  calculateAccountsReceivable,
  calculateBusinessMonthRevenue,
  calendarMonthBusinessDateRange,
  fmt,
  fmtDateTime,
  getCurrentTankStock,
  isRevenueReportStatus,
  useApp,
  type BankLoan,
} from '@/context/AppContext';
import { computePumpReportCOGS, getLastKnownCostPrice, missingPumpReportCostProducts } from '@/lib/report-helpers';
import { monthlyDepreciationTotal, totalAssetNetBookValue } from '@/lib/asset-depreciation';
import { calculateNetProfit } from '@/lib/net-profit';
import { customerReceivablePosition, hasCustomerCredit } from '@/lib/customer-ledger';
import { aggregateStockValueByBranch } from '@/lib/stock-valuation';
import { STOCK_PRODUCTS } from '@/lib/product-identity';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import {
  cumulativeLoanPrincipalRepaid,
  cumulativeCitaPayable,
  cumulativePayePayable,
  getFinancialMonthEntry,
  type FinancialEntryUpdate,
  type FinancialMonthEntry,
} from '@/lib/financial-ledger';

const PROD_COLOR: Record<string, string> = {
  PMS: '#286247', AGO: '#71805B', DPK: '#315F49', LPG: '#174D36', 'Lube Oil': '#365A47',
};
const PROD_UNIT: Record<string, string> = {
  PMS: 'L', AGO: 'L', DPK: 'L', LPG: 'kg', 'Lube Oil': 'L',
};

interface BankLoanDraft {
  id: string;
  bank: string;
  amount: string;
}

let nextLoanDraftId = 0;
function loanDraft(loan?: BankLoan): BankLoanDraft {
  nextLoanDraftId += 1;
  return {
    id: `loan-draft-${nextLoanDraftId}`,
    bank: loan?.bank ?? '',
    amount: loan?.amount ? String(loan.amount) : '',
  };
}

function loanDrafts(loans: BankLoan[]): BankLoanDraft[] {
  return loans.length ? loans.map(loan => loanDraft(loan)) : [loanDraft()];
}

function numericAmount(value: string): number {
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

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
  visible, onClose, entry, monthEntry, onSave, canSeedStartupCapital, branches,
}: {
  visible: boolean;
  onClose: () => void;
  entry: ReturnType<typeof useApp>['financialEntry'];
  monthEntry: FinancialMonthEntry;
  onSave: (updates: FinancialEntryUpdate) => void;
  canSeedStartupCapital: boolean;
  branches: ReturnType<typeof useApp>['branches'];
}) {
  const colors = useColors();

  const [cashInBank, setCashInBank]           = useState(String(entry.cashInBank));
  const [posValue, setPosValue]               = useState(String(entry.posValue));
  const [goodsOnTransit, setGoodsOnTransit]   = useState(String(entry.goodsOnTransit));
  const [cashInHand, setCashInHand]           = useState(String(entry.cashInHand));
  const [capitalInjection, setCapitalInjection] = useState(String(monthEntry.capitalInjection));
  const [bankCharges, setBankCharges]         = useState(String(monthEntry.bankCharges));
  const [loanPrincipalRepayment, setLoanPrincipalRepayment] = useState(String(monthEntry.loanPrincipalRepayment));
  const [loanInterest, setLoanInterest]       = useState(String(monthEntry.loanInterest));
  const [customerPaymentsReceived, setCustomerPaymentsReceived] = useState(String(monthEntry.customerPaymentsReceived));
  const [payeProvision, setPayeProvision]       = useState(String(monthEntry.payeProvision));
  const [payeRemitted, setPayeRemitted]         = useState(String(monthEntry.payeRemitted));
  const [citaPaid, setCitaPaid]                 = useState(String(monthEntry.citaPaid));
  const [customerPaymentsByBranch, setCustomerPaymentsByBranch] = useState<Record<string, string>>(
    Object.fromEntries(branches.map(branch => [branch.id, String(monthEntry.customerPaymentsByBranch[branch.id] ?? '')])),
  );
  const [liabilities, setLiabilities]        = useState(String(entry.liabilities));
  const [startupCapital, setStartupCapital]   = useState(String(monthEntry.startupCapital));
  const [loans, setLoans]                     = useState<BankLoanDraft[]>(() => loanDrafts(entry.bankLoans));
  function n(v: string) { return numericAmount(v); }

  function addLoan() { setLoans(current => [...current, loanDraft()]); }
  function updateLoan(id: string, field: 'bank' | 'amount', value: string) {
    setLoans(current => current.map(loan => loan.id === id ? { ...loan, [field]: value } : loan));
  }
  function removeLoan(id: string) {
    setLoans(current => {
      const remaining = current.filter(loan => loan.id !== id);
      return remaining.length ? remaining : [loanDraft()];
    });
  }

  function handleSave() {
    const partiallyCompletedLoan = loans.find(loan =>
      (loan.bank.trim() && numericAmount(loan.amount) <= 0)
      || (!loan.bank.trim() && numericAmount(loan.amount) > 0),
    );
    if (partiallyCompletedLoan) {
      Alert.alert('Complete bank loan details', 'Each bank loan requires a bank name and an amount greater than zero.');
      return;
    }
    onSave({
      cashInBank: n(cashInBank), posValue: n(posValue),
      goodsOnTransit: n(goodsOnTransit), cashInHand: n(cashInHand),
      capitalInjection: Math.max(0, n(capitalInjection)),
      bankCharges: Math.max(0, n(bankCharges)),
      loanPrincipalRepayment: Math.max(0, n(loanPrincipalRepayment)),
      loanInterest: Math.max(0, n(loanInterest)),
      customerPaymentsReceived: Math.max(0, n(customerPaymentsReceived)),
      customerPaymentsByBranch: Object.fromEntries(
        branches.map(branch => [branch.id, Math.max(0, n(customerPaymentsByBranch[branch.id] ?? '0'))]),
      ),
      payeProvision: Math.max(0, n(payeProvision)),
      payeRemitted: Math.max(0, n(payeRemitted)),
      citaPaid: Math.max(0, n(citaPaid)),
      bankLoans: loans
        .filter(loan => loan.bank.trim() && numericAmount(loan.amount) > 0)
        .map(loan => ({ bank: loan.bank.trim(), amount: numericAmount(loan.amount) })),
      liabilities: n(liabilities),
      ...(canSeedStartupCapital ? {
        startupCapital: n(startupCapital),
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
        <View style={[fStyles.modalHeader, { backgroundColor: '#225B40', paddingTop: 52 }]}>
          <TouchableOpacity onPress={onClose} style={fStyles.headerBack}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={fStyles.modalTitle}>Financial Entries</Text>
        </View>
        <KeyboardAwareScrollViewCompat
          contentContainerStyle={fStyles.modalScroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          bottomOffset={32}
        >
          <Text style={[fStyles.editSection, { color: colors.text }]}>Manual Financial Data</Text>
          {field('Cash in Bank', cashInBank, setCashInBank)}
          {field('POS Value (cash at POS terminals)', posValue, setPosValue)}
          {field('Cost of Goods on Transit', goodsOnTransit, setGoodsOnTransit)}
          {field('Cash in Hand', cashInHand, setCashInHand)}
          {field('Capital Injected as Loan', capitalInjection, setCapitalInjection)}
          {field('Bank Charges (this month)', bankCharges, setBankCharges)}
          {field('Loan Principal Repayment (this month)', loanPrincipalRepayment, setLoanPrincipalRepayment)}
          {field('Interest Paid on Loans (this month)', loanInterest, setLoanInterest)}
          {field('Customer Credit Payments Received (this month)', customerPaymentsReceived, setCustomerPaymentsReceived)}
          <Text style={[fStyles.editHint, { color: colors.textMuted }]}>Allocate customer payments by branch below. Once allocations exist, their sum becomes the company total.</Text>
          {branches.map(branch => field(
            `Customer payments — ${branch.name}`,
            customerPaymentsByBranch[branch.id] ?? '',
            value => setCustomerPaymentsByBranch(previous => ({ ...previous, [branch.id]: value })),
          ))}
          {field('PAYE Payroll Liability (this month)', payeProvision, setPayeProvision)}
          {field('PAYE Remitted (this month)', payeRemitted, setPayeRemitted)}
          {field('CIT Paid (this month)', citaPaid, setCitaPaid)}
          <Text style={[fStyles.editHint, { color: colors.textMuted }]}>PAYE is stored as a payroll withholding liability and does not reduce profit again.</Text>
          <Text style={[fStyles.editHint, { color: colors.textMuted }]}>
            Only loan interest is deducted from profit. Principal repayment reduces operating capital and the outstanding loan balance.
          </Text>
          <Text style={[fStyles.editHint, { color: colors.textMuted }]}>
            Capital injection is shown in the Capital Movement Bridge and does not affect monthly profit.
          </Text>
          <Text style={[fStyles.editHint, { color: colors.textMuted }]}>
            Accounts Receivable is approved credit sales less the customer payments recorded above.
          </Text>
          {canSeedStartupCapital && (
            <>
              {field('Start-up Capital (current month opening)', startupCapital, setStartupCapital)}
              <Text style={[fStyles.editHint, { color: colors.textMuted }]}>
                This seeds the current month. Future months roll over the previous month’s closing operating capital automatically.
              </Text>
            </>
          )}
          {field('Other Liabilities (excluding loans, CIT and PAYE)', liabilities, setLiabilities)}

          <Text style={[fStyles.editSection, { color: colors.text, marginTop: 16 }]}>Bank Loans</Text>
          {loans.map((loan, i) => (
            <View key={loan.id} style={[fStyles.loanRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={fStyles.loanRowHeader}>
                <Text style={[fStyles.loanRowTitle, { color: colors.textMuted }]}>Loan {i + 1}</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Delete loan ${i + 1}`}
                  onPress={() => removeLoan(loan.id)}
                  style={fStyles.removeLoanBtn}
                >
                  <Ionicons name="trash-outline" size={17} color="#9B2C2C" />
                  <Text style={fStyles.removeLoanText}>Delete</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                value={loan.bank} onChangeText={value => updateLoan(loan.id, 'bank', value)}
                placeholder="Bank name" placeholderTextColor={colors.textMuted}
                style={[fStyles.loanBank, { color: colors.text, borderBottomColor: colors.border }]}
              />
              <View style={fStyles.loanAmtRow}>
                <Text style={[fStyles.naira, { color: colors.textMuted }]}>₦</Text>
                <TextInput
                  value={loan.amount} onChangeText={value => updateLoan(loan.id, 'amount', value)}
                  placeholder="0" placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad" style={[fStyles.loanAmt, { color: colors.text }]}
                />
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={addLoan} style={[fStyles.addLoanBtn, { borderColor: '#225B40' }]}>
            <Ionicons name="add" size={14} color="#225B40" />
            <Text style={[fStyles.addLoanText, { color: '#225B40' }]}>Add Bank Loan</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSave} style={[fStyles.saveBtn, { backgroundColor: '#225B40' }]}>
            <Ionicons name="save" size={16} color="#fff" />
            <Text style={fStyles.saveBtnText}>Save Financial Data</Text>
          </TouchableOpacity>
          <View style={{ height: 32 }} />
        </KeyboardAwareScrollViewCompat>
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
    expenses, companyInfo, financialEntry, updateFinancialEntry, companyAssets, startupStocks,
    creditCustomers = [], customerPayments = [],
  } = useApp();
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const [showEdit, setShowEdit]  = useState(false);

  const isAcc = role === 'acc' || role === 'admin';
  const isGlobal = role === 'md' || role === 'ceo' || role === 'acc' || role === 'csm' || role === 'admin';
  const scopedBranchId = isGlobal ? null : branchId;
  const currentMonthRange = calendarMonthBusinessDateRange();
  const currentMonthKey = currentMonthRange.from.slice(0, 7);
  const currentMonthEntry = getFinancialMonthEntry(financialEntry, currentMonthKey);
  const inCurrentMonth = (value?: string) => {
    const businessDate = businessDateKey(value);
    return businessDate >= currentMonthRange.from && businessDate <= currentMonthRange.to;
  };
  const inRevenueScope = (recordBranchId?: string) =>
    isGlobal || (!!scopedBranchId && recordBranchId === scopedBranchId);
  const inFinancialScope = (recordBranchId?: string) =>
    isGlobal || (!!branchId && recordBranchId === branchId);

  /* ── last known cost price per product from approved deliveries ── */
  const cogsDeliveries = deliveries.filter(delivery =>
    businessDateKey(delivery.dt) <= currentMonthRange.to &&
    inFinancialScope(delivery.branchId),
  );

  /* ── stock value per branch per product ── */
  const branchMap: Record<string, string> = {};
  for (const br of branches) branchMap[br.id] = br.name;

  interface StockItem { prod: string; stock: number; cost: number; value: number; branchId: string; }
  const stockItems: StockItem[] = [];

  for (const t of tanks) {
    if (scopedBranchId && t.branchId !== scopedBranchId) continue;
    const stock = getCurrentTankStock(t, dips);
    const cost  = getLastKnownCostPrice(cogsDeliveries, t.prod, t.branchId, currentMonthRange.to, startupStocks);
    stockItems.push({ prod: t.prod, stock, cost, value: stock * cost, branchId: t.branchId ?? 'HQ' });
  }
  for (const lt of lpgTanks) {
    if (scopedBranchId && lt.branchId !== scopedBranchId) continue;
    const stock = getCurrentTankStock(lt, dips, 'lpg');
    const cost  = getLastKnownCostPrice(cogsDeliveries, 'LPG', lt.branchId, currentMonthRange.to, startupStocks);
    stockItems.push({ prod: 'LPG', stock, cost, value: stock * cost, branchId: lt.branchId ?? 'HQ' });
  }

  const stockValue = stockItems.reduce((s, i) => s + i.value, 0);
  const fixedAssetValue = totalAssetNetBookValue(companyAssets, currentMonthRange.to, scopedBranchId);

  /* per-branch summary for the expanded section */
  const byBranch = aggregateStockValueByBranch(stockItems.map(item => ({
    branchId: item.branchId,
    product: item.prod,
    quantity: item.stock,
    unitCost: item.cost,
  })));

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
    startupStocks,
  );
  const missingCostProducts = missingPumpReportCostProducts(monthlyRevenueReports, cogsDeliveries, startupStocks);
  const monthExpenses = expenses
    .filter(e => e.status === 'approved' && inCurrentMonth(e.dt) && inFinancialScope(e.branchId))
    .reduce((s, e) => s + e.amt, 0);
  const bankCharges = currentMonthEntry.bankCharges;
  const loanPrincipalRepayment = currentMonthEntry.loanPrincipalRepayment;
  const loanInterest = currentMonthEntry.loanInterest;
  const totalLoanRepayment = loanPrincipalRepayment + loanInterest;
  const citaRate = parseFloat(companyInfo.citaRate || '30') / 100;
  const monthlyOperatingProfit = monthRevenue - monthCOGS - monthExpenses;
  const monthDepreciation = monthlyDepreciationTotal(companyAssets, currentMonthKey, scopedBranchId);
  const {
    citaProvision: monthCita,
    netProfit,
  } = calculateNetProfit({
    operatingProfit: monthlyOperatingProfit,
    depreciation: monthDepreciation,
    bankCharges,
    loanInterest,
    citaRate,
  });

  /* ── previous month's net profit for the operating-capital waterfall ── */
  const previousMonthAnchor = new Date(`${currentMonthRange.from}T12:00:00`);
  previousMonthAnchor.setMonth(previousMonthAnchor.getMonth() - 1);
  const previousMonthRange = calendarMonthBusinessDateRange(previousMonthAnchor);
  const previousMonthRevenueReports = pumpDailyReports.filter(r =>
    isRevenueReportStatus(r.status) &&
    businessDateKey(r.date) >= previousMonthRange.from &&
    businessDateKey(r.date) <= previousMonthRange.to &&
    inRevenueScope(r.branchId),
  );
  const previousMonthRevenue = calculateBusinessMonthRevenue(
    pumpDailyReports,
    scopedBranchId,
    previousMonthRange,
  );
  const previousMonthCOGSDeliveries = deliveries.filter(delivery =>
    businessDateKey(delivery.dt) <= previousMonthRange.to &&
    inFinancialScope(delivery.branchId),
  );
  const previousMonthCOGS = computePumpReportCOGS(
    previousMonthRevenueReports,
    previousMonthCOGSDeliveries,
    startupStocks,
  );
  const previousMonthExpenses = expenses
    .filter(e =>
      e.status === 'approved' &&
      businessDateKey(e.dt) >= previousMonthRange.from &&
      businessDateKey(e.dt) <= previousMonthRange.to &&
      inFinancialScope(e.branchId),
    )
    .reduce((s, e) => s + e.amt, 0);
  const previousMonthOperatingProfit = previousMonthRevenue - previousMonthCOGS - previousMonthExpenses;
  const previousMonthKey = previousMonthRange.from.slice(0, 7);
  const previousMonthEntry = getFinancialMonthEntry(financialEntry, previousMonthKey);
  const previousMonthDepreciation = monthlyDepreciationTotal(companyAssets, previousMonthKey, scopedBranchId);
  const { netProfit: previousMonthNetProfit, citaProvision: previousMonthCita } = calculateNetProfit({
    operatingProfit: previousMonthOperatingProfit,
    depreciation: previousMonthDepreciation,
    bankCharges: previousMonthEntry.bankCharges,
    loanInterest: previousMonthEntry.loanInterest,
    citaRate,
  });

  /* ── operating capital formula ── */
  const fe = financialEntry;
  const totalLoanFacilities = fe.bankLoans.reduce((s, l) => s + l.amount, 0);
  const totalPrincipalRepaid = cumulativeLoanPrincipalRepaid(fe, currentMonthKey);
  const outstandingLoans = Math.max(0, totalLoanFacilities - totalPrincipalRepaid);
  const legacyReceivableBalance = calculateAccountsReceivable(
    pumpDailyReports.filter(report => !hasCustomerCredit(report)),
    scopedBranchId,
    financialEntry,
    currentMonthRange.to,
  );
  const customerPosition = customerReceivablePosition(
    creditCustomers, pumpDailyReports, customerPayments, scopedBranchId, currentMonthRange.to,
  );
  const accountsReceivable = Math.max(0, legacyReceivableBalance) + customerPosition.receivables;
  const customerCreditBalances = Math.max(0, -legacyReceivableBalance) + customerPosition.advances;
  const hasStoredCurrentMonth = Object.prototype.hasOwnProperty.call(fe.months ?? {}, currentMonthKey);
  const startupCapital = hasStoredCurrentMonth
    ? currentMonthEntry.startupCapital
    : (previousMonthEntry.closingOperatingCapital ?? 0);
  const startupCapitalSource = hasStoredCurrentMonth
    ? currentMonthEntry.startupCapitalSource
    : 'rollover';
  // Interest is already included in net profit, so subtracting principal here
  // makes the full principal + interest cash repayment reduce capital once.
  const operatingCapital = startupCapital + netProfit + currentMonthEntry.capitalInjection - loanPrincipalRepayment;
  const isPositive = operatingCapital >= 0;
  const totalAssets = stockValue + fixedAssetValue + fe.cashInBank + fe.posValue + fe.cashInHand
    + fe.goodsOnTransit + accountsReceivable;
  const citaPayable = Math.max(0,
    cumulativeCitaPayable(fe, currentMonthKey) + monthCita - currentMonthEntry.citaProvision,
  );
  const payePayable = cumulativePayePayable(fe, currentMonthKey);
  const totalLiabilities = outstandingLoans + Math.max(0, fe.liabilities)
    + citaPayable + payePayable + customerCreditBalances;
  const netAssets = totalAssets - totalLiabilities;

  useEffect(() => {
    if (!isAcc) return;
    if (
      hasStoredCurrentMonth
      && currentMonthEntry.startupCapital === startupCapital
      && currentMonthEntry.startupCapitalSource === startupCapitalSource
      && currentMonthEntry.closingOperatingCapital === operatingCapital
    ) return;
    updateFinancialEntry({
      startupCapital,
      startupCapitalSource,
      closingOperatingCapital: operatingCapital,
    }, currentMonthKey);
  }, [
    currentMonthEntry.closingOperatingCapital, currentMonthEntry.startupCapital,
    currentMonthEntry.startupCapitalSource, currentMonthKey, hasStoredCurrentMonth,
    isAcc, operatingCapital, startupCapital, startupCapitalSource, updateFinancialEntry,
  ]);

  useEffect(() => {
    if (!isAcc || currentMonthEntry.citaProvision === monthCita) return;
    updateFinancialEntry({ citaProvision: monthCita }, currentMonthKey);
  }, [currentMonthEntry.citaProvision, currentMonthKey, isAcc, monthCita, updateFinancialEntry]);

  useEffect(() => {
    if (!isAcc) return;
    if (previousMonthEntry.finalizedNetProfit !== undefined && previousMonthEntry.citaProvision === previousMonthCita) return;
    updateFinancialEntry({
      citaProvision: previousMonthCita,
      ...(previousMonthEntry.finalizedNetProfit === undefined ? {
        finalizedNetProfit: previousMonthNetProfit,
        finalizedAt: new Date().toISOString(),
      } : {}),
    }, previousMonthKey);
  }, [
    isAcc, previousMonthEntry.citaProvision, previousMonthEntry.finalizedNetProfit, previousMonthKey,
    previousMonthNetProfit, previousMonthCita, updateFinancialEntry,
  ]);

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => setExpanded(e => !e)}
        style={[fStyles.card, {
          backgroundColor: colors.surface,
          borderColor: isPositive ? '#1F684844' : '#365A4744',
        }]}
      >
        {/* Header */}
        <View style={fStyles.cardHeader}>
          <View style={[fStyles.cardIcon, { backgroundColor: isPositive ? '#E5F1E9' : '#E9F0EB' }]}>
            <Ionicons name="stats-chart" size={18} color={isPositive ? '#1F6848' : '#365A47'} />
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
              style={[fStyles.editBtn, { borderColor: '#225B40' }]}
            >
              <Ionicons name="create-outline" size={13} color="#225B40" />
              <Text style={[fStyles.editBtnText, { color: '#225B40' }]}>Edit</Text>
            </TouchableOpacity>
          )}
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        </View>

        {/* Operating capital hero */}
        <View style={[fStyles.heroBg, { backgroundColor: isPositive ? '#E5F1E9' : '#E9F0EB', borderColor: isPositive ? '#1F684855' : '#365A4755' }]}>
          <Text style={[fStyles.heroLabel, { color: isPositive ? '#1F6848' : '#365A47' }]}>Operating Capital</Text>
          <Text style={[fStyles.heroAmt, { color: isPositive ? '#1F6848' : '#365A47' }]}>{fmt(operatingCapital)}</Text>
        </View>

        {/* Quick stats */}
        <View style={fStyles.quickRow}>
          <View style={fStyles.quickItem}>
            <Text style={[fStyles.quickLabel, { color: colors.textMuted }]}>Stock Value</Text>
            <Text style={[fStyles.quickAmt, { color: '#286247' }]}>{fmt(stockValue)}</Text>
          </View>
          <View style={[fStyles.quickDivider, { backgroundColor: colors.border }]} />
          <View style={fStyles.quickItem}>
            <Text style={[fStyles.quickLabel, { color: colors.textMuted }]}>Net Profit (mo.)</Text>
            <Text style={[fStyles.quickAmt, { color: netProfit >= 0 ? '#1F6848' : '#365A47' }]}>{fmt(netProfit)}</Text>
          </View>
          <View style={[fStyles.quickDivider, { backgroundColor: colors.border }]} />
          <View style={fStyles.quickItem}>
            <Text style={[fStyles.quickLabel, { color: colors.textMuted }]}>Bank Loans</Text>
            <Text style={[fStyles.quickAmt, { color: outstandingLoans > 0 ? '#365A47' : colors.textMuted }]}>{fmt(outstandingLoans)}</Text>
          </View>
        </View>

        {/* ── Expanded detail ── */}
        {expanded && (
          <View style={[fStyles.expandBox, { borderTopColor: colors.border }]}>

            {/* Balance sheet snapshot */}
            <Text style={[fStyles.subSection, { color: colors.text }]}>Balance Sheet Snapshot</Text>
            <View style={[fStyles.waterfallBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Row label="Stock" value={fmt(stockValue)} />
              <Row label="Fixed Assets (net book value)" value={fmt(fixedAssetValue)} />
              <Row label="Cash in Bank" value={fmt(fe.cashInBank)} />
              <Row label="POS Value" value={fmt(fe.posValue)} />
              <Row label="Cash in Hand" value={fmt(fe.cashInHand)} />
              <Row label="Goods on Transit" value={fmt(fe.goodsOnTransit)} />
              <Row label="Accounts Receivable" value={fmt(accountsReceivable)} />
              <View style={[fStyles.waterfallTotal, { borderTopColor: colors.border }]}>
                <Text style={[fStyles.totalLabel, { color: colors.text }]}>Total Assets</Text>
                <Text style={[fStyles.totalAmt, { color: '#1F6848' }]}>{fmt(totalAssets)}</Text>
              </View>
              <Row label="Outstanding Bank Loans" value={fmt(outstandingLoans)} color="#365A47" />
              <Row label="CIT Payable" value={fmt(citaPayable)} color="#365A47" />
              <Row label="PAYE Payable" value={fmt(payePayable)} color="#365A47" />
              {customerCreditBalances > 0 && <Row label="Customer Credit Balances" value={fmt(customerCreditBalances)} color="#365A47" />}
              <Row label="Other Liabilities" value={fmt(fe.liabilities)} color="#365A47" />
              <View style={[fStyles.waterfallTotal, { borderTopColor: colors.border }]}>
                <Text style={[fStyles.totalLabel, { color: colors.text }]}>Net Assets</Text>
                <Text style={[fStyles.totalAmt, { color: netAssets >= 0 ? '#1F6848' : '#365A47' }]}>{fmt(netAssets)}</Text>
              </View>
            </View>

            {/* Stock breakdown */}
            <Text style={[fStyles.subSection, { color: colors.text }]}>📦 Stock Value by Branch</Text>
            {Object.entries(byBranch).map(([bid, data]) => (
              <View key={bid} style={[fStyles.branchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={fStyles.branchBoxHeader}>
                  <Text style={[fStyles.branchBoxName, { color: colors.text }]}>{branchMap[bid] ?? bid}</Text>
                  <Text style={[fStyles.branchBoxAmt, { color: '#286247' }]}>{fmt(data.value)}</Text>
                </View>
                <View style={fStyles.prodTableHeader}>
                  <Text style={[fStyles.prodHeaderProduct, { color: colors.textSubtle }]}>Product</Text>
                  <Text style={[fStyles.prodHeaderQty, { color: colors.textSubtle }]}>Quantity</Text>
                  <Text style={[fStyles.prodHeaderCost, { color: colors.textSubtle }]}>Cost price</Text>
                  <Text style={[fStyles.prodHeaderValue, { color: colors.textSubtle }]}>Stock value</Text>
                </View>
                {STOCK_PRODUCTS.map(prod => {
                  const pd = data.byProd[prod];
                  return pd && pd.stock > 0 ? (
                    <View key={prod} style={fStyles.prodRow}>
                      <View style={[fStyles.prodDot, { backgroundColor: PROD_COLOR[prod] ?? '#888' }]} />
                      <Text style={[fStyles.prodLabel, { color: colors.textMuted }]}>{prod}</Text>
                      <Text style={[fStyles.prodStock, { color: colors.text }]}>{pd.stock.toLocaleString()} {PROD_UNIT[prod] ?? 'L'}</Text>
                      <Text style={[fStyles.prodCost, { color: colors.textMuted }]}>{fmt(pd.unitCost)}/{PROD_UNIT[prod] ?? 'L'}</Text>
                      <Text style={[fStyles.prodValue, { color: PROD_COLOR[prod] ?? '#888' }]}>{fmt(pd.value)}</Text>
                    </View>
                  ) : null;
                })}
              </View>
            ))}
            {stockItems.length === 0 && (
              <Text style={[fStyles.emptyNote, { color: colors.textMuted }]}>No tank inventory data yet.</Text>
            )}

            {/* Formula */}
            <Text style={[fStyles.subSection, { color: colors.text, marginTop: 14 }]}>Capital Movement Bridge</Text>
            <Row
              label={`Start-up Capital (${startupCapitalSource === 'admin' ? 'admin seed' : 'rolled over'})`}
              value={fmt(startupCapital)}
              color="#286247"
            />
            <Row label={netProfit >= 0 ? '+ Net Profit (month)' : '- Net Loss (month)'} value={fmt(Math.abs(netProfit))} color={netProfit >= 0 ? '#1F6848' : '#365A47'} />
            <Row label="+ Capital Injected as Loan" value={fmt(currentMonthEntry.capitalInjection)} color="#286247" />
            <Row label="− Loan Principal Repaid" value={fmt(loanPrincipalRepayment)} color="#365A47" />
            <Row label="Total Loans Repayment for the month" value={fmt(totalLoanRepayment)} color="#365A47" />
            <View style={[fStyles.totalRow, { borderTopColor: colors.border, borderTopWidth: 1.5 }]}>
              <Text style={[fStyles.totalLabel, { color: colors.text }]}>= Operating Capital</Text>
              <Text style={[fStyles.totalAmt, { color: isPositive ? '#1F6848' : '#365A47' }]}>{fmt(operatingCapital)}</Text>
            </View>

            {/* Net profit breakdown */}
            <Text style={[fStyles.subSection, { color: colors.text, marginTop: 14 }]}>📈 Net Profit Breakdown</Text>
            {missingCostProducts.length > 0 && (
              <Text style={[fStyles.emptyNote, { color: colors.error }]}>Profit is incomplete: set an opening unit cost or approve a delivery cost for {missingCostProducts.join(', ')}.</Text>
            )}
            <Row label="Monthly Revenue" value={fmt(monthRevenue)} color="#1F6848" />
            <Row label="− Monthly Cost of Goods" value={fmt(monthCOGS)} color="#365A47" />
            <Row label="− Monthly Expenses" value={fmt(monthExpenses)} color="#365A47" />
            <Row label="− Monthly Asset Depreciation" value={fmt(monthDepreciation)} color="#365A47" />
            <Row label="− Bank Charges" value={fmt(bankCharges)} color="#365A47" />
            <Row label="− Interest Paid on Loans" value={fmt(loanInterest)} color="#365A47" />
            <Row label={`− CIT (${(citaRate * 100).toFixed(0)}%)`} value={fmt(monthCita)} color="#71805B" />
            <Row label="= Net Profit" value={fmt(netProfit)} color={netProfit >= 0 ? '#1F6848' : '#365A47'} bold />
          </View>
        )}
      </TouchableOpacity>

      {showEdit ? (
        <EditModal
          visible
          onClose={() => setShowEdit(false)}
          entry={financialEntry}
          monthEntry={currentMonthEntry}
          onSave={updateFinancialEntry}
          canSeedStartupCapital={role === 'admin'}
          branches={branches}
        />
      ) : null}
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
  waterfallBox:   { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 12 },
  waterfallRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, gap: 10 },
  waterfallLabel: { fontSize: 12, fontWeight: '600' },
  waterfallTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, marginTop: 4, borderTopWidth: 1.5 },
  branchBox:      { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 6, gap: 4 },
  branchBoxHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  branchBoxName:  { fontSize: 12, fontWeight: '700' },
  branchBoxAmt:   { fontSize: 13, fontWeight: '800' },
  prodRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  prodTableHeader:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 3 },
  prodHeaderProduct: { fontSize: 9, flex: 1, marginLeft: 13 },
  prodHeaderQty:  { fontSize: 9, minWidth: 58, textAlign: 'right' },
  prodHeaderCost: { fontSize: 9, minWidth: 68, textAlign: 'right' },
  prodHeaderValue:{ fontSize: 9, minWidth: 70, textAlign: 'right' },
  prodDot:        { width: 7, height: 7, borderRadius: 4 },
  prodLabel:      { fontSize: 11, flex: 1 },
  prodStock:      { fontSize: 11, minWidth: 58, textAlign: 'right' },
  prodCost:       { fontSize: 10, minWidth: 68, textAlign: 'right' },
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
  loanRowHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  loanRowTitle:   { fontSize: 11, fontWeight: '700' },
  removeLoanBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, paddingVertical: 3 },
  removeLoanText: { color: '#9B2C2C', fontSize: 11, fontWeight: '700' },
  loanBank:       { fontSize: 14, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  loanAmtRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  loanAmt:        { flex: 1, fontSize: 16, fontWeight: '600' },
  addLoanBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, marginBottom: 16, alignSelf: 'flex-start' },
  addLoanText:    { fontSize: 12, fontWeight: '700' },
  saveBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, marginTop: 8 },
  saveBtnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
});
