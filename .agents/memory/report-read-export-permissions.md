---
name: Report read and export permissions
description: Report visibility is separate from report export permission.
---

Admin grants the Reports module by role or by individual user through Access Control. Users who receive that module can read every report type in the Reports screen; export restrictions remain role-specific.

**Why:** Report visibility is sensitive and must be explicitly granted by Admin, while permitted users still need a complete operational view without automatically receiving export/share access.

**How to apply:** Gate the Reports route and My Jobs cards with the admin-managed `exprpt` module, keep the report selector based on the full readable catalog, and use `canGenerate` only for export.