---
name: Report view navigation
description: Report selection uses a compact launcher page and a separate full report viewer route.
---

Reports should keep the chooser and the full report content on separate screens. The launcher owns date, period, and branch selection, while the viewer receives those selections through route parameters.

**Why:** A long inline report makes the chooser dominate the screen and forces users to scroll before they can read the selected report.

**How to apply:** Keep report launch items compact and vertically stacked, navigate selections to the dedicated viewer, and preserve the active report and filter context when changing routes.