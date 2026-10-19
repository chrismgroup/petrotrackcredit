/**
 * App state backup / restore service.
 *
 * Backs up the entire app_state table to the app_state_backups table in
 * PostgreSQL as a timestamped JSON snapshot, and provides restore capability.
 * Runs automatically every 12 hours. No external file storage is used.
 */

import { db, appStateTable, pool } from "@workspace/db";
import { logger } from "./logger";
import {
  mergeWorkflowRecords,
  mergeWorkflowTombstones,
} from "../routes/workflow-record-merge";

const BACKUP_PREFIX = "app-state";
const MAX_BACKUPS = 14; // 7 days at 12-hour intervals

interface BackupRow {
  key: string;
  data: unknown;
}

const CREATE_BACKUPS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS app_state_backups (
  object_name TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  size_bytes INTEGER NOT NULL,
  payload TEXT NOT NULL
)`;

let backupsTableReady: Promise<unknown> | null = null;

function ensureBackupsTable(): Promise<unknown> {
  if (!backupsTableReady) {
    backupsTableReady = pool.query(CREATE_BACKUPS_TABLE_SQL).catch((error) => {
      backupsTableReady = null;
      throw error;
    });
  }
  return backupsTableReady;
}

const WORKFLOW_BACKUP_PAIRS = [
  {
    collection: "deliveries" as const,
    tombstones: "deliveryDeletionTombstones",
  },
  {
    collection: "expenses" as const,
    tombstones: "expenseDeletionTombstones",
  },
] as const;

export interface BackupMetadata {
  objectName: string;
  createdAt: string;
  sizeBytes?: number;
}

export async function createBackup(): Promise<BackupMetadata> {
  const rows = await db.select().from(appStateTable);
  const payload = rows.map((r) => ({ key: r.key, data: r.data } as BackupRow));
  const body = JSON.stringify(payload);
  const sizeBytes = Buffer.byteLength(body);

  const createdAt = new Date();
  const ts = createdAt.toISOString().replace(/[:.]/g, "-");
  const objectName = `${BACKUP_PREFIX}-${ts}-${Math.random().toString(36).slice(2, 8)}.json`;

  await ensureBackupsTable();
  await pool.query(
    `INSERT INTO app_state_backups (object_name, created_at, size_bytes, payload) VALUES ($1, $2, $3, $4)`,
    [objectName, createdAt, sizeBytes, body],
  );

  await pruneOldBackups();

  logger.info({ objectName, sizeBytes }, "App state backup created");

  return { objectName, createdAt: createdAt.toISOString(), sizeBytes };
}

export async function listBackups(): Promise<BackupMetadata[]> {
  await ensureBackupsTable();
  const result = await pool.query(
    `SELECT object_name, created_at, size_bytes FROM app_state_backups ORDER BY created_at DESC, object_name DESC`,
  );
  return result.rows.map((row: { object_name: string; created_at: Date | string; size_bytes: number }) => ({
    objectName: row.object_name,
    createdAt: new Date(row.created_at).toISOString(),
    sizeBytes: Number(row.size_bytes),
  }));
}

export async function restoreBackup(objectName: string): Promise<{ keysRestored: number }> {
  await ensureBackupsTable();
  const found = await pool.query(`SELECT payload FROM app_state_backups WHERE object_name = $1`, [objectName]);
  if (found.rows.length === 0) {
    throw new Error("Backup not found");
  }

  const payload = JSON.parse(found.rows[0].payload as string) as BackupRow[];
  if (!Array.isArray(payload)) {
    throw new Error("Invalid backup format");
  }

  await db.transaction(async (tx) => {
    const currentRows = await tx.select().from(appStateTable);
    const currentByKey = new Map(currentRows.map(row => [row.key, row]));
    const restoredByKey = new Map(payload.map(row => [row.key, row]));

    for (const pair of WORKFLOW_BACKUP_PAIRS) {
      const currentTombstoneRow = currentByKey.get(pair.tombstones);
      const restoredTombstoneRow = restoredByKey.get(pair.tombstones);
      if (currentTombstoneRow || restoredTombstoneRow) {
        const tombstones = mergeWorkflowTombstones(
          currentTombstoneRow?.data,
          restoredTombstoneRow?.data,
        );
        restoredByKey.set(pair.tombstones, { key: pair.tombstones, data: tombstones });
      }

      const restoredWorkflowRow = restoredByKey.get(pair.collection);
      if (restoredWorkflowRow) {
        restoredByKey.set(pair.collection, {
          key: pair.collection,
          data: mergeWorkflowRecords(
            [],
            restoredWorkflowRow.data,
            pair.collection,
            restoredByKey.get(pair.tombstones)?.data,
          ),
        });
      }
    }

    for (const row of restoredByKey.values()) {
      await tx
        .insert(appStateTable)
        .values({ key: row.key, data: row.data })
        .onConflictDoUpdate({
          target: appStateTable.key,
          set: { data: row.data, updatedAt: new Date() },
        });
    }
  });

  logger.info({ keysRestored: payload.length, objectName }, "App state restored from backup");
  return { keysRestored: payload.length };
}

async function pruneOldBackups(): Promise<void> {
  const result = await pool.query(
    `DELETE FROM app_state_backups WHERE object_name IN (
       SELECT object_name FROM app_state_backups
       ORDER BY created_at DESC, object_name DESC
       OFFSET $1
     )`,
    [MAX_BACKUPS],
  );
  if (result.rowCount) {
    logger.info({ deleted: result.rowCount }, "Pruned old app state backups");
  }
}
