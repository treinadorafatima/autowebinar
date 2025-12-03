import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

console.log("🔑 Verificando chave Supabase...\n");
console.log("URL:", url);
console.log("Key (primeiros 50 chars):", key?.substring(0, 50) + "...");

// Decodificar JWT para verificar role
const payload = key?.split('.')[1];
if (payload) {
  const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
  console.log("\n📋 JWT Payload:");
  console.log("   Role:", decoded.role);
  console.log("   Ref:", decoded.ref);
  console.log("   Exp:", new Date(decoded.exp * 1000).toISOString());
}

// Criar cliente com opções corretas para service_role
const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log("\n📦 Testando criação de bucket...");

const { data, error } = await supabase.storage.createBucket('webinar-videos', {
  public: true
});

if (error) {
  console.log("❌ Erro:", error.message);
  
  // Se já existe, tentar listar
  if (error.message.includes("already exists")) {
    console.log("\n✅ Bucket já existe! Listando buckets...");
    const { data: buckets } = await supabase.storage.listBuckets();
    console.log("Buckets:", buckets?.map(b => b.name));
  }
} else {
  console.log("✅ Bucket criado:", data);
}
