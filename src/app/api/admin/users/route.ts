import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { createUser } from "@/lib/access";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    return NextResponse.json({ user: await createUser(getDb(), await requireActor(), await req.json()) }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
