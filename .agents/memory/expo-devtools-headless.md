---
name: Expo DevTools headless mode
description: Preview-runtime behavior for the optional React Native standalone DevTools shell.
---

The Petrotrack preview runs Expo CLI with `EXPO_UNSTABLE_HEADLESS=1`. This skips the optional standalone React Native DevTools Electron shell, while Metro and the app’s debugging middleware still start normally.

**Why:** The React Native 0.86 DevTools shell is a desktop binary whose Linux runtime expects libraries that are not consistently exposed by the Replit Nix package index. Its installation failure was non-fatal but polluted healthy Expo startup with an unknown-error warning.

**How to apply:** Keep the flag on the preview/dev command unless the environment gains a supported complete Electron runtime. Do not add broad Linux desktop dependencies or alter native app behavior merely to enable this optional preview shell.