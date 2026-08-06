import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const staffUsersTable = pgTable("staff_users", {
  id:               serial("id").primaryKey(),
  empName:          text("emp_name").notNull(),
  empId:            text("emp_id"),
  username:         text("username").unique(),
  password:         text("password").notNull().default(""),
  role:             text("role"),
  branchId:         text("branch_id"),
  status:           text("status").notNull().default("pending"),
  jobTitle:         text("job_title"),
  dept:             text("dept"),
  phoneNumber:      text("phone_number"),
  nin:              text("nin"),
  staffAddress:     text("staff_address"),
  guarantorName:    text("guarantor_name"),
  guarantorPhone:   text("guarantor_phone"),
  guarantorAddress: text("guarantor_address"),
  employmentDocs:   jsonb("employment_docs").$type<string[]>().default([]),
  createdBy:        text("created_by").notNull(),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedBy:       text("approved_by"),
  approvedAt:       timestamp("approved_at", { withTimezone: true }),
  mdApprovedBy:     text("md_approved_by"),
  mdApprovedAt:     timestamp("md_approved_at", { withTimezone: true }),
  rejectionReason:  text("rejection_reason"),
  rejectedBy:       text("rejected_by"),
  rejectedAt:       timestamp("rejected_at", { withTimezone: true }),
});

export type StaffUserRow    = typeof staffUsersTable.$inferSelect;
export type StaffUserInsert = typeof staffUsersTable.$inferInsert;
