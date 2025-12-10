import { storage } from "./storage";
import type { AffiliateSale, Affiliate, AffiliateConfig } from "@shared/schema";

const SCHEDULER_INTERVAL_MS = 3600000; // Check every hour
const MAX_PAYOUT_ATTEMPTS = 5;
let schedulerInterval: NodeJS.Timeout | null = null;

interface PayoutResult {
  success: boolean;
  transferId?: string;
  error?: string;
}

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

async function processMercadoPagoTransfer(
  sale: AffiliateSale, 
  affiliate: Affiliate, 
  accessToken: string
): Promise<PayoutResult> {
  try {
    if (!affiliate.mpUserId) {
      return { success: false, error: 'Afiliado não possui conta MercadoPago conectada' };
    }

    const amountInReais = sale.commissionAmount / 100;

    // Use MercadoPago Send Money API
    // Note: This endpoint requires specific permissions. If it fails, manual transfer is required.
    const transferBody = {
      amount: amountInReais,
      collector_id: parseInt(affiliate.mpUserId),
      external_reference: `aff_sale_${sale.id}`,
    };

    console.log(`[payout-scheduler] Creating MP transfer:`, JSON.stringify(transferBody));

    // Try the account movements endpoint first
    const transferResponse = await fetch('https://api.mercadopago.com/v1/account/send-money', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `payout_${sale.id}_${sale.payoutAttempts || 0}`,
      },
      body: JSON.stringify(transferBody),
    });

    if (!transferResponse.ok) {
      const errorData = await transferResponse.json().catch(() => ({ message: 'Unknown error' }));
      console.error(`[payout-scheduler] MP transfer failed (${transferResponse.status}):`, errorData);
      
      // Provide clear message for permission/endpoint issues
      if (transferResponse.status === 401 || transferResponse.status === 403) {
        return { 
          success: false, 
          error: 'Credenciais MercadoPago não possuem permissão para transferências - requer pagamento manual' 
        };
      }
      
      if (transferResponse.status === 404) {
        return { 
          success: false, 
          error: 'API de transferência MercadoPago não disponível para esta conta - requer pagamento manual' 
        };
      }
      
      if (transferResponse.status === 400 && errorData.cause) {
        const causeDescription = errorData.cause.map((c: any) => c.description || c.code).join(', ');
        return { 
          success: false, 
          error: `Erro MercadoPago: ${causeDescription}` 
        };
      }
      
      return { 
        success: false, 
        error: errorData.message || 'Erro ao criar transferência MercadoPago - verifique os dados do afiliado' 
      };
    }

    const transfer = await transferResponse.json();
    console.log(`[payout-scheduler] MP transfer created:`, transfer.id || transfer.movement_id);

    return { 
      success: true, 
      transferId: (transfer.id || transfer.movement_id)?.toString() 
    };
  } catch (error: any) {
    console.error(`[payout-scheduler] Error processing MP transfer for sale ${sale.id}:`, error);
    return { 
      success: false, 
      error: `Erro de rede/sistema: ${error.message || 'Erro desconhecido'} - tente novamente ou realize pagamento manual` 
    };
  }
}

async function processStripeTransfer(
  sale: AffiliateSale, 
  affiliate: Affiliate, 
  stripeSecretKey: string
): Promise<PayoutResult> {
  try {
    if (!affiliate.stripeConnectAccountId) {
      return { success: false, error: 'Affiliate has no Stripe Connect account connected' };
    }

    const params = new URLSearchParams({
      'amount': sale.commissionAmount.toString(),
      'currency': 'brl',
      'destination': affiliate.stripeConnectAccountId,
      'description': `Comissão de venda - ${sale.pagamentoId}`,
      'metadata[affiliate_sale_id]': sale.id,
      'metadata[affiliate_id]': sale.affiliateId,
    });

    console.log(`[payout-scheduler] Creating Stripe transfer to ${affiliate.stripeConnectAccountId} for ${sale.commissionAmount} centavos`);

    const response = await fetch('https://api.stripe.com/v1/transfers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`[payout-scheduler] Stripe transfer failed:`, errorData);
      return { 
        success: false, 
        error: errorData.error?.message || 'Erro ao criar transferência Stripe' 
      };
    }

    const transfer = await response.json();
    console.log(`[payout-scheduler] Stripe transfer created:`, transfer.id);

    return { 
      success: true, 
      transferId: transfer.id 
    };
  } catch (error: any) {
    console.error(`[payout-scheduler] Error processing Stripe transfer for sale ${sale.id}:`, error);
    return { success: false, error: error.message || 'Erro desconhecido' };
  }
}

