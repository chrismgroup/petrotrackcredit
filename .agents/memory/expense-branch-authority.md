---
name: Expense branch authority
description: Expense-to-budget branch linkage and executive decision permissions.
---

Every expense must be logged against a fully approved budget and inherit that budget’s canonical branch ID and branch name. A branch-scoped user cannot select another branch’s budget, and an existing expense cannot be moved across branches during editing.

**Why:** Client-supplied branch fields and loosely linked budget IDs could misattribute expenses to the wrong station.

**How to apply:** Validate the budget and branch on every expense create or edit command. If a historical budget’s branch is ambiguous, require finance classification before accepting expenses against it.

Only the MD can approve or reject a forwarded expense. The CEO receives an informational Home notification but has no expense records, Expenses workspace entry, approval queue, or expense decision controls.

**Why:** Expense decisions are an MD-only responsibility; CEO awareness must not imply decision authority.

**How to apply:** Enforce MD-only decisions in the API first, mirror that restriction in screens and navigation, and keep CEO notifications non-actionable with a Home route.