/**
 * WhatsApp Notification Service
 * Envia notificações via WhatsApp para os usuários (espelha as notificações por email)
 * Usa rotação automática entre todas as contas WhatsApp conectadas do superadmin
 * com controle de limite de mensagens por hora por conta
 */

import { storage } from "./storage";
import { sendWhatsAppMessage, getWhatsAppStatus, initWhatsAppConnection } from "./whatsapp-service";

const ENABLED_CONFIG_KEY = "WHATSAPP_NOTIFICATIONS_ENABLED";
const SUPERADMIN_ID_KEY = "NOTIFICATIONS_SUPERADMIN_ID";
const APP_NAME = "AutoWebinar";

/**
 * Detecta dinamicamente a URL base da aplicação
 * Prioridade:
 * 1. PUBLIC_BASE_URL (variável de ambiente explícita)
 * 2. RENDER_EXTERNAL_URL (Render.com)
 * 3. REPLIT_DOMAINS (Replit - domínio principal)
 * 4. REPLIT_DEV_DOMAIN (Replit - domínio de desenvolvimento)
 * 5. Fallback para autowebinar.com.br
 */
function getAppUrl(): string {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  }
  if (process.env.REPLIT_DOMAINS) {
    const primaryDomain = process.env.REPLIT_DOMAINS.split(',')[0].trim();
    return `https://${primaryDomain}`;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return "https://autowebinar.com.br";
}

function getLoginUrl(): string { return `${getAppUrl()}/login`; }
function getAdminUrl(): string { return `${getAppUrl()}/admin`; }
function getRenewUrl(): string { return `${getAppUrl()}/checkout`; }
function getPaymentUrl(): string { return `${getAppUrl()}/checkout`; }

/**
 * Substitui placeholders no template com valores reais
 */
