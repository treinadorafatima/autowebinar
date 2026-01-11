import { storage } from "./storage";
import type { AffiliateSale, Affiliate } from "@shared/schema";

const SCHEDULER_INTERVAL_MS = 3600000; // Check every hour
let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Verifica se pagamento do MercadoPago foi reembolsado
 */
async function verifyMercadoPagoPaymentNotRefunded(mpPaymentId: string, accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error(`[payout-scheduler] Error fetching MP payment ${mpPaymentId}:`, await response.text());
      return false;
    }

    const payment = await response.json();
    
    if (payment.status === 'refunded' || payment.status === 'cancelled' || payment.status === 'charged_back') {
      console.log(`[payout-scheduler] MP payment ${mpPaymentId} was refunded/cancelled/chargeback - status: ${payment.status}`);
      return false;
    }

    if (payment.status !== 'approved') {
      console.log(`[payout-scheduler] MP payment ${mpPaymentId} is not approved - status: ${payment.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[payout-scheduler] Error verifying MP payment ${mpPaymentId}:`, error);
    return false;
  }
}

/**
 * Verifica se pagamento do Stripe foi reembolsado
 */
async function verifyStripePaymentNotRefunded(stripePaymentIntentId: string, stripeSecretKey: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.stripe.com/v1/payment_intents/${stripePaymentIntentId}`, {
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
      },
    });

    if (!response.ok) {
      console.error(`[payout-scheduler] Error fetching Stripe payment ${stripePaymentIntentId}:`, await response.text());
      return false;
    }

    const paymentIntent = await response.json();
    
    if (paymentIntent.status === 'canceled') {
      console.log(`[payout-scheduler] Stripe payment ${stripePaymentIntentId} was cancelled`);
      return false;
    }

    const chargesResponse = await fetch(`https://api.stripe.com/v1/charges?payment_intent=${stripePaymentIntentId}`, {
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
      },
    });

    if (chargesResponse.ok) {
      const charges = await chargesResponse.json();
      for (const charge of charges.data) {
        if (charge.refunded || charge.amount_refunded > 0) {
          console.log(`[payout-scheduler] Stripe payment ${stripePaymentIntentId} was refunded`);
          return false;
        }
      }
    }

    return paymentIntent.status === 'succeeded';
  } catch (error) {
    console.error(`[payout-scheduler] Error verifying Stripe payment ${stripePaymentIntentId}:`, error);
    return false;
  }
}

/**
 * Processa vendas que atingiram o hold period e marca como disponíveis para saque
 * Também verifica se houve reembolso antes de liberar
 */
async function processSaleAvailability(sale: AffiliateSale): Promise<void> {
  try {
    console.log(`[payout-scheduler] Processing availability for sale ${sale.id}`);

    const affiliate = await storage.getAffiliateById(sale.affiliateId);
    if (!affiliate) {
      console.error(`[payout-scheduler] Affiliate not found: ${sale.affiliateId}`);
      return;
    }

    if (affiliate.status !== 'active') {
      console.log(`[payout-scheduler] Affiliate ${affiliate.id} is not active - status: ${affiliate.status}`);
      return;
    }

    // Verificar se pagamento foi reembolsado antes de liberar
    let isPaymentValid = true;

    if (sale.mpPaymentId) {
      const accessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
      if (accessToken) {
        isPaymentValid = await verifyMercadoPagoPaymentNotRefunded(sale.mpPaymentId, accessToken);
      }
    } else if (sale.stripePaymentIntentId) {
      const stripeSecretKey = await storage.getCheckoutConfig('STRIPE_SECRET_KEY');
      if (stripeSecretKey) {
        isPaymentValid = await verifyStripePaymentNotRefunded(sale.stripePaymentIntentId, stripeSecretKey);
      }
    }

    if (!isPaymentValid) {
      console.log(`[payout-scheduler] Payment was refunded - marking sale as refunded`);
      await storage.updateAffiliateSale(sale.id, {
        status: 'refunded',
      });
      
      // Remover do saldo pendente
      const newPendingAmount = Math.max(0, (affiliate.pendingAmount || 0) - sale.commissionAmount);
      const newTotalEarnings = Math.max(0, (affiliate.totalEarnings || 0) - sale.commissionAmount);
      await storage.updateAffiliate(affiliate.id, {
        pendingAmount: newPendingAmount,
        totalEarnings: newTotalEarnings,
      });
      return;
    }

    // Pagamento válido - marcar como disponível para saque
    await storage.updateAffiliateSale(sale.id, {
      status: 'available',
    });

    // Mover de pendente para disponível no saldo do afiliado
    const newPendingAmount = Math.max(0, (affiliate.pendingAmount || 0) - sale.commissionAmount);
    const newAvailableAmount = (affiliate.availableAmount || 0) + sale.commissionAmount;
    await storage.updateAffiliate(affiliate.id, {
      pendingAmount: newPendingAmount,
      availableAmount: newAvailableAmount,
    });

    console.log(`[payout-scheduler] Sale ${sale.id} marked as available for withdrawal`);
  } catch (error: any) {
    console.error(`[payout-scheduler] Error processing availability for sale ${sale.id}:`, error);
  }
}

/**
 * Processa todas as vendas que atingiram o hold period
 */
async function processAvailabilitySales(): Promise<void> {
  console.log(`[payout-scheduler] Running availability check at ${new Date().toISOString()}`);

  try {
    const pendingSales = await storage.listSalesReadyForAvailability();
    console.log(`[payout-scheduler] Found ${pendingSales.length} sales ready for availability`);

    for (const sale of pendingSales) {
      await processSaleAvailability(sale);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (pendingSales.length > 0) {
      console.log(`[payout-scheduler] Availability processing completed`);
    }
  } catch (error) {
    console.error("[payout-scheduler] Error processing availability:", error);
  }
}

export function startAffiliatePayoutScheduler(): void {
  if (schedulerInterval) {
    console.log("[payout-scheduler] Scheduler already running");
    return;
  }

  console.log("[payout-scheduler] Starting affiliate payout scheduler");

  // Run first check after 10 seconds
  setTimeout(() => {
    processAvailabilitySales();
  }, 10000);

  // Then run every hour
  schedulerInterval = setInterval(processAvailabilitySales, SCHEDULER_INTERVAL_MS);
}

export function stopAffiliatePayoutScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[payout-scheduler] Affiliate payout scheduler stopped");
  }
}

export async function getAffiliatePayoutSchedulerStatus(): Promise<{
  isRunning: boolean;
  nextRunIn: string;
}> {
  const nextRunMinutes = schedulerInterval ? Math.round(SCHEDULER_INTERVAL_MS / 60000) : 0;

  return {
    isRunning: schedulerInterval !== null,
    nextRunIn: `${nextRunMinutes} minutos`
  };
}

/**
 * Processa manualmente vendas pendentes de disponibilidade
 */
export async function manualProcessAvailability(): Promise<{ processed: number; errors: string[] }> {
  console.log(`[payout-scheduler] Manual availability processing triggered`);
  
  const errors: string[] = [];
  let processed = 0;

  try {
    const pendingSales = await storage.listSalesReadyForAvailability();
    
    for (const sale of pendingSales) {
      try {
        await processSaleAvailability(sale);
        processed++;
      } catch (error: any) {
        errors.push(`Sale ${sale.id}: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  } catch (error: any) {
    errors.push(error.message);
  }

  return { processed, errors };
}
