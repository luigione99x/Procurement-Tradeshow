import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { apiError } from "@/lib/api";
import { readSignedJson } from "@/lib/n8nAuth";
import { claimReply, policyFromEnv } from "@/lib/outbox";

// n8n: prende in carico una risposta approvata (una sola volta) da inviare nel thread.
export async function POST(req: Request) {
  try {
    const { mailbox, requestId } = z.object({ mailbox: z.string().min(3), requestId: z.string().optional() }).parse(await readSignedJson(req));
    return NextResponse.json(await claimReply(await getDb(), mailbox, requestId, policyFromEnv()));
  } catch (err) {
    return apiError(err);
  }
}
