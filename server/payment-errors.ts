/**
 * Mapeamento de códigos de erro de pagamento para mensagens amigáveis
 * Maximiza aprovação mostrando orientações claras ao usuário
 */

// Códigos de erro do Mercado Pago - status_detail
export const MERCADOPAGO_ERROR_MESSAGES: Record<string, { message: string; action: string; retryable: boolean }> = {
  // Erros de cartão de crédito
  'cc_rejected_bad_filled_card_number': {
    message: 'O número do cartão está incorreto.',
    action: 'Por favor, verifique o número do cartão e tente novamente.',
    retryable: true,
  },
  'cc_rejected_bad_filled_date': {
    message: 'A data de validade está incorreta.',
    action: 'Verifique a data de validade do seu cartão e tente novamente.',
    retryable: true,
  },
  'cc_rejected_bad_filled_other': {
    message: 'Alguns dados do cartão estão incorretos.',
    action: 'Revise os dados do cartão e tente novamente.',
    retryable: true,
  },
  'cc_rejected_bad_filled_security_code': {
    message: 'O código de segurança (CVV) está incorreto.',
    action: 'Verifique o código de segurança no verso do cartão e tente novamente.',
    retryable: true,
  },
  'cc_rejected_blacklist': {
    message: 'O cartão não pode ser processado por motivos de segurança.',
    action: 'Por favor, utilize outro cartão ou método de pagamento.',
    retryable: false,
  },
  'cc_rejected_call_for_authorize': {
    message: 'Seu cartão requer autorização prévia para esta compra.',
    action: 'Entre em contato com seu banco para autorizar o pagamento e tente novamente.',
    retryable: true,
  },
  'cc_rejected_card_disabled': {
    message: 'Seu cartão está desabilitado para compras online.',
    action: 'Entre em contato com seu banco para habilitar compras online ou use outro cartão.',
    retryable: true,
  },
  'cc_rejected_card_error': {
    message: 'Houve um erro ao processar o cartão.',
    action: 'Por favor, tente novamente ou use outro cartão.',
    retryable: true,
  },
  'cc_rejected_duplicated_payment': {
    message: 'Pagamento duplicado detectado.',
    action: 'Você já realizou um pagamento recentemente. Aguarde alguns minutos antes de tentar novamente.',
    retryable: false,
  },
  'cc_rejected_high_risk': {
    message: 'O pagamento foi recusado por medidas de segurança.',
    action: 'Por favor, utilize outro cartão ou método de pagamento (PIX recomendado).',
    retryable: false,
  },
  'cc_rejected_insufficient_amount': {
    message: 'Seu cartão não possui limite suficiente.',
    action: 'Verifique seu limite disponível ou use outro cartão.',
    retryable: true,
  },
  'cc_rejected_invalid_installments': {
    message: 'O número de parcelas selecionado não é permitido.',
    action: 'Por favor, escolha um número diferente de parcelas.',
    retryable: true,
  },
  'cc_rejected_max_attempts': {
    message: 'Número máximo de tentativas excedido.',
    action: 'Aguarde alguns minutos antes de tentar novamente ou use outro cartão.',
    retryable: true,
  },
  'cc_rejected_other_reason': {
    message: 'O pagamento foi recusado pelo banco emissor.',
    action: 'Entre em contato com seu banco ou tente com outro cartão.',
    retryable: true,
  },
  // Erros gerais
  'pending_contingency': {
    message: 'O pagamento está sendo processado.',
    action: 'Aguarde a confirmação. Você receberá um e-mail quando for aprovado.',
    retryable: false,
  },
  'pending_review_manual': {
    message: 'O pagamento está em análise.',
    action: 'Aguarde a análise. Você receberá um e-mail com o resultado.',
    retryable: false,
  },
  'rejected_by_bank': {
    message: 'O pagamento foi recusado pelo banco.',
    action: 'Entre em contato com seu banco ou use outro método de pagamento.',
    retryable: true,
  },
  'rejected_by_regulations': {
    message: 'O pagamento não pôde ser processado por questões regulatórias.',
    action: 'Por favor, use outro método de pagamento.',
    retryable: false,
  },
  'rejected_insufficient_data': {
    message: 'Dados insuficientes para processar o pagamento.',
    action: 'Por favor, verifique todos os dados e tente novamente.',
    retryable: true,
  },
  // Fallback para erros desconhecidos
  'default': {
    message: 'Não foi possível processar o pagamento.',
    action: 'Por favor, tente novamente ou use outro método de pagamento.',
    retryable: true,
  },
};

