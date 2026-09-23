import { NextRequest, NextResponse } from "next/server";
import { gmailStatus } from "@/lib/integrations";
import { eseguiPollGmail } from "@/lib/jobs/pollGmail";
import { eseguiInvioInCodaGiornaliero } from "@/lib/jobs/inviaRfq";

export const maxDuration = 120;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// Riusa questo stesso cron giornaliero (unico slot disponibile sul piano
// Vercel Hobby) anche per riprendere la coda RFQ (Sezione 16): chi non è
// partito ieri per il tetto giornaliero riparte oggi, invece di restare
// bloccato fino a un nuovo intervento manuale.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const risultato: Record<string, unknown> = {};

  if (gmailStatus().configured) {
    try {
      risultato.poll = await eseguiPollGmail();
    } catch (err) {
      risultato.pollError = err instanceof Error ? err.message : "Errore";
    }
    try {
      risultato.rfqInCoda = await eseguiInvioInCodaGiornaliero();
    } catch (err) {
      risultato.rfqInCodaError = err instanceof Error ? err.message : "Errore";
    }
  } else {
    risultato.skipped = true;
    risultato.reason = "Gmail non configurato";
  }

  return NextResponse.json({ ok: true, ...risultato });
}
