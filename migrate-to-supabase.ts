import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Local DB connection
const localDb = postgres(process.env.DATABASE_URL || "");

// Supabase connection
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Supabase PostgreSQL connection
const supabaseDb = postgres({
  host: new URL(supabaseUrl).hostname,
  port: 5432,
  database: "postgres",
  username: "postgres",
  password: supabaseServiceKey,
  ssl: "require",
  connection: {
    serverVersion: "15",
  },
});

async function migrationScript() {
  console.log("🚀 Iniciando migração para Supabase...\n");

  try {
    // 1. EXPORTAR DADOS DO BANCO LOCAL
    console.log("📥 [1] Exportando dados do banco local...");
    
    const [admins, webinars, uploadedVideos, comments, settings] = await Promise.all([
      localDb`SELECT * FROM admins`,
      localDb`SELECT * FROM webinars`,
      localDb`SELECT * FROM uploaded_videos`,
      localDb`SELECT * FROM comments`,
      localDb`SELECT * FROM settings LIMIT 10`,
    ]);

    console.log(`  ✓ Admins: ${admins.length}`);
    console.log(`  ✓ Webinars: ${webinars.length}`);
    console.log(`  ✓ Vídeos: ${uploadedVideos.length}`);
    console.log(`  ✓ Comentários: ${comments.length}`);
    console.log(`  ✓ Configurações: ${settings.length}`);

    // 2. UPLOAD DE VÍDEOS PARA SUPABASE
    console.log("\n📤 [2] Upload de vídeos para Supabase Storage...");
    
    const videosDir = path.join(__dirname, "videos");
    const videoFiles = fs.readdirSync(videosDir).filter(f => f.endsWith(".mp4"));

    for (const file of videoFiles) {
      const filePath = path.join(videosDir, file);
      const fileSize = fs.statSync(filePath).size;
      const fileBuffer = fs.readFileSync(filePath);
      
      try {
        const { data, error } = await supabase.storage
          .from("webinar-videos")
          .upload(`videos/${file}`, fileBuffer, { upsert: true });
        
        if (error) {
          console.log(`  ⚠ ${file}: ${error.message}`);
        } else {
          console.log(`  ✓ ${file} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
        }
      } catch (err: any) {
        console.log(`  ✗ ${file}: ${err.message}`);
      }
    }

    // 3. IMPORTAR DADOS NO SUPABASE
    console.log("\n💾 [3] Importando dados no Supabase PostgreSQL...");

    // Limpar dados existentes
    await supabaseDb`DELETE FROM comments`;
    await supabaseDb`DELETE FROM webinars`;
    await supabaseDb`DELETE FROM uploaded_videos`;
    await supabaseDb`DELETE FROM admins`;
    await supabaseDb`DELETE FROM settings`;

    // Inserir admins
    if (admins.length > 0) {
      await supabaseDb`
        INSERT INTO admins (id, email, password, created_at)
        VALUES ${supabaseDb(admins.map(a => [a.id, a.email, a.password, a.created_at]))}
      `;
      console.log(`  ✓ ${admins.length} admin(s) importado(s)`);
    }

    // Inserir webinars
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
            ${w.id}, ${w.name}, ${w.slug}, ${w.description}, ${w.video_url}, 
            ${w.uploaded_video_id}, ${w.video_duration}, ${w.start_hour}, 
            ${w.start_minute}, ${w.recurrence}, ${w.once_date}, 
            ${w.day_of_week}, ${w.day_of_month}, ${w.countdown_text}, 
            ${w.next_webinar_text}, ${w.ended_badge_text}, ${w.countdown_color}, 
            ${w.live_button_color}, ${w.background_color}, ${w.background_image_url}, 
            ${w.is_active}, ${w.created_at}
          )
        `;
      }
      console.log(`  ✓ ${webinars.length} webinar(s) importado(s)`);
    }

    // Inserir vídeos
    if (uploadedVideos.length > 0) {
      for (const v of uploadedVideos) {
        await supabaseDb`
          INSERT INTO uploaded_videos (
            id, uploaded_video_id, filename, title, duration, uploaded_at
          ) VALUES (
            ${v.id}, ${v.uploaded_video_id}, ${v.filename}, ${v.title}, 
            ${v.duration}, ${v.uploaded_at}
          )
        `;
      }
      console.log(`  ✓ ${uploadedVideos.length} registro(s) de vídeo importado(s)`);
    }

    // Inserir comentários
    if (comments.length > 0) {
      for (const c of comments) {
        await supabaseDb`
          INSERT INTO comments (
            id, webinar_id, text, author, timestamp, is_simulated, 
            persist_for_future_sessions, session_date, created_at
          ) VALUES (
            ${c.id}, ${c.webinar_id}, ${c.text}, ${c.author}, ${c.timestamp}, 
            ${c.is_simulated}, ${c.persist_for_future_sessions}, 
            ${c.session_date}, ${c.created_at}
          )
        `;
      }
      console.log(`  ✓ ${comments.length} comentário(s) importado(s)`);
    }

    // Inserir configurações
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

    console.log("\n✅ Migração concluída com sucesso!");
    console.log("📝 Próximos passos:");
    console.log("   1. Reiniciar a aplicação");
    console.log("   2. Testar login e funcionalidades");
    console.log("   3. Verificar se os vídeos carregam corretamente");

  } catch (err: any) {
    console.error("\n❌ Erro durante migração:", err.message);
    console.error(err);
  } finally {
    await localDb.end();
    await supabaseDb.end();
  }
}

migrationScript();
