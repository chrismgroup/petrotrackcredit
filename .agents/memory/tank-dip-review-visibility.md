---
name: Tank dip review visibility
description: Pending dip approval queues must not depend on hydrated tank metadata
---

MD and Admin pending tank-dip review must be driven by the authoritative pending dip record, not by whether the client has already hydrated its tank and LPG-tank configuration.

**Why:** A valid manager submission can arrive before tank metadata finishes syncing; using metadata as a visibility prerequisite silently hides the approval record.

**How to apply:** Keep metadata and branch matching for manager correction views and reading presentation, but never exclude a pending MD/Admin approval solely because configured tank IDs are temporarily unavailable.

The manager screen must await the canonical dip command before clearing readings or showing success. MD notification creation belongs to that successful server command; the client must not send a separate notification.

**Why:** Legacy whole-array dip writes can be rejected while a fire-and-forget client still reports success and sends MD a notification. That leaves no authoritative pending dip for Home’s Approvals & Actions card.

**How to apply:** Preserve the populated dip form on command failure and show the server error. Only a saved pending dip may trigger the success message and MD notification.