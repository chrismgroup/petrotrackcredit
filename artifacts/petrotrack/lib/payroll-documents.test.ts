import type { PayrollEntry, PayrollRun } from '@/lib/api';
import {
  payrollCsv, payrollMonthLabel, payrollRegisterHtml, payslipDeductions, payslipEarnings, payslipHtml,
} from '@/lib/payroll-documents';

const entry: PayrollEntry = {
  id: 1, runId: 1, period: '2026-10', staffKey: 'user:1', staffUserId: 1, username: 'ada',
  empName: 'Ada <Okafor>', empId: 'PT-001', jobTitle: 'Attendant', role: 'att', dept: 'Ops', branchId: 'b1', branchName: 'Uyo',
  bankName: 'Access Bank', accountNumber: '0123456789',
  basic: 250000, housing: 125000, transport: 75000, otherAllowances: 50000, overtime: 0, bonus: 10000, gross: 510000,
  pensionEmployee: 36000, pensionEmployer: 45000, nhis: 12500, taxable: 461500, paye: 66000,
  loan: 5000, otherDeductions: 0, otherDeductionsLabel: '', totalDeductions: 119500, net: 390500,
  overrides: {}, note: '', version: 2, updatedBy: 'hr', updatedAt: '2026-10-28T00:00:00Z',
};

describe('payroll documents', () => {
  it('labels months and hides empty optional lines', () => {
    expect(payrollMonthLabel('2026-10')).toBe('October 2026');
    expect(payslipEarnings(entry).map(([label]) => label)).toEqual(['Basic Salary', 'Housing Allowance', 'Transport Allowance', 'Other Allowances', 'Bonus']);
    expect(payslipDeductions(entry).map(([label]) => label)).toEqual(['PAYE Tax', 'Pension (Employee 8%)', 'NHIS', 'Loan / Salary Advance']);
  });

  it('escapes staff details in the payslip and marks revisions', () => {
    const html = payslipHtml(entry, { name: 'Chrism Energy' });
    expect(html).toContain('Ada &lt;Okafor&gt;');
    expect(html).toContain('Revised v2');
    expect(html).toContain('390,500.00');
  });

  it('exports a spreadsheet-safe CSV', () => {
    const csv = payrollCsv([{ ...entry, empName: '=HYPERLINK("x")' }]);
    const [header, row] = csv.split('\r\n');
    expect(header.startsWith('Period,Staff Name')).toBe(true);
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    expect(row).toContain('390500');
  });

  it('builds a register with totals and approvers', () => {
    const run: PayrollRun = {
      id: 1, period: '2026-10', status: 'released', notes: '', createdBy: 'hr', createdAt: '', updatedAt: '',
      submittedBy: 'hr', submittedAt: null, reviewedBy: 'acc', reviewedAt: null, approvedBy: 'md', approvedAt: null, releasedAt: null,
      history: [],
      totals: { staff: 1, gross: 510000, paye: 66000, pensionEmployee: 36000, pensionEmployer: 45000, nhis: 12500, loan: 5000, otherDeductions: 0, totalDeductions: 119500, net: 390500 },
    };
    const html = payrollRegisterHtml(run, [entry], {});
    expect(html).toContain('PAYROLL REGISTER');
    expect(html).toContain('Approved by (MD)');
  });
});
