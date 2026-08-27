---
name: Operations stock logs
description: Persisted daily stock ledger records and their calculation rule
---

Operations Stock Log records are one row per branch, product, and business date. Each row stores the prior expected opening quantity, same-day deliveries, same-day approved shift-report sales, expected stock, submitted tank dip, variance, unit, and a status.

**Why:** Inventory needs an auditable operational record while still using the existing authoritative source records instead of allowing manual stock figures to drift from deliveries, shifts, or tank dips.

**How to apply:** For the seed business date, opening is the admin seed. For business date D after the seed, opening is the prior day’s expected book stock, derived from the seed and all dated movements. Delivered is every saved, non-rejected receipt on D; commercial price approval does not delay physical stock. Sold is approved shift-report volume on D. Expected stock is opening + delivered − sold. The submitted tank dip is compared on D. Variance is submitted dip − expected stock: positive is excess, negative is shortage. Resolve dips per product and its assigned tank IDs—never select one newest branch-wide dip and reuse it for every product, because separately submitted same-day dips must all remain visible. Home Stock Snapshot, Receiving Stock Snapshot, and Daily Stock Log must call the shared operational-stock calculation rather than duplicate this logic. When multiple approved reports cover the same pump meter interval, count the unique meter-range union rather than summing duplicates.