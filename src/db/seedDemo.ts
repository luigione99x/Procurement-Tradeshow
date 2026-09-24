import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "./client";
import { campaignRecipients, campaigns, organizations, suppliers } from "./schema";
import { type Actor, createClientOrganization, createFair, createUser, requireAdmin } from "@/lib/access";

// Dati DEMO, separati da quelli reali: organizzazione con is_demo=true, fornitori con
// dominio .test (non recapitabile), nessuna email reale. Idempotente: se la demo esiste
// già non crea duplicati.
export async function seedDemo(db: Db, actor: Actor) {
  requireAdmin(actor);
  const [existing] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.isDemo, true), eq(organizations.name, "Cliente Demo")));
  if (existing) return { created: false as const, organizationId: existing.id };

  const org = await createClientOrganization(db, actor, { name: "Cliente Demo", isDemo: true });
  const password = randomBytes(9).toString("base64url");
  const user = await createUser(db, actor, { organizationId: org.id, email: "cliente@demo.mirialis.test", name: "Cliente Demo", password, role: "client" });
  const fair = await createFair(db, actor, {
    organizationId: org.id,
    name: "Fiera Demo 2026",
    city: "Milano",
    venue: "Fiera Milano Rho",
    startsOn: "2026-11-05",
    endsOn: "2026-11-08",
    contactName: "Referente Demo",
    contactEmail: "referente@demo.mirialis.test",
    budgetCents: 2_500_000,
  });
  const [camp] = await db.insert(campaigns).values({ fairId: fair.id, organizationId: org.id, status: "active" }).returning();
  const sup = await db
    .insert(suppliers)
    .values(
      ["Allestimenti Demo Uno", "Stand Demo Due", "Expo Demo Tre", "Fiere Demo Quattro", "Design Demo Cinque"].map((n, i) => ({
        email: `fornitore${i + 1}@demo-fornitori.test`,
        companyName: n,
      }))
    )
    .onConflictDoNothing()
    .returning();
  const now = new Date();
  await db.insert(campaignRecipients).values(
    sup.map((s, i) => ({
      campaignId: camp.id,
      supplierId: s.id,
      status: (i < 2 ? "replied" : i < 4 ? "sent" : "queued") as "replied" | "sent" | "queued",
      firstSentAt: i < 4 ? now : null,
      firstReplyAt: i < 2 ? now : null,
      interested: i < 2 ? true : null,
      quoteReceived: i === 0,
    }))
  );
  return { created: true as const, organizationId: org.id, login: { email: user.email, password } };
}
