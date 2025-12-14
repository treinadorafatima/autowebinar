import { db } from "./db";
import { admins, checkoutPlanos, checkoutPagamentos } from "@shared/schema";
import { eq, and, gte, lte, isNotNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { 
  sendExpirationReminderEmail, 
  sendExpiredRenewalEmail,
  sendAutoRenewalPaymentEmail
} from "./email";
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
      .orderBy(sql`${checkoutPagamentos.createdAt} DESC`)
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

function shouldSendEmail(admin: AdminWithPlan, daysType: '3days' | '1day' | 'expired'): boolean {
  if (!admin.lastExpirationEmailSent) return true;
  
  const lastSent = new Date(admin.lastExpirationEmailSent);
  const now = new Date();
  const hoursSinceLastEmail = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60);
  
  if (daysType === '3days') return hoursSinceLastEmail >= 48;
  if (daysType === '1day') return hoursSinceLastEmail >= 20;
  if (daysType === 'expired') return hoursSinceLastEmail >= 20;
  
  return true;
}

async function processExpirationReminders(): Promise<void> {
  const currentHour = new Date().getHours();
  const todayStr = new Date().toISOString().split('T')[0];
  
  if (lastRunDate === todayStr && currentHour < 8) {
    return;
  }
  
  console.log(`[subscription-scheduler] Running expiration check at ${new Date().toISOString()}`);
  
  try {
    const admins3Days = await getAdminsExpiringInDays(3);
    for (const admin of admins3Days) {
      if (!shouldSendEmail(admin, '3days')) {
        console.log(`[subscription-scheduler] Skipping 3-day reminder for ${admin.email} - recently sent`);
        continue;
      }
      
      const planName = await getPlanName(admin.planoId);
      const success = await sendExpirationReminderEmail(
        admin.email,
        admin.name || "Cliente",
        planName,
        3,
        admin.accessExpiresAt!
      );
      
      if (success) {
        await markEmailSent(admin.id);
        console.log(`[subscription-scheduler] Sent 3-day reminder to ${admin.email}`);
      }
    }
    
    const admins1Day = await getAdminsExpiringInDays(1);
    for (const admin of admins1Day) {
      if (!shouldSendEmail(admin, '1day')) {
        console.log(`[subscription-scheduler] Skipping 1-day reminder for ${admin.email} - recently sent`);
        continue;
      }
      
      const planName = await getPlanName(admin.planoId);
      const success = await sendExpirationReminderEmail(
        admin.email,
        admin.name || "Cliente",
        planName,
        1,
        admin.accessExpiresAt!
      );
      
      if (success) {
        await markEmailSent(admin.id);
        console.log(`[subscription-scheduler] Sent 1-day reminder to ${admin.email}`);
        await generateRenewalPixBoleto(admin);
      }
    }
    
    if (currentHour >= 8 && currentHour < 10) {
      const expiredAdmins = await getAdminsExpiredYesterday();
      for (const admin of expiredAdmins) {
        if (!shouldSendEmail(admin, 'expired')) {
          console.log(`[subscription-scheduler] Skipping expired email for ${admin.email} - recently sent`);
          continue;
        }
        
        const planName = await getPlanName(admin.planoId);
        const success = await sendExpiredRenewalEmail(
          admin.email,
          admin.name || "Cliente",
          planName
        );
        
        if (success) {
          await markEmailSent(admin.id);
          console.log(`[subscription-scheduler] Sent expired renewal email to ${admin.email}`);
        }
      }
    }
    
    lastRunDate = todayStr;
    
  } catch (error) {
    console.error("[subscription-scheduler] Error processing expiration reminders:", error);
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
