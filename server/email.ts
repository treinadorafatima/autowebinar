import { Resend } from 'resend';
import { storage } from './storage';
import type { EmailNotificationTemplate } from '@shared/schema';

// Fixed email configuration for AutoWebinar
const FROM_EMAIL = "AutoWebinar <contato@autowebinar.shop>";
const REPLY_TO_EMAIL = "contato@autowebinar.shop";

// Cache for Resend API key
let cachedApiKey: string | null = null;
let apiKeyCacheTime: number = 0;
const API_KEY_CACHE_TTL = 60000; // 1 minute cache

/**
 * Get Resend API key from Replit connection or environment
 * Always uses fixed FROM_EMAIL for autowebinar.shop
 */
async function getResendApiKey(): Promise<string> {
  // Check cache first
  if (cachedApiKey && Date.now() - apiKeyCacheTime < API_KEY_CACHE_TTL) {
    return cachedApiKey;
  }

  // Try to get API key from Replit Connectors API
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (hostname && xReplitToken) {
    try {
      const response = await fetch(
        `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
        {
          headers: {
            'Accept': 'application/json',
            'X_REPLIT_TOKEN': xReplitToken
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        const connectionSettings = data.items?.[0];
        
        if (connectionSettings?.settings?.api_key) {
          const apiKeyFromConnection = connectionSettings.settings.api_key as string;
          cachedApiKey = apiKeyFromConnection;
          apiKeyCacheTime = Date.now();
          console.log(`[email] Using Resend API key from Replit connection`);
          return apiKeyFromConnection;
        }
      }
    } catch (error) {
      console.warn('[email] Failed to get Resend API key from connector, falling back to env:', error);
    }
  }

  // Fallback to environment variable
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('[email] RESEND_API_KEY não configurada e conexão Replit não disponível');
  }

  cachedApiKey = apiKey;
  apiKeyCacheTime = Date.now();
  console.log(`[email] Using Resend API key from environment variable`);
  return cachedApiKey;
}

/**
 * Replace placeholders in email template with actual values
 * Supports placeholders like {name}, {planName}, {loginUrl}, etc.
 */
function replacePlaceholders(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  return result;
}

/**
 * Get email template from database or return null if not found/inactive
 */
async function getActiveTemplate(notificationType: string): Promise<EmailNotificationTemplate | null> {
  try {
    const template = await storage.getEmailNotificationTemplateByType(notificationType);
    if (template && template.isActive) {
      return template;
    }
    return null;
  } catch (error) {
    console.warn(`[email] Failed to get template for ${notificationType}, using fallback:`, error);
    return null;
  }
}

// Email queue for retry mechanism
interface PendingEmail {
  id: string;
  type: string;
  to: string;
  data: any;
  attempts: number;
  createdAt: Date;
  lastError?: string;
}

const pendingEmails: PendingEmail[] = [];
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_INTERVAL_MS = 60000; // 1 minute

/**
 * Check if email service is available
 */
export function isEmailServiceAvailable(): boolean {
  return !!(process.env.RESEND_API_KEY || process.env.REPLIT_CONNECTORS_HOSTNAME);
}

/**
 * Get Resend client - returns null if not configured instead of throwing
 */
async function getResendClientSafe(): Promise<{ client: Resend; fromEmail: string } | null> {
  try {
    const apiKey = await getResendApiKey();
    return {
      client: new Resend(apiKey),
      fromEmail: FROM_EMAIL
    };
  } catch (error) {
    console.warn('[email] Resend não configurado:', error);
    return null;
  }
}

/**
 * Get Resend client - throws if not configured
 */
async function getResendClient(): Promise<{ client: Resend; fromEmail: string }> {
  const apiKey = await getResendApiKey();
  return {
    client: new Resend(apiKey),
    fromEmail: FROM_EMAIL
  };
}

/**
 * Queue an email for retry if initial send fails
 */
function queueEmailForRetry(type: string, to: string, data: any, error: string): void {
  const id = `${type}_${to}_${Date.now()}`;
  pendingEmails.push({
    id,
    type,
    to,
    data,
    attempts: 1,
    createdAt: new Date(),
    lastError: error,
  });
  console.log(`[email-queue] Email queued for retry: ${type} to ${to} (${pendingEmails.length} pending)`);
}

/**
 * Process pending emails (called by scheduler)
 */
export async function processPendingEmails(): Promise<void> {
  if (pendingEmails.length === 0) return;
  
  const resend = await getResendClientSafe();
  if (!resend) {
    console.log('[email-queue] Resend not configured, skipping retry');
    return;
  }
  
  const toProcess = [...pendingEmails];
  
  for (const email of toProcess) {
    if (email.attempts >= MAX_RETRY_ATTEMPTS) {
      // Remove from queue after max attempts
      const idx = pendingEmails.findIndex(e => e.id === email.id);
      if (idx !== -1) pendingEmails.splice(idx, 1);
      console.error(`[email-queue] Email failed after ${MAX_RETRY_ATTEMPTS} attempts: ${email.type} to ${email.to}`);
      continue;
    }
    
    try {
      let success = false;
      
      switch (email.type) {
        case 'welcome':
          success = await sendWelcomeEmail(email.to, email.data.name);
          break;
        case 'credentials':
          success = await sendAccessCredentialsEmail(email.to, email.data.name, email.data.tempPassword, email.data.planName);
          break;
        case 'payment_confirmed':
          success = await sendPaymentConfirmedEmail(email.to, email.data.name, email.data.planName, email.data.expirationDate);
          break;
        case 'password_reset':
          success = await sendPasswordResetEmail(email.to, email.data.name, email.data.resetToken);
          break;
        case 'plan_expired':
          success = await sendPlanExpiredEmail(email.to, email.data.name, email.data.planName);
          break;
        case 'payment_failed':
          success = await sendPaymentFailedEmail(email.to, email.data.name, email.data.planName, email.data.reason, email.data.planoId);
          break;
      }
      
      if (success) {
        const idx = pendingEmails.findIndex(e => e.id === email.id);
        if (idx !== -1) pendingEmails.splice(idx, 1);
        console.log(`[email-queue] Retry successful: ${email.type} to ${email.to}`);
      } else {
        email.attempts++;
        email.lastError = 'Send returned false';
      }
    } catch (error: any) {
      email.attempts++;
      email.lastError = error.message;
      console.error(`[email-queue] Retry failed: ${email.type} to ${email.to}:`, error.message);
    }
  }
}

/**
 * Start email retry scheduler
 */
export function startEmailRetryScheduler(): void {
  console.log('[email-queue] Starting email retry scheduler');
  setInterval(processPendingEmails, RETRY_INTERVAL_MS);
}

/**
 * Get pending email count for monitoring
 */
export function getPendingEmailCount(): number {
  return pendingEmails.length;
}

const APP_NAME = "AutoWebinar";
const APP_URL = process.env.PUBLIC_BASE_URL 
  ? process.env.PUBLIC_BASE_URL.replace(/\/$/, '')
  : (process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
    : "https://autowebinar.com.br");
const LOGIN_URL = `${APP_URL}/login`;

export async function sendWelcomeEmail(to: string, name: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const placeholderValues: Record<string, string> = {
      name: name || 'Usuário',
      email: to,
      appName: APP_NAME,
      adminUrl: `${APP_URL}/admin`,
      loginUrl: LOGIN_URL,
    };
    
    const dbTemplate = await getActiveTemplate('welcome');
    
    let subject: string;
    let html: string;
    let text: string;
    
    if (dbTemplate) {
      subject = replacePlaceholders(dbTemplate.subject, placeholderValues);
      html = replacePlaceholders(dbTemplate.htmlTemplate, placeholderValues);
      text = replacePlaceholders(dbTemplate.textTemplate || '', placeholderValues);
      console.log(`[email] Using database template for welcome email`);
    } else {
      subject = `Bem-vindo ao ${APP_NAME}`;
      text = `
Ola ${name},

Sua conta foi criada com sucesso no ${APP_NAME}!

Agora voce tem acesso a todos os recursos da plataforma de webinarios automatizados.

O que voce pode fazer:
- Criar webinarios automatizados que rodam 24/7
- Usar IA para gerar roteiros de vendas
- Criar mensagens de email e WhatsApp com IA
- Capturar leads automaticamente
- Transcrever videos automaticamente com IA

Acesse sua conta: ${APP_URL}/admin

Se tiver qualquer duvida, estamos aqui para ajudar!

---
${APP_NAME}
      `.trim();
    
      html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo ao ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #3b82f6; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Bem-vindo ao ${APP_NAME}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Sua conta foi criada com sucesso! Agora voce tem acesso a todos os recursos da plataforma de webinarios automatizados.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #f8fafc; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #1e40af; font-weight: 600; font-size: 14px;">O que voce pode fazer:</p>
                    <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.8;">
                      - Criar webinarios automatizados que rodam 24/7<br>
                      - Usar IA para gerar roteiros de vendas<br>
                      - Criar mensagens de email e WhatsApp com IA<br>
                      - Capturar leads automaticamente<br>
                      - Transcrever videos automaticamente com IA
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${APP_URL}/admin" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Acessar Minha Conta
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Se tiver qualquer duvida, estamos aqui para ajudar!
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Webinarios Automatizados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `;
    }

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject,
      html,
      text,
    });

    console.log(`[email] Email de boas-vindas enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de boas-vindas para ${to}:`, error);
    return false;
  }
}

