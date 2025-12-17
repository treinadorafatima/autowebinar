import pg from 'postgres';

const sql = pg(process.env.DATABASE_URL);

async function main() {
  const planoId = 'fd8294da-908e-47de-8f3c-71cb84b8b241';
  
  const planos = await sql`SELECT nome, frequencia, frequencia_tipo, prazo_dias, tipo_cobranca FROM checkout_planos WHERE id = ${planoId}`;
  const p = planos[0];
  
  console.log('\n=== ANÁLISE DO PLANO ===');
  console.log(`Nome: ${p.nome}`);
  console.log(`Tipo: ${p.tipo_cobranca}`);
  console.log(`Frequência de cobrança: a cada ${p.frequencia} ${p.frequencia_tipo}`);
  console.log(`Prazo de liberação: ${p.prazo_dias} dias`);
  
  if (p.tipo_cobranca === 'recorrente') {
    const freqDays = p.frequencia_tipo === 'days' ? p.frequencia : 
                     p.frequencia_tipo === 'months' ? p.frequencia * 30 : 
                     p.frequencia * 365;
    
    console.log('\n=== CONCLUSÃO ===');
    if (freqDays < p.prazo_dias) {
      console.log(`PROBLEMA: Cobrança a cada ${freqDays} dia(s), mas libera ${p.prazo_dias} dias.`);
      console.log(`O cliente pagará novamente ANTES do acesso expirar.`);
    } else if (freqDays > p.prazo_dias) {
      console.log(`PROBLEMA: Cobrança a cada ${freqDays} dia(s), mas libera só ${p.prazo_dias} dias.`);
      console.log(`O acesso expira ANTES da próxima cobrança - cliente fica sem acesso.`);
    } else {
      console.log(`OK: Cobrança e liberação estão alinhados.`);
    }
  }
  
  await sql.end();
}

main().catch(console.error);
