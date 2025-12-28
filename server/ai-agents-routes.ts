import { Express, Request, Response } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { sessions as sessionsTable } from "@shared/schema";
import { eq } from "drizzle-orm";
import { processMessage } from "./ai-processor";

interface AuthResult {
  admin: Awaited<ReturnType<typeof storage.getAdminByEmail>>;
  error?: string;
  errorCode?: number;
}

const AI_PROVIDERS = {
  openai: {
    name: "OpenAI (GPT)",
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o Mini", costPer1kTokens: 0.002 },
      { id: "gpt-4o", name: "GPT-4o", costPer1kTokens: 0.015 },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", costPer1kTokens: 0.01 },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", costPer1kTokens: 0.0005 },
    ],
    apiKeyHint: "Obtenha em platform.openai.com/api-keys",
  },
  gemini: {
    name: "Google Gemini",
    models: [
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", costPer1kTokens: 0.0001 },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", costPer1kTokens: 0.002 },
      { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash (Exp)", costPer1kTokens: 0.0001 },
    ],
    apiKeyHint: "Obtenha em aistudio.google.com/apikey",
  },
  deepseek: {
    name: "DeepSeek",
    models: [
      { id: "deepseek-chat", name: "DeepSeek Chat", costPer1kTokens: 0.0005 },
      { id: "deepseek-coder", name: "DeepSeek Coder", costPer1kTokens: 0.0005 },
    ],
    apiKeyHint: "Obtenha em platform.deepseek.com",
  },
  grok: {
    name: "xAI (Grok)",
    models: [
      { id: "grok-2", name: "Grok 2", costPer1kTokens: 0.005 },
      { id: "grok-2-mini", name: "Grok 2 Mini", costPer1kTokens: 0.002 },
    ],
    apiKeyHint: "Obtenha em console.x.ai",
  },
};

async function validateSessionAndGetAdmin(req: Request): Promise<AuthResult> {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return { admin: undefined, error: "Não autenticado", errorCode: 401 };
  }
  
  try {
    const result = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.token, token))
      .limit(1);
    
    if (result.length === 0) {
      return { admin: undefined, error: "Sessão inválida", errorCode: 401 };
    }
    
    const session = result[0];
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
      return { admin: undefined, error: "Sessão expirada", errorCode: 401 };
    }
    
    const admin = await storage.getAdminByEmail(session.email);
    if (!admin) {
      return { admin: undefined, error: "Usuário não encontrado", errorCode: 401 };
    }
    
    if (!admin.isActive) {
      return { admin: undefined, error: "Usuário inativo", errorCode: 403 };
    }
    
    return { admin };
  } catch (error) {
    console.error("[ai-agents] Error validating session:", error);
    return { admin: undefined, error: "Erro ao validar sessão", errorCode: 500 };
  }
}

