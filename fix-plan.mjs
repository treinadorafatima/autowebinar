import pg from 'postgres';

const sql = pg(process.env.DATABASE_URL);

async function main() {
  const planoId = 'fd8294da-908e-47de-8f3c-71cb84b8b241';
  
  // Corrigir prazo_dias para 1 (igual à frequência de cobrança)
  await sql`UPDATE checkout_planos SET prazo_dias = 1 WHERE id = ${planoId}`;
  
  // Verificar
  const planos = await sql`SELECT nome, frequencia, frequencia_tipo, prazo_dias FROM checkout_planos WHERE id = ${planoId}`;
  console.log('Plano corrigido:', JSON.stringify(planos[0], null, 2));
  
  await sql.end();
}

main().catch(console.error);
