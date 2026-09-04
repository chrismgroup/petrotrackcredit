# Dependency security decisions

## Expo and `image-size`

The Expo SDK 57 / React Native 0.86 dependency upgrade removed the two
high-severity `image-size` advisories from the release dependency graph.
`pnpm audit --prod` and the full `pnpm audit` both report no known
vulnerabilities, and the lockfile contains no `image-size` package.

As of September 4, 2026, npm still lists `image-size` 2.0.2 as the latest
published release and does not list a patched release. The Expo 57-compatible
Metro stack now used by Petrotrack (`@expo/metro-config` 57 and Metro 0.84)
does not depend on `image-size`, so no override or replacement of Metro is
needed.

The registry currently advertises newer Expo 57 patch packages, but those
releases are still inside the workspace's 24-hour minimum release-age window.
Keep the last mature, compatible versions in the lockfile until those updates
can be installed without weakening the supply-chain safeguard.

Expo and React Native were upgraded together and the Daily React Native
package remains on its compatibility patch. Native bundle checks must continue
to verify that Daily's published bundle does not restore the removed legacy
background-timer dependency. All other production advisories with available
fixes remain pinned to patched versions in the workspace overrides.