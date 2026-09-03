---
name: Dashboard approval routing
description: Dashboard approval summaries must open actionable workflow queues rather than analytics-only reports.
---

An approval summary must always expose the underlying records and their current workflow owner. Prefer an in-place, role-independent detail sheet for cross-role dashboards; use a workflow screen only when that role is guaranteed to see the same queue. Analytics/reporting screens should remain read/export views and must not be used as approval inboxes.

**Why:** A dashboard can correctly count pending workflow records while a destination screen is role-gated or intentionally renders only approved/reporting data, making the user-facing queue appear empty.

**How to apply:** Keep approval routing explicit and tested. Dashboard details should name the current owner (for example Manager, Accountant, or MD) and show enough record data to identify the report. When a deep link includes a queue/tab instruction, the destination screen must honor it for every role that can receive the link.