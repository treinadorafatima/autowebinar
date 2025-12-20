import { google } from "googleapis";
import { storage } from "./storage";
import { format, parseISO, addHours, startOfDay, endOfDay, addDays } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

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
    return null;
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

export interface ScheduleResult {
  success: boolean;
  message: string;
  eventId?: string;
  eventDetails?: {
    title: string;
    startTime: string;
    endTime: string;
    location?: string;
  };
}

export interface AvailabilitySlot {
  start: string;
  end: string;
  formatted: string;
}

export async function checkCalendarConnected(adminId: string): Promise<boolean> {
  const token = await storage.getGoogleCalendarToken(adminId);
  return !!token?.isConnected;
}

export async function getAvailableSlots(
  adminId: string,
  date: Date,
  durationMinutes: number = 60,
  timezone: string = "America/Sao_Paulo"
): Promise<AvailabilitySlot[]> {
  const oauth2Client = await getAuthenticatedClient(adminId);
  if (!oauth2Client) {
    return [];
  }

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      items: [{ id: "primary" }],
    },
  });

  const busySlots = response.data.calendars?.primary?.busy || [];

  const workStartHour = 9;
  const workEndHour = 18;
  const slotDuration = durationMinutes;

  const availableSlots: AvailabilitySlot[] = [];
  const zonedDate = toZonedTime(date, timezone);
  
  for (let hour = workStartHour; hour < workEndHour; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      if (hour === workEndHour - 1 && minute + slotDuration > 60) continue;

      const slotStart = new Date(zonedDate);
      slotStart.setHours(hour, minute, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);

      if (slotEnd.getHours() > workEndHour || (slotEnd.getHours() === workEndHour && slotEnd.getMinutes() > 0)) {
        continue;
      }

      const slotStartUtc = fromZonedTime(slotStart, timezone);
      const slotEndUtc = fromZonedTime(slotEnd, timezone);

      const isAvailable = !busySlots.some(busy => {
        const busyStart = new Date(busy.start!);
        const busyEnd = new Date(busy.end!);
        return slotStartUtc < busyEnd && slotEndUtc > busyStart;
      });

      if (isAvailable) {
        availableSlots.push({
          start: slotStartUtc.toISOString(),
          end: slotEndUtc.toISOString(),
          formatted: format(slotStart, "HH:mm") + " - " + format(slotEnd, "HH:mm"),
        });
      }
    }
  }

  return availableSlots;
}

export async function scheduleAppointment(
  adminId: string,
  params: {
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    attendeeName?: string;
    attendeeEmail?: string;
    attendeePhone?: string;
    location?: string;
  }
): Promise<ScheduleResult> {
  const oauth2Client = await getAuthenticatedClient(adminId);
  
  let googleEventId: string | null = null;

  if (oauth2Client) {
    try {
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      const event: any = {
        summary: params.title,
        description: params.description || undefined,
        start: {
          dateTime: params.startTime.toISOString(),
          timeZone: "America/Sao_Paulo",
        },
        end: {
          dateTime: params.endTime.toISOString(),
          timeZone: "America/Sao_Paulo",
        },
        location: params.location || undefined,
      };

      if (params.attendeeEmail) {
        event.attendees = [{ email: params.attendeeEmail }];
      }

      const response = await calendar.events.insert({
        calendarId: "primary",
        requestBody: event,
        sendUpdates: params.attendeeEmail ? "all" : "none",
      });

      googleEventId = response.data.id || null;
    } catch (googleError: any) {
      console.error("[calendar-service] Failed to create Google event:", googleError);
    }
  }

  const calendarEvent = await storage.createCalendarEvent({
    adminId,
    googleEventId,
    title: params.title,
    description: params.description || null,
    startTime: params.startTime,
    endTime: params.endTime,
    location: params.location || null,
    attendeeEmail: params.attendeeEmail || null,
    attendeeName: params.attendeeName || null,
    attendeePhone: params.attendeePhone || null,
    status: "confirmed",
    source: "ai_agent",
    syncedAt: googleEventId ? new Date() : null,
  });

  return {
    success: true,
    message: "Agendamento criado com sucesso",
    eventId: calendarEvent.id,
    eventDetails: {
      title: params.title,
      startTime: format(params.startTime, "dd/MM/yyyy 'às' HH:mm"),
      endTime: format(params.endTime, "HH:mm"),
      location: params.location,
    },
  };
}

