declare const require: (moduleName: string) => any;
declare const __dirname: string;

const { execFile } = require('node:child_process') as any;
const fs = require('node:fs') as any;
const os = require('node:os') as any;
const path = require('node:path') as any;

type FixtureState = {
  branches?: Array<Record<string, unknown>>;
  pumps?: Array<Record<string, unknown>>;
  pumpInitialMeters?: Record<string, unknown>;
};

type RequestRecord = {
  method: string;
  url: string;
  authorization?: string;
};

const branchId = 'branch-dedicated';
const pumpName = 'PMS 1';
const pumpId = 'pump-pms-1';
const adminToken = 'test-admin-token';
const scriptPath = path.join(__dirname, 'provision-native-outbox-fixture.sh');

function validState(): FixtureState {
  return {
    branches: [{ id: branchId, name: 'Native Fixture Branch' }],
    pumps: [{
      id: pumpId,
      name: pumpName,
      branchId,
      active: true,
      prod: 'PMS',
    }],
    pumpInitialMeters: { [pumpId]: 1000 },
  };
}

function requestRecords(raw: string): RequestRecord[] {
  return raw.trim().split('\n').filter(Boolean).map(line => {
    const args = JSON.parse(line) as string[];
    const headers = args.flatMap((arg, index) => arg === '--header' ? [args[index + 1] ?? ''] : []);
    return {
      method: args.includes('--data') ? 'POST' : 'GET',
      url: args.at(-1) ?? '',
      authorization: headers.find(header => header.startsWith('Authorization: '))?.slice('Authorization: '.length),
    };
  });
}

function runPreflight(state: FixtureState): Promise<{ status: number; stdout: string; stderr: string; requests: RequestRecord[] }> {
  const nodeProcess = require('node:process') as any;
  const mockDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'petrotrack-curl-mock-'));
  const curlLog = path.join(mockDirectory, 'requests.jsonl');
  const curlPath = path.join(mockDirectory, 'curl');
  fs.writeFileSync(curlPath, [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    "fs.appendFileSync(process.env.PETROTRACK_CURL_LOG, JSON.stringify(args) + '\\n');",
    "const url = args.at(-1) || '';",
    "if (url.endsWith('/api/auth/login')) process.stdout.write(JSON.stringify({ token: process.env.PETROTRACK_ADMIN_TOKEN }));",
    "else if (url.endsWith('/api/state')) process.stdout.write(process.env.PETROTRACK_FIXTURE_STATE);",
    'else process.exit(22);',
  ].join('\n'));
  fs.chmodSync(curlPath, 0o755);
  const environment = {
    ...nodeProcess.env,
    PATH: `${mockDirectory}:${nodeProcess.env.PATH ?? ''}`,
    PETROTRACK_CURL_LOG: curlLog,
    PETROTRACK_ADMIN_TOKEN: adminToken,
    PETROTRACK_FIXTURE_STATE: JSON.stringify(state),
    PETROTRACK_TEST_API_URL: 'http://fixture.invalid/api',
    PETROTRACK_ADMIN_USERNAME: 'fixture-admin',
    PETROTRACK_ADMIN_PASSWORD: 'fixture-password',
    PETROTRACK_TEST_BRANCH_ID: branchId,
    PETROTRACK_TEST_PUMP: pumpName,
    PETROTRACK_TEST_RUN_ID: 'preflight-test',
    PETROTRACK_FIXTURE_FILE: path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'petrotrack-native-fixture-')),
      'fixture.env',
    ),
  };

  return new Promise(resolve => {
    execFile(
      'bash',
      [scriptPath, '--preflight'],
      { cwd: path.resolve(__dirname, '..'), env: environment, encoding: 'utf8' },
      (error: any, stdout: string, stderr: string) => {
        const requests = fs.existsSync(curlLog) ? requestRecords(fs.readFileSync(curlLog, 'utf8')) : [];
        fs.rmSync(mockDirectory, { recursive: true, force: true });
        resolve({
          status: typeof error?.code === 'number' ? error.code : 0,
          stdout,
          stderr,
          requests,
        });
      },
    );
  });
}

const invalidFixtureStates: Array<{
  name: string;
  state: FixtureState;
  message: string;
}> = [
  {
    name: 'a missing branch',
    state: { ...validState(), branches: [] },
    message: `dedicated branch "${branchId}" was not found.`,
  },
  {
    name: 'a missing pump',
    state: { ...validState(), pumps: [] },
    message: `pump "${pumpName}" was not found.`,
  },
  {
    name: 'a pump assigned to another branch',
    state: {
      ...validState(),
      pumps: [{ ...validState().pumps![0], branchId: 'another-branch' }],
    },
    message: `pump "${pumpName}" is not assigned to dedicated branch "${branchId}".`,
  },
  {
    name: 'an inactive pump',
    state: {
      ...validState(),
      pumps: [{ ...validState().pumps![0], active: false }],
    },
    message: `pump "${pumpName}" on branch "${branchId}" is not active.`,
  },
  {
    name: 'a pump without a product',
    state: {
      ...validState(),
      pumps: [{ ...validState().pumps![0], prod: '  ' }],
    },
    message: `active pump "${pumpName}" has no product configured.`,
  },
  {
    name: 'a missing opening meter',
    state: { ...validState(), pumpInitialMeters: {} },
    message: `opening meter for active pump "${pumpName}" (${pumpId}) was not found.`,
  },
  {
    name: 'a non-numeric opening meter',
    state: { ...validState(), pumpInitialMeters: { [pumpId]: 'not-a-number' } },
    message: `opening meter for active pump "${pumpName}" (${pumpId}) was not found.`,
  },
  {
    name: 'a negative opening meter',
    state: { ...validState(), pumpInitialMeters: { [pumpId]: -1 } },
    message: `opening meter for active pump "${pumpName}" (${pumpId}) was not found.`,
  },
];

afterEach(() => {
  jest.restoreAllMocks();
});

describe('native outbox fixture preflight', () => {
  it.each(invalidFixtureStates)('rejects $name before account creation', async ({ state, message }) => {
    const result = await runPreflight(state);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Native outbox fixture setup error: ${message}`);
    expect(result.requests.filter(request =>
      request.method === 'POST' && request.url.endsWith('/api/users'),
    )).toHaveLength(0);
    expect(result.requests.find(request =>
      request.method === 'GET' && request.url.endsWith('/api/state'),
    )?.authorization).toBe(`Bearer ${adminToken}`);
  });

  it('accepts a complete fixture without mutating users', async () => {
    const result = await runPreflight(validState());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `Native outbox fixture preflight passed: branch "${branchId}", ` +
      `active pump "${pumpName}", product "PMS", opening meter 1000.`,
    );
    expect(result.requests.filter(request =>
      request.method === 'POST' && request.url.endsWith('/api/users'),
    )).toHaveLength(0);
  });
});
