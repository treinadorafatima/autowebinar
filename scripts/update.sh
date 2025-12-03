#!/bin/bash

echo ""
echo "========================================"
echo "   AutoWebinar - Atualizar no Render"
echo "========================================"
echo ""

echo "Preparando atualizacao..."
echo ""

# Adicionar mudanças
git add .

# Pedir descrição
read -p "Descreva a mudanca (ex: corrigido bug no chat): " descricao

if [ -z "$descricao" ]; then
  descricao="Atualizacao $(date '+%Y-%m-%d %H:%M')"
fi

# Commit
git commit -m "$descricao"

if [ $? -ne 0 ]; then
  echo ""
  echo "Nenhuma mudanca detectada para enviar."
  echo ""
  exit 0
fi

# Push
echo ""
echo "Enviando para GitHub..."
git push origin main

if [ $? -eq 0 ]; then
  echo ""
  echo "=========================================="
  echo "  SUCESSO!"
  echo "=========================================="
  echo ""
  echo "Sua atualizacao foi enviada para o GitHub."
  echo ""
  echo "O Render vai detectar automaticamente e"
  echo "fazer um novo deploy em 2-5 minutos."
  echo ""
  echo "IMPORTANTE: Seus dados NAO serao perdidos!"
  echo "O banco de dados e separado do codigo."
  echo ""
  echo "Acompanhe o deploy em: https://dashboard.render.com"
  echo ""
else
  echo ""
  echo "ERRO ao enviar. Verifique sua conexao."
  echo ""
fi
