import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { seedDemo } from "@/db/seedDemo";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";

// Crea i dati demo (solo admin). La password del cliente demo è mostrata una sola volta.
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    return NextResponse.json(await seedDemo(getDb(), await requireActor()));
  } catch (err) {
    return apiError(err);
  }
}
