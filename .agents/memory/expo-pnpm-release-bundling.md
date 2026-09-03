---
name: Expo release bundling in pnpm workspaces
description: Native Expo release bundles need explicit React Native CLI and Babel preset resolution in isolated pnpm workspaces
---

React Native 0.86's native Xcode bundle script invokes `react-native/cli.js config`, so managed Expo SDK 57 apps in isolated pnpm workspaces must explicitly expose `@react-native-community/cli`. Metro also resolves `babel-preset-expo` from the app project root, so it must be an explicit app dev dependency rather than relying on Expo's nested dependency.

**Why:** Without these direct dependencies, the native bundle phase can fail with an opaque Metro `transformFile` error or a missing `babel-preset-expo` error even though Expo Go and web exports appear healthy.

**How to apply:** When upgrading a pnpm workspace app to Expo 57 / React Native 0.86, verify the Xcode-equivalent `react-native-xcode.sh` release bundle locally, not only `expo start` or web export.