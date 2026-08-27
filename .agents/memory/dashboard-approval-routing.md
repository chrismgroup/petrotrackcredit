---
name: Dashboard approval routing
description: Dashboard approval summaries must open actionable workflow queues rather than analytics-only reports.
---

An approval summary’s “See all” action must resolve to the workflow screen that can display and act on the pending records. Analytics/reporting screens should remain read/export views and must not be used as approval inboxes.

**Why:** A dashboard can correctly count pending workflow records while an analytics screen intentionally renders only approved/reporting data, making the user-facing queue appear empty.

**How to apply:** Keep approval routing explicit and tested; when a deep link includes a queue/tab instruction, the destination screen must honor it for every role that can receive the link.