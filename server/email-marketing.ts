import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { encrypt, decrypt, maskApiKey } from "./encryption";
import { Resend } from "resend";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { sessions as sessionsTable, leads } from "@shared/schema";
import { scheduleEmailsForLead, getSchedulerStatus } from "./email-scheduler";

interface WebinarSession {
  startTime: Date;
  dateString: string;
}

function calculateNextWebinarSession(webinar: any): WebinarSession | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const startHour = webinar.startHour || 18;
  const startMinute = webinar.startMinute || 0;
  
  let nextDate: Date | null = null;
  
  switch (webinar.recurrence) {
    case "daily": {
      nextDate = new Date(today);
      nextDate.setHours(startHour, startMinute, 0, 0);
      if (nextDate <= now) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
      break;
    }
    
    case "weekly": {
      const targetDay = webinar.dayOfWeek || 0;
      nextDate = new Date(today);
      const currentDay = nextDate.getDay();
      let daysUntilTarget = targetDay - currentDay;
      if (daysUntilTarget < 0) daysUntilTarget += 7;
      
      nextDate.setDate(nextDate.getDate() + daysUntilTarget);
      nextDate.setHours(startHour, startMinute, 0, 0);
      
      if (nextDate <= now) {
        nextDate.setDate(nextDate.getDate() + 7);
      }
      break;
    }
    
    case "monthly": {
      const targetDayOfMonth = webinar.dayOfMonth || 1;
      nextDate = new Date(today.getFullYear(), today.getMonth(), targetDayOfMonth);
      nextDate.setHours(startHour, startMinute, 0, 0);
      if (nextDate <= now) {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }
      break;
    }
    
    case "once": {
      if (webinar.onceDate) {
        const [year, month, day] = webinar.onceDate.split("-").map(Number);
        nextDate = new Date(year, month - 1, day, startHour, startMinute, 0, 0);
        if (nextDate <= now) {
          return null;
        }
      }
      break;
    }
    
    default:
      nextDate = new Date(today);
      nextDate.setHours(startHour, startMinute, 0, 0);
      if (nextDate <= now) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
  }
  
  if (!nextDate) return null;
  
  const day = String(nextDate.getDate()).padStart(2, "0");
  const month = String(nextDate.getMonth() + 1).padStart(2, "0");
  const year = nextDate.getFullYear();
  const dateString = `${day}/${month}/${year}`;
  
  return {
    startTime: nextDate,
    dateString
  };
}

async function validateSession(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const result = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.token, token))
      .limit(1);
    
    if (result.length === 0) return null;
    
    const session = result[0];
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
      return null;
    }
    
    return session.email;
  } catch (error) {
    console.error("Erro ao validar sessão:", error);
    return null;
  }
}

async function getAuthenticatedAdmin(req: Request) {
  const token = req.headers.authorization?.split(" ")[1];
  const email = await validateSession(token || "");
  if (!email) return null;
  return storage.getAdminByEmail(email);
}

