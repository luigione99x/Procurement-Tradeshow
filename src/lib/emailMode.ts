// Gate di sicurezza sugli invii email reali (Sezione 15 del brief Miralis).
// Applicato a OGNI punto che chiama lib/gmail.ts#sendMail: nessun invio reale
// deve poter partire per errore da un ambiente di sviluppo/test.
export type EmailMode = "sandbox" | "draft_only" | "live";

export function emailMode(): EmailMode {
  const raw = (process.env.EMAIL_MODE || "").toLowerCase();
  if (raw === "live") return "live";
  if (raw === "draft_only") return "draft_only";
  return "sandbox"; // default sicuro se non impostata esplicitamente
}

function allowlist(): string[] {
  return (process.env.EMAIL_TEST_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowlisted(email: string) {
  return allowlist().includes(email.trim().toLowerCase());
}

export class EmailModeBlockedError extends Error {
  status = 409;
}

// Da chiamare SEMPRE prima di lib/gmail.ts#sendMail. Lancia un errore chiaro
// se l'invio non è consentito nella modalità corrente, invece di inviare per
// errore un'email reale a un fornitore vero durante lo sviluppo.
export function assertCanSendReal(toEmail: string) {
  const mode = emailMode();
  if (mode === "live") return;
  if (mode === "sandbox") {
    if (isAllowlisted(toEmail)) return;
    throw new EmailModeBlockedError(
      `EMAIL_MODE=sandbox: invio bloccato verso "${toEmail}" (non presente in EMAIL_TEST_ALLOWLIST). ` +
        `Aggiungi l'indirizzo alla allowlist per collaudare, oppure imposta EMAIL_MODE=live per l'uso reale.`
    );
  }
  // draft_only: non ancora implementato (richiede creare bozze Gmail invece di
  // inviare); bloccare esplicitamente evita un invio reale silenzioso.
  throw new EmailModeBlockedError(
    "EMAIL_MODE=draft_only non è ancora implementato in questa versione: nessuna email viene inviata. " +
      "Usa EMAIL_MODE=sandbox per il collaudo o EMAIL_MODE=live per l'invio reale."
  );
}
