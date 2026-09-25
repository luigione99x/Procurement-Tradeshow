import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getFair } from "@/lib/access";
import { apiError } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json({ fair: await getFair(await getDb(), await requireActor(), (await params).id) });
  } catch (err) {
    return apiError(err);
  }
}
