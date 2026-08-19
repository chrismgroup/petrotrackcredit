---
name: Shift-report workflow state machine
description: Status flow and locking rules for pump/shift reports (PumpDailyReport)
---

Statuses: `pending_manager` → `pending_accountant` → `approved`, with two correction states: accountant rejection → `returned` (with manager), manager may send it on to `returned_attendant` (with the original attendant), who resubmits → `pending_manager`.

**Rules:**
- Approved reports are permanently locked for every role, including Admin — no edit, delete, or re-entry into the workflow.
- Every transition callback in the shared state layer must guard its allowed source status (not just the UI): forward⇐pending_manager, acc reject⇐pending_accountant, mgr resubmit⇐returned, return-to-attendant⇐returned, attendant resubmit⇐returned_attendant + original submitter only.
- Both `returned` and `returned_attendant` are excluded from sold stock (stock book) and revenue; only `pending_accountant`/`approved` count as revenue/validated-meter sources.
- Attendant resubmission refreshes `submittedAt` so the sync merge (activity timestamp + status rank) resolves correctly.

**Why:** A code-review round found UI-only guards were bypassable via context calls, letting approved reports re-enter the workflow and become editable — defeating the permanent lock the user required.

**How to apply:** Any new report transition or status must add a source-status guard in AppContext, an entry in PUMP_REPORT_STATUS_RANK, and status handling in shift.tsx STATUS_META, sales.tsx maps, and the stock/revenue predicates.
