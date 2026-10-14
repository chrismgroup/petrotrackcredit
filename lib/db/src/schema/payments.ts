import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Relational payment records are deliberately separate from app_state.  They
 * are evidence received from a payment provider, not staff-editable workflow
 * snapshots.  Amounts are stored in kobo to avoid rounding a naira value.
 */
export const paymentTerminalsTable = pgTable("payment_terminals", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  providerTerminalId: text("provider_terminal_id").notNull(),
  branchId: text("branch_id").notNull(),
  pumpId: text("pump_id"),
  label: text("label").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
}, table => ({
  providerTerminalUnique: uniqueIndex("payment_terminals_provider_terminal_unique").on(table.provider, table.providerTerminalId),
  branchIndex: index("payment_terminals_branch_idx").on(table.branchId),
}));

/** A closed or active interval used to attribute terminal events to a shift. */
export const terminalShiftAssignmentsTable = pgTable("terminal_shift_assignments", {
  id: text("id").primaryKey(),
  terminalId: text("terminal_id").notNull().references(() => paymentTerminalsTable.id),
  branchId: text("branch_id").notNull(),
  pumpId: text("pump_id"),
  attendantUsername: text("attendant_username").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  openedBy: text("opened_by").notNull(),
  closedBy: text("closed_by"),
}, table => ({
  terminalTimeIndex: index("terminal_shift_assignments_terminal_time_idx").on(table.terminalId, table.openedAt),
  branchTimeIndex: index("terminal_shift_assignments_branch_time_idx").on(table.branchId, table.openedAt),
}));

/** Immutable provider event envelope.  Payload hashes prove the received bytes without retaining cardholder data. */
export const paymentProviderEventsTable = pgTable("payment_provider_events", {
  id: text("id").primaryKey(),
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
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  providerTransactionId: text("provider_transaction_id").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  providerEventRecordId: text("provider_event_record_id").notNull().references(() => paymentProviderEventsTable.id),
  terminalId: text("terminal_id").references(() => paymentTerminalsTable.id),
  shiftAssignmentId: text("shift_assignment_id").references(() => terminalShiftAssignmentsTable.id),
  branchId: text("branch_id").notNull(),
  pumpId: text("pump_id"),
  method: text("method").notNull(),
  status: text("status").notNull(),
  amountKobo: integer("amount_kobo").notNull(),
  currency: text("currency").notNull().default("NGN"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  reversalOfProviderTransactionId: text("reversal_of_provider_transaction_id"),
  metadata: jsonb("metadata").notNull().default({}),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  providerTransactionUnique: uniqueIndex("payment_transactions_provider_tx_unique").on(table.provider, table.providerTransactionId),
  branchTimeIndex: index("payment_transactions_branch_time_idx").on(table.branchId, table.occurredAt),
  terminalTimeIndex: index("payment_transactions_terminal_time_idx").on(table.terminalId, table.occurredAt),
}));

/** A balanced journal is required before funds can affect financial reporting. */
export const paymentLedgerEntriesTable = pgTable("payment_ledger_entries", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").notNull().references(() => paymentTransactionsTable.id),
  account: text("account").notNull(),
  direction: text("direction").notNull(),
  amountKobo: integer("amount_kobo").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  transactionIndex: index("payment_ledger_entries_transaction_idx").on(table.transactionId),
}));

export type PaymentTerminal = typeof paymentTerminalsTable.$inferSelect;
