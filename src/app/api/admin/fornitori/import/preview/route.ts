import { NextRequest, NextResponse } from "next/server";
import { authOrThrow, handleApiError, ApiError } from "@/lib/scope";
import { requireMiralisAdmin } from "@/lib/authz";
import { parseFile, suggestMapping, applyMapping } from "@/lib/supplierImport";

export const maxDuration = 60;
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB: limite prudente per un file di import fornitori
const ALLOWED_EXT = [".csv", ".tsv", ".xlsx", ".xls"];

// Solo anteprima: rileva colonne, propone il mapping, mostra le prime righe.
// Non scrive nulla nel database (vedi /confirm per l'import effettivo).
export async function POST(req: NextRequest) {
  try {
    const user = await authOrThrow();
    requireMiralisAdmin(user);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "File mancante");
    if (!ALLOWED_EXT.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      throw new ApiError(400, `Formato non supportato. Ammessi: ${ALLOWED_EXT.join(", ")}`);
    }
    if (file.size > MAX_SIZE_BYTES) throw new ApiError(400, "File troppo grande (limite 15MB)");

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseFile(buffer, file.name);
    if (parsed.headers.length === 0) throw new ApiError(400, "Impossibile leggere intestazioni dal file");

    const suggestedMapping = suggestMapping(parsed.headers);
    const preview = applyMapping({ ...parsed, rows: parsed.rows.slice(0, 15) }, suggestedMapping);

    return NextResponse.json({
      format: parsed.format,
      headers: parsed.headers,
      totalRows: parsed.rows.length,
      suggestedMapping,
      previewRows: preview,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
