import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { openaiAnalyzer } from "@/lib/ai";
import { apiError } from "@/lib/api";
import { readSignedJson } from "@/lib/n8nAuth";
import { recordInbound } from "@/lib/outbox";

export const maxDuration = 60;

// n8n: nuova email arrivata nella casella. Idempotente (stesso gmailMessageId = un solo record).
export async function POST(req: Request) {
  try {
    return NextResponse.json(await recordInbound(await getDb(), openaiAnalyzer, await readSignedJson(req)));
  } catch (err) {
    return apiError(err);
  }
}
