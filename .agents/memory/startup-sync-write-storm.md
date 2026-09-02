---
name: Startup sync write guard
description: Preventing server refreshes from becoming persistence feedback loops
---

Server-to-client hydration must be treated as read-only by slice persistence effects. A refresh replaces local state references, so ordinary effects can mistake the refreshed snapshot for a user edit and PUT it back to the API.

**Why:** Each write advances the shared version timestamp. When version polling sees that timestamp and hydrates again, the cycle can create many concurrent writes and make the app appear stuck while API requests wait on database work.

**How to apply:** Keep a hydration guard around every full state refresh, release it only after the hydration-triggered persistence effects have run, and keep any one-time local recovery writes explicitly separate from normal refresh handling.