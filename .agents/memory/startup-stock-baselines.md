---
name: Start-up stock baselines
description: Business rules for configured opening inventory used by the Home Stock Snapshot
---

Start-up stock is an explicit admin-configured baseline for each product and branch scope. It is locked for non-admin users; admins may still update or delete it. LPG uses kilograms while other products use litres.

**Why:** Using the previous day’s dip as the opening quantity made the book-stock calculation circular and prevented an auditable opening balance.

**How to apply:** Calculate `start-up stock + approved deliveries − sales` independently per product. For a branch-scoped user, use that branch’s baseline first and fall back to the all-branches baseline; if no baseline exists, show “Not set” rather than treating it as zero.