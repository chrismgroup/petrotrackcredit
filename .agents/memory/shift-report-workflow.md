---
name: Shift-report workflow state machine
description: Status flow and locking rules for pump/shift reports (PumpDailyReport)
---

Statuses: `pending_manager` → `pending_accountant` → `approved`, with two correction states: accountant rejection → `returned` (with manager), manager may send it on to `returned_attendant` (with the original attendant), who resubmits → `pending_manager`.

**Rules:**
- Approved reports are locked for ordinary edits. For a wrong business date, Admin has three explicit, audited recovery paths: correct only the date while preserving approval; return the report to the accountant for a full correction workflow; or delete it for clean re-entry. Delete must remove the generated sale, reverse the approved tank-sale effect, clear any meter lock, and reset the pump seed to the deleted report's opening reading before the attendant re-enters it.
- An Admin return changes `approved` back to `pending_accountant` and reverses approved sales/tank effects while it is reviewed. Accountant rejection sends it to `returned`; the station manager may reject it onward to `returned_attendant`; the original attendant can correct the applies-on date and re-submit it to the manager.
- Every transition callback in the shared state layer must guard its allowed source status (not just the UI): forward⇐pending_manager, acc reject⇐pending_accountant, mgr resubmit⇐returned, return-to-attendant⇐returned, attendant resubmit⇐returned_attendant + original submitter only.
- Both `returned` and `returned_attendant` are excluded from sold stock (stock book) and revenue; only `pending_accountant`/`approved` count as revenue/validated-meter sources.
- Attendant resubmission refreshes `submittedAt` so the sync merge (activity timestamp + status rank) resolves correctly.

**Why:** A code-review round found UI-only guards were bypassable via context calls, letting approved reports re-enter the workflow and become editable. Wrong-date records need a controlled way to be corrected or rebuilt without leaving duplicate sales, tank depletion, or a closing meter that blocks the attendant from a clean replacement.

**How to apply:** Any new report transition or status must add a source-status guard in AppContext, an entry in PUMP_REPORT_STATUS_RANK, and status handling in shift.tsx STATUS_META, sales.tsx maps, and the stock/revenue predicates. Treat approved-date correction, return, and deletion as dedicated admin-only operations with timestamps/audit entries. The API merge layer must reject non-admin approval downgrades; approved deletion must use the atomic server endpoint rather than a client-side array removal so stale full-array sync cannot revive the report.
