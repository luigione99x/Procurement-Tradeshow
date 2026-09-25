import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { setCampaignStatus } from "@/lib/campaigns";

// Sospendi / riprendi la campagna.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const { status } = z.object({ status: z.enum(["active", "paused"]) }).parse(await req.json());
    return NextResponse.json({ campaign: await setCampaignStatus(await getDb(), await requireActor(), (await params).id, status) });
  } catch (err) {
    return apiError(err);
  }
}
