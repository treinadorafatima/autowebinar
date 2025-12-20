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

      const { whatsappAccountId, name, provider, apiKey, model, systemPrompt, ...rest } = req.body;

      if (!whatsappAccountId || !name || !apiKey || !systemPrompt) {
        return res.status(400).json({ error: "Campos obrigatórios: whatsappAccountId, name, apiKey, systemPrompt" });
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

      const { message } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Mensagem é obrigatória" });
      }

      const knowledgeFiles = await storage.listAiAgentFiles(agent.id);
      const response = await processMessage(agent, message, [], knowledgeFiles);
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
