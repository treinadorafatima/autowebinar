import { Express, Request, Response } from "express";
import { google } from "googleapis";
import { storage } from "./storage";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

function getRedirectUri(): string {
  const baseUrl = process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.BASE_URL || "http://localhost:5000";
  return `${baseUrl}/api/client/google/callback`;
}

function createOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
}

async function getClientAuthenticatedClient(adminId: string, clientPhone: string) {
  const token = await storage.getClientGoogleCalendarToken(adminId, clientPhone);
  if (!token) {
    throw new Error("Conta não conectada ao Google Calendar");
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiryDate || undefined,
  });

  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.refresh_token) {
      await storage.updateClientGoogleCalendarToken(adminId, clientPhone, {
        accessToken: tokens.access_token || token.accessToken,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date || null,
      });
    } else if (tokens.access_token) {
      await storage.updateClientGoogleCalendarToken(adminId, clientPhone, {
        accessToken: tokens.access_token,
        expiryDate: tokens.expiry_date || null,
      });
    }
  });

  return oauth2Client;
}

export function registerClientCalendarRoutes(app: Express) {
  app.get("/api/client/google/auth-url", async (req: Request, res: Response) => {
    try {
      const { agentId, clientPhone } = req.query;

      if (!agentId || !clientPhone) {
        return res.status(400).json({ error: "agentId e clientPhone são obrigatórios" });
      }

      const agent = await storage.getAiAgentById(String(agentId));
      if (!agent) {
        return res.status(404).json({ error: "Agente não encontrado" });
      }

      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return res.status(500).json({ error: "Google Calendar não configurado no servidor" });
      }

      const oauth2Client = createOAuth2Client();
      const state = JSON.stringify({ adminId: agent.adminId, clientPhone, agentId });
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: SCOPES,
        state: Buffer.from(state).toString("base64"),
      });

      res.json({ authUrl });
    } catch (error: any) {
      console.error("[client-calendar] Error generating auth URL:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/client/google/callback", async (req: Request, res: Response) => {
    try {
      const { code, state, error: authError } = req.query;

      if (authError) {
        return res.redirect("/?calendar=error&message=" + encodeURIComponent(String(authError)));
      }

      if (!code || !state) {
        return res.redirect("/?calendar=error&message=Parâmetros inválidos");
      }

      const stateData = JSON.parse(Buffer.from(String(state), "base64").toString());
      const { adminId, clientPhone, agentId } = stateData;

      const admin = await storage.getAdminById(adminId);
      if (!admin) {
        return res.redirect("/?calendar=error&message=Admin não encontrado");
      }

      const oauth2Client = createOAuth2Client();
      const { tokens } = await oauth2Client.getToken(String(code));

      if (!tokens.access_token || !tokens.refresh_token) {
        return res.redirect("/?calendar=error&message=Tokens inválidos");
      }

      await storage.upsertClientGoogleCalendarToken(adminId, String(clientPhone), {
        clientEmail: tokens.id_token ? new URL("").searchParams.get("email") || undefined : undefined,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date || null,
        calendarId: "primary",
        isConnected: true,
      });

      res.redirect(`/?agentId=${agentId}&calendar=connected`);
    } catch (error: any) {
      console.error("[client-calendar] Callback error:", error);
      res.redirect("/?calendar=error&message=" + encodeURIComponent(error.message));
    }
  });

  app.get("/api/client/google/status", async (req: Request, res: Response) => {
    try {
      const { agentId, clientPhone } = req.query;

      if (!agentId || !clientPhone) {
        return res.status(400).json({ error: "agentId e clientPhone são obrigatórios" });
      }

      const agent = await storage.getAiAgentById(String(agentId));
      if (!agent) {
        return res.status(404).json({ error: "Agente não encontrado" });
      }

      const token = await storage.getClientGoogleCalendarToken(agent.adminId, String(clientPhone));
      res.json({
        connected: !!token?.isConnected,
        email: token?.clientEmail || null,
      });
    } catch (error: any) {
      console.error("[client-calendar] Status error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/client/google/disconnect", async (req: Request, res: Response) => {
    try {
      const { agentId, clientPhone } = req.body;

      if (!agentId || !clientPhone) {
        return res.status(400).json({ error: "agentId e clientPhone são obrigatórios" });
      }

      const agent = await storage.getAiAgentById(agentId);
      if (!agent) {
        return res.status(404).json({ error: "Agente não encontrado" });
      }

      await storage.deleteClientGoogleCalendarToken(agent.adminId, clientPhone);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[client-calendar] Disconnect error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[client-calendar] Routes registered");
}
