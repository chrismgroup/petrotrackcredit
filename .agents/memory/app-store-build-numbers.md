---
name: App Store build numbers
description: iOS uploads to App Store Connect require a monotonically increasing build number.
---

The iOS build number must be higher than the highest build already uploaded to App Store Connect. This remains true even when a newer source checkout or Expo project configuration appears to use a lower number.

**Why:** App Store Connect rejects duplicate or lower `CFBundleVersion` values with an HTTP 409.

**How to apply:** Before each iOS publish, use a build number above the latest accepted upload; update every active Expo app configuration that can drive the publish.