import { storage } from "./storage";
import { db } from "./db";
import { leads, emailSequences, whatsappSequences, scheduledEmails, scheduledWhatsappMessages } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { calculateNextSession } from "./session-calculator";
import { fromZonedTime } from "date-fns-tz";

interface RescheduleResult {
  emailsCancelled: number;
  emailsRescheduled: number;
  whatsappCancelled: number;
  whatsappRescheduled: number;
}

interface LeadSessionInfo {
  leadId: string;
  adminId: string;
  webinarSessionDate: string;
  email: string | null;
  phone: string | null;
  name: string | null;
}

interface WebinarScheduleConfig {
  startHour: number;
  startMinute: number;
  timezone: string;
  recurrence: string;
  onceDate?: string | null;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
}

function calculateSendAtWithTimezone(
  sessionDate: string,
  startHour: number,
  startMinute: number,
  offsetMinutes: number,
  timezone: string
): Date {
  const [year, month, day] = sessionDate.split("-").map(Number);
  const sessionInTz = new Date(year, month - 1, day, startHour, startMinute, 0, 0);
  const sessionUtc = fromZonedTime(sessionInTz, timezone);
  return new Date(sessionUtc.getTime() + offsetMinutes * 60 * 1000);
}

function extractSessionDateFromSessionId(sessionId: string | null, webinarId: string): string | null {
  if (!sessionId) return null;
  const prefix = `${webinarId}-`;
  if (sessionId.startsWith(prefix)) {
    return sessionId.substring(prefix.length);
  }
  return null;
}

