---
name: Start-up stock baselines
description: Business rules for configured opening inventory used by the Home Stock Snapshot
---

Start-up stock in the Home Snapshot is explicitly set by an admin for each product and branch. LPG uses kilograms while other products use litres.

**Why:** Operations need a controlled, auditable opening quantity for each branch and product; yesterday’s tank dip must not silently replace the admin-approved baseline.

**How to apply:** Treat the admin-set branch/product quantity as a one-time seed. Carry prior approved book stock forward, then apply the current business day’s approved deliveries and approved shift-report sales exactly once per report ID: `carried-forward book stock + today’s deliveries − today’s approved shift-report sales`. Do not add auto-created SalesEntry records again. Compare that book stock with today’s submitted tank dip; negative variance is shortage and positive variance is excess. If the admin has not configured a branch/product seed, show the baseline as unavailable rather than treating it as zero.

Dip aggregation must normalize stored readings to finite numbers and use the same branch rule as Tank Dipping: explicitly assigned tanks are scoped, while unassigned tanks remain visible to branch users.

Home Stock Snapshot uses strict branch ownership: only branches with assigned tanks and pumps render; branch users see their branch, while CEO, MD, Accountant, CSM, and admin see all eligible branches.

Admins control Stock Snapshot display density through persisted global metric toggles and per-branch product toggles; disabled products/metrics are omitted from Home without changing calculations or source records. Startup quantity records must be branch-specific; legacy all-branch records are not used for branch calculations.

Inventory display aggregates physical stock by product within the visible branch scope; PMS, AGO, DPK, and Lube Oil remain independent, while tank-by-tank readings are reserved for Tank Dip views.

Dip history must filter each record’s tank readings to the viewer’s visible branch assets; a dip record can contain readings beyond the current branch scope.

The confirmed stock rule is: branch Fuel Stock sums each product across that branch’s assigned tanks, and Book Stock is the carried-forward ledger balance for that product plus today’s approved deliveries minus today’s approved shift-report sales; never combine PMS and AGO.