const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '../..');
const packageJson = require(path.join(projectRoot, 'package.json'));

function fail(message) {
  throw new Error(`Daily native release check failed: ${message}`);
}

function requireVersion(dependencies, name, expected, expectedDeclaration = expected) {
  const declared = dependencies[name];
  assert.equal(
    declared,
    expectedDeclaration,
    `${name} must remain declared as ${expectedDeclaration}; found ${declared ?? 'no declaration'}`,
  );

  const installed = require(path.join(projectRoot, 'node_modules', name, 'package.json')).version;
  assert.equal(installed, expected, `${name} resolved to ${installed}, expected ${expected}`);
}

function getIntrospectedConfig() {
  const expoCli = path.join(projectRoot, 'node_modules', '.bin', 'expo');
  const output = execFileSync(expoCli, ['config', '--type', 'introspect', '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(output);
}

function checkIos(config) {
  const infoPlist = config._internal?.modResults?.ios?.infoPlist;
  if (!infoPlist) fail('Expo introspection did not produce an iOS Info.plist');

  for (const key of ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription']) {
    assert.equal(typeof infoPlist[key], 'string', `${key} must resolve to a string`);
    assert.ok(infoPlist[key].trim(), `${key} must not be empty`);
  }
  assert.ok(
    Array.isArray(infoPlist.UIBackgroundModes) && infoPlist.UIBackgroundModes.includes('voip'),
    'resolved UIBackgroundModes must include voip',
  );
}

function checkAndroid(config) {
  const androidManifest = config._internal?.modResults?.android?.manifest?.manifest;
  if (!androidManifest) fail('Expo introspection did not produce an Android manifest');

  const permissions = new Set(
    (androidManifest['uses-permission'] || []).map((entry) => entry?.$?.['android:name']),
  );
  for (const permission of [
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_CAMERA',
    'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  ]) {
    assert.ok(permissions.has(permission), `generated Android manifest is missing ${permission}`);
  }

  const services = androidManifest.application?.[0]?.service || [];
  const dailyService = services.find(
    (service) =>
      service?.$?.['android:name'] ===
      'com.daily.reactlibrary.DailyOngoingMeetingForegroundService',
  );
  assert.ok(dailyService, 'generated Android manifest is missing the Daily ongoing-call service');

  const serviceTypes = new Set(
    (dailyService.$['android:foregroundServiceType'] || '').split('|').filter(Boolean),
  );
  assert.ok(serviceTypes.has('camera'), 'Daily foreground service is missing the camera type');
  assert.ok(serviceTypes.has('microphone'), 'Daily foreground service is missing the microphone type');
}

function checkCompatibilityPins() {
  const dependencies = packageJson.dependencies || {};
  const devDependencies = packageJson.devDependencies || {};

  requireVersion(devDependencies, 'expo', '57.0.19', '~57.0.19');
  requireVersion(devDependencies, 'react-native', '0.86.3');
  requireVersion(devDependencies, '@daily-co/config-plugin-rn-daily-js', '0.0.12');
  requireVersion(dependencies, '@daily-co/react-native-daily-js', '0.86.0');
  requireVersion(dependencies, '@daily-co/react-native-webrtc', '124.0.6-daily.1');

  const lockfile = fs.readFileSync(path.join(workspaceRoot, 'pnpm-lock.yaml'), 'utf8');
  const patchRelativePath = 'patches/@daily-co__react-native-daily-js@0.86.0.patch';
  assert.ok(
    lockfile.includes(`path: ${patchRelativePath}`),
    'pnpm lockfile must register the Daily 0.86.0 compatibility patch',
  );

  const patch = fs.readFileSync(path.join(workspaceRoot, patchRelativePath), 'utf8');
  assert.ok(
    patch.includes('-var react_native_background_timer_1'),
    'Daily patch must remove the legacy background-timer import',
  );
  assert.ok(
    patch.includes('Keep the platform') && patch.includes('standard timer implementation'),
    'Daily patch must preserve the standard timer implementation',
  );

  const installedBundle = fs.readFileSync(
    path.join(
      projectRoot,
      'node_modules',
      '@daily-co',
      'react-native-daily-js',
      'dist',
      'index.js',
    ),
    'utf8',
  );
  assert.ok(
    !installedBundle.includes('react-native-background-timer'),
    'installed Daily bundle still imports react-native-background-timer; reinstall the patched lockfile',
  );
}

try {
  checkCompatibilityPins();
  const config = getIntrospectedConfig();
  checkIos(config);
  checkAndroid(config);
  console.log('Daily native release configuration is compatible and complete.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}