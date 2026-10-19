import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ChatError,
  ChatStore,
  assertCanDeleteForEveryone,
  assertCanEdit,
  assertGroupAdmin,
  buildIdentityResolver,
  cleanBody,
  cleanGroupName,
  cleanMedia,
  cleanUsernames,
  directKey,
  legacyTimestamp,
  parsePositiveInt,
  type ChatPool,
} from "../lib/chatStore";

function rejectsWith(status: number) {
  return (error: unknown) => error instanceof ChatError && error.status === status;
}

test("direct chats use one key per pair regardless of order", () => {
  assert.equal(directKey("musa", "ada"), "ada|musa");
  assert.equal(directKey("ada", "musa"), directKey("musa", "ada"));
});

test("input cleaning trims and limits user input", () => {
  assert.equal(cleanBody("  hello\r\nthere  "), "hello\nthere");
  assert.equal(cleanBody(42), "");
  assert.equal(cleanBody("x".repeat(5000)).length, 4000);
  assert.equal(cleanGroupName("  Ops   team "), "Ops team");
  assert.deepEqual(cleanUsernames(["a", " a ", "b", 3, ""]), ["a", "b"]);
  assert.equal(parsePositiveInt("12"), 12);
  assert.equal(parsePositiveInt("-1"), null);
  assert.equal(parsePositiveInt("1e3"), null);
});

test("only files stored in the app database can be attached", () => {
  assert.equal(cleanMedia({ uri: "file:///phone/photo.jpg", name: "p.jpg" }), null);
  assert.equal(cleanMedia({ objectPath: "https://example.com/x" }), null);
  assert.deepEqual(cleanMedia({ objectPath: "/objects/uploads/abc", name: "a.pdf", mimeType: "application/pdf", size: 10 }), {
    objectPath: "/objects/uploads/abc", name: "a.pdf", mimeType: "application/pdf", size: 10,
  });
});

test("only the sender may edit or delete a message for everyone", () => {
  const message = { sender_username: "ada", deleted_at: null, kind: "text" };
  assert.doesNotThrow(() => assertCanEdit(message, "ada"));
  assert.throws(() => assertCanEdit(message, "musa"), rejectsWith(403));
  assert.throws(() => assertCanEdit({ ...message, deleted_at: new Date() }, "ada"), rejectsWith(409));
  assert.throws(() => assertCanEdit({ ...message, kind: "system", sender_username: null }, "ada"), rejectsWith(403));
  assert.doesNotThrow(() => assertCanDeleteForEveryone(message, "ada"));
  assert.throws(() => assertCanDeleteForEveryone(message, "musa"), rejectsWith(403));
});

test("only admins manage groups", () => {
  assert.doesNotThrow(() => assertGroupAdmin({ kind: "group" }, { role: "admin" }));
  assert.throws(() => assertGroupAdmin({ kind: "group" }, { role: "member" }), rejectsWith(403));
  assert.throws(() => assertGroupAdmin({ kind: "direct" }, { role: "admin" }), rejectsWith(400));
});

test("old chat names resolve to usernames", () => {
  const resolve = buildIdentityResolver([
    { username: "ada", empName: "Ada Obi", role: "acc", status: "active" },
    { username: "musa", empName: "Musa Bello", role: "att", status: "active" },
    { username: "joy", empName: "Joy Eze", role: "att", status: "active" },
  ]);
  assert.equal(resolve("Ada Obi"), "ada");
  assert.equal(resolve("ADA"), "ada");
  assert.equal(resolve("acc"), "ada");
  assert.equal(resolve("att"), null, "a role shared by several people is ambiguous");
  assert.equal(resolve("nobody"), null);
  assert.equal(legacyTimestamp({ id: 1_700_000_000_000, from: "a", to: "b" }), new Date(1_700_000_000_000).toISOString());
});

// ─── Database tests (run when CHAT_TEST_DATABASE_URL is set) ─────────────────

const DB_URL = process.env.CHAT_TEST_DATABASE_URL;

