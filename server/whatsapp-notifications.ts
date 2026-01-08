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
function getRenewUrl(planId?: string, email?: string, name?: string, phone?: string): string { 
  const baseUrl = `${getAppUrl()}/checkout`;
  
  const params = new URLSearchParams();
  if (email) params.set('email', email);
  if (name) params.set('nome', name);
  if (phone) params.set('telefone', phone);
  
  const queryString = params.toString();
  
  if (!planId) {
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }
  
  return queryString ? `${baseUrl}/${planId}?${queryString}` : `${baseUrl}/${planId}`;
}
function getPaymentUrl(planId?: string, email?: string, name?: string, phone?: string): string { 
  return getRenewUrl(planId, email, name, phone);
}

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
    
    // Check only NOTIFICATIONS accounts - marketing accounts should not be used for notifications
    const accounts = await storage.getAvailableWhatsappAccountsForRotation(superadminId, 'notifications');
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
    
    // Only use NOTIFICATIONS accounts for automated notifications - never use marketing accounts
    const accounts = await storage.getAvailableWhatsappAccountsForRotation(superadminId, 'notifications');
    if (accounts.length === 0) {
      console.log("[whatsapp-notifications] Nenhuma conta de NOTIFICAÇÕES conectada (scope='notifications')");
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
 * Logs notification attempt to database for visibility in admin panel
 */
async function logNotificationToDatabase(
  notificationType: string,
  phone: string,
  recipientName: string | null,
  message: string,
  status: 'pending' | 'sent' | 'failed',
  error?: string
): Promise<string | null> {
  try {
    const log = await storage.createWhatsappNotificationLog({
      notificationType,
      recipientPhone: phone,
      recipientName: recipientName || undefined,
      message,
      status,
      sentAt: status === 'sent' ? new Date() : undefined,
      error: error || undefined,
    });
    return log.id;
  } catch (err) {
    console.error("[whatsapp-notifications] Erro ao registrar log no banco:", err);
    return null;
  }
}

/**
 * Updates notification log status after send attempt
 */
async function updateNotificationLog(logId: string, status: 'sent' | 'failed', error?: string): Promise<void> {
  try {
    await storage.updateWhatsappNotificationLog(logId, {
      status,
      sentAt: status === 'sent' ? new Date() : undefined,
      error: error || undefined,
    });
  } catch (err) {
    console.error("[whatsapp-notifications] Erro ao atualizar log:", err);
  }
}

/**
 * Envia mensagem WhatsApp usando rotação automática entre contas conectadas
 * Retorna true se enviou com sucesso, false caso contrário
 * SEMPRE registra no banco de dados para visibilidade no painel admin
 * Nunca lança erros (safe)
 */
async function sendNotificationMessage(
  phone: string, 
  message: string,
  notificationType: string = 'generic',
  recipientName?: string
): Promise<boolean> {
  let logId: string | null = null;
  
  try {
    // Verificar se as notificações estão habilitadas
    const enabled = await isWhatsAppNotificationsEnabled();
    if (!enabled) {
      console.log("[whatsapp-notifications] Notificações desabilitadas, registrando no log");
      await logNotificationToDatabase(notificationType, phone || 'N/A', recipientName || null, message, 'failed', 'Notificações WhatsApp desabilitadas nas configurações');
      return false;
    }
    
    if (!phone) {
      console.log("[whatsapp-notifications] Telefone não fornecido, registrando no log");
      await logNotificationToDatabase(notificationType, 'N/A', recipientName || null, message, 'failed', 'Telefone não fornecido');
      return false;
    }
    
    // Registrar tentativa como pendente ANTES de tentar enviar
    logId = await logNotificationToDatabase(notificationType, phone, recipientName || null, message, 'pending');
    
    // Selecionar conta usando rotação automática
    const selectedAccount = await selectAccountForSending();
    if (!selectedAccount) {
      console.log("[whatsapp-notifications] Nenhuma conta disponível para envio - mantendo na fila");
      // Mantém como 'pending' para reprocessar depois quando houver conexão
      return false;
    }
    
    const { accountId, label } = selectedAccount;
    
    const status = await getWhatsAppStatus(accountId);
    if (status.status !== "connected") {
      console.log(`[whatsapp-notifications] Conta ${label} não está conectada (status: ${status.status}) - mantendo na fila`);
      // Mantém como 'pending' para reprocessar depois quando houver conexão
      return false;
    }
    
    const result = await sendWhatsAppMessage(accountId, phone, message);
    if (result.success) {
      // Incrementar contador de mensagens da conta usada
      await storage.incrementWhatsappAccountMessageCount(accountId);
      console.log(`[whatsapp-notifications] Mensagem enviada para ${phone} via ${label}`);
      if (logId) await updateNotificationLog(logId, 'sent');
      return true;
    } else {
      console.error(`[whatsapp-notifications] Falha ao enviar para ${phone}: ${result.error}`);
      if (logId) await updateNotificationLog(logId, 'failed', result.error || 'Erro desconhecido ao enviar mensagem');
      return false;
    }
  } catch (error: any) {
    console.error("[whatsapp-notifications] Erro ao enviar mensagem:", error);
    if (logId) {
      await updateNotificationLog(logId, 'failed', error.message || 'Erro interno');
    } else {
      // Se não conseguimos criar o log inicial, tenta criar agora com o erro
      await logNotificationToDatabase(notificationType, phone || 'N/A', recipientName || null, message, 'failed', error.message || 'Erro interno');
    }
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
    return await sendNotificationMessage(formattedPhone, message, 'credentials', name);
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
    return await sendNotificationMessage(formattedPhone, message, 'payment_confirmed', name);
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
    return await sendNotificationMessage(formattedPhone, message, 'password_reset', name);
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
  phone: string | null | undefined,
  name: string,
  planName: string,
  email?: string,
  planoId?: string | null
): Promise<boolean> {
  try {
    if (!phone) {
      console.warn("[whatsapp-notifications] Phone nao disponivel para plano expirado");
      return false;
    }

    const enabled = await isWhatsAppNotificationsEnabled();
    if (!enabled) {
      console.warn("[whatsapp-notifications] Notificacoes desabilitadas, nao enviando plano expirado");
      return false;
    }

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      console.warn("[whatsapp-notifications] Numero invalido para plano expirado:", phone);
      return false;
    }
    
    // Build checkout URL with user data pre-filled
    // Para trial/teste gratuito, não incluir planId para mostrar todos os planos
    const isTrialPlan = !planoId || planoId === 'trial' || planName.toLowerCase().includes('trial') || planName.toLowerCase().includes('teste') || planName.toLowerCase().includes('gratuito');
    const renewUrl = getRenewUrl(isTrialPlan ? undefined : planoId, email, name, phone || undefined);
    
    const defaultMessage = `Ola ${name}!

Seu plano *${planName}* expirou.

O que acontece agora:
- Seus webinarios foram pausados
- Novos leads nao serao capturados
- As ferramentas de IA estao indisponiveis

*Seus dados estao seguros!*

Renove agora: ${renewUrl}

Precisa de ajuda? Estamos aqui!`;

    const templateData = {
      name,
      planName,
      renewUrl: renewUrl,
      appName: APP_NAME,
    };

    const message = await getTemplateMessage("plan_expired", templateData, defaultMessage);
    return await sendNotificationMessage(formattedPhone, message, 'plan_expired', name);
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
  reason?: string,
  email?: string,
  planId?: string | null
): Promise<boolean> {
  try {
    const formattedPhone = formatPhoneNumber(phone);
    // Para trial/teste gratuito, não incluir planId para mostrar todos os planos
    const isTrialPlan = !planId || planId === 'trial' || planName.toLowerCase().includes('trial') || planName.toLowerCase().includes('teste') || planName.toLowerCase().includes('gratuito');
    const paymentUrl = getPaymentUrl(isTrialPlan ? undefined : planId, email, name, phone);
    
    let defaultMessage = `Ola ${name}!

Houve um problema com seu pagamento do plano *${planName}*.`;

    if (reason) {
      defaultMessage += `

Motivo: ${reason}`;
    }

    defaultMessage += `

Por favor, verifique seus dados de pagamento e tente novamente.

Regularizar: ${paymentUrl}

Duvidas? Estamos aqui para ajudar!`;

    const templateData = {
      name,
      planName,
      reason: reason || "",
      paymentUrl: paymentUrl,
      appName: APP_NAME,
    };

    const message = await getTemplateMessage("payment_failed", templateData, defaultMessage);
    return await sendNotificationMessage(formattedPhone, message, 'payment_failed', name);
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
    return await sendNotificationMessage(formattedPhone, message, 'welcome', name);
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
  amount: number,
  email?: string,
  cpf?: string | null
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
    // Add user data if available
    if (email) checkoutParams.set('email', email);
    if (name) checkoutParams.set('nome', name);
    if (cpf) checkoutParams.set('cpf', cpf);
    if (phone) checkoutParams.set('telefone', phone);
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
    return await sendNotificationMessage(formattedPhone, message, 'payment_recovery', name);
  } catch (error) {
    console.error("[whatsapp-notifications] Erro em sendWhatsAppPaymentRecoverySafe:", error);
    return false;
  }
}

/**
 * Envia lembrete de expiração via WhatsApp (antes de expirar)
 * Usa templates específicos baseado nos dias restantes:
 * - 0 dias: expiration_reminder_today
 * - 1 dia: expiration_reminder_1day  
 * - 3+ dias: expiration_reminder_3days
 * Safe version - nunca lança erros
 */
export async function sendWhatsAppExpirationReminderSafe(
  phone: string | null | undefined,
  name: string,
  planName: string,
  daysUntilExpiration: number,
  expirationDate: Date,
  email?: string,
  planId?: string | null,
  telefone?: string | null
): Promise<boolean> {
  try {
    if (!phone) {
      console.warn("[whatsapp-notifications] Phone nao disponivel para lembrete de expiracao");
      return false;
    }

    const enabled = await isWhatsAppNotificationsEnabled();
    if (!enabled) {
      console.warn("[whatsapp-notifications] Notificacoes desabilitadas, nao enviando lembrete de expiracao");
      return false;
    }

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      console.warn("[whatsapp-notifications] Numero invalido para lembrete de expiracao:", phone);
      return false;
    }

    const formattedDate = expirationDate.toLocaleDateString('pt-BR');
    
    // Determinar qual template usar baseado nos dias até o vencimento
    let templateType: string;
    let defaultMessage: string;
    
    // Gerar URL de renovação com dados do usuário
    // Para trial/teste gratuito, não incluir planId para mostrar todos os planos
    const isTrialPlan = !planId || planId === 'trial' || planName.toLowerCase().includes('trial') || planName.toLowerCase().includes('teste') || planName.toLowerCase().includes('gratuito');
    const renewUrl = getRenewUrl(isTrialPlan ? undefined : planId, email, name, telefone || undefined);
    
    if (daysUntilExpiration === 0) {
      templateType = 'expiration_reminder_today';
      defaultMessage = `🚨 *ÚLTIMO AVISO - VENCE HOJE!*

Olá ${name}!

Seu plano *${planName}* vence *HOJE* (${formattedDate}).

⚠️ Após o vencimento, seus webinários serão pausados automaticamente.

Renove agora para não perder o acesso:
🔗 ${renewUrl}

Qualquer dúvida, estamos à disposição!`;
    } else if (daysUntilExpiration === 1) {
      templateType = 'expiration_reminder_1day';
      defaultMessage = `⚠️ *SEU PLANO VENCE AMANHÃ!*

Olá ${name}!

Seu plano *${planName}* vence *amanhã* (${formattedDate}).

Renove agora para continuar aproveitando:
✅ Webinários automatizados 24/7
✅ Ferramentas de IA
✅ Captura de leads

🔗 Renovar: ${renewUrl}

Não deixe para última hora!`;
    } else {
      templateType = 'expiration_reminder_3days';
      defaultMessage = `📅 *Lembrete: Seu plano vence em breve*

Olá ${name}!

Seu plano *${planName}* vence em *${daysUntilExpiration} dias* (${formattedDate}).

Para continuar aproveitando todos os recursos sem interrupção, renove agora:
🔗 ${renewUrl}

Benefícios que você mantém:
✅ Webinários automatizados 24/7
✅ Ferramentas de IA
✅ Captura de leads

Qualquer dúvida, estamos à disposição!`;
    }

    const templateData = {
      name,
      planName,
      daysUntilExpiration: daysUntilExpiration.toString(),
      expirationDate: formattedDate,
      renewUrl,
      appName: APP_NAME,
    };

    const message = await getTemplateMessage(templateType, templateData, defaultMessage);
    return await sendNotificationMessage(formattedPhone, message, templateType, name);
  } catch (error) {
    console.error("[whatsapp-notifications] Erro em sendWhatsAppExpirationReminderSafe:", error);
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
    // Filter to show only NOTIFICATIONS accounts (scope='notifications')
    const notificationsAccounts = allAccounts.filter(a => a.scope === 'notifications');
    const connectedAccounts = await storage.getAvailableWhatsappAccountsForRotation(superadminId, 'notifications');
    
    if (connectedAccounts.length === 0) {
      return {
        configured: notificationsAccounts.length > 0,
        accountId: notificationsAccounts.length > 0 ? notificationsAccounts[0].id : null,
        status: notificationsAccounts.length > 0 ? "disconnected" : "not_configured",
        enabled,
        connectedAccounts: 0,
        totalAccounts: notificationsAccounts.length,
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
      totalAccounts: notificationsAccounts.length,
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

/**
 * Envia lembrete de falha de pagamento recorrente via WhatsApp
 * Safe version - nunca lança erros
 */
export async function sendWhatsAppRecurringPaymentFailedReminderSafe(
  phone: string | null | undefined,
  name: string,
  planName: string,
  reminderNumber: number,
  planoId?: string,
  email?: string,
  cpf?: string | null
): Promise<boolean> {
  try {
    if (!phone) {
      console.warn("[whatsapp-notifications] Phone nao disponivel para lembrete de falha recorrente");
      return false;
    }

    const enabled = await isWhatsAppNotificationsEnabled();
    if (!enabled) {
      console.warn("[whatsapp-notifications] Notificacoes desabilitadas, nao enviando lembrete de falha recorrente");
      return false;
    }

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      console.warn("[whatsapp-notifications] Numero invalido para lembrete de falha recorrente:", phone);
      return false;
    }

    const checkoutParams = new URLSearchParams({
      recuperacao: "true"
    });
    // Add user data if available
    if (email) checkoutParams.set('email', email);
    if (name) checkoutParams.set('nome', name);
    if (cpf) checkoutParams.set('cpf', cpf);
    if (phone) checkoutParams.set('telefone', phone);
    const checkoutUrl = planoId 
      ? `${getAppUrl()}/checkout/${planoId}?${checkoutParams.toString()}`
      : `${getAppUrl()}/checkout?${checkoutParams.toString()}`;

    let urgencyText = "";
    if (reminderNumber === 1) {
      urgencyText = "Sua renovacao automatica nao foi aprovada.";
    } else if (reminderNumber === 2) {
      urgencyText = "*Seu acesso ainda esta suspenso!*";
    } else {
      urgencyText = "*ULTIMO AVISO!* Seu acesso sera cancelado em breve.";
    }

    const defaultMessage = `Ola ${name}!

${urgencyText}

A renovacao do seu plano *${planName}* nao foi aprovada.

Seus dados estao seguros! Regularize para reativar:
${checkoutUrl}

O que fazer:
- Verificar o limite do cartao
- Atualizar forma de pagamento
- Liberar transacao com seu banco

Duvidas? Responda esta mensagem!`;

    const templateData = {
      name,
      planName,
      checkoutUrl,
      reminderNumber: String(reminderNumber),
      appName: APP_NAME,
    };

    const message = await getTemplateMessage("recurring_payment_failed_reminder", templateData, defaultMessage);
    return await sendNotificationMessage(formattedPhone, message, 'recurring_payment_failed_reminder', name);
  } catch (error) {
    console.error("[whatsapp-notifications] Erro em sendWhatsAppRecurringPaymentFailedReminderSafe:", error);
    return false;
  }
}

/**
 * Envia notificação de PIX gerado via WhatsApp
 * Safe version - nunca lança erros
 */
export async function sendWhatsAppPixGeneratedSafe(
  phone: string | null | undefined,
  name: string,
  planName: string,
  amount: number,
  pixCopiaCola: string,
  expirationTime: string
): Promise<boolean> {
  try {
    if (!phone) {
      console.warn("[whatsapp-notifications] Phone nao disponivel para PIX gerado");
      return false;
    }

    const enabled = await isWhatsAppNotificationsEnabled();
    if (!enabled) {
      console.warn("[whatsapp-notifications] Notificacoes desabilitadas, nao enviando PIX gerado");
      return false;
    }

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      console.warn("[whatsapp-notifications] Numero invalido para PIX gerado:", phone);
      return false;
    }

    const formattedAmount = (amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const defaultMessage = `Ola ${name}!

Seu PIX para o plano *${planName}* foi gerado!

*Valor:* ${formattedAmount}
*Expira em:* ${expirationTime}

*PIX Copia e Cola:*
${pixCopiaCola}

Apos o pagamento, seu acesso sera liberado automaticamente!

Duvidas? Responda esta mensagem!`;

    const templateData = {
      name,
      planName,
      amount: formattedAmount,
      expirationTime,
      pixCopiaCola,
      appName: APP_NAME,
    };

    const message = await getTemplateMessage("pix_generated", templateData, defaultMessage);
    return await sendNotificationMessage(formattedPhone, message, 'pix_generated', name);
  } catch (error) {
    console.error("[whatsapp-notifications] Erro em sendWhatsAppPixGeneratedSafe:", error);
    return false;
  }
}

/**
 * Envia notificação de Boleto gerado via WhatsApp
 * Safe version - nunca lança erros
 */
export async function sendWhatsAppBoletoGeneratedSafe(
  phone: string | null | undefined,
  name: string,
  planName: string,
  amount: number,
  boletoUrl: string,
  dueDate: string
): Promise<boolean> {
  try {
    if (!phone) {
      console.warn("[whatsapp-notifications] Phone nao disponivel para boleto gerado");
      return false;
    }

    const enabled = await isWhatsAppNotificationsEnabled();
    if (!enabled) {
      console.warn("[whatsapp-notifications] Notificacoes desabilitadas, nao enviando boleto gerado");
      return false;
    }

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      console.warn("[whatsapp-notifications] Numero invalido para boleto gerado:", phone);
      return false;
    }

    const formattedAmount = (amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const defaultMessage = `Ola ${name}!

Seu boleto para o plano *${planName}* foi gerado!

*Valor:* ${formattedAmount}
*Vencimento:* ${dueDate}

Acesse o boleto: ${boletoUrl}

Apos a compensacao (1-3 dias uteis), seu acesso sera liberado!

Duvidas? Responda esta mensagem!`;

    const templateData = {
      name,
      planName,
      amount: formattedAmount,
      dueDate,
      boletoUrl,
      appName: APP_NAME,
    };

    const message = await getTemplateMessage("boleto_generated", templateData, defaultMessage);
    return await sendNotificationMessage(formattedPhone, message, 'boleto_generated', name);
  } catch (error) {
    console.error("[whatsapp-notifications] Erro em sendWhatsAppBoletoGeneratedSafe:", error);
    return false;
  }
}

/**
 * Envia notificação de pagamento pendente via WhatsApp
 * Safe version - nunca lança erros
 */
export async function sendWhatsAppPaymentPendingSafe(
  phone: string | null | undefined,
  name: string,
  planName: string,
  paymentMethod: string,
  planoId?: string,
  email?: string,
  cpf?: string | null
): Promise<boolean> {
  try {
    if (!phone) {
      console.warn("[whatsapp-notifications] Phone nao disponivel para pagamento pendente");
      return false;
    }

    const enabled = await isWhatsAppNotificationsEnabled();
    if (!enabled) {
      console.warn("[whatsapp-notifications] Notificacoes desabilitadas, nao enviando pagamento pendente");
      return false;
    }

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      console.warn("[whatsapp-notifications] Numero invalido para pagamento pendente:", phone);
      return false;
    }

    // Build checkout URL with user data
    const checkoutParams = new URLSearchParams();
    if (email) checkoutParams.set('email', email);
    if (name) checkoutParams.set('nome', name);
    if (cpf) checkoutParams.set('cpf', cpf);
    if (phone) checkoutParams.set('telefone', phone);
    const queryString = checkoutParams.toString();
    const checkoutUrl = planoId 
      ? `${getAppUrl()}/checkout/${planoId}${queryString ? '?' + queryString : ''}`
      : `${getAppUrl()}/checkout${queryString ? '?' + queryString : ''}`;

    const defaultMessage = `Ola ${name}!

Seu pagamento do plano *${planName}* esta sendo processado.

*Metodo:* ${paymentMethod}

Assim que for confirmado, voce recebera uma nova mensagem.

Se preferir outra forma de pagamento: ${checkoutUrl}

Duvidas? Responda esta mensagem!`;

    const templateData = {
      name,
      planName,
      paymentMethod,
      checkoutUrl,
      appName: APP_NAME,
    };

    const message = await getTemplateMessage("payment_pending", templateData, defaultMessage);
    return await sendNotificationMessage(formattedPhone, message, 'payment_pending', name);
  } catch (error) {
    console.error("[whatsapp-notifications] Erro em sendWhatsAppPaymentPendingSafe:", error);
    return false;
  }
}

// ============================================================
// RETRY MECHANISM - Processa mensagens pendentes periodicamente
// ============================================================

const RETRY_INTERVAL_MS = 60000; // Tenta reenviar a cada 1 minuto
let retryInterval: NodeJS.Timeout | null = null;

/**
 * Processa mensagens pendentes na fila
 * Chamado periodicamente para reenviar mensagens que falharam por falta de conexão
 */
async function processPendingMessages(): Promise<void> {
  try {
    // Verifica se há conexão disponível ANTES de buscar mensagens
    const isAvailable = await isWhatsAppNotificationServiceAvailable();
    if (!isAvailable) {
      return; // Não há conexão, próxima tentativa no próximo intervalo
    }

    // Pré-seleciona conta disponível antes de buscar mensagens
    const selectedAccount = await selectAccountForSending();
    if (!selectedAccount) {
      return; // Nenhuma conta disponível, próxima tentativa no próximo intervalo
    }

    const { accountId, label } = selectedAccount;
    const status = await getWhatsAppStatus(accountId);
    
    if (status.status !== "connected") {
      return; // Conta não conectada, próxima tentativa no próximo intervalo
    }

    // Busca mensagens pendentes apenas se há conta conectada
    const pendingMessages = await storage.getWhatsappNotificationLogsByStatus('pending');
    if (pendingMessages.length === 0) {
      return;
    }

    console.log(`[whatsapp-notifications] Processando ${pendingMessages.length} mensagem(ns) pendente(s) via ${label}`);

    for (const msg of pendingMessages) {
      try {
        // Verifica se a conta ainda está conectada
        const currentStatus = await getWhatsAppStatus(accountId);
        if (currentStatus.status !== "connected") {
          console.log(`[whatsapp-notifications] Retry: Conta ${label} desconectou durante processamento, parando`);
          return; // Conta desconectou, próxima tentativa no próximo intervalo
        }

        // Tenta enviar a mensagem
        const result = await sendWhatsAppMessage(accountId, msg.recipientPhone, msg.message || '');
        
        if (result.success) {
          await storage.incrementWhatsappAccountMessageCount(accountId);
          await updateNotificationLog(msg.id, 'sent');
          console.log(`[whatsapp-notifications] Retry: Mensagem ${msg.id} enviada com sucesso para ${msg.recipientPhone}`);
        } else {
          await updateNotificationLog(msg.id, 'failed', result.error || 'Erro ao enviar mensagem');
          console.log(`[whatsapp-notifications] Retry: Falha ao enviar mensagem ${msg.id}: ${result.error}`);
        }

        // Delay entre mensagens para evitar spam
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error: any) {
        console.error(`[whatsapp-notifications] Retry: Erro ao processar mensagem ${msg.id}:`, error);
        await updateNotificationLog(msg.id, 'failed', error.message || 'Erro interno');
      }
    }
  } catch (error) {
    console.error("[whatsapp-notifications] Erro ao processar mensagens pendentes:", error);
  }
}

/**
 * Inicia o mecanismo de retry para mensagens pendentes
 */
export function startPendingMessagesRetry(): void {
  if (retryInterval) {
    clearInterval(retryInterval);
  }
  
  console.log("[whatsapp-notifications] Iniciando retry de mensagens pendentes (intervalo: 1 min)");
  
  // Primeira execução após 30 segundos
  setTimeout(() => {
    processPendingMessages();
  }, 30000);
  
  // Execuções periódicas
  retryInterval = setInterval(processPendingMessages, RETRY_INTERVAL_MS);
}

/**
 * Para o mecanismo de retry
 */
export function stopPendingMessagesRetry(): void {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
    console.log("[whatsapp-notifications] Retry de mensagens pendentes parado");
  }
}