export async function rescheduleAppointment(
  adminId: string,
  eventId: string,
  newStartTime: Date,
  newEndTime: Date
): Promise<ScheduleResult> {
  const event = await storage.getCalendarEventById(eventId);
  
  if (!event) {
    return { success: false, message: "Agendamento não encontrado" };
  }
  
  if (event.adminId !== adminId) {
    return { success: false, message: "Acesso negado" };
  }

  if (event.googleEventId) {
    const oauth2Client = await getAuthenticatedClient(adminId);
    if (oauth2Client) {
      try {
        const calendar = google.calendar({ version: "v3", auth: oauth2Client });

        await calendar.events.patch({
          calendarId: "primary",
          eventId: event.googleEventId,
          requestBody: {
            start: {
              dateTime: newStartTime.toISOString(),
              timeZone: "America/Sao_Paulo",
            },
            end: {
              dateTime: newEndTime.toISOString(),
              timeZone: "America/Sao_Paulo",
            },
          },
          sendUpdates: event.attendeeEmail ? "all" : "none",
        });
      } catch (googleError: any) {
        console.error("[calendar-service] Failed to update Google event:", googleError);
      }
    }
  }

  await storage.updateCalendarEvent(eventId, {
    startTime: newStartTime,
    endTime: newEndTime,
  });

  return {
    success: true,
    message: "Agendamento reagendado com sucesso",
    eventId,
    eventDetails: {
      title: event.title,
      startTime: format(newStartTime, "dd/MM/yyyy 'às' HH:mm"),
      endTime: format(newEndTime, "HH:mm"),
      location: event.location || undefined,
    },
  };
}

export async function cancelAppointment(
  adminId: string,
  eventId: string,
  reason?: string
): Promise<ScheduleResult> {
  const event = await storage.getCalendarEventById(eventId);
  
  if (!event) {
    return { success: false, message: "Agendamento não encontrado" };
  }
  
  if (event.adminId !== adminId) {
    return { success: false, message: "Acesso negado" };
  }

  if (event.googleEventId) {
    const oauth2Client = await getAuthenticatedClient(adminId);
    if (oauth2Client) {
      try {
        const calendar = google.calendar({ version: "v3", auth: oauth2Client });

        await calendar.events.delete({
          calendarId: "primary",
          eventId: event.googleEventId,
          sendUpdates: "all",
        });
      } catch (googleError: any) {
        console.error("[calendar-service] Failed to delete Google event:", googleError);
      }
    }
  }

  await storage.updateCalendarEvent(eventId, {
    status: "cancelled",
    description: reason ? `${event.description || ""}\nMotivo do cancelamento: ${reason}` : event.description,
  });

  return {
    success: true,
    message: "Agendamento cancelado com sucesso",
    eventId,
    eventDetails: {
      title: event.title,
      startTime: format(event.startTime, "dd/MM/yyyy 'às' HH:mm"),
      endTime: format(event.endTime, "HH:mm"),
    },
  };
}

export async function findAppointmentByPhone(
  adminId: string,
  phone: string
): Promise<any[]> {
  const events = await storage.listCalendarEventsByAdminAndPhone(adminId, phone);
  return events.filter(e => e.status !== "cancelled");
}

export async function getUpcomingAppointments(
  adminId: string,
  phone?: string,
  limit: number = 5
): Promise<any[]> {
  const from = new Date();
  const to = addDays(from, 30);
  
  let events = await storage.listCalendarEventsByAdmin(adminId, from, to);
  
  if (phone) {
    events = events.filter(e => e.attendeePhone === phone);
  }
  
  return events
    .filter(e => e.status !== "cancelled")
    .slice(0, limit);
}

export function parseAppointmentDateTime(
  dateStr: string,
  timeStr: string,
  timezone: string = "America/Sao_Paulo"
): { start: Date; end: Date } | null {
  try {
    const dateMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    const timeMatch = timeStr.match(/(\d{1,2})[:\.]?(\d{2})?/);

    if (!dateMatch || !timeMatch) {
      return null;
    }

    const day = parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]) - 1;
    const year = dateMatch[3] ? (dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3]) : parseInt(dateMatch[3])) : new Date().getFullYear();

    const hour = parseInt(timeMatch[1]);
    const minute = parseInt(timeMatch[2] || "0");

    const localDate = new Date(year, month, day, hour, minute, 0, 0);
    const utcDate = fromZonedTime(localDate, timezone);

    return {
      start: utcDate,
      end: new Date(utcDate.getTime() + 60 * 60000),
    };
  } catch (error) {
    console.error("[calendar-service] Parse date error:", error);
    return null;
  }
}

export function formatAvailableSlotsMessage(slots: AvailabilitySlot[], date: Date): string {
  if (slots.length === 0) {
    return `Não há horários disponíveis para ${format(date, "dd/MM/yyyy")}.`;
  }

  const slotsText = slots.slice(0, 6).map(s => s.formatted).join("\n- ");
  return `Horários disponíveis para ${format(date, "dd/MM/yyyy")}:\n- ${slotsText}${slots.length > 6 ? "\n\n(e mais horários disponíveis)" : ""}`;
}
