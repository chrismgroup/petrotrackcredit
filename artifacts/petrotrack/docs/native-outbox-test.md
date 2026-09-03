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
Every Maestro flow and the device logcat are written to
`PETROTRACK_NATIVE_ARTIFACT_DIR` (default: `native-outbox-artifacts`) so a
failed queued or confirmed assertion has diagnostics attached to the job.

## Scheduled Android device validation

The repository includes
`.github/workflows/native-device-validation.yml`. It runs daily and can also
be started with **Run workflow**. The job must be assigned to a disposable
self-hosted runner labelled `android-device` with:

- Android SDK platform tools and one online Android device;
- Maestro installed and available as `maestro`;
- Node/npm, curl, and the EAS CLI install prerequisites.

Configure these repository secrets for the job:

| Secret                                                    | Purpose                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| `EAS_TOKEN`                                               | Permission for the preview build                                |
| `PETROTRACK_BUILD_DOMAIN`                                 | Domain embedded into the preview build                          |
| `PETROTRACK_TEST_API_URL`                                 | Isolated test deployment URL, not production                    |
| `PETROTRACK_ADMIN_USERNAME` / `PETROTRACK_ADMIN_PASSWORD` | Admin used only to create/delete the fixture                    |
| `PETROTRACK_TEST_BRANCH_ID`                               | Dedicated branch containing the test pump and its opening meter |
| `PETROTRACK_TEST_PUMP`                                    | Pump label shown in the shift-report flow                       |

Before installing or building the preview APK, the workflow authenticates
with the admin fixture account and performs a read-only preflight against
`PETROTRACK_TEST_API_URL`. It verifies that the configured branch exists, the
named pump is assigned to that branch and active, the pump has a product, and
the pump has a non-negative opening meter in `pumpInitialMeters`. A missing or
invalid item stops the job with a setup error before EAS is invoked. The same
check is repeated immediately before the disposable account is created.

Each run builds a fresh EAS preview APK, creates a unique active attendant
account on the isolated test deployment, clears the device's app data, and
passes the generated credentials and unique note to the existing runner. The
fixture-owned report and account are deleted in an `always()` cleanup step.
Cleanup matches the exact run marker and fixture submitter, so unrelated
reports are not touched. The flow itself remains responsible for the exit
status: a missing `Queued` or `Confirmed` assertion fails the job, while `adb`
and Maestro logs are uploaded even when it fails.
The dedicated branch and pump are never changed by fixture provisioning.

## iOS

The same three Maestro flows can be run against an installed iOS development
or preview build. Use Xcode or the device's Control Center to disable and
restore connectivity around the force-close boundary, then run the
`after-restart` and `after-reconnect` flows with the same Maestro environment
variables. The Android shell runner is intentionally not used for iOS because
`adb` cannot control an iOS device's network or process lifecycle. The scheduled
lane is Android-only.