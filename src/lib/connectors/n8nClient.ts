import { SIG_HEADER, TS_HEADER, signPayload } from "./hmac";

// POST firmato (HMAC con timestamp) dal backend verso un webhook n8n.
// Unico canale in uscita del backend verso le integrazioni: le caselle dei clienti sono
// raggiungibili solo tramite n8n, che ne custodisce le credenziali.

export async function n8nSignedPost(urlEnv: string, payload: unknown, timeoutMs = 15_000) {
  const url = process.env[urlEnv];
  if (!url) throw new Error(`Integrazione non configurata: ${urlEnv} mancante.`);
  const secret = process.env.N8N_SHARED_SECRET;
  if (!secret) throw new Error("Integrazione non configurata: N8N_SHARED_SECRET mancante.");
  const raw = JSON.stringify(payload);
  const { timestamp, signature } = signPayload(secret, raw);
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", [TS_HEADER]: timestamp, [SIG_HEADER]: signature },
    body: raw,
    signal: AbortSignal.timeout(timeoutMs),
  });
}
