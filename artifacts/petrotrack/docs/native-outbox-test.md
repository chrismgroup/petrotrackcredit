# Native queued-report force-close test

This is the device-level complement to
`context/AppContext.pump-report.test.tsx`. The Jest test verifies the state
machine with mocked storage; this flow verifies that the installed native app
restores the real AsyncStorage entry after its process is terminated.

## Android / Maestro runner

Build and install an internal or preview Android build that points at the
test API, connect one Android device with USB debugging enabled, and install
Maestro. Use a test attendant account and a pump whose opening meter is known.
The date value is the calendar day in the device's current month.

```bash
# From the repository root, if a fresh EAS build is needed:
eas build --profile preview --platform android

cd artifacts/petrotrack
PETROTRACK_TEST_USERNAME='attendant-test-user' \
PETROTRACK_TEST_PASSWORD='use-the-test-account-password' \
PETROTRACK_TEST_DATE='2' \
PETROTRACK_TEST_CLOSING_METER='1001' \
PETROTRACK_TEST_PUMP='PMS 1' \
PETROTRACK_TEST_NOTE='native-outbox-2026-09-02' \
pnpm run test:device:outbox
```

The runner:

1. signs in and opens the shift report screen;
2. disables Android connectivity;
3. submits a report and asserts it is marked `Queued`;
4. force-stops and reopens the app, then asserts the report is still `Queued`;
5. restores connectivity and reopens the app;
6. asserts the report is `Confirmed` and `Queued` is absent.

The report card's pump, business date, volume, and unique note must match
across the two screens. Opening the card and asserting the same unique note
after the force-close makes the identity check resistant to a second report
being silently substituted. The server should contain exactly one report for
the test account and business date; the idempotency key prevents a retry from
creating a second record.

The runner restores the device's previous airplane-mode setting in an exit
trap. If the device is unavailable, the command exits before changing device
state. Do not use a personal account or a production report for this check.

## iOS

The same three Maestro flows can be run against an installed iOS development
or preview build. Use Xcode or the device's Control Center to disable and
restore connectivity around the force-close boundary, then run the
`after-restart` and `after-reconnect` flows with the same Maestro environment
variables. The Android shell runner is intentionally not used for iOS because
`adb` cannot control an iOS device's network or process lifecycle.