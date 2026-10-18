# Additive relational migration plan

## Non-negotiable safety rules

1. `app_state` is never altered, deleted, truncated, renamed, or overwritten.
2. Every new relational table is additive and starts empty.
3. Backfills copy legacy values with their legacy key, stable source identifier,
   source revision/hash, and migration timestamp.
4. A domain remains dual-read/dual-write until independent reconciliation passes.
5. A failed or malformed row is recorded as a migration exception; it is never
   skipped, repaired silently, or deleted.
6. Legacy JSON is retained as an immutable archive after cutover.

## Rollout order

| Wave | Relational domain | Legacy state retained | Reconciliation gate |
| --- | --- | --- | --- |
| 0 | Migration ledger, immutable legacy archive, exceptions | all keys | backup restore and checksum test |
| 1 | Payment terminals, provider events, transactions, ledger, settlements | new payment data | transaction IDs, debit/credit balance, provider totals |
| 2 | Branches, pumps, tanks, products and price history | `branches`, `pumps`, `tanks`, `lpgTanks`, `prices` | IDs, branch ownership, stock opening values |
| 3 | Shift reports, sales, cash/POS/transfer reconciliation | `pumpDailyReports`, `sales`, `shiftReports` | meters, quantities, gross sales and collections |
| 4 | Deliveries, dips, inventory and stock logs | `deliveries`, `dips`, `inventoryLog`, `stockLogs` | litres received/sold/closing stock |
| 5 | Expenses, budgets, suppliers and financial entries | `expenses`, `budgets`, `financialEntry` | approvals and financial totals |
| 6 | Customers, credit sales and customer payments | `creditCustomers`, `customerPayments` | receivables and statements |
| 7 | HR, tasks, messages, maintenance and corporate records | remaining keys | counts, ownership and attachments |

## Cutover protocol for every domain

1. Create tables and indexes through an additive migration.
2. Run a dry-run backfill on a restored production snapshot.
3. Produce a reconciliation report: source count, destination count, duplicate
   count, missing IDs, amount/quantity totals and SHA-256 snapshot hash.
4. Approve the report before production backfill.
5. Backfill production in bounded, idempotent batches; retain source pointers.
6. Enable dual-write for newly created or changed records.
7. Run dual-read comparison for at least one complete reporting cycle.
8. Switch the read path behind a reversible feature flag.
9. Keep legacy JSON read-only and queryable; never delete it.

## Required production evidence

- Verified pre-migration backup and restore test.
- Migration run identifier, operator, timing and source/destination hashes.
- Domain reconciliation report signed off by operations and finance.
- Rollback plan limited to disabling the relational read feature flag; no data
  rollback deletes are permitted.

## Render-shell schema migration

The repository includes `pnpm migrate:relational-schema`. It only creates the
new payment tables and a migration-run ledger; it never writes to `app_state`.
It refuses to run without an explicit approval confirmation and an exact target
database name. Run it against staging first, then retain its JSON output with
the release evidence.