export async function sendAccessCredentialsEmail(to: string, name: string, tempPassword: string, planName: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const placeholderValues: Record<string, string> = {
      name: name || 'Usuário',
      email: to,
      tempPassword: tempPassword,
      planName: planName,
      loginUrl: LOGIN_URL,
      appName: APP_NAME,
    };
    
    const dbTemplate = await getActiveTemplate('credentials');
    
    let subject: string;
    let html: string;
    let text: string;
    
    if (dbTemplate) {
      subject = replacePlaceholders(dbTemplate.subject, placeholderValues);
      html = replacePlaceholders(dbTemplate.htmlTemplate, placeholderValues);
      text = replacePlaceholders(dbTemplate.textTemplate || '', placeholderValues);
      console.log(`[email] Using database template for credentials email`);
    } else {
      subject = `Seu acesso ao ${APP_NAME} foi liberado!`;
      text = `
Ola ${name},

Seu acesso ao ${APP_NAME} foi liberado com sucesso!

Aqui estao suas credenciais de acesso:

E-mail: ${to}
Senha: ${tempPassword}

Acesse sua conta agora: ${LOGIN_URL}

IMPORTANTE: Por seguranca, recomendamos que voce altere sua senha apos o primeiro login.

Plano: ${planName}

O que voce pode fazer:
- Criar webinarios automatizados que rodam 24/7
- Usar IA para gerar roteiros de vendas
- Criar mensagens de email e WhatsApp com IA
- Capturar leads automaticamente
- Transcrever videos automaticamente com IA

Se tiver qualquer duvida, estamos aqui para ajudar!

---
${APP_NAME}
    `.trim();
    
      html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seu Acesso ao ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #10b981; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Seu Acesso Foi Liberado!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Seu acesso ao ${APP_NAME} foi liberado com sucesso! Use as credenciais abaixo para acessar sua conta:
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #ecfdf5; border-radius: 6px; border: 2px solid #10b981;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #047857; font-weight: 600; font-size: 14px;">Suas Credenciais de Acesso:</p>
                    <p style="margin: 0 0 8px; color: #374151; font-size: 15px; line-height: 1.8;">
                      <strong>E-mail:</strong> ${to}
                    </p>
                    <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.8;">
                      <strong>Senha:</strong> <span style="background-color: #d1fae5; padding: 4px 12px; border-radius: 4px; font-family: monospace; font-size: 16px; letter-spacing: 1px;">${tempPassword}</span>
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 20px 0; background-color: #fef3c7; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                      <strong>Plano:</strong> ${planName}<br>
                      <strong>Importante:</strong> Por seguranca, recomendamos que voce altere sua senha apos o primeiro login.
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${LOGIN_URL}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Acessar Minha Conta
                    </a>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #f8fafc; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #1e40af; font-weight: 600; font-size: 14px;">O que voce pode fazer:</p>
                    <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.8;">
                      - Criar webinarios automatizados que rodam 24/7<br>
                      - Usar IA para gerar roteiros de vendas<br>
                      - Criar mensagens de email e WhatsApp com IA<br>
                      - Capturar leads automaticamente<br>
                      - Transcrever videos automaticamente com IA
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Se tiver qualquer duvida, estamos aqui para ajudar!
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Webinarios Automatizados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
    }

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject,
      html,
      text,
    });

    console.log(`[email] Email de credenciais enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de credenciais para ${to}:`, error);
    return false;
  }
}

export async function sendPasswordResetEmail(to: string, name: string, resetToken: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;
    
    const placeholderValues: Record<string, string> = {
      name: name || 'Usuário',
      resetUrl: resetUrl,
      appName: APP_NAME,
    };
    
    const dbTemplate = await getActiveTemplate('password_reset');
    
    let subject: string;
    let html: string;
    let text: string;
    
    if (dbTemplate) {
      subject = replacePlaceholders(dbTemplate.subject, placeholderValues);
      html = replacePlaceholders(dbTemplate.htmlTemplate, placeholderValues);
      text = replacePlaceholders(dbTemplate.textTemplate || '', placeholderValues);
      console.log(`[email] Using database template for password_reset email`);
    } else {
      subject = `Recuperacao de Senha - ${APP_NAME}`;
      text = `
Ola ${name},

Recebemos uma solicitacao para redefinir a senha da sua conta no ${APP_NAME}.

Para criar uma nova senha, acesse o link abaixo:
${resetUrl}

IMPORTANTE: Este link e valido por 1 hora. Se voce nao solicitou a redefinicao de senha, ignore este email.

---
${APP_NAME}
Este e um email automatico, por favor nao responda.
    `.trim();
    
      html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperacao de Senha - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #7c3aed; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Recuperacao de Senha</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Recebemos uma solicitacao para redefinir a senha da sua conta no ${APP_NAME}.
              </p>
              <p style="margin: 0 0 30px; color: #374151; font-size: 16px; line-height: 1.6;">
                Clique no botao abaixo para criar uma nova senha:
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${resetUrl}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Redefinir Minha Senha
                    </a>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #fef3c7; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                      <strong>Importante:</strong> Este link e valido por 1 hora. Se voce nao solicitou a redefinicao de senha, ignore este email.
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                Se o botao nao funcionar, copie e cole este link no seu navegador:<br>
                <a href="${resetUrl}" style="color: #7c3aed; word-break: break-all;">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Este e um email automatico.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
    }

    console.log(`[email] Tentando enviar email de recuperacao para ${to} de ${fromEmail}`);
    
    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject,
      html,
      text,
    });

    if (result.error) {
      console.error(`[email] Erro Resend ao enviar email de recuperacao para ${to}:`, result.error);
      return false;
    }

    console.log(`[email] Email de recuperacao de senha enviado com sucesso para ${to}. ID: ${result.data?.id}`);
    return true;
  } catch (error: any) {
    console.error(`[email] Erro ao enviar email de recuperacao para ${to}:`, error?.message || error);
    if (error?.statusCode) {
      console.error(`[email] Status code: ${error.statusCode}`);
    }
    return false;
  }
}

