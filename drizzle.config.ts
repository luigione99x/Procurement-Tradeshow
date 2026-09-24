import { defineConfig } from "drizzle-kit";

// Migrazioni versionate: `npm run db:generate` scrive i file SQL in ./drizzle (da committare).
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
});
