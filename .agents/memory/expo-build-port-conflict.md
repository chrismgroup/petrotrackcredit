---
name: Expo build port conflict
description: The standalone Petrotrack build script can conflict with the mockup sandbox's Metro port.
---

Use the configured `artifacts/petrotrack: expo` workflow for normal Expo verification when the mockup sandbox is running; the standalone static build may attempt to claim the same Metro port and fail before compiling the app.

**Why:** The static build script starts its own Metro process, while the managed workspace already has Metro on port 8081 for the mockup sandbox.

**How to apply:** Prefer workflow restart, typecheck, logs, and preview checks. Only run the standalone build after isolating or stopping the conflicting Metro service.