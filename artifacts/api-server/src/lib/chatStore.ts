/**
 * Relational chat storage: conversations, members, messages, reactions,
 * read receipts and per-user hidden messages, all in PostgreSQL.
 */

export interface ChatQueryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface ChatPool extends ChatQueryable {
  connect: () => Promise<ChatQueryable & { release: () => void }>;
}

export class ChatError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const MAX_CHAT_BODY = 4000;
export const MAX_GROUP_NAME = 80;
export const MAX_GROUP_MEMBERS = 256;
export const CHAT_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "👏", "✅"] as const;

export type MemberRole = "admin" | "member";

export interface ChatMedia {
  objectPath?: string;
  uri?: string;
  name: string;
  mimeType: string;
  size?: number;
}

export interface ChatMemberDTO {
  username: string;
  empName: string;
  appRole: string | null;
  role: MemberRole;
  joinedAt: string;
}

export interface ChatReplyDTO {
  id: number;
  sender: string | null;
  senderName: string;
  kind: string;
  body: string;
  media: ChatMedia | null;
  deleted: boolean;
}

export interface ChatMessageDTO {
  id: number;
  conversationId: number;
  sender: string | null;
  senderName: string;
  kind: "text" | "media" | "system";
  body: string;
  media: ChatMedia | null;
  replyTo: ChatReplyDTO | null;
  forwarded: boolean;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  pinnedAt: string | null;
  pinnedBy: string | null;
  reactions: { emoji: string; usernames: string[] }[];
  seenCount: number;
  recipientCount: number;
}

export interface ChatConversationDTO {
  id: number;
  kind: "direct" | "group";
  name: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  myRole: MemberRole;
  archived: boolean;
  unread: number;
  lastReadMessageId: number;
  members: ChatMemberDTO[];
  lastMessage: ChatMessageDTO | null;
}

export const CHAT_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS chat_conversations (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('direct', 'group')),
  name TEXT,
  direct_key TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_direct_key_idx ON chat_conversations (direct_key);
