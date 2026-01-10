import { storage } from "./storage";

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // Run every 6 hours
let cleanupInterval: NodeJS.Timeout | null = null;

async function runMemoryCleanup(): Promise<void> {
  console.log("[ai-memory-cleanup] Starting scheduled memory cleanup...");
  
  try {
    const result = await storage.cleanupOldAiMessages();
    console.log(`[ai-memory-cleanup] Completed: ${result.agentsProcessed} agents processed, ${result.messagesDeleted} messages deleted`);
  } catch (error) {
    console.error("[ai-memory-cleanup] Error during cleanup:", error);
  }
}

export function startAiMemoryCleanupScheduler(): void {
  if (cleanupInterval) {
    console.log("[ai-memory-cleanup] Scheduler already running");
    return;
  }

  console.log("[ai-memory-cleanup] Starting scheduler (runs every 6 hours)");

  setTimeout(() => {
    runMemoryCleanup();
  }, 5 * 60 * 1000);

  cleanupInterval = setInterval(() => {
    runMemoryCleanup();
  }, CLEANUP_INTERVAL_MS);
}

export function stopAiMemoryCleanupScheduler(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log("[ai-memory-cleanup] Scheduler stopped");
  }
}
