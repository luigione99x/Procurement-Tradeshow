import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { createFair, listFairs } from "@/lib/access";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";

export async function GET() {
  try {
    return NextResponse.json({ fairs: await listFairs(await getDb(), await requireActor()) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const fair = await createFair(await getDb(), await requireActor(), await req.json());
    return NextResponse.json({ fair }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
