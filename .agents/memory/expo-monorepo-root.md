---
name: Expo monorepo root
description: The canonical Expo project root and safe command routing for the Petrotrack monorepo.
---

Petrotrack is an Expo Router app rooted at `artifacts/petrotrack`. The workspace root contains shared tooling and an explicit Expo config guard, but it is not an Expo application root and has no app entry.

**Why:** Removing the root `app.json` alone makes Expo synthesize a generic project from the root `package.json`, which can let direct commands proceed against a project with no Petrotrack route tree. The guard fails clearly; the package-local install and route tree are healthy.

**How to apply:** Run development and Expo commands through the `@workspace/petrotrack` package, or use the root wrapper scripts that delegate there. Run EAS commands from `artifacts/petrotrack` with its local `eas.json`; current EAS CLI reads that file from the working directory and rejects an explicit `--config` flag. Do not bypass the root guard.