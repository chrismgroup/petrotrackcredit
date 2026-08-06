---
name: Price permissions
description: Direct selling-price updates are allowed for admin, CEO, MD, and station managers.
---

Direct selling-price changes are intentionally available to `admin`, `ceo`, `md`, and `mgr` (station manager). Other roles can submit proposals, but only CEO/admin can approve proposals.

**Why:** Station managers need to reflect local station market conditions immediately, while proposal approval and broader system settings remain controlled.

**How to apply:** Keep the direct-price role allowlist aligned across the Prices screen, AppContext update action, and API state-write authorization. Price changes should continue recording price history and audit entries.