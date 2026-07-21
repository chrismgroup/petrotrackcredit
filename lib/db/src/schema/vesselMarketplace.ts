import { boolean, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const vesselUsersTable = pgTable("vessel_users", {
  id:        serial("id").primaryKey(),
  name:      text("name").notNull(),
  email:     text("email").notNull().unique(),
  password:  text("password").notNull(),
  role:      text("role").notNull().default("client"),
  company:   text("company"),
  phone:     text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vesselsTable = pgTable("vessels", {
  id:                    serial("id").primaryKey(),
  ownerId:               integer("owner_id").notNull().references(() => vesselUsersTable.id),
  name:                  text("name").notNull(),
  imoNumber:             text("imo_number"),
  vesselType:            text("vessel_type").notNull(),
  flag:                  text("flag"),
  dwt:                   numeric("dwt"),
  grt:                   numeric("grt"),
  yearBuilt:             integer("year_built"),
  loa:                   numeric("loa"),
  beam:                  numeric("beam"),
  draft:                 numeric("draft"),
  classificationSociety: text("classification_society"),
  tradingArea:           text("trading_area"),
  description:           text("description"),
  status:                text("status").notNull().default("available"),
  createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vesselContactsTable = pgTable("vessel_contacts", {
  id:          serial("id").primaryKey(),
  vesselId:    integer("vessel_id").notNull().references(() => vesselsTable.id, { onDelete: "cascade" }),
  contactName: text("contact_name").notNull(),
  phone:       text("phone"),
  email:       text("email"),
  address:     text("address"),
});

export const charterPartiesTable = pgTable("charter_parties", {
  id:                   serial("id").primaryKey(),
  vesselId:             integer("vessel_id").notNull().references(() => vesselsTable.id),
  chartererId:          integer("charterer_id").notNull().references(() => vesselUsersTable.id),
  ownerId:              integer("owner_id").notNull().references(() => vesselUsersTable.id),
  rate:                 numeric("rate"),
  rateCurrency:         text("rate_currency").default("USD"),
  rateBasis:            text("rate_basis"),
  laycanEarliest:       timestamp("laycan_earliest", { withTimezone: true }),
  laycanLatest:         timestamp("laycan_latest", { withTimezone: true }),
  durationDays:         integer("duration_days"),
  cargoPurpose:         text("cargo_purpose"),
  terms:                text("terms"),
  status:               text("status").notNull().default("enquiry"),
  ownerConfirmedAt:     timestamp("owner_confirmed_at", { withTimezone: true }),
  chartererConfirmedAt: timestamp("charterer_confirmed_at", { withTimezone: true }),
  hireStart:            timestamp("hire_start", { withTimezone: true }),
  hireEnd:              timestamp("hire_end", { withTimezone: true }),
  createdAt:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vesselNotificationsTable = pgTable("vessel_notifications", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().references(() => vesselUsersTable.id),
  type:      text("type").notNull(),
  title:     text("title").notNull(),
  message:   text("message").notNull(),
  relatedId: integer("related_id"),
  read:      boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vesselPhotosTable = pgTable("vessel_photos", {
  id:          serial("id").primaryKey(),
  vesselId:    integer("vessel_id").notNull().references(() => vesselsTable.id, { onDelete: "cascade" }),
  objectPath:  text("object_path").notNull(),
  sortOrder:   integer("sort_order").notNull().default(0),
  uploadedAt:  timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VesselUserRow    = typeof vesselUsersTable.$inferSelect;
export type VesselUserInsert = typeof vesselUsersTable.$inferInsert;
export type VesselRow        = typeof vesselsTable.$inferSelect;
export type VesselInsert     = typeof vesselsTable.$inferInsert;
export type VesselContactRow    = typeof vesselContactsTable.$inferSelect;
export type CharterPartyRow     = typeof charterPartiesTable.$inferSelect;
export type VesselNotificationRow = typeof vesselNotificationsTable.$inferSelect;
export type VesselPhotoRow    = typeof vesselPhotosTable.$inferSelect;
export type VesselPhotoInsert = typeof vesselPhotosTable.$inferInsert;
