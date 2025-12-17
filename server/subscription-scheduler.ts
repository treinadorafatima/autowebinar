import { db } from "./db";
import { admins, checkoutPlanos, checkoutPagamentos } from "@shared/schema";
import { eq, and, gte, lte, isNotNull, sql } from "drizzle-orm";
import { 
  sendExpirationReminderEmail, 
  sendExpiredRenewalEmail,
  sendAutoRenewalPaymentEmail,
  sendRecurringPaymentFailedReminderEmail
} from "./email";
import { 
  sendWhatsAppPlanExpiredSafe,
  sendWhatsAppExpirationReminderSafe,
  sendWhatsAppRecurringPaymentFailedReminderSafe
} from "./whatsapp-notifications";
import { storage } from "./storage";

const SCHEDULER_INTERVAL_MS = 3600000; // Check every hour
let schedulerInterval: NodeJS.Timeout | null = null;
let lastRunDate: string | null = null;

interface AdminWithPlan {
  id: string;
  name: string | null;
  email: string;
  accessExpiresAt: Date | null;
  planoId: string | null;
  lastExpirationEmailSent: Date | null;
  planName?: string;
  telefone?: string | null;
}

interface PlanFrequency {
  frequencia: number;
  frequenciaTipo: string;
  tipoCobranca: string;
}

async function getPlanFrequency(planoId: string | null): Promise<PlanFrequency | null> {
  if (!planoId) return null;
  
  try {
    const plano = await db
      .select({ 
        frequencia: checkoutPlanos.frequencia, 
        frequenciaTipo: checkoutPlanos.frequenciaTipo,
        tipoCobranca: checkoutPlanos.tipoCobranca 
      })
      .from(checkoutPlanos)
      .where(eq(checkoutPlanos.id, planoId))
      .limit(1);
    
    if (!plano[0]) return null;
    return {
      frequencia: plano[0].frequencia || 1,
      frequenciaTipo: plano[0].frequenciaTipo || 'months',
      tipoCobranca: plano[0].tipoCobranca || 'unico'
    };
  } catch {
    return null;
  }
}

function isDailyPlan(planFreq: PlanFrequency | null): boolean {
  if (!planFreq) return false;
  return planFreq.tipoCobranca === 'recorrente' && 
         planFreq.frequenciaTipo === 'days' && 
         planFreq.frequencia <= 3; // Planos com ciclo de até 3 dias são considerados "diários"
}

interface RenewalPaymentData {
  pixCopiaCola: string | null;
  pixQrCode: string | null;
  pixExpiresAt: Date | null;
  boletoUrl: string | null;
  boletoCodigo: string | null;
  boletoExpiresAt: Date | null;
}

async function getAdminsExpiringInDays(days: number): Promise<AdminWithPlan[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const targetDate = new Date(today);
  targetDate.setDate(targetDate.getDate() + days);
  
  const nextDay = new Date(targetDate);
  nextDay.setDate(nextDay.getDate() + 1);
  
  const results = await db
    .select({
      id: admins.id,
      name: admins.name,
      email: admins.email,
      accessExpiresAt: admins.accessExpiresAt,
      planoId: admins.planoId,
      lastExpirationEmailSent: admins.lastExpirationEmailSent,
      telefone: admins.telefone,
    })
    .from(admins)
    .where(
      and(
        isNotNull(admins.accessExpiresAt),
        gte(admins.accessExpiresAt, targetDate),
        lte(admins.accessExpiresAt, nextDay),
        eq(admins.isActive, true)
      )
    );
  
  return results;
}

// Busca usuários cujo acesso vence nas próximas X horas (para planos diários)
async function getAdminsExpiringInHours(hours: number): Promise<AdminWithPlan[]> {
  const now = new Date();
  const targetDate = new Date(now.getTime() + hours * 60 * 60 * 1000);
  
  const results = await db
    .select({
      id: admins.id,
      name: admins.name,
      email: admins.email,
      accessExpiresAt: admins.accessExpiresAt,
      planoId: admins.planoId,
      lastExpirationEmailSent: admins.lastExpirationEmailSent,
      telefone: admins.telefone,
    })
    .from(admins)
    .where(
      and(
        isNotNull(admins.accessExpiresAt),
        gte(admins.accessExpiresAt, now),
        lte(admins.accessExpiresAt, targetDate),
        eq(admins.isActive, true)
      )
    );
  
  return results;
}

