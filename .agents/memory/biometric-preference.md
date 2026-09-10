---
name: Biometric sign-in preference
description: Native biometric sign-in uses protected credentials plus a separate device-level opt-out preference.
---

An explicit biometric sign-in choice must survive later password logins: the protected credential is removed when disabled, while a non-authenticated preference marker prevents automatic re-enrollment until the user enables it again.

**Why:** Automatic credential saving after every password login would otherwise undo a user’s security choice on the next shared-device sign-in.

**How to apply:** Keep biometric controls native-only and require both a fresh server password check and a successful local biometric check before writing protected credentials.