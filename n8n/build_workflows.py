#!/usr/bin/env python3
"""Genera il codice n8n Workflow SDK dei 3 workflow Mirialis per UNA casella Gmail del cliente.

Uso:  python3 n8n/build_workflows.py <casella> <base_url> [secret] [bypass] > out.json
Senza secret/bypass scrive segnaposto (__N8N_SHARED_SECRET__, __VERCEL_BYPASS__): è la versione
da committare. I valori veri vivono solo dentro n8n.

Workflow per casella:
  1. Invio campagna   — ogni 10 min (lun–ven): chiede alla dashboard la prossima email, la spedisce
                        da Gmail, comunica id messaggio/thread o l'errore.
  2. Email in arrivo  — Gmail Trigger ogni minuto (non lette, INBOX): manda l'email alla dashboard,
                        poi la segna come letta (solo se la dashboard l'ha registrata).
  3. Invia risposta   — webhook (subito dopo "Invia" in dashboard) + giro ogni 10 min di riserva:
                        prende in carico UNA risposta approvata, risponde nel thread con CC.
Ogni chiamata alla dashboard è firmata HMAC-SHA256 su `${timestamp}.${corpo}`.
"""
import json
import sys

mailbox, base = sys.argv[1], sys.argv[2].rstrip("/")
secret = sys.argv[3] if len(sys.argv) > 3 else "__N8N_SHARED_SECRET__"
bypass = sys.argv[4] if len(sys.argv) > 4 else "__VERCEL_BYPASS__"
slug = mailbox.split("@")[0].replace(".", "-").lower()

SIGN = (
    "const crypto = require('crypto');\n"
    f"const SECRET = {json.dumps(secret)};\n"
    f"const MAILBOX = {json.dumps(mailbox)};\n"
    "const sign = (payload) => {\n"
    "  const raw = JSON.stringify(payload);\n"
    "  const ts = Math.floor(Date.now() / 1000).toString();\n"
    "  const sig = crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex');\n"
    "  return { json: { raw, ts, sig } };\n"
    "};\n"
)


def code_node(var, name, body, sample='{ raw: "{}", ts: "0", sig: "x" }'):
    js = SIGN + body
    return f"""const {var} = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: {json.dumps(name)}, parameters: {{ mode: 'runOnceForAllItems', language: 'javaScript', jsCode: {json.dumps(js)} }} }},
  output: [{sample}]
}});
"""


def http_node(var, name, path, sample, timeout=20000, retry=True):
    retry_cfg = "retryOnFail: true, maxTries: 3, waitBetweenTries: 3000" if retry else "retryOnFail: false"
    return f"""const {var} = node({{
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {{
    name: {json.dumps(name)},
    parameters: {{
      method: 'POST',
      url: {json.dumps(base + path)},
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: {{ parameters: [
        {{ name: 'x-mirialis-timestamp', value: expr('{{{{ $json.ts }}}}') }},
        {{ name: 'x-mirialis-signature', value: expr('{{{{ $json.sig }}}}') }},
        {{ name: 'x-vercel-protection-bypass', value: {json.dumps(bypass)} }}
      ] }},
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'application/json',
      body: expr('{{{{ $json.raw }}}}'),
      options: {{ timeout: {timeout} }}
    }},
    {retry_cfg}
  }},
  output: [{sample}]
}});
"""


def has_item_filter(var, name):
    return f"""const {var} = node({{
  type: 'n8n-nodes-base.filter', version: 2.3,
  config: {{
    name: {json.dumps(name)},
    parameters: {{ conditions: {{
      combinator: 'and',
      options: {{ caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }},
      conditions: [{{ leftValue: expr('{{{{ $json.item }}}}'), rightValue: '', operator: {{ type: 'object', operation: 'notEmpty', singleValue: true }} }}]
    }} }}
  }},
  output: [{{ item: {{ recipientId: 'r1', to: 'a@b.it', subject: 'S', body: 'B' }} }}]
}});
"""


