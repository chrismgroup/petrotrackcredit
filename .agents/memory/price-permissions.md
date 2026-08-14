---
name: Price permissions
description: Direct selling-price updates are allowed for admin, CEO, MD, and station managers, with manager changes scoped to their branch.
---

Direct selling-price changes are intentionally available to `admin`, `ceo`, `md`, and `mgr` (station manager). Manager changes are stored as branch overrides and never replace another branch's price. Other roles can submit proposals, but only CEO/admin can approve proposals.

**Why:** Station managers need to reflect local station market conditions immediately, while proposal approval and broader system settings remain controlled. A flat shared price caused one branch's local market change to leak into every branch.

**How to apply:** Keep the direct-price role allowlist aligned across the Prices screen, AppContext update action, and API state-write authorization. Use branch-aware price lookup for pumps, reports, receiving, accounts, and ticker displays. Price changes should continue recording branch-aware history and audit entries.