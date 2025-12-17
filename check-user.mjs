import pg from 'postgres';

const sql = pg(process.env.DATABASE_URL);

async function main() {
  const email = 'treinadorafatima@gmail.com';
  
  // Buscar na tabela admins
  const admins = await sql`SELECT id, name, email, role, plano_id, is_active, payment_status, payment_failed_reason, access_expires_at, created_at FROM admins WHERE email = ${email}`;
  console.log('\n=== USUÁRIO (admins) ===');
  console.log(JSON.stringify(admins[0] || 'Não encontrado', null, 2));
  
  if (admins[0]) {
    // Buscar pagamentos
    const payments = await sql`SELECT id, status, payment_method, amount, created_at, paid_at, mercado_pago_payment_id, stripe_payment_intent_id FROM payments WHERE admin_id = ${admins[0].id} ORDER BY created_at DESC LIMIT 5`;
    console.log('\n=== PAGAMENTOS ===');
    console.log(JSON.stringify(payments, null, 2));
    
    // Buscar plano
    if (admins[0].plano_id) {
      const planos = await sql`SELECT id, name, price, billing_period FROM subscription_plans WHERE id = ${admins[0].plano_id}`;
      console.log('\n=== PLANO ===');
      console.log(JSON.stringify(planos[0] || 'Não encontrado', null, 2));
    }
  }
  
  await sql.end();
}

main().catch(console.error);