CREATE TABLE IF NOT EXISTS chat_members (
  conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  user_id INTEGER REFERENCES staff_users(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  last_read_message_id INTEGER NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (conversation_id, username)
);
CREATE INDEX IF NOT EXISTS chat_members_username_idx ON chat_members (username);
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_username TEXT,
  sender_user_id INTEGER REFERENCES staff_users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'media', 'system')),
  body TEXT NOT NULL DEFAULT '',
  file_object_path TEXT REFERENCES stored_files(object_path) ON DELETE SET NULL,
  media JSONB,
  reply_to_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL,
  forwarded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  pinned_at TIMESTAMPTZ,
  pinned_by TEXT,
  legacy_id TEXT
);
CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx ON chat_messages (conversation_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_legacy_idx ON chat_messages (legacy_id);
CREATE TABLE IF NOT EXISTS chat_message_hidden (
  message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, username)
);
CREATE TABLE IF NOT EXISTS chat_reactions (
  message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, username)
);
CREATE TABLE IF NOT EXISTS chat_message_reads (
  message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, username)
);
`;

// ─── Pure helpers (unit tested) ──────────────────────────────────────────────

export function directKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

export function cleanBody(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim().slice(0, MAX_CHAT_BODY) : "";
}

export function cleanGroupName(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_GROUP_NAME) : "";
}

export function cleanMedia(raw: unknown): ChatMedia | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const objectPath = typeof value.objectPath === "string" && value.objectPath.startsWith("/objects/")
    ? value.objectPath.slice(0, 500) : undefined;
  if (!objectPath) return null;
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 255) : "Attachment";
  const mimeType = typeof value.mimeType === "string" && value.mimeType.trim()
    ? value.mimeType.trim().slice(0, 200) : "application/octet-stream";
  const size = typeof value.size === "number" && Number.isFinite(value.size) && value.size >= 0 ? Math.round(value.size) : undefined;
  return { objectPath, name, mimeType, ...(size !== undefined ? { size } : {}) };
}

export function cleanUsernames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((v): v is string => typeof v === "string").map(v => v.trim()).filter(Boolean))];
}

export function parsePositiveInt(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Message actions are checked here so the rules can be tested without a database. */
export function assertCanEdit(message: { sender_username: string | null; deleted_at: unknown; kind: string }, username: string) {
  if (message.sender_username !== username) throw new ChatError(403, "You can only edit your own messages.");
  if (message.deleted_at) throw new ChatError(409, "This message was deleted.");
  if (message.kind === "system") throw new ChatError(400, "System messages cannot be edited.");
}

export function assertCanDeleteForEveryone(message: { sender_username: string | null; deleted_at: unknown }, username: string) {
  if (message.sender_username !== username) {
    throw new ChatError(403, "Only the sender can delete a message for everyone.");
  }
  if (message.deleted_at) throw new ChatError(409, "This message was already deleted.");
}

export function assertGroupAdmin(conversation: { kind: string }, member: { role: string }) {
  if (conversation.kind !== "group") throw new ChatError(400, "This is not a group chat.");
  if (member.role !== "admin") throw new ChatError(403, "Only group admins can do this.");
}

// ─── Legacy import ────────────────────────────────────────────────────────────

export interface LegacyMessage {
  id: number | string;
  from: string;
  to: string;
  type?: string;
  body?: string;
  createdAt?: string;
  read?: boolean;
  media?: { objectPath?: string; uri?: string; name?: string; mimeType?: string; size?: number };
  archiveState?: Record<string, { archived?: boolean }>;
  archivedBy?: string[];
}

export interface StaffIdentity { username: string; empName: string; role: string | null; status: string }

/** Maps the names used by the old chat store (username, staff name or role) to usernames. */
export function buildIdentityResolver(staff: StaffIdentity[]): (value: string) => string | null {
  const byUsername = new Map<string, string>();
  const byName = new Map<string, string>();
  const byRole = new Map<string, string[]>();
  for (const s of staff) {
    if (!s.username) continue;
    byUsername.set(s.username.toLowerCase(), s.username);
    if (s.empName) byName.set(s.empName.trim().toLowerCase(), s.username);
    if (s.role && s.status === "active") byRole.set(s.role, [...(byRole.get(s.role) ?? []), s.username]);
  }
  return (value: string) => {
    const key = String(value ?? "").trim();
    if (!key) return null;
    return byUsername.get(key.toLowerCase())
      ?? byName.get(key.toLowerCase())
      ?? (byRole.get(key)?.length === 1 ? byRole.get(key)![0] : null);
  };
}

export function legacyTimestamp(message: LegacyMessage): string {
  if (message.createdAt && !Number.isNaN(Date.parse(message.createdAt))) return new Date(message.createdAt).toISOString();
  const id = Number(message.id);
  if (Number.isFinite(id) && id > 1e12 && id < 1e13) return new Date(id).toISOString();
  return new Date().toISOString();
}

// ─── Store ───────────────────────────────────────────────────────────────────

const MESSAGE_SELECT = `
  SELECT x.id, x.conversation_id, x.sender_username, x.kind, x.body, x.media, x.reply_to_id, x.forwarded,
    x.created_at, x.edited_at, x.deleted_at, x.pinned_at, x.pinned_by,
    COALESCE(u.emp_name, x.sender_username, '') AS sender_name,
    (SELECT COUNT(*)::int FROM chat_members mm WHERE mm.conversation_id = x.conversation_id AND mm.left_at IS NULL
       AND mm.username IS DISTINCT FROM x.sender_username AND mm.last_read_message_id >= x.id) AS seen_count,
    (SELECT COUNT(*)::int FROM chat_members mm WHERE mm.conversation_id = x.conversation_id AND mm.left_at IS NULL
       AND mm.username IS DISTINCT FROM x.sender_username) AS recipient_count
  FROM chat_messages x
  LEFT JOIN staff_users u ON u.username = x.sender_username`;

const NOT_HIDDEN = `NOT EXISTS (SELECT 1 FROM chat_message_hidden h WHERE h.message_id = x.id AND h.username = $USER)`;

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export class ChatStore {
  private ready: Promise<void> | null = null;
  private pool: ChatPool | null;

  constructor(pool?: ChatPool) {
    this.pool = pool ?? null;
  }

  private async db(): Promise<ChatPool> {
    if (!this.pool) {
      const { pool } = await import("@workspace/db");
      this.pool = pool as unknown as ChatPool;
    }
    return this.pool;
  }

  async ensure(): Promise<ChatPool> {
    const pool = await this.db();
    if (!this.ready) {
      this.ready = (async () => {
        await pool.query(CHAT_TABLES_SQL);
        try {
          await this.importLegacy();
        } catch {
          // The old chat store is optional; a failed import is retried on the next save.
        }
      })().catch(error => {
        this.ready = null;
        throw error;
      });
    }
    await this.ready;
    return pool;
  }

  private async tx<T>(fn: (q: ChatQueryable) => Promise<T>): Promise<T> {
    const pool = await this.ensure();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  // ── Lookups ──

  private async member(q: ChatQueryable, conversationId: number, username: string) {
    const { rows } = await q.query(
      `SELECT c.id, c.kind, c.name, c.created_by, m.role, m.last_read_message_id, m.archived
       FROM chat_conversations c
       JOIN chat_members m ON m.conversation_id = c.id AND m.username = $2 AND m.left_at IS NULL
       WHERE c.id = $1`,
      [conversationId, username],
    );
    if (!rows[0]) throw new ChatError(404, "Chat not found.");
    return rows[0] as { id: number; kind: string; name: string | null; created_by: string; role: MemberRole };
  }

  private async messageForMember(q: ChatQueryable, messageId: number, username: string) {
    const { rows } = await q.query(
      `SELECT x.*, m.role AS member_role, c.kind AS conversation_kind
       FROM chat_messages x
       JOIN chat_conversations c ON c.id = x.conversation_id
       JOIN chat_members m ON m.conversation_id = x.conversation_id AND m.username = $2 AND m.left_at IS NULL
       WHERE x.id = $1`,
      [messageId, username],
    );
    if (!rows[0]) throw new ChatError(404, "Message not found.");
    return rows[0];
  }

  private async activeStaff(q: ChatQueryable, usernames: string[]): Promise<Map<string, number>> {
    if (usernames.length === 0) return new Map();
    const { rows } = await q.query(
      `SELECT id, username FROM staff_users WHERE status = 'active' AND username = ANY($1::text[])`,
      [usernames],
    );
    return new Map(rows.map(r => [r.username as string, r.id as number]));
  }

  async memberUsernames(conversationId: number): Promise<string[]> {
    const pool = await this.ensure();
    const { rows } = await pool.query(
      `SELECT username FROM chat_members WHERE conversation_id = $1 AND left_at IS NULL`,
      [conversationId],
    );
    return rows.map(r => r.username);
  }

  private async hydrate(q: ChatQueryable, rows: any[]): Promise<ChatMessageDTO[]> {
    if (rows.length === 0) return [];
    const ids = rows.map(r => r.id);
    const replyIds = [...new Set(rows.map(r => r.reply_to_id).filter(Boolean))];
    const [reactions, replies] = await Promise.all([
      q.query(`SELECT message_id, emoji, username FROM chat_reactions WHERE message_id = ANY($1::int[]) ORDER BY created_at`, [ids]),
      replyIds.length
        ? q.query(
            `SELECT x.id, x.sender_username, x.kind, x.body, x.media, x.deleted_at, COALESCE(u.emp_name, x.sender_username, '') AS sender_name
             FROM chat_messages x LEFT JOIN staff_users u ON u.username = x.sender_username WHERE x.id = ANY($1::int[])`,
            [replyIds],
          )
        : Promise.resolve({ rows: [] as any[] }),
    ]);
    const reactionMap = new Map<number, Map<string, string[]>>();
    for (const r of reactions.rows) {
      const byEmoji = reactionMap.get(r.message_id) ?? new Map<string, string[]>();
      byEmoji.set(r.emoji, [...(byEmoji.get(r.emoji) ?? []), r.username]);
      reactionMap.set(r.message_id, byEmoji);
    }
    const replyMap = new Map<number, ChatReplyDTO>(replies.rows.map(r => [r.id, {
      id: r.id,
      sender: r.sender_username,
      senderName: r.sender_name,
      kind: r.kind,
      body: r.deleted_at ? "" : r.body,
      media: r.deleted_at ? null : r.media,
      deleted: !!r.deleted_at,
    }]));
    return rows.map(r => ({
      id: r.id,
      conversationId: r.conversation_id,
      sender: r.sender_username,
      senderName: r.sender_name,
      kind: r.kind,
      body: r.deleted_at ? "" : r.body,
      media: r.deleted_at ? null : r.media,
      replyTo: r.reply_to_id ? replyMap.get(r.reply_to_id) ?? null : null,
      forwarded: !!r.forwarded,
      createdAt: iso(r.created_at)!,
      editedAt: iso(r.edited_at),
      deleted: !!r.deleted_at,
      pinnedAt: iso(r.pinned_at),
      pinnedBy: r.pinned_by ?? null,
      reactions: [...(reactionMap.get(r.id) ?? new Map()).entries()].map(([emoji, usernames]) => ({ emoji, usernames })),
      seenCount: r.seen_count ?? 0,
      recipientCount: r.recipient_count ?? 0,
    }));
  }

  private async messagesById(q: ChatQueryable, ids: number[]): Promise<ChatMessageDTO[]> {
    if (ids.length === 0) return [];
    const { rows } = await q.query(`${MESSAGE_SELECT} WHERE x.id = ANY($1::int[]) ORDER BY x.id`, [ids]);
    return this.hydrate(q, rows);
  }

  private async conversations(q: ChatQueryable, username: string, onlyId?: number): Promise<ChatConversationDTO[]> {
    const { rows } = await q.query(
      `SELECT c.id, c.kind, c.name, c.created_by, c.created_at, c.updated_at,
         m.role AS my_role, m.archived, m.last_read_message_id,
         (SELECT COUNT(*)::int FROM chat_messages x WHERE x.conversation_id = c.id AND x.id > m.last_read_message_id
            AND x.sender_username IS NOT NULL AND x.sender_username <> $1 AND x.deleted_at IS NULL
            AND ${NOT_HIDDEN.replace("$USER", "$1")}) AS unread,
         (SELECT x.id FROM chat_messages x WHERE x.conversation_id = c.id AND ${NOT_HIDDEN.replace("$USER", "$1")}
            ORDER BY x.id DESC LIMIT 1) AS last_message_id
       FROM chat_conversations c
       JOIN chat_members m ON m.conversation_id = c.id AND m.username = $1 AND m.left_at IS NULL
       WHERE ($2::int IS NULL OR c.id = $2)
       ORDER BY c.updated_at DESC, c.id DESC`,
      [username, onlyId ?? null],
    );
    if (rows.length === 0) return [];
    const ids = rows.map(r => r.id);
    const [members, lastMessages] = await Promise.all([
      q.query(
        `SELECT m.conversation_id, m.username, m.role, m.joined_at, COALESCE(u.emp_name, m.username) AS emp_name, u.role AS app_role
         FROM chat_members m LEFT JOIN staff_users u ON u.username = m.username
         WHERE m.conversation_id = ANY($1::int[]) AND m.left_at IS NULL
         ORDER BY m.role, emp_name`,
        [ids],
      ),
      this.messagesById(q, rows.map(r => r.last_message_id).filter(Boolean)),
    ]);
    const membersBy = new Map<number, ChatMemberDTO[]>();
    for (const m of members.rows) {
      membersBy.set(m.conversation_id, [...(membersBy.get(m.conversation_id) ?? []), {
        username: m.username, empName: m.emp_name, appRole: m.app_role ?? null, role: m.role, joinedAt: iso(m.joined_at)!,
      }]);
    }
    const lastBy = new Map(lastMessages.map(m => [m.conversationId, m]));
    return rows.map(r => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      createdBy: r.created_by,
      createdAt: iso(r.created_at)!,
      updatedAt: iso(r.updated_at)!,
      myRole: r.my_role,
      archived: !!r.archived,
      unread: r.unread ?? 0,
      lastReadMessageId: r.last_read_message_id ?? 0,
      members: membersBy.get(r.id) ?? [],
      lastMessage: lastBy.get(r.id) ?? null,
    }));
  }

  // ── Conversations ──

  async listConversations(username: string): Promise<ChatConversationDTO[]> {
    const pool = await this.ensure();
    const all = await this.conversations(pool, username);
    // Direct chats appear once they have a message; groups always show.
    return all.filter(c => c.kind === "group" || c.lastMessage);
  }

  async getConversation(username: string, conversationId: number): Promise<ChatConversationDTO> {
    const pool = await this.ensure();
    const [conversation] = await this.conversations(pool, username, conversationId);
    if (!conversation) throw new ChatError(404, "Chat not found.");
    return conversation;
  }

  async unreadTotal(username: string): Promise<number> {
    const pool = await this.ensure();
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM chat_messages x
       JOIN chat_members m ON m.conversation_id = x.conversation_id AND m.username = $1 AND m.left_at IS NULL
       WHERE x.id > m.last_read_message_id AND x.sender_username IS NOT NULL AND x.sender_username <> $1
         AND x.deleted_at IS NULL AND ${NOT_HIDDEN.replace("$USER", "$1")}`,
      [username],
    );
    return rows[0]?.total ?? 0;
  }

  async openDirect(username: string, peer: string): Promise<ChatConversationDTO> {
    if (!peer || peer === username) throw new ChatError(400, "Choose another staff member to chat with.");
    const id = await this.tx(async q => {
      const staff = await this.activeStaff(q, [username, peer]);
      if (!staff.has(peer)) throw new ChatError(404, "That staff member is not active.");
      const key = directKey(username, peer);
      const created = await q.query(
        `INSERT INTO chat_conversations (kind, direct_key, created_by) VALUES ('direct', $1, $2)
         ON CONFLICT (direct_key) DO UPDATE SET direct_key = EXCLUDED.direct_key RETURNING id`,
        [key, username],
      );
      const conversationId = created.rows[0].id as number;
      for (const name of [username, peer]) {
        await q.query(
          `INSERT INTO chat_members (conversation_id, username, user_id) VALUES ($1, $2, $3)
           ON CONFLICT (conversation_id, username) DO UPDATE SET left_at = NULL`,
          [conversationId, name, staff.get(name) ?? null],
        );
      }
      return conversationId;
    });
    return this.getConversation(username, id);
  }

  async createGroup(username: string, rawName: unknown, rawMembers: unknown): Promise<ChatConversationDTO> {
    const name = cleanGroupName(rawName);
    if (!name) throw new ChatError(400, "Enter a group name.");
    const requested = cleanUsernames(rawMembers).filter(u => u !== username);
    if (requested.length === 0) throw new ChatError(400, "Add at least one member to the group.");
    if (requested.length + 1 > MAX_GROUP_MEMBERS) throw new ChatError(400, `A group can have at most ${MAX_GROUP_MEMBERS} members.`);
    const id = await this.tx(async q => {
      const staff = await this.activeStaff(q, [username, ...requested]);
      const members = requested.filter(u => staff.has(u));
      if (members.length === 0) throw new ChatError(400, "None of the selected staff members are active.");
      const created = await q.query(
        `INSERT INTO chat_conversations (kind, name, created_by) VALUES ('group', $1, $2) RETURNING id`,
        [name, username],
      );
      const conversationId = created.rows[0].id as number;
      await q.query(
        `INSERT INTO chat_members (conversation_id, username, user_id, role) VALUES ($1, $2, $3, 'admin')`,
        [conversationId, username, staff.get(username) ?? null],
      );
      for (const member of members) {
        await q.query(
          `INSERT INTO chat_members (conversation_id, username, user_id) VALUES ($1, $2, $3)`,
          [conversationId, member, staff.get(member) ?? null],
        );
      }
      await this.systemMessage(q, conversationId, `${await this.displayName(q, username)} created the group "${name}"`);
      return conversationId;
    });
    return this.getConversation(username, id);
  }

  private async displayName(q: ChatQueryable, username: string): Promise<string> {
    const { rows } = await q.query(`SELECT emp_name FROM staff_users WHERE username = $1`, [username]);
    return rows[0]?.emp_name ?? username;
  }

  private async systemMessage(q: ChatQueryable, conversationId: number, body: string) {
    await q.query(
      `INSERT INTO chat_messages (conversation_id, kind, body) VALUES ($1, 'system', $2)`,
      [conversationId, body.slice(0, MAX_CHAT_BODY)],
    );
    await q.query(`UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
  }

  async renameGroup(username: string, conversationId: number, rawName: unknown): Promise<ChatConversationDTO> {
    const name = cleanGroupName(rawName);
    if (!name) throw new ChatError(400, "Enter a group name.");
    await this.tx(async q => {
      const conversation = await this.member(q, conversationId, username);
      assertGroupAdmin(conversation, conversation);
      if (conversation.name === name) return;
      await q.query(`UPDATE chat_conversations SET name = $2 WHERE id = $1`, [conversationId, name]);
      await this.systemMessage(q, conversationId, `${await this.displayName(q, username)} renamed the group to "${name}"`);
    });
    return this.getConversation(username, conversationId);
  }

  async addMembers(username: string, conversationId: number, rawMembers: unknown): Promise<ChatConversationDTO> {
    const requested = cleanUsernames(rawMembers);
    if (requested.length === 0) throw new ChatError(400, "Choose staff members to add.");
    await this.tx(async q => {
      const conversation = await this.member(q, conversationId, username);
      assertGroupAdmin(conversation, conversation);
      const staff = await this.activeStaff(q, requested);
      const current = await q.query(
        `SELECT COUNT(*)::int AS n FROM chat_members WHERE conversation_id = $1 AND left_at IS NULL`, [conversationId],
      );
      const toAdd = requested.filter(u => staff.has(u));
      if (toAdd.length === 0) throw new ChatError(400, "None of the selected staff members are active.");
      if (current.rows[0].n + toAdd.length > MAX_GROUP_MEMBERS) {
        throw new ChatError(400, `A group can have at most ${MAX_GROUP_MEMBERS} members.`);
      }
      const added: string[] = [];
      for (const member of toAdd) {
        const result = await q.query(
          `INSERT INTO chat_members (conversation_id, username, user_id) VALUES ($1, $2, $3)
           ON CONFLICT (conversation_id, username) DO UPDATE
             SET left_at = NULL, role = 'member', joined_at = NOW(), archived = FALSE
             WHERE chat_members.left_at IS NOT NULL
           RETURNING username`,
          [conversationId, member, staff.get(member) ?? null],
        );
        if (result.rows[0]) added.push(await this.displayName(q, member));
      }
      if (added.length) {
        await this.systemMessage(q, conversationId, `${await this.displayName(q, username)} added ${added.join(", ")}`);
      }
    });
    return this.getConversation(username, conversationId);
  }

  /** Removes a member (admins only) or lets a member leave (target = self). */
  async removeMember(username: string, conversationId: number, target: string): Promise<{ left: boolean }> {
    await this.tx(async q => {
      const conversation = await this.member(q, conversationId, username);
      if (conversation.kind !== "group") throw new ChatError(400, "You can only leave or remove members from group chats.");
      const self = target === username;
      if (!self) assertGroupAdmin(conversation, conversation);
      const result = await q.query(
        `UPDATE chat_members SET left_at = NOW(), role = 'member' WHERE conversation_id = $1 AND username = $2 AND left_at IS NULL RETURNING username`,
        [conversationId, target],
      );
      if (!result.rows[0]) throw new ChatError(404, "That person is not in this group.");
      const actor = await this.displayName(q, username);
      await this.systemMessage(q, conversationId, self ? `${actor} left the group` : `${actor} removed ${await this.displayName(q, target)}`);
      // A group always keeps at least one admin.
      await q.query(
        `UPDATE chat_members SET role = 'admin'
         WHERE conversation_id = $1 AND left_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM chat_members a WHERE a.conversation_id = $1 AND a.left_at IS NULL AND a.role = 'admin')
           AND username = (SELECT username FROM chat_members WHERE conversation_id = $1 AND left_at IS NULL ORDER BY joined_at, username LIMIT 1)`,
        [conversationId],
      );
    });
    return { left: target === username };
  }

  async setMemberRole(username: string, conversationId: number, target: string, role: unknown): Promise<ChatConversationDTO> {
    if (role !== "admin" && role !== "member") throw new ChatError(400, "Role must be admin or member.");
    await this.tx(async q => {
      const conversation = await this.member(q, conversationId, username);
      assertGroupAdmin(conversation, conversation);
      if (role === "member") {
        const admins = await q.query(
          `SELECT COUNT(*)::int AS n FROM chat_members WHERE conversation_id = $1 AND left_at IS NULL AND role = 'admin'`,
          [conversationId],
        );
        if (admins.rows[0].n <= 1 && target === username) throw new ChatError(400, "Make someone else an admin first.");
      }
      const result = await q.query(
        `UPDATE chat_members SET role = $3 WHERE conversation_id = $1 AND username = $2 AND left_at IS NULL AND role <> $3 RETURNING username`,
        [conversationId, target, role],
      );
      if (result.rows[0]) {
        const actor = await this.displayName(q, username);
        const name = await this.displayName(q, target);
        await this.systemMessage(q, conversationId, role === "admin"
          ? `${actor} made ${name} a group admin`
          : `${actor} removed ${name} as group admin`);
      }
    });
    return this.getConversation(username, conversationId);
  }

  async setArchived(username: string, conversationId: number, archived: boolean): Promise<void> {
    const pool = await this.ensure();
    await this.member(pool, conversationId, username);
    await pool.query(
      `UPDATE chat_members SET archived = $3 WHERE conversation_id = $1 AND username = $2`,
      [conversationId, username, archived],
    );
  }

  async markRead(username: string, conversationId: number, upTo?: number | null): Promise<number> {
    return this.tx(async q => {
      await this.member(q, conversationId, username);
      const { rows } = await q.query(
        `SELECT COALESCE(MAX(id), 0) AS max FROM chat_messages WHERE conversation_id = $1 AND ($2::int IS NULL OR id <= $2)`,
        [conversationId, upTo ?? null],
      );
      const target = Number(rows[0].max);
      await q.query(
        `INSERT INTO chat_message_reads (message_id, username)
         SELECT x.id, $2 FROM chat_messages x
         JOIN chat_members m ON m.conversation_id = x.conversation_id AND m.username = $2
         WHERE x.conversation_id = $1 AND x.id > m.last_read_message_id AND x.id <= $3
           AND x.sender_username IS NOT NULL AND x.sender_username <> $2
         ON CONFLICT DO NOTHING`,
        [conversationId, username, target],
      );
      await q.query(
        `UPDATE chat_members SET last_read_message_id = GREATEST(last_read_message_id, $3)
         WHERE conversation_id = $1 AND username = $2`,
        [conversationId, username, target],
      );
      return target;
    });
  }

  // ── Messages ──

  async listMessages(username: string, conversationId: number, opts: { before?: number | null; limit?: number; q?: string }) {
    const pool = await this.ensure();
    await this.member(pool, conversationId, username);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const search = typeof opts.q === "string" ? opts.q.trim().slice(0, 100) : "";
    const params: unknown[] = [conversationId, username, opts.before ?? null, limit + 1];
    let filter = "";
    if (search) {
      params.push(`%${search.replace(/[\\%_]/g, c => `\\${c}`)}%`);
      filter = `AND x.deleted_at IS NULL AND x.kind <> 'system' AND (x.body ILIKE $5 OR x.media->>'name' ILIKE $5)`;
    }
    const { rows } = await pool.query(
      `${MESSAGE_SELECT}
       WHERE x.conversation_id = $1 AND ${NOT_HIDDEN.replace("$USER", "$2")}
         AND ($3::int IS NULL OR x.id < $3) ${filter}
       ORDER BY x.id DESC LIMIT $4`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();
    return { messages: await this.hydrate(pool, page), hasMore };
  }

  async pinnedMessages(username: string, conversationId: number): Promise<ChatMessageDTO[]> {
    const pool = await this.ensure();
    await this.member(pool, conversationId, username);
    const { rows } = await pool.query(
      `${MESSAGE_SELECT}
       WHERE x.conversation_id = $1 AND x.pinned_at IS NOT NULL AND x.deleted_at IS NULL
         AND ${NOT_HIDDEN.replace("$USER", "$2")}
       ORDER BY x.pinned_at DESC`,
      [conversationId, username],
    );
    return this.hydrate(pool, rows);
  }

  async sendMessage(username: string, conversationId: number, input: { body?: unknown; media?: unknown; replyToId?: unknown }) {
    const body = cleanBody(input.body);
    const media = cleanMedia(input.media);
    if (!body && !media) throw new ChatError(400, "Type a message or attach a file.");
    const replyToId = parsePositiveInt(input.replyToId);
    const id = await this.tx(async q => {
      await this.member(q, conversationId, username);
      return this.insertMessage(q, conversationId, username, { body, media, replyToId, forwarded: false });
    });
    const [message] = await this.messagesById(await this.ensure(), [id]);
    return message;
  }

  private async insertMessage(
    q: ChatQueryable,
    conversationId: number,
    username: string,
    input: { body: string; media: ChatMedia | null; replyToId: number | null; forwarded: boolean },
  ): Promise<number> {
    let replyToId = input.replyToId;
    if (replyToId) {
      const reply = await q.query(`SELECT id FROM chat_messages WHERE id = $1 AND conversation_id = $2`, [replyToId, conversationId]);
      if (!reply.rows[0]) replyToId = null;
    }
    const { rows } = await q.query(
      `INSERT INTO chat_messages (conversation_id, sender_username, sender_user_id, kind, body, media, file_object_path, reply_to_id, forwarded)
       VALUES ($1, $2, (SELECT id FROM staff_users WHERE username = $2), $3, $4, $5::jsonb,
         (SELECT object_path FROM stored_files WHERE object_path = $6), $7, $8)
       RETURNING id`,
      [conversationId, username, input.media ? "media" : "text", input.body,
        input.media ? JSON.stringify(input.media) : null, input.media?.objectPath ?? null, replyToId, input.forwarded],
    );
    const id = rows[0].id as number;
    // The sender has read their own message; a new message brings archived chats back to everyone's inbox.
    await q.query(
      `UPDATE chat_members
         SET last_read_message_id = CASE WHEN username = $2 THEN GREATEST(last_read_message_id, $3) ELSE last_read_message_id END,
             archived = FALSE
       WHERE conversation_id = $1 AND left_at IS NULL`,
      [conversationId, username, id],
    );
    await q.query(`UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
    return id;
  }

  async forwardMessage(username: string, messageId: number, rawConversationIds: unknown) {
    const targets = Array.isArray(rawConversationIds)
      ? [...new Set(rawConversationIds.map(parsePositiveInt).filter((v): v is number => v !== null))]
      : [];
    if (targets.length === 0) throw new ChatError(400, "Choose at least one chat to forward to.");
    if (targets.length > 20) throw new ChatError(400, "You can forward to at most 20 chats at once.");
    return this.tx(async q => {
      const source = await this.messageForMember(q, messageId, username);
      if (source.deleted_at || source.kind === "system") throw new ChatError(400, "This message cannot be forwarded.");
      const forwardedTo: number[] = [];
      for (const conversationId of targets) {
        await this.member(q, conversationId, username);
        await this.insertMessage(q, conversationId, username, {
          body: source.body, media: source.media ?? null, replyToId: null, forwarded: true,
        });
        forwardedTo.push(conversationId);
      }
      return forwardedTo;
    });
  }

  async editMessage(username: string, messageId: number, rawBody: unknown) {
    const body = cleanBody(rawBody);
    const conversationId = await this.tx(async q => {
      const message = await this.messageForMember(q, messageId, username);
      assertCanEdit(message, username);
      if (!body && message.kind !== "media") throw new ChatError(400, "A message cannot be empty.");
      if (body !== message.body) {
        await q.query(`UPDATE chat_messages SET body = $2, edited_at = NOW() WHERE id = $1`, [messageId, body]);
      }
      return message.conversation_id as number;
    });
    const [message] = await this.messagesById(await this.ensure(), [messageId]);
    return { conversationId, message };
  }

  async deleteMessage(username: string, messageId: number, scope: unknown) {
    if (scope !== "me" && scope !== "everyone") throw new ChatError(400, "Choose delete for me or for everyone.");
    return this.tx(async q => {
      const message = await this.messageForMember(q, messageId, username);
      if (scope === "me") {
        await q.query(
          `INSERT INTO chat_message_hidden (message_id, username) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [messageId, username],
        );
        return { conversationId: message.conversation_id as number, scope };
      }
      assertCanDeleteForEveryone(message, username);
      const objectPath = message.media?.objectPath as string | undefined;
      await q.query(
        `UPDATE chat_messages SET deleted_at = NOW(), body = '', media = NULL, file_object_path = NULL,
           pinned_at = NULL, pinned_by = NULL WHERE id = $1`,
        [messageId],
      );
      await q.query(`DELETE FROM chat_reactions WHERE message_id = $1`, [messageId]);
      if (objectPath) {
        // The attachment is removed from the database unless it was forwarded elsewhere.
        await q.query(
          `DELETE FROM stored_files f WHERE f.object_path = $1 AND f.category = 'chat_media'
             AND NOT EXISTS (SELECT 1 FROM chat_messages x WHERE x.media->>'objectPath' = $1 AND x.deleted_at IS NULL)`,
          [objectPath],
        );
      }
      return { conversationId: message.conversation_id as number, scope };
    });
  }

  async toggleReaction(username: string, messageId: number, rawEmoji: unknown) {
    const emoji = typeof rawEmoji === "string" ? rawEmoji.trim() : "";
    if (!(CHAT_REACTIONS as readonly string[]).includes(emoji)) throw new ChatError(400, "Choose a reaction.");
    const conversationId = await this.tx(async q => {
      const message = await this.messageForMember(q, messageId, username);
      if (message.deleted_at || message.kind === "system") throw new ChatError(400, "You cannot react to this message.");
      const removed = await q.query(
        `DELETE FROM chat_reactions WHERE message_id = $1 AND username = $2 AND emoji = $3 RETURNING emoji`,
        [messageId, username, emoji],
      );
      if (!removed.rows[0]) {
        await q.query(
          `INSERT INTO chat_reactions (message_id, username, emoji) VALUES ($1, $2, $3)
           ON CONFLICT (message_id, username) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = NOW()`,
          [messageId, username, emoji],
        );
      }
      return message.conversation_id as number;
    });
    const [message] = await this.messagesById(await this.ensure(), [messageId]);
    return { conversationId, message };
  }

  async setPinned(username: string, messageId: number, pinned: boolean) {
    const conversationId = await this.tx(async q => {
      const message = await this.messageForMember(q, messageId, username);
      if (message.deleted_at || message.kind === "system") throw new ChatError(400, "This message cannot be pinned.");
      await q.query(
        `UPDATE chat_messages SET pinned_at = CASE WHEN $2 THEN NOW() ELSE NULL END, pinned_by = CASE WHEN $2 THEN $3 ELSE NULL END WHERE id = $1`,
        [messageId, pinned, username],
      );
      return message.conversation_id as number;
    });
    const [message] = await this.messagesById(await this.ensure(), [messageId]);
    return { conversationId, message };
  }

  /** "Message info": who has seen a message and when. */
  async messageInfo(username: string, messageId: number) {
    const pool = await this.ensure();
    const message = await this.messageForMember(pool, messageId, username);
    const { rows } = await pool.query(
      `SELECT m.username, COALESCE(u.emp_name, m.username) AS emp_name, r.read_at,
         (m.last_read_message_id >= $2) AS seen
       FROM chat_members m
       LEFT JOIN staff_users u ON u.username = m.username
       LEFT JOIN chat_message_reads r ON r.message_id = $2 AND r.username = m.username
       WHERE m.conversation_id = $1 AND m.left_at IS NULL AND m.username IS DISTINCT FROM $3
       ORDER BY emp_name`,
      [message.conversation_id, messageId, message.sender_username],
    );
    const [dto] = await this.messagesById(pool, [messageId]);
    return {
      message: dto,
      seenBy: rows.filter(r => r.seen).map(r => ({ username: r.username, empName: r.emp_name, readAt: iso(r.read_at) })),
      notSeenBy: rows.filter(r => !r.seen).map(r => ({ username: r.username, empName: r.emp_name })),
    };
  }

  // ── Legacy import from app_state.messages ──

  async importLegacy(): Promise<number> {
    const pool = await this.db();
    const client = await pool.connect();
    let imported = 0;
    try {
      await client.query("BEGIN");
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('petrotrack:chat-import'))`);
      const state = await client.query(`SELECT data FROM app_state WHERE key = 'messages'`);
      const data = state.rows[0]?.data;
      if (!data || typeof data !== "object") {
        await client.query("COMMIT");
        return 0;
      }
      const staff = await client.query(`SELECT id, username, emp_name, role, status FROM staff_users WHERE username IS NOT NULL`);
      const resolve = buildIdentityResolver(staff.rows.map(r => ({
        username: r.username, empName: r.emp_name, role: r.role, status: r.status,
      })));
      const userIds = new Map<string, number>(staff.rows.map(r => [r.username, r.id]));
      const conversationIds = new Map<string, number>();
      const list: LegacyMessage[] = Object.values(data as Record<string, unknown>)
        .flatMap(value => (Array.isArray(value) ? value : []))
        .filter((m): m is LegacyMessage => !!m && typeof m === "object" && "from" in m && "to" in m);
      list.sort((a, b) => Date.parse(legacyTimestamp(a)) - Date.parse(legacyTimestamp(b)));

      for (const m of list) {
        if (m.type === "call") continue;
        const from = resolve(m.from);
        const to = resolve(m.to);
        if (!from || !to || from === to) continue;
        const key = directKey(from, to);
        let conversationId = conversationIds.get(key);
        if (!conversationId) {
          const created = await client.query(
            `INSERT INTO chat_conversations (kind, direct_key, created_by) VALUES ('direct', $1, $2)
             ON CONFLICT (direct_key) DO UPDATE SET direct_key = EXCLUDED.direct_key RETURNING id`,
            [key, from],
          );
          conversationId = created.rows[0].id as number;
          conversationIds.set(key, conversationId);
          for (const name of [from, to]) {
            await client.query(
              `INSERT INTO chat_members (conversation_id, username, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
              [conversationId, name, userIds.get(name) ?? null],
            );
          }
        }
        const legacyId = `legacy:${m.from}:${m.to}:${m.id}`;
        const media = cleanMedia(m.media);
        const body = cleanBody(m.body);
        if (!body && !media) continue;
        const createdAt = legacyTimestamp(m);
        const inserted = await client.query(
          `INSERT INTO chat_messages (conversation_id, sender_username, sender_user_id, kind, body, media, file_object_path, created_at, legacy_id)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, (SELECT object_path FROM stored_files WHERE object_path = $7), $8, $9)
           ON CONFLICT (legacy_id) DO NOTHING RETURNING id`,
          [conversationId, from, userIds.get(from) ?? null, media ? "media" : "text", body,
            media ? JSON.stringify(media) : null, media?.objectPath ?? null, createdAt, legacyId],
        );
        const id = inserted.rows[0]?.id as number | undefined;
        if (!id) continue;
        imported += 1;
        const readers = m.read ? [from, to] : [from];
        await client.query(
          `UPDATE chat_members SET last_read_message_id = GREATEST(last_read_message_id, $3)
           WHERE conversation_id = $1 AND username = ANY($2::text[])`,
          [conversationId, readers, id],
        );
        if (m.read) {
          await client.query(
            `INSERT INTO chat_message_reads (message_id, username, read_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [id, to, createdAt],
          );
        }
        for (const [who, entry] of Object.entries(m.archiveState ?? {})) {
          const username = resolve(who);
          if (username && entry && typeof entry.archived === "boolean") {
            await client.query(
              `UPDATE chat_members SET archived = $3 WHERE conversation_id = $1 AND username = $2`,
              [conversationId, username, entry.archived],
            );
          }
        }
        await client.query(
          `UPDATE chat_conversations SET updated_at = GREATEST(updated_at, $2::timestamptz) WHERE id = $1`,
          [conversationId, createdAt],
        );
      }
      await client.query("COMMIT");
      return imported;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export const chatStore = new ChatStore();
