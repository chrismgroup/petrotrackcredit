import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FILE_TABLES_SQL,
  FileStore,
  contentDisposition,
  decodeHeaderFileName,
  normalizeCategory,
  normalizeRelatedId,
  sanitizeFileName,
} from "../lib/fileStore";

function fakeDb() {
  const rows = new Map<string, Record<string, unknown>>();
  const statements: string[] = [];
  return {
    statements,
    rows,
    async query(text: string, params: unknown[] = []) {
      const sql = text.trim();
      statements.push(sql.split(/\s+/)[0]);
      if (sql.startsWith("CREATE TABLE")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("WITH saved")) {
        const [object_path, name, content_type, size, category, related_id, branch_id, uploaded_by, sha256, data] = params;
        rows.set(object_path as string, {
          object_path, name, content_type, size, category, related_id, branch_id, uploaded_by, sha256, data,
        });
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("SELECT")) {
        const row = rows.get(params[0] as string);
        if (row && !sql.includes("JOIN stored_file_contents")) {
          const { data: _data, ...meta } = row;
          return { rows: [meta], rowCount: 1 };
        }
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.startsWith("DELETE")) {
        const existed = rows.delete(params[0] as string);
        return { rows: [], rowCount: existed ? 1 : 0 };
      }
      throw new Error(`unexpected query ${sql}`);
    },
  };
}

test("stores, reads back and deletes a file in the database", async () => {
  const db = fakeDb();
  const store = new FileStore(db);
  const data = Buffer.from("%PDF-1.4 hello");

  const saved = await store.save({ name: "Board minutes.pdf", contentType: "application/pdf", data });
  assert.match(saved.objectPath, /^\/objects\/uploads\/[0-9a-f-]{36}$/);
  assert.equal(saved.size, data.length);

  const loaded = await store.get(saved.objectPath);
  assert.equal(loaded?.name, "Board minutes.pdf");
  assert.equal(loaded?.contentType, "application/pdf");
  assert.deepEqual(loaded?.data, data);

  assert.equal(await store.delete(saved.objectPath), true);
  assert.equal(await store.get(saved.objectPath), null);
  assert.equal(await store.delete(saved.objectPath), false);
  assert.equal(db.statements.filter(s => s === "CREATE").length, 1);
});

test("defaults missing content type and cleans unsafe names", async () => {
  const store = new FileStore(fakeDb());
  const saved = await store.save({ name: "../../etc/passwd", contentType: "", data: Buffer.from("x") });
  assert.equal(saved.contentType, "application/octet-stream");
  assert.equal(saved.name, ".._.._etc_passwd");
  assert.equal(sanitizeFileName("   "), "document");
});

test("decodes URI-encoded header names and builds safe download headers", () => {
  assert.equal(decodeHeaderFileName(encodeURIComponent("Rapport d’audit 2026.pdf")), "Rapport d’audit 2026.pdf");
  assert.equal(decodeHeaderFileName("%E0%A4%A"), "%E0%A4%A");
  assert.equal(decodeHeaderFileName(undefined), "document");
  assert.equal(
    contentDisposition('a"b’.pdf'),
    `inline; filename="a_b_.pdf"; filename*=UTF-8''a%22b%E2%80%99.pdf`,
  );
});

test("links files to their category, related record, branch and uploader", async () => {
  const db = fakeDb();
  const store = new FileStore(db);
  const saved = await store.save({
    name: "waybill.jpg",
    contentType: "image/jpeg",
    data: Buffer.from("jpeg"),
    uploadedBy: "demo.mgr",
    category: "delivery_evidence",
    relatedId: "42",
    branchId: "branch-uyo",
  });
  assert.equal(saved.category, "delivery_evidence");
  assert.equal(saved.relatedId, "42");
  assert.equal(saved.branchId, "branch-uyo");
  const row = db.rows.get(saved.objectPath);
  assert.equal(row?.uploaded_by, "demo.mgr");
  assert.match(String(row?.sha256), /^[0-9a-f]{64}$/);

  const meta = await store.getMeta(saved.objectPath);
  assert.equal(meta?.uploadedBy, "demo.mgr");
  assert.equal((meta as unknown as Record<string, unknown> | null)?.data, undefined);
});

test("only accepts known categories and bounded related ids", () => {
  assert.equal(normalizeCategory("CHAT_MEDIA"), "chat_media");
  assert.equal(normalizeCategory("../../etc"), "general");
  assert.equal(normalizeCategory(undefined), "general");
  assert.equal(normalizeRelatedId("  "), null);
  assert.equal(normalizeRelatedId(encodeURIComponent("Emma Assam")), "Emma Assam");
  assert.equal(normalizeRelatedId("x".repeat(500))?.length, 120);
});

test("schema keeps file bytes in a separate table that cascades with the file", () => {
  assert.match(FILE_TABLES_SQL, /stored_file_contents[\s\S]*REFERENCES stored_files\(object_path\) ON DELETE CASCADE/);
  assert.match(FILE_TABLES_SQL, /uploaded_by_user_id INTEGER\s+REFERENCES staff_users\(id\) ON DELETE SET NULL/);
  assert.match(FILE_TABLES_SQL, /DROP COLUMN data/);
});
