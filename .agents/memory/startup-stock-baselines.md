---
name: Start-up stock baselines
description: Business rules for configured opening inventory used by the Home Stock Snapshot
---

Start-up stock in the Home Snapshot is explicitly set by an admin for each product and branch and is used only on the seed business day. LPG uses kilograms while other products use litres. Baselines may carry an explicit business `seedDate`; when present, it overrides the administrative save timestamp.

**Why:** The admin seed establishes the initial opening quantity, then each subsequent day must start from the prior day’s physical tank dip so the snapshot reflects daily operational reality.

**How to apply:** On the seed date use the admin quantity. On later dates use the latest earlier approved tank dip as the opening fallback, then calculate `opening dip + today’s deliveries − today’s shift-report sales`. Delivered and sold metrics are date-specific and show zero when there is no matching record. Do not add auto-created SalesEntry records again. Compare the result with today’s approved tank dip; negative variance is shortage and positive variance is excess. If the seed or required opening dip is unavailable, show the opening quantity as unavailable rather than treating it as zero. For persisted stock logs, never let a pre-seed log override the explicit seed; if the seed-day log is stale or invalid, rebuild the chain from the seed.

Dip aggregation must normalize stored readings to finite numbers and use the same branch rule as Tank Dipping: explicitly assigned tanks are scoped, while unassigned tanks remain visible to branch users.

Home Stock Snapshot uses strict branch ownership: only branches with assigned tanks and pumps render; branch users see their branch, while CEO, MD, Accountant, CSM, and admin see all eligible branches.

Admins control Stock Snapshot display density through persisted global metric toggles and per-branch product toggles; disabled products/metrics are omitted from Home without changing calculations or source records. Startup quantity records must be branch-specific; legacy all-branch records are not used for branch calculations.

Inventory display aggregates physical stock by product within the visible branch scope; PMS, AGO, DPK, and Lube Oil remain independent, while tank-by-tank readings are reserved for Tank Dip views.

Dip history must filter each record’s tank readings to the viewer’s visible branch assets; a dip record can contain readings beyond the current branch scope.

The confirmed stock rule is: branch Fuel Stock sums each product across that branch’s assigned tanks, and each daily Book Stock is the prior day’s dip opening plus that day’s deliveries minus that day’s shift-report sales; never combine PMS and AGO.