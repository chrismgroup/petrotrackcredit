---
name: Native module preview isolation
description: Expo web previews must not initialize native-only React Native modules at route module load time.
---

Native-only SDKs such as Daily WebRTC must be loaded behind a runtime `Platform.OS` guard, preferably with a dynamic import inside the native branch. Type-only imports are safe; value imports can crash the Expo web preview even when the route is not open.

**Why:** Metro evaluates route modules while building the Expo Go/web bundle, and native WebRTC initialization can fail with an undefined native module before the app reaches its login screen.

**How to apply:** Keep the web route renderable with a clear device-build fallback, and load the native SDK only after confirming the platform is not web.