export function registerEmailMarketingRoutes(app: Express): void {
  
  // ============================================
  // ADMIN EMAIL CREDENTIALS (Per-tenant Resend API)
  // ============================================

  app.get("/api/email-marketing/credentials", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const credential = await storage.getAdminEmailCredential(admin.id);
      
      if (!credential) {
        return res.json({ 
          hasCredential: false,
          senderEmail: null,
          senderName: null,
          isValid: false
        });
      }

      const decryptedKey = decrypt(credential.encryptedApiKey);

      res.json({
        hasCredential: true,
        maskedApiKey: maskApiKey(decryptedKey),
        senderEmail: credential.senderEmail,
        senderName: credential.senderName,
        isValid: credential.isValid,
        lastValidatedAt: credential.lastValidatedAt
      });
    } catch (error: any) {
      console.error("Error getting email credentials:", error);
      res.status(500).json({ error: "Erro ao buscar credenciais" });
    }
  });

  app.post("/api/email-marketing/credentials", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { apiKey, senderEmail, senderName } = req.body;

      if (!apiKey || !senderEmail) {
        return res.status(400).json({ error: "API Key e email do remetente são obrigatórios" });
      }

      const encryptedApiKey = encrypt(apiKey);

      const existing = await storage.getAdminEmailCredential(admin.id);

      if (existing) {
        await storage.updateAdminEmailCredential(admin.id, {
          encryptedApiKey,
          senderEmail,
          senderName: senderName || "Auto Webinar",
          isValid: false
        });
      } else {
        await storage.createAdminEmailCredential({
          adminId: admin.id,
          provider: "resend",
          encryptedApiKey,
          senderEmail,
          senderName: senderName || "Auto Webinar",
          isValid: false
        });
      }

      res.json({ success: true, message: "Credenciais salvas. Faça a validação para confirmar." });
    } catch (error: any) {
      console.error("Error saving email credentials:", error);
      res.status(500).json({ error: "Erro ao salvar credenciais" });
    }
  });

  app.post("/api/email-marketing/credentials/validate", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const credential = await storage.getAdminEmailCredential(admin.id);
      if (!credential) {
        return res.status(400).json({ error: "Nenhuma credencial configurada" });
      }

      const apiKey = decrypt(credential.encryptedApiKey);
      const resend = new Resend(apiKey);

      try {
        await resend.emails.send({
          from: `${credential.senderName || 'Auto Webinar'} <${credential.senderEmail}>`,
          to: admin.email,
          subject: "Teste de Validação - Auto Webinar",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #22c55e;">Validação bem-sucedida!</h2>
              <p>Sua integração com o Resend está funcionando corretamente.</p>
              <p>Agora você pode configurar sequências de email para seus webinários.</p>
              <hr style="border: 1px solid #eee; margin: 20px 0;">
              <p style="color: #888; font-size: 12px;">Este é um email de teste enviado pelo Auto Webinar.</p>
            </div>
          `
        });

        await storage.updateAdminEmailCredential(admin.id, {
          isValid: true,
          lastValidatedAt: new Date()
        });

        res.json({ success: true, message: "Credenciais validadas! Um email de teste foi enviado." });
      } catch (sendError: any) {
        console.error("Resend validation error:", sendError);
        
        await storage.updateAdminEmailCredential(admin.id, {
          isValid: false
        });

        res.status(400).json({ 
          error: "Falha na validação", 
          details: sendError.message || "Verifique sua API Key e domínio configurado no Resend" 
        });
      }
    } catch (error: any) {
      console.error("Error validating credentials:", error);
      res.status(500).json({ error: "Erro ao validar credenciais" });
    }
  });

  app.delete("/api/email-marketing/credentials", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      await storage.deleteAdminEmailCredential(admin.id);
      res.json({ success: true, message: "Credenciais removidas" });
    } catch (error: any) {
      console.error("Error deleting credentials:", error);
      res.status(500).json({ error: "Erro ao remover credenciais" });
    }
  });

  // ============================================
  // EMAIL SEQUENCES
  // ============================================

  app.get("/api/email-marketing/sequences", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { webinarId } = req.query;
      
      let sequences;
      if (webinarId) {
        sequences = await storage.listEmailSequencesByWebinar(webinarId as string);
      } else {
        sequences = await storage.listEmailSequencesByAdmin(admin.id);
      }

      res.json(sequences);
    } catch (error: any) {
      console.error("Error listing sequences:", error);
      res.status(500).json({ error: "Erro ao listar sequências" });
    }
  });

  app.get("/api/email-marketing/sequences/:id", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const sequence = await storage.getEmailSequenceById(req.params.id);
      
      if (!sequence) {
        return res.status(404).json({ error: "Sequência não encontrada" });
      }

      if (sequence.adminId !== admin.id && admin.role !== 'superadmin') {
        return res.status(403).json({ error: "Acesso negado" });
      }

      res.json(sequence);
    } catch (error: any) {
      console.error("Error getting sequence:", error);
      res.status(500).json({ error: "Erro ao buscar sequência" });
    }
  });

  app.post("/api/email-marketing/sequences", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { webinarId, name, phase, offsetMinutes, subject, preheader, designJson, compiledHtml } = req.body;

      if (!name || !phase || offsetMinutes === undefined || !subject) {
        return res.status(400).json({ error: "Campos obrigatórios: name, phase, offsetMinutes, subject" });
      }

      if (!['pre', 'post'].includes(phase)) {
        return res.status(400).json({ error: "Phase deve ser 'pre' ou 'post'" });
      }

      const sequence = await storage.createEmailSequence({
        adminId: admin.id,
        webinarId: webinarId || null,
        name,
        phase,
        offsetMinutes: parseInt(offsetMinutes),
        subject,
        preheader: preheader || "",
        designJson: designJson || "{}",
        compiledHtml: compiledHtml || "",
        isActive: true
      });

      res.json(sequence);
    } catch (error: any) {
      console.error("Error creating sequence:", error);
      res.status(500).json({ error: "Erro ao criar sequência" });
    }
  });

  app.patch("/api/email-marketing/sequences/:id", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const existing = await storage.getEmailSequenceById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Sequência não encontrada" });
      }

      if (existing.adminId !== admin.id && admin.role !== 'superadmin') {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const { name, phase, offsetMinutes, subject, preheader, designJson, compiledHtml, isActive } = req.body;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (phase !== undefined) updateData.phase = phase;
      if (offsetMinutes !== undefined) updateData.offsetMinutes = parseInt(offsetMinutes);
      if (subject !== undefined) updateData.subject = subject;
      if (preheader !== undefined) updateData.preheader = preheader;
      if (designJson !== undefined) updateData.designJson = designJson;
      if (compiledHtml !== undefined) updateData.compiledHtml = compiledHtml;
      if (isActive !== undefined) updateData.isActive = isActive;

      const updated = await storage.updateEmailSequence(req.params.id, updateData);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating sequence:", error);
      res.status(500).json({ error: "Erro ao atualizar sequência" });
    }
  });

  app.delete("/api/email-marketing/sequences/:id", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const existing = await storage.getEmailSequenceById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Sequência não encontrada" });
      }

      if (existing.adminId !== admin.id && admin.role !== 'superadmin') {
        return res.status(403).json({ error: "Acesso negado" });
      }

      await storage.deleteEmailSequence(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting sequence:", error);
      res.status(500).json({ error: "Erro ao excluir sequência" });
    }
  });

  // ============================================
  // LEAD FORM CONFIGS
  // ============================================

  app.get("/api/email-marketing/lead-form/:webinarId", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const config = await storage.getLeadFormConfigByWebinar(req.params.webinarId);
      
      if (!config) {
        return res.json({
          webinarId: req.params.webinarId,
          title: "Inscreva-se no Webinário",
          subtitle: "Preencha seus dados para participar",
          collectName: true,
          collectEmail: true,
          collectWhatsapp: true,
          collectCity: false,
          collectState: false,
          customFields: [],
          requireConsent: true,
          consentText: "Concordo em receber comunicações sobre este webinário",
          buttonText: "Quero Participar",
          buttonColor: "#22c55e",
          successMessage: "Inscrição realizada com sucesso!",
          redirectUrl: null,
          backgroundColor: "#ffffff",
          textColor: "#000000",
          isActive: true,
          isDefault: true
        });
      }

      res.json({
        ...config,
        customFields: JSON.parse(config.customFields || "[]"),
        isDefault: false
      });
    } catch (error: any) {
      console.error("Error getting lead form config:", error);
      res.status(500).json({ error: "Erro ao buscar configuração do formulário" });
    }
  });

  app.post("/api/email-marketing/lead-form/:webinarId", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const webinar = await storage.getWebinarById(req.params.webinarId);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar não encontrado" });
      }

      if (webinar.ownerId !== admin.id && admin.role !== 'superadmin') {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const existing = await storage.getLeadFormConfigByWebinar(req.params.webinarId);
      
      const {
        title, subtitle, collectName, collectEmail, collectWhatsapp,
        collectCity, collectState, customFields, requireConsent,
        consentText, buttonText, buttonColor, successMessage,
        redirectUrl, backgroundColor, textColor, isActive
      } = req.body;

      const data: any = {
        webinarId: req.params.webinarId,
        title,
        subtitle,
        collectName,
        collectEmail,
        collectWhatsapp,
        collectCity,
        collectState,
        customFields: JSON.stringify(customFields || []),
        requireConsent,
        consentText,
        buttonText,
        buttonColor,
        successMessage,
        redirectUrl,
        backgroundColor,
        textColor,
        isActive
      };

      let config;
      if (existing) {
        config = await storage.updateLeadFormConfig(req.params.webinarId, data);
      } else {
        config = await storage.createLeadFormConfig(data);
      }

      res.json(config);
    } catch (error: any) {
      console.error("Error saving lead form config:", error);
      res.status(500).json({ error: "Erro ao salvar configuração do formulário" });
    }
  });

  // ============================================
  // LEAD CAPTURE (Public endpoint for embed forms)
  // ============================================

  app.post("/api/public/lead-capture/:webinarSlug", async (req, res) => {
    try {
      const webinar = await storage.getWebinarBySlug(req.params.webinarSlug);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar não encontrado" });
      }

      const { name, email, whatsapp, city, state, customData, consent } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Nome é obrigatório" });
      }

      const formConfig = await storage.getLeadFormConfigByWebinar(webinar.id);
      
      if (formConfig?.requireConsent && !consent) {
        return res.status(400).json({ error: "Consentimento é obrigatório" });
      }

      const nextSession = calculateNextWebinarSession(webinar);
      const sessionId = nextSession ? `${webinar.id}-${nextSession.dateString}` : null;
      
      const leadId = crypto.randomUUID();
      const lead = await db.insert(leads).values({
        id: leadId,
        webinarId: webinar.id,
        name,
        email: email || null,
        whatsapp: whatsapp || null,
        city: city || null,
        state: state || null,
        customData: customData ? JSON.stringify(customData) : null,
        sessionId: sessionId,
        capturedAt: new Date()
      }).returning();

      if (email && webinar.ownerId && nextSession) {
        scheduleEmailsForLead(
          leadId,
          webinar.id,
          webinar.ownerId,
          nextSession.startTime,
          nextSession.dateString
        ).catch(err => console.error("Error scheduling emails for lead:", err));
      }

      res.json({ 
        success: true, 
        message: formConfig?.successMessage || "Inscrição realizada com sucesso!",
        redirectUrl: formConfig?.redirectUrl || null
      });
    } catch (error: any) {
      console.error("Error capturing lead:", error);
      res.status(500).json({ error: "Erro ao processar inscrição" });
    }
  });

  // ============================================
  // EMBED CODE GENERATOR
  // ============================================

  app.get("/api/email-marketing/embed-code/:webinarId", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const webinar = await storage.getWebinarById(req.params.webinarId);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar não encontrado" });
      }

      if (webinar.ownerId !== admin.id && admin.role !== 'superadmin') {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      
      const embedCode = `<!-- Auto Webinar Lead Form -->
<div id="autowebinar-form-${webinar.slug}"></div>
<script src="${baseUrl}/embed/lead-form.js" data-webinar="${webinar.slug}"></script>`;

      const iframeCode = `<iframe 
  src="${baseUrl}/embed/lead-form/${webinar.slug}" 
  width="100%" 
  height="500" 
  frameborder="0" 
  style="border: none; max-width: 500px;">
</iframe>`;

      res.json({
        embedCode,
        iframeCode,
        directUrl: `${baseUrl}/embed/lead-form/${webinar.slug}`
      });
    } catch (error: any) {
      console.error("Error generating embed code:", error);
      res.status(500).json({ error: "Erro ao gerar código embed" });
    }
  });

  // ============================================
  // SCHEDULED EMAILS MANAGEMENT
  // ============================================

  app.get("/api/email-marketing/scheduled/:webinarId", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const webinar = await storage.getWebinarById(req.params.webinarId);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar não encontrado" });
      }

      if (webinar.ownerId !== admin.id && admin.role !== 'superadmin') {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const scheduledEmails = await storage.listScheduledEmailsByWebinar(req.params.webinarId);
      res.json(scheduledEmails);
    } catch (error: any) {
      console.error("Error listing scheduled emails:", error);
      res.status(500).json({ error: "Erro ao listar emails agendados" });
    }
  });

  app.delete("/api/email-marketing/scheduled/:id", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const scheduled = await storage.getScheduledEmailById(req.params.id);
      if (!scheduled) {
        return res.status(404).json({ error: "Email agendado não encontrado" });
      }

      if (scheduled.adminId !== admin.id && admin.role !== 'superadmin') {
        return res.status(403).json({ error: "Acesso negado" });
      }

      await storage.deleteScheduledEmail(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting scheduled email:", error);
      res.status(500).json({ error: "Erro ao excluir email agendado" });
    }
  });

  // ============================================
  // TEST EMAIL SEND
  // ============================================

  app.post("/api/email-marketing/sequences/:id/test", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const sequence = await storage.getEmailSequenceById(req.params.id);
      if (!sequence) {
        return res.status(404).json({ error: "Sequência não encontrada" });
      }

      if (sequence.adminId !== admin.id && admin.role !== 'superadmin') {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const credential = await storage.getAdminEmailCredential(admin.id);
      
      let resendClient: Resend;
      let fromEmail: string;
      let fromName: string;

      if (credential && credential.isValid) {
        const apiKey = decrypt(credential.encryptedApiKey);
        resendClient = new Resend(apiKey);
        fromEmail = credential.senderEmail || 'contato@autowebinar.shop';
        fromName = credential.senderName || 'Auto Webinar';
      } else {
        const systemApiKey = process.env.RESEND_API_KEY;
        if (!systemApiKey) {
          return res.status(400).json({ error: "Nenhuma configuração de email disponível" });
        }
        resendClient = new Resend(systemApiKey);
        fromEmail = 'contato@autowebinar.shop';
        fromName = 'Auto Webinar';
      }

      const testHtml = sequence.compiledHtml || `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>${sequence.subject}</h2>
          <p>Este é um email de teste da sequência "${sequence.name}".</p>
          <p><strong>Fase:</strong> ${sequence.phase === 'pre' ? 'Antes do webinar' : 'Após o webinar'}</p>
          <p><strong>Tempo:</strong> ${Math.abs(sequence.offsetMinutes)} minutos ${sequence.offsetMinutes < 0 ? 'antes' : 'depois'}</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <p style="color: #888; font-size: 12px;">Este é um email de teste do Auto Webinar.</p>
        </div>
      `;

      await resendClient.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: admin.email,
        subject: `[TESTE] ${sequence.subject}`,
        html: testHtml
      });

      res.json({ success: true, message: "Email de teste enviado para " + admin.email });
    } catch (error: any) {
      console.error("Error sending test email:", error);
      res.status(500).json({ error: "Erro ao enviar email de teste: " + error.message });
    }
  });

  // ============================================
  // SCHEDULER STATUS
  // ============================================

  app.get("/api/email-marketing/scheduler/status", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const status = await getSchedulerStatus();
      res.json(status);
    } catch (error: any) {
      console.error("Error getting scheduler status:", error);
      res.status(500).json({ error: "Erro ao obter status do agendador" });
    }
  });

  // ============================================
  // LEADS MANAGEMENT
  // ============================================

  app.get("/api/email-marketing/leads/:webinarId", async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      if (!admin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const webinar = await storage.getWebinarById(req.params.webinarId);
      if (!webinar) {
        return res.status(404).json({ error: "Webinar não encontrado" });
      }

      if (webinar.ownerId !== admin.id && admin.role !== 'superadmin') {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const webinarLeads = await db
        .select()
        .from(leads)
        .where(eq(leads.webinarId, req.params.webinarId))
        .orderBy(leads.capturedAt);

      res.json(webinarLeads);
    } catch (error: any) {
      console.error("Error listing leads:", error);
      res.status(500).json({ error: "Erro ao listar leads" });
    }
  });
}
