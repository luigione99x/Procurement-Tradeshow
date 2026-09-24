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

// Fornitori noti a Mirialis. Non si importano liste: l'outbound si fa da Smartlead e un
// fornitore entra qui quando compare in un evento di campagna (inviato/risposta).
export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    email: text("email").notNull(),
    companyName: text("company_name"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("suppliers_email_uq").on(sql`lower(${t.email})`)]
);

export const campaignStatus = pgEnum("campaign_status", ["draft", "registered", "active", "paused", "closed"]);

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
    // ID della campagna creata a mano in Smartlead, registrato dall'admin (piano Basic, D8)
    smartleadCampaignId: text("smartlead_campaign_id"),
    status: campaignStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("campaigns_smartlead_uq").on(t.smartleadCampaignId),
    index("campaigns_fair_idx").on(t.fairId),
  ]
);

export const recipientStatus = pgEnum("recipient_status", ["queued", "sent", "bounced", "replied", "unsubscribed"]);

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
    mailboxId: uuid("mailbox_id").references(() => clientMailboxes.id), // casella che gestisce il thread
    smartleadLeadId: text("smartlead_lead_id"),
    status: recipientStatus("status").notNull().default("queued"),
    firstSentAt: timestamp("first_sent_at", { withTimezone: true }), // solo da EMAIL_SENT osservato
    firstReplyAt: timestamp("first_reply_at", { withTimezone: true }),
    interested: boolean("interested"),
    quoteReceived: boolean("quote_received").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("campaign_recipients_uq").on(t.campaignId, t.supplierId)]
);

export const eventSource = pgEnum("event_source", ["smartlead", "mailbox", "n8n", "app"]);
export const eventStatus = pgEnum("event_status", ["received", "processed", "failed", "ignored"]);

// Registro di ogni evento esterno: (source, external_id) univoco = idempotenza.
// Lo stesso webhook ricevuto due volte non produce due effetti.
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
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: createdAt(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("integration_events_source_ext_uq").on(t.source, t.externalId),
    index("integration_events_status_idx").on(t.status),
  ]
);
