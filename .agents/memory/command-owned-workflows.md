---
name: Command-owned workflows
description: Authority and reliability rules for delivery, expense, budget, dip, and selling-price mutations.
---

Deliveries, expenses, budgets, dips, price proposals, and direct selling-price changes are server-authoritative workflows. Mutations must use typed commands with an expected revision and stable idempotency key; generic full-array state writes are not a compatibility path.

**Why:** A stale device array can reverse another user's valid transition, and client-owned approval side effects can duplicate inventory, price history, or audit records. A notification failure after commit must also never turn a successful command into an HTTP error that encourages a duplicate retry.

**How to apply:** Keep legal source-status, role, branch, identity, timestamp, side-effect, and replay decisions inside one server command. Return the canonical record, reconcile clients from it, block generic writes for command-owned collections, and treat durable notification delivery as secondary to the committed command response. Submission and review screens must await that canonical response, guard each record against duplicate in-flight commands, and show success only after persistence; on failure, retain the user's inputs and expose the server error.

For finance workflows, `acc`, `md`, `ceo`, and `admin` are network-wide reviewers even when an older staff record still contains a branch assignment. Legacy records with no branch tag remain actionable by those reviewers; branch managers remain restricted to their own branch.

**Why:** Existing production accounts and historical records can retain branch metadata from before global finance review was introduced. Applying that metadata to reviewer authorization makes valid accountant or executive approvals fail with a misleading generic client error.

**How to apply:** Keep reviewer scope separate from originator scope in expense, budget, and delivery commands, and return the server’s specific command error to the client instead of collapsing all non-2xx responses into a generic refresh message.

Shared operational arrays that are not yet command-owned must still merge by stable record ID on generic synchronization; omission from a stale full-array PUT is not an authorization to delete a record.

**Why:** Older clients can continue sending complete local snapshots after another device has created a record. Replacing the canonical array makes valid submissions disappear even when the original command committed successfully.

**How to apply:** Use explicit delete or workflow commands for removal, union incoming records with the canonical array, and prefer the newest record version when the same ID appears in both snapshots.