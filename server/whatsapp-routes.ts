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

export function registerWhatsAppRoutes(app: Express) {
  
  app.get("/api/whatsapp/status", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const status = await getWhatsAppStatus(admin.id);
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

      const result = await initWhatsAppConnection(admin.id);
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

      const success = await disconnectWhatsApp(admin.id);
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

      const { phone, message } = req.body;
      if (!phone || !message) {
        return res.status(400).json({ error: "Telefone e mensagem são obrigatórios" });
      }

      const result = await sendWhatsAppMessage(admin.id, phone, message);
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

      const { phone, mediaType, mediaUrl, caption, fileName, mimetype } = req.body;
      if (!phone || !mediaType || !mediaUrl) {
        return res.status(400).json({ error: "Telefone, tipo de mídia e URL são obrigatórios" });
      }

      const media: MediaMessage = {
        type: mediaType,
        url: mediaUrl,
        caption,
        fileName,
        mimetype,
      };

      const result = await sendWhatsAppMediaMessage(admin.id, phone, media);
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

      const success = await clearBanStatus(admin.id);
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

  console.log("[whatsapp-api] Routes registered");
  
  setTimeout(() => {
    restoreWhatsAppSessions();
    startHealthCheckInterval();
  }, 5000);
}
