---
name: Current tank stock snapshots
description: Rule for using approved tank dips in current physical stock and stock-value calculations
---

An approved tank dip is the current physical stock snapshot for that tank. Historical tank opening, received, and sold counters must not be added again after applying the dip.

**Why:** Those counters represent cumulative movement history, so adding them to an already-current dip can materially inflate stock values and every financial calculation that depends on them.

**How to apply:** Use the latest approved reading for current tank stock; fall back to opening + received − sold only when no approved reading exists. Keep operational book-stock formulas separate, since those intentionally calculate opening + dated deliveries − dated sales.