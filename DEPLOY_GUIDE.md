# Guia Simplificado de Deploy no Render

## 🚀 MÉTODO MAIS FÁCIL (Recomendado)

### Passo 1: GitHub
1. Vá em [github.com](https://github.com) e crie uma nova conta ou faça login
2. Clique em "New" → "New repository"
3. Nome: `autowebinar`
4. Escolha "Public"
5. Clique em "Create repository"

### Passo 2: Conectar seu código ao GitHub
No Replit Shell, execute:
```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu.email@example.com"
git remote add origin https://github.com/SEU_USUARIO/autowebinar.git
git branch -M main
git add .
git commit -m "Initial commit - AutoWebinar"
git push -u origin main
```

**Será pedido seu GitHub token:**
- Vá em GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
- Clique em "Generate new token"
- Marque as opções: `repo`, `gist`, `read:user`
- Clique em "Generate"
- Copie o token e cole no Replit

### Passo 3: Render
1. Vá em [render.com](https://render.com)
2. Clique em "Sign up" → "Continue with GitHub"
3. Autorize o Render
4. Clique em "New +" → "Web Service"
5. Selecione o repositório `autowebinar`
6. Clique em "Connect"

### Passo 4: Configurar Variáveis (IMPORTANTE!)
No formulário do Render, procure por "Environment" e adicione:

```
NODE_ENV = production
DATABASE_URL = [cole aqui sua URL do banco]
SUPABASE_URL = [cole aqui sua URL Supabase]
SUPABASE_SERVICE_KEY = [cole aqui sua chave Supabase]
CLOUDFLARE_ACCOUNT_ID = [seu ID Cloudflare]
CLOUDFLARE_ACCESS_KEY_ID = [sua chave Cloudflare]
CLOUDFLARE_ACCESS_KEY_SECRET = [sua secreta Cloudflare]
```

Para pegar essas variáveis:
- No Replit, abra o Terminal e execute: `cat .env`
- Copie os valores (MENOS as aspas)
- Cole no Render

### Passo 5: Deploy
1. Clique em "Create Web Service"
2. Aguarde 5-15 minutos enquanto o Render faz build
3. Quando terminar, clique na URL do seu app (ex: `https://autowebinar.onrender.com`)
4. Pronto! ✅

---

## 📝 ATUALIZAÇÕES FUTURAS

Sempre que fizer mudanças no Replit:

```bash
git add .
git commit -m "Descrição da mudança"
git push origin main
```

O Render fará deploy **automaticamente** em poucos minutos!

---

## ❌ SOLUÇÃO DE PROBLEMAS

### Erro: "Build failed"
- Verifique o terminal do Render (Logs)
- Procure pela mensagem de erro
- Geralmente é variável de ambiente faltando

### Erro: "Cannot connect to database"
- Verifique se as credenciais do banco estão corretas
- Teste a conexão no Replit primeiro

### App carrega mas mostra erro
- Abra o Inspector (F12) e procure por erros
- Verifique os Logs do Render
- Teste no Replit para isolar o problema

---

## 💡 DICAS

- Use o **Replit para testar** antes de fazer push
- Sempre teste o comando `npm run dev` localmente
- Se der erro no Render, é mais fácil debugar no Replit
- Backup: Faça commits regulares (`git push`)