export async function sendPlanExpiredEmail(to: string, name: string, planName: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const renewUrl = `${APP_URL}/checkout`;
    
    const placeholderValues: Record<string, string> = {
      name: name || 'Usuário',
      planName: planName,
      renewUrl: renewUrl,
      appName: APP_NAME,
    };
    
    const dbTemplate = await getActiveTemplate('plan_expired');
    
    let subject: string;
    let html: string;
    let text: string;
    
    if (dbTemplate) {
      subject = replacePlaceholders(dbTemplate.subject, placeholderValues);
      html = replacePlaceholders(dbTemplate.htmlTemplate, placeholderValues);
      text = replacePlaceholders(dbTemplate.textTemplate || '', placeholderValues);
      console.log(`[email] Using database template for plan_expired email`);
    } else {
      subject = `Seu plano expirou - ${APP_NAME}`;
      text = `
Ola ${name},

O seu plano ${planName} expirou e o acesso a sua conta no ${APP_NAME} foi suspenso.

O que acontece agora:
- Seus webinarios foram pausados
- Novos leads nao serao capturados
- As ferramentas de IA estao indisponiveis

Nao se preocupe! Seus dados estao seguros. Renove seu plano agora e continue vendendo no automatico.

Renovar plano: ${APP_URL}/checkout

Precisa de ajuda? Entre em contato com nosso suporte.

---
${APP_NAME}
    `.trim();
    
      html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seu Plano Expirou - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #dc2626; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Seu Plano Expirou</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                O seu plano <strong>${planName}</strong> expirou e o acesso a sua conta no ${APP_NAME} foi suspenso.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #fef2f2; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 8px; color: #991b1b; font-weight: 600; font-size: 14px;">
                      O que acontece agora:
                    </p>
                    <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.6;">
                      - Seus webinarios foram pausados<br>
                      - Novos leads nao serao capturados<br>
                      - As ferramentas de IA estao indisponiveis
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                <strong>Nao se preocupe!</strong> Seus dados estao seguros. Renove seu plano agora e continue vendendo no automatico.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 25px 0;">
                    <a href="${APP_URL}/checkout" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Renovar Meu Plano
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Precisa de ajuda? Entre em contato com nosso suporte.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Webinarios Automatizados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
    }

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject,
      html,
      text,
    });

    console.log(`[email] Email de plano expirado enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de plano expirado para ${to}:`, error);
    return false;
  }
}

export async function sendPaymentFailedEmail(to: string, name: string, planName: string, reason: string, planoId?: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    // Build checkout URL with pre-filled email and name
    const checkoutParams = new URLSearchParams({
      email: to,
      nome: name,
      renovacao: "true"
    });
    const checkoutUrl = planoId 
      ? `${APP_URL}/checkout/${planoId}?${checkoutParams.toString()}`
      : `${APP_URL}/checkout?${checkoutParams.toString()}`;
    
    const placeholderValues: Record<string, string> = {
      name: name || 'Usuário',
      planName: planName,
      reason: reason || 'Cartão recusado ou limite insuficiente',
      paymentUrl: checkoutUrl,
      appName: APP_NAME,
    };
    
    const dbTemplate = await getActiveTemplate('payment_failed');
    
    let subject: string;
    let html: string;
    let text: string;
    
    if (dbTemplate) {
      subject = replacePlaceholders(dbTemplate.subject, placeholderValues);
      html = replacePlaceholders(dbTemplate.htmlTemplate, placeholderValues);
      text = replacePlaceholders(dbTemplate.textTemplate || '', placeholderValues);
      console.log(`[email] Using database template for payment_failed email`);
    } else {
      subject = `Acao necessaria: pagamento nao aprovado - ${APP_NAME}`;
      text = `
Ola ${name},

A renovacao do seu plano ${planName} nao foi aprovada e seu acesso foi temporariamente suspenso.

Motivo: ${reason || "Cartao recusado ou limite insuficiente"}

Nao se preocupe! Seus dados e webinarios estao seguros. Assim que regularizar o pagamento, seu acesso sera reativado automaticamente.

O que voce pode fazer:
- Verificar o limite disponivel no seu cartao
- Atualizar o metodo de pagamento
- Entrar em contato com seu banco para liberar a transacao

Regularizar agora: ${checkoutUrl}

Se precisar de ajuda, entre em contato com nosso suporte.

---
${APP_NAME}
    `.trim();
    
      html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pagamento nao aprovado - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #dc2626; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Pagamento Nao Aprovado</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                A renovacao do seu plano <strong>${planName}</strong> nao foi aprovada e seu acesso foi temporariamente suspenso.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #fef2f2; border-radius: 6px; border-left: 4px solid #dc2626;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 8px; color: #991b1b; font-weight: 600; font-size: 14px;">
                      Motivo:
                    </p>
                    <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.6;">
                      ${reason || "Cartao recusado ou limite insuficiente"}
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #ecfdf5; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 8px; color: #047857; font-weight: 600; font-size: 14px;">
                      Nao se preocupe!
                    </p>
                    <p style="margin: 0; color: #047857; font-size: 14px; line-height: 1.6;">
                      Seus dados e webinarios estao seguros. Assim que regularizar o pagamento, seu acesso sera <strong>reativado automaticamente</strong>.
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 12px; color: #374151; font-size: 16px; line-height: 1.6; font-weight: 600;">
                O que voce pode fazer:
              </p>
              <ul style="margin: 0 0 25px; padding-left: 20px; color: #374151; font-size: 15px; line-height: 1.8;">
                <li>Verificar o limite disponivel no seu cartao</li>
                <li>Atualizar o metodo de pagamento</li>
                <li>Entrar em contato com seu banco para liberar a transacao</li>
              </ul>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 25px 0;">
                    <a href="${checkoutUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Regularizar Pagamento
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Se precisar de ajuda, entre em contato com nosso suporte.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Webinarios Automatizados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
    }

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject,
      html,
      text,
    });

    console.log(`[email] Email de falha de pagamento enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de falha de pagamento para ${to}:`, error);
    return false;
  }
}

export async function sendPaymentPendingEmail(to: string, name: string, planName: string, paymentMethod: string, planoId?: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    // Build checkout URL with pre-filled email and name for alternative payment
    const checkoutParams = new URLSearchParams({
      email: to,
      nome: name,
    });
    const checkoutUrl = planoId 
      ? `${APP_URL}/checkout/${planoId}?${checkoutParams.toString()}`
      : `${APP_URL}/checkout?${checkoutParams.toString()}`;
    
    // Card pending - offer PIX/Boleto as alternatives
    const text = `
Ola ${name},

Recebemos seu pedido para o plano ${planName}!

Seu pagamento com cartao esta EM ANALISE pelo banco emissor.

Isso pode levar de 24 a 48 horas para ser processado.

NAO QUER ESPERAR? Pague agora com PIX ou Boleto!

PIX: Aprovacao instantanea - seu acesso e liberado na hora!
Boleto: Vencimento em 3 dias uteis.

Pagar com PIX ou Boleto: ${checkoutUrl}

IMPORTANTE: Seu acesso sera liberado automaticamente assim que o pagamento for confirmado. Voce recebera um email com suas credenciais de acesso.

Precisa de ajuda? Entre em contato com nosso suporte.

---
${APP_NAME}
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pagamento em Analise - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #f59e0b; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Pagamento em Analise</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Recebemos seu pedido para o plano <strong>${planName}</strong>!
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #fffbeb; border-radius: 6px; border-left: 4px solid #f59e0b;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 8px; color: #92400e; font-weight: 600; font-size: 14px;">
                      Pagamento com cartao - EM ANALISE
                    </p>
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                      Seu pagamento esta sendo analisado pelo banco emissor do cartao. Isso pode levar de <strong>24 a 48 horas</strong>.
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #ecfdf5; border-radius: 6px; border: 2px solid #10b981;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #047857; font-weight: 700; font-size: 16px; text-align: center;">
                      NAO QUER ESPERAR?
                    </p>
                    <p style="margin: 0 0 16px; color: #047857; font-size: 14px; line-height: 1.6; text-align: center;">
                      Pague agora com <strong>PIX</strong> ou <strong>Boleto</strong> e tenha seu acesso liberado imediatamente!
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="text-align: center;">
                          <a href="${checkoutUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                            Pagar com PIX ou Boleto
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 16px 0 0; color: #047857; font-size: 13px; line-height: 1.6; text-align: center;">
                      <strong>PIX:</strong> Aprovacao instantanea<br>
                      <strong>Boleto:</strong> Vencimento em 3 dias uteis
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #f0f9ff; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 8px; color: #0369a1; font-weight: 600; font-size: 14px;">
                      O que acontece depois?
                    </p>
                    <p style="margin: 0; color: #0369a1; font-size: 14px; line-height: 1.6;">
                      Assim que o pagamento for confirmado (seja pelo cartao ou outro metodo), voce recebera um email com suas <strong>credenciais de acesso</strong>.
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Precisa de ajuda? Entre em contato com nosso suporte.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Webinarios Automatizados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Pagamento em analise - ${planName} - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de pagamento pendente enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de pagamento pendente para ${to}:`, error);
    return false;
  }
}

