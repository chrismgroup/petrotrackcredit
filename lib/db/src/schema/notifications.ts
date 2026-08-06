import { boolean, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const notificationTokensTable = pgTable("notification_tokens", {
  id:        serial("id").primaryKey(),
  username:  text("username").notNull(),
  token:     text("token").notNull().unique(),
  platform:  text("platform").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationsTable = pgTable("notifications", {
  id:        serial("id").primaryKey(),
  username:  text("username").notNull(),
  type:      text("type").notNull(),
  title:     text("title").notNull(),
  body:      text("body").notNull(),
  data:      jsonb("data").$type<Record<string, unknown>>().default({}),
  read:      boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationTokenRow = typeof notificationTokensTable.$inferSelect;
export type NotificationRow = typeof notificationsTable.$inferSelect;