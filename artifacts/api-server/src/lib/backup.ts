/**
 * App state backup / restore service.
 *
 * Backs up the entire app_state table to object storage as a timestamped JSON
 * file, and provides restore capability. Runs automatically every 12 hours.
 */

import { db, appStateTable } from "@workspace/db";
import { objectStorageClient } from "./objectStorage";
import { logger } from "./logger";
import {
  mergeWorkflowRecords,
  mergeWorkflowTombstones,
} from "../routes/workflow-record-merge";

const BACKUP_DIR = "backups";
const BACKUP_PREFIX = "app-state";
const MAX_BACKUPS = 14; // 7 days at 12-hour intervals

interface BackupRow {
  key: string;
  data: unknown;
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

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) {
    throw new Error("PRIVATE_OBJECT_DIR not set. Set it to a bucket path such as /bucket/private.");
  }
  return dir.endsWith("/") ? dir.slice(0, -1) : dir;
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  if (parts.length < 3) {
    throw new Error(`Invalid object path: ${path}`);
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

function backupBucketAndPrefix(): { bucketName: string; prefix: string } {
  const dir = getPrivateObjectDir();
  const { bucketName, objectName: rootPrefix } = parseObjectPath(dir);
  const prefix = rootPrefix ? `${rootPrefix}/${BACKUP_DIR}/${BACKUP_PREFIX}` : `${BACKUP_DIR}/${BACKUP_PREFIX}`;
  return { bucketName, prefix };
}

function timestampToIso(ts: string): string {
  // ts looks like 2026-07-27T09-15-30-123Z
  return ts.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z");
}

export async function createBackup(): Promise<BackupMetadata> {
  const rows = await db.select().from(appStateTable);
  const payload = rows.map((r) => ({ key: r.key, data: r.data } as BackupRow));
  const body = JSON.stringify(payload);

  const dir = getPrivateObjectDir();
  const { bucketName, objectName: rootPrefix } = parseObjectPath(dir);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const objectName = rootPrefix
    ? `${rootPrefix}/${BACKUP_DIR}/${BACKUP_PREFIX}-${ts}.json`
    : `${BACKUP_DIR}/${BACKUP_PREFIX}-${ts}.json`;

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  await file.save(body, {
    contentType: "application/json",
    metadata: {
      contentType: "application/json",
    },
  });

  await pruneOldBackups();

  logger.info({ objectName, sizeBytes: Buffer.byteLength(body) }, "App state backup created");

  return { objectName, createdAt: new Date().toISOString(), sizeBytes: Buffer.byteLength(body) };
}

export async function listBackups(): Promise<BackupMetadata[]> {
  const { bucketName, prefix } = backupBucketAndPrefix();
  const bucket = objectStorageClient.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix: `${prefix}-` });

  const backups: BackupMetadata[] = [];
  for (const file of files) {
    const match = file.name.match(/app-state-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/);
    if (!match) continue;
    backups.push({
      objectName: file.name,
      createdAt: timestampToIso(match[1]),
      sizeBytes: file.metadata.size ? Number(file.metadata.size) : undefined,
    });
  }
  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function restoreBackup(objectName: string): Promise<{ keysRestored: number }> {
  const { bucketName } = backupBucketAndPrefix();
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  const [exists] = await file.exists();
  if (!exists) {
    throw new Error("Backup not found");
  }

  const [content] = await file.download();
  const payload = JSON.parse(content.toString()) as BackupRow[];
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
  const { bucketName, prefix } = backupBucketAndPrefix();
  const bucket = objectStorageClient.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix: `${prefix}-` });

  const sorted = files
    .filter((f) => f.name.endsWith(".json"))
    .sort((a, b) => (b.metadata.timeCreated || "").localeCompare(a.metadata.timeCreated || ""));

  const toDelete = sorted.slice(MAX_BACKUPS);
  if (toDelete.length === 0) return;

  await Promise.all(toDelete.map((f) => f.delete()));
  logger.info({ deleted: toDelete.length }, "Pruned old app state backups");
}
