import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { saveRfq } from "@/lib/campaigns";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    return NextResponse.json({ rfq: await saveRfq(await getDb(), await requireActor(), (await params).id, await req.json()) });
  } catch (err) {
    return apiError(err);
  }
}
