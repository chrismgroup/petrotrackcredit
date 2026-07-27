/**
 * Seed-and-reset script for Gastsmarts operational data.
 *
 * What it does:
 *   1. Reads the current pumpDailyReports, pumpInitialMeters, pumpLockedMeters and pumps.
 *   2. Computes the current effective opening meter for every pump:
 *        - locked meter (if set by admin) wins
 *        - otherwise the most recent approved/pending_accountant report closing meter
 *        - otherwise the existing pumpInitialMeters value
 *   3. Writes those values into pumpInitialMeters so the next shift report starts from the last known good reading.
 *   4. Clears all operational data keys (expenses, budgets, sales, dips, deliveries, maintenance,
 *      inventory log, pump daily reports, financial entry, messages, tasks, KPIs, company files,
 *      delivery evidences, HR blobs, price proposals, legal/corp/meeting minutes, broadcasts, call log, price history).
 *   5. Adds an audit entry and leaves master config untouched (pumps, tanks, prices, staff, branches, users, access control, etc.).
 */

import pg from 'pg';

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const OPERATIONAL_KEYS = [
  'expenses',
  'budgets',
  'sales',
  'dips',
  'deliveries',
  'maintenance',
  'inventoryLog',
  'pumpDailyReports',
  'financialEntry',
  'messages',
  'tasks',
  'kpis',
  'companyFiles',
  'deliveryEvidences',
  'hrEmployees',
  'hrHandbooks',
  'hrRecommendations',
  'priceProposals',
  'legalMatters',
  'corpProjects',
  'meetingMinutes',
  'broadcasts',
  'callLog',
  'priceHistory',
];

const PROTECTED_KEYS = new Set([
  'auth',
  'companyInfo',
  'tanks',
  'lpgTanks',
  'pumps',
  'staff',
  'branches',
  'departments',
  'userAccounts',
  'prices',
  'mgrPerms',
  'roleAccess',
  'userAccess',
  'pumpInitialMeters',
  'pumpLockedMeters',
  'audit',
]);

const nowTs = () => new Date().toISOString();

const genId = () => Math.floor(Math.random() * 1_000_000_000);

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // Read current relevant state
    const keys = ['pumpDailyReports', 'pumpInitialMeters', 'pumpLockedMeters', 'pumps', 'audit'];
    const res = await client.query(
      `SELECT key, data FROM app_state WHERE key = ANY($1)`,
      [keys]
    );

    const state = Object.fromEntries(res.rows.map(r => [r.key, r.data]));

    const pumpDailyReports = Array.isArray(state.pumpDailyReports) ? state.pumpDailyReports : [];
    const pumpInitialMeters = state.pumpInitialMeters && typeof state.pumpInitialMeters === 'object' ? state.pumpInitialMeters : {};
    const pumpLockedMeters = state.pumpLockedMeters && typeof state.pumpLockedMeters === 'object' ? state.pumpLockedMeters : {};
    const pumps = Array.isArray(state.pumps) ? state.pumps : [];
    const audit = Array.isArray(state.audit) ? state.audit : [];

    // Compute seed meters per pump
    const seedMeters = {};
    for (const pump of pumps) {
      if (!pump?.id) continue;
      const pumpId = pump.id;
      // Locked meter wins
      if (pumpLockedMeters[pumpId] !== undefined) {
        seedMeters[pumpId] = Number(pumpLockedMeters[pumpId]);
        continue;
      }
      // Most recent approved / pending_accountant report closing meter
      const sorted = [...pumpDailyReports]
        .filter(r => r.pumpId === pumpId && (r.status === 'approved' || r.status === 'pending_accountant'))
        .sort((a, b) => b.date.localeCompare(a.date) || b.submittedAt.localeCompare(a.submittedAt));
      if (sorted.length > 0) {
        seedMeters[pumpId] = Number(sorted[0].closingMeter);
        continue;
      }
      // Fall back to existing initial meter
      if (pumpInitialMeters[pumpId] !== undefined) {
        seedMeters[pumpId] = Number(pumpInitialMeters[pumpId]);
      }
    }

    console.log('Pump seed meters:');
    for (const [id, reading] of Object.entries(seedMeters)) {
      console.log(`  ${id}: ${reading.toLocaleString()} L`);
    }

    // Build audit entry
    const auditEntry = {
      id: genId(),
      action: 'Operational data seeded and reset',
      user: 'system',
      detail: `Preserved pump opening meters from ${pumpDailyReports.length} shift reports; cleared operational data for real-life entry.`,
      ts: nowTs(),
    };
    const newAudit = [auditEntry, ...audit];

    // Update pumpInitialMeters and clear operational keys in one transaction
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO app_state (key, data) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      ['pumpInitialMeters', JSON.stringify(seedMeters)]
    );

    // Clear pumpLockedMeters since the seed is now in pumpInitialMeters
    await client.query(
      `INSERT INTO app_state (key, data) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      ['pumpLockedMeters', JSON.stringify({})]
    );

    for (const key of OPERATIONAL_KEYS) {
      if (PROTECTED_KEYS.has(key)) {
        console.warn(`Skipping protected key: ${key}`);
        continue;
      }
      const emptyValue = key === 'messages' ? {} : [];
      await client.query(
        `INSERT INTO app_state (key, data) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [key, JSON.stringify(emptyValue)]
      );
      console.log(`Cleared: ${key}`);
    }

    await client.query(
      `INSERT INTO app_state (key, data) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      ['audit', JSON.stringify(newAudit)]
    );

    await client.query('COMMIT');

    console.log('\nOperational data reset complete.');
    console.log(`Preserved pump seed meters for ${Object.keys(seedMeters).length} pump(s).`);
    console.log('Master configuration (pumps, tanks, prices, staff, branches, access control) was not touched.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Reset failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
