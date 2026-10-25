-- Move POS terminals from pump ownership to time-bounded attendant shift ownership.
-- Safe to apply after 20261014_payment_reconciliation.sql.

ALTER TABLE payment_terminals
  DROP CONSTRAINT IF EXISTS payment_terminals_active_requires_pump;
DROP INDEX IF EXISTS payment_terminals_active_pump_unique;

-- Historical terminal-to-pump references are retained for audit only. New
-- terminals have a NULL pump_id and are attributed through
-- terminal_shift_assignments.

-- Prevent any overlapping ownership interval for the same terminal.  This
-- supports a replacement terminal in the same shift while ensuring a payment
-- event can belong to at most one attendant shift.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE terminal_shift_assignments
  ADD CONSTRAINT terminal_shift_assignments_no_overlap
  EXCLUDE USING gist (
    terminal_id WITH =,
    tstzrange(opened_at, COALESCE(closed_at, 'infinity'::timestamptz), '[)') WITH &&
  );
