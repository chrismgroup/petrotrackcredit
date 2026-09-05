---
name: Shift-report workflow state machine
description: Status flow and locking rules for pump/shift reports (PumpDailyReport)
---

Statuses: `pending_manager` → `pending_accountant` → `approved`, with two correction states: accountant rejection → `returned` (with manager), manager may send it on to `returned_attendant`, and attendant resubmission → `pending_manager`.

**Rules:**
- Approved reports are locked for ordinary edits. For a wrong business date, Admin has three explicit, audited recovery paths: correct only the date while preserving approval; return the report to the accountant for a full correction workflow; or delete it for clean re-entry. Delete must remove the generated sale, reverse the approved tank-sale effect, clear any meter lock, and reset the pump seed to the deleted report's opening reading before the attendant re-enters it.
- An Admin return changes `approved` back to `pending_accountant` and reverses approved sales/tank effects while it is reviewed. Accountant rejection sends it to `returned`; the station manager may send it onward to `returned_attendant`.
- The original attendant may edit, re-submit, or durably delete either correction state (`returned` or `returned_attendant`). Attendant re-submission sends either status back to `pending_manager`.
- Every transition callback in the shared state layer must guard its allowed source status (not just the UI): forward⇐pending_manager, acc reject⇐pending_accountant, mgr resubmit⇐returned, return-to-attendant⇐returned, attendant resubmit⇐returned/returned_attendant + original submitter only. Returned-report deletion must use an authenticated server endpoint and a tombstone.
- Both `returned` and `returned_attendant` are excluded from sold stock (stock book) and revenue; only `pending_accountant`/`approved` count as revenue/validated-meter sources. A valid `pending_manager` report may seed the next opening meter so attendants can continue the next shift immediately, but it must not affect stock or revenue.
- Every persisted workflow transition increments `workflowVersion`; merge uses that revision before device timestamps, so valid corrections survive clock skew while stale copies cannot downgrade newer records.
- Legacy reports may identify the original attendant by login username or employee display name. Authorization must resolve both identities, while new tokens carry both explicitly.
- A complete-array sync must evaluate pump reports independently: an unrelated unauthorized/stale candidate is rejected and reported by ID without rolling back valid transitions in the same request.
- Shift Report access is required for attendants, managers, and accountants; access-control settings must not hide this module from any role in the mandatory approval chain.

**Why:** A code-review round found UI-only guards were bypassable via context calls, letting approved reports re-enter the workflow and become editable. Cross-device failures showed that wall-clock ordering can discard a valid correction or resurrect a locally deleted report, one unrelated array item can reject a manager forward, and confusing display names with usernames can reject a legitimate attendant submission.

**How to apply:** Any new report transition or status must add a source-status guard in AppContext, increment `workflowVersion`, add an entry in PUMP_REPORT_STATUS_RANK, and update shift.tsx STATUS_META, sales.tsx maps, and stock/revenue predicates. Treat approved-date correction, return, and deletion as dedicated admin-only operations with timestamps/audit entries. Returned edits/deletes require original-attendant identity checks by username or employee name. All deletions must use the atomic server endpoint rather than client-only array removal.
