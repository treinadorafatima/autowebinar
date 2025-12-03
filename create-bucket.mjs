import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function createBucket() {
  console.log("📦 Tentando criar bucket sem limite de tamanho...\n");

  const { error } = await supabase.storage.createBucket("webinar-videos", {
    public: true
  });

  if (error) {
    console.log("❌ Erro:", error.message);
    
    // Se for erro de permissão, mostrar instruções
    if (error.message.includes("exceeded") || error.message.includes("permission")) {
      console.log("\n📝 INSTRUÇÕES PARA CRIAR O BUCKET MANUALMENTE:\n");
      console.log("1. Acesse: https://supabase.com/dashboard/project/erodfrfuuhxdaeqfjzsn/storage/buckets");
      console.log("2. Clique em 'New bucket'");
      console.log("3. Nome: webinar-videos");
      console.log("4. Marque 'Public bucket'");
      console.log("5. Clique 'Save'\n");
    }
  } else {
    console.log("✅ Bucket criado com sucesso!");
  }
}

createBucket();
