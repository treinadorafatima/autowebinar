import { storage } from "./storage";
import { decrypt } from "./encryption";
import { Resend } from "resend";
import { db } from "./db";
import { eq, and, lte, sql } from "drizzle-orm";
import { scheduledEmails, leads, webinars as webinarsTable } from "@shared/schema";
import { getWebinarUrl, getReplayUrl, getUnsubscribeUrl } from "./utils/getAppUrl";

const SCHEDULER_INTERVAL_MS = 60000; // Check every minute
const BATCH_SIZE = 10; // Process 10 emails at a time

let schedulerInterval: NodeJS.Timeout | null = null;

interface MergeFields {
  nome: string;
  email: string;
  webinar_titulo: string;
  webinar_data: string;
  webinar_horario: string;
  webinar_link: string;
  replay_link: string;
  descadastrar_link: string;
}

function replaceMergeTags(html: string, fields: MergeFields): string {
  let result = html;
  result = result.replace(/\{\{nome\}\}/g, fields.nome || "");
  result = result.replace(/\{\{email\}\}/g, fields.email || "");
  result = result.replace(/\{\{webinar_titulo\}\}/g, fields.webinar_titulo || "");
  result = result.replace(/\{\{webinar_data\}\}/g, fields.webinar_data || "");
  result = result.replace(/\{\{webinar_horario\}\}/g, fields.webinar_horario || "");
  result = result.replace(/\{\{webinar_link\}\}/g, fields.webinar_link || "");
  result = result.replace(/\{\{replay_link\}\}/g, fields.replay_link || "");
  result = result.replace(/\{\{descadastrar_link\}\}/g, fields.descadastrar_link || "");
  return result;
}

function replaceTextMergeTags(text: string, fields: MergeFields): string {
  let result = text;
  result = result.replace(/\{\{nome\}\}/g, fields.nome || "");
  result = result.replace(/\{\{email\}\}/g, fields.email || "");
  result = result.replace(/\{\{webinar_titulo\}\}/g, fields.webinar_titulo || "");
  result = result.replace(/\{\{webinar_data\}\}/g, fields.webinar_data || "");
  result = result.replace(/\{\{webinar_horario\}\}/g, fields.webinar_horario || "");
  result = result.replace(/\{\{webinar_link\}\}/g, fields.webinar_link || "");
  result = result.replace(/\{\{replay_link\}\}/g, fields.replay_link || "");
  result = result.replace(/\{\{descadastrar_link\}\}/g, fields.descadastrar_link || "");
  return result;
}

async function processScheduledEmails(): Promise<void> {
  try {
    const pendingEmails = await storage.listPendingScheduledEmails(BATCH_SIZE);
    
    if (pendingEmails.length === 0) {
      return;
    }

    console.log(`[email-scheduler] Processing ${pendingEmails.length} pending emails`);

    for (const scheduled of pendingEmails) {
      try {
        await storage.updateScheduledEmail(scheduled.id, { status: "sending" });

        const sequence = await storage.getEmailSequenceById(scheduled.sequenceId);
        if (!sequence) {
          console.error(`[email-scheduler] Sequence ${scheduled.sequenceId} not found`);
          await storage.updateScheduledEmail(scheduled.id, {
            status: "failed",
            lastError: "Sequência não encontrada"
          });
          continue;
        }

        if (!sequence.isActive) {
          console.log(`[email-scheduler] Sequence ${scheduled.sequenceId} is inactive, skipping`);
          await storage.updateScheduledEmail(scheduled.id, {
            status: "cancelled",
            lastError: "Sequência desativada"
          });
          continue;
        }

        const credential = await storage.getAdminEmailCredential(scheduled.adminId);
        
        let resendClient: Resend;
        let fromEmail: string;
        let fromName: string;

        if (credential && credential.isValid) {
          const apiKey = decrypt(credential.encryptedApiKey);
          resendClient = new Resend(apiKey);
          fromEmail = credential.senderEmail || "contato@autowebinar.shop";
          fromName = credential.senderName || "Auto Webinar";
        } else {
          const systemApiKey = process.env.RESEND_API_KEY;
          if (!systemApiKey) {
            console.error(`[email-scheduler] No email credentials for admin ${scheduled.adminId}`);
            await storage.updateScheduledEmail(scheduled.id, {
              status: "failed",
              lastError: "Credenciais de email não configuradas"
            });
            continue;
          }
          resendClient = new Resend(systemApiKey);
          fromEmail = "contato@autowebinar.shop";
          fromName = "Auto Webinar";
        }

        const webinar = await storage.getWebinarById(scheduled.webinarId);
        
        const mergeFields: MergeFields = {
          nome: scheduled.targetName || "Participante",
          email: scheduled.targetEmail,
          webinar_titulo: webinar?.name || "Webinar",
          webinar_data: scheduled.webinarSessionDate || "",
          webinar_horario: webinar ? `${String(webinar.startHour).padStart(2, "0")}:${String(webinar.startMinute).padStart(2, "0")}` : "",
          webinar_link: webinar ? getWebinarUrl(webinar.slug) : "",
          replay_link: webinar ? getReplayUrl(webinar.slug) : "",
          descadastrar_link: getUnsubscribeUrl(scheduled.targetEmail)
        };

        let htmlContent = sequence.compiledHtml || `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>${sequence.subject}</h2>
            <p>Olá {{nome}},</p>
            <p>Você está inscrito no webinar <strong>{{webinar_titulo}}</strong>.</p>
            <p>Data: {{webinar_data}} às {{webinar_horario}}</p>
            <p><a href="{{webinar_link}}">Clique aqui para assistir</a></p>
          </div>
        `;

        htmlContent = replaceMergeTags(htmlContent, mergeFields);
        const subject = replaceTextMergeTags(sequence.subject, mergeFields);

        await resendClient.emails.send({
          from: `${fromName} <${fromEmail}>`,
          to: scheduled.targetEmail,
          subject: subject,
          html: htmlContent
        });

        await storage.updateScheduledEmail(scheduled.id, {
          status: "sent",
          sentAt: new Date()
        });

        console.log(`[email-scheduler] Email sent to ${scheduled.targetEmail}`);

      } catch (error: any) {
        console.error(`[email-scheduler] Failed to send email ${scheduled.id}:`, error);
        await storage.updateScheduledEmail(scheduled.id, {
          status: "failed",
          lastError: error.message || "Erro desconhecido"
        });
      }
    }

  } catch (error) {
    console.error("[email-scheduler] Error processing scheduled emails:", error);
  }
}

