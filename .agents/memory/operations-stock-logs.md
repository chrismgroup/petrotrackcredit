---
name: Operations stock logs
description: Persisted daily stock ledger records and their calculation rule
---

Operations Stock Log records are one row per branch, product, and business date. Each row stores opening quantity, deliveries, prior-day approved shift-report sales, expected stock, tank dip, variance, unit, and a status.

**Why:** Inventory needs an auditable operational record while still using the existing authoritative source records instead of allowing manual stock figures to drift from deliveries, shifts, or tank dips.

**How to apply:** For business date D, opening is the approved dip from D−1, falling back to the admin seed. Delivered is quantity received on D. Sold is approved shift-report volume from D−1. Expected stock is opening + delivered − sold. The closing dip is the approved dip on D. Variance is closing dip − expected stock: positive is excess, negative is shortage. Home Stock Snapshot and Daily Stock Log must call the shared operational-stock calculation rather than duplicate this logic. Do not substitute older dips or saved book-stock rows for the exact prior-day dip. When multiple approved reports cover the same pump meter interval, count the unique meter-range union rather than summing duplicates.