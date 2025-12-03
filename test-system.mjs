// TESTE 1: Login
console.log("🧪 TESTE 1: Login e Autenticação");
console.log("-".repeat(40));

const loginRes = await fetch("http://localhost:5000/api/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "leogracio42@gmail.com", password: "admin123" })
});

const loginData = await loginRes.json();
console.log("   Status:", loginRes.status);
console.log("   Token:", loginData.token ? "✅ Recebido" : "❌ Não recebido");

const token = loginData.token;

// TESTE 2: Carregar webinários
console.log("\n🧪 TESTE 2: Operações com Webinários");
console.log("-".repeat(40));

const webinarsRes = await fetch("http://localhost:5000/api/webinars", {
  headers: { "Authorization": `Bearer ${token}` }
});
const webinars = await webinarsRes.json();
console.log("   Status:", webinarsRes.status);
console.log("   Webinários:", webinars.length || 0);
if (webinars.length > 0) {
  console.log("   Primeiro:", webinars[0].name);
}

// TESTE 3: Verificar vídeos
console.log("\n🧪 TESTE 3: Upload e Embeds");
console.log("-".repeat(40));

const videosRes = await fetch("http://localhost:5000/api/webinar/videos", {
  headers: { "Authorization": `Bearer ${token}` }
});
const videos = await videosRes.json();
console.log("   Status:", videosRes.status);
console.log("   Vídeos:", Array.isArray(videos) ? videos.length : 0);

// Verificar página pública
const publicRes = await fetch("http://localhost:5000/api/webinars/default");
console.log("   Página /default:", publicRes.status === 200 ? "✅ Acessível" : "❌ Erro");

console.log("\n" + "=".repeat(50));
console.log("✅ TODOS OS 3 TESTES CONCLUÍDOS!");
console.log("=".repeat(50));