// Busca usuários cujo acesso expirou nas últimas X horas (para planos diários)
async function getAdminsExpiredInLastHours(hours: number): Promise<AdminWithPlan[]> {
  const now = new Date();
  const pastDate = new Date(now.getTime() - hours * 60 * 60 * 1000);
  
  const results = await db
    .select({
      id: admins.id,
      name: admins.name,
      email: admins.email,
      accessExpiresAt: admins.accessExpiresAt,
      planoId: admins.planoId,
      lastExpirationEmailSent: admins.lastExpirationEmailSent,
      telefone: admins.telefone,
    })
    .from(admins)
    .where(
      and(
        isNotNull(admins.accessExpiresAt),
        gte(admins.accessExpiresAt, pastDate),
        lte(admins.accessExpiresAt, now),
        eq(admins.isActive, true)
      )
    );
  
  return results;
}

async function getAdminsExpiredYesterday(): Promise<AdminWithPlan[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const results = await db
    .select({
      id: admins.id,
      name: admins.name,
      email: admins.email,
      accessExpiresAt: admins.accessExpiresAt,
      planoId: admins.planoId,
      lastExpirationEmailSent: admins.lastExpirationEmailSent,
    })
    .from(admins)
    .where(
      and(
        isNotNull(admins.accessExpiresAt),
        gte(admins.accessExpiresAt, yesterday),
        lte(admins.accessExpiresAt, today)
      )
    );
  
  return results;
}

async function getPlanName(planoId: string | null): Promise<string> {
  if (!planoId) return "Seu Plano";
  
  try {
    const plano = await db
      .select({ nome: checkoutPlanos.nome })
      .from(checkoutPlanos)
      .where(eq(checkoutPlanos.id, planoId))
      .limit(1);
    
    return plano[0]?.nome || "Seu Plano";
  } catch {
    return "Seu Plano";
  }
}

async function markEmailSent(adminId: string): Promise<void> {
  try {
    await db
      .update(admins)
      .set({ lastExpirationEmailSent: new Date() })
      .where(eq(admins.id, adminId));
  } catch (error) {
    console.error(`[subscription-scheduler] Error marking email sent for ${adminId}:`, error);
  }
}

