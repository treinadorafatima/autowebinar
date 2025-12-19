import { db } from "./db";
import { checkoutPagamentos, checkoutPlanos } from "@shared/schema";
import { eq, and, lte, isNull, or } from "drizzle-orm";
import { sendPixExpiredRecoveryEmail } from "./email";
import { sendWhatsAppPaymentRecoverySafe } from "./whatsapp-notifications";

const SCHEDULER_INTERVAL_MS = 300000; // Check every 5 minutes
let schedulerInterval: NodeJS.Timeout | null = null;

interface ExpiredPixPayment {
  id: string;
  email: string;
  nome: string;
  telefone: string | null;
  planoId: string;
  valor: number;
  pixExpiresAt: Date;
  pixExpiredEmailSent: boolean | null;
}

async function getExpiredPixPayments(): Promise<ExpiredPixPayment[]> {
  const now = new Date();
  
  const results = await db
    .select({
      id: checkoutPagamentos.id,
      email: checkoutPagamentos.email,
      nome: checkoutPagamentos.nome,
      telefone: checkoutPagamentos.telefone,
      planoId: checkoutPagamentos.planoId,
      valor: checkoutPagamentos.valor,
      pixExpiresAt: checkoutPagamentos.pixExpiresAt,
      pixExpiredEmailSent: checkoutPagamentos.pixExpiredEmailSent,
    })
    .from(checkoutPagamentos)
    .where(
      and(
        eq(checkoutPagamentos.metodoPagamento, 'pix'),
        eq(checkoutPagamentos.status, 'pending'),
        lte(checkoutPagamentos.pixExpiresAt, now),
        or(
          isNull(checkoutPagamentos.pixExpiredEmailSent),
          eq(checkoutPagamentos.pixExpiredEmailSent, false)
        )
      )
    );
  
  return results.filter(r => r.pixExpiresAt !== null) as ExpiredPixPayment[];
}

async function getPlanName(planoId: string): Promise<string> {
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

async function markExpiredEmailSent(pagamentoId: string): Promise<void> {
  try {
    // Use conditional update to prevent race condition with webhook
    // Only mark as expired if status is still 'pending'
    await db
      .update(checkoutPagamentos)
      .set({ 
        pixExpiredEmailSent: true,
        status: 'expired',
        statusDetail: 'PIX expirado'
      })
      .where(
        and(
          eq(checkoutPagamentos.id, pagamentoId),
          eq(checkoutPagamentos.status, 'pending')
        )
      );
  } catch (error) {
    console.error(`[pix-expiration-scheduler] Error marking email sent for ${pagamentoId}:`, error);
  }
}

async function processExpiredPixPayments(): Promise<void> {
  try {
    const expiredPayments = await getExpiredPixPayments();
    
    if (expiredPayments.length === 0) {
      return;
    }

    console.log(`[pix-expiration-scheduler] Found ${expiredPayments.length} expired PIX payments`);

    for (const payment of expiredPayments) {
      try {
        const planName = await getPlanName(payment.planoId);
        
        console.log(`[pix-expiration-scheduler] Sending recovery email to ${payment.email} for plan ${planName}`);
        
        const emailSent = await sendPixExpiredRecoveryEmail(
          payment.email,
          payment.nome,
          planName,
          payment.planoId,
          payment.valor
        );

        // Enviar WhatsApp também (não bloqueia se falhar)
        const whatsappSent = await sendWhatsAppPaymentRecoverySafe(
          payment.telefone,
          payment.nome,
          planName,
          payment.planoId,
          payment.valor
        );

        if (emailSent || whatsappSent) {
          await markExpiredEmailSent(payment.id);
          console.log(`[pix-expiration-scheduler] Recovery sent to ${payment.email} - Email: ${emailSent}, WhatsApp: ${whatsappSent}`);
        } else {
          console.error(`[pix-expiration-scheduler] Failed to send recovery to ${payment.email}`);
        }
      } catch (error) {
        console.error(`[pix-expiration-scheduler] Error processing payment ${payment.id}:`, error);
      }
    }
  } catch (error) {
    console.error("[pix-expiration-scheduler] Error processing expired PIX payments:", error);
  }
}

export function startPixExpirationScheduler(): void {
  if (schedulerInterval) {
    console.log("[pix-expiration-scheduler] Scheduler already running");
    return;
  }

  console.log("[pix-expiration-scheduler] Starting PIX expiration scheduler");
  
  // Run immediately on start
  processExpiredPixPayments().catch(err => {
    console.error("[pix-expiration-scheduler] Initial run failed:", err);
  });
  
  // Schedule periodic checks
  schedulerInterval = setInterval(() => {
    processExpiredPixPayments().catch(err => {
      console.error("[pix-expiration-scheduler] Scheduled run failed:", err);
    });
  }, SCHEDULER_INTERVAL_MS);
}

export function stopPixExpirationScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[pix-expiration-scheduler] Scheduler stopped");
  }
}

export async function getPixExpirationSchedulerStatus(): Promise<{
  isRunning: boolean;
  pendingCount: number;
}> {
  try {
    const expiredPayments = await getExpiredPixPayments();
    
    return {
      isRunning: schedulerInterval !== null,
      pendingCount: expiredPayments.length
    };
  } catch (error) {
    console.error("[pix-expiration-scheduler] Error getting status:", error);
    return {
      isRunning: schedulerInterval !== null,
      pendingCount: 0
    };
  }
}
