---
name: Expo Go access sharing
description: Shared Expo Go projects should use an Expo Organization rather than a personal owner login
---

Do not share the personal Expo credentials of the project owner with testers. Expo projects shared through Expo Go should live in an Organization, with each tester using their own Expo account and a Viewer role.

**Why:** A personal `owner` account can cause Expo Go to stop at an account-access prompt before the Petrotrack login screen loads. Expo documents Viewer as the role allowed to view projects through Expo Go.

**How to apply:** Transfer the Expo project to an Organization, invite testers as Viewers, update the app config owner to the Organization slug after transfer, restart Metro, and distribute a fresh QR code. Keep Expo Go access separate from Petrotrack staff credentials.