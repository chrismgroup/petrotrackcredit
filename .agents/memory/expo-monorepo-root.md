---
name: Expo monorepo root
description: The canonical Expo project root and safe command routing for the Petrotrack monorepo.
---

Petrotrack is an Expo Router app rooted at `artifacts/petrotrack`. The workspace root contains shared tooling and a legacy config, but it is not an Expo application root and has no app entry.

**Why:** Running Expo directly from `/home/runner/workspace` resolves plugins against the root package and can report that `expo-router` is missing, then fails because the root has no `App` entry. The package-local install and route tree are healthy.

**How to apply:** Run development and Expo commands through the `@workspace/petrotrack` package, or use the root wrapper scripts that delegate there. Run EAS commands from `artifacts/petrotrack` with its local `eas.json`.