---
name: Replit Launch versioning
description: Replit Expo Launch may use managed version state separately from checked-in app.json values.
---

A Launch submission can show a low sequential build number even when app.json has a higher ios.buildNumber. Treat the Launch log's submitted build number as authoritative, and configure remote EAS versioning with production auto-increment for future runs.

**Why:** App Store Connect rejects the managed value when it is below the highest uploaded build, and changing only local app.json values did not change the submitted IPA.

**How to apply:** Update both root and artifact EAS configs, refresh the Publishing pane, and start a fresh Launch run. If the submitted number remains stale, the managed Launch counter needs Replit-side reset/support rather than another local app.json edit.