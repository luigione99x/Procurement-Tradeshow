import { workflow, node, trigger, newCredential, expr } from '@n8n/workflow-sdk';

const everyTen = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.4,
  config: { name: 'Ogni 10 minuti (lun-ven)', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 */10 8-18 * * 1-5' }] } } },
  output: [{}]
});
const signNext = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: "Firma richiesta prossima email", parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "const crypto = require('crypto');\nconst SECRET = \"__N8N_SHARED_SECRET__\";\nconst MAILBOX = \"__CASELLA_CLIENTE__\";\nconst sign = (payload) => {\n  const raw = JSON.stringify(payload);\n  const ts = Math.floor(Date.now() / 1000).toString();\n  const sig = crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex');\n  return { json: { raw, ts, sig } };\n};\nreturn [sign({ mailbox: MAILBOX })];" } },
  output: [{ raw: "{}", ts: "0", sig: "x" }]
});
const askNext = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: "Chiedi prossima email alla dashboard",
    parameters: {
      method: 'POST',
      url: "__BASE_URL__/api/n8n/outbox/next",
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
  output: [{ item: { recipientId: 'r1', to: 'a@b.it', subject: 'S', body: 'B' }, reason: null }]
});
const onlyIfItem = node({
  type: 'n8n-nodes-base.filter', version: 2.3,
  config: {
    name: "Solo se c'\u00e8 un'email da spedire",
    parameters: { conditions: {
      combinator: 'and',
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ leftValue: expr('{{ $json.item }}'), rightValue: '', operator: { type: 'object', operation: 'notEmpty', singleValue: true } }]
    } }
  },
  output: [{ item: { recipientId: 'r1', to: 'a@b.it', subject: 'S', body: 'B' } }]
});
const sendRfq = node({
  type: 'n8n-nodes-base.gmail', version: 2.2,
  config: {
    name: 'Invia richiesta da Gmail',
    parameters: { resource: 'message', operation: 'send', sendTo: expr('{{ $json.item.to }}'), subject: expr('{{ $json.item.subject }}'), emailType: 'text', message: expr('{{ $json.item.body }}'), options: { appendAttribution: false } },
    credentials: { gmailOAuth2: newCredential("Gmail __CASELLA_CLIENTE__") },
    onError: 'continueErrorOutput'
  },
  output: [{ id: 'gm1', threadId: 'th1', labelIds: ['SENT'] }]
});
const signSentOk = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: "Firma esito: inviata", parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "const crypto = require('crypto');\nconst SECRET = \"__N8N_SHARED_SECRET__\";\nconst MAILBOX = \"__CASELLA_CLIENTE__\";\nconst sign = (payload) => {\n  const raw = JSON.stringify(payload);\n  const ts = Math.floor(Date.now() / 1000).toString();\n  const sig = crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex');\n  return { json: { raw, ts, sig } };\n};\nconst it = $('Solo se c\\'\u00e8 un\\'email da spedire').first().json.item;\nreturn [sign({ recipientId: it.recipientId, ok: true, gmailMessageId: $input.first().json.id, gmailThreadId: $input.first().json.threadId })];" } },
  output: [{ raw: "{}", ts: "0", sig: "x" }]
});
const signSentErr = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: "Firma esito: errore", parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "const crypto = require('crypto');\nconst SECRET = \"__N8N_SHARED_SECRET__\";\nconst MAILBOX = \"__CASELLA_CLIENTE__\";\nconst sign = (payload) => {\n  const raw = JSON.stringify(payload);\n  const ts = Math.floor(Date.now() / 1000).toString();\n  const sig = crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex');\n  return { json: { raw, ts, sig } };\n};\nconst it = $('Solo se c\\'\u00e8 un\\'email da spedire').first().json.item;\nconst e = $input.first().json.error;\nreturn [sign({ recipientId: it.recipientId, ok: false, error: String((e && (e.message || e.description)) || JSON.stringify(e) || 'errore Gmail').slice(0, 1500) })];" } },
  output: [{ raw: "{}", ts: "0", sig: "x" }]
});
const reportSend = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: "Comunica esito alla dashboard",
    parameters: {
      method: 'POST',
      url: "__BASE_URL__/api/n8n/outbox/result",
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
export default workflow('mirialis-send-casella', "MIRIALIS \u00b7 __CASELLA_CLIENTE__ \u00b7 1 Invio campagna")
  .add(everyTen).to(signNext).to(askNext).to(onlyIfItem).to(sendRfq)
  .add(sendRfq.output(0).to(signSentOk.to(reportSend)))
  .add(sendRfq.output(1).to(signSentErr.to(reportSend)));
