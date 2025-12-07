import { Express, Request, Response } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { sessions as sessionsTable } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  initWhatsAppConnection,
  getWhatsAppStatus,
  disconnectWhatsApp,
  sendWhatsAppMessage,
  sendWhatsAppMediaMessage,
  restoreWhatsAppSessions,
  clearBanStatus,
  startHealthCheckInterval,
  MediaMessage,
} from "./whatsapp-service";

interface AuthResult {
  admin: Awaited<ReturnType<typeof storage.getAdminByEmail>>;
  error?: string;
  errorCode?: number;
}

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
    
    if (admin.accessExpiresAt && admin.role !== "superadmin") {
      const expiresAt = new Date(admin.accessExpiresAt);
      if (expiresAt < new Date()) {
        return { admin: undefined, error: "Acesso expirado. Entre em contato com o administrador.", errorCode: 403 };
      }
    }
    
    return { admin };
  } catch (error) {
    console.error("[whatsapp-api] Error validating session:", error);
    return { admin: undefined, error: "Erro ao validar sessão", errorCode: 500 };
  }
}

async function validateAccountOwnership(accountId: string, adminId: string): Promise<{ valid: boolean; error?: string }> {
  const account = await storage.getWhatsappAccountById(accountId);
  if (!account) {
    return { valid: false, error: "Conta WhatsApp não encontrada" };
  }
  if (account.adminId !== adminId) {
    return { valid: false, error: "Você não tem permissão para acessar esta conta" };
  }
  return { valid: true };
}

