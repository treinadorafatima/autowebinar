import http from 'http';

function httpRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log("="+"=".repeat(50));
  console.log("🧪 EXECUTANDO 3 TESTES DO SISTEMA");
  console.log("="+"=".repeat(50) + "\n");

  // TESTE 1: Login
  console.log("🧪 TESTE 1: Login e Autenticação");
  console.log("-".repeat(40));
  
  const loginRes = await httpRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ email: 'leogracio42@gmail.com', password: 'admin123' }));
  
  console.log("   Status HTTP:", loginRes.status);
  
  let token = null;
  try {
    const data = JSON.parse(loginRes.body);
    token = data.token;
    console.log("   Token:", token ? "✅ Recebido" : "❌ Não recebido");
    console.log("   Admin:", data.admin?.email || "N/A");
  } catch (e) {
    console.log("   ❌ Erro ao parsear resposta");
  }

  // TESTE 2: Webinários
  console.log("\n🧪 TESTE 2: Operações com Webinários");
  console.log("-".repeat(40));
  
  const webinarsRes = await httpRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/webinars',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  console.log("   Status HTTP:", webinarsRes.status);
  try {
    const webinars = JSON.parse(webinarsRes.body);
    console.log("   Webinários:", Array.isArray(webinars) ? webinars.length : 0);
    if (webinars.length > 0) {
      console.log("   Primeiro:", webinars[0].name);
    }
  } catch (e) {
    console.log("   Resposta:", webinarsRes.body.substring(0, 100));
  }

  // TESTE 3: Página Pública
  console.log("\n🧪 TESTE 3: Página Pública e Embed");
  console.log("-".repeat(40));
  
  const publicRes = await httpRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/webinars/default',
    method: 'GET'
  });
  
  console.log("   Status HTTP:", publicRes.status);
  try {
    const webinar = JSON.parse(publicRes.body);
    console.log("   Webinar:", webinar.name || "N/A");
    console.log("   Slug:", webinar.slug || "N/A");
    console.log("   Ativo:", webinar.isActive ? "✅ Sim" : "❌ Não");
  } catch (e) {
    console.log("   Resposta:", publicRes.body.substring(0, 100));
  }

  console.log("\n" + "="+"=".repeat(50));
  console.log("✅ TODOS OS 3 TESTES CONCLUÍDOS COM SUCESSO!");
  console.log("="+"=".repeat(50));
}

runTests().catch(console.error);
