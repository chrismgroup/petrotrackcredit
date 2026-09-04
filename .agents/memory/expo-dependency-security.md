---
name: Expo dependency security baseline
description: Dependency and release-age constraints that keep the Expo Metro graph audit-clean
---

Expo SDK 57 with React Native 0.86 uses a Metro graph that does not include
`image-size`, so the previous Metro advisories are resolved without a custom
Metro override. Keep the Expo and React Native major/minor lines aligned.

**Why:** Replacing Metro or bypassing package maturity controls creates more
release risk than the old build-time-only exposure. The workspace's 24-hour
minimum release-age policy can also make same-day Expo patch releases
uninstallable even when Expo's compatibility check recommends them.

**How to apply:** Require both `pnpm audit --prod --audit-level=high` and a
lockfile check for `image-size` before release. Wait for newly published Expo
patch packages to mature before applying them, and re-run web, iOS, and Android
exports plus Daily bundle checks after any Expo or React Native upgrade.