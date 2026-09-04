---
name: Command-owned workflows
description: Authority and reliability rules for delivery, expense, budget, dip, and price-proposal mutations.
---

Deliveries, expenses, budgets, dips, and price proposals are server-authoritative workflows. Mutations must use typed commands with an expected revision and stable idempotency key; generic full-array state writes are not a compatibility path.

**Why:** A stale device array can reverse another user's valid transition, and client-owned approval side effects can duplicate inventory, price history, or audit records. A notification failure after commit must also never turn a successful command into an HTTP error that encourages a duplicate retry.

**How to apply:** Keep legal source-status, role, branch, identity, timestamp, side-effect, and replay decisions inside one server command. Return the canonical record, reconcile clients from it, block generic writes for command-owned collections, and treat durable notification delivery as secondary to the committed command response.