async function processPayoutForSale(sale: AffiliateSale, config: AffiliateConfig): Promise<void> {
  try {
    console.log(`[payout-scheduler] Processing payout for sale ${sale.id}, method: ${sale.splitMethod}`);

    // CRITICAL: Enforce minimum 7-day hold before any payout
    const MIN_HOLD_DAYS = 7;
    const now = new Date();
    const saleCreatedAt = sale.createdAt ? new Date(sale.createdAt) : now;
    const minPayoutDate = new Date(saleCreatedAt);
    minPayoutDate.setDate(minPayoutDate.getDate() + MIN_HOLD_DAYS);
    
    // Also check the scheduled date if set
    const scheduledDate = sale.payoutScheduledAt ? new Date(sale.payoutScheduledAt) : minPayoutDate;
    const effectivePayoutDate = scheduledDate > minPayoutDate ? scheduledDate : minPayoutDate;
    
    // ALWAYS persist the correct payoutScheduledAt if it's missing or too early
    // This ensures even manual/legacy entries get proper scheduling
    let needsReschedule = !sale.payoutScheduledAt || new Date(sale.payoutScheduledAt) < effectivePayoutDate;
    if (needsReschedule) {
      await storage.updateAffiliateSale(sale.id, {
        payoutScheduledAt: effectivePayoutDate,
        status: sale.status === 'pending' || sale.status === 'approved' ? 'pending_payout' : sale.status,
      });
      console.log(`[payout-scheduler] Sale ${sale.id} rescheduled to ${effectivePayoutDate.toISOString()}`);
    }

    if (now < effectivePayoutDate) {
      console.log(`[payout-scheduler] Sale ${sale.id} hold period not yet passed. Scheduled: ${effectivePayoutDate.toISOString()}, now: ${now.toISOString()}`);
      return; // Skip processing - will be picked up in next scheduled run
    }
    
    // Re-fetch the sale to ensure we have the latest data after any updates
    const freshSale = await storage.getAffiliateSaleById(sale.id);
    if (!freshSale) {
      console.error(`[payout-scheduler] Sale ${sale.id} not found after refresh`);
      return;
    }
    // Use fresh sale data from this point forward
    sale = freshSale;

    const affiliate = await storage.getAffiliateById(sale.affiliateId);
    if (!affiliate) {
      console.error(`[payout-scheduler] Affiliate not found: ${sale.affiliateId}`);
      await storage.updateAffiliateSale(sale.id, {
        status: 'payout_failed',
        payoutError: 'Afiliado não encontrado',
        payoutAttempts: (sale.payoutAttempts || 0) + 1,
      });
      return;
    }

    if (affiliate.status !== 'active') {
      console.log(`[payout-scheduler] Affiliate ${affiliate.id} is not active - status: ${affiliate.status}`);
      await storage.updateAffiliateSale(sale.id, {
        status: 'payout_failed',
        payoutError: 'Afiliado inativo',
        payoutAttempts: (sale.payoutAttempts || 0) + 1,
      });
      return;
    }

    let isPaymentValid = false;
    let result: PayoutResult = { success: false };

    if (sale.splitMethod === 'mp_marketplace') {
      const accessToken = await storage.getCheckoutConfig('MERCADOPAGO_ACCESS_TOKEN');
      if (!accessToken) {
        console.error(`[payout-scheduler] MercadoPago access token not configured`);
        await storage.updateAffiliateSale(sale.id, {
          payoutError: 'Token MercadoPago não configurado',
          payoutAttempts: (sale.payoutAttempts || 0) + 1,
        });
        return;
      }

      if (sale.mpPaymentId) {
        isPaymentValid = await verifyMercadoPagoPaymentNotRefunded(sale.mpPaymentId, accessToken);
      } else {
        console.log(`[payout-scheduler] Sale ${sale.id} has no mpPaymentId - assuming valid`);
        isPaymentValid = true;
      }

      if (!isPaymentValid) {
        console.log(`[payout-scheduler] Payment was refunded - marking sale as refunded`);
        await storage.updateAffiliateSale(sale.id, {
          status: 'refunded',
          payoutError: 'Pagamento foi reembolsado',
        });
        
        const newPendingAmount = Math.max(0, (affiliate.pendingAmount || 0) - sale.commissionAmount);
        const newTotalEarnings = Math.max(0, (affiliate.totalEarnings || 0) - sale.commissionAmount);
        await storage.updateAffiliate(affiliate.id, {
          pendingAmount: newPendingAmount,
          totalEarnings: newTotalEarnings,
        });
        return;
      }

      result = await processMercadoPagoTransfer(sale, affiliate, accessToken);

    } else if (sale.splitMethod === 'stripe_connect') {
      const stripeSecretKey = await storage.getCheckoutConfig('STRIPE_SECRET_KEY');
      if (!stripeSecretKey) {
        console.error(`[payout-scheduler] Stripe secret key not configured`);
        await storage.updateAffiliateSale(sale.id, {
          payoutError: 'Chave Stripe não configurada',
          payoutAttempts: (sale.payoutAttempts || 0) + 1,
        });
        return;
      }

      if (sale.stripePaymentIntentId) {
        isPaymentValid = await verifyStripePaymentNotRefunded(sale.stripePaymentIntentId, stripeSecretKey);
      } else {
        console.log(`[payout-scheduler] Sale ${sale.id} has no stripePaymentIntentId - assuming valid`);
        isPaymentValid = true;
      }

      if (!isPaymentValid) {
        console.log(`[payout-scheduler] Payment was refunded - marking sale as refunded`);
        await storage.updateAffiliateSale(sale.id, {
          status: 'refunded',
          payoutError: 'Pagamento foi reembolsado',
        });
        
        const newPendingAmount = Math.max(0, (affiliate.pendingAmount || 0) - sale.commissionAmount);
        const newTotalEarnings = Math.max(0, (affiliate.totalEarnings || 0) - sale.commissionAmount);
        await storage.updateAffiliate(affiliate.id, {
          pendingAmount: newPendingAmount,
          totalEarnings: newTotalEarnings,
        });
        return;
      }

      result = await processStripeTransfer(sale, affiliate, stripeSecretKey);
    } else {
      console.log(`[payout-scheduler] Unknown split method for sale ${sale.id}: ${sale.splitMethod}`);
      return;
    }

    if (result.success) {
      await storage.updateAffiliateSale(sale.id, {
        status: 'paid',
        mpTransferId: sale.splitMethod === 'mp_marketplace' ? result.transferId : undefined,
        stripeTransferId: sale.splitMethod === 'stripe_connect' ? result.transferId : undefined,
        paidAt: new Date(),
        payoutError: null,
      });

      const newPendingAmount = Math.max(0, (affiliate.pendingAmount || 0) - sale.commissionAmount);
      const newPaidAmount = (affiliate.paidAmount || 0) + sale.commissionAmount;
      await storage.updateAffiliate(affiliate.id, {
        pendingAmount: newPendingAmount,
        paidAmount: newPaidAmount,
      });

      console.log(`[payout-scheduler] Payout successful for sale ${sale.id}, transfer: ${result.transferId}`);
    } else {
      const newAttempts = (sale.payoutAttempts || 0) + 1;
      const newStatus = newAttempts >= MAX_PAYOUT_ATTEMPTS ? 'payout_failed' : 'pending_payout';

      await storage.updateAffiliateSale(sale.id, {
        status: newStatus,
        payoutAttempts: newAttempts,
        payoutError: result.error || 'Erro desconhecido',
      });

      console.log(`[payout-scheduler] Payout failed for sale ${sale.id}, attempt ${newAttempts}/${MAX_PAYOUT_ATTEMPTS}: ${result.error}`);
    }
  } catch (error: any) {
    console.error(`[payout-scheduler] Error processing payout for sale ${sale.id}:`, error);
    await storage.updateAffiliateSale(sale.id, {
      payoutAttempts: (sale.payoutAttempts || 0) + 1,
      payoutError: error.message || 'Erro interno',
    });
  }
}

