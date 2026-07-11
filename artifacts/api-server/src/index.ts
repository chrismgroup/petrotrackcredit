import { createHash, randomBytes } from "crypto";
import { eq, sql } from "drizzle-orm";

import { db, appStateTable, staffUsersTable } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function serverHash(plaintext: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(salt + plaintext).digest("hex");
  return `sha256:${salt}:${hash}`;
}

interface LegacyAccount {
  id: number;
  username: string;
  password: string;
  role: string | null;
  status: string;
  empName: string;
  empId?: string;
  branchId?: string;
  jobTitle?: string;
  dept?: string;
  createdBy?: string;
  approvedBy?: string;
  approvedAt?: string;
}

/**
 * Ensures staff_users table is seeded.
 * - If it already has rows: no-op.
 * - If empty but app_state/userAccounts has data: migrate all those accounts.
 * - If both are empty: seed a default admin account.
 */
async function seedAndMigrateUsers(): Promise<void> {
  try {
    // Check existing rows in staff_users
    const [{ count }] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(staffUsersTable);

    if (count > 0) {
      logger.info({ count }, "staff_users already populated — skipping seed/migration");
      return;
    }

    // Try migrating from app_state/userAccounts
    const [row] = await db
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.key, "userAccounts"));

    const legacyAccounts: LegacyAccount[] = Array.isArray(row?.data) ? (row.data as LegacyAccount[]) : [];

    if (legacyAccounts.length > 0) {
      logger.info({ count: legacyAccounts.length }, "Migrating accounts from app_state → staff_users");

      for (const acc of legacyAccounts) {
        if (!acc.username) continue; // skip pending accounts without a username
        try {
          await db
            .insert(staffUsersTable)
            .values({
              empName:   acc.empName  ?? "Unknown",
              empId:     acc.empId   ?? null,
              username:  acc.username,
              password:  acc.password ?? "",
              role:      acc.role    ?? null,
              branchId:  acc.branchId ?? null,
              status:    acc.status  ?? "active",
              jobTitle:  acc.jobTitle ?? null,
              dept:      acc.dept    ?? null,
              createdBy: acc.createdBy  ?? "migration",
              approvedBy: acc.approvedBy ?? (acc.status === "active" ? "migration" : null),
              approvedAt: acc.approvedAt ? new Date(acc.approvedAt) : (acc.status === "active" ? new Date() : null),
            })
            .onConflictDoNothing();
        } catch (err) {
          logger.warn({ err, username: acc.username }, "Failed to migrate account");
        }
      }

      // Migrate pending (no username) accounts too
      const pending = legacyAccounts.filter(a => !a.username);
      for (const acc of pending) {
        try {
          await db
            .insert(staffUsersTable)
            .values({
              empName:   acc.empName ?? "Unknown",
              empId:     acc.empId  ?? null,
              username:  null,
              password:  "",
              role:      null,
              branchId:  acc.branchId ?? null,
              status:    "pending",
              jobTitle:  acc.jobTitle ?? null,
              dept:      acc.dept    ?? null,
              createdBy: acc.createdBy ?? "migration",
            })
            .onConflictDoNothing();
        } catch (err) {
          logger.warn({ err }, "Failed to migrate pending account");
        }
      }

      logger.info("Migration complete");
    } else {
      // No legacy data — seed the default admin
      await db
        .insert(staffUsersTable)
        .values({
          empName:   "Administrator",
          username:  "admin",
          password:  serverHash("admin"),
          role:      "admin",
          status:    "active",
          createdBy: "system",
          approvedBy: "system",
          approvedAt: new Date(),
        })
        .onConflictDoNothing();

      // Also seed the app_state blob for legacy compat (existing logic)
      const [existing] = await db
        .select()
        .from(appStateTable)
        .where(eq(appStateTable.key, "userAccounts"));

      if (!existing) {
        const defaultAdmin = [{
          id: 1, username: "admin", password: "admin",
          role: "admin", status: "active", empName: "Admin",
          staffId: null, branchId: null, approved: true,
        }];
        await db
          .insert(appStateTable)
          .values({ key: "userAccounts", data: defaultAdmin })
          .onConflictDoNothing();
      }

      logger.info("Seeded default admin account");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed/migrate users");
  }
}

seedAndMigrateUsers().then(() => {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
});
