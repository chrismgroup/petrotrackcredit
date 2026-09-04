---
name: Post-merge setup reliability
description: Non-interactive pnpm behavior and timeout requirements for automatic task-merge setup
---

Automatic post-merge setup runs with stdin closed. pnpm must run with `CI=true` so it can remove and recreate the modules directory without waiting for confirmation. The timeout must include both dependency installation and the database schema check; a 20-second default can expire after a clean install even when the script is healthy.

**Why:** A merged task failed before database setup because pnpm aborted its no-TTY modules cleanup. After enabling CI mode, the same setup still exceeded the short default timeout while reinstalling dependencies.

**How to apply:** Keep post-merge scripts idempotent and non-interactive, export `CI=true` before pnpm commands, and use a timeout with practical buffer for install plus migrations/schema checks.