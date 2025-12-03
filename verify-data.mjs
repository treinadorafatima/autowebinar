import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

async function verifyData() {
  console.log("🔍 Verificando dados no Supabase...\n");

  // Admins
  const admins = await sql`SELECT id, email FROM admins`;
  console.log("👤 Admins:", admins.length);
  admins.forEach(a => console.log(`   - ${a.email}`));

  // Webinars
  const webinars = await sql`SELECT id, name, slug, video_url FROM webinars`;
  console.log("\n📹 Webinars:", webinars.length);
  webinars.forEach(w => console.log(`   - ${w.name} (/${w.slug})`));

  // Videos
  const videos = await sql`SELECT id, filename, title, duration FROM uploaded_videos`;
  console.log("\n🎬 Vídeos:", videos.length);
  videos.forEach(v => console.log(`   - ${v.title} (${v.filename})`));

  // Sessions
  const sessions = await sql`SELECT token, admin_id FROM sessions`;
  console.log("\n🔐 Sessões ativas:", sessions.length);

  // Settings
  const settings = await sql`SELECT key, value FROM settings`;
  console.log("\n⚙️ Configurações:", settings.length);
  settings.forEach(s => console.log(`   - ${s.key}: ${s.value?.substring(0, 30)}...`));

  await sql.end();
  console.log("\n✅ Verificação concluída!");
}

verifyData().catch(console.error);
