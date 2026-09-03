---
name: Action Items workflow
description: Durable rules for action-item assignment, permissions, urgency, locking, and branch archives.
---

Action Items are a separate shared collection under the Tasks screen rather than reusing the existing recurring Task status model. Each item belongs to a branch and keeps the assigned account identity plus role fallback for legacy accounts.

**Why:** Existing Tasks use `commenced`, `progressing`, and `completed`, while Action Items require `open`, `on-going`, and `closed`; mixing the two would make status and permission behavior ambiguous.

**How to apply:** Treat the assigned action party or CEO as the only users allowed to change an open Action Item. Closing is terminal: record the closer and timestamp, mark the item archived, and preserve it in the branch archive. Urgency is overdue/red for past dates, yellow for dates within 14 days, and green beyond 14 days.