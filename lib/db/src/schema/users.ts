import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const staffUsersTable = pgTable("staff_users", {
  id:          serial("id").primaryKey(),
  empName:     text("emp_name").notNull(),
  empId:       text("emp_id"),
  username:    text("username").unique(),
  password:    text("password").notNull().default(""),
  role:        text("role"),
  branchId:    text("branch_id"),
  status:      text("status").notNull().default("pending"),
  jobTitle:    text("job_title"),
  dept:        text("dept"),
  createdBy:   text("created_by").notNull(),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedBy:  text("approved_by"),
  approvedAt:  timestamp("approved_at", { withTimezone: true }),
});

export type StaffUserRow    = typeof staffUsersTable.$inferSelect;
export type StaffUserInsert = typeof staffUsersTable.$inferInsert;
