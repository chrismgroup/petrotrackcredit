---
name: LPG unit convention
description: LPG is tracked in kg, not litres; how to keep labels and audit copy consistent across the app.
---

**Rule:** In Petrotrack, LPG tank capacity, dip readings, deliveries, and stock levels are always tracked in **kg**. All other fuel products (PMS, AGO, DPK) are tracked in **litres (L)**.

**Why:** The business treats LPG as a gas sold by weight, while liquid fuels are sold by volume. Showing LPG in litres caused the stock numbers to look wrong.

**How to apply:**
- Use the helpers that already exist in the codebase instead of hardcoding `L`:
  - `AppContext` → `unitForProd(prod)` returns `kg` for LPG and `L` for everything else.
  - `AppContext` → `lpgPriceKey(category)` returns `LPG_Single` or `LPG_Distributor`.
  - `AppContext` → `getPriceForPump(pump, prices)` returns the correct selling price for the pump's product and LPG category.
- When rendering tank stock, delivery quantities, price labels, or mismatch alerts, always include the correct unit for the product.
- Audit log messages and chat alerts that mention quantities should also respect the convention (many older messages still hardcode `L`; update them when touching related flows).

**LPG pump categories**

**Rule:** Every LPG pump must be tagged as either `single` (single buyers) or `distributor`. Each category has its own selling price (`LPG_Single` / `LPG_Distributor`).

**Why:** The business sells LPG at two different price points depending on the customer type, so a single LPG price was insufficient.

**How to apply:**
- In `system-settings.tsx`, the LPG category picker is required when creating or editing an LPG pump.
- In `prices.tsx`, set both `LPG (Single Buyers)` and `LPG (Distributors)` prices independently.
- When a pump report is submitted or approved, `getPriceForPump` determines the unit price based on the pump's category. If a category-specific price is unset, the system falls back to the base `LPG` price.
- When MD approves an LPG delivery, the base `LPG` price is updated, and both category prices are seeded if they were previously zero.
- Sales entries and sales reports now record `lpgCategory` so revenue can be split by category.
