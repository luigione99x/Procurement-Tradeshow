import { workflow, node, trigger, newCredential, expr } from '@n8n/workflow-sdk';

const newMail = trigger({
  type: 'n8n-nodes-base.gmailTrigger', version: 1.4,
  config: {
    name: 'Nuova email ricevuta',
    parameters: { pollTimes: { item: [{ mode: 'everyMinute' }] }, event: 'messageReceived', simple: false, maxResults: 10,
      filters: { readStatus: 'unread', labelIds: ['INBOX'], q: 'in:inbox -from:me' }, options: { downloadAttachments: false } },
    credentials: { gmailOAuth2: newCredential("Gmail __CASELLA_CLIENTE__") }
  },
  output: [{ id: 'gm2', threadId: 'th1', subject: 'Re: S', text: 'Offerta', date: '2026-10-07T10:00:00Z', from: { text: 'Fornitore <a@b.it>' }, to: { text: 'rfq@x.it' } }]
});
const signInbound = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: "Firma email per la dashboard", parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "const crypto = require('crypto');\nconst SECRET = \"__N8N_SHARED_SECRET__\";\nconst MAILBOX = \"__CASELLA_CLIENTE__\";\nconst sign = (payload) => {\n  const raw = JSON.stringify(payload);\n  const ts = Math.floor(Date.now() / 1000).toString();\n  const sig = crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex');\n  return { json: { raw, ts, sig } };\n};\nreturn $input.all().map((it) => { const m = it.json; return sign({ mailbox: MAILBOX, gmailMessageId: m.id, gmailThreadId: m.threadId, from: (m.from && m.from.text) || '', to: (m.to && m.to.text) || '', subject: m.subject || '', text: m.text || '', date: m.date || '' }); });" } },
  output: [{ raw: "{}", ts: "0", sig: "x" }]
});
const postInbound = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: "Registra email nella dashboard",
    parameters: {
      method: 'POST',
      url: "__BASE_URL__/api/n8n/inbound",
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'x-mirialis-timestamp', value: expr('{{ $json.ts }}') },
        { name: 'x-mirialis-signature', value: expr('{{ $json.sig }}') },
        { name: 'x-vercel-protection-bypass', value: "__VERCEL_BYPASS__" }
      ] },
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'application/json',
      body: expr('{{ $json.raw }}'),
      options: { timeout: 60000 }
    },
    retryOnFail: true, maxTries: 3, waitBetweenTries: 3000
  },
  output: [{ status: 'stored' }]
});
const markRead = node({
  type: 'n8n-nodes-base.gmail', version: 2.2,
  config: { name: 'Segna come letta', parameters: { resource: 'message', operation: 'markAsRead', messageId: expr('{{ $("Nuova email ricevuta").item.json.id }}') }, credentials: { gmailOAuth2: newCredential("Gmail __CASELLA_CLIENTE__") } },
  output: [{ id: 'gm2' }]
});
export default workflow('mirialis-inbound-casella', "MIRIALIS \u00b7 __CASELLA_CLIENTE__ \u00b7 2 Email in arrivo")
  .add(newMail).to(signInbound).to(postInbound).to(markRead);
