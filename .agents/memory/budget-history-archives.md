---
name: Budget history archives
description: Durable ordering, eligibility, and sync rules for archiving historical budgets.
---

Budget lists use the applies-on period and display newest first. Historical archiving is available only to the accountant or admin, with age choices of 1, 3, 6, 9, or 12 months. Only drafts, rejected budgets, and fully approved budgets may be archived; submitted or MD-pending budgets must remain active.

**Why:** Archiving is intended to tidy the active screen without hiding work that still needs an accountant or MD decision. Because budget state is synchronized as a full array, a stale device must not remove archive metadata and make an old budget active again.

**How to apply:** Preserve archived records in shared state, keep archive metadata additive during merges, exclude archived budgets from active totals and normal lists, and expose them through the accountant’s Archived view.