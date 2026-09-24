import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// Tipo comune a tutti i driver (Neon in produzione, PGlite nei test): il codice di
// dominio riceve sempre un `Db` e non sa su quale driver gira.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const g = globalThis as unknown as { __db?: Db };

export function getDb(): Db {
  if (!g.__db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL non configurata");
    g.__db = drizzle(new Pool({ connectionString: url }), { schema }) as unknown as Db;
  }
  return g.__db;
}
