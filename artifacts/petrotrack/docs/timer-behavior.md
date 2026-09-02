# Petrotrack timer behavior

## Audit

Petrotrack does not import or call the deprecated native background-timer
module. It was only present as a direct dependency to satisfy an old peer
requirement of the Daily React Native package. The direct dependency is
removed; Daily's native call implementation supplies its own iOS audio and
Android foreground-service behavior.

The app's timers have two categories:

- **Foreground application timers** use `startForegroundTimer` from
  `lib/foreground-timer.ts`. They run on the normal JavaScript timer APIs on
  iOS, Android, and the web preview, stop scheduling while the app is
  backgrounded, and catch up on the next `AppState` `active` event.
  - Business-date rollover checks every 60 seconds and refreshes immediately
    when the app returns to the foreground.
  - Authenticated notification refreshes happen immediately and then every
    5 seconds while the app is active.
  - Authenticated server-version checks run immediately and then every
    3 seconds after each prior check finishes. A foreground transition also
    triggers a check and flushes the report outbox.
- **UI and connection timers** remain ordinary JavaScript timers: the price
  ticker animation advances every 3 seconds, delayed scroll/export cleanup
  callbacks run once, and WebSocket reconnect waits 2 seconds after a close.
  These are not business-critical background jobs and are cancelled with
  their owning screen/effect.

The app does not promise JavaScript polling while the operating system has
suspended it. Server state is authoritative, and foreground revalidation
restores freshness after suspension. Live calls are handled by Daily's native
audio/foreground-service support rather than by an application polling timer.