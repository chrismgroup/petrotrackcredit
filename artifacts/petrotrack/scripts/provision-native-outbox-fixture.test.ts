declare const require: (moduleName: string) => any;
declare const __dirname: string;

const { createServer } = require('node:http') as any;
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

type MockApi = {
  baseUrl: string;
  requests: RequestRecord[];
  close: () => Promise<void>;
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

async function startMockApi(state: FixtureState): Promise<MockApi> {
  const requests: RequestRecord[] = [];
  const server = createServer((request: any, response: any) => {
    requests.push({
      method: request.method ?? '',
      url: request.url ?? '',
      authorization: request.headers.authorization,
    });

    request.resume();

    if (request.method === 'POST' && request.url === '/api/auth/login') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ token: adminToken }));
      return;
    }

    if (request.method === 'GET' && request.url === '/api/state') {
      if (request.headers.authorization !== `Bearer ${adminToken}`) {
        response.writeHead(401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(state));
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = server.address().port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error: any) => error ? reject(error) : resolve());
    }),
  };
}

function runPreflight(baseUrl: string): Promise<{ status: number; stdout: string; stderr: string }> {
  const nodeProcess = require('node:process') as any;
  const environment = {
    ...nodeProcess.env,
    PETROTRACK_TEST_API_URL: `${baseUrl}/api`,
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
        resolve({
          status: typeof error?.code === 'number' ? error.code : 0,
          stdout,
          stderr,
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
    const api = await startMockApi(state);
    try {
      const result = await runPreflight(api.baseUrl);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`Native outbox fixture setup error: ${message}`);
      expect(api.requests.filter(request =>
        request.method === 'POST' && request.url === '/api/users',
      )).toHaveLength(0);
      expect(api.requests.find(request =>
        request.method === 'GET' && request.url === '/api/state',
      )?.authorization).toBe(`Bearer ${adminToken}`);
    } finally {
      await api.close();
    }
  });

  it('accepts a complete fixture without mutating users', async () => {
    const api = await startMockApi(validState());
    try {
      const result = await runPreflight(api.baseUrl);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        `Native outbox fixture preflight passed: branch "${branchId}", ` +
        `active pump "${pumpName}", product "PMS", opening meter 1000.`,
      );
      expect(api.requests.filter(request =>
        request.method === 'POST' && request.url === '/api/users',
      )).toHaveLength(0);
    } finally {
      await api.close();
    }
  });
});