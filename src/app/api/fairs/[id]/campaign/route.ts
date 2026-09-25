import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { launchCampaign } from "@/lib/campaigns";

// OK dell'admin: congela la richiesta e mette in coda la campagna (l'invio lo fa n8n a ritmo controllato).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    return NextResponse.json(await launchCampaign(await getDb(), await requireActor(), (await params).id, await req.json()), { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
