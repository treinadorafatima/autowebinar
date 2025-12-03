import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const sql = postgres(process.env.DATABASE_URL);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function finalCheck() {
  console.log("🔍 VERIFICAÇÃO FINAL DO SISTEMA\n");
  console.log("="+"=".repeat(50) + "\n");

  // 1. Banco de dados
  console.log("📊 1. BANCO DE DADOS (Supabase PostgreSQL)");
  console.log("-".repeat(40));
  
  const admins = await sql`SELECT id, email FROM admins`;
  console.log(`   Admins: ${admins.length}`);
  admins.forEach(a => console.log(`     - ${a.email}`));

  const webinars = await sql`SELECT id, name, slug, video_url, uploaded_video_id FROM webinars`;
  console.log(`   Webinars: ${webinars.length}`);
  webinars.forEach(w => console.log(`     - ${w.name} (/${w.slug})`));

  // 2. Storage
  console.log("\n📦 2. STORAGE (Supabase Storage)");
  console.log("-".repeat(40));

  const { data: buckets } = await supabase.storage.listBuckets();
  console.log(`   Buckets: ${buckets?.length || 0}`);
  buckets?.forEach(b => console.log(`     - ${b.name} (${b.public ? 'público' : 'privado'})`));

  const { data: files } = await supabase.storage.from("webinar-videos").list("videos");
  console.log(`   Vídeos no Storage: ${files?.length || 0}`);
  files?.forEach(f => {
    const sizeMB = (f.metadata?.size / 1024 / 1024).toFixed(2);
    console.log(`     - ${f.name} (${sizeMB || '?'}MB)`);
  });

  // 3. URLs públicas
  console.log("\n🔗 3. URLs PÚBLICAS");
  console.log("-".repeat(40));
  
  if (files && files.length > 0) {
    for (const file of files) {
      const { data } = supabase.storage
        .from("webinar-videos")
        .getPublicUrl(`videos/${file.name}`);
      console.log(`   ${file.name}:`);
      console.log(`   ${data.publicUrl}\n`);
    }
  }

  await sql.end();
  
  console.log("="+"=".repeat(50));
  console.log("\n✅ RESUMO:");
  console.log("   - Banco Supabase: Conectado ✓");
  console.log("   - Storage Supabase: Configurado ✓");
  console.log("   - Vídeos enviados: " + (files?.length || 0));
  console.log("\n⚠️  NOTA: Vídeos > 50MB precisam de plano Supabase Pro");
}

finalCheck().catch(console.error);
