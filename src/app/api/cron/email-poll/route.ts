import { NextRequest, NextResponse } from "next/server";
import { gmailStatus } from "@/lib/integrations";
import { eseguiPollGmail } from "@/lib/jobs/pollGmail";

export const maxDuration = 120;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  if (!gmailStatus().configured) {
    return NextResponse.json({ skipped: true, reason: "Gmail non configurato" });
  }

  try {
    const result = await eseguiPollGmail();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Errore" }, { status: 500 });
  }
}
