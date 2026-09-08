---
name: Budget consolidation
description: Monthly budget consolidation rules for duplicate branch records and unassigned finance records.
---

Monthly consolidation is an authenticated finance action: group by authoritative branch, map Accountant/Admin-created unassigned records to Head office, merge line items, archive duplicate sources, relink expenses, and preserve workflow/audit history. A merged group is fully approved only when every source was fully approved; otherwise it returns to Accountant review.

**Why:** September production contained multiple records per manager and unassigned Accountant records, while expenses still pointed at source budgets. Silent approval or losing those links would corrupt spend reporting.

**How to apply:** Keep consolidation server-authoritative and revision-safe, require a Head office branch, exclude archived records from active uniqueness checks, and keep the one-submitted-budget-per-branch/month rule enforced across create and submit paths.