async function generateRenewalPixBoleto(admin: AdminWithPlan): Promise<boolean> {
  if (!admin.planoId) return false;
  
  try {
    const plano = await db.select().from(checkoutPlanos).where(eq(checkoutPlanos.id, admin.planoId)).limit(1);
    if (!plano[0]) return false;
    
    const plan = plano[0];
    const stripeSecretKey = await storage.getCheckoutConfig('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.log('[subscription-scheduler] Stripe not configured, skipping auto-renewal');
      return false;
    }

    // Try to get CPF from previous approved payments for this user
    const previousPayments = await db
      .select({ cpf: checkoutPagamentos.cpf })
      .from(checkoutPagamentos)
      .where(
        and(
          eq(checkoutPagamentos.email, admin.email),
          isNotNull(checkoutPagamentos.cpf),
          eq(checkoutPagamentos.status, 'approved')
        )
      )
      .orderBy(sql`${checkoutPagamentos.criadoEm} DESC`)
      .limit(1);
    
    const userCpf = previousPayments[0]?.cpf || null;

    const pagamento = await storage.createCheckoutPagamento({
      email: admin.email,
      nome: admin.name || 'Cliente',
      cpf: userCpf,
      telefone: admin.telefone || null,
      planoId: plan.id,
      valor: plan.preco,
      status: 'pending',
      statusDetail: 'Auto-renewal payment generated',
    });

    let paymentData: RenewalPaymentData = {
      pixCopiaCola: null,
      pixQrCode: null,
      pixExpiresAt: null,
      boletoUrl: null,
      boletoCodigo: null,
      boletoExpiresAt: null,
    };

    const amountInCentavos = Math.round(Number(plan.preco) * 100);

    try {
      const pixParams = new URLSearchParams({
        'amount': amountInCentavos.toString(),
        'currency': 'brl',
        'payment_method_types[0]': 'pix',
        'metadata[pagamentoId]': pagamento.id,
        'metadata[adminId]': admin.id,
        'metadata[autoRenewal]': 'true',
        'receipt_email': admin.email,
        'description': `Renovação ${plan.nome}`,
      });

      const pixResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: pixParams.toString(),
      });

      if (pixResponse.ok) {
        const pixIntent = await pixResponse.json();
        
        const confirmParams = new URLSearchParams({
          'payment_method_data[type]': 'pix',
        });

        const confirmResponse = await fetch(`https://api.stripe.com/v1/payment_intents/${pixIntent.id}/confirm`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: confirmParams.toString(),
        });

        if (confirmResponse.ok) {
          const confirmedPix = await confirmResponse.json();
          const pixAction = confirmedPix.next_action?.pix_display_qr_code;
          if (pixAction) {
            paymentData.pixCopiaCola = pixAction.data || null;
            paymentData.pixQrCode = pixAction.image_url_png || null;
            paymentData.pixExpiresAt = pixAction.expires_at ? new Date(pixAction.expires_at * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);
          }
        } else {
          const errorData = await confirmResponse.json().catch(() => ({}));
          console.error('[subscription-scheduler] PIX confirm failed:', confirmResponse.status, errorData);
        }
      } else {
        const errorData = await pixResponse.json().catch(() => ({}));
        console.error('[subscription-scheduler] PIX create failed:', pixResponse.status, errorData);
      }
    } catch (pixErr) {
      console.error('[subscription-scheduler] Error generating PIX:', pixErr);
    }

    try {
      // Only generate boleto if user has a valid CPF on record
      if (!userCpf || userCpf.length < 11) {
        console.log(`[subscription-scheduler] Skipping boleto for ${admin.email} - no CPF on record`);
      } else {
        const boletoExpiresAt = new Date();
        boletoExpiresAt.setDate(boletoExpiresAt.getDate() + 3);

        const boletoParams = new URLSearchParams({
          'amount': amountInCentavos.toString(),
          'currency': 'brl',
          'payment_method_types[0]': 'boleto',
          'metadata[pagamentoId]': pagamento.id,
          'metadata[adminId]': admin.id,
          'metadata[autoRenewal]': 'true',
          'receipt_email': admin.email,
          'description': `Renovação ${plan.nome}`,
        });

        const boletoResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: boletoParams.toString(),
        });

        if (boletoResponse.ok) {
          const boletoIntent = await boletoResponse.json();
          
          // Clean CPF - remove non-digits
          const cpfDigits = userCpf.replace(/\D/g, '');
          const confirmParams = new URLSearchParams({
            'payment_method_data[type]': 'boleto',
            'payment_method_data[billing_details][email]': admin.email,
            'payment_method_data[billing_details][name]': admin.name || 'Cliente',
            'payment_method_data[boleto][tax_id]': cpfDigits,
          });

        const confirmResponse = await fetch(`https://api.stripe.com/v1/payment_intents/${boletoIntent.id}/confirm`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: confirmParams.toString(),
        });

        if (confirmResponse.ok) {
          const confirmedBoleto = await confirmResponse.json();
          const boletoAction = confirmedBoleto.next_action?.boleto_display_details;
          if (boletoAction) {
            paymentData.boletoUrl = boletoAction.hosted_voucher_url || null;
            paymentData.boletoCodigo = boletoAction.number || null;
            paymentData.boletoExpiresAt = boletoAction.expires_at ? new Date(boletoAction.expires_at * 1000) : boletoExpiresAt;
          }
        } else {
          const errorData = await confirmResponse.json().catch(() => ({}));
          console.error('[subscription-scheduler] Boleto confirm failed:', confirmResponse.status, errorData);
        }
        } else {
          const errorData = await boletoResponse.json().catch(() => ({}));
          console.error('[subscription-scheduler] Boleto create failed:', boletoResponse.status, errorData);
        }
      }
    } catch (boletoErr) {
      console.error('[subscription-scheduler] Error generating Boleto:', boletoErr);
    }

    await storage.updateCheckoutPagamento(pagamento.id, {
      pixQrCode: paymentData.pixQrCode,
      pixCopiaCola: paymentData.pixCopiaCola,
      pixExpiresAt: paymentData.pixExpiresAt,
      boletoUrl: paymentData.boletoUrl,
      boletoCodigo: paymentData.boletoCodigo,
      boletoExpiresAt: paymentData.boletoExpiresAt,
    });

    if (paymentData.pixCopiaCola || paymentData.boletoUrl) {
      await sendAutoRenewalPaymentEmail(
        admin.email,
        admin.name || 'Cliente',
        plan.nome,
        plan.preco,
        admin.accessExpiresAt!,
        paymentData.pixCopiaCola,
        paymentData.pixQrCode,
        paymentData.pixExpiresAt,
        paymentData.boletoUrl,
        paymentData.boletoCodigo,
        paymentData.boletoExpiresAt
      );
      console.log(`[subscription-scheduler] Sent auto-renewal payment email to ${admin.email}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`[subscription-scheduler] Error generating renewal payment for ${admin.email}:`, error);
    return false;
  }
}

function shouldSendEmail(admin: AdminWithPlan, daysType: '3days' | '1day' | 'expired' | 'daily_reminder' | 'daily_expired'): boolean {
  if (!admin.lastExpirationEmailSent) return true;
  
  const lastSent = new Date(admin.lastExpirationEmailSent);
  const now = new Date();
  const hoursSinceLastEmail = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60);
  
  if (daysType === '3days') return hoursSinceLastEmail >= 48;
  if (daysType === '1day') return hoursSinceLastEmail >= 20;
  if (daysType === 'expired') return hoursSinceLastEmail >= 20;
  // Para planos diários: não enviar mais de 1 email a cada 4 horas
  if (daysType === 'daily_reminder') return hoursSinceLastEmail >= 4;
  if (daysType === 'daily_expired') return hoursSinceLastEmail >= 4;
  
  return true;
}

async function processExpirationReminders(): Promise<void> {
  const currentHour = new Date().getHours();
  const todayStr = new Date().toISOString().split('T')[0];
  
  console.log(`[subscription-scheduler] Running expiration check at ${new Date().toISOString()}`);
  
  try {
    // ==========================================
    // PLANOS DIÁRIOS: Verifica a cada hora
    // Envia lembrete 6 horas antes do vencimento
    // ==========================================
    const adminsExpiringSoon = await getAdminsExpiringInHours(6);
    for (const admin of adminsExpiringSoon) {
      const planFreq = await getPlanFrequency(admin.planoId);
      
      // Só processa se for plano diário
      if (!isDailyPlan(planFreq)) continue;
      
      if (!shouldSendEmail(admin, 'daily_reminder')) {
        console.log(`[subscription-scheduler] Skipping daily reminder for ${admin.email} - recently sent`);
        continue;
      }
      
      const planName = await getPlanName(admin.planoId);
      const hoursLeft = Math.ceil((new Date(admin.accessExpiresAt!).getTime() - Date.now()) / (1000 * 60 * 60));
      
      const emailSuccess = await sendExpirationReminderEmail(
        admin.email,
        admin.name || "Cliente",
        planName,
        0, // 0 dias = vence hoje
        admin.accessExpiresAt!
      );
      
      // Enviar WhatsApp também
      const whatsappSuccess = await sendWhatsAppExpirationReminderSafe(
        admin.telefone,
        admin.name || "Cliente",
        planName,
        0,
        admin.accessExpiresAt!
      );
      
      if (emailSuccess || whatsappSuccess) {
        await markEmailSent(admin.id);
        console.log(`[subscription-scheduler] Sent daily reminder to ${admin.email} - expires in ${hoursLeft} hours (email: ${emailSuccess}, whatsapp: ${whatsappSuccess})`);
        await generateRenewalPixBoleto(admin);
      }
    }
    
    // Planos diários expirados nas últimas 6 horas
    const adminsExpiredRecently = await getAdminsExpiredInLastHours(6);
    for (const admin of adminsExpiredRecently) {
      const planFreq = await getPlanFrequency(admin.planoId);
      
      // Só processa se for plano diário
      if (!isDailyPlan(planFreq)) continue;
      
      if (!shouldSendEmail(admin, 'daily_expired')) {
        console.log(`[subscription-scheduler] Skipping daily expired email for ${admin.email} - recently sent`);
        continue;
      }
      
      const planName = await getPlanName(admin.planoId);
      const emailSuccess = await sendExpiredRenewalEmail(
        admin.email,
        admin.name || "Cliente",
        planName
      );
      
      // Enviar WhatsApp também
      const whatsappSuccess = await sendWhatsAppPlanExpiredSafe(
        admin.telefone,
        admin.name || "Cliente",
        planName
      );
      
      if (emailSuccess || whatsappSuccess) {
        await markEmailSent(admin.id);
        console.log(`[subscription-scheduler] Sent daily expired to ${admin.email} (email: ${emailSuccess}, whatsapp: ${whatsappSuccess})`);
      }
    }
    
    // ==========================================
    // PLANOS NORMAIS: Verifica 1x por dia
    // ==========================================
    if (lastRunDate === todayStr && currentHour < 8) {
      return;
    }
    
    // Lembrete 3 dias antes (apenas planos não-diários)
    const admins3Days = await getAdminsExpiringInDays(3);
    for (const admin of admins3Days) {
      const planFreq = await getPlanFrequency(admin.planoId);
      if (isDailyPlan(planFreq)) continue; // Ignora planos diários aqui
      
      if (!shouldSendEmail(admin, '3days')) {
        console.log(`[subscription-scheduler] Skipping 3-day reminder for ${admin.email} - recently sent`);
        continue;
      }
      
      const planName = await getPlanName(admin.planoId);
      const emailSuccess = await sendExpirationReminderEmail(
        admin.email,
        admin.name || "Cliente",
        planName,
        3,
        admin.accessExpiresAt!
      );
      
      // Enviar WhatsApp também
      const whatsappSuccess = await sendWhatsAppExpirationReminderSafe(
        admin.telefone,
        admin.name || "Cliente",
        planName,
        3,
        admin.accessExpiresAt!
      );
      
      if (emailSuccess || whatsappSuccess) {
        await markEmailSent(admin.id);
        console.log(`[subscription-scheduler] Sent 3-day reminder to ${admin.email} (email: ${emailSuccess}, whatsapp: ${whatsappSuccess})`);
      }
    }
    
    // Lembrete 1 dia antes (apenas planos não-diários)
    const admins1Day = await getAdminsExpiringInDays(1);
    for (const admin of admins1Day) {
      const planFreq = await getPlanFrequency(admin.planoId);
      if (isDailyPlan(planFreq)) continue; // Ignora planos diários aqui
      
      if (!shouldSendEmail(admin, '1day')) {
        console.log(`[subscription-scheduler] Skipping 1-day reminder for ${admin.email} - recently sent`);
        continue;
      }
      
      const planName = await getPlanName(admin.planoId);
      const emailSuccess = await sendExpirationReminderEmail(
        admin.email,
        admin.name || "Cliente",
        planName,
        1,
        admin.accessExpiresAt!
      );
      
      // Enviar WhatsApp também
      const whatsappSuccess = await sendWhatsAppExpirationReminderSafe(
        admin.telefone,
        admin.name || "Cliente",
        planName,
        1,
        admin.accessExpiresAt!
      );
      
      if (emailSuccess || whatsappSuccess) {
        await markEmailSent(admin.id);
        console.log(`[subscription-scheduler] Sent 1-day reminder to ${admin.email} (email: ${emailSuccess}, whatsapp: ${whatsappSuccess})`);
        await generateRenewalPixBoleto(admin);
      }
    }
    
    // Aviso de expirado (apenas planos não-diários)
    if (currentHour >= 8 && currentHour < 10) {
      const expiredAdmins = await getAdminsExpiredYesterday();
      for (const admin of expiredAdmins) {
        const planFreq = await getPlanFrequency(admin.planoId);
        if (isDailyPlan(planFreq)) continue; // Ignora planos diários aqui
        
        if (!shouldSendEmail(admin, 'expired')) {
          console.log(`[subscription-scheduler] Skipping expired email for ${admin.email} - recently sent`);
          continue;
        }
        
        const planName = await getPlanName(admin.planoId);
        const emailSuccess = await sendExpiredRenewalEmail(
          admin.email,
          admin.name || "Cliente",
          planName
        );
        
        // Enviar WhatsApp também
        const whatsappSuccess = await sendWhatsAppPlanExpiredSafe(
          admin.telefone,
          admin.name || "Cliente",
          planName
        );
        
        if (emailSuccess || whatsappSuccess) {
          await markEmailSent(admin.id);
          console.log(`[subscription-scheduler] Sent expired renewal to ${admin.email} (email: ${emailSuccess}, whatsapp: ${whatsappSuccess})`);
        }
      }
    }
    
    lastRunDate = todayStr;
    
    // ==========================================
    // LEMBRETES DE FALHA DE RECORRÊNCIA
    // ==========================================
    await processFailedRecurringPaymentReminders();
    
  } catch (error) {
    console.error("[subscription-scheduler] Error processing expiration reminders:", error);
  }
}

/**
 * Processa lembretes para pagamentos recorrentes com falha
 * Envia lembretes em 1 dia, 3 dias e 7 dias após a falha
 */
async function processFailedRecurringPaymentReminders(): Promise<void> {
  try {
    const now = new Date();
    
    // Buscar pagamentos com status 'rejected' que são de planos recorrentes (têm stripeSubscriptionId)
    // e que ainda não receberam todos os 3 lembretes
    const failedPayments = await db
      .select({
        id: checkoutPagamentos.id,
        email: checkoutPagamentos.email,
        nome: checkoutPagamentos.nome,
        telefone: checkoutPagamentos.telefone,
        planoId: checkoutPagamentos.planoId,
        lastFailureAt: checkoutPagamentos.lastFailureAt,
        failedPaymentRemindersSent: checkoutPagamentos.failedPaymentRemindersSent,
        lastFailedPaymentReminderAt: checkoutPagamentos.lastFailedPaymentReminderAt,
        stripeSubscriptionId: checkoutPagamentos.stripeSubscriptionId,
      })
      .from(checkoutPagamentos)
      .where(
        and(
          eq(checkoutPagamentos.status, "rejected"),
          isNotNull(checkoutPagamentos.stripeSubscriptionId),
          isNotNull(checkoutPagamentos.lastFailureAt),
          sql`${checkoutPagamentos.failedPaymentRemindersSent} < 3 OR ${checkoutPagamentos.failedPaymentRemindersSent} IS NULL`
        )
      );

    for (const payment of failedPayments) {
      const lastFailure = payment.lastFailureAt;
      if (!lastFailure) continue;
      
      const remindersSent = payment.failedPaymentRemindersSent || 0;
      const daysSinceFailure = Math.floor((now.getTime() - lastFailure.getTime()) / (1000 * 60 * 60 * 24));
      
      // Determinar qual lembrete deve ser enviado
      let shouldSendReminder = false;
      let reminderNumber = 0;
      
      if (remindersSent === 0 && daysSinceFailure >= 1) {
        // Lembrete 1: 1 dia após a falha
        shouldSendReminder = true;
        reminderNumber = 1;
      } else if (remindersSent === 1 && daysSinceFailure >= 3) {
        // Lembrete 2: 3 dias após a falha
        shouldSendReminder = true;
        reminderNumber = 2;
      } else if (remindersSent === 2 && daysSinceFailure >= 7) {
        // Lembrete 3: 7 dias após a falha (último aviso)
        shouldSendReminder = true;
        reminderNumber = 3;
      }
      
      if (!shouldSendReminder) continue;
      
      // Verificar se já enviou lembrete hoje (evitar spam)
      if (payment.lastFailedPaymentReminderAt) {
        const lastReminder = new Date(payment.lastFailedPaymentReminderAt);
        const hoursSinceLastReminder = (now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastReminder < 23) {
          continue; // Já enviou lembrete nas últimas 23 horas
        }
      }
      
      const planName = await getPlanName(payment.planoId);
      
      // Enviar email
      const emailSuccess = await sendRecurringPaymentFailedReminderEmail(
        payment.email,
        payment.nome,
        planName,
        reminderNumber,
        payment.planoId
      );
      
      // Enviar WhatsApp
      const whatsappSuccess = await sendWhatsAppRecurringPaymentFailedReminderSafe(
        payment.telefone,
        payment.nome,
        planName,
        reminderNumber,
        payment.planoId
      );
      
      if (emailSuccess || whatsappSuccess) {
        // Atualizar o contador de lembretes
        await db.update(checkoutPagamentos)
          .set({
            failedPaymentRemindersSent: reminderNumber,
            lastFailedPaymentReminderAt: now,
            atualizadoEm: now,
          })
          .where(eq(checkoutPagamentos.id, payment.id));
        
        console.log(`[subscription-scheduler] Sent failed recurring payment reminder #${reminderNumber} to ${payment.email} (email: ${emailSuccess}, whatsapp: ${whatsappSuccess})`);
      }
    }
  } catch (error) {
    console.error("[subscription-scheduler] Error processing failed recurring payment reminders:", error);
  }
}

