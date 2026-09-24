import { createHmac, timingSafeEqual } from "crypto";

// Firma dei messaggi tra backend Mirialis e n8n (in entrambe le direzioni).
// firma = hex(HMAC-SHA256(segreto, `${timestamp}.${corpoGrezzo}`))
// Header: X-Mirialis-Timestamp (secondi Unix), X-Mirialis-Signature.
// Il timestamp nella firma impedisce il replay oltre la finestra di tolleranza.

export const TS_HEADER = "x-mirialis-timestamp";
export const SIG_HEADER = "x-mirialis-signature";
const TOLERANCE_SECONDS = 300;

export function signPayload(secret: string, rawBody: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return { timestamp: String(timestamp), signature };
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function verifySignature(params: {
  secret: string | undefined;
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  now?: number;
}): VerifyResult {
  if (!params.secret) return { ok: false, reason: "segreto non configurato" };
  if (!params.timestamp || !params.signature) return { ok: false, reason: "header di firma mancanti" };
  const ts = Number(params.timestamp);
  if (!Number.isInteger(ts)) return { ok: false, reason: "timestamp non valido" };
  const now = params.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TOLERANCE_SECONDS) return { ok: false, reason: "timestamp fuori finestra" };
  const expected = Buffer.from(signPayload(params.secret, params.rawBody, ts).signature, "hex");
  const given = Buffer.from(params.signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "firma non valida" };
  }
  return { ok: true };
}
