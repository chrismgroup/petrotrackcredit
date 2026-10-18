import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import {
  buildCreditReadinessSnapshot,
  estimateIndicativeFacility,
  ILLUSTRATIVE_LENDER_POLICY,
} from '@/lib/credit-readiness';

function money(value: number | null): string {
  return value === null
    ? 'Not available'
    : `₦${Math.round(value).toLocaleString('en-NG')}`;
}

function MetricCard({
  label, value, hint, icon, accent, colors,
}: {
  label: string;
  value: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.metricIcon, { backgroundColor: `${accent}18` }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.metricHint, { color: colors.textSubtle }]}>{hint}</Text>
    </View>
  );
}

export default function CreditFacilityScreen() {
  const {
    role, pumpDailyReports, deliveries, expenses, startupStocks, companyAssets,
    financialEntry, companyInfo, branches,
  } = useApp();
  const colors = useColors();
  const snapshot = useMemo(() => buildCreditReadinessSnapshot({
    reports: pumpDailyReports,
    deliveries,
    expenses,
    startupStocks,
    assets: companyAssets,
    financialEntry,
    citaRate: Number(companyInfo.citaRate || '30') / 100,
  }), [pumpDailyReports, deliveries, expenses, startupStocks, companyAssets, financialEntry, companyInfo.citaRate]);
  const estimate = useMemo(
    () => estimateIndicativeFacility(snapshot),
    [snapshot],
  );

  const totalMonths = 6;
  const profitReady = snapshot.netProfit !== null;
  const effectiveAnnualRate = ((1 + ILLUSTRATIVE_LENDER_POLICY.monthlyReducingBalanceRate) ** 12) - 1;
  const estimateReason: Record<typeof estimate.reason, string> = {
    eligible: 'Calculated from approved Petrotrack records using the sample policy below.',
    insufficient_history: `At least ${ILLUSTRATIVE_LENDER_POLICY.minimumActiveMonths} months with approved sales are required.`,
    incomplete_cost_data: 'A reliable profit estimate requires approved product-cost data for every product sold.',
    incomplete_sales_data: 'Repair approved shift reports with missing amounts before an estimate can be shown.',
    no_positive_profit: 'The six-month records do not show positive net profit to support repayments.',
    no_repayment_capacity: 'Recorded repayment capacity does not support a positive facility under this sample policy.',
  };
  if (role !== 'admin' && role !== 'ceo' && role !== 'md') return null;

  return (
    <ScreenLayout title="Credit Facility">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: '#123D2B' }]}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Ionicons name="shield-checkmark" size={21} color="#D5F2DF" />
            </View>
            <Text style={styles.heroEyebrow}>PETROTRACK BUSINESS PROFILE</Text>
          </View>
          <Text style={styles.heroTitle}>A clearer picture of business health</Text>
          <Text style={styles.heroCopy}>
            Review approved station activity and financial records for the last six complete months.
            A pilot demonstration of how approved business records could inform working-capital lending. This is not a credit score, lender decision, or loan offer.
          </Text>
          <View style={styles.heroBadge}>
            <Ionicons name="lock-closed" size={12} color="#D5F2DF" />
            <Text style={styles.heroBadgeText}>Internal preview · no lender access</Text>
          </View>
        </View>

        <View style={[styles.facilityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.facilityIcon, { backgroundColor: '#FFF4DF' }]}>
            <Ionicons name={estimate.amount ? 'checkmark-circle-outline' : 'hourglass-outline'} size={20} color={estimate.amount ? '#1F6848' : '#9A5B00'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.facilityEyebrow, { color: colors.textMuted }]}>INDICATIVE PILOT FACILITY · NOT A LOAN OFFER</Text>
            <Text style={[styles.facilityValue, { color: colors.text }]}>{money(estimate.amount)}</Text>
            <Text style={[styles.facilityCopy, { color: colors.textMuted }]}>
              {estimateReason[estimate.reason]}
            </Text>
            {estimate.amount !== null ? (
              <View style={[styles.estimateTerms, { borderTopColor: colors.border }]}>
                <Text style={[styles.estimateTerm, { color: colors.textMuted }]}>
                  Estimated monthly instalment · {money(estimate.monthlyInstalment)}
                </Text>
                <Text style={[styles.estimateTerm, { color: colors.textMuted }]}>
                  Estimated total repayment · {money(estimate.totalRepayment)}
                </Text>
                <Text style={[styles.estimateTerm, { color: colors.textMuted }]}>
                  Estimated interest over term · {money(estimate.estimatedInterest)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={[styles.policyCard, { backgroundColor: '#F4F7F3', borderColor: '#D8E4D9' }]}>
          <View style={styles.periodHeading}>
            <Ionicons name="document-text-outline" size={17} color="#225B40" />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{ILLUSTRATIVE_LENDER_POLICY.name}</Text>
          </View>
          <Text style={[styles.policyNotice, { color: colors.textMuted }]}>
            Sample assumptions for a lender pitch only. These are not Moniepoint, bank, or lender terms and require partner review, affordability checks, and legal approval.
          </Text>
          <PolicyRow label="Minimum history" value={`${ILLUSTRATIVE_LENDER_POLICY.minimumActiveMonths} complete months of approved sales`} colors={colors} />
          <PolicyRow label="Profit-based ceiling" value={`${ILLUSTRATIVE_LENDER_POLICY.advanceMultipleOfMonthlyNetProfit}× average monthly net profit`} colors={colors} />
          <PolicyRow label="Repayment affordability" value={`Instalment ≤ ${Math.round(ILLUSTRATIVE_LENDER_POLICY.maxPaymentToNetProfitRatio * 100)}% of monthly net profit, less recorded principal repayments`} colors={colors} />
          <PolicyRow label="Maximum facility" value={money(ILLUSTRATIVE_LENDER_POLICY.maximumFacilityNaira)} colors={colors} />
          <PolicyRow label="Repayment term" value={`${ILLUSTRATIVE_LENDER_POLICY.tenorMonths} monthly instalments`} colors={colors} />
          <PolicyRow label="Sample pricing" value={`${(ILLUSTRATIVE_LENDER_POLICY.monthlyReducingBalanceRate * 100).toFixed(1)}% monthly reducing balance · ${(effectiveAnnualRate * 100).toFixed(1)}% effective annual rate`} colors={colors} />
          <PolicyRow label="Calculation" value="Lowest of affordability-based principal, profit-based ceiling, and maximum facility; rounded down to the nearest ₦1,000." colors={colors} />
        </View>

        <View style={[styles.periodCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.periodHeading}>
            <Ionicons name="calendar-outline" size={17} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Six-month performance</Text>
          </View>
          <Text style={[styles.periodText, { color: colors.textMuted }]}>{snapshot.from} to {snapshot.to} · approved records only</Text>
          <View style={styles.metricGrid}>
            <MetricCard label="Pump sales revenue" value={money(snapshot.revenue)} hint="Approved shift reports" icon="trending-up-outline" accent="#1F6848" colors={colors} />
            <MetricCard label="Volume sold" value={`${Math.round(snapshot.litersSold).toLocaleString('en-NG')} L`} hint={`${snapshot.approvedReportCount} approved reports`} icon="speedometer-outline" accent="#236C9C" colors={colors} />
            <MetricCard label="Gross profit" value={money(snapshot.grossProfit)} hint={profitReady ? 'Revenue less cost of goods' : 'Unavailable: product cost data is incomplete'} icon="stats-chart-outline" accent="#6C4AA1" colors={colors} />
            <MetricCard label="Approved expenses" value={money(snapshot.approvedExpenses)} hint="Approved expense records" icon="receipt-outline" accent="#B45309" colors={colors} />
            <MetricCard label="Net profit" value={money(snapshot.netProfit)} hint={profitReady ? 'After expenses, depreciation, bank charges, interest and estimated company income tax' : 'Unavailable until product cost data is complete'} icon="cash-outline" accent="#0F766E" colors={colors} />
            <MetricCard label="Business locations" value={String(branches.length)} hint="Branches in Petrotrack" icon="business-outline" accent="#365A80" colors={colors} />
          </View>
        </View>

        <View style={[styles.readinessCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.periodHeading}>
            <Ionicons name="card-outline" size={17} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recorded payment mix</Text>
          </View>
          <Text style={[styles.periodText, { color: colors.textMuted }]}>
            Based on values submitted in approved pump reports; POS and transfers are not yet bank/provider verified.
          </Text>
          {[
            ['POS receipts', snapshot.posReceipts],
            ['Bank transfers', snapshot.bankTransfers],
            ['Cash collected', snapshot.cashCollected],
            ['Credit sales', snapshot.creditSales],
          ].map(([label, amount]) => (
            <View key={String(label)} style={[styles.paymentRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.paymentLabel, { color: colors.textMuted }]}>{label}</Text>
              <Text style={[styles.paymentAmount, { color: colors.text }]}>{money(Number(amount))}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.readinessCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.periodHeading}>
            <Ionicons name="clipboard-outline" size={17} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Readiness & data quality</Text>
          </View>
          <ReadinessRow
            good={snapshot.monthsWithSales === totalMonths}
            label={`${snapshot.monthsWithSales} of 6 months have approved sales`}
            detail="Only approved pump reports in complete months are included."
            colors={colors}
          />
          <ReadinessRow
            good={estimate.reason === 'eligible'}
            label={estimate.reason === 'eligible' ? 'Sample policy produced an indicative estimate' : 'No indicative amount under the sample policy'}
            detail={estimateReason[estimate.reason]}
            colors={colors}
          />
          <ReadinessRow
            good={snapshot.missingCostProducts.length === 0}
            label={snapshot.missingCostProducts.length === 0 ? 'Product cost data is available' : 'Some product costs are missing'}
            detail={snapshot.missingCostProducts.length === 0
              ? 'Gross and net profit use approved delivery or opening-inventory costs.'
              : `Profit is withheld to avoid overstating it. Add approved costs for: ${snapshot.missingCostProducts.join(', ')}.`}
            colors={colors}
          />
          <ReadinessRow
            good={snapshot.incompleteReportCount === 0}
            label={snapshot.incompleteReportCount === 0 ? 'Approved sales records have complete amounts' : `${snapshot.incompleteReportCount} report(s) have incomplete amounts`}
            detail="Missing amounts are not silently treated as reliable evidence."
            colors={colors}
          />
          <ReadinessRow
            good={false}
            label="Lender assessment policy is not configured"
            detail="No borrowing amount, approval decision, credit score, or repayment terms are generated."
            colors={colors}
          />
        </View>

        <View style={[styles.privacyCard, { backgroundColor: '#EEF5F0', borderColor: '#C9DCCF' }]}>
          <Ionicons name="eye-off-outline" size={18} color="#225B40" />
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyTitle}>Your lender data stays private for now</Text>
            <Text style={styles.privacyText}>
              This screen is an internal preview for company administrators and executives. No bank or lender can access these records from this feature. Any future sharing should require the merchant&apos;s explicit consent, a named institution, a defined data scope, and an auditable authorization.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenLayout>
  );
}

function PolicyRow({
  label, value, colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.policyRow, { borderTopColor: colors.border }]}>
      <Text style={[styles.policyLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.policyValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function ReadinessRow({
  good, label, detail, colors,
}: {
  good: boolean;
  label: string;
  detail: string;
  colors: ReturnType<typeof useColors>;
}) {
  const accent = good ? '#1F6848' : '#9A5B00';
  return (
    <View style={[styles.readinessRow, { borderTopColor: colors.border }]}>
      <Ionicons name={good ? 'checkmark-circle' : 'alert-circle'} size={18} color={accent} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.readinessLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.readinessDetail, { color: colors.textMuted }]}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 36, gap: 14 },
  hero: { borderRadius: 20, padding: 20, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  heroIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF1A' },
  heroEyebrow: { color: '#B5DCC3', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  heroTitle: { color: '#FFFFFF', fontSize: 23, lineHeight: 29, fontWeight: '800', marginBottom: 8 },
  heroCopy: { color: '#D2E4D7', fontSize: 13, lineHeight: 19 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 15, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#FFFFFF18' },
  heroBadgeText: { color: '#D5F2DF', fontSize: 11, fontWeight: '700' },
  facilityCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderRadius: 16, padding: 15 },
  facilityIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  facilityEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.9, marginBottom: 3 },
  facilityValue: { fontSize: 19, fontWeight: '800', marginBottom: 5 },
  facilityCopy: { fontSize: 12, lineHeight: 18 },
  estimateTerms: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 8, gap: 4 },
  estimateTerm: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  policyCard: { borderWidth: 1, borderRadius: 16, padding: 15 },
  policyNotice: { fontSize: 11, lineHeight: 16, marginTop: 7, marginBottom: 4 },
  policyRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, marginTop: 9 },
  policyLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  policyValue: { fontSize: 12, lineHeight: 17, fontWeight: '600', marginTop: 2 },
  periodCard: { borderWidth: 1, borderRadius: 16, padding: 15 },
  periodHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  periodText: { fontSize: 11, marginTop: 5, marginBottom: 13 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  metricCard: { width: '48%', flexGrow: 1, flexBasis: '45%', minHeight: 139, borderWidth: 1, borderRadius: 13, padding: 12 },
  metricIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  metricLabel: { fontSize: 11, fontWeight: '600' },
  metricValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  metricHint: { fontSize: 10, lineHeight: 15, marginTop: 4 },
  readinessCard: { borderWidth: 1, borderRadius: 16, padding: 15 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  paymentLabel: { fontSize: 12, fontWeight: '600' },
  paymentAmount: { fontSize: 12, fontWeight: '800' },
  readinessRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12, marginTop: 10 },
  readinessLabel: { fontSize: 12, fontWeight: '700' },
  readinessDetail: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  privacyCard: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14 },
  privacyTitle: { color: '#225B40', fontSize: 12, fontWeight: '800', marginBottom: 4 },
  privacyText: { color: '#365A47', fontSize: 11, lineHeight: 16 },
});
