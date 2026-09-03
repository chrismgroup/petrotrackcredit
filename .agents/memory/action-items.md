---
name: Action Items workflow
description: Durable rules for action-item assignment, permissions, urgency, locking, and branch archives.
---

Action Items are a separate shared collection and dedicated My Jobs page rather than reusing the existing recurring Task status model. Each item belongs to a branch and keeps the assigned account identity plus role fallback for legacy accounts.

**Why:** Existing Tasks use `commenced`, `progressing`, and `completed`, while Action Items require `open`, `on-going`, and `closed`; mixing the two would make status and permission behavior ambiguous.

**How to apply:** Keep task assignment and KPI management on Tasks & KPIs. Treat the assigned action party or CEO as the only users allowed to change an open Action Item. Closing is terminal: record the closer and timestamp, mark the item archived, and preserve it in the branch archive. Urgency is overdue/red for past dates, yellow for dates within 14 days, and green beyond 14 days.

Action Items are presented as a horizontally scrollable table with ID, created date, description, action party, target close-out date, status, and optional branch columns. Home surfaces outstanding items to CEO, MD, Accountant, CSM/HR, and station managers; global roles see all branches while station managers remain branch-scoped.

**Why:** These roles need a fast operational glance without opening Tasks, while branch scoping must remain consistent with the rest of the operational dashboard.

**How to apply:** Keep the table compact and urgency-sorted on Home, and reuse the same table presentation on the dedicated Action Items page so the fields and status meaning stay consistent.

Action Item Home visibility uses the existing admin-managed per-user access override map with a dedicated dashboard permission key. Default visibility remains for CEO, MD, Accountant, CSM/HR, station managers, and admin; admins can override access for any active non-admin account from System Settings > Access > By User.

**Why:** Reusing the existing Access Control persistence keeps grants synchronized across devices and avoids a second permission model.

**How to apply:** A per-user override takes precedence over the role default. The grant controls the Home dashboard panel; preserve existing branch scoping for station managers.