export async function sendPaymentConfirmedEmail(to: string, name: string, planName: string, expirationDate: Date): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const formattedDate = expirationDate.toLocaleDateString('pt-BR');
    
    const placeholderValues: Record<string, string> = {
      name: name || 'Usuário',
      planName: planName,
      expirationDate: formattedDate,
      loginUrl: `${APP_URL}/admin`,
      appName: APP_NAME,
    };
    
    const dbTemplate = await getActiveTemplate('payment_confirmed');
    
    let subject: string;
    let html: string;
    let text: string;
    
    if (dbTemplate) {
      subject = replacePlaceholders(dbTemplate.subject, placeholderValues);
      html = replacePlaceholders(dbTemplate.htmlTemplate, placeholderValues);
      text = replacePlaceholders(dbTemplate.textTemplate || '', placeholderValues);
      console.log(`[email] Using database template for payment_confirmed email`);
    } else {
      subject = `Pagamento confirmado - ${APP_NAME}`;
      text = `
Ola ${name},

Otima noticia! Seu pagamento foi confirmado com sucesso.

Detalhes da sua assinatura:
- Plano: ${planName}
- Valido ate: ${formattedDate}

Seu acesso esta liberado! Voce ja pode aproveitar todos os recursos da plataforma.

Acesse sua conta: ${APP_URL}/admin

Obrigado por confiar no ${APP_NAME}!

---
${APP_NAME}
    `.trim();
    
      html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pagamento Confirmado - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #10b981; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Pagamento Confirmado!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Otima noticia! Seu pagamento foi confirmado com sucesso.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #ecfdf5; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #047857; font-weight: 600; font-size: 14px;">Detalhes da sua assinatura:</p>
                    <p style="margin: 0; color: #047857; font-size: 14px; line-height: 1.8;">
                      <strong>Plano:</strong> ${planName}<br>
                      <strong>Valido ate:</strong> ${formattedDate}
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                <strong>Seu acesso esta liberado!</strong> Voce ja pode aproveitar todos os recursos da plataforma.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${APP_URL}/admin" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Acessar Minha Conta
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Obrigado por confiar no ${APP_NAME}!
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Webinarios Automatizados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
    }

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject,
      html,
      text,
    });

    console.log(`[email] Email de pagamento confirmado enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de pagamento confirmado para ${to}:`, error);
    return false;
  }
}

export async function sendExpirationReminderEmail(to: string, name: string, planName: string, daysUntilExpiration: number, expirationDate: Date): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const formattedDate = expirationDate.toLocaleDateString('pt-BR');
    const renewUrl = `${APP_URL}/checkout?email=${encodeURIComponent(to)}`;
    
    const urgencyText = daysUntilExpiration === 1 ? "amanha" : `em ${daysUntilExpiration} dias`;
    const subjectUrgency = daysUntilExpiration === 1 ? "Seu plano vence amanha!" : `Seu plano vence em ${daysUntilExpiration} dias`;
    
    const text = `
Ola ${name},

Seu plano ${planName} vence ${urgencyText} (${formattedDate}).

Para continuar aproveitando todos os recursos do ${APP_NAME}, renove sua assinatura antes do vencimento:
- Webinarios automatizados 24/7
- Ferramentas de IA para roteiros e mensagens
- Captura automatica de leads
- Suporte prioritario

Renovar agora: ${renewUrl}

Nao deixe seus webinarios pararem! Renove ja e continue vendendo no automatico.

---
${APP_NAME}
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lembrete de Renovacao - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: ${daysUntilExpiration === 1 ? '#f59e0b' : '#3b82f6'}; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">${subjectUrgency}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Seu plano <strong>${planName}</strong> vence <strong>${urgencyText}</strong> (${formattedDate}).
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #f0f9ff; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #0369a1; font-weight: 600; font-size: 14px;">Continue aproveitando:</p>
                    <p style="margin: 0; color: #0369a1; font-size: 14px; line-height: 1.8;">
                      - Webinarios automatizados 24/7<br>
                      - Ferramentas de IA para roteiros e mensagens<br>
                      - Captura automatica de leads<br>
                      - Suporte prioritario
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 25px 0;">
                    <a href="${renewUrl}" style="display: inline-block; background-color: ${daysUntilExpiration === 1 ? '#f59e0b' : '#3b82f6'}; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Renovar Meu Plano
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Nao deixe seus webinarios pararem! Renove ja e continue vendendo no automatico.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Webinarios Automatizados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `${subjectUrgency} - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de lembrete de vencimento (${daysUntilExpiration} dias) enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de lembrete para ${to}:`, error);
    return false;
  }
}

export async function sendExpiredRenewalEmail(to: string, name: string, planName: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const renewUrl = `${APP_URL}/checkout?email=${encodeURIComponent(to)}`;
    
    const text = `
Ola ${name},

Seu plano ${planName} venceu ontem e seu acesso foi suspenso.

Mas nao se preocupe! Seus dados estao seguros e voce pode recuperar o acesso agora mesmo.

O que acontece enquanto seu plano esta vencido:
- Seus webinarios foram pausados
- Novos leads nao estao sendo capturados
- Ferramentas de IA indisponiveis

Renove agora com apenas um clique (seu email ja esta preenchido):
${renewUrl}

Nao perca mais vendas! Renove seu plano e volte a vender no automatico.

---
${APP_NAME}
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Renove Seu Plano - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #dc2626; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Seu Plano Venceu</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Seu plano <strong>${planName}</strong> venceu ontem e seu acesso foi suspenso.
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                <strong>Mas nao se preocupe!</strong> Seus dados estao seguros e voce pode recuperar o acesso agora mesmo.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #fef2f2; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #991b1b; font-weight: 600; font-size: 14px;">O que esta acontecendo:</p>
                    <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.8;">
                      - Seus webinarios foram pausados<br>
                      - Novos leads nao estao sendo capturados<br>
                      - Ferramentas de IA indisponiveis
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Renove agora com apenas um clique (seu email ja esta preenchido):
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 25px 0;">
                    <a href="${renewUrl}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Renovar Agora
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Nao perca mais vendas! Renove seu plano e volte a vender no automatico.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Webinarios Automatizados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Seu plano venceu - Renove agora - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de renovacao pos-vencimento enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de renovacao para ${to}:`, error);
    return false;
  }
}

// ============================================
// AFFILIATE EMAIL FUNCTIONS
// ============================================

const AFFILIATE_LOGIN_URL = `${APP_URL}/afiliado/login`;

export async function sendAffiliateApprovedEmail(to: string, name: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const text = `
Ola ${name},

Parabens! Seu cadastro no programa de afiliados do ${APP_NAME} foi aprovado!

Agora voce pode:
- Acessar seu painel de afiliado
- Gerar seus links de divulgacao
- Acompanhar suas vendas e comissoes
- Solicitar saques de seus ganhos

Acesse seu painel: ${AFFILIATE_LOGIN_URL}

Boas vendas!

---
${APP_NAME} - Programa de Afiliados
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cadastro Aprovado - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #10b981; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Cadastro Aprovado!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Parabens! Seu cadastro no programa de afiliados do ${APP_NAME} foi aprovado!
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #ecfdf5; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #047857; font-weight: 600; font-size: 14px;">Agora voce pode:</p>
                    <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.8;">
                      - Acessar seu painel de afiliado<br>
                      - Gerar seus links de divulgacao<br>
                      - Acompanhar suas vendas e comissoes<br>
                      - Solicitar saques de seus ganhos
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${AFFILIATE_LOGIN_URL}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Acessar Meu Painel
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Boas vendas!
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Programa de Afiliados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Cadastro aprovado - Programa de Afiliados ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de afiliado aprovado enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de afiliado aprovado para ${to}:`, error);
    return false;
  }
}

export async function sendAffiliatePendingEmail(to: string, name: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const text = `
Ola ${name},

