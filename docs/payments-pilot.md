# Petrotrack payments pilot

## What is relational now

The Phase 1 payment path is intentionally outside `app_state`. The additive
tables in `lib/db/src/schema/payments.ts` retain provider evidence, terminal
ownership, attendant/pump shift attribution, transactions, and double-entry
ledger rows. Apply `lib/db/migrations/20261014_payment_reconciliation.sql`
through the approved production-migration process before deploying payment
code. It does not alter or delete existing data.

## Moniepoint integration boundary

Petrotrack is not a payment processor and never receives PAN, PIN, CVV, or
customer bank credentials. Moniepoint remains the acquirer and settlement
provider. Petrotrack consumes only signed transaction evidence.

Before an endpoint is enabled, obtain these from Moniepoint in writing:

1. Production and sandbox POS API credentials with `transaction:push`,
   `transaction:read`, and webhook scopes.
2. The current `V1_POS_TRANSACTION` payload schema, event IDs, retry policy,
   signature header, canonicalization rules, and signature algorithm.
3. A webhook secret/certificate rotation process and source IP ranges, if
   Moniepoint supports allow-listing.
4. Terminal identifiers, merchant IDs, settlement account, settlement report
   format, and reversal/refund events.

Do not enable a webhook merely from a terminal ID or a static bearer token.
The handler must verify the signature against the unmodified request bytes,
deduplicate the provider event ID, then record only the minimal payment facts.

## Required event flow

```text
Moniepoint terminal event
  -> TLS endpoint and provider-signature verification
  -> provider-event idempotency check
  -> immutable provider event + payload SHA-256
  -> terminal lookup
  -> active terminal/attendant/pump shift lookup
  -> immutable payment transaction
  -> two balanced ledger entries
  -> reconciliation update / exception if unmatched or reversed
```

Only successful card collections create a `card_collections` debit and a
`card_clearing` credit. Reversals create new opposite entries; no record is
edited or deleted. Settlement is recorded separately, so gross card sales,
processor fees, and bank cash received remain distinguishable.

## Controls for the pilot

- Payment credentials live only in deployment secret storage, never Expo or
  repository files.
- Enforce HTTPS, request size limits, signature verification, timestamp skew,
  replay/idempotency checks, rate limits, and audit alerts.
- Map each terminal to exactly one active shift; unmatched events are held as
  exceptions rather than assigned speculatively.
- Attendants cannot create, edit, delete, or reconcile provider transactions.
- Managers can view their branch exceptions; accountants reconcile; lenders
  only receive consented, read-only aggregate reports.
- Retain no cardholder data; mask/redact provider metadata before persistence.

## Lender data room

Lender reports must be a separate read-only projection, scoped by company
consent and time range. It should show confirmed collections, settlements,
meter-derived expected sales, stock/delivery evidence, reconciliation rate,
and exceptions. It must not expose employee credentials, customer card data,
or raw webhook payloads.