// Códigos de erro do Stripe - decline_code
export const STRIPE_ERROR_MESSAGES: Record<string, { message: string; action: string; retryable: boolean }> = {
  'authentication_required': {
    message: 'Autenticação adicional necessária.',
    action: 'Por favor, complete a autenticação 3D Secure solicitada pelo seu banco.',
    retryable: true,
  },
  'approve_with_id': {
    message: 'O pagamento requer aprovação adicional.',
    action: 'Entre em contato com seu banco para aprovar a transação.',
    retryable: true,
  },
  'call_issuer': {
    message: 'Seu cartão foi recusado.',
    action: 'Entre em contato com seu banco para mais informações.',
    retryable: true,
  },
  'card_not_supported': {
    message: 'Este tipo de cartão não é aceito.',
    action: 'Por favor, use um cartão diferente.',
    retryable: false,
  },
  'card_velocity_exceeded': {
    message: 'Limite de transações excedido.',
    action: 'Aguarde algumas horas ou use outro cartão.',
    retryable: true,
  },
  'currency_not_supported': {
    message: 'A moeda não é suportada por este cartão.',
    action: 'Por favor, use outro cartão.',
    retryable: false,
  },
  'do_not_honor': {
    message: 'O cartão foi recusado.',
    action: 'Entre em contato com seu banco ou use outro cartão.',
    retryable: true,
  },
  'do_not_try_again': {
    message: 'O cartão foi recusado permanentemente.',
    action: 'Por favor, use um cartão diferente.',
    retryable: false,
  },
  'duplicate_transaction': {
    message: 'Transação duplicada detectada.',
    action: 'Aguarde alguns minutos antes de tentar novamente.',
    retryable: false,
  },
  'expired_card': {
    message: 'O cartão está vencido.',
    action: 'Por favor, use um cartão válido.',
    retryable: false,
  },
  'fraudulent': {
    message: 'O pagamento foi identificado como suspeito.',
    action: 'Por favor, use outro método de pagamento.',
    retryable: false,
  },
  'generic_decline': {
    message: 'O cartão foi recusado.',
    action: 'Entre em contato com seu banco ou tente outro cartão.',
    retryable: true,
  },
  'incorrect_cvc': {
    message: 'O código de segurança (CVC) está incorreto.',
    action: 'Verifique o código no verso do cartão e tente novamente.',
    retryable: true,
  },
  'incorrect_number': {
    message: 'O número do cartão está incorreto.',
    action: 'Verifique o número do cartão e tente novamente.',
    retryable: true,
  },
  'incorrect_zip': {
    message: 'O CEP está incorreto.',
    action: 'Verifique o CEP e tente novamente.',
    retryable: true,
  },
  'insufficient_funds': {
    message: 'Saldo insuficiente.',
    action: 'Verifique seu limite disponível ou use outro cartão.',
    retryable: true,
  },
  'invalid_account': {
    message: 'A conta do cartão é inválida.',
    action: 'Por favor, use outro cartão.',
    retryable: false,
  },
  'invalid_amount': {
    message: 'O valor é inválido para este cartão.',
    action: 'Entre em contato com seu banco.',
    retryable: true,
  },
  'invalid_cvc': {
    message: 'O código de segurança (CVC) é inválido.',
    action: 'Verifique o código no verso do cartão.',
    retryable: true,
  },
  'invalid_expiry_month': {
    message: 'O mês de validade é inválido.',
    action: 'Verifique a data de validade do cartão.',
    retryable: true,
  },
  'invalid_expiry_year': {
    message: 'O ano de validade é inválido.',
    action: 'Verifique a data de validade do cartão.',
    retryable: true,
  },
  'invalid_number': {
    message: 'O número do cartão é inválido.',
    action: 'Verifique o número do cartão.',
    retryable: true,
  },
  'issuer_not_available': {
    message: 'O banco emissor está indisponível.',
    action: 'Tente novamente em alguns minutos.',
    retryable: true,
  },
  'lost_card': {
    message: 'O cartão foi reportado como perdido.',
    action: 'Por favor, use outro cartão.',
    retryable: false,
  },
  'merchant_blacklist': {
    message: 'O cartão não pode ser usado nesta loja.',
    action: 'Por favor, use outro cartão.',
    retryable: false,
  },
  'new_account_information_available': {
    message: 'Informações atualizadas do cartão disponíveis.',
    action: 'Entre em contato com seu banco para atualizar os dados.',
    retryable: true,
  },
  'no_action_taken': {
    message: 'Nenhuma ação foi tomada pelo banco.',
    action: 'Entre em contato com seu banco.',
    retryable: true,
  },
  'not_permitted': {
    message: 'Este tipo de transação não é permitido.',
    action: 'Entre em contato com seu banco ou use outro cartão.',
    retryable: true,
  },
  'offline_pin_required': {
    message: 'PIN necessário para esta transação.',
    action: 'Use outro método de pagamento para compras online.',
    retryable: false,
  },
  'online_or_offline_pin_required': {
    message: 'PIN necessário.',
    action: 'Use outro método de pagamento para compras online.',
    retryable: false,
  },
  'pickup_card': {
    message: 'O cartão foi bloqueado.',
    action: 'Entre em contato com seu banco.',
    retryable: false,
  },
  'pin_try_exceeded': {
    message: 'Número de tentativas de PIN excedido.',
    action: 'Aguarde ou use outro cartão.',
    retryable: true,
  },
  'processing_error': {
    message: 'Erro de processamento.',
    action: 'Tente novamente em alguns segundos.',
    retryable: true,
  },
  'reenter_transaction': {
    message: 'Por favor, tente novamente.',
    action: 'Reinsira os dados do cartão.',
    retryable: true,
  },
  'restricted_card': {
    message: 'O cartão tem restrições.',
    action: 'Entre em contato com seu banco ou use outro cartão.',
    retryable: false,
  },
  'revocation_of_all_authorizations': {
    message: 'Todas as autorizações foram revogadas.',
    action: 'Entre em contato com seu banco.',
    retryable: false,
  },
  'revocation_of_authorization': {
    message: 'A autorização foi revogada.',
    action: 'Entre em contato com seu banco.',
    retryable: true,
  },
  'security_violation': {
    message: 'Violação de segurança detectada.',
    action: 'Use outro método de pagamento.',
    retryable: false,
  },
  'service_not_allowed': {
    message: 'Este serviço não é permitido.',
    action: 'Entre em contato com seu banco.',
    retryable: false,
  },
  'stolen_card': {
    message: 'O cartão foi reportado como roubado.',
    action: 'Por favor, use outro cartão.',
    retryable: false,
  },
  'stop_payment_order': {
    message: 'Ordem de suspensão de pagamento.',
    action: 'Entre em contato com seu banco.',
    retryable: false,
  },
  'testmode_decline': {
    message: 'Cartão de teste recusado.',
    action: 'Use um cartão válido.',
    retryable: false,
  },
  'transaction_not_allowed': {
    message: 'Transação não permitida.',
    action: 'Entre em contato com seu banco.',
    retryable: true,
  },
  'try_again_later': {
    message: 'Tente novamente mais tarde.',
    action: 'Aguarde alguns minutos e tente novamente.',
    retryable: true,
  },
  'withdrawal_count_limit_exceeded': {
    message: 'Limite de saques excedido.',
    action: 'Aguarde ou use outro cartão.',
    retryable: true,
  },
  // Fallback
  'default': {
    message: 'O pagamento foi recusado.',
    action: 'Por favor, tente novamente ou use outro cartão.',
    retryable: true,
  },
};

