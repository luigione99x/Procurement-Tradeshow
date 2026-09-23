import { NextRequest, NextResponse } from "next/server";
import { authOrThrow, handleApiError } from "@/lib/scope";
import { requireMiralisStaff } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { openaiStatus, anthropicStatus, serperStatus, gmailStatus } from "@/lib/integrations";
import { getGmailProfile } from "@/lib/gmail";
import { serperSearch } from "@/lib/serper";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const user = await authOrThrow();
    requireMiralisStaff(user);
    const { provider } = (await req.json()) as { provider: "OPENAI" | "ANTHROPIC" | "SERPER" | "GMAIL" };

    let connected = false;
    let lastError: string | null = null;
    let metadata: Record<string, unknown> = {};

    try {
      if (provider === "OPENAI") {
        if (!openaiStatus().configured) throw new Error("OPENAI_API_KEY non impostata");
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const models = await client.models.list();
        connected = (models.data?.length || 0) >= 0;
      } else if (provider === "ANTHROPIC") {
        if (!anthropicStatus().configured) throw new Error("ANTHROPIC_API_KEY non impostata");
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        await client.messages.create({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
          max_tokens: 8,
          messages: [{ role: "user", content: "ping" }],
        });
        connected = true;
      } else if (provider === "SERPER") {
        if (!serperStatus().configured) throw new Error("SERPER_API_KEY non impostata");
        await serperSearch("test connessione allestitori fiere");
        connected = true;
      } else if (provider === "GMAIL") {
        if (!gmailStatus().configured) throw new Error("Credenziali Gmail non complete");
        const profile = await getGmailProfile();
        connected = true;
        metadata = { emailAddress: profile.emailAddress };
      }
    } catch (err) {
      connected = false;
      lastError = err instanceof Error ? err.message : "Errore sconosciuto";
    }

    const record = await prisma.integrationConfig.upsert({
      where: { companyId_provider: { companyId: user.companyId, provider } },
      update: { connected, lastError, lastCheckedAt: new Date(), metadata: metadata as any },
      create: { companyId: user.companyId, provider, connected, lastError, lastCheckedAt: new Date(), metadata: metadata as any },
    });

    return NextResponse.json({ record });
  } catch (err) {
    return handleApiError(err);
  }
}
