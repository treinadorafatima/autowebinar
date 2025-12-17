import { db } from './server/db';
import { users, payments } from './shared/schema';
import { eq } from 'drizzle-orm';

async function checkUser() {
  const email = 'treinadorafatima@gmail.com';
  
  // Buscar usuário
  const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
  console.log('\n=== USUÁRIO ===');
  console.log(JSON.stringify(user[0] || 'Não encontrado', null, 2));
  
  if (user[0]) {
    // Buscar pagamentos
    const userPayments = await db.select().from(payments).where(eq(payments.userId, user[0].id));
    console.log('\n=== PAGAMENTOS ===');
    console.log(JSON.stringify(userPayments, null, 2));
  }
  
  process.exit(0);
}

checkUser().catch(console.error);
