import { createHash, randomUUID } from "crypto";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const FILE_CATEGORIES = [
  "general",
  "my_folder",
  "meeting_minutes",
  "hr_enrollment",
  "hr_document",
  "hr_handbook",
  "delivery_evidence",
  "chat_media",
] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

export interface StoredFileMeta {
  objectPath: string;
  name: string;
  contentType: string;
  size: number;
  category: FileCategory;
  relatedId: string | null;
  branchId: string | null;
  uploadedBy: string | null;
}

export interface StoredFile extends StoredFileMeta {
  data: Buffer;
}

interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
}

/**
 * Relational file storage. File details live in stored_files (linked to
 * staff_users) and the bytes in stored_file_contents, which cascades on delete.
 * Older deployments kept bytes inline in stored_files.data; those rows are
 * moved into stored_file_contents the first time this runs.
 */
export const FILE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS stored_files (
  object_path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE stored_files ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';
ALTER TABLE stored_files ADD COLUMN IF NOT EXISTS related_id TEXT;
ALTER TABLE stored_files ADD COLUMN IF NOT EXISTS branch_id TEXT;
ALTER TABLE stored_files ADD COLUMN IF NOT EXISTS uploaded_by_user_id INTEGER
  REFERENCES staff_users(id) ON DELETE SET NULL;
ALTER TABLE stored_files ADD COLUMN IF NOT EXISTS sha256 TEXT;
CREATE TABLE IF NOT EXISTS stored_file_contents (
  object_path TEXT PRIMARY KEY REFERENCES stored_files(object_path) ON DELETE CASCADE,
  data BYTEA NOT NULL
);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'stored_files' AND column_name = 'data'
  ) THEN
    INSERT INTO stored_file_contents (object_path, data)
      SELECT object_path, data FROM stored_files WHERE data IS NOT NULL
      ON CONFLICT (object_path) DO NOTHING;
    UPDATE stored_files f SET uploaded_by_user_id = u.id
      FROM staff_users u WHERE f.uploaded_by_user_id IS NULL AND u.username = f.uploaded_by;
    ALTER TABLE stored_files DROP COLUMN data;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS stored_files_category_idx ON stored_files (category, related_id);
CREATE INDEX IF NOT EXISTS stored_files_uploader_idx ON stored_files (uploaded_by_user_id);
CREATE INDEX IF NOT EXISTS stored_files_branch_idx ON stored_files (branch_id);
CREATE OR REPLACE VIEW stored_files_overview AS
  SELECT f.object_path, f.name, f.content_type, f.size, f.category, f.related_id, f.branch_id,
         f.uploaded_by, u.emp_name AS uploaded_by_name, u.role AS uploaded_by_role, f.created_at
  FROM stored_files f
  LEFT JOIN staff_users u ON u.id = f.uploaded_by_user_id;
`;

const META_COLUMNS = "object_path, name, content_type, size, category, related_id, branch_id, uploaded_by";

export function normalizeCategory(raw: string | string[] | undefined | null): FileCategory {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  return (FILE_CATEGORIES as readonly string[]).includes(value ?? "") ? value as FileCategory : "general";
}

export function normalizeRelatedId(raw: string | string[] | undefined | null): string | null {
  let value = Array.isArray(raw) ? raw[0] : raw;
  try {
    value = value ? decodeURIComponent(value) : value;
  } catch {
    // keep the raw header value
  }
  value = value?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return value ? value.slice(0, 120) : null;
}

function toMeta(row: Record<string, any>): StoredFileMeta {
  return {
    objectPath: row.object_path,
    name: row.name,
    contentType: row.content_type,
    size: Number(row.size),
    category: normalizeCategory(row.category),
    relatedId: row.related_id ?? null,
    branchId: row.branch_id ?? null,
    uploadedBy: row.uploaded_by ?? null,
  };
}

export class FileStore {
  private ready: Promise<void> | null = null;
  private db: Queryable | null;

  constructor(db?: Queryable) {
    this.db = db ?? null;
  }

  private async client(): Promise<Queryable> {
    if (!this.db) {
      const { pool } = await import("@workspace/db");
      this.db = pool as unknown as Queryable;
    }
    return this.db;
  }

  private ensureTable(): Promise<void> {
    if (!this.ready) {
      this.ready = this.client().then((db) => db.query(FILE_TABLES_SQL)).then(
        () => undefined,
        (error) => {
          this.ready = null;
          throw error;
        },
      );
    }
    return this.ready;
  }

  async save(input: {
    name: string;
    contentType: string;
    data: Buffer;
    uploadedBy?: string | null;
    category?: FileCategory;
    relatedId?: string | null;
    branchId?: string | null;
  }): Promise<StoredFileMeta> {
    await this.ensureTable();
    const db = await this.client();
    const meta: StoredFileMeta = {
      objectPath: `/objects/uploads/${randomUUID()}`,
      name: sanitizeFileName(input.name),
      contentType: input.contentType || "application/octet-stream",
      size: input.data.length,
      category: input.category ?? "general",
      relatedId: input.relatedId ?? null,
      branchId: input.branchId ?? null,
      uploadedBy: input.uploadedBy ?? null,
    };
    const sha256 = createHash("sha256").update(input.data).digest("hex");
    // One statement, so the details and the bytes are saved atomically.
    await db.query(
      `WITH saved AS (
         INSERT INTO stored_files
           (object_path, name, content_type, size, category, related_id, branch_id, uploaded_by, uploaded_by_user_id, sha256)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (SELECT id FROM staff_users WHERE username = $8 LIMIT 1), $9)
         RETURNING object_path
       )
       INSERT INTO stored_file_contents (object_path, data) SELECT object_path, $10 FROM saved`,
      [
        meta.objectPath, meta.name, meta.contentType, meta.size, meta.category,
        meta.relatedId, meta.branchId, meta.uploadedBy, sha256, input.data,
      ],
    );
    return meta;
  }

  async getMeta(objectPath: string): Promise<StoredFileMeta | null> {
    await this.ensureTable();
    const result = await (await this.client()).query(
      `SELECT ${META_COLUMNS} FROM stored_files WHERE object_path = $1`,
      [objectPath],
    );
    return result.rows[0] ? toMeta(result.rows[0]) : null;
  }

  async get(objectPath: string): Promise<StoredFile | null> {
    await this.ensureTable();
    const result = await (await this.client()).query(
      `SELECT ${META_COLUMNS.split(", ").map(column => `f.${column}`).join(", ")}, c.data
       FROM stored_files f JOIN stored_file_contents c ON c.object_path = f.object_path
       WHERE f.object_path = $1`,
      [objectPath],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { ...toMeta(row), data: Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data) };
  }

  async delete(objectPath: string): Promise<boolean> {
    await this.ensureTable();
    const result = await (await this.client()).query(`DELETE FROM stored_files WHERE object_path = $1`, [objectPath]);
    return (result.rowCount ?? 0) > 0;
  }
}

export function sanitizeFileName(raw: string | undefined | null): string {
  const cleaned = (raw ?? "")
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 200);
  return cleaned || "document";
}

export function decodeHeaderFileName(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return "document";
  try {
    return sanitizeFileName(decodeURIComponent(value));
  } catch {
    return sanitizeFileName(value);
  }
}

export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
