// Importer del database fornitori proprietario Miralis (Sezione 7 del brief).
// Pipeline: parse file -> rilevamento colonne -> mapping manuale confermato
// dall'operatore -> preview -> validazione -> deduplicazione -> conferma -> report.
// Ogni funzione qui e' pura/testabile dove possibile; l'unica funzione che tocca
// il DB e' `importSuppliers`, usata dalla route /api/admin/fornitori/import.
import * as XLSX from "xlsx";
import { prisma } from "./db";
import type { SupplierSourceType, SupplierCategory } from "@prisma/client";

export type SupportedFormat = "csv" | "tsv" | "xlsx" | "xls";

export type ParsedFile = {
  format: SupportedFormat;
  headers: string[];
  rows: string[][]; // righe grezze, stesso ordine delle headers
};

export const TARGET_FIELDS = [
  "ragioneSociale",
  "nomeCommerciale",
  "sito",
  "email",
  "telefono",
  "citta",
  "provincia",
  "regione",
  "paese",
  "contatto",
  "categoria",
  "note",
] as const;
export type TargetField = (typeof TARGET_FIELDS)[number];

export type ColumnMapping = Partial<Record<TargetField, string>>; // targetField -> header sorgente

// -------------------- Parsing --------------------

function detectFormat(fileName: string): SupportedFormat {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "tsv") return "tsv";
  if (ext === "xlsx") return "xlsx";
  if (ext === "xls") return "xls";
  return "csv"; // default: csv
}

// Parser CSV/TSV minimale ma corretto secondo RFC4180 (campi tra virgolette,
// virgolette escaped raddoppiate, separatori dentro i campi quotati, CRLF/LF).
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // normalizza CRLF -> LF per semplificare lo scan
  const s = text.replace(/\r\n/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export function parseFile(buffer: Buffer, fileName: string): ParsedFile {
  const format = detectFormat(fileName);

  if (format === "csv" || format === "tsv") {
    const text = buffer.toString("utf-8");
    const delimiter = format === "tsv" ? "\t" : ",";
    const all = parseDelimited(text, delimiter);
    if (all.length === 0) return { format, headers: [], rows: [] };
    const [headers, ...rows] = all;
    return { format, headers: headers.map((h) => h.trim()), rows };
  }

  // xlsx / xls: usa il primo foglio del workbook
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  const nonEmpty = matrix.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""));
  if (nonEmpty.length === 0) return { format, headers: [], rows: [] };
  const [headerRow, ...rest] = nonEmpty;
  const headers = headerRow.map((h) => String(h ?? "").trim());
  const rows = rest.map((r) => headers.map((_, i) => String(r[i] ?? "").trim()));
  return { format, headers, rows };
}

// -------------------- Rilevamento automatico colonne (suggerimento, non vincolante) --------------------

const HEADER_HINTS: Record<TargetField, RegExp> = {
  ragioneSociale: /ragione\s*sociale|nome\s*azienda|company|denominazione/i,
  nomeCommerciale: /nome\s*commerciale|brand/i,
  sito: /sito|website|indirizzo\s*web|url/i,
  email: /email|e-mail|mail/i,
  telefono: /telefono|phone|tel\b/i,
  citta: /citt[aà]|city/i,
  provincia: /provincia|prov\.?$/i,
  regione: /regione|region/i,
  paese: /paese|country|nazione/i,
  contatto: /contatto|referente|contact\s*person/i,
  categoria: /categori/i,
  note: /note|note interne|annotazioni/i,
};

export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const field of TARGET_FIELDS) {
    const hint = HEADER_HINTS[field];
    const match = headers.find((h) => hint.test(h));
    if (match) mapping[field] = match;
  }
  return mapping;
}

// -------------------- Normalizzazione --------------------

export function normalizeDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed || /assente|n\/?a|non\s*disponibile/i.test(trimmed)) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const host = new URL(withProtocol).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
}

export function normalizeRagioneSociale(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.trim().toLowerCase().replace(/\s+/g, " ") || null;
}

