import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { updateClientMailbox } from "@/lib/access";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    return NextResponse.json({ mailbox: await updateClientMailbox(await getDb(), await requireActor(), (await params).id, await req.json()) });
  } catch (err) {
    return apiError(err);
  }
}
