import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";
import path from "path";

const envPath = path.resolve(__dirname, "../../../.env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