function parseSessionDate(sessionDateStr: string): Date | null {
  const parts = sessionDateStr.split("-").map(Number);
  if (parts.length < 3 || parts.some(isNaN)) {
    return null;
  }
  const [year, month, day] = parts;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function normalizeSessionDate(sessionDateStr: string): string {
  const parts = sessionDateStr.split("-").map(Number);
  if (parts.length < 3 || parts.some(isNaN)) {
    return sessionDateStr;
  }
  const [year, month, day] = parts;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function getLeadsWithSessionsForWebinar(webinarId: string, adminId: string): Promise<LeadSessionInfo[]> {
  const webinarLeads = await db.select().from(leads).where(eq(leads.webinarId, webinarId));
  
  const result: LeadSessionInfo[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  for (const lead of webinarLeads) {
    const sessionDateStr = extractSessionDateFromSessionId(lead.sessionId, webinarId);
    
    if (!sessionDateStr) {
      continue;
    }
    
    const sessionDate = parseSessionDate(sessionDateStr);
    if (!sessionDate) {
      continue;
    }
    
    if (sessionDate < now) {
      continue;
    }
    
    if (!lead.email && !lead.whatsapp) {
      continue;
    }
    
    const normalizedSessionDate = normalizeSessionDate(sessionDateStr);
    
    result.push({
      leadId: lead.id,
      adminId,
      webinarSessionDate: normalizedSessionDate,
      email: lead.email,
      phone: lead.whatsapp,
      name: lead.name,
    });
  }
  
  return result;
}

export async function rescheduleSequencesForWebinar(
  webinarId: string,
  adminId: string,
  config: WebinarScheduleConfig
): Promise<RescheduleResult> {
  const { startHour, startMinute, timezone, recurrence, onceDate, dayOfWeek, dayOfMonth } = config;
  
  console.log(`[sequence-sync] Starting reschedule for webinar ${webinarId}`);
  console.log(`[sequence-sync] New config: ${startHour}:${startMinute} ${timezone}, recurrence=${recurrence}`);
  
  const result: RescheduleResult = {
    emailsCancelled: 0,
    emailsRescheduled: 0,
    whatsappCancelled: 0,
    whatsappRescheduled: 0,
  };

  try {
    const cancelResult = await cancelAllSequencesForWebinar(webinarId);
    result.emailsCancelled = cancelResult.emailsCancelled;
    result.whatsappCancelled = cancelResult.whatsappCancelled;
    
    const nextSession = calculateNextSession({
      startHour,
      startMinute,
      timezone,
      recurrence,
      onceDate,
      dayOfWeek,
      dayOfMonth,
    });
    
    if (!nextSession) {
      console.log(`[sequence-sync] No upcoming session found for webinar ${webinarId}, no sequences to reschedule`);
      return result;
    }
    
    console.log(`[sequence-sync] Next session: ${nextSession.sessionDate} at ${startHour}:${startMinute} ${timezone}`);
    
    const leadsWithSessions = await getLeadsWithSessionsForWebinar(webinarId, adminId);
    
    if (leadsWithSessions.length === 0) {
      console.log(`[sequence-sync] No leads with future sessions found for webinar ${webinarId}`);
      return result;
    }
    
    console.log(`[sequence-sync] Found ${leadsWithSessions.length} leads with sessions to reschedule`);

    const emailSequencesList = await storage.listEmailSequencesByWebinar(webinarId);
    const whatsappSequencesList = await storage.listWhatsappSequencesByWebinar(webinarId);
    
    const activeEmailSequences = emailSequencesList.filter(s => s.isActive);
    const activeWhatsappSequences = whatsappSequencesList.filter(s => s.isActive);
    
    const now = new Date();

    for (const leadInfo of leadsWithSessions) {
      const sessionDateToUse = leadInfo.webinarSessionDate;
      
      if (leadInfo.email) {
        for (const sequence of activeEmailSequences) {
          const sendAt = calculateSendAtWithTimezone(
            sessionDateToUse,
            startHour,
            startMinute,
            sequence.offsetMinutes,
            timezone
          );
          
          if (sendAt > now) {
            const alreadyScheduled = await storage.hasScheduledEmailForLeadSequence(leadInfo.leadId, sequence.id);
            if (alreadyScheduled) {
              console.log(`[sequence-sync] Skipping email sequence ${sequence.id} - already scheduled for lead ${leadInfo.leadId}`);
              continue;
            }
            await storage.createScheduledEmail({
              adminId: leadInfo.adminId,
              webinarId,
              leadId: leadInfo.leadId,
              sequenceId: sequence.id,
              targetEmail: leadInfo.email,
              targetName: leadInfo.name,
              sendAt,
              status: "queued",
              webinarSessionDate: sessionDateToUse,
            });
            result.emailsRescheduled++;
            console.log(`[sequence-sync] Created email schedule for lead ${leadInfo.leadId}, sequence ${sequence.id}, sendAt ${sendAt.toISOString()}`);
          }
        }
      }
      
      if (leadInfo.phone) {
        for (const sequence of activeWhatsappSequences) {
          const sendAt = calculateSendAtWithTimezone(
            sessionDateToUse,
            startHour,
            startMinute,
            sequence.offsetMinutes,
            timezone
          );
          
          if (sendAt > now) {
            const alreadyScheduled = await storage.hasScheduledWhatsappForLeadSequence(leadInfo.leadId, sequence.id);
            if (alreadyScheduled) {
              console.log(`[sequence-sync] Skipping whatsapp sequence ${sequence.id} - already scheduled for lead ${leadInfo.leadId}`);
              continue;
            }
            await storage.createScheduledWhatsappMessage({
              adminId: leadInfo.adminId,
              webinarId,
              leadId: leadInfo.leadId,
              sequenceId: sequence.id,
              targetPhone: leadInfo.phone,
              targetName: leadInfo.name,
              sendAt,
              status: "queued",
              webinarSessionDate: sessionDateToUse,
            });
            result.whatsappRescheduled++;
            console.log(`[sequence-sync] Created whatsapp schedule for lead ${leadInfo.leadId}, sequence ${sequence.id}, sendAt ${sendAt.toISOString()}`);
          }
        }
      }
    }

    console.log(`[sequence-sync] Reschedule complete for webinar ${webinarId}:`, result);
    return result;
  } catch (error) {
    console.error(`[sequence-sync] Error rescheduling sequences for webinar ${webinarId}:`, error);
    return result;
  }
}

export async function cancelAllSequencesForWebinar(webinarId: string): Promise<{ emailsCancelled: number; whatsappCancelled: number }> {
  console.log(`[sequence-sync] Cancelling all sequences for webinar ${webinarId}`);
  
  const emailsCancelled = await storage.cancelScheduledEmailsByWebinar(webinarId);
  const whatsappCancelled = await storage.cancelScheduledWhatsappMessagesByWebinar(webinarId);
  
  console.log(`[sequence-sync] Cancelled ${emailsCancelled} emails and ${whatsappCancelled} WhatsApp messages`);
  
  return { emailsCancelled, whatsappCancelled };
}