Recebemos seu cadastro no programa de afiliados do ${APP_NAME}!

Seu cadastro esta em analise e em breve voce recebera uma resposta.

Enquanto isso, prepare-se para comecar a divulgar e ganhar comissoes!

Se tiver alguma duvida, entre em contato conosco.

---
${APP_NAME} - Programa de Afiliados
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cadastro Recebido - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #3b82f6; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Cadastro Recebido!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Recebemos seu cadastro no programa de afiliados do ${APP_NAME}!
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #fef3c7; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                      <strong>Status:</strong> Em analise<br><br>
                      Seu cadastro esta sendo analisado e em breve voce recebera uma resposta por e-mail.
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Enquanto isso, prepare-se para comecar a divulgar e ganhar comissoes!
              </p>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Se tiver alguma duvida, entre em contato conosco.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Programa de Afiliados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Cadastro recebido - Programa de Afiliados ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de cadastro pendente enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de cadastro pendente para ${to}:`, error);
    return false;
  }
}

export async function sendAffiliateSaleEmail(to: string, name: string, saleAmount: number, commissionAmount: number): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const saleFormatted = (saleAmount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const commissionFormatted = (commissionAmount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    const text = `
Ola ${name},

Voce acaba de fazer uma nova venda! Parabens!

Detalhes da venda:
- Valor da venda: ${saleFormatted}
- Sua comissao: ${commissionFormatted}

A comissao ja foi adicionada ao seu saldo e estara disponivel para saque em breve.

Acesse seu painel para ver mais detalhes: ${AFFILIATE_LOGIN_URL}

Continue divulgando e vendendo!

---
${APP_NAME} - Programa de Afiliados
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nova Venda - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #10b981; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Nova Venda Realizada!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Voce acaba de fazer uma nova venda! Parabens!
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #ecfdf5; border-radius: 6px; border: 2px solid #10b981;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #047857; font-weight: 600; font-size: 14px;">Detalhes da Venda:</p>
                    <p style="margin: 0 0 8px; color: #374151; font-size: 15px; line-height: 1.8;">
                      <strong>Valor da venda:</strong> ${saleFormatted}
                    </p>
                    <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.8;">
                      <strong>Sua comissao:</strong> <span style="background-color: #d1fae5; padding: 4px 12px; border-radius: 4px; font-size: 16px; font-weight: 600; color: #047857;">${commissionFormatted}</span>
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                A comissao ja foi adicionada ao seu saldo e estara disponivel para saque em breve.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${AFFILIATE_LOGIN_URL}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Ver Meu Painel
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Continue divulgando e vendendo!
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Programa de Afiliados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Nova venda: ${commissionFormatted} de comissao - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de nova venda enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de nova venda para ${to}:`, error);
    return false;
  }
}

export async function sendAffiliatePasswordResetEmail(to: string, name: string, resetToken: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const resetUrl = `${APP_URL}/afiliado/reset-password?token=${resetToken}`;
    
    const text = `
Ola ${name},

Recebemos uma solicitacao para redefinir a senha da sua conta de afiliado no ${APP_NAME}.

Para criar uma nova senha, acesse o link abaixo:
${resetUrl}

IMPORTANTE: Este link e valido por 1 hora. Se voce nao solicitou a redefinicao de senha, ignore este email.

---
${APP_NAME} - Programa de Afiliados
Este e um email automatico, por favor nao responda.
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperacao de Senha - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #7c3aed; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Recuperacao de Senha</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Recebemos uma solicitacao para redefinir a senha da sua conta de afiliado no ${APP_NAME}.
              </p>
              <p style="margin: 0 0 30px; color: #374151; font-size: 16px; line-height: 1.6;">
                Clique no botao abaixo para criar uma nova senha:
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${resetUrl}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Redefinir Minha Senha
                    </a>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #fef3c7; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                      <strong>Importante:</strong> Este link e valido por 1 hora. Se voce nao solicitou a redefinicao de senha, ignore este email.
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                Se o botao nao funcionar, copie e cole este link no seu navegador:<br>
                <a href="${resetUrl}" style="color: #7c3aed; word-break: break-all;">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Este e um email automatico.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Recuperacao de Senha - Afiliado ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de recuperacao de senha de afiliado enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de recuperacao de afiliado para ${to}:`, error);
    return false;
  }
}

export async function sendAffiliateRejectedEmail(to: string, name: string, reason?: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const reasonText = reason ? `\nMotivo: ${reason}` : '';
    
    const text = `
Ola ${name},

Agradecemos seu interesse em participar do programa de afiliados do ${APP_NAME}.

Infelizmente, apos analise do seu cadastro, nao foi possivel aprovar sua solicitacao neste momento.${reasonText}

Voce pode tentar novamente no futuro, garantindo que todas as informacoes estejam corretas e completas.

Se tiver alguma duvida, entre em contato conosco.

---
${APP_NAME} - Programa de Afiliados
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cadastro Nao Aprovado - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #ef4444; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Cadastro Nao Aprovado</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Agradecemos seu interesse em participar do programa de afiliados do ${APP_NAME}.
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Infelizmente, apos analise do seu cadastro, nao foi possivel aprovar sua solicitacao neste momento.
              </p>
              ${reason ? `
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #fef2f2; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.6;">
                      <strong>Motivo:</strong> ${reason}
                    </p>
                  </td>
                </tr>
              </table>
              ` : ''}
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Voce pode tentar novamente no futuro, garantindo que todas as informacoes estejam corretas e completas.
              </p>
              <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Se tiver alguma duvida, entre em contato conosco.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Programa de Afiliados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Cadastro nao aprovado - Programa de Afiliados ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de cadastro rejeitado enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de cadastro rejeitado para ${to}:`, error);
    return false;
  }
}

export async function sendAffiliateWithdrawalRequestedEmail(to: string, name: string, amount: number, pixKey: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const amountFormatted = (amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    const text = `
Ola ${name},

Recebemos sua solicitacao de saque no programa de afiliados do ${APP_NAME}.

Detalhes da solicitacao:
- Valor: ${amountFormatted}
- Chave PIX: ${pixKey}

Sua solicitacao sera processada em ate 3 dias uteis. Voce recebera um email de confirmacao quando o pagamento for efetuado.

Acesse seu painel para acompanhar o status: ${AFFILIATE_LOGIN_URL}

---
${APP_NAME} - Programa de Afiliados
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Solicitacao de Saque Recebida - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #3b82f6; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Solicitacao de Saque Recebida</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Recebemos sua solicitacao de saque no programa de afiliados do ${APP_NAME}.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #eff6ff; border-radius: 6px; border: 2px solid #3b82f6;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #1e40af; font-weight: 600; font-size: 14px;">Detalhes da solicitacao:</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px; border-bottom: 1px solid #dbeafe;">
                          <strong>Valor:</strong>
                        </td>
                        <td style="padding: 8px 0; color: #1e40af; font-size: 18px; font-weight: 700; text-align: right; border-bottom: 1px solid #dbeafe;">
                          ${amountFormatted}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px;">
                          <strong>Chave PIX:</strong>
                        </td>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px; text-align: right;">
                          ${pixKey}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 20px 0; background-color: #fef3c7; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                      <strong>Status:</strong> Em processamento<br><br>
                      Sua solicitacao sera processada em ate 3 dias uteis. Voce recebera um email de confirmacao quando o pagamento for efetuado.
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${AFFILIATE_LOGIN_URL}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Acessar Meu Painel
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Programa de Afiliados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Solicitacao de saque recebida - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de solicitacao de saque enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de solicitacao de saque para ${to}:`, error);
    return false;
  }
}

export async function sendAffiliateWithdrawalPaidEmail(to: string, name: string, amount: number, pixKey: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const amountFormatted = (amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    const text = `
Ola ${name},

Seu saque foi processado com sucesso!

Detalhes do pagamento:
- Valor: ${amountFormatted}
- Chave PIX: ${pixKey}

O valor ja deve estar disponivel na sua conta em alguns minutos.

Obrigado por fazer parte do nosso programa de afiliados! Continue divulgando e vendendo.

