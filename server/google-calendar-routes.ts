import { Express, Request, Response } from "express";
import { google } from "googleapis";
import { storage } from "./storage";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

function getRedirectUri(): string {
  const baseUrl = process.env.PUBLIC_BASE_URL 
    || process.env.VITE_PUBLIC_BASE_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
    || process.env.BASE_URL 
    || "http://localhost:5000";
  return `${baseUrl}/api/google/callback`;
}

async function getGoogleCredentials() {
  const credentials = await storage.getGoogleOAuthCredentials();
  if (credentials) {
    console.log("[google-calendar] Using credentials from database/env, clientId:", credentials.clientId?.slice(0, 20) + "...");
  } else {
    console.log("[google-calendar] No credentials found in database or environment variables");
  }
  return credentials;
}

async function createOAuth2Client() {
  const credentials = await getGoogleCredentials();
  if (!credentials) {
    throw new Error("Google Calendar não configurado no servidor");
  }
  return new google.auth.OAuth2(
    credentials.clientId,
    credentials.clientSecret,
    getRedirectUri()
  );
}

async function getAuthenticatedClient(adminId: string) {
  const token = await storage.getGoogleCalendarToken(adminId);
  if (!token) {
    throw new Error("Conta não conectada ao Google Calendar");
  }

  const oauth2Client = await createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiryDate || undefined,
  });

  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.refresh_token) {
      await storage.updateGoogleCalendarToken(adminId, {
        accessToken: tokens.access_token || token.accessToken,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date || null,
      });
    } else if (tokens.access_token) {
      await storage.updateGoogleCalendarToken(adminId, {
        accessToken: tokens.access_token,
        expiryDate: tokens.expiry_date || null,
      });
    }
  });

  return oauth2Client;
}

async function validateSessionAndGetAdmin(req: Request) {
  // Buscar token do header Authorization
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "") || "";
  
  if (!token) {
    return { admin: null, error: "Não autenticado", errorCode: 401 };
  }

  // Validar token na tabela de sessões
  const email = await validateToken(token);
  if (!email) {
    return { admin: null, error: "Sessão inválida", errorCode: 401 };
  }

  const admin = await storage.getAdminByEmail(email);
  if (!admin) {
    return { admin: null, error: "Admin não encontrado", errorCode: 401 };
  }
  return { admin, error: null, errorCode: null };
}

async function validateToken(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const { db } = await import("./db");
    const { sessions } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const result = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token))
      .limit(1);
    
    if (result.length === 0) return null;
    
    const session = result[0];
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      return null;
    }
    
    return session.email;
  } catch (error) {
    console.error("[google-calendar] Token validation error:", error);
    return null;
  }
}