export async function scheduleEmailsForLead(
  leadId: string,
  webinarId: string,
  adminId: string,
  webinarStartTime: Date,
  sessionDate: string
): Promise<number> {
  try {
    const sequences = await storage.listEmailSequencesByWebinar(webinarId);
    const activeSequences = sequences.filter(s => s.isActive);

    if (activeSequences.length === 0) {
      return 0;
    }

    const leadData = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (leadData.length === 0) {
      console.error(`[email-scheduler] Lead ${leadId} not found`);
      return 0;
    }

    const lead = leadData[0];
    
    if (!lead.email) {
      console.log(`[email-scheduler] Lead ${leadId} has no email, skipping`);
      return 0;
    }

    let scheduledCount = 0;

    for (const sequence of activeSequences) {
      const sendAt = new Date(webinarStartTime.getTime() + sequence.offsetMinutes * 60 * 1000);
      
      if (sendAt < new Date()) {
        console.log(`[email-scheduler] Skipping sequence ${sequence.id} - send time already passed`);
        continue;
      }

      const alreadyScheduled = await storage.hasScheduledEmailForLeadSequence(leadId, sequence.id);
      if (alreadyScheduled) {
        console.log(`[email-scheduler] Skipping sequence ${sequence.id} - already scheduled for lead ${leadId}`);
        continue;
      }

      await storage.createScheduledEmail({
        adminId,
        webinarId,
        leadId,
        sequenceId: sequence.id,
        targetEmail: lead.email,
        targetName: lead.name || null,
        sendAt,
        status: "queued",
        webinarSessionDate: sessionDate,
        metadata: JSON.stringify({ leadCity: lead.city, leadState: lead.state })
      });

      scheduledCount++;
    }

    console.log(`[email-scheduler] Scheduled ${scheduledCount} emails for lead ${leadId}`);
    return scheduledCount;

  } catch (error) {
    console.error("[email-scheduler] Error scheduling emails for lead:", error);
    return 0;
  }
}

export async function scheduleEmailsForWebinarSession(
  webinarId: string,
  sessionStartTime: Date,
  sessionDate: string
): Promise<number> {
  try {
    const webinar = await storage.getWebinarById(webinarId);
    if (!webinar || !webinar.ownerId) {
      console.error(`[email-scheduler] Webinar ${webinarId} not found or has no owner`);
      return 0;
    }

    const webinarLeads = await db
      .select()
      .from(leads)
      .where(eq(leads.webinarId, webinarId));

    let totalScheduled = 0;

    for (const lead of webinarLeads) {
      if (lead.email) {
        const count = await scheduleEmailsForLead(
          lead.id,
          webinarId,
          webinar.ownerId,
          sessionStartTime,
          sessionDate
        );
        totalScheduled += count;
      }
    }

    console.log(`[email-scheduler] Scheduled ${totalScheduled} emails for webinar session ${webinarId}`);
    return totalScheduled;

  } catch (error) {
    console.error("[email-scheduler] Error scheduling emails for session:", error);
    return 0;
  }
}

export function startEmailScheduler(): void {
  if (schedulerInterval) {
    console.log("[email-scheduler] Scheduler already running");
    return;
  }

  console.log("[email-scheduler] Starting email scheduler");
  
  processScheduledEmails();
  
  schedulerInterval = setInterval(processScheduledEmails, SCHEDULER_INTERVAL_MS);
}

export function stopEmailScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[email-scheduler] Email scheduler stopped");
  }
}

export async function getSchedulerStatus(): Promise<{
  isRunning: boolean;
  pendingCount: number;
  lastProcessed: Date | null;
}> {
  const pending = await storage.listPendingScheduledEmails(1000);
  
  return {
    isRunning: schedulerInterval !== null,
    pendingCount: pending.length,
    lastProcessed: null
  };
}
