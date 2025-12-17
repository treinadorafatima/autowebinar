import pg from 'postgres';

const sql = pg(process.env.DATABASE_URL);

async function main() {
  console.log('=== CORRIGINDO TODOS OS PAGAMENTOS ===\n');
  
  // 1. Assinaturas antigas (mais de 3 dias) que nunca foram aprovadas -> expiradas
  const assinaturasExpiradas = await sql`
    UPDATE checkout_pagamentos 
    SET status = 'expired', status_detail = 'Assinatura não concluída'
    WHERE status = 'pending'
    AND metodo_pagamento = 'subscription'
    AND data_aprovacao IS NULL
    AND criado_em < NOW() - INTERVAL '3 days'
    RETURNING id, email
  `;
  console.log(`Assinaturas expiradas: ${assinaturasExpiradas.length}`);
  
  // 2. Checkouts iniciados há mais de 1 dia -> abandonados
  const checkoutsAbandonados = await sql`
    UPDATE checkout_pagamentos 
    SET status = 'abandoned', status_detail = 'Checkout abandonado'
    WHERE status = 'checkout_iniciado'
    AND criado_em < NOW() - INTERVAL '1 day'
    RETURNING id, email
  `;
  console.log(`Checkouts abandonados: ${checkoutsAbandonados.length}`);
  
  // 3. Estatísticas finais
  console.log('\n=== ESTATÍSTICAS FINAIS ===');
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
