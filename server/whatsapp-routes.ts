import { Express, Request, Response } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { sessions as sessionsTable } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  initWhatsAppConnection,
  initWhatsAppConnectionWithPairingCode,
  getWhatsAppStatus,
  disconnectWhatsApp,
  resetWhatsAppSession,
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

  // Connect via pairing code (alternative to QR code)
  app.post("/api/whatsapp/connect-pairing", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { accountId, phoneNumber } = req.body;
      if (!accountId) {
        return res.status(400).json({ error: "accountId é obrigatório" });
      }
      if (!phoneNumber) {
        return res.status(400).json({ error: "Número de telefone é obrigatório" });
      }

      const ownership = await validateAccountOwnership(accountId, admin.id);
      if (!ownership.valid) {
        return res.status(403).json({ error: ownership.error });
      }

      const result = await initWhatsAppConnectionWithPairingCode(accountId, admin.id, phoneNumber);
      res.json(result);
    } catch (error: any) {
      console.error("[whatsapp-api] Error connecting with pairing code:", error);
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

  // Reset session - clears stale credentials for fresh reconnection
  app.post("/api/whatsapp/reset-session", async (req: Request, res: Response) => {
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

      const result = await resetWhatsAppSession(accountId, admin.id);
      res.json(result);
    } catch (error: any) {
      console.error("[whatsapp-api] Error resetting session:", error);
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

      const isSuperadmin = admin.role === "superadmin";
      const existingAccounts = await storage.listWhatsappAccountsByAdmin(admin.id);
      let accountLimit = 2; // Limite padrão (Essencial)
      let planName = "Essencial";
      
      if (isSuperadmin) {
        accountLimit = 999;
        planName = "Super Admin";
      } else if (admin.planoId) {
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
        canCreate: isSuperadmin || existingAccounts.length < accountLimit,
        remaining: isSuperadmin ? 999 : Math.max(0, accountLimit - existingAccounts.length),
        isSuperadmin
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

      const isSuperadmin = admin.role === "superadmin";
      
      // Verificar limite de contas WhatsApp do plano (superadmin tem ilimitado)
      if (!isSuperadmin) {
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

  // ============================================
  // CLOUD API CONFIGURATION
  // ============================================

  // Configure Cloud API credentials for an account
  app.post("/api/whatsapp/accounts/:id/cloud-api", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const ownership = await validateAccountOwnership(req.params.id, admin.id);
      if (!ownership.valid) {
        return res.status(403).json({ error: ownership.error });
      }

      const { accessToken, phoneNumberId, businessAccountId, webhookVerifyToken, apiVersion } = req.body;
      
      if (!accessToken || !phoneNumberId) {
        return res.status(400).json({ error: "accessToken e phoneNumberId são obrigatórios" });
      }

      const updated = await storage.updateWhatsappAccount(req.params.id, {
        provider: "cloud_api",
        cloudApiAccessToken: accessToken,
        cloudApiPhoneNumberId: phoneNumberId,
        cloudApiBusinnessAccountId: businessAccountId || null,
        cloudApiWebhookVerifyToken: webhookVerifyToken || null,
        cloudApiVersion: apiVersion || "v20.0",
      });

      res.json({ success: true, account: updated });
    } catch (error: any) {
      console.error("[whatsapp-api] Error configuring Cloud API:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Validate Cloud API credentials
  app.post("/api/whatsapp/validate-cloud-api", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { accessToken, phoneNumberId, apiVersion } = req.body;
      
      if (!accessToken || !phoneNumberId) {
        return res.status(400).json({ error: "accessToken e phoneNumberId são obrigatórios" });
      }

      const { validateCloudApiCredentials } = await import("./whatsapp-cloud-service");
      const result = await validateCloudApiCredentials({
        accessToken,
        phoneNumberId,
        apiVersion: apiVersion || "v20.0",
      });

      res.json(result);
    } catch (error: any) {
      console.error("[whatsapp-api] Error validating Cloud API:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Switch account provider (baileys or cloud_api)
  app.patch("/api/whatsapp/accounts/:id/provider", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const ownership = await validateAccountOwnership(req.params.id, admin.id);
      if (!ownership.valid) {
        return res.status(403).json({ error: ownership.error });
      }

      const { provider } = req.body;
      
      if (!provider || !["baileys", "cloud_api"].includes(provider)) {
        return res.status(400).json({ error: "Provider deve ser 'baileys' ou 'cloud_api'" });
      }

      // Disconnect current connection when switching providers
      await disconnectWhatsApp(req.params.id, admin.id);

      const updated = await storage.updateWhatsappAccount(req.params.id, {
        provider,
        status: "disconnected",
        phoneNumber: null,
      });

      res.json({ success: true, account: updated });
    } catch (error: any) {
      console.error("[whatsapp-api] Error switching provider:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // WHATSAPP CONTACT LISTS (LISTAS IMPORTADAS)
  // ============================================

  // List contact lists for admin
  app.get("/api/whatsapp/contact-lists", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const lists = await storage.listWhatsappContactLists(admin.id);
      res.json(lists);
    } catch (error: any) {
      console.error("[whatsapp-api] Error listing contact lists:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get contacts from a list
  app.get("/api/whatsapp/contact-lists/:id/contacts", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const list = await storage.getWhatsappContactListById(req.params.id);
      if (!list || list.adminId !== admin.id) {
        return res.status(404).json({ error: "Lista não encontrada" });
      }

      const contacts = await storage.listWhatsappContactsByList(req.params.id);
      res.json(contacts);
    } catch (error: any) {
      console.error("[whatsapp-api] Error listing contacts:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Download Excel template
  app.get("/api/whatsapp/contact-lists/template", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const XLSX = await import("xlsx");
      
      const templateData = [
        { nome: "João Silva", telefone: "5511999999999", email: "joao@email.com" },
        { nome: "Maria Santos", telefone: "5521988888888", email: "maria@email.com" },
        { nome: "Pedro Costa", telefone: "5531977777777", email: "" },
      ];
      
      const worksheet = XLSX.utils.json_to_sheet(templateData);
      worksheet["!cols"] = [{ wch: 25 }, { wch: 18 }, { wch: 30 }];
      
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Contatos");
      
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=modelo_contatos.xlsx");
      res.send(buffer);
    } catch (error: any) {
      console.error("[whatsapp-api] Error generating template:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Import contacts from Excel
  app.post("/api/whatsapp/contact-lists/import", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { name, description, data } = req.body;
      
      if (!name || !data || !Array.isArray(data)) {
        return res.status(400).json({ error: "Nome e dados são obrigatórios" });
      }

      // Validate and normalize contacts
      const validContacts: { name: string; phone: string; email?: string }[] = [];
      const errors: string[] = [];
      
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2; // Excel rows start at 1 + header row
        
        const name = String(row.nome || row.name || row.Nome || row.Name || "").trim();
        let phone = String(row.telefone || row.phone || row.Telefone || row.Phone || row.whatsapp || row.WhatsApp || "").trim();
        const email = String(row.email || row.Email || "").trim();
        
        if (!name) {
          errors.push(`Linha ${rowNum}: Nome vazio`);
          continue;
        }
        
        // Normalize phone: remove non-digits, ensure starts with country code
        phone = phone.replace(/\D/g, "");
        if (phone.length < 10) {
          errors.push(`Linha ${rowNum}: Telefone inválido (${phone})`);
          continue;
        }
        
        // Add Brazil country code if not present
        if (!phone.startsWith("55") && phone.length === 11) {
          phone = "55" + phone;
        }
        
        validContacts.push({ name, phone, email: email || undefined });
      }
      
      if (validContacts.length === 0) {
        return res.status(400).json({ 
          error: "Nenhum contato válido encontrado",
          errors: errors.slice(0, 10)
        });
      }

      // Create contact list
      const list = await storage.createWhatsappContactList({
        adminId: admin.id,
        name,
        description: description || null,
        totalContacts: validContacts.length,
      });

      // Bulk insert contacts
      await storage.createWhatsappContactsBulk(
        validContacts.map(c => ({
          listId: list.id,
          name: c.name,
          phone: c.phone,
          email: c.email || null,
        }))
      );

      res.json({
        success: true,
        list,
        imported: validContacts.length,
        errors: errors.slice(0, 10),
        totalErrors: errors.length,
      });
    } catch (error: any) {
      console.error("[whatsapp-api] Error importing contacts:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete contact list
  app.delete("/api/whatsapp/contact-lists/:id", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const list = await storage.getWhatsappContactListById(req.params.id);
      if (!list || list.adminId !== admin.id) {
        return res.status(404).json({ error: "Lista não encontrada" });
      }

      await storage.deleteWhatsappContactList(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[whatsapp-api] Error deleting contact list:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // WHATSAPP BROADCASTS (ENVIOS EM MASSA)
  // ============================================

  // List broadcasts for admin
  app.get("/api/whatsapp/broadcasts", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const broadcasts = await storage.listWhatsappBroadcastsByAdmin(admin.id);
      res.json(broadcasts);
    } catch (error: any) {
      console.error("[whatsapp-api] Error listing broadcasts:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get single broadcast with status counts
  app.get("/api/whatsapp/broadcasts/:id", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const broadcast = await storage.getWhatsappBroadcastById(req.params.id);
      if (!broadcast) {
        return res.status(404).json({ error: "Broadcast não encontrado" });
      }
      if (broadcast.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const counts = await storage.countBroadcastRecipientsByStatus(req.params.id);
      res.json({ ...broadcast, ...counts });
    } catch (error: any) {
      console.error("[whatsapp-api] Error getting broadcast:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get distinct session dates for a webinar (for filters)
  app.get("/api/whatsapp/broadcasts/webinar/:webinarId/dates", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const dates = await storage.getDistinctSessionDatesByWebinar(req.params.webinarId);
      res.json(dates);
    } catch (error: any) {
      console.error("[whatsapp-api] Error getting dates:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Preview leads for broadcast (before creating)
  app.post("/api/whatsapp/broadcasts/preview", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { webinarId, filterType, filterDateStart, filterDateEnd, filterSessionDate } = req.body;
      if (!webinarId) {
        return res.status(400).json({ error: "webinarId é obrigatório" });
      }

      const filters: { dateStart?: string; dateEnd?: string; sessionDate?: string } = {};
      if (filterType === 'date_range') {
        if (filterDateStart) filters.dateStart = filterDateStart;
        if (filterDateEnd) filters.dateEnd = filterDateEnd;
      } else if (filterType === 'session' && filterSessionDate) {
        filters.sessionDate = filterSessionDate;
      }

      const leads = await storage.listLeadsWithWhatsappByWebinar(webinarId, filters);
      res.json({ 
        count: leads.length, 
        leads: leads.slice(0, 50).map(l => ({ id: l.id, name: l.name, whatsapp: l.whatsapp, capturedAt: l.capturedAt })) 
      });
    } catch (error: any) {
      console.error("[whatsapp-api] Error previewing leads:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create broadcast
  app.post("/api/whatsapp/broadcasts", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { 
        name, messageText, messageType = 'text', 
        mediaUrl, mediaFileName, mediaMimeType,
        sourceType = 'webinar',
        webinarId, contactListId,
        filterType = 'all', filterDateStart, filterDateEnd, filterSessionDate,
        sendAsVoiceNote = false,
      } = req.body;

      if (!name || !messageText) {
        return res.status(400).json({ error: "name e messageText são obrigatórios" });
      }

      let recipients: { id?: string; phone: string; name: string | null; email?: string | null; sessionDate?: string | null }[] = [];

      if (sourceType === 'contact_list') {
        if (!contactListId) {
          return res.status(400).json({ error: "contactListId é obrigatório para listas importadas" });
        }
        
        const contactList = await storage.getWhatsappContactListById(contactListId);
        if (!contactList || contactList.adminId !== admin.id) {
          return res.status(404).json({ error: "Lista de contatos não encontrada" });
        }
        
        const contacts = await storage.listWhatsappContactsByList(contactListId);
        if (contacts.length === 0) {
          return res.status(400).json({ error: "Lista de contatos está vazia" });
        }
        
        recipients = contacts.map(c => ({
          id: c.id,
          phone: c.phone,
          name: c.name,
          email: (c as any).email || null,
          sessionDate: null,
        }));
      } else {
        if (!webinarId) {
          return res.status(400).json({ error: "webinarId é obrigatório para leads de webinar" });
        }

        const filters: { dateStart?: string; dateEnd?: string; sessionDate?: string } = {};
        if (filterType === 'date_range') {
          if (filterDateStart) filters.dateStart = filterDateStart;
          if (filterDateEnd) filters.dateEnd = filterDateEnd;
        } else if (filterType === 'session' && filterSessionDate) {
          filters.sessionDate = filterSessionDate;
        }

        const leads = await storage.listLeadsWithWhatsappByWebinar(webinarId, filters);
        if (leads.length === 0) {
          return res.status(400).json({ error: "Nenhum lead com WhatsApp encontrado para os filtros selecionados" });
        }
        
        recipients = leads.map(lead => ({
          id: lead.id,
          phone: lead.whatsapp!,
          name: lead.name || null,
          email: lead.email || null,
          sessionDate: lead.capturedAt?.toISOString().split('T')[0] || null,
        }));
      }

      // Create broadcast
      const broadcast = await storage.createWhatsappBroadcast({
        adminId: admin.id,
        webinarId: sourceType === 'webinar' ? webinarId : null,
        contactListId: sourceType === 'contact_list' ? contactListId : null,
        sourceType,
        name,
        messageText,
        messageType,
        mediaUrl: mediaUrl || null,
        mediaFileName: mediaFileName || null,
        mediaMimeType: mediaMimeType || null,
        sendAsVoiceNote: sendAsVoiceNote || false,
        filterType: sourceType === 'webinar' ? filterType : null,
        filterDateStart: filterDateStart || null,
        filterDateEnd: filterDateEnd || null,
        filterSessionDate: filterSessionDate || null,
        status: 'draft',
        totalRecipients: recipients.length,
        pendingCount: recipients.length,
        sentCount: 0,
        failedCount: 0,
        startedAt: null,
        completedAt: null,
      });

      // Create recipients
      const recipientData = recipients.map(r => ({
        broadcastId: broadcast.id,
        leadId: sourceType === 'webinar' ? r.id! : null,
        contactId: sourceType === 'contact_list' ? r.id! : null,
        phone: r.phone,
        name: r.name,
        email: r.email || null,
        sessionDate: r.sessionDate || null,
        accountId: null,
        status: 'pending' as const,
        attempts: 0,
        lastAttemptAt: null,
        sentAt: null,
        errorMessage: null,
      }));

      await storage.createWhatsappBroadcastRecipientsBulk(recipientData);

      res.json(broadcast);
    } catch (error: any) {
      console.error("[whatsapp-api] Error creating broadcast:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Start broadcast
  app.post("/api/whatsapp/broadcasts/:id/start", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const broadcast = await storage.getWhatsappBroadcastById(req.params.id);
      if (!broadcast) {
        return res.status(404).json({ error: "Broadcast não encontrado" });
      }
      if (broadcast.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }
      if (broadcast.status !== 'draft' && broadcast.status !== 'paused') {
        return res.status(400).json({ error: "Broadcast já foi iniciado ou concluído" });
      }

      // Check if there are connected WhatsApp accounts
      const accounts = await storage.listWhatsappAccountsByAdmin(admin.id);
      const connectedAccounts = [];
      for (const acc of accounts) {
        const status = await getWhatsAppStatus(acc.id);
        if (status.status === 'connected') {
          connectedAccounts.push(acc);
        }
      }

      if (connectedAccounts.length === 0) {
        return res.status(400).json({ error: "Nenhuma conta WhatsApp conectada. Conecte pelo menos uma conta para iniciar o envio." });
      }

      await storage.updateWhatsappBroadcast(req.params.id, { 
        status: 'sending',
        startedAt: new Date(),
      });

      // Start the broadcast orchestrator in background
      startBroadcastOrchestrator(req.params.id, admin.id);

      res.json({ success: true, message: "Broadcast iniciado" });
    } catch (error: any) {
      console.error("[whatsapp-api] Error starting broadcast:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Pause broadcast
  app.post("/api/whatsapp/broadcasts/:id/pause", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const broadcast = await storage.getWhatsappBroadcastById(req.params.id);
      if (!broadcast) {
        return res.status(404).json({ error: "Broadcast não encontrado" });
      }
      if (broadcast.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }
      if (broadcast.status !== 'sending') {
        return res.status(400).json({ error: "Broadcast não está em andamento" });
      }

      await storage.updateWhatsappBroadcast(req.params.id, { status: 'paused' });
      res.json({ success: true, message: "Broadcast pausado" });
    } catch (error: any) {
      console.error("[whatsapp-api] Error pausing broadcast:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Cancel broadcast
  app.post("/api/whatsapp/broadcasts/:id/cancel", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const broadcast = await storage.getWhatsappBroadcastById(req.params.id);
      if (!broadcast) {
        return res.status(404).json({ error: "Broadcast não encontrado" });
      }
      if (broadcast.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }
      if (broadcast.status === 'completed' || broadcast.status === 'cancelled') {
        return res.status(400).json({ error: "Broadcast já está concluído ou cancelado" });
      }

      await storage.updateWhatsappBroadcast(req.params.id, { status: 'cancelled', completedAt: new Date() });
      res.json({ success: true, message: "Broadcast cancelado" });
    } catch (error: any) {
      console.error("[whatsapp-api] Error cancelling broadcast:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete broadcast
  app.delete("/api/whatsapp/broadcasts/:id", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const broadcast = await storage.getWhatsappBroadcastById(req.params.id);
      if (!broadcast) {
        return res.status(404).json({ error: "Broadcast não encontrado" });
      }
      if (broadcast.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      await storage.deleteWhatsappBroadcast(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[whatsapp-api] Error deleting broadcast:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get broadcast recipients (for viewing errors/progress)
  app.get("/api/whatsapp/broadcasts/:id/recipients", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const broadcast = await storage.getWhatsappBroadcastById(req.params.id);
      if (!broadcast) {
        return res.status(404).json({ error: "Broadcast não encontrado" });
      }
      if (broadcast.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const { status } = req.query;
      let recipients = await storage.listWhatsappBroadcastRecipients(req.params.id);
      
      if (status && typeof status === 'string') {
        recipients = recipients.filter(r => r.status === status);
      }

      res.json(recipients);
    } catch (error: any) {
      console.error("[whatsapp-api] Error getting recipients:", error);
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[whatsapp-api] Routes registered");
  
  setTimeout(() => {
    restoreWhatsAppSessions();
    startHealthCheckInterval();
  }, 5000);
}

// ============================================
// BROADCAST ORCHESTRATOR (Background Processing)
// ============================================

const activeBroadcasts = new Map<string, boolean>();

async function startBroadcastOrchestrator(broadcastId: string, adminId: string) {
  if (activeBroadcasts.get(broadcastId)) {
    console.log(`[broadcast] Broadcast ${broadcastId} already running`);
    return;
  }
  
  activeBroadcasts.set(broadcastId, true);
  console.log(`[broadcast] Starting orchestrator for ${broadcastId}`);

  try {
    // Get connected accounts sorted by priority and available capacity
    const accounts = await storage.listWhatsappAccountsByAdmin(adminId);
    const connectedAccounts = [];
    
    for (const acc of accounts) {
      const status = await getWhatsAppStatus(acc.id);
      if (status.status === 'connected') {
        // Check daily limit
        const today = new Date().toISOString().split('T')[0];
        if (acc.lastMessageResetDate !== today) {
          await storage.updateWhatsappAccount(acc.id, { 
            messagesSentToday: 0, 
            lastMessageResetDate: today 
          });
          acc.messagesSentToday = 0;
        }
        
        const remaining = (acc.dailyLimit || 100) - (acc.messagesSentToday || 0);
        if (remaining > 0) {
          connectedAccounts.push({ ...acc, remaining });
        }
      }
    }

    if (connectedAccounts.length === 0) {
      console.log(`[broadcast] No accounts with capacity for ${broadcastId}`);
      await storage.updateWhatsappBroadcast(broadcastId, { 
        status: 'paused' 
      });
      activeBroadcasts.delete(broadcastId);
      return;
    }

    // Sort by priority (lower = higher priority) then by remaining capacity
    connectedAccounts.sort((a, b) => {
      if ((a.priority || 0) !== (b.priority || 0)) return (a.priority || 0) - (b.priority || 0);
      return b.remaining - a.remaining;
    });

    let accountIndex = 0;
    const BATCH_SIZE = 10;
    const DELAY_BETWEEN_MESSAGES = 3000; // 3 seconds between messages
    const DELAY_BETWEEN_BATCHES = 10000; // 10 seconds between batches

    while (true) {
      // Check if broadcast is still running
      const broadcast = await storage.getWhatsappBroadcastById(broadcastId);
      if (!broadcast || broadcast.status !== 'sending') {
        console.log(`[broadcast] Broadcast ${broadcastId} stopped (status: ${broadcast?.status})`);
        break;
      }

      // Get pending recipients
      const recipients = await storage.getPendingBroadcastRecipients(broadcastId, BATCH_SIZE);
      if (recipients.length === 0) {
        console.log(`[broadcast] All recipients processed for ${broadcastId}`);
        await storage.updateWhatsappBroadcast(broadcastId, { 
          status: 'completed',
          completedAt: new Date()
        });
        break;
      }

      // Process batch
      for (const recipient of recipients) {
        // Check broadcast status again
        const currentBroadcast = await storage.getWhatsappBroadcastById(broadcastId);
        if (!currentBroadcast || currentBroadcast.status !== 'sending') break;

        // Round-robin: find next account with capacity
        let attempts = 0;
        let selectedAccount = null;
        
        while (attempts < connectedAccounts.length) {
          const acc = connectedAccounts[accountIndex % connectedAccounts.length];
          if (acc.remaining > 0) {
            selectedAccount = acc;
            accountIndex++;
            break;
          }
          accountIndex++;
          attempts++;
        }

        if (!selectedAccount) {
          console.log(`[broadcast] All accounts exhausted limits`);
          await storage.updateWhatsappBroadcast(broadcastId, { status: 'paused' });
          break;
        }

        // Send message
        try {
          await storage.updateWhatsappBroadcastRecipient(recipient.id, {
            accountId: selectedAccount.id,
            lastAttemptAt: new Date(),
            attempts: (recipient.attempts || 0) + 1,
          });

          // Process merge tags - support both {{tag}} and {tag} syntax
          let messageText = broadcast.messageText
            .replace(/\{\{nome\}\}/gi, recipient.name || 'Olá')
            .replace(/\{nome\}/gi, recipient.name || 'Olá')
            .replace(/\{\{telefone\}\}/gi, recipient.phone || '')
            .replace(/\{telefone\}/gi, recipient.phone || '')
            .replace(/\{\{email\}\}/gi, recipient.email || '')
            .replace(/\{email\}/gi, recipient.email || '')
            .replace(/\{\{name\}\}/gi, recipient.name || 'Hi')
            .replace(/\{name\}/gi, recipient.name || 'Hi');
          
          if (broadcast.messageType === 'text') {
            await sendWhatsAppMessage(selectedAccount.id, recipient.phone, messageText);
          } else if (broadcast.mediaUrl) {
            const mediaMessage: MediaMessage = {
              type: broadcast.messageType as 'image' | 'audio' | 'video' | 'document',
              url: broadcast.mediaUrl,
              caption: messageText,
              fileName: broadcast.mediaFileName || undefined,
              mimetype: broadcast.mediaMimeType || undefined,
              ptt: broadcast.messageType === 'audio' && broadcast.sendAsVoiceNote === true,
            };
            await sendWhatsAppMediaMessage(selectedAccount.id, recipient.phone, mediaMessage);
          }

          await storage.updateWhatsappBroadcastRecipient(recipient.id, {
            status: 'sent',
            sentAt: new Date(),
          });

          // Update broadcast counts
          const counts = await storage.countBroadcastRecipientsByStatus(broadcastId);
          await storage.updateWhatsappBroadcast(broadcastId, {
            sentCount: counts.sent,
            failedCount: counts.failed,
            pendingCount: counts.pending,
          });

          // Decrement account capacity
          selectedAccount.remaining--;
          await storage.incrementWhatsappAccountMessageCount(selectedAccount.id);

          console.log(`[broadcast] Sent to ${recipient.phone} via ${selectedAccount.label || selectedAccount.id}`);
        } catch (err: any) {
          console.error(`[broadcast] Failed to send to ${recipient.phone}:`, err.message);
          
          await storage.updateWhatsappBroadcastRecipient(recipient.id, {
            status: 'failed',
            errorMessage: err.message?.slice(0, 255) || 'Erro desconhecido',
          });

          // Update broadcast counts
          const counts = await storage.countBroadcastRecipientsByStatus(broadcastId);
          await storage.updateWhatsappBroadcast(broadcastId, {
            sentCount: counts.sent,
            failedCount: counts.failed,
            pendingCount: counts.pending,
          });
        }

        // Delay between messages
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_MESSAGES));
      }

      // Delay between batches
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
    }
  } catch (error: any) {
    console.error(`[broadcast] Orchestrator error for ${broadcastId}:`, error);
    await storage.updateWhatsappBroadcast(broadcastId, { status: 'paused' });
  } finally {
    activeBroadcasts.delete(broadcastId);
    console.log(`[broadcast] Orchestrator finished for ${broadcastId}`);
  }
}
