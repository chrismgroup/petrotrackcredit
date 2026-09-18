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

mode="${1:-provision}"
if [[ "${mode}" != "provision" && "${mode}" != "--preflight" ]]; then
  echo "Usage: $0 [--preflight]" >&2
  exit 2
fi

API_BASE="${PETROTRACK_TEST_API_URL%/}"
API_BASE="${API_BASE%/api}"
if [[ -n "${PETROTRACK_PRODUCTION_API_URL:-}" && "${API_BASE}" == "${PETROTRACK_PRODUCTION_API_URL%/}" ]]; then
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

verify_fixture() {
  local state_response
  if ! state_response="$(
    curl --fail-with-body --silent --show-error \
      --header 'Accept: application/json' \
      --header "Authorization: Bearer ${admin_token}" \
      "${API_BASE}/api/state"
  )"; then
    echo "Native outbox fixture setup error: could not read state from ${API_BASE}." >&2
    exit 1
  fi

  printf '%s' "${state_response}" |
    PETROTRACK_TEST_BRANCH_ID_VALUE="${PETROTRACK_TEST_BRANCH_ID}" \
    PETROTRACK_TEST_PUMP_VALUE="${PETROTRACK_TEST_PUMP}" \
    node -e '
      const fs = require("fs");
      let state;
      try {
        state = JSON.parse(fs.readFileSync(0, "utf8"));
      } catch {
        console.error("Native outbox fixture setup error: API returned invalid JSON.");
        process.exit(1);
      }

      const branchId = process.env.PETROTRACK_TEST_BRANCH_ID_VALUE;
      const pumpName = process.env.PETROTRACK_TEST_PUMP_VALUE;
      const fail = message => {
        console.error(`Native outbox fixture setup error: ${message}`);
        process.exit(1);
      };
      if (!state || typeof state !== "object" || Array.isArray(state)) {
        fail("API state must be an object.");
      }

      const branches = Array.isArray(state.branches) ? state.branches : [];
      const branch = branches.find(candidate => String(candidate?.id ?? "") === branchId);
      if (!branch) {
        fail(`dedicated branch "${branchId}" was not found.`);
      }

      const pumps = Array.isArray(state.pumps) ? state.pumps : [];
      const namedPumps = pumps.filter(candidate => String(candidate?.name ?? "") === pumpName);
      if (namedPumps.length === 0) {
        fail(`pump "${pumpName}" was not found.`);
      }
      const pump = namedPumps.find(candidate => String(candidate?.branchId ?? "") === branchId);
      if (!pump) {
        fail(`pump "${pumpName}" is not assigned to dedicated branch "${branchId}".`);
      }
      if (pump.active !== true) {
        fail(`pump "${pumpName}" on branch "${branchId}" is not active.`);
      }

      const product = String(pump.prod ?? "").trim();
      if (!product) {
        fail(`active pump "${pumpName}" has no product configured.`);
      }

      const initialMeters = state.pumpInitialMeters;
      const rawMeter = initialMeters && typeof initialMeters === "object" && !Array.isArray(initialMeters)
        ? initialMeters[pump.id]
        : undefined;
      const openingMeter = Number(rawMeter);
      if (
        rawMeter === undefined ||
        rawMeter === null ||
        rawMeter === "" ||
        !Number.isFinite(openingMeter) ||
        openingMeter < 0
      ) {
        fail(`opening meter for active pump "${pumpName}" (${pump.id}) was not found.`);
      }

      console.log(
        `Native outbox fixture preflight passed: branch "${branchId}", ` +
        `active pump "${pumpName}", product "${product}", opening meter ${openingMeter}.`,
      );
    '
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

verify_fixture
if [[ "${mode}" == "--preflight" ]]; then
  exit 0
fi

test_username="${PETROTRACK_TEST_USERNAME:-native-outbox-${SAFE_RUN_ID}}"
test_password="${PETROTRACK_TEST_PASSWORD:-native-outbox-${SAFE_RUN_ID}-$(date +%s)-${RANDOM}}"
test_date="${PETROTRACK_TEST_DATE:-$(date +%-d)}"
test_closing_meter="${PETROTRACK_TEST_CLOSING_METER:-1001}"
fixture_report_marker="native-outbox-fixture-${SAFE_RUN_ID}"
test_note="${PETROTRACK_TEST_NOTE:-native-outbox-${SAFE_RUN_ID}-$(date +%s)}"
if [[ "${test_note}" != *"${fixture_report_marker}"* ]]; then
  test_note="${test_note} [${fixture_report_marker}]"
fi

mkdir -p "$(dirname "${FIXTURE_FILE}")"
umask 077
# Persist the recovery key before account creation. If the process stops after
# the API commits the user but before full metadata is ready, cleanup can still
# identify the exact native fixture account.
printf 'PETROTRACK_FIXTURE_RUN_ID=%q\n' "${SAFE_RUN_ID}" >"${FIXTURE_FILE}"

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

metadata_tmp="${FIXTURE_FILE}.tmp.$$"
trap 'rm -f "${metadata_tmp:-}"' EXIT
{
  printf 'PETROTRACK_FIXTURE_RUN_ID=%q\n' "${SAFE_RUN_ID}"
  printf 'PETROTRACK_TEST_USERNAME=%q\n' "${test_username}"
  printf 'PETROTRACK_TEST_PASSWORD=%q\n' "${test_password}"
  printf 'PETROTRACK_TEST_DATE=%q\n' "${test_date}"
  printf 'PETROTRACK_TEST_CLOSING_METER=%q\n' "${test_closing_meter}"
  printf 'PETROTRACK_TEST_PUMP=%q\n' "${PETROTRACK_TEST_PUMP}"
  printf 'PETROTRACK_TEST_NOTE=%q\n' "${test_note}"
  printf 'PETROTRACK_FIXTURE_USER_ID=%q\n' "${user_id}"
  printf 'PETROTRACK_FIXTURE_USERNAME=%q\n' "${test_username}"
  printf 'PETROTRACK_FIXTURE_REPORT_MARKER=%q\n' "${test_note}"
} >"${metadata_tmp}"
mv "${metadata_tmp}" "${FIXTURE_FILE}"

echo "Created disposable native outbox account for run ${SAFE_RUN_ID}."
echo "Fixture environment written to ${FIXTURE_FILE}."