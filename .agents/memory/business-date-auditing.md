---
name: Business-date auditing
description: The date semantics used for operational records and historical reporting
---

Operational records must carry an explicit business/applies-on date selected by the user; submission and approval timestamps remain separate audit metadata. Historical views, daily totals, and report filters should use the applies-on date rather than the timestamp when the record was entered.

**Why:** Staff may enter a record after the calendar day it belongs to, and replacing the business date with submission time makes prior-day revenue, expenses, deliveries, dips, and maintenance impossible to audit reliably.

**How to apply:** Reuse the shared date selector for new operational forms, validate that required records have a selected date, preserve backward-compatible fallbacks for legacy records, and label both applies-on and submitted/approved times when showing audit history.