---
name: Operating capital formula
description: Business rule for operating capital and monthly start-up capital rollover
---

Operating capital is calculated as the month’s opening start-up capital plus net profit for that month plus capital injected as a loan. It is not a balance-sheet aggregation of stock, cash, receivables, liabilities, or unrelated loan balances. The supporting operating-capital waterfall can show live resource values separately.

**Why:** This is the agreed accounting definition for the Accounts capital view and makes the figure traceable from one month to the next while recognizing loan-funded capital separately from profit.

**How to apply:** Admins may seed the current month’s start-up capital. Store the resulting closing operating capital and use it as the next month’s opening amount when the month rolls over. Calculate operating capital as start-up capital plus monthly net profit plus the accountant-entered loan injection. Show the loan injection as a positive funding row in the supporting waterfall, but do not include it in revenue, COGS, expenses, CITA, or net profit. Derive Accounts Receivable from credit amounts in validated shift reports rather than allowing a manual debtor balance. Net profit COGS must use deliveries through the reporting month’s end so the last known product cost carries forward when there is no current-month delivery.