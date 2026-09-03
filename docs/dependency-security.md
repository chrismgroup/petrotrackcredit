# Dependency security decisions

## Expo SDK 54 and `image-size`

As of September 3, 2026, `pnpm audit --prod` reports two high-severity
advisories for `image-size` through Expo's Metro bundler. The advisory metadata
marks every published `image-size` release through 2.0.2 as affected and lists
no patched version.

Petrotrack remains on Expo SDK 54 because moving to SDK 55 or later is a
framework migration that requires separate native regression testing. Metro
uses `image-size` while bundling local image assets; it is not used by the API
server or by Petrotrack to parse user-uploaded or remote images at runtime.
Given that limited build-time exposure, replacing Metro or forcing an
incompatible package is a greater release risk than retaining this dependency.

Revisit this decision when Expo publishes an SDK-compatible Metro release that
removes or replaces `image-size`, or when `image-size` publishes a patched
release. All other production advisories with available fixes are pinned to
patched versions in the workspace overrides.