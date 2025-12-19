import { z } from "zod";
import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const webinarInfoSchema = z.object({
  title: z.string(),
  description: z.string(),
  embedUrl: z.string().url(),
  date: z.string().optional(),
  time: z.string().optional(),
  isLive: z.boolean().default(false),
});

export type WebinarInfo = z.infer<typeof webinarInfoSchema>;

// Admin users table
export const admins = pgTable("admins", {
  id: text("id").primaryKey(),
  name: text("name").default("Administrador"),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  telefone: text("telefone"), // Telefone do usuário
  role: text("role").notNull().default("user"), // 'superadmin' ou 'user'
  webinarLimit: integer("webinar_limit").notNull().default(5), // limite de webinars
  uploadLimit: integer("upload_limit").notNull().default(5), // limite de uploads
  planoId: text("plano_id"), // FK para plano de assinatura (opcional)
  isActive: boolean("is_active").notNull().default(true),
  paymentStatus: text("payment_status").default("ok"), // 'ok', 'failed', 'pending' - Status do pagamento da assinatura
  paymentFailedReason: text("payment_failed_reason"), // Motivo da falha do pagamento
  accessExpiresAt: timestamp("access_expires_at"), // Data de expiração do acesso (null = sem expiração)
  accountDomain: text("account_domain"), // Domínio customizado da conta (ex: minhaempresa.com)
  landingPageTitle: text("landing_page_title").default("Meus Webinários"), // Título da página inicial
  landingPageDescription: text("landing_page_description").default(""), // Descrição da página inicial
  lastExpirationEmailSent: timestamp("last_expiration_email_sent"), // Último email de vencimento enviado
  createdAt: timestamp("created_at").defaultNow(),
});

export const adminInsertSchema = createInsertSchema(admins).omit({ id: true, createdAt: true });
export type Admin = typeof admins.$inferSelect;
export type AdminInsert = z.infer<typeof adminInsertSchema>;

// Webinars table - cada webinário tem suas próprias configurações
export const webinars = pgTable("webinars", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id"), // ID do admin que criou (null = super admin)
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").default(""),
  videoUrl: text("video_url").notNull().default(""),
  uploadedVideoId: text("uploaded_video_id"),
  videoDuration: integer("video_duration").notNull().default(3600),
  startHour: integer("start_hour").notNull().default(18),
  startMinute: integer("start_minute").notNull().default(0),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"), // Fuso horário IANA
  recurrence: text("recurrence").notNull().default("daily"),
  onceDate: text("once_date"),
  dayOfWeek: integer("day_of_week"),
  dayOfMonth: integer("day_of_month"),
  countdownText: text("countdown_text").default("O webinário começa em:"),
  nextWebinarText: text("next_webinar_text").default("Próximo webinário em:"),
  endedBadgeText: text("ended_badge_text").default("TRANSMISSÃO ENCERRADA"),
  countdownColor: text("countdown_color").default("#FFD700"),
  liveButtonColor: text("live_button_color").default("#e74c3c"),
  backgroundColor: text("background_color").default("#1a1a2e"),
  backgroundImageUrl: text("background_image_url").default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  // Campos da página
  pageTitle: text("page_title").default(""),
  pageBadgeText: text("page_badge_text").default(""),
  pageBackgroundColor: text("page_background_color").default("#4A8BB5"),
  // Campos da oferta
  offerEnabled: boolean("offer_enabled").notNull().default(false),
  offerDelaySeconds: integer("offer_delay_seconds").notNull().default(300),
  offerStartSeconds: integer("offer_start_seconds").notNull().default(0),
  offerEndsAtEnd: boolean("offer_ends_at_end").notNull().default(true),
  offerDurationSeconds: integer("offer_duration_seconds").notNull().default(0),
  offerBadgeText: text("offer_badge_text").default("OFERTA ESPECIAL"),
  offerTitle: text("offer_title").default(""),
  offerTitleColor: text("offer_title_color").default("#ffffff"),
  offerSubtitle: text("offer_subtitle").default(""),
  offerSubtitleColor: text("offer_subtitle_color").default("#ffffff"),
  offerImageUrl: text("offer_image_url").default(""),
  offerPriceText: text("offer_price_text").default("O valor da inscricao e 12x R$ XX,XX no cartao ou um valor unico de R$ XXX,XX por 12 meses de estudos."),
  offerPriceBorderColor: text("offer_price_border_color").default("#84cc16"),
  offerPriceBoxBgColor: text("offer_price_box_bg_color").default("rgba(0,0,0,0.3)"),
  offerPriceBoxShadow: boolean("offer_price_box_shadow").default(true),
  offerPriceBoxPadding: text("offer_price_box_padding").default("md"),
  offerPriceIconColor: text("offer_price_icon_color").default("#84cc16"),
  offerPriceHighlightColor: text("offer_price_highlight_color").default("#eab308"),
  offerPriceLabel: text("offer_price_label").default("INVESTIMENTO"),
  offerButtonText: text("offer_button_text").default("FAZER MINHA INSCRICAO AGORA"),
  offerButtonUrl: text("offer_button_url").default(""),
  offerButtonColor: text("offer_button_color").default("#22c55e"),
  offerButtonSize: text("offer_button_size").default("lg"),
  offerButtonShadow: boolean("offer_button_shadow").default(true),
  offerButtonTextColor: text("offer_button_text_color").default("#ffffff"),
  offerBenefits: text("offer_benefits").default("[]"),
  // Campos do banner
  bannerEnabled: boolean("banner_enabled").notNull().default(false),
  bannerStartSeconds: integer("banner_start_seconds").notNull().default(0),
  bannerEndsAtEnd: boolean("banner_ends_at_end").notNull().default(true),
  bannerDurationSeconds: integer("banner_duration_seconds").notNull().default(0),
  bannerBackgroundColor: text("banner_background_color").default("#1a1a2e"),
  bannerButtonText: text("banner_button_text").default("Saiba Mais"),
  bannerButtonUrl: text("banner_button_url").default(""),
  bannerButtonColor: text("banner_button_color").default("#22c55e"),
  bannerButtonTextColor: text("banner_button_text_color").default("#ffffff"),
  // Configurações de contagem de participantes
  participantCount: integer("participant_count").default(200),
  participantOscillationPercent: integer("participant_oscillation_percent").default(20),
  // Tema dos comentários
  commentTheme: text("comment_theme").default("dark"),
  // Configuração de captura de leads
  leadsEnabled: boolean("leads_enabled").notNull().default(false),
  leadsCollectEmail: boolean("leads_collect_email").notNull().default(true),
  leadsCollectWhatsapp: boolean("leads_collect_whatsapp").notNull().default(true),
  views: integer("views").default(0),
  // Configuração de indicador "AO VIVO"
  showLiveIndicator: boolean("show_live_indicator").notNull().default(true),
  liveIndicatorStyle: text("live_indicator_style").notNull().default("full"), // 'full' (número + texto), 'number' (só número), 'hidden' (nada)
  counterPosition: text("counter_position").notNull().default("right"), // 'left' ou 'right'
  // Configurações pós-término
  showEndedScreen: boolean("show_ended_screen").notNull().default(true), // Mostrar tela "Transmissão Encerrada"
  showNextCountdown: boolean("show_next_countdown").notNull().default(true), // Mostrar countdown para próxima sessão
  showNextSessionDate: boolean("show_next_session_date").notNull().default(true), // Mostrar data/hora próxima sessão
  offerDisplayAfterEnd: integer("offer_display_after_end").notNull().default(0), // Minutos para mostrar oferta (0 = não mostrar)
  showOfferInsteadOfEnded: boolean("show_offer_instead_of_ended").notNull().default(false), // Mostrar oferta em vez de "Transmissão Encerrada"
  postEndMode: text("post_end_mode").notNull().default("ended"), // 'ended', 'offer', 'offer_then_ended'
  offerDisplayHours: integer("offer_display_hours").notNull().default(0), // Horas para oferta ficar visível
  offerDisplayMinutes: integer("offer_display_minutes").notNull().default(30), // Minutos para oferta ficar visível
  offerBeforeEndedHours: integer("offer_before_ended_hours").notNull().default(0), // Horas da oferta antes de mostrar tela encerrada
  offerBeforeEndedMinutes: integer("offer_before_ended_minutes").notNull().default(30), // Minutos da oferta antes de mostrar tela encerrada
  customDomain: text("custom_domain"), // Domínio customizado (ex: webinar.seusite.com)
  moderatorToken: text("moderator_token"), // Token único para moderação
  // Campos do Replay
  replayEnabled: boolean("replay_enabled").notNull().default(false),
  replayVideoId: text("replay_video_id"), // ID do vídeo selecionado para replay
  replayShowControls: boolean("replay_show_controls").notNull().default(true), // Mostrar controles do player
  replayAutoplay: boolean("replay_autoplay").notNull().default(false), // Iniciar automaticamente
  replayThumbnailUrl: text("replay_thumbnail_url").default(""), // Miniatura antes de iniciar
  replayPlayerColor: text("replay_player_color").default("#3b82f6"), // Cor do player
  replayPlayerBorderColor: text("replay_player_border_color").default("#ffffff"), // Cor da borda do player
  replayBackgroundColor: text("replay_background_color").default("#4A8BB5"), // Cor de fundo da página
  replayBadgeText: text("replay_badge_text").default(""), // Badge acima do título (ex: "AULÃO REPLAY")
  replayTitle: text("replay_title").default(""), // Título principal
  replayOfferBadgeText: text("replay_offer_badge_text").default(""), // Badge da oferta (ex: "OFERTA ESPECIAL")
  replayOfferTitle: text("replay_offer_title").default(""), // Título da oferta
  replayOfferSubtitle: text("replay_offer_subtitle").default(""), // Subtítulo da oferta
  replayOfferImageUrl: text("replay_offer_image_url").default(""), // Imagem da oferta/logo
  replayBenefits: text("replay_benefits").default("[]"), // Lista de benefícios em JSON
  replayPriceText: text("replay_price_text").default(""), // Texto de preço
  replayButtonText: text("replay_button_text").default("FAZER MINHA INSCRIÇÃO AGORA"), // Texto do botão
  replayButtonUrl: text("replay_button_url").default(""), // URL do botão
  replayButtonColor: text("replay_button_color").default("#22c55e"), // Cor do botão
  // Campos de SEO e compartilhamento
  seoSiteName: text("seo_site_name").default(""), // Nome do site (aparece na aba do navegador)
  seoPageTitle: text("seo_page_title").default(""), // Título da página para SEO
  seoDescription: text("seo_description").default(""), // Descrição para meta tags
  seoFaviconUrl: text("seo_favicon_url").default(""), // URL do favicon personalizado
  seoShareImageUrl: text("seo_share_image_url").default(""), // Imagem de compartilhamento (Open Graph)
  // Configuração do formulário de chat (separado do formulário de leads)
  chatFormTitle: text("chat_form_title").default("Participe do Chat"), // Título do modal
  chatCollectName: boolean("chat_collect_name").notNull().default(true), // Coletar nome
  chatCollectCity: boolean("chat_collect_city").notNull().default(true), // Coletar cidade
  chatCollectState: boolean("chat_collect_state").notNull().default(true), // Coletar estado
  chatCollectEmail: boolean("chat_collect_email").notNull().default(false), // Coletar email
  chatCollectWhatsapp: boolean("chat_collect_whatsapp").notNull().default(false), // Coletar WhatsApp
});

