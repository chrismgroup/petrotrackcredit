#!/usr/bin/env bash
set -Eeuo pipefail

required_vars=(PETROTRACK_TEST_API_URL PETROTRACK_ADMIN_USERNAME PETROTRACK_ADMIN_PASSWORD)
for variable in "${required_vars[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Missing required environment variable: ${variable}" >&2
    exit 2
  fi
done

API_BASE="${PETROTRACK_TEST_API_URL%/}"
API_BASE="${API_BASE%/api}"
if [[ "${API_BASE}" == *"petrotrack.replit.app" ]]; then
  echo "PETROTRACK_TEST_API_URL must point to the isolated test deployment, not production." >&2
  exit 2
fi

FIXTURE_FILE="${PETROTRACK_FIXTURE_FILE:-${PWD}/native-outbox-fixture.env}"
if [[ -f "${FIXTURE_FILE}" ]]; then
  # Provisioning can be interrupted while this file is being written. Load
  # whatever complete assignments are available, then recover by run id when
  # the account id was not persisted.
  # shellcheck disable=SC1090
  source <(grep -E '^PETROTRACK_(FIXTURE_(RUN_ID|USER_ID|USERNAME|REPORT_MARKER)|TEST_(USERNAME|NOTE))=' "${FIXTURE_FILE}" || true)
fi

fixture_run_id="${PETROTRACK_FIXTURE_RUN_ID:-${PETROTRACK_TEST_RUN_ID:-${GITHUB_RUN_ID:-}}}"
if [[ -n "${fixture_run_id}" ]]; then
  fixture_run_id="$(printf '%s' "${fixture_run_id}" | tr -cd '[:alnum:]-' | cut -c1-40)"
fi

login_payload="$(node -e 'process.stdout.write(JSON.stringify({
  username: process.env.PETROTRACK_ADMIN_USERNAME,
  password: process.env.PETROTRACK_ADMIN_PASSWORD,
}))')"
login_response="$(
  curl --fail-with-body --silent --show-error \
    --header 'Content-Type: application/json' \
    --data "${login_payload}" \
    "${API_BASE}/api/auth/login"
)"
admin_token="$(printf '%s' "${login_response}" | node -e '
  const fs = require("fs");
  const token = JSON.parse(fs.readFileSync(0, "utf8")).token;
  if (!token) process.exit(1);
  process.stdout.write(token);
')"

cleanup_status=0
deleted_reports=0
report_username="${PETROTRACK_FIXTURE_USERNAME:-${PETROTRACK_TEST_USERNAME:-}}"
if [[ -z "${PETROTRACK_FIXTURE_REPORT_MARKER:-}" || -z "${report_username}" ]]; then
  echo "Fixture report metadata is unavailable; no report cleanup was attempted."
else
  cleanup_payload="$(
    PETROTRACK_FIXTURE_REPORT_MARKER_VALUE="${PETROTRACK_FIXTURE_REPORT_MARKER}" \
    PETROTRACK_FIXTURE_USERNAME_VALUE="${report_username}" \
    node -e 'process.stdout.write(JSON.stringify({
      reportMarker: process.env.PETROTRACK_FIXTURE_REPORT_MARKER_VALUE,
      submittedBy: process.env.PETROTRACK_FIXTURE_USERNAME_VALUE,
    }))'
  )"
  if ! deleted_reports="$(
    curl --fail-with-body --silent --show-error \
      --request POST \
      --header 'Content-Type: application/json' \
      --data "${cleanup_payload}" \
      --header "Authorization: Bearer ${admin_token}" \
      "${API_BASE}/api/state/pump-reports/cleanup-fixture" |
      node -e '
        const fs = require("fs");
        const response = JSON.parse(fs.readFileSync(0, "utf8"));
        process.stdout.write(String(response.deleted ?? 0));
      '
  )"; then
    echo "Warning: fixture-owned report cleanup failed." >&2
    cleanup_status=1
  else
    echo "Deleted ${deleted_reports} fixture-owned native outbox report(s)."
  fi
fi

if [[ -n "${PETROTRACK_FIXTURE_USER_ID:-}" && -n "${PETROTRACK_FIXTURE_USERNAME:-}" ]]; then
  if ! curl --fail-with-body --silent --show-error \
    --request DELETE \
    --header "Authorization: Bearer ${admin_token}" \
    "${API_BASE}/api/users/${PETROTRACK_FIXTURE_USER_ID}" >/dev/null; then
    echo "Warning: disposable account cleanup failed." >&2
    cleanup_status=1
  else
    echo "Deleted disposable native outbox account ${PETROTRACK_FIXTURE_USERNAME}."
  fi
elif [[ -z "${fixture_run_id}" ]]; then
  echo "Warning: fixture metadata is incomplete and no run id is available for account recovery." >&2
  cleanup_status=1
else
  recovery_url="${API_BASE}/api/users/native-fixtures/${fixture_run_id}"
  if [[ -n "${PETROTRACK_TEST_BRANCH_ID:-}" ]]; then
    branch_query="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "${PETROTRACK_TEST_BRANCH_ID}")"
    recovery_url="${recovery_url}?branchId=${branch_query}"
  fi
  recovery_response=""
  if ! recovery_response="$(
    curl --fail-with-body --silent --show-error \
      --request DELETE \
      --header "Authorization: Bearer ${admin_token}" \
      "${recovery_url}"
  )"; then
    echo "Warning: native fixture account recovery failed for run ${fixture_run_id}." >&2
    cleanup_status=1
  else
    recovered_accounts="$(printf '%s' "${recovery_response}" | node -e '
      const fs = require("fs");
      const response = JSON.parse(fs.readFileSync(0, "utf8"));
      process.stdout.write(String(response.deleted ?? 0));
    ')" || {
      echo "Warning: native fixture account recovery returned invalid JSON." >&2
      cleanup_status=1
      recovered_accounts=""
    }
    if [[ -n "${recovered_accounts}" ]]; then
      echo "Recovered ${recovered_accounts} interrupted native outbox account(s) for run ${fixture_run_id}."
    fi
  fi
fi

exit "${cleanup_status}"