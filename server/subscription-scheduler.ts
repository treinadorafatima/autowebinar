import { db } from "./db";
import { admins, checkoutPlanos } from "@shared/schema";
import { eq, and, gte, lte, isNotNull, sql } from "drizzle-orm";
import { 
  sendExpirationReminderEmail, 
  sendExpiredRenewalEmail 
} from "./email";

const SCHEDULER_INTERVAL_MS = 3600000; // Check every hour
let schedulerInterval: NodeJS.Timeout | null = null;
let lastRunDate: string | null = null;

interface AdminWithPlan {
  id: string;
  name: string | null;
  email: string;
  accessExpiresAt: Date | null;
  planoId: string | null;
  lastExpirationEmailSent: Date | null;
  planName?: string;
}

async function getAdminsExpiringInDays(days: number): Promise<AdminWithPlan[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const targetDate = new Date(today);
  targetDate.setDate(targetDate.getDate() + days);
  
  const nextDay = new Date(targetDate);
  nextDay.setDate(nextDay.getDate() + 1);
  
  const results = await db
    .select({
      id: admins.id,
      name: admins.name,
      email: admins.email,
      accessExpiresAt: admins.accessExpiresAt,
      planoId: admins.planoId,
      lastExpirationEmailSent: admins.lastExpirationEmailSent,
    })
    .from(admins)
    .where(
      and(
        isNotNull(admins.accessExpiresAt),
        gte(admins.accessExpiresAt, targetDate),
        lte(admins.accessExpiresAt, nextDay),
        eq(admins.isActive, true)
      )
    );
  
  return results;
}

async function getAdminsExpiredYesterday(): Promise<AdminWithPlan[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const results = await db
    .select({
      id: admins.id,
      name: admins.name,
      email: admins.email,
      accessExpiresAt: admins.accessExpiresAt,
      planoId: admins.planoId,
      lastExpirationEmailSent: admins.lastExpirationEmailSent,
    })
    .from(admins)
    .where(
      and(
        isNotNull(admins.accessExpiresAt),
        gte(admins.accessExpiresAt, yesterday),
        lte(admins.accessExpiresAt, today)
      )
    );
  
  return results;
}

async function getPlanName(planoId: string | null): Promise<string> {
  if (!planoId) return "Seu Plano";
  
  try {
    const plano = await db
      .select({ nome: checkoutPlanos.nome })
      .from(checkoutPlanos)
      .where(eq(checkoutPlanos.id, planoId))
      .limit(1);
    
    return plano[0]?.nome || "Seu Plano";
  } catch {
    return "Seu Plano";
  }
}

async function markEmailSent(adminId: string): Promise<void> {
  try {
    await db
      .update(admins)
      .set({ lastExpirationEmailSent: new Date() })
      .where(eq(admins.id, adminId));
  } catch (error) {
    console.error(`[subscription-scheduler] Error marking email sent for ${adminId}:`, error);
  }
}

function shouldSendEmail(admin: AdminWithPlan, daysType: '3days' | '1day' | 'expired'): boolean {
  if (!admin.lastExpirationEmailSent) return true;
  
  const lastSent = new Date(admin.lastExpirationEmailSent);
  const now = new Date();
  const hoursSinceLastEmail = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60);
  
  if (daysType === '3days') return hoursSinceLastEmail >= 48;
  if (daysType === '1day') return hoursSinceLastEmail >= 20;
  if (daysType === 'expired') return hoursSinceLastEmail >= 20;
  
  return true;
}

async function processExpirationReminders(): Promise<void> {
  const currentHour = new Date().getHours();
  const todayStr = new Date().toISOString().split('T')[0];
  
  if (lastRunDate === todayStr && currentHour < 8) {
    return;
  }
  
  console.log(`[subscription-scheduler] Running expiration check at ${new Date().toISOString()}`);
  
  try {
    const admins3Days = await getAdminsExpiringInDays(3);
    for (const admin of admins3Days) {
      if (!shouldSendEmail(admin, '3days')) {
        console.log(`[subscription-scheduler] Skipping 3-day reminder for ${admin.email} - recently sent`);
        continue;
      }
      
      const planName = await getPlanName(admin.planoId);
      const success = await sendExpirationReminderEmail(
        admin.email,
        admin.name || "Cliente",
        planName,
        3,
        admin.accessExpiresAt!
      );
      
      if (success) {
        await markEmailSent(admin.id);
        console.log(`[subscription-scheduler] Sent 3-day reminder to ${admin.email}`);
      }
    }
    
    const admins1Day = await getAdminsExpiringInDays(1);
    for (const admin of admins1Day) {
      if (!shouldSendEmail(admin, '1day')) {
        console.log(`[subscription-scheduler] Skipping 1-day reminder for ${admin.email} - recently sent`);
        continue;
      }
      
      const planName = await getPlanName(admin.planoId);
      const success = await sendExpirationReminderEmail(
        admin.email,
        admin.name || "Cliente",
        planName,
        1,
        admin.accessExpiresAt!
      );
      
      if (success) {
        await markEmailSent(admin.id);
        console.log(`[subscription-scheduler] Sent 1-day reminder to ${admin.email}`);
      }
    }
    
    if (currentHour >= 8 && currentHour < 10) {
      const expiredAdmins = await getAdminsExpiredYesterday();
      for (const admin of expiredAdmins) {
        if (!shouldSendEmail(admin, 'expired')) {
          console.log(`[subscription-scheduler] Skipping expired email for ${admin.email} - recently sent`);
          continue;
        }
        
        const planName = await getPlanName(admin.planoId);
        const success = await sendExpiredRenewalEmail(
          admin.email,
          admin.name || "Cliente",
          planName
        );
        
        if (success) {
          await markEmailSent(admin.id);
          console.log(`[subscription-scheduler] Sent expired renewal email to ${admin.email}`);
        }
      }
    }
    
    lastRunDate = todayStr;
    
  } catch (error) {
    console.error("[subscription-scheduler] Error processing expiration reminders:", error);
  }
}

export function startSubscriptionScheduler(): void {
  if (schedulerInterval) {
    console.log("[subscription-scheduler] Scheduler already running");
    return;
  }

  console.log("[subscription-scheduler] Starting subscription scheduler");
  
  setTimeout(() => {
    processExpirationReminders();
  }, 5000);
  
  schedulerInterval = setInterval(processExpirationReminders, SCHEDULER_INTERVAL_MS);
}

export function stopSubscriptionScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[subscription-scheduler] Subscription scheduler stopped");
  }
}

export async function getSubscriptionSchedulerStatus(): Promise<{
  isRunning: boolean;
  lastRunDate: string | null;
  nextRunIn: string;
}> {
  const nextRunMs = schedulerInterval ? SCHEDULER_INTERVAL_MS : 0;
  const nextRunMinutes = Math.round(nextRunMs / 60000);
  
  return {
    isRunning: schedulerInterval !== null,
    lastRunDate,
    nextRunIn: `${nextRunMinutes} minutos`
  };
}
