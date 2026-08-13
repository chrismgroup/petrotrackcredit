---
name: Start-up stock baselines
description: Business rules for configured opening inventory used by the Home Stock Snapshot
---

Start-up stock in the Home Snapshot is derived from the previous business day’s approved tank dip. LPG uses kilograms while other products use litres.

**Why:** The operational opening balance must follow the approved tank-dip record and remain live with the app’s business-date data, rather than relying on a separate manually configured value.

**How to apply:** Calculate `yesterday’s approved dip + current-day approved deliveries − yesterday’s non-returned shift-report sales` independently per product. Submitted and approved shift reports count; returned reports do not. Preserve unrelated manual sales without double-counting auto-created shift-report sales. Compare that book stock with the current business day’s submitted tank dip; negative variance is shortage and positive variance is excess. If yesterday has no approved dip, show the baseline as unavailable rather than treating it as zero.

Dip aggregation must normalize stored readings to finite numbers and use the same branch rule as Tank Dipping: explicitly assigned tanks are scoped, while unassigned tanks remain visible to branch users.

Home Stock Snapshot uses strict branch ownership: only branches with assigned tanks and pumps render; branch users see their branch, while CEO, MD, Accountant, CSM, and admin see all eligible branches.

Admins control Stock Snapshot display density through persisted global metric toggles and per-branch product toggles; disabled products/metrics are omitted from Home without changing calculations or source records.

Inventory display aggregates physical stock by product within the visible branch scope; PMS, AGO, DPK, and Lube Oil remain independent, while tank-by-tank readings are reserved for Tank Dip views.

Dip history must filter each record’s tank readings to the viewer’s visible branch assets; a dip record can contain readings beyond the current branch scope.

The confirmed stock rule is: branch Fuel Stock sums each product across that branch’s assigned tanks, and Book Stock is that product’s Fuel Stock less its quantity sold; never combine PMS and AGO.