async function processPendingPayouts(): Promise<void> {
  console.log(`[payout-scheduler] Running payout check at ${new Date().toISOString()}`);

  try {
    const config = await storage.getAffiliateConfig();
    if (!config?.autoPayEnabled) {
      console.log(`[payout-scheduler] Auto pay is disabled`);
      return;
    }

    const pendingSales = await storage.listPendingPayoutSales();
    console.log(`[payout-scheduler] Found ${pendingSales.length} pending payouts`);

    for (const sale of pendingSales) {
      await processPayoutForSale(sale, config);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[payout-scheduler] Payout processing completed`);
  } catch (error) {
    console.error("[payout-scheduler] Error processing pending payouts:", error);
  }
}

export function startAffiliatePayoutScheduler(): void {
  if (schedulerInterval) {
    console.log("[payout-scheduler] Scheduler already running");
    return;
  }

  console.log("[payout-scheduler] Starting affiliate payout scheduler");

  setTimeout(() => {
    processPendingPayouts();
  }, 10000);

  schedulerInterval = setInterval(processPendingPayouts, SCHEDULER_INTERVAL_MS);
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

export async function manualProcessPendingPayouts(): Promise<{ processed: number; errors: string[] }> {
  console.log(`[payout-scheduler] Manual payout processing triggered`);
  
  const errors: string[] = [];
  let processed = 0;

  try {
    const config = await storage.getAffiliateConfig();
    if (!config?.autoPayEnabled) {
      return { processed: 0, errors: ['Auto pay is disabled'] };
    }

    const pendingSales = await storage.listPendingPayoutSales();
    
    for (const sale of pendingSales) {
      try {
        await processPayoutForSale(sale, config);
        processed++;
      } catch (error: any) {
        errors.push(`Sale ${sale.id}: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error: any) {
    errors.push(error.message);
  }

  return { processed, errors };
}

export async function retryFailedPayout(saleId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const sale = await storage.getAffiliateSaleById(saleId);
    if (!sale) {
      return { success: false, error: 'Venda não encontrada' };
    }

    if (sale.status !== 'payout_failed' && sale.status !== 'pending_payout') {
      return { success: false, error: `Status inválido para retry: ${sale.status}` };
    }

    // Verify the original payout date has passed (7-day hold must be respected)
    // Only allow retry if the original scheduled date was in the past
    const MIN_HOLD_DAYS = 7;
    const originalScheduledDate = sale.payoutScheduledAt ? new Date(sale.payoutScheduledAt) : null;
    const now = new Date();
    
    if (!originalScheduledDate) {
      // If no scheduled date, calculate a new one based on minimum hold
      const saleCreatedAt = sale.createdAt ? new Date(sale.createdAt) : now;
      const minPayoutDate = new Date(saleCreatedAt);
      minPayoutDate.setDate(minPayoutDate.getDate() + MIN_HOLD_DAYS);
      
      if (now < minPayoutDate) {
        return { 
          success: false, 
          error: `Pagamento só pode ser processado após ${minPayoutDate.toLocaleDateString('pt-BR')} (período de reembolso de ${MIN_HOLD_DAYS} dias)` 
        };
      }
    } else if (now < originalScheduledDate) {
      return { 
        success: false, 
        error: `Pagamento agendado para ${originalScheduledDate.toLocaleDateString('pt-BR')}. Aguarde o período de reembolso.` 
      };
    }

    const config = await storage.getAffiliateConfig();
    if (!config) {
      return { success: false, error: 'Configuração de afiliados não encontrada' };
    }

    // Set status to pending_payout but keep the original scheduled date
    // This allows immediate processing since the hold period has passed
    await storage.updateAffiliateSale(saleId, {
      status: 'pending_payout',
    });

    // Re-fetch the updated sale to ensure we have fresh data
    const updatedSaleForProcessing = await storage.getAffiliateSaleById(saleId);
    if (!updatedSaleForProcessing) {
      return { success: false, error: 'Erro ao recarregar dados da venda' };
    }

    await processPayoutForSale(updatedSaleForProcessing, config);

    const updatedSale = await storage.getAffiliateSaleById(saleId);
    if (updatedSale?.status === 'paid') {
      return { success: true };
    } else {
      return { success: false, error: updatedSale?.payoutError || 'Falha no pagamento' };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
