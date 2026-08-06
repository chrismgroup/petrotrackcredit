---
name: Rejected enrollment persistence
description: Rejected enrollment notes and reviewer metadata must live with the staff-user record.
---

Rejected enrollment state is authoritative in the dedicated staff-user database record, including the rejection reason, reviewer, and timestamp. HR may edit and re-submit only records whose persisted status is `rejected`; re-submission clears the rejection metadata and moves the record to `pending_admin`. Admin retains full management access.

**Why:** App-state-only rejection details disappear during the normal user-list refresh, which makes the returned-form workflow inconsistent across devices and can undermine the server-side permission check.

**How to apply:** Keep rejection metadata in the staff-user schema/API mapping whenever changing enrollment review, edit, re-submit, or delete behavior. Treat failed API mutations as failures and do not update local enrollment state optimistically.