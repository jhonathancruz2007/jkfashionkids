import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Carrega a URL que está no arquivo .env.local
dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "./lib/db/schema.ts", // Certifique-se de que seu arquivo de schema está nessa pasta!
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});