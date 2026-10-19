import {
  boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { storedFilesTable } from "./files";
import { staffUsersTable } from "./users";

/** A direct (one-to-one) chat or a named group chat. */
export const chatConversationsTable = pgTable("chat_conversations", {
  id:        serial("id").primaryKey(),
  kind:      text("kind").notNull(),
  name:      text("name"),
  /** Sorted member usernames for direct chats, so each pair has one chat. */
  directKey: text("direct_key"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("chat_conversations_direct_key_idx").on(table.directKey),
]);

/** Who belongs to each chat. left_at is set when a member leaves or is removed. */
export const chatMembersTable = pgTable("chat_members", {
  conversationId:    integer("conversation_id").notNull()
    .references(() => chatConversationsTable.id, { onDelete: "cascade" }),
  username:          text("username").notNull(),
  userId:            integer("user_id").references(() => staffUsersTable.id, { onDelete: "set null" }),
  role:              text("role").notNull().default("member"),
  joinedAt:          timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  leftAt:            timestamp("left_at", { withTimezone: true }),
  lastReadMessageId: integer("last_read_message_id").notNull().default(0),
  archived:          boolean("archived").notNull().default(false),
}, (table) => [
  primaryKey({ columns: [table.conversationId, table.username] }),
  index("chat_members_username_idx").on(table.username),
]);

export const chatMessagesTable = pgTable("chat_messages", {
  id:              serial("id").primaryKey(),
  conversationId:  integer("conversation_id").notNull()
    .references(() => chatConversationsTable.id, { onDelete: "cascade" }),
  /** Null for system notes such as "Ada added Musa". */
  senderUsername:  text("sender_username"),
  senderUserId:    integer("sender_user_id").references(() => staffUsersTable.id, { onDelete: "set null" }),
  kind:            text("kind").notNull().default("text"),
  body:            text("body").notNull().default(""),
  fileObjectPath:  text("file_object_path").references(() => storedFilesTable.objectPath, { onDelete: "set null" }),
  media:           jsonb("media").$type<{ objectPath?: string; uri?: string; name: string; mimeType: string; size?: number }>(),
  replyToId:       integer("reply_to_id").references((): AnyPgColumn => chatMessagesTable.id, { onDelete: "set null" }),
  forwarded:       boolean("forwarded").notNull().default(false),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  editedAt:        timestamp("edited_at", { withTimezone: true }),
  /** Set when the sender deletes the message for everyone. */
  deletedAt:       timestamp("deleted_at", { withTimezone: true }),
  pinnedAt:        timestamp("pinned_at", { withTimezone: true }),
  pinnedBy:        text("pinned_by"),
  /** Source id for messages imported from the old app_state chat store. */
  legacyId:        text("legacy_id"),
}, (table) => [
  index("chat_messages_conversation_idx").on(table.conversationId, table.id),
  uniqueIndex("chat_messages_legacy_idx").on(table.legacyId),
]);

/** "Delete for me": hides a message from one member only. */
export const chatMessageHiddenTable = pgTable("chat_message_hidden", {
  messageId: integer("message_id").notNull().references(() => chatMessagesTable.id, { onDelete: "cascade" }),
  username:  text("username").notNull(),
  hiddenAt:  timestamp("hidden_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.messageId, table.username] })]);

/** One emoji reaction per member per message. */
export const chatReactionsTable = pgTable("chat_reactions", {
  messageId: integer("message_id").notNull().references(() => chatMessagesTable.id, { onDelete: "cascade" }),
  username:  text("username").notNull(),
  emoji:     text("emoji").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.messageId, table.username] })]);

/** Read receipts: when each member saw each message. */
export const chatMessageReadsTable = pgTable("chat_message_reads", {
  messageId: integer("message_id").notNull().references(() => chatMessagesTable.id, { onDelete: "cascade" }),
  username:  text("username").notNull(),
  readAt:    timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.messageId, table.username] })]);
