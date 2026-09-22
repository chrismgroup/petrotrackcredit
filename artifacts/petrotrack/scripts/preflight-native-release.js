"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const EXPECTED_SLUG = "petrotrack";
const EXPECTED_PROJECT_ID = "075f5965-7a4a-41dc-8700-f956b13b942f";
const EXPECTED_IOS_BUNDLE_IDENTIFIER = "app.replit.petrotrack";
const EXPECTED_ANDROID_PACKAGE = "petrotrack.replit.app";

// These are the route entry points that make up the native app shell. Checking
// the shell and authenticated route group catches an accidental app-root move before
// EAS starts a remote build.
const REQUIRED_ROUTE_ENTRIES = [
  "app/_layout.tsx",
  "app/index.tsx",
  "app/(app)/_layout.tsx",
  "app/(app)/home.tsx",
];

function fail(message) {
  throw new Error(`Petrotrack native release preflight failed: ${message}`);
}

function resolveExpoConfig(projectRoot = PROJECT_ROOT) {
  const expoCli = path.join(projectRoot, "node_modules", ".bin", "expo");
  if (!fs.existsSync(expoCli)) {
    fail(
      `Expo CLI was not found at ${expoCli}. Install the Petrotrack workspace dependencies first.`,
    );
  }

  let output;
  try {
    output = execFileSync(expoCli, ["config", "--json"], {
      cwd: projectRoot,
      encoding: "utf8",
      env: { ...process.env, CI: "1" },
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    fail(`Expo could not resolve its config from ${projectRoot}: ${detail}`);
  }

  try {
    return JSON.parse(output);
  } catch (error) {
    fail(
      `Expo returned invalid JSON while resolving its config: ${error.message}`,
    );
  }
}

function validateNativeRelease({ projectRoot = PROJECT_ROOT, config }) {
  if (!config || typeof config !== "object") {
    fail("Expo returned an empty configuration.");
  }

  const resolvedRoot = config._internal?.projectRoot;
  if (!resolvedRoot) {
    fail("Expo did not report a resolved project root.");
  }
  if (path.resolve(resolvedRoot) !== path.resolve(projectRoot)) {
    fail(
      `Expo resolved the project root to ${resolvedRoot}, expected ${projectRoot}.`,
    );
  }

  if (config.slug !== EXPECTED_SLUG) {
    fail(
      `expected Expo slug "${EXPECTED_SLUG}", found "${config.slug ?? "missing"}".`,
    );
  }

  const projectId = config.extra?.eas?.projectId;
  if (projectId !== EXPECTED_PROJECT_ID) {
    fail(
      `expected EAS project ID "${EXPECTED_PROJECT_ID}", found "${projectId ?? "missing"}".`,
    );
  }

  const iosBundleIdentifier = config.ios?.bundleIdentifier;
  if (iosBundleIdentifier !== EXPECTED_IOS_BUNDLE_IDENTIFIER) {
    fail(
      `iOS bundle identifier: expected "${EXPECTED_IOS_BUNDLE_IDENTIFIER}", ` +
        `found "${iosBundleIdentifier ?? "missing"}".`,
    );
  }

  const androidPackage = config.android?.package;
  if (androidPackage !== EXPECTED_ANDROID_PACKAGE) {
    fail(
      `Android package: expected "${EXPECTED_ANDROID_PACKAGE}", ` +
        `found "${androidPackage ?? "missing"}".`,
    );
  }

  const missingRoutes = REQUIRED_ROUTE_ENTRIES.filter((relativePath) => {
    const absolutePath = path.join(projectRoot, relativePath);
    try {
      return !fs.statSync(absolutePath).isFile();
    } catch {
      return true;
    }
  });

  if (missingRoutes.length > 0) {
    fail(
      `required route entry point(s) are missing: ${missingRoutes.join(", ")}`,
    );
  }
}

function main() {
  const config = resolveExpoConfig();
  validateNativeRelease({ config });
  console.log(
    `Petrotrack native release preflight passed: slug "${config.slug}", ` +
      `EAS project "${config.extra.eas.projectId}", ` +
      `iOS bundle identifier "${config.ios.bundleIdentifier}", ` +
      `Android package "${config.android.package}", ` +
      `${REQUIRED_ROUTE_ENTRIES.length} route entry points present.`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  EXPECTED_ANDROID_PACKAGE,
  EXPECTED_IOS_BUNDLE_IDENTIFIER,
  EXPECTED_PROJECT_ID,
  EXPECTED_SLUG,
  REQUIRED_ROUTE_ENTRIES,
  resolveExpoConfig,
  validateNativeRelease,
};
