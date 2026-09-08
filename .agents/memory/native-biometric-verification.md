---
name: Native biometric verification
description: Defines what automated branch checks can and cannot establish for mobile biometric sign-in.
---

Automated iOS and Android native-API simulations can verify success, cancellation, unavailable hardware, missing enrollment, and error fallback logic, but they are not physical-device acceptance.

**Why:** Face ID and fingerprint prompts depend on enrolled hardware, operating-system policy, and native runtime behavior that the Linux workspace and web preview cannot reproduce.

**How to apply:** Use deterministic tests to prevent fallback regressions, but describe real-device completion separately and require enrolled iOS and Android devices before claiming hardware acceptance.