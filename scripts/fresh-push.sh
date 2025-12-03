#!/bin/bash

echo ""
echo "========================================"
echo "   AutoWebinar - Push Limpo DEFINITIVO"
echo "========================================"
echo ""

# 1. Remover git antigo completamente
echo "[1/7] Removendo historico antigo..."
rm -rf .git .git-backup .git-old 2>/dev/null
echo "Historico removido."

# 2. Criar novo repositório
echo ""
echo "[2/7] Criando repositorio limpo..."
git init --quiet
git branch -M main

# 3. Conectar ao GitHub
echo ""
echo "[3/7] Conectando ao GitHub..."
git remote add origin https://github.com/treinadorafatima/autowebinar.git

# 4. Verificar .gitignore
echo ""
echo "[4/7] Verificando arquivos ignorados..."
echo "Ignorando: node_modules, uploads, attached_assets, dist..."

# 5. Adicionar arquivos
echo ""
echo "[5/7] Adicionando arquivos..."
git add .
git commit -m "AutoWebinar - Deploy limpo" --quiet

# 6. Verificar tamanho ANTES de enviar
echo ""
echo "[6/7] Verificando tamanho do repositorio..."
repo_size=$(du -sm .git/ | cut -f1)
echo "Tamanho: ${repo_size} MB"

if [ "$repo_size" -gt 100 ]; then
  echo ""
  echo "AVISO: Repositorio ainda grande (${repo_size} MB)"
  echo "Arquivos grandes detectados:"
  git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | sed -n 's/^blob //p' | sort -rnk2 | head -10 | while read hash size path; do
    size_mb=$((size / 1024 / 1024))
    if [ "$size_mb" -gt 1 ]; then
      echo "  - ${path}: ${size_mb} MB"
    fi
  done
  echo ""
  read -p "Continuar mesmo assim? (s/n): " continuar
  if [ "$continuar" != "s" ]; then
    echo "Cancelado."
    exit 1
  fi
fi

# 7. Pedir credenciais e enviar
echo ""
echo "[7/7] Enviando para GitHub..."
echo ""
echo "=========================================="
read -p "USERNAME do GitHub: " github_user
read -p "TOKEN do GitHub: " github_token

if [ -z "$github_user" ] || [ -z "$github_token" ]; then
  echo "Credenciais vazias. Cancelado."
  exit 1
fi

echo ""
echo "Enviando... (pode demorar alguns segundos)"

auth_url="https://${github_user}:${github_token}@github.com/treinadorafatima/autowebinar.git"
git push "$auth_url" main --force 2>&1

if [ $? -eq 0 ]; then
  echo ""
  echo "=========================================="
  echo "  SUCESSO!"
  echo "=========================================="
  echo ""
  echo "Codigo enviado para GitHub!"
  echo ""
  echo "Verifique: https://github.com/treinadorafatima/autowebinar"
  echo ""
  echo "Proximo passo: configurar no Render"
  echo "  https://render.com"
  echo ""
else
  echo ""
  echo "=========================================="
  echo "  ERRO"
  echo "=========================================="
  echo ""
  echo "Verifique:"
  echo "  - Token tem permissao 'repo'"
  echo "  - Username esta correto"
  echo ""
fi
