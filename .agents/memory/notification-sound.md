---
name: Notification sound
description: How audible alerts are triggered when unread message count increases
---

# Notification Sound

## Package
`expo-audio` — NOT `expo-av`. expo-av is deprecated in SDK 54 (warns in console and will be removed). Use `useAudioPlayer` hook from expo-audio.

## Sound file
`artifacts/petrotrack/assets/sounds/notification.wav` — 880 Hz sine wave, 250ms, 22050 Hz sample rate, 16-bit PCM mono. Generated programmatically with Node.js (no external download needed).

## Hook
`artifacts/petrotrack/hooks/useNotificationSound.ts` — uses `useAudioPlayer(require(...wav))` from expo-audio. Watches `messages` from AppContext, computes total unread count with useMemo, plays on increase (skips first render to avoid sound on app open).

## Mount point
`SoundController` component in `artifacts/petrotrack/app/_layout.tsx`, placed directly inside `<AppProvider>` (needs context) but outside SafeAreaProvider so it's always alive.

**Why:**
Must be inside AppProvider to access useApp/messages. Placed at root layout so it persists across all screens without re-mounting.
