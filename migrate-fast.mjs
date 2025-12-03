import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import fs from "fs";
import path from "path";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const dbUrl = process.env.DATABASE_URL;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const localDb = postgres(dbUrl);

async function migrate() {
  try {
    console.log("🚀 [MIGRAÇÃO] Iniciando migração para Supabase\n");

    // 1. EXPORTAR DADOS DO BANCO LOCAL
    console.log("📥 [1] Exportando dados do banco local...");
    const [admins, webinars, settings] = await Promise.all([
      localDb`SELECT * FROM admins`,
      localDb`SELECT * FROM webinars`,
      localDb`SELECT * FROM settings LIMIT 100`.catch(() => []),
    ]);

    console.log(`  ✓ ${admins.length} admin(s)`);
    console.log(`  ✓ ${webinars.length} webinar(s)`);
    console.log(`  ✓ ${settings.length} configuração(ões)\n`);

    // 2. UPLOAD RÁPIDO DE VÍDEOS
    console.log("📤 [2] Upload de vídeos para Supabase Storage...");
    const videosDir = "./videos";
    const files = fs.readdirSync(videosDir).filter(f => f.endsWith(".mp4"));
    
    for (const file of files) {
      const filePath = path.join(videosDir, file);
      const buffer = fs.readFileSync(filePath);
      const sizeGB = (buffer.length / 1024 / 1024 / 1024).toFixed(2);
      
      try {
        const { error } = await supabase.storage
          .from("webinar-videos")
          .upload(`videos/${file}`, buffer, { upsert: true });
        
        if (error) {
          console.log(`  ✗ ${file}: ${error.message}`);
        } else {
          console.log(`  ✓ ${file} (${sizeGB}GB)`);
        }
      } catch (e) {
        console.log(`  ✗ ${file}: ${e.message}`);
      }
    }

    console.log("\n💾 [3] Importando no Supabase PostgreSQL...");

    // Conectar ao Supabase DB
    const supabaseDb = postgres({
      host: "erodfrfuuhxdaeqfjzsn.db.supabase.co",
      port: 5432,
      database: "postgres",
      username: "postgres",
      password: supabaseServiceKey,
      ssl: "require",
    });

    // Limpar dados existentes
    await supabaseDb`DELETE FROM comments`;
    await supabaseDb`DELETE FROM webinars`;
    await supabaseDb`DELETE FROM uploaded_videos`;
    await supabaseDb`DELETE FROM admins`;

    // Inserir dados
    if (admins.length > 0) {
      for (const admin of admins) {
        await supabaseDb`
          INSERT INTO admins (id, email, password, created_at)
          VALUES (${admin.id}, ${admin.email}, ${admin.password}, ${admin.created_at})
          ON CONFLICT DO NOTHING
        `;
      }
      console.log(`  ✓ ${admins.length} admin(s) importado(s)`);
    }

    if (webinars.length > 0) {
      for (const w of webinars) {
        await supabaseDb`
          INSERT INTO webinars (
            id, name, slug, description, video_url, uploaded_video_id, 
            video_duration, start_hour, start_minute, recurrence, once_date,
            day_of_week, day_of_month, countdown_text, next_webinar_text,
            ended_badge_text, countdown_color, live_button_color, 
            background_color, background_image_url, is_active, created_at
          ) VALUES (
            ${w.id}, ${w.name}, ${w.slug}, ${w.description || ""}, ${w.video_url}, 
            ${w.uploaded_video_id || null}, ${w.video_duration}, ${w.start_hour}, 
            ${w.start_minute}, ${w.recurrence}, ${w.once_date || null}, 
            ${w.day_of_week || null}, ${w.day_of_month || null}, ${w.countdown_text}, 
            ${w.next_webinar_text}, ${w.ended_badge_text}, ${w.countdown_color}, 
            ${w.live_button_color}, ${w.background_color}, ${w.background_image_url}, 
            ${w.is_active}, ${w.created_at}
          )
          ON CONFLICT DO NOTHING
        `;
      }
      console.log(`  ✓ ${webinars.length} webinar(s) importado(s)`);
    }

    if (settings.length > 0) {
      for (const s of settings) {
        await supabaseDb`
          INSERT INTO settings (key, value)
          VALUES (${s.key}, ${s.value})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `;
      }
      console.log(`  ✓ ${settings.length} configuração(ões) importada(s)`);
    }

    await supabaseDb.end();
    console.log("\n✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!");

  } catch (err) {
    console.error("\n❌ ERRO:", err.message);
  } finally {
    await localDb.end();
  }
}

migrate();
