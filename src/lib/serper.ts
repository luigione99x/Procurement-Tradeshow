import { requireSerper } from "./integrations";

export type SerperResult = {
  title: string;
  link: string;
  snippet?: string;
};

export async function serperSearch(query: string): Promise<SerperResult[]> {
  requireSerper();
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, gl: "it", hl: "it", num: 20 }),
  });
  if (!res.ok) {
    throw new Error(`Serper ha risposto con errore ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const organic = (data.organic || []) as { title: string; link: string; snippet?: string }[];
  return organic.map((o) => ({ title: o.title, link: o.link, snippet: o.snippet }));
}

// Costruisce le query di ricerca a partire dai dati della pratica.
export function costruisciQuery(params: {
  fieraNome?: string | null;
  citta?: string | null;
  dimensioneMq?: number | null;
  tipoStand?: string | null;
}): string[] {
  const queries: string[] = [];
  const zona = params.citta ? `${params.citta}` : "";
  queries.push(`allestitori stand fieristici ${zona}`.trim());
  if (params.fieraNome) queries.push(`allestimento stand "${params.fieraNome}"`);
  queries.push(`progettazione e realizzazione stand fieristici ${zona}`.trim());
  if (params.tipoStand) queries.push(`allestitori stand ${params.tipoStand} ${zona}`.trim());
  if (params.dimensioneMq) {
    const fascia = params.dimensioneMq > 80 ? "stand grandi dimensioni" : "stand personalizzati";
    queries.push(`${fascia} fieristici ${zona}`.trim());
  }
  return Array.from(new Set(queries)).slice(0, 5);
}
