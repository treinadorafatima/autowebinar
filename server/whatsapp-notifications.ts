/**
 * WhatsApp Notification Service
 * Envia notificações via WhatsApp para os usuários (espelha as notificações por email)
 * Usa uma conta WhatsApp separada configurada pelo superadmin (não interfere nas automações de webinário)
 */

import { storage } from "./storage";
import { sendWhatsAppMessage, getWhatsAppStatus, initWhatsAppConnection } from "./whatsapp-service";

const CONFIG_KEY = "NOTIFICATIONS_WHATSAPP_ACCOUNT_ID";
const APP_NAME = "AutoWebinar";
const APP_URL = process.env.PUBLIC_BASE_URL 
  ? process.env.PUBLIC_BASE_URL.replace(/\/$/, '')
  : (process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
    : "https://autowebinar.com.br");
const LOGIN_URL = `${APP_URL}/login`;

/**
 * Verifica se o serviço de notificações WhatsApp está configurado e conectado
 */
export async function isWhatsAppNotificationServiceAvailable(): Promise<boolean> {
  try {
    const accountId = await storage.getCheckoutConfig(CONFIG_KEY);
    if (!accountId) return false;
    
    const status = await getWhatsAppStatus(accountId);
    return status.status === "connected";
  } catch (error) {
    console.error("[whatsapp-notifications] Erro ao verificar disponibilidade:", error);
    return false;
  }
}

/**
 * Obtém o ID da conta WhatsApp configurada para notificações
 */
export async function getNotificationAccountId(): Promise<string | null> {
  return storage.getCheckoutConfig(CONFIG_KEY);
}

/**
 * Define a conta WhatsApp para notificações
 */
export async function setNotificationAccountId(accountId: string): Promise<void> {
  await storage.setCheckoutConfig(CONFIG_KEY, accountId);
  console.log(`[whatsapp-notifications] Conta de notificações configurada: ${accountId}`);
}

/**
 * Remove a configuração de conta WhatsApp para notificações
 */
export async function clearNotificationAccountId(): Promise<void> {
  await storage.setCheckoutConfig(CONFIG_KEY, "");
  console.log(`[whatsapp-notifications] Conta de notificações removida`);
}

/**
 * Envia mensagem WhatsApp usando a conta de notificações configurada
 * Retorna true se enviou com sucesso, false caso contrário
 * Nunca lança erros (safe)
 */
async function sendNotificationMessage(phone: string, message: string): Promise<boolean> {
  try {
    if (!phone) {
      console.log("[whatsapp-notifications] Telefone não fornecido, ignorando envio");
      return false;
    }
    
    const accountId = await storage.getCheckoutConfig(CONFIG_KEY);
    if (!accountId) {
      console.log("[whatsapp-notifications] Nenhuma conta configurada para notificações");
      return false;
    }
    
    const status = await getWhatsAppStatus(accountId);
    if (status.status !== "connected") {
      console.log(`[whatsapp-notifications] Conta ${accountId} não está conectada (status: ${status.status})`);
      return false;
    }
    
    const result = await sendWhatsAppMessage(accountId, phone, message);
    if (result.success) {
      console.log(`[whatsapp-notifications] Mensagem enviada para ${phone}`);
      return true;
    } else {
      console.error(`[whatsapp-notifications] Falha ao enviar para ${phone}: ${result.error}`);
      return false;
    }
  } catch (error) {
    console.error("[whatsapp-notifications] Erro ao enviar mensagem:", error);
    return false;
  }
}

/**
 * Formata número de telefone brasileiro para WhatsApp
 * Remove caracteres não numéricos e adiciona código do país se necessário
 */
function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (!cleaned.startsWith("55")) {
    cleaned = "55" + cleaned;
  }
  return cleaned;
}

/**
 * Envia credenciais de acesso via WhatsApp (para novos usuários)
 * Safe version - nunca lança erros
 */
export async function sendWhatsAppCredentialsSafe(
  phone: string,
  name: string,
  tempPassword: string,
  planName: string
): Promise<boolean> {
  try {
    const formattedPhone = formatPhoneNumber(phone);
    
    const message = `Ola ${name}!

Seu acesso ao ${APP_NAME} foi liberado!

*Suas credenciais:*
Senha: ${tempPassword}
Plano: ${planName}

Acesse: ${LOGIN_URL}

Por seguranca, altere sua senha apos o primeiro login.

Duvidas? Estamos aqui para ajudar!`;

    return await sendNotificationMessage(formattedPhone, message);
  } catch (error) {
    console.error("[whatsapp-notifications] Erro em sendWhatsAppCredentialsSafe:", error);
    return false;
  }
}

/**
 * Envia confirmação de pagamento via WhatsApp
 * Safe version - nunca lança erros
 */