Acesse seu painel: ${AFFILIATE_LOGIN_URL}

---
${APP_NAME} - Programa de Afiliados
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Saque Pago - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #10b981; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Saque Pago com Sucesso!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Seu saque foi processado com sucesso!
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #ecfdf5; border-radius: 6px; border: 2px solid #10b981;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #047857; font-weight: 600; font-size: 14px;">Detalhes do pagamento:</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px; border-bottom: 1px solid #d1fae5;">
                          <strong>Valor pago:</strong>
                        </td>
                        <td style="padding: 8px 0; color: #047857; font-size: 22px; font-weight: 700; text-align: right; border-bottom: 1px solid #d1fae5;">
                          ${amountFormatted}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px;">
                          <strong>Chave PIX:</strong>
                        </td>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px; text-align: right;">
                          ${pixKey}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                O valor ja deve estar disponivel na sua conta em alguns minutos.
              </p>
              
              <p style="margin: 0 0 30px; color: #374151; font-size: 16px; line-height: 1.6;">
                Obrigado por fazer parte do nosso programa de afiliados! Continue divulgando e vendendo.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${AFFILIATE_LOGIN_URL}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Acessar Meu Painel
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Programa de Afiliados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Saque de ${amountFormatted} pago com sucesso - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de saque pago enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de saque pago para ${to}:`, error);
    return false;
  }
}

export async function sendAffiliateWelcomeEmail(to: string, name: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const text = `
Ola ${name},

Bem-vindo ao painel de afiliados do ${APP_NAME}!

Estamos felizes em ter voce como parceiro. Aqui estao algumas dicas para comecar:

1. Gere seus links de divulgacao
   Acesse a secao de produtos e gere seus links exclusivos para compartilhar.

2. Acompanhe suas vendas
   No painel, voce pode ver todas as suas vendas e comissoes em tempo real.

3. Solicite saques
   Quando atingir o valor minimo, voce pode solicitar o saque das suas comissoes.

4. Materiais de divulgacao
   Utilize os materiais disponibilizados para aumentar suas vendas.

Se tiver alguma duvida, estamos aqui para ajudar!

Acesse seu painel: ${AFFILIATE_LOGIN_URL}

Boas vendas!

---
${APP_NAME} - Programa de Afiliados
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo ao Programa de Afiliados - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #7c3aed; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Bem-vindo ao Programa de Afiliados!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Bem-vindo ao painel de afiliados do ${APP_NAME}! Estamos felizes em ter voce como parceiro.
              </p>
              
              <p style="margin: 0 0 16px; color: #374151; font-size: 16px; font-weight: 600;">
                Aqui estao algumas dicas para comecar:
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 20px 0;">
                <tr>
                  <td style="padding: 16px; background-color: #f3f4f6; border-radius: 6px; margin-bottom: 12px;">
                    <p style="margin: 0 0 8px; color: #7c3aed; font-weight: 600; font-size: 15px;">1. Gere seus links de divulgacao</p>
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                      Acesse a secao de produtos e gere seus links exclusivos para compartilhar.
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 12px 0;">
                <tr>
                  <td style="padding: 16px; background-color: #f3f4f6; border-radius: 6px;">
                    <p style="margin: 0 0 8px; color: #7c3aed; font-weight: 600; font-size: 15px;">2. Acompanhe suas vendas</p>
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                      No painel, voce pode ver todas as suas vendas e comissoes em tempo real.
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 12px 0;">
                <tr>
                  <td style="padding: 16px; background-color: #f3f4f6; border-radius: 6px;">
                    <p style="margin: 0 0 8px; color: #7c3aed; font-weight: 600; font-size: 15px;">3. Solicite saques</p>
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                      Quando atingir o valor minimo, voce pode solicitar o saque das suas comissoes.
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 12px 0 30px;">
                <tr>
                  <td style="padding: 16px; background-color: #f3f4f6; border-radius: 6px;">
                    <p style="margin: 0 0 8px; color: #7c3aed; font-weight: 600; font-size: 15px;">4. Materiais de divulgacao</p>
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                      Utilize os materiais disponibilizados para aumentar suas vendas.
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${AFFILIATE_LOGIN_URL}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Acessar Meu Painel
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 20px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6; text-align: center;">
                Se tiver alguma duvida, estamos aqui para ajudar!
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Programa de Afiliados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Bem-vindo ao Programa de Afiliados ${APP_NAME}!`,
      html,
      text,
    });

    console.log(`[email] Email de boas-vindas de afiliado enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de boas-vindas de afiliado para ${to}:`, error);
    return false;
  }
}

export async function sendPixGeneratedEmail(
  to: string, 
  name: string, 
  planName: string, 
  pixCopiaCola: string, 
  pixQrCodeBase64: string | null,
  expiresAt: Date,
  amount: number
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const formattedAmount = (amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formattedExpiration = expiresAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    
    const text = `
Ola ${name},

Seu PIX foi gerado com sucesso para o plano ${planName}!

Valor: ${formattedAmount}
Validade: ${formattedExpiration}

Codigo PIX (Copia e Cola):
${pixCopiaCola}

Como pagar:
1. Abra o app do seu banco
2. Escolha a opcao Pix
3. Cole o codigo acima ou escaneie o QR Code
4. Confirme o pagamento

IMPORTANTE: Apos o pagamento, seu acesso sera liberado automaticamente em poucos segundos.

---
${APP_NAME}
    `.trim();
    
    const qrCodeHtml = pixQrCodeBase64 
      ? `<img src="${pixQrCodeBase64}" alt="QR Code PIX" style="max-width: 200px; height: auto; margin: 20px auto; display: block;" />`
      : '';
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seu PIX foi gerado - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #00b894; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">PIX Gerado com Sucesso!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Seu PIX para o plano <strong>${planName}</strong> foi gerado!
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #f0fff4; border-radius: 6px; border: 2px solid #00b894;">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <p style="margin: 0 0 8px; color: #047857; font-weight: 600; font-size: 24px;">
                      ${formattedAmount}
                    </p>
                    <p style="margin: 0; color: #059669; font-size: 14px;">
                      Valido ate: ${formattedExpiration}
                    </p>
                  </td>
                </tr>
              </table>
              
              ${qrCodeHtml}
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #f8fafc; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #374151; font-weight: 600; font-size: 14px;">Codigo PIX (Copia e Cola):</p>
                    <p style="margin: 0; background-color: #e5e7eb; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 12px; word-break: break-all; color: #374151;">
                      ${pixCopiaCola}
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #f0f9ff; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 12px; color: #0369a1; font-weight: 600; font-size: 14px;">Como pagar:</p>
                    <p style="margin: 0; color: #0369a1; font-size: 14px; line-height: 1.8;">
                      1. Abra o app do seu banco<br>
                      2. Escolha a opcao Pix<br>
                      3. Cole o codigo ou escaneie o QR Code<br>
                      4. Confirme o pagamento
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #059669; font-size: 14px; line-height: 1.6; text-align: center; font-weight: 600;">
                Apos o pagamento, seu acesso sera liberado automaticamente!
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Pagamentos Seguros
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `PIX gerado para ${planName} - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de PIX gerado enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de PIX gerado para ${to}:`, error);
    return false;
  }
}

export async function sendBoletoGeneratedEmail(
  to: string, 
  name: string, 
  planName: string, 
  boletoUrl: string, 
  boletoCodigo: string | null,
  expiresAt: Date,
  amount: number
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const formattedAmount = (amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formattedExpiration = expiresAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    
    const text = `
Ola ${name},

Seu Boleto foi gerado com sucesso para o plano ${planName}!

Valor: ${formattedAmount}
Vencimento: ${formattedExpiration}

Link do Boleto: ${boletoUrl}
${boletoCodigo ? `\nCodigo de Barras:\n${boletoCodigo}` : ''}

Como pagar:
1. Acesse o link acima para visualizar o boleto
2. Voce pode pagar no banco, lotérica ou pelo app do seu banco
3. Use o codigo de barras para pagamento rapido

IMPORTANTE: O pagamento pode levar ate 2 dias uteis para ser compensado. Apos a confirmacao, seu acesso sera liberado automaticamente.

