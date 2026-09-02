import { createHash, randomBytes } from "crypto";
import { eq, sql } from "drizzle-orm";
import cron from "node-cron";

import { db, appStateTable, staffUsersTable } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { createBackup } from "./lib/backup";
import { dispatchMyFolderExpiryReminders } from "./routes/notifications";
import { attachRealtimeServer } from "./lib/realtime";

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
 * - If empty but app_state/userAccounts has data: migrate all those accounts.
 * - If both are empty: seed a default admin account.
 * - Always: ensure at least one active admin exists (seeds one if missing).
 */
async function seedAndMigrateUsers(): Promise<void> {
  try {
    // Check existing rows in staff_users
    const [{ count }] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(staffUsersTable);

    if (count > 0) {
      logger.info({ count }, "staff_users already populated — checking for admin");
      // Ensure at least one active admin exists
      const [{ adminCount }] = await db
        .select({ adminCount: sql<number>`cast(count(*) as int)` })
        .from(staffUsersTable)
        .where(sql`role = 'admin' AND status = 'active'`);

      if (adminCount === 0) {
        logger.info("No active admin found — seeding default admin account");
        await db
          .insert(staffUsersTable)
          .values({
            empName:    "Administrator",
            username:   "admin",
            password:   serverHash("Admin1234"),
            role:       "admin",
            status:     "active",
            createdBy:  "system",
            approvedBy: "system",
            approvedAt: new Date(),
          })
          .onConflictDoNothing();
        logger.info("Default admin seeded (username: admin, password: Admin1234)");
      }
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

// Start listening before database seeding/migration. The health endpoint does
// not depend on the database, so deployments can become ready immediately
// instead of returning 500 while seedAndMigrateUsers is still running.
const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  seedAndMigrateUsers()
    .then(() => {
      // Automatic app-state backup every 12 hours.
      // Runs at 00:00 and 12:00 UTC. Keeps the last 14 backups (7 days).
      cron.schedule("0 0,12 * * *", async () => {
        try {
          await createBackup();
        } catch (backupErr) {
          logger.error({ err: backupErr }, "Scheduled app-state backup failed");
        }
      });
      // My Folder document and certificate reminders are evaluated on startup
      // and daily, so the notification is not dependent on a staff member
      // opening the mobile app near the three-month threshold.
      void dispatchMyFolderExpiryReminders().catch(err => {
        logger.error({ err }, "My Folder expiry reminder dispatch failed");
      });
      cron.schedule("0 8 * * *", async () => {
        try {
          await dispatchMyFolderExpiryReminders();
        } catch (reminderErr) {
          logger.error({ err: reminderErr }, "Scheduled My Folder expiry reminder dispatch failed");
        }
      });
      logger.info("Scheduled app-state backups every 12 hours");
    })
    .catch((err) => {
      // seedAndMigrateUsers currently handles expected database errors itself,
      // but keep startup alive for health checks if an unexpected error escapes.
      logger.error({ err }, "Startup user seeding failed");
    });
});
attachRealtimeServer(server);
