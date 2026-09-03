---
name: Action Items workflow
description: Durable rules for action-item assignment, permissions, urgency, locking, and branch archives.
---

Action Items are a separate shared collection under the Tasks screen rather than reusing the existing recurring Task status model. Each item belongs to a branch and keeps the assigned account identity plus role fallback for legacy accounts.

**Why:** Existing Tasks use `commenced`, `progressing`, and `completed`, while Action Items require `open`, `on-going`, and `closed`; mixing the two would make status and permission behavior ambiguous.

**How to apply:** Treat the assigned action party or CEO as the only users allowed to change an open Action Item. Closing is terminal: record the closer and timestamp, mark the item archived, and preserve it in the branch archive. Urgency is overdue/red for past dates, yellow for dates within 14 days, and green beyond 14 days.

Action Items are presented as a horizontally scrollable table with ID, created date, description, action party, target close-out date, status, and optional branch columns. Home surfaces outstanding items to CEO, MD, Accountant, CSM/HR, and station managers; global roles see all branches while station managers remain branch-scoped.

**Why:** These roles need a fast operational glance without opening Tasks, while branch scoping must remain consistent with the rest of the operational dashboard.

**How to apply:** Keep the table compact and urgency-sorted on Home, and reuse the same table presentation in Tasks so the fields and status meaning stay consistent.