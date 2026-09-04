---
name: Shift-report workflow state machine
description: Status flow and locking rules for pump/shift reports (PumpDailyReport)
---

Statuses: `pending_manager` → `pending_accountant` → `approved`, with two correction states: accountant rejection → `returned` (with manager), manager may send it on to `returned_attendant` (with the original attendant), who resubmits → `pending_manager`.

**Rules:**
- Approved reports are locked for ordinary edits. For a wrong business date, Admin has three explicit, audited recovery paths: correct only the date while preserving approval; return the report to the accountant for a full correction workflow; or delete it for clean re-entry. Delete must remove the generated sale, reverse the approved tank-sale effect, clear any meter lock, and reset the pump seed to the deleted report's opening reading before the attendant re-enters it.
- An Admin return changes `approved` back to `pending_accountant` and reverses approved sales/tank effects while it is reviewed. Accountant rejection sends it to `returned`; the station manager may reject it onward to `returned_attendant`; the original attendant can correct the applies-on date and re-submit it to the manager.
- Every transition callback in the shared state layer must guard its allowed source status (not just the UI): forward⇐pending_manager, acc reject⇐pending_accountant, mgr resubmit⇐returned, return-to-attendant⇐returned, attendant resubmit⇐returned_attendant + original submitter only.
- Both `returned` and `returned_attendant` are excluded from sold stock (stock book) and revenue; only `pending_accountant`/`approved` count as revenue/validated-meter sources. A valid `pending_manager` report may seed the next opening meter so attendants can continue the next shift immediately, but it must not affect stock or revenue.
- Every persisted workflow transition increments `workflowVersion`; merge uses that revision before device timestamps, so valid corrections survive clock skew while stale copies cannot downgrade newer records.
- Legacy reports may identify the original attendant by login username or employee display name. Authorization must resolve both identities, while new tokens carry both explicitly.
- A complete-array sync must evaluate pump reports independently: an unrelated unauthorized/stale candidate is rejected and reported by ID without rolling back valid transitions in the same request.
- Shift Report access is required for attendants, managers, and accountants; access-control settings must not hide this module from any role in the mandatory approval chain.

**Why:** A code-review round found UI-only guards were bypassable via context calls, letting approved reports re-enter the workflow and become editable. Cross-device failures showed that wall-clock ordering can discard a valid correction, one unrelated array item can reject a manager forward, and confusing display names with usernames can reject a legitimate attendant submission. Disabled accountant access also made correctly forwarded reports unreachable.

**How to apply:** Any new report transition or status must add a source-status guard in AppContext, increment `workflowVersion`, add an entry in PUMP_REPORT_STATUS_RANK, and update shift.tsx STATUS_META, sales.tsx maps, and stock/revenue predicates. Treat approved-date correction, return, and deletion as dedicated admin-only operations with timestamps/audit entries. The API merge layer must reject non-admin approval downgrades; approved deletion must use the atomic server endpoint rather than a client-side array removal so stale full-array sync cannot revive the report.
