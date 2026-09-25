import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { apiError } from "@/lib/api";
import { readSignedJson } from "@/lib/n8nAuth";
import { recordSendResult } from "@/lib/outbox";

// n8n: esito dell'invio (id messaggio e thread Gmail, oppure errore).
export async function POST(req: Request) {
  try {
    return NextResponse.json(await recordSendResult(await getDb(), await readSignedJson(req)));
  } catch (err) {
    return apiError(err);
  }
}
