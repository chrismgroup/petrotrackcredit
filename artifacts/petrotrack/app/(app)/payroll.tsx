import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { ModalSheet } from '@/components/FormSheet';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { ScreenLayout } from '@/components/ScreenLayout';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import {
  payrollApi, type PayrollEntry, type PayrollEntryInput, type PayrollRevision, type PayrollRun, type PayrollStatus,
} from '@/lib/api';
import {
  PAYROLL_STATUS_LABEL, exportCsv, naira, payrollCsv, payrollMonthLabel, payrollRegisterHtml, payslipDeductions,
  payslipEarnings, payslipFileName, payslipHtml, runPdfAction, type DocumentAction,
} from '@/lib/payroll-documents';

const PREPARERS = new Set(['csm', 'admin']);
const VIEWERS = new Set(['csm', 'admin', 'acc', 'md', 'ceo']);

const GREEN = '#174D36';
const STATUS_COLORS: Record<PayrollStatus, { fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  draft:      { fg: '#475569', bg: '#EEF2F6', icon: 'create-outline' },
  acc_review: { fg: '#8A5A00', bg: '#FFF4D6', icon: 'calculator-outline' },
  md_review:  { fg: '#6B3FA0', bg: '#F1E9FB', icon: 'briefcase-outline' },
  returned:   { fg: '#B42318', bg: '#FDECEA', icon: 'arrow-undo-outline' },
  released:   { fg: '#1F6848', bg: '#E5F1E9', icon: 'checkmark-done-circle' },
};
const STEPS: Array<{ key: string; label: string }> = [
  { key: 'hr', label: 'HR prepares' },
  { key: 'acc', label: 'Accountant reviews' },
  { key: 'md', label: 'MD approves' },
  { key: 'released', label: 'Payslips released' },
];
const stepIndex = (status: PayrollStatus) =>
  status === 'acc_review' ? 1 : status === 'md_review' ? 2 : status === 'released' ? 3 : 0;

function confirmAction(title: string, message: string, onConfirm: () => void, confirmLabel = 'Continue') {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: confirmLabel, onPress: onConfirm }]);
}

