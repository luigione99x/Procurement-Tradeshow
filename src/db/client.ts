import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// Tipo comune a tutti i driver (Neon in produzione, PGlite in locale/test): il codice di
// dominio riceve sempre un `Db` e non sa su quale driver gira.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const g = globalThis as unknown as { __db?: Promise<Db> };

// DATABASE_URL=pglite:<cartella> → Postgres locale su file (sviluppo e prove di rendering
// senza rete). Qualunque altro valore → Neon.
export function getDb(): Promise<Db> {
  if (!g.__db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL non configurata");
    g.__db = url.startsWith("pglite:")
      ? (async () => {
          const { PGlite } = await import("@electric-sql/pglite");
          const { drizzle: drizzleLite } = await import("drizzle-orm/pglite");
          return drizzleLite(new PGlite(url.slice("pglite:".length)), { schema }) as unknown as Db;
        })()
      : Promise.resolve(drizzle(new Pool({ connectionString: url }), { schema }) as unknown as Db);
  }
  return g.__db;
}