// Sync Mercado Pago subscription statuses with local database
async function syncMercadoPagoSubscriptions(): Promise<void> {
  console.log("[subscription-scheduler] Starting Mercado Pago subscription sync");
  
  try {
    const accessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
    if (!accessToken) {
      console.log("[subscription-scheduler] Mercado Pago not configured, skipping sync");
      return;
    }

    // Get all active/pending subscription payments
    const allPagamentos = await db.select().from(checkoutPagamentos)
      .where(sql`${checkoutPagamentos.mercadopagoPaymentId} IS NOT NULL AND ${checkoutPagamentos.status} IN ('approved', 'pending', 'authorized')`)
      .orderBy(sql`${checkoutPagamentos.criadoEm} DESC`);

    let synced = 0;
    let deactivated = 0;
    let reactivated = 0;

    for (const pagamento of allPagamentos) {
      try {
        const preapprovalId = pagamento.mercadopagoPaymentId;
        if (!preapprovalId) continue;

        // Fetch current status from Mercado Pago
        const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!mpResponse.ok) {
          // Not a preapproval (subscription), skip
          continue;
        }

        const preapproval = await mpResponse.json();
        const mpStatus = preapproval.status;

        const admin = await storage.getAdminByEmail(pagamento.email);

        if (mpStatus === 'paused' || mpStatus === 'cancelled') {
          // Should be deactivated
          if (admin && admin.isActive) {
            await storage.updateAdmin(admin.id, {
              isActive: false,
              paymentStatus: mpStatus,
            });
            deactivated++;
            console.log(`[subscription-scheduler] Auto-deactivated ${pagamento.email} - MP status: ${mpStatus}`);
          }

          if (pagamento.status !== mpStatus && pagamento.status !== 'cancelled') {
            await storage.updateCheckoutPagamento(pagamento.id, {
              status: mpStatus === 'cancelled' ? 'cancelled' : 'paused',
              statusDetail: `Assinatura ${mpStatus} (auto-sync)`,
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
              expirationDate.setDate(expirationDate.getDate() + plano.prazoDias);

              await storage.updateAdmin(admin.id, {
                isActive: true,
                paymentStatus: 'ok',
                accessExpiresAt: expirationDate,
              });
              reactivated++;
              console.log(`[subscription-scheduler] Auto-reactivated ${pagamento.email}`);
            }
          }
        }

        synced++;
      } catch (err) {
        // Silent fail for individual payments, continue processing others
      }
    }

    if (synced > 0 || deactivated > 0 || reactivated > 0) {
      console.log(`[subscription-scheduler] MP sync complete: ${synced} checked, ${deactivated} deactivated, ${reactivated} reactivated`);
    }
  } catch (error) {
    console.error("[subscription-scheduler] Error syncing Mercado Pago subscriptions:", error);
  }
}

