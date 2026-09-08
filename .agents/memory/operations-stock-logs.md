---
name: Operations stock logs
description: Persisted daily stock ledger records and their calculation rule
---

Operations Stock Log records are one row per branch, product, and business date. Each row stores the prior expected opening quantity, same-day deliveries, same-day approved shift-report sales, expected stock, submitted tank dip, variance, unit, and a status.

**Why:** Inventory needs an auditable operational record while still using the existing authoritative source records instead of allowing manual stock figures to drift from deliveries, shifts, or tank dips.

**How to apply:** For the seed business date, opening is the admin seed. For business date D after the seed, opening is the prior day’s expected book stock, derived from the seed and all dated movements. Delivered is every saved, non-rejected receipt on D; commercial price approval does not delay physical stock. Sold is approved shift-report volume on D. Expected stock is opening + delivered − sold. Resolve the latest approved dip on or before D per exact branch, product, and assigned tank IDs; pending or rejected dips cannot shadow it. Carry that physical reading forward by the book-stock movement since its dip date, so variance remains anchored to the approved reconciliation instead of comparing stale physical stock directly with a later book balance. Persist the source dip date. Home Stock Snapshot, Receiving Stock Snapshot, and Daily Stock Log must share this rule. When multiple approved reports cover the same pump meter interval, count the unique meter-range union rather than summing duplicates.