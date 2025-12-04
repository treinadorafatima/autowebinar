CREATE TABLE "admin_email_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"provider" text DEFAULT 'resend' NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"sender_email" text,
	"sender_name" text,
	"is_valid" boolean DEFAULT false NOT NULL,
	"last_validated_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "admin_email_credentials_admin_id_unique" UNIQUE("admin_id")
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT 'Administrador',
	"email" text NOT NULL,
	"password" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"webinar_limit" integer DEFAULT 5 NOT NULL,
	"upload_limit" integer DEFAULT 5 NOT NULL,
	"plano_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"access_expires_at" timestamp,
	"account_domain" text,
	"landing_page_title" text DEFAULT 'Meus Webinários',
	"landing_page_description" text DEFAULT '',
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ai_chats" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"webinar_id" text,
	"title" text DEFAULT 'Nova conversa' NOT NULL,
	"messages" text DEFAULT '[]' NOT NULL,
	"generated_script" text DEFAULT '',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text DEFAULT 'Configuração de IA' NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"generator_type" text DEFAULT 'script' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_memories" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text NOT NULL,
	"generator_type" text DEFAULT 'script' NOT NULL,
	"label" text NOT NULL,
	"source_type" text DEFAULT 'text' NOT NULL,
	"content" text,
	"file_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_message_chats" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"webinar_id" text,
	"script_id" text,
	"title" text DEFAULT 'Nova conversa' NOT NULL,
	"messages" text DEFAULT '[]' NOT NULL,
	"generated_email" text DEFAULT '',
	"generated_whatsapp" text DEFAULT '',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "checkout_assinaturas" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"plano_id" text NOT NULL,
	"gateway" text NOT NULL,
	"external_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"proximo_pagamento" timestamp,
	"criado_em" timestamp DEFAULT now(),
	"atualizado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "checkout_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"chave" text NOT NULL,
	"valor" text NOT NULL,
	"criado_em" timestamp DEFAULT now(),
	"atualizado_em" timestamp DEFAULT now(),
	CONSTRAINT "checkout_configs_chave_unique" UNIQUE("chave")
);
--> statement-breakpoint
CREATE TABLE "checkout_pagamentos" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"nome" text NOT NULL,
	"cpf" text,
	"telefone" text,
	"plano_id" text NOT NULL,
	"valor" integer NOT NULL,
	"status" text DEFAULT 'checkout_iniciado' NOT NULL,
	"status_detail" text,
	"metodo_pagamento" text,
	"mercadopago_payment_id" text,
	"stripe_payment_intent_id" text,
	"stripe_subscription_id" text,
	"stripe_customer_id" text,
	"data_pagamento" timestamp,
	"data_aprovacao" timestamp,
	"data_expiracao" timestamp,
	"admin_id" text,
	"pix_qr_code" text,
	"pix_copia_cola" text,
	"boleto_url" text,
	"boleto_codigo" text,
	"criado_em" timestamp DEFAULT now(),
	"atualizado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "checkout_planos" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"descricao" text DEFAULT '',
	"preco" integer NOT NULL,
	"prazo_dias" integer DEFAULT 30 NOT NULL,
	"webinar_limit" integer DEFAULT 5 NOT NULL,
	"upload_limit" integer DEFAULT 999 NOT NULL,
	"storage_limit" integer DEFAULT 5 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"gateway" text DEFAULT 'mercadopago' NOT NULL,
	"tipo_cobranca" text DEFAULT 'unico' NOT NULL,
	"frequencia" integer DEFAULT 1,
	"frequencia_tipo" text DEFAULT 'months',
	"disponivel_renovacao" boolean DEFAULT false NOT NULL,
	"beneficios" text DEFAULT '[]',
	"destaque" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp DEFAULT now(),
	"atualizado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"webinar_id" text,
	"text" text NOT NULL,
	"author" text DEFAULT 'Sistema' NOT NULL,
	"timestamp" integer NOT NULL,
	"is_simulated" boolean DEFAULT true NOT NULL,
	"persist_for_future_sessions" boolean DEFAULT true NOT NULL,
	"session_date" text,
	"session_id" text,
	"moderator_name" text,
	"is_moderator_message" boolean DEFAULT false NOT NULL,
	"approved" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_notifications_log" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"email_type" text NOT NULL,
	"sent_at" timestamp DEFAULT now(),
	"success" boolean DEFAULT true NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "email_sequences" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"webinar_id" text,
	"name" text NOT NULL,
	"phase" text NOT NULL,
	"offset_minutes" integer NOT NULL,
	"subject" text NOT NULL,
	"preheader" text DEFAULT '',
	"design_json" text DEFAULT '{}' NOT NULL,
	"compiled_html" text DEFAULT '',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lead_form_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"webinar_id" text NOT NULL,
	"title" text DEFAULT 'Inscreva-se no Webinário',
	"subtitle" text DEFAULT 'Preencha seus dados para participar',
	"collect_name" boolean DEFAULT true NOT NULL,
	"collect_email" boolean DEFAULT true NOT NULL,
	"collect_whatsapp" boolean DEFAULT true NOT NULL,
	"collect_city" boolean DEFAULT false NOT NULL,
	"collect_state" boolean DEFAULT false NOT NULL,
	"custom_fields" text DEFAULT '[]',
	"require_consent" boolean DEFAULT true NOT NULL,
	"consent_text" text DEFAULT 'Concordo em receber comunicações sobre este webinário',
	"button_text" text DEFAULT 'Quero Participar',
	"button_color" text DEFAULT '#22c55e',
	"success_message" text DEFAULT 'Inscrição realizada com sucesso!',
	"redirect_url" text,
	"background_color" text DEFAULT '#ffffff',
	"text_color" text DEFAULT '#000000',
	"embed_version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "lead_form_configs_webinar_id_unique" UNIQUE("webinar_id")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"webinar_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"whatsapp" text,
	"city" text,
	"state" text,
	"custom_data" text,
	"captured_at" timestamp DEFAULT now(),
	"session_id" text,
	"status" text DEFAULT 'registered' NOT NULL,
	"source" text DEFAULT 'registration' NOT NULL,
	"joined_at" timestamp,
	"sequence_triggered" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_files" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"media_type" text NOT NULL,
	"storage_provider" text NOT NULL,
	"storage_path" text NOT NULL,
	"public_url" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "scheduled_emails" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"webinar_id" text NOT NULL,
	"lead_id" text,
	"sequence_id" text NOT NULL,
	"target_email" text NOT NULL,
	"target_name" text,
	"send_at" timestamp NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"last_error" text,
	"sent_at" timestamp,
	"webinar_session_date" text,
	"metadata" text DEFAULT '{}',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scheduled_whatsapp_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"webinar_id" text NOT NULL,
	"lead_id" text,
	"sequence_id" text NOT NULL,
	"target_phone" text NOT NULL,
	"target_name" text,
	"send_at" timestamp NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"last_error" text,
	"sent_at" timestamp,
	"webinar_session_date" text,
	"metadata" text DEFAULT '{}',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "uploaded_videos" (
	"id" text PRIMARY KEY NOT NULL,
	"uploaded_video_id" text NOT NULL,
	"filename" text NOT NULL,
	"title" text DEFAULT 'Sem título' NOT NULL,
	"duration" integer NOT NULL,
	"file_size" integer,
	"owner_id" text,
	"uploaded_at" timestamp DEFAULT now(),
	"hls_playlist_url" text,
	"hls_status" text DEFAULT 'pending',
	CONSTRAINT "uploaded_videos_uploaded_video_id_unique" UNIQUE("uploaded_video_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "video_transcriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"webinar_id" text,
	"uploaded_video_id" text NOT NULL,
	"transcription" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "viewer_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"webinar_id" text NOT NULL,
	"session_id" text NOT NULL,
	"viewed_at" timestamp DEFAULT now(),
	"view_duration_seconds" integer DEFAULT 0 NOT NULL,
	"max_video_position_seconds" integer DEFAULT 0 NOT NULL,
	"session_date" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webinar_configs" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"video_url" text NOT NULL,
	"uploaded_video_id" text,
	"start_hour" integer DEFAULT 18 NOT NULL,
	"start_minute" integer DEFAULT 50 NOT NULL,
	"video_duration" integer DEFAULT 11035 NOT NULL,
	"recurrence" text DEFAULT 'daily' NOT NULL,
	"admin_password" text DEFAULT 'admin123' NOT NULL,
	"countdown_text" text DEFAULT 'O webinário começa em:',
	"next_webinar_text" text DEFAULT 'Próximo webinário em:',
	"ended_badge_text" text DEFAULT 'TRANSMISSÃO ENCERRADA',
	"countdown_color" text DEFAULT '#FFD700',
	"live_button_color" text DEFAULT '#e74c3c',
	"background_color" text DEFAULT '#1a1a2e',
	"background_image_url" text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE "webinar_scripts" (
	"id" text PRIMARY KEY NOT NULL,
	"webinar_id" text NOT NULL,
	"title" text NOT NULL,
	"script" text NOT NULL,
	"email_message" text,
	"whatsapp_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webinars" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '',
	"video_url" text DEFAULT '' NOT NULL,
	"uploaded_video_id" text,
	"video_duration" integer DEFAULT 3600 NOT NULL,
	"start_hour" integer DEFAULT 18 NOT NULL,
	"start_minute" integer DEFAULT 0 NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"recurrence" text DEFAULT 'daily' NOT NULL,
	"once_date" text,
	"day_of_week" integer,
	"day_of_month" integer,
	"countdown_text" text DEFAULT 'O webinário começa em:',
	"next_webinar_text" text DEFAULT 'Próximo webinário em:',
	"ended_badge_text" text DEFAULT 'TRANSMISSÃO ENCERRADA',
	"countdown_color" text DEFAULT '#FFD700',
	"live_button_color" text DEFAULT '#e74c3c',
	"background_color" text DEFAULT '#1a1a2e',
	"background_image_url" text DEFAULT '',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"page_title" text DEFAULT '',
	"page_badge_text" text DEFAULT '',
	"page_background_color" text DEFAULT '#4A8BB5',
	"offer_enabled" boolean DEFAULT false NOT NULL,
	"offer_delay_seconds" integer DEFAULT 300 NOT NULL,
	"offer_start_seconds" integer DEFAULT 0 NOT NULL,
	"offer_ends_at_end" boolean DEFAULT true NOT NULL,
	"offer_duration_seconds" integer DEFAULT 0 NOT NULL,
	"offer_badge_text" text DEFAULT 'OFERTA ESPECIAL',
	"offer_title" text DEFAULT '',
	"offer_title_color" text DEFAULT '#ffffff',
	"offer_subtitle" text DEFAULT '',
	"offer_subtitle_color" text DEFAULT '#ffffff',
	"offer_image_url" text DEFAULT '',
	"offer_price_text" text DEFAULT 'O valor da inscricao e 12x R$ XX,XX no cartao ou um valor unico de R$ XXX,XX por 12 meses de estudos.',
	"offer_price_border_color" text DEFAULT '#84cc16',
	"offer_price_box_bg_color" text DEFAULT 'rgba(0,0,0,0.3)',
	"offer_price_box_shadow" boolean DEFAULT true,
	"offer_price_box_padding" text DEFAULT 'md',
	"offer_price_icon_color" text DEFAULT '#84cc16',
	"offer_price_highlight_color" text DEFAULT '#eab308',
	"offer_price_label" text DEFAULT 'INVESTIMENTO',
	"offer_button_text" text DEFAULT 'FAZER MINHA INSCRICAO AGORA',
	"offer_button_url" text DEFAULT '',
	"offer_button_color" text DEFAULT '#22c55e',
	"offer_button_size" text DEFAULT 'lg',
	"offer_button_shadow" boolean DEFAULT true,
	"offer_button_text_color" text DEFAULT '#ffffff',
	"offer_benefits" text DEFAULT '[]',
	"banner_enabled" boolean DEFAULT false NOT NULL,
	"banner_start_seconds" integer DEFAULT 0 NOT NULL,
	"banner_ends_at_end" boolean DEFAULT true NOT NULL,
	"banner_duration_seconds" integer DEFAULT 0 NOT NULL,
	"banner_background_color" text DEFAULT '#1a1a2e',
	"banner_button_text" text DEFAULT 'Saiba Mais',
	"banner_button_url" text DEFAULT '',
	"banner_button_color" text DEFAULT '#22c55e',
	"banner_button_text_color" text DEFAULT '#ffffff',
	"participant_count" integer DEFAULT 200,
	"participant_oscillation_percent" integer DEFAULT 20,
	"comment_theme" text DEFAULT 'dark',
	"leads_enabled" boolean DEFAULT false NOT NULL,
	"leads_collect_email" boolean DEFAULT true NOT NULL,
	"leads_collect_whatsapp" boolean DEFAULT true NOT NULL,
	"views" integer DEFAULT 0,
	"show_live_indicator" boolean DEFAULT true NOT NULL,
	"live_indicator_style" text DEFAULT 'full' NOT NULL,
	"show_ended_screen" boolean DEFAULT true NOT NULL,
	"show_next_countdown" boolean DEFAULT true NOT NULL,
	"show_next_session_date" boolean DEFAULT true NOT NULL,
	"offer_display_after_end" integer DEFAULT 0 NOT NULL,
	"show_offer_instead_of_ended" boolean DEFAULT false NOT NULL,
	"offer_display_hours" integer DEFAULT 0 NOT NULL,
	"offer_display_minutes" integer DEFAULT 30 NOT NULL,
	"custom_domain" text,
	"moderator_token" text,
	"replay_enabled" boolean DEFAULT false NOT NULL,
	"replay_video_id" text,
	"replay_show_controls" boolean DEFAULT true NOT NULL,
	"replay_autoplay" boolean DEFAULT false NOT NULL,
	"replay_thumbnail_url" text DEFAULT '',
	"replay_player_color" text DEFAULT '#3b82f6',
	"replay_player_border_color" text DEFAULT '#ffffff',
	"replay_background_color" text DEFAULT '#4A8BB5',
	"replay_badge_text" text DEFAULT '',
	"replay_title" text DEFAULT '',
	"replay_offer_badge_text" text DEFAULT '',
	"replay_offer_title" text DEFAULT '',
	"replay_offer_subtitle" text DEFAULT '',
	"replay_offer_image_url" text DEFAULT '',
	"replay_benefits" text DEFAULT '[]',
	"replay_price_text" text DEFAULT '',
	"replay_button_text" text DEFAULT 'FAZER MINHA INSCRIÇÃO AGORA',
	"replay_button_url" text DEFAULT '',
	"replay_button_color" text DEFAULT '#22c55e',
	"seo_site_name" text DEFAULT '',
	"seo_page_title" text DEFAULT '',
	"seo_description" text DEFAULT '',
	"seo_favicon_url" text DEFAULT '',
	"seo_share_image_url" text DEFAULT '',
	CONSTRAINT "webinars_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_sequences" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"webinar_id" text,
	"name" text NOT NULL,
	"phase" text NOT NULL,
	"offset_minutes" integer NOT NULL,
	"message_text" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"media_url" text,
	"media_file_name" text,
	"media_mime_type" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "whatsapp_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"phone_number" text,
	"session_data" text,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"qr_code" text,
	"last_connected_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "whatsapp_sessions_admin_id_unique" UNIQUE("admin_id")
);
