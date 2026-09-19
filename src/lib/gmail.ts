import { google } from "googleapis";
import { simpleParser } from "mailparser";
import { requireGmail } from "./integrations";

function oauth2Client() {
  requireGmail();
  const client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );
  client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return client;
}

function gmailApi() {
  return google.gmail({ version: "v1", auth: oauth2Client() });
}

function encodeHeader(value: string) {
  // Consente oggetti con caratteri accentati/italiani nell'header Subject.
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

function buildMime(params: {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string;
  attachments?: { fileName: string; mimeType: string; content: Buffer }[];
}) {
  const boundary = `bnd_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const from = process.env.GMAIL_ADDRESS!;
  const headers = [
    `From: ${from}`,
    `To: ${params.to}`,
    `Subject: ${encodeHeader(params.subject)}`,
    "MIME-Version: 1.0",
  ];
  if (params.inReplyTo) headers.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references) headers.push(`References: ${params.references}`);

  const hasAttachments = (params.attachments?.length || 0) > 0;
  if (!hasAttachments) {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    headers.push("Content-Transfer-Encoding: 7bit");
    return headers.join("\r\n") + "\r\n\r\n" + params.text;
  }

  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  let body = `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${params.text}\r\n`;
  for (const att of params.attachments!) {
    body += `--${boundary}\r\nContent-Type: ${att.mimeType}; name="${att.fileName}"\r\nContent-Disposition: attachment; filename="${att.fileName}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${att.content.toString("base64")}\r\n`;
  }
  body += `--${boundary}--`;
  return headers.join("\r\n") + "\r\n\r\n" + body;
}

function base64url(input: string) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendMail(params: {
  to: string;
  subject: string;
  text: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: { fileName: string; mimeType: string; content: Buffer }[];
}) {
  const gmail = gmailApi();
  const raw = base64url(buildMime(params));
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId: params.threadId },
  });
  return { id: res.data.id!, threadId: res.data.threadId! };
}

export async function getGmailProfile() {
  const gmail = gmailApi();
  const res = await gmail.users.getProfile({ userId: "me" });
  return res.data;
}

// Recupera i messaggi nuovi rispetto all'ultimo historyId salvato (sync incrementale).
// Se historyId è null (prima sincronizzazione), recupera i messaggi ricevuti nelle ultime 24h
// nella label INBOX per evitare di importare l'intera casella.
export async function listNewMessages(lastHistoryId: string | null) {
  const gmail = gmailApi();
  const messageIds = new Set<string>();
  let newHistoryId: string | null = lastHistoryId;

  if (lastHistoryId) {
    try {
      let pageToken: string | undefined;
      do {
        const res = await gmail.users.history.list({
          userId: "me",
          startHistoryId: lastHistoryId,
          historyTypes: ["messageAdded"],
          pageToken,
        });
        for (const h of res.data.history || []) {
          for (const m of h.messagesAdded || []) {
            if (m.message?.id) messageIds.add(m.message.id);
          }
        }
        newHistoryId = res.data.historyId || newHistoryId;
        pageToken = res.data.nextPageToken || undefined;
      } while (pageToken);
      return { messageIds: Array.from(messageIds), newHistoryId };
    } catch (err: any) {
      // historyId troppo vecchio (>~7gg) o non valido: fallback a ricerca per data.
      if (err?.code !== 404) throw err;
    }
  }

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: "newer_than:2d in:inbox",
    maxResults: 50,
  });
  for (const m of listRes.data.messages || []) {
    if (m.id) messageIds.add(m.id);
  }
  const profile = await gmail.users.getProfile({ userId: "me" });
  newHistoryId = profile.data.historyId || newHistoryId;
  return { messageIds: Array.from(messageIds), newHistoryId };
}

export type MessaggioCompleto = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  bodyText: string;
  bodyHtml?: string;
  attachments: { fileName: string; mimeType: string; content: Buffer }[];
};

export async function getMessageFull(id: string): Promise<MessaggioCompleto> {
  const gmail = gmailApi();
  const res = await gmail.users.messages.get({ userId: "me", id, format: "raw" });
  const raw = res.data.raw!;
  const buf = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const parsed = await simpleParser(buf);

  const attachments = (parsed.attachments || []).map((a) => ({
    fileName: a.filename || "allegato",
    mimeType: a.contentType || "application/octet-stream",
    content: a.content as Buffer,
  }));

  return {
    id: res.data.id!,
    threadId: res.data.threadId!,
    from: parsed.from?.text || "",
    to: Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(", ") : parsed.to?.text || "",
    subject: parsed.subject || "",
    date: (parsed.date || new Date()).toISOString(),
    bodyText: parsed.text || "",
    bodyHtml: typeof parsed.html === "string" ? parsed.html : undefined,
    attachments,
  };
}
