---
name: Report runtime safety
description: Reporting must tolerate incomplete historical synced records during combined rendering and export.
---

Report calculations and PDF generation should normalize missing product labels and cell values instead of assuming every historical record is complete.

**Why:** Full Report combines more sections than focused reports, so one malformed legacy sale or delivery can otherwise crash the whole report route.

**How to apply:** Use safe product matching, ignore invalid product labels when building report product lists, and convert PDF cells to safe strings before HTML escaping.