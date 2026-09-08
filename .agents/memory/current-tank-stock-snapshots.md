---
name: Current tank stock snapshots
description: Rule for using approved tank dips in current physical stock and stock-value calculations
---

An approved tank dip is the current physical stock snapshot for that tank. Historical tank opening, received, and sold counters must not be added again after applying the dip.

**Why:** Those counters represent cumulative movement history, so adding them to an already-current dip can materially inflate stock values and every financial calculation that depends on them.

**How to apply:** For a daily reconciliation, use only the approved reading whose business date exactly matches the selected day; pending, rejected, or older dips must never be used. Match the dip to the exact branch and product tank IDs. If today has no approved dip, show that today is awaiting a dip rather than carrying forward an older physical reading.

Approved dip records are locked for every role except Admin. An Admin correction must preserve the approved status and reconcile the linked inventory snapshot and discrepancy alert; an Admin deletion must remove those linked records so stock history does not retain an orphaned dip.

**Why:** Approved readings drive physical stock and discrepancy history, so changing only the workflow record would leave contradictory operational data.

**How to apply:** Enforce the exception in server commands rather than UI visibility alone, require the current workflow revision, and record the Admin correction or deletion in the audit trail.