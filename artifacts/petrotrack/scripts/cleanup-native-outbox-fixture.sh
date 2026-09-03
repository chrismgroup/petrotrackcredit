#!/usr/bin/env bash
set -Eeuo pipefail

required_vars=(PETROTRACK_TEST_API_URL PETROTRACK_ADMIN_USERNAME PETROTRACK_ADMIN_PASSWORD PETROTRACK_FIXTURE_USER_ID PETROTRACK_FIXTURE_USERNAME PETROTRACK_FIXTURE_REPORT_MARKER)
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

cleanup_payload="$(
  PETROTRACK_FIXTURE_REPORT_MARKER_VALUE="${PETROTRACK_FIXTURE_REPORT_MARKER}" \
  PETROTRACK_FIXTURE_USERNAME_VALUE="${PETROTRACK_FIXTURE_USERNAME}" \
  node -e 'process.stdout.write(JSON.stringify({
    reportMarker: process.env.PETROTRACK_FIXTURE_REPORT_MARKER_VALUE,
    submittedBy: process.env.PETROTRACK_FIXTURE_USERNAME_VALUE,
  }))'
)"
cleanup_status=0
deleted_reports=0
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

if ! curl --fail-with-body --silent --show-error \
  --request DELETE \
  --header "Authorization: Bearer ${admin_token}" \
  "${API_BASE}/api/users/${PETROTRACK_FIXTURE_USER_ID}" >/dev/null; then
  echo "Warning: disposable account cleanup failed." >&2
  cleanup_status=1
else
  echo "Deleted disposable native outbox account ${PETROTRACK_FIXTURE_USERNAME}."
fi

exit "${cleanup_status}"