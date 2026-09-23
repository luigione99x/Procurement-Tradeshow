import { NextRequest, NextResponse } from "next/server";
import { authOrThrow, handleApiError, ApiError } from "@/lib/scope";
import { requireMiralisAdmin } from "@/lib/authz";
import { parseFile, applyMapping, planImport, importSuppliers, type ColumnMapping } from "@/lib/supplierImport";

export const maxDuration = 120;
const MAX_SIZE_BYTES = 15 * 1024 * 1024;

// Import effettivo (Sezione 7): richiede lo stesso file gia' visto in /preview
// e il mapping colonne confermato dall'operatore. Ogni riga viene rivalutata
// (validazione + dedup contro l'archivio esistente) prima di scrivere.
export async function POST(req: NextRequest) {
  try {
    const user = await authOrThrow();
    requireMiralisAdmin(user);

    const form = await req.formData();
    const file = form.get("file");
    const mappingRaw = form.get("mapping");
    if (!(file instanceof File)) throw new ApiError(400, "File mancante");
    if (typeof mappingRaw !== "string") throw new ApiError(400, "Mapping colonne mancante");
    if (file.size > MAX_SIZE_BYTES) throw new ApiError(400, "File troppo grande (limite 15MB)");

    let mapping: ColumnMapping;
    try {
      mapping = JSON.parse(mappingRaw);
    } catch {
      throw new ApiError(400, "Mapping colonne non valido (JSON atteso)");
    }
    if (!mapping.ragioneSociale) throw new ApiError(400, "Il campo 'ragione sociale' deve essere mappato");

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseFile(buffer, file.name);
    const mappedRows = applyMapping(parsed, mapping);
    const decisions = await planImport(mappedRows);

    const report = await importSuppliers({
      fileName: file.name,
      format: parsed.format,
      mapping,
      decisions,
      importedByUserId: user.id,
    });

    // AuditLog e' scoped per pratica (Sezione 12): un import del database
    // fornitori e' un'azione globale, non legata a un progetto. Il tracciamento
    // durevole e revisionabile e' SupplierImportBatch stesso (righe totali,
    // importate, duplicate, da revisionare, chi e quando: vedi Sezione 7).
    return NextResponse.json({ report });
  } catch (err) {
    return handleApiError(err);
  }
}
