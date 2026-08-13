---
name: Start-up stock baselines
description: Business rules for configured opening inventory used by the Home Stock Snapshot
---

Start-up stock in the Home Snapshot is derived from the previous business day’s approved tank dip. LPG uses kilograms while other products use litres.

**Why:** The operational opening balance must follow the approved tank-dip record and remain live with the app’s business-date data, rather than relying on a separate manually configured value.

**How to apply:** Calculate `yesterday’s approved dip + approved deliveries − sales` independently per product. Compare that book stock with the current business day’s submitted tank dip; negative variance is shortage and positive variance is excess. If yesterday has no approved dip, show the baseline as unavailable rather than treating it as zero.

Dip aggregation must normalize stored readings to finite numbers and use the same branch rule as Tank Dipping: explicitly assigned tanks are scoped, while unassigned tanks remain visible to branch users.

Home Stock Snapshot uses strict branch ownership: branch users see only records with their branch ID, while CEO, MD, Accountant, CSM, and admin receive one snapshot per configured branch.