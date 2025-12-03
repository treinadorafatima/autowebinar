import postgres from 'postgres';
import { randomUUID } from 'crypto';

const sql = postgres(process.env.DATABASE_URL);

async function addTestComments() {
  console.log("🗨️ Adicionando comentários de teste...\n");
  
  // Buscar o webinar
  const webinars = await sql`SELECT id, name FROM webinars LIMIT 1`;
  if (webinars.length === 0) {
    console.log("❌ Nenhum webinário encontrado");
    return;
  }
  
  const webinarId = webinars[0].id;
  console.log(`📺 Webinário: ${webinars[0].name} (${webinarId})\n`);
  
  const testComments = [
    { author: "Maria Santos", text: "Que aula incrível! 🙏", timestamp: 30 },
    { author: "João Silva", text: "Estou aprendendo muito!", timestamp: 60 },
    { author: "Ana Costa", text: "Muito bem explicado, parabéns!", timestamp: 120 },
    { author: "Carlos Oliveira", text: "Isso mudou minha perspectiva", timestamp: 180 },
    { author: "Patricia Lima", text: "Onde posso acessar o material?", timestamp: 240 },
    { author: "Roberto Souza", text: "Excelente conteúdo!", timestamp: 300 },
    { author: "Fernanda Alves", text: "Melhor aula que já assisti", timestamp: 360 },
  ];
  
  for (const comment of testComments) {
    await sql`
      INSERT INTO comments (id, webinar_id, author, text, timestamp, is_simulated, persist_for_future_sessions, created_at)
      VALUES (${randomUUID()}, ${webinarId}, ${comment.author}, ${comment.text}, ${comment.timestamp}, true, true, NOW())
    `;
    console.log(`✅ ${comment.author}: "${comment.text}" (${comment.timestamp}s)`);
  }
  
  console.log("\n✨ Comentários adicionados com sucesso!");
  
  // Verificar
  const count = await sql`SELECT COUNT(*) as total FROM comments WHERE webinar_id = ${webinarId}`;
  console.log(`📊 Total de comentários: ${count[0].total}`);
  
  await sql.end();
}

addTestComments().catch(console.error);
