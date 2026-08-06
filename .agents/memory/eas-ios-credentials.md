---
name: EAS iOS credentials
description: New or relinked EAS projects need Apple signing credentials before non-interactive iOS builds can run.
---

An Expo access token authorizes EAS project operations, but it does not create Apple distribution credentials. A newly linked EAS iOS project still requires interactive Apple Developer authentication/2FA or manually supplied signing assets before production builds.

**Why:** Non-interactive builds stop with “Distribution Certificate is not validated” and `credentials:configure-build` cannot prompt when stdin is unavailable.

**How to apply:** Run `eas credentials:configure-build --platform ios --profile production` in an interactive workspace terminal, complete Apple authentication, then rerun the non-interactive production build.