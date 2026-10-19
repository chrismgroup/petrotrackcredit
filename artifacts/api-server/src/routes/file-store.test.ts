import assert from "node:assert/strict";
import { test } from "node:test";

import { FileStore, contentDisposition, decodeHeaderFileName, sanitizeFileName } from "../lib/fileStore";

function fakeDb() {
  const rows = new Map<string, Record<string, unknown>>();
  const statements: string[] = [];
  return {
    statements,
    rows,
    async query(text: string, params: unknown[] = []) {
      statements.push(text.trim().split(/\s+/)[0]);
      if (text.includes("CREATE TABLE")) return { rows: [], rowCount: 0 };
      if (text.startsWith("INSERT")) {
        const [object_path, name, content_type, size, data] = params;
        rows.set(object_path as string, { object_path, name, content_type, size, data });
        return { rows: [], rowCount: 1 };
      }
      if (text.startsWith("SELECT")) {
        const row = rows.get(params[0] as string);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (text.startsWith("DELETE")) {
        const existed = rows.delete(params[0] as string);
        return { rows: [], rowCount: existed ? 1 : 0 };
      }
      throw new Error(`unexpected query ${text}`);
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
