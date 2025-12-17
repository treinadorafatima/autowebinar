import pg from 'postgres';

const sql = pg(process.env.DATABASE_URL);

async function main() {
  const planoId = 'fd8294da-908e-47de-8f3c-71cb84b8b241';
  
  const planos = await sql`SELECT * FROM checkout_planos WHERE id = ${planoId}`;
  console.log('\n=== PLANO ===');
  console.log(JSON.stringify(planos[0] || 'Não encontrado', null, 2));
  
  await sql.end();
}

main().catch(console.error);
