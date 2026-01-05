import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createReadStream, existsSync, mkdirSync, renameSync, unlinkSync, statSync, readFileSync, writeFileSync } from "fs";
import { pipeline } from "stream/promises";
import path from "path";
import { storage } from "./storage";
import { webinarConfigInsertSchema, adminInsertSchema, webinarInsertSchema, sessions as sessionsTable, leads, webinarScriptInsertSchema, uploadedVideos, webinars as webinarsTable } from "@shared/schema";
import { registerEmailMarketingRoutes } from "./email-marketing";
import { registerWhatsAppRoutes } from "./whatsapp-routes";
import { registerAiAgentsRoutes } from "./ai-agents-routes";
import { registerGoogleCalendarRoutes } from "./google-calendar-routes";
import { registerClientCalendarRoutes } from "./client-calendar-routes";
import { rescheduleSequencesForWebinar, cancelAllSequencesForWebinar } from "./sequence-sync";
import { renderDomainsService } from "./render-domains";
import multer from "multer";
import { db } from "./db";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { comments } from "@shared/schema";
import OpenAI from "openai";
import { z } from "zod";
import XLSX from "xlsx";
import { spawn } from "child_process";
import { getMercadoPagoErrorMessage, getStripeErrorMessage, logPaymentError, logPaymentSuccess } from "./payment-errors";
import { createWriteStream } from "fs";
import { 
  sendAccessCredentialsEmailSafe, 
  sendPaymentConfirmedEmailSafe, 
  sendPaymentFailedEmailSafe, 
  sendPlanExpiredEmailSafe,
  sendWelcomeEmailSafe,
  sendAffiliateSaleEmailSafe
} from "./email";
import {
  sendWhatsAppCredentialsSafe,
  sendWhatsAppPaymentConfirmedSafe,
  sendWhatsAppPaymentFailedSafe,
  sendWhatsAppPlanExpiredSafe
} from "./whatsapp-notifications";
import { getAppUrl } from "./utils/getAppUrl";
import { sendLeadEvent, sendPageViewEvent, sendInitiateCheckoutEvent, sendCustomEvent } from "./meta-conversions-api";

// Helper function to generate a simple, easy-to-type temporary password
function generateTempPassword(): string {
  // Removed confusing chars: 0,O,1,l,I,o
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Helper function to normalize email (lowercase and trim)
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// Ensure upload directories exist with error handling
const uploadTempDir = path.join(process.cwd(), "uploads", "temp");
const videosDir = path.join(process.cwd(), "uploads", "videos");
const imagesDir = path.join(process.cwd(), "uploads", "images");

let directoryWriteEnabled = true;

function ensureDirectoryExists(dir: string): boolean {
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return true;
  } catch (error) {
    console.warn(`[warning] Could not create directory ${dir}:`, error);
    return false;
  }
}

try {
  directoryWriteEnabled = ensureDirectoryExists(uploadTempDir) && 
                          ensureDirectoryExists(videosDir) && 
                          ensureDirectoryExists(imagesDir);
  
  if (!directoryWriteEnabled) {
    console.warn("[warning] Local file storage disabled - using cloud storage only (R2/Supabase)");
  } else {
    console.log("[storage] Local directories ready:", { uploadTempDir, videosDir, imagesDir });
  }
} catch (error) {
  console.warn("[warning] Failed to initialize local directories:", error);
  directoryWriteEnabled = false;
}

// Use disk storage for large video files
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadTempDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: diskStorage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB
    fieldSize: 50 * 1024 * 1024, // 50MB for fields
  }
});

// Memory storage for small text files (comments)
const memoryUpload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB for text files
  }
});

// Simple video cache for most requested videos
const videoCache = new Map<string, { buffer: Buffer; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 1024 * 1024 * 300; // 300MB

function getCachedVideo(videoId: string): Buffer | null {
  const cached = videoCache.get(videoId);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    videoCache.delete(videoId);
    return null;
  }
  return cached.buffer;
}

function setCachedVideo(videoId: string, buffer: Buffer): void {
  let totalSize = 0;
  videoCache.forEach(v => totalSize += v.buffer.length);
  
  if (totalSize + buffer.length > MAX_CACHE_SIZE) {
    let oldestKey = null;
    let oldestTime = Date.now();
    videoCache.forEach((v, k) => {
      if (v.timestamp < oldestTime) {
        oldestTime = v.timestamp;
        oldestKey = k;
      }
    });
    if (oldestKey) videoCache.delete(oldestKey);
  }
  
  videoCache.set(videoId, { buffer, timestamp: Date.now() });
}

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Helper to sanitize webinar data for public responses (removes sensitive data, adds computed flags)
function sanitizeWebinarForPublic(webinar: any): any {
  const { facebookAccessToken, ...publicData } = webinar;
  return {
    ...publicData,
    metaCapiEnabled: !!(webinar.facebookPixelId && facebookAccessToken),
  };
}

const JWT_SECRET = process.env.JWT_SECRET || "autowebinar-jwt-secret-2024";

async function createSession(email: string): Promise<string> {
  const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias
  try {
    await db.insert(sessionsTable).values({
      token,
      email,
      expiresAt,
    });
  } catch (error) {
    console.error("Erro ao criar sessão:", error);
  }
  return token;
}

async function validateSession(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    // Primeiro tenta verificar como JWT
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { email: string };
      if (decoded && decoded.email) {
        return decoded.email;
      }
    } catch (jwtError) {
      // Não é um JWT válido, tenta verificar na tabela de sessões
    }

    // Fallback para verificar na tabela de sessões
    const result = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.token, token))
      .limit(1);
    
    if (result.length === 0) return null;
    
    const session = result[0];
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
      return null;
    }
    
    return session.email;
  } catch (error) {
    console.error("Erro ao validar sessão:", error);
    return null;
  }
}

/**
 * Verifica se o dono do webinar tem plano ativo
 * Retorna true se o plano está ativo, false se expirou
 */
async function isWebinarOwnerPlanActive(ownerId: string): Promise<boolean> {
  try {
    const admin = await storage.getAdminById(ownerId);
    if (!admin) return false;
    
    // Superadmins sempre têm acesso
    if (admin.role === "superadmin") return true;
    
    // Se não tem plano definido, não tem acesso
    if (!admin.planoId) return false;
    
    // Se não há data de expiração definida, considera ativo (planos legados com plano atribuído)
    if (!admin.accessExpiresAt) return true;
    
    // Verifica se a data de expiração é no futuro
    return new Date(admin.accessExpiresAt) > new Date();
  } catch (error) {
    console.error("Erro ao verificar plano do dono:", error);
    return false;
  }
}

/**
 * Verifica se o plano do admin está ativo (não expirado)
 * Aceita objeto admin diretamente para evitar query extra
 * Superadmins sempre têm plano ativo (role = 'superadmin')
 * Usuários sem plano (planoId null) não têm acesso
 */
function isAdminPlanActive(admin: { accessExpiresAt: Date | null; role?: string; planoId?: string | null }): boolean {
  // Superadmins sempre têm acesso (não expira)
  if (admin.role === "superadmin") return true;
  
  // Se não tem plano definido, não tem acesso
  if (!admin.planoId) return false;
  
  // Se não há data de expiração definida, considera ativo (planos legados com plano atribuído)
  if (!admin.accessExpiresAt) return true;
  
  // Verifica se a data de expiração é no futuro
  return new Date(admin.accessExpiresAt) > new Date();
}

/**
 * Remove acentos de uma string para comparação case-insensitive
 */
function normalizeString(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/**
 * Verifica se o plano do admin permite acesso a features de IA
 * Usa os campos de feature flags do plano (featureAI, featureTranscricao, etc.)
 * Para retrocompatibilidade, também verifica pelo nome do plano se os campos não existem
 * Superadmins sempre têm acesso
 */
async function isAIPlanAllowed(admin: { planoId: string | null; role?: string }): Promise<boolean> {
  return isFeatureAllowed(admin, 'featureAI');
}

/**
 * Verifica se o plano permite transcrição de vídeo
 */
async function isTranscricaoAllowed(admin: { planoId: string | null; role?: string }): Promise<boolean> {
  return isFeatureAllowed(admin, 'featureTranscricao');
}

/**
 * Verifica se o plano permite Designer IA
 */
async function isDesignerIAAllowed(admin: { planoId: string | null; role?: string }): Promise<boolean> {
  return isFeatureAllowed(admin, 'featureDesignerIA');
}

/**
 * Verifica se o plano permite Gerador de Mensagens
 */
async function isGeradorMensagensAllowed(admin: { planoId: string | null; role?: string }): Promise<boolean> {
  return isFeatureAllowed(admin, 'featureGeradorMensagens');
}

/**
 * Função base para verificar permissão de features
 * @param admin - Objeto admin com planoId e role
 * @param featureKey - Chave da feature a verificar (featureAI, featureTranscricao, etc.)
 */
async function isFeatureAllowed(
  admin: { planoId: string | null; role?: string }, 
  featureKey: 'featureAI' | 'featureTranscricao' | 'featureDesignerIA' | 'featureGeradorMensagens'
): Promise<boolean> {
  // Superadmins sempre têm acesso
  if (admin.role === "superadmin") return true;
  
  // Se não tem plano, não pode usar features de IA
  if (!admin.planoId) return false;
  
  // Trial não tem acesso a features de IA
  if (admin.planoId === "trial") return false;
  
  try {
    const plano = await storage.getCheckoutPlanoById(admin.planoId);
    if (!plano) return false;
    
    // Verifica se o plano tem o campo de feature definido explicitamente
    // Se o campo for true/false, usa o valor explícito
    // Se o campo for null/undefined, usa fallback baseado no nome do plano
    const featureValue = (plano as any)[featureKey];
    
    // Log de debug para diagnóstico
    console.log(`[feature-check] Plan: ${plano.nome}, PlanoId: ${plano.id}, Key: ${featureKey}, Value: ${featureValue}, Type: ${typeof featureValue}`);
    
    // Valor explícito definido pelo admin - usa diretamente
    if (featureValue === true) {
      console.log(`[feature-check] Resultado: PERMITIDO (valor explícito true)`);
      return true;
    }
    if (featureValue === false) {
      console.log(`[feature-check] Resultado: BLOQUEADO (valor explícito false)`);
      return false;
    }
    
    // Fallback para retrocompatibilidade (quando valor é null/undefined)
    // Verifica pelo nome do plano para manter acesso de planos existentes
    const normalizedPlanName = normalizeString(plano.nome);
    const aiAllowedKeywords = ["avancado", "elite", "pro", "profissional", "ilimitado", "enterprise", "premium"];
    
    const fallbackResult = aiAllowedKeywords.some(keyword => normalizedPlanName.includes(keyword));
    console.log(`[feature-check] Resultado: ${fallbackResult ? 'PERMITIDO' : 'BLOQUEADO'} (fallback pelo nome: ${normalizedPlanName})`);
    return fallbackResult;
  } catch (error) {
    console.error(`Erro ao verificar permissão de ${featureKey}:`, error);
    return false;
  }
}

/**
 * Helper para detectar a URL pública do servidor
 * Prioridade:
 * 1. Variável de ambiente PUBLIC_BASE_URL (para override explícito em produção)
 * 2. Parâmetro base_url na query (para geração antecipada)
 * 3. Detecção automática do Replit via REPLIT_DOMAINS
 * 4. Detecção via headers X-Forwarded-* (funciona em Render, Vercel, etc.)
 */
function getPublicBaseUrl(req: Request, queryBaseUrl?: string): string {
  // 1. Override via variável de ambiente (para produção em Render, Vercel, etc.)
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, ""); // Remove trailing slash
  }
  
  // 2. Override via parâmetro na query
  if (queryBaseUrl) {
    return queryBaseUrl.replace(/\/$/, "");
  }
  
  // 3. Detecção automática do Replit
  if (process.env.REPLIT_DOMAINS) {
    // REPLIT_DOMAINS pode conter múltiplos domínios separados por vírgula
    const replitDomain = process.env.REPLIT_DOMAINS.split(",")[0].trim();
    return `https://${replitDomain}`;
  }
  
  // 4. Detecção automática via headers (para Render, Vercel, etc.)
  const forwardedProto = req.get("x-forwarded-proto");
  const forwardedHost = req.get("x-forwarded-host");
  
  // Determinar protocolo (preferir HTTPS)
  let protocol = forwardedProto || (req.secure ? "https" : req.protocol);
  
  // Forçar HTTPS se a variável FORCE_HTTPS estiver definida
  if (process.env.FORCE_HTTPS === "1" || process.env.FORCE_HTTPS === "true") {
    protocol = "https";
  }
  
  // Determinar host
  const host = forwardedHost || req.get("host") || "localhost:5000";
  
  return `${protocol}://${host}`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Trust proxy for correct URL detection behind reverse proxies (Replit, Render, etc.)
  app.set("trust proxy", true);
  
  // Health check endpoint for Render and other platforms
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      directoryWriteEnabled,
      environment: process.env.NODE_ENV || "development"
    });
  });
  
  // Initialize defaults on startup
  await storage.initializeDefaults();
  await storage.initializeDefaultAiConfig();
  await storage.initializeDefaultPlanos();
  await storage.initDefaultWhatsappNotificationTemplates();
  await storage.initDefaultEmailNotificationTemplates();

  /**
   * Helper function to create affiliate sale when payment is approved
   * Called from webhooks (MP and Stripe) when payment is confirmed
   * 
   * IMPORTANT: The affiliate payout is SCHEDULED for holdDays (default 7) days later
   * to allow for refunds. The actual transfer happens via the payout scheduler.
   */
  async function processAffiliateSale(pagamento: any, plano: any, gateway: 'mercadopago' | 'stripe' = 'mercadopago'): Promise<void> {
    try {
      if (!pagamento.affiliateLinkCode) return;
      
      const link = await storage.getAffiliateLinkByCode(pagamento.affiliateLinkCode);
      if (!link) {
        console.log(`[Affiliate] Link not found for code: ${pagamento.affiliateLinkCode}`);
        return;
      }
      
      const affiliate = await storage.getAffiliateById(link.affiliateId);
      if (!affiliate || affiliate.status !== "active") {
        console.log(`[Affiliate] Affiliate not active or not found: ${link.affiliateId}`);
        return;
      }
      
      // Get commission config to calculate commission and hold days
      const config = await storage.getAffiliateConfig();
      // Use nullish coalescing to allow 0% commission (0 is falsy but valid)
      const commissionPercent = affiliate.commissionPercent ?? config?.defaultCommissionPercent ?? 10;
      // IMPORTANT: Minimum 7-day hold is mandatory to allow for refunds
      const MIN_HOLD_DAYS = 7;
      const holdDays = Math.max(config?.holdDays ?? MIN_HOLD_DAYS, MIN_HOLD_DAYS);
      
      // Calculate commission (valor is in centavos)
      const commissionAmount = Math.floor(pagamento.valor * (commissionPercent / 100));
      
      // Check if sale already exists for this payment (use dedicated function)
      const existingSale = await storage.getAffiliateSaleByPagamentoId(pagamento.id);
      
      if (existingSale) {
        console.log(`[Affiliate] Sale already exists for pagamento: ${pagamento.id}`);
        return;
      }
      
      // Calculate payout scheduled date (now + holdDays)
      const payoutScheduledAt = new Date();
      payoutScheduledAt.setDate(payoutScheduledAt.getDate() + holdDays);
      
      // Determine split method based on affiliate connected accounts
      let splitMethod: 'mp_marketplace' | 'stripe_connect' | 'manual' | null = 'manual';
      if (gateway === 'mercadopago' && affiliate.mpUserId && config?.autoPayEnabled) {
        splitMethod = 'mp_marketplace';
      } else if (gateway === 'stripe' && affiliate.stripeConnectAccountId && affiliate.stripeConnectStatus === 'connected' && config?.autoPayEnabled) {
        splitMethod = 'stripe_connect';
      }
      
      // Create affiliate sale with scheduled payout
      await storage.createAffiliateSale({
        affiliateId: affiliate.id,
        affiliateLinkId: link.id,
        pagamentoId: pagamento.id,
        saleAmount: pagamento.valor,
        commissionAmount,
        commissionPercent,
        status: splitMethod !== 'manual' ? "pending_payout" : "pending", // pending_payout = scheduled for auto transfer
        splitMethod,
        mpPaymentId: gateway === 'mercadopago' ? pagamento.mercadopagoPaymentId : null,
        stripePaymentIntentId: gateway === 'stripe' ? pagamento.stripePaymentIntentId : null,
        payoutScheduledAt: splitMethod !== 'manual' ? payoutScheduledAt : null,
        payoutAttempts: 0,
      });
      
      // Update affiliate balance (add to pending and total earnings)
      const newPendingAmount = (affiliate.pendingAmount || 0) + commissionAmount;
      const newTotalEarnings = (affiliate.totalEarnings || 0) + commissionAmount;
      await storage.updateAffiliate(affiliate.id, {
        pendingAmount: newPendingAmount,
        totalEarnings: newTotalEarnings,
      });
      
      // Increment conversions on the link
      await storage.incrementAffiliateLinkConversions(link.id);
      
      const payoutInfo = splitMethod !== 'manual' 
        ? `scheduled for ${payoutScheduledAt.toISOString()} via ${splitMethod}` 
        : 'manual payout required';
      console.log(`[Affiliate] Sale created - affiliateId: ${affiliate.id}, pagamentoId: ${pagamento.id}, commission: ${commissionAmount} (${commissionPercent}%), ${payoutInfo}`);
      
      // Send sale notification email to affiliate (non-blocking)
      const affiliateAdmin = await storage.getAdminById(affiliate.adminId);
      if (affiliateAdmin) {
        import("./email").then(({ sendAffiliateSaleEmail }) => {
          sendAffiliateSaleEmail(
            affiliateAdmin.email, 
            affiliateAdmin.name || "Afiliado", 
            pagamento.valor, 
            commissionAmount
          ).catch(err => {
            console.error("[Affiliate] Erro ao enviar email de venda:", err);
          });
        });
      }
    } catch (error) {
      console.error("[Affiliate] Error processing affiliate sale:", error);
    }
  }

  // Auth API
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const admin = await storage.getAdminByEmail(normalizeEmail(email));
      
      if (!admin) {
        return res.status(401).json({ error: "Usuário não encontrado, verifique o email digitado" });
      }

      const bcrypt = await import('bcryptjs');
      let isValidPassword = false;
      
      // Check if password is hashed (bcrypt hashes start with $2)
      if (admin.password.startsWith('$2')) {
        isValidPassword = await bcrypt.compare(password, admin.password);
      } else {
        // Legacy plain text comparison - migrate to hash on success
        if (admin.password === password) {
          isValidPassword = true;
          // Rehash the password for future logins
          const hashedPassword = await bcrypt.hash(password, 10);
          await storage.updateAdmin(admin.id, { password: hashedPassword });
          console.log(`[auth] Migrated password to bcrypt hash for ${email}`);
        }
      }

      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Permitir login mesmo se inativo ou expirado - o frontend mostrará as telas de bloqueio apropriadas
      // (ExpiredPlanBlocker, PaymentFailedBlocker, NoPlanBlocker)

      const token = await createSession(email);
      res.json({ token, email: admin.email });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Registro de teste gratuito (7 dias, 1 webinar, 1GB)
  app.post("/api/auth/register-trial", async (req, res) => {
    try {
      const { name, email, password, whatsapp } = req.body;

      if (!name || !email) {
        return res.status(400).json({ error: "Nome e e-mail são obrigatórios" });
      }

      if (!password || password.length < 6) {
        return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres" });
      }

      // Verificar se já existe um usuário com esse email
      const existingAdmin = await storage.getAdminByEmail(email.toLowerCase());
      if (existingAdmin) {
        return res.status(400).json({ error: "Este e-mail já está cadastrado. Faça login na sua conta." });
      }

      // Hash da senha fornecida pelo usuário
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);

      // Calcular data de expiração (7 dias)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Criar usuário com limites de teste grátis
      const newAdmin = await storage.createAdmin({
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        role: "user",
        webinarLimit: 1, // 1 webinar máximo
        uploadLimit: 1, // 1GB de upload
        isActive: true,
        accessExpiresAt: expiresAt,
        planoId: "trial", // Identificador do plano de teste
      });

      // Criar sessão automaticamente
      const token = await createSession(email.toLowerCase());

      // Log do cadastro
      console.log(`[trial] Novo usuário de teste criado: ${email} (expira em ${expiresAt.toISOString()})`);

      // Enviar email de boas-vindas (não bloqueia a resposta)
      import("./email").then(({ sendWelcomeEmail }) => {
        sendWelcomeEmail(email.toLowerCase(), name).catch(err => {
          console.error("[trial] Erro ao enviar email de boas-vindas:", err);
        });
      });

      res.json({ 
        token, 
        email: newAdmin.email,
        message: "Conta de teste criada com sucesso! Você tem 7 dias para experimentar a plataforma.",
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error: any) {
      console.error("[trial] Erro ao criar conta de teste:", error);
      res.status(400).json({ error: error.message || "Erro ao criar conta" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (token) {
      try {
        await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
      } catch (error) {
        console.error("Erro ao fazer logout:", error);
      }
    }
    res.json({ success: true });
  });

  // ============================================
  // PASSWORD RESET ROUTES
  // ============================================

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "E-mail é obrigatório" });
      }

      const admin = await storage.getAdminByEmail(email.toLowerCase());
      
      if (!admin) {
        return res.status(404).json({ 
          error: "Usuário não encontrado, verifique o email digitado" 
        });
      }

      const resetToken = Math.random().toString(36).substring(2) + Date.now().toString(36) + Math.random().toString(36).substring(2);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      const { passwordResetTokens } = await import("@shared/schema");
      await db.insert(passwordResetTokens).values({
        id: Math.random().toString(36).substring(2) + Date.now().toString(36),
        email: email.toLowerCase(),
        token: resetToken,
        expiresAt,
      });

      const { sendPasswordResetEmail } = await import("./email");
      console.log(`[auth] Iniciando envio de email de recuperação para ${email}`);
      const emailSent = await sendPasswordResetEmail(email.toLowerCase(), admin.name || "Usuário", resetToken);
      console.log(`[auth] Resultado do envio de email: ${emailSent ? 'SUCESSO' : 'FALHOU'}`);
      
      // Send WhatsApp notification if phone available
      if (admin.telefone) {
        const { sendWhatsAppPasswordResetSafe } = await import("./whatsapp-notifications");
        sendWhatsAppPasswordResetSafe(admin.telefone, admin.name || "Usuário", resetToken);
      }

      console.log(`[auth] Token de recuperação criado para ${email}`);

      res.json({ 
        success: true, 
        message: "Se o e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha." 
      });
    } catch (error: any) {
      console.error("[auth] Erro ao solicitar recuperação de senha:", error);
      res.status(500).json({ error: "Erro ao processar solicitação" });
    }
  });

  app.get("/api/auth/verify-reset-token/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      if (!token) {
        return res.status(400).json({ valid: false, error: "Token não fornecido" });
      }

      const { passwordResetTokens } = await import("@shared/schema");
      const result = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token, token))
        .limit(1);

      if (result.length === 0) {
        return res.json({ valid: false, error: "Token inválido" });
      }

      const resetToken = result[0];
      
      if (resetToken.usedAt) {
        return res.json({ valid: false, error: "Este link já foi utilizado" });
      }

      if (new Date(resetToken.expiresAt) < new Date()) {
        return res.json({ valid: false, error: "Este link expirou. Solicite uma nova recuperação de senha." });
      }

      res.json({ valid: true, email: resetToken.email });
    } catch (error: any) {
      console.error("[auth] Erro ao verificar token:", error);
      res.status(500).json({ valid: false, error: "Erro ao verificar token" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ error: "Token e nova senha são obrigatórios" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres" });
      }

      const { passwordResetTokens } = await import("@shared/schema");
      const result = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token, token))
        .limit(1);

      if (result.length === 0) {
        return res.status(400).json({ error: "Token inválido" });
      }

      const resetToken = result[0];
      
      if (resetToken.usedAt) {
        return res.status(400).json({ error: "Este link já foi utilizado" });
      }

      if (new Date(resetToken.expiresAt) < new Date()) {
        return res.status(400).json({ error: "Este link expirou. Solicite uma nova recuperação de senha." });
      }

      const admin = await storage.getAdminByEmail(resetToken.email);
      if (!admin) {
        return res.status(400).json({ error: "Usuário não encontrado" });
      }

      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await storage.updateAdmin(admin.id, { password: hashedPassword });

      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.token, token));

      console.log(`[auth] Senha redefinida com sucesso para ${resetToken.email}`);

      res.json({ success: true, message: "Senha redefinida com sucesso! Você já pode fazer login." });
    } catch (error: any) {
      console.error("[auth] Erro ao redefinir senha:", error);
      res.status(500).json({ error: "Erro ao redefinir senha" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    const email = await validateSession(token || "");
    if (!email) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const admin = await storage.getAdminByEmail(email);
    res.json({ 
      email, 
      name: admin?.name || "Administrador",
      telefone: admin?.telefone || null,
      role: admin?.role || "user",
      webinarLimit: admin?.webinarLimit || 5,
      accessExpiresAt: admin?.accessExpiresAt || null,
      planoId: admin?.planoId || null,
      paymentStatus: admin?.paymentStatus || "ok",
      paymentFailedReason: admin?.paymentFailedReason || null,
      isActive: admin?.isActive ?? true,
    });
  });

  app.get("/api/admin/profile", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    const email = await validateSession(token || "");
    if (!email) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const admin = await storage.getAdminByEmail(email);
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }
    res.json({ 
      id: admin.id, 
      name: admin.name, 
      email: admin.email,
      telefone: admin.telefone,
      role: admin.role,
      webinarLimit: admin.webinarLimit,
    });
  });

  app.patch("/api/admin/profile", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { name, telefone, newEmail, currentPassword, newPassword } = req.body;
      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      // Se tentando mudar email ou senha, validar senha atual
      if (newEmail || newPassword) {
        if (!currentPassword) {
          return res.status(401).json({ error: "Current password is required" });
        }
        
        const bcrypt = await import('bcryptjs');
        let isValidPassword = false;
        
        // Check if password is hashed (bcrypt hashes start with $2)
        if (admin.password.startsWith('$2')) {
          isValidPassword = await bcrypt.compare(currentPassword, admin.password);
        } else {
          // Legacy plain text comparison
          isValidPassword = currentPassword === admin.password;
        }
        
        if (!isValidPassword) {
          return res.status(401).json({ error: "Current password is incorrect" });
        }
      }

      // If changing password, hash the new one
      let passwordToSave = admin.password;
      if (newPassword) {
        const bcrypt = await import('bcryptjs');
        passwordToSave = await bcrypt.hash(newPassword, 10);
      }

      await storage.updateAdminProfile(admin.id, {
        name: name || admin.name,
        email: newEmail || admin.email,
        password: passwordToSave,
        telefone: telefone !== undefined ? telefone : admin.telefone,
      });

      res.json({ success: true, message: "Profile updated successfully" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Users/Admins API (gerenciamento de usuários pelo superadmin)
  app.get("/api/users", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    const email = await validateSession(token || "");
    if (!email) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Verificar se é superadmin
    const currentAdmin = await storage.getAdminByEmail(email);
    if (!currentAdmin || currentAdmin.role !== "superadmin") {
      return res.status(403).json({ error: "Access denied. Superadmin only." });
    }

    const allAdmins = await storage.getAllAdmins();
    
    // Calcular webinars de cada usuário
    const usersWithStats = await Promise.all(allAdmins.map(async (a) => {
      const webinarCount = await storage.countWebinarsByOwner(a.id);
      return {
        id: a.id,
        name: a.name,
        email: a.email,
        role: a.role,
        webinarLimit: a.webinarLimit,
        uploadLimit: a.uploadLimit,
        planoId: a.planoId,
        webinarCount,
        isActive: a.isActive,
        accessExpiresAt: a.accessExpiresAt,
        createdAt: a.createdAt,
      };
    }));
    
    res.json(usersWithStats);
  });

  app.post("/api/users", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verificar se é superadmin
      const currentAdmin = await storage.getAdminByEmail(email);
      if (!currentAdmin || currentAdmin.role !== "superadmin") {
        return res.status(403).json({ error: "Access denied. Superadmin only." });
      }

      const { name, email: userEmail, password, webinarLimit, uploadLimit, accessExpiresAt, planoId } = req.body;
      
      // Verificar se email já existe
      const existing = await storage.getAdminByEmail(userEmail);
      if (existing) {
        return res.status(400).json({ error: "Email já está em uso" });
      }

      // Hash the password before storing
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(password || "123456", 10);

      const admin = await storage.createAdmin({
        name: name || "Novo Usuário",
        email: userEmail,
        password: hashedPassword,
        role: "user",
        webinarLimit: webinarLimit || 5,
        uploadLimit: uploadLimit || 5,
        planoId: planoId && planoId !== "none" ? planoId : null,
        isActive: true,
        accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt) : null,
      });
      
      res.json({ 
        id: admin.id, 
        name: admin.name,
        email: admin.email, 
        role: admin.role,
        webinarLimit: admin.webinarLimit,
        isActive: admin.isActive,
        accessExpiresAt: admin.accessExpiresAt,
        createdAt: admin.createdAt,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Login as user (impersonation) - superadmin only
  app.post("/api/users/:id/login-as", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const currentAdmin = await storage.getAdminByEmail(email);
      if (!currentAdmin || currentAdmin.role !== "superadmin") {
        return res.status(403).json({ error: "Access denied. Superadmin only." });
      }

      const targetUser = await storage.getAdminById(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const newToken = await createSession(targetUser.email);
      res.json({ token: newToken, email: targetUser.email, name: targetUser.name });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verificar se é superadmin
      const currentAdmin = await storage.getAdminByEmail(email);
      if (!currentAdmin || currentAdmin.role !== "superadmin") {
        return res.status(403).json({ error: "Access denied. Superadmin only." });
      }

      const { name, email: newEmail, password, webinarLimit, uploadLimit, isActive, accessExpiresAt, planoId } = req.body;
      
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (newEmail !== undefined) updates.email = newEmail;
      if (password !== undefined && password !== "") {
        // Hash the new password before storing
        const bcrypt = await import('bcryptjs');
        updates.password = await bcrypt.hash(password, 10);
      }
      if (webinarLimit !== undefined) updates.webinarLimit = webinarLimit;
      if (uploadLimit !== undefined) updates.uploadLimit = uploadLimit;
      if (isActive !== undefined) updates.isActive = isActive;
      if (accessExpiresAt !== undefined) updates.accessExpiresAt = accessExpiresAt ? new Date(accessExpiresAt) : null;
      if (planoId !== undefined) updates.planoId = planoId === "none" ? null : planoId;

      await storage.updateAdmin(req.params.id, updates);
      
      const updated = await storage.getAdminById(req.params.id);
      res.json({ 
        id: updated?.id, 
        name: updated?.name,
        email: updated?.email, 
        role: updated?.role,
        webinarLimit: updated?.webinarLimit,
        isActive: updated?.isActive,
        accessExpiresAt: updated?.accessExpiresAt,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verificar se é superadmin
      const currentAdmin = await storage.getAdminByEmail(email);
      if (!currentAdmin || currentAdmin.role !== "superadmin") {
        return res.status(403).json({ error: "Access denied. Superadmin only." });
      }

      // Não permitir deletar o próprio superadmin
      if (req.params.id === currentAdmin.id) {
        return res.status(400).json({ error: "Você não pode deletar sua própria conta" });
      }

      await storage.deleteAdmin(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Complete deletion of user account and all their data (superadmin only)
  app.delete("/api/users/:id/complete", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verificar se é superadmin
      const currentAdmin = await storage.getAdminByEmail(email);
      if (!currentAdmin || currentAdmin.role !== "superadmin") {
        return res.status(403).json({ error: "Access denied. Superadmin only." });
      }

      // Não permitir deletar o próprio superadmin
      if (req.params.id === currentAdmin.id) {
        return res.status(400).json({ error: "Você não pode deletar sua própria conta" });
      }

      // Get user info before deletion for response
      const userToDelete = await storage.getAdminById(req.params.id);
      if (!userToDelete) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      // Perform complete deletion
      const result = await storage.deleteAdminCompletely(req.params.id);
      
      res.json({ 
        success: true,
        deletedUser: userToDelete.email,
        ...result
      });
    } catch (error: any) {
      console.error("[API] Error in complete user deletion:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // List orphan content (superadmin only) - for preview before migration
  app.get("/api/admin/orphan-content", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verificar se é superadmin
      const currentAdmin = await storage.getAdminByEmail(email);
      if (!currentAdmin || currentAdmin.role !== "superadmin") {
        return res.status(403).json({ error: "Access denied. Superadmin only." });
      }

      // Listar webinars órfãos (sem ownerId)
      const allWebinars = await storage.listWebinars();
      const orphanWebinars = allWebinars.filter(w => !w.ownerId).map(w => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        createdAt: w.createdAt
      }));

      // Listar vídeos órfãos (sem ownerId)
      const allVideos = await storage.listVideos();
      const orphanVideos = allVideos.filter(v => !v.ownerId).map(v => ({
        id: v.id,
        filename: v.filename,
        title: v.title,
        uploadedAt: v.uploadedAt
      }));

      res.json({ 
        orphanWebinars,
        orphanVideos,
        totalOrphanWebinars: orphanWebinars.length,
        totalOrphanVideos: orphanVideos.length
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Quick self-migration of orphan content (superadmin only)
  app.post("/api/admin/fix-my-orphan-content", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const currentAdmin = await storage.getAdminByEmail(email);
      if (!currentAdmin || currentAdmin.role !== "superadmin") {
        return res.status(403).json({ error: "Access denied. Superadmin only." });
      }

      const migratedWebinars = await storage.fixOrphanedWebinars(currentAdmin.id);
      
      const allVideos = await storage.listVideos();
      const orphanVideos = allVideos.filter(v => !v.ownerId);
      let migratedVideos = 0;
      for (const video of orphanVideos) {
        await db.update(uploadedVideos)
          .set({ ownerId: currentAdmin.id })
          .where(eq(uploadedVideos.id, video.id));
        migratedVideos++;
      }

      res.json({ 
        success: true, 
        migratedWebinars,
        migratedVideos,
        message: `Migrados ${migratedWebinars} webinars e ${migratedVideos} vídeos para sua conta`
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Migrate specific orphan content to a user (superadmin only)
  app.post("/api/admin/migrate-orphan-content", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verificar se é superadmin
      const currentAdmin = await storage.getAdminByEmail(email);
      if (!currentAdmin || currentAdmin.role !== "superadmin") {
        return res.status(403).json({ error: "Access denied. Superadmin only." });
      }

      const { targetUserId, webinarIds, videoIds } = req.body;
      if (!targetUserId) {
        return res.status(400).json({ error: "targetUserId é obrigatório" });
      }

      // Verificar se o usuário alvo existe
      const targetAdmin = await storage.getAdminById(targetUserId);
      if (!targetAdmin) {
        return res.status(404).json({ error: "Usuário alvo não encontrado" });
      }

      let migratedWebinars = 0;
      let migratedVideos = 0;

      // Migrar webinars específicos ou todos os órfãos se não especificado
      if (webinarIds && Array.isArray(webinarIds) && webinarIds.length > 0) {
        // Migrar apenas os webinars especificados (devem ser órfãos)
        for (const webinarId of webinarIds) {
          const webinar = await storage.getWebinarById(webinarId);
          if (webinar && !webinar.ownerId) {
            await storage.updateWebinar(webinarId, { ownerId: targetUserId });
            migratedWebinars++;
          }
        }
      } else {
        // Migrar todos os webinars órfãos
        const allWebinars = await storage.listWebinars();
        const orphanWebinars = allWebinars.filter(w => !w.ownerId);
        for (const webinar of orphanWebinars) {
          await storage.updateWebinar(webinar.id, { ownerId: targetUserId });
          migratedWebinars++;
        }
      }

      // Migrar vídeos específicos ou todos os órfãos se não especificado
      if (videoIds && Array.isArray(videoIds) && videoIds.length > 0) {
        // Migrar apenas os vídeos especificados (devem ser órfãos)
        for (const videoId of videoIds) {
          const video = await storage.getVideoById(videoId);
          if (video && !video.ownerId) {
            await db.update(uploadedVideos)
              .set({ ownerId: targetUserId })
              .where(eq(uploadedVideos.id, video.id));
            migratedVideos++;
          }
        }
      } else {
        // Migrar todos os vídeos órfãos
        const allVideos = await storage.listVideos();
        const orphanVideos = allVideos.filter(v => !v.ownerId);
        for (const video of orphanVideos) {
          await db.update(uploadedVideos)
            .set({ ownerId: targetUserId })
            .where(eq(uploadedVideos.id, video.id));
          migratedVideos++;
        }
      }

      res.json({ 
        success: true, 
        migratedWebinars,
        migratedVideos,
        targetUser: {
          id: targetAdmin.id,
          name: targetAdmin.name,
          email: targetAdmin.email
        }
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Platform Settings API - Google OAuth Credentials (superadmin only)
  app.get("/api/admin/platform-settings/google-oauth", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const currentAdmin = await storage.getAdminByEmail(email);
      if (!currentAdmin || currentAdmin.role !== "superadmin") {
        return res.status(403).json({ error: "Access denied. Superadmin only." });
      }

      const credentials = await storage.getGoogleOAuthCredentials();
      
      if (credentials) {
        res.json({ 
          configured: true,
          clientId: credentials.clientId,
          clientSecretMasked: credentials.clientSecret ? "****" + credentials.clientSecret.slice(-4) : null,
        });
      } else {
        res.json({ configured: false });
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/admin/platform-settings/google-oauth", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const currentAdmin = await storage.getAdminByEmail(email);
      if (!currentAdmin || currentAdmin.role !== "superadmin") {
        return res.status(403).json({ error: "Access denied. Superadmin only." });
      }

      const { clientId, clientSecret } = req.body;

      if (!clientId || !clientSecret) {
        return res.status(400).json({ error: "clientId e clientSecret são obrigatórios" });
      }

      await storage.setPlatformSetting("google_client_id", clientId, false, "Google OAuth Client ID", currentAdmin.id);
      await storage.setPlatformSetting("google_client_secret", clientSecret, true, "Google OAuth Client Secret", currentAdmin.id);

      res.json({ success: true, message: "Credenciais do Google OAuth salvas com sucesso" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/admin/platform-settings/google-oauth", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const currentAdmin = await storage.getAdminByEmail(email);
      if (!currentAdmin || currentAdmin.role !== "superadmin") {
        return res.status(403).json({ error: "Access denied. Superadmin only." });
      }

      await storage.deletePlatformSetting("google_client_id");
      await storage.deletePlatformSetting("google_client_secret");

      res.json({ success: true, message: "Credenciais do Google OAuth removidas" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admins API (legacy - mantido para compatibilidade)
  app.get("/api/admins", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    const email = await validateSession(token || "");
    if (!email) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const admins = await storage.getAllAdmins();
    res.json(admins.map((a) => ({ id: a.id, email: a.email, createdAt: a.createdAt })));
  });

  app.post("/api/admins", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const validated = adminInsertSchema.parse(req.body);
      
      // Hash the password before storing
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(validated.password, 10);
      
      const admin = await storage.createAdmin({
        ...validated,
        password: hashedPassword
      });
      res.json({ id: admin.id, email: admin.email, createdAt: admin.createdAt });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/admins/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      await storage.deleteAdmin(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Settings API
  app.get("/api/settings", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const allSettings = await storage.getAllSettings();
      const settingsMap: Record<string, string> = {};
      allSettings.forEach(s => {
        // Mask API keys for security
        if (s.key === "openai_api_key" || s.key === "deepseek_api_key") {
          settingsMap[s.key] = s.value ? "***configured***" : "";
        } else {
          settingsMap[s.key] = s.value;
        }
      });
      res.json(settingsMap);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { key, value } = req.body;
      if (!key || typeof key !== "string") {
        return res.status(400).json({ error: "Key is required" });
      }
      
      await storage.setSetting(key, value || "");
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Webinar Config API
  app.get("/api/webinar/config", async (req, res) => {
    try {
      const config = await storage.getWebinarConfig();
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch config" });
    }
  });

  app.post("/api/webinar/config", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const validated = webinarConfigInsertSchema.parse(req.body);
      const updated = await storage.updateWebinarConfig(validated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Video upload endpoint - uses disk storage for large files
  app.post("/api/webinar/upload-video", upload.single("video"), async (req: MulterRequest, res) => {
    console.log("[upload] Iniciando upload de vídeo...");
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        console.log("[upload] Falha na autenticação");
        if (req.file?.path && existsSync(req.file.path)) {
          unlinkSync(req.file.path);
        }
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!req.file) {
        console.log("[upload] Nenhum arquivo recebido");
        return res.status(400).json({ error: "No video file provided" });
      }

      console.log(`[upload] Arquivo recebido: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);
      
      const originalFilename = req.file.originalname || "video.mp4";
      const duration = parseInt(req.body.duration || "0");
      console.log(`[upload] Duração recebida: ${duration}s`);
      
      // Obter ID do admin que está fazendo upload
      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        if (req.file?.path && existsSync(req.file.path)) {
          unlinkSync(req.file.path);
        }
        return res.status(401).json({ error: "Admin not found" });
      }
      
      // Verificar se o plano está ativo (não expirado)
      if (!isAdminPlanActive(admin)) {
        if (req.file?.path && existsSync(req.file.path)) {
          unlinkSync(req.file.path);
        }
        return res.status(403).json({ 
          error: "Plano expirado. Renove seu plano para fazer upload de vídeos.",
          reason: "plan_expired"
        });
      }
      
      // Superadmin tem limites ilimitados
      const isSuperadmin = admin.role === "superadmin";
      
      if (!isSuperadmin) {
        // Buscar plano do usuário para verificar limites
        let storageLimitGB = 5; // Padrão 5GB
        let uploadLimit = admin.uploadLimit || 5;
        
        if (admin.planoId) {
          const plano = await storage.getCheckoutPlanoById(admin.planoId);
          if (plano) {
            storageLimitGB = plano.storageLimit || 5;
            uploadLimit = plano.uploadLimit || uploadLimit;
          }
        }
        
        // Calcular storage usado
        const videos = await storage.listVideosByOwner(admin.id);
        let storageUsedBytes = 0;
        for (const video of videos) {
          if (video.fileSize) {
            storageUsedBytes += video.fileSize;
          }
        }
        
        // Converter para MB e GB
        const storageUsedMB = storageUsedBytes / (1024 * 1024);
        const storageLimitMB = storageLimitGB * 1024;
        const fileSizeMB = req.file.size / (1024 * 1024);
        
        // Verificar se o upload vai exceder o limite
        if (storageUsedMB + fileSizeMB > storageLimitMB) {
          if (req.file?.path && existsSync(req.file.path)) {
            unlinkSync(req.file.path);
          }
          return res.status(403).json({ 
            error: `Limite de armazenamento atingido. Você está usando ${storageUsedMB.toFixed(1)}MB de ${storageLimitGB}GB. Este arquivo tem ${fileSizeMB.toFixed(1)}MB. Faça upgrade do seu plano para mais espaço.` 
          });
        }
        
        // Verificar limite de uploads (número de vídeos)
        if (videos.length >= uploadLimit) {
          if (req.file?.path && existsSync(req.file.path)) {
            unlinkSync(req.file.path);
          }
          return res.status(403).json({ 
            error: `Limite de uploads atingido (${videos.length}/${uploadLimit}). Faça upgrade do seu plano para mais uploads.` 
          });
        }
      }
      
      console.log("[upload] Salvando no storage...");
      const videoId = await storage.uploadVideoFromFile(req.file.path, originalFilename, duration, admin.id);
      console.log(`[upload] Vídeo salvo com ID: ${videoId}`);
      
      const updated = await storage.updateWebinarConfig({
        uploadedVideoId: videoId,
        videoDuration: duration,
      });

      console.log("[upload] Upload concluído com sucesso!");
      res.json({ success: true, videoId, config: updated });
    } catch (error: any) {
      if (req.file?.path && existsSync(req.file.path)) {
        try { unlinkSync(req.file.path); } catch {}
      }
      console.error("[upload] Erro:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Optimize video - preload to cache
  app.post("/api/webinar/videos/:videoId/optimize", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get video metadata to find the actual file ID
      const videoInfo = await storage.getVideoById(req.params.videoId);
      if (!videoInfo) return res.status(404).json({ error: "Video not found" });

      const buffer = await storage.getVideoStream(videoInfo.uploadedVideoId);
      if (!buffer) return res.status(404).json({ error: "Video file not found" });

      setCachedVideo(videoInfo.uploadedVideoId, buffer);
      res.json({ success: true, cached: true, size: buffer.length });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Signed URL endpoint - returns R2 signed URL for direct browser access (PRODUCTION FIX)
  app.get("/api/webinar/video-url/:videoId", async (req, res) => {
    try {
      const videoId = req.params.videoId;
      const expiresIn = 3600; // 1 hour

      console.log(`[video-url] Generating signed URL for: ${videoId}`);
      const signedUrl = await storage.getSignedVideoUrl(videoId, expiresIn);

      if (!signedUrl) {
        return res.status(404).json({ error: "Video not found" });
      }

      res.json({ url: signedUrl, expiresIn });
    } catch (error: any) {
      console.error("[video-url] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Video stream endpoint - fallback for local development only
  app.get("/api/webinar/video/:videoId", async (req, res) => {
    try {
      const videoId = req.params.videoId;
      const range = req.headers.range;

      // 1. STREAMING DIRETO do R2 (PRINCIPAL - sempre tenta primeiro!)
      console.log(`[video] Attempting R2 stream for: ${videoId}`);
      const r2Stream = await storage.streamVideoFromR2(videoId, range);
      
      if (r2Stream) {
        res.status(r2Stream.statusCode);
        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Content-Length", r2Stream.contentLength);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Cache-Control", "public, max-age=3600");
        
        if (r2Stream.contentRange) {
          res.setHeader("Content-Range", r2Stream.contentRange);
        }
        
        // Abort R2 request when client disconnects
        req.on('close', () => {
          r2Stream.abort();
        });
        
        // Handle stream errors gracefully
        r2Stream.stream.on('error', (err: any) => {
          if (err.name !== 'AbortError') {
            console.error(`[video] Stream error: ${err.message}`);
          }
        });
        
        // Use pipe for production proxy compatibility - PassThrough handles backpressure internally
        r2Stream.stream.pipe(res);
        return;
      }

      // 2. Fallback: Try disk storage (for local development only)
      const filePath = (storage as any).getVideoPath(videoId);
      const fileSize = (storage as any).getVideoFileSize(videoId);
      
      if (filePath && fileSize !== null) {
        console.log(`[video] Streaming from disk: ${videoId}`);
        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

          if (start >= fileSize) {
            res.status(416).end();
            return;
          }

          res.status(206);
          res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
          res.setHeader("Accept-Ranges", "bytes");
          res.setHeader("Content-Length", (end - start) + 1);
          res.setHeader("Content-Type", "video/mp4");
          
          const stream = createReadStream(filePath, { start, end });
          stream.pipe(res);
        } else {
          res.setHeader("Content-Type", "video/mp4");
          res.setHeader("Content-Length", fileSize);
          res.setHeader("Accept-Ranges", "bytes");
          
          const stream = createReadStream(filePath);
          stream.pipe(res);
        }
        return;
      }

      // 3. R2 not available and no local file - return error
      console.error(`[video] R2 unavailable and no local file for: ${videoId}`);
      return res.status(503).json({ error: "Video streaming service unavailable" });
    } catch (error: any) {
      console.error("Video streaming error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      }
    }
  });

  // List videos endpoint
  app.get("/api/webinar/videos", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const email = await validateSession(token);
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }
      
      // TODOS os usuários (incluindo superadmin) veem apenas seus próprios vídeos
      const videos = await storage.listVideosByOwner(admin.id);
      
      res.json(videos);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get single video by ID (public endpoint for replay pages)
  app.get("/api/videos/:videoId", async (req, res) => {
    try {
      const video = await storage.getVideoById(req.params.videoId);
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }
      res.json({
        id: video.id,
        uploadedVideoId: video.uploadedVideoId,
        title: video.title,
        duration: video.duration || 0,
        hlsPlaylistUrl: video.hlsPlaylistUrl,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete video endpoint
  app.delete("/api/webinar/videos/:videoId", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      const video = await storage.getVideoById(req.params.videoId);
      
      // Verificar permissão: superadmin pode deletar qualquer video, outros só seus
      if (admin && admin.role !== "superadmin" && video?.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para deletar este vídeo" });
      }

      await storage.deleteVideo(req.params.videoId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Comments endpoints
  // GET is public (for live transmission page)
  app.get("/api/webinar/comments", async (req, res) => {
    try {
      const cmts = await storage.getComments();
      res.json(cmts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Public endpoint for live chat - users can send comments during transmission
  // Live comments are NOT simulated and do NOT persist for future sessions by default
  app.post("/api/webinar/live-comment", async (req, res) => {
    try {
      const { text, author, timestamp } = req.body;
      
      // Validate required fields
      if (!text || !author) {
        return res.status(400).json({ error: "Text and author are required" });
      }
      
      // Validate author format: "Name – City (State)"
      const authorPattern = /^.+ – .+ \([A-Z]{2}\)$/;
      if (!authorPattern.test(author)) {
        return res.status(400).json({ error: "Invalid author format. Use: Name – City (State)" });
      }
      
      // Get today's date in YYYY-MM-DD format for session tracking
      const today = new Date();
      const sessionDate = today.toISOString().split('T')[0];
      
      const comment = await storage.createComment({ 
        text: text.trim(), 
        author: author.trim(), 
        timestamp: Math.round(timestamp || 0),
        isSimulated: false,
        persistForFutureSessions: false,
        sessionDate: sessionDate,
        approved: false,
      });
      res.json(comment);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin-only endpoint for creating comments
  app.post("/api/webinar/comments", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { text, author, timestamp } = req.body;
      const comment = await storage.createComment({ text, author, timestamp });
      res.json(comment);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/webinar/comments/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      await storage.deleteComment(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/webinar/comments/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { text, author, timestamp } = req.body;
      await storage.updateComment(req.params.id, text, author, timestamp);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get only simulated (pre-programmed) comments
  app.get("/api/webinar/comments/simulated", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const cmts = await storage.getSimulatedComments();
      res.json(cmts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get only live (real user) comments - optionally filter by session
  app.get("/api/webinar/comments/live", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const sessionDate = req.query.session as string | undefined;
      const cmts = sessionDate 
        ? await storage.getLiveCommentsBySession(sessionDate)
        : await storage.getLiveComments();
      res.json(cmts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get list of all session dates with live comments
  app.get("/api/webinar/comments/sessions", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const sessions = await storage.getLiveSessionDates();
      res.json(sessions);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Approve a live comment to appear in future sessions
  app.patch("/api/webinar/comments/:id/approve", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      await storage.approveCommentForFutureSessions(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/webinar/upload-comments", upload.single("file"), async (req: MulterRequest, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const fileContent = req.file.buffer.toString("utf-8");
      const result = await storage.importCommentsFromText(fileContent);
      
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update video title
  app.patch("/api/webinar/videos/:videoId/title", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { title } = req.body;
      if (!title) {
        return res.status(400).json({ error: "Title required" });
      }

      await storage.updateVideoTitle(req.params.videoId, title);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update video embed config
  app.patch("/api/webinar/videos/:videoId/embed-config", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { thumbnailUrl, playerColor, showTime } = req.body;
      await storage.updateVideoEmbedConfig(req.params.videoId, { thumbnailUrl, playerColor, showTime });
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get video config for embed (public endpoint)
  app.get("/api/embed/video/:videoId/config", async (req, res) => {
    try {
      const video = await storage.getVideoByUploadedVideoId(req.params.videoId);
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }

      res.json({
        uploadedVideoId: video.uploadedVideoId,
        title: video.title,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl || null,
        playerColor: video.playerColor || "#8B5CF6",
        showTime: video.showTime !== false,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Upload video thumbnail
  app.post("/api/webinar/videos/:videoId/thumbnail", upload.single("thumbnail"), async (req: MulterRequest, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        if (req.file?.path && existsSync(req.file.path)) {
          unlinkSync(req.file.path);
        }
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const fileBuffer = readFileSync(req.file.path);
      const imageId = await storage.uploadImage(fileBuffer, req.file.originalname);
      const thumbnailUrl = storage.getImageUrl(imageId);

      await storage.updateVideoEmbedConfig(req.params.videoId, { thumbnailUrl });

      if (req.file?.path && existsSync(req.file.path)) {
        unlinkSync(req.file.path);
      }

      res.json({ success: true, thumbnailUrl });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ========== DOMAIN VERIFICATION ==========
  
  // Verify if custom domain is correctly configured
  app.post("/api/verify-domain", async (req, res) => {
    try {
      const { domain, expectedHost } = req.body;
      
      if (!domain) {
        return res.status(400).json({ error: "Domain is required" });
      }
      
      // Try to resolve the domain and check if it points to our server
      const dns = await import('dns').then(m => m.promises);
      
      try {
        // Try CNAME first
        const cnameRecords = await dns.resolveCname(domain).catch(() => []);
        
        if (cnameRecords.length > 0) {
          // Check if CNAME points to our expected host
          const pointsToUs = cnameRecords.some(record => 
            record.toLowerCase().includes(expectedHost.toLowerCase()) ||
            expectedHost.toLowerCase().includes(record.toLowerCase())
          );
          
          return res.json({
            configured: pointsToUs,
            recordType: 'CNAME',
            records: cnameRecords,
            message: pointsToUs 
              ? 'Domínio configurado corretamente!' 
              : `CNAME encontrado mas aponta para ${cnameRecords[0]}, esperado: ${expectedHost}`
          });
        }
        
        // Try A record as fallback
        const aRecords: string[] = await dns.resolve4(domain).catch(() => []);
        
        if (aRecords.length > 0) {
          // Get our server's IP for comparison
          const ourIps: string[] = await dns.resolve4(expectedHost).catch(() => []);
          const pointsToUs = aRecords.some(ip => ourIps.includes(ip));
          
          return res.json({
            configured: pointsToUs,
            recordType: 'A',
            records: aRecords,
            message: pointsToUs 
              ? 'Domínio configurado corretamente!' 
              : 'Registro A encontrado mas não aponta para nosso servidor'
          });
        }
        
        // No records found
        return res.json({
          configured: false,
          recordType: null,
          records: [],
          message: 'Nenhum registro DNS encontrado. Configure o CNAME e aguarde a propagação.'
        });
        
      } catch (dnsError: any) {
        return res.json({
          configured: false,
          recordType: null,
          records: [],
          message: 'Domínio não encontrado. Verifique se o domínio está correto e se o DNS foi configurado.'
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== RENDER DOMAINS API (Superadmin only) ==========
  
  // Check if Render API is configured (any authenticated user)
  app.get("/api/render-domains/status", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const status = renderDomainsService.getConfigStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add domain to Render (superadmin only)
  app.post("/api/render-domains/add", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Only superadmin can manage Render domains directly
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas superadmin pode gerenciar domínios no Render" });
      }
      
      const { domain } = req.body;
      if (!domain) {
        return res.status(400).json({ error: "Domínio é obrigatório" });
      }

      if (!renderDomainsService.isConfigured()) {
        return res.status(503).json({ 
          error: "Integração com Render não configurada",
          message: "Configure RENDER_API_KEY e RENDER_SERVICE_ID"
        });
      }

      const result = await renderDomainsService.addDomain(domain);
      
      if (result.success && !result.error) {
        console.log(`[render-domains] Domain added successfully: ${domain}`);
        res.json({
          success: true,
          message: "Domínio adicionado ao Render com sucesso!",
          dnsInstructions: result.dnsInstructions,
          domain: result.domain,
        });
      } else if (result.success && result.error) {
        // Domain already exists - return as info, not error
        res.json({
          success: true,
          message: result.error,
          alreadyExists: true,
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: result.error 
        });
      }
    } catch (error: any) {
      console.error("[render-domains] Error adding domain:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Remove domain from Render (superadmin only)
  app.delete("/api/render-domains/:domain", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Only superadmin can manage Render domains directly
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas superadmin pode gerenciar domínios no Render" });
      }
      
      const { domain } = req.params;
      
      if (!renderDomainsService.isConfigured()) {
        return res.status(503).json({ 
          error: "Integração com Render não configurada" 
        });
      }

      const result = await renderDomainsService.removeDomain(domain);
      
      if (result.success) {
        console.log(`[render-domains] Domain removed: ${domain}`);
        res.json({ success: true, message: "Domínio removido do Render" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // List all domains from Render (superadmin only)
  app.get("/api/render-domains/list", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Only superadmin can list all Render domains
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas superadmin pode listar domínios do Render" });
      }
      
      if (!renderDomainsService.isConfigured()) {
        return res.status(503).json({ 
          error: "Integração com Render não configurada" 
        });
      }

      const result = await renderDomainsService.listDomains();
      
      if (result.success) {
        res.json({ success: true, domains: result.domains });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== WEBINARS API ==========
  
  // List public active webinars (no auth required)
  app.get("/api/webinars/public", async (req, res) => {
    try {
      const webinars = await storage.listWebinars();
      const activeWebinars = webinars.filter(w => w.isActive);
      res.json(activeWebinars.map(w => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        description: w.description,
        startHour: w.startHour,
        startMinute: w.startMinute,
        recurrence: w.recurrence,
      })));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
  
  // List all webinars
  app.get("/api/webinars", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }
      
      // TODOS os usuários (incluindo superadmin) veem apenas seus próprios webinars
      const webinars = await storage.listWebinarsByOwner(admin.id);
      
      res.json(webinars);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create webinar
  app.post("/api/webinars", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }
      
      // Superadmin tem limites ilimitados
      const isSuperadmin = admin.role === "superadmin";
      
      // Verificar se o plano está ativo (não expirado) - superadmin sempre ativo
      if (!isSuperadmin && !isAdminPlanActive(admin)) {
        return res.status(403).json({ 
          error: "Plano expirado. Renove seu plano para criar novos webinars.",
          reason: "plan_expired"
        });
      }
      
      // Verificar limite de webinars apenas para usuários normais
      if (!isSuperadmin) {
        let webinarLimit = admin.webinarLimit || 5;
        if (admin.planoId) {
          const plano = await storage.getCheckoutPlanoById(admin.planoId);
          if (plano) {
            webinarLimit = plano.webinarLimit || webinarLimit;
          }
        }
        
        const currentCount = await storage.countWebinarsByOwner(admin.id);
        if (currentCount >= webinarLimit) {
          return res.status(403).json({ 
            error: `Limite de webinars atingido (${currentCount}/${webinarLimit}). Faça upgrade do seu plano para criar mais webinars.` 
          });
        }
      }
      
      // Generate slug from name if not provided
      let slug = req.body.slug;
      if (!slug && req.body.name) {
        slug = req.body.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      }
      
      // Check if slug already exists
      const existing = await storage.getWebinarBySlug(slug);
      if (existing) {
        slug = `${slug}-${Date.now()}`;
      }
      
      const validated = webinarInsertSchema.parse({ 
        ...req.body, 
        slug,
        ownerId: admin.id,
      });
      const webinar = await storage.createWebinar(validated);
      res.json(webinar);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get webinar by custom domain
  app.get("/api/webinars/by-domain/:domain", async (req, res) => {
    try {
      const { domain } = req.params;
      const allWebinars = await storage.listWebinars();
      const webinar = allWebinars.find(w => w.customDomain === domain);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }
      
      // Verificar se o plano do dono está ativo
      if (webinar.ownerId && !(await isWebinarOwnerPlanActive(webinar.ownerId))) {
        return res.status(403).json({ 
          error: "Webinar indisponível", 
          reason: "owner_plan_expired",
          message: "Este webinar está temporariamente indisponível. O proprietário precisa renovar seu plano."
        });
      }
      
      // Sanitize webinar data for public response
      res.json(sanitizeWebinarForPublic(webinar));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get webinar by ID or slug
  app.get("/api/webinars/:idOrSlug", async (req, res) => {
    try {
      const { idOrSlug } = req.params;
      let webinar = await storage.getWebinarById(idOrSlug);
      if (!webinar) {
        webinar = await storage.getWebinarBySlug(idOrSlug);
      }
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }
      
      // Verificar se o plano do dono está ativo (apenas para acesso público)
      // Não bloquear se a requisição vier do painel admin (tem token de autenticação)
      const token = req.headers.authorization?.split(" ")[1];
      const isAdminRequest = token ? await validateSession(token) : null;
      
      if (!isAdminRequest && webinar.ownerId && !(await isWebinarOwnerPlanActive(webinar.ownerId))) {
        return res.status(403).json({ 
          error: "Webinar indisponível", 
          reason: "owner_plan_expired",
          message: "Este webinar está temporariamente indisponível. O proprietário precisa renovar seu plano."
        });
      }
      
      if (!isAdminRequest) {
        // Sanitize webinar data for public clients
        res.json(sanitizeWebinarForPublic(webinar));
      } else {
        // Admin requests get full data including metaCapiEnabled flag
        const webinarData = webinar as any;
        res.json({ 
          ...webinarData, 
          metaCapiEnabled: !!(webinarData.facebookPixelId && webinarData.facebookAccessToken) 
        });
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get or create viewer ID for unique view counting
  app.get("/api/viewer-id", (req, res) => {
    try {
      // Check if viewer_id cookie exists
      let viewerId = req.cookies?.viewer_id;
      
      if (!viewerId) {
        // Generate new UUID for this viewer
        viewerId = crypto.randomUUID();
        
        // Set cookie that expires in 1 year
        res.cookie('viewer_id', viewerId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 365 * 24 * 60 * 60 * 1000 // 1 year
        });
      }
      
      res.json({ viewerId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Increment webinar views
  app.post("/api/webinars/:id/increment-view", async (req, res) => {
    try {
      const { id } = req.params;
      const source = (req.body?.source as 'live' | 'replay' | 'embed') || 'live';
      const viewerId = req.body?.viewerId as string | undefined;
      const webinar = await storage.getWebinarById(id);
      if (!webinar) {
        const webinarBySlug = await storage.getWebinarBySlug(id);
        if (!webinarBySlug) {
          return res.status(404).json({ error: "Webinar not found" });
        }
        
        // Verificar se o plano do dono está ativo
        if (webinarBySlug.ownerId && !(await isWebinarOwnerPlanActive(webinarBySlug.ownerId))) {
          return res.status(403).json({ error: "Webinar indisponível", reason: "owner_plan_expired" });
        }
        
        await storage.incrementWebinarViews(webinarBySlug.id);
        await storage.logWebinarView(webinarBySlug.id, webinarBySlug.ownerId, source, viewerId);
      } else {
        // Verificar se o plano do dono está ativo
        if (webinar.ownerId && !(await isWebinarOwnerPlanActive(webinar.ownerId))) {
          return res.status(403).json({ error: "Webinar indisponível", reason: "owner_plan_expired" });
        }
        
        await storage.incrementWebinarViews(id);
        await storage.logWebinarView(webinar.id, webinar.ownerId, source, viewerId);
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update webinar
  app.patch("/api/webinars/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }
      
      if (!isAdminPlanActive(admin)) {
        return res.status(403).json({ 
          error: "Plano expirado. Renove seu plano para editar webinars.",
          reason: "plan_expired"
        });
      }
      
      const webinarLimit = admin.webinarLimit || 5;
      
      const currentWebinar = await storage.getWebinarById(req.params.id);
      if (!currentWebinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }
      
      if (currentWebinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Voce nao tem permissao para editar este webinar" });
      }
      
      const updatedData = { ...req.body };
      
      if (webinarLimit <= 5) {
        updatedData.replayEnabled = false;
        updatedData.replayAutoplay = false;
      }
      
      const webinar = await storage.updateWebinar(req.params.id, updatedData);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }
      
      // Auto-add custom domain to Render if changed
      const customDomainChanged = updatedData.customDomain && 
        updatedData.customDomain !== currentWebinar.customDomain;
      
      if (customDomainChanged && renderDomainsService.isConfigured()) {
        const newDomain = updatedData.customDomain;
        console.log(`[webinar] Custom domain changed to ${newDomain}, adding to Render...`);
        
        // Add new domain to Render (async, don't block response)
        renderDomainsService.addDomain(newDomain)
          .then(result => {
            if (result.success) {
              console.log(`[render-domains] Auto-added domain: ${newDomain}`);
            } else {
              console.log(`[render-domains] Domain add result: ${result.error}`);
            }
          })
          .catch(err => {
            console.error(`[render-domains] Error auto-adding domain:`, err);
          });
        
        // Remove old domain if exists
        if (currentWebinar.customDomain) {
          renderDomainsService.removeDomain(currentWebinar.customDomain)
            .then(result => {
              if (result.success) {
                console.log(`[render-domains] Removed old domain: ${currentWebinar.customDomain}`);
              }
            })
            .catch(() => {});
        }
      }
      
      const startHourChanged = updatedData.startHour !== undefined && updatedData.startHour !== currentWebinar.startHour;
      const startMinuteChanged = updatedData.startMinute !== undefined && updatedData.startMinute !== currentWebinar.startMinute;
      const onceDateChanged = updatedData.onceDate !== undefined && updatedData.onceDate !== currentWebinar.onceDate;
      const dayOfWeekChanged = updatedData.dayOfWeek !== undefined && updatedData.dayOfWeek !== currentWebinar.dayOfWeek;
      const dayOfMonthChanged = updatedData.dayOfMonth !== undefined && updatedData.dayOfMonth !== currentWebinar.dayOfMonth;
      const recurrenceChanged = updatedData.recurrence !== undefined && updatedData.recurrence !== currentWebinar.recurrence;
      const timezoneChanged = updatedData.timezone !== undefined && updatedData.timezone !== currentWebinar.timezone;
      
      const scheduleChanged = startHourChanged || startMinuteChanged || onceDateChanged || 
                              dayOfWeekChanged || dayOfMonthChanged || recurrenceChanged || timezoneChanged;
      
      if (scheduleChanged) {
        const newStartHour = updatedData.startHour ?? currentWebinar.startHour ?? 19;
        const newStartMinute = updatedData.startMinute ?? currentWebinar.startMinute ?? 0;
        const newTimezone = updatedData.timezone ?? currentWebinar.timezone ?? "America/Sao_Paulo";
        const newRecurrence = updatedData.recurrence ?? currentWebinar.recurrence ?? "daily";
        const newOnceDate = updatedData.onceDate ?? currentWebinar.onceDate;
        const newDayOfWeek = updatedData.dayOfWeek ?? currentWebinar.dayOfWeek;
        const newDayOfMonth = updatedData.dayOfMonth ?? currentWebinar.dayOfMonth;
        
        console.log(`[webinar] Schedule changed for webinar ${req.params.id}, rescheduling sequences`);
        console.log(`[webinar] Changes: hour=${startHourChanged}, minute=${startMinuteChanged}, date=${onceDateChanged}, dayOfWeek=${dayOfWeekChanged}, dayOfMonth=${dayOfMonthChanged}, recurrence=${recurrenceChanged}, timezone=${timezoneChanged}`);
        
        rescheduleSequencesForWebinar(req.params.id, admin.id, {
          startHour: newStartHour,
          startMinute: newStartMinute,
          timezone: newTimezone,
          recurrence: newRecurrence,
          onceDate: newOnceDate,
          dayOfWeek: newDayOfWeek,
          dayOfMonth: newDayOfMonth,
        })
          .then(result => {
            console.log(`[webinar] Reschedule complete:`, result);
          })
          .catch(err => {
            console.error(`[webinar] Reschedule error:`, err);
          });
      }
      
      res.json(webinar);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete webinar
  app.delete("/api/webinars/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }
      
      // Verificar ownership: só pode deletar seus próprios webinars
      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }
      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para deletar este webinar" });
      }
      
      await storage.deleteWebinar(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Duplicate webinar
  app.post("/api/webinars/:id/duplicate", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }
      
      if (!isAdminPlanActive(admin)) {
        return res.status(403).json({ error: "Plano expirado", reason: "plan_expired" });
      }

      const originalWebinar = await storage.getWebinarById(req.params.id);
      if (!originalWebinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }
      
      if (originalWebinar.ownerId !== admin.id && admin.role !== "superadmin") {
        return res.status(403).json({ error: "Sem permissão para duplicar este webinar" });
      }

      const webinarLimit = admin.webinarLimit || 5;
      const existingWebinars = await storage.listWebinarsByOwner(admin.id);
      if (existingWebinars.length >= webinarLimit) {
        return res.status(403).json({ 
          error: `Limite de ${webinarLimit} webinars atingido`,
          reason: "webinar_limit"
        });
      }

      const newId = crypto.randomUUID();
      const timestamp = Date.now();
      const newSlug = `${originalWebinar.slug}-copia-${timestamp}`;
      
      const { id, createdAt, slug, customDomain, ...webinarData } = originalWebinar;
      const newWebinar = await storage.createWebinar({
        ...webinarData,
        name: `${originalWebinar.name} (Cópia)`,
        slug: newSlug,
        ownerId: admin.id,
        customDomain: undefined,
      });

      const emailSequences = await storage.listEmailSequencesByWebinar(originalWebinar.id);
      for (const seq of emailSequences) {
        const { id: seqId, createdAt: seqCreatedAt, updatedAt, webinarId, ...seqData } = seq;
        await storage.createEmailSequence({
          ...seqData,
          adminId: admin.id,
          webinarId: newWebinar.id,
        });
      }

      const whatsappSequences = await storage.listWhatsappSequencesByWebinar(originalWebinar.id);
      for (const seq of whatsappSequences) {
        const { id: seqId, createdAt: seqCreatedAt, updatedAt, webinarId, ...seqData } = seq;
        await storage.createWhatsappSequence({
          ...seqData,
          adminId: admin.id,
          webinarId: newWebinar.id,
        });
      }

      const originalComments = await storage.getCommentsByWebinar(originalWebinar.id);
      const simulatedComments = originalComments.filter(c => c.isSimulated);
      for (const comment of simulatedComments) {
        const { id: commentId, createdAt: commentCreatedAt, ...commentData } = comment;
        await storage.createComment({
          ...commentData,
          webinarId: newWebinar.id,
        });
      }

      const leadFormConfig = await storage.getLeadFormConfigByWebinar(originalWebinar.id);
      if (leadFormConfig) {
        const { id: configId, webinarId, createdAt: configCreatedAt, updatedAt: configUpdatedAt, ...configData } = leadFormConfig;
        await storage.createLeadFormConfig({
          ...configData,
          webinarId: newWebinar.id,
        });
      }

      console.log(`[webinar] Duplicated webinar ${originalWebinar.id} to ${newWebinar.id} by admin ${admin.id}`);
      
      res.json({ 
        success: true, 
        webinar: newWebinar,
        message: "Webinar duplicado com sucesso!"
      });
    } catch (error: any) {
      console.error("[webinar] Duplicate error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Transfer webinar to another account (superadmin only)
  app.post("/api/webinars/:id/transfer", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas superadmin pode transferir webinars" });
      }

      const { targetAdminId } = req.body;
      if (!targetAdminId) {
        return res.status(400).json({ error: "ID da conta destino é obrigatório" });
      }

      const targetAdmin = await storage.getAdminById(targetAdminId);
      if (!targetAdmin) {
        return res.status(404).json({ error: "Conta destino não encontrada" });
      }

      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar não encontrado" });
      }

      const sourceAdminId = webinar.ownerId;

      await storage.updateWebinar(webinar.id, { ownerId: targetAdminId });

      let videoTransferred = false;
      if (webinar.uploadedVideoId) {
        await storage.updateUploadedVideoOwner(webinar.uploadedVideoId, targetAdminId);
        videoTransferred = true;
      }

      const emailSequences = await storage.listEmailSequencesByWebinar(webinar.id);
      for (const seq of emailSequences) {
        await storage.updateEmailSequence(seq.id, { adminId: targetAdminId });
      }

      const whatsappSequences = await storage.listWhatsappSequencesByWebinar(webinar.id);
      for (const seq of whatsappSequences) {
        await storage.updateWhatsappSequence(seq.id, { adminId: targetAdminId });
      }

      const scripts = await storage.getScriptsByWebinar(webinar.id);

      console.log(`[webinar] Transferred webinar ${webinar.id} from ${sourceAdminId} to ${targetAdminId} by superadmin ${admin.id}`);

      res.json({ 
        success: true,
        message: "Webinar transferido com sucesso!",
        transferred: {
          webinar: webinar.name,
          from: sourceAdminId,
          to: targetAdminId,
          includedVideo: videoTransferred,
          emailSequences: emailSequences.length,
          whatsappSequences: whatsappSequences.length,
          scripts: scripts.length,
        }
      });
    } catch (error: any) {
      console.error("[webinar] Transfer error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // ========== WEBINAR-SPECIFIC COMMENTS ==========
  
  // Get all comments for a webinar (public for live page)
  app.get("/api/webinars/:id/comments", async (req, res) => {
    try {
      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }
      
      // Verificar se o plano do dono está ativo
      if (webinar.ownerId && !(await isWebinarOwnerPlanActive(webinar.ownerId))) {
        return res.status(403).json({ error: "Webinar indisponível", reason: "owner_plan_expired" });
      }
      
      const cmts = await storage.getCommentsByWebinar(req.params.id);
      res.json(cmts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get active comments for a webinar (simulated + approved live)
  app.get("/api/webinars/:id/comments/active", async (req, res) => {
    try {
      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }
      
      // Verificar se o plano do dono está ativo
      if (webinar.ownerId && !(await isWebinarOwnerPlanActive(webinar.ownerId))) {
        return res.status(403).json({ error: "Webinar indisponível", reason: "owner_plan_expired" });
      }
      
      const cmts = await storage.getActiveCommentsByWebinar(req.params.id);
      res.json(cmts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get simulated comments for a webinar
  app.get("/api/webinars/:id/comments/simulated", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const cmts = await storage.getSimulatedCommentsByWebinar(req.params.id);
      res.json(cmts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get live comments for a webinar
  app.get("/api/webinars/:id/comments/live", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const sessionDate = req.query.session as string | undefined;
      const cmts = sessionDate
        ? await storage.getLiveCommentsByWebinarSession(req.params.id, sessionDate)
        : await storage.getLiveCommentsByWebinar(req.params.id);
      res.json(cmts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get session dates for a webinar
  app.get("/api/webinars/:id/comments/sessions", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const sessions = await storage.getLiveSessionDatesByWebinar(req.params.id);
      res.json(sessions);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create comment for a webinar (admin)
  app.post("/api/webinars/:id/comments", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { text, author, timestamp } = req.body;
      const comment = await storage.createComment({
        webinarId: req.params.id,
        text,
        author,
        timestamp,
        isSimulated: true,
        persistForFutureSessions: true,
      });
      res.json(comment);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update comment for a webinar (admin) - validates comment belongs to webinar
  app.patch("/api/webinars/:webinarId/comments/:commentId", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { text, author, timestamp } = req.body;
      await storage.updateComment(req.params.commentId, text, author, timestamp);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete comment for a webinar (admin) - validates comment belongs to webinar
  app.delete("/api/webinars/:webinarId/comments/:commentId", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      await storage.deleteComment(req.params.commentId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Public endpoint for live chat on specific webinar
  app.post("/api/webinars/:id/live-comment", async (req, res) => {
    try {
      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }
      
      // Verificar se o plano do dono está ativo
      if (webinar.ownerId && !(await isWebinarOwnerPlanActive(webinar.ownerId))) {
        return res.status(403).json({ error: "Webinar indisponível", reason: "owner_plan_expired" });
      }
      
      const { text, author, timestamp, sessionId } = req.body;
      
      console.log("[live-comment] Received:", { text, author, timestamp, sessionId });
      
      if (!text || !author) {
        return res.status(400).json({ error: "Text and author are required" });
      }
      
      // Formatos aceitos (dependendo das configurações do chat):
      // 1. "Nome – Cidade (UF)" - formato completo
      // 2. "Nome – Cidade" - sem estado
      // 3. "Nome – (UF)" - sem cidade
      // 4. "Nome" - apenas nome (quando cidade e estado não são obrigatórios)
      // Aceita tanto traço simples (-) quanto en-dash (–)
      const fullPattern = /^.+\s[–-]\s.+\s\([A-Z]{2}\)$/; // Nome – Cidade (UF)
      const cityOnlyPattern = /^.+\s[–-]\s[^()]+$/; // Nome – Cidade
      const stateOnlyPattern = /^.+\s[–-]\s\([A-Z]{2}\)$/; // Nome – (UF)
      const nameOnlyPattern = /^.+$/; // Nome (qualquer texto)
      
      // Aceita qualquer formato válido
      const isValidFormat = fullPattern.test(author) || 
                           cityOnlyPattern.test(author) || 
                           stateOnlyPattern.test(author) || 
                           nameOnlyPattern.test(author);
      
      if (!isValidFormat || author.trim().length === 0) {
        console.log("[live-comment] Author pattern failed for:", JSON.stringify(author));
        return res.status(400).json({ error: "Invalid author format" });
      }
      
      const today = new Date();
      const sessionDate = today.toISOString().split('T')[0];
      
      const comment = await storage.createComment({
        webinarId: req.params.id,
        text: text.trim(),
        author: author.trim(),
        timestamp: Math.round(timestamp || 0),
        isSimulated: false,
        persistForFutureSessions: false,
        sessionDate,
        sessionId: sessionId || null,
        approved: false,
      });
      res.json(comment);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get only the user's live comments for a specific webinar
  app.get("/api/webinars/:id/my-live-comments", async (req, res) => {
    try {
      const { sessionId } = req.query;
      
      if (!sessionId || typeof sessionId !== "string") {
        return res.status(400).json({ error: "Session ID is required" });
      }
      
      const comments = await storage.getCommentsByWebinarAndSession(req.params.id, sessionId);
      res.json(comments);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get all real (non-simulated) comments for a webinar by date (admin)
  app.get("/api/webinars/:id/real-comments", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { date } = req.query;
      if (!date || typeof date !== "string") {
        // Return all real comments for the webinar
        const allComments = await db
          .select()
          .from(comments)
          .where(
            and(
              eq(comments.webinarId, req.params.id),
              eq(comments.isSimulated, false)
            )
          )
          .orderBy(desc(comments.createdAt));
        return res.json(allComments);
      }

      // Filter by session date
      const allComments = await db
        .select()
        .from(comments)
        .where(
          and(
            eq(comments.webinarId, req.params.id),
            eq(comments.isSimulated, false),
            eq(comments.sessionDate, date)
          )
        )
        .orderBy(desc(comments.createdAt));
      res.json(allComments);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete a single real comment
  app.delete("/api/webinars/:id/real-comments/:commentId", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const deleted = await db
        .delete(comments)
        .where(
          and(
            eq(comments.id, req.params.commentId),
            eq(comments.webinarId, req.params.id),
            eq(comments.isSimulated, false)
          )
        )
        .returning();

      if (deleted.length === 0) {
        return res.status(404).json({ error: "Comment not found or not a real comment" });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete all real comments for a webinar
  app.delete("/api/webinars/:id/real-comments", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      await db
        .delete(comments)
        .where(
          and(
            eq(comments.webinarId, req.params.id),
            eq(comments.isSimulated, false)
          )
        );

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Approve/Release a real comment (convert to simulated)
  app.post("/api/webinars/:id/comments/:commentId/release", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const updated = await db
        .update(comments)
        .set({ isSimulated: true })
        .where(eq(comments.id, req.params.commentId))
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({ error: "Comment not found" });
      }

      res.json(updated[0]);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete/Reject a real comment
  app.delete("/api/webinars/:id/comments/:commentId", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para deletar comentários deste webinar" });
      }

      await db.delete(comments).where(eq(comments.id, req.params.commentId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Adjust time for all simulated comments
  app.post("/api/webinars/:id/comments/adjust-time", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para ajustar comentários deste webinar" });
      }

      const { adjustSeconds } = req.body;
      if (typeof adjustSeconds !== "number") {
        return res.status(400).json({ error: "adjustSeconds must be a number" });
      }

      // Count simulated comments first
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(comments)
        .where(and(
          eq(comments.webinarId, req.params.id),
          eq(comments.isSimulated, true)
        ));
      
      const totalComments = Number(countResult[0]?.count || 0);

      // Update all simulated comments in a single batch query
      // Using GREATEST to ensure timestamp doesn't go below 0
      await db
        .update(comments)
        .set({ 
          timestamp: sql`GREATEST(0, ${comments.timestamp} + ${adjustSeconds})`
        })
        .where(and(
          eq(comments.webinarId, req.params.id),
          eq(comments.isSimulated, true)
        ));

      res.json({ success: true, updated: totalComments });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Import comments for a specific webinar
  app.post("/api/webinars/:id/upload-comments", memoryUpload.single("file"), async (req: MulterRequest, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para importar comentários neste webinar" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const fileContent = req.file.buffer.toString("utf-8");
      console.log("Importing comments, file size:", req.file.size, "bytes");
      console.log("First 200 chars:", fileContent.substring(0, 200));
      
      const result = await storage.importCommentsForWebinar(req.params.id, fileContent);
      console.log("Import result:", result);
      
      res.json(result);
    } catch (error: any) {
      console.error("Import error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Import comments from raw text (no file upload, bypasses size limits)
  app.post("/api/webinars/:id/import-comments-text", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para importar comentários neste webinar" });
      }

      const { content } = req.body;
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: "No content provided" });
      }

      console.log("Importing comments from text, content length:", content.length, "chars");
      const lines = content.split('\n').filter((l: string) => l.trim());
      console.log("Total lines to import:", lines.length);
      console.log("First line sample:", lines[0]?.substring(0, 100));
      
      const result = await storage.importCommentsForWebinar(req.params.id, content);
      console.log("Import result:", result);
      
      res.json(result);
    } catch (error: any) {
      console.error("Import error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Import comments from JSON (supports various field names)
  app.post("/api/webinars/:id/import-comments-json", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para importar comentários neste webinar" });
      }

      const { comments } = req.body;
      if (!Array.isArray(comments)) {
        return res.status(400).json({ error: "Expected array of comments" });
      }

      console.log("Importing from JSON:", comments.length, "comments");
      
      // Convert JSON to pipe-separated format (support multiple field names)
      const lines = comments
        .map((c: any) => {
          const ts = c.timestamp ?? c.tempo_segundos ?? 0;
          const author = c.author ?? c.nome ?? 'Anônimo';
          const text = c.text ?? c.comentario ?? c.message ?? '';
          return `${ts}|${author}|${text}`;
        })
        .join('\n');
      
      const result = await storage.importCommentsForWebinar(req.params.id, lines);
      console.log("JSON import result:", result);
      
      res.json(result);
    } catch (error: any) {
      console.error("JSON import error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Direct large file upload endpoint (bypasses Replit chat limits)
  app.post("/api/webinars/:id/upload-large-file", upload.single("file"), async (req: MulterRequest, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para importar arquivos neste webinar" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const filePath = req.file.path;
      const fileContent = readFileSync(filePath, 'utf-8');
      let lines = '';
      
      // Detect if JSON or TXT
      const isJson = req.file.originalname.toLowerCase().endsWith('.json');
      
      if (isJson) {
        try {
          const data = JSON.parse(fileContent);
          const comments = Array.isArray(data) ? data : (data.comments || []);
          lines = comments
            .map((c: any) => {
              const ts = c.timestamp ?? c.tempo_segundos ?? 0;
              const author = c.author ?? c.nome ?? 'Anônimo';
              const text = c.text ?? c.comentario ?? c.message ?? '';
              return `${ts}|${author}|${text}`;
            })
            .join('\n');
          console.log("Large JSON file:", comments.length, "comments");
        } catch (e) {
          return res.status(400).json({ error: "Invalid JSON file" });
        }
      } else {
        lines = fileContent;
        console.log("Large TXT file:", fileContent.split('\n').filter((l: string) => l.trim()).length, "lines");
      }

      // Clean up temp file
      unlinkSync(filePath);

      const result = await storage.importCommentsForWebinar(req.params.id, lines);
      console.log("Large file import result:", result);
      
      res.json(result);
    } catch (error: any) {
      console.error("Large file import error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Import comments from Excel file (.xlsx, .xls)
  // Expected columns: timestamp (seconds), author/nome, text/comentario/message
  app.post("/api/webinars/:id/import-excel", upload.single("file"), async (req: MulterRequest, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para importar planilhas neste webinar" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo fornecido" });
      }

      const filePath = req.file.path;
      console.log("Importing Excel file:", req.file.originalname, "size:", req.file.size);

      try {
        // Read Excel file
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON (header row becomes keys)
        const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        console.log("Excel rows found:", rawData.length);
        
        if (rawData.length === 0) {
          unlinkSync(filePath);
          return res.status(400).json({ error: "Planilha vazia ou sem dados válidos" });
        }

        // Log first row to show column names
        console.log("Excel columns detected:", Object.keys(rawData[0] as object));
        
        // Convert Excel rows to pipe-separated format
        // Support multiple column name variations
        const lines = rawData
          .map((row: any) => {
            // Timestamp - try various column names
            let ts = row.timestamp ?? row.tempo ?? row.tempo_segundos ?? row.segundos ?? 
                     row.time ?? row.Timestamp ?? row.Tempo ?? row.Segundos ?? row.Time ?? 0;
            
            // Convert HH:MM:SS or MM:SS format to seconds if string
            if (typeof ts === 'string' && ts.includes(':')) {
              const parts = ts.split(':').map(Number);
              if (parts.length === 3) {
                ts = parts[0] * 3600 + parts[1] * 60 + parts[2];
              } else if (parts.length === 2) {
                ts = parts[0] * 60 + parts[1];
              }
            }
            
            // Author - try various column names
            const author = row.author ?? row.autor ?? row.nome ?? row.name ?? 
                          row.Author ?? row.Autor ?? row.Nome ?? row.Name ?? 'Anônimo';
            
            // Text - try various column names
            const text = row.text ?? row.texto ?? row.comentario ?? row.message ?? row.mensagem ??
                        row.Text ?? row.Texto ?? row.Comentario ?? row.Message ?? row.Mensagem ?? '';
            
            return `${ts}|${author}|${text}`;
          })
          .filter((line: string) => {
            const parts = line.split('|');
            return parts[2] && parts[2].trim(); // Filter out empty comments
          })
          .join('\n');

        // Clean up temp file
        unlinkSync(filePath);

        if (!lines.trim()) {
          return res.status(400).json({ 
            error: "Nenhum comentário válido encontrado. Verifique se a planilha tem colunas: timestamp/tempo, autor/nome, texto/comentario" 
          });
        }

        const lineCount = lines.split('\n').length;
        console.log("Valid comments to import:", lineCount);

        const result = await storage.importCommentsForWebinar(req.params.id, lines);
        console.log("Excel import result:", result);
        
        res.json(result);
      } catch (xlsError: any) {
        // Clean up temp file on error
        if (existsSync(filePath)) unlinkSync(filePath);
        console.error("Excel parsing error:", xlsError);
        res.status(400).json({ error: "Erro ao ler planilha: " + xlsError.message });
      }
    } catch (error: any) {
      console.error("Excel import error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Upload image for offer (uses Supabase Storage when available)
  app.post("/api/upload-image", memoryUpload.single("image"), async (req: MulterRequest, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Verificar se o plano está ativo
      const admin = await storage.getAdminByEmail(email);
      if (admin && !isAdminPlanActive(admin)) {
        return res.status(403).json({ 
          error: "Plano expirado. Renove seu plano para fazer upload de imagens.",
          reason: "plan_expired"
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      const allowedExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];
      if (!allowedExts.includes(ext)) {
        return res.status(400).json({ error: "Invalid image format. Use: jpg, png, gif, webp, svg" });
      }

      console.log(`[upload-image] Uploading image: ${req.file.originalname} (${(req.file.size / 1024).toFixed(2)} KB)`);
      
      // Use storage.uploadImage which handles Supabase or fallback to disk
      const imageId = await storage.uploadImage(req.file.buffer, req.file.originalname);
      const url = storage.getImageUrl(imageId);
      
      console.log(`[upload-image] Image uploaded: ${imageId} -> ${url}`);
      res.json({ url, imageId });
    } catch (error: any) {
      console.error("[upload-image] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Upload generic file for WhatsApp media (audio, video, image, document)
  app.post("/api/upload-file", upload.single("file"), async (req: MulterRequest, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }
      
      if (!isAdminPlanActive(admin)) {
        return res.status(403).json({ 
          error: "Plano expirado. Renove seu plano para fazer upload de arquivos.",
          reason: "plan_expired"
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      const mimeType = req.file.mimetype;
      
      // Allowed extensions and MIME types for WhatsApp media
      const allowedMedia: Record<string, { exts: string[], mimes: string[], maxSize: number }> = {
        image: { 
          exts: [".jpg", ".jpeg", ".png"], 
          mimes: ["image/jpeg", "image/png", "image/jpg"],
          maxSize: 5 * 1024 * 1024 // 5MB
        },
        audio: { 
          exts: [".ogg", ".mp3", ".m4a", ".wav", ".opus"], 
          mimes: ["audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-m4a", "audio/opus"],
          maxSize: 16 * 1024 * 1024 // 16MB
        },
        video: { 
          exts: [".mp4", ".3gp"], 
          mimes: ["video/mp4", "video/3gpp"],
          maxSize: 16 * 1024 * 1024 // 16MB
        },
        document: { 
          exts: [".pdf"], 
          mimes: ["application/pdf"],
          maxSize: 100 * 1024 * 1024 // 100MB
        }
      };

      // Detect media type based on extension or MIME
      let mediaType: string | null = null;
      for (const [type, config] of Object.entries(allowedMedia)) {
        if (config.exts.includes(ext) || config.mimes.includes(mimeType)) {
          mediaType = type;
          break;
        }
      }

      if (!mediaType) {
        // Clean up temp file
        if (req.file.path && existsSync(req.file.path)) {
          unlinkSync(req.file.path);
        }
        return res.status(400).json({ 
          error: "Tipo de arquivo não suportado. Use: jpg, png, ogg, mp3, m4a, wav, mp4, 3gp, pdf" 
        });
      }

      const config = allowedMedia[mediaType];
      if (req.file.size > config.maxSize) {
        // Clean up temp file
        if (req.file.path && existsSync(req.file.path)) {
          unlinkSync(req.file.path);
        }
        return res.status(400).json({ 
          error: `Arquivo muito grande. Limite para ${mediaType}: ${Math.round(config.maxSize / 1024 / 1024)}MB` 
        });
      }

      console.log(`[upload-file] Uploading ${mediaType}: ${req.file.originalname} (${(req.file.size / 1024).toFixed(2)} KB)`);
      
      // Read file from disk and upload to storage
      const fileBuffer = readFileSync(req.file.path);
      const uploadResult = await storage.uploadMediaFile(fileBuffer, req.file.originalname, mimeType);
      const url = storage.getMediaFileUrl(uploadResult.fileId, uploadResult.provider);
      
      // Determine correct storage path based on provider
      // Local: just the fileId (no folder prefix)
      // Supabase/R2: media/fileId (with folder prefix)
      const storagePath = uploadResult.provider === 'local' 
        ? uploadResult.fileId 
        : `media/${uploadResult.fileId}`;
      
      // Save to media_files table for user's file manager
      const mediaFile = await storage.createMediaFile({
        adminId: admin.id,
        fileName: req.file.originalname,
        mimeType: mimeType,
        sizeBytes: req.file.size,
        mediaType: mediaType,
        storageProvider: uploadResult.provider,
        storagePath: storagePath,
        publicUrl: url,
      });
      
      // Clean up temp file
      if (req.file.path && existsSync(req.file.path)) {
        unlinkSync(req.file.path);
      }
      
      console.log(`[upload-file] File uploaded: ${uploadResult.fileId} -> ${url} (provider: ${uploadResult.provider}, id: ${mediaFile.id})`);
      res.json({ url, fileId: uploadResult.fileId, mediaType, mimeType, mediaId: mediaFile.id });
    } catch (error: any) {
      console.error("[upload-file] Error:", error);
      // Clean up temp file on error
      if (req.file?.path && existsSync(req.file.path)) {
        unlinkSync(req.file.path);
      }
      res.status(500).json({ error: error.message });
    }
  });

  // List media files for current admin (file manager)
  app.get("/api/media", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const files = await storage.listMediaFilesByAdmin(admin.id);
      res.json(files);
    } catch (error: any) {
      console.error("[media-list] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete media file (file manager)
  app.delete("/api/media/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const mediaId = req.params.id;
      const deleted = await storage.deleteMediaFile(admin.id, mediaId);
      
      if (!deleted) {
        return res.status(404).json({ error: "Arquivo não encontrado ou sem permissão" });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("[media-delete] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Upload SEO images (favicon or share image) - organized by owner/webinar
  app.post("/api/webinars/:id/upload-seo-image", memoryUpload.single("image"), async (req: MulterRequest, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }
      
      // Verificar se o plano está ativo
      if (!isAdminPlanActive(admin)) {
        return res.status(403).json({ 
          error: "Plano expirado. Renove seu plano para fazer upload de imagens.",
          reason: "plan_expired"
        });
      }

      const webinarId = req.params.id;
      const webinar = await storage.getWebinarById(webinarId);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      // Check ownership (unless superadmin)
      if (admin.role !== 'superadmin' && webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Not authorized to modify this webinar" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const imageType = req.body.type as 'favicon' | 'share';
      if (!imageType || !['favicon', 'share'].includes(imageType)) {
        return res.status(400).json({ error: "Invalid image type. Use 'favicon' or 'share'" });
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      const allowedExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico"];
      if (!allowedExts.includes(ext)) {
        return res.status(400).json({ error: "Invalid image format. Use: jpg, png, gif, webp, svg, ico" });
      }

      const ownerId = webinar.ownerId || admin.id;
      console.log(`[upload-seo-image] Uploading ${imageType}: ${req.file.originalname} for webinar ${webinarId}`);
      
      const url = await storage.uploadSeoImage(
        req.file.buffer, 
        req.file.originalname, 
        ownerId, 
        webinarId, 
        imageType
      );
      
      // Update webinar with the new URL
      const updateField = imageType === 'favicon' ? 'seoFaviconUrl' : 'seoShareImageUrl';
      await storage.updateWebinar(webinarId, { [updateField]: url });
      
      console.log(`[upload-seo-image] ${imageType} uploaded: ${url}`);
      res.json({ url, type: imageType });
    } catch (error: any) {
      console.error("[upload-seo-image] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Serve uploaded images - tries local disk first, then R2
  app.get("/api/images/:filename", async (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(imagesDir, filename);
      
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
      };
      
      // Try local disk first
      if (existsSync(filePath)) {
        res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
        res.setHeader("Cache-Control", "public, max-age=31536000");
        return createReadStream(filePath).pipe(res);
      }
      
      // Try R2 storage
      const imageBuffer = await storage.getImageFromR2(filename);
      if (imageBuffer) {
        res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
        res.setHeader("Cache-Control", "public, max-age=31536000");
        return res.send(imageBuffer);
      }
      
      return res.status(404).json({ error: "Image not found" });
    } catch (error: any) {
      console.error("[images] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Serve uploaded media files from R2 storage (for WhatsApp)
  app.get("/api/media/r2/:filename", async (req, res) => {
    try {
      const filename = req.params.filename;
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".ogg": "audio/ogg",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".wav": "audio/wav",
        ".opus": "audio/opus",
        ".mp4": "video/mp4",
        ".3gp": "video/3gpp",
        ".pdf": "application/pdf",
      };
      
      // Fetch from R2
      const mediaBuffer = await storage.getMediaFromR2(filename);
      if (mediaBuffer) {
        res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
        res.setHeader("Cache-Control", "public, max-age=31536000");
        return res.send(mediaBuffer);
      }
      
      return res.status(404).json({ error: "Media file not found in R2" });
    } catch (error: any) {
      console.error("[media-r2] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Serve uploaded media files (for WhatsApp) - local disk fallback
  app.get("/api/media/:filename", async (req, res) => {
    try {
      const filename = req.params.filename;
      const mediaDir = path.join(process.cwd(), "uploads", "media");
      const filePath = path.join(mediaDir, filename);
      
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".ogg": "audio/ogg",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".wav": "audio/wav",
        ".opus": "audio/opus",
        ".mp4": "video/mp4",
        ".3gp": "video/3gpp",
        ".pdf": "application/pdf",
      };
      
      // Try local disk first
      if (existsSync(filePath)) {
        res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
        res.setHeader("Cache-Control", "public, max-age=31536000");
        return createReadStream(filePath).pipe(res);
      }
      
      return res.status(404).json({ error: "Media file not found" });
    } catch (error: any) {
      console.error("[media] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // AI Designer - Conversational webinar page designer
  // Validation schema for AI Designer request
  const aiDesignerSchema = z.object({
    message: z.string().min(1).max(1000),
    conversationHistory: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(2000),
    })).max(20).default([]),
  });

  // Helper to validate hex color
  function isValidHexColor(color: string): boolean {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  }

  // Helper to sanitize AI suggestions
  function sanitizeSuggestions(suggestions: Record<string, unknown>): Record<string, string> | null {
    const allowedKeys = ["backgroundColor", "countdownColor", "liveButtonColor", "countdownText", "nextWebinarText", "endedBadgeText"];
    const sanitized: Record<string, string> = {};
    
    for (const key of allowedKeys) {
      if (suggestions[key] !== undefined) {
        const value = String(suggestions[key]).trim();
        if (key.includes("Color")) {
          if (isValidHexColor(value)) {
            sanitized[key] = value;
          }
        } else if (value.length > 0 && value.length <= 200) {
          sanitized[key] = value;
        }
      }
    }
    
    return Object.keys(sanitized).length > 0 ? sanitized : null;
  }

  app.post("/api/webinars/:id/ai-designer", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      // Check if plan is expired
      if (!isAdminPlanActive(admin)) {
        return res.status(403).json({ error: "Seu plano expirou. Renove para continuar." });
      }

      // Check if plan allows Designer IA feature
      if (!(await isDesignerIAAllowed(admin))) {
        return res.status(403).json({ 
          error: "O Designer IA está disponível apenas para planos com este recurso ativado. Faça upgrade para acessar.",
          needsUpgrade: true
        });
      }

      // Determine which AI provider to use
      let apiKey: string | undefined;
      let baseUrl: string | undefined;
      let modelName = "gpt-4o-mini"; // default

      // Check database settings for configured provider (user's own keys)
      const aiProvider = await storage.getSetting("ai_provider");
      
      if (aiProvider === "deepseek") {
        // Use DeepSeek
        const deepseekKey = await storage.getSetting("deepseek_api_key");
        if (deepseekKey?.trim()) {
          apiKey = deepseekKey;
          baseUrl = "https://api.deepseek.com";
          modelName = "deepseek-chat";
        }
      } else {
        // Use OpenAI (default)
        const openaiKey = await storage.getSetting("openai_api_key");
        if (openaiKey?.trim()) {
          apiKey = openaiKey;
          baseUrl = "https://api.openai.com/v1";
          modelName = "gpt-4o-mini";
        }
      }
      
      if (!apiKey) {
        return res.status(503).json({ 
          error: "IA não configurada. Vá em Configurações e adicione sua chave de API.",
          needsConfig: true
        });
      }

      // Create OpenAI-compatible client (works with both OpenAI and DeepSeek)
      const openaiClient = new OpenAI({
        apiKey,
        baseURL: baseUrl,
      });

      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      // Validate request body
      const parseResult = aiDesignerSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Dados inválidos: " + parseResult.error.errors[0]?.message });
      }
      
      const { message, conversationHistory } = parseResult.data;

      const systemPrompt = `Você é um Designer de IA especializado em criar páginas de webinário visualmente atraentes e profissionais.
Seu trabalho é conversar com o usuário para entender suas preferências e sugerir configurações de aparência.

CONFIGURAÇÕES ATUAIS DO WEBINÁRIO:
- Nome: ${webinar.name}
- Cor de fundo: ${webinar.backgroundColor}
- Cor do countdown: ${webinar.countdownColor}
- Cor do botão AO VIVO: ${webinar.liveButtonColor}
- Texto do countdown: ${webinar.countdownText}
- Texto quando encerrado: ${webinar.nextWebinarText}
- Texto do badge encerrado: ${webinar.endedBadgeText}

VOCÊ PODE SUGERIR:
1. Cores (use códigos hexadecimais como #FF5733)
2. Textos para os elementos
3. Combinações de cores harmoniosas
4. Estilos temáticos (corporativo, vibrante, minimalista, etc.)

REGRAS:
- Sempre responda em português brasileiro
- Seja amigável e prestativo
- Faça perguntas para entender melhor o que o usuário quer
- Sugira opções quando o usuário não souber o que quer
- Quando sugerir configurações, SEMPRE inclua um bloco JSON com as mudanças no seguinte formato:

\`\`\`json
{
  "backgroundColor": "#hex",
  "countdownColor": "#hex",
  "liveButtonColor": "#hex",
  "countdownText": "texto",
  "nextWebinarText": "texto",
  "endedBadgeText": "texto"
}
\`\`\`

Inclua apenas os campos que você está sugerindo mudar. O usuário poderá aplicar essas sugestões com um clique.

IMPORTANTE: Se o usuário pedir algo específico, sugira imediatamente. Se for vago, faça 1-2 perguntas clarificadoras antes de sugerir.`;

      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...conversationHistory.map((msg: { role: string; content: string }) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
        { role: "user", content: message },
      ];

      const completion = await openaiClient.chat.completions.create({
        model: modelName,
        messages,
        max_tokens: 1000,
        temperature: 0.7,
      });

      const assistantMessage = completion.choices[0]?.message?.content || "Desculpe, não consegui processar sua solicitação.";
      
      // Extract JSON suggestions with fallback strategies
      let suggestions = null;
      
      // Strategy 1: Try ```json ... ``` block
      const jsonBlockMatch = assistantMessage.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonBlockMatch) {
        try {
          const parsed = JSON.parse(jsonBlockMatch[1]);
          suggestions = sanitizeSuggestions(parsed);
        } catch (e) {
          // Continue to next strategy
        }
      }
      
      // Strategy 2: Try to find first JSON object in text
      if (!suggestions) {
        const jsonObjectMatch = assistantMessage.match(/\{[\s\S]*?"(?:backgroundColor|countdownColor|liveButtonColor|countdownText|nextWebinarText|endedBadgeText)"[\s\S]*?\}/);
        if (jsonObjectMatch) {
          try {
            const parsed = JSON.parse(jsonObjectMatch[0]);
            suggestions = sanitizeSuggestions(parsed);
          } catch (e) {
            // Ignore parse errors
          }
        }
      }

      res.json({
        message: assistantMessage,
        suggestions,
      });
    } catch (error: any) {
      console.error("AI Designer error:", error);
      
      // Better error messages for common issues
      if (error.status === 402 || error.message?.includes("Insufficient Balance")) {
        return res.status(402).json({ 
          error: "Saldo insuficiente na conta de IA. Adicione créditos na sua conta DeepSeek ou OpenAI.",
          needsCredits: true
        });
      }
      if (error.status === 401 || error.message?.includes("Unauthorized") || error.message?.includes("Invalid API")) {
        return res.status(401).json({ 
          error: "Chave de API inválida. Verifique sua chave nas Configurações.",
          needsConfig: true
        });
      }
      if (error.status === 429) {
        return res.status(429).json({ 
          error: "Muitas requisições. Aguarde alguns segundos e tente novamente."
        });
      }
      
      res.status(500).json({ error: "Erro ao processar solicitação de IA: " + error.message });
    }
  });

  // Track viewer session for analytics
  app.post("/api/webinars/:id/track-session", async (req, res) => {
    try {
      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }
      
      // Verificar se o plano do dono está ativo
      if (webinar.ownerId && !(await isWebinarOwnerPlanActive(webinar.ownerId))) {
        return res.status(403).json({ error: "Webinar indisponível", reason: "owner_plan_expired" });
      }
      
      const { sessionId, viewDurationSeconds, maxVideoPositionSeconds } = req.body;
      const today = new Date();
      const sessionDate = today.toISOString().split('T')[0];
      
      if (!sessionId || viewDurationSeconds === undefined || maxVideoPositionSeconds === undefined) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      await storage.trackViewerSession({
        webinarId: req.params.id,
        sessionId,
        viewDurationSeconds,
        maxVideoPositionSeconds,
        sessionDate,
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Track event for Meta Conversions API (server-side tracking)
  const trackEventSchema = z.object({
    eventName: z.enum(["PageView", "Lead", "InitiateCheckout", "ChatMessage"]),
    eventId: z.string().uuid().optional(),
    eventTime: z.number().optional(),
    sourceUrl: z.string().url().optional(),
    userData: z.object({
      email: z.string().email().optional(),
      phone: z.string().optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      fbp: z.string().optional(),
      fbc: z.string().optional(),
    }).optional(),
    customData: z.record(z.any()).optional(),
  });

  app.post("/api/webinars/:id/track-event", async (req, res) => {
    try {
      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ success: false, error: "Webinar not found" });
      }
      
      const parseResult = trackEventSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid request body", 
          details: parseResult.error.flatten() 
        });
      }
      
      const { eventName, eventId, eventTime, sourceUrl, userData, customData } = parseResult.data;
      
      const pixelId = (webinar as any).facebookPixelId;
      const accessToken = (webinar as any).facebookAccessToken;
      const testEventCode = (webinar as any).facebookTestEventCode;
      
      if (!pixelId || !accessToken) {
        return res.json({ success: false, reason: "Meta CAPI not configured for this webinar" });
      }
      
      const clientIp = req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.socket.remoteAddress || "";
      const userAgent = req.headers["user-agent"] || "";
      
      const sanitizedUserData = {
        email: userData?.email?.toLowerCase()?.trim(),
        phone: userData?.phone?.replace(/\D/g, ""),
        firstName: userData?.firstName?.trim(),
        lastName: userData?.lastName?.trim(),
        city: userData?.city?.trim(),
        state: userData?.state?.trim(),
        clientIpAddress: clientIp,
        clientUserAgent: userAgent,
        fbp: userData?.fbp,
        fbc: userData?.fbc,
      };
      
      const result = await sendCustomEvent(
        { pixelId, accessToken, testEventCode },
        {
          eventName,
          eventId: eventId || crypto.randomUUID(),
          eventTime: eventTime || Math.floor(Date.now() / 1000),
          sourceUrl: sourceUrl || `${getAppUrl()}/w/${webinar.slug}`,
          userData: sanitizedUserData,
          customData: {
            ...customData,
            content_name: webinar.name,
            webinar_slug: webinar.slug,
          },
        }
      );
      
      if (result.success) {
        console.log(`[track-event] ${eventName} sent for webinar ${webinar.slug}`);
      } else {
        console.warn(`[track-event] ${eventName} failed for webinar ${webinar.slug}:`, result.error);
      }
      
      res.json(result);
    } catch (error: any) {
      console.error("[track-event] Error:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get analytics for a webinar
  app.get("/api/webinars/:id/analytics", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para ver analytics deste webinar" });
      }

      const date = req.query.date as string | undefined;
      const analytics = await storage.getAnalyticsByWebinarAndDate(req.params.id, date);
      res.json(analytics);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get unique views count for a webinar
  app.get("/api/webinars/:id/unique-views", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para ver estatísticas deste webinar" });
      }

      const date = req.query.date as string | undefined;
      const uniqueViews = await storage.getUniqueViewsByWebinarAndDate(req.params.id, date);
      res.json({ uniqueViews });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Scripts CRUD endpoints
  
  // Chat with AI to generate scripts
  app.post("/api/webinars/:webinarId/scripts/generate-with-chat", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      // Check if plan is expired
      if (!isAdminPlanActive(admin)) {
        return res.status(403).json({ error: "Seu plano expirou. Renove para continuar." });
      }

      const webinar = await storage.getWebinarById(req.params.webinarId);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para acessar este webinar" });
      }

      const { userMessage, conversationHistory } = req.body;

      if (!userMessage?.trim()) {
        return res.status(400).json({ error: "Mensagem vazia" });
      }

      // Get AI settings
      let apiKey: string | undefined;
      let baseUrl: string | undefined;
      let modelName = "gpt-4o-mini";

      const aiProvider = await storage.getSetting("ai_provider");

      if (aiProvider === "deepseek") {
        const deepseekKey = await storage.getSetting("deepseek_api_key");
        if (deepseekKey?.trim()) {
          apiKey = deepseekKey;
          baseUrl = "https://api.deepseek.com";
          modelName = "deepseek-chat";
        }
      } else {
        const openaiKey = await storage.getSetting("openai_api_key");
        if (openaiKey?.trim()) {
          apiKey = openaiKey;
          baseUrl = "https://api.openai.com/v1";
          modelName = "gpt-4o-mini";
        }
      }

      if (!apiKey) {
        return res.status(503).json({
          error: "IA não configurada. Vá em Configurações e adicione sua chave de API.",
        });
      }

      const client = new OpenAI({ apiKey, baseURL: baseUrl });

      // Get system prompt from database (configurable by super admin)
      // Script generator uses script-type config
      const aiConfig = await storage.getAiConfigByType("script");
      if (!aiConfig) {
        return res.status(503).json({
          error: "Configuração de IA para roteirizador não encontrada. Entre em contato com o administrador.",
        });
      }

      // Get memories (context files) for SCRIPT generator only
      const memories = await storage.getAiMemoriesByConfig(aiConfig.id, "script");
      let systemPrompt = aiConfig.systemPrompt;
      
      // Append memory context if available
      if (memories.length > 0) {
        const memoryContext = memories.map((m) => `### ${m.label}:\n${m.content}`).join("\n\n");
        systemPrompt += `\n\n=== INSTRUÇÕES E MEMÓRIAS CONFIGURADAS ===\n${memoryContext}`;
      }

      // Build conversation for OpenAI
      const messages: any[] = [
        {
          role: "system",
          content: systemPrompt,
        },
        ...conversationHistory.map((msg: { role: string; content: string }) => ({
          role: msg.role,
          content: msg.content,
        })),
        {
          role: "user",
          content: userMessage,
        },
      ];

      const response = await client.chat.completions.create({
        model: modelName,
        max_tokens: 4000,
        messages,
      });

      const assistantMessage = response.choices[0]?.message?.content || "";

      // Check if the response includes a compiled final script
      // Only consider it a "final script" if it contains substantial structured content
      let generatedScript = "";
      
      // Check for explicit markers first
      const scriptMatch = assistantMessage.match(/\[ROTEIRO_INICIO\]([\s\S]*?)\[ROTEIRO_FIM\]/);
      if (scriptMatch) {
        generatedScript = scriptMatch[1].trim();
      } else {
        // Fallback: check if this is a complete script with multiple acts (at least 2 acts)
        // Look for patterns like "Ato 1", "Ato 2" or "## Ato 1", "Act 1", etc.
        const lowerMessage = assistantMessage.toLowerCase();
        const hasMultipleActs = (
          (lowerMessage.includes("ato 1") && lowerMessage.includes("ato 2")) ||
          (lowerMessage.includes("act 1") && lowerMessage.includes("act 2")) ||
          (lowerMessage.includes("## ato 1") && lowerMessage.includes("## ato 2")) ||
          (lowerMessage.includes("# ato 1") && lowerMessage.includes("# ato 2")) ||
          (lowerMessage.includes("parte 1") && lowerMessage.includes("parte 2") && lowerMessage.includes("parte 3"))
        );
        
        // Also check for substantial structured content (headers, long content)
        const hasSubstantialContent = assistantMessage.length > 2000 && (
          (assistantMessage.match(/#{1,3}\s/g) || []).length >= 3
        );
        
        if (hasMultipleActs || hasSubstantialContent) {
          generatedScript = assistantMessage;
        }
      }

      res.json({
        message: assistantMessage,
        generatedScript,
      });
    } catch (error: any) {
      console.error("Generate script chat error:", error);

      if (error.status === 402 || error.message?.includes("Insufficient Balance")) {
        return res.status(402).json({
          error: "Saldo insuficiente na conta de IA. Adicione créditos na sua conta DeepSeek ou OpenAI.",
          needsCredits: true,
        });
      }
      if (error.status === 401 || error.message?.includes("Unauthorized")) {
        return res.status(401).json({
          error: "Chave de API inválida. Verifique sua chave nas Configurações.",
          needsConfig: true,
        });
      }

      res.status(500).json({ error: "Erro ao gerar roteiro: " + error.message });
    }
  });

  // Get all scripts for a webinar
  app.get("/api/webinars/:webinarId/scripts", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const webinar = await storage.getWebinarById(req.params.webinarId);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para acessar os roteiros deste webinar" });
      }

      const scripts = await storage.getScriptsByWebinar(req.params.webinarId);
      res.json(scripts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create a new script
  app.post("/api/webinars/:webinarId/scripts", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const webinar = await storage.getWebinarById(req.params.webinarId);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para criar roteiros neste webinar" });
      }

      const { title, script } = req.body;
      
      // Validate input
      if (!title?.trim() || !script?.trim()) {
        return res.status(400).json({ error: "Title and script are required" });
      }

      const newScript = await storage.createScript({
        webinarId: req.params.webinarId,
        title: title.trim(),
        script: script.trim(),
      });

      res.json(newScript);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update a script
  app.patch("/api/webinars/:webinarId/scripts/:scriptId", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const webinar = await storage.getWebinarById(req.params.webinarId);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para editar roteiros deste webinar" });
      }

      const existingScript = await storage.getScriptById(req.params.scriptId);
      if (!existingScript) {
        return res.status(404).json({ error: "Script not found" });
      }

      if (existingScript.webinarId !== req.params.webinarId) {
        return res.status(403).json({ error: "Este script não pertence a este webinar" });
      }

      const updated = await storage.updateScript(req.params.scriptId, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Script not found" });
      }

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete a script
  app.delete("/api/webinars/:webinarId/scripts/:scriptId", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const webinar = await storage.getWebinarById(req.params.webinarId);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para deletar roteiros deste webinar" });
      }

      const existingScript = await storage.getScriptById(req.params.scriptId);
      if (!existingScript) {
        return res.status(404).json({ error: "Script not found" });
      }

      if (existingScript.webinarId !== req.params.webinarId) {
        return res.status(403).json({ error: "Este script não pertence a este webinar" });
      }

      await storage.deleteScript(req.params.scriptId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Generate messages with AI from a script
  app.post("/api/webinars/:webinarId/scripts/:scriptId/generate-messages", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      // Check if plan is expired
      if (!isAdminPlanActive(admin)) {
        return res.status(403).json({ error: "Seu plano expirou. Renove para continuar." });
      }

      // Check if plan allows message generator feature
      if (!(await isGeradorMensagensAllowed(admin))) {
        return res.status(403).json({ 
          error: "O gerador de mensagens com IA está disponível apenas para planos com este recurso ativado. Faça upgrade para acessar.",
          needsUpgrade: true
        });
      }

      const webinar = await storage.getWebinarById(req.params.webinarId);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para gerar mensagens deste webinar" });
      }

      const script = await storage.getScriptById(req.params.scriptId);
      if (!script) {
        return res.status(404).json({ error: "Script not found" });
      }

      if (script.webinarId !== req.params.webinarId) {
        return res.status(403).json({ error: "Este script não pertence a este webinar" });
      }

      const { emailContext = "", whatsappContext = "" } = req.body;

      // Determine which AI provider to use
      let apiKey: string | undefined;
      let baseUrl: string | undefined;
      let modelName = "gpt-4o-mini";

      const aiProvider = await storage.getSetting("ai_provider");

      if (aiProvider === "deepseek") {
        const deepseekKey = await storage.getSetting("deepseek_api_key");
        if (deepseekKey?.trim()) {
          apiKey = deepseekKey;
          baseUrl = "https://api.deepseek.com";
          modelName = "deepseek-chat";
        }
      } else {
        const openaiKey = await storage.getSetting("openai_api_key");
        if (openaiKey?.trim()) {
          apiKey = openaiKey;
          baseUrl = "https://api.openai.com/v1";
          modelName = "gpt-4o-mini";
        }
      }

      if (!apiKey) {
        return res.status(503).json({
          error: "IA não configurada. Vá em Configurações e adicione sua chave de API.",
        });
      }

      const client = new OpenAI({ apiKey, baseURL: baseUrl });

      // Get AI config and MESSAGE generator memories
      const aiConfig = await storage.getAiConfigByType("message");
      const messageMemories = aiConfig 
        ? await storage.getAiMemoriesByConfig(aiConfig.id, "message")
        : [];
      
      // Build memory context for messages
      let memoryContext = "";
      if (messageMemories.length > 0) {
        memoryContext = "\n\nCONTEXTO ADICIONAL (do admin):\n" + 
          messageMemories.map((m) => `[${m.label}]: ${m.content}`).join("\n\n");
      }
      
      // Use custom system prompt if available
      let systemPrompt = "";
      if (aiConfig?.systemPrompt) {
        systemPrompt = aiConfig.systemPrompt + memoryContext;
      } else {
        // Fallback default prompts if no custom config exists
        systemPrompt = memoryContext;
      }

      // Generate email message
      const emailPrompt = `Você é um especialista em copywriting e marketing de webinários.
Usando este roteiro de webinário:
${script.script}

Contexto do usuário: ${emailContext || "Nenhum contexto adicional"}${memoryContext}

Gere uma mensagem de EMAIL profissional e persuasiva para convidar pessoas ao webinário. 
Máximo 200 palavras.
Inclua: Benefício principal, quando é, CTA clara.`;

      const emailResponse = await client.chat.completions.create({
        model: modelName,
        max_tokens: 500,
        messages: systemPrompt 
          ? [
              { role: "system", content: systemPrompt },
              { role: "user", content: emailPrompt },
            ]
          : [{ role: "user", content: emailPrompt }],
      });

      const emailMessage = emailResponse.choices[0]?.message?.content || "";

      // Generate WhatsApp message
      const whatsappPrompt = `Você é um especialista em copywriting para WhatsApp.
Usando este roteiro de webinário:
${script.script}

Contexto do usuário: ${whatsappContext || "Nenhum contexto adicional"}${memoryContext}

Gere uma mensagem curta e persuasiva para WhatsApp convitando para o webinário.
Máximo 150 caracteres, informal e amigável.
Inclua CTA clara (ex: link ou "Confirma presença?").`;

      const whatsappResponse = await client.chat.completions.create({
        model: modelName,
        max_tokens: 300,
        messages: systemPrompt 
          ? [
              { role: "system", content: systemPrompt },
              { role: "user", content: whatsappPrompt },
            ]
          : [{ role: "user", content: whatsappPrompt }],
      });

      const whatsappMessage = whatsappResponse.choices[0]?.message?.content || "";

      res.json({
        emailMessage,
        whatsappMessage,
      });
    } catch (error: any) {
      console.error("Generate messages error:", error);

      if (error.status === 402 || error.message?.includes("Insufficient Balance")) {
        return res.status(402).json({
          error: "Saldo insuficiente na conta de IA. Adicione créditos na sua conta DeepSeek ou OpenAI.",
          needsCredits: true,
        });
      }
      if (error.status === 401 || error.message?.includes("Unauthorized")) {
        return res.status(401).json({
          error: "Chave de API inválida. Verifique sua chave nas Configurações.",
          needsConfig: true,
        });
      }

      res.status(500).json({ error: "Erro ao gerar mensagens: " + error.message });
    }
  });

  // Get video transcription for a webinar (searches by webinar's uploadedVideoId)
  app.get("/api/webinars/:webinarId/transcription", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ error: "Admin not found" });

      const webinar = await storage.getWebinarById(req.params.webinarId);
      if (!webinar) return res.status(404).json({ error: "Webinar not found" });
      if (webinar.ownerId !== admin.id) return res.status(403).json({ error: "Sem permissão" });

      // First try to find transcription by webinarId (legacy)
      let transcription = await storage.getVideoTranscriptionByWebinar(req.params.webinarId);
      
      // If not found and webinar has an uploadedVideoId, search by that
      if (!transcription && webinar.uploadedVideoId) {
        transcription = await storage.getVideoTranscriptionByUploadedVideo(webinar.uploadedVideoId);
      }
      
      res.json(transcription || null);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get video transcription by video ID (any video, not just webinar-associated)
  app.get("/api/videos/:videoId/transcription", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ error: "Admin not found" });

      // Check if video belongs to admin
      const video = await storage.getVideoById(req.params.videoId);
      if (!video || video.ownerId !== admin.id) {
        return res.status(404).json({ error: "Vídeo não encontrado" });
      }

      const transcription = await storage.getVideoTranscriptionByUploadedVideo(req.params.videoId);
      res.json(transcription || null);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Transcribe any video by ID (not just webinar-associated) - Uses AssemblyAI for reliable long video support
  app.post("/api/videos/:videoId/transcribe", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      // Check if plan is expired (superadmins are exempt)
      if (!isAdminPlanActive(admin)) {
        return res.status(403).json({ error: "Seu plano expirou. Renove para continuar." });
      }

      // Check if plan allows transcription feature
      if (!(await isTranscricaoAllowed(admin))) {
        return res.status(403).json({ 
          error: "A transcrição automática está disponível apenas para planos com este recurso ativado. Faça upgrade para acessar.",
          needsUpgrade: true
        });
      }

      // Check if video belongs to admin
      const video = await storage.getVideoById(req.params.videoId);
      if (!video || video.ownerId !== admin.id) {
        return res.status(404).json({ error: "Vídeo não encontrado" });
      }

      // Try AssemblyAI first, fallback to Deepgram
      const assemblyaiApiKey = process.env.ASSEMBLYAI_API_KEY;
      const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
      
      if (!assemblyaiApiKey && !deepgramApiKey) {
        return res.status(503).json({ error: "Serviço de transcrição não configurado" });
      }

      // Create/update transcription record
      const existing = await storage.getVideoTranscriptionByUploadedVideo(req.params.videoId);
      let transcriptionId: string;
      
      if (existing) {
        await storage.updateVideoTranscription(existing.id, {
          status: 'processing',
          transcription: null,
          error: null,
        });
        transcriptionId = existing.id;
      } else {
        const created = await storage.createVideoTranscription({
          webinarId: null,
          uploadedVideoId: req.params.videoId,
          transcription: null,
          status: 'processing',
        });
        transcriptionId = created.id;
      }

      // Get the app URL for callback
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const callbackUrl = `${protocol}://${host}/api/transcription-callback/${transcriptionId}`;
      
      console.log(`[transcribe] Starting transcription for video ${req.params.videoId}`);
      console.log(`[transcribe] Callback URL: ${callbackUrl}`);
      
      // Get signed URL for the video (valid for 6 hours for long videos)
      const signedUrl = await storage.getSignedVideoUrl(req.params.videoId, 21600);
      if (!signedUrl) {
        return res.status(500).json({ error: 'Não foi possível gerar URL para o vídeo' });
      }

      // Use AssemblyAI if available (better for long videos)
      if (assemblyaiApiKey) {
        console.log(`[transcribe] Using AssemblyAI for reliable long video transcription`);
        
        // Submit transcription to AssemblyAI with webhook
        const apiResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
          method: 'POST',
          headers: {
            'Authorization': assemblyaiApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            audio_url: signedUrl,
            language_code: 'pt',
            punctuate: true,
            format_text: true,
            webhook_url: callbackUrl,
          }),
        });

        if (!apiResponse.ok) {
          const errorText = await apiResponse.text();
          console.error(`[transcribe] AssemblyAI API error: ${apiResponse.status} - ${errorText}`);
          await storage.updateVideoTranscription(transcriptionId, {
            status: 'failed',
            error: `Erro na API de transcrição: ${apiResponse.status}`,
          });
          return res.status(500).json({ error: `Erro na API de transcrição` });
        }

        const apiData: any = await apiResponse.json();
        console.log(`[transcribe] AssemblyAI accepted request, transcript_id: ${apiData.id}`);
        
        // Return immediately - AssemblyAI will call our webhook when done
        res.json({ 
          transcriptionId, 
          status: 'processing', 
          message: 'Transcrição iniciada. O AssemblyAI está processando o vídeo e enviará o resultado automaticamente.',
          externalId: apiData.id
        });
      } else {
        // Fallback to Deepgram
        console.log(`[transcribe] Using Deepgram callback for long video support`);
        
        const apiResponse = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=pt&detect_language=true&punctuate=true&paragraphs=true&smart_format=true', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${deepgramApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            url: signedUrl,
            callback: callbackUrl
          }),
        });

        if (!apiResponse.ok) {
          const errorText = await apiResponse.text();
          console.error(`[transcribe] Deepgram API error: ${apiResponse.status} - ${errorText}`);
          await storage.updateVideoTranscription(transcriptionId, {
            status: 'failed',
            error: `Erro na API de transcrição: ${apiResponse.status}`,
          });
          return res.status(500).json({ error: `Erro na API de transcrição` });
        }

        const apiData: any = await apiResponse.json();
        console.log(`[transcribe] Deepgram accepted request, request_id: ${apiData.request_id}`);
        
        res.json({ 
          transcriptionId, 
          status: 'processing', 
          message: 'Transcrição iniciada. O Deepgram está processando o vídeo e enviará o resultado automaticamente.',
          requestId: apiData.request_id
        });
      }

    } catch (error: any) {
      console.error('[transcribe] Error:', error);
      res.status(500).json({ error: error.message || 'Erro ao transcrever vídeo' });
    }
  });

  // Transcription callback endpoint - receives results from AssemblyAI or Deepgram
  app.post("/api/transcription-callback/:transcriptionId", async (req, res) => {
    try {
      const { transcriptionId } = req.params;
      const data = req.body;
      
      console.log(`[callback] Received transcription callback for ${transcriptionId}`);
      console.log(`[callback] Data keys: ${Object.keys(data || {}).join(', ')}`);
      
      if (!data) {
        console.error('[callback] No data received');
        return res.status(400).json({ error: 'No data received' });
      }
      
      // Detect if this is AssemblyAI or Deepgram based on response structure
      // AssemblyAI has transcript_id field, Deepgram has results.channels structure
      const isAssemblyAI = data.transcript_id !== undefined || (data.status !== undefined && !data.results);
      
      if (isAssemblyAI) {
        // AssemblyAI callback
        console.log(`[callback] Processing AssemblyAI response, status: ${data.status}, transcript_id: ${data.transcript_id}`);
        
        if (data.status === 'error') {
          console.error('[callback] AssemblyAI error:', data.error);
          await storage.updateVideoTranscription(transcriptionId, {
            status: 'failed',
            error: data.error || 'Erro na transcrição',
          });
          return res.status(200).json({ received: true, status: 'failed' });
        }
        
        if (data.status === 'completed') {
          let transcription = data.text || '';
          
          // If text is not in webhook payload, fetch from API
          if (!transcription && data.transcript_id) {
            console.log(`[callback] Text not in webhook, fetching from AssemblyAI API...`);
            const assemblyaiApiKey = process.env.ASSEMBLYAI_API_KEY;
            if (assemblyaiApiKey) {
              try {
                const response = await fetch(`https://api.assemblyai.com/v2/transcript/${data.transcript_id}`, {
                  headers: { 'Authorization': assemblyaiApiKey }
                });
                if (response.ok) {
                  const fullTranscript = await response.json() as any;
                  transcription = fullTranscript.text || '';
                  console.log(`[callback] Fetched transcript from API: ${transcription.length} chars`);
                }
              } catch (e) {
                console.error('[callback] Error fetching transcript from API:', e);
              }
            }
          }
          
          console.log(`[callback] AssemblyAI transcription received: ${transcription.length} chars`);
          
          if (!transcription || transcription.length === 0) {
            console.error('[callback] Empty transcription received from AssemblyAI');
            await storage.updateVideoTranscription(transcriptionId, {
              status: 'failed',
              error: 'Transcrição vazia recebida',
            });
            return res.status(200).json({ received: true, status: 'failed' });
          }
          
          await storage.updateVideoTranscription(transcriptionId, {
            transcription,
            status: 'completed',
            error: null,
          });
          
          console.log(`[callback] Transcription saved successfully for ${transcriptionId}`);
          return res.status(200).json({ received: true, status: 'completed' });
        }
        
        // Other statuses (queued, processing) - just acknowledge and wait
        console.log(`[callback] AssemblyAI status: ${data.status}, waiting for completion...`);
        return res.status(200).json({ received: true, status: data.status });
        
      } else {
        // Deepgram callback
        console.log(`[callback] Processing Deepgram response`);
        
        if (data.err_code || data.error) {
          console.error('[callback] Deepgram error:', data.err_msg || data.error);
          await storage.updateVideoTranscription(transcriptionId, {
            status: 'failed',
            error: data.err_msg || data.error || 'Erro na transcrição',
          });
          return res.status(200).json({ received: true, status: 'failed' });
        }
        
        const transcription = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
        const duration = data.metadata?.duration || 0;
        
        console.log(`[callback] Deepgram transcription received: ${transcription.length} chars, duration: ${duration}s`);
        
        if (!transcription || transcription.length === 0) {
          console.error('[callback] Empty transcription received from Deepgram');
          await storage.updateVideoTranscription(transcriptionId, {
            status: 'failed',
            error: 'Transcrição vazia recebida',
          });
          return res.status(200).json({ received: true, status: 'failed' });
        }
        
        await storage.updateVideoTranscription(transcriptionId, {
          transcription,
          status: 'completed',
          error: null,
        });
        
        console.log(`[callback] Transcription saved successfully for ${transcriptionId}`);
        return res.status(200).json({ received: true, status: 'completed' });
      }
      
    } catch (error: any) {
      console.error('[callback] Error processing callback:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Transcribe video with Deepgram (uses video already associated with webinar)
  app.post("/api/webinars/:webinarId/transcribe-video", async (req, res) => {
    let tempVideoPath: string | null = null;
    let audioPath: string | null = null;
    
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      // Check if plan is expired
      if (!isAdminPlanActive(admin)) {
        return res.status(403).json({ error: "Seu plano expirou. Renove para continuar." });
      }

      // Check if plan allows transcription feature
      if (!(await isTranscricaoAllowed(admin))) {
        return res.status(403).json({ 
          error: "A transcrição automática está disponível apenas para planos com este recurso ativado. Faça upgrade para acessar.",
          needsUpgrade: true
        });
      }

      const webinar = await storage.getWebinarById(req.params.webinarId);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para acessar este webinar" });
      }

      // Check if webinar has a video associated
      if (!webinar.uploadedVideoId) {
        return res.status(400).json({ error: "Este webinário não tem vídeo associado. Vá em Webinários > Vídeo e selecione um vídeo." });
      }

      const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
      if (!deepgramApiKey) {
        return res.status(503).json({ error: "Serviço de transcrição não configurado" });
      }

      // Create pending transcription record
      const existing = await storage.getVideoTranscriptionByWebinar(req.params.webinarId);
      let transcriptionId: string;
      if (existing) {
        await storage.updateVideoTranscription(existing.id, {
          status: 'processing',
          transcription: null,
          error: null,
        });
        transcriptionId = existing.id;
      } else {
        const created = await storage.createVideoTranscription({
          webinarId: req.params.webinarId,
          uploadedVideoId: webinar.uploadedVideoId,
          transcription: null,
          status: 'processing',
        });
        transcriptionId = created.id;
      }

      // Return immediately, process in background
      res.json({ transcriptionId, status: 'processing', message: 'Transcrição iniciada' });

      // Process transcription in background
      (async () => {
        try {
          console.log(`[transcribe] Starting transcription for webinar ${req.params.webinarId}, video ${webinar.uploadedVideoId}`);
          
          // Get video buffer from storage (R2/Supabase/disk)
          const videoBuffer = await storage.getVideoStream(webinar.uploadedVideoId!);
          if (!videoBuffer) {
            throw new Error('Vídeo não encontrado no servidor');
          }

          // Save video to temp file for FFmpeg processing
          tempVideoPath = path.join(uploadTempDir, `temp_video_${Date.now()}.mp4`);
          writeFileSync(tempVideoPath, videoBuffer);
          console.log(`[transcribe] Video saved to temp: ${tempVideoPath}`);

          // Extract audio from video to MP3
          audioPath = path.join(uploadTempDir, `audio_${Date.now()}.mp3`);
          
          await new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
              '-i', tempVideoPath!,
              '-q:a', '9',
              '-y',
              audioPath!
            ]);

            let stderr = '';
            ffmpeg.stderr?.on('data', (data) => { stderr += data.toString(); });
            ffmpeg.on('close', (code) => {
              if (code !== 0) {
                console.error('[transcribe] ffmpeg error:', stderr);
                reject(new Error(`FFmpeg falhou ao extrair áudio`));
              } else {
                console.log(`[transcribe] Audio extracted to: ${audioPath}`);
                resolve(undefined);
              }
            });
            ffmpeg.on('error', reject);
          });

          // Send to Deepgram
          const audioBuffer = readFileSync(audioPath);
          console.log(`[transcribe] Sending ${audioBuffer.length} bytes to Deepgram`);
          
          const deepgramResponse = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=pt', {
            method: 'POST',
            headers: {
              'Authorization': `Token ${deepgramApiKey}`,
              'Content-Type': 'audio/mpeg',
            },
            body: audioBuffer,
          });

          if (!deepgramResponse.ok) {
            const errorText = await deepgramResponse.text();
            throw new Error(`Deepgram error: ${deepgramResponse.status} - ${errorText}`);
          }

          const deepgramData: any = await deepgramResponse.json();
          const transcription = deepgramData.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
          
          console.log(`[transcribe] Transcription completed, ${transcription.length} chars`);

          // Update transcription record
          await storage.updateVideoTranscription(transcriptionId, {
            transcription,
            status: 'completed',
            error: null,
          });

          console.log(`[transcribe] Saved transcription for webinar ${req.params.webinarId}`);
        } catch (error: any) {
          console.error('[transcribe] Background error:', error);
          await storage.updateVideoTranscription(transcriptionId, {
            status: 'failed',
            error: error.message || 'Erro ao transcrever vídeo',
          });
        } finally {
          // Clean up temp files
          if (tempVideoPath) {
            try { unlinkSync(tempVideoPath); } catch {}
          }
          if (audioPath) {
            try { unlinkSync(audioPath); } catch {}
          }
        }
      })();

    } catch (error: any) {
      console.error('[transcribe] Error:', error);
      res.status(500).json({ error: error.message || 'Erro ao transcrever vídeo' });
    }
  });

  // Generate messages with AI chat conversation
  app.post("/api/webinars/:webinarId/scripts/:scriptId/generate-messages-chat", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      // Check if plan is expired
      if (!isAdminPlanActive(admin)) {
        return res.status(403).json({ error: "Seu plano expirou. Renove para continuar." });
      }

      // Check if plan allows message generator feature
      if (!(await isGeradorMensagensAllowed(admin))) {
        return res.status(403).json({ 
          error: "O gerador de mensagens com IA está disponível apenas para planos com este recurso ativado. Faça upgrade para acessar.",
          needsUpgrade: true
        });
      }

      const webinar = await storage.getWebinarById(req.params.webinarId);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Você não tem permissão para acessar este webinar" });
      }

      const script = await storage.getScriptById(req.params.scriptId);
      if (!script) {
        return res.status(404).json({ error: "Script not found" });
      }

      if (script.webinarId !== req.params.webinarId) {
        return res.status(403).json({ error: "Este script não pertence a este webinar" });
      }

      const { userMessage, conversationHistory } = req.body;

      if (!userMessage?.trim()) {
        return res.status(400).json({ error: "Mensagem vazia" });
      }

      // Get AI settings
      let apiKey: string | undefined;
      let baseUrl: string | undefined;
      let modelName = "gpt-4o-mini";

      const aiProvider = await storage.getSetting("ai_provider");

      if (aiProvider === "deepseek") {
        const deepseekKey = await storage.getSetting("deepseek_api_key");
        if (deepseekKey?.trim()) {
          apiKey = deepseekKey;
          baseUrl = "https://api.deepseek.com";
          modelName = "deepseek-chat";
        }
      } else {
        const openaiKey = await storage.getSetting("openai_api_key");
        if (openaiKey?.trim()) {
          apiKey = openaiKey;
          baseUrl = "https://api.openai.com/v1";
          modelName = "gpt-4o-mini";
        }
      }

      if (!apiKey) {
        return res.status(503).json({
          error: "IA não configurada. Vá em Configurações e adicione sua chave de API.",
        });
      }

      const client = new OpenAI({ apiKey, baseURL: baseUrl });

      // Get AI config for message generator
      const aiConfig = await storage.getAiConfigByType("message");
      const messageMemories = aiConfig 
        ? await storage.getAiMemoriesByConfig(aiConfig.id, "message")
        : [];
      
      // Build memory context from AI memories
      let memoryContext = "";
      if (messageMemories.length > 0) {
        memoryContext = "\n\n=== INSTRUÇÕES E MEMÓRIAS CONFIGURADAS ===\n" + 
          messageMemories.map((m) => `### ${m.label}:\n${m.content}`).join("\n\n");
      }

      // Get video transcription if available and completed
      let transcriptionContext = "";
      // First try by webinarId, then by uploadedVideoId
      let transcription = await storage.getVideoTranscriptionByWebinar(req.params.webinarId);
      if (!transcription && webinar.uploadedVideoId) {
        transcription = await storage.getVideoTranscriptionByUploadedVideo(webinar.uploadedVideoId);
      }
      if (transcription && transcription.status === 'completed' && transcription.transcription) {
        // Limit transcription to avoid token overflow but keep enough context
        const maxChars = 50000;
        const transcriptionText = transcription.transcription.length > maxChars 
          ? transcription.transcription.substring(0, maxChars) + "\n... [transcrição truncada]"
          : transcription.transcription;
        transcriptionContext = `\n\n=== TRANSCRIÇÃO DO VÍDEO DO WEBINÁRIO ===\n${transcriptionText}`;
      }

      // Use configured system prompt from aiConfig, or fallback to default
      const baseSystemPrompt = aiConfig?.systemPrompt || `Você é um especialista em copywriting e marketing digital, focado em criar mensagens persuasivas para webinários.`;

      // Check if transcription is available to adjust behavior
      const hasTranscription = transcriptionContext.length > 0;

      // Build complete system prompt
      const systemPrompt = `${baseSystemPrompt}
${memoryContext}

=== ROTEIRO DO WEBINÁRIO ===
${script.script}
${transcriptionContext}

=== COMPORTAMENTO IMPORTANTE ===
${hasTranscription ? `
ATENÇÃO: Você tem acesso à TRANSCRIÇÃO COMPLETA do vídeo do webinário acima.
- NÃO faça perguntas para coletar informações que já estão na transcrição.
- USE o conteúdo da transcrição para extrair: nicho, público-alvo, promessa, produto, benefícios, tom de voz, etc.
- Quando o usuário pedir mensagens, GERE DIRETAMENTE com base no conteúdo que você já tem.
- Você pode dizer algo como: "Vejo que já temos o conteúdo completo do seu webinário! Vou usar essas informações para criar as mensagens..."
- Apenas peça confirmação ou preferências específicas (ex: tom mais formal ou informal, quantidade de mensagens, etc.)
` : `
Não há transcrição disponível. Siga o fluxo de perguntas das instruções acima para coletar as informações necessárias antes de gerar as mensagens.
`}

=== INSTRUÇÕES CRÍTICAS DE FORMATAÇÃO ===
IMPORTANTE: Sempre que gerar mensagens, você DEVE usar os marcadores exatos abaixo.

Para CADA mensagem de EMAIL, use EXATAMENTE este formato:
[EMAIL_MESSAGE_START]
(conteúdo completo da mensagem de email aqui)
[EMAIL_MESSAGE_END]

Para CADA mensagem de WHATSAPP, use EXATAMENTE este formato:
[WHATSAPP_MESSAGE_START]
(conteúdo completo da mensagem de WhatsApp aqui)
[WHATSAPP_MESSAGE_END]

Quando gerar sequências, inclua cada mensagem em seu próprio bloco de marcadores.

REGRA: Ao gerar mensagens, você DEVE gerar TANTO emails QUANTO WhatsApp (a menos que o usuário peça especificamente só um tipo).
Os marcadores são obrigatórios para que as mensagens apareçam corretamente na interface.

Sempre siga as instruções das memórias configuradas acima quando disponíveis.
Seja conversacional e objetivo.`;

      // Build messages array with conversation history
      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: systemPrompt },
      ];

      // Add conversation history
      if (conversationHistory && Array.isArray(conversationHistory)) {
        for (const msg of conversationHistory) {
          messages.push({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          });
        }
      }

      // Add current user message
      messages.push({ role: "user", content: userMessage });

      const response = await client.chat.completions.create({
        model: modelName,
        max_tokens: 4000,
        messages,
      });

      const assistantMessage = response.choices[0]?.message?.content || "";

      // Extract email and whatsapp messages if present (get ALL matches for sequences)
      let emailMessage = "";
      let whatsappMessage = "";

      // Get all email messages (flexible regex to catch variations)
      const emailMatches = Array.from(assistantMessage.matchAll(/\[EMAIL_MESSAGE_START\]([\s\S]*?)\[EMAIL_MESSAGE_END\]/gi));
      const emails = emailMatches.map(match => match[1].trim());
      if (emails.length > 0) {
        emailMessage = emails.join("\n\n---\n\n");
      }

      // Get all WhatsApp messages (flexible regex to catch variations)
      const whatsappMatches = Array.from(assistantMessage.matchAll(/\[WHATSAPP_MESSAGE_START\]([\s\S]*?)\[WHATSAPP_MESSAGE_END\]/gi));
      const whatsapps = whatsappMatches.map(match => match[1].trim());
      if (whatsapps.length > 0) {
        whatsappMessage = whatsapps.join("\n\n---\n\n");
      }

      // Log for debugging
      console.log("Message generator - email matches:", emails.length, "whatsapp matches:", whatsapps.length);

      // Clean the assistant message for display (remove the markers)
      let cleanMessage = assistantMessage
        .replace(/\[EMAIL_MESSAGE_START\][\s\S]*?\[EMAIL_MESSAGE_END\]/g, "")
        .replace(/\[WHATSAPP_MESSAGE_START\][\s\S]*?\[WHATSAPP_MESSAGE_END\]/g, "")
        .trim();

      if (!cleanMessage) {
        cleanMessage = "Mensagem gerada com sucesso! Confira ao lado.";
      }

      res.json({
        message: cleanMessage,
        emailMessage,
        whatsappMessage,
      });
    } catch (error: any) {
      console.error("Generate messages chat error:", error);

      if (error.status === 402 || error.message?.includes("Insufficient Balance")) {
        return res.status(402).json({
          error: "Saldo insuficiente na conta de IA. Adicione créditos na sua conta DeepSeek ou OpenAI.",
          needsCredits: true,
        });
      }
      if (error.status === 401 || error.message?.includes("Unauthorized")) {
        return res.status(401).json({
          error: "Chave de API inválida. Verifique sua chave nas Configurações.",
          needsConfig: true,
        });
      }

      res.status(500).json({ error: "Erro ao gerar mensagens: " + error.message });
    }
  });

  // ============ AI Chat History Endpoints ============

  // Get all chats for current user
  app.get("/api/ai/chats", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const chats = await storage.getAiChatsByOwner(admin.id);
      res.json(chats);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get a specific chat
  app.get("/api/ai/chats/:chatId", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const chat = await storage.getAiChatById(req.params.chatId);
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      if (chat.ownerId !== admin.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(chat);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create a new chat
  app.post("/api/ai/chats", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const { title, webinarId, messages, generatedScript } = req.body;

      const chat = await storage.createAiChat({
        ownerId: admin.id,
        title: title || "Nova conversa",
        webinarId: webinarId || null,
        messages: messages || "[]",
        generatedScript: generatedScript || "",
      });

      res.json(chat);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update a chat (title, messages, generatedScript)
  app.patch("/api/ai/chats/:chatId", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const chat = await storage.getAiChatById(req.params.chatId);
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      if (chat.ownerId !== admin.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { title, messages, generatedScript, webinarId } = req.body;
      const updated = await storage.updateAiChat(req.params.chatId, {
        ...(title !== undefined && { title }),
        ...(messages !== undefined && { messages }),
        ...(generatedScript !== undefined && { generatedScript }),
        ...(webinarId !== undefined && { webinarId }),
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete a chat
  app.delete("/api/ai/chats/:chatId", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const chat = await storage.getAiChatById(req.params.chatId);
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      if (chat.ownerId !== admin.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteAiChat(req.params.chatId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ AI Message Chat History Endpoints ============

  // Get all message chats for current user
  app.get("/api/ai/message-chats", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const chats = await storage.getAiMessageChatsByOwner(admin.id);
      res.json(chats);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get a specific message chat
  app.get("/api/ai/message-chats/:chatId", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const chat = await storage.getAiMessageChatById(req.params.chatId);
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      if (chat.ownerId !== admin.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(chat);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create a new message chat
  app.post("/api/ai/message-chats", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const { title, webinarId, scriptId, messages, generatedEmail, generatedWhatsapp } = req.body;

      const chat = await storage.createAiMessageChat({
        ownerId: admin.id,
        title: title || "Nova conversa",
        webinarId: webinarId || null,
        scriptId: scriptId || null,
        messages: messages || "[]",
        generatedEmail: generatedEmail || "",
        generatedWhatsapp: generatedWhatsapp || "",
      });

      res.json(chat);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update a message chat
  app.patch("/api/ai/message-chats/:chatId", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const chat = await storage.getAiMessageChatById(req.params.chatId);
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      if (chat.ownerId !== admin.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { title, messages, generatedEmail, generatedWhatsapp, webinarId, scriptId } = req.body;
      const updated = await storage.updateAiMessageChat(req.params.chatId, {
        ...(title !== undefined && { title }),
        ...(messages !== undefined && { messages }),
        ...(generatedEmail !== undefined && { generatedEmail }),
        ...(generatedWhatsapp !== undefined && { generatedWhatsapp }),
        ...(webinarId !== undefined && { webinarId }),
        ...(scriptId !== undefined && { scriptId }),
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete a message chat
  app.delete("/api/ai/message-chats/:chatId", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Admin not found" });
      }

      const chat = await storage.getAiMessageChatById(req.params.chatId);
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      if (chat.ownerId !== admin.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteAiMessageChat(req.params.chatId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ AI Config Endpoints (Super Admin Only) ============
  
  // Get all AI configs (both script and message generators)
  app.get("/api/ai/config", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get all active configs (script + message)
      const configs = await storage.getAllAiConfigs();
      const activeConfigs = configs.filter(c => c.isActive);
      
      if (activeConfigs.length === 0) {
        return res.status(404).json({ error: "No AI config found" });
      }

      // Get memories for all configs
      let allMemories: any[] = [];
      for (const config of activeConfigs) {
        const memories = await storage.getAiMemoriesByConfig(config.id);
        allMemories = allMemories.concat(memories);
      }

      res.json({ configs: activeConfigs, memories: allMemories });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update AI config (super admin only)
  app.patch("/api/ai/config/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Check if super admin
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas super admin pode editar configurações de IA" });
      }

      const { title, systemPrompt } = req.body;
      const updated = await storage.updateAiConfig(req.params.id, { title, systemPrompt });
      
      if (!updated) {
        return res.status(404).json({ error: "Config not found" });
      }

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Add memory to AI config (super admin only)
  app.post("/api/ai/config/:configId/memories", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas super admin pode adicionar memórias" });
      }

      const { label, content, sourceType, generatorType } = req.body;
      if (!label?.trim() || !content?.trim()) {
        return res.status(400).json({ error: "Label and content are required" });
      }

      const memory = await storage.createAiMemory({
        configId: req.params.configId,
        label: label.trim(),
        content: content.trim(),
        sourceType: sourceType || "text",
        generatorType: generatorType || "script",
      });

      res.json(memory);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete memory (super admin only)
  app.delete("/api/ai/memories/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas super admin pode deletar memórias" });
      }

      await storage.deleteAiMemory(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Generate embed code for a webinar
  // Suporta parâmetro base_url para definir o domínio manualmente
  // Suporta parâmetro type: "full" (página completa) ou "compact" (só transmissão)
  // Exemplo: /api/webinars/default/embed-code?base_url=https://meudominio.com&type=compact
  app.get("/api/webinars/:slug/embed-code", async (req, res) => {
    try {
      const webinar = await storage.getWebinarBySlug(req.params.slug);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }
      
      // Usar helper que suporta PUBLIC_BASE_URL, base_url param, e detecção automática
      const queryBaseUrl = req.query.base_url as string | undefined;
      const baseUrl = getPublicBaseUrl(req, queryBaseUrl);
      
      // Embed completo (página toda)
      const embedUrlFull = `${baseUrl}/w/${webinar.slug}?embed=1`;
      const iframeIdFull = `webinar-embed-${webinar.slug}`;
      const embedCodeFull = `<div style="width:100%;border-radius:8px;overflow:hidden;">
<iframe id="${iframeIdFull}" src="${embedUrlFull}" frameborder="0" scrolling="no" allow="autoplay; fullscreen" allowfullscreen loading="lazy" style="width:100%;height:800px;border:none;display:block;"></iframe>
</div>
<script>
(function(){
  var iframe = document.getElementById('${iframeIdFull}');
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'webinar-resize' && e.data.height) {
      iframe.style.height = e.data.height + 'px';
    }
  });
})();
</script>`;

      // Embed compacto (só transmissão com comentários e oferta)
      const embedUrlCompact = `${baseUrl}/w/${webinar.slug}?embed=1&compact=1`;
      const iframeIdCompact = `webinar-compact-${webinar.slug}`;
      const embedCodeCompact = `<div style="width:100%;max-width:900px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.15);">
<iframe id="${iframeIdCompact}" src="${embedUrlCompact}" frameborder="0" scrolling="no" allow="autoplay; fullscreen" allowfullscreen loading="lazy" style="width:100%;height:600px;border:none;display:block;"></iframe>
</div>
<script>
(function(){
  var iframe = document.getElementById('${iframeIdCompact}');
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'webinar-resize' && e.data.height) {
      iframe.style.height = e.data.height + 'px';
    }
  });
})();
</script>`;
      
      res.json({ 
        embedCode: embedCodeFull,
        embedCodeFull,
        embedCodeCompact,
        embedUrl: embedUrlFull,
        embedUrlFull,
        embedUrlCompact,
        baseUrl,
        hint: "Para gerar embed com domínio customizado, use: ?base_url=https://seudominio.com"
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Generate embed code for replay page
  // Suporta parâmetro base_url para definir o domínio manualmente
  app.get("/api/webinars/:slug/replay-embed-code", async (req, res) => {
    try {
      const webinar = await storage.getWebinarBySlug(req.params.slug);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      if (!webinar.replayEnabled) {
        return res.status(400).json({ error: "Replay não está habilitado para este webinário" });
      }
      
      // Usar helper que suporta PUBLIC_BASE_URL, base_url param, e detecção automática
      const queryBaseUrl = req.query.base_url as string | undefined;
      const baseUrl = getPublicBaseUrl(req, queryBaseUrl);
      
      // Embed do replay (página completa com vídeo, oferta e benefícios)
      const embedUrl = `${baseUrl}/w/${webinar.slug}/replay?embed=1`;
      const iframeId = `webinar-replay-${webinar.slug}`;
      const embedCode = `<div style="width:100%;border-radius:8px;overflow:hidden;">
<iframe id="${iframeId}" src="${embedUrl}" frameborder="0" scrolling="no" allow="autoplay; fullscreen" allowfullscreen loading="lazy" style="width:100%;height:900px;border:none;display:block;"></iframe>
</div>
<script>
(function(){
  var iframe = document.getElementById('${iframeId}');
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'webinar-resize' && e.data.height) {
      iframe.style.height = e.data.height + 'px';
    }
  });
})();
</script>`;
      
      res.json({ 
        embedCode,
        embedUrl,
        baseUrl,
        hint: "Para gerar embed com domínio customizado, use: ?base_url=https://seudominio.com"
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Save a lead (from in-room participation - source: room)
  app.post("/api/webinars/:id/leads", async (req, res) => {
    try {
      const { name, email, whatsapp, city, state, sessionId } = req.body;
      
      // Check if lead already exists by email or whatsapp
      let existingLead = null;
      if (email) {
        const existing = await db.select().from(leads).where(and(eq(leads.webinarId, req.params.id), eq(leads.email, email))).limit(1);
        if (existing.length > 0) existingLead = existing[0];
      }
      if (!existingLead && whatsapp) {
        const existing = await db.select().from(leads).where(and(eq(leads.webinarId, req.params.id), eq(leads.whatsapp, whatsapp))).limit(1);
        if (existing.length > 0) existingLead = existing[0];
      }
      
      if (existingLead) {
        // Update existing lead to "watched" status
        await db.update(leads).set({
          status: "watched",
          joinedAt: new Date(),
          sessionId: sessionId || existingLead.sessionId,
          name: name || existingLead.name,
          city: city || existingLead.city,
          state: state || existingLead.state,
        }).where(eq(leads.id, existingLead.id));
        
        return res.json({ success: true, id: existingLead.id, updated: true });
      }
      
      // Create new lead with source: room (entered directly)
      const leadId = "lead_" + Date.now() + "_" + Math.random().toString(36).substring(7);
      
      await db.insert(leads).values({
        id: leadId,
        webinarId: req.params.id,
        name,
        email: email || null,
        whatsapp: whatsapp || null,
        city: city || null,
        state: state || null,
        sessionId: sessionId || null,
        status: "watched",
        source: "room",
        joinedAt: new Date(),
      });
      
      res.json({ success: true, id: leadId });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get lead form config for a webinar (public)
  app.get("/api/webinars/:id/lead-form-config", async (req, res) => {
    try {
      const config = await storage.getLeadFormConfigByWebinar(req.params.id);
      if (config) {
        res.json(config);
      } else {
        res.json({
          title: "Inscreva-se no Webinário",
          subtitle: "Preencha seus dados para participar",
          collectName: true,
          collectEmail: true,
          collectWhatsapp: true,
          collectCity: false,
          collectState: false,
          requireConsent: true,
          consentText: "Concordo em receber comunicações sobre este webinário",
          buttonText: "Quero Participar",
          buttonColor: "#22c55e",
          buttonTextColor: "#ffffff",
          successMessage: "Inscrição realizada com sucesso!",
          backgroundColor: "#1a1a2e",
          cardBackgroundColor: "#16213e",
          textColor: "#ffffff",
          inputBackgroundColor: "#0f0f23",
          inputBorderColor: "#374151",
          inputTextColor: "#ffffff",
          labelColor: "#9ca3af",
          showNextSession: true,
          fontFamily: "Inter, system-ui, sans-serif",
          borderRadius: "8",
        });
      }
    } catch (error: any) {
      console.error("[lead-form-config GET] Error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Save/update lead form config (admin)
  app.post("/api/webinars/:id/lead-form-config", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      console.log("[lead-form-config POST] Body:", JSON.stringify(req.body, null, 2));

      const existingConfig = await storage.getLeadFormConfigByWebinar(req.params.id);
      
      if (existingConfig) {
        await storage.updateLeadFormConfig(req.params.id, req.body);
        const updated = await storage.getLeadFormConfigByWebinar(req.params.id);
        res.json({ success: true, message: "Configuração atualizada", config: updated });
      } else {
        const created = await storage.createLeadFormConfig({
          webinarId: req.params.id,
          ...req.body,
        });
        res.json({ success: true, message: "Configuração criada", config: created });
      }
    } catch (error: any) {
      console.error("[lead-form-config POST] Error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Get registration link and embed code for lead form
  app.get("/api/webinars/:id/registration-embed", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const webinar = await storage.getWebinarById(req.params.id);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar not found" });
      }

      const baseUrl = req.query.base_url as string || `${req.protocol}://${req.get("host")}`;
      const registrationUrl = `${baseUrl}/w/${webinar.slug}/register`;
      
      const embedCode = `<iframe 
  src="${registrationUrl}?embed=true" 
  width="100%" 
  height="700" 
  frameborder="0" 
  style="border: none; max-width: 500px; margin: 0 auto; display: block;"
  allow="clipboard-write"
  title="Formulário de Inscrição - ${webinar.name}"
></iframe>`;

      res.json({
        registrationUrl,
        embedCode,
        slug: webinar.slug,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Register lead (from registration page - source: registration, triggers sequences)
  app.post("/api/webinars/:id/register", async (req, res) => {
    try {
      const { name, email, whatsapp, city, state, sessionDate: requestedSessionDate } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Nome é obrigatório" });
      }
      
      // Check if lead already exists
      let existingLead = null;
      if (email) {
        const existing = await db.select().from(leads).where(and(eq(leads.webinarId, req.params.id), eq(leads.email, email))).limit(1);
        if (existing.length > 0) existingLead = existing[0];
      }
      if (!existingLead && whatsapp) {
        const existing = await db.select().from(leads).where(and(eq(leads.webinarId, req.params.id), eq(leads.whatsapp, whatsapp))).limit(1);
        if (existing.length > 0) existingLead = existing[0];
      }
      
      if (existingLead) {
        // Already registered - just return success
        return res.json({ success: true, id: existingLead.id, message: "Você já está inscrito!" });
      }
      
      // Create new lead with source: registration
      const leadId = "lead_" + Date.now() + "_" + Math.random().toString(36).substring(7);
      
      await db.insert(leads).values({
        id: leadId,
        webinarId: req.params.id,
        name,
        email: email || null,
        whatsapp: whatsapp || null,
        city: city || null,
        state: state || null,
        status: "registered",
        source: "registration",
        sequenceTriggered: true,
      });
      
      // Get webinar info to schedule sequences
      const webinar = await storage.getWebinarById(req.params.id);
      if (webinar && webinar.ownerId) {
        // Always use server-side calculateNextSession as the authoritative source
        // The frontend sessionDate is only used as a hint for logging purposes
        const { calculateNextSession } = await import("./session-calculator");
        const nextSession = calculateNextSession({
          startHour: webinar.startHour || 18,
          startMinute: webinar.startMinute || 0,
          timezone: webinar.timezone || "America/Sao_Paulo",
          recurrence: webinar.recurrence || "daily",
          onceDate: webinar.onceDate || "",
          dayOfWeek: webinar.dayOfWeek || null,
          dayOfMonth: webinar.dayOfMonth || null,
          videoDuration: webinar.videoDuration || 3600,
        });
        
        if (!nextSession) {
          console.log(`[register] No upcoming session found for webinar ${req.params.id}, skipping sequences`);
          return res.json({ success: true, id: leadId, message: "Inscrição realizada com sucesso!" });
        }
        
        const sessionTime = nextSession.sessionTime;
        const sessionDateStr = nextSession.sessionDate;
        
        // Log if frontend hint differs from calculated session (for debugging timezone issues)
        if (requestedSessionDate) {
          const clientDate = new Date(requestedSessionDate);
          if (!isNaN(clientDate.getTime())) {
            const clientDateStr = clientDate.toISOString().split("T")[0];
            if (clientDateStr !== sessionDateStr) {
              console.log(`[register] Note: Frontend hint (${clientDateStr}) differs from calculated session (${sessionDateStr})`);
            }
          }
        }
        
        console.log(`[register] Scheduling sequences for session: ${sessionDateStr} at ${sessionTime.toISOString()}`);
        
        // Trigger email sequences if email provided
        if (email) {
          try {
            const { scheduleEmailsForLead } = await import("./email-scheduler");
            await scheduleEmailsForLead(leadId, req.params.id, webinar.ownerId, sessionTime, sessionDateStr);
            console.log(`[register] Scheduled email sequences for lead ${leadId}`);
          } catch (e) {
            console.error("[register] Error scheduling emails:", e);
          }
        }
        
        // Trigger WhatsApp sequences if whatsapp provided
        if (whatsapp) {
          try {
            const { scheduleWhatsappForLead } = await import("./whatsapp-scheduler");
            await scheduleWhatsappForLead(leadId, req.params.id, webinar.ownerId, sessionTime, sessionDateStr);
            console.log(`[register] Scheduled WhatsApp sequences for lead ${leadId}`);
          } catch (e) {
            console.error("[register] Error scheduling WhatsApp:", e);
          }
        }
      }
      
      res.json({ success: true, id: leadId, message: "Inscrição realizada com sucesso!" });
    } catch (error: any) {
      console.error("[register] Error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Get leads for a webinar
  app.get("/api/webinars/:id/leads", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const result = await db.select().from(leads).where(eq(leads.webinarId, req.params.id)).orderBy(desc(leads.capturedAt));
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete all leads for a webinar
  app.delete("/api/webinars/:id/leads", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      await db.delete(leads).where(eq(leads.webinarId, req.params.id));
      res.json({ success: true, message: "Todos os leads foram removidos" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // HLS Conversion endpoint - converts MP4 to HLS for better streaming
  app.post("/api/webinar/videos/:videoId/convert-hls", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const videoId = req.params.videoId;
      console.log(`[hls] Starting HLS conversion for: ${videoId}`);

      // Get video info
      const videoInfo = await storage.getVideoById(videoId);
      if (!videoInfo) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Check if already processing or completed
      if (videoInfo.hlsStatus === 'processing') {
        return res.json({ success: true, status: 'processing', message: 'Conversion already in progress' });
      }
      if (videoInfo.hlsStatus === 'completed' && videoInfo.hlsPlaylistUrl) {
        return res.json({ success: true, status: 'completed', hlsUrl: videoInfo.hlsPlaylistUrl });
      }

      // Update status to processing
      await storage.updateVideoHlsStatus(videoInfo.uploadedVideoId, 'processing');

      // Start background conversion (don't await - let it run in background)
      convertToHls(videoInfo.uploadedVideoId).catch((error) => {
        console.error(`[hls] Conversion failed for ${videoId}:`, error);
        storage.updateVideoHlsStatus(videoInfo.uploadedVideoId, 'failed').catch(() => {});
      });

      res.json({ success: true, status: 'processing', message: 'Conversion started' });
    } catch (error: any) {
      console.error("[hls] Error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Get HLS status for a video
  app.get("/api/webinar/videos/:videoId/hls-status", async (req, res) => {
    try {
      const videoInfo = await storage.getVideoById(req.params.videoId);
      if (!videoInfo) {
        return res.status(404).json({ error: "Video not found" });
      }

      res.json({
        status: videoInfo.hlsStatus || 'pending',
        hlsUrl: videoInfo.hlsPlaylistUrl || null,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Serve HLS playlist and segments from R2 (direct streaming, no redirect)
  app.get("/api/webinar/hls/:videoId/:filename", async (req, res) => {
    try {
      const { videoId, filename } = req.params;
      const key = `hls/${videoId}/${filename}`;
      
      // Get file content directly from R2
      const fileData = await storage.getHlsFileContent(key);
      if (!fileData) {
        return res.status(404).json({ error: "HLS file not found" });
      }

      // Set proper headers for HLS streaming
      res.setHeader('Content-Type', fileData.contentType);
      res.setHeader('Content-Length', fileData.content.length);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache segments for 1 year
      
      // Send the content directly
      res.send(fileData.content);
    } catch (error: any) {
      console.error("[hls] Error serving file:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // ========== VIEW HISTORY API ==========
  
  // Get views by period (for admin dashboard)
  app.get("/api/admin/views", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      // Parse query params - keep the dates as sent by frontend (already in correct timezone)
      const { from, to } = req.query;
      
      // Default to last 7 days if no range provided
      const now = new Date();
      let toDate: Date;
      let fromDate: Date;
      
      if (to) {
        toDate = new Date(to as string);
      } else {
        toDate = new Date();
        toDate.setHours(23, 59, 59, 999);
      }
      
      if (from) {
        fromDate = new Date(from as string);
      } else {
        fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        fromDate.setHours(0, 0, 0, 0);
      }
      
      // Don't modify incoming dates - they already have the correct time range from frontend

      const count = await storage.countViewsByOwnerAndRange(admin.id, fromDate, toDate);
      const byDay = await storage.getViewsByOwnerGroupedByDay(admin.id, fromDate, toDate);

      res.json({
        total: count,
        byDay,
        from: fromDate.toISOString(),
        to: toDate.toISOString()
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Reset views counter for all webinars of current admin
  app.post("/api/admin/reset-views", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      await storage.resetWebinarViewsByOwner(admin.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get admin stats (leads, emails, whatsapp messages)
  app.get("/api/admin/stats", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      const [leadsCount, emailsCount, whatsappCount] = await Promise.all([
        storage.countLeadsByOwner(admin.id),
        storage.countEmailsByOwner(admin.id),
        storage.countWhatsappMessagesByOwner(admin.id)
      ]);

      res.json({
        leads: leadsCount,
        emails: emailsCount,
        whatsappMessages: whatsappCount
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get videos with linked webinars
  app.get("/api/admin/videos-with-webinars", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      const videos = await storage.listVideosByOwner(admin.id);
      const webinars = await storage.listWebinarsByOwner(admin.id);

      const videosWithWebinars = videos.map(video => {
        const linkedWebinars = webinars
          .filter((w: { uploadedVideoId: string | null }) => w.uploadedVideoId === video.uploadedVideoId)
          .map((w: { id: string; name: string; slug: string }) => ({
            id: w.id,
            title: w.name,
            slug: w.slug
          }));

        return {
          id: video.id,
          uploadedVideoId: video.uploadedVideoId,
          filename: video.filename,
          title: video.title || video.filename,
          duration: video.duration,
          fileSize: video.fileSize || null,
          uploadedAt: video.uploadedAt,
          hlsStatus: video.hlsStatus || "pending",
          linkedWebinars
        };
      });

      res.json(videosWithWebinars);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get storage info for current admin
  app.get("/api/admin/storage-info", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      const videos = await storage.listVideosByOwner(admin.id);
      
      let usedBytes = 0;
      const videosWithSize: { id: string; size: number }[] = [];
      
      for (const video of videos) {
        let videoSize = video.fileSize || 0;
        
        if (!videoSize && video.uploadedVideoId) {
          const calculatedSize = await storage.getVideoFileSize(video.uploadedVideoId);
          if (calculatedSize > 0) {
            videoSize = calculatedSize;
            await storage.updateVideoFileSize(video.uploadedVideoId, calculatedSize);
          }
        }
        
        usedBytes += videoSize;
        videosWithSize.push({ id: video.uploadedVideoId, size: videoSize });
      }

      // Superadmin tem armazenamento ilimitado
      const isSuperadmin = admin.role === "superadmin";
      
      let limitGB = 5; // Padrão para usuários sem plano
      if (isSuperadmin) {
        limitGB = -1; // -1 significa ilimitado
      } else if (admin.planoId) {
        const plano = await storage.getCheckoutPlanoById(admin.planoId);
        if (plano?.storageLimit) {
          limitGB = plano.storageLimit;
        }
      }
      
      const usedGB = usedBytes / (1024 * 1024 * 1024);
      // Para superadmin (ilimitado), percentUsed é sempre 0
      const percentUsed = limitGB > 0 ? (usedGB / limitGB) * 100 : 0;

      res.json({
        usedBytes,
        usedGB,
        limitGB,
        percentUsed,
        videoCount: videos.length,
        videosWithSize,
        isUnlimited: isSuperadmin
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ========== ACCOUNT DOMAIN API ==========
  
  // Get account info by domain
  app.get("/api/account/by-domain/:domain", async (req, res) => {
    try {
      const { domain } = req.params;
      const allAdmins = await storage.getAllAdmins();
      const admin = allAdmins.find(a => a.accountDomain === domain);
      
      if (!admin) {
        return res.status(404).json({ error: "Account not found" });
      }
      
      const webinarCount = await storage.countWebinarsByOwner(admin.id);
      
      res.json({
        name: admin.name,
        landingPageTitle: admin.landingPageTitle,
        landingPageDescription: admin.landingPageDescription,
        webinarCount
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get current user's account settings
  app.get("/api/account/settings", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      res.json({
        accountDomain: admin.accountDomain,
        landingPageTitle: admin.landingPageTitle,
        landingPageDescription: admin.landingPageDescription
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update account settings
  app.patch("/api/account/settings", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      const { accountDomain, landingPageTitle, landingPageDescription } = req.body;

      // Check if domain is already taken by another user
      if (accountDomain) {
        const allAdmins = await storage.getAllAdmins();
        const domainTaken = allAdmins.find(a => a.accountDomain === accountDomain && a.id !== admin.id);
        if (domainTaken) {
          return res.status(400).json({ error: "Este domínio já está em uso" });
        }
      }

      await storage.updateAdmin(admin.id, {
        accountDomain: accountDomain || null,
        landingPageTitle: landingPageTitle || "Meus Webinários",
        landingPageDescription: landingPageDescription || ""
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================
  // CHECKOUT SYSTEM ROUTES
  // ============================================

  // Checkout - Planos (Admin - superadmin only)
  app.get("/api/checkout/planos", async (req, res) => {
    try {
      const planos = await storage.listCheckoutPlanos();
      res.json(planos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/checkout/planos/ativos", async (req, res) => {
    try {
      const { renovacao, incluirTodos } = req.query;
      let planos = await storage.listCheckoutPlanosAtivos();
      
      // By default, only show plans available for renewal (hide test/internal plans)
      // Plans with disponivelRenovacao=false are considered internal/test plans
      // Use incluirTodos=true to show all active plans (for admin purposes)
      if (incluirTodos !== 'true') {
        planos = planos.filter(p => p.disponivelRenovacao === true);
      }
      
      res.json(planos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/checkout/planos/:id", async (req, res) => {
    try {
      const plano = await storage.getCheckoutPlanoById(req.params.id);
      if (!plano) {
        return res.status(404).json({ error: "Plano não encontrado" });
      }
      res.json(plano);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/checkout/planos", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const plano = await storage.createCheckoutPlano(req.body);
      res.status(201).json(plano);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/checkout/planos/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const plano = await storage.updateCheckoutPlano(req.params.id, req.body);
      if (!plano) {
        return res.status(404).json({ error: "Plano não encontrado" });
      }
      res.json(plano);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/checkout/planos/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      await storage.deleteCheckoutPlano(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Checkout - Configurações de Gateway (superadmin only)
  app.get("/api/checkout/config", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const configs = await storage.getAllCheckoutConfigs();
      
      // Return which configs are set (not the actual values for security)
      const expectedConfigs = [
        'MERCADOPAGO_PUBLIC_KEY',
        'MERCADOPAGO_ACCESS_TOKEN',
        'MERCADOPAGO_WEBHOOK_SECRET',
        'STRIPE_PUBLIC_KEY',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'FACEBOOK_PIXEL_ID',
        'FACEBOOK_ACCESS_TOKEN',
        'GOOGLE_ADS_CONVERSION_ID'
      ];
      
      const result = expectedConfigs.map(chave => ({
        chave,
        hasValue: configs.some(c => c.chave === chave && c.hasValue)
      }));
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/checkout/config", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const { chave, valor } = req.body;
      if (!chave) {
        return res.status(400).json({ error: "Chave é obrigatória" });
      }
      
      await storage.setCheckoutConfig(chave, valor || '');
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get decrypted config value (superadmin only - for viewing saved values)
  app.get("/api/checkout/config/:chave", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const { chave } = req.params;
      const valor = await storage.getCheckoutConfig(chave);
      
      if (valor === null || valor === '') {
        return res.status(404).json({ error: "Configuração não encontrada" });
      }
      
      res.json({ chave, valor });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // WhatsApp Notifications - Status and Configuration (superadmin only)
  app.get("/api/notifications/whatsapp/status", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const { getNotificationStatus } = await import("./whatsapp-notifications");
      const status = await getNotificationStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // WhatsApp Notifications - Get available accounts for superadmin
  app.get("/api/notifications/whatsapp/accounts", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      // Get all WhatsApp accounts that belong to superadmin - filter only notification accounts
      const allAccounts = await storage.listWhatsappAccountsByAdmin(admin.id);
      const notificationAccounts = allAccounts.filter((a: any) => a.scope === "notifications");
      const { getWhatsAppStatus } = await import("./whatsapp-service");
      
      // Get status for each account with hourly limit info
      const accountsWithStatus = await Promise.all(
        notificationAccounts.map(async (acc: any) => {
          const status = await getWhatsAppStatus(acc.id);
          return {
            id: acc.id,
            adminId: acc.adminId,
            label: acc.label || acc.name,
            name: acc.name,
            status: status.status,
            phoneNumber: status.phoneNumber || acc.phoneNumber,
            hourlyLimit: acc.hourlyLimit || 10,
            messagesSentThisHour: acc.messagesSentThisHour || 0,
            priority: acc.priority ?? 0,
          };
        })
      );
      
      res.json(accountsWithStatus);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // WhatsApp Notifications - Update account settings (hourlyLimit, priority)
  app.patch("/api/notifications/whatsapp/accounts/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const { id } = req.params;
      const { hourlyLimit, priority } = req.body;
      
      const updateData: any = {};
      if (typeof hourlyLimit === "number" && hourlyLimit >= 1 && hourlyLimit <= 100) {
        updateData.hourlyLimit = hourlyLimit;
      }
      if (typeof priority === "number" && priority >= 0 && priority <= 10) {
        updateData.priority = priority;
      }
      
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "Nenhum campo válido para atualizar" });
      }

      const account = await storage.getWhatsappAccountById(id);
      if (!account || account.adminId !== admin.id) {
        return res.status(404).json({ error: "Conta não encontrada" });
      }

      const updated = await storage.updateWhatsappAccount(id, updateData);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // WhatsApp Notifications - Toggle enabled/disabled
  app.post("/api/notifications/whatsapp/toggle", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "Campo 'enabled' deve ser boolean" });
      }

      const { setWhatsAppNotificationsEnabled } = await import("./whatsapp-notifications");
      await setWhatsAppNotificationsEnabled(enabled);
      
      res.json({ success: true, enabled });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // WhatsApp Notifications - Get sent messages history
  app.get("/api/notifications/whatsapp/logs", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.listWhatsappNotificationLogs(limit);
      
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // WhatsApp Notifications - Get pending messages queue
  app.get("/api/notifications/whatsapp/queue", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const pending = await storage.getPendingWhatsappNotifications();
      
      res.json(pending);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // WhatsApp Notifications - Cancel all pending messages
  app.delete("/api/notifications/whatsapp/queue", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const cancelledCount = await storage.cancelPendingWhatsappNotifications();
      
      res.json({ success: true, cancelledCount });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // WhatsApp Notification Templates - List all templates
  app.get("/api/notifications/whatsapp/templates", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const templates = await storage.listWhatsappNotificationTemplates();
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // WhatsApp Notification Templates - Update a template
  app.patch("/api/notifications/whatsapp/templates/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const { id } = req.params;
      const { messageTemplate, isActive } = req.body;

      const updated = await storage.updateWhatsappNotificationTemplate(id, {
        messageTemplate,
        isActive,
      });

      if (!updated) {
        return res.status(404).json({ error: "Template não encontrado" });
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // EMAIL NOTIFICATION TEMPLATES (SUPERADMIN)
  // ============================================

  // Email Notification Templates - List all templates
  app.get("/api/notifications/email/templates", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const templates = await storage.listEmailNotificationTemplates();
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Email Notification Templates - Update a template
  app.patch("/api/notifications/email/templates/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const { id } = req.params;
      const { subject, htmlTemplate, textTemplate, isActive } = req.body;

      // Validate that at least one field is provided
      const updateData: Record<string, any> = {};
      if (typeof subject === 'string' && subject.trim()) updateData.subject = subject.trim();
      if (typeof htmlTemplate === 'string' && htmlTemplate.trim()) updateData.htmlTemplate = htmlTemplate.trim();
      if (typeof textTemplate === 'string') updateData.textTemplate = textTemplate.trim();
      if (typeof isActive === 'boolean') updateData.isActive = isActive;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "Nenhum campo válido para atualizar" });
      }

      const updated = await storage.updateEmailNotificationTemplate(id, updateData);

      if (!updated) {
        return res.status(404).json({ error: "Template não encontrado" });
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Email Notifications - Status and Configuration (superadmin only)
  app.get("/api/notifications/email/status", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const { isEmailServiceAvailable, getPendingEmailCount } = await import("./email");
      const hasResendKey = !!(process.env.RESEND_API_KEY || process.env.REPLIT_CONNECTORS_HOSTNAME);
      
      res.json({
        enabled: hasResendKey,
        configured: isEmailServiceAvailable(),
        pendingRetries: getPendingEmailCount(),
        configIssues: !hasResendKey ? ["RESEND_API_KEY não configurada"] : [],
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Email Notifications - Get sent messages history (superadmin only)
  app.get("/api/notifications/email/logs", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.listEmailNotificationLogs(limit);
      
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Combined Notifications Diagnostics - Overview of all notification systems (superadmin only)
  app.get("/api/notifications/diagnostics", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const { getNotificationStatus } = await import("./whatsapp-notifications");
      const { isEmailServiceAvailable, getPendingEmailCount } = await import("./email");
      
      const whatsappStatus = await getNotificationStatus();
      const hasResendKey = !!(process.env.RESEND_API_KEY || process.env.REPLIT_CONNECTORS_HOSTNAME);
      
      const configIssues: string[] = [];
      
      if (!hasResendKey) {
        configIssues.push("Email: RESEND_API_KEY não configurada");
      }
      
      if (!whatsappStatus.enabled) {
        configIssues.push("WhatsApp: Notificações desabilitadas");
      } else if (whatsappStatus.accounts === 0) {
        configIssues.push("WhatsApp: Nenhuma conta conectada");
      } else if (whatsappStatus.connectedAccounts === 0) {
        configIssues.push("WhatsApp: Nenhuma conta online");
      }
      
      const recentEmailLogs = await storage.listEmailNotificationLogs(20);
      const recentWhatsappLogs = await storage.listWhatsappNotificationLogs(20);
      
      const emailStats = {
        sent: recentEmailLogs.filter((l: any) => l.status === 'sent').length,
        failed: recentEmailLogs.filter((l: any) => l.status === 'failed').length,
        pending: recentEmailLogs.filter((l: any) => l.status === 'pending').length,
      };
      
      const whatsappStats = {
        sent: recentWhatsappLogs.filter((l: any) => l.status === 'sent').length,
        failed: recentWhatsappLogs.filter((l: any) => l.status === 'failed').length,
        pending: recentWhatsappLogs.filter((l: any) => l.status === 'pending').length,
      };
      
      res.json({
        email: {
          configured: isEmailServiceAvailable(),
          pendingRetries: getPendingEmailCount(),
          recentStats: emailStats,
        },
        whatsapp: {
          enabled: whatsappStatus.enabled,
          accounts: whatsappStatus.accounts,
          connectedAccounts: whatsappStatus.connectedAccounts,
          pendingMessages: whatsappStatus.pendingMessages,
          recentStats: whatsappStats,
        },
        configIssues,
        overallHealth: configIssues.length === 0 ? "healthy" : "degraded",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get public key for frontend (public route)
  app.get("/api/checkout/public-key/:gateway", async (req, res) => {
    try {
      const { gateway } = req.params;
      let publicKey = '';
      
      if (gateway === 'mercadopago') {
        publicKey = await storage.getCheckoutConfig('MERCADOPAGO_PUBLIC_KEY') || '';
      } else if (gateway === 'stripe') {
        publicKey = await storage.getCheckoutConfig('STRIPE_PUBLIC_KEY') || '';
      }
      
      if (!publicKey) {
        return res.status(404).json({ error: `Chave pública do ${gateway} não configurada` });
      }
      
      res.json({ publicKey });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get public configs for checkout (public route - includes gateway public keys)
  app.get("/api/checkout/public-config", async (req, res) => {
    try {
      const pixelId = await storage.getCheckoutConfig('FACEBOOK_PIXEL_ID') || '';
      const googleAdsId = await storage.getCheckoutConfig('GOOGLE_ADS_CONVERSION_ID') || '';
      const mercadopagoPublicKey = await storage.getCheckoutConfig('MERCADOPAGO_PUBLIC_KEY') || '';
      const stripePublicKey = await storage.getCheckoutConfig('STRIPE_PUBLIC_KEY') || '';
      
      res.json({
        FACEBOOK_PIXEL_ID: pixelId,
        GOOGLE_ADS_CONVERSION_ID: googleAdsId,
        mercadopagoPublicKey,
        stripePublicKey,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Track pixel event server-side (for Conversions API)
  app.post("/api/pixel/track", async (req, res) => {
    try {
      const { eventName, params, affiliateCode, userData } = req.body;
      
      // Get client info for deduplication
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const eventId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Helper function to SHA-256 hash values as required by Meta Conversions API
      const hashValue = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

      // Build user_data with advanced matching (SHA-256 hashed as required by Meta)
      const userDataPayload: Record<string, any> = {
        client_ip_address: clientIp,
        client_user_agent: userAgent,
      };
      if (userData?.email) userDataPayload.em = [hashValue(userData.email.toLowerCase().trim())];
      if (userData?.phone) userDataPayload.ph = [hashValue(userData.phone.replace(/\D/g, ''))];
      if (userData?.name) {
        const nameParts = userData.name.trim().split(' ');
        if (nameParts[0]) userDataPayload.fn = [hashValue(nameParts[0].toLowerCase())];
        if (nameParts.length > 1) userDataPayload.ln = [hashValue(nameParts[nameParts.length - 1].toLowerCase())];
      }

      const results: { global?: any; affiliate?: any } = {};

      // Send to global pixel if configured
      const globalPixelId = await storage.getCheckoutConfig('FACEBOOK_PIXEL_ID');
      const globalAccessToken = await storage.getCheckoutConfig('FACEBOOK_ACCESS_TOKEN');
      
      if (globalPixelId && globalAccessToken) {
        const eventData = {
          data: [{
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: eventId,
            action_source: "website",
            user_data: userDataPayload,
            custom_data: params || {},
          }],
        };

        const response = await fetch(
          `https://graph.facebook.com/v18.0/${globalPixelId}/events?access_token=${globalAccessToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(eventData),
          }
        );
        results.global = await response.json();
        console.log("[Pixel API] Global event sent:", eventName, results.global);
      }

      // Send to affiliate pixel if configured
      if (affiliateCode) {
        const link = await storage.getAffiliateLinkByCode(affiliateCode);
        if (link) {
          const affiliate = await storage.getAffiliateById(link.affiliateId);
          if (affiliate?.metaPixelId && affiliate?.metaAccessToken && affiliate.status === "active") {
            const affiliateEventData = {
              data: [{
                event_name: eventName,
                event_time: Math.floor(Date.now() / 1000),
                event_id: `${eventId}_aff`,
                action_source: "website",
                user_data: userDataPayload,
                custom_data: params || {},
              }],
            };

            const affiliateResponse = await fetch(
              `https://graph.facebook.com/v18.0/${affiliate.metaPixelId}/events?access_token=${affiliate.metaAccessToken}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(affiliateEventData),
              }
            );
            results.affiliate = await affiliateResponse.json();
            console.log("[Pixel API] Affiliate event sent:", eventName, results.affiliate);
          }
        }
      }
      
      res.json({ success: true, eventId, results });
    } catch (error: any) {
      console.error("[Pixel API] Error:", error);
      res.json({ success: false, error: error.message });
    }
  });

  // Checkout - Iniciar pagamento (público)
  app.post("/api/checkout/iniciar/:planoId", async (req, res) => {
    try {
      const { planoId } = req.params;
      const { nome, email, cpf, documento, tipoDocumento, telefone, affiliateRef } = req.body;

      if (!nome || !email) {
        return res.status(400).json({ error: "Nome e email são obrigatórios" });
      }

      const plano = await storage.getCheckoutPlanoById(planoId);
      if (!plano || !plano.ativo) {
        return res.status(404).json({ error: "Plano não encontrado ou inativo" });
      }

      // Support both legacy cpf field and new documento/tipoDocumento fields
      const documentoValue = documento || cpf || null;
      
      // Get affiliate ref from cookie, body, or query
      const affiliateLinkCode = affiliateRef || req.cookies?.affiliate_ref || (req.query.ref as string) || null;
      
      if (affiliateLinkCode) {
        console.log(`[Affiliate] Checkout initiated with affiliate code: ${affiliateLinkCode}`);
      }

      // Create payment record
      const pagamento = await storage.createCheckoutPagamento({
        email,
        nome,
        cpf: documentoValue,
        telefone: telefone || null,
        planoId,
        valor: plano.preco,
        status: 'checkout_iniciado',
        affiliateLinkCode,
      });

      // For Stripe, create Payment Intent or Subscription automatically for transparent checkout
      let clientSecret = null;
      let subscriptionId = null;
      let mpInitPoint = null;
      
      if (plano.gateway === 'stripe' || plano.gateway === 'hibrido') {
        const stripeSecretKey = await storage.getCheckoutConfig('STRIPE_SECRET_KEY');
        if (stripeSecretKey) {
          try {
            // Check if recurring subscription
            if (plano.tipoCobranca === 'recorrente') {
              // Create or get customer
              let customerId: string;
              
              const searchParams = new URLSearchParams({
                'query': `email:"${email}"`,
              });
              
              const searchResponse = await fetch(`https://api.stripe.com/v1/customers/search?${searchParams}`, {
                headers: { 'Authorization': `Bearer ${stripeSecretKey}` },
              });
              
              const searchData = await searchResponse.json();
              
              if (searchData.data && searchData.data.length > 0) {
                customerId = searchData.data[0].id;
              } else {
                const customerParams = new URLSearchParams({
                  'email': email,
                  'name': nome,
                  'metadata[pagamentoId]': pagamento.id,
                });
                
                const customerResponse = await fetch('https://api.stripe.com/v1/customers', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${stripeSecretKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: customerParams.toString(),
                });
                
                const customerData = await customerResponse.json();
                customerId = customerData.id;
              }

              // Calculate interval
              const interval = plano.frequenciaTipo === 'days' ? 'day' : 
                              plano.frequenciaTipo === 'years' ? 'year' : 'month';
              const intervalCount = plano.frequencia || 1;

              // Create price
              const priceParams = new URLSearchParams({
                'unit_amount': plano.preco.toString(),
                'currency': 'brl',
                'recurring[interval]': interval,
                'recurring[interval_count]': intervalCount.toString(),
                'product_data[name]': plano.nome,
                'metadata[planoId]': plano.id,
              });

              const priceResponse = await fetch('https://api.stripe.com/v1/prices', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${stripeSecretKey}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: priceParams.toString(),
              });

              const priceData = await priceResponse.json();

              // Create subscription
              const subscriptionParams = new URLSearchParams({
                'customer': customerId,
                'items[0][price]': priceData.id,
                'payment_behavior': 'default_incomplete',
                'payment_settings[save_default_payment_method]': 'on_subscription',
                'expand[0]': 'latest_invoice.payment_intent',
                'metadata[pagamentoId]': pagamento.id,
                'metadata[planoId]': plano.id,
              });

              const subscriptionResponse = await fetch('https://api.stripe.com/v1/subscriptions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${stripeSecretKey}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: subscriptionParams.toString(),
              });

              const subscriptionData = await subscriptionResponse.json();
              clientSecret = subscriptionData.latest_invoice?.payment_intent?.client_secret;
              subscriptionId = subscriptionData.id;
              
              // Get the PaymentIntent ID from the latest invoice and update its metadata
              const paymentIntentId = subscriptionData.latest_invoice?.payment_intent?.id;
              if (paymentIntentId) {
                // Update PaymentIntent with pagamentoId metadata so webhook can find it
                const piUpdateParams = new URLSearchParams({
                  'metadata[pagamentoId]': pagamento.id,
                  'metadata[planoId]': plano.id,
                });
                
                await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${stripeSecretKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: piUpdateParams.toString(),
                });
                console.log('[Checkout] Updated PaymentIntent metadata:', paymentIntentId);
              }

              await storage.updateCheckoutPagamento(pagamento.id, {
                stripePaymentIntentId: paymentIntentId || subscriptionData.id,
                stripeSubscriptionId: subscriptionData.id,
                stripeCustomerId: customerId,
              });

              console.log('[Checkout] Created Stripe subscription:', subscriptionData.id);
            } else {
              // One-time payment - create Payment Intent
              // Note: Split payment is handled AFTER payment approval by the affiliate payout scheduler (7 days delay)
              const params = new URLSearchParams({
                'amount': plano.preco.toString(),
                'currency': 'brl',
                'automatic_payment_methods[enabled]': 'true',
                'metadata[pagamentoId]': pagamento.id,
                'metadata[planoId]': plano.id,
                'receipt_email': email,
                'description': `${plano.nome} - ${plano.webinarLimit} webinars`,
              });

              const stripeResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${stripeSecretKey}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
              });

              if (stripeResponse.ok) {
                const stripeData = await stripeResponse.json();
                clientSecret = stripeData.client_secret;
                await storage.updateCheckoutPagamento(pagamento.id, {
                  stripePaymentIntentId: stripeData.id,
                });
              }
            }
          } catch (err) {
            console.error('[Checkout] Error creating Stripe payment:', err);
          }
        }
      }

      // For Mercado Pago recurring subscriptions, create Pre Approval link
      if (plano.gateway === 'mercadopago' && plano.tipoCobranca === 'recorrente') {
        const accessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
        if (accessToken) {
          try {
            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers['x-forwarded-host'] || req.headers.host;
            const baseUrl = `${protocol}://${host}`;

            const frequencyType = plano.frequenciaTipo === 'days' ? 'days' : 
                                  plano.frequenciaTipo === 'years' ? 'months' : 'months';
            const frequencyValue = plano.frequenciaTipo === 'years' ? 
                                  (plano.frequencia || 1) * 12 : (plano.frequencia || 1);

            const preapproval = {
              reason: plano.nome,
              external_reference: pagamento.id,
              payer_email: email,
              auto_recurring: {
                frequency: frequencyValue,
                frequency_type: frequencyType,
                transaction_amount: plano.preco / 100,
                currency_id: 'BRL',
              },
              back_url: `${baseUrl}/pagamento/sucesso?id=${pagamento.id}&tipo=assinatura`,
              notification_url: `${baseUrl}/webhook/mercadopago`,
            };

            const mpResponse = await fetch('https://api.mercadopago.com/preapproval', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(preapproval),
            });

            if (mpResponse.ok) {
              const mpData = await mpResponse.json();
              mpInitPoint = mpData.init_point;
              await storage.updateCheckoutPagamento(pagamento.id, {
                mercadopagoPaymentId: mpData.id,
              });
              console.log('[Checkout] Created MP subscription:', mpData.id);
            }
          } catch (err) {
            console.error('[Checkout] Error creating MP subscription:', err);
          }
        }
      }

      res.json({ 
        pagamentoId: pagamento.id, 
        plano,
        gateway: plano.gateway,
        clientSecret,
        subscriptionId,
        mpInitPoint,
        isRecurring: plano.tipoCobranca === 'recorrente',
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Checkout - Criar preferência Mercado Pago (pagamento único ou assinatura)
  app.post("/api/checkout/mercadopago/criar-preferencia", async (req, res) => {
    try {
      const { pagamentoId } = req.body;
      
      const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
      if (!pagamento) {
        return res.status(404).json({ error: "Pagamento não encontrado" });
      }

      const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
      if (!plano) {
        return res.status(404).json({ error: "Plano não encontrado" });
      }

      const accessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
      if (!accessToken) {
        return res.status(500).json({ error: "Mercado Pago não configurado" });
      }

      // Get base URL for webhooks
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      // Check if recurring subscription
      if (plano.tipoCobranca === 'recorrente') {
        // Create Pre Approval (subscription) for recurring payments
        const frequencyType = plano.frequenciaTipo === 'days' ? 'days' : 
                              plano.frequenciaTipo === 'years' ? 'months' : 'months';
        const frequencyValue = plano.frequenciaTipo === 'years' ? 
                              (plano.frequencia || 1) * 12 : (plano.frequencia || 1);

        const preapproval = {
          reason: plano.nome,
          external_reference: pagamentoId,
          payer_email: pagamento.email,
          auto_recurring: {
            frequency: frequencyValue,
            frequency_type: frequencyType,
            transaction_amount: plano.preco / 100,
            currency_id: 'BRL',
          },
          back_url: `${baseUrl}/pagamento/sucesso?id=${pagamentoId}&tipo=assinatura`,
          notification_url: `${baseUrl}/webhook/mercadopago`,
        };

        console.log('[MP] Creating preapproval (subscription):', JSON.stringify(preapproval, null, 2));

        const mpResponse = await fetch('https://api.mercadopago.com/preapproval', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(preapproval),
        });

        if (!mpResponse.ok) {
          const error = await mpResponse.text();
          console.error('[MP] Error creating preapproval:', error);
          return res.status(500).json({ error: 'Erro ao criar assinatura' });
        }

        const mpData = await mpResponse.json();
        
        // Update payment with subscription ID
        await storage.updateCheckoutPagamento(pagamentoId, {
          mercadopagoPaymentId: mpData.id,
        });

        return res.json({
          type: 'subscription',
          preapprovalId: mpData.id,
          initPoint: mpData.init_point,
          sandboxInitPoint: mpData.sandbox_init_point,
        });
      }

      // Create preference for one-time payment
      const preference = {
        items: [{
          title: plano.nome,
          description: plano.descricao || plano.nome,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: plano.preco / 100,
        }],
        payer: {
          name: pagamento.nome,
          email: pagamento.email,
        },
        back_urls: {
          success: `${baseUrl}/pagamento/sucesso?id=${pagamentoId}`,
          pending: `${baseUrl}/pagamento/pendente?id=${pagamentoId}`,
          failure: `${baseUrl}/pagamento/erro?id=${pagamentoId}`,
        },
        auto_return: 'approved',
        external_reference: pagamentoId,
        notification_url: `${baseUrl}/webhook/mercadopago`,
      };

      const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preference),
      });

      if (!mpResponse.ok) {
        const error = await mpResponse.text();
        console.error('[MP] Error creating preference:', error);
        return res.status(500).json({ error: 'Erro ao criar preferência' });
      }

      const mpData = await mpResponse.json();
      res.json({
        type: 'payment',
        preferenceId: mpData.id,
        initPoint: mpData.init_point,
        sandboxInitPoint: mpData.sandbox_init_point,
      });
    } catch (error: any) {
      console.error('[MP] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Checkout - Processar pagamento Mercado Pago (Payment Brick - transparente)
  app.post("/api/checkout/mercadopago/processar", async (req, res) => {
    try {
      const { pagamentoId, paymentData } = req.body;
      
      const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
      if (!pagamento) {
        return res.status(404).json({ error: "Pagamento não encontrado" });
      }

      const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
      if (!plano) {
        return res.status(404).json({ error: "Plano não encontrado" });
      }

      const accessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
      if (!accessToken) {
        return res.status(500).json({ error: "Mercado Pago não configurado" });
      }

      // Get base URL for webhooks
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      // Prepare payment request for MercadoPago API
      // Note: Split payment is handled AFTER payment approval by the affiliate payout scheduler (7 days delay)
      // Added 3D Secure and additional_info to reduce cc_rejected_high_risk rejections
      const payerFirstName = pagamento.nome.split(' ')[0];
      const payerLastName = pagamento.nome.split(' ').slice(1).join(' ') || payerFirstName;
      const payerPhone = (pagamento.telefone || '').replace(/\D/g, '');
      const payerCpf = (pagamento.cpf || '').replace(/\D/g, '');
      
      const paymentRequest: any = {
        transaction_amount: plano.preco / 100,
        description: plano.nome,
        payment_method_id: paymentData.payment_method_id,
        payer: {
          email: pagamento.email,
          first_name: payerFirstName,
          last_name: payerLastName,
          identification: paymentData.payer?.identification || {
            type: payerCpf.length > 11 ? 'CNPJ' : 'CPF',
            number: payerCpf,
          },
          ...(payerPhone && {
            phone: {
              area_code: payerPhone.slice(0, 2),
              number: payerPhone.slice(2),
            },
          }),
        },
        external_reference: pagamentoId,
        notification_url: `${baseUrl}/webhook/mercadopago`,
        statement_descriptor: 'AutoWebinar',
        // Enable 3D Secure to improve approval rates and reduce fraud rejections
        three_d_secure_mode: 'optional',
        // Additional info helps MercadoPago anti-fraud system
        additional_info: {
          items: [{
            id: plano.id,
            title: plano.nome,
            description: plano.descricao || plano.nome,
            category_id: 'services',
            quantity: 1,
            unit_price: plano.preco / 100,
          }],
          payer: {
            first_name: payerFirstName,
            last_name: payerLastName,
            ...(payerPhone && {
              phone: {
                area_code: payerPhone.slice(0, 2),
                number: payerPhone.slice(2),
              },
            }),
            registration_date: new Date().toISOString().split('T')[0],
          },
        },
        ...(paymentData.token && { token: paymentData.token }),
        ...(paymentData.issuer_id && { issuer_id: paymentData.issuer_id }),
        ...(paymentData.installments && { installments: paymentData.installments }),
      };

      console.log('[MP Payment] Creating payment:', JSON.stringify(paymentRequest, null, 2));

      const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `${pagamentoId}-${Date.now()}`,
        },
        body: JSON.stringify(paymentRequest),
      });

      const mpData = await mpResponse.json();
      console.log('[MP Payment] Response:', JSON.stringify(mpData, null, 2));

      // Handle API errors (non-200 responses)
      if (!mpResponse.ok) {
        const errorInfo = getMercadoPagoErrorMessage(mpData.cause?.[0]?.code || mpData.message);
        
        logPaymentError({
          gateway: 'mercadopago',
          pagamentoId,
          email: pagamento.email,
          valor: plano.preco,
          metodo: paymentData.payment_method_id || 'unknown',
          errorCode: mpData.cause?.[0]?.code || 'api_error',
          errorMessage: mpData.message || 'API Error',
          gatewayResponse: mpData,
        });

        // Atualizar registro com informações do erro
        await storage.updateCheckoutPagamento(pagamentoId, {
          status: 'rejected',
          statusDetail: mpData.message,
          gatewayErrorCode: mpData.cause?.[0]?.code || 'api_error',
          gatewayErrorMessage: mpData.message,
          userFriendlyError: `${errorInfo.message} ${errorInfo.action}`,
          failureAttempts: (pagamento.failureAttempts || 0) + 1,
          lastFailureAt: new Date(),
        });

        // Send payment rejected email
        import("./email").then(({ sendPaymentFailedEmail }) => {
          sendPaymentFailedEmail(
            pagamento.email,
            pagamento.nome,
            plano.nome,
            `${errorInfo.message} ${errorInfo.action}`,
            pagamento.planoId
          ).catch(err => {
            console.error(`[MP Payment] Error sending payment rejected email:`, err);
          });
        });

        return res.status(400).json({ 
          error: errorInfo.message,
          action: errorInfo.action,
          retryable: errorInfo.retryable,
          errorCode: mpData.cause?.[0]?.code,
        });
      }

      // Update payment record
      const updateData: any = {
        status: mpData.status,
        statusDetail: mpData.status_detail,
        metodoPagamento: mpData.payment_method_id || mpData.payment_type_id,
        mercadopagoPaymentId: mpData.id?.toString(),
        dataPagamento: new Date(),
      };

      // Handle rejected payments (status = rejected but HTTP 200)
      if (mpData.status === 'rejected') {
        const errorInfo = getMercadoPagoErrorMessage(mpData.status_detail);
        
        logPaymentError({
          gateway: 'mercadopago',
          pagamentoId,
          email: pagamento.email,
          valor: plano.preco,
          metodo: mpData.payment_method_id || paymentData.payment_method_id,
          errorCode: mpData.status_detail || 'rejected',
          errorMessage: errorInfo.message,
          gatewayResponse: mpData,
        });

        updateData.gatewayErrorCode = mpData.status_detail;
        updateData.gatewayErrorMessage = errorInfo.message;
        updateData.userFriendlyError = `${errorInfo.message} ${errorInfo.action}`;
        updateData.failureAttempts = (pagamento.failureAttempts || 0) + 1;
        updateData.lastFailureAt = new Date();

        await storage.updateCheckoutPagamento(pagamentoId, updateData);

        // Send payment rejected email
        import("./email").then(({ sendPaymentFailedEmail }) => {
          sendPaymentFailedEmail(
            pagamento.email,
            pagamento.nome,
            plano.nome,
            `${errorInfo.message} ${errorInfo.action}`,
            pagamento.planoId
          ).catch(err => {
            console.error(`[MP Payment] Error sending payment rejected email:`, err);
          });
        });

        return res.json({
          status: 'rejected',
          statusDetail: mpData.status_detail,
          paymentId: mpData.id,
          error: errorInfo.message,
          action: errorInfo.action,
          retryable: errorInfo.retryable,
        });
      }

      // Handle PIX QR Code
      if (mpData.point_of_interaction?.transaction_data) {
        updateData.pixQrCode = mpData.point_of_interaction.transaction_data.qr_code_base64;
        updateData.pixCopiaCola = mpData.point_of_interaction.transaction_data.qr_code;
      }

      // Handle Boleto
      if (mpData.transaction_details?.external_resource_url) {
        updateData.boletoUrl = mpData.transaction_details.external_resource_url;
        updateData.boletoCodigo = mpData.transaction_details.barcode?.content;
      }

      // If approved, create/update admin account
      if (mpData.status === 'approved') {
        updateData.dataAprovacao = new Date();
        
        // Log payment success
        logPaymentSuccess({
          gateway: 'mercadopago',
          pagamentoId,
          email: pagamento.email,
          valor: plano.preco,
          metodo: mpData.payment_method_id || paymentData.payment_method_id,
          externalId: mpData.id?.toString(),
        });
        
        // Calculate expiration date based on plan type
        const expirationDate = new Date();
        if (plano.tipoCobranca === 'recorrente') {
          const freq = plano.frequencia || 1;
          const freqTipo = plano.frequenciaTipo || 'months';
          
          if (freqTipo === 'days') {
            expirationDate.setDate(expirationDate.getDate() + freq);
          } else if (freqTipo === 'weeks') {
            expirationDate.setDate(expirationDate.getDate() + (freq * 7));
          } else if (freqTipo === 'months') {
            expirationDate.setMonth(expirationDate.getMonth() + freq);
          } else if (freqTipo === 'years') {
            expirationDate.setFullYear(expirationDate.getFullYear() + freq);
          }
        } else {
          expirationDate.setDate(expirationDate.getDate() + (plano.prazoDias || 30));
        }
        updateData.dataExpiracao = expirationDate;

        // Check if admin exists
        let admin = await storage.getAdminByEmail(pagamento.email);
        
        if (admin) {
          // Update existing admin
          await storage.updateAdmin(admin.id, {
            accessExpiresAt: expirationDate,
            webinarLimit: plano.webinarLimit,
            uploadLimit: plano.uploadLimit || plano.webinarLimit,
            isActive: true,
            planoId: plano.id,
            paymentStatus: 'ok',
            paymentFailedReason: null,
          });
          updateData.adminId = admin.id;
          
          // Send payment confirmation email for existing users (safe - never throws)
          sendPaymentConfirmedEmailSafe(pagamento.email, pagamento.nome, plano.nome, expirationDate);
        } else {
          // Create new admin with temporary password
          const tempPassword = generateTempPassword();
          const bcrypt = await import('bcryptjs');
          const hashedPassword = await bcrypt.hash(tempPassword, 10);
          
          admin = await storage.createAdmin({
            name: pagamento.nome,
            email: pagamento.email,
            password: hashedPassword,
            telefone: pagamento.telefone,
            role: 'user',
            webinarLimit: plano.webinarLimit,
            uploadLimit: plano.uploadLimit || plano.webinarLimit,
            isActive: true,
            accessExpiresAt: expirationDate,
            planoId: plano.id,
          });
          updateData.adminId = admin.id;
          
          console.log(`[MP Payment] Created admin: ${pagamento.email}, temp password: ${tempPassword}`);
          
          // Send access credentials email for new users (safe - never throws)
          sendAccessCredentialsEmailSafe(pagamento.email, pagamento.nome, tempPassword, plano.nome);
        }
        
        // Process affiliate sale if applicable (with scheduled payout)
        await processAffiliateSale(pagamento, plano, 'mercadopago');
      }

      await storage.updateCheckoutPagamento(pagamentoId, updateData);

      res.json({
        status: mpData.status,
        statusDetail: mpData.status_detail,
        paymentId: mpData.id,
        pixQrCode: updateData.pixQrCode,
        pixCopiaCola: updateData.pixCopiaCola,
        boletoUrl: updateData.boletoUrl,
        boletoCodigo: updateData.boletoCodigo,
      });
    } catch (error: any) {
      console.error('[MP Payment] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Checkout - Processar assinatura recorrente Mercado Pago (checkout transparente)
  app.post("/api/checkout/mercadopago/assinatura", async (req, res) => {
    try {
      const { pagamentoId, cardToken, payerEmail, paymentMethodId, issuerId } = req.body;
      
      const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
      if (!pagamento) {
        return res.status(404).json({ error: "Pagamento não encontrado" });
      }

      const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
      if (!plano) {
        return res.status(404).json({ error: "Plano não encontrado" });
      }

      const accessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
      if (!accessToken) {
        return res.status(500).json({ error: "Mercado Pago não configurado" });
      }

      // Get base URL for webhooks
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      // Calculate frequency for preapproval
      const frequencyType = plano.frequenciaTipo === 'days' ? 'days' : 
                            plano.frequenciaTipo === 'years' ? 'months' : 'months';
      const frequencyValue = plano.frequenciaTipo === 'years' ? 
                            (plano.frequencia || 1) * 12 : (plano.frequencia || 1);

      // Create preapproval with card_token for transparent checkout
      // IMPORTANT: status: "authorized" is required for card_token subscriptions
      // Do NOT send start_date - let MP use default behavior (immediate first charge)
      const preapprovalRequest: any = {
        reason: plano.nome,
        external_reference: pagamentoId,
        payer_email: payerEmail || pagamento.email,
        card_token_id: cardToken,
        status: "authorized",
        auto_recurring: {
          frequency: frequencyValue,
          frequency_type: frequencyType,
          transaction_amount: plano.preco / 100,
          currency_id: 'BRL',
          billing_day_proportional: false,
          first_invoice_offset: 0, // Cobrar imediatamente na criação da assinatura
        },
        back_url: `${baseUrl}/pagamento/sucesso?id=${pagamentoId}&tipo=assinatura`,
        notification_url: `${baseUrl}/webhook/mercadopago`,
      };

      // Add payment method and issuer if provided
      if (paymentMethodId) {
        preapprovalRequest.payment_method_id = paymentMethodId;
      }
      if (issuerId) {
        preapprovalRequest.issuer_id = issuerId;
      }

      console.log('[MP Subscription] Creating preapproval:', JSON.stringify(preapprovalRequest, null, 2));

      const mpResponse = await fetch('https://api.mercadopago.com/preapproval', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preapprovalRequest),
      });

      const mpData = await mpResponse.json();
      console.log('[MP Subscription] Response:', JSON.stringify(mpData, null, 2));

      // Handle API errors (non-200 responses)
      if (!mpResponse.ok) {
        const errorCode = mpData.cause?.[0]?.code || mpData.message || 'subscription_error';
        const errorInfo = getMercadoPagoErrorMessage(errorCode);
        
        logPaymentError({
          gateway: 'mercadopago',
          pagamentoId,
          email: pagamento.email,
          valor: plano.preco,
          metodo: 'credit_card',
          errorCode,
          errorMessage: mpData.message || 'Erro na assinatura',
          gatewayResponse: mpData,
        });

        // Atualizar registro com informações do erro
        await storage.updateCheckoutPagamento(pagamentoId, {
          status: 'rejected',
          statusDetail: mpData.message,
          gatewayErrorCode: errorCode,
          gatewayErrorMessage: mpData.message,
          userFriendlyError: `${errorInfo.message} ${errorInfo.action}`,
          failureAttempts: (pagamento.failureAttempts || 0) + 1,
          lastFailureAt: new Date(),
        });

        return res.status(400).json({ 
          error: errorInfo.message,
          action: errorInfo.action,
          retryable: errorInfo.retryable,
          errorCode,
        });
      }

      // Update payment record
      const updateData: any = {
        status: 'pending', // Default to pending until we verify first payment
        statusDetail: mpData.status,
        metodoPagamento: 'credit_card',
        mercadopagoPaymentId: mpData.id?.toString(),
        dataPagamento: new Date(),
        tipoAssinatura: 'recorrente',
      };

      // Handle pending status (payment still processing)
      if (mpData.status === 'pending') {
        const errorInfo = getMercadoPagoErrorMessage('pending_contingency');
        
        logPaymentError({
          gateway: 'mercadopago',
          pagamentoId,
          email: pagamento.email,
          valor: plano.preco,
          metodo: 'credit_card',
          errorCode: 'pending',
          errorMessage: 'Pagamento pendente',
          gatewayResponse: mpData,
        });

        updateData.gatewayErrorCode = 'pending';
        updateData.gatewayErrorMessage = errorInfo.message;
        updateData.userFriendlyError = `${errorInfo.message} ${errorInfo.action}`;
        
        // Send pending payment email and WhatsApp with PIX/Boleto alternatives
        import("./email").then(({ sendPaymentPendingEmail }) => {
          sendPaymentPendingEmail(pagamento.email, pagamento.nome, plano.nome, 'credit_card', pagamento.planoId).catch(err => {
            console.error(`[MP Subscription] Error sending pending payment email:`, err);
          });
        });
        
        // Send WhatsApp notification
        import("./whatsapp-notifications").then(({ sendWhatsAppPaymentPendingSafe }) => {
          sendWhatsAppPaymentPendingSafe(pagamento.telefone, pagamento.nome, plano.nome, 'Cartão de Crédito', pagamento.planoId, pagamento.email, pagamento.cpf).catch(err => {
            console.error(`[MP Subscription] Error sending pending payment WhatsApp:`, err);
          });
        });
      }

      // For subscriptions, 'authorized' means the subscription was CREATED, not that payment was made
      // We need to check for actual payment in the authorized_payments endpoint
      let hasConfirmedPayment = false;
      
      if (mpData.status === 'authorized') {
        // Wait a moment for the first payment to process
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check for authorized payments on this subscription
        try {
          const paymentsResponse = await fetch(
            `https://api.mercadopago.com/preapproval/${mpData.id}/authorized_payments`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            }
          );
          
          if (paymentsResponse.ok) {
            const paymentsData = await paymentsResponse.json();
            console.log(`[MP Subscription] Authorized payments for ${mpData.id}:`, JSON.stringify(paymentsData, null, 2));
            
            // Check if there's at least one approved/authorized payment
            hasConfirmedPayment = paymentsData.results?.some(
              (p: any) => p.status === 'approved' || p.status === 'authorized'
            ) || false;
          }
        } catch (err) {
          console.error('[MP Subscription] Error checking authorized payments:', err);
        }
        
        console.log(`[MP Subscription] Subscription ${mpData.id} authorized, hasConfirmedPayment: ${hasConfirmedPayment}`);
      }

      // ONLY grant access when we have a CONFIRMED PAYMENT (not just subscription authorized)
      if (mpData.status === 'authorized' && hasConfirmedPayment) {
        updateData.status = 'approved';
        updateData.dataAprovacao = new Date();
        
        // Log success
        logPaymentSuccess({
          gateway: 'mercadopago',
          pagamentoId,
          email: pagamento.email,
          valor: plano.preco,
          metodo: 'credit_card',
          externalId: mpData.id?.toString(),
        });
        
        // Calculate expiration date based on frequency
        const expirationDate = new Date();
        if (frequencyType === 'days') {
          expirationDate.setDate(expirationDate.getDate() + frequencyValue);
        } else {
          expirationDate.setMonth(expirationDate.getMonth() + frequencyValue);
        }
        updateData.dataExpiracao = expirationDate;

        // Check if admin exists
        let admin = await storage.getAdminByEmail(pagamento.email);
        
        if (admin) {
          // Update existing admin
          await storage.updateAdmin(admin.id, {
            accessExpiresAt: expirationDate,
            webinarLimit: plano.webinarLimit,
            uploadLimit: plano.uploadLimit || plano.webinarLimit,
            isActive: true,
            planoId: plano.id,
            paymentStatus: 'ok',
            paymentFailedReason: null,
          });
          updateData.adminId = admin.id;
          
          // Create or update subscription record
          const existingSubscription = await storage.getCheckoutAssinaturaByAdminId(admin.id);
          if (existingSubscription) {
            await storage.updateCheckoutAssinatura(existingSubscription.id, {
              status: 'active',
              planoId: plano.id,
              gateway: 'mercadopago',
              externalId: mpData.id?.toString(),
              proximoPagamento: expirationDate,
            });
          } else {
            await storage.createCheckoutAssinatura({
              adminId: admin.id,
              planoId: plano.id,
              status: 'active',
              gateway: 'mercadopago',
              externalId: mpData.id?.toString(),
              proximoPagamento: expirationDate,
            });
          }
          
          // Send payment confirmation email for existing users (safe - never throws)
          sendPaymentConfirmedEmailSafe(pagamento.email, pagamento.nome, plano.nome, expirationDate);
        } else {
          // Create new admin with temporary password
          const tempPassword = generateTempPassword();
          const bcrypt = await import('bcryptjs');
          const hashedPassword = await bcrypt.hash(tempPassword, 10);
          
          admin = await storage.createAdmin({
            name: pagamento.nome,
            email: pagamento.email,
            password: hashedPassword,
            telefone: pagamento.telefone,
            role: 'user',
            webinarLimit: plano.webinarLimit,
            uploadLimit: plano.uploadLimit || plano.webinarLimit,
            isActive: true,
            accessExpiresAt: expirationDate,
            planoId: plano.id,
          });
          updateData.adminId = admin.id;
          
          // Create subscription record
          await storage.createCheckoutAssinatura({
            adminId: admin.id,
            planoId: plano.id,
            status: 'active',
            gateway: 'mercadopago',
            externalId: mpData.id?.toString(),
            proximoPagamento: expirationDate,
          });
          
          console.log(`[MP Subscription] Created admin: ${pagamento.email}, temp password: ${tempPassword}`);
          
          // Send access credentials email for new users (safe - never throws)
          sendAccessCredentialsEmailSafe(pagamento.email, pagamento.nome, tempPassword, plano.nome);
        }
      }

      await storage.updateCheckoutPagamento(pagamentoId, updateData);

      // If subscription authorized but no payment confirmed, send pending email and WhatsApp
      if (mpData.status === 'authorized' && !hasConfirmedPayment) {
        import("./email").then(({ sendPaymentPendingEmail }) => {
          sendPaymentPendingEmail(pagamento.email, pagamento.nome, plano.nome, 'credit_card', pagamento.planoId).catch(err => {
            console.error(`[MP Subscription] Error sending pending payment email:`, err);
          });
        });
        
        // Send WhatsApp notification
        import("./whatsapp-notifications").then(({ sendWhatsAppPaymentPendingSafe }) => {
          sendWhatsAppPaymentPendingSafe(pagamento.telefone, pagamento.nome, plano.nome, 'Cartão de Crédito', pagamento.planoId, pagamento.email, pagamento.cpf).catch(err => {
            console.error(`[MP Subscription] Error sending pending payment WhatsApp:`, err);
          });
        });
      }

      // Return the actual status based on whether we confirmed payment
      // Frontend should check for 'authorized' AND hasConfirmedPayment to redirect to success
      res.json({
        status: hasConfirmedPayment ? 'authorized' : 'pending',
        statusDetail: mpData.status,
        subscriptionId: mpData.id,
        paymentConfirmed: hasConfirmedPayment,
        message: hasConfirmedPayment 
          ? 'Assinatura criada e primeiro pagamento confirmado' 
          : 'Assinatura criada, aguardando confirmação do primeiro pagamento',
      });
    } catch (error: any) {
      console.error('[MP Subscription] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Checkout - Gerar Pix/Boleto para assinatura recorrente Mercado Pago
  app.post("/api/checkout/mercadopago/assinatura-pix-boleto", async (req, res) => {
    try {
      const { pagamentoId, payerEmail, payerName, payerDocument, payerDocumentType, method } = req.body;
      
      if (!method || !['pix', 'boleto'].includes(method)) {
        return res.status(400).json({ error: "Método de pagamento inválido" });
      }

      const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
      if (!pagamento) {
        return res.status(404).json({ error: "Pagamento não encontrado" });
      }

      const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
      if (!plano) {
        return res.status(404).json({ error: "Plano não encontrado" });
      }

      const accessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
      if (!accessToken) {
        return res.status(500).json({ error: "Mercado Pago não configurado" });
      }

      // Get base URL for webhooks
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      // Clean document number
      const docNumber = (payerDocument || '').replace(/\D/g, '');
      const docType = payerDocumentType || 'CPF';

      // Set expiration date based on method
      const expirationDate = new Date();
      if (method === 'pix') {
        expirationDate.setMinutes(expirationDate.getMinutes() + 30); // 30 minutes for pix
      } else {
        expirationDate.setDate(expirationDate.getDate() + 3); // 3 days for boleto
      }

      // Create a direct payment request for Pix/Boleto (first month payment)
      const paymentRequest: any = {
        transaction_amount: plano.preco / 100,
        description: `Assinatura ${plano.nome} - 1ª mensalidade`,
        payment_method_id: method === 'pix' ? 'pix' : 'bolbradesco',
        date_of_expiration: expirationDate.toISOString(),
        external_reference: pagamentoId,
        notification_url: `${baseUrl}/webhook/mercadopago`,
        payer: {
          email: payerEmail || pagamento.email,
          first_name: (payerName || pagamento.nome || '').split(' ')[0],
          last_name: (payerName || pagamento.nome || '').split(' ').slice(1).join(' ') || '',
          identification: {
            type: docType,
            number: docNumber,
          },
        },
      };

      console.log(`[MP Subscription ${method.toUpperCase()}] Creating payment:`, JSON.stringify(paymentRequest, null, 2));

      const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `${pagamentoId}-${method}-${Date.now()}`,
        },
        body: JSON.stringify(paymentRequest),
      });

      const mpData = await mpResponse.json();
      console.log(`[MP Subscription ${method.toUpperCase()}] Response:`, JSON.stringify(mpData, null, 2));

      if (!mpResponse.ok) {
        console.error(`[MP Subscription ${method.toUpperCase()}] Error:`, mpData);
        return res.status(400).json({ 
          error: mpData.message || `Erro ao gerar ${method === 'pix' ? 'Pix' : 'Boleto'}`,
          details: mpData,
        });
      }

      // Update payment record with Pix/Boleto data
      const updateData: any = {
        status: 'pending',
        statusDetail: mpData.status,
        metodoPagamento: method,
        mercadopagoPaymentId: mpData.id?.toString(),
        tipoAssinatura: 'recorrente',
      };

      let responseData: any = { method, paymentId: mpData.id };

      if (method === 'pix') {
        const pixData = mpData.point_of_interaction?.transaction_data;
        if (pixData) {
          updateData.pixQrCode = pixData.qr_code;
          updateData.pixCopiaCola = pixData.qr_code;
          updateData.pixExpiresAt = expirationDate;
          
          responseData.pix = {
            qrCode: pixData.qr_code,
            qrCodeBase64: pixData.qr_code_base64,
            expiresAt: expirationDate.toISOString(),
          };
        }
      } else {
        // Boleto
        const boletoUrl = mpData.transaction_details?.external_resource_url;
        const barcode = mpData.barcode?.content;
        
        updateData.boletoUrl = boletoUrl;
        updateData.boletoCodigo = barcode;
        updateData.boletoExpiresAt = expirationDate;
        
        responseData.boleto = {
          url: boletoUrl,
          barcode: barcode || '',
          expiresAt: expirationDate.toISOString(),
        };
      }

      await storage.updateCheckoutPagamento(pagamentoId, updateData);

      // Send email and WhatsApp with payment instructions
      const methodName = method === 'pix' ? 'PIX' : 'Boleto';
      import("./email").then(({ sendPaymentPendingEmail }) => {
        sendPaymentPendingEmail(
          payerEmail || pagamento.email, 
          payerName || pagamento.nome, 
          plano.nome, 
          method, 
          pagamento.planoId
        ).catch(err => {
          console.error(`[MP Subscription ${method.toUpperCase()}] Error sending pending email:`, err);
        });
      });
      
      // Send WhatsApp notification
      import("./whatsapp-notifications").then(({ sendWhatsAppPaymentPendingSafe }) => {
        sendWhatsAppPaymentPendingSafe(
          pagamento.telefone, 
          payerName || pagamento.nome, 
          plano.nome, 
          methodName, 
          pagamento.planoId,
          pagamento.email,
          pagamento.cpf
        ).catch(err => {
          console.error(`[MP Subscription ${method.toUpperCase()}] Error sending pending WhatsApp:`, err);
        });
      });

      res.json(responseData);
    } catch (error: any) {
      console.error('[MP Subscription Pix/Boleto] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Checkout - Gerar Pix/Boleto via Mercado Pago para modo Híbrido (pagamento único)
  app.post("/api/checkout/hibrido/pix-boleto", async (req, res) => {
    try {
      const { pagamentoId, method } = req.body;
      
      if (!method || !['pix', 'boleto'].includes(method)) {
        return res.status(400).json({ error: "Método de pagamento inválido" });
      }

      const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
      if (!pagamento) {
        return res.status(404).json({ error: "Pagamento não encontrado" });
      }

      const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
      if (!plano) {
        return res.status(404).json({ error: "Plano não encontrado" });
      }

      // Verify this is a hybrid plan
      if (plano.gateway !== 'hibrido') {
        return res.status(400).json({ error: "Este endpoint é apenas para planos híbridos" });
      }

      const accessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
      if (!accessToken) {
        return res.status(500).json({ error: "Mercado Pago não configurado" });
      }

      // Get base URL for webhooks
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      // Clean document number
      const docNumber = (pagamento.cpf || '').replace(/\D/g, '');
      const docType = docNumber.length === 14 ? 'CNPJ' : 'CPF';

      // Set expiration date based on method
      const expirationDate = new Date();
      if (method === 'pix') {
        expirationDate.setMinutes(expirationDate.getMinutes() + 30); // 30 minutes for pix
      } else {
        expirationDate.setDate(expirationDate.getDate() + 3); // 3 days for boleto
      }

      // Create a direct payment request for Pix/Boleto
      const paymentRequest: any = {
        transaction_amount: plano.preco / 100,
        description: plano.nome,
        payment_method_id: method === 'pix' ? 'pix' : 'bolbradesco',
        date_of_expiration: expirationDate.toISOString(),
        external_reference: pagamentoId,
        notification_url: `${baseUrl}/webhook/mercadopago`,
        payer: {
          email: pagamento.email,
          first_name: (pagamento.nome || '').split(' ')[0],
          last_name: (pagamento.nome || '').split(' ').slice(1).join(' ') || '',
          identification: {
            type: docType,
            number: docNumber,
          },
        },
      };

      console.log(`[Hybrid ${method.toUpperCase()}] Creating payment:`, JSON.stringify(paymentRequest, null, 2));

      const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `${pagamentoId}-hybrid-${method}-${Date.now()}`,
        },
        body: JSON.stringify(paymentRequest),
      });

      const mpData = await mpResponse.json();
      console.log(`[Hybrid ${method.toUpperCase()}] Response:`, JSON.stringify(mpData, null, 2));

      if (!mpResponse.ok) {
        console.error(`[Hybrid ${method.toUpperCase()}] Error:`, mpData);
        return res.status(400).json({ 
          error: mpData.message || `Erro ao gerar ${method === 'pix' ? 'Pix' : 'Boleto'}`,
          details: mpData,
        });
      }

      // Update payment record with Pix/Boleto data
      const updateData: any = {
        status: 'pending',
        statusDetail: mpData.status,
        metodoPagamento: method,
        mercadopagoPaymentId: mpData.id?.toString(),
        tipoAssinatura: 'unico',
      };

      let responseData: any = { method, paymentId: mpData.id };

      if (method === 'pix') {
        const pixData = mpData.point_of_interaction?.transaction_data;
        if (pixData) {
          updateData.pixQrCode = pixData.qr_code;
          updateData.pixCopiaCola = pixData.qr_code;
          updateData.pixExpiresAt = expirationDate;
          
          responseData.pix = {
            qrCode: pixData.qr_code,
            qrCodeBase64: pixData.qr_code_base64,
            expiresAt: expirationDate.toISOString(),
          };
        }
      } else {
        // Boleto
        const boletoUrl = mpData.transaction_details?.external_resource_url;
        const barcode = mpData.barcode?.content;
        
        updateData.boletoUrl = boletoUrl;
        updateData.boletoCodigo = barcode;
        updateData.boletoExpiresAt = expirationDate;
        
        responseData.boleto = {
          url: boletoUrl,
          barcode: barcode || '',
          expiresAt: expirationDate.toISOString(),
        };
      }

      await storage.updateCheckoutPagamento(pagamentoId, updateData);

      // Send notifications
      const methodName = method === 'pix' ? 'PIX' : 'Boleto';
      
      if (method === 'pix' && responseData.pix) {
        // Send PIX generated notifications
        import("./email").then(({ sendPixGeneratedEmail }) => {
          sendPixGeneratedEmail(
            pagamento.email,
            pagamento.nome,
            plano.nome,
            responseData.pix.qrCode,
            null,
            expirationDate,
            plano.preco
          ).catch(err => {
            console.error(`[Hybrid PIX] Error sending PIX generated email:`, err);
          });
        });
        
        import("./whatsapp-notifications").then(({ sendWhatsAppPixGeneratedSafe }) => {
          const expirationTimeStr = expirationDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          sendWhatsAppPixGeneratedSafe(
            pagamento.telefone,
            pagamento.nome,
            plano.nome,
            plano.preco,
            responseData.pix.qrCode,
            expirationTimeStr
          ).catch(err => {
            console.error(`[Hybrid PIX] Error sending PIX generated WhatsApp:`, err);
          });
        });
      } else if (method === 'boleto' && responseData.boleto) {
        // Send Boleto generated notifications
        import("./email").then(({ sendBoletoGeneratedEmail }) => {
          sendBoletoGeneratedEmail(
            pagamento.email,
            pagamento.nome,
            plano.nome,
            responseData.boleto.url,
            responseData.boleto.barcode,
            expirationDate,
            plano.preco
          ).catch(err => {
            console.error(`[Hybrid Boleto] Error sending Boleto generated email:`, err);
          });
        });
        
        import("./whatsapp-notifications").then(({ sendWhatsAppBoletoGeneratedSafe }) => {
          const dueDateStr = expirationDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          sendWhatsAppBoletoGeneratedSafe(
            pagamento.telefone,
            pagamento.nome,
            plano.nome,
            plano.preco,
            responseData.boleto.url,
            dueDateStr
          ).catch(err => {
            console.error(`[Hybrid Boleto] Error sending Boleto generated WhatsApp:`, err);
          });
        });
      }

      res.json(responseData);
    } catch (error: any) {
      console.error('[Hybrid Pix/Boleto] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Checkout - Criar Payment Intent/Subscription Stripe (para Stripe Elements - transparente)
  app.post("/api/checkout/stripe/criar-payment-intent-elements", async (req, res) => {
    try {
      const { pagamentoId } = req.body;
      
      const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
      if (!pagamento) {
        return res.status(404).json({ error: "Pagamento não encontrado" });
      }

      const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
      if (!plano) {
        return res.status(404).json({ error: "Plano não encontrado" });
      }

      const stripeSecretKey = await storage.getCheckoutConfig('STRIPE_SECRET_KEY');
      if (!stripeSecretKey) {
        return res.status(500).json({ error: "Stripe não configurado" });
      }

      // Check if recurring subscription
      if (plano.tipoCobranca === 'recorrente') {
        // For subscriptions, create a SetupIntent to collect payment method
        // Then create the subscription with the payment method
        
        // First, create or get customer
        let customerId: string;
        
        // Search for existing customer by email
        const searchParams = new URLSearchParams({
          'query': `email:"${pagamento.email}"`,
        });
        
        const searchResponse = await fetch(`https://api.stripe.com/v1/customers/search?${searchParams}`, {
          headers: { 'Authorization': `Bearer ${stripeSecretKey}` },
        });
        
        const searchData = await searchResponse.json();
        
        if (searchData.data && searchData.data.length > 0) {
          customerId = searchData.data[0].id;
        } else {
          // Create new customer
          const customerParams = new URLSearchParams({
            'email': pagamento.email,
            'name': pagamento.nome,
            'metadata[pagamentoId]': pagamentoId,
          });
          
          const customerResponse = await fetch('https://api.stripe.com/v1/customers', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${stripeSecretKey}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: customerParams.toString(),
          });
          
          const customerData = await customerResponse.json();
          customerId = customerData.id;
        }

        // Calculate interval based on frequenciaTipo
        const interval = plano.frequenciaTipo === 'days' ? 'day' : 
                        plano.frequenciaTipo === 'years' ? 'year' : 'month';
        const intervalCount = plano.frequencia || 1;

        // Create a price for the subscription
        const priceParams = new URLSearchParams({
          'unit_amount': plano.preco.toString(),
          'currency': 'brl',
          'recurring[interval]': interval,
          'recurring[interval_count]': intervalCount.toString(),
          'product_data[name]': plano.nome,
          'metadata[planoId]': plano.id,
        });

        const priceResponse = await fetch('https://api.stripe.com/v1/prices', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: priceParams.toString(),
        });

        if (!priceResponse.ok) {
          const error = await priceResponse.text();
          console.error('[Stripe] Error creating price:', error);
          return res.status(500).json({ error: 'Erro ao criar preço' });
        }

        const priceData = await priceResponse.json();

        // Create subscription with incomplete status (will be activated when payment method is attached)
        const subscriptionParams = new URLSearchParams({
          'customer': customerId,
          'items[0][price]': priceData.id,
          'payment_behavior': 'default_incomplete',
          'payment_settings[save_default_payment_method]': 'on_subscription',
          'expand[0]': 'latest_invoice.payment_intent',
          'metadata[pagamentoId]': pagamentoId,
          'metadata[planoId]': plano.id,
        });

        const subscriptionResponse = await fetch('https://api.stripe.com/v1/subscriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: subscriptionParams.toString(),
        });

        if (!subscriptionResponse.ok) {
          const error = await subscriptionResponse.text();
          console.error('[Stripe] Error creating subscription:', error);
          return res.status(500).json({ error: 'Erro ao criar assinatura' });
        }

        const subscriptionData = await subscriptionResponse.json();
        const clientSecret = subscriptionData.latest_invoice?.payment_intent?.client_secret;
        
        // Get the PaymentIntent ID from the latest invoice and update its metadata
        const paymentIntentId = subscriptionData.latest_invoice?.payment_intent?.id;
        if (paymentIntentId) {
          // Update PaymentIntent with pagamentoId metadata so webhook can find it
          const piUpdateParams = new URLSearchParams({
            'metadata[pagamentoId]': pagamentoId,
            'metadata[planoId]': plano.id,
          });
          
          await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${stripeSecretKey}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: piUpdateParams.toString(),
          });
          console.log('[Stripe] Updated PaymentIntent metadata:', paymentIntentId);
        }

        // Update payment with Stripe subscription ID
        await storage.updateCheckoutPagamento(pagamentoId, {
          stripePaymentIntentId: paymentIntentId || subscriptionData.id,
          stripeSubscriptionId: subscriptionData.id,
        });

        console.log('[Stripe] Created subscription:', subscriptionData.id);

        return res.json({
          type: 'subscription',
          clientSecret,
          subscriptionId: subscriptionData.id,
          customerId,
        });
      }

      // Create Payment Intent for one-time payment
      const params = new URLSearchParams({
        'amount': plano.preco.toString(),
        'currency': 'brl',
        'automatic_payment_methods[enabled]': 'true',
        'metadata[pagamentoId]': pagamentoId,
        'metadata[planoId]': plano.id,
        'receipt_email': pagamento.email,
        'description': `${plano.nome} - ${plano.webinarLimit} webinars`,
      });

      const stripeResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!stripeResponse.ok) {
        const error = await stripeResponse.text();
        console.error('[Stripe Elements] Error creating payment intent:', error);
        return res.status(500).json({ error: 'Erro ao criar payment intent' });
      }

      const stripeData = await stripeResponse.json();

      // Update payment with Stripe Payment Intent ID
      await storage.updateCheckoutPagamento(pagamentoId, {
        stripePaymentIntentId: stripeData.id,
      });

      res.json({
        type: 'payment',
        clientSecret: stripeData.client_secret,
        paymentIntentId: stripeData.id,
      });
    } catch (error: any) {
      console.error('[Stripe Elements] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Checkout - Processar pagamento Stripe (Checkout Session)
  app.post("/api/checkout/stripe/criar-payment-intent", async (req, res) => {
    try {
      const { pagamentoId } = req.body;
      
      const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
      if (!pagamento) {
        return res.status(404).json({ error: "Pagamento não encontrado" });
      }

      const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
      if (!plano) {
        return res.status(404).json({ error: "Plano não encontrado" });
      }

      const stripeSecretKey = await storage.getCheckoutConfig('STRIPE_SECRET_KEY');
      if (!stripeSecretKey) {
        return res.status(500).json({ error: "Stripe não configurado" });
      }

      // Get base URL for success/cancel redirects
      const baseUrl = getAppUrl();

      // Create Checkout Session via Stripe API
      const params = new URLSearchParams({
        'mode': 'payment',
        'success_url': `${baseUrl}/pagamento/sucesso?pagamentoId=${pagamentoId}&gateway=stripe`,
        'cancel_url': `${baseUrl}/pagamento/erro?pagamentoId=${pagamentoId}&gateway=stripe`,
        'line_items[0][price_data][currency]': 'brl',
        'line_items[0][price_data][product_data][name]': plano.nome,
        'line_items[0][price_data][product_data][description]': plano.descricao || `Plano ${plano.nome} - ${plano.webinarLimit} webinars`,
        'line_items[0][price_data][unit_amount]': plano.preco.toString(),
        'line_items[0][quantity]': '1',
        'metadata[pagamentoId]': pagamentoId,
        'metadata[planoId]': plano.id,
        'customer_email': pagamento.email,
      });

      const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!stripeResponse.ok) {
        const error = await stripeResponse.text();
        console.error('[Stripe] Error creating checkout session:', error);
        return res.status(500).json({ error: 'Erro ao criar sessão de checkout' });
      }

      const stripeData = await stripeResponse.json();

      // Update payment with Stripe Session ID
      await storage.updateCheckoutPagamento(pagamentoId, {
        stripePaymentIntentId: stripeData.id,
      });

      res.json({
        checkoutUrl: stripeData.url,
        sessionId: stripeData.id,
      });
    } catch (error: any) {
      console.error('[Stripe] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Checkout - Criar Payment Intent para PIX via Stripe
  app.post("/api/checkout/stripe/criar-pix", async (req, res) => {
    try {
      const { pagamentoId } = req.body;
      
      const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
      if (!pagamento) {
        return res.status(404).json({ error: "Pagamento não encontrado" });
      }

      const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
      if (!plano) {
        return res.status(404).json({ error: "Plano não encontrado" });
      }

      const stripeSecretKey = await storage.getCheckoutConfig('STRIPE_SECRET_KEY');
      if (!stripeSecretKey) {
        return res.status(500).json({ error: "Stripe não configurado" });
      }

      // Create Payment Intent with PIX payment method
      const params = new URLSearchParams({
        'amount': plano.preco.toString(),
        'currency': 'brl',
        'payment_method_types[0]': 'pix',
        'metadata[pagamentoId]': pagamentoId,
        'metadata[planoId]': plano.id,
        'receipt_email': pagamento.email,
        'description': `${plano.nome} - PIX`,
      });

      const stripeResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!stripeResponse.ok) {
        const error = await stripeResponse.text();
        console.error('[Stripe PIX] Error creating payment intent:', error);
        return res.status(500).json({ error: 'Erro ao criar pagamento PIX' });
      }

      const stripeData = await stripeResponse.json();

      // Confirm the payment intent to generate PIX code
      const confirmParams = new URLSearchParams({
        'payment_method_data[type]': 'pix',
        'return_url': `${getAppUrl()}/pagamento/sucesso?pagamentoId=${pagamentoId}&gateway=stripe`,
      });

      const confirmResponse = await fetch(`https://api.stripe.com/v1/payment_intents/${stripeData.id}/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: confirmParams.toString(),
      });

      if (!confirmResponse.ok) {
        const error = await confirmResponse.text();
        console.error('[Stripe PIX] Error confirming payment intent:', error);
        return res.status(500).json({ error: 'Erro ao confirmar pagamento PIX' });
      }

      const confirmedData = await confirmResponse.json();
      
      // Extract PIX data from next_action
      const pixAction = confirmedData.next_action?.pix_display_qr_code;
      const expiresAt = pixAction?.expires_at ? new Date(pixAction.expires_at * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      // Update payment with PIX data
      await storage.updateCheckoutPagamento(pagamentoId, {
        stripePaymentIntentId: stripeData.id,
        metodoPagamento: 'pix',
        status: 'pending',
        pixQrCode: pixAction?.image_url_png || null,
        pixCopiaCola: pixAction?.data || null,
        pixExpiresAt: expiresAt,
      });

      // Send PIX generated email and WhatsApp
      if (pixAction?.data) {
        import("./email").then(({ sendPixGeneratedEmail }) => {
          sendPixGeneratedEmail(
            pagamento.email,
            pagamento.nome,
            plano.nome,
            pixAction.data,
            pixAction.image_url_png || null,
            expiresAt,
            plano.preco
          ).catch(err => {
            console.error(`[Stripe PIX] Error sending PIX generated email:`, err);
          });
        });
        
        // Send WhatsApp notification
        import("./whatsapp-notifications").then(({ sendWhatsAppPixGeneratedSafe }) => {
          const expirationTimeStr = expiresAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          sendWhatsAppPixGeneratedSafe(
            pagamento.telefone,
            pagamento.nome,
            plano.nome,
            plano.preco,
            pixAction.data,
            expirationTimeStr
          ).catch(err => {
            console.error(`[Stripe PIX] Error sending PIX generated WhatsApp:`, err);
          });
        });
      }

      console.log('[Stripe PIX] Created PIX payment:', stripeData.id);

      res.json({
        paymentIntentId: stripeData.id,
        pixQrCode: pixAction?.image_url_png || null,
        pixCopiaCola: pixAction?.data || null,
        expiresAt: expiresAt.toISOString(),
        hostedInstructionsUrl: pixAction?.hosted_instructions_url || null,
      });
    } catch (error: any) {
      console.error('[Stripe PIX] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Checkout - Criar Payment Intent para Boleto via Stripe
  app.post("/api/checkout/stripe/criar-boleto", async (req, res) => {
    try {
      const { pagamentoId } = req.body;
      
      const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
      if (!pagamento) {
        return res.status(404).json({ error: "Pagamento não encontrado" });
      }

      const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
      if (!plano) {
        return res.status(404).json({ error: "Plano não encontrado" });
      }

      const stripeSecretKey = await storage.getCheckoutConfig('STRIPE_SECRET_KEY');
      if (!stripeSecretKey) {
        return res.status(500).json({ error: "Stripe não configurado" });
      }

      // Calculate expiration (3 business days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 3);

      // Create Payment Intent with Boleto payment method
      const params = new URLSearchParams({
        'amount': plano.preco.toString(),
        'currency': 'brl',
        'payment_method_types[0]': 'boleto',
        'metadata[pagamentoId]': pagamentoId,
        'metadata[planoId]': plano.id,
        'receipt_email': pagamento.email,
        'description': `${plano.nome} - Boleto`,
      });

      const stripeResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!stripeResponse.ok) {
        const error = await stripeResponse.text();
        console.error('[Stripe Boleto] Error creating payment intent:', error);
        return res.status(500).json({ error: 'Erro ao criar pagamento Boleto' });
      }

      const stripeData = await stripeResponse.json();

      // Confirm the payment intent to generate Boleto
      const confirmParams = new URLSearchParams({
        'payment_method_data[type]': 'boleto',
        'payment_method_data[billing_details][email]': pagamento.email,
        'payment_method_data[billing_details][name]': pagamento.nome,
        'payment_method_data[boleto][tax_id]': pagamento.cpf?.replace(/\D/g, '') || '00000000000',
        'return_url': `${getAppUrl()}/pagamento/sucesso?pagamentoId=${pagamentoId}&gateway=stripe`,
      });

      const confirmResponse = await fetch(`https://api.stripe.com/v1/payment_intents/${stripeData.id}/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: confirmParams.toString(),
      });

      if (!confirmResponse.ok) {
        const error = await confirmResponse.text();
        console.error('[Stripe Boleto] Error confirming payment intent:', error);
        return res.status(500).json({ error: 'Erro ao confirmar pagamento Boleto' });
      }

      const confirmedData = await confirmResponse.json();
      
      // Extract Boleto data from next_action
      const boletoAction = confirmedData.next_action?.boleto_display_details;
      
      // Update payment with Boleto data
      await storage.updateCheckoutPagamento(pagamentoId, {
        stripePaymentIntentId: stripeData.id,
        metodoPagamento: 'boleto',
        status: 'pending',
        boletoUrl: boletoAction?.hosted_voucher_url || null,
        boletoCodigo: boletoAction?.number || null,
        boletoExpiresAt: boletoAction?.expires_at ? new Date(boletoAction.expires_at * 1000) : expiresAt,
      });

      // Send Boleto generated email and WhatsApp
      if (boletoAction?.hosted_voucher_url) {
        const boletoExpiresDate = boletoAction.expires_at ? new Date(boletoAction.expires_at * 1000) : expiresAt;
        
        import("./email").then(({ sendBoletoGeneratedEmail }) => {
          sendBoletoGeneratedEmail(
            pagamento.email,
            pagamento.nome,
            plano.nome,
            boletoAction.hosted_voucher_url,
            boletoAction.number || null,
            boletoExpiresDate,
            plano.preco
          ).catch(err => {
            console.error(`[Stripe Boleto] Error sending Boleto generated email:`, err);
          });
        });
        
        // Send WhatsApp notification
        import("./whatsapp-notifications").then(({ sendWhatsAppBoletoGeneratedSafe }) => {
          const dueDateStr = boletoExpiresDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          sendWhatsAppBoletoGeneratedSafe(
            pagamento.telefone,
            pagamento.nome,
            plano.nome,
            plano.preco,
            boletoAction.hosted_voucher_url,
            dueDateStr
          ).catch(err => {
            console.error(`[Stripe Boleto] Error sending Boleto generated WhatsApp:`, err);
          });
        });
      }

      console.log('[Stripe Boleto] Created Boleto payment:', stripeData.id);

      res.json({
        paymentIntentId: stripeData.id,
        boletoUrl: boletoAction?.hosted_voucher_url || null,
        boletoCodigo: boletoAction?.number || null,
        expiresAt: (boletoAction?.expires_at ? new Date(boletoAction.expires_at * 1000) : expiresAt).toISOString(),
      });
    } catch (error: any) {
      console.error('[Stripe Boleto] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Confirm Stripe payment after successful frontend confirmation
  // This is called from the success page to ensure payment is marked as approved
  app.post("/api/checkout/stripe/confirmar-pagamento", async (req, res) => {
    try {
      const { pagamentoId, paymentIntentId, subscriptionId } = req.body;
      
      if (!pagamentoId) {
        return res.status(400).json({ error: 'pagamentoId é obrigatório' });
      }

      const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
      if (!pagamento) {
        return res.status(404).json({ error: 'Pagamento não encontrado' });
      }

      // If already approved, skip
      if (pagamento.status === 'approved') {
        return res.json({ success: true, message: 'Pagamento já aprovado' });
      }

      const stripeSecretKey = await storage.getCheckoutConfig('STRIPE_SECRET_KEY');
      if (!stripeSecretKey) {
        return res.status(500).json({ error: 'Stripe não configurado' });
      }

      // Determine which ID to use for verification
      const checkId = paymentIntentId || subscriptionId || pagamento.stripePaymentIntentId || pagamento.stripeSubscriptionId;
      
      if (!checkId) {
        return res.status(400).json({ error: 'ID de pagamento não encontrado' });
      }

      let paymentConfirmed = false;
      let paymentDate = new Date();

      // Check if it's a subscription or payment intent
      if (checkId.startsWith('sub_')) {
        // Fetch subscription to check status
        const subResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${checkId}`, {
          headers: {
            'Authorization': `Bearer ${stripeSecretKey}`,
          },
        });
        
        if (subResponse.ok) {
          const subData = await subResponse.json();
          // Check if subscription is active (has paid)
          if (subData.status === 'active' || subData.status === 'trialing') {
            paymentConfirmed = true;
            paymentDate = subData.current_period_start 
              ? new Date(subData.current_period_start * 1000) 
              : new Date();
          }
        }
      } else if (checkId.startsWith('pi_')) {
        // Fetch payment intent to check status
        const piResponse = await fetch(`https://api.stripe.com/v1/payment_intents/${checkId}`, {
          headers: {
            'Authorization': `Bearer ${stripeSecretKey}`,
          },
        });
        
        if (piResponse.ok) {
          const piData = await piResponse.json();
          if (piData.status === 'succeeded') {
            paymentConfirmed = true;
            paymentDate = piData.created ? new Date(piData.created * 1000) : new Date();
          }
        }
      }

      if (paymentConfirmed) {
        const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
        
        // Calculate expiration date based on plan type
        const expirationDate = new Date();
        if (plano?.tipoCobranca === 'recorrente') {
          // For recurring: use frequencia + frequenciaTipo
          const freq = plano.frequencia || 1;
          const freqTipo = plano.frequenciaTipo || 'months';
          
          if (freqTipo === 'days') {
            expirationDate.setDate(expirationDate.getDate() + freq);
          } else if (freqTipo === 'weeks') {
            expirationDate.setDate(expirationDate.getDate() + (freq * 7));
          } else if (freqTipo === 'months') {
            expirationDate.setMonth(expirationDate.getMonth() + freq);
          } else if (freqTipo === 'years') {
            expirationDate.setFullYear(expirationDate.getFullYear() + freq);
          }
        } else {
          // For one-time payments: use prazoDias
          expirationDate.setDate(expirationDate.getDate() + (plano?.prazoDias || 30));
        }

        // Check if admin exists
        let admin = await storage.getAdminByEmail(pagamento.email);
        
        if (admin) {
          // Update existing admin
          await storage.updateAdmin(admin.id, {
            accessExpiresAt: expirationDate,
            webinarLimit: plano?.webinarLimit || admin.webinarLimit,
            uploadLimit: plano?.uploadLimit || admin.uploadLimit,
            isActive: true,
            planoId: plano?.id || admin.planoId,
            paymentStatus: 'ok',
            paymentFailedReason: null,
          });
          console.log(`[Stripe Confirm] Updated admin: ${pagamento.email}, expires: ${expirationDate}`);
        } else {
          // Create new admin
          const tempPassword = Math.random().toString(36).slice(-8);
          const bcrypt = await import('bcryptjs');
          const hashedPassword = await bcrypt.hash(tempPassword, 10);
          
          admin = await storage.createAdmin({
            name: pagamento.nome,
            email: pagamento.email,
            password: hashedPassword,
            telefone: pagamento.telefone,
            role: 'user',
            webinarLimit: plano?.webinarLimit || 5,
            uploadLimit: plano?.uploadLimit || 999,
            isActive: true,
            accessExpiresAt: expirationDate,
            planoId: plano?.id,
            paymentStatus: 'ok',
          });
          
          console.log(`[Stripe Confirm] Created admin: ${pagamento.email}, temp password: ${tempPassword}`);
          
          // Send access credentials email
          import("./email").then(({ sendAccessCredentialsEmailSafe }) => {
            sendAccessCredentialsEmailSafe(pagamento.email, pagamento.nome, tempPassword, plano?.nome || "Seu Plano");
          });
          
          // Send WhatsApp credentials
          if (pagamento.telefone) {
            import("./whatsapp-notifications").then(({ sendWhatsAppCredentialsSafe }) => {
              sendWhatsAppCredentialsSafe(pagamento.telefone, pagamento.nome, tempPassword, plano?.nome || "Seu Plano", pagamento.email);
            });
          }
        }

        // Update payment record
        await storage.updateCheckoutPagamento(pagamentoId, {
          status: 'approved',
          statusDetail: 'Pagamento confirmado via Stripe',
          metodoPagamento: 'card',
          dataPagamento: paymentDate,
          dataAprovacao: new Date(),
          dataExpiracao: expirationDate,
          adminId: admin.id,
        });

        // Process affiliate sale if applicable
        if (plano) {
          import("./routes").then(async (routes) => {
            // Note: processAffiliateSale is defined in routes, skip for now
          }).catch(() => {});
        }

        console.log(`[Stripe Confirm] Payment ${pagamentoId} confirmed successfully`);
        
        return res.json({ 
          success: true, 
          message: 'Pagamento confirmado com sucesso',
          expiresAt: expirationDate.toISOString(),
        });
      } else {
        return res.json({ 
          success: false, 
          message: 'Pagamento ainda não confirmado pelo Stripe',
        });
      }
    } catch (error: any) {
      console.error('[Stripe Confirm] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Webhook - Mercado Pago
  app.post("/webhook/mercadopago", async (req, res) => {
    try {
      console.log('[MP Webhook] Received:', JSON.stringify(req.body));
      
      const { type, data, action } = req.body;
      
      const accessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
      if (!accessToken) {
        console.error('[MP Webhook] Access token not configured');
        return res.status(500).json({ error: 'Token não configurado' });
      }

      // Handle subscription (preapproval) events
      if (type === 'subscription_preapproval' || type === 'preapproval') {
        const preapprovalId = data?.id;
        if (!preapprovalId) {
          return res.status(200).send('OK');
        }

        console.log(`[MP Webhook] Processing preapproval ${preapprovalId}, action: ${action}`);

        // Fetch preapproval details
        const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!mpResponse.ok) {
          console.error('[MP Webhook] Error fetching preapproval:', await mpResponse.text());
          return res.status(500).json({ error: 'Erro ao buscar assinatura' });
        }

        const preapproval = await mpResponse.json();
        const pagamentoId = preapproval.external_reference;

        console.log(`[MP Webhook] Preapproval status: ${preapproval.status}, pagamentoId: ${pagamentoId}`);

        if (pagamentoId) {
          const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
          if (pagamento) {
            const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
            
            // Handle authorized/pending/cancelled states
            // IMPORTANT: 'authorized' means subscription is SET UP, NOT that payment was made!
            // We need to check for actual payments before granting access
            if (preapproval.status === 'authorized' || preapproval.status === 'pending') {
              
              // Check if there are any authorized payments for this subscription
              let hasAuthorizedPayment = false;
              try {
                const paymentsResponse = await fetch(
                  `https://api.mercadopago.com/preapproval/${preapprovalId}/authorized_payments`,
                  {
                    headers: { 'Authorization': `Bearer ${accessToken}` },
                  }
                );
                
                if (paymentsResponse.ok) {
                  const paymentsData = await paymentsResponse.json();
                  // Check if there's at least one approved payment
                  hasAuthorizedPayment = paymentsData.results?.some(
                    (p: any) => p.status === 'approved' || p.status === 'authorized'
                  ) || false;
                  console.log(`[MP Webhook] Preapproval ${preapprovalId} has ${paymentsData.results?.length || 0} payments, hasAuthorizedPayment: ${hasAuthorizedPayment}`);
                }
              } catch (err) {
                console.error('[MP Webhook] Error checking authorized payments:', err);
              }
              
              // If subscription is authorized but NO payment yet, just update status to pending
              if (preapproval.status === 'authorized' && !hasAuthorizedPayment) {
                await storage.updateCheckoutPagamento(pagamentoId, {
                  status: 'pending',
                  statusDetail: 'Assinatura criada - aguardando primeira cobrança',
                  metodoPagamento: 'subscription',
                  mercadopagoPaymentId: preapprovalId.toString(),
                });
                console.log(`[MP Webhook] Subscription ${pagamentoId} authorized but NO payment yet - waiting for first charge`);
                return res.status(200).send('OK');
              }
              
              // Get real payment date from authorized payments if available
              // Use existing record date as fallback to preserve original payment date
              let realPaymentDate: Date = pagamento.dataPagamento || new Date();
              let realApprovalDate: Date = pagamento.dataAprovacao || realPaymentDate;
              try {
                const paymentsResponse2 = await fetch(
                  `https://api.mercadopago.com/preapproval/${preapprovalId}/authorized_payments`,
                  {
                    headers: { 'Authorization': `Bearer ${accessToken}` },
                  }
                );
                if (paymentsResponse2.ok) {
                  const paymentsData2 = await paymentsResponse2.json();
                  const approvedPayment = paymentsData2.results?.find(
                    (p: any) => p.status === 'approved' || p.status === 'authorized'
                  );
                  if (approvedPayment) {
                    realPaymentDate = approvedPayment.date_created 
                      ? new Date(approvedPayment.date_created) 
                      : (pagamento.dataPagamento || new Date());
                    realApprovalDate = approvedPayment.date_approved 
                      ? new Date(approvedPayment.date_approved) 
                      : realPaymentDate;
                  }
                }
              } catch (err) {
                console.error('[MP Webhook] Error fetching payment dates:', err);
              }
              
              const updateData: any = {
                status: (preapproval.status === 'authorized' && hasAuthorizedPayment) ? 'approved' : 'pending',
                statusDetail: hasAuthorizedPayment ? 'Assinatura ativa - pagamento confirmado' : `Assinatura ${preapproval.status}`,
                metodoPagamento: 'subscription',
                mercadopagoPaymentId: preapprovalId.toString(),
                dataPagamento: realPaymentDate,
              };

              // Only grant access if we have a confirmed payment
              if (preapproval.status === 'authorized' && hasAuthorizedPayment && plano) {
                updateData.dataAprovacao = realApprovalDate;
                
                // Calculate expiration date based on plan type
                const expirationDate = new Date();
                if (plano.tipoCobranca === 'recorrente') {
                  // For recurring: use frequencia + frequenciaTipo
                  const freq = plano.frequencia || 1;
                  const freqTipo = plano.frequenciaTipo || 'months';
                  
                  if (freqTipo === 'days') {
                    expirationDate.setDate(expirationDate.getDate() + freq);
                  } else if (freqTipo === 'weeks') {
                    expirationDate.setDate(expirationDate.getDate() + (freq * 7));
                  } else if (freqTipo === 'months') {
                    expirationDate.setMonth(expirationDate.getMonth() + freq);
                  } else if (freqTipo === 'years') {
                    expirationDate.setFullYear(expirationDate.getFullYear() + freq);
                  }
                } else {
                  // For one-time payments: use prazoDias
                  expirationDate.setDate(expirationDate.getDate() + (plano.prazoDias || 30));
                }
                updateData.dataExpiracao = expirationDate;

                // Create or update admin
                let admin = await storage.getAdminByEmail(pagamento.email);
                
                if (admin) {
                  await storage.updateAdmin(admin.id, {
                    accessExpiresAt: expirationDate,
                    webinarLimit: plano.webinarLimit,
                    uploadLimit: plano.uploadLimit || plano.webinarLimit,
                    isActive: true,
                    planoId: plano.id,
                    paymentStatus: 'ok',
                    paymentFailedReason: null,
                  });
                  updateData.adminId = admin.id;
                  console.log(`[MP Webhook] Updated admin ${pagamento.email} for subscription WITH CONFIRMED PAYMENT`);
                  
                  // Send payment confirmation email (safe - never throws)
                  sendPaymentConfirmedEmailSafe(pagamento.email, pagamento.nome, plano.nome, expirationDate);
                  // Send WhatsApp notification if phone available (prefer admin phone for renewals)
                  const telefoneNotif1 = admin?.telefone || pagamento.telefone;
                  if (telefoneNotif1) {
                    sendWhatsAppPaymentConfirmedSafe(telefoneNotif1, pagamento.nome, plano.nome, expirationDate);
                  }
                } else {
                  const tempPassword = generateTempPassword();
                  const bcrypt = await import('bcryptjs');
                  const hashedPassword = await bcrypt.hash(tempPassword, 10);
                  
                  admin = await storage.createAdmin({
                    name: pagamento.nome,
                    email: pagamento.email,
                    password: hashedPassword,
                    telefone: pagamento.telefone,
                    role: 'user',
                    webinarLimit: plano.webinarLimit,
                    uploadLimit: plano.uploadLimit || plano.webinarLimit,
                    isActive: true,
                    accessExpiresAt: expirationDate,
                    planoId: plano.id,
                    paymentStatus: 'ok',
                  });
                  updateData.adminId = admin.id;
                  
                  console.log(`[MP Webhook] Created admin for subscription WITH CONFIRMED PAYMENT: ${pagamento.email}, temp password: ${tempPassword}`);
                  
                  // Send access credentials email for new users (safe - never throws)
                  sendAccessCredentialsEmailSafe(pagamento.email, pagamento.nome, tempPassword, plano.nome);
                  // Send WhatsApp credentials if phone available (new user - use pagamento.telefone)
                  if (pagamento.telefone) {
                    sendWhatsAppCredentialsSafe(pagamento.telefone, pagamento.nome, tempPassword, plano.nome, pagamento.email);
                  }
                }
              }

              await storage.updateCheckoutPagamento(pagamentoId, updateData);
              console.log(`[MP Webhook] Updated subscription payment ${pagamentoId}`);
            } else if (preapproval.status === 'cancelled' || preapproval.status === 'paused') {
              // Handle cancellation or pause - BOTH should block access
              await storage.updateCheckoutPagamento(pagamentoId, {
                status: preapproval.status === 'cancelled' ? 'cancelled' : 'paused',
                statusDetail: `Assinatura ${preapproval.status}`,
              });

              // Mark expired but keep isActive=true so user can login and see renewal screen
              const admin = await storage.getAdminByEmail(pagamento.email);
              if (admin) {
                await storage.updateAdmin(admin.id, {
                  // Keep isActive: true - user can login and see renewal screen
                  paymentStatus: preapproval.status === 'cancelled' ? 'cancelled' : 'paused',
                  accessExpiresAt: new Date(), // Expire now - frontend blocks tool access
                });
                console.log(`[MP Webhook] Marked expired for ${pagamento.email} - subscription ${preapproval.status} (isActive stays true)`);
                
                // Send plan expired/paused email (safe - never throws)
                const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
                sendPlanExpiredEmailSafe(pagamento.email, pagamento.nome, plano?.nome || "Seu Plano", pagamento.planoId);
                // Send WhatsApp notification if phone available (prefer admin phone)
                const telefoneNotif2 = admin?.telefone || pagamento.telefone;
                if (telefoneNotif2) {
                  sendWhatsAppPlanExpiredSafe(telefoneNotif2, pagamento.nome, plano?.nome || "Seu Plano", pagamento.email, pagamento.planoId);
                }
              }
            }
          }
        }
      }
      
      // Handle regular payment events
      if (type === 'payment') {
        const paymentId = data?.id;
        if (!paymentId) {
          return res.status(200).send('OK');
        }

        // Fetch payment details from MercadoPago
        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!mpResponse.ok) {
          console.error('[MP Webhook] Error fetching payment:', await mpResponse.text());
          return res.status(500).json({ error: 'Erro ao buscar pagamento' });
        }

        const payment = await mpResponse.json();
        const pagamentoId = payment.external_reference;

        if (pagamentoId) {
          const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
          if (pagamento) {
            // Use real dates from MercadoPago API, fallback to existing record date or current date
            const paymentDate = payment.date_created 
              ? new Date(payment.date_created) 
              : (pagamento.dataPagamento || new Date());
            const approvalDate = payment.date_approved 
              ? new Date(payment.date_approved) 
              : (payment.date_created ? new Date(payment.date_created) : (pagamento.dataPagamento || new Date()));
            
            const updateData: any = {
              status: payment.status,
              statusDetail: payment.status_detail,
              metodoPagamento: payment.payment_type_id,
              mercadopagoPaymentId: paymentId.toString(),
              dataPagamento: paymentDate,
            };

            // If approved, create/update admin account
            if (payment.status === 'approved') {
              updateData.dataAprovacao = approvalDate;
              
              const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
              if (plano) {
                // Calculate expiration date based on plan type
                const expirationDate = new Date();
                if (plano.tipoCobranca === 'recorrente') {
                  // For recurring: use frequencia + frequenciaTipo
                  const freq = plano.frequencia || 1;
                  const freqTipo = plano.frequenciaTipo || 'months';
                  
                  if (freqTipo === 'days') {
                    expirationDate.setDate(expirationDate.getDate() + freq);
                  } else if (freqTipo === 'weeks') {
                    expirationDate.setDate(expirationDate.getDate() + (freq * 7));
                  } else if (freqTipo === 'months') {
                    expirationDate.setMonth(expirationDate.getMonth() + freq);
                  } else if (freqTipo === 'years') {
                    expirationDate.setFullYear(expirationDate.getFullYear() + freq);
                  }
                } else {
                  // For one-time payments: use prazoDias
                  expirationDate.setDate(expirationDate.getDate() + (plano.prazoDias || 30));
                }
                updateData.dataExpiracao = expirationDate;

                // Check if admin exists
                let admin = await storage.getAdminByEmail(pagamento.email);
                
                if (admin) {
                  // Update existing admin
                  await storage.updateAdmin(admin.id, {
                    accessExpiresAt: expirationDate,
                    webinarLimit: plano.webinarLimit,
                    uploadLimit: plano.uploadLimit || plano.webinarLimit,
                    isActive: true,
                    planoId: plano.id,
                    paymentStatus: 'ok',
                    paymentFailedReason: null,
                  });
                  updateData.adminId = admin.id;
                  
                  // Send payment confirmation email (safe - never throws)
                  sendPaymentConfirmedEmailSafe(pagamento.email, pagamento.nome, plano.nome, expirationDate);
                  // Send WhatsApp notification if phone available (prefer admin phone for renewals)
                  const telefoneNotif3 = admin?.telefone || pagamento.telefone;
                  if (telefoneNotif3) {
                    sendWhatsAppPaymentConfirmedSafe(telefoneNotif3, pagamento.nome, plano.nome, expirationDate);
                  }
                } else {
                  // Create new admin
                  const tempPassword = generateTempPassword();
                  const bcrypt = await import('bcryptjs');
                  const hashedPassword = await bcrypt.hash(tempPassword, 10);
                  
                  admin = await storage.createAdmin({
                    name: pagamento.nome,
                    email: pagamento.email,
                    password: hashedPassword,
                    telefone: pagamento.telefone,
                    role: 'user',
                    webinarLimit: plano.webinarLimit,
                    uploadLimit: plano.uploadLimit || plano.webinarLimit,
                    isActive: true,
                    accessExpiresAt: expirationDate,
                    planoId: plano.id,
                    paymentStatus: 'ok',
                  });
                  updateData.adminId = admin.id;
                  
                  console.log(`[MP Webhook] Created admin: ${pagamento.email}, temp password: ${tempPassword}`);
                  
                  // Send access credentials email for new users (safe - never throws)
                  sendAccessCredentialsEmailSafe(pagamento.email, pagamento.nome, tempPassword, plano.nome);
                  // Send WhatsApp credentials if phone available (new user - use pagamento.telefone)
                  if (pagamento.telefone) {
                    sendWhatsAppCredentialsSafe(pagamento.telefone, pagamento.nome, tempPassword, plano.nome, pagamento.email);
                  }
                }
                
                // Process affiliate sale if applicable (with scheduled payout)
                await processAffiliateSale(pagamento, plano, 'mercadopago');
              }
            }

            // Marcar status de pagamento como falho (permite login mas mostra tela de renovação)
            if (payment.status === 'rejected') {
              const admin = await storage.getAdminByEmail(pagamento.email);
              if (admin) {
                const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
                const errorInfo = getMercadoPagoErrorMessage(payment.status_detail);
                await storage.updateAdmin(admin.id, {
                  paymentStatus: 'failed',
                  paymentFailedReason: `${errorInfo.message} ${errorInfo.action}`,
                });
                console.log(`[MP Webhook] Payment failed for ${pagamento.email}: ${payment.status_detail}`);
                
                // Send payment failed email with direct checkout link (safe - never throws)
                sendPaymentFailedEmailSafe(
                  pagamento.email, 
                  pagamento.nome, 
                  plano?.nome || "Seu Plano",
                  `${errorInfo.message} ${errorInfo.action}`,
                  pagamento.planoId
                );
                // Send WhatsApp notification if phone available (prefer admin phone)
                const telefoneNotif4 = admin?.telefone || pagamento.telefone;
                if (telefoneNotif4) {
                  sendWhatsAppPaymentFailedSafe(telefoneNotif4, pagamento.nome, plano?.nome || "Seu Plano", `${errorInfo.message}`);
                }
              }
            }

            await storage.updateCheckoutPagamento(pagamentoId, updateData);
            console.log(`[MP Webhook] Updated payment ${pagamentoId} to status: ${payment.status}`);
          }
        }
      }

      // Handle authorized_payment (recurring payment for subscription)
      // This is the REAL payment event - grant access here!
      if (type === 'subscription_authorized_payment') {
        console.log('[MP Webhook] Subscription PAYMENT received - this is the real charge!');
        
        const paymentId = data?.id;
        if (paymentId) {
          // Fetch the authorized payment details
          const paymentResponse = await fetch(
            `https://api.mercadopago.com/authorized_payments/${paymentId}`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            }
          );
          
          if (paymentResponse.ok) {
            const paymentData = await paymentResponse.json();
            console.log('[MP Webhook] Authorized payment data:', JSON.stringify(paymentData, null, 2));
            
            const preapprovalId = paymentData.preapproval_id;
            
            // Get the preapproval to find the external_reference (pagamentoId)
            if (preapprovalId) {
              const preapprovalResponse = await fetch(
                `https://api.mercadopago.com/preapproval/${preapprovalId}`,
                {
                  headers: { 'Authorization': `Bearer ${accessToken}` },
                }
              );
              
              if (preapprovalResponse.ok) {
                const preapproval = await preapprovalResponse.json();
                const pagamentoId = preapproval.external_reference;
                
                if (pagamentoId && paymentData.status === 'approved') {
                  const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
                  if (pagamento) {
                    const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
                    
                    if (plano) {
                      // Calculate expiration date based on plan type
                      const expirationDate = new Date();
                      if (plano.tipoCobranca === 'recorrente') {
                        // For recurring: use frequencia + frequenciaTipo
                        const freq = plano.frequencia || 1;
                        const freqTipo = plano.frequenciaTipo || 'months';
                        
                        if (freqTipo === 'days') {
                          expirationDate.setDate(expirationDate.getDate() + freq);
                        } else if (freqTipo === 'weeks') {
                          expirationDate.setDate(expirationDate.getDate() + (freq * 7));
                        } else if (freqTipo === 'months') {
                          expirationDate.setMonth(expirationDate.getMonth() + freq);
                        } else if (freqTipo === 'years') {
                          expirationDate.setFullYear(expirationDate.getFullYear() + freq);
                        }
                      } else {
                        // For one-time payments: use prazoDias
                        expirationDate.setDate(expirationDate.getDate() + (plano.prazoDias || 30));
                      }
                      
                      // Update pagamento
                      await storage.updateCheckoutPagamento(pagamentoId, {
                        status: 'approved',
                        statusDetail: 'Pagamento da assinatura confirmado',
                        dataAprovacao: new Date(),
                        dataExpiracao: expirationDate,
                      });
                      
                      // Create or update admin - NOW we can grant access!
                      let admin = await storage.getAdminByEmail(pagamento.email);
                      
                      if (admin) {
                        await storage.updateAdmin(admin.id, {
                          accessExpiresAt: expirationDate,
                          webinarLimit: plano.webinarLimit,
                          uploadLimit: plano.uploadLimit || plano.webinarLimit,
                          isActive: true,
                          planoId: plano.id,
                          paymentStatus: 'ok',
                          paymentFailedReason: null,
                        });
                        console.log(`[MP Webhook] PAYMENT CONFIRMED - Updated admin ${pagamento.email}`);
                        
                        // Reactivate subscription if it was in payment_failed status
                        const assinatura = await storage.getCheckoutAssinaturaByAdminId(admin.id);
                        if (assinatura && assinatura.status !== 'active') {
                          await storage.updateCheckoutAssinatura(assinatura.id, {
                            status: 'active',
                            proximoPagamento: expirationDate,
                          });
                          console.log(`[MP Webhook] Reactivated subscription ${assinatura.id} from ${assinatura.status} to active`);
                        }
                        
                        // Send payment confirmation email (safe - never throws)
                        sendPaymentConfirmedEmailSafe(pagamento.email, pagamento.nome, plano.nome, expirationDate);
                        // Send WhatsApp notification if phone available (prefer admin phone for renewals)
                        const telefoneNotif5 = admin?.telefone || pagamento.telefone;
                        if (telefoneNotif5) {
                          sendWhatsAppPaymentConfirmedSafe(telefoneNotif5, pagamento.nome, plano.nome, expirationDate);
                        }
                      } else {
                        // Create new admin
                        const tempPassword = generateTempPassword();
                        const bcrypt = await import('bcryptjs');
                        const hashedPassword = await bcrypt.hash(tempPassword, 10);
                        
                        admin = await storage.createAdmin({
                          name: pagamento.nome,
                          email: pagamento.email,
                          password: hashedPassword,
                          telefone: pagamento.telefone,
                          role: 'user',
                          webinarLimit: plano.webinarLimit,
                          uploadLimit: plano.uploadLimit || plano.webinarLimit,
                          isActive: true,
                          accessExpiresAt: expirationDate,
                          planoId: plano.id,
                          paymentStatus: 'ok',
                        });
                        
                        console.log(`[MP Webhook] PAYMENT CONFIRMED - Created admin ${pagamento.email}, temp password: ${tempPassword}`);
                        
                        // Send access credentials email (safe - never throws)
                        sendAccessCredentialsEmailSafe(pagamento.email, pagamento.nome, tempPassword, plano.nome);
                        // Send WhatsApp credentials if phone available (new user - use pagamento.telefone)
                        if (pagamento.telefone) {
                          sendWhatsAppCredentialsSafe(pagamento.telefone, pagamento.nome, tempPassword, plano.nome, pagamento.email);
                        }
                      }
                      
                      // Process affiliate sale if applicable
                      await processAffiliateSale(pagamento, plano);
                    }
                  }
                }
              }
            }
          }
        }
      }

      res.status(200).send('OK');
    } catch (error: any) {
      console.error('[MP Webhook] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Webhook - Stripe (with signature verification)
  app.post("/webhook/stripe", async (req, res) => {
    try {
      const sig = req.headers['stripe-signature'] as string;
      const webhookSecret = await storage.getCheckoutConfig('STRIPE_WEBHOOK_SECRET');
      
      // Validate webhook signature if secret is configured
      if (webhookSecret && sig) {
        const crypto = await import('crypto');
        // Use the raw body captured by Express middleware for accurate signature verification
        const rawBody = (req as any).rawBody instanceof Buffer 
          ? (req as any).rawBody.toString('utf8') 
          : JSON.stringify(req.body);
        
        console.log(`[Stripe Webhook] Raw body source: ${(req as any).rawBody instanceof Buffer ? 'Buffer' : 'JSON.stringify'}`);
        
        // Parse stripe-signature header
        const elements = sig.split(',').reduce((acc: any, part) => {
          const [key, value] = part.split('=');
          acc[key] = value;
          return acc;
        }, {});
        
        const timestamp = elements.t;
        const receivedSignature = elements.v1;
        
        if (!timestamp || !receivedSignature) {
          console.error('[Stripe Webhook] Invalid signature format');
          return res.status(400).json({ error: 'Invalid signature format' });
        }
        
        // Verify timestamp is recent (within 5 minutes)
        const tolerance = 300; // 5 minutes
        const timestampSeconds = parseInt(timestamp, 10);
        const currentTime = Math.floor(Date.now() / 1000);
        
        if (Math.abs(currentTime - timestampSeconds) > tolerance) {
          console.error('[Stripe Webhook] Timestamp too old');
          return res.status(400).json({ error: 'Timestamp out of tolerance' });
        }
        
        // Compute expected signature
        const signedPayload = `${timestamp}.${rawBody}`;
        const expectedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(signedPayload, 'utf8')
          .digest('hex');
        
        // Compare signatures securely
        const sigBuffer = Buffer.from(receivedSignature, 'hex');
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');
        
        if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
          console.error('[Stripe Webhook] Signature verification failed');
          return res.status(400).json({ error: 'Signature verification failed' });
        }
        
        console.log('[Stripe Webhook] Signature verified successfully');
      } else if (webhookSecret) {
        // Webhook secret configured but no signature provided
        console.error('[Stripe Webhook] Missing stripe-signature header');
        return res.status(400).json({ error: 'Missing signature' });
      } else {
        // No webhook secret configured - log warning but continue (development mode)
        console.warn('[Stripe Webhook] No webhook secret configured - accepting unverified event (INSECURE)');
      }
      
      const event = req.body;
      console.log('[Stripe Webhook] Received:', event.type);
      
      // Verify the event has required structure
      if (!event?.type || !event?.data?.object) {
        console.error('[Stripe Webhook] Invalid event structure');
        return res.status(400).json({ error: 'Invalid event structure' });
      }
      
      // Handle checkout.session.completed (Stripe Checkout Session)
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const pagamentoId = session.metadata?.pagamentoId;
        
        if (pagamentoId) {
          const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
          if (pagamento) {
            const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
            
            // Use real dates from Stripe (created is Unix timestamp in seconds)
            const paymentDate = session.created ? new Date(session.created * 1000) : new Date();
            
            const updateData: any = {
              status: 'approved',
              statusDetail: 'Pagamento confirmado via Stripe Checkout',
              metodoPagamento: session.payment_method_types?.[0] || 'card',
              stripePaymentIntentId: session.payment_intent || session.id,
              dataPagamento: paymentDate,
              dataAprovacao: paymentDate,
            };

            if (plano) {
              // Calculate expiration date based on plan type
              const expirationDate = new Date();
              if (plano.tipoCobranca === 'recorrente') {
                const freq = plano.frequencia || 1;
                const freqTipo = plano.frequenciaTipo || 'months';
                
                if (freqTipo === 'days') {
                  expirationDate.setDate(expirationDate.getDate() + freq);
                } else if (freqTipo === 'weeks') {
                  expirationDate.setDate(expirationDate.getDate() + (freq * 7));
                } else if (freqTipo === 'months') {
                  expirationDate.setMonth(expirationDate.getMonth() + freq);
                } else if (freqTipo === 'years') {
                  expirationDate.setFullYear(expirationDate.getFullYear() + freq);
                }
              } else {
                expirationDate.setDate(expirationDate.getDate() + (plano.prazoDias || 30));
              }
              updateData.dataExpiracao = expirationDate;

              let admin = await storage.getAdminByEmail(pagamento.email);
              
              if (admin) {
                await storage.updateAdmin(admin.id, {
                  accessExpiresAt: expirationDate,
                  webinarLimit: plano.webinarLimit,
                  isActive: true,
                });
                updateData.adminId = admin.id;
                
                // Send payment confirmation email for existing users (safe - never throws)
                sendPaymentConfirmedEmailSafe(pagamento.email, pagamento.nome, plano.nome, expirationDate);
                // Send WhatsApp notification if phone available (prefer admin phone for renewals)
                const telefoneNotif6 = admin?.telefone || pagamento.telefone;
                if (telefoneNotif6) {
                  sendWhatsAppPaymentConfirmedSafe(telefoneNotif6, pagamento.nome, plano.nome, expirationDate);
                }
              } else {
                const tempPassword = generateTempPassword();
                const bcrypt = await import('bcryptjs');
                const hashedPassword = await bcrypt.hash(tempPassword, 10);
                
                admin = await storage.createAdmin({
                  name: pagamento.nome,
                  email: pagamento.email,
                  password: hashedPassword,
                  role: 'user',
                  webinarLimit: plano.webinarLimit,
                  isActive: true,
                  accessExpiresAt: expirationDate,
                });
                updateData.adminId = admin.id;
                
                console.log(`[Stripe Webhook] Created admin: ${pagamento.email}, temp password: ${tempPassword}`);
                
                // Send access credentials email for new users (safe - never throws)
                sendAccessCredentialsEmailSafe(pagamento.email, pagamento.nome, tempPassword, plano.nome);
                // Send WhatsApp credentials if phone available (new user - use pagamento.telefone)
                if (pagamento.telefone) {
                  sendWhatsAppCredentialsSafe(pagamento.telefone, pagamento.nome, tempPassword, plano.nome, pagamento.email);
                }
              }
              
              // Process affiliate sale if applicable (with scheduled payout)
              await processAffiliateSale(pagamento, plano, 'stripe');
            }

            await storage.updateCheckoutPagamento(pagamentoId, updateData);
            console.log(`[Stripe Webhook] Updated payment ${pagamentoId} to approved`);
          }
        }
      }

      // Handle payment_intent.succeeded (for Stripe Elements transparent checkout)
      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const pagamentoId = paymentIntent.metadata?.pagamentoId;
        
        if (pagamentoId) {
          const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
          if (pagamento && pagamento.status !== 'approved') {
            const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
            
            // Use real dates from Stripe (created is Unix timestamp in seconds)
            const paymentDate = paymentIntent.created ? new Date(paymentIntent.created * 1000) : new Date();
            
            // Detect payment method type (card, pix, boleto)
            const paymentMethodType = paymentIntent.payment_method_types?.[0] || 
                                     paymentIntent.charges?.data?.[0]?.payment_method_details?.type || 
                                     'card';
            
            const updateData: any = {
              status: 'approved',
              statusDetail: paymentMethodType === 'pix' 
                ? 'Pagamento PIX confirmado' 
                : paymentMethodType === 'boleto' 
                  ? 'Pagamento Boleto confirmado'
                  : 'Pagamento confirmado via Stripe Elements',
              metodoPagamento: paymentMethodType,
              stripePaymentIntentId: paymentIntent.id,
              dataPagamento: paymentDate,
              dataAprovacao: paymentDate,
            };

            if (plano) {
              // Calculate expiration date based on plan type
              const expirationDate = new Date();
              if (plano.tipoCobranca === 'recorrente') {
                const freq = plano.frequencia || 1;
                const freqTipo = plano.frequenciaTipo || 'months';
                
                if (freqTipo === 'days') {
                  expirationDate.setDate(expirationDate.getDate() + freq);
                } else if (freqTipo === 'weeks') {
                  expirationDate.setDate(expirationDate.getDate() + (freq * 7));
                } else if (freqTipo === 'months') {
                  expirationDate.setMonth(expirationDate.getMonth() + freq);
                } else if (freqTipo === 'years') {
                  expirationDate.setFullYear(expirationDate.getFullYear() + freq);
                }
              } else {
                expirationDate.setDate(expirationDate.getDate() + (plano.prazoDias || 30));
              }
              updateData.dataExpiracao = expirationDate;

              let admin = await storage.getAdminByEmail(pagamento.email);
              
              if (admin) {
                await storage.updateAdmin(admin.id, {
                  accessExpiresAt: expirationDate,
                  webinarLimit: plano.webinarLimit,
                  uploadLimit: plano.uploadLimit || plano.webinarLimit,
                  isActive: true,
                  planoId: plano.id,
                  paymentStatus: 'ok',
                  paymentFailedReason: null,
                });
                updateData.adminId = admin.id;
                
                // Send payment confirmation email for existing users (safe - never throws)
                sendPaymentConfirmedEmailSafe(pagamento.email, pagamento.nome, plano.nome, expirationDate);
                // Send WhatsApp notification if phone available (prefer admin phone for renewals)
                const telefoneNotif7 = admin?.telefone || pagamento.telefone;
                if (telefoneNotif7) {
                  sendWhatsAppPaymentConfirmedSafe(telefoneNotif7, pagamento.nome, plano.nome, expirationDate);
                }
              } else {
                const tempPassword = generateTempPassword();
                const bcrypt = await import('bcryptjs');
                const hashedPassword = await bcrypt.hash(tempPassword, 10);
                
                admin = await storage.createAdmin({
                  name: pagamento.nome,
                  email: pagamento.email,
                  password: hashedPassword,
                  telefone: pagamento.telefone,
                  role: 'user',
                  webinarLimit: plano.webinarLimit,
                  uploadLimit: plano.uploadLimit || plano.webinarLimit,
                  isActive: true,
                  accessExpiresAt: expirationDate,
                  planoId: plano.id,
                  paymentStatus: 'ok',
                });
                updateData.adminId = admin.id;
                
                console.log(`[Stripe Webhook] Created admin via PI: ${pagamento.email}, temp password: ${tempPassword}`);
                
                // Send access credentials email for new users (safe - never throws)
                sendAccessCredentialsEmailSafe(pagamento.email, pagamento.nome, tempPassword, plano.nome);
                // Send WhatsApp credentials if phone available (new user - use pagamento.telefone)
                if (pagamento.telefone) {
                  sendWhatsAppCredentialsSafe(pagamento.telefone, pagamento.nome, tempPassword, plano.nome, pagamento.email);
                }
              }
              
              // Process affiliate sale if applicable (with scheduled payout)
              await processAffiliateSale(pagamento, plano, 'stripe');
            }

            await storage.updateCheckoutPagamento(pagamentoId, updateData);
            console.log(`[Stripe Webhook] Updated payment ${pagamentoId} to approved via Payment Intent`);
          }
        }
      }

      // Handle invoice.paid (for recurring subscriptions)
      if (event.type === 'invoice.paid') {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        const pagamentoId = invoice.subscription_details?.metadata?.pagamentoId || 
                           invoice.metadata?.pagamentoId;
        
        console.log(`[Stripe Webhook] Invoice paid for subscription: ${subscriptionId}`);
        
        if (pagamentoId) {
          const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
          if (pagamento) {
            const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
            
            if (plano) {
              // Calculate expiration date based on plan type
              const expirationDate = new Date();
              if (plano.tipoCobranca === 'recorrente') {
                const freq = plano.frequencia || 1;
                const freqTipo = plano.frequenciaTipo || 'months';
                
                if (freqTipo === 'days') {
                  expirationDate.setDate(expirationDate.getDate() + freq);
                } else if (freqTipo === 'weeks') {
                  expirationDate.setDate(expirationDate.getDate() + (freq * 7));
                } else if (freqTipo === 'months') {
                  expirationDate.setMonth(expirationDate.getMonth() + freq);
                } else if (freqTipo === 'years') {
                  expirationDate.setFullYear(expirationDate.getFullYear() + freq);
                }
              } else {
                expirationDate.setDate(expirationDate.getDate() + (plano.prazoDias || 30));
              }

              let admin = await storage.getAdminByEmail(pagamento.email);
              
              if (admin) {
                await storage.updateAdmin(admin.id, {
                  accessExpiresAt: expirationDate,
                  webinarLimit: plano.webinarLimit,
                  uploadLimit: plano.uploadLimit || plano.webinarLimit,
                  isActive: true,
                  planoId: plano.id,
                  paymentStatus: 'ok',
                  paymentFailedReason: null,
                });
                console.log(`[Stripe Webhook] Renewed subscription for ${pagamento.email}, expires: ${expirationDate}`);
                
                // Send payment confirmation email (safe - never throws)
                sendPaymentConfirmedEmailSafe(pagamento.email, pagamento.nome, plano.nome, expirationDate);
                // Send WhatsApp notification if phone available (prefer admin phone for renewals)
                const telefoneNotif8 = admin?.telefone || pagamento.telefone;
                if (telefoneNotif8) {
                  sendWhatsAppPaymentConfirmedSafe(telefoneNotif8, pagamento.nome, plano.nome, expirationDate);
                }
              } else {
                const tempPassword = generateTempPassword();
                const bcrypt = await import('bcryptjs');
                const hashedPassword = await bcrypt.hash(tempPassword, 10);
                
                admin = await storage.createAdmin({
                  name: pagamento.nome,
                  email: pagamento.email,
                  password: hashedPassword,
                  telefone: pagamento.telefone,
                  role: 'user',
                  webinarLimit: plano.webinarLimit,
                  uploadLimit: plano.uploadLimit || plano.webinarLimit,
                  isActive: true,
                  accessExpiresAt: expirationDate,
                  planoId: plano.id,
                  paymentStatus: 'ok',
                });
                console.log(`[Stripe Webhook] Created admin via subscription: ${pagamento.email}, temp password: ${tempPassword}`);
                
                // Send access credentials email for new users (safe - never throws)
                sendAccessCredentialsEmailSafe(pagamento.email, pagamento.nome, tempPassword, plano.nome);
                // Send WhatsApp credentials if phone available
                if (pagamento.telefone) {
                  sendWhatsAppCredentialsSafe(pagamento.telefone, pagamento.nome, tempPassword, plano.nome, pagamento.email);
                }
              }

              // Use real dates from Stripe invoice (status_transitions.paid_at is Unix timestamp)
              const invoicePaymentDate = invoice.status_transitions?.paid_at 
                ? new Date(invoice.status_transitions.paid_at * 1000) 
                : (invoice.created ? new Date(invoice.created * 1000) : new Date());
              
              await storage.updateCheckoutPagamento(pagamentoId, {
                status: 'approved',
                statusDetail: 'Assinatura ativa',
                dataPagamento: invoicePaymentDate,
                dataAprovacao: invoicePaymentDate,
                dataExpiracao: expirationDate,
                adminId: admin.id,
              });
            }
          }
        }
      }

      // Handle customer.subscription.deleted (subscription cancelled)
      if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        const pagamentoId = subscription.metadata?.pagamentoId;
        
        console.log(`[Stripe Webhook] Subscription cancelled: ${subscription.id}`);
        
        if (pagamentoId) {
          const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
          if (pagamento) {
            await storage.updateCheckoutPagamento(pagamentoId, {
              status: 'cancelled',
              statusDetail: 'Assinatura cancelada',
            });
            
            const admin = await storage.getAdminByEmail(pagamento.email);
            if (admin) {
              await storage.updateAdmin(admin.id, {
                // Keep isActive: true - user can login and see renewal screen
                paymentStatus: 'cancelled',
                accessExpiresAt: new Date(), // Expire now - frontend blocks tool access
              });
              console.log(`[Stripe Webhook] Marked expired for ${pagamento.email} (isActive stays true, login works)`);
              
              // Send plan expired email (safe - never throws)
              const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
              sendPlanExpiredEmailSafe(pagamento.email, pagamento.nome, plano?.nome || "Seu Plano", pagamento.planoId);
              // Send WhatsApp notification if phone available (prefer admin phone)
              const telefoneNotif9 = admin?.telefone || pagamento.telefone;
              if (telefoneNotif9) {
                sendWhatsAppPlanExpiredSafe(telefoneNotif9, pagamento.nome, plano?.nome || "Seu Plano", pagamento.email, pagamento.planoId);
              }
            }
          }
        }
      }

      // Handle invoice.payment_failed (subscription payment failure)
      // BLOQUEIA ACESSO IMEDIATAMENTE quando renovação falhar
      if (event.type === 'invoice.payment_failed') {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        const pagamentoId = invoice.subscription_details?.metadata?.pagamentoId || 
                           invoice.metadata?.pagamentoId;
        
        console.log(`[Stripe Webhook] Invoice payment failed for subscription: ${subscriptionId}`);
        
        if (pagamentoId) {
          const pagamento = await storage.getCheckoutPagamentoById(pagamentoId);
          if (pagamento) {
            const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
            const failureMessage = invoice.last_finalization_error?.message || 
                                   invoice.last_payment_error?.message || 
                                   "Cartão recusado ou limite insuficiente";
            
            // Marcar status de pagamento como falho (permite login mas mostra tela de renovação)
            const admin = await storage.getAdminByEmail(pagamento.email);
            if (admin) {
              await storage.updateAdmin(admin.id, {
                paymentStatus: 'failed',
                paymentFailedReason: failureMessage,
              });
              console.log(`[Stripe Webhook] Payment failed for ${pagamento.email}: ${failureMessage}`);
            }
            
            // Update payment status
            await storage.updateCheckoutPagamento(pagamentoId, {
              status: 'payment_failed',
              statusDetail: failureMessage,
            });
            
            // Send payment failed email with direct checkout link (safe - never throws)
            sendPaymentFailedEmailSafe(
              pagamento.email, 
              pagamento.nome, 
              plano?.nome || "Seu Plano",
              failureMessage,
              pagamento.planoId
            );
            // Send WhatsApp notification if phone available (prefer admin phone)
            const telefoneNotif10 = admin?.telefone || pagamento.telefone;
            if (telefoneNotif10) {
              sendWhatsAppPaymentFailedSafe(telefoneNotif10, pagamento.nome, plano?.nome || "Seu Plano", failureMessage);
            }
            
            console.log(`[Stripe Webhook] Sent payment failed email to ${pagamento.email}`);
          }
        }
      }

      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('[Stripe Webhook] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Checkout - Pagamentos (Admin - superadmin only)
  app.get("/api/checkout/pagamentos", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const pagamentos = await storage.listCheckoutPagamentos();
      res.json(pagamentos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Deletar histórico de pagamentos com filtros (superadmin only)
  app.delete("/api/checkout/pagamentos/historico", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const { dataInicio, dataFim, status } = req.body;

      // Get all payments first
      let pagamentos = await storage.listCheckoutPagamentos();
      
      // Apply filters
      if (dataInicio) {
        const inicio = new Date(dataInicio);
        inicio.setHours(0, 0, 0, 0);
        pagamentos = pagamentos.filter(p => new Date(p.criadoEm!) >= inicio);
      }
      
      if (dataFim) {
        const fim = new Date(dataFim);
        fim.setHours(23, 59, 59, 999);
        pagamentos = pagamentos.filter(p => new Date(p.criadoEm!) <= fim);
      }
      
      if (status) {
        switch (status) {
          case "approved":
            pagamentos = pagamentos.filter(p => p.status === "approved");
            break;
          case "pending":
            pagamentos = pagamentos.filter(p => ["pending", "in_process"].includes(p.status));
            break;
          case "rejected":
            pagamentos = pagamentos.filter(p => ["rejected", "cancelled", "refunded"].includes(p.status));
            break;
          case "expired":
            pagamentos = pagamentos.filter(p => p.status === "expired");
            break;
          case "abandoned":
            pagamentos = pagamentos.filter(p => ["abandoned", "checkout_iniciado"].includes(p.status));
            break;
          case "auto_renewal":
            pagamentos = pagamentos.filter(p => p.statusDetail?.includes("Auto-renewal") || p.statusDetail?.includes("Renovação"));
            break;
        }
      }

      // Delete filtered payments
      let deletados = 0;
      for (const pagamento of pagamentos) {
        await storage.deleteCheckoutPagamento(pagamento.id);
        deletados++;
      }

      console.log(`[Admin] Deleted ${deletados} payment records by ${email}`);
      res.json({ deletados });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/checkout/pagamentos/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const pagamento = await storage.getCheckoutPagamentoById(req.params.id);
      if (!pagamento) {
        return res.status(404).json({ error: "Pagamento não encontrado" });
      }
      res.json(pagamento);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Buscar pagamentos por email de usuário (superadmin only)
  app.get("/api/checkout/pagamentos/user/:userEmail", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const userEmail = decodeURIComponent(req.params.userEmail);
      const userPagamentos = await storage.listCheckoutPagamentosByEmail(userEmail);
      
      res.json(userPagamentos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Sincronizar status de assinaturas do Mercado Pago (superadmin only)
  app.post("/api/checkout/sync-mercadopago-subscriptions", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const adminUser = await storage.getAdminByEmail(email);
      if (!adminUser || adminUser.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const accessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
      if (!accessToken) {
        return res.status(400).json({ error: "Mercado Pago não configurado" });
      }

      // Get all payments that have a mercadopagoPaymentId (these are subscriptions/preapprovals)
      const allPagamentos = await storage.listCheckoutPagamentos();
      const subscriptionPagamentos = allPagamentos.filter(p => 
        p.mercadopagoPaymentId && 
        (p.status === 'approved' || p.status === 'pending' || p.status === 'authorized')
      );

      const results = {
        total: subscriptionPagamentos.length,
        synced: 0,
        errors: 0,
        deactivated: 0,
        reactivated: 0,
        details: [] as { email: string; oldStatus: string; newStatus: string; action: string }[]
      };

      for (const pagamento of subscriptionPagamentos) {
        try {
          const preapprovalId = pagamento.mercadopagoPaymentId;
          
          // Fetch current status from Mercado Pago
          const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });

          if (!mpResponse.ok) {
            // Try as regular payment if preapproval fails
            const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${preapprovalId}`, {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            });
            
            if (!paymentResponse.ok) {
              results.errors++;
              continue;
            }
            
            // Regular payment - skip for now (not a subscription)
            continue;
          }

          const preapproval = await mpResponse.json();
          const mpStatus = preapproval.status;
          
          console.log(`[Sync] Checking ${pagamento.email}: MP status = "${mpStatus}", local status = "${pagamento.status}"`);
          
          // Check if status changed
          const admin = await storage.getAdminByEmail(pagamento.email);
          let action = 'no_change';
          
          console.log(`[Sync] Admin ${pagamento.email}: isActive = ${admin?.isActive}, paymentStatus = ${admin?.paymentStatus}`);
          
          if (mpStatus === 'paused' || mpStatus === 'cancelled' || mpStatus === 'pending') {
            // Mark expired but keep isActive=true so user can login and see renewal screen
            if (admin && admin.paymentStatus !== mpStatus) {
              const wasExpired = admin.accessExpiresAt && new Date(admin.accessExpiresAt) <= new Date();
              await storage.updateAdmin(admin.id, {
                // Keep isActive: true - user can login and see renewal screen
                paymentStatus: mpStatus,
                accessExpiresAt: new Date(), // Expire now - frontend blocks tool access
              });
              if (!wasExpired) {
                results.deactivated++;
                action = 'deactivated';
              }
              console.log(`[Sync] Marked expired for ${pagamento.email} - MP status: "${mpStatus}" (isActive stays true, login works)`);
            }
            
            if (pagamento.status !== mpStatus && pagamento.status !== 'cancelled') {
              const newLocalStatus = mpStatus === 'cancelled' ? 'cancelled' : (mpStatus === 'paused' ? 'paused' : 'pending');
              await storage.updateCheckoutPagamento(pagamento.id, {
                status: newLocalStatus,
                statusDetail: `Assinatura ${mpStatus} (sincronizado)`,
              });
            }
          } else if (mpStatus === 'authorized') {
            // Check if there are actual payments
            let hasPayment = false;
            try {
              const paymentsResponse = await fetch(
                `https://api.mercadopago.com/preapproval/${preapprovalId}/authorized_payments`,
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
              );
              if (paymentsResponse.ok) {
                const paymentsData = await paymentsResponse.json();
                hasPayment = paymentsData.results?.some(
                  (p: any) => p.status === 'approved' || p.status === 'authorized'
                ) || false;
              }
            } catch {}
            
            if (hasPayment && admin && !admin.isActive) {
              // Should be active but isn't - reactivate
              const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
              if (plano) {
                const expirationDate = new Date();
                if (plano.tipoCobranca === 'recorrente') {
                  const freq = plano.frequencia || 1;
                  const freqTipo = plano.frequenciaTipo || 'months';
                  if (freqTipo === 'days') expirationDate.setDate(expirationDate.getDate() + freq);
                  else if (freqTipo === 'weeks') expirationDate.setDate(expirationDate.getDate() + (freq * 7));
                  else if (freqTipo === 'months') expirationDate.setMonth(expirationDate.getMonth() + freq);
                  else if (freqTipo === 'years') expirationDate.setFullYear(expirationDate.getFullYear() + freq);
                } else {
                  expirationDate.setDate(expirationDate.getDate() + (plano.prazoDias || 30));
                }
                
                await storage.updateAdmin(admin.id, {
                  isActive: true,
                  paymentStatus: 'ok',
                  accessExpiresAt: expirationDate,
                });
                results.reactivated++;
                action = 'reactivated';
              }
            }
          }
          
          results.synced++;
          if (action !== 'no_change') {
            results.details.push({
              email: pagamento.email,
              oldStatus: pagamento.status,
              newStatus: mpStatus,
              action,
            });
          }
        } catch (err) {
          console.error(`[Sync] Error syncing ${pagamento.email}:`, err);
          results.errors++;
        }
      }

      console.log(`[Sync] Mercado Pago sync complete:`, results);
      res.json(results);
    } catch (error: any) {
      console.error('[Sync] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Sincronizar assinatura individual de um usuário (superadmin only)
  app.post("/api/checkout/sync-user-subscription/:userEmail", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const adminUser = await storage.getAdminByEmail(email);
      if (!adminUser || adminUser.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const accessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
      if (!accessToken) {
        return res.status(400).json({ error: "Mercado Pago não configurado" });
      }

      const userEmail = decodeURIComponent(req.params.userEmail);
      const userPagamentos = await storage.listCheckoutPagamentosByEmail(userEmail);
      
      // Find the most recent subscription payment
      const subscriptionPayment = userPagamentos.find(p => p.mercadopagoPaymentId);
      
      if (!subscriptionPayment) {
        return res.status(404).json({ error: "Nenhuma assinatura encontrada para este usuário" });
      }

      const preapprovalId = subscriptionPayment.mercadopagoPaymentId;
      
      // Fetch current status from Mercado Pago
      const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (!mpResponse.ok) {
        const errorText = await mpResponse.text();
        return res.status(400).json({ error: `Erro ao buscar assinatura no Mercado Pago: ${errorText}` });
      }

      const preapproval = await mpResponse.json();
      const mpStatus = preapproval.status;
      
      const admin = await storage.getAdminByEmail(userEmail);
      let action = 'no_change';
      let message = '';
      
      if (mpStatus === 'paused' || mpStatus === 'cancelled' || mpStatus === 'pending') {
        // Mark expired but keep isActive=true so user can login and see renewal screen
        if (admin && admin.paymentStatus !== mpStatus) {
          const wasExpired = admin.accessExpiresAt && new Date(admin.accessExpiresAt) <= new Date();
          await storage.updateAdmin(admin.id, {
            // Keep isActive: true - user can login and see renewal screen
            paymentStatus: mpStatus,
            accessExpiresAt: new Date(), // Expire now - frontend blocks tool access
          });
          action = !wasExpired ? 'deactivated' : 'updated';
          message = `Assinatura marcada como expirada - ${mpStatus} no Mercado Pago (isActive permanece true, login funciona)`;
        } else {
          message = `Usuário já estava com status correto - MP: ${mpStatus}`;
        }
        
        const newLocalStatus = mpStatus === 'cancelled' ? 'cancelled' : (mpStatus === 'paused' ? 'paused' : 'pending');
        await storage.updateCheckoutPagamento(subscriptionPayment.id, {
          status: newLocalStatus,
          statusDetail: `Assinatura ${mpStatus} (sincronizado)`,
        });
      } else if (mpStatus === 'authorized') {
        // Check for actual payments
        let hasPayment = false;
        try {
          const paymentsResponse = await fetch(
            `https://api.mercadopago.com/preapproval/${preapprovalId}/authorized_payments`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );
          if (paymentsResponse.ok) {
            const paymentsData = await paymentsResponse.json();
            hasPayment = paymentsData.results?.some(
              (p: any) => p.status === 'approved' || p.status === 'authorized'
            ) || false;
          }
        } catch {}
        
        if (hasPayment) {
          if (admin && !admin.isActive) {
            const plano = await storage.getCheckoutPlanoById(subscriptionPayment.planoId);
            if (plano) {
              const expirationDate = new Date();
              if (plano.tipoCobranca === 'recorrente') {
                const freq = plano.frequencia || 1;
                const freqTipo = plano.frequenciaTipo || 'months';
                if (freqTipo === 'days') expirationDate.setDate(expirationDate.getDate() + freq);
                else if (freqTipo === 'weeks') expirationDate.setDate(expirationDate.getDate() + (freq * 7));
                else if (freqTipo === 'months') expirationDate.setMonth(expirationDate.getMonth() + freq);
                else if (freqTipo === 'years') expirationDate.setFullYear(expirationDate.getFullYear() + freq);
              } else {
                expirationDate.setDate(expirationDate.getDate() + (plano.prazoDias || 30));
              }
              
              await storage.updateAdmin(admin.id, {
                isActive: true,
                paymentStatus: 'ok',
                accessExpiresAt: expirationDate,
              });
              action = 'reactivated';
              message = `Usuário reativado - assinatura ativa com pagamento confirmado`;
            }
          } else {
            message = `Usuário já estava ativo - assinatura autorizada com pagamento`;
          }
        } else {
          message = `Assinatura autorizada mas sem pagamento confirmado ainda`;
        }
      } else {
        message = `Status da assinatura no Mercado Pago: ${mpStatus}`;
      }

      res.json({
        email: userEmail,
        mercadopagoStatus: mpStatus,
        systemStatus: admin?.isActive ? 'active' : 'inactive',
        action,
        message,
        preapprovalId,
      });
    } catch (error: any) {
      console.error('[Sync User] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get detailed Mercado Pago subscription info for a user
  app.get("/api/checkout/mercadopago/subscription/:userEmail", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const adminUser = await storage.getAdminByEmail(email);
      if (!adminUser || adminUser.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const accessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
      if (!accessToken) {
        return res.status(400).json({ error: "Mercado Pago não configurado" });
      }

      const userEmail = decodeURIComponent(req.params.userEmail);
      const userPagamentos = await storage.listCheckoutPagamentosByEmail(userEmail);
      
      // Find the most recent subscription payment
      const subscriptionPayment = userPagamentos.find(p => p.mercadopagoPaymentId);
      
      if (!subscriptionPayment) {
        return res.status(404).json({ error: "Nenhuma assinatura encontrada para este usuário" });
      }

      const preapprovalId = subscriptionPayment.mercadopagoPaymentId;
      
      // Fetch subscription details from Mercado Pago
      const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (!mpResponse.ok) {
        const errorText = await mpResponse.text();
        return res.status(400).json({ error: `Erro ao buscar assinatura: ${errorText}` });
      }

      const preapproval = await mpResponse.json();
      console.log(`[MP Subscription] Preapproval data for ${userEmail}:`, JSON.stringify({
        id: preapproval.id,
        status: preapproval.status,
        payer_email: preapproval.payer_email,
        reason: preapproval.reason,
      }));
      
      // Fetch payment history from authorized_payments endpoint
      let paymentHistory: any[] = [];
      try {
        const paymentsResponse = await fetch(
          `https://api.mercadopago.com/preapproval/${preapprovalId}/authorized_payments`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        const paymentsData = await paymentsResponse.json();
        console.log(`[MP Subscription] authorized_payments response:`, JSON.stringify(paymentsData));
        if (paymentsResponse.ok) {
          paymentHistory = paymentsData.results || [];
        }
      } catch (err) {
        console.error('[MP Subscription] Error fetching authorized_payments:', err);
      }

      // Also search for payments by preapproval_id in payments API
      try {
        const searchResponse = await fetch(
          `https://api.mercadopago.com/v1/payments/search?preapproval_id=${preapprovalId}&sort=date_created&criteria=desc`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        const searchData = await searchResponse.json();
        console.log(`[MP Subscription] search by preapproval_id response: ${searchData.results?.length || 0} results`);
        if (searchResponse.ok) {
          const searchResults = searchData.results || [];
          for (const payment of searchResults) {
            if (!paymentHistory.find((p: any) => p.id === payment.id)) {
              paymentHistory.push(payment);
            }
          }
        }
      } catch (err) {
        console.error('[MP Subscription] Error searching payments:', err);
      }

      // Also search by payer email if we have it
      if (preapproval.payer_email) {
        try {
          const emailSearchResponse = await fetch(
            `https://api.mercadopago.com/v1/payments/search?payer.email=${encodeURIComponent(preapproval.payer_email)}&sort=date_created&criteria=desc&limit=20`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );
          const emailSearchData = await emailSearchResponse.json();
          console.log(`[MP Subscription] search by email response: ${emailSearchData.results?.length || 0} results`);
          if (emailSearchResponse.ok) {
            const emailResults = emailSearchData.results || [];
            for (const payment of emailResults) {
              if (!paymentHistory.find((p: any) => p.id === payment.id)) {
                paymentHistory.push(payment);
              }
            }
          }
        } catch (err) {
          console.error('[MP Subscription] Error searching by email:', err);
        }
      }

      // Search by external_reference (usually the user's internal ID)
      if (preapproval.external_reference) {
        try {
          const extRefSearchResponse = await fetch(
            `https://api.mercadopago.com/v1/payments/search?external_reference=${preapproval.external_reference}&sort=date_created&criteria=desc&limit=20`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );
          const extRefData = await extRefSearchResponse.json();
          console.log(`[MP Subscription] search by external_reference response: ${extRefData.results?.length || 0} results`);
          if (extRefSearchResponse.ok) {
            const extRefResults = extRefData.results || [];
            for (const payment of extRefResults) {
              if (!paymentHistory.find((p: any) => p.id === payment.id)) {
                paymentHistory.push(payment);
              }
            }
          }
        } catch (err) {
          console.error('[MP Subscription] Error searching by external_reference:', err);
        }
      }

      // Search by payer_id if available
      if (preapproval.payer_id) {
        try {
          const payerIdSearchResponse = await fetch(
            `https://api.mercadopago.com/v1/payments/search?payer.id=${preapproval.payer_id}&sort=date_created&criteria=desc&limit=20`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );
          const payerIdData = await payerIdSearchResponse.json();
          console.log(`[MP Subscription] search by payer_id response: ${payerIdData.results?.length || 0} results`);
          if (payerIdSearchResponse.ok) {
            const payerIdResults = payerIdData.results || [];
            for (const payment of payerIdResults) {
              if (!paymentHistory.find((p: any) => p.id === payment.id)) {
                paymentHistory.push(payment);
              }
            }
          }
        } catch (err) {
          console.error('[MP Subscription] Error searching by payer_id:', err);
        }
      }
      
      console.log(`[MP Subscription] Total payments found from MP API: ${paymentHistory.length}`);
      
      // ALWAYS include local system payments with status approved (merge with MP API results)
      console.log(`[MP Subscription] Checking local system payments to merge...`);
      const localPayments = userPagamentos.filter(p => 
        p.status === 'approved' || p.dataAprovacao
      );
      console.log(`[MP Subscription] Found ${localPayments.length} approved local payments`);
      for (const localP of localPayments) {
        // Check if this payment is already in the list (by matching amount and approximate date)
        const alreadyExists = paymentHistory.find((p: any) => {
          if (p.id === localP.id) return true;
          if (p.source === 'local' && p.id === localP.id) return true;
          // Match by MP payment ID if stored
          if (localP.mercadopagoPaymentId && p.id?.toString() === localP.mercadopagoPaymentId) return true;
          return false;
        });
        
        if (!alreadyExists) {
          paymentHistory.push({
            id: localP.id,
            status: localP.status === 'approved' ? 'approved' : localP.status,
            status_detail: localP.statusDetail || 'Pagamento registrado no sistema',
            transaction_amount: localP.valor / 100, // Convert from cents
            date_created: localP.criadoEm,
            date_approved: localP.dataAprovacao,
            payment_method_id: localP.metodoPagamento,
            source: 'local', // Mark as local payment
          });
        }
      }
      console.log(`[MP Subscription] Total payments after merge: ${paymentHistory.length}`);

      // Sort by date descending
      paymentHistory.sort((a: any, b: any) => {
        const dateA = new Date(a.date_created || 0).getTime();
        const dateB = new Date(b.date_created || 0).getTime();
        return dateB - dateA;
      });

      // Map failure reasons to user-friendly messages
      const getFailureReason = (payment: any): string => {
        if (payment.status === 'approved' || payment.status === 'authorized') return '';
        
        const reasons: Record<string, string> = {
          'cc_rejected_bad_filled_card_number': 'Número do cartão incorreto',
          'cc_rejected_bad_filled_date': 'Data de validade incorreta',
          'cc_rejected_bad_filled_other': 'Dados do cartão incorretos',
          'cc_rejected_bad_filled_security_code': 'Código de segurança incorreto',
          'cc_rejected_blacklist': 'Cartão não permitido',
          'cc_rejected_call_for_authorize': 'Necessário autorizar com o banco',
          'cc_rejected_card_disabled': 'Cartão desabilitado',
          'cc_rejected_card_error': 'Erro no cartão',
          'cc_rejected_duplicated_payment': 'Pagamento duplicado',
          'cc_rejected_high_risk': 'Pagamento recusado por risco',
          'cc_rejected_insufficient_amount': 'Saldo insuficiente',
          'cc_rejected_invalid_installments': 'Parcelas inválidas',
          'cc_rejected_max_attempts': 'Limite de tentativas excedido',
          'cc_rejected_other_reason': 'Cartão recusado',
          'pending_contingency': 'Pagamento em análise',
          'pending_review_manual': 'Pagamento em revisão manual',
        };
        
        return reasons[payment.status_detail] || payment.status_detail || 'Motivo não especificado';
      };

      // Get status label
      const getStatusLabel = (status: string): { label: string; color: string } => {
        const statusMap: Record<string, { label: string; color: string }> = {
          'authorized': { label: 'Ativa', color: 'green' },
          'paused': { label: 'Pausada', color: 'yellow' },
          'pending': { label: 'Pendente', color: 'orange' },
          'cancelled': { label: 'Cancelada', color: 'red' },
        };
        return statusMap[status] || { label: status, color: 'gray' };
      };

      // Format payment method
      const paymentMethod = preapproval.payment_method_id 
        ? `${preapproval.payment_method_id} - Final ${preapproval.card?.last_four_digits || '****'}`
        : 'Não informado';

      // Calculate next payment date
      const nextPaymentDate = preapproval.next_payment_date 
        ? new Date(preapproval.next_payment_date).toLocaleDateString('pt-BR')
        : null;

      const statusInfo = getStatusLabel(preapproval.status);

      res.json({
        preapprovalId,
        email: userEmail,
        status: preapproval.status,
        statusLabel: statusInfo.label,
        statusColor: statusInfo.color,
        reason: preapproval.reason || 'Assinatura',
        dateCreated: preapproval.date_created,
        lastModified: preapproval.last_modified,
        nextPaymentDate,
        paymentMethod,
        amount: preapproval.auto_recurring?.transaction_amount,
        currency: preapproval.auto_recurring?.currency_id || 'BRL',
        frequency: preapproval.auto_recurring?.frequency,
        frequencyType: preapproval.auto_recurring?.frequency_type,
        payerEmail: preapproval.payer_email,
        payerId: preapproval.payer_id,
        paymentHistory: paymentHistory.map((p: any) => ({
          id: p.id,
          status: p.status,
          statusDetail: p.status_detail,
          failureReason: getFailureReason(p),
          amount: p.transaction_amount,
          dateCreated: p.date_created,
          dateApproved: p.date_approved,
          paymentMethodId: p.payment_method_id,
          paymentTypeId: p.payment_type_id,
        })),
        raw: preapproval, // Full response for debugging
      });
    } catch (error: any) {
      console.error('[MP Subscription] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Liberar acesso manualmente (superadmin)
  app.post("/api/checkout/pagamentos/:id/liberar", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const adminUser = await storage.getAdminByEmail(email);
      if (!adminUser || adminUser.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const pagamento = await storage.getCheckoutPagamentoById(req.params.id);
      if (!pagamento) {
        return res.status(404).json({ error: "Pagamento não encontrado" });
      }

      const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
      if (!plano) {
        return res.status(404).json({ error: "Plano não encontrado" });
      }

      // Calculate expiration date based on plan type
      const expirationDate = new Date();
      if (plano.tipoCobranca === 'recorrente') {
        const freq = plano.frequencia || 1;
        const freqTipo = plano.frequenciaTipo || 'months';
        if (freqTipo === 'days') expirationDate.setDate(expirationDate.getDate() + freq);
        else if (freqTipo === 'weeks') expirationDate.setDate(expirationDate.getDate() + (freq * 7));
        else if (freqTipo === 'months') expirationDate.setMonth(expirationDate.getMonth() + freq);
        else if (freqTipo === 'years') expirationDate.setFullYear(expirationDate.getFullYear() + freq);
      } else {
        expirationDate.setDate(expirationDate.getDate() + (plano.prazoDias || 30));
      }

      let admin = await storage.getAdminByEmail(pagamento.email);
      
      if (admin) {
        await storage.updateAdmin(admin.id, {
          accessExpiresAt: expirationDate,
          webinarLimit: plano.webinarLimit,
          isActive: true,
          paymentStatus: 'ok',
          paymentFailedReason: null,
        });
      } else {
        const tempPassword = generateTempPassword();
        const bcrypt = await import('bcryptjs');
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        
        admin = await storage.createAdmin({
          name: pagamento.nome,
          email: pagamento.email,
          password: hashedPassword,
          telefone: pagamento.telefone,
          role: 'user',
          webinarLimit: plano.webinarLimit,
          isActive: true,
          accessExpiresAt: expirationDate,
          paymentStatus: 'ok',
        });
        
        console.log(`[Manual Release] Created admin: ${pagamento.email}, temp password: ${tempPassword}`);
        
        // Send access credentials email for new users (safe - never throws)
        sendAccessCredentialsEmailSafe(pagamento.email, pagamento.nome, tempPassword, plano.nome);
      }

      await storage.updateCheckoutPagamento(pagamento.id, {
        status: 'approved',
        statusDetail: 'Liberado manualmente pelo admin',
        dataAprovacao: new Date(),
        dataExpiracao: expirationDate,
        adminId: admin.id,
      });

      // Create or update subscription record for manual release
      const existingSubscription = await storage.getCheckoutAssinaturaByAdminId(admin.id);
      if (existingSubscription) {
        await storage.updateCheckoutAssinatura(existingSubscription.id, {
          status: 'active',
          planoId: plano.id,
          gateway: 'manual',
          proximoPagamento: expirationDate,
        });
      } else {
        await storage.createCheckoutAssinatura({
          adminId: admin.id,
          planoId: plano.id,
          status: 'active',
          gateway: 'manual',
          proximoPagamento: expirationDate,
        });
      }

      res.json({ success: true, adminId: admin.id });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Recuperar pagamento - enviar email/WhatsApp de recuperação
  app.post("/api/checkout/pagamentos/:id/recuperar", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const adminUser = await storage.getAdminByEmail(email);
      if (!adminUser || adminUser.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const pagamento = await storage.getCheckoutPagamentoById(req.params.id);
      if (!pagamento) {
        return res.status(404).json({ error: "Pagamento não encontrado" });
      }

      const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
      if (!plano) {
        return res.status(404).json({ error: "Plano não encontrado" });
      }

      // Import email and whatsapp functions
      const { sendPaymentRecoveryEmail, isEmailServiceAvailable } = await import("./email");
      const { sendWhatsAppPaymentRecoverySafe, isWhatsAppNotificationsEnabled } = await import("./whatsapp-notifications");

      let emailSent = false;
      let whatsappSent = false;

      // Send email recovery
      if (isEmailServiceAvailable()) {
        emailSent = await sendPaymentRecoveryEmail(
          pagamento.email,
          pagamento.nome,
          plano.nome,
          plano.id,
          pagamento.valor
        );
      }

      // Send WhatsApp recovery
      const whatsappEnabled = await isWhatsAppNotificationsEnabled();
      if (whatsappEnabled && pagamento.telefone) {
        whatsappSent = await sendWhatsAppPaymentRecoverySafe(
          pagamento.telefone,
          pagamento.nome,
          plano.nome,
          plano.id,
          pagamento.valor,
          pagamento.email,
          pagamento.cpf
        );
      }

      // Update payment status detail to mark recovery sent
      await storage.updateCheckoutPagamento(pagamento.id, {
        statusDetail: `Recuperação enviada em ${new Date().toLocaleDateString('pt-BR')} - Email: ${emailSent ? 'Sim' : 'Não'}, WhatsApp: ${whatsappSent ? 'Sim' : 'Não'}`,
      });

      console.log(`[Recovery] Sent recovery for payment ${pagamento.id}: email=${emailSent}, whatsapp=${whatsappSent}`);

      res.json({ success: true, emailSent, whatsappSent });
    } catch (error: any) {
      console.error("[Recovery] Error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Checkout - Relatórios
  app.get("/api/checkout/relatorios/stats", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const stats = await storage.getCheckoutStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/checkout/relatorios/vendas-por-plano", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const vendas = await storage.getCheckoutVendasPorPlano();
      res.json(vendas);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/checkout/relatorios/vendas-por-metodo", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const vendas = await storage.getCheckoutVendasPorMetodo();
      res.json(vendas);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/checkout/relatorios/vendas-por-afiliado", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const vendas = await storage.getCheckoutVendasPorAfiliado();
      res.json(vendas);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Resincronizar pagamento com Mercado Pago - verifica status real na API
  app.post("/api/checkout/pagamentos/:id/resync-mp", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const adminUser = await storage.getAdminByEmail(email);
      if (!adminUser || adminUser.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const pagamento = await storage.getCheckoutPagamentoById(req.params.id);
      if (!pagamento) {
        return res.status(404).json({ error: "Pagamento não encontrado" });
      }

      const accessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
      if (!accessToken) {
        return res.status(500).json({ error: "Token do Mercado Pago não configurado" });
      }

      const preapprovalId = pagamento.mercadopagoPaymentId;
      if (!preapprovalId) {
        return res.status(400).json({ error: "Este pagamento não possui ID do Mercado Pago" });
      }

      console.log(`[Resync MP] Checking preapproval ${preapprovalId} for pagamento ${pagamento.id}`);

      // Fetch preapproval details from MP API
      const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (!mpResponse.ok) {
        const errorText = await mpResponse.text();
        console.error('[Resync MP] Error fetching preapproval:', errorText);
        return res.status(500).json({ error: "Erro ao buscar assinatura no Mercado Pago" });
      }

      const preapproval = await mpResponse.json();
      console.log(`[Resync MP] Preapproval status: ${preapproval.status}`);

      // Check for authorized payments
      let hasAuthorizedPayment = false;
      let latestApprovedPayment: any = null;
      
      try {
        const paymentsResponse = await fetch(
          `https://api.mercadopago.com/preapproval/${preapprovalId}/authorized_payments`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        
        if (paymentsResponse.ok) {
          const paymentsData = await paymentsResponse.json();
          const approvedPayments = paymentsData.results?.filter(
            (p: any) => p.status === 'approved' || p.status === 'authorized'
          ) || [];
          
          hasAuthorizedPayment = approvedPayments.length > 0;
          if (hasAuthorizedPayment) {
            latestApprovedPayment = approvedPayments[approvedPayments.length - 1];
          }
          console.log(`[Resync MP] Found ${approvedPayments.length} approved payments`);
        }
      } catch (err) {
        console.error('[Resync MP] Error checking authorized payments:', err);
      }

      // Update payment based on MP status
      if (preapproval.status === 'authorized' && hasAuthorizedPayment) {
        const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
        if (!plano) {
          return res.status(404).json({ error: "Plano não encontrado" });
        }

        const realPaymentDate = latestApprovedPayment?.date_created 
          ? new Date(latestApprovedPayment.date_created) 
          : new Date();
        const realApprovalDate = latestApprovedPayment?.date_approved 
          ? new Date(latestApprovedPayment.date_approved) 
          : realPaymentDate;

        // Calculate expiration date based on plan type
        const expirationDate = new Date();
        if (plano.tipoCobranca === 'recorrente') {
          const freq = plano.frequencia || 1;
          const freqTipo = plano.frequenciaTipo || 'months';
          if (freqTipo === 'days') expirationDate.setDate(expirationDate.getDate() + freq);
          else if (freqTipo === 'weeks') expirationDate.setDate(expirationDate.getDate() + (freq * 7));
          else if (freqTipo === 'months') expirationDate.setMonth(expirationDate.getMonth() + freq);
          else if (freqTipo === 'years') expirationDate.setFullYear(expirationDate.getFullYear() + freq);
        } else {
          expirationDate.setDate(expirationDate.getDate() + (plano.prazoDias || 30));
        }

        // Update payment to approved
        await storage.updateCheckoutPagamento(pagamento.id, {
          status: 'approved',
          statusDetail: 'Assinatura ativa - pagamento confirmado (resincronizado)',
          dataPagamento: realPaymentDate,
          dataAprovacao: realApprovalDate,
          dataExpiracao: expirationDate,
        });

        // Create/update admin if needed
        let admin = await storage.getAdminByEmail(pagamento.email);
        if (admin) {
          await storage.updateAdmin(admin.id, {
            accessExpiresAt: expirationDate,
            webinarLimit: plano.webinarLimit,
            uploadLimit: plano.uploadLimit || plano.webinarLimit,
            isActive: true,
            planoId: plano.id,
            paymentStatus: 'ok',
            paymentFailedReason: null,
          });
          await storage.updateCheckoutPagamento(pagamento.id, { adminId: admin.id });
        } else {
          const tempPassword = Math.random().toString(36).substring(2, 10);
          const bcrypt = await import('bcryptjs');
          const hashedPassword = await bcrypt.hash(tempPassword, 10);
          
          admin = await storage.createAdmin({
            name: pagamento.nome,
            email: pagamento.email,
            password: hashedPassword,
            telefone: pagamento.telefone,
            role: 'user',
            webinarLimit: plano.webinarLimit,
            uploadLimit: plano.uploadLimit || plano.webinarLimit,
            isActive: true,
            accessExpiresAt: expirationDate,
            planoId: plano.id,
            paymentStatus: 'ok',
          });
          await storage.updateCheckoutPagamento(pagamento.id, { adminId: admin.id });
          
          console.log(`[Resync MP] Created admin ${pagamento.email} with temp password`);
        }

        console.log(`[Resync MP] Successfully synced payment ${pagamento.id} to approved`);
        res.json({ 
          success: true, 
          message: "Pagamento sincronizado com sucesso - status atualizado para aprovado",
          newStatus: 'approved',
          preapprovalStatus: preapproval.status,
          hasPayment: true,
        });
      } else if (preapproval.status === 'cancelled') {
        await storage.updateCheckoutPagamento(pagamento.id, {
          status: 'cancelled',
          statusDetail: 'Assinatura cancelada (resincronizado)',
        });
        res.json({ 
          success: true, 
          message: "Pagamento sincronizado - assinatura cancelada",
          newStatus: 'cancelled',
          preapprovalStatus: preapproval.status,
          hasPayment: false,
        });
      } else if (preapproval.status === 'paused') {
        await storage.updateCheckoutPagamento(pagamento.id, {
          status: 'paused',
          statusDetail: 'Assinatura pausada (resincronizado)',
        });
        res.json({ 
          success: true, 
          message: "Pagamento sincronizado - assinatura pausada",
          newStatus: 'paused',
          preapprovalStatus: preapproval.status,
          hasPayment: false,
        });
      } else {
        // authorized but no payment yet, or pending
        await storage.updateCheckoutPagamento(pagamento.id, {
          status: 'pending',
          statusDetail: `Assinatura ${preapproval.status} - aguardando pagamento (resincronizado)`,
        });
        res.json({ 
          success: true, 
          message: "Pagamento sincronizado - ainda aguardando confirmação de pagamento",
          newStatus: 'pending',
          preapprovalStatus: preapproval.status,
          hasPayment: hasAuthorizedPayment,
        });
      }
    } catch (error: any) {
      console.error("[Resync MP] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // USER SUBSCRIPTION MANAGEMENT ENDPOINTS
  // ============================================

  // Get user subscription info with consumption and history
  app.get("/api/admin/subscription", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(404).json({ error: "Admin não encontrado" });

      // Get plan info
      let plano = null;
      if (admin.planoId) {
        plano = await storage.getCheckoutPlanoById(admin.planoId);
      }

      // Get active subscription
      const assinatura = await storage.getCheckoutAssinaturaByAdminId(admin.id);

      // Calculate consumption
      const webinars = await storage.listWebinarsByOwner(admin.id);
      const videos = await storage.listVideosByOwner(admin.id);
      
      // Calculate storage used (in bytes then convert to GB for display)
      let storageUsedBytes = 0;
      for (const video of videos) {
        if (video.fileSize) {
          storageUsedBytes += video.fileSize;
        }
      }
      const storageUsedGB = storageUsedBytes / (1024 * 1024 * 1024);
      
      // Superadmin tem limites ilimitados
      const isSuperadmin = admin.role === "superadmin";
      const webinarsLimite = isSuperadmin ? -1 : (plano?.webinarLimit || admin.webinarLimit || 5);
      const storageLimiteGB = isSuperadmin ? -1 : (plano?.storageLimit || 5);
      const uploadsLimite = isSuperadmin ? -1 : (plano?.uploadLimit || admin.uploadLimit || 5);

      const consumo = {
        webinarsUsados: webinars.length,
        webinarsLimite: webinarsLimite,
        storageUsadoGB: parseFloat(storageUsedGB.toFixed(2)),
        storageLimiteGB: storageLimiteGB,
        uploadsUsados: videos.length,
        uploadsLimite: uploadsLimite,
        isSuperadmin: isSuperadmin,
      };

      // Get payment history for this user
      const allPagamentos = await storage.listCheckoutPagamentos();
      const faturas = allPagamentos
        .filter(p => p.adminId === admin.id)
        .sort((a, b) => new Date(b.criadoEm!).getTime() - new Date(a.criadoEm!).getTime())
        .slice(0, 10)
        .map(p => ({
          id: p.id,
          valor: p.valor,
          status: p.status,
          metodoPagamento: p.metodoPagamento,
          criadoEm: p.criadoEm?.toISOString() || null,
          dataAprovacao: p.dataAprovacao?.toISOString() || null,
        }));

      // Get subscription history
      const allAssinaturas = await storage.listCheckoutAssinaturas();
      const historicoAssinaturas = await Promise.all(
        allAssinaturas
          .filter(a => a.adminId === admin.id)
          .sort((a, b) => new Date(b.criadoEm!).getTime() - new Date(a.criadoEm!).getTime())
          .slice(0, 10)
          .map(async (a) => {
            const assinaturaPlano = await storage.getCheckoutPlanoById(a.planoId);
            return {
              id: a.id,
              planoNome: assinaturaPlano?.nome || "Plano Desconhecido",
              status: a.status,
              criadoEm: a.criadoEm?.toISOString() || null,
              atualizadoEm: a.atualizadoEm?.toISOString() || null,
            };
          })
      );

      res.json({
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          webinarLimit: admin.webinarLimit,
          uploadLimit: admin.uploadLimit,
          accessExpiresAt: admin.accessExpiresAt?.toISOString() || null,
          planoId: admin.planoId,
        },
        plano: plano ? {
          id: plano.id,
          nome: plano.nome,
          descricao: plano.descricao,
          preco: plano.preco,
          prazoDias: plano.prazoDias,
          webinarLimit: plano.webinarLimit,
          uploadLimit: plano.uploadLimit,
          storageLimit: plano.storageLimit || 5,
          whatsappAccountLimit: plano.whatsappAccountLimit ?? 2,
          tipoCobranca: plano.tipoCobranca,
          frequencia: plano.frequencia || 1,
          frequenciaTipo: plano.frequenciaTipo || "months",
          featureAI: plano.featureAI ?? false,
          featureTranscricao: plano.featureTranscricao ?? false,
          featureDesignerIA: plano.featureDesignerIA ?? false,
          featureGeradorMensagens: plano.featureGeradorMensagens ?? false,
        } : null,
        assinatura: assinatura ? {
          id: assinatura.id,
          status: assinatura.status,
          gateway: assinatura.gateway,
          externalId: assinatura.externalId,
          proximoPagamento: assinatura.proximoPagamento?.toISOString() || null,
          criadoEm: assinatura.criadoEm?.toISOString() || null,
        } : null,
        consumo,
        faturas,
        historicoAssinaturas,
      });
    } catch (error: any) {
      console.error("Erro ao buscar informações de assinatura:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Cancel subscription
  app.post("/api/admin/subscription/cancel", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(404).json({ error: "Admin não encontrado" });

      const assinatura = await storage.getCheckoutAssinaturaByAdminId(admin.id);
      if (!assinatura) {
        return res.status(400).json({ error: "Nenhuma assinatura ativa encontrada" });
      }

      // Cancel subscription on the gateway if it has an external ID (recurring)
      if (assinatura.externalId && assinatura.gateway) {
        try {
          if (assinatura.gateway === "stripe") {
            // Cancel Stripe subscription
            const stripeSecretKey = await storage.getCheckoutConfig('STRIPE_SECRET_KEY');
            if (stripeSecretKey) {
              const stripeResponse = await fetch(
                `https://api.stripe.com/v1/subscriptions/${assinatura.externalId}`,
                {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${stripeSecretKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                }
              );
              if (!stripeResponse.ok) {
                console.error("Erro ao cancelar no Stripe:", await stripeResponse.text());
              } else {
                console.log(`[subscription] Cancelled Stripe subscription: ${assinatura.externalId}`);
              }
            }
          } else if (assinatura.gateway === "mercadopago") {
            // Cancel Mercado Pago subscription (preapproval)
            const mpAccessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
            if (mpAccessToken) {
              const mpResponse = await fetch(
                `https://api.mercadopago.com/preapproval/${assinatura.externalId}`,
                {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${mpAccessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ status: 'cancelled' }),
                }
              );
              if (!mpResponse.ok) {
                console.error("Erro ao cancelar no Mercado Pago:", await mpResponse.text());
              } else {
                console.log(`[subscription] Cancelled Mercado Pago subscription: ${assinatura.externalId}`);
              }
            }
          }
        } catch (gatewayError: any) {
          console.error("Erro ao cancelar no gateway:", gatewayError);
          // Continue with local cancellation even if gateway fails
        }
      }

      // Update subscription status to cancelled in our database
      await storage.updateCheckoutAssinatura(assinatura.id, { status: "cancelled" });
      
      res.json({ success: true, message: "Assinatura cancelada com sucesso" });
    } catch (error: any) {
      console.error("Erro ao cancelar assinatura:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Renew subscription - redirect to checkout
  app.post("/api/admin/subscription/renew", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(404).json({ error: "Admin não encontrado" });

      if (!admin.planoId) {
        return res.status(400).json({ error: "Nenhum plano associado" });
      }

      // Return checkout URL for the current plan
      const checkoutUrl = `/checkout/${admin.planoId}`;
      res.json({ checkoutUrl });
    } catch (error: any) {
      console.error("Erro ao renovar assinatura:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Change password endpoint
  app.post("/api/admin/change-password", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ message: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ message: "Sessão inválida" });
      
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Senha atual e nova senha são obrigatórias" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "A nova senha deve ter pelo menos 6 caracteres" });
      }
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(404).json({ message: "Usuário não encontrado" });

      // Verify current password
      const bcrypt = await import('bcryptjs');
      const isValidPassword = await bcrypt.compare(currentPassword, admin.password);
      if (!isValidPassword) {
        return res.status(400).json({ message: "Senha atual incorreta" });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      // Update password
      await storage.updateAdmin(admin.id, { password: hashedPassword });
      
      res.json({ success: true, message: "Senha alterada com sucesso" });
    } catch (error: any) {
      console.error("Erro ao alterar senha:", error);
      res.status(500).json({ message: "Erro ao alterar senha" });
    }
  });

  // ============================
  // LEADS MANAGEMENT ROUTES
  // ============================
  
  // List all leads for the admin
  app.get("/api/admin/leads", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(404).json({ error: "Admin não encontrado" });

      // Get all leads for admin's webinars
      const leads = await storage.listLeadsByAdmin(admin.id);
      
      // Get webinar names for display
      const webinars = await storage.listWebinarsByOwner(admin.id);
      const webinarMap = new Map(webinars.map(w => [w.id, w.name]));
      
      // Get message counts for each lead
      const leadsWithStats = await Promise.all(leads.map(async (lead) => {
        const messages = await storage.listLeadMessagesByLead(lead.id);
        const emailMessages = messages.filter(m => m.channel === 'email');
        const whatsappMessages = messages.filter(m => m.channel === 'whatsapp');
        
        return {
          ...lead,
          webinarName: webinarMap.get(lead.webinarId) || 'Webinar não encontrado',
          stats: {
            emailsSent: emailMessages.length,
            emailsOpened: emailMessages.filter(m => m.openedAt).length,
            emailsClicked: emailMessages.filter(m => m.clickedAt).length,
            whatsappSent: whatsappMessages.length,
            whatsappDelivered: whatsappMessages.filter(m => m.deliveredAt).length,
          }
        };
      }));
      
      res.json(leadsWithStats);
    } catch (error: any) {
      console.error("Erro ao listar leads:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get lead details with messages
  app.get("/api/admin/leads/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(404).json({ error: "Admin não encontrado" });

      const lead = await storage.getLeadById(req.params.id);
      if (!lead) return res.status(404).json({ error: "Lead não encontrado" });
      
      // Verify lead belongs to admin's webinar
      const webinar = await storage.getWebinarById(lead.webinarId);
      if (!webinar || webinar.ownerId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }
      
      const messages = await storage.listLeadMessagesByLead(lead.id);
      
      res.json({
        ...lead,
        webinarName: webinar.name,
        messages,
      });
    } catch (error: any) {
      console.error("Erro ao obter lead:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get webinars for lead filter
  app.get("/api/admin/leads/filters/webinars", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token não fornecido" });
      
      const email = await validateSession(token);
      if (!email) return res.status(401).json({ error: "Sessão inválida" });
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(404).json({ error: "Admin não encontrado" });

      const webinars = await storage.listWebinarsByOwner(admin.id);
      res.json(webinars.map(w => ({ id: w.id, name: w.name })));
    } catch (error: any) {
      console.error("Erro ao listar webinars para filtro:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================
  // EMAIL TRACKING ROUTES
  // ============================
  
  // Track email open (1x1 transparent pixel)
  app.get("/api/track/open/:trackingId", async (req, res) => {
    try {
      const { trackingId } = req.params;
      
      // Mark message as opened
      await storage.markMessageAsOpened(trackingId);
      
      // Return 1x1 transparent GIF
      const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.set({
        'Content-Type': 'image/gif',
        'Content-Length': pixel.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      res.send(pixel);
    } catch (error: any) {
      console.error("Erro ao rastrear abertura de email:", error);
      // Still return pixel even on error
      const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.set('Content-Type', 'image/gif');
      res.send(pixel);
    }
  });

  // Track email click and redirect
  app.get("/api/track/click/:trackingId", async (req, res) => {
    try {
      const { trackingId } = req.params;
      const { url } = req.query;
      
      // Mark message as clicked
      await storage.markMessageAsClicked(trackingId);
      
      // Redirect to original URL
      if (url && typeof url === 'string') {
        res.redirect(url);
      } else {
        res.status(400).send("URL não fornecida");
      }
    } catch (error: any) {
      console.error("Erro ao rastrear click:", error);
      // Still redirect if URL provided
      if (req.query.url && typeof req.query.url === 'string') {
        res.redirect(req.query.url);
      } else {
        res.status(500).send("Erro ao processar redirecionamento");
      }
    }
  });

  // Moderator routes
  app.post("/api/webinars/:slug/moderator/auth", async (req, res) => {
    try {
      const { moderatorName } = req.body;
      if (!moderatorName || typeof moderatorName !== "string") {
        return res.status(400).json({ error: "Nome do moderador obrigatório" });
      }

      const webinar = await storage.getWebinarBySlug(req.params.slug);
      if (!webinar) return res.status(404).json({ error: "Webinário não encontrado" });

      // Generate token if not exists
      let token = webinar.moderatorToken;
      if (!token) {
        token = `mod_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
        await db.update(webinarsTable)
          .set({ moderatorToken: token })
          .where(eq(webinarsTable.id, webinar.id));
      }

      res.json({ token, moderatorName });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/webinars/:slug/moderator/comments", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) return res.status(401).json({ error: "Token obrigatório" });

      const webinar = await storage.getWebinarBySlug(req.params.slug);
      if (!webinar || webinar.moderatorToken !== token) {
        return res.status(401).json({ error: "Token inválido" });
      }

      const allComments = await db
        .select()
        .from(comments)
        .where(eq(comments.webinarId, webinar.id))
        .orderBy(desc(comments.createdAt));

      const pending = allComments.filter(c => !c.isSimulated && !c.approved);
      const approved = allComments.filter(c => c.approved);

      res.json({ pending, approved });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/webinars/:slug/moderator/comments/:commentId/approve", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) return res.status(401).json({ error: "Token obrigatório" });

      const webinar = await storage.getWebinarBySlug(req.params.slug);
      if (!webinar || webinar.moderatorToken !== token) {
        return res.status(401).json({ error: "Token inválido" });
      }

      const updated = await db
        .update(comments)
        .set({ approved: true })
        .where(
          and(
            eq(comments.id, req.params.commentId),
            eq(comments.webinarId, webinar.id)
          )
        )
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({ error: "Comentário não encontrado" });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/webinars/:slug/moderator/comments/:commentId/reject", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) return res.status(401).json({ error: "Token obrigatório" });

      const webinar = await storage.getWebinarBySlug(req.params.slug);
      if (!webinar || webinar.moderatorToken !== token) {
        return res.status(401).json({ error: "Token inválido" });
      }

      const deleted = await db
        .delete(comments)
        .where(
          and(
            eq(comments.id, req.params.commentId),
            eq(comments.webinarId, webinar.id)
          )
        )
        .returning();

      if (deleted.length === 0) {
        return res.status(404).json({ error: "Comentário não encontrado" });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/webinars/:slug/moderator/message", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) return res.status(401).json({ error: "Token obrigatório" });

      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Texto obrigatório" });
      }

      const webinar = await storage.getWebinarBySlug(req.params.slug);
      if (!webinar || webinar.moderatorToken !== token) {
        return res.status(401).json({ error: "Token inválido" });
      }

      const comment = {
        id: `comment_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        webinarId: webinar.id,
        text,
        author: "Moderador",
        timestamp: 0,
        isSimulated: false,
        isModeratorMessage: true,
        moderatorName: "Moderador",
        approved: true,
        persistForFutureSessions: false,
        sessionDate: new Date().toISOString().split('T')[0],
        sessionId: null,
        createdAt: new Date(),
      };

      await db.insert(comments).values(comment);
      res.json({ success: true, comment });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Reset all real comments to pending (admin only)
  app.post("/api/webinars/:id/reset-comments-approval", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      console.log("[reset-approval] Auth header:", authHeader);
      const token = authHeader?.split(" ")[1];
      console.log("[reset-approval] Token extracted:", token?.substring(0, 10) + "...");
      const email = await validateSession(token || "");
      console.log("[reset-approval] Email validated:", email);
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const updated = await db
        .update(comments)
        .set({ approved: false })
        .where(
          and(
            eq(comments.webinarId, req.params.id),
            eq(comments.isSimulated, false),
            eq(comments.isModeratorMessage, false)
          )
        )
        .returning();

      res.json({ success: true, updated: updated.length });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================
  // AFFILIATE SYSTEM ROUTES
  // ============================================

  // Get affiliate config (super admin only)
  app.get("/api/affiliate-config", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas super admin pode acessar" });
      }

      const config = await storage.getAffiliateConfig();
      res.json(config || { defaultCommissionPercent: 30, minWithdrawal: 5000, holdDays: 7, autoPayEnabled: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update affiliate config (super admin only)
  app.patch("/api/affiliate-config", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas super admin pode atualizar" });
      }

      // Validate holdDays - minimum 7 days is mandatory for refund period
      const MIN_HOLD_DAYS = 7;
      const configData = { ...req.body };
      if (configData.holdDays !== undefined) {
        configData.holdDays = Math.max(Number(configData.holdDays) || MIN_HOLD_DAYS, MIN_HOLD_DAYS);
      }

      const config = await storage.upsertAffiliateConfig(configData);
      res.json(config);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // List all affiliates (super admin only)
  app.get("/api/affiliates", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas super admin pode listar afiliados" });
      }

      const affiliates = await storage.listAffiliates();
      const affiliatesWithAdmin = await Promise.all(
        affiliates.map(async (aff) => {
          const adminData = await storage.getAdminById(aff.adminId);
          return { ...aff, admin: adminData ? { id: adminData.id, name: adminData.name, email: adminData.email } : null };
        })
      );
      res.json(affiliatesWithAdmin);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get current user's affiliate info (for affiliate dashboard)
  app.get("/api/affiliate/me", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(404).json({ error: "Admin não encontrado" });

      const affiliate = await storage.getAffiliateByAdminId(admin.id);
      if (!affiliate) return res.status(404).json({ error: "Você não é um afiliado" });

      const stats = await storage.getAffiliateStats(affiliate.id);
      const links = await storage.listAffiliateLinksByAffiliate(affiliate.id);
      
      res.json({ 
        ...affiliate, 
        name: admin.name,
        email: admin.email,
        stats, 
        links 
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update affiliate's own settings (Meta Pixel ID)
  app.patch("/api/affiliate/me", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(404).json({ error: "Admin não encontrado" });

      const affiliate = await storage.getAffiliateByAdminId(admin.id);
      if (!affiliate) return res.status(404).json({ error: "Você não é um afiliado" });

      // Only allow updating metaPixelId and metaAccessToken
      const { metaPixelId, metaAccessToken } = req.body;
      const updateData: Record<string, any> = {};
      if (metaPixelId !== undefined) updateData.metaPixelId = metaPixelId || null;
      if (metaAccessToken !== undefined) updateData.metaAccessToken = metaAccessToken || null;
      
      const updatedAffiliate = await storage.updateAffiliate(affiliate.id, updateData);

      res.json(updatedAffiliate);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get affiliate payout credentials status - shows if MP/Stripe are connected for auto-split
  app.get("/api/affiliate/me/payout-status", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(404).json({ error: "Admin não encontrado" });

      const affiliate = await storage.getAffiliateByAdminId(admin.id);
      if (!affiliate) return res.status(404).json({ error: "Você não é um afiliado" });

      const config = await storage.getAffiliateConfig();

      res.json({
        autoPayEnabled: config?.autoPayEnabled ?? false,
        mercadopago: {
          connected: !!affiliate.mpUserId,
          userId: affiliate.mpUserId || null,
          connectedAt: affiliate.mpConnectedAt || null,
          oauthConfigured: !!(config?.mpAppId && config?.mpAppSecret),
        },
        stripe: {
          connected: affiliate.stripeConnectStatus === 'connected',
          accountId: affiliate.stripeConnectAccountId || null,
          status: affiliate.stripeConnectStatus || 'pending',
          connectedAt: affiliate.stripeConnectedAt || null,
        },
        commissionPercent: affiliate.commissionPercent,
        pendingAmount: affiliate.pendingAmount,
        paidAmount: affiliate.paidAmount,
        totalEarnings: affiliate.totalEarnings,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Stripe Connect OAuth - Start authorization flow
  app.get("/api/affiliates/stripe/authorize", async (req, res) => {
    try {
      const token = (req.query.token as string) || req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ error: "Unauthorized" });

      const affiliate = await storage.getAffiliateByAdminId(admin.id);
      if (!affiliate) return res.status(404).json({ error: "Você não é um afiliado" });

      // Get Stripe Connect configuration
      const stripeClientId = await storage.getCheckoutConfig('STRIPE_CONNECT_CLIENT_ID');
      if (!stripeClientId) {
        return res.status(400).json({ error: "Stripe Connect não configurado. Contate o administrador." });
      }

      const baseUrl = getPublicBaseUrl(req);
      const redirectUri = `${baseUrl}/api/affiliates/stripe/callback`;
      const state = generateOAuthState(affiliate.id, admin.id);

      const authUrl = new URL("https://connect.stripe.com/oauth/authorize");
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", stripeClientId);
      authUrl.searchParams.set("scope", "read_write");
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("stripe_user[country]", "BR");

      res.redirect(authUrl.toString());
    } catch (error: any) {
      console.error("[stripe-connect] Error starting OAuth:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Stripe Connect OAuth callback
  app.get("/api/affiliates/stripe/callback", async (req, res) => {
    try {
      const { code, state, error: oauthError } = req.query;

      if (oauthError) {
        console.error("[stripe-connect] OAuth error:", oauthError);
        return res.redirect("/admin/afiliado?error=stripe_oauth_denied");
      }

      if (!code || !state) {
        return res.redirect("/admin/afiliado?error=missing_params");
      }

      const stateData = verifyOAuthState(state as string);
      if (!stateData) {
        console.warn("[stripe-connect] Invalid or expired state parameter");
        return res.redirect("/admin/afiliado?error=invalid_state");
      }

      const affiliate = await storage.getAffiliateById(stateData.affiliateId);
      if (!affiliate) {
        return res.redirect("/admin/afiliado?error=affiliate_not_found");
      }

      if (affiliate.adminId !== stateData.adminId) {
        console.warn("[stripe-connect] Admin ID mismatch in state");
        return res.redirect("/admin/afiliado?error=invalid_state");
      }

      const stripeSecretKey = await storage.getCheckoutConfig('STRIPE_SECRET_KEY');
      if (!stripeSecretKey) {
        return res.redirect("/admin/afiliado?error=stripe_not_configured");
      }

      // Exchange code for access token
      const tokenResponse = await fetch("https://connect.stripe.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          client_secret: stripeSecretKey,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("[stripe-connect] Token exchange failed:", errorText);
        return res.redirect("/admin/afiliado?error=stripe_token_failed");
      }

      const tokenData = await tokenResponse.json();

      await storage.updateAffiliate(affiliate.id, {
        stripeConnectAccountId: tokenData.stripe_user_id,
        stripeConnectStatus: 'connected',
        stripeConnectedAt: new Date(),
        status: "active", // Activate affiliate when they connect a payment account
      });

      console.log(`[stripe-connect] Connected Stripe for affiliate ${affiliate.id}, account: ${tokenData.stripe_user_id}`);

      res.redirect("/admin/afiliado?success=stripe_connected");
    } catch (error: any) {
      console.error("[stripe-connect] Callback error:", error);
      res.redirect("/admin/afiliado?error=unknown");
    }
  });

  // Disconnect Stripe Connect account
  app.post("/api/affiliates/stripe/disconnect", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ error: "Unauthorized" });

      const affiliate = await storage.getAffiliateByAdminId(admin.id);
      if (!affiliate) return res.status(404).json({ error: "Você não é um afiliado" });

      await storage.updateAffiliate(affiliate.id, {
        stripeConnectAccountId: null,
        stripeConnectStatus: 'pending',
        stripeConnectedAt: null,
      });

      res.json({ success: true, message: "Conta Stripe desconectada" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get affiliate pixel ID by link code (public - for checkout tracking)
  app.get("/api/affiliate-pixel/:code", async (req, res) => {
    try {
      const link = await storage.getAffiliateLinkByCode(req.params.code);
      if (!link || !link.isActive) {
        return res.json({ metaPixelId: null });
      }

      const affiliate = await storage.getAffiliateById(link.affiliateId);
      if (!affiliate || affiliate.status !== "active") {
        return res.json({ metaPixelId: null });
      }

      res.json({ metaPixelId: affiliate.metaPixelId || null });
    } catch (error: any) {
      res.json({ metaPixelId: null });
    }
  });

  // Login de afiliado (público)
  app.post("/api/affiliates/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "E-mail e senha são obrigatórios" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "E-mail ou senha incorretos" });
      }

      const isValid = await bcrypt.compare(password, admin.password);
      if (!isValid) {
        return res.status(401).json({ error: "E-mail ou senha incorretos" });
      }

      const affiliate = await storage.getAffiliateByAdminId(admin.id);
      if (!affiliate) {
        return res.status(403).json({ error: "Você não está registrado como afiliado" });
      }

      if (affiliate.status !== "active") {
        return res.status(403).json({ error: "Sua conta de afiliado está " + (affiliate.status === "pending" ? "pendente de aprovação" : "suspensa") });
      }

      const token = jwt.sign({ email: admin.email }, JWT_SECRET, { expiresIn: "24h" });

      // Send welcome email on first login
      if (!affiliate.welcomeEmailSent) {
        await storage.updateAffiliate(affiliate.id, { welcomeEmailSent: true });
        import("./email").then(({ sendAffiliateWelcomeEmail }) => {
          sendAffiliateWelcomeEmail(admin.email, admin.name || "Afiliado").catch(err => {
            console.error("[affiliate] Erro ao enviar email de boas-vindas:", err);
          });
        });
      }

      res.json({ 
        token, 
        affiliate: { 
          id: affiliate.id, 
          name: admin.name, 
          email: admin.email,
          commissionPercent: affiliate.commissionPercent,
          status: affiliate.status
        } 
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Auto-cadastro de afiliado (público)
  app.post("/api/affiliates/register", async (req, res) => {
    try {
      const { name, email, cpf, password, whatsapp } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios" });
      }

      const existingAdmin = await storage.getAdminByEmail(email);
      if (existingAdmin) {
        const existingAffiliate = await storage.getAffiliateByAdminId(existingAdmin.id);
        if (existingAffiliate) {
          return res.status(400).json({ error: "Este e-mail já está cadastrado como afiliado" });
        }
        return res.status(400).json({ error: "Este e-mail já está em uso" });
      }

      // Buscar configuração para verificar se aprovação é automática
      const config = await storage.getAffiliateConfig();
      const autoApprove = config?.autoApprove ?? false;
      const defaultCommission = config?.defaultCommissionPercent ?? 30;

      const hashedPassword = await bcrypt.hash(password, 10);
      const newAdmin = await storage.createAdmin({
        name,
        email,
        password: hashedPassword,
        role: "affiliate",
      });

      const affiliate = await storage.createAffiliate({
        adminId: newAdmin.id,
        commissionPercent: defaultCommission,
        status: autoApprove ? "active" : "pending",
        whatsapp: whatsapp || null,
      });

      const message = autoApprove 
        ? "Cadastro realizado com sucesso! Você já pode acessar sua conta."
        : "Cadastro realizado! Aguarde a aprovação do administrador.";

      // Send confirmation email (non-blocking)
      if (autoApprove) {
        import("./email").then(({ sendAffiliateApprovedEmail }) => {
          sendAffiliateApprovedEmail(email, name).catch(err => {
            console.error("[affiliate] Erro ao enviar email de aprovação:", err);
          });
        });
      } else {
        import("./email").then(({ sendAffiliatePendingEmail }) => {
          sendAffiliatePendingEmail(email, name).catch(err => {
            console.error("[affiliate] Erro ao enviar email de cadastro pendente:", err);
          });
        });
      }

      res.json({ 
        success: true, 
        message,
        affiliateId: affiliate.id,
        autoApproved: autoApprove
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Affiliate forgot password (público)
  app.post("/api/affiliates/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "E-mail é obrigatório" });
      }

      const admin = await storage.getAdminByEmail(email.toLowerCase());
      
      // Always return success to avoid email enumeration
      if (!admin) {
        return res.json({ 
          success: true, 
          message: "Se o e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha." 
        });
      }

      // Check if this admin is an affiliate
      const affiliate = await storage.getAffiliateByAdminId(admin.id);
      if (!affiliate) {
        return res.json({ 
          success: true, 
          message: "Se o e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha." 
        });
      }

      const resetToken = Math.random().toString(36).substring(2) + Date.now().toString(36) + Math.random().toString(36).substring(2);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      const { passwordResetTokens } = await import("@shared/schema");
      await db.insert(passwordResetTokens).values({
        id: Math.random().toString(36).substring(2) + Date.now().toString(36),
        email: email.toLowerCase(),
        token: resetToken,
        expiresAt,
      });

      const { sendAffiliatePasswordResetEmail } = await import("./email");
      await sendAffiliatePasswordResetEmail(email.toLowerCase(), admin.name || "Afiliado", resetToken);

      console.log(`[affiliate] Token de recuperação criado para ${email}`);

      res.json({ 
        success: true, 
        message: "Se o e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha." 
      });
    } catch (error: any) {
      console.error("[affiliate] Erro ao solicitar recuperação de senha:", error);
      res.status(500).json({ error: "Erro ao processar solicitação" });
    }
  });

  // Affiliate verify reset token (público)
  app.get("/api/affiliates/verify-reset-token/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      if (!token) {
        return res.status(400).json({ valid: false, error: "Token não fornecido" });
      }

      const { passwordResetTokens } = await import("@shared/schema");
      const result = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token, token))
        .limit(1);

      if (result.length === 0) {
        return res.json({ valid: false, error: "Token inválido" });
      }

      const resetToken = result[0];
      
      if (resetToken.usedAt) {
        return res.json({ valid: false, error: "Este link já foi utilizado" });
      }

      if (new Date(resetToken.expiresAt) < new Date()) {
        return res.json({ valid: false, error: "Este link expirou. Solicite uma nova recuperação de senha." });
      }

      // Verify this email belongs to an affiliate
      const admin = await storage.getAdminByEmail(resetToken.email);
      if (!admin) {
        return res.json({ valid: false, error: "Token inválido" });
      }

      const affiliate = await storage.getAffiliateByAdminId(admin.id);
      if (!affiliate) {
        return res.json({ valid: false, error: "Token inválido" });
      }

      res.json({ valid: true, email: resetToken.email });
    } catch (error: any) {
      console.error("[affiliate] Erro ao verificar token:", error);
      res.status(500).json({ valid: false, error: "Erro ao verificar token" });
    }
  });

  // Affiliate reset password (público)
  app.post("/api/affiliates/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ error: "Token e nova senha são obrigatórios" });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres" });
      }

      const { passwordResetTokens } = await import("@shared/schema");
      const result = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token, token))
        .limit(1);

      if (result.length === 0) {
        return res.status(400).json({ error: "Token inválido" });
      }

      const resetToken = result[0];
      
      if (resetToken.usedAt) {
        return res.status(400).json({ error: "Este link já foi utilizado" });
      }

      if (new Date(resetToken.expiresAt) < new Date()) {
        return res.status(400).json({ error: "Este link expirou. Solicite uma nova recuperação de senha." });
      }

      // Verify this email belongs to an affiliate
      const admin = await storage.getAdminByEmail(resetToken.email);
      if (!admin) {
        return res.status(400).json({ error: "Usuário não encontrado" });
      }

      const affiliate = await storage.getAffiliateByAdminId(admin.id);
      if (!affiliate) {
        return res.status(400).json({ error: "Usuário não é um afiliado" });
      }

      // Update password
      const hashedPassword = await bcrypt.hash(password, 10);
      await storage.updateAdmin(admin.id, { password: hashedPassword });

      // Mark token as used
      await db.update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, resetToken.id));

      console.log(`[affiliate] Senha redefinida para ${resetToken.email}`);

      res.json({ success: true, message: "Senha redefinida com sucesso!" });
    } catch (error: any) {
      console.error("[affiliate] Erro ao redefinir senha:", error);
      res.status(500).json({ error: "Erro ao redefinir senha" });
    }
  });

  // Get affiliate by ID (super admin only)
  app.get("/api/affiliates/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas super admin pode acessar" });
      }

      const affiliate = await storage.getAffiliateById(req.params.id);
      if (!affiliate) return res.status(404).json({ error: "Afiliado não encontrado" });

      const adminData = await storage.getAdminById(affiliate.adminId);
      const stats = await storage.getAffiliateStats(affiliate.id);
      const links = await storage.listAffiliateLinksByAffiliate(affiliate.id);
      
      res.json({ ...affiliate, admin: adminData ? { id: adminData.id, name: adminData.name, email: adminData.email } : null, stats, links });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create affiliate (super admin only)
  app.post("/api/affiliates", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas super admin pode criar afiliados" });
      }

      const { adminId, commissionPercent, commissionFixed, status } = req.body;
      if (!adminId) return res.status(400).json({ error: "adminId é obrigatório" });

      const existingAffiliate = await storage.getAffiliateByAdminId(adminId);
      if (existingAffiliate) return res.status(400).json({ error: "Este usuário já é um afiliado" });

      const affiliate = await storage.createAffiliate({
        adminId,
        commissionPercent: commissionPercent || 30,
        commissionFixed: commissionFixed || null,
        status: status || "pending",
      });

      res.json(affiliate);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update affiliate (super admin only)
  app.patch("/api/affiliates/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas super admin pode atualizar" });
      }

      // Get current affiliate to check status change
      const currentAffiliate = await storage.getAffiliateById(req.params.id);
      if (!currentAffiliate) return res.status(404).json({ error: "Afiliado não encontrado" });
      
      const wasNotActive = currentAffiliate.status !== "active";
      const willBeActive = req.body.status === "active";

      const affiliate = await storage.updateAffiliate(req.params.id, req.body);
      if (!affiliate) return res.status(404).json({ error: "Afiliado não encontrado" });

      // Send approval email if status changed to active
      if (wasNotActive && willBeActive) {
        const affiliateAdmin = await storage.getAdminById(affiliate.adminId);
        if (affiliateAdmin) {
          import("./email").then(({ sendAffiliateApprovedEmail }) => {
            sendAffiliateApprovedEmail(affiliateAdmin.email, affiliateAdmin.name || "Afiliado").catch(err => {
              console.error("[affiliate] Erro ao enviar email de aprovação:", err);
            });
          });
        }
      }

      // Send rejection email if status changed to rejected
      const wasNotRejected = currentAffiliate.status !== "rejected";
      const willBeRejected = req.body.status === "rejected";
      if (wasNotRejected && willBeRejected) {
        const affiliateAdmin = await storage.getAdminById(affiliate.adminId);
        if (affiliateAdmin) {
          import("./email").then(({ sendAffiliateRejectedEmail }) => {
            sendAffiliateRejectedEmail(affiliateAdmin.email, affiliateAdmin.name || "Afiliado", req.body.rejectionReason).catch(err => {
              console.error("[affiliate] Erro ao enviar email de rejeição:", err);
            });
          });
        }
      }

      res.json(affiliate);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete affiliate (super admin only)
  app.delete("/api/affiliates/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas super admin pode deletar" });
      }

      await storage.deleteAffiliate(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // List affiliate links
  app.get("/api/affiliates/:id/links", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ error: "Unauthorized" });

      const affiliate = await storage.getAffiliateById(req.params.id);
      if (!affiliate) return res.status(404).json({ error: "Afiliado não encontrado" });

      if (admin.role !== "superadmin" && affiliate.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const links = await storage.listAffiliateLinksByAffiliate(req.params.id);
      res.json(links);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create affiliate link
  app.post("/api/affiliates/:id/links", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ error: "Unauthorized" });

      const affiliate = await storage.getAffiliateById(req.params.id);
      if (!affiliate) return res.status(404).json({ error: "Afiliado não encontrado" });

      if (admin.role !== "superadmin" && affiliate.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const { code, targetUrl, planoId } = req.body;
      
      // Auto-generate code if not provided
      let finalCode = code;
      if (!finalCode) {
        // Generate unique code based on random string
        const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
        finalCode = `ref${randomPart}`;
      }

      const existingLink = await storage.getAffiliateLinkByCode(finalCode);
      if (existingLink) {
        // If auto-generated code exists, try again with different random
        if (!code) {
          const retryRandom = Math.random().toString(36).substring(2, 10).toUpperCase();
          finalCode = `ref${retryRandom}`;
        } else {
          return res.status(400).json({ error: "Este código já está em uso" });
        }
      }

      const link = await storage.createAffiliateLink({
        affiliateId: req.params.id,
        code: finalCode,
        targetUrl: targetUrl || null,
        planoId: planoId || null,
      });

      res.json(link);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete affiliate link
  app.delete("/api/affiliate-links/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ error: "Unauthorized" });

      const link = await storage.getAffiliateLinkById(req.params.id);
      if (!link) return res.status(404).json({ error: "Link não encontrado" });

      const affiliate = await storage.getAffiliateById(link.affiliateId);
      if (!affiliate) return res.status(404).json({ error: "Afiliado não encontrado" });

      if (admin.role !== "superadmin" && affiliate.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      await storage.deleteAffiliateLink(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Track affiliate link click (public endpoint)
  app.get("/api/affiliate-links/:code/track", async (req, res) => {
    try {
      const link = await storage.getAffiliateLinkByCode(req.params.code);
      if (!link || !link.isActive) {
        return res.redirect("/checkout");
      }

      await storage.incrementAffiliateLinkClicks(link.id);

      // Set cookie for 30 days to track affiliate attribution
      res.cookie("affiliate_ref", link.code, {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
      
      console.log(`[Affiliate] Tracking click for code: ${link.code}, affiliateId: ${link.affiliateId}`);

      const redirectUrl = link.targetUrl || (link.planoId ? `/checkout?plano=${link.planoId}&ref=${link.code}` : `/checkout?ref=${link.code}`);
      res.redirect(redirectUrl);
    } catch (error: any) {
      res.redirect("/checkout");
    }
  });

  // Get affiliate sales
  app.get("/api/affiliates/:id/sales", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ error: "Unauthorized" });

      const affiliate = await storage.getAffiliateById(req.params.id);
      if (!affiliate) return res.status(404).json({ error: "Afiliado não encontrado" });

      if (admin.role !== "superadmin" && affiliate.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const sales = await storage.listAffiliateSalesByAffiliate(req.params.id);
      res.json(sales);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get affiliate stats
  app.get("/api/affiliates/:id/stats", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ error: "Unauthorized" });

      const affiliate = await storage.getAffiliateById(req.params.id);
      if (!affiliate) return res.status(404).json({ error: "Afiliado não encontrado" });

      if (admin.role !== "superadmin" && affiliate.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      // Parse date filters from query params
      const startDateStr = req.query.startDate as string;
      const endDateStr = req.query.endDate as string;
      
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      
      if (startDateStr) {
        startDate = new Date(startDateStr);
        startDate.setHours(0, 0, 0, 0);
      }
      if (endDateStr) {
        endDate = new Date(endDateStr);
        endDate.setHours(23, 59, 59, 999);
      }

      const stats = await storage.getAffiliateStats(req.params.id, startDate, endDate);
      res.json(stats);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================
  // AFFILIATE PAYOUT MANAGEMENT (ADMIN ONLY)
  // ============================================

  // List all affiliate sales (admin view with payout status)
  app.get("/api/admin/affiliate-sales", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const sales = await storage.listAllAffiliateSales();
      res.json(sales);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get payout scheduler status
  app.get("/api/admin/affiliate-payout/status", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const { getAffiliatePayoutSchedulerStatus } = await import("./affiliate-payout-scheduler");
      const status = await getAffiliatePayoutSchedulerStatus();
      
      const pendingSales = await storage.listPendingPayoutSales();
      
      res.json({
        ...status,
        pendingPayouts: pendingSales.length,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Manually trigger payout processing
  app.post("/api/admin/affiliate-payout/process", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const { manualProcessPendingPayouts } = await import("./affiliate-payout-scheduler");
      const result = await manualProcessPendingPayouts();
      
      res.json({
        success: true,
        processed: result.processed,
        errors: result.errors,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Retry a specific failed payout
  app.post("/api/admin/affiliate-sales/:id/retry-payout", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const { retryFailedPayout } = await import("./affiliate-payout-scheduler");
      const result = await retryFailedPayout(req.params.id);
      
      if (result.success) {
        res.json({ success: true, message: "Pagamento processado com sucesso" });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Mark a sale as manually paid (for manual transfers)
  app.post("/api/admin/affiliate-sales/:id/mark-paid", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const sale = await storage.getAffiliateSaleById(req.params.id);
      if (!sale) return res.status(404).json({ error: "Venda não encontrada" });

      if (sale.status === 'paid') {
        return res.status(400).json({ error: "Venda já está paga" });
      }

      const affiliate = await storage.getAffiliateById(sale.affiliateId);
      if (!affiliate) return res.status(404).json({ error: "Afiliado não encontrado" });

      await storage.updateAffiliateSale(req.params.id, {
        status: 'paid',
        splitMethod: 'manual',
        paidAt: new Date(),
        payoutError: null,
      });

      const newPendingAmount = Math.max(0, (affiliate.pendingAmount || 0) - sale.commissionAmount);
      const newPaidAmount = (affiliate.paidAmount || 0) + sale.commissionAmount;
      await storage.updateAffiliate(affiliate.id, {
        pendingAmount: newPendingAmount,
        paidAmount: newPaidAmount,
      });

      res.json({ success: true, message: "Venda marcada como paga" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Cancel a pending payout (e.g., if refund occurred)
  app.post("/api/admin/affiliate-sales/:id/cancel", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Acesso negado - apenas superadmin" });
      }

      const sale = await storage.getAffiliateSaleById(req.params.id);
      if (!sale) return res.status(404).json({ error: "Venda não encontrada" });

      if (sale.status === 'paid') {
        return res.status(400).json({ error: "Não é possível cancelar venda já paga" });
      }

      const affiliate = await storage.getAffiliateById(sale.affiliateId);
      if (affiliate) {
        const newPendingAmount = Math.max(0, (affiliate.pendingAmount || 0) - sale.commissionAmount);
        const newTotalEarnings = Math.max(0, (affiliate.totalEarnings || 0) - sale.commissionAmount);
        await storage.updateAffiliate(affiliate.id, {
          pendingAmount: newPendingAmount,
          totalEarnings: newTotalEarnings,
        });
      }

      await storage.updateAffiliateSale(req.params.id, {
        status: 'cancelled',
        payoutError: req.body.reason || 'Cancelado pelo administrador',
      });

      res.json({ success: true, message: "Comissão cancelada" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get affiliate leads (leads captured via affiliate links)
  app.get("/api/affiliates/:id/leads", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ error: "Unauthorized" });

      const affiliate = await storage.getAffiliateById(req.params.id);
      if (!affiliate) return res.status(404).json({ error: "Afiliado não encontrado" });

      if (admin.role !== "superadmin" && affiliate.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      // Get all links for this affiliate
      const links = await storage.listAffiliateLinksByAffiliate(req.params.id);
      const codes = links.map(link => link.code);
      
      // Get leads that used any of these affiliate link codes
      const affiliateLeads = await storage.listLeadsByAffiliateLinkCodes(codes);
      res.json(affiliateLeads);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================
  // AFFILIATE OAUTH MERCADO PAGO
  // ============================================

  // OAuth state store with HMAC verification (in-memory, expires after 10 minutes)
  const oauthStateStore = new Map<string, { affiliateId: string; adminId: string; expiresAt: number }>();

  function generateOAuthState(affiliateId: string, adminId: string): string {
    const nonce = crypto.randomBytes(16).toString("hex");
    const payload = JSON.stringify({ affiliateId, adminId, nonce });
    const secret = process.env.SESSION_SECRET || "autowebinar-oauth-secret-key";
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const state = Buffer.from(JSON.stringify({ payload, signature })).toString("base64url");
    oauthStateStore.set(nonce, { affiliateId, adminId, expiresAt: Date.now() + 10 * 60 * 1000 });
    return state;
  }

  function verifyOAuthState(state: string): { affiliateId: string; adminId: string } | null {
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
      const { payload, signature } = decoded;
      const secret = process.env.SESSION_SECRET || "autowebinar-oauth-secret-key";
      const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
        return null;
      }
      const data = JSON.parse(payload);
      const stored = oauthStateStore.get(data.nonce);
      if (!stored || stored.expiresAt < Date.now()) {
        oauthStateStore.delete(data.nonce);
        return null;
      }
      if (stored.affiliateId !== data.affiliateId || stored.adminId !== data.adminId) {
        return null;
      }
      oauthStateStore.delete(data.nonce);
      return { affiliateId: data.affiliateId, adminId: data.adminId };
    } catch {
      return null;
    }
  }

  // Cleanup expired OAuth states every 5 minutes
  setInterval(() => {
    const now = Date.now();
    Array.from(oauthStateStore.entries()).forEach(([nonce, data]) => {
      if (data.expiresAt < now) oauthStateStore.delete(nonce);
    });
  }, 5 * 60 * 1000);

  // Start OAuth flow - redirects affiliate to Mercado Pago authorization
  app.get("/api/affiliates/oauth/authorize", async (req, res) => {
    try {
      // Accept token from query param (for redirect) or header
      const token = (req.query.token as string) || req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ error: "Unauthorized" });

      const affiliate = await storage.getAffiliateByAdminId(admin.id);
      if (!affiliate) return res.status(404).json({ error: "Você não é um afiliado" });

      const config = await storage.getAffiliateConfig();
      if (!config?.mpAppId) {
        return res.status(400).json({ error: "OAuth não configurado. Contate o administrador." });
      }

      const baseUrl = getPublicBaseUrl(req);
      const redirectUri = `${baseUrl}/api/affiliates/oauth/callback`;
      const state = generateOAuthState(affiliate.id, admin.id);

      const authUrl = new URL("https://auth.mercadopago.com.br/authorization");
      authUrl.searchParams.set("client_id", config.mpAppId);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("platform_id", "mp");
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("state", state);

      res.redirect(authUrl.toString());
    } catch (error: any) {
      console.error("[affiliate-oauth] Error starting OAuth:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // OAuth callback - receives code from Mercado Pago and exchanges for tokens
  app.get("/api/affiliates/oauth/callback", async (req, res) => {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        return res.redirect("/admin/afiliado?error=missing_params");
      }

      const stateData = verifyOAuthState(state as string);
      if (!stateData) {
        console.warn("[affiliate-oauth] Invalid or expired state parameter");
        return res.redirect("/admin/afiliado?error=invalid_state");
      }

      const affiliate = await storage.getAffiliateById(stateData.affiliateId);
      if (!affiliate) {
        return res.redirect("/admin/afiliado?error=affiliate_not_found");
      }

      if (affiliate.adminId !== stateData.adminId) {
        console.warn("[affiliate-oauth] Admin ID mismatch in state");
        return res.redirect("/admin/afiliado?error=invalid_state");
      }

      const config = await storage.getAffiliateConfig();
      if (!config?.mpAppId || !config?.mpAppSecret) {
        return res.redirect("/admin/afiliado?error=oauth_not_configured");
      }

      const baseUrl = getPublicBaseUrl(req);
      const redirectUri = `${baseUrl}/api/affiliates/oauth/callback`;

      const tokenResponse = await fetch("https://api.mercadopago.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: config.mpAppId,
          client_secret: config.mpAppSecret,
          code: code as string,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("[affiliate-oauth] Token exchange failed:", errorText);
        return res.redirect("/admin/afiliado?error=token_exchange_failed");
      }

      const tokenData = await tokenResponse.json();

      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 21600) * 1000);

      await storage.updateAffiliate(affiliate.id, {
        mpUserId: tokenData.user_id?.toString(),
        mpAccessToken: tokenData.access_token,
        mpRefreshToken: tokenData.refresh_token,
        mpTokenExpiresAt: expiresAt,
        mpConnectedAt: new Date(),
        status: "active",
      });

      console.log(`[affiliate-oauth] Connected MP for affiliate ${affiliate.id}, user_id: ${tokenData.user_id}`);

      res.redirect("/admin/afiliado?success=mp_connected");
    } catch (error: any) {
      console.error("[affiliate-oauth] Callback error:", error);
      res.redirect("/admin/afiliado?error=unknown");
    }
  });

  // Disconnect Mercado Pago account
  app.post("/api/affiliates/oauth/disconnect", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ error: "Unauthorized" });

      const affiliate = await storage.getAffiliateByAdminId(admin.id);
      if (!affiliate) return res.status(404).json({ error: "Você não é um afiliado" });

      await storage.updateAffiliate(affiliate.id, {
        mpUserId: null,
        mpAccessToken: null,
        mpRefreshToken: null,
        mpTokenExpiresAt: null,
        mpConnectedAt: null,
      });

      res.json({ success: true, message: "Conta Mercado Pago desconectada" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================
  // AFFILIATE WITHDRAWALS
  // ============================================

  // Update affiliate PIX key
  app.patch("/api/affiliate/me/pix", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ error: "Unauthorized" });

      const affiliate = await storage.getAffiliateByAdminId(admin.id);
      if (!affiliate) return res.status(404).json({ error: "Você não é um afiliado" });

      const { pixKey, pixKeyType } = req.body;
      if (!pixKey || !pixKeyType) {
        return res.status(400).json({ error: "Chave PIX e tipo são obrigatórios" });
      }

      const validTypes = ['cpf', 'cnpj', 'email', 'phone', 'random'];
      if (!validTypes.includes(pixKeyType)) {
        return res.status(400).json({ error: "Tipo de chave PIX inválido" });
      }

      await storage.updateAffiliate(affiliate.id, { pixKey, pixKeyType });
      res.json({ success: true, message: "Chave PIX atualizada" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get affiliate withdrawals (own withdrawals)
  app.get("/api/affiliate/me/withdrawals", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ error: "Unauthorized" });

      const affiliate = await storage.getAffiliateByAdminId(admin.id);
      if (!affiliate) return res.status(404).json({ error: "Você não é um afiliado" });

      const withdrawals = await storage.listAffiliateWithdrawalsByAffiliate(affiliate.id);
      res.json(withdrawals);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Request withdrawal
  app.post("/api/affiliate/me/withdrawals", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ error: "Unauthorized" });

      const affiliate = await storage.getAffiliateByAdminId(admin.id);
      if (!affiliate) return res.status(404).json({ error: "Você não é um afiliado" });

      if (!affiliate.pixKey || !affiliate.pixKeyType) {
        return res.status(400).json({ error: "Configure sua chave PIX antes de solicitar saque" });
      }

      const { amount } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Valor inválido" });
      }

      const config = await storage.getAffiliateConfig();
      const minWithdrawal = config?.minWithdrawal || 5000; // R$ 50,00 default

      if (amount < minWithdrawal) {
        return res.status(400).json({ 
          error: `Valor mínimo para saque: R$ ${(minWithdrawal / 100).toFixed(2)}` 
        });
      }

      const availableAmount = affiliate.availableAmount || 0;
      if (amount > availableAmount) {
        return res.status(400).json({ 
          error: `Saldo insuficiente. Disponível: R$ ${(availableAmount / 100).toFixed(2)}` 
        });
      }

      // Create withdrawal request
      const withdrawal = await storage.createAffiliateWithdrawal({
        affiliateId: affiliate.id,
        amount,
        pixKey: affiliate.pixKey,
        pixKeyType: affiliate.pixKeyType,
        status: 'pending',
      });

      // Deduct from available amount
      await storage.updateAffiliate(affiliate.id, {
        availableAmount: availableAmount - amount,
      });

      // Send email notification for withdrawal request
      import("./email").then(({ sendAffiliateWithdrawalRequestedEmail }) => {
        sendAffiliateWithdrawalRequestedEmail(
          email,
          admin.name || "Afiliado",
          amount,
          affiliate.pixKey!
        ).catch(err => {
          console.error("[affiliate] Erro ao enviar email de solicitação de saque:", err);
        });
      });

      res.json({ 
        success: true, 
        message: "Solicitação de saque criada com sucesso",
        withdrawal 
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // List all withdrawals (super admin only)
  app.get("/api/affiliate-withdrawals", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas super admin pode listar saques" });
      }

      const withdrawals = await storage.listAffiliateWithdrawals();
      
      // Enrich with affiliate data
      const enrichedWithdrawals = await Promise.all(
        withdrawals.map(async (w) => {
          const affiliate = await storage.getAffiliateById(w.affiliateId);
          const affiliateAdmin = affiliate ? await storage.getAdminById(affiliate.adminId) : null;
          return {
            ...w,
            affiliateName: affiliateAdmin?.name || 'Desconhecido',
            affiliateEmail: affiliateAdmin?.email || '',
          };
        })
      );

      res.json(enrichedWithdrawals);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Mark withdrawal as paid (super admin only)
  app.patch("/api/affiliate-withdrawals/:id/pay", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas super admin pode processar saques" });
      }

      const { id } = req.params;
      const { transactionId, notes } = req.body;

      const withdrawal = await storage.getAffiliateWithdrawalById(id);
      if (!withdrawal) {
        return res.status(404).json({ error: "Saque não encontrado" });
      }

      if (withdrawal.status !== 'pending') {
        return res.status(400).json({ error: "Este saque já foi processado" });
      }

      // Update withdrawal
      await storage.updateAffiliateWithdrawal(id, {
        status: 'paid',
        paidAt: new Date(),
        processedAt: new Date(),
        processedBy: admin.id,
        transactionId: transactionId || null,
        notes: notes || null,
      });

      // Update affiliate paid amount
      const affiliate = await storage.getAffiliateById(withdrawal.affiliateId);
      if (affiliate) {
        await storage.updateAffiliate(affiliate.id, {
          paidAmount: (affiliate.paidAmount || 0) + withdrawal.amount,
        });

        // Send email notification for withdrawal paid
        const affiliateAdmin = await storage.getAdminById(affiliate.adminId);
        if (affiliateAdmin) {
          import("./email").then(({ sendAffiliateWithdrawalPaidEmail }) => {
            sendAffiliateWithdrawalPaidEmail(
              affiliateAdmin.email,
              affiliateAdmin.name || "Afiliado",
              withdrawal.amount,
              withdrawal.pixKey
            ).catch(err => {
              console.error("[affiliate] Erro ao enviar email de saque pago:", err);
            });
          });
        }
      }

      res.json({ success: true, message: "Saque marcado como pago" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Reject withdrawal (super admin only)
  app.patch("/api/affiliate-withdrawals/:id/reject", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas super admin pode processar saques" });
      }

      const { id } = req.params;
      const { notes } = req.body;

      const withdrawal = await storage.getAffiliateWithdrawalById(id);
      if (!withdrawal) {
        return res.status(404).json({ error: "Saque não encontrado" });
      }

      if (withdrawal.status !== 'pending') {
        return res.status(400).json({ error: "Este saque já foi processado" });
      }

      // Update withdrawal
      await storage.updateAffiliateWithdrawal(id, {
        status: 'rejected',
        processedAt: new Date(),
        processedBy: admin.id,
        notes: notes || 'Rejeitado pelo administrador',
      });

      // Return amount to affiliate's available balance
      const affiliate = await storage.getAffiliateById(withdrawal.affiliateId);
      if (affiliate) {
        await storage.updateAffiliate(affiliate.id, {
          availableAmount: (affiliate.availableAmount || 0) + withdrawal.amount,
        });
      }

      res.json({ success: true, message: "Saque rejeitado e valor devolvido ao saldo" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================
  // AFFILIATE SALES MANAGEMENT
  // ============================================

  // Create affiliate sale (internal - called by checkout system)
  app.post("/api/affiliate-sales", async (req, res) => {
    try {
      const affiliateSaleSchema = z.object({
        affiliateId: z.string().min(1),
        affiliateLinkId: z.string().optional(),
        pagamentoId: z.string().min(1),
        saleAmount: z.number().int().positive(),
        commissionAmount: z.number().int().nonnegative(),
        status: z.enum(["pending", "approved", "paid", "refunded", "cancelled"]).optional(),
      });

      const validatedData = affiliateSaleSchema.parse(req.body);

      const sale = await storage.createAffiliateSale(validatedData);

      const affiliate = await storage.getAffiliateById(validatedData.affiliateId);
      if (affiliate) {
        await storage.updateAffiliate(affiliate.id, {
          totalEarnings: affiliate.totalEarnings + validatedData.commissionAmount,
          pendingAmount: affiliate.pendingAmount + validatedData.commissionAmount,
        });
      }

      if (validatedData.affiliateLinkId) {
        const link = await storage.getAffiliateLinkById(validatedData.affiliateLinkId);
        if (link) {
          await storage.updateAffiliateLink(link.id, {
            conversions: link.conversions + 1,
          });
        }
      }

      console.log(`[affiliate-sale] Created sale ${sale.id} for affiliate ${validatedData.affiliateId}, commission: ${validatedData.commissionAmount}`);

      res.json(sale);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Dados inválidos", details: error.errors });
      }
      res.status(400).json({ error: error.message });
    }
  });

  // Update affiliate sale status
  app.patch("/api/affiliate-sales/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas super admins podem atualizar vendas" });
      }

      const updateSchema = z.object({
        status: z.enum(["pending", "approved", "paid", "refunded", "cancelled"]).optional(),
        mpTransferId: z.string().optional(),
        paidAt: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
      });

      const validatedData = updateSchema.parse(req.body);

      const sale = await storage.getAffiliateSaleById(req.params.id);
      if (!sale) return res.status(404).json({ error: "Venda não encontrada" });

      const oldStatus = sale.status;
      const newStatus = validatedData.status || oldStatus;

      // Build update data object with proper typing
      const updateData: Record<string, any> = { ...validatedData };

      if (newStatus === "paid" && oldStatus !== "paid") {
        updateData.paidAt = new Date();

        const affiliate = await storage.getAffiliateById(sale.affiliateId);
        if (affiliate) {
          await storage.updateAffiliate(affiliate.id, {
            pendingAmount: Math.max(0, (affiliate.pendingAmount || 0) - sale.commissionAmount),
            paidAmount: (affiliate.paidAmount || 0) + sale.commissionAmount,
          });
        }
      }

      if ((newStatus === "refunded" || newStatus === "cancelled") && oldStatus === "pending") {
        const affiliate = await storage.getAffiliateById(sale.affiliateId);
        if (affiliate) {
          await storage.updateAffiliate(affiliate.id, {
            totalEarnings: Math.max(0, (affiliate.totalEarnings || 0) - sale.commissionAmount),
            pendingAmount: Math.max(0, (affiliate.pendingAmount || 0) - sale.commissionAmount),
          });
        }
      }

      const updated = await storage.updateAffiliateSale(req.params.id, updateData);

      res.json(updated);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Dados inválidos", details: error.errors });
      }
      res.status(400).json({ error: error.message });
    }
  });

  // List all affiliate sales (super admin only)
  app.get("/api/affiliate-sales", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      const email = await validateSession(token || "");
      if (!email) return res.status(401).json({ error: "Unauthorized" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas super admins podem listar todas as vendas" });
      }

      const affiliates = await storage.listAffiliates();
      
      // Preload all admins to avoid N+1 queries
      const allAdmins = await storage.getAllAdmins();
      const adminMap = new Map(allAdmins.map(a => [a.id, a]));
      
      const allSales = [];
      for (const aff of affiliates) {
        const sales = await storage.listAffiliateSalesByAffiliate(aff.id);
        // Buscar dados do admin vinculado ao afiliado para obter name/email
        const affiliateAdmin = aff.adminId ? adminMap.get(aff.adminId) : null;
        const affiliateWithAdminData = {
          ...aff,
          name: affiliateAdmin?.name || (aff.adminId ? "Admin Removido" : "Afiliado sem conta"),
          email: affiliateAdmin?.email || (aff.adminId ? "email@removido" : ""),
        };
        allSales.push(...sales.map(s => ({ ...s, affiliate: affiliateWithAdminData })));
      }

      res.json(allSales);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Register Email Marketing routes
  registerEmailMarketingRoutes(app);

  // Register WhatsApp Marketing routes
  registerWhatsAppRoutes(app);

  // Register AI Agents routes
  registerAiAgentsRoutes(app);

  // Register Google Calendar routes
  registerGoogleCalendarRoutes(app);

  // Register Client Calendar routes
  registerClientCalendarRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}

// Background HLS conversion function
async function convertToHls(videoId: string): Promise<void> {
  const { spawn } = await import('child_process');
  const os = await import('os');
  
  console.log(`[hls] Starting conversion for ${videoId}...`);
  
  const tempDir = path.join(os.tmpdir(), `hls_${videoId}_${Date.now()}`);
  const inputPath = path.join(tempDir, 'input.mp4');
  const outputDir = path.join(tempDir, 'output');
  
  try {
    // Create temp directories
    if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    // Download video from R2 to temp file (streaming to avoid memory issues)
    console.log(`[hls] Downloading video from R2...`);
    await storage.downloadVideoToFile(videoId, inputPath);
    console.log(`[hls] Download complete`);

    // Convert to HLS using ffmpeg
    console.log(`[hls] Running ffmpeg conversion...`);
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-c:v', 'copy',           // Copy video codec (no re-encoding)
        '-c:a', 'aac',            // AAC audio
        '-start_number', '0',
        '-hls_time', '10',        // 10 second segments
        '-hls_list_size', '0',    // Include all segments in playlist
        '-hls_segment_filename', path.join(outputDir, 'segment_%03d.ts'),
        '-f', 'hls',
        path.join(outputDir, 'playlist.m3u8')
      ]);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log(`[hls] ffmpeg completed successfully`);
          resolve();
        } else {
          console.error(`[hls] ffmpeg error:`, stderr.slice(-500));
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });

      ffmpeg.on('error', (err) => {
        reject(err);
      });
    });

    // Upload HLS files to R2
    console.log(`[hls] Uploading HLS files to R2...`);
    const hlsFiles = await import('fs').then(fs => fs.promises.readdir(outputDir));
    
    for (const file of hlsFiles) {
      const filePath = path.join(outputDir, file);
      const fileContent = readFileSync(filePath);
      const contentType = file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/MP2T';
      
      await storage.uploadHlsFile(videoId, file, fileContent, contentType);
      console.log(`[hls] Uploaded: ${file}`);
    }

    // Update database with HLS URL
    const hlsPlaylistUrl = `/api/webinar/hls/${videoId}/playlist.m3u8`;
    await storage.updateVideoHlsStatus(videoId, 'completed', hlsPlaylistUrl);
    console.log(`[hls] Conversion complete! Playlist: ${hlsPlaylistUrl}`);

  } finally {
    // Cleanup temp files
    try {
      const fs = await import('fs');
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      console.log(`[hls] Cleaned up temp files`);
    } catch (e) {
      console.error(`[hls] Cleanup error:`, e);
    }
  }
}
