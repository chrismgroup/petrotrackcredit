import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "SAFETY: db push is forbidden in production. " +
    "It can silently drop columns and tables. " +
    "To change the production schema, add a migration file and apply it manually."
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
