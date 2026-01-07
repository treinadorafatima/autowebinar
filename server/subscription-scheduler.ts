import { db } from "./db";
import { admins, checkoutPlanos, checkoutPagamentos, checkoutAssinaturas } from "@shared/schema";
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
import { getAppUrl } from "./utils/getAppUrl";

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

/**
 * Calcula a data de expiração baseada no tipo do plano
 * Esta função é usada tanto nos webhooks quanto no sync scheduler
 * para garantir consistência no cálculo de expiração
 */
function calculateExpirationDate(plano: {
  tipoCobranca?: string;
  frequencia?: number;
  frequenciaTipo?: string;
  prazoDias?: number;
}, baseDate?: Date): Date {
  // Use provided base date (e.g., payment approval date) or current time
  // This ensures access is calculated from actual payment date, not discovery time
  const expirationDate = baseDate ? new Date(baseDate) : new Date();
  
  if (plano.tipoCobranca === 'recorrente') {
    // Para planos recorrentes: usar frequencia + frequenciaTipo
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
    } else {
      // Fallback para dias se tipo desconhecido
      expirationDate.setDate(expirationDate.getDate() + freq);
    }
  } else {
    // Para pagamentos únicos: usar prazoDias
    expirationDate.setDate(expirationDate.getDate() + (plano.prazoDias || 30));
  }
  
  return expirationDate;
}

