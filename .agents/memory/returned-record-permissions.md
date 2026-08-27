---
name: Returned record permissions
description: Ownership and locking rules for returned shift reports and delivery receipts.
---

Returned records go back to the person who originated them: the original attendant for shift reports and the original receiving manager for deliveries. That originator may correct the business date and other information, then delete or resubmit the record. Approved records are locked; only Admin may delete an approved record.

**Why:** Workflow reviewers need a safe correction path without allowing another staff member to alter or remove a record that belongs to a different operator.

**How to apply:** Enforce these rules in shared AppContext mutation callbacks as well as screen controls. Use a distinct returned state for delivery receipts so the originator can be shown the correction actions.