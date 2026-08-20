---
name: Operations stock logs
description: Persisted daily stock ledger records and their calculation rule
---

Operations Stock Log records are one row per branch, product, and business date. Each row stores opening quantity, deliveries, shift-report sales, book stock, tank dip, variance, unit, and a status.

**Why:** Inventory needs an auditable operational record while still using the existing authoritative source records instead of allowing manual stock figures to drift from deliveries, shifts, or tank dips.

**How to apply:** Use the existing Stock Snapshot seed quantity/date as the baseline; accumulate approved deliveries and pump-report sales from that date forward. Rebuild prior-day openings from authoritative business-dated source records when a baseline exists instead of trusting a stale saved row. Carry forward the latest saved book stock only when no live baseline can be derived, falling back to the latest earlier approved tank dip when no valid log exists. Only approved dips are authoritative for tank-dip quantities. An explicit baseline business date takes precedence over its save timestamp, and a stale seed-day row invalidates the saved chain so it can be rebuilt from the baseline. When multiple non-returned reports cover the same pump meter interval, count the unique meter-range union rather than summing duplicate submissions.