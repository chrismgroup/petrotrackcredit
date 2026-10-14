-- Additive production migration. Apply through the approved deployment process;
-- do not use drizzle-kit push against production.
CREATE TABLE IF NOT EXISTS payment_terminals (id text PRIMARY KEY, provider text NOT NULL, provider_terminal_id text NOT NULL, branch_id text NOT NULL, pump_id text, label text NOT NULL, status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), disabled_at timestamptz);
CREATE UNIQUE INDEX IF NOT EXISTS payment_terminals_provider_terminal_unique ON payment_terminals(provider, provider_terminal_id);
CREATE INDEX IF NOT EXISTS payment_terminals_branch_idx ON payment_terminals(branch_id);
CREATE TABLE IF NOT EXISTS terminal_shift_assignments (id text PRIMARY KEY, terminal_id text NOT NULL REFERENCES payment_terminals(id), branch_id text NOT NULL, pump_id text, attendant_username text NOT NULL, opened_at timestamptz NOT NULL, closed_at timestamptz, opened_by text NOT NULL, closed_by text);
CREATE INDEX IF NOT EXISTS terminal_shift_assignments_terminal_time_idx ON terminal_shift_assignments(terminal_id, opened_at);
CREATE INDEX IF NOT EXISTS terminal_shift_assignments_branch_time_idx ON terminal_shift_assignments(branch_id, opened_at);
CREATE TABLE IF NOT EXISTS payment_provider_events (id text PRIMARY KEY, provider text NOT NULL, provider_event_id text NOT NULL, event_type text NOT NULL, payload_sha256 text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), occurred_at timestamptz, signature_version text NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS payment_provider_events_provider_event_unique ON payment_provider_events(provider, provider_event_id);
CREATE TABLE IF NOT EXISTS payment_transactions (id text PRIMARY KEY, provider text NOT NULL, provider_transaction_id text NOT NULL, provider_event_id text NOT NULL, provider_event_record_id text NOT NULL REFERENCES payment_provider_events(id), terminal_id text REFERENCES payment_terminals(id), shift_assignment_id text REFERENCES terminal_shift_assignments(id), branch_id text NOT NULL, pump_id text, method text NOT NULL, status text NOT NULL, amount_kobo integer NOT NULL CHECK (amount_kobo > 0), currency text NOT NULL DEFAULT 'NGN', occurred_at timestamptz NOT NULL, reversal_of_provider_transaction_id text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, recorded_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_provider_tx_unique ON payment_transactions(provider, provider_transaction_id);
CREATE INDEX IF NOT EXISTS payment_transactions_branch_time_idx ON payment_transactions(branch_id, occurred_at);
CREATE INDEX IF NOT EXISTS payment_transactions_terminal_time_idx ON payment_transactions(terminal_id, occurred_at);
CREATE TABLE IF NOT EXISTS payment_ledger_entries (id text PRIMARY KEY, transaction_id text NOT NULL REFERENCES payment_transactions(id), account text NOT NULL, direction text NOT NULL, amount_kobo integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CHECK (direction IN ('debit','credit')), CHECK (amount_kobo > 0));
CREATE INDEX IF NOT EXISTS payment_ledger_entries_transaction_idx ON payment_ledger_entries(transaction_id);
