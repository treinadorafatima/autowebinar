#!/bin/bash

echo ""
echo "========================================"
echo "   AutoWebinar - Deploy para Render"
echo "========================================"
echo ""

# PASSO 1: Verificar se git está configurado
echo "[1/5] Verificando configuração do Git..."
if [ -z "$(git config user.name)" ]; then
  echo ""
  echo "Precisamos configurar o Git primeiro."
  echo ""
  read -p "Digite seu nome: " git_name
  read -p "Digite seu email: " git_email
  
  git config --global user.name "$git_name"
  git config --global user.email "$git_email"
  echo "Git configurado!"
else
  echo "Git já configurado como: $(git config user.name)"
fi

echo ""

# PASSO 2: Verificar se existe repositório remoto
echo "[2/5] Verificando conexão com GitHub..."
remote_url=$(git remote get-url origin 2>/dev/null)

if [ -z "$remote_url" ]; then
  echo ""
  echo "=========================================="
  echo "  ATENÇÃO: Repositório GitHub necessário"
  echo "=========================================="
  echo ""
  echo "Antes de continuar, você precisa:"
  echo ""
  echo "1. Abra https://github.com no navegador"
  echo "2. Faça login (ou crie uma conta)"
  echo "3. Clique no botão '+' -> 'New repository'"
  echo "4. Nome: autowebinar"
  echo "5. Deixe como 'Public'"
  echo "6. NAO marque nenhuma opcao extra"
  echo "7. Clique em 'Create repository'"
  echo ""
  read -p "Cole a URL do repositorio (ex: https://github.com/user/repo.git): " repo_url
  
  if [ -z "$repo_url" ]; then
    echo "URL vazia. Saindo..."
    exit 1
  fi
  
  git remote add origin "$repo_url"
  remote_url="$repo_url"
  echo "Repositorio conectado!"
else
  echo "Repositorio encontrado: $remote_url"
fi

echo ""

# PASSO 3: Preparar commit
echo "[3/5] Preparando codigo para envio..."
git add .
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null || echo "Nenhuma mudanca nova"

echo ""

# PASSO 4: PEDIR CREDENCIAIS DIRETAMENTE
echo "[4/5] Autenticacao GitHub"
echo ""
echo "=========================================="
echo "  CREDENCIAIS NECESSARIAS"
echo "=========================================="
echo ""
echo "Voce precisa de um TOKEN do GitHub."
echo ""
echo "Para criar o TOKEN (se ainda nao tem):"
echo "  1. Abra: https://github.com/settings/tokens"
echo "  2. Clique 'Generate new token (classic)'"
echo "  3. Marque: repo, gist, read:user"
echo "  4. Clique 'Generate token'"
echo "  5. COPIE o token (so aparece 1 vez!)"
echo ""
echo "=========================================="
echo ""

read -p "Digite seu USERNAME do GitHub: " github_user
read -p "Cole seu TOKEN do GitHub: " github_token

if [ -z "$github_user" ] || [ -z "$github_token" ]; then
  echo ""
  echo "ERRO: Username ou token vazio. Saindo..."
  exit 1
fi

echo ""

# Extrair o caminho do repositório (remover https://github.com/)
repo_path=$(echo "$remote_url" | sed 's|https://github.com/||' | sed 's|.git$||')

# Construir URL com credenciais
auth_url="https://${github_user}:${github_token}@github.com/${repo_path}.git"

# Garantir que a branch é main
git branch -M main 2>/dev/null

# Fazer push com credenciais
echo "[5/5] Enviando para GitHub..."
git push "$auth_url" main --force

if [ $? -eq 0 ]; then
  echo ""
  echo "=========================================="
  echo "  SUCESSO! Codigo enviado para GitHub"
  echo "=========================================="
  echo ""
  echo "Proximo passo: Configurar no Render"
  echo ""
  echo "1. Acesse: https://render.com"
  echo "2. Clique 'Sign up' -> 'Continue with GitHub'"
  echo "3. Autorize o Render"
  echo "4. Clique 'New +' -> 'Web Service'"
  echo "5. Selecione o repositorio 'autowebinar'"
  echo "6. Em 'Environment', adicione suas variaveis:"
  echo ""
  echo "   Para ver suas variaveis, execute:"
  echo "   cat .env"
  echo ""
  echo "7. Clique 'Create Web Service'"
  echo "8. Aguarde 5-10 minutos"
  echo ""
  echo "=========================================="
  echo ""
else
  echo ""
  echo "=========================================="
  echo "  ERRO ao enviar para GitHub"
  echo "=========================================="
  echo ""
  echo "Possiveis causas:"
  echo "  - Token incorreto ou expirado"
  echo "  - Username incorreto"
  echo "  - Token sem permissao 'repo'"
  echo ""
  echo "Gere um novo token e tente novamente:"
  echo "  bash scripts/deploy.sh"
  echo ""
fi
