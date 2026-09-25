CREATE TYPE "public"."campaign_status" AS ENUM('active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('n8n', 'app');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('received', 'processed', 'failed', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."organization_kind" AS ENUM('mirialis', 'client');--> statement-breakpoint
CREATE TYPE "public"."recipient_status" AS ENUM('queued', 'sending', 'sent', 'failed', 'replied');--> statement-breakpoint
CREATE TYPE "public"."reply_status" AS ENUM('draft', 'approved', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."rfq_status" AS ENUM('draft', 'approved');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'client');--> statement-breakpoint
CREATE TABLE "campaign_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"status" "recipient_status" DEFAULT 'queued' NOT NULL,
	"claimed_at" timestamp with time zone,
	"first_sent_at" timestamp with time zone,
	"first_reply_at" timestamp with time zone,
	"gmail_thread_id" text,
	"gmail_message_id" text,
	"interested" boolean,
	"quote_received" boolean DEFAULT false NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fair_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"rfq_version_id" uuid NOT NULL,
	"mailbox_id" uuid NOT NULL,
	"status" "campaign_status" DEFAULT 'active' NOT NULL,
	"daily_limit" integer DEFAULT 20 NOT NULL,
	"interval_minutes" integer DEFAULT 10 NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_mailboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slot" smallint NOT NULL,
	"email" text NOT NULL,
	"n8n_credential_name" text,
	"n8n_reply_webhook_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_mailboxes_slot_ck" CHECK ("client_mailboxes"."slot" in (1, 2))
);
--> statement-breakpoint
CREATE TABLE "fairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"venue" text,
	"city" text,
	"starts_on" date,
	"ends_on" date,
	"contact_name" text,
	"contact_email" text,
	"stand_notes" text,
	"budget_cents" bigint,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "event_source" NOT NULL,
	"external_id" text NOT NULL,
	"event_type" text NOT NULL,
	"organization_id" uuid,
	"payload" jsonb NOT NULL,
	"status" "event_status" DEFAULT 'received' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"gmail_message_id" text NOT NULL,
	"from_address" text,
	"to_address" text,
	"cc" text,
	"subject" text,
	"body_text" text,
	"sent_at" timestamp with time zone NOT NULL,
	"ai_category" text,
	"ai_summary" text,
	"ai_price_cents" bigint,
	"ai_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "organization_kind" NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reply_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"in_reply_to_message_id" uuid NOT NULL,
	"request_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"cc" text,
	"status" "reply_status" DEFAULT 'draft' NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"last_error" text,
	"sent_gmail_message_id" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfq_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fair_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" "rfq_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"company_name" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_fair_id_fairs_id_fk" FOREIGN KEY ("fair_id") REFERENCES "public"."fairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_rfq_version_id_rfq_versions_id_fk" FOREIGN KEY ("rfq_version_id") REFERENCES "public"."rfq_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_mailbox_id_client_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."client_mailboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_mailboxes" ADD CONSTRAINT "client_mailboxes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fairs" ADD CONSTRAINT "fairs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_campaign_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."campaign_recipients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_recipient_id_campaign_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."campaign_recipients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_in_reply_to_message_id_messages_id_fk" FOREIGN KEY ("in_reply_to_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_versions" ADD CONSTRAINT "rfq_versions_fair_id_fairs_id_fk" FOREIGN KEY ("fair_id") REFERENCES "public"."fairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_recipients_uq" ON "campaign_recipients" USING btree ("campaign_id","supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_recipients_thread_uq" ON "campaign_recipients" USING btree ("gmail_thread_id");--> statement-breakpoint
CREATE INDEX "campaign_recipients_status_idx" ON "campaign_recipients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaigns_fair_idx" ON "campaigns" USING btree ("fair_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_fair_uq" ON "campaigns" USING btree ("fair_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_mailboxes_org_slot_uq" ON "client_mailboxes" USING btree ("organization_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "client_mailboxes_email_uq" ON "client_mailboxes" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "fairs_org_idx" ON "fairs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_events_source_ext_uq" ON "integration_events" USING btree ("source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_gmail_uq" ON "messages" USING btree ("gmail_message_id");--> statement-breakpoint
CREATE INDEX "messages_recipient_idx" ON "messages" USING btree ("recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reply_drafts_request_uq" ON "reply_drafts" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reply_drafts_message_uq" ON "reply_drafts" USING btree ("in_reply_to_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rfq_versions_fair_version_uq" ON "rfq_versions" USING btree ("fair_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_email_uq" ON "suppliers" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id");