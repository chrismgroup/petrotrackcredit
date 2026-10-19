import { randomUUID } from "crypto";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface StoredFile {
  objectPath: string;
  name: string;
  contentType: string;
  size: number;
  data: Buffer;
}

export interface StoredFileMeta {
  objectPath: string;
  name: string;
  contentType: string;
  size: number;
}

interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS stored_files (
  object_path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BYTEA NOT NULL,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;

/**
 * Stores uploaded documents in the relational database so uploads work
 * without any external object storage configuration.
 */
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
      this.ready = this.client().then((db) => db.query(CREATE_TABLE_SQL)).then(
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
  }): Promise<StoredFileMeta> {
    await this.ensureTable();
    const db = await this.client();
    const objectPath = `/objects/uploads/${randomUUID()}`;
    const name = sanitizeFileName(input.name);
    const contentType = input.contentType || "application/octet-stream";
    await db.query(
      `INSERT INTO stored_files (object_path, name, content_type, size, data, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [objectPath, name, contentType, input.data.length, input.data, input.uploadedBy ?? null],
    );
    return { objectPath, name, contentType, size: input.data.length };
  }

  async get(objectPath: string): Promise<StoredFile | null> {
    await this.ensureTable();
    const result = await (await this.client()).query(
      `SELECT object_path, name, content_type, size, data FROM stored_files WHERE object_path = $1`,
      [objectPath],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      objectPath: row.object_path,
      name: row.name,
      contentType: row.content_type,
      size: Number(row.size),
      data: Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data),
    };
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
