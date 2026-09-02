---
name: Daily timer compatibility
description: Why the Daily React Native SDK needs a local timer compatibility patch
---

Daily React Native SDK 0.86 contains a runtime import of the unmaintained
background timer even though its native call implementation already provides
the iOS VoIP and Android foreground-service lifecycle needed for active calls.
Keep the SDK patch that removes the global timer replacement until an upstream
release removes that runtime dependency.

**Why:** Removing only Petrotrack's direct dependency causes native Metro
bundles to fail because Daily's published JavaScript still requires the
module. Replacing global timers with the legacy native implementation also
creates the New Architecture risk the app is trying to eliminate.

**How to apply:** Use standard JavaScript timers for foreground polling and
AppState events to revalidate after suspension. Keep the patch registered in
the workspace and re-check the patched Daily bundle on every dependency
upgrade.