// Riconoscimento best-effort della colonna "categoria" (testo libero nel file
// sorgente) verso i valori dell'enum SupplierCategory, per il punteggio di
// compatibilità (Fase 6). Nessuna corrispondenza -> array vuoto: non si
// inventa mai una categoria da un testo che non la suggerisce chiaramente.
const CATEGORIA_KEYWORDS: [RegExp, SupplierCategory][] = [
  [/allestit|stand builder|chiavi in mano/i, "STAND_BUILDER"],
  [/general contractor/i, "GENERAL_CONTRACTOR"],
  [/progett|design|render/i, "DESIGN"],
  [/grafic|stampa|insegn/i, "GRAPHICS"],
  [/illuminaz|luci\b/i, "LIGHTING"],
  [/elettric|impianto elettrico/i, "ELECTRICAL"],
  [/audio|video|\bav\b/i, "AV"],
  [/arred|mobili|noleggio arred/i, "FURNITURE"],
  [/trasport|logistic/i, "LOGISTICS"],
  [/catering|ristoraz/i, "CATERING"],
  [/internet|wifi|connettivit/i, "INTERNET"],
  [/rigging|appendiment/i, "RIGGING"],
  [/pulizi/i, "CLEANING"],
  [/sicurezz|vigilanz/i, "SAFETY"],
  [/smaltiment|rifiuti/i, "WASTE_DISPOSAL"],
];