export function startSubscriptionScheduler(): void {
  if (schedulerInterval) {
    console.log("[subscription-scheduler] Scheduler already running");
    return;
  }

  console.log("[subscription-scheduler] Starting subscription scheduler");
  
  setTimeout(() => {
    processExpirationReminders();
  }, 5000);
  
  // Run MP sync every 6 hours
  setTimeout(() => {
    syncMercadoPagoSubscriptions();
  }, 60000); // First run after 1 minute
  
  setInterval(() => {
    syncMercadoPagoSubscriptions();
  }, 6 * 60 * 60 * 1000); // Then every 6 hours
  
  schedulerInterval = setInterval(processExpirationReminders, SCHEDULER_INTERVAL_MS);
}

export function stopSubscriptionScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[subscription-scheduler] Subscription scheduler stopped");
  }
}

export async function getSubscriptionSchedulerStatus(): Promise<{
  isRunning: boolean;
  lastRunDate: string | null;
  nextRunIn: string;
}> {
  const nextRunMs = schedulerInterval ? SCHEDULER_INTERVAL_MS : 0;
  const nextRunMinutes = Math.round(nextRunMs / 60000);
  
  return {
    isRunning: schedulerInterval !== null,
    lastRunDate,
    nextRunIn: `${nextRunMinutes} minutos`
  };
}
