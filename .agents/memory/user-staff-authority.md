---
name: User and staff authority
description: Confirmed management authority and safe reconciliation rules for login accounts and staff-directory records.
---

Admin and HR/CSM share full authority to create, edit, activate, suspend, reactivate, and delete user accounts and staff records. A manager cannot delete the account currently being used.

Every user must have a linked staff record, every staff record must have a linked user record, and each linked pair must carry an existing branch ID plus that branch's canonical name. Transfers update both sides together; Head Office is the default branch when available, not a branchless/global assignment.

Every account/staff pair must also share one permanent staff ID. Legacy records receive an ID during reconciliation; promotions, department changes, and branch transfers must preserve it. Assigned IDs cannot be changed or reused.

**Why:** The user explicitly chose shared control after production review showed HR was intentionally restricted to enrollments while Admin had full account control.

**How to apply:** Keep mobile controls and API authorization aligned for both roles. Require a valid branch and permanent staff ID for new records, synchronize linked records, and propagate branch renames without changing staff IDs. Reconciliation may create a pending-activation account for unmatched staff, but must not guess among duplicate identities.