export function normalizeCategoria(testo: string | null | undefined): SupplierCategory[] {
  if (!testo) return [];
  const trovate = new Set<SupplierCategory>();
  for (const [re, categoria] of CATEGORIA_KEYWORDS) {
    if (re.test(testo)) trovate.add(categoria);
  }
  return Array.from(trovate);
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export function isValidEmailFormat(email: string) {
  return EMAIL_RE.test(email.trim());
}

// -------------------- Riga mappata + validazione --------------------

export type MappedRow = {
  rowIndex: number;
  ragioneSociale: string | null;
  nomeCommerciale: string | null;
  sito: string | null;
  dominioNormalizzato: string | null;
  email: string | null;
  emailNormalizzata: string | null;
  telefono: string | null;
  citta: string | null;
  provincia: string | null;
  regione: string | null;
  paese: string | null;
  contatto: string | null;
  categoria: string | null;
  note: string | null;
  problemi: string[]; // es. "ragione sociale mancante", "email non valida"
};

export function applyMapping(parsed: ParsedFile, mapping: ColumnMapping): MappedRow[] {
  const idx: Partial<Record<TargetField, number>> = {};
  for (const field of TARGET_FIELDS) {
    const header = mapping[field];
    if (header) idx[field] = parsed.headers.indexOf(header);
  }
  const get = (row: string[], field: TargetField): string | null => {
    const i = idx[field];
    if (i === undefined || i < 0) return null;
    const v = row[i]?.trim();
    return v ? v : null;
  };

  return parsed.rows.map((row, rowIndex) => {
    const ragioneSociale = get(row, "ragioneSociale");
    const sito = get(row, "sito");
    const email = get(row, "email");
    const problemi: string[] = [];
    if (!ragioneSociale) problemi.push("ragione sociale mancante");
    if (email && !isValidEmailFormat(email)) problemi.push("email non in formato valido");
    if (!email) problemi.push("email mancante");

    return {
      rowIndex,
      ragioneSociale,
      nomeCommerciale: get(row, "nomeCommerciale"),
      sito,
      dominioNormalizzato: normalizeDomain(sito),
      email,
      emailNormalizzata: normalizeEmail(email),
      telefono: get(row, "telefono"),
      citta: get(row, "citta"),
      provincia: get(row, "provincia"),
      regione: get(row, "regione"),
      paese: get(row, "paese"),
      contatto: get(row, "contatto"),
      categoria: get(row, "categoria"),
      note: get(row, "note"),
      problemi,
    };
  });
}

// -------------------- Deduplicazione --------------------

export type DedupDecision = {
  row: MappedRow;
  azione: "importa" | "scarta" | "duplicato_esatto";
  richiedeRevisione: boolean;
  motivoRevisione?: string;
  matchSupplierId?: string; // se duplicato_esatto: id del Supplier esistente
};

export async function planImport(rows: MappedRow[]): Promise<DedupDecision[]> {
  const domini = rows.map((r) => r.dominioNormalizzato).filter((v): v is string => Boolean(v));
  const email = rows.map((r) => r.emailNormalizzata).filter((v): v is string => Boolean(v));

  const existing = await prisma.supplier.findMany({
    where: {
      deletedAt: null,
      OR: [
        domini.length ? { dominioNormalizzato: { in: domini } } : undefined,
        email.length ? { emailNormalizzata: { in: email } } : undefined,
      ].filter(Boolean) as object[],
    },
    select: { id: true, ragioneSociale: true, dominioNormalizzato: true, emailNormalizzata: true },
  });
  const existingByDomain = new Map(existing.filter((e) => e.dominioNormalizzato).map((e) => [e.dominioNormalizzato as string, e]));
  const existingByEmail = new Map(existing.filter((e) => e.emailNormalizzata).map((e) => [e.emailNormalizzata as string, e]));

  const seenInFile = new Map<string, MappedRow>(); // chiave dominio|email -> prima riga vista

  const decisions: DedupDecision[] = [];
  for (const row of rows) {
    if (!row.ragioneSociale) {
      decisions.push({ row, azione: "scarta", richiedeRevisione: false, motivoRevisione: "ragione sociale mancante" });
      continue;
    }

    const dbMatch =
      (row.dominioNormalizzato && existingByDomain.get(row.dominioNormalizzato)) ||
      (row.emailNormalizzata && existingByEmail.get(row.emailNormalizzata));
    if (dbMatch) {
      decisions.push({
        row,
        azione: "duplicato_esatto",
        richiedeRevisione: normalizeRagioneSociale(dbMatch.ragioneSociale) !== normalizeRagioneSociale(row.ragioneSociale),
        motivoRevisione:
          normalizeRagioneSociale(dbMatch.ragioneSociale) !== normalizeRagioneSociale(row.ragioneSociale)
            ? `stesso dominio/email di un fornitore gia' presente con ragione sociale diversa ("${dbMatch.ragioneSociale}")`
            : undefined,
        matchSupplierId: dbMatch.id,
      });
      continue;
    }

    const fileKey = row.dominioNormalizzato || row.emailNormalizzata;
    if (fileKey && seenInFile.has(fileKey)) {
      const prima = seenInFile.get(fileKey)!;
      const stessoNome = normalizeRagioneSociale(prima.ragioneSociale) === normalizeRagioneSociale(row.ragioneSociale);
      if (stessoNome) {
        decisions.push({ row, azione: "scarta", richiedeRevisione: false, motivoRevisione: "riga duplicata nel file" });
        continue;
      }
      decisions.push({
        row,
        azione: "importa",
        richiedeRevisione: true,
        motivoRevisione: `email/dominio condiviso con un'altra ragione sociale nel file ("${prima.ragioneSociale}"): verificare se azienda distinta o gruppo societario`,
      });
      continue;
    }
    if (fileKey) seenInFile.set(fileKey, row);

    decisions.push({ row, azione: "importa", richiedeRevisione: false });
  }
  return decisions;
}

// -------------------- Import effettivo --------------------

export type ImportReport = {
  batchId: string;
  righeTotali: number;
  importate: number;
  aggiornate: number;
  duplicate: number;
  scartate: number;
  mancantiEmail: number;
  emailNonValide: number;
  daRevisionare: number;
};

export async function importSuppliers(params: {
  fileName: string;
  format: SupportedFormat;
  mapping: ColumnMapping;
  decisions: DedupDecision[];
  importedByUserId: string;
  sourceType?: SupplierSourceType;
}): Promise<ImportReport> {
  const sourceType = params.sourceType ?? "MIRALIS_DATABASE";
  const isProprietary = sourceType === "MIRALIS_DATABASE";

  const batch = await prisma.supplierImportBatch.create({
    data: {
      fileName: params.fileName,
      fileFormat: params.format,
      columnMapping: params.mapping,
      totalRows: params.decisions.length,
      importedByUserId: params.importedByUserId,
      status: "PROCESSING",
    },
  });

  let importate = 0;
  let duplicate = 0;
  let scartate = 0;
  let aggiornate = 0;
  const mancantiEmail = params.decisions.filter((d) => d.row.problemi.includes("email mancante")).length;
  const emailNonValide = params.decisions.filter((d) => d.row.problemi.includes("email non in formato valido")).length;
  const daRevisionare = params.decisions.filter((d) => d.richiedeRevisione).length;

  for (const decision of params.decisions) {
    const { row } = decision;
    if (decision.azione === "scarta") {
      scartate++;
      continue;
    }
    if (decision.azione === "duplicato_esatto" && decision.matchSupplierId) {
      duplicate++;
      // Completa solo i campi vuoti sul record esistente: non sovrascrive mai
      // dati gia' presenti (nessuna cancellazione automatica di dati dubbi).
      const existing = await prisma.supplier.findUnique({ where: { id: decision.matchSupplierId } });
      if (existing) {
        const patch: Record<string, unknown> = {};
        if (!existing.telefono && row.telefono) patch.telefono = row.telefono;
        if (!existing.citta && row.citta) patch.citta = row.citta;
        if (!existing.provincia && row.provincia) patch.provincia = row.provincia;
        if (!existing.regione && row.regione) patch.regione = row.regione;
        if (!existing.nomeCommerciale && row.nomeCommerciale) patch.nomeCommerciale = row.nomeCommerciale;
        if (existing.categorie.length === 0) {
          const categorie = normalizeCategoria(row.categoria);
          if (categorie.length > 0) patch.categorie = categorie;
        }
        if (Object.keys(patch).length > 0) {
          await prisma.supplier.update({
            where: { id: existing.id },
            data: { ...patch, importBatchId: batch.id, updatedAt: new Date() },
          });
          aggiornate++;
        }
      }
      continue;
    }

    await prisma.supplier.create({
      data: {
        ragioneSociale: row.ragioneSociale!,
        nomeCommerciale: row.nomeCommerciale,
        sito: row.sito,
        dominioNormalizzato: row.dominioNormalizzato,
        emailGenerale: row.email,
        emailNormalizzata: row.emailNormalizzata,
        telefono: row.telefono,
        citta: row.citta,
        provincia: row.provincia,
        regione: row.regione,
        paese: row.paese || "IT",
        noteInterne: [row.note, decision.motivoRevisione].filter(Boolean).join(" — ") || null,
        // Bug corretto: prima la colonna "categoria" veniva mappata e validata
        // ma poi scartata qui senza mai essere salvata, azzerando qualunque
        // segnale di categoria per il punteggio di compatibilità (Fase 6).
        categorie: normalizeCategoria(row.categoria),
        sourceType,
        isProprietary,
        verificationStatus: "NON_VERIFICATO",
        contactability: "SCONOSCIUTA",
        importBatchId: batch.id,
        createdByUserId: params.importedByUserId,
      },
    });
    importate++;
  }

  const report: ImportReport = {
    batchId: batch.id,
    righeTotali: params.decisions.length,
    importate,
    aggiornate,
    duplicate,
    scartate,
    mancantiEmail,
    emailNonValide,
    daRevisionare,
  };

  await prisma.supplierImportBatch.update({
    where: { id: batch.id },
    data: {
      status: "COMPLETED",
      imported: importate,
      updated: aggiornate,
      duplicates: duplicate,
      discarded: scartate,
      missingEmail: mancantiEmail,
      invalidEmail: emailNonValide,
      needsReview: daRevisionare,
      reportJson: report,
    },
  });

  return report;
}
