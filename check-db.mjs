import postgres from "postgres";

async function checkDb() {
  console.log("🔍 Verificando conexão do banco de dados...\n");
  
  const dbUrl = process.env.DATABASE_URL;
  console.log("DATABASE_URL definida:", dbUrl ? "Sim" : "Não");
  
  if (!dbUrl) {
    console.log("❌ DATABASE_URL não está definida nos secrets!");
    return;
  }
  
  // Extrair host para identificar
  try {
    const url = new URL(dbUrl);
    console.log("Host:", url.hostname);
    console.log("Porta:", url.port);
    console.log("Database:", url.pathname.slice(1));
    
    if (url.hostname.includes("supabase")) {
      console.log("\n✅ Apontando para Supabase!");
    } else if (url.hostname.includes("neon") || url.hostname.includes("replit")) {
      console.log("\n📌 Apontando para Replit/Neon (banco local)");
    }
    
    // Testar conexão
    console.log("\n🔌 Testando conexão...");
    const sql = postgres(dbUrl);
    
    const result = await sql`SELECT NOW() as time, current_database() as db`;
    console.log("✅ Conectado com sucesso!");
    console.log("   Hora:", result[0].time);
    console.log("   Banco:", result[0].db);
    
    // Verificar tabelas
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log("\n📋 Tabelas existentes:");
    tables.forEach(t => console.log("   -", t.table_name));
    
    // Contar dados
    const admins = await sql`SELECT COUNT(*) as count FROM admins`;
    const webinars = await sql`SELECT COUNT(*) as count FROM webinars`;
    const videos = await sql`SELECT COUNT(*) as count FROM uploaded_videos`.catch(() => [{ count: 0 }]);
    const comments = await sql`SELECT COUNT(*) as count FROM comments`.catch(() => [{ count: 0 }]);
    
    console.log("\n📊 Dados no banco:");
    console.log("   Admins:", admins[0].count);
    console.log("   Webinars:", webinars[0].count);
    console.log("   Vídeos:", videos[0].count);
    console.log("   Comentários:", comments[0].count);
    
    await sql.end();
    
  } catch (err) {
    console.error("\n❌ Erro:", err.message);
  }
}

checkDb();
