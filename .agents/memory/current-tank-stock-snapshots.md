---
name: Current tank stock snapshots
description: Rule for using approved tank dips in current physical stock and stock-value calculations
---

An approved tank dip is the current physical stock snapshot for that tank. Historical tank opening, received, and sold counters must not be added again after applying the dip.

**Why:** Those counters represent cumulative movement history, so adding them to an already-current dip can materially inflate stock values and every financial calculation that depends on them.

**How to apply:** For a daily reconciliation, use only the approved reading whose business date exactly matches the selected day; pending, rejected, or older dips must never be used. Match the dip to the exact branch and product tank IDs. If today has no approved dip, show that today is awaiting a dip rather than carrying forward an older physical reading.