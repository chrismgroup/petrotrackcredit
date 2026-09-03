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

Published Daily releases must be checked from the npm tarball's bundled
`dist/index.js`, not only from a GitHub branch or source snapshot. The
available 0.87.1 package still imports and declares the legacy timer, so it
does not qualify for patch removal.

**Why:** A source snapshot can differ from the published bundle; removing the
patch based on the former caused both iOS and Android Metro exports to fail
when the published runtime still required the missing module.

**How to apply:** Before removing the patch, inspect the exact published
version's runtime bundle and run both platform exports with the unpatched
package.

The Daily Expo plugin also needs an explicit iOS `voip` background mode in the
app config; its Android side generates the ongoing meeting foreground service
and microphone/camera service permissions.

**Why:** The plugin does not add iOS background modes itself, so a native call
can lose its expected background lifecycle even when the JavaScript patch and
Android manifest are correct.

**How to apply:** Treat the iOS background mode and the generated Android
service registration as native-build prerequisites, and re-check both after
changing the Daily plugin or Expo configuration.