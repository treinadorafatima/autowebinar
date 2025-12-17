import pg from 'postgres';

const sql = pg(process.env.DATABASE_URL);

async function main() {
  const email = 'treinadorafatima@gmail.com';
  
  // Buscar pagamentos
  const pagamentos = await sql`
    SELECT id, email, status, status_detail, metodo_pagamento, valor, 
           data_pagamento, data_aprovacao, mercadopago_payment_id, criado_em
    FROM checkout_pagamentos 
    WHERE email = ${email} 
    ORDER BY criado_em DESC
  `;
  
  console.log('=== HISTÓRICO DE PAGAMENTOS ===');
  console.log(`Total: ${pagamentos.length} pagamento(s)\n`);
  
  for (const p of pagamentos) {
    console.log(`ID: ${p.id}`);
    console.log(`Status: ${p.status}`);
    console.log(`Status Detail: ${p.status_detail}`);
    console.log(`Método: ${p.metodo_pagamento}`);
    console.log(`Valor: R$ ${(p.valor / 100).toFixed(2)}`);
    console.log(`Data Pagamento: ${p.data_pagamento}`);
    console.log(`Data Aprovação: ${p.data_aprovacao}`);
    console.log(`MP Payment ID: ${p.mercadopago_payment_id}`);
    console.log(`Criado em: ${p.criado_em}`);
    console.log('---');
  }
  
  await sql.end();
}

main().catch(console.error);
