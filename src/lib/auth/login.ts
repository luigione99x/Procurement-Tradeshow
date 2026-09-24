import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import { verifyPassword } from "./password";

// Hash fittizio: se l'utente non esiste si esegue comunque un confronto bcrypt, così il
// tempo di risposta non rivela quali email sono registrate.
const DUMMY_HASH = "$2b$11$C6UzMDM.H6dfI/f/IKcEeO5y8eQ4m7xQ0m8b9lJ1Q2yZ3r4s5t6u.";

export async function authenticate(db: Db, email: string, password: string) {
  const [u] = await db.select().from(users).where(eq(sql`lower(${users.email})`, email.trim().toLowerCase()));
  const ok = await verifyPassword(password, u?.passwordHash ?? DUMMY_HASH);
  return u && ok ? { id: u.id, role: u.role, organizationId: u.organizationId } : null;
}
