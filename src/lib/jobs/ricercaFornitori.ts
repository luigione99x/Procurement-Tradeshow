import { prisma } from "@/lib/db";
import { serperSearch, costruisciQuery } from "@/lib/serper";
import { scrapeSitoConContatti } from "@/lib/scrape";
import { selezionaShortlist } from "@/lib/openai";
import { logAttivita } from "@/lib/audit";

const DOMINI_ESCLUSI = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "wikipedia.org",
  "paginegialle.it",
  "indeed.com",
  "youtube.com",
  "pinterest.com",
  "twitter.com",
  "x.com",
  "amazon.",
];

function dominio(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function eseguiRicercaFornitori(praticaId: string, jobId: string) {
  try {
    const pratica = await prisma.pratica.findUniqueOrThrow({ where: { id: praticaId } });
    const qualificazione = (pratica.qualificazione as Record<string, unknown>) || {};

    const queries = costruisciQuery({
      fieraNome: pratica.fieraNome,
      citta: pratica.citta,
      dimensioneMq: pratica.dimensioneMq,
      tipoStand: (qualificazione.tipoStand as string) || null,
    });

    const risultatiPerDominio = new Map<string, { title: string; link: string; snippet?: string }>();

    for (const query of queries) {
      const risultati = await serperSearch(query);
      await prisma.fornitoreRicercaLog.create({
        data: { praticaId, query, risultatiJson: risultati as any },
      });
      for (const r of risultati) {
        const d = dominio(r.link);
        if (DOMINI_ESCLUSI.some((escl) => d.includes(escl))) continue;
        if (!risultatiPerDominio.has(d)) risultatiPerDominio.set(d, r);
      }
    }

    const candidatiUnici = Array.from(risultatiPerDominio.values()).slice(0, 15);

    const candidatiGrezzi: unknown[] = [];
    const BATCH = 4;
    for (let i = 0; i < candidatiUnici.length; i += BATCH) {
      const batch = candidatiUnici.slice(i, i + BATCH);
      const scraped = await Promise.all(
        batch.map(async (c) => {
          const { home, contatti } = await scrapeSitoConContatti(c.link);
          return {
            titoloRisultato: c.title,
            link: c.link,
            snippetRisultato: c.snippet,
            sitoAccessibile: home.accessibile,
            erroreSito: home.errore,
            testoHome: home.testo,
            emailTrovateHome: home.emailTrovate,
            paginaContatti: contatti
              ? { url: contatti.url, accessibile: contatti.accessibile, emailTrovate: contatti.emailTrovate, testo: contatti.testo }
              : undefined,
          };
        })
      );
      candidatiGrezzi.push(...scraped);
    }

    const shortlist = await selezionaShortlist({
      briefPratica: pratica as unknown as Record<string, unknown>,
      candidatiGrezzi,
    });

    let creati = 0;
    for (const c of shortlist) {
      const esistente = await prisma.fornitore.findFirst({
        where: { praticaId, OR: [{ sito: c.sito }, { nome: c.nome }] },
      });
      if (esistente) continue;
      await prisma.fornitore.create({
        data: {
          praticaId,
          nome: c.nome,
          sito: c.sito,
          areaOperativa: c.areaOperativa || null,
          serviziDichiarati: c.serviziDichiarati || null,
          esempiProgetti: c.esempiProgetti || null,
          email: c.email || null,
          emailVerificata: Boolean(c.email && c.emailFonteUrl),
          emailFonteUrl: c.emailFonteUrl || null,
          ragionePertinenza: c.ragionePertinenza,
          dubbi: c.dubbi || null,
          sitoAccessibile: (candidatiGrezzi.find((g: any) => g.link === c.sito) as any)?.sitoAccessibile ?? null,
          stato: "CANDIDATO",
          fonte: "RICERCA_SERPER",
        },
      });
      creati++;
    }

    await prisma.backgroundJobRun.update({
      where: { id: jobId },
      data: { status: "COMPLETATO", finishedAt: new Date(), resultJson: { candidatiTrovati: shortlist.length, fornitoriCreati: creati } },
    });

    await logAttivita({
      praticaId,
      actorType: "sistema",
      tipo: "ricerca_fornitori_completata",
      descrizione: `Ricerca fornitori completata: ${creati} nuovi candidati aggiunti alla shortlist (su ${shortlist.length} trovati)`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    await prisma.backgroundJobRun.update({
      where: { id: jobId },
      data: { status: "FALLITO", finishedAt: new Date(), errorMessage: message },
    });
    await logAttivita({
      praticaId,
      actorType: "sistema",
      tipo: "ricerca_fornitori_fallita",
      descrizione: `Ricerca fornitori fallita: ${message}`,
    });
  }
}
