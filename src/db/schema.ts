import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Schema Mirialis. Ogni dato di prodotto è legato a un'organizzazione (e dove serve a una fiera).
// Le regole che il database può garantire da solo (unicità, massimo 2 caselle per cliente,
// idempotenza degli eventi esterni) sono vincoli qui, non solo controlli nel codice.

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const organizationKind = pgEnum("organization_kind", ["mirialis", "client"]);
export const userRole = pgEnum("user_role", ["admin", "client"]);

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  kind: organizationKind("kind").notNull(),
  // dati demo separati da quelli reali: mai mescolati in liste o contatori reali
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    // admin = staff Mirialis (vede tutte le organizzazioni); client = solo la propria
    role: userRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`), index("users_org_idx").on(t.organizationId)]
);

// 1–2 caselle dedicate per cliente (D15). slot ∈ {1,2} + unicità (org, slot) = massimo 2, garantito dal DB.
// Le credenziali della casella stanno solo in n8n: qui c'è solo il nome della credenziale.
export const clientMailboxes = pgTable(
  "client_mailboxes",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    slot: smallint("slot").notNull(),
    email: text("email").notNull(),
    n8nCredentialName: text("n8n_credential_name"),
    // webhook del workflow n8n "Invia risposta" di questa casella: la dashboard lo chiama dopo "Invia"
    // per spedire subito (senza aspettare il giro periodico). Contiene solo un requestId, nessun dato.
    n8nReplyWebhookUrl: text("n8n_reply_webhook_url"),
    createdAt: createdAt(),
  },
  (t) => [
    check("client_mailboxes_slot_ck", sql`${t.slot} in (1, 2)`),
    uniqueIndex("client_mailboxes_org_slot_uq").on(t.organizationId, t.slot),
    uniqueIndex("client_mailboxes_email_uq").on(sql`lower(${t.email})`),
  ]
);

export const fairs = pgTable(
  "fairs",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(), // nome della fiera/evento
    venue: text("venue"),
    city: text("city"),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    contactName: text("contact_name"), // referente aziendale (CC di default nelle risposte)
    contactEmail: text("contact_email"),
    standNotes: text("stand_notes"),
    budgetCents: bigint("budget_cents", { mode: "number" }),
    currency: text("currency").notNull().default("EUR"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fairs_org_idx").on(t.organizationId)]
);

// Rubrica fornitori di Mirialis ("la solita lista"): ogni campagna la usa come destinatari.
export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    email: text("email").notNull(),
    companyName: text("company_name"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("suppliers_email_uq").on(sql`lower(${t.email})`)]
);

export const rfqStatus = pgEnum("rfq_status", ["draft", "approved"]);

// Bozza della richiesta stand, versionata. Una versione approvata è congelata: è il testo
// che i fornitori ricevono. Modifiche successive creano una nuova versione.
export const rfqVersions = pgTable(
  "rfq_versions",
  {
    id: id(),
    fairId: uuid("fair_id")
      .notNull()
      .references(() => fairs.id),
    version: integer("version").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: rfqStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("rfq_versions_fair_version_uq").on(t.fairId, t.version)]
);

export const campaignStatus = pgEnum("campaign_status", ["active", "paused", "completed"]);

export const campaigns = pgTable(
  "campaigns",
  {
    id: id(),
    fairId: uuid("fair_id")
      .notNull()
      .references(() => fairs.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    rfqVersionId: uuid("rfq_version_id")
      .notNull()
      .references(() => rfqVersions.id),
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => clientMailboxes.id), // Gmail del cliente da cui partono le email
    status: campaignStatus("status").notNull().default("active"),
    dailyLimit: integer("daily_limit").notNull().default(20),
    intervalMinutes: integer("interval_minutes").notNull().default(10),
    approvedBy: uuid("approved_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("campaigns_fair_idx").on(t.fairId), uniqueIndex("campaigns_fair_uq").on(t.fairId)]
);

export const recipientStatus = pgEnum("recipient_status", ["queued", "sending", "sent", "failed", "replied"]);

export const campaignRecipients = pgTable(
  "campaign_recipients",
  {
    id: id(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    position: integer("position").notNull(), // ordine di invio
    status: recipientStatus("status").notNull().default("queued"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }), // preso in carico da n8n
    firstSentAt: timestamp("first_sent_at", { withTimezone: true }), // solo su conferma di invio da n8n
    firstReplyAt: timestamp("first_reply_at", { withTimezone: true }),
    gmailThreadId: text("gmail_thread_id"), // collega le risposte del fornitore a questo destinatario
    gmailMessageId: text("gmail_message_id"),
    interested: boolean("interested"),
    quoteReceived: boolean("quote_received").notNull().default(false),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("campaign_recipients_uq").on(t.campaignId, t.supplierId),
    uniqueIndex("campaign_recipients_thread_uq").on(t.gmailThreadId),
    index("campaign_recipients_status_idx").on(t.status),
  ]
);

export const messageDirection = pgEnum("message_direction", ["inbound", "outbound"]);

// Email del thread con un fornitore. gmail_message_id univoco = la stessa email ricevuta due
// volte (retry di n8n) produce un solo record.
export const messages = pgTable(
  "messages",
  {
    id: id(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => campaignRecipients.id),
    direction: messageDirection("direction").notNull(),
    gmailMessageId: text("gmail_message_id").notNull(),
    fromAddress: text("from_address"),
    toAddress: text("to_address"),
    cc: text("cc"),
    subject: text("subject"),
    bodyText: text("body_text"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    aiCategory: text("ai_category"), // interessato | chiede_chiarimenti | preventivo | non_disponibile | risposta_automatica | da_verificare
    aiSummary: text("ai_summary"),
    aiPriceCents: bigint("ai_price_cents", { mode: "number" }),
    aiError: text("ai_error"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("messages_gmail_uq").on(t.gmailMessageId), index("messages_recipient_idx").on(t.recipientId)]
);

export const replyStatus = pgEnum("reply_status", ["draft", "approved", "sending", "sent", "failed"]);

// Bozza di risposta (AI o manuale). Non parte mai da sola: serve "Invia" (draft → approved).
// request_id è la chiave di idempotenza verso n8n: una approvazione = al massimo una email.
export const replyDrafts = pgTable(
  "reply_drafts",
  {
    id: id(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => campaignRecipients.id),
    inReplyToMessageId: uuid("in_reply_to_message_id")
      .notNull()
      .references(() => messages.id),
    requestId: uuid("request_id").notNull().defaultRandom(),
    body: text("body").notNull().default(""),
    cc: text("cc"),
    status: replyStatus("status").notNull().default("draft"),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    lastError: text("last_error"),
    sentGmailMessageId: text("sent_gmail_message_id"),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("reply_drafts_request_uq").on(t.requestId), uniqueIndex("reply_drafts_message_uq").on(t.inReplyToMessageId)]
);

export const eventSource = pgEnum("event_source", ["n8n", "app"]);
export const eventStatus = pgEnum("event_status", ["received", "processed", "failed", "ignored"]);

// Registro di ogni evento esterno (n8n): (source, external_id) univoco = idempotenza.
// Le email arrivate che non appartengono a nessun thread noto finiscono qui come "ignored".
export const integrationEvents = pgTable(
  "integration_events",
  {
    id: id(),
    source: eventSource("source").notNull(),
    externalId: text("external_id").notNull(),
    eventType: text("event_type").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    payload: jsonb("payload").notNull(),
    status: eventStatus("status").notNull().default("received"),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("integration_events_source_ext_uq").on(t.source, t.externalId)]
);
