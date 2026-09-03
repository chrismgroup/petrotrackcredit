---
name: Expo Go 57 validation
description: Device acceptance status for the SDK 57 Petrotrack upgrade
---

Expo Go 57 acceptance has been confirmed on a device: Petrotrack opened, the sign-in screen rendered, and the main navigation worked.

**Why:** Static exports and the Replit preview cannot prove that stock Expo Go can load the upgraded native bundle.

**How to apply:** Treat the SDK 57 entry flow as device-validated; continue to test native-only features separately when making release changes.