#!/usr/bin/env bash
set -Eeuo pipefail

required_vars=(PETROTRACK_TEST_API_URL PETROTRACK_ADMIN_USERNAME PETROTRACK_ADMIN_PASSWORD PETROTRACK_FIXTURE_USER_ID)
for variable in "${required_vars[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Missing required environment variable: ${variable}" >&2
    exit 2
  fi
done

API_BASE="${PETROTRACK_TEST_API_URL%/}"
API_BASE="${API_BASE%/api}"

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

curl --fail-with-body --silent --show-error \
  --request DELETE \
  --header "Authorization: Bearer ${admin_token}" \
  "${API_BASE}/api/users/${PETROTRACK_FIXTURE_USER_ID}" >/dev/null

echo "Deleted disposable native outbox account ${PETROTRACK_FIXTURE_USERNAME:-${PETROTRACK_FIXTURE_USER_ID}}."