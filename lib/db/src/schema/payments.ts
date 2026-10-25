import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Relational payment records are deliberately separate from app_state.  They
 * are evidence received from a payment provider, not staff-editable workflow
 * snapshots.  Amounts are stored in kobo to avoid rounding a naira value.
 * Record IDs are Postgres-generated UUIDs; branch/pump IDs stay text because
 * they reference existing app_state records.
 */
export const paymentTerminalsTable = pgTable("payment_terminals", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  providerTerminalId: text("provider_terminal_id").notNull(),
  branchId: text("branch_id").notNull(),
  /** Terminal belongs to a branch; it is assigned to an attendant shift, never a pump. */
  pumpId: text("pump_id"),
  label: text("label").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
}, table => ({
  providerTerminalUnique: uniqueIndex("payment_terminals_provider_terminal_unique").on(table.provider, table.providerTerminalId),
  branchIndex: index("payment_terminals_branch_idx").on(table.branchId),
  statusCheck: check("payment_terminals_status_check", sql`${table.status} IN ('active', 'disabled')`),
  disabledAtCheck: check("payment_terminals_disabled_at_check", sql`(${table.status} = 'active') = (${table.disabledAt} IS NULL)`),
}));

/** A closed or active interval used to attribute terminal events to a shift. */
export const terminalShiftAssignmentsTable = pgTable("terminal_shift_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  terminalId: uuid("terminal_id").notNull().references(() => paymentTerminalsTable.id),
  branchId: text("branch_id").notNull(),
  pumpId: text("pump_id"),
  attendantUsername: text("attendant_username").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  openedBy: text("opened_by").notNull(),
  closedBy: text("closed_by"),
}, table => ({
  openTerminalUnique: uniqueIndex("terminal_shift_assignments_open_terminal_unique").on(table.terminalId).where(sql`${table.closedAt} IS NULL`),
  terminalTimeIndex: index("terminal_shift_assignments_terminal_time_idx").on(table.terminalId, table.openedAt),
  branchTimeIndex: index("terminal_shift_assignments_branch_time_idx").on(table.branchId, table.openedAt),
  closedAfterOpened: check("terminal_shift_assignments_closed_after_opened", sql`${table.closedAt} IS NULL OR ${table.closedAt} > ${table.openedAt}`),
}));

/** Immutable provider event envelope.  Payload hashes prove the received bytes without retaining cardholder data. */
export const paymentProviderEventsTable = pgTable("payment_provider_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  eventType: text("event_type").notNull(),
  payloadSha256: text("payload_sha256").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  signatureVersion: text("signature_version").notNull(),
}, table => ({
  providerEventUnique: uniqueIndex("payment_provider_events_provider_event_unique").on(table.provider, table.providerEventId),
  receivedIndex: index("payment_provider_events_received_idx").on(table.provider, table.receivedAt),
}));

/** Immutable financial facts. Corrections are new reversal rows, never updates. */
export const paymentTransactionsTable = pgTable("payment_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  providerTransactionId: text("provider_transaction_id").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  providerEventRecordId: uuid("provider_event_record_id").notNull().references(() => paymentProviderEventsTable.id),
  terminalId: uuid("terminal_id").references(() => paymentTerminalsTable.id),
  shiftAssignmentId: uuid("shift_assignment_id").references(() => terminalShiftAssignmentsTable.id),
  branchId: text("branch_id").notNull(),
  pumpId: text("pump_id"),
  method: text("method").notNull(),
  status: text("status").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  reversalOfProviderTransactionId: text("reversal_of_provider_transaction_id"),
  metadata: jsonb("metadata").notNull().default({}),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  providerTransactionUnique: uniqueIndex("payment_transactions_provider_tx_unique").on(table.provider, table.providerTransactionId),
  branchTimeIndex: index("payment_transactions_branch_time_idx").on(table.branchId, table.occurredAt),
  terminalTimeIndex: index("payment_transactions_terminal_time_idx").on(table.terminalId, table.occurredAt),
  amountPositive: check("payment_transactions_amount_positive", sql`${table.amountKobo} > 0`),
}));

/** A balanced journal is required before funds can affect financial reporting. */
export const paymentLedgerEntriesTable = pgTable("payment_ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id").notNull().references(() => paymentTransactionsTable.id),
  account: text("account").notNull(),
  direction: text("direction").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  transactionIndex: index("payment_ledger_entries_transaction_idx").on(table.transactionId),
  directionCheck: check("payment_ledger_entries_direction_check", sql`${table.direction} IN ('debit', 'credit')`),
  amountPositive: check("payment_ledger_entries_amount_positive", sql`${table.amountKobo} > 0`),
}));

export type PaymentTerminal = typeof paymentTerminalsTable.$inferSelect;
