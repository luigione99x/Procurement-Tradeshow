// Applica le migrazioni in ./drizzle al database di DATABASE_URL (serve accesso di rete a Neon).
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL non configurata");
const pool = new Pool({ connectionString: url });
await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
await pool.end();
console.log("Migrazioni applicate.");
