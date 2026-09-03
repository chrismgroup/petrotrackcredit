---
name: Authenticated state sync
description: Authentication and app state must finish hydrating before routing or authenticated refreshes proceed.
---

The initial app-state request can run before authentication and receive 401, leaving local empty defaults in place. A successful login must await an authenticated full state sync before exposing the user role to routing, so dashboards display server-owned records immediately.

Route guards must also wait for local authentication hydration before redirecting. During a browser or native reload, the initial null role is not proof that the saved session is invalid; redirecting at that point destroys the requested deep link.

**Why:** The provider mounts before the login screen completes, and saved authentication is restored asynchronously. The normal version poll does not fetch full state unless it detects a version change.

**How to apply:** Save the token first, wait for local bootstrap, then await the authenticated state refresh before exposing the role. On reload, hold route guards until saved authentication has finished hydrating; only then decide whether to redirect.