function notify(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function currentPeriod(offset = 0) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function shiftPeriod(period: string, delta: number) {
  const [y, m] = period.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

type FieldKey = 'bankName' | 'accountNumber' | 'basic' | 'housing' | 'transport' | 'otherAllowances' | 'overtime' | 'bonus'
  | 'loan' | 'otherDeductions' | 'otherDeductionsLabel' | 'paye' | 'pensionEmployee' | 'nhis' | 'note' | 'reason' | 'monthlyGross';
type Form = Record<FieldKey, string>;
const AMOUNT_FIELDS = ['basic', 'housing', 'transport', 'otherAllowances', 'overtime', 'bonus', 'loan', 'otherDeductions'] as const;
const OVERRIDE_FIELDS = ['paye', 'pensionEmployee', 'nhis'] as const;

function formFor(entry: PayrollEntry): Form {
  const amount = (n: number) => (n ? String(n) : '');
  return {
    bankName: entry.bankName, accountNumber: entry.accountNumber,
    basic: amount(entry.basic), housing: amount(entry.housing), transport: amount(entry.transport),
    otherAllowances: amount(entry.otherAllowances), overtime: amount(entry.overtime), bonus: amount(entry.bonus),
    loan: amount(entry.loan), otherDeductions: amount(entry.otherDeductions), otherDeductionsLabel: entry.otherDeductionsLabel,
    paye: entry.overrides.paye !== undefined ? String(entry.overrides.paye) : '',
    pensionEmployee: entry.overrides.pensionEmployee !== undefined ? String(entry.overrides.pensionEmployee) : '',
    nhis: entry.overrides.nhis !== undefined ? String(entry.overrides.nhis) : '',
    note: entry.note, reason: '', monthlyGross: '',
  };
}
const parseAmount = (value: string) => Number(value.replace(/[^\d.]/g, '')) || 0;

export default function PayrollScreen() {
  const { role, companyInfo } = useApp();
  const colors = useColors();
  const canView = VIEWERS.has(role ?? '');
  const canPrepare = PREPARERS.has(role ?? '');

  const [tab, setTab] = useState<'mine' | 'runs'>(canView ? 'runs' : 'mine');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [myPayslips, setMyPayslips] = useState<PayrollEntry[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [detail, setDetail] = useState<{ run: PayrollRun; entries: PayrollEntry[] } | null>(null);
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<PayrollEntry | null>(null);
  const [editing, setEditing] = useState<PayrollEntry | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [revisions, setRevisions] = useState<PayrollRevision[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newPeriod, setNewPeriod] = useState(currentPeriod());
  const [newNotes, setNewNotes] = useState('');
  const [returning, setReturning] = useState(false);
  const [returnNote, setReturnNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ empName: '', empId: '', jobTitle: '', monthlyGross: '' });

  const company = useMemo(() => ({
    name: companyInfo?.name, address: companyInfo?.address, phone: companyInfo?.phone,
    email: companyInfo?.email, rcNumber: companyInfo?.rcNumber, tin: companyInfo?.tin,
  }), [companyInfo]);

  const loadMine = useCallback(async () => {
    const result = await payrollApi.myPayslips();
    if (result) setMyPayslips(result.payslips);
  }, []);
  const loadRuns = useCallback(async () => {
    if (!canView) return;
    const result = await payrollApi.listRuns();
    if (result) setRuns(result.runs);
  }, [canView]);
  const openRun = useCallback(async (runId: number) => {
    setLoading(true);
    try {
      const result = await payrollApi.getRun(runId);
      if (result) setDetail(result);
      else notify('Payroll unavailable', 'The payroll could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadMine(), loadRuns(), detail ? payrollApi.getRun(detail.run.id).then(r => r && setDetail(r)) : null]);
    } finally {
      setLoading(false);
    }
  }, [detail, loadMine, loadRuns]);

  useFocusEffect(useCallback(() => {
    void loadMine();
    void loadRuns();
  }, [loadMine, loadRuns]));

  async function act<T>(work: () => Promise<(T & { error?: string }) | null>, failTitle: string): Promise<T | null> {
    setBusy(true);
    try {
      const result = await work();
      if (!result || result.error) {
        notify(failTitle, result?.error || 'The server could not be reached. Check your connection and try again.');
        return null;
      }
      return result;
    } finally {
      setBusy(false);
    }
  }

  async function documentAction(action: DocumentAction, html: string, name: string) {
    try {
      await runPdfAction(action, html, name);
    } catch (error: any) {
      if (!String(error?.message ?? '').toLowerCase().includes('cancel')) notify('Could not complete', error?.message ?? 'Please try again.');
    }
  }

  async function csvAction(entries: PayrollEntry[], name: string) {
    try {
      await exportCsv(payrollCsv(entries), name);
    } catch (error: any) {
      notify('Export failed', error?.message ?? 'Please try again.');
    }
  }

  // ── Run actions ──
  async function createRun() {
    const result = await act(() => payrollApi.createRun(newPeriod, newNotes.trim()), 'Payroll not generated');
    if (!result) return;
    setCreating(false);
    setNewNotes('');
    setDetail(result);
    void loadRuns();
    const zero = result.entries.filter(e => e.gross === 0).length;
    if (zero) notify('Payroll generated', `${zero} staff have no salary on record yet. Open each one to enter their pay.`);
  }

  async function transition(action: 'submit' | 'approve' | 'return', note = '') {
    if (!detail) return;
    const result = await act(() => payrollApi.transition(detail.run.id, action, note), 'Action failed');
    if (!result) return;
    setReturning(false);
    setReturnNote('');
    await openRun(detail.run.id);
    void loadRuns();
    void loadMine();
  }

  async function syncStaff() {
    if (!detail) return;
    const result = await act(() => payrollApi.syncStaff(detail.run.id), 'Refresh failed');
    if (!result) return;
    setDetail({ run: result.run, entries: result.entries });
    notify('Staff list refreshed', result.added ? `${result.added} new staff added.` : 'Everyone is already on this payroll.');
  }

  function deleteRun() {
    if (!detail) return;
    confirmAction('Delete payroll?', `The ${payrollMonthLabel(detail.run.period)} payroll and all its payslips will be deleted.`, async () => {
      const result = await act(() => payrollApi.deleteRun(detail.run.id), 'Delete failed');
      if (!result) return;
      setDetail(null);
      void loadRuns();
    }, 'Delete');
  }

  async function addStaff() {
    if (!detail) return;
    const result = await act(() => payrollApi.addEntry(detail.run.id, {
      empName: addForm.empName.trim(), empId: addForm.empId.trim() || null, jobTitle: addForm.jobTitle.trim() || null,
      monthlyGross: parseAmount(addForm.monthlyGross),
    }), 'Could not add staff');
    if (!result) return;
    setAdding(false);
    setAddForm({ empName: '', empId: '', jobTitle: '', monthlyGross: '' });
    await openRun(detail.run.id);
  }

  function removeEntry(entry: PayrollEntry) {
    if (!detail) return;
    confirmAction('Remove from payroll?', `${entry.empName} will not be paid in ${payrollMonthLabel(detail.run.period)}.`, async () => {
      const result = await act(() => payrollApi.removeEntry(detail.run.id, entry.id), 'Remove failed');
      if (!result) return;
      setEditing(null);
      await openRun(detail.run.id);
    }, 'Remove');
  }

  // ── Entry editing ──
  function startEdit(entry: PayrollEntry) {
    setEditing(entry);
    setForm(formFor(entry));
    setRevisions(null);
  }

  async function saveEntry() {
    if (!detail || !editing || !form) return;
    const input: PayrollEntryInput = {
      bankName: form.bankName.trim(), accountNumber: form.accountNumber.trim(),
      otherDeductionsLabel: form.otherDeductionsLabel.trim(), note: form.note.trim(),
    };
    if (form.monthlyGross.trim()) input.monthlyGross = parseAmount(form.monthlyGross);
    else for (const field of AMOUNT_FIELDS.slice(0, 6)) input[field] = parseAmount(form[field]);
    input.loan = parseAmount(form.loan);
    input.otherDeductions = parseAmount(form.otherDeductions);
    for (const field of OVERRIDE_FIELDS) input[field] = form[field].trim() === '' ? null : parseAmount(form[field]);
    if (detail.run.status === 'released') input.reason = form.reason.trim();
    const result = await act(() => payrollApi.updateEntry(detail.run.id, editing.id, input), 'Payslip not saved');
    if (!result) return;
    setEditing(null);
    setForm(null);
    await openRun(detail.run.id);
    if (result.revised) notify('Payslip revised', `${result.entry.empName} has been notified of version ${result.entry.version}.`);
  }

  async function loadRevisions(entry: PayrollEntry) {
    const result = await payrollApi.revisions(entry.id);
    setRevisions(result?.revisions ?? []);
  }

  const filteredEntries = useMemo(() => {
    if (!detail) return [];
    const q = search.trim().toLowerCase();
    if (!q) return detail.entries;
    return detail.entries.filter(e => [e.empName, e.empId, e.jobTitle, e.branchName, e.dept].some(v => v?.toLowerCase().includes(q)));
  }, [detail, search]);

  const status = detail?.run.status;
  const editable = canPrepare && (status === 'draft' || status === 'returned' || status === 'released');
  const preparing = canPrepare && (status === 'draft' || status === 'returned');
  const canApprove = !!detail && ((status === 'acc_review' && (role === 'acc' || role === 'admin')) || (status === 'md_review' && (role === 'md' || role === 'admin')));
  const runExists = runs.some(r => r.period === newPeriod);

  // ── Renderers ──
  const Pill = ({ value }: { value: PayrollStatus }) => (
    <View style={[styles.pill, { backgroundColor: STATUS_COLORS[value].bg }]}>
      <Ionicons name={STATUS_COLORS[value].icon} size={12} color={STATUS_COLORS[value].fg} />
      <Text style={[styles.pillText, { color: STATUS_COLORS[value].fg }]}>{PAYROLL_STATUS_LABEL[value]}</Text>
    </View>
  );

  const ActionButton = ({ icon, label, onPress, tone = 'outline', disabled }: {
    icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tone?: 'primary' | 'outline' | 'danger'; disabled?: boolean;
  }) => (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={[
        styles.btn,
        tone === 'primary' && { backgroundColor: GREEN, borderColor: GREEN },
        tone === 'danger' && { borderColor: '#E5B4AE', backgroundColor: '#FFF6F5' },
        tone === 'outline' && { borderColor: colors.border, backgroundColor: colors.surface },
        (disabled || busy) && { opacity: 0.5 },
      ]}
    >
      <Ionicons name={icon} size={15} color={tone === 'primary' ? '#fff' : tone === 'danger' ? '#B42318' : GREEN} />
      <Text style={[styles.btnText, { color: tone === 'primary' ? '#fff' : tone === 'danger' ? '#B42318' : GREEN }]}>{label}</Text>
    </TouchableOpacity>
  );

  const DocButtons = ({ html, name, csv }: { html: string; name: string; csv?: PayrollEntry[] }) => (
    <View style={styles.btnRow}>
      <ActionButton icon="download-outline" label={Platform.OS === 'web' ? 'Download PDF' : 'Download'} onPress={() => void documentAction('download', html, name)} />
      <ActionButton icon="share-social-outline" label="Export" onPress={() => void documentAction('export', html, name)} />
      <ActionButton icon="print-outline" label="Print" onPress={() => void documentAction('print', html, name)} />
      {csv ? <ActionButton icon="grid-outline" label="Excel (CSV)" onPress={() => void csvAction(csv, name)} /> : null}
    </View>
  );

  const PayslipCard = ({ entry, onPress }: { entry: PayrollEntry; onPress: () => void }) => (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} style={[styles.slipCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.slipIcon}><Ionicons name="document-text" size={20} color="#fff" /></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.slipMonth, { color: colors.text }]}>{payrollMonthLabel(entry.period)}</Text>
        <Text style={[styles.muted, { color: colors.textMuted }]}>
          Gross {naira(entry.gross)}{entry.version > 1 ? ` · Revised v${entry.version}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.mutedSmall, { color: colors.textMuted }]}>NET PAY</Text>
        <Text style={styles.slipNet}>{naira(entry.net)}</Text>
      </View>
    </TouchableOpacity>
  );

  function renderMine() {
    const latest = myPayslips[0];
    return (
      <View style={{ gap: 12 }}>
        {latest ? (
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Latest payslip · {payrollMonthLabel(latest.period)}</Text>
            <Text style={styles.heroAmount}>{naira(latest.net)}</Text>
            <Text style={styles.heroSub}>Net pay after {naira(latest.totalDeductions)} deductions</Text>
            <View style={[styles.btnRow, { marginTop: 12 }]}>
              <TouchableOpacity accessibilityRole="button" style={styles.heroBtn} onPress={() => void documentAction('download', payslipHtml(latest, company), payslipFileName(latest))}>
                <Ionicons name="download-outline" size={15} color={GREEN} /><Text style={styles.heroBtnText}>Download</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" style={styles.heroBtn} onPress={() => setViewing(latest)}>
                <Ionicons name="eye-outline" size={15} color={GREEN} /><Text style={styles.heroBtnText}>View</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Ionicons name="wallet-outline" size={36} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No payslips yet</Text>
            <Text style={[styles.muted, { color: colors.textMuted, textAlign: 'center' }]}>Your payslip appears here once the MD approves the month's payroll.</Text>
          </View>
        )}
        {myPayslips.map(entry => <PayslipCard key={entry.id} entry={entry} onPress={() => setViewing(entry)} />)}
      </View>
    );
  }

  function renderRuns() {
    return (
      <View style={{ gap: 12 }}>
        {canPrepare ? (
          <TouchableOpacity accessibilityRole="button" onPress={() => { setNewPeriod(currentPeriod()); setCreating(true); }} style={styles.generate}>
            <Ionicons name="add-circle" size={22} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.generateTitle}>Generate monthly payroll</Text>
              <Text style={styles.generateSub}>Pulls in every active staff member with PAYE, pension and NHIS worked out</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </TouchableOpacity>
        ) : null}
        {runs.length === 0 ? (
          <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Ionicons name="calendar-outline" size={36} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No payroll yet</Text>
            <Text style={[styles.muted, { color: colors.textMuted, textAlign: 'center' }]}>
              {canPrepare ? 'Generate this month\'s payroll to get started.' : 'HR has not prepared any payroll yet.'}
            </Text>
          </View>
        ) : runs.map(run => (
          <TouchableOpacity key={run.id} accessibilityRole="button" onPress={() => void openRun(run.id)}
            style={[styles.runCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.runMonth, { color: colors.text }]}>{payrollMonthLabel(run.period)}</Text>
              <Pill value={run.status} />
            </View>
            <View style={styles.runStats}>
              <Stat label="Staff" value={String(run.totals.staff)} />
              <Stat label="Gross" value={naira(run.totals.gross)} />
              <Stat label="Net pay" value={naira(run.totals.net)} strong />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  const Stat = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <View style={{ flex: 1 }}>
      <Text style={[styles.mutedSmall, { color: colors.textMuted }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.statValue, { color: strong ? GREEN : colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );

  function renderDetail() {
    if (!detail) return null;
    const { run } = detail;
    const current = stepIndex(run.status);
    const lastReturn = [...run.history].reverse().find(h => h.action === 'Returned to HR');
    const registerName = `Payroll-${run.period}`;
    return (
      <View style={{ gap: 14 }}>
        <TouchableOpacity accessibilityRole="button" onPress={() => { setDetail(null); setSearch(''); }} style={styles.back}>
          <Ionicons name="arrow-back" size={16} color={GREEN} /><Text style={styles.backText}>All payrolls</Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.heroLabel}>{payrollMonthLabel(run.period)} payroll</Text>
            <Pill value={run.status} />
          </View>
          <Text style={styles.heroAmount}>{naira(run.totals.net)}</Text>
          <Text style={styles.heroSub}>Net pay to {run.totals.staff} staff · Gross {naira(run.totals.gross)}</Text>
          <View style={styles.stepper}>
            {STEPS.map((step, index) => {
              const done = index < current || run.status === 'released';
              const active = index === current && run.status !== 'released';
              return (
                <View key={step.key} style={styles.step}>
                  <View style={[styles.stepDot, done && styles.stepDone, active && styles.stepActive]}>
                    <Ionicons name={done ? 'checkmark' : active ? 'ellipse' : 'ellipse-outline'} size={done ? 13 : 8} color={done ? GREEN : '#fff'} />
                  </View>
                  <Text style={[styles.stepLabel, (done || active) && { color: '#fff', fontWeight: '700' }]}>{step.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {run.status === 'returned' && lastReturn ? (
          <View style={styles.returnBanner}>
            <Ionicons name="arrow-undo" size={16} color="#B42318" />
            <Text style={styles.returnText}>Returned by {lastReturn.by}: {lastReturn.note}</Text>
          </View>
        ) : null}

        <View style={styles.totalsGrid}>
          {[
            ['PAYE', run.totals.paye, 'receipt-outline'],
            ['Pension (8% + 10%)', run.totals.pensionEmployee + run.totals.pensionEmployer, 'shield-checkmark-outline'],
            ['NHIS', run.totals.nhis, 'medkit-outline'],
            ['Loans & other', run.totals.loan + run.totals.otherDeductions, 'card-outline'],
          ].map(([label, amount, icon]) => (
            <View key={label as string} style={[styles.totalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name={icon as any} size={16} color={GREEN} />
              <Text style={[styles.mutedSmall, { color: colors.textMuted }]}>{String(label).toUpperCase()}</Text>
              <Text style={[styles.totalValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{naira(amount as number)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.btnRow}>
          {preparing ? <ActionButton tone="primary" icon="send" label="Submit to Accountant" onPress={() => confirmAction('Submit payroll?', `Send the ${payrollMonthLabel(run.period)} payroll (${naira(run.totals.net)} net) to the Accountant for review.`, () => void transition('submit'), 'Submit')} /> : null}
          {canApprove ? (
            <ActionButton tone="primary" icon="checkmark-circle" label={run.status === 'acc_review' ? 'Approve & send to MD' : 'Approve & release payslips'}
              onPress={() => confirmAction('Approve payroll?', run.status === 'acc_review' ? 'The payroll will go to the MD for final approval.' : 'Payslips will be released to every staff member.', () => void transition('approve'), 'Approve')} />
          ) : null}
          {canApprove ? <ActionButton tone="danger" icon="arrow-undo" label="Return to HR" onPress={() => setReturning(true)} /> : null}
          {preparing ? <ActionButton icon="people" label="Refresh staff" onPress={() => void syncStaff()} /> : null}
          {preparing ? <ActionButton icon="person-add" label="Add staff" onPress={() => setAdding(true)} /> : null}
          {preparing || (role === 'admin' && run.status !== 'released') ? <ActionButton tone="danger" icon="trash" label="Delete" onPress={deleteRun} /> : null}
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Payroll register</Text>
          <DocButtons html={payrollRegisterHtml(run, detail.entries, company)} name={registerName} csv={detail.entries} />
        </View>

        {run.status === 'released' && canPrepare ? (
          <Text style={[styles.muted, { color: colors.textMuted }]}>
            This payroll is released. Editing a payslip creates a revised version, keeps the old one in history and notifies the staff member.
          </Text>
        ) : null}

        <View style={[styles.search, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search staff, ID, station…" placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]} />
        </View>

        {filteredEntries.map(entry => (
          <TouchableOpacity key={entry.id} accessibilityRole="button" onPress={() => (editable ? startEdit(entry) : setViewing(entry))}
            style={[styles.entryCard, { backgroundColor: colors.surface, borderColor: entry.gross === 0 ? '#F2C94C' : colors.border }]}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{entry.empName.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.entryName, { color: colors.text }]} numberOfLines={1}>{entry.empName}</Text>
              <Text style={[styles.mutedSmall, { color: colors.textMuted }]} numberOfLines={1}>
                {[entry.jobTitle, entry.branchName].filter(Boolean).join(' · ') || entry.empId || '—'}
              </Text>
              {entry.gross === 0 ? <Text style={styles.warn}>No salary on record. Tap to enter pay.</Text> : (
                <Text style={[styles.mutedSmall, { color: colors.textMuted }]}>Gross {naira(entry.gross)} · PAYE {naira(entry.paye)}{entry.version > 1 ? ` · v${entry.version}` : ''}</Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={styles.entryNet}>{naira(entry.net)}</Text>
              <Ionicons name={editable ? 'create-outline' : 'eye-outline'} size={15} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
        ))}

        {run.history.length ? (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Activity</Text>
            {[...run.history].reverse().slice(0, 12).map((h, i) => (
              <View key={`${h.at}-${i}`} style={styles.historyRow}>
                <View style={styles.historyDot} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.historyText, { color: colors.text }]}>{h.action}{h.note ? ` — ${h.note}` : ''}</Text>
                  <Text style={[styles.mutedSmall, { color: colors.textMuted }]}>{h.by} · {new Date(h.at).toLocaleString('en-GB')}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  function renderPayslipSheet() {
    const entry = viewing;
    if (!entry) return null;
    const line = (label: string, amount: number, key: string) => (
      <View key={key} style={styles.line}><Text style={[styles.lineLabel, { color: colors.text }]}>{label}</Text><Text style={[styles.lineAmount, { color: colors.text }]}>{naira(amount)}</Text></View>
    );
    return (
      <ScrollView style={[styles.sheet, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={styles.sheetHead}>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>Payslip · {payrollMonthLabel(entry.period)}</Text>
          <TouchableOpacity accessibilityLabel="Close" onPress={() => setViewing(null)}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
        </View>
        <Text style={[styles.muted, { color: colors.textMuted }]}>{entry.empName}{entry.empId ? ` · ${entry.empId}` : ''}{entry.version > 1 ? ` · Revised v${entry.version}` : ''}</Text>
        <Text style={[styles.groupTitle, { color: GREEN }]}>EARNINGS</Text>
        {payslipEarnings(entry).map(([label, amount]) => line(label, amount, `e-${label}`))}
        <View style={styles.subtotal}>{line('Gross pay', entry.gross, 'gross')}</View>
        <Text style={[styles.groupTitle, { color: '#B42318' }]}>DEDUCTIONS</Text>
        {payslipDeductions(entry).map(([label, amount]) => line(label, amount, `d-${label}`))}
        <View style={styles.subtotal}>{line('Total deductions', entry.totalDeductions, 'ded')}</View>
        <View style={[styles.netBar]}><Text style={styles.netLabel}>NET PAY</Text><Text style={styles.netAmount}>{naira(entry.net)}</Text></View>
        <Text style={[styles.mutedSmall, { color: colors.textMuted, marginTop: 8 }]}>
          Employer pension (10%): {naira(entry.pensionEmployer)}{entry.bankName ? ` · Paid to ${entry.bankName} ${entry.accountNumber}` : ''}
        </Text>
        {entry.note ? <Text style={[styles.muted, { color: colors.textMuted, marginTop: 6 }]}>Note: {entry.note}</Text> : null}
        <View style={{ marginTop: 14 }}><DocButtons html={payslipHtml(entry, company)} name={payslipFileName(entry)} /></View>
      </ScrollView>
    );
  }

  function renderEditSheet() {
    if (!editing || !form || !detail) return null;
    const released = detail.run.status === 'released';
    const field = (key: FieldKey, label: string, opts: { numeric?: boolean; placeholder?: string; half?: boolean } = {}) => (
      <View style={[styles.field, opts.half && { flexBasis: '47%', flexGrow: 1 }]} key={key}>
        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
        <TextInput
          value={form[key]}
          onChangeText={value => setForm(prev => (prev ? { ...prev, [key]: value } : prev))}
          keyboardType={opts.numeric ? 'decimal-pad' : 'default'}
          placeholder={opts.placeholder ?? (opts.numeric ? '0' : '')}
          placeholderTextColor={colors.textSubtle}
          style={[styles.input, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.surface }]}
        />
      </View>
    );
    return (
      <KeyboardAwareScrollViewCompat style={[styles.sheet, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <View style={styles.sheetHead}>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>{editing.empName}</Text>
          <TouchableOpacity accessibilityLabel="Close" onPress={() => { setEditing(null); setForm(null); }}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
        </View>
        <Text style={[styles.muted, { color: colors.textMuted }]}>
          Current: gross {naira(editing.gross)} · net {naira(editing.net)}{editing.version > 1 ? ` · version ${editing.version}` : ''}
        </Text>

        <Text style={[styles.groupTitle, { color: GREEN }]}>QUICK SET</Text>
        {field('monthlyGross', 'Monthly gross (splits into 50% basic, 25% housing, 15% transport, 10% other)', { numeric: true, placeholder: 'Leave blank to edit each line' })}

        <Text style={[styles.groupTitle, { color: GREEN }]}>EARNINGS</Text>
        <View style={styles.fieldGrid}>
          {field('basic', 'Basic', { numeric: true, half: true })}
          {field('housing', 'Housing', { numeric: true, half: true })}
          {field('transport', 'Transport', { numeric: true, half: true })}
          {field('otherAllowances', 'Other allowances', { numeric: true, half: true })}
          {field('overtime', 'Overtime', { numeric: true, half: true })}
          {field('bonus', 'Bonus', { numeric: true, half: true })}
        </View>

        <Text style={[styles.groupTitle, { color: '#B42318' }]}>DEDUCTIONS</Text>
        <View style={styles.fieldGrid}>
          {field('loan', 'Loan / salary advance', { numeric: true, half: true })}
          {field('otherDeductions', 'Other deduction', { numeric: true, half: true })}
        </View>
        {field('otherDeductionsLabel', 'Other deduction description', { placeholder: 'e.g. Shortage recovery' })}
        <Text style={[styles.mutedSmall, { color: colors.textMuted, marginTop: 4 }]}>PAYE, pension (8%) and NHIS (5% of basic) are worked out automatically. Enter an amount only to override.</Text>
        <View style={styles.fieldGrid}>
          {field('paye', 'PAYE', { numeric: true, half: true, placeholder: 'Automatic' })}
          {field('pensionEmployee', 'Pension', { numeric: true, half: true, placeholder: 'Automatic' })}
          {field('nhis', 'NHIS', { numeric: true, half: true, placeholder: 'Automatic' })}
        </View>

        <Text style={[styles.groupTitle, { color: GREEN }]}>PAYMENT</Text>
        <View style={styles.fieldGrid}>
          {field('bankName', 'Bank', { half: true })}
          {field('accountNumber', 'Account number', { half: true })}
        </View>
        {field('note', 'Note on payslip')}
        {released ? field('reason', 'Reason for revision (required — the staff member is notified)') : null}

        <View style={[styles.btnRow, { marginTop: 14 }]}>
          <ActionButton tone="primary" icon="save" label={released ? 'Save revised payslip' : 'Save'} onPress={() => void saveEntry()} />
          <ActionButton icon="eye-outline" label="Payslip" onPress={() => { setViewing(editing); setEditing(null); setForm(null); }} />
          {editing.version > 1 ? <ActionButton icon="time-outline" label="History" onPress={() => void loadRevisions(editing)} /> : null}
          {preparing ? <ActionButton tone="danger" icon="person-remove" label="Remove" onPress={() => removeEntry(editing)} /> : null}
        </View>
        {revisions ? (
          <View style={{ marginTop: 12, gap: 8 }}>
            {revisions.length === 0 ? <Text style={[styles.muted, { color: colors.textMuted }]}>No earlier versions.</Text> : revisions.map(r => (
              <View key={r.version} style={[styles.revision, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={[styles.entryName, { color: colors.text }]}>Version {r.version} · net {naira(r.snapshot.net)}</Text>
                <Text style={[styles.mutedSmall, { color: colors.textMuted }]}>Replaced by {r.changedBy} on {new Date(r.changedAt).toLocaleString('en-GB')}: {r.reason}</Text>
                <TouchableOpacity onPress={() => void documentAction('download', payslipHtml(r.snapshot, company), `${payslipFileName(r.snapshot)}-v${r.version}`)}>
                  <Text style={styles.link}>Download version {r.version}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ height: 30 }} />
      </KeyboardAwareScrollViewCompat>
    );
  }

  return (
    <ScreenLayout
      title="Payroll & Payslips"
      rightAction={(
        <TouchableOpacity accessibilityLabel="Refresh payroll" onPress={() => void refresh()} style={{ padding: 6 }}>
          {loading ? <ActivityIndicator size="small" color={GREEN} /> : <Ionicons name="refresh" size={20} color={GREEN} />}
        </TouchableOpacity>
      )}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {canView && !detail ? (
          <View style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {([['runs', 'Payroll', 'people'], ['mine', 'My Payslips', 'person']] as const).map(([key, label, icon]) => (
              <TouchableOpacity key={key} accessibilityRole="tab" onPress={() => setTab(key)} style={[styles.tab, tab === key && { backgroundColor: GREEN }]}>
                <Ionicons name={icon} size={14} color={tab === key ? '#fff' : colors.textMuted} />
                <Text style={[styles.tabText, { color: tab === key ? '#fff' : colors.textMuted }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {detail ? renderDetail() : tab === 'runs' && canView ? renderRuns() : renderMine()}
      </ScrollView>

      <ModalSheet visible={!!viewing} onClose={() => setViewing(null)}>{renderPayslipSheet()}</ModalSheet>
      <ModalSheet visible={!!editing} onClose={() => { setEditing(null); setForm(null); }}>{renderEditSheet()}</ModalSheet>

      <ModalSheet visible={creating} onClose={() => setCreating(false)}>
        <KeyboardAwareScrollViewCompat
          style={[styles.sheet, { backgroundColor: colors.background }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          bottomOffset={24}
        >
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Generate payroll</Text>
            <TouchableOpacity accessibilityLabel="Close" onPress={() => setCreating(false)}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
          </View>
          <View style={styles.monthPicker}>
            <TouchableOpacity accessibilityLabel="Previous month" onPress={() => setNewPeriod(p => shiftPeriod(p, -1))} style={styles.monthArrow}><Ionicons name="chevron-back" size={20} color={GREEN} /></TouchableOpacity>
            <Text style={[styles.monthText, { color: colors.text }]}>{payrollMonthLabel(newPeriod)}</Text>
            <TouchableOpacity accessibilityLabel="Next month" onPress={() => setNewPeriod(p => shiftPeriod(p, 1))} style={styles.monthArrow}><Ionicons name="chevron-forward" size={20} color={GREEN} /></TouchableOpacity>
          </View>
          {runExists ? <Text style={styles.warn}>A payroll for this month already exists.</Text> : null}
          <Text style={[styles.mutedSmall, { color: colors.textMuted, marginVertical: 8 }]}>
            Every active staff member is added. Pay is copied from last month's payroll (overtime and bonus start at zero), or from the salary on their HR record.
          </Text>
          <TextInput value={newNotes} onChangeText={setNewNotes} placeholder="Notes (optional)" placeholderTextColor={colors.textSubtle}
            style={[styles.input, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.surface }]} />
          <View style={[styles.btnRow, { marginTop: 14 }]}>
            <ActionButton tone="primary" icon="flash" label="Generate" disabled={runExists} onPress={() => void createRun()} />
          </View>
        </KeyboardAwareScrollViewCompat>
      </ModalSheet>

      <ModalSheet visible={returning} onClose={() => setReturning(false)}>
        <KeyboardAwareScrollViewCompat
          style={[styles.sheet, { backgroundColor: colors.background }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          bottomOffset={24}
        >
          <Text style={[styles.sheetTitle, { color: colors.text }]}>Return payroll to HR</Text>
          <TextInput value={returnNote} onChangeText={setReturnNote} multiline placeholder="What should HR correct?" placeholderTextColor={colors.textSubtle}
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top', color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.surface }]} />
          <View style={[styles.btnRow, { marginTop: 14 }]}>
            <ActionButton tone="danger" icon="arrow-undo" label="Return" disabled={!returnNote.trim()} onPress={() => void transition('return', returnNote.trim())} />
          </View>
        </KeyboardAwareScrollViewCompat>
      </ModalSheet>

      <ModalSheet visible={adding} onClose={() => setAdding(false)}>
        <KeyboardAwareScrollViewCompat
          style={[styles.sheet, { backgroundColor: colors.background }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          bottomOffset={24}
        >
          <Text style={[styles.sheetTitle, { color: colors.text }]}>Add staff to payroll</Text>
          <Text style={[styles.mutedSmall, { color: colors.textMuted, marginBottom: 8 }]}>For casual or contract staff without an app account.</Text>
          {([['empName', 'Full name'], ['empId', 'Staff ID'], ['jobTitle', 'Job title'], ['monthlyGross', 'Monthly gross (₦)']] as const).map(([key, label]) => (
            <TextInput key={key} value={addForm[key]} onChangeText={value => setAddForm(prev => ({ ...prev, [key]: value }))}
              placeholder={label} placeholderTextColor={colors.textSubtle} keyboardType={key === 'monthlyGross' ? 'decimal-pad' : 'default'}
              style={[styles.input, { marginBottom: 8, color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.surface }]} />
          ))}
          <View style={styles.btnRow}>
            <ActionButton tone="primary" icon="person-add" label="Add" disabled={!addForm.empName.trim()} onPress={() => void addStaff()} />
          </View>
        </KeyboardAwareScrollViewCompat>
      </ModalSheet>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 60, gap: 14 },
  tabs: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 4, gap: 4 },
  tab: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 9 },
  tabText: { fontSize: 13, fontWeight: '700' },
  hero: { backgroundColor: GREEN, borderRadius: 16, padding: 18, gap: 4 },
  heroLabel: { color: '#CFE5D8', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  heroAmount: { color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 4 },
  heroSub: { color: '#CFE5D8', fontSize: 12 },
  heroBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  heroBtnText: { color: GREEN, fontWeight: '800', fontSize: 13 },
  stepper: { flexDirection: 'row', marginTop: 14, gap: 4 },
  step: { flex: 1, alignItems: 'center', gap: 4 },
  stepDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#6E9C83' },
  stepDone: { backgroundColor: '#fff', borderColor: '#fff' },
  stepActive: { borderColor: '#FFD166', backgroundColor: '#2C6B4E' },
  stepLabel: { color: '#A9C8B6', fontSize: 10, textAlign: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '800' },
  generate: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: GREEN, padding: 16, borderRadius: 14 },
  generateTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  generateSub: { color: '#CFE5D8', fontSize: 12, marginTop: 2 },
  runCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  runMonth: { fontSize: 16, fontWeight: '800' },
  runStats: { flexDirection: 'row', gap: 8 },
  statValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  totalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  totalCard: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  totalValue: { fontSize: 15, fontWeight: '800' },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  btnText: { fontSize: 13, fontWeight: '700' },
  section: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
  entryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5F1E9', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: GREEN, fontWeight: '900', fontSize: 14 },
  entryName: { fontSize: 14, fontWeight: '800' },
  entryNet: { color: GREEN, fontSize: 14, fontWeight: '900' },
  warn: { color: '#8A5A00', fontSize: 12, fontWeight: '700', marginTop: 2 },
  slipCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  slipIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  slipMonth: { fontSize: 15, fontWeight: '800' },
  slipNet: { color: GREEN, fontSize: 16, fontWeight: '900' },
  empty: { alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 28 },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  muted: { fontSize: 13 },
  mutedSmall: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { color: GREEN, fontWeight: '800' },
  returnBanner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FDECEA', borderRadius: 12, padding: 12 },
  returnText: { color: '#B42318', flex: 1, fontWeight: '600' },
  historyRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  historyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN, marginTop: 5 },
  historyText: { fontSize: 13, fontWeight: '600' },
  sheet: { padding: 18, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '88%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '800', flex: 1 },
  groupTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, marginTop: 14, marginBottom: 6 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  lineLabel: { fontSize: 14 },
  lineAmount: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  subtotal: { borderTopWidth: 1, borderTopColor: '#DCE6DE', marginTop: 4 },
  netBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: GREEN, borderRadius: 12, padding: 14, marginTop: 14 },
  netLabel: { color: '#CFE5D8', fontWeight: '800', letterSpacing: 0.6 },
  netAmount: { color: '#fff', fontSize: 22, fontWeight: '900' },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { marginTop: 6, flexBasis: '100%' },
  fieldLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  revision: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  link: { color: GREEN, fontWeight: '800', marginTop: 4 },
  monthPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  monthArrow: { padding: 10, borderRadius: 10, backgroundColor: '#E5F1E9' },
  monthText: { fontSize: 20, fontWeight: '900' },
});
