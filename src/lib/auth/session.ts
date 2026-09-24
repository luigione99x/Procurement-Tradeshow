import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import type { Actor } from "../access";
import { HttpError } from "../errors";
import { readSession, signSession } from "./token";

export const SESSION_COOKIE = "mirialis_session";

export async function startSession(userId: string) {
  (await cookies()).set(SESSION_COOKIE, await signSession(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function currentUser() {
  const userId = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const [u] = await getDb()
    .select({ id: users.id, organizationId: users.organizationId, role: users.role, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  return u ?? null;
}

export async function requireActor(): Promise<Actor & { name: string; email: string }> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Non autenticato");
  return u;
}
