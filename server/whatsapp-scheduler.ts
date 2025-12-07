import { storage } from "./storage";
import { db } from "./db";
import { eq, and, lte, sql } from "drizzle-orm";
import { scheduledWhatsappMessages, leads, webinars as webinarsTable, whatsappSequences } from "@shared/schema";
import { sendWhatsAppMessage, sendWhatsAppMediaMessage, MediaMessage } from "./whatsapp-service";

const SCHEDULER_INTERVAL_MS = 15000; // Check every 15 seconds for better timing accuracy
const BATCH_SIZE = 10; // Process 10 messages at a time

let schedulerInterval: NodeJS.Timeout | null = null;

interface MergeFields {
  nome: string;
  telefone: string;
  webinar_titulo: string;
  webinar_data: string;
  webinar_horario: string;
  webinar_link: string;
  replay_link: string;
}

function replaceMergeTags(text: string, fields: MergeFields): string {
  let result = text;
  result = result.replace(/\{\{nome\}\}/g, fields.nome || "");
  result = result.replace(/\{\{telefone\}\}/g, fields.telefone || "");
  result = result.replace(/\{\{webinar_titulo\}\}/g, fields.webinar_titulo || "");
  result = result.replace(/\{\{webinar_data\}\}/g, fields.webinar_data || "");
  result = result.replace(/\{\{webinar_horario\}\}/g, fields.webinar_horario || "");
  result = result.replace(/\{\{webinar_link\}\}/g, fields.webinar_link || "");
  result = result.replace(/\{\{replay_link\}\}/g, fields.replay_link || "");
  return result;
}

async function processScheduledWhatsappMessages(): Promise<void> {
  try {
    const pendingMessages = await storage.listPendingWhatsappMessages(BATCH_SIZE);
    
    if (pendingMessages.length === 0) {
      return;
    }

    console.log(`[whatsapp-scheduler] Processing ${pendingMessages.length} pending messages`);

    for (const scheduled of pendingMessages) {
      try {
        await storage.updateScheduledWhatsappMessage(scheduled.id, { status: "sending" });

        const sequence = await storage.getWhatsappSequenceById(scheduled.sequenceId);
        if (!sequence) {
          console.error(`[whatsapp-scheduler] Sequence ${scheduled.sequenceId} not found`);
          await storage.updateScheduledWhatsappMessage(scheduled.id, {
            status: "failed",
            lastError: "Sequência não encontrada"
          });
          continue;
        }

        if (!sequence.isActive) {
          console.log(`[whatsapp-scheduler] Sequence ${scheduled.sequenceId} is inactive, skipping`);
          await storage.updateScheduledWhatsappMessage(scheduled.id, {
            status: "cancelled",
            lastError: "Sequência desativada"
          });
          continue;
        }

        const webinar = await storage.getWebinarById(scheduled.webinarId);
        
        const baseUrl = process.env.BASE_URL || "https://autowebinar.shop";
        
        const mergeFields: MergeFields = {
          nome: scheduled.targetName || "Participante",
          telefone: scheduled.targetPhone,
          webinar_titulo: webinar?.name || "Webinar",
          webinar_data: scheduled.webinarSessionDate || "",
          webinar_horario: webinar ? `${String(webinar.startHour).padStart(2, "0")}:${String(webinar.startMinute).padStart(2, "0")}` : "",
          webinar_link: webinar ? `${baseUrl}/webinar/${webinar.slug}` : "",
          replay_link: webinar ? `${baseUrl}/webinar/${webinar.slug}?replay=1` : ""
        };

        const processedMessage = replaceMergeTags(sequence.messageText, mergeFields);

        let result: { success: boolean; error?: string };

        if (sequence.messageType !== "text" && sequence.mediaUrl) {
          const media: MediaMessage = {
            type: sequence.messageType as "image" | "audio" | "video" | "document",
            url: sequence.mediaUrl,
            caption: processedMessage || undefined,
            fileName: sequence.mediaFileName || undefined,
            mimetype: sequence.mediaMimeType || undefined,
          };
          result = await sendWhatsAppMediaMessage(scheduled.adminId, scheduled.targetPhone, media);
        } else {
          result = await sendWhatsAppMessage(scheduled.adminId, scheduled.targetPhone, processedMessage);
        }

        if (result.success) {
          await storage.updateScheduledWhatsappMessage(scheduled.id, {
            status: "sent",
            sentAt: new Date()
          });
          console.log(`[whatsapp-scheduler] Message sent to ${scheduled.targetPhone}`);
        } else {
          const errorMessage = result.error || "Erro desconhecido";
          console.error(`[whatsapp-scheduler] Failed to send to ${scheduled.targetPhone}: ${errorMessage}`);
          await storage.updateScheduledWhatsappMessage(scheduled.id, {
            status: "failed",
            lastError: errorMessage
          });
        }

      } catch (error: any) {
        console.error(`[whatsapp-scheduler] Error processing scheduled message ${scheduled.id}:`, error);
        await storage.updateScheduledWhatsappMessage(scheduled.id, {
          status: "failed",
          lastError: error.message || "Erro interno"
        });
      }
    }

  } catch (error) {
    console.error("[whatsapp-scheduler] Error processing scheduled messages:", error);
  }
}

