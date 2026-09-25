import { HttpError } from "./errors";
import { SIG_HEADER, TS_HEADER, verifySignature } from "./hmac";

// Legge e verifica una richiesta di n8n: firma HMAC-SHA256 su `${timestamp}.${corpo}` con
// N8N_SHARED_SECRET, timestamp entro 5 minuti. Solo dopo la verifica il corpo viene interpretato.
export async function readSignedJson(req: Request): Promise<unknown> {
  const raw = await req.text();
  const v = verifySignature({
    secret: process.env.N8N_SHARED_SECRET,
    rawBody: raw,
    timestamp: req.headers.get(TS_HEADER),
    signature: req.headers.get(SIG_HEADER),
  });
  if (!v.ok) throw new HttpError(401, `Firma n8n non valida: ${v.reason}`);
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "JSON non valido");
  }
}
