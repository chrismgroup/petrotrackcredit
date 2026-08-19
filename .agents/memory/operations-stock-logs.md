---
name: Operations stock logs
description: Persisted daily stock ledger records and their calculation rule
---

Operations Stock Log records are one row per branch, product, and business date. Each row stores opening quantity, deliveries, shift-report sales, book stock, tank dip, variance, unit, and a status.

**Why:** Inventory needs an auditable operational record while still using the existing authoritative source records instead of allowing manual stock figures to drift from deliveries, shifts, or tank dips.

**How to apply:** Calculate opening from the admin seed on its seed date or the previous business-day dip afterward; use `book stock = opening + deliveries - shift-report sales`; compare book stock with the business-day dip; upsert the same branch/product/date key when a log is refreshed.