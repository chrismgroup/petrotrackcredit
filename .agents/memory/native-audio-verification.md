---
name: Native audio verification
description: What bundle and preview checks can and cannot prove for Expo audio
---

Native bundle export and the Expo web preview can prove that the audio asset is included and that startup is resilient, but they cannot prove audible playback on iOS or Android hardware.

**Why:** The Replit workspace may have no connected device, emulator, Android bridge, or Apple simulator tooling, while native audio initialization and speaker output only exist in an installed native app.

**How to apply:** For native audio QA, check for a real device target first. If none is available, run the dual-platform bundle/export checks and startup preview, then report hardware playback and unavailable-audio behavior as unverified rather than claiming native success.