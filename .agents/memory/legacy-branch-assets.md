---
name: Legacy branch asset records
description: Handling older tank, LPG tank, and pump records that were saved without explicit branch ownership
---

Older persisted asset records can have no `branchId` even though their names clearly identify a branch. This prevents strict branch-scoped Home stock calculations from finding the branch’s tanks and pumps.

**Why:** Branch-scoped inventory must not silently treat every unassigned asset as belonging to every branch, but known legacy records can be recovered when the asset name contains an unambiguous branch marker such as a full location name.

**How to apply:** Repair only unassigned assets with an unambiguous name-to-branch match. Leave generic names unassigned until an administrator explicitly chooses their branch. Do not infer delivery or stock ownership from a product name alone.