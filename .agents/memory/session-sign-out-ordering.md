---
name: Session sign-out ordering
description: Keep logout cleanup atomic from the user's perspective across all UI entry points.
---

Await session-token removal before exposing the login route, and apply that ordering to every sign-out control.

**Why:** Routing immediately can let a new login save its JWT while the old logout is still clearing storage, deleting the new session. In the Expo web preview, the React Native `Alert` confirmation used by Profile did not render, making that sign-out control unreachable.

**How to apply:** Have each sign-out UI path await the shared logout action and only then navigate. For web-compatible confirmation, use a custom rendered modal; otherwise keep the action direct and consistent with the header menu.