export function registerGoogleCalendarRoutes(app: Express) {
  app.get("/api/google/auth-url", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const credentials = await getGoogleCredentials();
      if (!credentials) {
        return res.status(500).json({ error: "Google Calendar não configurado no servidor" });
      }

      const oauth2Client = await createOAuth2Client();
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent select_account",
        scope: SCOPES,
        state: admin.id,
      });

      res.json({ authUrl });
    } catch (error: any) {
      console.error("[google-calendar] Error generating auth URL:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/google/callback", async (req: Request, res: Response) => {
    try {
      const { code, state, error: authError } = req.query;

      if (authError) {
        return res.redirect("/admin/ai-agents?calendar=error&message=" + encodeURIComponent(String(authError)));
      }

      if (!code || !state) {
        return res.redirect("/admin/ai-agents?calendar=error&message=Parâmetros inválidos");
      }

      const adminId = String(state);
      const admin = await storage.getAdminById(adminId);
      if (!admin) {
        return res.redirect("/admin/ai-agents?calendar=error&message=Usuário não encontrado");
      }

      const oauth2Client = await createOAuth2Client();
      const { tokens } = await oauth2Client.getToken(String(code));

      if (!tokens.access_token || !tokens.refresh_token) {
        return res.redirect("/admin/ai-agents?calendar=error&message=Tokens inválidos");
      }

      oauth2Client.setCredentials(tokens);
      
      // Buscar email da conta Google conectada
      let googleEmail: string | undefined;
      try {
        const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        googleEmail = userInfo.data.email || undefined;
        console.log(`[google-calendar] Connected account email: ${googleEmail}`);
      } catch (emailError: any) {
        console.error("[google-calendar] Error fetching user info:", emailError);
      }

      // Salvar tokens na tabela legada também
      await storage.upsertGoogleCalendarToken(adminId, {
        adminId,
        email: googleEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date || null,
        calendarId: "primary",
        isConnected: true,
      });

      // Buscar lista de calendários do Google e sincronizar
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      
      try {
        const calendarList = await calendar.calendarList.list();
        const calendars = (calendarList.data.items || [])
          .filter(cal => cal.id && cal.summary)
          .map(cal => ({
            googleCalendarId: cal.id!,
            name: cal.summary!,
            isPrimary: cal.primary || false,
          }));
        
        console.log(`[google-calendar] Found ${calendars.length} calendars for admin ${adminId}`);
        
        await storage.syncAdminCalendars(adminId, calendars);
      } catch (calError: any) {
        console.error("[google-calendar] Error fetching calendar list:", calError);
      }

      res.redirect("/admin/ai-agents?calendar=connected");
    } catch (error: any) {
      console.error("[google-calendar] Callback error:", error);
      res.redirect("/admin/ai-agents?calendar=error&message=" + encodeURIComponent(error.message));
    }
  });

  app.get("/api/google/status", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const token = await storage.getGoogleCalendarToken(admin.id);
      res.json({
        connected: !!token?.isConnected,
        email: token?.email || null,
        calendarId: token?.calendarId || null,
        lastSyncAt: token?.lastSyncAt || null,
      });
    } catch (error: any) {
      console.error("[google-calendar] Status error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/google/disconnect", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      await storage.deleteGoogleCalendarToken(admin.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[google-calendar] Disconnect error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/calendar/events", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { from, to, syncWithGoogle } = req.query;

      if (syncWithGoogle === "true") {
        try {
          const oauth2Client = await getAuthenticatedClient(admin.id);
          const calendar = google.calendar({ version: "v3", auth: oauth2Client });

          const response = await calendar.events.list({
            calendarId: "primary",
            timeMin: from ? new Date(String(from)).toISOString() : new Date().toISOString(),
            timeMax: to ? new Date(String(to)).toISOString() : undefined,
            maxResults: 100,
            singleEvents: true,
            orderBy: "startTime",
          });

          const googleEvents = response.data.items || [];
          for (const gEvent of googleEvents) {
            if (!gEvent.id || !gEvent.start?.dateTime || !gEvent.end?.dateTime) continue;

            const existing = await storage.getCalendarEventByGoogleId(gEvent.id, admin.id);
            if (existing) {
              await storage.updateCalendarEvent(existing.id, {
                title: gEvent.summary || "Sem título",
                description: gEvent.description || null,
                startTime: new Date(gEvent.start.dateTime),
                endTime: new Date(gEvent.end.dateTime),
                location: gEvent.location || null,
                status: gEvent.status === "cancelled" ? "cancelled" : "confirmed",
                syncedAt: new Date(),
              });
            } else {
              await storage.createCalendarEvent({
                adminId: admin.id,
                googleEventId: gEvent.id,
                title: gEvent.summary || "Sem título",
                description: gEvent.description || null,
                startTime: new Date(gEvent.start.dateTime),
                endTime: new Date(gEvent.end.dateTime),
                location: gEvent.location || null,
                attendeeEmail: gEvent.attendees?.[0]?.email || null,
                status: gEvent.status === "cancelled" ? "cancelled" : "confirmed",
                source: "google",
                syncedAt: new Date(),
              });
            }
          }

          await storage.updateGoogleCalendarToken(admin.id, { lastSyncAt: new Date() });
        } catch (syncError: any) {
          console.error("[google-calendar] Sync error:", syncError);
        }
      }

      const fromDate = from ? new Date(String(from)) : undefined;
      const toDate = to ? new Date(String(to)) : undefined;
      const events = await storage.listCalendarEventsByAdmin(admin.id, fromDate, toDate);

      res.json(events);
    } catch (error: any) {
      console.error("[google-calendar] List events error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/calendar/events", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { title, description, startTime, endTime, location, attendeeEmail, attendeeName, attendeePhone, syncToGoogle } = req.body;

      if (!title || !startTime || !endTime) {
        return res.status(400).json({ error: "Título, data/hora início e fim são obrigatórios" });
      }

      let googleEventId: string | null = null;

      if (syncToGoogle !== false) {
        try {
          const oauth2Client = await getAuthenticatedClient(admin.id);
          const calendar = google.calendar({ version: "v3", auth: oauth2Client });

          const event: any = {
            summary: title,
            description: description || undefined,
            start: {
              dateTime: new Date(startTime).toISOString(),
              timeZone: "America/Sao_Paulo",
            },
            end: {
              dateTime: new Date(endTime).toISOString(),
              timeZone: "America/Sao_Paulo",
            },
            location: location || undefined,
          };

          if (attendeeEmail) {
            event.attendees = [{ email: attendeeEmail }];
          }

          const response = await calendar.events.insert({
            calendarId: "primary",
            requestBody: event,
            sendUpdates: attendeeEmail ? "all" : "none",
          });

          googleEventId = response.data.id || null;
        } catch (googleError: any) {
          console.error("[google-calendar] Failed to create Google event:", googleError);
        }
      }

      const calendarEvent = await storage.createCalendarEvent({
        adminId: admin.id,
        googleEventId,
        title,
        description: description || null,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        location: location || null,
        attendeeEmail: attendeeEmail || null,
        attendeeName: attendeeName || null,
        attendeePhone: attendeePhone || null,
        status: "confirmed",
        source: "manual",
        syncedAt: googleEventId ? new Date() : null,
      });

      res.json(calendarEvent);
    } catch (error: any) {
      console.error("[google-calendar] Create event error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/calendar/events/:id", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const event = await storage.getCalendarEventById(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }
      if (event.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const { title, description, startTime, endTime, location, attendeeEmail, attendeeName, attendeePhone, status, syncToGoogle } = req.body;

      if (syncToGoogle !== false && event.googleEventId) {
        try {
          const oauth2Client = await getAuthenticatedClient(admin.id);
          const calendar = google.calendar({ version: "v3", auth: oauth2Client });

          const updateEvent: any = {};
          if (title) updateEvent.summary = title;
          if (description !== undefined) updateEvent.description = description;
          if (startTime) {
            updateEvent.start = {
              dateTime: new Date(startTime).toISOString(),
              timeZone: "America/Sao_Paulo",
            };
          }
          if (endTime) {
            updateEvent.end = {
              dateTime: new Date(endTime).toISOString(),
              timeZone: "America/Sao_Paulo",
            };
          }
          if (location !== undefined) updateEvent.location = location;
          if (attendeeEmail) updateEvent.attendees = [{ email: attendeeEmail }];

          await calendar.events.patch({
            calendarId: "primary",
            eventId: event.googleEventId,
            requestBody: updateEvent,
            sendUpdates: attendeeEmail ? "all" : "none",
          });
        } catch (googleError: any) {
          console.error("[google-calendar] Failed to update Google event:", googleError);
        }
      }

      const updateData: any = {};
      if (title) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (startTime) updateData.startTime = new Date(startTime);
      if (endTime) updateData.endTime = new Date(endTime);
      if (location !== undefined) updateData.location = location;
      if (attendeeEmail !== undefined) updateData.attendeeEmail = attendeeEmail;
      if (attendeeName !== undefined) updateData.attendeeName = attendeeName;
      if (attendeePhone !== undefined) updateData.attendeePhone = attendeePhone;
      if (status) updateData.status = status;

      const updated = await storage.updateCalendarEvent(event.id, updateData);
      res.json(updated);
    } catch (error: any) {
      console.error("[google-calendar] Update event error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/calendar/events/:id", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const event = await storage.getCalendarEventById(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }
      if (event.adminId !== admin.id) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const { deleteFromGoogle } = req.query;

      if (deleteFromGoogle !== "false" && event.googleEventId) {
        try {
          const oauth2Client = await getAuthenticatedClient(admin.id);
          const calendar = google.calendar({ version: "v3", auth: oauth2Client });

          await calendar.events.delete({
            calendarId: "primary",
            eventId: event.googleEventId,
            sendUpdates: "all",
          });
        } catch (googleError: any) {
          console.error("[google-calendar] Failed to delete Google event:", googleError);
        }
      }

      await storage.deleteCalendarEvent(event.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[google-calendar] Delete event error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/google-calendar/connected", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const token = await storage.getGoogleCalendarToken(admin.id);
      console.log("[google-calendar] Token for admin:", admin.id, "token exists:", !!token, "isConnected:", token?.isConnected);
      
      if (!token || !token.isConnected) {
        console.log("[google-calendar] No token or not connected, returning empty array");
        return res.json([]);
      }

      const calendars = await storage.getConnectedAdminCalendars(admin.id);
      console.log("[google-calendar] Found calendars:", calendars.length);
      
      const mapped = calendars.map((cal) => ({
        id: cal.id,
        name: cal.name,
        isPrimary: cal.isPrimary,
      }));
      res.json(mapped);
    } catch (error: any) {
      console.error("[google-calendar] Get connected calendars error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Sincronizar calendários do Google
  app.post("/api/google-calendar/sync", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const oauth2Client = await getAuthenticatedClient(admin.id);
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      const calendarList = await calendar.calendarList.list();
      const calendars = (calendarList.data.items || [])
        .filter(cal => cal.id && cal.summary)
        .map(cal => ({
          googleCalendarId: cal.id!,
          name: cal.summary!,
          isPrimary: cal.primary || false,
        }));

      console.log(`[google-calendar] Sync: Found ${calendars.length} calendars for admin ${admin.id}`);
      
      await storage.syncAdminCalendars(admin.id, calendars);
      
      const updatedCalendars = await storage.getConnectedAdminCalendars(admin.id);
      res.json({ 
        success: true, 
        calendars: updatedCalendars.map(c => ({ id: c.id, name: c.name, isPrimary: c.isPrimary }))
      });
    } catch (error: any) {
      console.error("[google-calendar] Sync error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Criar nova agenda no Google Calendar
  app.post("/api/google-calendar/create", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { name } = req.body;
      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "Nome da agenda é obrigatório" });
      }

      const oauth2Client = await getAuthenticatedClient(admin.id);
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      // Criar nova agenda no Google
      const newCalendar = await calendar.calendars.insert({
        requestBody: {
          summary: name,
          timeZone: "America/Sao_Paulo",
        },
      });

      console.log(`[google-calendar] Created new calendar: ${newCalendar.data.id} - ${name}`);

      // Sincronizar para salvar a nova agenda localmente
      const calendarList = await calendar.calendarList.list();
      const calendars = (calendarList.data.items || [])
        .filter(cal => cal.id && cal.summary)
        .map(cal => ({
          googleCalendarId: cal.id!,
          name: cal.summary!,
          isPrimary: cal.primary || false,
        }));

      await storage.syncAdminCalendars(admin.id, calendars);

      const updatedCalendars = await storage.getConnectedAdminCalendars(admin.id);
      res.json({ 
        success: true, 
        newCalendarId: newCalendar.data.id,
        calendars: updatedCalendars.map(c => ({ id: c.id, name: c.name, isPrimary: c.isPrimary }))
      });
    } catch (error: any) {
      console.error("[google-calendar] Create calendar error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/calendar/free-busy", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      const { from, to } = req.query;
      if (!from || !to) {
        return res.status(400).json({ error: "Parâmetros from e to são obrigatórios" });
      }

      const oauth2Client = await getAuthenticatedClient(admin.id);
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: new Date(String(from)).toISOString(),
          timeMax: new Date(String(to)).toISOString(),
          items: [{ id: "primary" }],
        },
      });

      const busy = response.data.calendars?.primary?.busy || [];
      res.json({ busy });
    } catch (error: any) {
      console.error("[google-calendar] Free/busy error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[google-calendar] Routes registered");
}
