import { SignJWT, jwtVerify } from "jose";

// Token di sessione firmato (cookie httpOnly). Contiene solo l'id utente: ruolo e
// organizzazione si rileggono dal DB a ogni richiesta, così un cambio di ruolo vale subito.

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET mancante o troppo corta (min 32 caratteri)");
  return new TextEncoder().encode(s);
}

export async function signSession(userId: string) {
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("7d").sign(key());
}

export async function readSession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
