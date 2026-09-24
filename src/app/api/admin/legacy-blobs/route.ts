import { del, list } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";

// Una tantum: elimina i file caricati dal vecchio prototipo (prefisso "pratiche/", URL pubblici).
// Da rimuovere dopo l'uso.
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    requireAdmin(await requireActor());
    const { blobs } = await list({ prefix: "pratiche/" });
    if (blobs.length) await del(blobs.map((b) => b.url));
    return NextResponse.json({ deleted: blobs.map((b) => b.pathname) });
  } catch (err) {
    return apiError(err);
  }
}
