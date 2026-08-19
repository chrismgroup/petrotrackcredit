---
name: COGS delivery costs
description: COGS uses approved delivery cost prices carried forward to the report end date.
---

COGS must use the latest cost-priced delivery for each product with `md_approved` or `approved` status dated on or before the report period end, not a weighted average and not only deliveries inside the sales period.

**Why:** A delivery establishes the product's cost basis until a newer delivery changes it; weighted averaging would misstate the shelf stock and sales cost when products remain in inventory across periods.

**How to apply:** Preserve branch scope, exclude future and unapproved deliveries, select the newest delivery by business date with approval time/ID as tie-breakers, and use the same rule for P&L and dashboard profit calculations.