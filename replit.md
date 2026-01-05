# AutoWebinar - Sistema de Webinars Automatizados

## Overview
AutoWebinar é um sistema completo de webinars automatizados, projetado para simular transmissões ao vivo com agendamentos configuráveis. Cada webinário opera de forma independente, com vídeo, comentários simulados, agendamento e aparência personalizáveis. O projeto inclui um painel administrativo robusto, funcionalidades de chat ao vivo para participantes reais, e a capacidade de gerar códigos embed para integração em plataformas externas. O objetivo é oferecer uma solução flexível e escalável para empresas e criadores de conteúdo que desejam automatizar suas estratégias de webinars.

## User Preferences
- Idioma: Português (Brasil)
- Design: Moderno e profissional, tema escuro
- Prioridade: Sistema multi-webinário independente com embed

## System Architecture

### UI/UX Decisions
O design utiliza React com TypeScript, Tailwind CSS e Shadcn UI para componentes, garantindo uma interface moderna, responsiva e profissional com um tema escuro predominante. A estrutura é focada em abas para a configuração individual de cada webinário (Config, Aparência, Vídeo, Comentários Simulados, Embed), proporcionando uma experiência de usuário intuitiva e eficiente. O Designer IA auxilia na personalização de cores e textos.

### Technical Implementations
O frontend é construído com React, TypeScript, Tailwind CSS e Shadcn UI, utilizando Wouter para roteamento e TanStack Query para gerenciamento de estado. O backend é desenvolvido com Express.js e TypeScript, interagindo com PostgreSQL (Neon) via Drizzle ORM.
A aplicação suporta múltiplos webinários independentes, cada um com configurações personalizadas, incluindo vídeo, agendamento flexível (diário, semanal, mensal, único) e comentários sincronizados com o vídeo. Há um chat ao vivo para interação em tempo real dos participantes.
O sistema inclui um módulo de IA configurável para geração de roteiros e personalização de páginas, com suporte a provedores como OpenAI e DeepSeek.
A gestão de usuários e assinaturas é feita através de um sistema SaaS completo, com checkout transparente e integração com gateways de pagamento como Mercado Pago e Stripe para cobranças únicas e recorrentes.
O controle de quantidade de assistentes simula a variação de público, e o armazenamento de arquivos (vídeos, imagens) utiliza Supabase Storage com fallback para disco local.

### Feature Specifications
- **Múltiplos Webinários Independentes**: Cada webinário possui configurações, vídeo e comentários únicos.
- **Interface Administrativa**: Painel com interface de abas para gerenciamento detalhado de cada webinário.
- **Designer IA**: Ferramenta conversacional com IA para sugestões de design (cores, textos) e roteirização.
- **Comentários Sincronizados**: Comentários simulados aparecem em momentos específicos do vídeo.
- **Chat ao Vivo**: Funcionalidade de chat para interação dos participantes em tempo real.
- **Agendamento Flexível**: Opções de agendamento diário, semanal, mensal ou único para os webinars.
- **Código Embed**: Geração de iframe para fácil integração em sites externos.
- **Personalização Abrangente**: Capacidade de personalizar cores, textos e imagens por webinário.
- **Sistema SaaS Integrado**: Gestão de planos de assinatura, pagamentos e webhooks para Stripe e Mercado Pago.
- **Controle de Assistentes**: Simulação dinâmica do número de participantes.
- **Exportação de Conteúdo**: Exportação de roteiros e mensagens para TXT e Word (.docx).
- **Rastreamento de Eventos**: Integração com Facebook Pixel e API de Conversões.
- **Transcrição de Vídeo com IA**: Transcrição automática de vídeos usando Deepgram API para gerar mensagens baseadas no conteúdo do vídeo.

### System Design Choices
A arquitetura adota um design multi-inquilino para os webinars, onde cada um é uma entidade autônoma. A separação entre frontend e backend permite escalabilidade e manutenção independente. O uso de um ORM como Drizzle facilita a interação com o banco de dados PostgreSQL. A estratégia de armazenamento híbrida (Supabase Storage com fallback local) garante robustez. A modularidade do sistema de checkout e IA permite a integração de novos provedores e funcionalidades com relativa facilidade.