// Exportar para uso nos webhooks
export { calculateExpirationDate };

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
      telefone: admins.telefone,
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
    
    // Check if user has an active recurring subscription (Stripe or Mercado Pago)
    // If they have active recurring billing, skip generating manual renewal PIX/Boleto
    // Include various active states: 'active', 'authorized', 'auto_renewal', 'pending' (payment being processed)
    const activeSubscription = await db
      .select()
      .from(checkoutAssinaturas)
      .where(
        and(
          eq(checkoutAssinaturas.adminId, admin.id),
          sql`${checkoutAssinaturas.status} IN ('active', 'authorized', 'auto_renewal', 'pending')`
        )
      )
      .limit(1);
    
    if (activeSubscription[0]) {
      console.log(`[subscription-scheduler] Skipping PIX/Boleto renewal for ${admin.email} - has active recurring subscription (gateway: ${activeSubscription[0].gateway}, status: ${activeSubscription[0].status})`);
      return false;
    }
    
    // Also check Stripe directly if user has any active subscription
    const stripeSecretKey = await storage.getCheckoutConfig('STRIPE_SECRET_KEY');
    if (stripeSecretKey) {
      try {
        const searchParams = new URLSearchParams({ query: `email:'${admin.email}'` });
        const searchResponse = await fetch(`https://api.stripe.com/v1/customers/search?${searchParams}`, {
          headers: { 'Authorization': `Bearer ${stripeSecretKey}` },
        });
        
        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          if (searchData.data && searchData.data.length > 0) {
            const customerId = searchData.data[0].id;
            
            // Check for active subscriptions
            const subsResponse = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active`, {
              headers: { 'Authorization': `Bearer ${stripeSecretKey}` },
            });
            
            if (subsResponse.ok) {
              const subsData = await subsResponse.json();
              if (subsData.data && subsData.data.length > 0) {
                console.log(`[subscription-scheduler] Skipping PIX/Boleto renewal for ${admin.email} - has active Stripe subscription (${subsData.data[0].id})`);
                return false;
              }
            }
          }
        }
      } catch (stripeError) {
        console.error('[subscription-scheduler] Error checking Stripe subscriptions:', stripeError);
        // Continue with PIX generation if Stripe check fails
      }
    }
    
    // Use Mercado Pago for PIX/Boleto renewals (checkout híbrido)
    const mpAccessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
    if (!mpAccessToken) {
      console.log('[subscription-scheduler] Mercado Pago not configured, skipping auto-renewal PIX/Boleto');
      return false;
    }
    
    // Also check Mercado Pago directly for active preapprovals (recurring subscriptions)
    try {
      const mpSearchResponse = await fetch(
        `https://api.mercadopago.com/preapproval/search?payer_email=${encodeURIComponent(admin.email)}&status=authorized`,
        { headers: { 'Authorization': `Bearer ${mpAccessToken}` } }
      );
      
      if (mpSearchResponse.ok) {
        const mpSearchData = await mpSearchResponse.json();
        if (mpSearchData.results && mpSearchData.results.length > 0) {
          console.log(`[subscription-scheduler] Skipping PIX/Boleto renewal for ${admin.email} - has active Mercado Pago subscription (${mpSearchData.results[0].id})`);
          return false;
        }
      }
    } catch (mpError) {
      console.error('[subscription-scheduler] Error checking Mercado Pago subscriptions:', mpError);
      // Continue with PIX generation if MP check fails
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

    // Amount in reais for Mercado Pago (not centavos)
    const amountInReais = Number(plan.preco) / 100;
    
    // Clean document number
    const docNumber = (userCpf || '').replace(/\D/g, '');
    const docType = docNumber.length === 14 ? 'CNPJ' : 'CPF';
    
    // Get webhook URL
    const baseUrl = getAppUrl();

    // Generate PIX via Mercado Pago
    try {
      const pixExpiresAt = new Date();
      pixExpiresAt.setMinutes(pixExpiresAt.getMinutes() + 30); // 30 minutes for PIX
      
      const pixPaymentRequest = {
        transaction_amount: amountInReais,
        description: `Renovação ${plan.nome}`,
        payment_method_id: 'pix',
        date_of_expiration: pixExpiresAt.toISOString(),
        external_reference: pagamento.id,
        notification_url: `${baseUrl}/webhook/mercadopago`,
        payer: {
          email: admin.email,
          first_name: (admin.name || 'Cliente').split(' ')[0],
          last_name: (admin.name || 'Cliente').split(' ').slice(1).join(' ') || '',
          identification: docNumber ? {
            type: docType,
            number: docNumber,
          } : undefined,
        },
      };

      console.log(`[subscription-scheduler] Creating PIX renewal for ${admin.email}:`, JSON.stringify(pixPaymentRequest, null, 2));

      const pixResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mpAccessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `${pagamento.id}-renewal-pix-${Date.now()}`,
        },
        body: JSON.stringify(pixPaymentRequest),
      });

      const pixData = await pixResponse.json();
      
      if (pixResponse.ok) {
        const pixQrCode = pixData.point_of_interaction?.transaction_data?.qr_code;
        const pixQrCodeBase64 = pixData.point_of_interaction?.transaction_data?.qr_code_base64;
        
        if (pixQrCode) {
          paymentData.pixCopiaCola = pixQrCode;
          paymentData.pixQrCode = pixQrCodeBase64 ? `data:image/png;base64,${pixQrCodeBase64}` : null;
          paymentData.pixExpiresAt = pixExpiresAt;
          console.log(`[subscription-scheduler] PIX renewal created for ${admin.email}, payment ID: ${pixData.id}`);
        }
      } else {
        console.error('[subscription-scheduler] MP PIX renewal failed:', pixData);
      }
    } catch (pixErr) {
      console.error('[subscription-scheduler] Error generating PIX renewal:', pixErr);
    }

    // Generate Boleto via Mercado Pago (only if CPF available)
    try {
      if (!docNumber || docNumber.length < 11) {
        console.log(`[subscription-scheduler] Skipping boleto for ${admin.email} - no CPF on record`);
      } else {
        const boletoExpiresAt = new Date();
        boletoExpiresAt.setDate(boletoExpiresAt.getDate() + 3); // 3 days for boleto

        const boletoPaymentRequest = {
          transaction_amount: amountInReais,
          description: `Renovação ${plan.nome}`,
          payment_method_id: 'bolbradesco',
          date_of_expiration: boletoExpiresAt.toISOString(),
          external_reference: pagamento.id,
          notification_url: `${baseUrl}/webhook/mercadopago`,
          payer: {
            email: admin.email,
            first_name: (admin.name || 'Cliente').split(' ')[0],
            last_name: (admin.name || 'Cliente').split(' ').slice(1).join(' ') || '',
            identification: {
              type: docType,
              number: docNumber,
            },
          },
        };

        console.log(`[subscription-scheduler] Creating Boleto renewal for ${admin.email}`);

        const boletoResponse = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${mpAccessToken}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `${pagamento.id}-renewal-boleto-${Date.now()}`,
          },
          body: JSON.stringify(boletoPaymentRequest),
        });

        const boletoData = await boletoResponse.json();

        if (boletoResponse.ok) {
          const boletoUrl = boletoData.transaction_details?.external_resource_url;
          const barcode = boletoData.barcode?.content;
          
          if (boletoUrl) {
            paymentData.boletoUrl = boletoUrl;
            paymentData.boletoCodigo = barcode || null;
            paymentData.boletoExpiresAt = boletoExpiresAt;
            console.log(`[subscription-scheduler] Boleto renewal created for ${admin.email}, payment ID: ${boletoData.id}`);
          }
        } else {
          console.error('[subscription-scheduler] MP Boleto renewal failed:', boletoData);
        }
      }
    } catch (boletoErr) {
      console.error('[subscription-scheduler] Error generating Boleto renewal:', boletoErr);
    }

    await storage.updateCheckoutPagamento(pagamento.id, {
      pixQrCode: paymentData.pixQrCode,
      pixCopiaCola: paymentData.pixCopiaCola,
      pixExpiresAt: paymentData.pixExpiresAt,
      boletoUrl: paymentData.boletoUrl,
      boletoCodigo: paymentData.boletoCodigo,
      boletoExpiresAt: paymentData.boletoExpiresAt,
    });

    // Generate checkout URL for users to complete payment manually
    const checkoutParams = new URLSearchParams({
      email: admin.email,
      nome: admin.name || 'Cliente',
      renovacao: 'true'
    });
    if (admin.telefone) {
      checkoutParams.set('telefone', admin.telefone);
    }
    const checkoutUrl = `${getAppUrl()}/checkout/${plan.id}?${checkoutParams.toString()}`;

    // Always send email - with PIX/Boleto if available, or checkout link as fallback
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
      paymentData.boletoExpiresAt,
      checkoutUrl
    );
    
    if (paymentData.pixCopiaCola || paymentData.boletoUrl) {
      console.log(`[subscription-scheduler] Sent auto-renewal email with MP PIX/Boleto to ${admin.email}`);
    } else {
      console.log(`[subscription-scheduler] Sent auto-renewal email with checkout link to ${admin.email}`);
    }
    return true;
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
        admin.accessExpiresAt!,
        admin.planoId,
        admin.telefone
      );
      
      // Enviar WhatsApp também
      const whatsappSuccess = await sendWhatsAppExpirationReminderSafe(
        admin.telefone,
        admin.name || "Cliente",
        planName,
        0,
        admin.accessExpiresAt!,
        admin.email,
        admin.planoId,
        admin.telefone
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
        planName,
        admin.planoId,
        admin.telefone
      );
      
      // Enviar WhatsApp também
      const whatsappSuccess = await sendWhatsAppPlanExpiredSafe(
        admin.telefone,
        admin.name || "Cliente",
        planName,
        admin.email,
        admin.planoId
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
        admin.accessExpiresAt!,
        admin.planoId,
        admin.telefone
      );
      
      // Enviar WhatsApp também
      const whatsappSuccess = await sendWhatsAppExpirationReminderSafe(
        admin.telefone,
        admin.name || "Cliente",
        planName,
        3,
        admin.accessExpiresAt!,
        admin.email,
        admin.planoId,
        admin.telefone
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
        admin.accessExpiresAt!,
        admin.planoId,
        admin.telefone
      );
      
      // Enviar WhatsApp também
      const whatsappSuccess = await sendWhatsAppExpirationReminderSafe(
        admin.telefone,
        admin.name || "Cliente",
        planName,
        1,
        admin.accessExpiresAt!,
        admin.email,
        admin.planoId,
        admin.telefone
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
          planName,
          admin.planoId,
          admin.telefone
        );
        
        // Enviar WhatsApp também
        const whatsappSuccess = await sendWhatsAppPlanExpiredSafe(
          admin.telefone,
          admin.name || "Cliente",
          planName,
          admin.email,
          admin.planoId
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
        cpf: checkoutPagamentos.cpf,
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
        payment.planoId,
        payment.email,
        payment.cpf
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

    // Get all MP payments that are NOT yet approved (need sync) OR active subscriptions to monitor
    // Include checkout_iniciado, pending, authorized, in_process, paused - anything that might need correction
    const allPagamentos = await db.select().from(checkoutPagamentos)
      .where(sql`${checkoutPagamentos.mercadopagoPaymentId} IS NOT NULL AND ${checkoutPagamentos.status} IN ('approved', 'pending', 'authorized', 'checkout_iniciado', 'in_process', 'paused', 'auto_renewal')`)
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

        if (mpStatus === 'paused' || mpStatus === 'cancelled' || mpStatus === 'pending') {
          // Mark as expired but keep isActive=true so user can login and see renewal screen
          // Frontend will block tool access based on accessExpiresAt and paymentStatus
          if (admin && admin.paymentStatus !== mpStatus) {
            const wasBlocked = admin.accessExpiresAt && new Date(admin.accessExpiresAt) <= new Date();
            await storage.updateAdmin(admin.id, {
              // Keep isActive: true - so user can login and see renewal screen
              paymentStatus: mpStatus,
              accessExpiresAt: new Date(), // Set expiration to now - frontend blocks tool access
            });
            if (!wasBlocked) {
              deactivated++;
            }
            console.log(`[subscription-scheduler] Marked expired for ${pagamento.email} - MP status: ${mpStatus} (isActive stays true, login works)`);
          }

          if (pagamento.status !== mpStatus && pagamento.status !== 'cancelled') {
            const newLocalStatus = mpStatus === 'cancelled' ? 'cancelled' : (mpStatus === 'paused' ? 'paused' : 'pending');
            await storage.updateCheckoutPagamento(pagamento.id, {
              status: newLocalStatus,
              statusDetail: `Assinatura ${mpStatus} (auto-sync)`,
            });
          }
        } else if (mpStatus === 'authorized') {
          // Check if there are actual payments
          let hasPayment = false;
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
              hasPayment = approvedPayments.length > 0;
              if (hasPayment) {
                latestApprovedPayment = approvedPayments[approvedPayments.length - 1];
              }
            }
          } catch {}

          if (hasPayment) {
            const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
            if (plano) {
              // Get actual payment date from MP
              const realPaymentDate = latestApprovedPayment?.date_created 
                ? new Date(latestApprovedPayment.date_created) 
                : new Date();
              const realApprovalDate = latestApprovedPayment?.date_approved 
                ? new Date(latestApprovedPayment.date_approved) 
                : realPaymentDate;

              // Get current admin access to determine correct base for extension
              const currentAccess = admin?.accessExpiresAt ? new Date(admin.accessExpiresAt) : null;
              
              // Calculate base: extend from max(currentAccess, approvalDate)
              // This ensures we never shrink access and always add to existing entitlement
              const extensionBase = currentAccess && currentAccess > realApprovalDate 
                ? currentAccess 
                : realApprovalDate;
              
              // Calculate expiration from the correct base
              const finalExpiration = calculateExpirationDate(plano, extensionBase);

              // Update payment status to approved if it wasn't already
              if (pagamento.status !== 'approved') {
                await storage.updateCheckoutPagamento(pagamento.id, {
                  status: 'approved',
                  statusDetail: 'Assinatura ativa - pagamento confirmado (auto-sync)',
                  dataPagamento: realPaymentDate,
                  dataAprovacao: realApprovalDate,
                  dataExpiracao: finalExpiration,
                });
                console.log(`[subscription-scheduler] Auto-approved payment for ${pagamento.email}, base: ${extensionBase.toISOString()}, expires: ${finalExpiration.toISOString()}`);
              }

              // Only update admin if they need activation OR if this extends their access
              const needsUpdate = admin && (
                !admin.isActive || 
                admin.paymentStatus !== 'ok' ||
                !currentAccess ||
                currentAccess < finalExpiration // Only extend if new expiration is later
              );
              
              if (needsUpdate) {
                await storage.updateAdmin(admin.id, {
                  isActive: true,
                  paymentStatus: 'ok',
                  paymentFailedReason: null,
                  accessExpiresAt: finalExpiration,
                  planoId: plano.id,
                });
                reactivated++;
                console.log(`[subscription-scheduler] Auto-reactivated ${pagamento.email}, new expiration: ${finalExpiration.toISOString()}`);
              }
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

// Sync Stripe payment statuses with local database
// This recovers payments that may have been missed by webhooks
async function syncStripePayments(): Promise<void> {
  console.log("[subscription-scheduler] Starting Stripe payment sync");
  
  try {
    const stripeSecretKey = await storage.getCheckoutConfig('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.log("[subscription-scheduler] Stripe not configured, skipping sync");
      return;
    }

    // Get pending Stripe payments that might have been paid but webhook missed
    // Look for recent payments (created in the last 48 hours) that are still pending
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    const pendingPayments = await db.select().from(checkoutPagamentos)
      .where(
        and(
          sql`(${checkoutPagamentos.stripePaymentIntentId} IS NOT NULL OR ${checkoutPagamentos.stripeSubscriptionId} IS NOT NULL)`,
          sql`${checkoutPagamentos.status} IN ('pending', 'checkout_iniciado', 'in_process', 'processing')`,
          sql`${checkoutPagamentos.criadoEm} > ${twoDaysAgo.toISOString()}`
        )
      )
      .orderBy(sql`${checkoutPagamentos.criadoEm} DESC`)
      .limit(50); // Limit to avoid rate limiting

    let synced = 0;
    let updated = 0;

    for (const pagamento of pendingPayments) {
      try {
        // Check PaymentIntent status if available
        if (pagamento.stripePaymentIntentId) {
          const piResponse = await fetch(
            `https://api.stripe.com/v1/payment_intents/${pagamento.stripePaymentIntentId}`,
            {
              headers: { 'Authorization': `Bearer ${stripeSecretKey}` },
            }
          );
          
          if (piResponse.ok) {
            const paymentIntent = await piResponse.json();
            
            if (paymentIntent.status === 'succeeded' && pagamento.status !== 'approved') {
              // Payment was successful but webhook missed it!
              const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
              if (plano) {
                // Get actual payment date from Stripe
                const paymentDate = paymentIntent.created 
                  ? new Date(paymentIntent.created * 1000) 
                  : new Date();
                
                // Get admin to check current access
                const admin = await storage.getAdminByEmail(pagamento.email);
                const currentAccess = admin?.accessExpiresAt ? new Date(admin.accessExpiresAt) : null;
                
                // Calculate base: extend from max(currentAccess, paymentDate)
                // This ensures we never shrink access and always add to existing entitlement
                const extensionBase = currentAccess && currentAccess > paymentDate 
                  ? currentAccess 
                  : paymentDate;
                
                // Calculate expiration from the correct base
                const finalExpiration = calculateExpirationDate(plano, extensionBase);
                
                await storage.updateCheckoutPagamento(pagamento.id, {
                  status: 'approved',
                  statusDetail: 'Pagamento confirmado (auto-sync)',
                  dataPagamento: paymentDate,
                  dataAprovacao: paymentDate,
                  dataExpiracao: finalExpiration,
                });
                
                // Only update admin if they need activation OR if this extends their access
                if (admin && (
                  !admin.isActive || 
                  admin.paymentStatus !== 'ok' ||
                  !currentAccess ||
                  currentAccess < finalExpiration // Only extend if new expiration is later
                )) {
                  await storage.updateAdmin(admin.id, {
                    accessExpiresAt: finalExpiration,
                    webinarLimit: plano.webinarLimit,
                    uploadLimit: plano.uploadLimit || plano.webinarLimit,
                    isActive: true,
                    planoId: plano.id,
                    paymentStatus: 'ok',
                    paymentFailedReason: null,
                  });
                  updated++;
                  console.log(`[subscription-scheduler] Stripe auto-sync: Extended access for ${pagamento.email}, base: ${extensionBase.toISOString()}, expires: ${finalExpiration.toISOString()}`);
                }
              }
            } else if (paymentIntent.status === 'canceled' || paymentIntent.status === 'failed') {
              // Mark as failed/cancelled
              if (pagamento.status !== 'cancelled' && pagamento.status !== 'rejected') {
                await storage.updateCheckoutPagamento(pagamento.id, {
                  status: paymentIntent.status === 'canceled' ? 'cancelled' : 'rejected',
                  statusDetail: `Pagamento ${paymentIntent.status} (auto-sync)`,
                });
              }
            }
          }
        }
        
        synced++;
        
        // Small delay to avoid rate limiting
        if (synced % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        // Silent fail for individual payments, continue processing others
        console.error(`[subscription-scheduler] Error syncing Stripe payment ${pagamento.id}:`, err);
      }
    }

    if (synced > 0 || updated > 0) {
      console.log(`[subscription-scheduler] Stripe sync complete: ${synced} checked, ${updated} updated`);
    }
  } catch (error) {
    console.error("[subscription-scheduler] Error syncing Stripe payments:", error);
  }
}

// Sync active Stripe subscriptions - catches renewal payments when webhooks miss
// This is critical for recurring card payments that auto-renew
async function syncStripeActiveSubscriptions(): Promise<void> {
  console.log("[subscription-scheduler] Syncing active Stripe subscriptions");
  
  try {
    const stripeSecretKey = await storage.getCheckoutConfig('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.log("[subscription-scheduler] Stripe not configured, skipping subscription sync");
      return;
    }

    // Find all approved payments with stripeSubscriptionId (active recurring subscriptions)
    const activeSubscriptions = await db.select().from(checkoutPagamentos)
      .where(
        and(
          sql`${checkoutPagamentos.stripeSubscriptionId} IS NOT NULL`,
          sql`${checkoutPagamentos.status} = 'approved'`,
          sql`${checkoutPagamentos.adminId} IS NOT NULL`
        )
      )
      .orderBy(sql`${checkoutPagamentos.criadoEm} DESC`)
      .limit(100);

    let checked = 0;
    let renewed = 0;

    for (const pagamento of activeSubscriptions) {
      try {
        // Get subscription details from Stripe
        const subResponse = await fetch(
          `https://api.stripe.com/v1/subscriptions/${pagamento.stripeSubscriptionId}`,
          {
            headers: { 'Authorization': `Bearer ${stripeSecretKey}` },
          }
        );

        if (!subResponse.ok) continue;

        const subscription = await subResponse.json();
        
        // Skip cancelled/inactive subscriptions
        if (subscription.status !== 'active' && subscription.status !== 'trialing') {
          continue;
        }

        // Get latest paid invoice for this subscription
        const invoicesResponse = await fetch(
          `https://api.stripe.com/v1/invoices?subscription=${pagamento.stripeSubscriptionId}&status=paid&limit=5`,
          {
            headers: { 'Authorization': `Bearer ${stripeSecretKey}` },
          }
        );

        if (!invoicesResponse.ok) continue;

        const invoicesData = await invoicesResponse.json();
        const paidInvoices = invoicesData.data || [];

        if (paidInvoices.length === 0) continue;

        // Get the most recent paid invoice
        const latestInvoice = paidInvoices[0];
        const invoicePaidAt = new Date(latestInvoice.status_transitions?.paid_at * 1000 || latestInvoice.created * 1000);

        // Get the admin to check their current access
        const admin = await storage.getAdminById(pagamento.adminId!);
        if (!admin) continue;

        const currentAccess = admin.accessExpiresAt ? new Date(admin.accessExpiresAt) : null;

        // If the latest invoice was paid AFTER the admin's access was last set,
        // we might have missed a webhook - extend their access
        if (currentAccess && invoicePaidAt > new Date(pagamento.dataAprovacao || 0)) {
          // Check if we already processed this invoice
          const invoiceDate = invoicePaidAt.toISOString().split('T')[0];
          const lastApprovalDate = pagamento.dataAprovacao ? new Date(pagamento.dataAprovacao).toISOString().split('T')[0] : null;
          
          // If invoice is from a different day than the original approval, it's likely a renewal
          if (invoiceDate !== lastApprovalDate) {
            const plano = await storage.getCheckoutPlanoById(pagamento.planoId);
            if (!plano) continue;

            // Calculate new expiration from the invoice paid date
            const extensionBase = currentAccess && currentAccess > invoicePaidAt 
              ? currentAccess 
              : invoicePaidAt;
            const newExpiration = calculateExpirationDate(plano, extensionBase);

            // Only update if this extends their access
            if (!currentAccess || newExpiration > currentAccess) {
              await storage.updateAdmin(admin.id, {
                accessExpiresAt: newExpiration,
                isActive: true,
                paymentStatus: 'ok',
                paymentFailedReason: null,
              });

              // Update the payment record with latest payment date
              await storage.updateCheckoutPagamento(pagamento.id, {
                dataAprovacao: invoicePaidAt,
                dataPagamento: invoicePaidAt,
                dataExpiracao: newExpiration,
                statusDetail: `Renovação automática Stripe (sync ${invoiceDate})`,
              });

              renewed++;
              console.log(`[subscription-scheduler] Stripe subscription renewal synced for ${admin.email}: invoice ${latestInvoice.id}, new expiration: ${newExpiration.toISOString()}`);
            }
          }
        }

        checked++;

        // Rate limiting
        if (checked % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (err) {
        console.error(`[subscription-scheduler] Error syncing subscription ${pagamento.stripeSubscriptionId}:`, err);
      }
    }

    if (checked > 0 || renewed > 0) {
      console.log(`[subscription-scheduler] Stripe subscription sync: ${checked} checked, ${renewed} renewals processed`);
    }
  } catch (error) {
    console.error("[subscription-scheduler] Error syncing Stripe subscriptions:", error);
  }
}

// Combined sync function that runs both payment syncs
async function runPaymentSync(): Promise<void> {
  await syncStripePayments();
  await syncStripeActiveSubscriptions(); // Check active subscriptions for missed renewals
  await syncMercadoPagoSubscriptions();
}

// Intervalo de sync de pagamentos (30 minutos para recuperar webhooks perdidos rapidamente)
const PAYMENT_SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos

export function startSubscriptionScheduler(): void {
  if (schedulerInterval) {
    console.log("[subscription-scheduler] Scheduler already running");
    return;
  }

  console.log("[subscription-scheduler] Starting subscription scheduler");
  
  // Run expiration reminders after 5 seconds, then every hour
  setTimeout(() => {
    processExpirationReminders();
  }, 5000);
  schedulerInterval = setInterval(processExpirationReminders, SCHEDULER_INTERVAL_MS);
  
  // Run payment sync (Stripe + MP) after 2 minutes, then every 30 minutes
  // More frequent sync ensures webhooks failures are recovered quickly
  // especially important for daily plans
  setTimeout(() => {
    runPaymentSync();
  }, 120000); // First run after 2 minutes
  
  setInterval(() => {
    runPaymentSync();
  }, PAYMENT_SYNC_INTERVAL_MS); // Then every 30 minutes
  
  console.log("[subscription-scheduler] Payment sync scheduled every 30 minutes");
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
