---
name: Operations stock logs
description: Persisted daily stock ledger records and their calculation rule
---

Operations Stock Log records are one row per branch, product, and business date. Each row stores opening quantity, deliveries, shift-report sales, book stock, tank dip, variance, unit, and a status.

**Why:** Inventory needs an auditable operational record while still using the existing authoritative source records instead of allowing manual stock figures to drift from deliveries, shifts, or tank dips.

**How to apply:** Use the existing Stock Snapshot seed quantity/date as the baseline; accumulate approved deliveries and pump-report sales from that date forward. Carry forward the latest saved book stock for daily openings, using a prior tank dip only as a legacy fallback. An explicit baseline business date takes precedence over its save timestamp, and a stale seed-day row invalidates the saved chain so it can be rebuilt from the baseline.