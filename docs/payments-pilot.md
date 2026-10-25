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
- Each terminal has a Postgres-generated UUID and every active terminal must
  be assigned to a pump; the database allows only one active terminal per
  pump per branch. Disable a terminal (with `disabled_at`) before assigning a
  replacement to the same pump.
- Map each terminal to exactly one open shift (enforced by a partial unique
  index); unmatched events are held as exceptions rather than assigned
  speculatively.
- Amounts are `bigint` kobo, so a single transaction is not capped at ₦21.47M.
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

## Pilot implementation (sandbox)

Petrotrack does not process payments. The POS provider (Moniepoint or
another acquirer) charges the customer and settles funds; Petrotrack only
records signed notifications of payments that already happened.

- Webhook: `POST /api/payments/webhooks/:provider`. Only `sandbox` is enabled;
  `moniepoint` returns 503 until its schema and signature scheme are confirmed.
- Enable the sandbox with `PAYMENTS_SANDBOX_WEBHOOK_SECRET` (32+ characters).
  It is ignored when `NODE_ENV=production` unless `PAYMENTS_ALLOW_SANDBOX=true`.
- Headers: `x-petrotrack-timestamp` (Unix seconds, ±300s) and
  `x-petrotrack-signature: v1=<hex HMAC-SHA256(secret, "<timestamp>." + raw body)>`.
- Body:

```json
{
  "eventId": "evt_123",
  "eventType": "pos.transaction",
  "occurredAt": "2026-10-18T10:00:00Z",
  "transaction": {
    "id": "txn_123",
    "terminalId": "2KUD0001",
    "method": "card",
    "status": "successful",
    "amountKobo": 1500000,
    "currency": "NGN",
    "reference": "RRN123"
  }
}
```

  `method` is `card` or `transfer`; `status` is `successful`, `failed` or
  `reversal` (reversals require `reversalOf`). Only `reference`, `rrn`, `stan`,
  `cardScheme`, `narration` and `senderBank` metadata are kept.
- Unknown terminals get 422 and nothing is stored, so the provider retries after
  the terminal is registered. Replayed event or transaction IDs return 200
  without creating duplicates.
- App screens: **POS Terminals** (admin: register a terminal UUID to one pump,
  disable, simulate a notification) and **POS Transactions** (Finance: totals and
  list by branch, pump, period and method).
- Shift reports show a read-only **POS terminal total for this shift** card
  (`GET /api/payments/shift-summary?pumpId=&date=YYYY-MM-DD[&branchId=]`): the
  net card and transfer totals for that pump's Lagos business day, reversals,
  failed attempts, transaction count and times, the assigned terminal, the
  difference from the amounts typed on the report, and the transaction list.
  Visible to attendants and managers (own branch only) and to admin, CEO, MD,
  accountants and the other global viewers (HR, marketing).
- Shadow mode: manual POS/transfer inputs remain unchanged for one week. The\n  shift card displays the signed Moniepoint total next to them and flags the\n  variance. After the pilot, enable automatic field population only after\n  comparing every shift and resolving exceptions.


## Terminal-to-shift assignment

A POS terminal belongs to a **branch**, not to a pump. An attendant starts a
shift by claiming one or more branch terminals. Each claim is a time-bounded
assignment, so a replacement terminal can be added when the original fails.

The shift POS value is the net of completed provider transactions occurring
within the union of that attendant shift's terminal-assignment intervals.
It is intentionally not apportioned between PMS, AGO, LPG, or pumps: meter
readings establish product sales, while the POS feed independently controls
the attendant's total electronic collections. A terminal cannot have
overlapping active assignments.
