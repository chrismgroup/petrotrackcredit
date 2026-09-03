---
name: Action Items workflow
description: Durable rules for action-item assignment, permissions, urgency, locking, and branch archives.
---

Action Items are a separate shared collection and dedicated My Jobs page rather than reusing the existing recurring Task status model. Each item belongs to a branch and keeps the assigned account identity plus role fallback for legacy accounts.

**Why:** Existing Tasks use `commenced`, `progressing`, and `completed`, while Action Items require `open`, `on-going`, and `closed`; mixing the two would make status and permission behavior ambiguous.

**How to apply:** Keep task assignment and KPI management on Tasks & KPIs. Treat the assigned action party or CEO as the only users allowed to change an open Action Item. Closing is terminal: record the closer and timestamp, mark the item archived, and preserve it in the branch archive. Urgency is overdue/red for past dates, yellow for dates within 14 days, and green beyond 14 days.

Action Items are presented as responsive summary cards showing description, action party, close-out date, status, and optional branch context. Selecting a card opens the full record and workflow history; IDs and creation dates belong in that detail view rather than the summary. Home surfaces outstanding items to CEO, MD, Accountant, CSM/HR, and station managers; global roles see all branches while station managers remain branch-scoped.

**Why:** These roles need a fast operational glance without opening Tasks, while branch scoping must remain consistent with the rest of the operational dashboard.

**How to apply:** Keep summaries compact and urgency-sorted on Home, reuse the responsive card presentation on the dedicated page, and append a durable history entry for creation and every status transition. Legacy records may reconstruct their creation entry. Put status controls in the detail view and show them only to the assigned action party or CEO; closed records remain viewable but locked. In the add form, choose the action party through a searchable active-user picker rather than an inline account list, and select close-out dates through the shared calendar field with a readable long-date display.

Action Item Home visibility uses the existing admin-managed per-user access override map with a dedicated dashboard permission key. Default visibility remains for CEO, MD, Accountant, CSM/HR, station managers, and admin; admins can override access for any active non-admin account from System Settings > Access > By User.

**Why:** Reusing the existing Access Control persistence keeps grants synchronized across devices and avoids a second permission model.

**How to apply:** A per-user override takes precedence over the role default. The grant controls the Home dashboard panel; preserve existing branch scoping for station managers.