function replacePlaceholders(template: string, data: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{${key}}`;
    result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'gi'), value || '');
  }
  return result;
}

/**
 * Busca template do banco de dados ou retorna mensagem padrão
 */
async function getTemplateMessage(
  notificationType: string, 
  data: Record<string, string>,
  defaultMessage: string
): Promise<string> {
  try {
    const template = await storage.getWhatsappNotificationTemplateByType(notificationType);
    if (template && template.isActive && template.messageTemplate) {
      return replacePlaceholders(template.messageTemplate, data);
    }
  } catch (error) {
    console.error(`[whatsapp-notifications] Erro ao buscar template ${notificationType}:`, error);
  }
  return defaultMessage;
}

/**
 * Obtém o adminId do superadmin para buscar contas de notificação
 */
async function getSuperadminId(): Promise<string | null> {
  // Primeiro tenta do config, depois busca o primeiro superadmin
  const configuredId = await storage.getCheckoutConfig(SUPERADMIN_ID_KEY);
  if (configuredId) return configuredId;
  
  // Busca o primeiro superadmin se não estiver configurado
  const admins = await storage.getAllAdmins();
  const superadmin = admins.find((a: { role: string }) => a.role === "superadmin");
  if (superadmin) {
    // Cache para uso futuro
    await storage.setCheckoutConfig(SUPERADMIN_ID_KEY, superadmin.id);
    return superadmin.id;
  }
  
  return null;
}

/**
 * Verifica se o serviço de notificações WhatsApp está disponível
 * Retorna true se há pelo menos uma conta conectada
 */
export async function isWhatsAppNotificationServiceAvailable(): Promise<boolean> {
  try {
    const superadminId = await getSuperadminId();
    if (!superadminId) return false;
    
    const accounts = await storage.getAvailableWhatsappAccountsForRotation(superadminId);
    return accounts.length > 0;
  } catch (error) {
    console.error("[whatsapp-notifications] Erro ao verificar disponibilidade:", error);
    return false;
  }
}

/**
 * Seleciona a próxima conta disponível para enviar mensagens
 * Usa rotação automática baseada no limite por hora de cada conta
 */
async function selectAccountForSending(): Promise<{ accountId: string; label: string } | null> {
  try {
    const superadminId = await getSuperadminId();
    if (!superadminId) {
      console.log("[whatsapp-notifications] Superadmin não encontrado");
      return null;
    }
    
    const accounts = await storage.getAvailableWhatsappAccountsForRotation(superadminId);
    if (accounts.length === 0) {
      console.log("[whatsapp-notifications] Nenhuma conta WhatsApp conectada");
      return null;
    }
    
    // Encontrar conta que ainda está dentro do limite horário
    for (const account of accounts) {
      const hourlyLimit = account.hourlyLimit || 10;
      const messagesSentThisHour = account.messagesSentThisHour || 0;
      
      if (messagesSentThisHour < hourlyLimit) {
        console.log(`[whatsapp-notifications] Usando conta ${account.label} (${messagesSentThisHour}/${hourlyLimit} msgs/hora)`);
        return { accountId: account.id, label: account.label };
      }
    }
    
    // Se todas estão no limite, usa a primeira (vai esperar o limite resetar)
    if (accounts.length === 1) {
      console.log(`[whatsapp-notifications] Única conta ${accounts[0].label} atingiu limite, usando mesmo assim`);
      return { accountId: accounts[0].id, label: accounts[0].label };
    }
    
    console.log("[whatsapp-notifications] Todas as contas atingiram limite horário");
    return null;
  } catch (error) {
    console.error("[whatsapp-notifications] Erro ao selecionar conta:", error);
    return null;
  }
}

/**
 * Verifica se as notificações WhatsApp estão habilitadas
 * Retorna true por padrão se não estiver configurado (para não quebrar instalações existentes)
 */
export async function isWhatsAppNotificationsEnabled(): Promise<boolean> {
  const value = await storage.getCheckoutConfig(ENABLED_CONFIG_KEY);
  // Se não está configurado, considera habilitado por padrão
  if (value === null || value === undefined || value === "") {
    return true;
  }
  return value === "true";
}

/**
 * Habilita ou desabilita as notificações WhatsApp
 */
export async function setWhatsAppNotificationsEnabled(enabled: boolean): Promise<void> {
  await storage.setCheckoutConfig(ENABLED_CONFIG_KEY, enabled ? "true" : "false");
  console.log(`[whatsapp-notifications] Notificações ${enabled ? "habilitadas" : "desabilitadas"}`);
}

/**
 * Envia mensagem WhatsApp usando rotação automática entre contas conectadas
 * Retorna true se enviou com sucesso, false caso contrário
 * Nunca lança erros (safe)
 */
async function sendNotificationMessage(phone: string, message: string): Promise<boolean> {
  try {
    // Verificar se as notificações estão habilitadas
    const enabled = await isWhatsAppNotificationsEnabled();
    if (!enabled) {
      console.log("[whatsapp-notifications] Notificações desabilitadas, ignorando envio");
      return false;
    }
    
    if (!phone) {
      console.log("[whatsapp-notifications] Telefone não fornecido, ignorando envio");
      return false;
    }
    
    // Selecionar conta usando rotação automática
    const selectedAccount = await selectAccountForSending();
    if (!selectedAccount) {
      console.log("[whatsapp-notifications] Nenhuma conta disponível para envio");
      return false;
    }
    
    const { accountId, label } = selectedAccount;
    
    const status = await getWhatsAppStatus(accountId);
    if (status.status !== "connected") {
      console.log(`[whatsapp-notifications] Conta ${label} não está conectada (status: ${status.status})`);
      return false;
    }
    
    const result = await sendWhatsAppMessage(accountId, phone, message);
    if (result.success) {
      // Incrementar contador de mensagens da conta usada
      await storage.incrementWhatsappAccountMessageCount(accountId);
      console.log(`[whatsapp-notifications] Mensagem enviada para ${phone} via ${label}`);
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
  planName: string,
  email?: string
): Promise<boolean> {
  try {
    const formattedPhone = formatPhoneNumber(phone);
    
    const defaultMessage = `Ola ${name}!

Seu acesso ao ${APP_NAME} foi liberado!

*Suas credenciais:*
Email: ${email || ""}
Senha: ${tempPassword}
Plano: ${planName}

Acesse: ${getLoginUrl()}

Por seguranca, altere sua senha apos o primeiro login.

Duvidas? Estamos aqui para ajudar!`;

    const templateData = {
      name,
      email: email || "",
      planName,
      tempPassword,
      loginUrl: getLoginUrl(),
      appName: APP_NAME,
    };

    const message = await getTemplateMessage("credentials", templateData, defaultMessage);
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
    
    const defaultMessage = `Ola ${name}!

Seu pagamento foi *confirmado*!

Plano: ${planName}
Acesso ate: ${dateStr}

Acesse sua conta: ${getLoginUrl()}

Obrigado por escolher o ${APP_NAME}!`;

    const templateData = {
      name,
      planName,
      expirationDate: dateStr,
      loginUrl: getLoginUrl(),
      appName: APP_NAME,
    };

    const message = await getTemplateMessage("payment_confirmed", templateData, defaultMessage);
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
    const resetUrl = `${getAppUrl()}/reset-password?token=${resetToken}`;
    
    const defaultMessage = `Ola ${name}!

Recebemos sua solicitacao para redefinir a senha no ${APP_NAME}.

Acesse o link abaixo para criar uma nova senha:
${resetUrl}

*Este link e valido por 1 hora.*

Se voce nao solicitou isso, ignore esta mensagem.`;

    const templateData = {
      name,
      resetUrl,
      appName: APP_NAME,
    };

    const message = await getTemplateMessage("password_reset", templateData, defaultMessage);
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
    
    const defaultMessage = `Ola ${name}!

Seu plano *${planName}* expirou.

O que acontece agora:
- Seus webinarios foram pausados
- Novos leads nao serao capturados
- As ferramentas de IA estao indisponiveis

*Seus dados estao seguros!*

Renove agora: ${getRenewUrl()}

Precisa de ajuda? Estamos aqui!`;

    const templateData = {
      name,
      planName,
      renewUrl: getRenewUrl(),
      appName: APP_NAME,
    };

    const message = await getTemplateMessage("plan_expired", templateData, defaultMessage);
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
    
    let defaultMessage = `Ola ${name}!

Houve um problema com seu pagamento do plano *${planName}*.`;

    if (reason) {
      defaultMessage += `

Motivo: ${reason}`;
    }

    defaultMessage += `

Por favor, verifique seus dados de pagamento e tente novamente.

Regularizar: ${getPaymentUrl()}

Duvidas? Estamos aqui para ajudar!`;

    const templateData = {
      name,
      planName,
      reason: reason || "",
      paymentUrl: getPaymentUrl(),
      appName: APP_NAME,
    };

    const message = await getTemplateMessage("payment_failed", templateData, defaultMessage);
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
    
    const defaultMessage = `Ola ${name}!

Bem-vindo ao ${APP_NAME}!

Sua conta foi criada com sucesso.

O que voce pode fazer:
- Criar webinarios automatizados 24/7
- Usar IA para gerar roteiros de vendas
- Capturar leads automaticamente
- Transcrever videos com IA

Acesse: ${getAdminUrl()}

Duvidas? Estamos aqui para ajudar!`;

    const templateData = {
      name,
      adminUrl: getAdminUrl(),
      appName: APP_NAME,
    };

    const message = await getTemplateMessage("welcome", templateData, defaultMessage);
    return await sendNotificationMessage(formattedPhone, message);
  } catch (error) {
    console.error("[whatsapp-notifications] Erro em sendWhatsAppWelcomeSafe:", error);
    return false;
  }
}

/**
 * Envia mensagem de recuperação de pagamento via WhatsApp
 */
export async function sendWhatsAppPaymentRecoverySafe(
  phone: string | null | undefined,
  name: string,
  planName: string,
  planoId: string,
  amount: number
): Promise<boolean> {
  try {
    if (!phone) {
      console.warn("[whatsapp-notifications] Phone nao disponivel para enviar recuperacao");
      return false;
    }

    const enabled = await isWhatsAppNotificationsEnabled();
    if (!enabled) {
      console.warn("[whatsapp-notifications] Notificacoes desabilitadas, nao enviando recuperacao");
      return false;
    }

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      console.warn("[whatsapp-notifications] Numero invalido para recuperacao:", phone);
      return false;
    }

    const formattedAmount = (amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const checkoutParams = new URLSearchParams({
      recuperacao: "true"
    });
    const checkoutUrl = `${getAppUrl()}/checkout/${planoId}?${checkoutParams.toString()}`;

    const defaultMessage = `Ola ${name}!

Notamos que voce ainda nao finalizou sua compra.

Plano: ${planName}
Valor: ${formattedAmount}

Seu carrinho esta esperando por voce! Finalize agora:
${checkoutUrl}

Formas de pagamento:
- PIX (aprovacao instantanea)
- Boleto (vence em 3 dias)
- Cartao (ate 12x)

Duvidas? Responda esta mensagem!`;

    const templateData = {
      name,
      planName,
      amount: formattedAmount,
      checkoutUrl,
      appName: APP_NAME,
    };

    const message = await getTemplateMessage("payment_recovery", templateData, defaultMessage);
    return await sendNotificationMessage(formattedPhone, message);
  } catch (error) {
    console.error("[whatsapp-notifications] Erro em sendWhatsAppPaymentRecoverySafe:", error);
    return false;
  }
}

/**
 * Verifica status das contas de notificação e retorna informações
 * Agora retorna informações sobre todas as contas conectadas para rotação
 */
export async function getNotificationStatus(): Promise<{
  configured: boolean;
  accountId: string | null;
  status: string;
  phoneNumber?: string;
  enabled: boolean;
  connectedAccounts: number;
  totalAccounts: number;
}> {
  try {
    const superadminId = await getSuperadminId();
    const enabled = await isWhatsAppNotificationsEnabled();
    
    if (!superadminId) {
      return {
        configured: false,
        accountId: null,
        status: "not_configured",
        enabled,
        connectedAccounts: 0,
        totalAccounts: 0,
      };
    }
    
    const allAccounts = await storage.listWhatsappAccountsByAdmin(superadminId);
    const connectedAccounts = await storage.getAvailableWhatsappAccountsForRotation(superadminId);
    
    if (connectedAccounts.length === 0) {
      return {
        configured: allAccounts.length > 0,
        accountId: null,
        status: allAccounts.length > 0 ? "disconnected" : "not_configured",
        enabled,
        connectedAccounts: 0,
        totalAccounts: allAccounts.length,
      };
    }
    
    // Retorna o primeiro account conectado para compatibilidade
    const firstConnected = connectedAccounts[0];
    
    return {
      configured: true,
      accountId: firstConnected.id,
      status: "connected",
      phoneNumber: firstConnected.phoneNumber || undefined,
      enabled,
      connectedAccounts: connectedAccounts.length,
      totalAccounts: allAccounts.length,
    };
  } catch (error) {
    console.error("[whatsapp-notifications] Erro ao obter status:", error);
    return {
      configured: false,
      accountId: null,
      status: "error",
      enabled: false,
      connectedAccounts: 0,
      totalAccounts: 0,
    };
  }
}