export function registerWhatsAppRoutes(app: Express) {
  
  app.get("/api/whatsapp/status", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { accountId } = req.query;
      if (!accountId) {
        return res.status(400).json({ error: "accountId é obrigatório" });
      }

      const ownership = await validateAccountOwnership(accountId as string, admin.id);
      if (!ownership.valid) {
        return res.status(403).json({ error: ownership.error });
      }

      const status = await getWhatsAppStatus(accountId as string);
      res.json(status);
    } catch (error: any) {
      console.error("[whatsapp-api] Error getting status:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/whatsapp/connect", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { accountId } = req.body;
      if (!accountId) {
        return res.status(400).json({ error: "accountId é obrigatório" });
      }

      const ownership = await validateAccountOwnership(accountId, admin.id);
      if (!ownership.valid) {
        return res.status(403).json({ error: ownership.error });
      }

      const result = await initWhatsAppConnection(accountId, admin.id);
      res.json(result);
    } catch (error: any) {
      console.error("[whatsapp-api] Error connecting:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/whatsapp/disconnect", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { accountId } = req.body;
      if (!accountId) {
        return res.status(400).json({ error: "accountId é obrigatório" });
      }

      const ownership = await validateAccountOwnership(accountId, admin.id);
      if (!ownership.valid) {
        return res.status(403).json({ error: ownership.error });
      }

      const success = await disconnectWhatsApp(accountId, admin.id);
      res.json({ success });
    } catch (error: any) {
      console.error("[whatsapp-api] Error disconnecting:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/whatsapp/send-test", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { accountId, phone, message } = req.body;
      if (!accountId) {
        return res.status(400).json({ error: "accountId é obrigatório" });
      }
      if (!phone || !message) {
        return res.status(400).json({ error: "Telefone e mensagem são obrigatórios" });
      }

      const ownership = await validateAccountOwnership(accountId, admin.id);
      if (!ownership.valid) {
        return res.status(403).json({ error: ownership.error });
      }

      const result = await sendWhatsAppMessage(accountId, phone, message);
      res.json(result);
    } catch (error: any) {
      console.error("[whatsapp-api] Error sending test:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/whatsapp/send-media-test", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { accountId, phone, mediaType, mediaUrl, caption, fileName, mimetype } = req.body;
      if (!accountId) {
        return res.status(400).json({ error: "accountId é obrigatório" });
      }
      if (!phone || !mediaType || !mediaUrl) {
        return res.status(400).json({ error: "Telefone, tipo de mídia e URL são obrigatórios" });
      }

      const ownership = await validateAccountOwnership(accountId, admin.id);
      if (!ownership.valid) {
        return res.status(403).json({ error: ownership.error });
      }

      const media: MediaMessage = {
        type: mediaType,
        url: mediaUrl,
        caption,
        fileName,
        mimetype,
      };

      const result = await sendWhatsAppMediaMessage(accountId, phone, media);
      res.json(result);
    } catch (error: any) {
      console.error("[whatsapp-api] Error sending media test:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/whatsapp/sequences", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { webinarId } = req.query;
      let sequences;
      
      if (webinarId) {
        sequences = await storage.listWhatsappSequencesByWebinar(webinarId as string);
      } else {
        sequences = await storage.listWhatsappSequencesByAdmin(admin.id);
      }
      
      res.json(sequences);
    } catch (error: any) {
      console.error("[whatsapp-api] Error listing sequences:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/whatsapp/sequences", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const sequence = await storage.createWhatsappSequence({
        ...req.body,
        adminId: admin.id,
      });
      
      res.json(sequence);
    } catch (error: any) {
      console.error("[whatsapp-api] Error creating sequence:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/whatsapp/sequences/:id", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const sequence = await storage.getWhatsappSequenceById(req.params.id);
      if (!sequence || sequence.adminId !== admin.id) {
        return res.status(404).json({ error: "Sequência não encontrada" });
      }

      const updated = await storage.updateWhatsappSequence(req.params.id, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error("[whatsapp-api] Error updating sequence:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/whatsapp/sequences/:id", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const sequence = await storage.getWhatsappSequenceById(req.params.id);
      if (!sequence || sequence.adminId !== admin.id) {
        return res.status(404).json({ error: "Sequência não encontrada" });
      }

      await storage.deleteWhatsappSequence(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[whatsapp-api] Error deleting sequence:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/whatsapp/clear-ban", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { accountId } = req.body;
      if (!accountId) {
        return res.status(400).json({ error: "accountId é obrigatório" });
      }

      const ownership = await validateAccountOwnership(accountId, admin.id);
      if (!ownership.valid) {
        return res.status(403).json({ error: ownership.error });
      }

      const success = await clearBanStatus(accountId, admin.id);
      if (success) {
        res.json({ success: true, message: "Status de suspensão limpo. Você pode tentar reconectar." });
      } else {
        res.status(500).json({ error: "Erro ao limpar status de suspensão" });
      }
    } catch (error: any) {
      console.error("[whatsapp-api] Error clearing ban:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // WHATSAPP ACCOUNTS CRUD (Multiple accounts per admin)
  // ============================================

  app.get("/api/whatsapp/accounts/limit", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const existingAccounts = await storage.listWhatsappAccountsByAdmin(admin.id);
      let accountLimit = 2; // Limite padrão (Essencial)
      let planName = "Essencial";
      
      if (admin.planoId) {
        const plano = await storage.getCheckoutPlanoById(admin.planoId);
        if (plano?.whatsappAccountLimit) {
          accountLimit = plano.whatsappAccountLimit;
          planName = plano.nome;
        }
      }
      
      res.json({
        currentCount: existingAccounts.length,
        limit: accountLimit,
        planName,
        canCreate: existingAccounts.length < accountLimit,
        remaining: Math.max(0, accountLimit - existingAccounts.length)
      });
    } catch (error: any) {
      console.error("[whatsapp-api] Error getting account limit:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/whatsapp/accounts", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const accounts = await storage.listWhatsappAccountsByAdmin(admin.id);
      res.json(accounts);
    } catch (error: any) {
      console.error("[whatsapp-api] Error listing accounts:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/whatsapp/accounts", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { label, dailyLimit, priority } = req.body;
      if (!label) {
        return res.status(400).json({ error: "Label é obrigatório" });
      }

      // Verificar limite de contas WhatsApp do plano
      const existingAccounts = await storage.listWhatsappAccountsByAdmin(admin.id);
      let accountLimit = 2; // Limite padrão (Essencial)
      
      if (admin.planoId) {
        const plano = await storage.getCheckoutPlanoById(admin.planoId);
        if (plano?.whatsappAccountLimit) {
          accountLimit = plano.whatsappAccountLimit;
        }
      }
      
      if (existingAccounts.length >= accountLimit) {
        return res.status(403).json({ 
          error: `Limite de ${accountLimit} conta${accountLimit > 1 ? 's' : ''} WhatsApp atingido. Faça upgrade do seu plano para adicionar mais contas.`,
          limitReached: true,
          currentCount: existingAccounts.length,
          limit: accountLimit
        });
      }
      
      const account = await storage.createWhatsappAccount({
        adminId: admin.id,
        label,
        dailyLimit: dailyLimit || 100,
        priority: priority || 0,
        status: "disconnected",
      });

      res.json(account);
    } catch (error: any) {
      console.error("[whatsapp-api] Error creating account:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/whatsapp/accounts/:id", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const ownership = await validateAccountOwnership(req.params.id, admin.id);
      if (!ownership.valid) {
        return res.status(403).json({ error: ownership.error });
      }

      const account = await storage.getWhatsappAccountById(req.params.id);
      res.json(account);
    } catch (error: any) {
      console.error("[whatsapp-api] Error getting account:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/whatsapp/accounts/:id", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const ownership = await validateAccountOwnership(req.params.id, admin.id);
      if (!ownership.valid) {
        return res.status(403).json({ error: ownership.error });
      }

      const { label, dailyLimit, priority } = req.body;
      const updateData: Record<string, any> = {};
      
      if (label !== undefined) updateData.label = label;
      if (dailyLimit !== undefined) updateData.dailyLimit = dailyLimit;
      if (priority !== undefined) updateData.priority = priority;

      const updated = await storage.updateWhatsappAccount(req.params.id, updateData);
      res.json(updated);
    } catch (error: any) {
      console.error("[whatsapp-api] Error updating account:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/whatsapp/accounts/:id", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const ownership = await validateAccountOwnership(req.params.id, admin.id);
      if (!ownership.valid) {
        return res.status(403).json({ error: ownership.error });
      }

      // Disconnect WhatsApp if connected before deleting
      await disconnectWhatsApp(req.params.id, admin.id);
      
      await storage.deleteWhatsappAccount(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[whatsapp-api] Error deleting account:", error);
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[whatsapp-api] Routes registered");
  
  setTimeout(() => {
    restoreWhatsAppSessions();
    startHealthCheckInterval();
  }, 5000);
}