export function startWhatsappScheduler(): void {
  if (schedulerInterval) {
    console.log("[whatsapp-scheduler] Scheduler already running");
    return;
  }

  console.log("[whatsapp-scheduler] Starting WhatsApp scheduler");
  
  processScheduledWhatsappMessages();
  
  schedulerInterval = setInterval(() => {
    processScheduledWhatsappMessages();
  }, SCHEDULER_INTERVAL_MS);
}

export function stopWhatsappScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[whatsapp-scheduler] WhatsApp scheduler stopped");
  }
}

export async function scheduleWhatsappForLead(
  leadId: string,
  webinarId: string,
  adminId: string,
  sessionStartTime: Date,
  sessionDate: string
): Promise<number> {
  try {
    const lead = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (lead.length === 0 || !lead[0].whatsapp) {
      console.log(`[whatsapp-scheduler] Lead ${leadId} not found or has no whatsapp`);
      return 0;
    }

    const targetLead = lead[0];

    const sequences = await db
      .select()
      .from(whatsappSequences)
      .where(
        and(
          eq(whatsappSequences.adminId, adminId),
          eq(whatsappSequences.isActive, true),
          sql`(${whatsappSequences.webinarId} = ${webinarId} OR ${whatsappSequences.webinarId} IS NULL)`
        )
      );

    if (sequences.length === 0) {
      console.log(`[whatsapp-scheduler] No active sequences found for admin ${adminId}`);
      return 0;
    }

    let scheduledCount = 0;

    for (const sequence of sequences) {
      const sendAt = new Date(sessionStartTime.getTime() + sequence.offsetMinutes * 60000);

      if (sendAt < new Date()) {
        console.log(`[whatsapp-scheduler] Skipping sequence ${sequence.id} - send time already passed`);
        continue;
      }

      const existingMessages = await db
        .select()
        .from(scheduledWhatsappMessages)
        .where(
          and(
            eq(scheduledWhatsappMessages.leadId, leadId),
            eq(scheduledWhatsappMessages.sequenceId, sequence.id),
            eq(scheduledWhatsappMessages.webinarSessionDate, sessionDate)
          )
        )
        .limit(1);

      if (existingMessages.length > 0) {
        console.log(`[whatsapp-scheduler] Message for sequence ${sequence.id} already scheduled for lead ${leadId}`);
        continue;
      }

      const messageId = "wmsg_" + Date.now() + "_" + Math.random().toString(36).substring(7);

      await db.insert(scheduledWhatsappMessages).values({
        id: messageId,
        adminId,
        webinarId,
        leadId,
        sequenceId: sequence.id,
        targetPhone: targetLead.whatsapp!,
        targetName: targetLead.name,
        sendAt,
        status: "queued",
        webinarSessionDate: sessionDate,
        metadata: JSON.stringify({ leadCity: targetLead.city, leadState: targetLead.state })
      });

      scheduledCount++;
    }

    console.log(`[whatsapp-scheduler] Scheduled ${scheduledCount} WhatsApp messages for lead ${leadId}`);
    return scheduledCount;

  } catch (error) {
    console.error("[whatsapp-scheduler] Error scheduling WhatsApp for lead:", error);
    return 0;
  }
}