---
${APP_NAME}
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seu Boleto foi gerado - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #6366f1; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Boleto Gerado com Sucesso!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Seu Boleto para o plano <strong>${planName}</strong> foi gerado!
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #eef2ff; border-radius: 6px; border: 2px solid #6366f1;">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <p style="margin: 0 0 8px; color: #4338ca; font-weight: 600; font-size: 24px;">
                      ${formattedAmount}
                    </p>
                    <p style="margin: 0; color: #4f46e5; font-size: 14px;">
                      Vencimento: ${formattedExpiration}
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${boletoUrl}" style="display: inline-block; background-color: #6366f1; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Visualizar Boleto
                    </a>
                  </td>
                </tr>
              </table>
              
              ${boletoCodigo ? `
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #f8fafc; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #374151; font-weight: 600; font-size: 14px;">Codigo de Barras:</p>
                    <p style="margin: 0; background-color: #e5e7eb; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 12px; word-break: break-all; color: #374151; text-align: center;">
                      ${boletoCodigo}
                    </p>
                  </td>
                </tr>
              </table>
              ` : ''}
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #f0f9ff; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 12px; color: #0369a1; font-weight: 600; font-size: 14px;">Como pagar:</p>
                    <p style="margin: 0; color: #0369a1; font-size: 14px; line-height: 1.8;">
                      1. Clique no botao acima para visualizar o boleto<br>
                      2. Pague no banco, loterica ou pelo app do banco<br>
                      3. Use o codigo de barras para pagamento rapido
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #fffbeb; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                      <strong>Importante:</strong> O pagamento pode levar ate 2 dias uteis para ser compensado. Apos a confirmacao, seu acesso sera liberado automaticamente.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Pagamentos Seguros
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Boleto gerado para ${planName} - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de Boleto gerado enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de Boleto gerado para ${to}:`, error);
    return false;
  }
}

export async function sendAutoRenewalPaymentEmail(
  to: string,
  name: string,
  planName: string,
  amount: number,
  expiresAt: Date,
  pixCopiaCola: string | null,
  pixQrCode: string | null,
  pixExpiresAt: Date | null,
  boletoUrl: string | null,
  boletoCodigo: string | null,
  boletoExpiresAt: Date | null
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const formattedAmount = (amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formattedExpiration = expiresAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const formattedPixExpiration = pixExpiresAt?.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) || '';
    const formattedBoletoExpiration = boletoExpiresAt?.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) || '';

    const text = `
Ola ${name},

Seu plano ${planName} vence em breve (${formattedExpiration}).

Para renovar seu acesso, geramos automaticamente as opcoes de pagamento abaixo:

Valor: ${formattedAmount}

${pixCopiaCola ? `=== OPCAO 1: PIX (Aprovacao Instantanea) ===
Valido ate: ${formattedPixExpiration}

Codigo PIX (Copia e Cola):
${pixCopiaCola}

Como pagar:
1. Abra o app do seu banco
2. Escolha a opcao Pix
3. Cole o codigo acima
4. Confirme o pagamento
` : ''}
${boletoUrl ? `=== OPCAO 2: BOLETO BANCARIO ===
Vencimento: ${formattedBoletoExpiration}

Link do Boleto: ${boletoUrl}
${boletoCodigo ? `Codigo de Barras: ${boletoCodigo}` : ''}

Como pagar:
1. Acesse o link acima
2. Pague no banco, loterica ou app do banco
` : ''}

IMPORTANTE: Apos o pagamento, seu acesso sera renovado automaticamente!

---
${APP_NAME}
    `.trim();

    const qrCodeHtml = pixQrCode
      ? `<img src="${pixQrCode}" alt="QR Code PIX" style="max-width: 180px; height: auto; margin: 15px auto; display: block;" />`
      : '';

    const pixSection = pixCopiaCola ? `
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 20px 0; background-color: #f0fff4; border-radius: 6px; border: 2px solid #00b894;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #047857; font-weight: 600; font-size: 16px; text-align: center;">
                      Opcao 1: PIX (Aprovacao Instantanea)
                    </p>
                    ${qrCodeHtml}
                    <p style="margin: 0 0 8px; color: #059669; font-size: 13px; text-align: center;">
                      Valido ate: ${formattedPixExpiration}
                    </p>
                    <p style="margin: 12px 0 8px; color: #374151; font-weight: 600; font-size: 13px;">Codigo PIX:</p>
                    <p style="margin: 0; background-color: #d1fae5; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 11px; word-break: break-all; color: #374151;">
                      ${pixCopiaCola}
                    </p>
                  </td>
                </tr>
              </table>
    ` : '';

    const boletoSection = boletoUrl ? `
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 20px 0; background-color: #eef2ff; border-radius: 6px; border: 2px solid #6366f1;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #4338ca; font-weight: 600; font-size: 16px; text-align: center;">
                      Opcao 2: Boleto Bancario
                    </p>
                    <p style="margin: 0 0 15px; color: #4f46e5; font-size: 13px; text-align: center;">
                      Vencimento: ${formattedBoletoExpiration}
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="text-align: center;">
                          <a href="${boletoUrl}" style="display: inline-block; background-color: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">
                            Visualizar Boleto
                          </a>
                        </td>
                      </tr>
                    </table>
                    ${boletoCodigo ? `
                    <p style="margin: 15px 0 8px; color: #374151; font-weight: 600; font-size: 13px;">Codigo de Barras:</p>
                    <p style="margin: 0; background-color: #c7d2fe; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 11px; word-break: break-all; color: #374151; text-align: center;">
                      ${boletoCodigo}
                    </p>
                    ` : ''}
                  </td>
                </tr>
              </table>
    ` : '';

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Renove seu plano - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #3b82f6; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Renove Seu Plano</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 35px 30px;">
              <p style="margin: 0 0 18px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 18px; color: #374151; font-size: 16px; line-height: 1.6;">
                Seu plano <strong>${planName}</strong> vence em <strong>${formattedExpiration}</strong>.
              </p>
              <p style="margin: 0 0 18px; color: #374151; font-size: 16px; line-height: 1.6;">
                Para garantir que voce nao perca acesso, geramos automaticamente as opcoes de pagamento abaixo:
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 20px 0; background-color: #f8fafc; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px; text-align: center;">
                    <p style="margin: 0 0 4px; color: #6b7280; font-size: 14px;">Valor da Renovacao:</p>
                    <p style="margin: 0; color: #1e40af; font-weight: 700; font-size: 28px;">
                      ${formattedAmount}
                    </p>
                  </td>
                </tr>
              </table>

              ${pixSection}
              ${boletoSection}

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #ecfdf5; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0; color: #047857; font-size: 14px; line-height: 1.6; text-align: center;">
                      <strong>Apos o pagamento, seu acesso sera renovado automaticamente!</strong>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Renovacao Automatica
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Renove seu plano ${planName} - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de renovacao automatica enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de renovacao automatica para ${to}:`, error);
    return false;
  }
}

export async function sendPixExpiredRecoveryEmail(
  to: string, 
  name: string, 
  planName: string, 
  planoId: string,
  amount: number
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const formattedAmount = (amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    const checkoutParams = new URLSearchParams({
      email: to,
      nome: name,
      recuperacao: "true"
    });
    const checkoutUrl = `${APP_URL}/checkout/${planoId}?${checkoutParams.toString()}`;
    
    const text = `
Ola ${name},

Seu PIX para o plano ${planName} expirou!

Valor: ${formattedAmount}

Nao se preocupe! Voce ainda pode finalizar sua compra.

Clique no link abaixo para gerar um novo PIX ou escolher outra forma de pagamento:
${checkoutUrl}

Metodos de pagamento disponiveis:
- PIX: Aprovacao instantanea
- Boleto: Vencimento em 3 dias uteis
- Cartao de Credito: Parcelado em ate 12x

Estamos aqui para ajudar se precisar!

---
${APP_NAME}
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seu PIX expirou - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #f59e0b; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Seu PIX Expirou</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                O PIX gerado para o plano <strong>${planName}</strong> no valor de <strong>${formattedAmount}</strong> expirou.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #ecfdf5; border-radius: 6px; border: 2px solid #10b981;">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <p style="margin: 0 0 16px; color: #047857; font-weight: 700; font-size: 18px;">
                      Nao se preocupe! Voce ainda pode finalizar sua compra.
                    </p>
                    <a href="${checkoutUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Finalizar Compra Agora
                    </a>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #f8fafc; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #374151; font-weight: 600; font-size: 14px;">Metodos de pagamento disponiveis:</p>
                    <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.8;">
                      <strong style="color: #00b894;">PIX:</strong> Aprovacao instantanea<br>
                      <strong style="color: #6366f1;">Boleto:</strong> Vencimento em 3 dias uteis<br>
                      <strong style="color: #3b82f6;">Cartao:</strong> Parcelado em ate 12x
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6; text-align: center;">
                Estamos aqui para ajudar se precisar!
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Pagamentos Seguros
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Seu PIX expirou - Finalize sua compra do ${planName}`,
      html,
      text,
    });

    console.log(`[email] Email de PIX expirado enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de PIX expirado para ${to}:`, error);
    return false;
  }
}

