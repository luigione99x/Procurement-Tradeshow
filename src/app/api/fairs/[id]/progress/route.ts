import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { campaignProgress } from "@/lib/access";
import { apiError } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";

// Cliente: solo contatori (contattati · risposte · interessati · preventivi).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json({ progress: await campaignProgress(getDb(), await requireActor(), (await params).id) });
  } catch (err) {
    return apiError(err);
  }
}