test("chat permissions and features against PostgreSQL", { skip: !DB_URL && "CHAT_TEST_DATABASE_URL not set" }, async () => {
  // This test wipes the database it is given, so it only runs against a database named *test*.
  assert.match(new URL(DB_URL!).pathname, /test/i, "CHAT_TEST_DATABASE_URL must point at a test database");
  process.env.DATABASE_URL = DB_URL;
  const { pool } = await import("@workspace/db");
  await pool.query(`
    DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
    CREATE TABLE staff_users (id SERIAL PRIMARY KEY, emp_name TEXT NOT NULL, username TEXT UNIQUE, role TEXT, status TEXT NOT NULL DEFAULT 'active');
    CREATE TABLE stored_files (object_path TEXT PRIMARY KEY, category TEXT NOT NULL DEFAULT 'general');
    CREATE TABLE app_state (key TEXT PRIMARY KEY, data JSONB NOT NULL);
    INSERT INTO staff_users (emp_name, username, role, status) VALUES
      ('Ada Obi', 'ada', 'acc', 'active'), ('Musa Bello', 'musa', 'att', 'active'),
      ('Joy Eze', 'joy', 'mktg', 'active'), ('Old Staff', 'old', 'att', 'inactive');
    INSERT INTO stored_files VALUES ('/objects/uploads/f1', 'chat_media');
    INSERT INTO app_state VALUES ('messages', '{"Ada Obi-Musa Bello":[
      {"id":1700000000000,"from":"Ada Obi","to":"Musa Bello","type":"txt","body":"Legacy hello","read":true},
      {"id":1700000001000,"from":"Musa Bello","to":"Ada Obi","type":"txt","body":"Legacy reply","read":false}
    ]}');
  `);
  const store = new ChatStore(pool as unknown as ChatPool);
  try {
    // Legacy messages are imported once.
    const imported = await store.listConversations("ada");
    assert.equal(imported.length, 1);
    assert.equal(imported[0].lastMessage?.body, "Legacy reply");
    assert.equal(imported[0].unread, 1);
    assert.equal(await store.importLegacy(), 0, "import is idempotent");

    // Direct chat: one per pair, inactive staff refused.
    const direct = await store.openDirect("ada", "joy");
    assert.equal((await store.openDirect("joy", "ada")).id, direct.id);
    await assert.rejects(store.openDirect("ada", "old"), rejectsWith(404));
    await assert.rejects(store.openDirect("ada", "ada"), rejectsWith(400));

    const first = await store.sendMessage("ada", direct.id, { body: "Hello Joy" });
    assert.equal(first.kind, "text");
    await assert.rejects(store.sendMessage("musa", direct.id, { body: "intruder" }), rejectsWith(404));
    await assert.rejects(store.listMessages("musa", direct.id, {}), rejectsWith(404));
    assert.equal(await store.unreadTotal("joy"), 1);

    // Reply, edit (sender only), reactions, pins, read receipts.
    const reply = await store.sendMessage("joy", direct.id, { body: "Hi Ada", replyToId: first.id });
    assert.equal(reply.replyTo?.id, first.id);
    await assert.rejects(store.editMessage("joy", first.id, "hacked"), rejectsWith(403));
    const edited = await store.editMessage("ada", first.id, "Hello Joy!");
    assert.equal(edited.message.body, "Hello Joy!");
    assert.ok(edited.message.editedAt);
    const reacted = await store.toggleReaction("joy", first.id, "👍");
    assert.deepEqual(reacted.message.reactions, [{ emoji: "👍", usernames: ["joy"] }]);
    assert.deepEqual((await store.toggleReaction("joy", first.id, "👍")).message.reactions, []);
    await assert.rejects(store.toggleReaction("joy", first.id, "💩"), rejectsWith(400));
    await store.setPinned("joy", first.id, true);
    assert.equal((await store.pinnedMessages("ada", direct.id)).length, 1);
    await store.markRead("joy", direct.id);
    const info = await store.messageInfo("ada", first.id);
    assert.deepEqual(info.seenBy.map(s => s.username), ["joy"]);
    assert.equal(info.message.seenCount, 1);

    // Search.
    const found = await store.listMessages("ada", direct.id, { q: "joy!" });
    assert.deepEqual(found.messages.map(m => m.id), [first.id]);

    // Delete for me hides only for that user; delete for everyone is sender-only.
    await store.deleteMessage("ada", reply.id, "me");
    assert.ok(!(await store.listMessages("ada", direct.id, {})).messages.some(m => m.id === reply.id));
    assert.ok((await store.listMessages("joy", direct.id, {})).messages.some(m => m.id === reply.id));
    await assert.rejects(store.deleteMessage("joy", first.id, "everyone"), rejectsWith(403));
    const media = await store.sendMessage("ada", direct.id, { media: { objectPath: "/objects/uploads/f1", name: "f.pdf", mimeType: "application/pdf" } });
    await store.deleteMessage("ada", media.id, "everyone");
    const afterDelete = (await store.listMessages("joy", direct.id, {})).messages.find(m => m.id === media.id)!;
    assert.equal(afterDelete.deleted, true);
    assert.equal(afterDelete.media, null);
    const file = await pool.query(`SELECT 1 FROM stored_files WHERE object_path = '/objects/uploads/f1'`);
    assert.equal(file.rowCount, 0, "the deleted attachment is removed from the database");

    // Groups: creator is admin; members cannot manage; admins can.
    await assert.rejects(store.createGroup("ada", "", ["musa"]), rejectsWith(400));
    const group = await store.createGroup("ada", "Station Ops", ["musa", "joy", "old"]);
    assert.equal(group.myRole, "admin");
    assert.deepEqual(group.members.map(m => m.username).sort(), ["ada", "joy", "musa"]);
    await assert.rejects(store.renameGroup("musa", group.id, "Mine"), rejectsWith(403));
    await assert.rejects(store.removeMember("musa", group.id, "joy"), rejectsWith(403));
    assert.equal((await store.renameGroup("ada", group.id, "Ops Team")).name, "Ops Team");
    await store.setMemberRole("ada", group.id, "musa", "admin");
    await store.removeMember("musa", group.id, "joy");
    await assert.rejects(store.listMessages("joy", group.id, {}), rejectsWith(404));
    await store.addMembers("musa", group.id, ["joy"]);
    const groupMsg = await store.sendMessage("joy", group.id, { body: "Back!" });
    assert.equal(groupMsg.recipientCount, 2);

    // Forwarding needs membership of the target chat.
    await assert.rejects(store.forwardMessage("musa", groupMsg.id, [direct.id]), rejectsWith(404));
    const forwarded = await store.forwardMessage("ada", groupMsg.id, [direct.id]);
    assert.deepEqual(forwarded, [direct.id]);
    const last = (await store.listMessages("joy", direct.id, {})).messages.at(-1)!;
    assert.equal(last.forwarded, true);
    assert.equal(last.body, "Back!");

    // Leaving keeps at least one admin.
    await store.removeMember("ada", group.id, "ada");
    await store.removeMember("musa", group.id, "musa");
    const remaining = await store.getConversation("joy", group.id);
    assert.equal(remaining.myRole, "admin");
    const systemNotes = (await store.listMessages("joy", group.id, {})).messages.filter(m => m.kind === "system");
    assert.ok(systemNotes.some(m => m.body.includes("left the group")));
  } finally {
    await pool.end();
  }
});
