import { index, integer, jsonb, numeric, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

import { staffUsersTable } from "./users";

const amount = (name: string) => numeric(name, { precision: 14, scale: 2 }).notNull().default("0");

/** One payroll per month: HR prepares → Accountant reviews → MD approves (released). */
export const payrollRunsTable = pgTable("payroll_runs", {
  id:          serial("id").primaryKey(),
  period:      text("period").notNull().unique(),
  status:      text("status").notNull().default("draft"),
  notes:       text("notes").notNull().default(""),
  createdBy:   text("created_by").notNull(),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  submittedBy: text("submitted_by"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  reviewedBy:  text("reviewed_by"),
  reviewedAt:  timestamp("reviewed_at", { withTimezone: true }),
  approvedBy:  text("approved_by"),
  approvedAt:  timestamp("approved_at", { withTimezone: true }),
  releasedAt:  timestamp("released_at", { withTimezone: true }),
  history:     jsonb("history").notNull().default([]),
});

/** One payslip per staff member per payroll. */
export const payrollEntriesTable = pgTable("payroll_entries", {
  id:                   serial("id").primaryKey(),
  runId:                integer("run_id").notNull().references(() => payrollRunsTable.id, { onDelete: "cascade" }),
  staffKey:             text("staff_key").notNull(),
  staffUserId:          integer("staff_user_id").references(() => staffUsersTable.id, { onDelete: "set null" }),
  username:             text("username"),
  empName:              text("emp_name").notNull(),
  empId:                text("emp_id"),
  jobTitle:             text("job_title"),
  role:                 text("role"),
  dept:                 text("dept"),
  branchId:             text("branch_id"),
  branchName:           text("branch_name"),
  bankName:             text("bank_name").notNull().default(""),
  accountNumber:        text("account_number").notNull().default(""),
  basic:                amount("basic"),
  housing:              amount("housing"),
  transport:            amount("transport"),
  otherAllowances:      amount("other_allowances"),
  overtime:             amount("overtime"),
  bonus:                amount("bonus"),
  gross:                amount("gross"),
  pensionEmployee:      amount("pension_employee"),
  pensionEmployer:      amount("pension_employer"),
  nhis:                 amount("nhis"),
  taxable:              amount("taxable"),
  paye:                 amount("paye"),
  loan:                 amount("loan"),
  otherDeductions:      amount("other_deductions"),
  otherDeductionsLabel: text("other_deductions_label").notNull().default(""),
  totalDeductions:      amount("total_deductions"),
  net:                  amount("net"),
  overrides:            jsonb("overrides").notNull().default({}),
  note:                 text("note").notNull().default(""),
  version:              integer("version").notNull().default(1),
  updatedBy:            text("updated_by"),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("payroll_entries_run_id_staff_key_key").on(table.runId, table.staffKey),
  index("payroll_entries_username_idx").on(table.username),
]);

/** Earlier versions of payslips edited after release. */
export const payrollEntryRevisionsTable = pgTable("payroll_entry_revisions", {
  id:        serial("id").primaryKey(),
  entryId:   integer("entry_id").notNull().references(() => payrollEntriesTable.id, { onDelete: "cascade" }),
  version:   integer("version").notNull(),
  snapshot:  jsonb("snapshot").notNull(),
  reason:    text("reason").notNull().default(""),
  changedBy: text("changed_by").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("payroll_entry_revisions_entry_idx").on(table.entryId),
]);
