---
name: Branch data isolation
description: Secure defaults for branch-owned operational records and manager visibility
---

Every newly submitted branch-owned record must receive its branch ID and canonical branch name from server-authoritative branch data. A client-provided display name is never authoritative.

Branch managers may read and mutate only records whose explicit branch ID equals their assigned branch. Untagged legacy records are excluded rather than guessed, and complete-array synchronization must preserve other branches server-side without returning or accepting changes to them.

**Why:** Client-side filtering allowed complete company collections to reach manager devices, while missing branch IDs were sometimes treated as matching every branch.

**How to apply:** Enforce exact branch matching on full-state reads, per-key reads, workflow commands, and sync responses. Resolve canonical identity before persistence for shift reports, budgets, expenses, dips, deliveries, and future branch-owned record types.