export const webinarInsertSchema = createInsertSchema(webinars).omit({ id: true, createdAt: true });
export type Webinar = typeof webinars.$inferSelect;
export type WebinarInsert = z.infer<typeof webinarInsertSchema>;

// Legacy: Database table for webinar configuration (mantido para compatibilidade)
export const webinarConfigs = pgTable("webinar_configs", {
  id: text("id").primaryKey().default("default"),
  videoUrl: text("video_url").notNull(),
  uploadedVideoId: text("uploaded_video_id"),
  startHour: integer("start_hour").notNull().default(18),
  startMinute: integer("start_minute").notNull().default(50),
  videoDuration: integer("video_duration").notNull().default(11035),
  recurrence: text("recurrence").notNull().default("daily"),
  adminPassword: text("admin_password").notNull().default("admin123"),
  countdownText: text("countdown_text").default("O webinário começa em:"),
  nextWebinarText: text("next_webinar_text").default("Próximo webinário em:"),
  endedBadgeText: text("ended_badge_text").default("TRANSMISSÃO ENCERRADA"),
  countdownColor: text("countdown_color").default("#FFD700"),
  liveButtonColor: text("live_button_color").default("#e74c3c"),
  backgroundColor: text("background_color").default("#1a1a2e"),
  backgroundImageUrl: text("background_image_url").default(""),
});

export const webinarConfigInsertSchema = createInsertSchema(webinarConfigs).omit({ id: true });
export type WebinarConfig = typeof webinarConfigs.$inferSelect;
export type WebinarConfigInsert = z.infer<typeof webinarConfigInsertSchema>;

// User table (basic)
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// Videos table for tracking uploaded videos
export const uploadedVideos = pgTable("uploaded_videos", {
  id: text("id").primaryKey(),
  uploadedVideoId: text("uploaded_video_id").notNull().unique(),
  filename: text("filename").notNull(),
  title: text("title").notNull().default("Sem título"),
  duration: integer("duration").notNull(),
  fileSize: integer("file_size"), // Tamanho do arquivo em bytes
  ownerId: text("owner_id"), // ID do admin que criou o video
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  hlsPlaylistUrl: text("hls_playlist_url"),
  hlsStatus: text("hls_status").default("pending"), // 'pending', 'processing', 'completed', 'failed'
  // Configurações de embed
  thumbnailUrl: text("thumbnail_url"), // URL da miniatura customizada
  playerColor: text("player_color").default("#8B5CF6"), // Cor do player (roxo padrão)
  showTime: boolean("show_time").default(true), // Mostrar tempo/controles no player
});

export type UploadedVideo = typeof uploadedVideos.$inferSelect;
export const uploadedVideoInsertSchema = createInsertSchema(uploadedVideos).omit({ id: true, uploadedAt: true });
export type UploadedVideoInsert = z.infer<typeof uploadedVideoInsertSchema>;

// Comments table for programmed comments during livestream
export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  webinarId: text("webinar_id"),
  text: text("text").notNull(),
  author: text("author").notNull().default("Sistema"),
  timestamp: integer("timestamp").notNull(),
  isSimulated: boolean("is_simulated").notNull().default(true),
  persistForFutureSessions: boolean("persist_for_future_sessions").notNull().default(true),
  sessionDate: text("session_date"),
  sessionId: text("session_id"), // ID da sessão do usuário (para comentários reais)
  moderatorName: text("moderator_name"), // Nome do moderador (se for msg do moderador)
  isModeratorMessage: boolean("is_moderator_message").notNull().default(false), // True se for mensagem do moderador
  approved: boolean("approved").notNull().default(true), // False se pendente de aprovação (comentários reais)
  createdAt: timestamp("created_at").defaultNow(),
});

export type Comment = typeof comments.$inferSelect;
export const commentInsertSchema = createInsertSchema(comments).omit({ id: true, createdAt: true });
export type CommentInsert = z.infer<typeof commentInsertSchema>;

// Sessions table for persistent session management
export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Session = typeof sessions.$inferSelect;
export const sessionInsertSchema = createInsertSchema(sessions).omit({ createdAt: true });
export type SessionInsert = z.infer<typeof sessionInsertSchema>;

// Settings table for system configuration (API keys, etc)
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Setting = typeof settings.$inferSelect;
export const settingInsertSchema = createInsertSchema(settings).omit({ updatedAt: true });
export type SettingInsert = z.infer<typeof settingInsertSchema>;

