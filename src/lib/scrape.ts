import * as cheerio from "cheerio";

export type PaginaScraped = {
  url: string;
  accessibile: boolean;
  titolo?: string;
  testo?: string;
  emailTrovate: string[];
  linkContatti?: string;
  errore?: string;
};

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export async function scrapePagina(url: string): Promise<PaginaScraped> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ProcurementBot/1.0)" },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return { url, accessibile: false, emailTrovate: [], errore: `HTTP ${res.status}` };
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const testo = $("body").text().replace(/\s+/g, " ").trim().slice(0, 5000);
    const emailTrovate = Array.from(new Set(html.match(EMAIL_REGEX) || [])).filter(
      (e) => !e.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)
    );
    let linkContatti: string | undefined;
    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const label = $(el).text().toLowerCase();
      if (!linkContatti && (href.toLowerCase().includes("contact") || href.toLowerCase().includes("contatt") || label.includes("contatt"))) {
        try {
          linkContatti = new URL(href, url).toString();
        } catch {
          /* ignore invalid href */
        }
      }
    });
    return {
      url,
      accessibile: true,
      titolo: $("title").first().text().trim() || undefined,
      testo,
      emailTrovate,
      linkContatti,
    };
  } catch (err) {
    return {
      url,
      accessibile: false,
      emailTrovate: [],
      errore: err instanceof Error ? err.message : "errore sconosciuto",
    };
  }
}

// Se non trova email nella home, prova la pagina contatti collegata.
export async function scrapeSitoConContatti(url: string): Promise<{ home: PaginaScraped; contatti?: PaginaScraped }> {
  const home = await scrapePagina(url);
  if (home.emailTrovate.length > 0 || !home.linkContatti) {
    return { home };
  }
  const contatti = await scrapePagina(home.linkContatti);
  return { home, contatti };
}
