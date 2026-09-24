import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { campaignRecipients, campaigns, organizations, suppliers } from "@/db/schema";
import { createTestDb } from "@/test/db";
import {
  type Actor,
  addClientMailbox,
  allRecipientsForAdmin,
  campaignProgress,
  createClientOrganization,
  createFair,
  createUser,
  getFair,
  listFairs,
  listOrganizations,
  respondedSuppliers,
} from "./access";
import { authenticate } from "./auth/login";
import { HttpError } from "./errors";

let db: Db;
let admin: Actor;
let clientA: Actor;
let clientB: Actor;
let fairA: string;
let fairB: string;
let orgA: string;

async function status(p: Promise<unknown>) {
  try {
    await p;
    return 200;
  } catch (e) {
    if (e instanceof HttpError) return e.status;
    if ((e as Error).name === "ZodError") return 400;
    throw e;
  }
}

beforeAll(async () => {
  db = await createTestDb();
  const [mirialis] = await db.insert(organizations).values({ name: "Mirialis", kind: "mirialis" }).returning();
  admin = { id: "bootstrap", organizationId: mirialis.id, role: "admin" };

  const a = await createClientOrganization(db, admin, { name: "Cliente A" });
  const b = await createClientOrganization(db, admin, { name: "Cliente B" });
  orgA = a.id;
  const ua = await createUser(db, admin, { organizationId: a.id, email: "a@cliente-a.it", name: "Anna", password: "password-lunga-a", role: "client" });
  const ub = await createUser(db, admin, { organizationId: b.id, email: "b@cliente-b.it", name: "Bruno", password: "password-lunga-b", role: "client" });
  clientA = { id: ua.id, organizationId: a.id, role: "client" };
  clientB = { id: ub.id, organizationId: b.id, role: "client" };

  fairA = (await createFair(db, clientA, { name: "Fiera A", startsOn: "2026-11-05", endsOn: "2026-11-08" })).id;
  fairB = (await createFair(db, admin, { organizationId: b.id, name: "Fiera B" })).id;

  // Campagna della fiera A: 4 fornitori caricati, 3 contattati davvero, 2 risposte, 1 preventivo.
  const [camp] = await db.insert(campaigns).values({ fairId: fairA, organizationId: a.id, status: "active" }).returning();
  const sup = await db
    .insert(suppliers)
    .values([
      { email: "risponde1@forn.it", companyName: "Allestimenti Uno" },
      { email: "risponde2@forn.it", companyName: "Stand Due" },
      { email: "silenzioso@forn.it", companyName: "Silenzio Srl" },
      { email: "incoda@forn.it", companyName: "In Coda Spa" },
    ])
    .returning();
  const now = new Date();
  await db.insert(campaignRecipients).values([
    { campaignId: camp.id, supplierId: sup[0].id, status: "replied", firstSentAt: now, firstReplyAt: now, interested: true, quoteReceived: true },
    { campaignId: camp.id, supplierId: sup[1].id, status: "replied", firstSentAt: now, firstReplyAt: now, interested: false },
    { campaignId: camp.id, supplierId: sup[2].id, status: "sent", firstSentAt: now },
    { campaignId: camp.id, supplierId: sup[3].id, status: "queued" },
  ]);
});

describe("isolamento tra organizzazioni", () => {
  it("ogni cliente vede solo le proprie fiere; l'admin le vede tutte", async () => {
    expect((await listFairs(db, clientA)).map((f) => f.id)).toEqual([fairA]);
    expect((await listFairs(db, clientB)).map((f) => f.id)).toEqual([fairB]);
    expect((await listFairs(db, admin)).map((f) => f.id).sort()).toEqual([fairA, fairB].sort());
  });

  it("ID di un'altra organizzazione in URL → 404 (come se non esistesse)", async () => {
    expect(await status(getFair(db, clientA, fairB))).toBe(404);
    expect(await status(campaignProgress(db, clientB, fairA))).toBe(404);
    expect(await status(respondedSuppliers(db, clientB, fairA))).toBe(404);
    expect(await status(getFair(db, clientA, "non-un-uuid"))).toBe(404);
    expect(await status(getFair(db, clientA, "00000000-0000-0000-0000-000000000000"))).toBe(404);
  });

  it("un cliente non può creare una fiera in un'altra organizzazione", async () => {
    const f = await createFair(db, clientA, { organizationId: clientB.organizationId, name: "Tentativo" });
    expect(f.organizationId).toBe(clientA.organizationId); // organizationId dal body ignorato
  });

  it("funzioni di amministrazione vietate al cliente", async () => {
    expect(await status(listOrganizations(db, clientA))).toBe(403);
    expect(await status(createClientOrganization(db, clientA, { name: "X" }))).toBe(403);
    expect(await status(createUser(db, clientA, { organizationId: orgA, email: "x@y.it", name: "Xx", password: "0123456789ab", role: "admin" }))).toBe(403);
    expect(await status(addClientMailbox(db, clientA, { organizationId: orgA, email: "m@y.it" }))).toBe(403);
  });

  it("un utente admin non può stare in un'organizzazione cliente (e viceversa)", async () => {
    expect(await status(createUser(db, admin, { organizationId: orgA, email: "finto-admin@a.it", name: "Finto", password: "0123456789ab", role: "admin" }))).toBe(400);
    expect(await status(createUser(db, admin, { organizationId: admin.organizationId, email: "cli@mirialis.it", name: "Cli", password: "0123456789ab", role: "client" }))).toBe(400);
  });
});