GMAIL_CRED = f"credentials: {{ gmailOAuth2: newCredential({json.dumps('Gmail ' + mailbox)}) }}"
SCHEDULE = """const everyTen = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.4,
  config: { name: 'Ogni 10 minuti (lun-ven)', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 */10 8-18 * * 1-5' }] } } },
  output: [{}]
});
"""
HEADER = "import { workflow, node, trigger, newCredential, expr } from '@n8n/workflow-sdk';\n\n"

# ---------- 1. Invio campagna ----------
w1 = HEADER + SCHEDULE
w1 += code_node("signNext", "Firma richiesta prossima email", "return [sign({ mailbox: MAILBOX })];")
w1 += http_node("askNext", "Chiedi prossima email alla dashboard", "/api/n8n/outbox/next", "{ item: { recipientId: 'r1', to: 'a@b.it', subject: 'S', body: 'B' }, reason: null }", retry=False)
w1 += has_item_filter("onlyIfItem", "Solo se c'è un'email da spedire")
w1 += f"""const sendRfq = node({{
  type: 'n8n-nodes-base.gmail', version: 2.2,
  config: {{
    name: 'Invia richiesta da Gmail',
    parameters: {{ resource: 'message', operation: 'send', sendTo: expr('{{{{ $json.item.to }}}}'), subject: expr('{{{{ $json.item.subject }}}}'), emailType: 'text', message: expr('{{{{ $json.item.body }}}}'), options: {{ appendAttribution: false }} }},
    {GMAIL_CRED},
    onError: 'continueErrorOutput'
  }},
  output: [{{ id: 'gm1', threadId: 'th1', labelIds: ['SENT'] }}]
}});
"""
w1 += code_node("signSentOk", "Firma esito: inviata", "const it = $('Solo se c\\'è un\\'email da spedire').first().json.item;\nreturn [sign({ recipientId: it.recipientId, ok: true, gmailMessageId: $input.first().json.id, gmailThreadId: $input.first().json.threadId })];")
w1 += code_node("signSentErr", "Firma esito: errore", "const it = $('Solo se c\\'è un\\'email da spedire').first().json.item;\nconst e = $input.first().json.error;\nreturn [sign({ recipientId: it.recipientId, ok: false, error: String((e && (e.message || e.description)) || JSON.stringify(e) || 'errore Gmail').slice(0, 1500) })];")
w1 += http_node("reportSend", "Comunica esito alla dashboard", "/api/n8n/outbox/result", "{ status: 'sent' }")
w1 += f"""export default workflow('mirialis-send-{slug}', {json.dumps('MIRIALIS · ' + mailbox + ' · 1 Invio campagna')})
  .add(everyTen).to(signNext).to(askNext).to(onlyIfItem).to(sendRfq)
  .add(sendRfq.output(0).to(signSentOk.to(reportSend)))
  .add(sendRfq.output(1).to(signSentErr.to(reportSend)));
"""

# ---------- 2. Email in arrivo ----------
w2 = HEADER
w2 += f"""const newMail = trigger({{
  type: 'n8n-nodes-base.gmailTrigger', version: 1.4,
  config: {{
    name: 'Nuova email ricevuta',
    parameters: {{ pollTimes: {{ item: [{{ mode: 'everyMinute' }}] }}, event: 'messageReceived', simple: false, maxResults: 10,
      filters: {{ readStatus: 'unread', labelIds: ['INBOX'], q: 'in:inbox -from:me' }}, options: {{ downloadAttachments: false }} }},
    {GMAIL_CRED}
  }},
  output: [{{ id: 'gm2', threadId: 'th1', subject: 'Re: S', text: 'Offerta', date: '2026-10-07T10:00:00Z', from: {{ text: 'Fornitore <a@b.it>' }}, to: {{ text: 'rfq@x.it' }} }}]
}});
"""
w2 += code_node(
    "signInbound",
    "Firma email per la dashboard",
    "return $input.all().map((it) => { const m = it.json; return sign({ mailbox: MAILBOX, gmailMessageId: m.id, gmailThreadId: m.threadId, from: (m.from && m.from.text) || '', to: (m.to && m.to.text) || '', subject: m.subject || '', text: m.text || '', date: m.date || '' }); });",
)
w2 += http_node("postInbound", "Registra email nella dashboard", "/api/n8n/inbound", "{ status: 'stored' }", timeout=60000)
w2 += f"""const markRead = node({{
  type: 'n8n-nodes-base.gmail', version: 2.2,
  config: {{ name: 'Segna come letta', parameters: {{ resource: 'message', operation: 'markAsRead', messageId: expr('{{{{ $("Nuova email ricevuta").item.json.id }}}}') }}, {GMAIL_CRED} }},
  output: [{{ id: 'gm2' }}]
}});
export default workflow('mirialis-inbound-{slug}', {json.dumps('MIRIALIS · ' + mailbox + ' · 2 Email in arrivo')})
  .add(newMail).to(signInbound).to(postInbound).to(markRead);
"""

