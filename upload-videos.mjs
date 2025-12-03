import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function uploadVideos() {
  console.log("🚀 Upload de vídeos para Supabase Storage\n");

  try {
    // 1. Criar bucket se não existir
    console.log("1️⃣  Verificando bucket...");
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === "webinar-videos");

    if (!bucketExists) {
      console.log("   Criando bucket 'webinar-videos'...");
      const { data, error } = await supabase.storage.createBucket("webinar-videos", {
        public: true,
        fileSizeLimit: 2147483648, // 2GB
      });
      if (error) {
        console.log(`   ⚠ ${error.message}`);
      } else {
        console.log("   ✅ Bucket criado");
      }
    } else {
      console.log("   ✅ Bucket já existe");
    }

    // 2. Upload dos vídeos
    console.log("\n2️⃣  Upload de vídeos...");
    const videosDir = "./videos";
    const files = fs.readdirSync(videosDir).filter(f => f.endsWith(".mp4"));

    for (const file of files) {
      const filePath = path.join(videosDir, file);
      const buffer = fs.readFileSync(filePath);
      const sizeGB = (buffer.length / 1024 / 1024 / 1024).toFixed(3);
      
      const { data, error } = await supabase.storage
        .from("webinar-videos")
        .upload(`videos/${file}`, buffer, { upsert: true });

      if (error) {
        console.log(`   ✗ ${file}: ${error.message}`);
      } else {
        console.log(`   ✅ ${file} (${sizeGB}GB)`);
      }
    }

    console.log("\n✅ Upload concluído!");

  } catch (err) {
    console.error("❌ Erro:", err.message);
  }
}

uploadVideos();