/**
 * SAFE WEBHOOK EMAIL FUNCTIONS
 * These functions NEVER throw exceptions and always return void.
 * They queue failed emails for retry instead of breaking webhooks.
 * 
 * IMPORTANT: These functions use try-catch around the entire call because
 * the legacy send* functions can throw SYNCHRONOUSLY (e.g., getResendClient()
 * throws when RESEND_API_KEY is not set) before returning a Promise.
 * 
 * NOTE: The legacy send* functions return `false` on failure instead of rejecting,
 * so we need to check both the Promise rejection AND the return value.
 */

export function sendAccessCredentialsEmailSafe(to: string, name: string, tempPassword: string, planName: string): void {
  try {
    if (!isEmailServiceAvailable()) {
      console.warn(`[email-safe] Email service not available, queuing credentials email for ${to}`);
      queueEmailForRetry('credentials', to, { name, tempPassword, planName }, 'RESEND_API_KEY not configured');
      return;
    }
    
    sendAccessCredentialsEmail(to, name, tempPassword, planName)
      .then((success) => {
        if (!success) {
          console.error(`[email-safe] Credentials email returned false for ${to}, queuing for retry`);
          queueEmailForRetry('credentials', to, { name, tempPassword, planName }, 'Email send returned false');
        }
      })
      .catch((err) => {
        console.error(`[email-safe] Failed to send credentials email to ${to}, queuing for retry:`, err.message);
        queueEmailForRetry('credentials', to, { name, tempPassword, planName }, err.message);
      });
  } catch (err: any) {
    console.error(`[email-safe] Sync error sending credentials email to ${to}, queuing for retry:`, err.message);
    queueEmailForRetry('credentials', to, { name, tempPassword, planName }, err.message);
  }
}

export function sendPaymentConfirmedEmailSafe(to: string, name: string, planName: string, expirationDate: Date): void {
  try {
    if (!isEmailServiceAvailable()) {
      console.warn(`[email-safe] Email service not available, queuing payment confirmed email for ${to}`);
      queueEmailForRetry('payment_confirmed', to, { name, planName, expirationDate }, 'RESEND_API_KEY not configured');
      return;
    }
    
    sendPaymentConfirmedEmail(to, name, planName, expirationDate)
      .then((success) => {
        if (!success) {
          console.error(`[email-safe] Payment confirmed email returned false for ${to}, queuing for retry`);
          queueEmailForRetry('payment_confirmed', to, { name, planName, expirationDate }, 'Email send returned false');
        }
      })
      .catch((err) => {
        console.error(`[email-safe] Failed to send payment confirmed email to ${to}, queuing for retry:`, err.message);
        queueEmailForRetry('payment_confirmed', to, { name, planName, expirationDate }, err.message);
      });
  } catch (err: any) {
    console.error(`[email-safe] Sync error sending payment confirmed email to ${to}, queuing for retry:`, err.message);
    queueEmailForRetry('payment_confirmed', to, { name, planName, expirationDate }, err.message);
  }
}

export function sendPaymentFailedEmailSafe(to: string, name: string, planName: string, reason: string, planoId?: string): void {
  try {
    if (!isEmailServiceAvailable()) {
      console.warn(`[email-safe] Email service not available, queuing payment failed email for ${to}`);
      queueEmailForRetry('payment_failed', to, { name, planName, reason, planoId }, 'RESEND_API_KEY not configured');
      return;
    }
    
    sendPaymentFailedEmail(to, name, planName, reason, planoId)
      .then((success) => {
        if (!success) {
          console.error(`[email-safe] Payment failed email returned false for ${to}, queuing for retry`);
          queueEmailForRetry('payment_failed', to, { name, planName, reason, planoId }, 'Email send returned false');
        }
      })
      .catch((err) => {
        console.error(`[email-safe] Failed to send payment failed email to ${to}, queuing for retry:`, err.message);
        queueEmailForRetry('payment_failed', to, { name, planName, reason, planoId }, err.message);
      });
  } catch (err: any) {
    console.error(`[email-safe] Sync error sending payment failed email to ${to}, queuing for retry:`, err.message);
    queueEmailForRetry('payment_failed', to, { name, planName, reason, planoId }, err.message);
  }
}

export function sendPlanExpiredEmailSafe(to: string, name: string, planName: string): void {
  try {
    if (!isEmailServiceAvailable()) {
      console.warn(`[email-safe] Email service not available, queuing plan expired email for ${to}`);
      queueEmailForRetry('plan_expired', to, { name, planName }, 'RESEND_API_KEY not configured');
      return;
    }
    
    sendPlanExpiredEmail(to, name, planName)
      .then((success) => {
        if (!success) {
          console.error(`[email-safe] Plan expired email returned false for ${to}, queuing for retry`);
          queueEmailForRetry('plan_expired', to, { name, planName }, 'Email send returned false');
        }
      })
      .catch((err) => {
        console.error(`[email-safe] Failed to send plan expired email to ${to}, queuing for retry:`, err.message);
        queueEmailForRetry('plan_expired', to, { name, planName }, err.message);
      });
  } catch (err: any) {
    console.error(`[email-safe] Sync error sending plan expired email to ${to}, queuing for retry:`, err.message);
    queueEmailForRetry('plan_expired', to, { name, planName }, err.message);
  }
}

export function sendWelcomeEmailSafe(to: string, name: string): void {
  try {
    if (!isEmailServiceAvailable()) {
      console.warn(`[email-safe] Email service not available, queuing welcome email for ${to}`);
      queueEmailForRetry('welcome', to, { name }, 'RESEND_API_KEY not configured');
      return;
    }
    
    sendWelcomeEmail(to, name)
      .then((success) => {
        if (!success) {
          console.error(`[email-safe] Welcome email returned false for ${to}, queuing for retry`);
          queueEmailForRetry('welcome', to, { name }, 'Email send returned false');
        }
      })
      .catch((err) => {
        console.error(`[email-safe] Failed to send welcome email to ${to}, queuing for retry:`, err.message);
        queueEmailForRetry('welcome', to, { name }, err.message);
      });
  } catch (err: any) {
    console.error(`[email-safe] Sync error sending welcome email to ${to}, queuing for retry:`, err.message);
    queueEmailForRetry('welcome', to, { name }, err.message);
  }
}

export function sendAffiliateSaleEmailSafe(to: string, name: string, saleAmount: number, commissionAmount: number): void {
  try {
    if (!isEmailServiceAvailable()) {
      console.warn(`[email-safe] Email service not available, skipping affiliate sale email for ${to}`);
      return;
    }
    
    sendAffiliateSaleEmail(to, name, saleAmount, commissionAmount)
      .then((success) => {
        if (!success) {
          console.warn(`[email-safe] Affiliate sale email returned false for ${to}`);
        }
      })
      .catch((err) => {
        console.error(`[email-safe] Failed to send affiliate sale email to ${to}:`, err.message);
      });
  } catch (err: any) {
    console.error(`[email-safe] Sync error sending affiliate sale email to ${to}:`, err.message);
  }
}
