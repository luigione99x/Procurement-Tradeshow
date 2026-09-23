// Seed idempotente: crea (se mancante) lo staff Miralis e un progetto demo
// marcato isDemo=true, con aziende fittizie (mai il database proprietario
// reale). Sicuro da rieseguire: ogni sezione controlla prima se esiste già.
//
// Variabili opzionali per lo staff Miralis (altrimenti usa i default sotto,
// da cambiare subito dopo il primo login):
//   MIRALIS_ADMIN_EMAIL, MIRALIS_ADMIN_NAME, MIRALIS_ADMIN_PASSWORD
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seedMiralisStaff() {
  const email = process.env.MIRALIS_ADMIN_EMAIL || "admin@miralis.it";
  const name = process.env.MIRALIS_ADMIN_NAME || "Miralis Admin";
  const password = process.env.MIRALIS_ADMIN_PASSWORD || "cambia-questa-password-al-primo-accesso";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Staff Miralis già presente: ${email}`);
    return existing;
  }

  const company = await prisma.company.upsert({
    where: { id: "miralis-org" },
    update: {},
    create: { id: "miralis-org", name: "Miralis", type: "MIRALIS" },
  });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { companyId: company.id, email, name, passwordHash, role: "MIRALIS_ADMIN" },
  });
  console.log(`Creato Miralis Admin: ${email} (password: ${password === "cambia-questa-password-al-primo-accesso" ? "default, CAMBIARE subito" : "da MIRALIS_ADMIN_PASSWORD"})`);
  return user;
}

// Nomi di fantasia: MAI aziende reali del database proprietario Miralis
// (Sezione 35 del brief: "non usare aziende reali del file proprietario").
const DEMO_FORNITORI = [
  "Demo Allestimenti Nord Srl", "Demo Stand Design Studio", "Demo Expo Costruzioni Srl",
  "Demo Fiera Service Group", "Demo Allestimenti Adriatico", "Demo Grafiche Grande Formato",
  "Demo Illuminotecnica Eventi", "Demo Arredo Fieristico Srl", "Demo Logistica Espositori",
  "Demo Structure Design Lab", "Demo Stand Systems Italia", "Demo Eventi & Allestimenti",
  "Demo Padiglioni Creativi Srl", "Demo Exhibit Solutions", "Demo Costruzioni Fieristiche",
  "Demo Progetto Stand Srl", "Demo Espositori Moderni", "Demo Allestimenti Centro Italia",
  "Demo Fiera Design Group", "Demo Stand Builder Italia",
];

async function seedDemoProject(createdById: string) {
  const existing = await prisma.pratica.findFirst({ where: { isDemo: true, nome: "MECSPE 2027 (demo)" } });
  if (existing) {
    console.log("Progetto demo già presente, salto la creazione.");
    return;
  }

  const clientCompany = await prisma.company.create({
    data: { name: "Acme Industries (demo)", type: "CLIENT" },
  });
  const clientUser = await prisma.user.create({
    data: {
      companyId: clientCompany.id,
      email: `demo-acme-${Date.now()}@example.invalid`,
      name: "Referente Acme (demo)",
      passwordHash: await bcrypt.hash("demo-non-utilizzabile", 10),
      role: "CLIENT",
    },
  });
  await prisma.integrationConfig.createMany({
    data: [
      { companyId: clientCompany.id, provider: "OPENAI", connected: false },
      { companyId: clientCompany.id, provider: "SERPER", connected: false },
      { companyId: clientCompany.id, provider: "GMAIL", connected: false },
    ],
  });

  const pratica = await prisma.pratica.create({
    data: {
      companyId: clientCompany.id,
      createdById,
      isDemo: true,
      nome: "MECSPE 2027 (demo)",
      fieraNome: "MECSPE",
      citta: "Bologna",
      dimensioneMq: 48,
      budgetStand: 35000,
      feePercentualeConcordata: 30,
      status: "CONFRONTO_OFFERTE",
      phase: "QUOTE_COMPARISON",
      qualificazione: {},
      referenteAziendaleNome: "Referente Acme (demo)",
      referenteAziendaleEmail: clientUser.email,
    },
  });

  await prisma.praticaTeamMember.create({
    data: { praticaId: pratica.id, userId: createdById, role: "MIRALIS_LEAD" },
  });

  await prisma.savingsBaseline.create({
    data: {
      praticaId: pratica.id,
      versionNumber: 1,
      type: "PREVENTIVO_PRECEDENTE_COMPARABILE",
      amount: 32000,
      status: "LOCKED",
      note: "Baseline demo: preventivo comparabile dell'edizione precedente della fiera.",
      approvedByUserId: createdById,
      approvedAt: new Date(),
      createdByUserId: createdById,
    },
  });

  // 20 fornitori: 8 non ancora contattati, 7 contattati in attesa, 5 con
  // risposta umana valida (quindi rivelati) di cui 3 con preventivo ricevuto.
  const fornitoriData = DEMO_FORNITORI.map((nome, i) => {
    const contattato = i < 12; // primi 12 contattati
    const rivelato = i < 5; // primi 5 hanno risposto
    const conPreventivo = i < 3; // primi 3 hanno inviato preventivo
    return {
      praticaId: pratica.id,
      nome,
      categoria: "Allestitore generale",
      areaOperativa: "Emilia-Romagna",
      sourceType: "MIRALIS_DATABASE" as const,
      isProprietary: true,
      fonte: "STORICO_CLIENTE" as const,
      stato: conPreventivo ? ("QUOTE_RECEIVED" as const) : rivelato ? ("REPLIED" as const) : contattato ? ("AWAITING_REPLY" as const) : ("SHORTLIST" as const),
      clientVisibility: rivelato ? ("REVEALED" as const) : ("HIDDEN" as const),
      contactedAt: contattato ? new Date() : null,
      firstValidReplyAt: rivelato ? new Date() : null,
      revealedAt: rivelato ? new Date() : null,
      revealedByUserId: rivelato ? createdById : null,
      revealReason: rivelato ? "Risposta umana valida ricevuta (dati demo)" : null,
      replyConfidence: rivelato ? 0.95 : null,
      email: rivelato ? `commerciale@${nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.demo` : null,
    };
  });

  const fornitori = [];
  for (const data of fornitoriData) {
    fornitori.push(await prisma.fornitore.create({ data }));
  }

  const conPreventivo = fornitori.slice(0, 3);
  const prezzi = [29800, 27500, 31200];
  const offerte = [];
  for (let i = 0; i < conPreventivo.length; i++) {
    offerte.push(
      await prisma.offerta.create({
        data: {
          praticaId: pratica.id,
          fornitoreId: conPreventivo[i].id,
          versionNumber: 1,
          stato: "CONFERMATA",
          prezzo: prezzi[i],
          valuta: "EUR",
          ivaInclusa: false,
          progetto: "Stand chiavi in mano 48mq, progettazione inclusa",
          montaggio: "Incluso",
          smontaggio: "Incluso",
          condizioniPagamento: "30% ordine, 70% a montaggio ultimato",
          tempiConsegna: "Montaggio 2 giorni prima apertura fiera",
        },
      })
    );
  }

  // BAFO del vincitore (Sezione 26: Best and Final Offer) come seconda versione.
  const vincitore = conPreventivo[1]; // prezzo iniziale più basso: €27.500
  const bafo = await prisma.offerta.create({
    data: {
      praticaId: pratica.id,
      fornitoreId: vincitore.id,
      versionNumber: 2,
      stato: "CONFERMATA",
      prezzo: 25500,
      valuta: "EUR",
      ivaInclusa: false,
      progetto: "Stand chiavi in mano 48mq, progettazione inclusa (BAFO)",
      montaggio: "Incluso",
      smontaggio: "Incluso",
      condizioniPagamento: "30% ordine, 70% a montaggio ultimato",
      tempiConsegna: "Montaggio 2 giorni prima apertura fiera",
    },
  });

  await prisma.decisione.create({
    data: {
      praticaId: pratica.id,
      offertaSceltaId: bafo.id,
      prezzoFinale: 25500,
      prezzoInizialeRiferimento: 32000,
      risparmioVerificabile: true,
      risparmioCalcolato: 6500,
      feeSuccessPercentuale: 30,
      feeSuccessCalcolata: 1950,
      decisoDaId: createdById,
      note: "Dati demo: risparmio = baseline (€32.000) - offerta finale comparabile (€25.500).",
    },
  });

  console.log(`Progetto demo creato: "${pratica.nome}" (${pratica.id}) — 20 fornitori, 3 preventivi, 1 decisione.`);
}

async function main() {
  const miralisAdmin = await seedMiralisStaff();
  await seedDemoProject(miralisAdmin.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