## Google Calendar Integration (Implementado)
- **Fluxo de Autenticação**: Cada admin conecta sua própria conta Google via OAuth2
- **Isolamento de dados**: Cada admin tem acesso apenas às suas agendas Google
- **Múltiplas agendas por admin**: Um admin pode ter várias agendas (pessoal, comercial, etc)
- **Vinculação com agentes**: Cada agente de IA pode ser configurado para usar UMA agenda específica
- **Arquitetura de dados**:
  - `googleCalendarTokens`: Armazena tokens OAuth (accessToken, refreshToken) por admin (centralizado)
  - `admin_google_calendars`: Armazena apenas metadados das agendas (id, name, googleCalendarId, isPrimary) sem tokens
  - `ai_agents.calendarEnabled`: Flag se o agente usa agendamentos
  - `ai_agents.adminCalendarId`: ID da agenda que o agente usará (FK para admin_google_calendars)
- **Validações**:
  - Server-side: calendarEnabled requer adminCalendarId válido e pertencente ao admin
  - Client-side: loading state ao carregar agendas, validação antes de salvar
- **Sincronização**: Callback OAuth sincroniza agendas (adiciona novas, atualiza existentes, protege agendas em uso)

## External Dependencies
- **PostgreSQL (Neon)**: Banco de dados relacional para armazenamento de dados da aplicação.
- **Supabase Storage**: Serviço de armazenamento de objetos para vídeos e imagens dos webinars.
- **Google Calendar API**: Para integração de agendamentos automáticos via agentes de IA (OAuth2).
- **OpenAI API**: Utilizada pelo Designer IA para sugestões de design e geração de roteiros.
- **DeepSeek API**: Alternativa de provedor de IA para o Designer IA.
- **Stripe**: Gateway de pagamento para processamento de pagamentos e assinaturas recorrentes.
- **Mercado Pago**: Gateway de pagamento para processamento de pagamentos e assinaturas recorrentes.
- **Facebook Pixel**: Para rastreamento de eventos no frontend.
- **Facebook Conversions API**: Para rastreamento de eventos server-side.
- **Deepgram API**: Transcrição de áudio/vídeo para o gerador de mensagens ($0.0043/min).

## Tracking System (Rastreamento de Eventos)

### Arquitetura
O sistema de tracking é dividido em três plataformas independentes por webinário:

1. **Meta (Facebook Pixel + Conversions API)**
   - Pixel ID: Identificador do pixel para tracking no navegador
   - Access Token: Token de acesso para API de Conversões (server-side)
   - Test Event Code: Código opcional para testes no Events Manager
   - Eventos: PageView, Lead, ChatMessage (custom), InitiateCheckout

2. **Google Analytics (GA4)**
   - Measurement ID: ID do GA4 (formato G-XXXXXXXX)
   - Eventos: page_view, generate_lead, webinar_chat, begin_checkout

3. **Google Ads**
   - Conversões configuráveis por evento (lead, initiate_checkout)
   - Cada conversão tem conversionId (AW-XXXXXXXX) e conversionLabel

### Fluxo de Eventos
- **PageView**: Dispara ao abrir a página de inscrição
- **Lead**: Dispara ao se cadastrar no formulário de inscrição
- **ChatMessage**: Dispara ao enviar comentário no chat (evento personalizado)
- **InitiateCheckout**: Dispara ao clicar no botão de oferta

### Implementação Server-Side (Meta CAPI)
- Endpoint: POST /api/webinars/:id/track-event
- Validação com Zod schema
- Hashing SHA256 de dados do usuário (email, telefone, nome)
- Event ID para deduplicação
- Dados adicionais: IP do cliente, User-Agent, fbp/fbc cookies

### Segurança
- Access tokens são armazenados no banco de dados (por webinário)
- Nunca são expostos para clientes públicos
- API pública retorna apenas flag `metaCapiEnabled: boolean`
- Endpoint de tracking busca credenciais internamente
- **NOTA**: Para produção, considerar criptografia adicional ou uso de secrets manager