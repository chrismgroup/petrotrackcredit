---
name: Durable report delivery
description: Reliability rules for report persistence, synchronization, and realtime delivery.
---

Treat an acknowledged per-report database write as the proof that a report was sent. Realtime events carry only invalidation signals; clients must fetch the canonical server snapshot after events and reconnects, while polling remains a recovery fallback. Reset, deletion, and restore must update both the canonical report rows and compatibility state atomically. A durable local outbox is a first-class restore source, not merely a flag attached to a replaceable synced array.

**Why:** Socket delivery is transient, and merging a canonical server snapshot into local state can resurrect deleted records. A report must survive missed events without stale devices being able to erase or revive it.

**How to apply:** Use idempotent report IDs, serialize report lifecycle writes, authorize transitions on the server, and wait for acknowledgement before showing success. Restore queued records directly from the outbox, exclude them from generic whole-array writes, and merge them back after canonical sync until the server contains the same stable identity.