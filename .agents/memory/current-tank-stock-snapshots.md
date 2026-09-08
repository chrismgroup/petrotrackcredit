---
name: Current tank stock snapshots
description: Rule for using approved tank dips in current physical stock and stock-value calculations
---

An approved tank dip is the current physical stock snapshot for that tank. Historical tank opening, received, and sold counters must not be added again after applying the dip.

**Why:** Those counters represent cumulative movement history, so adding them to an already-current dip can materially inflate stock values and every financial calculation that depends on them.

**How to apply:** Use the latest approved reading on or before the snapshot date; pending or rejected dips must never shadow it. Match the dip to the exact branch and product tank IDs. Carry the approved physical reading forward by the same later delivery/sales movement applied to book stock, preserving the reconciliation variance until the next approved dip. Record and display the source dip date. Fall back to opening + received − sold only when no approved reading exists.