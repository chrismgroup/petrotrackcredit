import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const { Client } = pg;
const migrationId = "20261014_payment_reconciliation";
const migrationPath = new URL("../lib/db/migrations/20261014_payment_reconciliation.sql", import.meta.url);

function fail(message) {
  console.error(`MIGRATION BLOCKED: ${message}`);
  process.exitCode = 1;
}

function safeEqual(left, right) {
  const a = Buffer.from(left ?? "");
  const b = Buffer.from(right ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

if (process.env.RUN_RELATIONAL_MIGRATION !== "apply") {
  fail("Set RUN_RELATIONAL_MIGRATION=apply to run this additive schema migration.");
} else if (!process.env.DATABASE_URL) {
  fail("DATABASE_URL is not configured.");
} else if (!process.env.MIGRATION_APPROVAL_TOKEN || !safeEqual(process.env.MIGRATION_APPROVAL_CONFIRM, process.env.MIGRATION_APPROVAL_TOKEN)) {
  fail("MIGRATION_APPROVAL_CONFIRM does not match the protected MIGRATION_APPROVAL_TOKEN.");
} else if (!process.env.MIGRATION_TARGET_DATABASE) {
  fail("Set MIGRATION_TARGET_DATABASE to the expected target database name.");
} else {
  const sql = await readFile(migrationPath, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    const current = await client.query("select current_database() as name, current_user as username");
    const { name, username } = current.rows[0];
    if (name !== process.env.MIGRATION_TARGET_DATABASE) {
      fail(`Connected to database ${name}; expected ${process.env.MIGRATION_TARGET_DATABASE}.`);
    } else {
      await client.query("begin");
      await client.query(`
        create table if not exists relational_migration_runs (
          migration_id text primary key,
          checksum_sha256 text not null,
          applied_at timestamptz not null default now(),
          applied_by text not null
        )
      `);
      const previous = await client.query(
        "select checksum_sha256 from relational_migration_runs where migration_id = $1",
        [migrationId],
      );
      if (previous.rowCount && previous.rows[0].checksum_sha256 !== checksum) {
        throw new Error("Migration ID already exists with a different checksum; investigate before continuing.");
      }
      if (!previous.rowCount) {
        await client.query(sql);
        await client.query(
          "insert into relational_migration_runs (migration_id, checksum_sha256, applied_by) values ($1, $2, $3)",
          [migrationId, checksum, username],
        );
      }
      await client.query("commit");

      const expectedTables = [
        "payment_terminals", "terminal_shift_assignments", "payment_provider_events",
        "payment_transactions", "payment_ledger_entries", "relational_migration_runs",
      ];
      const verification = await client.query(`
        select c.relname as table_name,
               coalesce(s.n_live_tup, 0)::bigint as estimated_rows
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        left join pg_stat_user_tables s on s.relid = c.oid
        where n.nspname = 'public' and c.relname = any($1::text[])
        order by c.relname
      `, [expectedTables]);
      const found = new Set(verification.rows.map(row => row.table_name));
      const missing = expectedTables.filter(table => !found.has(table));
      if (missing.length) throw new Error(`Verification failed; missing tables: ${missing.join(", ")}`);
      console.log(JSON.stringify({
        status: "ok",
        migrationId,
        targetDatabase: name,
        checksumSha256: checksum,
        alreadyApplied: Boolean(previous.rowCount),
        tables: verification.rows,
        safety: "Only additive CREATE TABLE/INDEX statements were executed; legacy app_state was not changed.",
      }, null, 2));
    }
  } catch (error) {
    await client.query("rollback").catch(() => {});
    console.error("MIGRATION FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}
