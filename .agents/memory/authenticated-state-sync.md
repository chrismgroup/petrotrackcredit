---
name: Authenticated state sync
description: State must be refreshed after login because the provider can mount before a JWT exists.
---

The initial app-state request can run before authentication and receive 401, leaving local empty defaults in place. A successful login must await an authenticated full state sync before exposing the user role to routing, so dashboards display server-owned records immediately.

**Why:** The provider mounts before the login screen completes, and the normal version poll does not fetch full state unless it detects a version change.

**How to apply:** When adding or changing login/session behavior, save the token first, wait for local bootstrap if it is still running, then await the full authenticated state refresh before setting the role or navigating to the dashboard.