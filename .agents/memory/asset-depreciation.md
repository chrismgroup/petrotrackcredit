---
name: Asset depreciation
description: Accounting rule for company assets and monthly net-profit calculations
---

Company assets use straight-line depreciation: annual depreciation is initial cost minus end-of-life value, divided by useful life in years; monthly depreciation is the annual amount divided by twelve. A register row may represent multiple identical units, with cost and residual value entered per unit and all totals multiplied by the quantity. Monthly net profit deducts applicable asset depreciation from operating profit before calculating CITA.

**Why:** The asset register must connect directly to branch and company profitability rather than remain a standalone inventory list, while avoiding repetitive entry for identical assets.

**How to apply:** Charge depreciation from the acquisition month through the final month of useful life. Company-wide views sum every branch; branch-scoped views include only that branch’s assets. Land may be registered with equal initial and end-of-life values when it should carry no depreciation.

Company asset snapshots are recovery-only: they may contribute a previously unseen ID but must never edit, omit, or resurrect an existing server record. Add/edit/delete operations use explicit server-authoritative actions; edits require the current server revision, and deletes retain durable tombstones.

**Why:** App upgrades and stale devices can emit empty or outdated full-array snapshots. Treating those snapshots as replacements can silently erase registrations, overwrite newer edits, or resurrect deliberately deleted assets.

**How to apply:** Preserve user-entered fields exactly, use server revisions for edit conflicts rather than device clocks, and keep deletion markers available during hydration so stale local caches cannot display or re-upload deleted records.

Asset registration is branch-first. Accountant, MD, CEO, CSM/HR, and Marketing Manager roles can manage assets across branches. Branch managers can create, edit, and explicitly delete assets only in their assigned branch. Once an asset has a non-empty branch owner, edits cannot move it to another branch.

**Why:** Branch managers need to maintain their own physical register without gaining control over another branch, and later app/snapshot updates must not silently reassign persisted records.

**How to apply:** Enforce the same role and branch checks in the UI, client context, and authenticated API routes. A manager must have an assigned branch, and both the existing and submitted asset branch must match it. To move an assigned asset, use the explicit delete action and register a new record for the destination branch.