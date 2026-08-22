---
name: Operating capital formula
description: Business rule for operating capital and monthly start-up capital rollover
---

Operating capital is calculated as the month’s opening start-up capital plus net profit for that month. It is not a balance-sheet aggregation of stock, cash, receivables, loans, liabilities, or capital injections. The supporting operating-capital waterfall can show live resource values separately, including accountant-entered capital injected as a loan.

**Why:** This is the agreed accounting definition for the Accounts capital view and makes the figure traceable from one month to the next.

**How to apply:** Admins may seed the current month’s start-up capital. Store the resulting closing operating capital and use it as the next month’s opening amount when the month rolls over. Keep the formula display limited to these two inputs. Accountants may maintain capital injected as a loan; include it as a positive funding row in the supporting waterfall and its running total, but not as revenue, profit, or start-up capital. Derive Accounts Receivable from credit amounts in validated shift reports rather than allowing a manual debtor balance. Net profit COGS must use deliveries through the reporting month’s end so the last known product cost carries forward when there is no current-month delivery.