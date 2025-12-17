import pg from 'postgres';

const sql = pg(process.env.DATABASE_URL);

async function main() {
  const email = 'treinadorafatima@gmail.com';
  
  console.log('=== CORRIGINDO PAGAMENTOS ===\n');
  
  // 1. Atualizar pagamentos que têm data_aprovacao para status "approved"
  const pagamentosAprovados = await sql`
    UPDATE checkout_pagamentos 
    SET status = 'approved', status_detail = 'Pagamento aprovado'
    WHERE email = ${email} 
    AND data_aprovacao IS NOT NULL 
    AND status = 'pending'
    RETURNING id, status
  `;
  console.log(`Pagamentos corrigidos para "approved": ${pagamentosAprovados.length}`);
  
  // 2. Remover pagamentos de renovação automática que nunca foram processados (não têm MP payment ID)
  const pagamentosRemovidos = await sql`
    DELETE FROM checkout_pagamentos 
    WHERE email = ${email} 
    AND status_detail = 'Auto-renewal payment generated'
    AND mercadopago_payment_id IS NULL
    RETURNING id
  `;
  console.log(`Pagamentos de renovação não processados removidos: ${pagamentosRemovidos.length}`);
  
  // 3. Verificar resultado final
  console.log('\n=== RESULTADO FINAL ===');
  const pagamentos = await sql`
    SELECT id, status, status_detail, metodo_pagamento, data_aprovacao, criado_em
    FROM checkout_pagamentos 
    WHERE email = ${email} 
    ORDER BY criado_em DESC
  `;
  
  for (const p of pagamentos) {
    console.log(`${p.status.toUpperCase()} - ${p.metodo_pagamento || 'N/A'} - ${p.criado_em.toISOString().split('T')[0]}`);
  }
  
  await sql.end();
}

main().catch(console.error);
