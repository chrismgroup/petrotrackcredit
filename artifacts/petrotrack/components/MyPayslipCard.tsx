import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useApp } from '@/context/AppContext';
import { payrollApi, type PayrollEntry } from '@/lib/api';
import { naira, payrollMonthLabel, payslipFileName, payslipHtml, runPdfAction } from '@/lib/payroll-documents';

/** Dashboard card with the signed-in user's latest released payslip. */
export function MyPayslipCard({ onOpenAll }: { onOpenAll?: () => void }) {
  const { companyInfo } = useApp();
  const [latest, setLatest] = useState<PayrollEntry | null>(null);

  useEffect(() => {
    let active = true;
    void payrollApi?.myPayslips?.().then(result => {
      if (active && result) setLatest(result.payslips[0] ?? null);
    });
    return () => { active = false; };
  }, []);

  if (!latest) return null;

  async function download(entry: PayrollEntry) {
    try {
      await runPdfAction('download', payslipHtml(entry, companyInfo ?? {}), payslipFileName(entry));
    } catch (error: any) {
      const message = error?.message ?? 'Please try again.';
      if (String(message).toLowerCase().includes('cancel')) return;
      if (Platform.OS === 'web') window.alert(`Download failed\n\n${message}`);
      else Alert.alert('Download failed', message);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}><Ionicons name="wallet" size={20} color="#174D36" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>MY PAYSLIP · {payrollMonthLabel(latest.period).toUpperCase()}</Text>
          <Text style={styles.amount}>{naira(latest.net)}</Text>
          <Text style={styles.sub}>Net pay · Gross {naira(latest.gross)}{latest.version > 1 ? ` · Revised v${latest.version}` : ''}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={() => void download(latest)}>
          <Ionicons name="download-outline" size={15} color="#174D36" />
          <Text style={styles.primaryText}>Download payslip</Text>
        </TouchableOpacity>
        {onOpenAll ? (
          <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={onOpenAll}>
            <Text style={styles.secondaryText}>All payslips</Text>
            <Ionicons name="chevron-forward" size={14} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#174D36', borderRadius: 16, padding: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#E5F1E9', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A9C8B6', fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  amount: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 2 },
  sub: { color: '#CFE5D8', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  primaryText: { color: '#174D36', fontWeight: '800', fontSize: 13 },
  secondary: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#6E9C83', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  secondaryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