describe("il cliente non può enumerare i fornitori non rispondenti", () => {
  it("vede solo contatori, per fornitori unici e su invii confermati", async () => {
    const p = await campaignProgress(db, clientA, fairA);
    expect(p).toEqual({ contacted: 3, replies: 2, interested: 1, quotes: 1 }); // "in coda" non è contattato
    expect(Object.keys(p)).not.toContain("total");
  });

  it("vede i nomi SOLO di chi ha risposto", async () => {
    const names = (await respondedSuppliers(db, clientA, fairA)).map((s) => s.companyName).sort();
    expect(names).toEqual(["Allestimenti Uno", "Stand Due"]);
    const json = JSON.stringify(await respondedSuppliers(db, clientA, fairA));
    expect(json).not.toContain("Silenzio");
    expect(json).not.toContain("@forn.it"); // nessuna email dei fornitori al cliente
  });

  it("l'elenco completo è solo per l'admin", async () => {
    expect(await status(allRecipientsForAdmin(db, clientA, fairA))).toBe(403);
    expect((await allRecipientsForAdmin(db, admin, fairA)).length).toBe(4);
    expect(await campaignProgress(db, admin, fairA)).toMatchObject({ total: 4, contacted: 3 });
  });
});

describe("caselle del cliente (massimo 2)", () => {
  it("la terza casella è rifiutata", async () => {
    const b1 = await addClientMailbox(db, admin, { organizationId: orgA, email: "rfq1@cliente-a.it" });
    const b2 = await addClientMailbox(db, admin, { organizationId: orgA, email: "rfq2@cliente-a.it" });
    expect([b1.slot, b2.slot]).toEqual([1, 2]);
    expect(await status(addClientMailbox(db, admin, { organizationId: orgA, email: "rfq3@cliente-a.it" }))).toBe(409);
  });

  it("il vincolo regge anche aggirando il codice (garantito dal DB)", async () => {
    const { clientMailboxes } = await import("@/db/schema");
    await expect(db.insert(clientMailboxes).values({ organizationId: orgA, slot: 3, email: "x3@a.it" })).rejects.toThrow();
    await expect(db.insert(clientMailboxes).values({ organizationId: orgA, slot: 1, email: "x1@a.it" })).rejects.toThrow();
  });
});

describe("login", () => {
  it("credenziali corrette, errate e utente inesistente", async () => {
    expect(await authenticate(db, "A@Cliente-A.it", "password-lunga-a")).toMatchObject({ role: "client", organizationId: orgA });
    expect(await authenticate(db, "a@cliente-a.it", "sbagliata")).toBeNull();
    expect(await authenticate(db, "nessuno@x.it", "qualunque")).toBeNull();
  });
});

describe("dati demo", () => {
  it("separati (is_demo), idempotenti e solo per l'admin", async () => {
    const { seedDemo } = await import("@/db/seedDemo");
    expect(await status(seedDemo(db, clientA))).toBe(403);
    const first = await seedDemo(db, admin);
    const second = await seedDemo(db, admin);
    expect(first.created).toBe(true);
    expect(second).toEqual({ created: false, organizationId: first.organizationId });
    const demoFairs = (await listFairs(db, admin)).filter((f) => f.isDemo);
    expect(demoFairs).toHaveLength(1);
    expect(await campaignProgress(db, admin, demoFairs[0].id)).toMatchObject({ contacted: 4, replies: 2, quotes: 1 });
    // i clienti reali non vedono nulla della demo
    expect((await listFairs(db, clientA)).some((f) => f.isDemo)).toBe(false);
  });
});
