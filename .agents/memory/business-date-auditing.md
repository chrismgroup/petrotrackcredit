---
name: Business-date auditing
description: The date semantics used for operational records and historical reporting
---

Operational records must carry an explicit business/applies-on date selected by the user; submission and approval timestamps remain separate audit metadata. Historical views, daily totals, and report filters should use the applies-on date rather than the timestamp when the record was entered.

**Why:** Staff may enter a record after the calendar day it belongs to, and replacing the business date with submission time makes prior-day revenue, expenses, deliveries, dips, and maintenance impossible to audit reliably.

**How to apply:** Reuse the shared date selector for new operational forms, validate that required records have a selected date, preserve backward-compatible fallbacks for legacy records, and label both applies-on and submitted/approved times when showing audit history.

Reporting periods are calendar periods, not rolling day counts: daily is one date, weekly is Monday–Sunday, monthly is the 1st through the last day, quarterly is the calendar quarter, and yearly is January 1 through December 31.

Revenue KPIs and revenue reports should use the same approved pump-report gross revenue source and the selected record business date.

Home Branch Performance is a current-calendar-month comparison. Filter each branch’s sales by business date from the first through last day of the current month; never rank branches using lifetime revenue.

Attendants may submit shift reports for today or any earlier business date, but never a future date; use the device’s local calendar date for this comparison rather than UTC.

**Why:** A future-dated meter report can make a shift appear to have happened before its physical readings exist and can distort operational sequencing and audit review.

**How to apply:** Enforce the rule in both the shift-entry UI and the shared state mutation, including attendant re-submissions of returned reports. Admin date-correction workflows remain separate.