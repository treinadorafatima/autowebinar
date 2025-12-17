import pg from 'postgres';

const sql = pg(process.env.DATABASE_URL);

async function main() {
  console.log('=== CORRIGINDO TODOS OS PAGAMENTOS DO SISTEMA ===\n');
  
  // 1. Pagamentos com data_aprovacao que estão como pending -> approved
  const aprovados = await sql`
    UPDATE checkout_pagamentos 
    SET status = 'approved', status_detail = 'Pagamento aprovado'
    WHERE data_aprovacao IS NOT NULL 
    AND status IN ('pending', 'in_process')
    RETURNING id, email
  `;
  console.log(`Pagamentos corrigidos para "approved": ${aprovados.length}`);
  
  // 2. Renovações automáticas não processadas (sem MP ID e sem Stripe ID) -> remover
  const renovacoesRemovidas = await sql`
    DELETE FROM checkout_pagamentos 
    WHERE status_detail = 'Auto-renewal payment generated'
    AND mercadopago_payment_id IS NULL
    AND stripe_payment_intent_id IS NULL
    RETURNING id, email
  `;
  console.log(`Renovações automáticas não processadas removidas: ${renovacoesRemovidas.length}`);
  
  // 3. Checkouts abandonados muito antigos (mais de 7 dias) -> marcar como expirado
  const expirados = await sql`
    UPDATE checkout_pagamentos 
    SET status = 'expired', status_detail = 'Checkout abandonado'
    WHERE status = 'checkout_iniciado'
    AND criado_em < NOW() - INTERVAL '7 days'
    RETURNING id, email
  `;
  console.log(`Checkouts antigos marcados como expirados: ${expirados.length}`);
  
  // 4. Estatísticas finais
  console.log('\n=== ESTATÍSTICAS DO SISTEMA ===');
  const stats = await sql`
    SELECT status, COUNT(*) as total
    FROM checkout_pagamentos
    GROUP BY status
    ORDER BY total DESC
  `;
  
  for (const s of stats) {
    console.log(`${s.status}: ${s.total}`);
  }
  
  await sql.end();
}

main().catch(console.error);