/**
 * Obtém mensagem amigável para erro do Mercado Pago
 */
export function getMercadoPagoErrorMessage(statusDetail: string | null | undefined): { message: string; action: string; retryable: boolean } {
  if (!statusDetail) {
    return MERCADOPAGO_ERROR_MESSAGES['default'];
  }
  return MERCADOPAGO_ERROR_MESSAGES[statusDetail] || MERCADOPAGO_ERROR_MESSAGES['default'];
}

/**
 * Obtém mensagem amigável para erro do Stripe
 */
export function getStripeErrorMessage(declineCode: string | null | undefined): { message: string; action: string; retryable: boolean } {
  if (!declineCode) {
    return STRIPE_ERROR_MESSAGES['default'];
  }
  return STRIPE_ERROR_MESSAGES[declineCode] || STRIPE_ERROR_MESSAGES['default'];
}

/**
 * Loga erro de pagamento de forma estruturada para investigação
 */
export function logPaymentError(params: {
  gateway: 'mercadopago' | 'stripe';
  pagamentoId: string;
  email: string;
  valor: number;
  metodo: string;
  errorCode: string;
  errorMessage: string;
  gatewayResponse?: any;
}): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: 'ERROR',
    type: 'PAYMENT_FAILURE',
    ...params,
  };
  
  console.error(`[PAYMENT_FAILURE] ${timestamp}`, JSON.stringify(logEntry, null, 2));
  
  // Log adicional para facilitar grep/análise
  console.error(`[PAYMENT_DECLINED] Gateway: ${params.gateway} | Email: ${params.email} | Valor: R$ ${(params.valor / 100).toFixed(2)} | Método: ${params.metodo} | Código: ${params.errorCode} | Motivo: ${params.errorMessage}`);
}

/**
 * Loga sucesso de pagamento
 */
export function logPaymentSuccess(params: {
  gateway: 'mercadopago' | 'stripe';
  pagamentoId: string;
  email: string;
  valor: number;
  metodo: string;
  externalId: string;
}): void {
  const timestamp = new Date().toISOString();
  console.log(`[PAYMENT_SUCCESS] ${timestamp} | Gateway: ${params.gateway} | Email: ${params.email} | Valor: R$ ${(params.valor / 100).toFixed(2)} | Método: ${params.metodo} | ID Externo: ${params.externalId}`);
}
