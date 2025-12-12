CREATE TABLE "affiliate_config" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"default_commission_percent" integer DEFAULT 30 NOT NULL,
	"min_withdrawal" integer DEFAULT 5000 NOT NULL,
	"hold_days" integer DEFAULT 7 NOT NULL,
	"auto_pay_enabled" boolean DEFAULT true NOT NULL,
	"auto_approve" boolean DEFAULT false NOT NULL,
	"mp_app_id" text,
	"mp_app_secret" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliate_links" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"code" text NOT NULL,
	"target_url" text,
	"plano_id" text,
	"clicks" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "affiliate_links_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "affiliate_sales" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"affiliate_link_id" text,
	"pagamento_id" text NOT NULL,
	"sale_amount" integer NOT NULL,
	"commission_amount" integer NOT NULL,
	"commission_percent" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"split_method" text,
	"mp_payment_id" text,
	"mp_transfer_id" text,
	"stripe_payment_intent_id" text,
	"stripe_transfer_id" text,
	"payout_scheduled_at" timestamp,
	"payout_attempts" integer DEFAULT 0 NOT NULL,
	"payout_error" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliate_withdrawals" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"amount" integer NOT NULL,
	"pix_key" text NOT NULL,
	"pix_key_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now(),
	"processed_at" timestamp,
	"paid_at" timestamp,
	"processed_by" text,
	"transaction_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliates" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"whatsapp" text,
	"commission_percent" integer DEFAULT 30 NOT NULL,
	"commission_fixed" integer,
	"meta_pixel_id" text,
	"meta_access_token" text,
	"mp_user_id" text,
	"mp_access_token" text,
	"mp_refresh_token" text,
	"mp_token_expires_at" timestamp,
	"mp_connected_at" timestamp,
	"stripe_connect_account_id" text,
	"stripe_connect_status" text DEFAULT 'pending',
	"stripe_connected_at" timestamp,
	"pix_key" text,
	"pix_key_type" text,
	"welcome_email_sent" boolean DEFAULT false NOT NULL,
	"total_earnings" integer DEFAULT 0 NOT NULL,
	"pending_amount" integer DEFAULT 0 NOT NULL,
	"available_amount" integer DEFAULT 0 NOT NULL,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lead_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"webinar_id" text NOT NULL,
	"admin_id" text NOT NULL,
	"channel" text NOT NULL,
	"message_type" text NOT NULL,
	"campaign_id" text,
	"subject" text,
	"content" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"sent_at" timestamp DEFAULT now(),
	"delivered_at" timestamp,
	"opened_at" timestamp,
	"clicked_at" timestamp,
	"tracking_id" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "webinar_view_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"webinar_id" text NOT NULL,
	"owner_id" text,
	"viewer_id" text,
	"view_date" text,
	"source" text DEFAULT 'live' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "whatsapp_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"label" text NOT NULL,
	"phone_number" text,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"qr_code" text,
	"provider" text DEFAULT 'baileys' NOT NULL,
	"cloud_api_access_token" text,
	"cloud_api_phone_number_id" text,
	"cloud_api_business_account_id" text,
	"cloud_api_webhook_verify_token" text,
	"cloud_api_version" text DEFAULT 'v20.0',
	"last_connected_at" timestamp,
	"last_used_at" timestamp,
	"priority" integer DEFAULT 0 NOT NULL,
	"daily_limit" integer DEFAULT 1000 NOT NULL,
	"messages_sent_today" integer DEFAULT 0 NOT NULL,
	"last_message_reset_date" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "whatsapp_broadcast_recipients" (
	"id" text PRIMARY KEY NOT NULL,
	"broadcast_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"session_date" text,
	"account_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"sent_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "whatsapp_broadcasts" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"webinar_id" text NOT NULL,
	"name" text NOT NULL,
	"message_text" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"media_url" text,
	"media_file_name" text,
	"media_mime_type" text,
	"filter_type" text DEFAULT 'all' NOT NULL,
	"filter_date_start" text,
	"filter_date_end" text,
	"filter_session_date" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"pending_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" DROP CONSTRAINT "whatsapp_sessions_admin_id_unique";--> statement-breakpoint
ALTER TABLE "lead_form_configs" ALTER COLUMN "background_color" SET DEFAULT '#1a1a2e';--> statement-breakpoint
ALTER TABLE "lead_form_configs" ALTER COLUMN "text_color" SET DEFAULT '#ffffff';--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "telefone" text;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "payment_status" text DEFAULT 'ok';--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "payment_failed_reason" text;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "last_expiration_email_sent" timestamp;--> statement-breakpoint
ALTER TABLE "checkout_pagamentos" ADD COLUMN "gateway_error_code" text;--> statement-breakpoint
ALTER TABLE "checkout_pagamentos" ADD COLUMN "gateway_error_message" text;--> statement-breakpoint
ALTER TABLE "checkout_pagamentos" ADD COLUMN "user_friendly_error" text;--> statement-breakpoint
ALTER TABLE "checkout_pagamentos" ADD COLUMN "failure_attempts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "checkout_pagamentos" ADD COLUMN "last_failure_at" timestamp;--> statement-breakpoint
ALTER TABLE "checkout_pagamentos" ADD COLUMN "affiliate_link_code" text;--> statement-breakpoint
ALTER TABLE "checkout_pagamentos" ADD COLUMN "pix_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "checkout_pagamentos" ADD COLUMN "boleto_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "checkout_pagamentos" ADD COLUMN "pix_expired_email_sent" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "checkout_planos" ADD COLUMN "whatsapp_account_limit" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "checkout_planos" ADD COLUMN "feature_ai" boolean;--> statement-breakpoint
ALTER TABLE "checkout_planos" ADD COLUMN "feature_transcricao" boolean;--> statement-breakpoint
ALTER TABLE "checkout_planos" ADD COLUMN "feature_designer_ia" boolean;--> statement-breakpoint
ALTER TABLE "checkout_planos" ADD COLUMN "feature_gerador_mensagens" boolean;--> statement-breakpoint
ALTER TABLE "checkout_planos" ADD COLUMN "exibir_na_landing" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_form_configs" ADD COLUMN "button_text_color" text DEFAULT '#ffffff';--> statement-breakpoint
ALTER TABLE "lead_form_configs" ADD COLUMN "card_background_color" text DEFAULT '#16213e';--> statement-breakpoint
ALTER TABLE "lead_form_configs" ADD COLUMN "input_background_color" text DEFAULT '#0f0f23';--> statement-breakpoint
ALTER TABLE "lead_form_configs" ADD COLUMN "input_border_color" text DEFAULT '#374151';--> statement-breakpoint
ALTER TABLE "lead_form_configs" ADD COLUMN "input_text_color" text DEFAULT '#ffffff';--> statement-breakpoint
ALTER TABLE "lead_form_configs" ADD COLUMN "label_color" text DEFAULT '#9ca3af';--> statement-breakpoint
ALTER TABLE "lead_form_configs" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "lead_form_configs" ADD COLUMN "header_image_url" text;--> statement-breakpoint
ALTER TABLE "lead_form_configs" ADD COLUMN "show_next_session" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_form_configs" ADD COLUMN "font_family" text DEFAULT 'Inter, system-ui, sans-serif';--> statement-breakpoint
ALTER TABLE "lead_form_configs" ADD COLUMN "border_radius" text DEFAULT '8';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "affiliate_link_code" text;--> statement-breakpoint
ALTER TABLE "uploaded_videos" ADD COLUMN "thumbnail_url" text;--> statement-breakpoint
ALTER TABLE "uploaded_videos" ADD COLUMN "player_color" text DEFAULT '#8B5CF6';--> statement-breakpoint
ALTER TABLE "uploaded_videos" ADD COLUMN "show_time" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "webinars" ADD COLUMN "counter_position" text DEFAULT 'right' NOT NULL;--> statement-breakpoint
ALTER TABLE "webinars" ADD COLUMN "post_end_mode" text DEFAULT 'ended' NOT NULL;--> statement-breakpoint
ALTER TABLE "webinars" ADD COLUMN "offer_before_ended_hours" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webinars" ADD COLUMN "offer_before_ended_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "webinars" ADD COLUMN "chat_form_title" text DEFAULT 'Participe do Chat';--> statement-breakpoint
ALTER TABLE "webinars" ADD COLUMN "chat_collect_name" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "webinars" ADD COLUMN "chat_collect_city" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "webinars" ADD COLUMN "chat_collect_state" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "webinars" ADD COLUMN "chat_collect_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "webinars" ADD COLUMN "chat_collect_whatsapp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" ADD COLUMN "account_id" text;