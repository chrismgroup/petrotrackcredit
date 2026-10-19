/**
 * Relational payroll storage: one payroll_runs row per month, one
 * payroll_entries row (payslip) per staff member, and payroll_entry_revisions
 * keeping every earlier version of a payslip edited after release.
 */
import { randomUUID } from "crypto";

import {
  EARNING_FIELDS,
  OVERRIDABLE_FIELDS,
  calculatePay,
  isPayrollPeriod,
  monthlyFromAnnualSalaryMeta,
  round2,
  splitGross,
  type OverridableField,
  type PayInput,
} from "./payrollCalc";

export interface PayrollQueryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
}
export interface PayrollPool extends PayrollQueryable {
  connect: () => Promise<PayrollQueryable & { release: () => void }>;
}

export class PayrollError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const PAYROLL_PREPARER_ROLES = new Set(["csm", "admin"]);
export const PAYROLL_VIEWER_ROLES = new Set(["csm", "admin", "acc", "md", "ceo"]);

export type PayrollStatus = "draft" | "acc_review" | "md_review" | "returned" | "released";
const EDITABLE_STATUSES = new Set<PayrollStatus>(["draft", "returned", "released"]);
const PREPARING_STATUSES = new Set<PayrollStatus>(["draft", "returned"]);

export const PAYROLL_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS payroll_runs (
  id SERIAL PRIMARY KEY,
  period TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_by TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  history JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE IF NOT EXISTS payroll_entries (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  staff_key TEXT NOT NULL,
  staff_user_id INTEGER REFERENCES staff_users(id) ON DELETE SET NULL,
  username TEXT,
  emp_name TEXT NOT NULL,
  emp_id TEXT,
  job_title TEXT,
  role TEXT,
  dept TEXT,
  branch_id TEXT,
  branch_name TEXT,
  bank_name TEXT NOT NULL DEFAULT '',
  account_number TEXT NOT NULL DEFAULT '',
  basic NUMERIC(14,2) NOT NULL DEFAULT 0,
  housing NUMERIC(14,2) NOT NULL DEFAULT 0,
  transport NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_allowances NUMERIC(14,2) NOT NULL DEFAULT 0,
  overtime NUMERIC(14,2) NOT NULL DEFAULT 0,
  bonus NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross NUMERIC(14,2) NOT NULL DEFAULT 0,
  pension_employee NUMERIC(14,2) NOT NULL DEFAULT 0,
  pension_employer NUMERIC(14,2) NOT NULL DEFAULT 0,
  nhis NUMERIC(14,2) NOT NULL DEFAULT 0,
  taxable NUMERIC(14,2) NOT NULL DEFAULT 0,
  paye NUMERIC(14,2) NOT NULL DEFAULT 0,
  loan NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_deductions_label TEXT NOT NULL DEFAULT '',
  total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
  net NUMERIC(14,2) NOT NULL DEFAULT 0,
  overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, staff_key)
);
CREATE INDEX IF NOT EXISTS payroll_entries_username_idx ON payroll_entries (username);
CREATE TABLE IF NOT EXISTS payroll_entry_revisions (
  id SERIAL PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES payroll_entries(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payroll_entry_revisions_entry_idx ON payroll_entry_revisions (entry_id);
`;

export interface PayrollEntryDTO {
  id: number;
  runId: number;
  period: string;
  staffKey: string;
  staffUserId: number | null;
  username: string | null;
  empName: string;
  empId: string | null;
  jobTitle: string | null;
  role: string | null;
  dept: string | null;
  branchId: string | null;
  branchName: string | null;
  bankName: string;
  accountNumber: string;
  basic: number; housing: number; transport: number; otherAllowances: number; overtime: number; bonus: number;
  gross: number;
  pensionEmployee: number; pensionEmployer: number; nhis: number; taxable: number; paye: number;
  loan: number; otherDeductions: number; otherDeductionsLabel: string;
  totalDeductions: number; net: number;
  overrides: Partial<Record<OverridableField, number>>;
  note: string;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
  runStatus?: PayrollStatus;
  releasedAt?: string | null;
}

export interface PayrollRunDTO {
  id: number;
  period: string;
  status: PayrollStatus;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  submittedBy: string | null; submittedAt: string | null;
  reviewedBy: string | null; reviewedAt: string | null;
  approvedBy: string | null; approvedAt: string | null;
  releasedAt: string | null;
  history: Array<{ action: string; by: string; role: string; at: string; note?: string }>;
  totals: { staff: number; gross: number; paye: number; pensionEmployee: number; pensionEmployer: number; nhis: number; loan: number; otherDeductions: number; totalDeductions: number; net: number };
}

const num = (value: unknown) => round2(Number(value) || 0);
const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null);

function entryFromRow(row: any): PayrollEntryDTO {
  return {
    id: Number(row.id),
    runId: Number(row.run_id),
    period: row.period ?? "",
    staffKey: row.staff_key,
    staffUserId: row.staff_user_id === null || row.staff_user_id === undefined ? null : Number(row.staff_user_id),
    username: row.username ?? null,
    empName: row.emp_name,
    empId: row.emp_id ?? null,
    jobTitle: row.job_title ?? null,
    role: row.role ?? null,
    dept: row.dept ?? null,
    branchId: row.branch_id ?? null,
    branchName: row.branch_name ?? null,
    bankName: row.bank_name ?? "",
    accountNumber: row.account_number ?? "",
    basic: num(row.basic), housing: num(row.housing), transport: num(row.transport),
    otherAllowances: num(row.other_allowances), overtime: num(row.overtime), bonus: num(row.bonus),
    gross: num(row.gross),
    pensionEmployee: num(row.pension_employee), pensionEmployer: num(row.pension_employer),
    nhis: num(row.nhis), taxable: num(row.taxable), paye: num(row.paye),
    loan: num(row.loan), otherDeductions: num(row.other_deductions), otherDeductionsLabel: row.other_deductions_label ?? "",
    totalDeductions: num(row.total_deductions), net: num(row.net),
    overrides: row.overrides && typeof row.overrides === "object" ? row.overrides : {},
    note: row.note ?? "",
    version: Number(row.version) || 1,
    updatedBy: row.updated_by ?? null,
    updatedAt: iso(row.updated_at) ?? new Date().toISOString(),
    ...(row.run_status ? { runStatus: row.run_status as PayrollStatus, releasedAt: iso(row.released_at) } : {}),
  };
}

function runFromRow(row: any): PayrollRunDTO {
  return {
    id: Number(row.id),
    period: row.period,
    status: row.status,
    notes: row.notes ?? "",
    createdBy: row.created_by,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    submittedBy: row.submitted_by ?? null, submittedAt: iso(row.submitted_at),
    reviewedBy: row.reviewed_by ?? null, reviewedAt: iso(row.reviewed_at),
    approvedBy: row.approved_by ?? null, approvedAt: iso(row.approved_at),
    releasedAt: iso(row.released_at),
    history: Array.isArray(row.history) ? row.history : [],
    totals: {
      staff: Number(row.staff_count) || 0,
      gross: num(row.total_gross), paye: num(row.total_paye),
      pensionEmployee: num(row.total_pension_employee), pensionEmployer: num(row.total_pension_employer),
      nhis: num(row.total_nhis), loan: num(row.total_loan), otherDeductions: num(row.total_other_deductions),
      totalDeductions: num(row.total_deductions), net: num(row.total_net),
    },
  };
}

const RUN_SELECT = `
  SELECT r.*,
    COUNT(e.id) AS staff_count,
    COALESCE(SUM(e.gross), 0) AS total_gross,
    COALESCE(SUM(e.paye), 0) AS total_paye,
    COALESCE(SUM(e.pension_employee), 0) AS total_pension_employee,
    COALESCE(SUM(e.pension_employer), 0) AS total_pension_employer,
    COALESCE(SUM(e.nhis), 0) AS total_nhis,
    COALESCE(SUM(e.loan), 0) AS total_loan,
    COALESCE(SUM(e.other_deductions), 0) AS total_other_deductions,
    COALESCE(SUM(e.total_deductions), 0) AS total_deductions,
    COALESCE(SUM(e.net), 0) AS total_net
  FROM payroll_runs r
  LEFT JOIN payroll_entries e ON e.run_id = r.id
`;

export interface Actor { username: string; role: string; }

export interface EntryPatch {
  empName?: string; empId?: string | null; jobTitle?: string | null; dept?: string | null;
  bankName?: string; accountNumber?: string;
  basic?: number; housing?: number; transport?: number; otherAllowances?: number; overtime?: number; bonus?: number;
  loan?: number; otherDeductions?: number; otherDeductionsLabel?: string;
  /** A number fixes the amount; null switches it back to automatic. */
  pensionEmployee?: number | null; nhis?: number | null; paye?: number | null;
  /** Spread a new monthly gross across basic/housing/transport/other. */
  monthlyGross?: number;
  note?: string;
  reason?: string;
}

interface StaffSource {
  staffKey: string;
  staffUserId: number | null;
  username: string | null;
  empName: string;
  empId: string | null;
  jobTitle: string | null;
  role: string | null;
  dept: string | null;
  branchId: string | null;
  branchName: string | null;
  monthlyGross: number;
}

function money(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new PayrollError(400, `${field} must be an amount of 0 or more`);
  if (n > 1_000_000_000) throw new PayrollError(400, `${field} is too large`);
  return round2(n);
}

function cleanText(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function payColumns(input: PayInput) {
  const pay = calculatePay(input);
  if (pay.net < 0) throw new PayrollError(400, `Deductions (₦${pay.totalDeductions.toLocaleString()}) are more than gross pay (₦${pay.gross.toLocaleString()})`);
  return pay;
}

export class PayrollStore {
  private ready: Promise<void> | null = null;
  private pool: PayrollPool | null;

  constructor(pool?: PayrollPool) {
    this.pool = pool ?? null;
  }

  private async db(): Promise<PayrollPool> {
    if (!this.pool) {
      const { pool } = await import("@workspace/db");
      this.pool = pool as unknown as PayrollPool;
    }
    return this.pool;
  }

  async ensure(): Promise<PayrollPool> {
    const pool = await this.db();
    if (!this.ready) {
      this.ready = pool.query(PAYROLL_TABLES_SQL).then(() => undefined).catch(error => {
        this.ready = null;
        throw error;
      });
    }
    await this.ready;
    return pool;
  }

  private async tx<T>(fn: (q: PayrollQueryable) => Promise<T>): Promise<T> {
    const pool = await this.ensure();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  // ── Staff sources ──

  private async staffSources(q: PayrollQueryable): Promise<StaffSource[]> {
    const [users, stateRows] = await Promise.all([
      q.query(`SELECT id, emp_name, emp_id, username, role, branch_id, job_title, dept, employment_docs
               FROM staff_users WHERE status = 'active' ORDER BY emp_name`),
      q.query(`SELECT key, data FROM app_state WHERE key IN ('staff', 'branches')`),
    ]);
    const stateData = (key: string) => {
      const data = stateRows.rows.find(row => row.key === key)?.data;
      return Array.isArray(data) ? data.filter(item => item && typeof item === "object") : [];
    };
    const branches = new Map(stateData("branches").map((b: any) => [String(b.id), String(b.name ?? "")]));
    const legacyStaff = stateData("staff") as any[];
    const legacyByAccount = new Map(legacyStaff.filter(s => s.accountId != null).map(s => [Number(s.accountId), s]));
    const sources: StaffSource[] = users.rows.map(row => {
      const legacy = legacyByAccount.get(Number(row.id));
      const monthly = monthlyFromAnnualSalaryMeta(row.employment_docs) || Math.max(0, Number(legacy?.sal) || 0);
      return {
        staffKey: `user:${row.id}`,
        staffUserId: Number(row.id),
        username: row.username ?? null,
        empName: row.emp_name,
        empId: row.emp_id ?? null,
        jobTitle: row.job_title ?? null,
        role: row.role ?? null,
        dept: row.dept ?? legacy?.dept ?? null,
        branchId: row.branch_id ?? null,
        branchName: row.branch_id ? branches.get(String(row.branch_id)) || null : null,
        monthlyGross: monthly,
      };
    });
    const linked = new Set(users.rows.map(row => Number(row.id)));
    const linkedNames = new Set(users.rows.map(row => String(row.emp_name).trim().toLowerCase()));
    for (const staff of legacyStaff) {
      if (staff.st && staff.st !== "Active") continue;
      if (staff.accountId != null && linked.has(Number(staff.accountId))) continue;
      const name = String(staff.name ?? "").trim();
      if (!name || linkedNames.has(name.toLowerCase())) continue;
      sources.push({
        staffKey: `staff:${staff.id}`,
        staffUserId: null,
        username: null,
        empName: name,
        empId: staff.empId ?? null,
        jobTitle: staff.role ?? null,
        role: null,
        dept: staff.dept ?? null,
        branchId: staff.branchId ?? null,
        branchName: staff.branchName ?? (staff.branchId ? branches.get(String(staff.branchId)) || null : null),
        monthlyGross: Math.max(0, Number(staff.sal) || 0),
      });
    }
    return sources;
  }

  private async insertEntry(q: PayrollQueryable, runId: number, source: StaffSource, previous: PayrollEntryDTO | undefined, actor: string) {
    const base = previous
      ? {
          basic: previous.basic, housing: previous.housing, transport: previous.transport, otherAllowances: previous.otherAllowances,
          overtime: 0, bonus: 0, loan: previous.loan, otherDeductions: 0, overrides: previous.overrides,
        }
      : { ...splitGross(source.monthlyGross), overtime: 0, bonus: 0, loan: 0, otherDeductions: 0, overrides: {} };
    const pay = calculatePay(base);
    await q.query(
      `INSERT INTO payroll_entries (
         run_id, staff_key, staff_user_id, username, emp_name, emp_id, job_title, role, dept, branch_id, branch_name,
         bank_name, account_number, basic, housing, transport, other_allowances, overtime, bonus, gross,
         pension_employee, pension_employer, nhis, taxable, paye, loan, other_deductions, total_deductions, net, overrides, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
       ON CONFLICT (run_id, staff_key) DO NOTHING`,
      [runId, source.staffKey, source.staffUserId, source.username, source.empName, source.empId, source.jobTitle, source.role,
        source.dept, source.branchId, source.branchName, previous?.bankName ?? "", previous?.accountNumber ?? "",
        pay.basic, pay.housing, pay.transport, pay.otherAllowances, pay.overtime, pay.bonus, pay.gross,
        pay.pensionEmployee, pay.pensionEmployer, pay.nhis, pay.taxableMonthly, pay.paye, pay.loan, pay.otherDeductions,
        pay.totalDeductions, pay.net, JSON.stringify(pay.overrides), actor],
    );
  }

  private async previousEntries(q: PayrollQueryable, period: string): Promise<Map<string, PayrollEntryDTO>> {
    const { rows } = await q.query(
      `SELECT DISTINCT ON (e.staff_key) e.*
       FROM payroll_entries e JOIN payroll_runs r ON r.id = e.run_id
       WHERE r.period < $1
       ORDER BY e.staff_key, r.period DESC`,
      [period],
    );
    return new Map(rows.map(row => [row.staff_key as string, entryFromRow(row)]));
  }

  private async lockedRun(q: PayrollQueryable, runId: number) {
    const { rows } = await q.query(`SELECT * FROM payroll_runs WHERE id = $1 FOR UPDATE`, [runId]);
    if (!rows[0]) throw new PayrollError(404, "Payroll not found");
    return rows[0];
  }

  private async log(q: PayrollQueryable, runId: number, actor: Actor, action: string, note?: string) {
    const entry = { action, by: actor.username, role: actor.role, at: new Date().toISOString(), ...(note ? { note } : {}) };
    await q.query(
      `UPDATE payroll_runs SET history = history || $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [runId, JSON.stringify([entry])],
    );
  }

  // ── Runs ──

  async listRuns(): Promise<PayrollRunDTO[]> {
    const pool = await this.ensure();
    const { rows } = await pool.query(`${RUN_SELECT} GROUP BY r.id ORDER BY r.period DESC`);
    return rows.map(runFromRow);
  }

  async getRun(runId: number): Promise<{ run: PayrollRunDTO; entries: PayrollEntryDTO[] }> {
    const pool = await this.ensure();
    const { rows } = await pool.query(`${RUN_SELECT} WHERE r.id = $1 GROUP BY r.id`, [runId]);
    if (!rows[0]) throw new PayrollError(404, "Payroll not found");
    const entries = await pool.query(
      `SELECT e.*, r.period FROM payroll_entries e JOIN payroll_runs r ON r.id = e.run_id
       WHERE e.run_id = $1 ORDER BY e.branch_name NULLS LAST, e.emp_name`,
      [runId],
    );
    return { run: runFromRow(rows[0]), entries: entries.rows.map(entryFromRow) };
  }

  async createRun(period: string, actor: Actor, notes = ""): Promise<number> {
    if (!isPayrollPeriod(period)) throw new PayrollError(400, "Choose a payroll month (YYYY-MM)");
    return this.tx(async q => {
      await q.query(`SELECT pg_advisory_xact_lock(hashtext('petrotrack:payroll'))`);
      const existing = await q.query(`SELECT id FROM payroll_runs WHERE period = $1`, [period]);
      if (existing.rows[0]) throw new PayrollError(409, "A payroll for this month already exists. Open it to edit.");
      const { rows } = await q.query(
        `INSERT INTO payroll_runs (period, notes, created_by, history) VALUES ($1, $2, $3, $4::jsonb) RETURNING id`,
        [period, cleanText(notes, 500), actor.username,
          JSON.stringify([{ action: "Payroll generated", by: actor.username, role: actor.role, at: new Date().toISOString() }])],
      );
      const runId = Number(rows[0].id);
      const [sources, previous] = await Promise.all([this.staffSources(q), this.previousEntries(q, period)]);
      for (const source of sources) await this.insertEntry(q, runId, source, previous.get(source.staffKey), actor.username);
      return runId;
    });
  }

  /** Adds staff enrolled since the payroll was generated and refreshes names, roles and branches. */
  async syncStaff(runId: number, actor: Actor): Promise<number> {
    return this.tx(async q => {
      const run = await this.lockedRun(q, runId);
      if (!PREPARING_STATUSES.has(run.status)) throw new PayrollError(409, "Only a draft or returned payroll can be refreshed");
      const [sources, previous, existing] = await Promise.all([
        this.staffSources(q),
        this.previousEntries(q, run.period),
        q.query(`SELECT staff_key FROM payroll_entries WHERE run_id = $1`, [runId]),
      ]);
      const have = new Set(existing.rows.map(row => row.staff_key));
      let added = 0;
      for (const source of sources) {
        if (have.has(source.staffKey)) {
          await q.query(
            `UPDATE payroll_entries SET username = $3, emp_name = $4, emp_id = COALESCE($5, emp_id), role = $6,
               branch_id = $7, branch_name = $8, job_title = COALESCE($9, job_title), dept = COALESCE($10, dept)
             WHERE run_id = $1 AND staff_key = $2`,
            [runId, source.staffKey, source.username, source.empName, source.empId, source.role, source.branchId,
              source.branchName, source.jobTitle, source.dept],
          );
        } else {
          await this.insertEntry(q, runId, source, previous.get(source.staffKey), actor.username);
          added += 1;
        }
      }
      await this.log(q, runId, actor, "Staff list refreshed", added ? `${added} added` : undefined);
      return added;
    });
  }

  async deleteRun(runId: number, actor: Actor): Promise<void> {
    await this.tx(async q => {
      const run = await this.lockedRun(q, runId);
      if (!PREPARING_STATUSES.has(run.status) && actor.role !== "admin") {
        throw new PayrollError(409, "Only a draft or returned payroll can be deleted");
      }
      await q.query(`DELETE FROM payroll_runs WHERE id = $1`, [runId]);
    });
  }

  async updateNotes(runId: number, notes: string, actor: Actor): Promise<void> {
    await this.tx(async q => {
      await this.lockedRun(q, runId);
      await q.query(`UPDATE payroll_runs SET notes = $2, updated_at = NOW() WHERE id = $1`, [runId, cleanText(notes, 500)]);
      await this.log(q, runId, actor, "Notes updated");
    });
  }

  /**
   * submit: HR → Accountant. approve: Accountant → MD, then MD → released.
   * return: Accountant or MD sends it back to HR with a note.
   */
  async transition(runId: number, action: "submit" | "approve" | "return", actor: Actor, note = ""): Promise<PayrollRunDTO["status"]> {
    return this.tx(async q => {
      const run = await this.lockedRun(q, runId);
      const status = run.status as PayrollStatus;
      const isAdmin = actor.role === "admin";
      let next: PayrollStatus;
      let label: string;
      let extra = "";
      if (action === "submit") {
        if (!PAYROLL_PREPARER_ROLES.has(actor.role)) throw new PayrollError(403, "Only HR can submit payroll");
        if (!PREPARING_STATUSES.has(status)) throw new PayrollError(409, "This payroll has already been submitted");
        const count = await q.query(`SELECT COUNT(*)::int AS n FROM payroll_entries WHERE run_id = $1`, [runId]);
        if (!count.rows[0]?.n) throw new PayrollError(400, "Add at least one staff member before submitting");
        next = "acc_review"; label = "Submitted to Accountant";
        extra = ", submitted_by = $3, submitted_at = NOW()";
      } else if (action === "approve") {
        if (status === "acc_review" && (actor.role === "acc" || isAdmin)) {
          next = "md_review"; label = "Reviewed by Accountant"; extra = ", reviewed_by = $3, reviewed_at = NOW()";
        } else if (status === "md_review" && (actor.role === "md" || isAdmin)) {
          next = "released"; label = "Approved by MD — payslips released";
          extra = ", approved_by = $3, approved_at = NOW(), released_at = NOW()";
        } else {
          throw new PayrollError(403, status === "acc_review" ? "Waiting for the Accountant's review" : status === "md_review" ? "Waiting for MD approval" : "This payroll is not awaiting approval");
        }
      } else {
        const canReturn = (status === "acc_review" && (actor.role === "acc" || isAdmin)) || (status === "md_review" && (actor.role === "md" || isAdmin));
        if (!canReturn) throw new PayrollError(403, "You cannot return this payroll at its current stage");
        if (!note.trim()) throw new PayrollError(400, "Say what HR should correct");
        next = "returned"; label = "Returned to HR";
      }
      await q.query(`UPDATE payroll_runs SET status = $2${extra}, updated_at = NOW() WHERE id = $1`,
        extra ? [runId, next, actor.username] : [runId, next]);
      await this.log(q, runId, actor, label, cleanText(note, 500) || undefined);
      return next;
    });
  }

  // ── Entries ──

  async addEntry(runId: number, input: EntryPatch, actor: Actor): Promise<PayrollEntryDTO> {
    const empName = cleanText(input.empName);
    if (!empName) throw new PayrollError(400, "Staff name is required");
    const id = await this.tx(async q => {
      const run = await this.lockedRun(q, runId);
      if (!PREPARING_STATUSES.has(run.status)) throw new PayrollError(409, "Staff can only be added while the payroll is a draft or returned");
      await this.insertEntry(q, runId, {
        staffKey: `manual:${randomUUID()}`, staffUserId: null, username: null, empName,
        empId: cleanText(input.empId) || null, jobTitle: cleanText(input.jobTitle) || null, role: null,
        dept: cleanText(input.dept) || null, branchId: null, branchName: null,
        monthlyGross: input.monthlyGross === undefined ? 0 : money(input.monthlyGross, "Monthly gross"),
      }, undefined, actor.username);
      const { rows } = await q.query(`SELECT id FROM payroll_entries WHERE run_id = $1 ORDER BY id DESC LIMIT 1`, [runId]);
      await this.log(q, runId, actor, "Staff added", empName);
      return Number(rows[0].id);
    });
    return this.getEntry(id);
  }

  async removeEntry(runId: number, entryId: number, actor: Actor): Promise<void> {
    await this.tx(async q => {
      const run = await this.lockedRun(q, runId);
      if (!PREPARING_STATUSES.has(run.status)) throw new PayrollError(409, "Staff can only be removed while the payroll is a draft or returned");
      const { rows } = await q.query(`DELETE FROM payroll_entries WHERE id = $1 AND run_id = $2 RETURNING emp_name`, [entryId, runId]);
      if (!rows[0]) throw new PayrollError(404, "Payslip not found");
      await this.log(q, runId, actor, "Staff removed", rows[0].emp_name);
    });
  }

  async getEntry(entryId: number): Promise<PayrollEntryDTO> {
    const pool = await this.ensure();
    const { rows } = await pool.query(
      `SELECT e.*, r.period, r.status AS run_status, r.released_at FROM payroll_entries e
       JOIN payroll_runs r ON r.id = e.run_id WHERE e.id = $1`,
      [entryId],
    );
    if (!rows[0]) throw new PayrollError(404, "Payslip not found");
    return entryFromRow(rows[0]);
  }

  async updateEntry(runId: number, entryId: number, patch: EntryPatch, actor: Actor): Promise<{ entry: PayrollEntryDTO; revised: boolean }> {
    const result = await this.tx(async q => {
      const run = await this.lockedRun(q, runId);
      if (!EDITABLE_STATUSES.has(run.status)) {
        throw new PayrollError(409, "This payroll is under review. Ask the reviewer to return it before editing.");
      }
      const { rows } = await q.query(`SELECT * FROM payroll_entries WHERE id = $1 AND run_id = $2 FOR UPDATE`, [entryId, runId]);
      if (!rows[0]) throw new PayrollError(404, "Payslip not found");
      const current = entryFromRow({ ...rows[0], period: run.period });
      const released = run.status === "released";
      if (released && !cleanText(patch.reason, 300)) throw new PayrollError(400, "Give a reason for changing a released payslip");

      const earnings: Record<string, number> = {};
      if (patch.monthlyGross !== undefined) Object.assign(earnings, splitGross(money(patch.monthlyGross, "Monthly gross")));
      for (const field of EARNING_FIELDS) {
        if (patch[field] !== undefined) earnings[field] = money(patch[field], field);
      }
      const overrides: Partial<Record<OverridableField, number>> = { ...current.overrides };
      for (const field of OVERRIDABLE_FIELDS) {
        if (patch[field] === null) delete overrides[field];
        else if (patch[field] !== undefined) overrides[field] = money(patch[field], field);
      }
      const pay = payColumns({
        basic: earnings.basic ?? current.basic,
        housing: earnings.housing ?? current.housing,
        transport: earnings.transport ?? current.transport,
        otherAllowances: earnings.otherAllowances ?? current.otherAllowances,
        overtime: earnings.overtime ?? current.overtime,
        bonus: earnings.bonus ?? current.bonus,
        loan: patch.loan !== undefined ? money(patch.loan, "Loan recovery") : current.loan,
        otherDeductions: patch.otherDeductions !== undefined ? money(patch.otherDeductions, "Other deductions") : current.otherDeductions,
        overrides,
      });
      const text = (value: unknown, fallback: string | null, max = 120) => (value === undefined ? fallback : cleanText(value, max));
      const empName = text(patch.empName, current.empName) || current.empName;

      if (released) {
        await q.query(
          `INSERT INTO payroll_entry_revisions (entry_id, version, snapshot, reason, changed_by) VALUES ($1, $2, $3::jsonb, $4, $5)`,
          [entryId, current.version, JSON.stringify(current), cleanText(patch.reason, 300), actor.username],
        );
      }
      await q.query(
        `UPDATE payroll_entries SET
           emp_name = $3, emp_id = $4, job_title = $5, dept = $6, bank_name = $7, account_number = $8,
           basic = $9, housing = $10, transport = $11, other_allowances = $12, overtime = $13, bonus = $14, gross = $15,
           pension_employee = $16, pension_employer = $17, nhis = $18, taxable = $19, paye = $20, loan = $21,
           other_deductions = $22, other_deductions_label = $23, total_deductions = $24, net = $25, overrides = $26::jsonb,
           note = $27, version = version + $28, updated_by = $29, updated_at = NOW()
         WHERE id = $1 AND run_id = $2`,
        [entryId, runId, empName, text(patch.empId, current.empId) || null, text(patch.jobTitle, current.jobTitle) || null,
          text(patch.dept, current.dept) || null, text(patch.bankName, current.bankName, 80) ?? "",
          text(patch.accountNumber, current.accountNumber, 30) ?? "",
          pay.basic, pay.housing, pay.transport, pay.otherAllowances, pay.overtime, pay.bonus, pay.gross,
          pay.pensionEmployee, pay.pensionEmployer, pay.nhis, pay.taxableMonthly, pay.paye, pay.loan,
          pay.otherDeductions, text(patch.otherDeductionsLabel, current.otherDeductionsLabel, 80) ?? "",
          pay.totalDeductions, pay.net, JSON.stringify(pay.overrides), text(patch.note, current.note, 500) ?? "",
          released ? 1 : 0, actor.username],
      );
      if (released) await this.log(q, runId, actor, "Released payslip revised", `${empName}: ${cleanText(patch.reason, 300)}`);
      return released;
    });
    return { entry: await this.getEntry(entryId), revised: result };
  }

  async revisions(entryId: number) {
    const pool = await this.ensure();
    const { rows } = await pool.query(
      `SELECT version, snapshot, reason, changed_by, changed_at FROM payroll_entry_revisions WHERE entry_id = $1 ORDER BY version DESC`,
      [entryId],
    );
    return rows.map(row => ({
      version: Number(row.version), snapshot: row.snapshot, reason: row.reason, changedBy: row.changed_by, changedAt: iso(row.changed_at),
    }));
  }

  /** Released payslips belonging to this user, newest first. */
  async myPayslips(username: string): Promise<PayrollEntryDTO[]> {
    const pool = await this.ensure();
    const { rows } = await pool.query(
      `SELECT e.*, r.period, r.status AS run_status, r.released_at FROM payroll_entries e
       JOIN payroll_runs r ON r.id = e.run_id
       LEFT JOIN staff_users u ON u.id = e.staff_user_id
       WHERE r.status = 'released' AND (e.username = $1 OR u.username = $1)
       ORDER BY r.period DESC`,
      [username],
    );
    return rows.map(entryFromRow);
  }

  async releasedUsernames(runId: number): Promise<string[]> {
    const pool = await this.ensure();
    const { rows } = await pool.query(
      `SELECT DISTINCT COALESCE(u.username, e.username) AS username FROM payroll_entries e
       LEFT JOIN staff_users u ON u.id = e.staff_user_id WHERE e.run_id = $1`,
      [runId],
    );
    return rows.map(row => row.username).filter((name): name is string => !!name);
  }
}

export const payrollStore = new PayrollStore();
