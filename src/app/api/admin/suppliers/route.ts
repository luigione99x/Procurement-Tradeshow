import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { importSuppliers, listSuppliers } from "@/lib/campaigns";

export async function GET() {
  try {
    return NextResponse.json({ suppliers: await listSuppliers(await getDb(), await requireActor()) });
  } catch (err) {
    return apiError(err);
  }
}

// Import della rubrica: una riga per fornitore ("email;Azienda", "Azienda <email>", ...).
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    return NextResponse.json(await importSuppliers(await getDb(), await requireActor(), await req.json()));
  } catch (err) {
    return apiError(err);
  }
}