# ---------- 3. Invia risposta ----------
w3 = HEADER + SCHEDULE
w3 += f"""const replyHook = trigger({{
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: {{ name: 'Risposta approvata in dashboard', parameters: {{ httpMethod: 'POST', path: {json.dumps('mirialis-risposta-' + slug)}, responseMode: 'onReceived' }} }},
  output: [{{ body: {{ requestId: '00000000-0000-0000-0000-000000000000' }} }}]
}});
"""
w3 += code_node("signClaim", "Firma presa in carico risposta", "const b = $input.first().json.body || {};\nreturn [sign(b.requestId ? { mailbox: MAILBOX, requestId: String(b.requestId) } : { mailbox: MAILBOX })];")
w3 += http_node("claimReply", "Prendi risposta da inviare", "/api/n8n/replies/next", "{ item: { requestId: 'q1', replyToGmailMessageId: 'gm2', threadId: 'th1', to: 'a@b.it', cc: '', subject: 'Re: S', body: 'B' } }", retry=False)
w3 += has_item_filter("onlyIfReply", "Solo se c'è una risposta da inviare")
w3 += f"""const sendReply = node({{
  type: 'n8n-nodes-base.gmail', version: 2.2,
  config: {{
    name: 'Rispondi nel thread Gmail',
    parameters: {{ resource: 'message', operation: 'reply', messageId: expr('{{{{ $json.item.replyToGmailMessageId }}}}'), emailType: 'text', message: expr('{{{{ $json.item.body }}}}'),
      options: {{ appendAttribution: false, replyToSenderOnly: true, ccList: expr('{{{{ $json.item.cc }}}}') }} }},
    {GMAIL_CRED},
    onError: 'continueErrorOutput'
  }},
  output: [{{ id: 'gm3', threadId: 'th1' }}]
}});
"""
w3 += code_node("signReplyOk", "Firma esito risposta: inviata", "const it = $('Solo se c\\'è una risposta da inviare').first().json.item;\nreturn [sign({ requestId: it.requestId, ok: true, gmailMessageId: $input.first().json.id })];")
w3 += code_node("signReplyErr", "Firma esito risposta: errore", "const it = $('Solo se c\\'è una risposta da inviare').first().json.item;\nconst e = $input.first().json.error;\nreturn [sign({ requestId: it.requestId, ok: false, error: String((e && (e.message || e.description)) || JSON.stringify(e) || 'errore Gmail').slice(0, 1500) })];")
w3 += http_node("reportReply", "Comunica esito risposta", "/api/n8n/replies/result", "{ status: 'sent' }")
w3 += f"""export default workflow('mirialis-reply-{slug}', {json.dumps('MIRIALIS · ' + mailbox + ' · 3 Invia risposta')})
  .add(replyHook).to(signClaim)
  .add(everyTen).to(signClaim)
  .add(signClaim).to(claimReply).to(onlyIfReply).to(sendReply)
  .add(sendReply.output(0).to(signReplyOk.to(reportReply)))
  .add(sendReply.output(1).to(signReplyErr.to(reportReply)));
"""

print(json.dumps({"send": w1, "inbound": w2, "reply": w3, "webhookPath": "mirialis-risposta-" + slug}))
