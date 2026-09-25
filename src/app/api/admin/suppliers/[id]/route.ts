import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { setSupplierActive } from "@/lib/campaigns";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const { active } = z.object({ active: z.boolean() }).parse(await req.json());
    return NextResponse.json({ supplier: await setSupplierActive(await getDb(), await requireActor(), (await params).id, active) });
  } catch (err) {
    return apiError(err);
  }
}
