---
name: Expense branch authority
description: Expense-to-budget branch linkage and executive decision permissions.
---

Every expense must be logged against a fully approved budget and inherit that budget’s canonical branch ID and branch name. A branch-scoped user cannot select another branch’s budget, and an existing expense cannot be moved across branches during editing.

**Why:** Client-supplied branch fields and loosely linked budget IDs could misattribute expenses to the wrong station.

**How to apply:** Validate the budget and branch on every expense create or edit command. If a historical budget’s branch is ambiguous, require finance classification before accepting expenses against it.

Only the Accountant can approve or reject an expense, including legacy records that still use the forwarded status. Rejected expenses return to the originating manager for correction and resubmission. MD and CEO can inspect the workflow on Home and in Expenses, but have no decision controls.

**Why:** Expense decisions belong to the Accountant; executive visibility is needed for oversight but must not imply approval authority.

**How to apply:** Enforce Accountant-only decisions in the API first, keep pending and legacy-forwarded records with the Accountant, label rejected records as with the Manager, and keep MD/CEO views read-only.

Manager expense forms must surface validation and server-command failures inline instead of silently returning. A newly created or submitted budget is not chargeable until it reaches `fully_approved`.

**Why:** On mobile and Expo web, a swallowed command error makes the submit button appear broken and hides the required budget approval step.

**How to apply:** Preserve the fully approved budget guard, show the current blocker before submission, and keep the form open with the server's actionable error after a failed create command.

The expense creation form should refresh server-authoritative finance state before opening, then preselect the first approved budget only after refreshed state has rendered.

**Why:** A manager can retain a stale local budget snapshot after another reviewer approves it, making a valid budget appear unavailable or leaving a charge against a record the server no longer recognizes.

**How to apply:** Keep the refresh as a read-only sync; never weaken the API's fully-approved and same-branch checks to compensate for stale client state.