import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const pumpReportsTable = pgTable("pump_reports", {
  id:        text("id").primaryKey(),
  status:    text("status").notNull(),
  branchId:  text("branch_id"),
  data:      jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PumpReportRow = typeof pumpReportsTable.$inferSelect;