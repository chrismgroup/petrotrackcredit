---
name: LPG unit convention
description: LPG is tracked in kg, not litres; how to keep labels and audit copy consistent across the app.
---

**Rule:** In Gastsmarts, LPG tank capacity, dip readings, deliveries, and stock levels are always tracked in **kg**. All other fuel products (PMS, AGO, DPK) are tracked in **litres (L)**.

**Why:** The business treats LPG as a gas sold by weight, while liquid fuels are sold by volume. Showing LPG in litres caused the stock numbers to look wrong.

**How to apply:**
- Use the helpers that already exist in the codebase instead of hardcoding `L`:
  - `receiving.tsx` → `unitForProd(prod)` returns `kg` for LPG and `L` for everything else.
  - Inside `AppContext` and UI components, reference `PROD_UNIT[prod]` or add a similar helper.
- When rendering tank stock, delivery quantities, price labels, or mismatch alerts, always include the correct unit for the product.
- Audit log messages and chat alerts that mention quantities should also respect the convention (many older messages still hardcode `L`; update them when touching related flows).
