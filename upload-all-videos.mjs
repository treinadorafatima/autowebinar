import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function uploadVideos() {
  console.log("🎬 Upload de vídeos para Supabase Storage\n");

  const videosDir = "./videos";
  const files = fs.readdirSync(videosDir).filter(f => f.endsWith(".mp4"));
  
  console.log(`Encontrados ${files.length} vídeos para upload:\n`);

  for (const file of files) {
    const filePath = path.join(videosDir, file);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log(`📤 Enviando: ${file} (${sizeMB}MB)...`);
    
    const buffer = fs.readFileSync(filePath);
    
    const { data, error } = await supabase.storage
      .from("webinar-videos")
      .upload(`videos/${file}`, buffer, { 
        upsert: true,
        contentType: 'video/mp4'
      });

    if (error) {
      console.log(`   ❌ Erro: ${error.message}`);
    } else {
      // Obter URL pública
      const { data: urlData } = supabase.storage
        .from("webinar-videos")
        .getPublicUrl(`videos/${file}`);
      
      console.log(`   ✅ Sucesso!`);
      console.log(`   📎 URL: ${urlData.publicUrl}\n`);
    }
  }

  console.log("✅ Upload concluído!");
}

uploadVideos().catch(console.error);
