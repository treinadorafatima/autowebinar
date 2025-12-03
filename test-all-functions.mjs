import http from 'http';

function httpRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function testAllFunctions() {
  console.log("="+"=".repeat(60));
  console.log("🧪 TESTANDO TODAS AS FUNÇÕES DO SISTEMA");
  console.log("="+"=".repeat(60) + "\n");

  let passed = 0;
  let failed = 0;

  // 1. Login
  console.log("1️⃣ FUNÇÃO: Login Admin");
  const login = await httpRequest({
    hostname: 'localhost', port: 5000,
    path: '/api/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ email: 'leogracio42@gmail.com', password: 'admin123' }));
  
  let token = null;
  try {
    const data = JSON.parse(login.body);
    token = data.token;
    if (token) { console.log("   ✅ Login OK - Token recebido"); passed++; }
    else { console.log("   ❌ Login falhou"); failed++; }
  } catch { console.log("   ❌ Erro ao parsear resposta"); failed++; }

  // 2. Listar Webinários
  console.log("\n2️⃣ FUNÇÃO: Listar Webinários");
  const webinars = await httpRequest({
    hostname: 'localhost', port: 5000,
    path: '/api/webinars', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  try {
    const data = JSON.parse(webinars.body);
    if (Array.isArray(data) && data.length > 0) {
      console.log(`   ✅ ${data.length} webinário(s) encontrado(s)`);
      passed++;
    } else {
      console.log("   ⚠️ Nenhum webinário"); 
    }
  } catch { console.log("   ❌ Erro:", webinars.body.substring(0, 50)); failed++; }

  // 3. Página Pública
  console.log("\n3️⃣ FUNÇÃO: Página Pública /default");
  const pub = await httpRequest({
    hostname: 'localhost', port: 5000,
    path: '/api/webinars/default', method: 'GET'
  });
  
  try {
    const data = JSON.parse(pub.body);
    if (data.name) {
      console.log(`   ✅ Webinar: ${data.name}`);
      passed++;
    } else {
      console.log("   ❌ Dados incompletos"); failed++;
    }
  } catch { console.log("   ❌ Erro"); failed++; }

  // 4. Listar Vídeos
  console.log("\n4️⃣ FUNÇÃO: Listar Vídeos");
  const videos = await httpRequest({
    hostname: 'localhost', port: 5000,
    path: '/api/webinar/videos', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  try {
    const data = JSON.parse(videos.body);
    if (Array.isArray(data)) {
      console.log(`   ✅ ${data.length} vídeo(s) no banco`);
      if (data.length > 0) {
        console.log(`      - ${data[0].filename || data[0].uploadedVideoId}`);
      }
      passed++;
    } else {
      console.log("   ❌ Resposta inválida"); failed++;
    }
  } catch { console.log("   ❌ Erro:", videos.body.substring(0, 50)); failed++; }

  // 5. Comentários
  console.log("\n5️⃣ FUNÇÃO: Comentários");
  const comments = await httpRequest({
    hostname: 'localhost', port: 5000,
    path: '/api/webinar/comments', method: 'GET'
  });
  
  try {
    const data = JSON.parse(comments.body);
    if (Array.isArray(data)) {
      console.log(`   ✅ ${data.length} comentário(s)`);
      passed++;
    } else {
      console.log("   ❌ Resposta inválida"); failed++;
    }
  } catch { console.log("   ❌ Erro"); failed++; }

  // 6. Configurações
  console.log("\n6️⃣ FUNÇÃO: Configurações");
  const settings = await httpRequest({
    hostname: 'localhost', port: 5000,
    path: '/api/settings', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (settings.status === 200) {
    console.log("   ✅ Configurações acessíveis");
    passed++;
  } else {
    console.log("   ⚠️ Status:", settings.status);
  }

  // 7. Embed Code
  console.log("\n7️⃣ FUNÇÃO: Código Embed");
  const embed = await httpRequest({
    hostname: 'localhost', port: 5000,
    path: '/api/webinars/default/embed-code', method: 'GET'
  });
  
  try {
    const data = JSON.parse(embed.body);
    if (data.embedCode && data.embedCode.includes('iframe')) {
      console.log("   ✅ Código embed gerado");
      passed++;
    } else {
      console.log("   ❌ Embed inválido"); failed++;
    }
  } catch { console.log("   ❌ Erro"); failed++; }

  // Resumo
  console.log("\n" + "="+"=".repeat(60));
  console.log(`📊 RESULTADO: ${passed} passou, ${failed} falhou`);
  console.log("="+"=".repeat(60));
}

testAllFunctions().catch(console.error);
