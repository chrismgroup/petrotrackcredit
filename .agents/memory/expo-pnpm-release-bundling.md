---
name: Expo release bundling in pnpm workspaces
description: Native Expo releases need explicit app-level tooling and build-script approvals compatible with the EAS pnpm version
---

React Native 0.86's native Xcode bundle script invokes `react-native/cli.js config`, so managed Expo SDK 57 apps in isolated pnpm workspaces must explicitly expose `@react-native-community/cli`. Metro also resolves `babel-preset-expo` from the app project root, so it must be an explicit app dev dependency rather than relying on Expo's nested dependency.

**Why:** Without these direct dependencies, the native bundle phase can fail with an opaque Metro `transformFile` error or a missing `babel-preset-expo` error even though Expo Go and web exports appear healthy.

EAS build images can also use a newer pnpm major than the workspace default. pnpm 11 removed `onlyBuiltDependencies`; use the pnpm 10.26+/11-compatible `allowBuilds` map so required native tooling such as esbuild can run its install script.

**How to apply:** When upgrading a pnpm workspace app to Expo 57 / React Native 0.86, verify the Xcode-equivalent `react-native-xcode.sh` release bundle locally, not only `expo start` or web export. Also run a frozen install with the exact pnpm version reported by the current EAS build image.