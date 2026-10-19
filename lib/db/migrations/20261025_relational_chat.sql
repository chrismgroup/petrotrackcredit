-- Relational team chat: conversations, members, messages, reactions, read receipts and per-user hides.
-- The API also creates these tables on start-up and imports legacy app_state chats (idempotent via legacy_id).
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
