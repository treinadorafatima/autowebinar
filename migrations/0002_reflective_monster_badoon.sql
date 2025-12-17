CREATE TABLE "email_notification_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"subject" text NOT NULL,
	"html_template" text NOT NULL,
	"text_template" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "email_notification_templates_notification_type_unique" UNIQUE("notification_type")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_notification_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"message_template" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "whatsapp_notification_templates_notification_type_unique" UNIQUE("notification_type")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_notifications_log" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_type" text NOT NULL,
	"recipient_phone" text NOT NULL,
	"recipient_name" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"error" text
);
--> statement-breakpoint
ALTER TABLE "checkout_pagamentos" ADD COLUMN "failed_payment_reminders_sent" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "checkout_pagamentos" ADD COLUMN "last_failed_payment_reminder_at" timestamp;--> statement-breakpoint
ALTER TABLE "whatsapp_accounts" ADD COLUMN "hourly_limit" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_accounts" ADD COLUMN "messages_sent_this_hour" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_accounts" ADD COLUMN "last_hour_reset_time" timestamp;