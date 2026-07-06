import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const appStateTable = pgTable("app_state", {
  key:       text("key").primaryKey(),
  data:      jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AppStateRow = typeof appStateTable.$inferSelect;
