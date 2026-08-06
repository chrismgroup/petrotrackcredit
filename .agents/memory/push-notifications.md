---
name: Push notifications
description: Operational constraints and delivery modes for Petrotrack notifications
---

Petrotrack notifications have two delivery paths: a server-backed recipient inbox with foreground polling, and Expo push delivery for background or closed-app alerts.

**Why:** Web previews and Expo Go cannot fully exercise native push registration, while the app must still preserve alerts reliably when a device is offline or the app is closed.

**How to apply:** Treat the database inbox as authoritative. Verify actual background delivery only in an EAS-built iOS/Android app with notification permissions granted; keep web/simulator checks focused on inbox, badges, and foreground sound.