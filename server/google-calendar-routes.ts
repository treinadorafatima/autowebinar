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
  return `${baseUrl}/api/google/callback`;
}

function createOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
}

async function getAuthenticatedClient(adminId: string) {
  const token = await storage.getGoogleCalendarToken(adminId);
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
  const session = req.session as any;
  if (!session?.adminId) {
    return { admin: null, error: "Não autenticado", errorCode: 401 };
  }
  const admin = await storage.getAdminById(session.adminId);
  if (!admin) {
    return { admin: null, error: "Admin não encontrado", errorCode: 401 };
  }
  return { admin, error: null, errorCode: null };
}

export function registerGoogleCalendarRoutes(app: Express) {
  app.get("/api/google/auth-url", async (req: Request, res: Response) => {
    try {
      const { admin, error, errorCode } = await validateSessionAndGetAdmin(req);
      if (!admin) {
        return res.status(errorCode || 401).json({ error: error || "Não autenticado" });
      }

      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return res.status(500).json({ error: "Google Calendar não configurado no servidor" });
      }

      const oauth2Client = createOAuth2Client();
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
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
        return res.redirect("/admin/configuracoes?calendar=error&message=" + encodeURIComponent(String(authError)));
      }

      if (!code || !state) {
        return res.redirect("/admin/configuracoes?calendar=error&message=Parâmetros inválidos");
      }

      const adminId = String(state);
      const admin = await storage.getAdminById(adminId);
      if (!admin) {
        return res.redirect("/admin/configuracoes?calendar=error&message=Usuário não encontrado");
      }

      const oauth2Client = createOAuth2Client();
      const { tokens } = await oauth2Client.getToken(String(code));

      if (!tokens.access_token || !tokens.refresh_token) {
        return res.redirect("/admin/configuracoes?calendar=error&message=Tokens inválidos");
      }

      await storage.upsertGoogleCalendarToken(adminId, {
        adminId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date || null,
        calendarId: "primary",
        isConnected: true,
      });

      res.redirect("/admin/configuracoes?calendar=connected");
    } catch (error: any) {
      console.error("[google-calendar] Callback error:", error);
      res.redirect("/admin/configuracoes?calendar=error&message=" + encodeURIComponent(error.message));
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

      const calendars = await storage.getConnectedAdminCalendars(admin.id);
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
