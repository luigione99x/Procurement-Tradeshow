CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'registered', 'active', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('smartlead', 'mailbox', 'n8n', 'app');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('received', 'processed', 'failed', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."organization_kind" AS ENUM('mirialis', 'client');--> statement-breakpoint
CREATE TYPE "public"."recipient_status" AS ENUM('queued', 'sent', 'bounced', 'replied', 'unsubscribed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'client');--> statement-breakpoint
CREATE TABLE "campaign_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"mailbox_id" uuid,
	"smartlead_lead_id" text,
	"status" "recipient_status" DEFAULT 'queued' NOT NULL,
	"first_sent_at" timestamp with time zone,
	"first_reply_at" timestamp with time zone,
	"interested" boolean,
	"quote_received" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fair_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"smartlead_campaign_id" text,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_mailboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slot" smallint NOT NULL,
	"email" text NOT NULL,
	"n8n_credential_name" text,
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
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
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
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"company_name" text,
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
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_mailbox_id_client_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."client_mailboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_fair_id_fairs_id_fk" FOREIGN KEY ("fair_id") REFERENCES "public"."fairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_mailboxes" ADD CONSTRAINT "client_mailboxes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fairs" ADD CONSTRAINT "fairs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_recipients_uq" ON "campaign_recipients" USING btree ("campaign_id","supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_smartlead_uq" ON "campaigns" USING btree ("smartlead_campaign_id");--> statement-breakpoint
CREATE INDEX "campaigns_fair_idx" ON "campaigns" USING btree ("fair_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_mailboxes_org_slot_uq" ON "client_mailboxes" USING btree ("organization_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "client_mailboxes_email_uq" ON "client_mailboxes" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "fairs_org_idx" ON "fairs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_events_source_ext_uq" ON "integration_events" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "integration_events_status_idx" ON "integration_events" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_email_uq" ON "suppliers" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id");