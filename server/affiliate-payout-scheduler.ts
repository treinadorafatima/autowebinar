import { storage } from "./storage";
import type { AffiliateSale, Affiliate } from "@shared/schema";

const SCHEDULER_INTERVAL_MS = 3600000; // Check every hour
let schedulerInterval: NodeJS.Timeout | null = null;

type PaymentVerificationResult = {
  status: 'valid' | 'refunded' | 'api_error';
  reason?: string;
};

/**
 * Verifica se pagamento do MercadoPago foi reembolsado
 * Retorna 'valid' se aprovado, 'refunded' se reembolsado/cancelado, 'api_error' se falha de API
 */
async function verifyMercadoPagoPaymentNotRefunded(mpPaymentId: string, accessToken: string): Promise<PaymentVerificationResult> {
  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[payout-scheduler] API error fetching MP payment ${mpPaymentId}:`, errorText);
      return { status: 'api_error', reason: `HTTP ${response.status}: ${errorText}` };
    }

    const payment = await response.json();
    
    if (payment.status === 'refunded' || payment.status === 'cancelled' || payment.status === 'charged_back') {
      console.log(`[payout-scheduler] MP payment ${mpPaymentId} was refunded/cancelled/chargeback - status: ${payment.status}`);
      return { status: 'refunded', reason: payment.status };
    }

    if (payment.status !== 'approved') {
      console.log(`[payout-scheduler] MP payment ${mpPaymentId} is not approved - status: ${payment.status}`);
      return { status: 'api_error', reason: `Payment status: ${payment.status}` };
    }

    return { status: 'valid' };
  } catch (error: any) {
    console.error(`[payout-scheduler] Network error verifying MP payment ${mpPaymentId}:`, error);
    return { status: 'api_error', reason: error.message };
  }
}

/**
 * Verifica se pagamento do Stripe foi reembolsado
 * Retorna 'valid' se aprovado, 'refunded' se reembolsado/cancelado, 'api_error' se falha de API
 */
async function verifyStripePaymentNotRefunded(stripePaymentIntentId: string, stripeSecretKey: string): Promise<PaymentVerificationResult> {
  try {
    const response = await fetch(`https://api.stripe.com/v1/payment_intents/${stripePaymentIntentId}`, {
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[payout-scheduler] API error fetching Stripe payment ${stripePaymentIntentId}:`, errorText);
      return { status: 'api_error', reason: `HTTP ${response.status}: ${errorText}` };
    }

    const paymentIntent = await response.json();
    
    if (paymentIntent.status === 'canceled') {
      console.log(`[payout-scheduler] Stripe payment ${stripePaymentIntentId} was cancelled`);
      return { status: 'refunded', reason: 'canceled' };
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
          return { status: 'refunded', reason: 'refunded' };
        }
      }
    } else {
      const errorText = await chargesResponse.text();
      console.error(`[payout-scheduler] API error fetching Stripe charges:`, errorText);
      return { status: 'api_error', reason: `Charges fetch failed: ${errorText}` };
    }

    if (paymentIntent.status === 'succeeded') {
      return { status: 'valid' };
    }
    
    return { status: 'api_error', reason: `Payment status: ${paymentIntent.status}` };
  } catch (error: any) {
    console.error(`[payout-scheduler] Network error verifying Stripe payment ${stripePaymentIntentId}:`, error);
    return { status: 'api_error', reason: error.message };
  }
}

/**
 * Processa vendas que atingiram o hold period e marca como disponíveis para saque
 * Também verifica se houve reembolso antes de liberar
 * Trata falhas de API como soft failures (retry na próxima execução)
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
    let verificationResult: PaymentVerificationResult = { status: 'valid' };

    if (sale.mpPaymentId) {
      const accessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
      if (accessToken) {
        verificationResult = await verifyMercadoPagoPaymentNotRefunded(sale.mpPaymentId, accessToken);
      }
    } else if (sale.stripePaymentIntentId) {
      const stripeSecretKey = await storage.getCheckoutConfig('STRIPE_SECRET_KEY');
      if (stripeSecretKey) {
        verificationResult = await verifyStripePaymentNotRefunded(sale.stripePaymentIntentId, stripeSecretKey);
      }
    }

    // Se houve erro de API, pular esta venda e tentar novamente na próxima execução
    if (verificationResult.status === 'api_error') {
      console.log(`[payout-scheduler] API error for sale ${sale.id} - will retry later: ${verificationResult.reason}`);
      return;
    }

    // Se pagamento foi explicitamente reembolsado/cancelado
    if (verificationResult.status === 'refunded') {
      console.log(`[payout-scheduler] Payment was refunded - marking sale as refunded: ${verificationResult.reason}`);
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
    // Nota: não sobrescrevemos availableAt pois ele serve como data de elegibilidade prevista
    // O campo updatedAt registra quando a venda foi realmente liberada
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
