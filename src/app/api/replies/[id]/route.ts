import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { campaignRecipients, campaigns, clientMailboxes, replyDrafts } from "@/db/schema";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { approveReply, saveDraft } from "@/lib/conversations";

// action=save: salva la bozza. action=send: approva (una sola volta) e avvisa n8n di spedire subito.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const db = await getDb();
    const actor = await requireActor();
    const { id } = await params;
    const body = await req.json();
    const { action } = z.object({ action: z.enum(["save", "send"]) }).parse(body);
    if (action === "save") return NextResponse.json({ draft: await saveDraft(db, actor, id, body) });

    const draft = await approveReply(db, actor, id, body);
    // Avviso a n8n: contiene solo il requestId; n8n poi prende in carico la risposta con una
    // chiamata firmata. Se l'avviso fallisce la risposta resta "approvata" e parte al giro periodico.
    const [box] = await db
      .select({ url: clientMailboxes.n8nReplyWebhookUrl })
      .from(replyDrafts)
      .innerJoin(campaignRecipients, eq(campaignRecipients.id, replyDrafts.recipientId))
      .innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId))
      .innerJoin(clientMailboxes, eq(clientMailboxes.id, campaigns.mailboxId))
      .where(eq(replyDrafts.id, draft.id));
    let notified = false;
    if (box?.url) {
      notified = await fetch(box.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: draft.requestId }),
        signal: AbortSignal.timeout(5000),
      })
        .then((r) => r.ok)
        .catch(() => false);
    }
    return NextResponse.json({ draft, notified });
  } catch (err) {
    return apiError(err);
  }
}
