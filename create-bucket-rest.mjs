// Tentar criar bucket usando fetch diretamente
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

async function createBucket() {
  console.log("📦 Criando bucket via REST API...\n");

  const response = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: 'webinar-videos',
      name: 'webinar-videos',
      public: true
    })
  });

  const data = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));

  if (response.ok) {
    console.log("\n✅ Bucket criado com sucesso!");
  } else {
    console.log("\n⚠️ Erro ao criar bucket");
  }
}

createBucket();
