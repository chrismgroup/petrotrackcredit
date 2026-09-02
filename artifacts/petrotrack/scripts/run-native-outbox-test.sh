#!/usr/bin/env bash
set -Eeuo pipefail

# Android runner for the native outbox smoke test. Maestro supplies the
# cross-platform UI actions; adb supplies the Android-only network and
# process lifecycle controls that Maestro deliberately does not own.

APP_ID="${PETROTRACK_ANDROID_APP_ID:-petrotrack.replit.app}"
MAESTRO_BIN="${MAESTRO_BIN:-maestro}"
FLOW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../e2e" && pwd)"

required_vars=(PETROTRACK_TEST_USERNAME PETROTRACK_TEST_PASSWORD PETROTRACK_TEST_DATE PETROTRACK_TEST_CLOSING_METER PETROTRACK_TEST_PUMP PETROTRACK_TEST_NOTE)
for variable in "${required_vars[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Missing required environment variable: ${variable}" >&2
    exit 2
  fi
done

if ! command -v adb >/dev/null 2>&1; then
  echo "adb is required. Connect an Android device with USB debugging enabled." >&2
  exit 2
fi
if ! command -v "${MAESTRO_BIN}" >/dev/null 2>&1; then
  echo "Maestro is required. Install it from https://maestro.mobile.dev/." >&2
  exit 2
fi

if [[ "$(adb get-state 2>/dev/null || true)" != "device" ]]; then
  echo "No Android device is ready. Check 'adb devices' and try again." >&2
  exit 2
fi

network_was_changed=0
original_airplane_mode=""
restore_network() {
  if (( network_was_changed )); then
    local state="${original_airplane_mode:-0}"
    adb shell settings put global airplane_mode_on "${state}" >/dev/null 2>&1 || true
    adb shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state "$([[ "$state" == "1" ]] && echo true || echo false)" >/dev/null 2>&1 || true
  fi
}
trap restore_network EXIT

run_maestro() {
  "${MAESTRO_BIN}" test "$1" \
    --env PETROTRACK_TEST_USERNAME="${PETROTRACK_TEST_USERNAME}" \
    --env PETROTRACK_TEST_PASSWORD="${PETROTRACK_TEST_PASSWORD}" \
    --env PETROTRACK_TEST_DATE="${PETROTRACK_TEST_DATE}" \
    --env PETROTRACK_TEST_CLOSING_METER="${PETROTRACK_TEST_CLOSING_METER}" \
    --env PETROTRACK_TEST_PUMP="${PETROTRACK_TEST_PUMP}" \
    --env PETROTRACK_TEST_NOTE="${PETROTRACK_TEST_NOTE}"
}

echo "1/6 Sign in and open the shift report screen while connected."
run_maestro "${FLOW_DIR}/shift-report-outbox.yaml"

echo "2/6 Disable network before submitting the report."
original_airplane_mode="$(adb shell settings get global airplane_mode_on | tr -d '\r' | tr -d ' ')"
adb shell settings put global airplane_mode_on 1
adb shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true >/dev/null
network_was_changed=1

echo "3/6 Submit the report and assert it is queued on the device."
run_maestro "${FLOW_DIR}/shift-report-outbox-submit-offline.yaml"

echo "4/6 Force-stop the app."
adb shell am force-stop "${APP_ID}"

echo "5/6 Reopen the process while offline and assert the same report is queued."
run_maestro "${FLOW_DIR}/shift-report-outbox-after-restart.yaml"

echo "6/6 Restore connectivity and assert the report is confirmed."
restore_network
network_was_changed=0
adb shell monkey -p "${APP_ID}" 1 >/dev/null

run_maestro "${FLOW_DIR}/shift-report-outbox-after-reconnect.yaml"
echo "Native queued-report force-close check passed."
