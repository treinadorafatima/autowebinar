import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

console.log("🔧 Configurando Supabase Storage...\n");
console.log("URL:", supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupStorage() {
  try {
    // Listar buckets existentes
    console.log("📋 Listando buckets existentes...");
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.log("❌ Erro ao listar buckets:", listError.message);
      console.log("\n⚠️  A chave configurada é a 'anon key', que não tem permissão para gerenciar Storage.");
      console.log("\n📝 Para resolver, você tem 2 opções:\n");
      console.log("OPÇÃO 1: Criar bucket manualmente no Supabase:");
      console.log("   1. Acesse: https://supabase.com/dashboard/project/erodfrfuuhxdaeqfjzsn/storage");
      console.log("   2. Clique em 'New bucket'");
      console.log("   3. Nome: webinar-videos");
      console.log("   4. Marque 'Public bucket'");
      console.log("   5. Clique 'Create bucket'\n");
      console.log("OPÇÃO 2: Usar a service_role key:");
      console.log("   1. Acesse: https://supabase.com/dashboard/project/erodfrfuuhxdaeqfjzsn/settings/api");
      console.log("   2. Copie a 'service_role' key (não a anon!)");
      console.log("   3. Atualize SUPABASE_SERVICE_KEY nos Secrets");
      return;
    }

    console.log("Buckets encontrados:", buckets?.length || 0);
    buckets?.forEach(b => console.log("  -", b.name, b.public ? "(público)" : "(privado)"));

    // Verificar se bucket existe
    const bucketName = "webinar-videos";
    const exists = buckets?.some(b => b.name === bucketName);

    if (!exists) {
      console.log(`\n📦 Criando bucket '${bucketName}'...`);
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 2147483648, // 2GB
      });

      if (createError) {
        console.log("❌ Erro ao criar bucket:", createError.message);
      } else {
        console.log("✅ Bucket criado com sucesso!");
      }
    } else {
      console.log(`\n✅ Bucket '${bucketName}' já existe!`);
    }

  } catch (err) {
    console.error("❌ Erro:", err.message);
  }
}

setupStorage();
