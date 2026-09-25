import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { apiError } from "@/lib/api";
import { readSignedJson } from "@/lib/n8nAuth";
import { claimNextSend, policyFromEnv } from "@/lib/outbox";

// n8n (ogni 10 min): "c'è un'email da spedire da questa casella?" → al massimo una, oppure null con il motivo.
export async function POST(req: Request) {
  try {
    const { mailbox } = z.object({ mailbox: z.string().min(3) }).parse(await readSignedJson(req));
    return NextResponse.json(await claimNextSend(await getDb(), mailbox, new Date(), policyFromEnv()));
  } catch (err) {
    return apiError(err);
  }
}
