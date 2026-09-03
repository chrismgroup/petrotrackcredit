#!/usr/bin/env bash
set -Eeuo pipefail

# Creates a short-lived attendant account for the native outbox check. The
# branch and pump are deliberately supplied by the isolated test environment;
# this script never mutates shared operational state.

required_vars=(PETROTRACK_TEST_API_URL PETROTRACK_ADMIN_USERNAME PETROTRACK_ADMIN_PASSWORD PETROTRACK_TEST_BRANCH_ID PETROTRACK_TEST_PUMP)
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
RUN_ID="${PETROTRACK_TEST_RUN_ID:-${GITHUB_RUN_ID:-local}-$(date +%s)}"
SAFE_RUN_ID="$(printf '%s' "${RUN_ID}" | tr -cd '[:alnum:]-' | cut -c1-40)"
if [[ -z "${SAFE_RUN_ID}" ]]; then
  echo "PETROTRACK_TEST_RUN_ID must contain at least one letter, number, or hyphen." >&2
  exit 2
fi

json_field() {
  local field="$1"
  node -e '
    const fs = require("fs");
    const value = JSON.parse(fs.readFileSync(0, "utf8"))[process.argv[1]];
    if (value === undefined || value === null) process.exit(1);
    process.stdout.write(String(value));
  ' "${field}"
}

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
admin_token="$(printf '%s' "${login_response}" | json_field token)"

test_username="${PETROTRACK_TEST_USERNAME:-native-outbox-${SAFE_RUN_ID}}"
test_password="${PETROTRACK_TEST_PASSWORD:-native-outbox-${SAFE_RUN_ID}-$(date +%s)-${RANDOM}}"
test_date="${PETROTRACK_TEST_DATE:-$(date +%-d)}"
test_closing_meter="${PETROTRACK_TEST_CLOSING_METER:-1001}"
test_note="${PETROTRACK_TEST_NOTE:-native-outbox-${SAFE_RUN_ID}-$(date +%s)}"

create_payload="$(
  PETROTRACK_TEST_EMP_NAME="Native Outbox ${SAFE_RUN_ID}" \
  PETROTRACK_TEST_USERNAME_VALUE="${test_username}" \
  PETROTRACK_TEST_PASSWORD_VALUE="${test_password}" \
  node -e 'process.stdout.write(JSON.stringify({
    empName: process.env.PETROTRACK_TEST_EMP_NAME,
    username: process.env.PETROTRACK_TEST_USERNAME_VALUE,
    password: process.env.PETROTRACK_TEST_PASSWORD_VALUE,
    role: "att",
    branchId: process.env.PETROTRACK_TEST_BRANCH_ID,
    status: "active",
  }))'
)"
user_response="$(
  curl --fail-with-body --silent --show-error \
    --header 'Content-Type: application/json' \
    --header "Authorization: Bearer ${admin_token}" \
    --data "${create_payload}" \
    "${API_BASE}/api/users"
)"
user_id="$(printf '%s' "${user_response}" | json_field id)"

mkdir -p "$(dirname "${FIXTURE_FILE}")"
umask 077
{
  printf 'PETROTRACK_TEST_USERNAME=%q\n' "${test_username}"
  printf 'PETROTRACK_TEST_PASSWORD=%q\n' "${test_password}"
  printf 'PETROTRACK_TEST_DATE=%q\n' "${test_date}"
  printf 'PETROTRACK_TEST_CLOSING_METER=%q\n' "${test_closing_meter}"
  printf 'PETROTRACK_TEST_PUMP=%q\n' "${PETROTRACK_TEST_PUMP}"
  printf 'PETROTRACK_TEST_NOTE=%q\n' "${test_note}"
  printf 'PETROTRACK_FIXTURE_USER_ID=%q\n' "${user_id}"
  printf 'PETROTRACK_FIXTURE_USERNAME=%q\n' "${test_username}"
} >"${FIXTURE_FILE}"

echo "Created disposable native outbox account for run ${SAFE_RUN_ID}."
echo "Fixture environment written to ${FIXTURE_FILE}."