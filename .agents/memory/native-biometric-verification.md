---
name: Native biometric verification
description: Defines what automated branch checks can and cannot establish for mobile biometric sign-in.
---

Automated iOS and Android native-API simulations can verify success, cancellation, unavailable hardware, missing enrollment, and error fallback logic, but they are not physical-device acceptance. SecureStore entries using `requireAuthentication` should be read as the biometric gate; pairing that read with a separate LocalAuthentication prompt causes double prompts.

**Why:** Face ID and fingerprint prompts depend on enrolled hardware, operating-system policy, and native runtime behavior that the Linux workspace and web preview cannot reproduce.

**How to apply:** Use deterministic tests to prevent fallback regressions, but describe real-device completion separately and require enrolled iOS and Android devices before claiming hardware acceptance. For protected credentials, test the SecureStore access options and ensure cancellation/invalidation leaves the password route usable.