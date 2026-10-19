import { Platform } from 'react-native';

import type { PayrollEntry, PayrollRun } from '@/lib/api';
import { escapeHtml } from '@/lib/report-helpers';

export interface PayrollCompany { name?: string; address?: string; phone?: string; email?: string; rcNumber?: string; tin?: string }

export const PAYROLL_STATUS_LABEL: Record<PayrollRun['status'], string> = {
  draft: 'Draft',
  acc_review: 'Awaiting Accountant',
  md_review: 'Awaiting MD',
  returned: 'Returned to HR',
  released: 'Approved & Released',
};

export function payrollMonthLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function naira(value: number): string {
  return `₦${(Number(value) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function payslipEarnings(entry: PayrollEntry): Array<[string, number]> {
  return ([
    ['Basic Salary', entry.basic],
    ['Housing Allowance', entry.housing],
    ['Transport Allowance', entry.transport],
    ['Other Allowances', entry.otherAllowances],
    ['Overtime', entry.overtime],
    ['Bonus', entry.bonus],
  ] as Array<[string, number]>).filter(([, amount], index) => index < 3 || amount > 0);
}

export function payslipDeductions(entry: PayrollEntry): Array<[string, number]> {
  return ([
    ['PAYE Tax', entry.paye],
    ['Pension (Employee 8%)', entry.pensionEmployee],
    ['NHIS', entry.nhis],
    ['Loan / Salary Advance', entry.loan],
    [entry.otherDeductionsLabel || 'Other Deductions', entry.otherDeductions],
  ] as Array<[string, number]>).filter(([, amount], index) => index < 2 || amount > 0);
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 28px; font-size: 12px; }
  .brand { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0b5d3b; padding-bottom: 14px; }
  .brand h1 { margin: 0; font-size: 20px; color: #0b5d3b; }
  .muted { color: #64748b; }
  .tag { display: inline-block; background: #0b5d3b; color: #fff; padding: 6px 12px; border-radius: 6px; font-weight: 700; letter-spacing: .5px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin: 16px 0; }
  .grid div span { display: block; font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: .4px; }
  .grid div b { font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f1f5f9; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .4px; padding: 8px; color: #334155; }
  td { padding: 7px 8px; border-bottom: 1px solid #e2e8f0; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  tr.total td { font-weight: 700; background: #f8fafc; border-top: 2px solid #cbd5e1; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .net { margin-top: 18px; background: linear-gradient(135deg, #0b5d3b, #12855a); color: #fff; padding: 16px 18px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; }
  .net b { font-size: 22px; }
  .foot { margin-top: 22px; font-size: 10px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 10px; }
  .sig { display: flex; justify-content: space-between; margin-top: 36px; }
  .sig div { width: 30%; border-top: 1px solid #94a3b8; padding-top: 4px; text-align: center; font-size: 10px; color: #475569; }
  @page { margin: 14mm; }
`;

function companyHeader(company: PayrollCompany, title: string, subtitle: string) {
  return `<div class="brand">
    <div>
      <h1>${escapeHtml(company.name || 'Petrotrack')}</h1>
      <div class="muted">${escapeHtml([company.address, company.phone, company.email].filter(Boolean).join(' · '))}</div>
      ${company.rcNumber || company.tin ? `<div class="muted">${escapeHtml([company.rcNumber && `RC ${company.rcNumber}`, company.tin && `TIN ${company.tin}`].filter(Boolean).join(' · '))}</div>` : ''}
    </div>
    <div style="text-align:right"><div class="tag">${escapeHtml(title)}</div><div class="muted" style="margin-top:6px">${escapeHtml(subtitle)}</div></div>
  </div>`;
}

export function payslipHtml(entry: PayrollEntry, company: PayrollCompany): string {
  const earnings = payslipEarnings(entry);
  const deductions = payslipDeductions(entry);
  const rows = (items: Array<[string, number]>) => items.map(([label, amount]) => `<tr><td>${escapeHtml(label)}</td><td class="n">${naira(amount)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Payslip ${escapeHtml(entry.empName)} ${escapeHtml(entry.period)}</title><style>${BASE_CSS}</style></head><body>
    ${companyHeader(company, 'PAYSLIP', payrollMonthLabel(entry.period) + (entry.version > 1 ? ` · Revised v${entry.version}` : ''))}
    <div class="grid">
      <div><span>Employee</span><b>${escapeHtml(entry.empName)}</b></div>
      <div><span>Staff ID</span><b>${escapeHtml(entry.empId || '—')}</b></div>
      <div><span>Job Title</span><b>${escapeHtml(entry.jobTitle || '—')}</b></div>
      <div><span>Department / Station</span><b>${escapeHtml([entry.dept, entry.branchName].filter(Boolean).join(' · ') || '—')}</b></div>
      <div><span>Bank</span><b>${escapeHtml(entry.bankName || '—')}</b></div>
      <div><span>Account Number</span><b>${escapeHtml(entry.accountNumber || '—')}</b></div>
    </div>
    <div class="cols">
      <table><thead><tr><th>Earnings</th><th class="n">Amount</th></tr></thead><tbody>${rows(earnings)}<tr class="total"><td>Gross Pay</td><td class="n">${naira(entry.gross)}</td></tr></tbody></table>
      <table><thead><tr><th>Deductions</th><th class="n">Amount</th></tr></thead><tbody>${rows(deductions)}<tr class="total"><td>Total Deductions</td><td class="n">${naira(entry.totalDeductions)}</td></tr></tbody></table>
    </div>
    <div class="net"><span>NET PAY</span><b>${naira(entry.net)}</b></div>
    <div class="foot">
      Employer pension contribution (10%): <b>${naira(entry.pensionEmployer)}</b> · Taxable income this month: <b>${naira(entry.taxable)}</b>
      ${entry.note ? `<br>Note: ${escapeHtml(entry.note)}` : ''}
      <br>PAYE computed under the Nigeria Tax Act 2025. This payslip was generated by Petrotrack${entry.releasedAt ? ` and released on ${escapeHtml(new Date(entry.releasedAt).toLocaleDateString('en-GB'))}` : ''}.
    </div>
  </body></html>`;
}

export function payrollRegisterHtml(run: PayrollRun, entries: PayrollEntry[], company: PayrollCompany): string {
  const rows = entries.map((e, i) => `<tr>
    <td>${i + 1}</td><td>${escapeHtml(e.empName)}<div class="muted">${escapeHtml([e.empId, e.jobTitle, e.branchName].filter(Boolean).join(' · '))}</div></td>
    <td class="n">${naira(e.basic)}</td><td class="n">${naira(e.housing + e.transport + e.otherAllowances)}</td><td class="n">${naira(e.overtime + e.bonus)}</td>
    <td class="n">${naira(e.gross)}</td><td class="n">${naira(e.paye)}</td><td class="n">${naira(e.pensionEmployee)}</td><td class="n">${naira(e.nhis)}</td>
    <td class="n">${naira(e.loan + e.otherDeductions)}</td><td class="n"><b>${naira(e.net)}</b></td>
    <td>${escapeHtml(e.bankName)}<div class="muted">${escapeHtml(e.accountNumber)}</div></td></tr>`).join('');
  const t = run.totals;
  const approvals = [
    ['Prepared by (HR)', run.submittedBy || run.createdBy],
    ['Reviewed by (Accountant)', run.reviewedBy || ''],
    ['Approved by (MD)', run.approvedBy || ''],
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><title>Payroll ${escapeHtml(run.period)}</title><style>${BASE_CSS} body{font-size:10px} @page{size:A4 landscape;margin:10mm}</style></head><body>
    ${companyHeader(company, 'PAYROLL REGISTER', `${payrollMonthLabel(run.period)} · ${PAYROLL_STATUS_LABEL[run.status]}`)}
    <div class="grid" style="grid-template-columns:repeat(5,1fr)">
      <div><span>Staff</span><b>${t.staff}</b></div>
      <div><span>Gross Pay</span><b>${naira(t.gross)}</b></div>
      <div><span>PAYE</span><b>${naira(t.paye)}</b></div>
      <div><span>Pension (Emp + Employer)</span><b>${naira(t.pensionEmployee + t.pensionEmployer)}</b></div>
      <div><span>Net Pay</span><b>${naira(t.net)}</b></div>
    </div>
    <table><thead><tr><th>#</th><th>Staff</th><th class="n">Basic</th><th class="n">Allowances</th><th class="n">OT / Bonus</th><th class="n">Gross</th><th class="n">PAYE</th><th class="n">Pension</th><th class="n">NHIS</th><th class="n">Loan / Other</th><th class="n">Net Pay</th><th>Bank</th></tr></thead>
    <tbody>${rows}<tr class="total"><td></td><td>TOTAL</td><td class="n">${naira(entries.reduce((s, e) => s + e.basic, 0))}</td><td class="n">${naira(entries.reduce((s, e) => s + e.housing + e.transport + e.otherAllowances, 0))}</td><td class="n">${naira(entries.reduce((s, e) => s + e.overtime + e.bonus, 0))}</td><td class="n">${naira(t.gross)}</td><td class="n">${naira(t.paye)}</td><td class="n">${naira(t.pensionEmployee)}</td><td class="n">${naira(t.nhis)}</td><td class="n">${naira(t.loan + t.otherDeductions)}</td><td class="n">${naira(t.net)}</td><td></td></tr></tbody></table>
    <div class="sig">${approvals.map(([label, name]) => `<div>${escapeHtml(name || ' ')}<br>${escapeHtml(label)}</div>`).join('')}</div>
    <div class="foot">Employer pension contribution: ${naira(t.pensionEmployer)}. Generated by Petrotrack on ${escapeHtml(new Date().toLocaleString('en-GB'))}.</div>
  </body></html>`;
}

const CSV_HEADERS = [
  'Period', 'Staff Name', 'Staff ID', 'Job Title', 'Department', 'Station', 'Bank', 'Account Number',
  'Basic', 'Housing', 'Transport', 'Other Allowances', 'Overtime', 'Bonus', 'Gross',
  'PAYE', 'Pension (Employee)', 'Pension (Employer)', 'NHIS', 'Loan', 'Other Deductions', 'Total Deductions', 'Net Pay', 'Version',
];

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function payrollCsv(entries: PayrollEntry[]): string {
  const lines = entries.map(e => [
    e.period, e.empName, e.empId, e.jobTitle, e.dept, e.branchName, e.bankName, e.accountNumber,
    e.basic, e.housing, e.transport, e.otherAllowances, e.overtime, e.bonus, e.gross,
    e.paye, e.pensionEmployee, e.pensionEmployer, e.nhis, e.loan, e.otherDeductions, e.totalDeductions, e.net, e.version,
  ].map(csvCell).join(','));
  return [CSV_HEADERS.join(','), ...lines].join('\r\n');
}

export function payslipFileName(entry: PayrollEntry) {
  return `Payslip-${entry.period}-${entry.empName.replace(/[^A-Za-z0-9]+/g, '_')}`;
}

function webDownload(content: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function webPrint(html: string) {
  const frame = document.createElement('iframe');
  Object.assign(frame.style, { position: 'fixed', width: '0', height: '0', border: '0' });
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}

// Native modules load on demand so screens importing these helpers stay light.
const fileSystem = () => import('expo-file-system/legacy');
const printing = () => import('expo-print');

async function saveNativeFile(uri: string, name: string, mimeType: string): Promise<'done' | 'cancelled'> {
  if (Platform.OS === 'android') {
    const FileSystem = await fileSystem();
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) return 'cancelled';
    const target = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, name, mimeType);
    const data = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    await FileSystem.writeAsStringAsync(target, data, { encoding: FileSystem.EncodingType.Base64 });
    return 'done';
  }
  return shareNativeFile(uri, name, mimeType, `Save ${name}`);
}

async function shareNativeFile(uri: string, name: string, mimeType: string, title: string): Promise<'done' | 'cancelled'> {
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not supported on this device.');
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: title, ...(mimeType === 'application/pdf' ? { UTI: 'com.adobe.pdf' } : {}) });
  return 'done';
}

async function pdfFile(html: string, name: string): Promise<string> {
  const [Print, FileSystem] = await Promise.all([printing(), fileSystem()]);
  const { uri } = await Print.printToFileAsync({ html });
  const target = `${FileSystem.cacheDirectory}${name}.pdf`;
  await FileSystem.deleteAsync(target, { idempotent: true });
  await FileSystem.moveAsync({ from: uri, to: target });
  return target;
}

export type DocumentAction = 'download' | 'export' | 'print';

/** Download saves a PDF, export opens the share sheet, print opens the printer dialog. */
export async function runPdfAction(action: DocumentAction, html: string, name: string): Promise<'done' | 'cancelled'> {
  if (Platform.OS === 'web') {
    // Browsers save a PDF from the print dialog ("Save as PDF").
    if (action === 'export') {
      webDownload(html, `${name}.html`, 'text/html');
      return 'done';
    }
    webPrint(html);
    return 'done';
  }
  if (action === 'print') {
    await (await printing()).printAsync({ html });
    return 'done';
  }
  const uri = await pdfFile(html, name);
  return action === 'download' ? saveNativeFile(uri, `${name}.pdf`, 'application/pdf') : shareNativeFile(uri, `${name}.pdf`, 'application/pdf', `Export ${name}`);
}

export async function exportCsv(csv: string, name: string): Promise<'done' | 'cancelled'> {
  const fileName = `${name}.csv`;
  if (Platform.OS === 'web') {
    webDownload(`\ufeff${csv}`, fileName, 'text/csv;charset=utf-8');
    return 'done';
  }
  const FileSystem = await fileSystem();
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, `\ufeff${csv}`, { encoding: FileSystem.EncodingType.UTF8 });
  return saveNativeFile(uri, fileName, 'text/csv');
}