// Viewer sessions table for analytics tracking
export const viewerSessions = pgTable("viewer_sessions", {
  id: text("id").primaryKey(),
  webinarId: text("webinar_id").notNull(),
  sessionId: text("session_id").notNull(),
  viewedAt: timestamp("viewed_at").defaultNow(),
  viewDurationSeconds: integer("view_duration_seconds").notNull().default(0),
  maxVideoPositionSeconds: integer("max_video_position_seconds").notNull().default(0),
  sessionDate: text("session_date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ViewerSession = typeof viewerSessions.$inferSelect;
export const viewerSessionInsertSchema = createInsertSchema(viewerSessions).omit({ id: true, createdAt: true });
export type ViewerSessionInsert = z.infer<typeof viewerSessionInsertSchema>;

// Leads table for capturing lead data
export const leads = pgTable("leads", {
  id: text("id").primaryKey(),
  webinarId: text("webinar_id").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  whatsapp: text("whatsapp"),
  city: text("city"),
  state: text("state"),
  customData: text("custom_data"), // JSON for future custom fields
  capturedAt: timestamp("captured_at").defaultNow(),
  sessionId: text("session_id"),
  // New fields for lead differentiation
  status: text("status").notNull().default("registered"), // 'registered' (inscrito) or 'watched' (assistiu)
  source: text("source").notNull().default("registration"), // 'registration' (página de inscrição) or 'room' (entrou direto na sala)
  joinedAt: timestamp("joined_at"), // When the lead entered the webinar room
  sequenceTriggered: boolean("sequence_triggered").notNull().default(false), // If email/whatsapp sequences were triggered
  // Affiliate tracking
  affiliateLinkCode: text("affiliate_link_code"), // Code of affiliate link used
});

export type Lead = typeof leads.$inferSelect;
export const leadInsertSchema = createInsertSchema(leads).omit({ id: true, capturedAt: true, joinedAt: true });
export type LeadInsert = z.infer<typeof leadInsertSchema>;

// Lead Messages table for tracking emails and WhatsApp messages sent to leads
export const leadMessages = pgTable("lead_messages", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  webinarId: text("webinar_id").notNull(),
  adminId: text("admin_id").notNull(),
  channel: text("channel").notNull(), // 'email' or 'whatsapp'
  messageType: text("message_type").notNull(), // 'campaign', 'sequence', 'manual', 'reminder'
  campaignId: text("campaign_id"), // Reference to email/whatsapp campaign if applicable
  subject: text("subject"), // For emails
  content: text("content"), // Message content preview
  status: text("status").notNull().default("sent"), // 'pending', 'sent', 'delivered', 'opened', 'clicked', 'failed'
  sentAt: timestamp("sent_at").defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  trackingId: text("tracking_id"), // Unique ID for tracking opens/clicks
  errorMessage: text("error_message"),
});

export type LeadMessage = typeof leadMessages.$inferSelect;
export const leadMessageInsertSchema = createInsertSchema(leadMessages).omit({ id: true, sentAt: true });
export type LeadMessageInsert = z.infer<typeof leadMessageInsertSchema>;

// Scripts table for webinar scripts and message generation
export const webinarScripts = pgTable("webinar_scripts", {
  id: text("id").primaryKey(),
  webinarId: text("webinar_id").notNull(),
  title: text("title").notNull(),
  script: text("script").notNull(),
  emailMessage: text("email_message"),
  whatsappMessage: text("whatsapp_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WebinarScript = typeof webinarScripts.$inferSelect;
export const webinarScriptInsertSchema = createInsertSchema(webinarScripts).omit({ id: true, createdAt: true, updatedAt: true });
export type WebinarScriptInsert = z.infer<typeof webinarScriptInsertSchema>;

// AI Configurations table - stores system prompts that super admin can edit
export const aiConfigs = pgTable("ai_configs", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("Configuração de IA"),
  systemPrompt: text("system_prompt").notNull().default(""),
  generatorType: text("generator_type").notNull().default("script"), // 'script' ou 'message' - cada um tem seu próprio prompt
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AiConfig = typeof aiConfigs.$inferSelect;
export const aiConfigInsertSchema = createInsertSchema(aiConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type AiConfigInsert = z.infer<typeof aiConfigInsertSchema>;

// AI Memories table - stores context files/texts that AI uses for generation
export const aiMemories = pgTable("ai_memories", {
  id: text("id").primaryKey(),
  configId: text("config_id").notNull(),
  generatorType: text("generator_type").notNull().default("script"), // 'script' ou 'message'
  label: text("label").notNull(),
  sourceType: text("source_type").notNull().default("text"),
  content: text("content"),
  fileUrl: text("file_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AiMemory = typeof aiMemories.$inferSelect;
export const aiMemoryInsertSchema = createInsertSchema(aiMemories).omit({ id: true, createdAt: true });
export type AiMemoryInsert = z.infer<typeof aiMemoryInsertSchema>;

// ============================================
// CHECKOUT SYSTEM TABLES
// ============================================

// Checkout Plans table - subscription plans for the SaaS
export const checkoutPlanos = pgTable("checkout_planos", {
  id: text("id").primaryKey(),
  nome: text("nome").notNull(),
  descricao: text("descricao").default(""),
  preco: integer("preco").notNull(), // Valor em centavos (ex: 9990 = R$ 99,90)
  prazoDias: integer("prazo_dias").notNull().default(30), // Dias de acesso após pagamento
  webinarLimit: integer("webinar_limit").notNull().default(5), // Limite de webinars no plano
  uploadLimit: integer("upload_limit").notNull().default(999), // Uploads ilimitados
  storageLimit: integer("storage_limit").notNull().default(5), // Limite de armazenamento em GB
  whatsappAccountLimit: integer("whatsapp_account_limit").notNull().default(2), // Limite de contas WhatsApp
  // Feature flags - controle granular de recursos por plano
  // null = usar fallback baseado no nome do plano (retrocompatibilidade)
  // true/false = valor explícito definido pelo admin
  featureAI: boolean("feature_ai"), // Acesso a todas as features de IA (null = fallback)
  featureTranscricao: boolean("feature_transcricao"), // Transcrição de vídeo com IA (null = fallback)
  featureDesignerIA: boolean("feature_designer_ia"), // Designer IA para personalização (null = fallback)
  featureGeradorMensagens: boolean("feature_gerador_mensagens"), // Gerador de mensagens com IA (null = fallback)
  ativo: boolean("ativo").notNull().default(true),
  gateway: text("gateway").notNull().default("mercadopago"), // 'mercadopago' ou 'stripe'
  tipoCobranca: text("tipo_cobranca").notNull().default("unico"), // 'unico' ou 'recorrente'
  frequencia: integer("frequencia").default(1), // Para recorrente: a cada X períodos
  frequenciaTipo: text("frequencia_tipo").default("months"), // 'days', 'months', 'years'
  disponivelRenovacao: boolean("disponivel_renovacao").notNull().default(false),
  beneficios: text("beneficios").default("[]"), // JSON array de benefícios
  destaque: boolean("destaque").notNull().default(false), // Destacar plano na página
  exibirNaLanding: boolean("exibir_na_landing").notNull().default(true), // Exibir na landing page
  ordem: integer("ordem").notNull().default(0), // Ordem de exibição
  criadoEm: timestamp("criado_em").defaultNow(),
  atualizadoEm: timestamp("atualizado_em").defaultNow(),
});

export type CheckoutPlano = typeof checkoutPlanos.$inferSelect;
export const checkoutPlanoInsertSchema = createInsertSchema(checkoutPlanos).omit({ id: true, criadoEm: true, atualizadoEm: true });
export type CheckoutPlanoInsert = z.infer<typeof checkoutPlanoInsertSchema>;

// Checkout Payments table - payment transactions
export const checkoutPagamentos = pgTable("checkout_pagamentos", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  nome: text("nome").notNull(),
  cpf: text("cpf"),
  telefone: text("telefone"),
  planoId: text("plano_id").notNull(),
  valor: integer("valor").notNull(), // Valor em centavos
  status: text("status").notNull().default("checkout_iniciado"), // 'checkout_iniciado', 'pending', 'approved', 'rejected', 'cancelled', 'in_process'
  statusDetail: text("status_detail"),
  metodoPagamento: text("metodo_pagamento"), // 'pix', 'boleto', 'credit_card', etc
  mercadopagoPaymentId: text("mercadopago_payment_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeCustomerId: text("stripe_customer_id"),
  dataPagamento: timestamp("data_pagamento"),
  dataAprovacao: timestamp("data_aprovacao"),
  dataExpiracao: timestamp("data_expiracao"),
  adminId: text("admin_id"), // FK para admins, preenchido após aprovação
  pixQrCode: text("pix_qr_code"), // QR Code PIX base64
  pixCopiaCola: text("pix_copia_cola"), // Código PIX copia e cola
  boletoUrl: text("boleto_url"), // URL do boleto
  boletoCodigo: text("boleto_codigo"), // Código de barras do boleto
  // Campos para tracking de falhas de pagamento
  gatewayErrorCode: text("gateway_error_code"), // Código de erro do gateway (cc_rejected_bad_filled_security_code, etc)
  gatewayErrorMessage: text("gateway_error_message"), // Mensagem original do gateway
  userFriendlyError: text("user_friendly_error"), // Mensagem amigável para o usuário
  failureAttempts: integer("failure_attempts").default(0), // Número de tentativas falhas
  lastFailureAt: timestamp("last_failure_at"), // Data/hora da última falha
  // Campos para tracking de afiliados
  affiliateLinkCode: text("affiliate_link_code"), // Código do link de afiliado usado
  // Campos para PIX/Boleto expiration tracking
  pixExpiresAt: timestamp("pix_expires_at"), // Data/hora de expiração do PIX
  boletoExpiresAt: timestamp("boleto_expires_at"), // Data/hora de vencimento do boleto
  pixExpiredEmailSent: boolean("pix_expired_email_sent").default(false), // Se já enviou email de PIX expirado
  // Campos para lembretes de falha de recorrência
  failedPaymentRemindersSent: integer("failed_payment_reminders_sent").default(0), // Número de lembretes enviados (0, 1, 2, 3)
  lastFailedPaymentReminderAt: timestamp("last_failed_payment_reminder_at"), // Data do último lembrete
  criadoEm: timestamp("criado_em").defaultNow(),
  atualizadoEm: timestamp("atualizado_em").defaultNow(),
});

export type CheckoutPagamento = typeof checkoutPagamentos.$inferSelect;
export const checkoutPagamentoInsertSchema = createInsertSchema(checkoutPagamentos).omit({ id: true, criadoEm: true, atualizadoEm: true });
export type CheckoutPagamentoInsert = z.infer<typeof checkoutPagamentoInsertSchema>;

// Checkout Configurations table - gateway credentials (encrypted)
export const checkoutConfigs = pgTable("checkout_configs", {
  id: text("id").primaryKey(),
  chave: text("chave").notNull().unique(), // Nome da configuração
  valor: text("valor").notNull(), // Valor criptografado
  criadoEm: timestamp("criado_em").defaultNow(),
  atualizadoEm: timestamp("atualizado_em").defaultNow(),
});

export type CheckoutConfig = typeof checkoutConfigs.$inferSelect;
export const checkoutConfigInsertSchema = createInsertSchema(checkoutConfigs).omit({ id: true, criadoEm: true, atualizadoEm: true });
export type CheckoutConfigInsert = z.infer<typeof checkoutConfigInsertSchema>;

// Active Subscriptions table - for recurring plans
export const checkoutAssinaturas = pgTable("checkout_assinaturas", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(), // FK para admins
  planoId: text("plano_id").notNull(), // FK para planos
  gateway: text("gateway").notNull(), // 'mercadopago' ou 'stripe'
  externalId: text("external_id"), // ID da assinatura no gateway
  status: text("status").notNull().default("pending"), // 'active', 'paused', 'cancelled', 'pending'
  proximoPagamento: timestamp("proximo_pagamento"),
  criadoEm: timestamp("criado_em").defaultNow(),
  atualizadoEm: timestamp("atualizado_em").defaultNow(),
});

export type CheckoutAssinatura = typeof checkoutAssinaturas.$inferSelect;
export const checkoutAssinaturaInsertSchema = createInsertSchema(checkoutAssinaturas).omit({ id: true, criadoEm: true, atualizadoEm: true });
export type CheckoutAssinaturaInsert = z.infer<typeof checkoutAssinaturaInsertSchema>;

// ============================================
// AI CHAT HISTORY
// ============================================

// AI Chat Conversations table - stores chat history for script generator
export const aiChats = pgTable("ai_chats", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(), // FK para admins
  webinarId: text("webinar_id"), // FK para webinar (opcional)
  title: text("title").notNull().default("Nova conversa"),
  messages: text("messages").notNull().default("[]"), // JSON array of messages
  generatedScript: text("generated_script").default(""), // Last generated script
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AiChat = typeof aiChats.$inferSelect;
export const aiChatInsertSchema = createInsertSchema(aiChats).omit({ id: true, createdAt: true, updatedAt: true });
export type AiChatInsert = z.infer<typeof aiChatInsertSchema>;

// AI Message Chat Conversations table - stores chat history for message generator
export const aiMessageChats = pgTable("ai_message_chats", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  webinarId: text("webinar_id"),
  scriptId: text("script_id"),
  title: text("title").notNull().default("Nova conversa"),
  messages: text("messages").notNull().default("[]"),
  generatedEmail: text("generated_email").default(""),
  generatedWhatsapp: text("generated_whatsapp").default(""),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AiMessageChat = typeof aiMessageChats.$inferSelect;
export const aiMessageChatInsertSchema = createInsertSchema(aiMessageChats).omit({ id: true, createdAt: true, updatedAt: true });
export type AiMessageChatInsert = z.infer<typeof aiMessageChatInsertSchema>;

// Video Transcriptions table - stores video transcriptions
export const videoTranscriptions = pgTable("video_transcriptions", {
  id: text("id").primaryKey(),
  webinarId: text("webinar_id"),
  uploadedVideoId: text("uploaded_video_id").notNull(),
  transcription: text("transcription"),
  status: text("status").notNull().default("pending"), // 'pending', 'processing', 'completed', 'failed'
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type VideoTranscription = typeof videoTranscriptions.$inferSelect;
export const videoTranscriptionInsertSchema = createInsertSchema(videoTranscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export type VideoTranscriptionInsert = z.infer<typeof videoTranscriptionInsertSchema>;

// ============================================
// PASSWORD RESET TOKENS
// ============================================

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export const passwordResetTokenInsertSchema = createInsertSchema(passwordResetTokens).omit({ id: true, createdAt: true });
export type PasswordResetTokenInsert = z.infer<typeof passwordResetTokenInsertSchema>;

// ============================================
// EMAIL NOTIFICATIONS LOG
// ============================================

export const emailNotificationsLog = pgTable("email_notifications_log", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(),
  emailType: text("email_type").notNull(), // 'welcome', 'password_reset', 'plan_expired', 'payment_failed'
  sentAt: timestamp("sent_at").defaultNow(),
  success: boolean("success").notNull().default(true),
  error: text("error"),
});

export type EmailNotificationLog = typeof emailNotificationsLog.$inferSelect;
export const emailNotificationLogInsertSchema = createInsertSchema(emailNotificationsLog).omit({ id: true, sentAt: true });
export type EmailNotificationLogInsert = z.infer<typeof emailNotificationLogInsertSchema>;

// ============================================
// WHATSAPP NOTIFICATIONS LOG
// ============================================

export const whatsappNotificationsLog = pgTable("whatsapp_notifications_log", {
  id: text("id").primaryKey(),
  notificationType: text("notification_type").notNull(),
  recipientPhone: text("recipient_phone").notNull(),
  recipientName: text("recipient_name"),
  message: text("message").notNull(),
  status: text("status").notNull().default("pending"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  error: text("error"),
});

export type WhatsappNotificationLog = typeof whatsappNotificationsLog.$inferSelect;
export const whatsappNotificationLogInsertSchema = createInsertSchema(whatsappNotificationsLog).omit({ id: true, createdAt: true });
export type WhatsappNotificationLogInsert = z.infer<typeof whatsappNotificationLogInsertSchema>;

// WhatsApp Notification Templates - Editable message templates
export const whatsappNotificationTemplates = pgTable("whatsapp_notification_templates", {
  id: text("id").primaryKey(),
  notificationType: text("notification_type").notNull().unique(), // 'credentials', 'payment_confirmed', 'password_reset', 'plan_expired', 'payment_failed'
  name: text("name").notNull(), // Display name
  description: text("description"), // Description of when this is sent
  messageTemplate: text("message_template").notNull(), // Template with placeholders like {name}, {planName}, etc.
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WhatsappNotificationTemplate = typeof whatsappNotificationTemplates.$inferSelect;
export const whatsappNotificationTemplateInsertSchema = createInsertSchema(whatsappNotificationTemplates).omit({ id: true, updatedAt: true });
export type WhatsappNotificationTemplateInsert = z.infer<typeof whatsappNotificationTemplateInsertSchema>;

// Email Notification Templates - Editable email templates for system notifications
export const emailNotificationTemplates = pgTable("email_notification_templates", {
  id: text("id").primaryKey(),
  notificationType: text("notification_type").notNull().unique(), // 'credentials', 'payment_confirmed', 'password_reset', 'plan_expired', 'payment_failed', 'welcome'
  name: text("name").notNull(), // Display name
  description: text("description"), // Description of when this is sent
  subject: text("subject").notNull(), // Email subject with placeholders
  htmlTemplate: text("html_template").notNull(), // HTML template with placeholders
  textTemplate: text("text_template").notNull(), // Plain text template with placeholders
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type EmailNotificationTemplate = typeof emailNotificationTemplates.$inferSelect;
export const emailNotificationTemplateInsertSchema = createInsertSchema(emailNotificationTemplates).omit({ id: true, updatedAt: true });
export type EmailNotificationTemplateInsert = z.infer<typeof emailNotificationTemplateInsertSchema>;

// ============================================
// EMAIL MARKETING SYSTEM
// ============================================

// Admin Email Credentials - Per-tenant Resend API keys (encrypted)
export const adminEmailCredentials = pgTable("admin_email_credentials", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull().unique(), // FK para admins
  provider: text("provider").notNull().default("resend"), // 'resend' por enquanto
  encryptedApiKey: text("encrypted_api_key").notNull(), // Chave API criptografada
  senderEmail: text("sender_email"), // Email do remetente configurado
  senderName: text("sender_name"), // Nome do remetente
  isValid: boolean("is_valid").notNull().default(false), // Validado com sucesso
  lastValidatedAt: timestamp("last_validated_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AdminEmailCredential = typeof adminEmailCredentials.$inferSelect;
export const adminEmailCredentialInsertSchema = createInsertSchema(adminEmailCredentials).omit({ id: true, createdAt: true, updatedAt: true });
export type AdminEmailCredentialInsert = z.infer<typeof adminEmailCredentialInsertSchema>;

// Email Sequences - Configurable email sequences per webinar
export const emailSequences = pgTable("email_sequences", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(), // FK para admins
  webinarId: text("webinar_id"), // FK para webinar (null = template global)
  name: text("name").notNull(), // Nome da sequência
  phase: text("phase").notNull(), // 'pre' (antes) ou 'post' (depois)
  offsetMinutes: integer("offset_minutes").notNull(), // Minutos relativos ao webinar (negativo = antes, positivo = depois)
  subject: text("subject").notNull(), // Assunto do email
  preheader: text("preheader").default(""), // Preview text
  designJson: text("design_json").notNull().default("{}"), // Design do Unlayer (JSON)
  compiledHtml: text("compiled_html").default(""), // HTML compilado para envio
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type EmailSequence = typeof emailSequences.$inferSelect;
export const emailSequenceInsertSchema = createInsertSchema(emailSequences).omit({ id: true, createdAt: true, updatedAt: true });
export type EmailSequenceInsert = z.infer<typeof emailSequenceInsertSchema>;

// Scheduled Emails - Queue of emails to be sent
export const scheduledEmails = pgTable("scheduled_emails", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(), // FK para admins
  webinarId: text("webinar_id").notNull(), // FK para webinar
  leadId: text("lead_id"), // FK para lead (null = broadcast)
  sequenceId: text("sequence_id").notNull(), // FK para email_sequences
  targetEmail: text("target_email").notNull(), // Email do destinatário
  targetName: text("target_name"), // Nome do destinatário
  sendAt: timestamp("send_at").notNull(), // Quando enviar
  status: text("status").notNull().default("queued"), // 'queued', 'sending', 'sent', 'failed', 'cancelled'
  lastError: text("last_error"), // Último erro se falhou
  sentAt: timestamp("sent_at"), // Quando foi enviado
  webinarSessionDate: text("webinar_session_date"), // Data da sessão do webinar para contexto
  metadata: text("metadata").default("{}"), // Dados extras em JSON
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ScheduledEmail = typeof scheduledEmails.$inferSelect;
export const scheduledEmailInsertSchema = createInsertSchema(scheduledEmails).omit({ id: true, createdAt: true, updatedAt: true });
export type ScheduledEmailInsert = z.infer<typeof scheduledEmailInsertSchema>;

// Lead Form Configurations - Per-webinar form settings
export const leadFormConfigs = pgTable("lead_form_configs", {
  id: text("id").primaryKey(),
  webinarId: text("webinar_id").notNull().unique(), // FK para webinar
  title: text("title").default("Inscreva-se no Webinário"), // Título do formulário
  subtitle: text("subtitle").default("Preencha seus dados para participar"), // Subtítulo
  collectName: boolean("collect_name").notNull().default(true),
  collectEmail: boolean("collect_email").notNull().default(true),
  collectWhatsapp: boolean("collect_whatsapp").notNull().default(true),
  collectCity: boolean("collect_city").notNull().default(false),
  collectState: boolean("collect_state").notNull().default(false),
  customFields: text("custom_fields").default("[]"), // JSON array de campos personalizados
  requireConsent: boolean("require_consent").notNull().default(true), // LGPD checkbox
  consentText: text("consent_text").default("Concordo em receber comunicações sobre este webinário"),
  buttonText: text("button_text").default("Quero Participar"),
  buttonColor: text("button_color").default("#22c55e"),
  buttonTextColor: text("button_text_color").default("#ffffff"),
  successMessage: text("success_message").default("Inscrição realizada com sucesso!"),
  redirectUrl: text("redirect_url"), // URL para redirecionar após cadastro
  backgroundColor: text("background_color").default("#1a1a2e"),
  cardBackgroundColor: text("card_background_color").default("#16213e"),
  textColor: text("text_color").default("#ffffff"),
  inputBackgroundColor: text("input_background_color").default("#0f0f23"),
  inputBorderColor: text("input_border_color").default("#374151"),
  inputTextColor: text("input_text_color").default("#ffffff"),
  labelColor: text("label_color").default("#9ca3af"),
  logoUrl: text("logo_url"), // Logo do formulário
  headerImageUrl: text("header_image_url"), // Imagem de cabeçalho
  showNextSession: boolean("show_next_session").notNull().default(true), // Mostrar próxima sessão
  fontFamily: text("font_family").default("Inter, system-ui, sans-serif"),
  borderRadius: text("border_radius").default("8"), // em pixels
  embedVersion: integer("embed_version").notNull().default(1), // Versão do embed code
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type LeadFormConfig = typeof leadFormConfigs.$inferSelect;
export const leadFormConfigInsertSchema = createInsertSchema(leadFormConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type LeadFormConfigInsert = z.infer<typeof leadFormConfigInsertSchema>;

// ============================================
// WHATSAPP MARKETING SYSTEM
// ============================================

// WhatsApp Accounts - Multiple accounts per admin for round-robin sending
// Suporta dois providers: 'baileys' (QR Code) ou 'cloud_api' (API Oficial Meta)
export const whatsappAccounts = pgTable("whatsapp_accounts", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(), // FK para admins (sem unique - múltiplas contas)
  label: text("label").notNull(), // Nome/apelido da conta (ex: "Conta Principal", "Conta 2")
  phoneNumber: text("phone_number"), // Número conectado
  status: text("status").notNull().default("disconnected"), // 'disconnected', 'connecting', 'qr_ready', 'connected', 'banned'
  qrCode: text("qr_code"), // QR code atual para conexão (apenas Baileys)
  scope: text("scope").notNull().default("marketing"), // 'notifications' (lembretes webinar) ou 'marketing' (sequências/broadcasts)
  
  // Provider: 'baileys' (padrão) ou 'cloud_api' (API oficial Meta)
  provider: text("provider").notNull().default("baileys"), // 'baileys' | 'cloud_api'
  
  // Campos para Cloud API (API Oficial Meta) - criptografados
  cloudApiAccessToken: text("cloud_api_access_token"), // Token de acesso da API (criptografado)
  cloudApiPhoneNumberId: text("cloud_api_phone_number_id"), // Phone Number ID do Meta
  cloudApiBusinnessAccountId: text("cloud_api_business_account_id"), // Business Account ID
  cloudApiWebhookVerifyToken: text("cloud_api_webhook_verify_token"), // Token para verificação de webhook
  cloudApiVersion: text("cloud_api_version").default("v20.0"), // Versão da API (v20.0, v23.0, etc)
  
  lastConnectedAt: timestamp("last_connected_at"),
  lastUsedAt: timestamp("last_used_at"), // Última vez que foi usada para envio (round-robin)
  priority: integer("priority").notNull().default(0), // Prioridade para ordenação
  dailyLimit: integer("daily_limit").notNull().default(1000), // Limite de mensagens por dia
  hourlyLimit: integer("hourly_limit").notNull().default(10), // Limite de mensagens por hora (para rotação)
  messagesSentToday: integer("messages_sent_today").notNull().default(0), // Contador de mensagens hoje
  messagesSentThisHour: integer("messages_sent_this_hour").notNull().default(0), // Contador de mensagens na hora atual
  lastHourResetTime: timestamp("last_hour_reset_time"), // Última vez que o contador horário foi resetado
  lastMessageResetDate: text("last_message_reset_date"), // Data do último reset do contador (YYYY-MM-DD)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WhatsappAccount = typeof whatsappAccounts.$inferSelect;
export const whatsappAccountInsertSchema = createInsertSchema(whatsappAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export type WhatsappAccountInsert = z.infer<typeof whatsappAccountInsertSchema>;

// WhatsApp Sessions - Store Baileys auth data per account (not per admin)
export const whatsappSessions = pgTable("whatsapp_sessions", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(), // FK para admins (sem unique - múltiplas sessões)
  accountId: text("account_id"), // FK para whatsapp_accounts (nova coluna)
  phoneNumber: text("phone_number"), // Número conectado
  sessionData: text("session_data"), // JSON com dados de auth do Baileys
  status: text("status").notNull().default("disconnected"), // 'disconnected', 'connecting', 'qr_ready', 'connected', 'banned'
  qrCode: text("qr_code"), // QR code atual para conexão
  lastConnectedAt: timestamp("last_connected_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WhatsappSession = typeof whatsappSessions.$inferSelect;
export const whatsappSessionInsertSchema = createInsertSchema(whatsappSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type WhatsappSessionInsert = z.infer<typeof whatsappSessionInsertSchema>;

// WhatsApp Sequences - Configurable message sequences per webinar
// messageType: 'text', 'image', 'audio', 'video', 'document'
// Limites de arquivo:
// - Áudio: até 16MB (formatos: ogg, mp3, m4a, wav)
// - Vídeo: até 16MB (formatos: mp4, 3gp)
// - Documento/PDF: até 100MB
// - Imagem: até 5MB (formatos: jpg, jpeg, png)
export const whatsappSequences = pgTable("whatsapp_sequences", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(), // FK para admins
  webinarId: text("webinar_id"), // FK para webinar (null = template global)
  name: text("name").notNull(), // Nome da sequência
  phase: text("phase").notNull(), // 'pre' (antes) ou 'post' (depois)
  offsetMinutes: integer("offset_minutes").notNull(), // Minutos relativos ao webinar
  messageText: text("message_text").notNull(), // Texto da mensagem (suporta merge tags e formatação: *negrito*, _itálico_, ~riscado~)
  messageType: text("message_type").notNull().default("text"), // 'text', 'image', 'audio', 'video', 'document'
  mediaUrl: text("media_url"), // URL de mídia se houver
  mediaFileName: text("media_file_name"), // Nome original do arquivo
  mediaMimeType: text("media_mime_type"), // MIME type do arquivo
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WhatsappSequence = typeof whatsappSequences.$inferSelect;
export const whatsappSequenceInsertSchema = createInsertSchema(whatsappSequences).omit({ id: true, createdAt: true, updatedAt: true });
export type WhatsappSequenceInsert = z.infer<typeof whatsappSequenceInsertSchema>;

// Scheduled WhatsApp Messages - Queue of messages to be sent
export const scheduledWhatsappMessages = pgTable("scheduled_whatsapp_messages", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(), // FK para admins
  webinarId: text("webinar_id").notNull(), // FK para webinar
  leadId: text("lead_id"), // FK para lead
  sequenceId: text("sequence_id").notNull(), // FK para whatsapp_sequences
  targetPhone: text("target_phone").notNull(), // Telefone do destinatário
  targetName: text("target_name"), // Nome do destinatário
  sendAt: timestamp("send_at").notNull(), // Quando enviar
  status: text("status").notNull().default("queued"), // 'queued', 'sending', 'sent', 'failed', 'cancelled'
  lastError: text("last_error"), // Último erro se falhou
  sentAt: timestamp("sent_at"), // Quando foi enviado
  webinarSessionDate: text("webinar_session_date"), // Data da sessão do webinar
  metadata: text("metadata").default("{}"), // Dados extras em JSON
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ScheduledWhatsappMessage = typeof scheduledWhatsappMessages.$inferSelect;
export const scheduledWhatsappMessageInsertSchema = createInsertSchema(scheduledWhatsappMessages).omit({ id: true, createdAt: true, updatedAt: true });
export type ScheduledWhatsappMessageInsert = z.infer<typeof scheduledWhatsappMessageInsertSchema>;

// Media Files - User file repository for WhatsApp media
// Each admin has their own isolated file storage
export const mediaFiles = pgTable("media_files", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(), // FK para admins - isolamento por usuário
  fileName: text("file_name").notNull(), // Nome original do arquivo
  mimeType: text("mime_type").notNull(), // MIME type (image/jpeg, audio/ogg, etc)
  sizeBytes: integer("size_bytes").notNull(), // Tamanho em bytes
  mediaType: text("media_type").notNull(), // 'image', 'audio', 'video', 'document'
  storageProvider: text("storage_provider").notNull(), // 'supabase', 'r2', 'local'
  storagePath: text("storage_path").notNull(), // Caminho/key no storage
  publicUrl: text("public_url").notNull(), // URL pública para acesso
  createdAt: timestamp("created_at").defaultNow(),
});

export type MediaFile = typeof mediaFiles.$inferSelect;
export const mediaFileInsertSchema = createInsertSchema(mediaFiles).omit({ id: true, createdAt: true });
export type MediaFileInsert = z.infer<typeof mediaFileInsertSchema>;

// Webinar View Logs - Log de visualizações para histórico com filtro por data
export const webinarViewLogs = pgTable("webinar_view_logs", {
  id: text("id").primaryKey(),
  webinarId: text("webinar_id").notNull(), // FK para webinars
  ownerId: text("owner_id"), // FK para admins (dono do webinar)
  viewerId: text("viewer_id"), // UUID do viewer para evitar contagem duplicada
  viewDate: text("view_date"), // Data no formato YYYY-MM-DD (São Paulo timezone)
  source: text("source").notNull().default("live"), // 'live', 'replay', 'embed'
  createdAt: timestamp("created_at").defaultNow(),
});

export type WebinarViewLog = typeof webinarViewLogs.$inferSelect;
export const webinarViewLogInsertSchema = createInsertSchema(webinarViewLogs).omit({ id: true, createdAt: true });
export type WebinarViewLogInsert = z.infer<typeof webinarViewLogInsertSchema>;

// ============================================
// WHATSAPP BROADCAST (ENVIOS EM MASSA)
// ============================================

// WhatsApp Contact Lists - Listas de contatos importados via Excel
export const whatsappContactLists = pgTable("whatsapp_contact_lists", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  totalContacts: integer("total_contacts").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WhatsappContactList = typeof whatsappContactLists.$inferSelect;
export const whatsappContactListInsertSchema = createInsertSchema(whatsappContactLists).omit({ id: true, createdAt: true, updatedAt: true });
export type WhatsappContactListInsert = z.infer<typeof whatsappContactListInsertSchema>;

// WhatsApp Contacts - Contatos individuais de cada lista
export const whatsappContacts = pgTable("whatsapp_contacts", {
  id: text("id").primaryKey(),
  listId: text("list_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  customField1: text("custom_field_1"),
  customField2: text("custom_field_2"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type WhatsappContact = typeof whatsappContacts.$inferSelect;
export const whatsappContactInsertSchema = createInsertSchema(whatsappContacts).omit({ id: true, createdAt: true });
export type WhatsappContactInsert = z.infer<typeof whatsappContactInsertSchema>;

// WhatsApp Broadcasts - Envios em massa com filtros e rotação de contas
export const whatsappBroadcasts = pgTable("whatsapp_broadcasts", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(),
  webinarId: text("webinar_id"),
  contactListId: text("contact_list_id"),
  sourceType: text("source_type").notNull().default("webinar"),
  name: text("name").notNull(),
  messageText: text("message_text").notNull(),
  messageType: text("message_type").notNull().default("text"),
  mediaUrl: text("media_url"),
  mediaFileName: text("media_file_name"),
  mediaMimeType: text("media_mime_type"),
  sendAsVoiceNote: boolean("send_as_voice_note").notNull().default(false),
  filterType: text("filter_type").notNull().default("all"),
  filterDateStart: text("filter_date_start"),
  filterDateEnd: text("filter_date_end"),
  filterSessionDate: text("filter_session_date"),
  status: text("status").notNull().default("draft"),
  totalRecipients: integer("total_recipients").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  pendingCount: integer("pending_count").notNull().default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WhatsappBroadcast = typeof whatsappBroadcasts.$inferSelect;
export const whatsappBroadcastInsertSchema = createInsertSchema(whatsappBroadcasts).omit({ id: true, createdAt: true, updatedAt: true });
export type WhatsappBroadcastInsert = z.infer<typeof whatsappBroadcastInsertSchema>;

// WhatsApp Broadcast Recipients - Destinatários individuais de cada broadcast
export const whatsappBroadcastRecipients = pgTable("whatsapp_broadcast_recipients", {
  id: text("id").primaryKey(),
  broadcastId: text("broadcast_id").notNull(),
  leadId: text("lead_id"), // Nullable: used for webinar leads
  contactId: text("contact_id"), // Nullable: used for imported contact lists
  phone: text("phone").notNull(),
  name: text("name"),
  email: text("email"), // Email for merge tags
  sessionDate: text("session_date"),
  accountId: text("account_id"),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type WhatsappBroadcastRecipient = typeof whatsappBroadcastRecipients.$inferSelect;
export const whatsappBroadcastRecipientInsertSchema = createInsertSchema(whatsappBroadcastRecipients).omit({ id: true, createdAt: true });
export type WhatsappBroadcastRecipientInsert = z.infer<typeof whatsappBroadcastRecipientInsertSchema>;

// ============================================
// AFFILIATE SYSTEM TABLES
// ============================================

// Affiliates table - registered affiliates (each affiliate is linked to an admin account)
export const affiliates = pgTable("affiliates", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(), // FK para admins (o afiliado é um admin)
  status: text("status").notNull().default("pending"), // 'pending', 'active', 'suspended', 'inactive'
  whatsapp: text("whatsapp"), // DDD + WhatsApp do afiliado
  commissionPercent: integer("commission_percent").notNull().default(30), // Percentual de comissão
  commissionFixed: integer("commission_fixed"), // Valor fixo opcional (centavos)
  metaPixelId: text("meta_pixel_id"), // Meta Pixel ID do afiliado para rastreamento
  metaAccessToken: text("meta_access_token"), // Meta Conversions API Access Token
  mpUserId: text("mp_user_id"), // ID do usuário no Mercado Pago (collector_id para split)
  mpAccessToken: text("mp_access_token"), // Token OAuth do MP (criptografado)
  mpRefreshToken: text("mp_refresh_token"), // Refresh token do MP
  mpTokenExpiresAt: timestamp("mp_token_expires_at"), // Expiração do token
  mpConnectedAt: timestamp("mp_connected_at"), // Data de conexão com MP
  stripeConnectAccountId: text("stripe_connect_account_id"), // ID da conta Stripe Connect do afiliado
  stripeConnectStatus: text("stripe_connect_status").default("pending"), // 'pending', 'connected', 'disabled'
  stripeConnectedAt: timestamp("stripe_connected_at"), // Data de conexão com Stripe Connect
  pixKey: text("pix_key"), // Chave PIX do afiliado
  pixKeyType: text("pix_key_type"), // Tipo: 'cpf', 'cnpj', 'email', 'phone', 'random'
  welcomeEmailSent: boolean("welcome_email_sent").notNull().default(false), // Se já enviou email de boas-vindas
  totalEarnings: integer("total_earnings").notNull().default(0), // Total ganho (centavos)
  pendingAmount: integer("pending_amount").notNull().default(0), // Valor pendente - aguardando liberação (centavos)
  availableAmount: integer("available_amount").notNull().default(0), // Valor disponível para saque (centavos)
  paidAmount: integer("paid_amount").notNull().default(0), // Valor já sacado (centavos)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Affiliate = typeof affiliates.$inferSelect;
export const affiliateInsertSchema = createInsertSchema(affiliates).omit({ id: true, createdAt: true, updatedAt: true });
export type AffiliateInsert = z.infer<typeof affiliateInsertSchema>;

// Affiliate Links table - unique tracking links for affiliates
export const affiliateLinks = pgTable("affiliate_links", {
  id: text("id").primaryKey(),
  affiliateId: text("affiliate_id").notNull(), // FK para affiliates
  code: text("code").notNull().unique(), // Código único do link (ex: "joao123")
  targetUrl: text("target_url"), // URL de destino (null = checkout geral)
  planoId: text("plano_id"), // FK para plano específico (opcional)
  clicks: integer("clicks").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AffiliateLink = typeof affiliateLinks.$inferSelect;
export const affiliateLinkInsertSchema = createInsertSchema(affiliateLinks).omit({ id: true, createdAt: true });
export type AffiliateLinkInsert = z.infer<typeof affiliateLinkInsertSchema>;

// Affiliate Sales table - tracks sales attributed to affiliates
export const affiliateSales = pgTable("affiliate_sales", {
  id: text("id").primaryKey(),
  affiliateId: text("affiliate_id").notNull(), // FK para affiliates
  affiliateLinkId: text("affiliate_link_id"), // FK para affiliate_links
  pagamentoId: text("pagamento_id").notNull(), // FK para checkout_pagamentos
  saleAmount: integer("sale_amount").notNull(), // Valor da venda (centavos)
  commissionAmount: integer("commission_amount").notNull(), // Valor da comissão (centavos)
  commissionPercent: integer("commission_percent"), // Percentual de comissão usado
  status: text("status").notNull().default("pending"), // 'pending', 'pending_payout', 'paid', 'refunded', 'cancelled', 'payout_failed'
  splitMethod: text("split_method"), // 'mp_marketplace', 'stripe_connect', 'manual'
  mpPaymentId: text("mp_payment_id"), // ID do pagamento original no MP (para verificar reembolso)
  mpTransferId: text("mp_transfer_id"), // ID da transferência no MP (quando pago via split)
  stripePaymentIntentId: text("stripe_payment_intent_id"), // ID do PaymentIntent no Stripe
  stripeTransferId: text("stripe_transfer_id"), // ID da transferência no Stripe Connect
  payoutScheduledAt: timestamp("payout_scheduled_at"), // Data agendada para pagamento ao afiliado
  payoutAttempts: integer("payout_attempts").notNull().default(0), // Tentativas de pagamento
  payoutError: text("payout_error"), // Último erro de pagamento
  paidAt: timestamp("paid_at"), // Data do pagamento efetivo
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AffiliateSale = typeof affiliateSales.$inferSelect;
export const affiliateSaleInsertSchema = createInsertSchema(affiliateSales).omit({ id: true, createdAt: true, updatedAt: true });
export type AffiliateSaleInsert = z.infer<typeof affiliateSaleInsertSchema>;

// Affiliate Config table - global configuration for the affiliate system
export const affiliateConfig = pgTable("affiliate_config", {
  id: text("id").primaryKey().default("default"),
  defaultCommissionPercent: integer("default_commission_percent").notNull().default(30),
  minWithdrawal: integer("min_withdrawal").notNull().default(5000), // Mínimo para saque (R$ 50,00)
  holdDays: integer("hold_days").notNull().default(7), // Dias para reter comissão
  autoPayEnabled: boolean("auto_pay_enabled").notNull().default(true), // Split automático
  autoApprove: boolean("auto_approve").notNull().default(false), // Aprovação automática de afiliados
  mpAppId: text("mp_app_id"), // App ID do MP para OAuth
  mpAppSecret: text("mp_app_secret"), // App Secret (criptografado)
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AffiliateConfig = typeof affiliateConfig.$inferSelect;
export const affiliateConfigInsertSchema = createInsertSchema(affiliateConfig).omit({ updatedAt: true });
export type AffiliateConfigInsert = z.infer<typeof affiliateConfigInsertSchema>;

// Affiliate Withdrawals table - withdrawal requests from affiliates
export const affiliateWithdrawals = pgTable("affiliate_withdrawals", {
  id: text("id").primaryKey(),
  affiliateId: text("affiliate_id").notNull(), // FK para affiliates
  amount: integer("amount").notNull(), // Valor solicitado (centavos)
  pixKey: text("pix_key").notNull(), // Chave PIX usada no saque
  pixKeyType: text("pix_key_type").notNull(), // Tipo da chave PIX
  status: text("status").notNull().default("pending"), // 'pending', 'approved', 'paid', 'rejected', 'cancelled'
  requestedAt: timestamp("requested_at").defaultNow(), // Data da solicitação
  processedAt: timestamp("processed_at"), // Data do processamento (aprovação/rejeição)
  paidAt: timestamp("paid_at"), // Data do pagamento efetivo
  processedBy: text("processed_by"), // ID do admin que processou
  transactionId: text("transaction_id"), // ID da transação PIX (opcional)
  notes: text("notes"), // Observações do admin
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AffiliateWithdrawal = typeof affiliateWithdrawals.$inferSelect;
export const affiliateWithdrawalInsertSchema = createInsertSchema(affiliateWithdrawals).omit({ id: true, createdAt: true, updatedAt: true });
export type AffiliateWithdrawalInsert = z.infer<typeof affiliateWithdrawalInsertSchema>;

// ============================================
// AI AGENTS SYSTEM
// ============================================

// AI Agents table - main agent configuration
export const aiAgents = pgTable("ai_agents", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(), // FK para admins
  whatsappAccountId: text("whatsapp_account_id").notNull(), // FK para whatsapp_accounts
  name: text("name").notNull(), // Nome do agente (ex: "Assistente de Vendas")
  description: text("description"), // Descrição do agente
  provider: text("provider").notNull().default("openai"), // openai, gemini, deepseek, grok
  apiKey: text("api_key").notNull(), // Chave API do provedor (criptografada)
  model: text("model").notNull().default("gpt-4o-mini"), // Modelo específico
  systemPrompt: text("system_prompt").notNull(), // Prompt do sistema (personalidade)
  temperature: integer("temperature").notNull().default(70), // 0-100 (divide por 100 para usar)
  maxTokens: integer("max_tokens").notNull().default(1000), // Máximo de tokens por resposta
  responseDelayMs: integer("response_delay_ms").notNull().default(2000), // Delay para simular digitação
  memoryLength: integer("memory_length").notNull().default(10), // Quantas mensagens manter no contexto
  memoryRetentionDays: integer("memory_retention_days").notNull().default(30), // Dias para manter histórico (0 = indefinido)
  isActive: boolean("is_active").notNull().default(true),
  workingHoursEnabled: boolean("working_hours_enabled").notNull().default(false),
  workingHoursStart: text("working_hours_start").default("09:00"), // HH:MM
  workingHoursEnd: text("working_hours_end").default("18:00"), // HH:MM
  workingDays: text("working_days").default("1,2,3,4,5"), // Dias da semana (1=seg, 7=dom)
  timezone: text("timezone").default("America/Sao_Paulo"), // IANA timezone (ex: America/Sao_Paulo)
  awayMessage: text("away_message").default("Olá! No momento estou fora do horário de atendimento. Retornarei em breve!"),
  escalationKeywords: text("escalation_keywords").default(""), // Palavras-chave para escalar (separadas por vírgula)
  escalationMessage: text("escalation_message").default("Vou transferir você para um atendente humano."),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AiAgent = typeof aiAgents.$inferSelect;
export const aiAgentInsertSchema = createInsertSchema(aiAgents).omit({ id: true, createdAt: true, updatedAt: true });
export type AiAgentInsert = z.infer<typeof aiAgentInsertSchema>;

// AI Agent Files table - files for context (RAG)
export const aiAgentFiles = pgTable("ai_agent_files", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(), // FK para ai_agents
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type").notNull(), // pdf, txt, docx
  fileSize: integer("file_size").notNull().default(0), // Em bytes
  extractedText: text("extracted_text"), // Texto extraído do arquivo
  createdAt: timestamp("created_at").defaultNow(),
});

export type AiAgentFile = typeof aiAgentFiles.$inferSelect;
export const aiAgentFileInsertSchema = createInsertSchema(aiAgentFiles).omit({ id: true, createdAt: true });
export type AiAgentFileInsert = z.infer<typeof aiAgentFileInsertSchema>;

// AI Conversations table - tracks conversations per contact
export const aiConversations = pgTable("ai_conversations", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(), // FK para ai_agents
  contactJid: text("contact_jid").notNull(), // JID do contato no WhatsApp
  contactName: text("contact_name"), // Nome do contato (se disponível)
  contactPhone: text("contact_phone"), // Telefone limpo
  status: text("status").notNull().default("active"), // active, archived, escalated
  totalMessages: integer("total_messages").notNull().default(0),
  totalTokensUsed: integer("total_tokens_used").notNull().default(0),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AiConversation = typeof aiConversations.$inferSelect;
export const aiConversationInsertSchema = createInsertSchema(aiConversations).omit({ id: true, createdAt: true });
export type AiConversationInsert = z.infer<typeof aiConversationInsertSchema>;

// AI Messages table - individual messages in conversations
export const aiMessages = pgTable("ai_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(), // FK para ai_conversations
  role: text("role").notNull(), // user, assistant
  content: text("content").notNull(),
  tokensUsed: integer("tokens_used").notNull().default(0),
  processingTimeMs: integer("processing_time_ms"), // Tempo de processamento
  errorMessage: text("error_message"), // Erro se houver
  createdAt: timestamp("created_at").defaultNow(),
});

export type AiMessage = typeof aiMessages.$inferSelect;
export const aiMessageInsertSchema = createInsertSchema(aiMessages).omit({ id: true, createdAt: true });
export type AiMessageInsert = z.infer<typeof aiMessageInsertSchema>;

// AI Usage Stats table - daily usage tracking per agent
export const aiUsageStats = pgTable("ai_usage_stats", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(), // FK para ai_agents
  date: text("date").notNull(), // YYYY-MM-DD
  messagesCount: integer("messages_count").notNull().default(0),
  tokensUsed: integer("tokens_used").notNull().default(0),
  conversationsCount: integer("conversations_count").notNull().default(0),
  errorsCount: integer("errors_count").notNull().default(0),
});

export type AiUsageStats = typeof aiUsageStats.$inferSelect;
export const aiUsageStatsInsertSchema = createInsertSchema(aiUsageStats).omit({ id: true });
export type AiUsageStatsInsert = z.infer<typeof aiUsageStatsInsertSchema>;
