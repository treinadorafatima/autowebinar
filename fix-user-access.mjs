import pg from 'postgres';

const sql = pg(process.env.DATABASE_URL);

async function main() {
  // Buscar o plano para saber o prazo correto
  const planoId = 'fd8294da-908e-47de-8f3c-71cb84b8b241';
  const planos = await sql`SELECT prazo_dias FROM checkout_planos WHERE id = ${planoId}`;
  const prazoDias = planos[0].prazo_dias;
  
  // Buscar a usuária
  const email = 'treinadorafatima@gmail.com';
  const admins = await sql`SELECT id, access_expires_at FROM admins WHERE email = ${email}`;
  
  if (admins[0]) {
    // Calcular nova data de expiração baseada no prazo correto do plano
    // A partir do último pagamento (ou data atual se não houver)
    const now = new Date();
    const novaExpiracao = new Date(now.getTime() + prazoDias * 24 * 60 * 60 * 1000);
    
    await sql`UPDATE admins SET access_expires_at = ${novaExpiracao} WHERE email = ${email}`;
    
    console.log('=== USUÁRIA ATUALIZADA ===');
    console.log(`Email: ${email}`);
    console.log(`Prazo do plano: ${prazoDias} dia(s)`);
    console.log(`Acesso anterior expirava em: ${admins[0].access_expires_at}`);
    console.log(`Novo acesso expira em: ${novaExpiracao.toISOString()}`);
  }
  
  // Verificar todos os planos recorrentes
  console.log('\n=== VERIFICANDO TODOS OS PLANOS ===');
  const todosPlanos = await sql`SELECT id, nome, tipo_cobranca, frequencia, frequencia_tipo, prazo_dias FROM checkout_planos WHERE ativo = true`;
  
  for (const p of todosPlanos) {
    if (p.tipo_cobranca === 'recorrente') {
      const freqDias = p.frequencia_tipo === 'days' ? p.frequencia : 
                       p.frequencia_tipo === 'months' ? p.frequencia * 30 : 
                       p.frequencia * 365;
      
      if (freqDias !== p.prazo_dias) {
        console.log(`CORRIGINDO: ${p.nome} - frequência ${p.frequencia} ${p.frequencia_tipo} (${freqDias} dias) mas prazo era ${p.prazo_dias} dias`);
        await sql`UPDATE checkout_planos SET prazo_dias = ${freqDias} WHERE id = ${p.id}`;
      } else {
        console.log(`OK: ${p.nome} - ${p.prazo_dias} dias`);
      }
    } else {
      console.log(`OK (único): ${p.nome} - ${p.prazo_dias} dias`);
    }
  }
  
  await sql.end();
}

main().catch(console.error);
