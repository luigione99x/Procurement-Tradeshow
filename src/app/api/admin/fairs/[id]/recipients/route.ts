import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { allRecipientsForAdmin } from "@/lib/access";
import { apiError } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json({ recipients: await allRecipientsForAdmin(getDb(), await requireActor(), (await params).id) });
  } catch (err) {
    return apiError(err);
  }
}
