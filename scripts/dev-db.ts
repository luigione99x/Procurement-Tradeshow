// Prepara un Postgres locale su file (PGlite) con migrazioni, admin e dati demo.
// Uso: npx tsx scripts/dev-db.ts <cartella> <email-admin> <password-admin>
// Stampa in JSON le credenziali del cliente demo e l'id della fiera demo.
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "../src/db/client";
import * as schema from "../src/db/schema";
import { seedDemo } from "../src/db/seedDemo";
import { hashPassword } from "../src/lib/auth/password";

async function main() {
  const [dir, email, password] = process.argv.slice(2);
  if (!dir || !email || !password) throw new Error("uso: dev-db.ts <cartella> <email> <password>");
  const pg = new PGlite(dir);
  const db = drizzle(pg, { schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: "drizzle" });
  const [org] = await db.insert(schema.organizations).values({ name: "Mirialis", kind: "mirialis" }).returning();
  const [admin] = await db
    .insert(schema.users)
    .values({ organizationId: org.id, email, name: "Admin locale", role: "admin", passwordHash: await hashPassword(password) })
    .returning();
  const demo = await seedDemo(db, { id: admin.id, organizationId: org.id, role: "admin" });
  const [fair] = await db.select().from(schema.fairs);
  const [rec] = await db.select().from(schema.campaignRecipients).where(eq(schema.campaignRecipients.status, "replied"));
  console.log(JSON.stringify({ demo: demo.created ? demo.login : null, demoFairId: fair.id, conversationId: rec.id }));
  await pg.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
