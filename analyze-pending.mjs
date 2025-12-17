import pg from 'postgres';

const sql = pg(process.env.DATABASE_URL);

async function main() {
  console.log('=== ANALISANDO PAGAMENTOS PENDENTES ===\n');
  
  const pendentes = await sql`
    SELECT id, email, status, status_detail, metodo_pagamento, 
           data_pagamento, data_aprovacao, mercadopago_payment_id, 
           stripe_payment_intent_id, criado_em
    FROM checkout_pagamentos 
    WHERE status = 'pending'
    ORDER BY criado_em DESC
  `;
  
  for (const p of pendentes) {
    console.log(`Email: ${p.email}`);
    console.log(`  Status Detail: ${p.status_detail}`);
    console.log(`  Método: ${p.metodo_pagamento}`);
    console.log(`  MP ID: ${p.mercadopago_payment_id || 'N/A'}`);
    console.log(`  Stripe ID: ${p.stripe_payment_intent_id || 'N/A'}`);
    console.log(`  Data Pagamento: ${p.data_pagamento || 'N/A'}`);
    console.log(`  Data Aprovação: ${p.data_aprovacao || 'N/A'}`);
    console.log(`  Criado: ${p.criado_em}`);
    
    // Determinar ação
    if (p.data_aprovacao) {
      console.log(`  AÇÃO: Deveria ser APPROVED`);
    } else if (p.data_pagamento && !p.data_aprovacao) {
      console.log(`  AÇÃO: Pagamento iniciado mas não aprovado - pode ser abandono`);
    } else if (!p.mercadopago_payment_id && !p.stripe_payment_intent_id) {
      console.log(`  AÇÃO: Sem ID de gateway - checkout abandonado`);
    } else {
      console.log(`  AÇÃO: Verificar manualmente`);
    }
    console.log('---');
  }
  
  await sql.end();
}

main().catch(console.error);
