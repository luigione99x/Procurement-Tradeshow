import { workflow, node, trigger, newCredential, expr } from '@n8n/workflow-sdk';

const everyTen = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.4,
  config: { name: 'Ogni 10 minuti (lun-ven)', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 */10 8-18 * * 1-5' }] } } },
  output: [{}]
});
const replyHook = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'Risposta approvata in dashboard', parameters: { httpMethod: 'POST', path: "mirialis-risposta-casella", responseMode: 'onReceived' } },
  output: [{ body: { requestId: '00000000-0000-0000-0000-000000000000' } }]
});
const signClaim = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: "Firma presa in carico risposta", parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "const crypto = require('crypto');\nconst SECRET = \"__N8N_SHARED_SECRET__\";\nconst MAILBOX = \"__CASELLA_CLIENTE__\";\nconst sign = (payload) => {\n  const raw = JSON.stringify(payload);\n  const ts = Math.floor(Date.now() / 1000).toString();\n  const sig = crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex');\n  return { json: { raw, ts, sig } };\n};\nconst b = $input.first().json.body || {};\nreturn [sign(b.requestId ? { mailbox: MAILBOX, requestId: String(b.requestId) } : { mailbox: MAILBOX })];" } },
  output: [{ raw: "{}", ts: "0", sig: "x" }]
});
const claimReply = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: "Prendi risposta da inviare",
    parameters: {
      method: 'POST',
      url: "__BASE_URL__/api/n8n/replies/next",
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
      options: { timeout: 20000 }
    },
    retryOnFail: false
  },
  output: [{ item: { requestId: 'q1', replyToGmailMessageId: 'gm2', threadId: 'th1', to: 'a@b.it', cc: '', subject: 'Re: S', body: 'B' } }]
});
const onlyIfReply = node({
  type: 'n8n-nodes-base.filter', version: 2.3,
  config: {
    name: "Solo se c'\u00e8 una risposta da inviare",
    parameters: { conditions: {
      combinator: 'and',
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ leftValue: expr('{{ $json.item }}'), rightValue: '', operator: { type: 'object', operation: 'notEmpty', singleValue: true } }]
    } }
  },
  output: [{ item: { recipientId: 'r1', to: 'a@b.it', subject: 'S', body: 'B' } }]
});
const sendReply = node({
  type: 'n8n-nodes-base.gmail', version: 2.2,
  config: {
    name: 'Rispondi nel thread Gmail',
    parameters: { resource: 'message', operation: 'reply', messageId: expr('{{ $json.item.replyToGmailMessageId }}'), emailType: 'text', message: expr('{{ $json.item.body }}'),
      options: { appendAttribution: false, replyToSenderOnly: true, ccList: expr('{{ $json.item.cc }}') } },
    credentials: { gmailOAuth2: newCredential("Gmail __CASELLA_CLIENTE__") },
    onError: 'continueErrorOutput'
  },
  output: [{ id: 'gm3', threadId: 'th1' }]
});
const signReplyOk = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: "Firma esito risposta: inviata", parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "const crypto = require('crypto');\nconst SECRET = \"__N8N_SHARED_SECRET__\";\nconst MAILBOX = \"__CASELLA_CLIENTE__\";\nconst sign = (payload) => {\n  const raw = JSON.stringify(payload);\n  const ts = Math.floor(Date.now() / 1000).toString();\n  const sig = crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex');\n  return { json: { raw, ts, sig } };\n};\nconst it = $('Solo se c\\'\u00e8 una risposta da inviare').first().json.item;\nreturn [sign({ requestId: it.requestId, ok: true, gmailMessageId: $input.first().json.id })];" } },
  output: [{ raw: "{}", ts: "0", sig: "x" }]
});
const signReplyErr = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: "Firma esito risposta: errore", parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "const crypto = require('crypto');\nconst SECRET = \"__N8N_SHARED_SECRET__\";\nconst MAILBOX = \"__CASELLA_CLIENTE__\";\nconst sign = (payload) => {\n  const raw = JSON.stringify(payload);\n  const ts = Math.floor(Date.now() / 1000).toString();\n  const sig = crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex');\n  return { json: { raw, ts, sig } };\n};\nconst it = $('Solo se c\\'\u00e8 una risposta da inviare').first().json.item;\nconst e = $input.first().json.error;\nreturn [sign({ requestId: it.requestId, ok: false, error: String((e && (e.message || e.description)) || JSON.stringify(e) || 'errore Gmail').slice(0, 1500) })];" } },
  output: [{ raw: "{}", ts: "0", sig: "x" }]
});
const reportReply = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: "Comunica esito risposta",
    parameters: {
      method: 'POST',
      url: "__BASE_URL__/api/n8n/replies/result",
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
      options: { timeout: 20000 }
    },
    retryOnFail: true, maxTries: 3, waitBetweenTries: 3000
  },
  output: [{ status: 'sent' }]
});
export default workflow('mirialis-reply-casella', "MIRIALIS \u00b7 __CASELLA_CLIENTE__ \u00b7 3 Invia risposta")
  .add(replyHook).to(signClaim)
  .add(everyTen).to(signClaim)
  .add(signClaim).to(claimReply).to(onlyIfReply).to(sendReply)
  .add(sendReply.output(0).to(signReplyOk.to(reportReply)))
  .add(sendReply.output(1).to(signReplyErr.to(reportReply)));
