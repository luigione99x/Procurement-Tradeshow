import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { respondedSuppliers } from "@/lib/access";
import { apiError } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";

// Solo i fornitori che hanno risposto. Non esiste un endpoint cliente con l'elenco completo.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json({ suppliers: await respondedSuppliers(getDb(), await requireActor(), (await params).id) });
  } catch (err) {
    return apiError(err);
  }
}
