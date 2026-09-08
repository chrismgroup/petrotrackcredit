---
name: Tank dip review visibility
description: Pending dip approval queues must not depend on hydrated tank metadata
---

MD and Admin pending tank-dip review must be driven by the authoritative pending dip record, not by whether the client has already hydrated its tank and LPG-tank configuration.

**Why:** A valid manager submission can arrive before tank metadata finishes syncing; using metadata as a visibility prerequisite silently hides the approval record.

**How to apply:** Keep metadata and branch matching for manager correction views and reading presentation, but never exclude a pending MD/Admin approval solely because configured tank IDs are temporarily unavailable.