import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { endSession } from "@/lib/auth/session";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await endSession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