export async function sendWhatsAppPaymentConfirmedSafe(
  phone: string,
  name: string,
  planName: string,
  expirationDate: Date | string
): Promise<boolean> {
  try {
    const formattedPhone = formatPhoneNumber(phone);
    const dateStr = typeof expirationDate === 'string' 
      ? new Date(expirationDate).toLocaleDateString('pt-BR')
      : expirationDate.toLocaleDateString('pt-BR');
    
    const message = `Ola ${name}!

Seu pagamento foi *confirmado*!

Plano: ${planName}
Acesso ate: ${dateStr}

Acesse sua conta: ${LOGIN_URL}

Obrigado por escolher o ${APP_NAME}!`;

    return await sendNotificationMessage(formattedPhone, message);
  } catch (error) {
    console.error("[whatsapp-notifications] Erro em sendWhatsAppPaymentConfirmedSafe:", error);
    return false;
  }
}

/**
 * Envia link de recuperação de senha via WhatsApp
 * Safe version - nunca lança erros
 */
export async function sendWhatsAppPasswordResetSafe(
  phone: string,
  name: string,
  resetToken: string
): Promise<boolean> {
  try {
    const formattedPhone = formatPhoneNumber(phone);
    const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;
    
    const message = `Ola ${name}!

Recebemos sua solicitacao para redefinir a senha no ${APP_NAME}.

Acesse o link abaixo para criar uma nova senha:
${resetUrl}

*Este link e valido por 1 hora.*

Se voce nao solicitou isso, ignore esta mensagem.`;

    return await sendNotificationMessage(formattedPhone, message);
  } catch (error) {
    console.error("[whatsapp-notifications] Erro em sendWhatsAppPasswordResetSafe:", error);
    return false;
  }
}

/**
 * Envia notificação de plano expirado via WhatsApp
 * Safe version - nunca lança erros
 */
export async function sendWhatsAppPlanExpiredSafe(
  phone: string,
  name: string,
  planName: string
): Promise<boolean> {
  try {
    const formattedPhone = formatPhoneNumber(phone);
    
    const message = `Ola ${name}!

Seu plano *${planName}* expirou.

O que acontece agora:
- Seus webinarios foram pausados
- Novos leads nao serao capturados
- As ferramentas de IA estao indisponiveis

*Seus dados estao seguros!*

Renove agora: ${APP_URL}/checkout

Precisa de ajuda? Estamos aqui!`;

    return await sendNotificationMessage(formattedPhone, message);
  } catch (error) {
    console.error("[whatsapp-notifications] Erro em sendWhatsAppPlanExpiredSafe:", error);
    return false;
  }
}

/**
 * Envia notificação de falha no pagamento via WhatsApp
 * Safe version - nunca lança erros
 */
export async function sendWhatsAppPaymentFailedSafe(
  phone: string,
  name: string,
  planName: string,
  reason?: string
): Promise<boolean> {
  try {
    const formattedPhone = formatPhoneNumber(phone);
    
    let message = `Ola ${name}!

Houve um problema com seu pagamento do plano *${planName}*.`;

    if (reason) {
      message += `

Motivo: ${reason}`;
    }

    message += `

Por favor, verifique seus dados de pagamento e tente novamente.

Regularizar: ${APP_URL}/checkout

Duvidas? Estamos aqui para ajudar!`;

    return await sendNotificationMessage(formattedPhone, message);
  } catch (error) {
    console.error("[whatsapp-notifications] Erro em sendWhatsAppPaymentFailedSafe:", error);
    return false;
  }
}

/**
 * Envia boas-vindas via WhatsApp (para novos cadastros)
 * Safe version - nunca lança erros
 */
export async function sendWhatsAppWelcomeSafe(
  phone: string,
  name: string
): Promise<boolean> {
  try {
    const formattedPhone = formatPhoneNumber(phone);
    
    const message = `Ola ${name}!

Bem-vindo ao ${APP_NAME}!

Sua conta foi criada com sucesso.

O que voce pode fazer:
- Criar webinarios automatizados 24/7
- Usar IA para gerar roteiros de vendas
- Capturar leads automaticamente
- Transcrever videos com IA

Acesse: ${APP_URL}/admin

Duvidas? Estamos aqui para ajudar!`;

    return await sendNotificationMessage(formattedPhone, message);
  } catch (error) {
    console.error("[whatsapp-notifications] Erro em sendWhatsAppWelcomeSafe:", error);
    return false;
  }
}

/**
 * Verifica status da conta de notificações e retorna informações
 */
export async function getNotificationStatus(): Promise<{
  configured: boolean;
  accountId: string | null;
  status: string;
  phoneNumber?: string;
}> {
  try {
    const accountId = await storage.getCheckoutConfig(CONFIG_KEY);
    
    if (!accountId) {
      return {
        configured: false,
        accountId: null,
        status: "not_configured",
      };
    }
    
    const status = await getWhatsAppStatus(accountId);
    
    return {
      configured: true,
      accountId,
      status: status.status,
      phoneNumber: status.phoneNumber,
    };
  } catch (error) {
    console.error("[whatsapp-notifications] Erro ao obter status:", error);
    return {
      configured: false,
      accountId: null,
      status: "error",
    };
  }
}
