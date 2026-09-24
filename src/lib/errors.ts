export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

// Una risorsa di un'altra organizzazione risponde 404 come una inesistente:
// cambiare un ID in URL non deve nemmeno rivelare che quell'ID esiste.
export const notFound = (what = "Risorsa") => new HttpError(404, `${what} non trovata`);
export const forbidden = (msg = "Operazione non consentita") => new HttpError(403, msg);
export const conflict = (msg: string) => new HttpError(409, msg);
export const badRequest = (msg: string) => new HttpError(400, msg);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: string) {
  return UUID_RE.test(v);
}

// Violazione di vincolo univoco Postgres (codice 23505), con qualunque driver.
export function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 4 && e; i++) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
