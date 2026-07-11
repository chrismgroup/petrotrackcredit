import app from "./app";
import { logger } from "./lib/logger";
import { db, appStateTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function seedAdminIfEmpty(): Promise<void> {
  try {
    const [row] = await db
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.key, "userAccounts"));

    const accounts = Array.isArray(row?.data) ? row.data : [];
    if (accounts.length > 0) return;

    const defaultAdmin = [
      {
        id: 1,
        username: "admin",
        password: "admin",
        role: "admin",
        status: "active",
        empName: "Admin",
        staffId: null,
        branchId: null,
        approved: true,
      },
    ];

    await db
      .insert(appStateTable)
      .values({ key: "userAccounts", data: defaultAdmin })
      .onConflictDoUpdate({
        target: appStateTable.key,
        set: { data: defaultAdmin },
      });

    logger.info("Seeded default admin account (password will be hashed on first login)");
  } catch (err) {
    logger.error({ err }, "Failed to seed admin account");
  }
}

seedAdminIfEmpty().then(() => {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
});
