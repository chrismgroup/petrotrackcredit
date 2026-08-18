---
name: Report read and export permissions
description: Report visibility is separate from report export permission.
---

All signed-in roles can read every report type in the Reports screen; role-specific restrictions apply to generating or sharing exports, not to on-screen review.

**Why:** Users need a complete operational view without every role receiving permission to create downloadable reports.

**How to apply:** Keep the report selector and My Jobs report cards based on the full readable catalog, and use `canGenerate` only for the export action.