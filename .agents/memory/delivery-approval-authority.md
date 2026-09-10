---
name: Delivery approval authority
description: Authority and visibility rules after an Accountant forwards a delivery report.
---

After the Accountant enters cost price and forwards a delivery, its next state is awaiting MD approval. Only MD or Admin may approve or return it. CEO may inspect delivery records but must not receive the approval card or see decision controls.

**Why:** Grouping CEO with MD in Home, the receiving screen, and API authorization caused Accountant-forwarded reports to appear routed to CEO while MD was the intended decision-maker.

**How to apply:** Keep the notification target, Home approval filtering, receiving-screen controls, and server transition roles aligned. Test that CEO is rejected for both approval and return while MD can decide the same pending record.