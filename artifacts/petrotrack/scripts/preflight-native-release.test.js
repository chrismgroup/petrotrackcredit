"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  EXPECTED_PROJECT_ID,
  EXPECTED_SLUG,
  REQUIRED_ROUTE_ENTRIES,
  validateNativeRelease,
} = require("./preflight-native-release");

const projectRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(__dirname, "preflight-native-release.js");

function validConfig(root = projectRoot) {
  return {
    slug: EXPECTED_SLUG,
    extra: { eas: { projectId: EXPECTED_PROJECT_ID } },
    _internal: { projectRoot: root },
  };
}

test("resolves the canonical Expo project and required routes", () => {
  const output = execFileSync(process.execPath, [scriptPath], {
    cwd: projectRoot,
    encoding: "utf8",
  });

  assert.match(output, /Petrotrack native release preflight passed/);
});

test("rejects an unexpected Expo project identity", () => {
  assert.throws(
    () =>
      validateNativeRelease({
        projectRoot,
        config: { ...validConfig(), slug: "another-app" },
      }),
    /expected Expo slug "petrotrack"/,
  );
});

test("rejects missing native route entry points", () => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "petrotrack-preflight-"),
  );
  try {
    for (const relativePath of REQUIRED_ROUTE_ENTRIES.slice(0, -1)) {
      const filePath = path.join(fixtureRoot, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "");
    }

    assert.throws(
      () =>
        validateNativeRelease({
          projectRoot: fixtureRoot,
          config: validConfig(fixtureRoot),
        }),
      /required route entry point\(s\) are missing: app\/\(tabs\)\/index\.tsx/,
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
