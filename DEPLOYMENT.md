# Guia de Deployment

## Pré-requisitos
- Node.js 18+
- PostgreSQL 12+
- 1GB de espaço em disco (para vídeos)

## 1. Preparar Hospedagem

Crie as variáveis de ambiente:
```bash
DATABASE_URL=postgresql://user:password@host:5432/database
PORT=5000
NODE_ENV=production
```

## 2. Build e Setup

```bash
# Instalar dependências
npm install

# Executar migrações do banco
npm run db:push

# Build para produção
npm run build
```

## 3. Iniciar o App

```bash
npm start
```

O aplicativo estará disponível em: `http://seu-servidor:5000`

## 4. Criar Diretório de Vídeos

Certifique-se que existe o diretório `/videos` com permissões de escrita:
```bash
mkdir -p videos
chmod 755 videos
```

## Credenciais Admin Padrão

- **Email:** leogracio42@gmail.com
- **Senha:** admin123

⚠️ **IMPORTANTE:** Altere a senha do admin após primeiro login via painel admin.

## Endpoints Principais

- **Frontend:** `http://seu-servidor:5000/`
- **Admin Panel:** `http://seu-servidor:5000/admin`
- **API:** `http://seu-servidor:5000/api/`

## Troubleshooting

**Erro: "database connection failed"**
- Verifique DATABASE_URL
- Confirme que PostgreSQL está acessível

**Erro: "videos directory not found"**
- Crie o diretório: `mkdir -p videos`

**Vídeo travando com muitos acessos?**
- Use o botão ⚡ no admin para otimizar e carregar em cache
- Aumentar PORT de upstream se estiver usando proxy

## Performance

Para máximo desempenho com muitos usuários:
1. Clique no botão ⚡ na seção de vídeos do admin
2. Configure proxy reverso (nginx/apache)
3. Considere CDN para servir vídeos em escala

## Backup

Faça backup regularmente:
```bash
# Backup PostgreSQL
pg_dump $DATABASE_URL > backup.sql

# Backup de vídeos
tar -czf videos-backup.tar.gz videos/
```
