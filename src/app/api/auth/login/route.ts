import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { apiError, assertSameOrigin } from "@/lib/api";
import { authenticate } from "@/lib/auth/login";
import { startSession } from "@/lib/auth/session";
import { HttpError } from "@/lib/errors";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const { email, password } = z.object({ email: z.string().min(3), password: z.string().min(1) }).parse(await req.json());
    const user = await authenticate(getDb(), email, password);
    if (!user) throw new HttpError(401, "Email o password non corrette");
    await startSession(user.id);
    return NextResponse.json({ ok: true, role: user.role });
  } catch (err) {
    return apiError(err);
  }
}