export function registerAiAgentsRoutes(app: Express) {
  console.log("[ai-agents] Routes registered");

  app.get("/api/ai-agents/providers", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }
      res.json(AI_PROVIDERS);
    } catch (error: any) {
      console.error("[ai-agents] Error getting providers:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ai-agents", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const agents = await storage.listAiAgentsByAdmin(admin.id);
      const agentsWithMaskedKeys = agents.map(agent => ({
        ...agent,
        apiKey: agent.apiKey ? "sk-****" + agent.apiKey.slice(-4) : "",
      }));

      res.json(agentsWithMaskedKeys);
    } catch (error: any) {
      console.error("[ai-agents] Error listing agents:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ai-agents/:id", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const agent = await storage.getAiAgentById(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "Agente não encontrado" });
      }
      if (agent.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      res.json({
        ...agent,
        apiKey: agent.apiKey ? "sk-****" + agent.apiKey.slice(-4) : "",
      });
    } catch (error: any) {
      console.error("[ai-agents] Error getting agent:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai-agents", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { whatsappAccountId, name, provider, apiKey, model, systemPrompt, calendarEnabled, adminCalendarId, ...rest } = req.body;

      if (!whatsappAccountId || !name || !apiKey || !systemPrompt) {
        return res.status(400).json({ error: "Campos obrigatórios: whatsappAccountId, name, apiKey, systemPrompt" });
      }

      if (calendarEnabled && !adminCalendarId) {
        return res.status(400).json({ error: "Para habilitar agendamentos, selecione uma agenda Google conectada" });
      }

      if (adminCalendarId) {
        const calendars = await storage.getConnectedAdminCalendars(admin.id);
        const validCalendar = calendars.find(c => c.id === adminCalendarId);
        if (!validCalendar) {
          return res.status(400).json({ error: "Agenda selecionada não encontrada ou não pertence a esta conta" });
        }
      }

      const account = await storage.getWhatsappAccountById(whatsappAccountId);
      if (!account || account.adminId !== admin.id) {
        return res.status(404).json({ error: "Conta WhatsApp não encontrada" });
      }

      const existingAgent = await storage.getAiAgentByWhatsappAccount(whatsappAccountId);
      if (existingAgent) {
        return res.status(400).json({ error: "Já existe um agente ativo para esta conta WhatsApp" });
      }

      const agent = await storage.createAiAgent({
        adminId: admin.id,
        whatsappAccountId,
        name,
        provider: provider || "openai",
        apiKey,
        model: model || "gpt-4o-mini",
        systemPrompt,
        calendarEnabled: calendarEnabled || false,
        adminCalendarId: adminCalendarId || null,
        ...rest,
      });

      res.json({
        ...agent,
        apiKey: "sk-****" + agent.apiKey.slice(-4),
      });
    } catch (error: any) {
      console.error("[ai-agents] Error creating agent:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/ai-agents/:id", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const agent = await storage.getAiAgentById(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "Agente não encontrado" });
      }
      if (agent.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const updateData = { ...req.body };
      if (updateData.apiKey && updateData.apiKey.startsWith("sk-****")) {
        delete updateData.apiKey;
      }

      if (updateData.calendarEnabled && !updateData.adminCalendarId) {
        return res.status(400).json({ error: "Para habilitar agendamentos, selecione uma agenda Google conectada" });
      }

      if (updateData.adminCalendarId) {
        const calendars = await storage.getConnectedAdminCalendars(admin.id);
        const validCalendar = calendars.find(c => c.id === updateData.adminCalendarId);
        if (!validCalendar) {
          return res.status(400).json({ error: "Agenda selecionada não encontrada ou não pertence a esta conta" });
        }
      }

      const updatedAgent = await storage.updateAiAgent(req.params.id, updateData);
      res.json({
        ...updatedAgent,
        apiKey: updatedAgent?.apiKey ? "sk-****" + updatedAgent.apiKey.slice(-4) : "",
      });
    } catch (error: any) {
      console.error("[ai-agents] Error updating agent:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/ai-agents/:id", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const agent = await storage.getAiAgentById(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "Agente não encontrado" });
      }
      if (agent.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      await storage.deleteAiAgent(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[ai-agents] Error deleting agent:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ai-agents/:id/conversations", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const agent = await storage.getAiAgentById(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "Agente não encontrado" });
      }
      if (agent.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const conversations = await storage.listAiConversationsByAgent(req.params.id, limit);
      res.json(conversations);
    } catch (error: any) {
      console.error("[ai-agents] Error listing conversations:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ai-agents/conversations/:conversationId/messages", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const conversation = await storage.getAiConversationById(req.params.conversationId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversa não encontrada" });
      }

      const agent = await storage.getAiAgentById(conversation.agentId);
      if (!agent || agent.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const messages = await storage.listAiMessagesByConversation(req.params.conversationId, limit);
      res.json(messages.reverse());
    } catch (error: any) {
      console.error("[ai-agents] Error listing messages:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai-agents/:id/test", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const agent = await storage.getAiAgentById(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "Agente não encontrado" });
      }
      if (agent.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const { message, mediaUrl } = req.body;
      if (!message && !mediaUrl) {
        return res.status(400).json({ error: "Mensagem é obrigatória" });
      }

      // Log de diagnóstico
      console.log("[ai-agents] Testing agent:", {
        agentId: agent.id,
        agentName: agent.name,
        provider: agent.provider,
        model: agent.model,
        hasApiKey: !!agent.apiKey,
        apiKeyLength: agent.apiKey?.length || 0,
        systemPromptLength: agent.systemPrompt?.length || 0,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        calendarEnabled: agent.calendarEnabled,
      });

      const knowledgeFiles = await storage.listAiAgentFiles(agent.id);
      console.log("[ai-agents] Knowledge files:", knowledgeFiles.map(f => ({
        fileName: f.fileName,
        hasExtractedText: !!f.extractedText,
        extractedTextLength: f.extractedText?.length || 0,
      })));

      // Preparar contexto de calendário se habilitado
      let calendarContext: { adminId: string; contactPhone?: string; contactName?: string; googleCalendarId?: string } | undefined;
      if (agent.calendarEnabled && agent.adminCalendarId) {
        const calendar = await storage.getAdminGoogleCalendarById(agent.adminCalendarId);
        calendarContext = {
          adminId: admin.id,
          contactPhone: "teste",
          contactName: "Usuário Teste",
          googleCalendarId: calendar?.googleCalendarId,
        };
      }

      // Adicionar mídia à mensagem se houver
      let fullMessage = message || "";
      if (mediaUrl) {
        fullMessage = `[Mídia recebida: ${mediaUrl}]\n${fullMessage}`;
      }

      const response = await processMessage(agent, fullMessage, [], knowledgeFiles, calendarContext);
      
      console.log("[ai-agents] Test response:", {
        hasContent: !!response.content,
        contentLength: response.content?.length || 0,
        tokensUsed: response.tokensUsed,
        processingTimeMs: response.processingTimeMs,
        hasError: !!response.error,
        error: response.error,
      });

      res.json(response);
    } catch (error: any) {
      console.error("[ai-agents] Error testing agent:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== AI AGENT FILES ====================

  app.get("/api/ai-agents/:id/files", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const agent = await storage.getAiAgentById(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "Agente não encontrado" });
      }
      if (agent.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const files = await storage.listAiAgentFiles(agent.id);
      res.json(files);
    } catch (error: any) {
      console.error("[ai-agents] Error listing files:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai-agents/:id/files", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const agent = await storage.getAiAgentById(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "Agente não encontrado" });
      }
      if (agent.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const { fileName, fileUrl, fileType, fileSize, extractedText } = req.body;
      if (!fileName) {
        return res.status(400).json({ error: "fileName é obrigatório" });
      }
      if (!fileUrl && !extractedText) {
        return res.status(400).json({ error: "Informe uma URL ou conteúdo de texto" });
      }

      const file = await storage.createAiAgentFile({
        agentId: agent.id,
        fileName,
        fileUrl: fileUrl || "text://inline",
        fileType: fileType || "text",
        fileSize: fileSize || 0,
        extractedText: extractedText || null,
      });
      res.json(file);
    } catch (error: any) {
      console.error("[ai-agents] Error creating file:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/ai-agents/:id/files/:fileId", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const agent = await storage.getAiAgentById(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "Agente não encontrado" });
      }
      if (agent.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      await storage.deleteAiAgentFile(req.params.fileId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[ai-agents] Error deleting file:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai-agents/cleanup-messages", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin || admin.role !== "superadmin") {
        return res.status(403).json({ error: "Apenas superadmin pode executar esta ação" });
      }

      const result = await storage.cleanupOldAiMessages();
      res.json({ 
        success: true, 
        message: `Processados ${result.agentsProcessed} agentes, ${result.messagesDeleted} mensagens removidas`
      });
    } catch (error: any) {
      console.error("[ai-agents] Error cleaning up messages:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai-agents/generate-prompt", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { provider, model, apiKey, context, files } = req.body;
      
      if (!provider || !apiKey || !context) {
        return res.status(400).json({ error: "Dados obrigatórios: provider, apiKey, context" });
      }

      let filesContext = "";
      if (files && Array.isArray(files) && files.length > 0) {
        filesContext = "\n\n=== ARQUIVOS ANEXADOS ===\n";
        for (const file of files) {
          filesContext += `\n--- ${file.name} ---\n${file.content.substring(0, 15000)}\n`;
        }
      }

      const generatorPrompt = `Você é um especialista em criar prompts de sistema para chatbots de WhatsApp.

Com base nas informações abaixo, crie um prompt de sistema completo e profissional para um agente de IA.

=== DESCRIÇÃO DO NEGÓCIO ===
${context}
${filesContext}

=== INSTRUÇÕES ===
Crie um prompt de sistema que inclua:
1. Identidade clara do agente (quem é, qual empresa representa)
2. Tom de voz apropriado (formal, amigável, consultivo)
3. Regras claras do que o agente deve e não deve fazer
4. Informações sobre produtos/serviços mencionados
5. Fluxo de atendimento sugerido
6. Como lidar com situações comuns
7. Limite de caracteres por resposta (máximo 500 caracteres por mensagem)

IMPORTANTE:
- Escreva em português brasileiro
- O prompt deve ser direto e conciso
- Inclua exemplos de respostas quando relevante
- Adicione instruções para situações que precisam de humano

Responda APENAS com o prompt de sistema, sem explicações adicionais.`;

      let generatedPrompt = "";

      if (provider === "openai") {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model || "gpt-4o-mini",
            messages: [{ role: "user", content: generatorPrompt }],
            temperature: 0.7,
            max_tokens: 2000,
          }),
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || "Erro na API OpenAI");
        }
        
        const data = await response.json();
        generatedPrompt = data.choices[0]?.message?.content || "";
      } else if (provider === "gemini") {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-1.5-flash"}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: generatorPrompt }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
            }),
          }
        );
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || "Erro na API Gemini");
        }
        
        const data = await response.json();
        generatedPrompt = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else if (provider === "deepseek") {
        const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model || "deepseek-chat",
            messages: [{ role: "user", content: generatorPrompt }],
            temperature: 0.7,
            max_tokens: 2000,
          }),
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || "Erro na API DeepSeek");
        }
        
        const data = await response.json();
        generatedPrompt = data.choices[0]?.message?.content || "";
      } else if (provider === "grok") {
        const response = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model || "grok-2-mini",
            messages: [{ role: "user", content: generatorPrompt }],
            temperature: 0.7,
            max_tokens: 2000,
          }),
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || "Erro na API Grok");
        }
        
        const data = await response.json();
        generatedPrompt = data.choices[0]?.message?.content || "";
      } else {
        return res.status(400).json({ error: "Provedor não suportado" });
      }

      res.json({ prompt: generatedPrompt.trim() });
    } catch (error: any) {
      console.error("[ai-agents] Error generating prompt:", error);
      res.status(500).json({ error: error.message || "Erro ao gerar prompt" });
    }
  });

  setInterval(async () => {
    try {
      const result = await storage.cleanupOldAiMessages();
      if (result.messagesDeleted > 0) {
        console.log(`[ai-agents] Cleanup automático: ${result.messagesDeleted} mensagens antigas removidas de ${result.agentsProcessed} agentes`);
      }
    } catch (error) {
      console.error("[ai-agents] Erro no cleanup automático:", error);
    }
  }, 24 * 60 * 60 * 1000);
}
