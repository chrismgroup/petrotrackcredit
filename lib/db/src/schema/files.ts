import { customType, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { staffUsersTable } from "./users";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** Every uploaded file in the app. File bytes live in stored_file_contents. */
export const storedFilesTable = pgTable("stored_files", {
  objectPath:       text("object_path").primaryKey(),
  name:             text("name").notNull(),
  contentType:      text("content_type").notNull(),
  size:             integer("size").notNull(),
  /** Where the file is used, e.g. my_folder, delivery_evidence, chat_media. */
  category:         text("category").notNull().default("general"),
  /** Id of the related app record (folder, delivery, employee, conversation…). */
  relatedId:        text("related_id"),
  branchId:         text("branch_id"),
  uploadedBy:       text("uploaded_by"),
  uploadedByUserId: integer("uploaded_by_user_id").references(() => staffUsersTable.id, { onDelete: "set null" }),
  sha256:           text("sha256"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("stored_files_category_idx").on(table.category, table.relatedId),
  index("stored_files_uploader_idx").on(table.uploadedByUserId),
  index("stored_files_branch_idx").on(table.branchId),
]);

/** File bytes, one row per stored file, removed automatically with the file. */
export const storedFileContentsTable = pgTable("stored_file_contents", {
  objectPath: text("object_path").primaryKey()
    .references(() => storedFilesTable.objectPath, { onDelete: "cascade" }),
  data:       bytea("data").notNull(),
});

/** Scheduled and manual snapshots of app state. */
export const appStateBackupsTable = pgTable("app_state_backups", {
  objectName: text("object_name").primaryKey(),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sizeBytes:  integer("size_bytes").notNull(),
  payload:    text("payload").notNull(),
});

export type StoredFileRow = typeof storedFilesTable.$inferSelect;
