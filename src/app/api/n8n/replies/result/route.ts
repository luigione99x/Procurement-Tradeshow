import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { apiError } from "@/lib/api";
import { readSignedJson } from "@/lib/n8nAuth";
import { recordReplyResult } from "@/lib/outbox";

export async function POST(req: Request) {
  try {
    return NextResponse.json(await recordReplyResult(await getDb(), await readSignedJson(req)));
  } catch (err) {
    return apiError(err);
  }
}
