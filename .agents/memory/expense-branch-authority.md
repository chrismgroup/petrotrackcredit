---
name: Expense branch authority
description: Expense-to-budget branch linkage and executive decision permissions.
---

Every expense must be logged against a fully approved budget and inherit that budget’s canonical branch ID and branch name. A branch-scoped user cannot select another branch’s budget, and an existing expense cannot be moved across branches during editing.

**Why:** Client-supplied branch fields and loosely linked budget IDs could misattribute expenses to the wrong station.

**How to apply:** Validate the budget and branch on every expense create or edit command. If a historical budget’s branch is ambiguous, require finance classification before accepting expenses against it.

Expense approval is sequential: a manager submits to the Accountant, the Accountant reviews and either returns it or forwards it, and only MD can give final approval. Rejected expenses return to the originating manager for correction and resubmission. Final approval permanently locks the record, including against Admin deletion. CEO, MD, Accountant, CSM, and Admin can inspect active stages on Home when they have Expenses route access.

**Why:** Accountant review validates the claim before executive authorization, while MD remains the sole final decision-maker. Oversight roles need stage visibility without receiving decision authority.

**How to apply:** Enforce pending → Accountant forward → MD approve in the API. Label pending as with Accountant, forwarded as with MD, and rejected as with Manager. Keep CEO/CSM/Admin read-only.

Manager expense forms must surface validation and server-command failures inline instead of silently returning. A newly created or submitted budget is not chargeable until it reaches `fully_approved`.

**Why:** On mobile and Expo web, a swallowed command error makes the submit button appear broken and hides the required budget approval step.

**How to apply:** Preserve the fully approved budget guard, show the current blocker before submission, and keep the form open with the server's actionable error after a failed create command.

The expense creation form should refresh server-authoritative finance state before opening, then preselect the first approved budget only after refreshed state has rendered.

**Why:** A manager can retain a stale local budget snapshot after another reviewer approves it, making a valid budget appear unavailable or leaving a charge against a record the server no longer recognizes.

**How to apply:** Keep the refresh as a read-only sync; never weaken the API's fully-approved and same-branch checks to compensate for stale client state.

Manager budget visibility in the expense form must trust the authenticated, branch-scoped state response rather than applying a second local-session branch-ID filter.

**Why:** Local session branch metadata can lag canonical server identity and hide a valid approved budget before expense creation reaches the API.

**How to apply:** Filter client options by approval status; enforce same-branch authority in the state response and expense command endpoint.

Legacy expense reads must enrich branch identity before manager scoping: resolve the canonical name from an existing branch ID, then the linked budget, then the submitting staff identity. Generic whole-array state writes for expenses must be rejected because they can bypass canonical branch assignment and current workflow statuses.

**Why:** Older clients persisted expenses with valid branch IDs but blank branch names and legacy `acc_forwarded` statuses. This produced “Branch not assigned” labels and allowed stale workflow arrays to diverge from command-owned state.

**How to apply:** Normalize both full-state and per-key expense responses before role filtering. Accountant, CEO, MD, and Admin must receive the same pending expense IDs; UI role differences may change available actions, not the underlying queue.