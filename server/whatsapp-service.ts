import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import * as QRCode from "qrcode";
import pino from "pino";
import { storage } from "./storage";
import * as fs from "fs";
import * as path from "path";

const logger = pino({ level: "debug" });

interface WhatsAppConnection {
  socket: WASocket | null;
  qrCode: string | null;
  qrGeneratedAt: number | null;
  status: "disconnected" | "connecting" | "qr_ready" | "connected" | "banned" | "pairing_code_ready";
  phoneNumber: string | null;
  adminId: string; // Admin que possui esta conta
  accountId: string; // ID único da conta WhatsApp
  reconnectAttempts: number;
  lastMessageSentAt: number;
  messageQueue: Array<{ phone: string; message: string; resolve: (result: any) => void; reject: (error: any) => void }>;
  isProcessingQueue: boolean;
}

// Map key is now accountId (not adminId) for complete isolation between accounts
const connections: Map<string, WhatsAppConnection> = new Map();

const AUTH_DIR = path.join(process.cwd(), "whatsapp-sessions");

const QR_CODE_TTL_MS = 120 * 1000; // 2 minutes for user to scan QR
const MAX_RECONNECT_ATTEMPTS = 2;
const MIN_MESSAGE_INTERVAL_MS = 3000;
const MAX_MESSAGE_INTERVAL_MS = 8000;
const MAX_MESSAGES_PER_MINUTE = 10;
const RECONNECT_BASE_DELAY_MS = 3000;
const MAX_QUEUE_SIZE = 50;
const QUEUE_TIMEOUT_MS = 5 * 60 * 1000;
const HEALTH_CHECK_INTERVAL_MS = 60 * 1000;

const messageCounts: Map<string, { count: number; resetAt: number }> = new Map();

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function getAuthDir(accountId: string): string {
  const dir = path.join(AUTH_DIR, accountId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Check if session credentials are valid (registered and complete)
function isSessionValid(accountId: string): boolean {
  const authDir = path.join(AUTH_DIR, accountId);
  const credsFile = path.join(authDir, "creds.json");
  
  if (!fs.existsSync(credsFile)) {
    return false;
  }
  
  try {
    const creds = JSON.parse(fs.readFileSync(credsFile, "utf-8"));
    // Session is only valid if it was fully registered
    if (!creds.registered) {
      console.log(`[whatsapp] Session ${accountId} has registered=false, marking as invalid`);
      return false;
    }
    // Check if essential credentials exist
    if (!creds.signedIdentityKey || !creds.signedPreKey) {
      console.log(`[whatsapp] Session ${accountId} missing essential keys, marking as invalid`);
      return false;
    }
    return true;
  } catch (error) {
    console.log(`[whatsapp] Error reading session ${accountId}:`, error);
    return false;
  }
}

// Clear invalid/stale session
function clearStaleSession(accountId: string): void {
  const authDir = path.join(AUTH_DIR, accountId);
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true });
    console.log(`[whatsapp] Cleared stale session for account ${accountId}`);
  }
}

function getRandomBrowserFingerprint(): [string, string, string] {
  // Use standard browser fingerprints that WhatsApp recognizes
  // Format: [browser name, OS name, browser version]
  // Chrome on Linux is most reliable for server environments
  return ["Chrome", "Linux", "120.0.0.0"];
}

function getReconnectDelay(attempts: number): number {
  const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, attempts);
  const jitter = Math.random() * 2000;
  return Math.min(delay + jitter, 60000);
}

function checkRateLimit(accountId: string): { allowed: boolean; waitMs: number } {
  const now = Date.now();
  const record = messageCounts.get(accountId);
  
  if (!record || now > record.resetAt) {
    messageCounts.set(accountId, { count: 1, resetAt: now + 60000 });
    return { allowed: true, waitMs: 0 };
  }
  
  if (record.count >= MAX_MESSAGES_PER_MINUTE) {
    return { allowed: false, waitMs: record.resetAt - now };
  }
  
  record.count++;
  return { allowed: true, waitMs: 0 };
}

function getRandomMessageDelay(): number {
  return MIN_MESSAGE_INTERVAL_MS + Math.random() * (MAX_MESSAGE_INTERVAL_MS - MIN_MESSAGE_INTERVAL_MS);
}

async function processMessageQueue(accountId: string): Promise<void> {
  const conn = connections.get(accountId);
  if (!conn || conn.isProcessingQueue) return;
  
  conn.isProcessingQueue = true;
  
  while (conn.messageQueue.length > 0) {
    const currentConn = connections.get(accountId);
    
    if (!currentConn || currentConn.status === "banned") {
      while (conn.messageQueue.length > 0) {
        const remaining = conn.messageQueue.shift();
        remaining?.reject(new Error("Conta suspensa ou desconectada"));
      }
      break;
    }
    
    if (!currentConn.socket || currentConn.status !== "connected") {
      console.log(`[whatsapp] Queue paused for account ${accountId} - waiting for connection (status: ${currentConn.status})`);
      conn.isProcessingQueue = false;
      return;
    }
    
    const item = conn.messageQueue[0];
    
    const rateCheck = checkRateLimit(accountId);
    if (!rateCheck.allowed) {
      console.log(`[whatsapp] Rate limit hit for account ${accountId}, waiting ${rateCheck.waitMs}ms`);
      await new Promise(resolve => setTimeout(resolve, rateCheck.waitMs));
      continue;
    }
    
    const timeSinceLastMessage = Date.now() - conn.lastMessageSentAt;
    const requiredDelay = getRandomMessageDelay();
    
    if (timeSinceLastMessage < requiredDelay) {
      await new Promise(resolve => setTimeout(resolve, requiredDelay - timeSinceLastMessage));
    }
    
    try {
      if (!conn.socket) {
        item.reject(new Error("Socket desconectado"));
        conn.messageQueue.shift();
        continue;
      }
      
      let formattedPhone = item.phone.replace(/\D/g, "");
      if (!formattedPhone.startsWith("55")) {
        formattedPhone = "55" + formattedPhone;
      }
      const jid = formattedPhone + "@s.whatsapp.net";
      
      await conn.socket.sendMessage(jid, { text: item.message });
      conn.lastMessageSentAt = Date.now();
      
      console.log(`[whatsapp] Message sent to ${item.phone} from account ${accountId}`);
      item.resolve({ success: true });
    } catch (error: any) {
      console.error(`[whatsapp] Error sending message:`, error);
      
      if (isSpamOrBanError(error)) {
        console.error(`[whatsapp] SPAM/BAN detected for account ${accountId}!`);
        conn.status = "banned";
        
        // Clear rate limit counters for isolation
        messageCounts.delete(accountId);
        
        // Clear auth directory for complete isolation
        const authDir = getAuthDir(accountId);
        if (fs.existsSync(authDir)) {
          fs.rmSync(authDir, { recursive: true });
          console.log(`[whatsapp] Auth cleared for banned account ${accountId} during queue processing`);
        }
        
        await storage.upsertWhatsappSessionByAccountId(accountId, conn.adminId, {
          status: "banned",
          qrCode: null,
          phoneNumber: null,
          sessionData: null,
        });
        
        while (conn.messageQueue.length > 0) {
          const remaining = conn.messageQueue.shift();
          remaining?.reject(new Error("Conta suspensa por spam. Aguarde antes de tentar novamente."));
        }
        break;
      }
      
      item.reject(error);
    }
    
    conn.messageQueue.shift();
  }
  
  conn.isProcessingQueue = false;
}

function isSpamOrBanError(error: any): boolean {
  const errorStr = String(error?.message || error).toLowerCase();
  const banIndicators = [
    "spam",
    "banned",
    "blocked",
    "rate-overlimit",
    "too many",
    "restricted",
    "temporarily",
    "429",
    "not-authorized",
  ];
  
  return banIndicators.some(indicator => errorStr.includes(indicator));
}

export async function initWhatsAppConnection(accountId: string, adminId: string, isReconnect: boolean = false): Promise<{
  success: boolean;
  status: string;
  qrCode?: string;
  phoneNumber?: string;
  error?: string;
}> {
  try {
    const existing = connections.get(accountId);
    
    if (existing?.status === "banned") {
      return {
        success: false,
        status: "banned",
        error: "Esta conta foi temporariamente suspensa. Aguarde algumas horas antes de reconectar.",
      };
    }
    
    if (existing?.status === "connected" && existing.socket) {
      return {
        success: true,
        status: "connected",
        phoneNumber: existing.phoneNumber || undefined,
      };
    }

    if (existing?.status === "connecting") {
      return {
        success: true,
        status: "connecting",
      };
    }
    
    // Skip QR check during reconnection - we need to reconnect with saved credentials
    if (!isReconnect && existing?.status === "qr_ready" && existing.qrCode && existing.qrGeneratedAt) {
      const qrAge = Date.now() - existing.qrGeneratedAt;
      if (qrAge < QR_CODE_TTL_MS) {
        return {
          success: true,
          status: "qr_ready",
          qrCode: existing.qrCode,
        };
      } else {
        // QR code expired - clean up old socket and session to generate fresh QR
        console.log(`[whatsapp] QR code expired for account ${accountId}, generating new one...`);
        if (existing.socket) {
          try {
            existing.socket.end(undefined);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        // Clear auth directory to force new QR code generation
        const authDir = getAuthDir(accountId);
        if (fs.existsSync(authDir)) {
          fs.rmSync(authDir, { recursive: true });
          console.log(`[whatsapp] Auth cleared for account ${accountId} (QR expired)`);
        }
        connections.delete(accountId);
      }
    }

    connections.set(accountId, {
      socket: null,
      qrCode: null,
      qrGeneratedAt: null,
      status: "connecting",
      phoneNumber: null,
      adminId,
      accountId,
      reconnectAttempts: existing?.reconnectAttempts || 0,
      lastMessageSentAt: 0,
      messageQueue: existing?.messageQueue || [],
      isProcessingQueue: false,
    });

    await storage.upsertWhatsappSessionByAccountId(accountId, adminId, {
      status: "connecting",
      qrCode: null,
    });

    const authDir = getAuthDir(accountId);
    
    // Check and clear stale/invalid sessions before connecting
    // Skip this check during reconnection (after 515) to preserve credentials
    if (!isReconnect && !isSessionValid(accountId)) {
      clearStaleSession(accountId);
      // Recreate the directory after clearing
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
      }
    } else if (isReconnect) {
      console.log(`[whatsapp] Reconnecting account ${accountId} with existing credentials...`);
    }
    
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const browserFingerprint = getRandomBrowserFingerprint();

    const socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: browserFingerprint,
      logger,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 120000,
      defaultQueryTimeoutMs: 90000,
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 1000,
      qrTimeout: 50000,
      emitOwnEvents: true,
    });

    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      const conn = connections.get(accountId);

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { width: 256 });
          
          connections.set(accountId, {
            ...conn!,
            socket,
            qrCode: qrDataUrl,
            qrGeneratedAt: Date.now(),
            status: "qr_ready",
            phoneNumber: null,
            reconnectAttempts: 0,
          });

          await storage.upsertWhatsappSessionByAccountId(accountId, adminId, {
            status: "qr_ready",
            qrCode: qrDataUrl,
          });

          console.log(`[whatsapp] QR code generated for account ${accountId}`);
        } catch (err) {
          console.error("[whatsapp] Error generating QR:", err);
        }
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        const currentConn = connections.get(accountId);
        const attempts = currentConn?.reconnectAttempts || 0;

        console.log(
          `[whatsapp] Connection closed for account ${accountId}. Status: ${statusCode}, Reconnect: ${shouldReconnect}, Attempts: ${attempts}`
        );

        if (isSpamOrBanError(lastDisconnect?.error)) {
          console.error(`[whatsapp] BAN detected on disconnect for account ${accountId}`);
          
          if (currentConn?.messageQueue && currentConn.messageQueue.length > 0) {
            console.log(`[whatsapp] Flushing ${currentConn.messageQueue.length} queued messages for banned account ${accountId}`);
            while (currentConn.messageQueue.length > 0) {
              const item = currentConn.messageQueue.shift();
              item?.reject(new Error("Conta suspensa por spam. Aguarde algumas horas antes de tentar novamente."));
            }
          }
          
          // Clear rate limit counters for this account to ensure isolation
          messageCounts.delete(accountId);
          
          // Clear auth directory to ensure complete isolation from other users
          const authDir = getAuthDir(accountId);
          if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true });
            console.log(`[whatsapp] Auth cleared for banned account ${accountId} - complete isolation ensured`);
          }
          
          connections.set(accountId, {
            ...currentConn!,
            socket: null,
            qrCode: null,
            qrGeneratedAt: null,
            status: "banned",
            reconnectAttempts: 0,
            messageQueue: [],
          });

          await storage.upsertWhatsappSessionByAccountId(accountId, adminId, {
            status: "banned",
            qrCode: null,
            phoneNumber: null,
            sessionData: null, // Clear session data in database too
          });
          return;
        }

        // Error 515 (restartRequired) is NORMAL - reconnect automatically with saved credentials
        if (statusCode === DisconnectReason.restartRequired) {
          console.log(`[whatsapp] Restart required (515) for account ${accountId}. Reconnecting with saved credentials...`);
          // Simply reconnect - pass isReconnect=true to skip session validation
          setTimeout(() => {
            initWhatsAppConnection(accountId, adminId, true);
          }, 2000);
          return;
        }

        // For other errors, check if we should reconnect
        if (!shouldReconnect || (statusCode !== 408 && attempts >= MAX_RECONNECT_ATTEMPTS)) {
          console.log(`[whatsapp] Connection failed permanently for account ${accountId} (statusCode: ${statusCode}). User must reconnect manually.`);
          
          if (currentConn?.messageQueue && currentConn.messageQueue.length > 0) {
            console.log(`[whatsapp] Flushing ${currentConn.messageQueue.length} queued messages for account ${accountId} (connection permanently closed)`);
            while (currentConn.messageQueue.length > 0) {
              const item = currentConn.messageQueue.shift();
              item?.reject(new Error("Conexão encerrada. Por favor, tente conectar novamente."));
            }
          }
          
          // Only clear auth on actual logout, not on temporary disconnects
          if (statusCode === DisconnectReason.loggedOut) {
            const authDir = getAuthDir(accountId);
            if (fs.existsSync(authDir)) {
              fs.rmSync(authDir, { recursive: true });
              console.log(`[whatsapp] Auth cleared for account ${accountId} (logged out)`);
            }
          }
          
          connections.set(accountId, {
            ...currentConn!,
            socket: null,
            qrCode: null,
            qrGeneratedAt: null,
            status: "disconnected",
            phoneNumber: null,
            reconnectAttempts: 0,
            messageQueue: [],
          });

          await storage.upsertWhatsappSessionByAccountId(accountId, adminId, {
            status: "disconnected",
            qrCode: null,
            phoneNumber: null,
          });
        }
      }

      if (connection === "open") {
        const phoneNumber = socket.user?.id?.split(":")[0] || null;
        
        connections.set(accountId, {
          ...conn!,
          socket,
          qrCode: null,
          qrGeneratedAt: null,
          status: "connected",
          phoneNumber,
          reconnectAttempts: 0,
        });

        await storage.upsertWhatsappSessionByAccountId(accountId, adminId, {
          status: "connected",
          qrCode: null,
          phoneNumber,
          lastConnectedAt: new Date(),
        });

        console.log(`[whatsapp] Connected for account ${accountId}: ${phoneNumber}`);
        
        processMessageQueue(accountId);
      }
    });

    return {
      success: true,
      status: "connecting",
    };
  } catch (error) {
    console.error("[whatsapp] Error initializing connection:", error);
    
    const existing = connections.get(accountId);
    connections.set(accountId, {
      socket: null,
      qrCode: null,
      qrGeneratedAt: null,
      status: "disconnected",
      phoneNumber: null,
      adminId,
      accountId,
      reconnectAttempts: (existing?.reconnectAttempts || 0) + 1,
      lastMessageSentAt: 0,
      messageQueue: existing?.messageQueue || [],
      isProcessingQueue: false,
    });

    return {
      success: false,
      status: "error",
      error: "Erro ao inicializar conexão",
    };
  }
}

export async function initWhatsAppConnectionWithPairingCode(
  accountId: string, 
  adminId: string, 
  phoneNumber: string
): Promise<{
  success: boolean;
  status: string;
  pairingCode?: string;
  error?: string;
}> {
  try {
    const existing = connections.get(accountId);
    
    if (existing?.status === "banned") {
      return {
        success: false,
        status: "banned",
        error: "Esta conta foi temporariamente suspensa. Aguarde algumas horas antes de reconectar.",
      };
    }
    
    if (existing?.status === "connected" && existing.socket) {
      return {
        success: true,
        status: "connected",
      };
    }

    // Clean up any existing connection
    if (existing?.socket) {
      try {
        existing.socket.end(undefined);
      } catch (e) {
        // Ignore
      }
    }

    // Clear auth for fresh start
    const authDir = getAuthDir(accountId);
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true });
    }

    connections.set(accountId, {
      socket: null,
      qrCode: null,
      qrGeneratedAt: null,
      status: "connecting",
      phoneNumber: null,
      adminId,
      accountId,
      reconnectAttempts: 0,
      lastMessageSentAt: 0,
      messageQueue: existing?.messageQueue || [],
      isProcessingQueue: false,
    });

    await storage.upsertWhatsappSessionByAccountId(accountId, adminId, {
      status: "connecting",
      qrCode: null,
    });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();
    const browserFingerprint = getRandomBrowserFingerprint();

    const socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: browserFingerprint,
      logger,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 120000,
      defaultQueryTimeoutMs: 90000,
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 1000,
      qrTimeout: 50000,
      emitOwnEvents: true,
    });

    socket.ev.on("creds.update", saveCreds);

    // Request pairing code
    const formattedPhone = phoneNumber.replace(/\D/g, "");
    
    return new Promise(async (resolve) => {
      let resolved = false;
      
      // Set timeout for pairing code generation
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({
            success: false,
            status: "error",
            error: "Tempo esgotado ao gerar código de pareamento",
          });
        }
      }, 30000);

      socket.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        const conn = connections.get(accountId);

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          
          console.log(`[whatsapp] Pairing connection closed for account ${accountId}. Status: ${statusCode}`);
          
          // Error 515 (restart required) is expected - just wait for reconnection
          if (statusCode === 515 || statusCode === DisconnectReason.restartRequired) {
            console.log(`[whatsapp] Restart required (515) during pairing for account ${accountId}. Waiting...`);
            return;
          }
          
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          if (!resolved && !shouldReconnect) {
            resolved = true;
            clearTimeout(timeout);
            resolve({
              success: false,
              status: "error",
              error: "Conexão fechada durante pareamento",
            });
          }
        }

        if (connection === "open") {
          const connectedPhone = socket.user?.id?.split(":")[0] || null;
          
          connections.set(accountId, {
            ...conn!,
            socket,
            qrCode: null,
            qrGeneratedAt: null,
            status: "connected",
            phoneNumber: connectedPhone,
            reconnectAttempts: 0,
          });

          await storage.upsertWhatsappSessionByAccountId(accountId, adminId, {
            status: "connected",
            qrCode: null,
            phoneNumber: connectedPhone,
            lastConnectedAt: new Date(),
          });

          console.log(`[whatsapp] Connected via pairing code for account ${accountId}: ${connectedPhone}`);
          
          processMessageQueue(accountId);
        }
      });

      try {
        // Wait a bit for socket to initialize
        await new Promise(r => setTimeout(r, 2000));
        
        const code = await socket.requestPairingCode(formattedPhone);
        
        connections.set(accountId, {
          ...connections.get(accountId)!,
          socket,
          status: "pairing_code_ready",
        });

        console.log(`[whatsapp] Pairing code generated for account ${accountId}: ${code}`);
        
        resolved = true;
        clearTimeout(timeout);
        resolve({
          success: true,
          status: "pairing_code_ready",
          pairingCode: code,
        });
      } catch (error: any) {
        console.error("[whatsapp] Error requesting pairing code:", error);
        
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            success: false,
            status: "error",
            error: error.message || "Erro ao gerar código de pareamento",
          });
        }
      }
    });
  } catch (error: any) {
    console.error("[whatsapp] Error initializing pairing connection:", error);
    return {
      success: false,
      status: "error",
      error: "Erro ao inicializar conexão",
    };
  }
}

export async function getWhatsAppStatus(accountId: string): Promise<{
  status: string;
  qrCode?: string;
  phoneNumber?: string;
  qrExpired?: boolean;
}> {
  const account = await storage.getWhatsappAccountById(accountId);
  
  if (account?.provider === "cloud_api") {
    const { getCloudApiStatus } = await import("./whatsapp-cloud-service");
    const cloudStatus = await getCloudApiStatus(accountId);
    return {
      status: cloudStatus.connected ? "connected" : "disconnected",
      phoneNumber: cloudStatus.phoneNumber,
    };
  }
  
  const conn = connections.get(accountId);
  
  if (conn) {
    let qrExpired = false;
    
    if (conn.status === "qr_ready" && conn.qrGeneratedAt) {
      qrExpired = Date.now() - conn.qrGeneratedAt > QR_CODE_TTL_MS;
    }
    
    return {
      status: conn.status,
      qrCode: conn.qrCode || undefined,
      phoneNumber: conn.phoneNumber || undefined,
      qrExpired,
    };
  }

  const session = await storage.getWhatsappSessionByAccountId(accountId);
  if (session) {
    return {
      status: session.status,
      qrCode: session.qrCode || undefined,
      phoneNumber: session.phoneNumber || undefined,
    };
  }

  return { status: "disconnected" };
}

// Reset/clear a session completely for fresh start
export async function resetWhatsAppSession(accountId: string, adminId: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const conn = connections.get(accountId);
    
    // Clear any pending messages
    if (conn?.messageQueue && conn.messageQueue.length > 0) {
      console.log(`[whatsapp] Flushing ${conn.messageQueue.length} queued messages for reset of account ${accountId}`);
      while (conn.messageQueue.length > 0) {
        const item = conn.messageQueue.shift();
        item?.reject(new Error("Sessão resetada pelo usuário."));
      }
    }
    
    // Close existing socket
    if (conn?.socket) {
      try {
        conn.socket.end(undefined);
      } catch (e) {
        // Ignore
      }
    }

    // Remove from connections map
    connections.delete(accountId);

    // Clear auth directory
    const authDir = path.join(AUTH_DIR, accountId);
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true });
      console.log(`[whatsapp] Auth directory cleared for account ${accountId}`);
    }

    // Update database status
    await storage.upsertWhatsappSessionByAccountId(accountId, adminId, {
      status: "disconnected",
      qrCode: null,
      phoneNumber: null,
      sessionData: null,
    });

    console.log(`[whatsapp] Session reset complete for account ${accountId}`);
    return {
      success: true,
      message: "Sessão resetada com sucesso. Você pode reconectar agora.",
    };
  } catch (error) {
    console.error("[whatsapp] Error resetting session:", error);
    return {
      success: false,
      message: "Erro ao resetar sessão.",
    };
  }
}

// Soft disconnect - closes socket but PRESERVES credentials for reconnection after restart
export async function softCloseWhatsApp(accountId: string): Promise<void> {
  try {
    const conn = connections.get(accountId);
    if (conn?.socket) {
      try {
        conn.socket.end(undefined);
      } catch (e) {
        // Ignore errors during soft close
      }
    }
    connections.delete(accountId);
    console.log(`[whatsapp] Soft closed connection for account ${accountId} (credentials preserved)`);
  } catch (error) {
    console.error("[whatsapp] Error in soft close:", error);
  }
}

// Hard disconnect - logs out from WhatsApp and CLEARS all credentials (user-initiated)
export async function disconnectWhatsApp(accountId: string, adminId: string): Promise<boolean> {
  try {
    const conn = connections.get(accountId);
    
    if (conn?.messageQueue && conn.messageQueue.length > 0) {
      console.log(`[whatsapp] Flushing ${conn.messageQueue.length} queued messages before disconnect for account ${accountId}`);
      while (conn.messageQueue.length > 0) {
        const item = conn.messageQueue.shift();
        item?.reject(new Error("WhatsApp desconectado pelo usuário."));
      }
    }
    
    // Logout invalidates the session on WhatsApp servers
    if (conn?.socket) {
      await conn.socket.logout();
    }

    connections.delete(accountId);

    await storage.upsertWhatsappSessionByAccountId(accountId, adminId, {
      status: "disconnected",
      qrCode: null,
      phoneNumber: null,
    });

    // Clear credentials since this is a user-initiated disconnect
    const authDir = getAuthDir(accountId);
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true });
    }

    console.log(`[whatsapp] Disconnected and cleared credentials for account ${accountId}`);
    return true;
  } catch (error) {
    console.error("[whatsapp] Error disconnecting:", error);
    return false;
  }
}

export async function sendWhatsAppMessage(
  accountId: string,
  phone: string,
  message: string
): Promise<{ success: boolean; error?: string; queued?: boolean }> {
  const account = await storage.getWhatsappAccountById(accountId);
  
  if (account?.provider === "cloud_api") {
    const { sendCloudApiTextMessage } = await import("./whatsapp-cloud-service");
    const result = await sendCloudApiTextMessage(accountId, phone, message);
    return { success: result.success, error: result.error };
  }
  
  let conn = connections.get(accountId);
  
  if (!conn) {
    return { success: false, error: "WhatsApp não inicializado" };
  }
  
  if (conn.status === "banned") {
    return { success: false, error: "Conta suspensa temporariamente. Aguarde antes de enviar mensagens." };
  }
  
  if (conn.messageQueue.length >= MAX_QUEUE_SIZE) {
    return { success: false, error: "Fila de mensagens cheia. Aguarde algumas mensagens serem enviadas." };
  }
  
  if (conn.status === "connecting" || conn.status === "qr_ready") {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const idx = conn!.messageQueue.findIndex(m => m.phone === phone && m.message === message);
        if (idx !== -1) {
          conn!.messageQueue.splice(idx, 1);
          resolve({ success: false, error: "Tempo limite excedido. WhatsApp não foi conectado a tempo." });
        }
      }, QUEUE_TIMEOUT_MS);
      
      conn!.messageQueue.push({
        phone,
        message,
        resolve: (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        }
      });
      
      console.log(`[whatsapp] Message queued for account ${accountId} (status: ${conn!.status})`);
    });
  }
  
  if (conn.status !== "connected" || !conn.socket) {
    return { success: false, error: "WhatsApp não conectado" };
  }

  return new Promise((resolve, reject) => {
    conn!.messageQueue.push({ phone, message, resolve, reject });
    processMessageQueue(accountId);
  });
}

export interface MediaMessage {
  type: "image" | "audio" | "video" | "document";
  url: string;
  caption?: string;
  fileName?: string;
  mimetype?: string;
  ptt?: boolean; // Push-to-talk: true sends audio as voice note (round bubble)
}

// WhatsApp media limits (in bytes)
const MEDIA_LIMITS = {
  image: {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedMimes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
    allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"],
  },
  audio: {
    maxSize: 16 * 1024 * 1024, // 16MB
    allowedMimes: ["audio/ogg", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/m4a", "audio/wav", "audio/x-wav"],
    allowedExtensions: [".ogg", ".mp3", ".m4a", ".wav"],
  },
  video: {
    maxSize: 16 * 1024 * 1024, // 16MB
    allowedMimes: ["video/mp4", "video/3gpp", "video/3gp"],
    allowedExtensions: [".mp4", ".3gp"],
  },
  document: {
    maxSize: 100 * 1024 * 1024, // 100MB
    allowedMimes: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    allowedExtensions: [".pdf", ".doc", ".docx", ".xls", ".xlsx"],
  },
};

interface MediaValidationResult {
  valid: boolean;
  error?: string;
  contentLength?: number;
  contentType?: string;
}

function getExtensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    return ext;
  } catch {
    return "";
  }
}

function validateMimeType(media: MediaMessage, contentType: string): { valid: boolean; error?: string } {
  const limits = MEDIA_LIMITS[media.type];
  
  const serverMime = contentType?.toLowerCase() || "";
  const providedMime = media.mimetype?.toLowerCase() || "";
  const urlExtension = getExtensionFromUrl(media.url);
  
  // Priority: Server Content-Type > URL Extension > Provided mimetype (only as last resort)
  // Server Content-Type is the most trustworthy source
  if (serverMime) {
    const isValidServerMime = limits.allowedMimes.some(allowed => 
      serverMime.includes(allowed) || allowed.includes(serverMime.split("/")[1] || "")
    );
    if (!isValidServerMime) {
      return { 
        valid: false, 
        error: `Formato não suportado pelo servidor (${serverMime}). Formatos aceitos para ${media.type}: ${limits.allowedExtensions.join(", ")}`
      };
    }
    // Server MIME is valid
    return { valid: true };
  }
  
  // If no server MIME, check URL extension (second most trustworthy)
  if (urlExtension) {
    const isValidExtension = limits.allowedExtensions.includes(urlExtension);
    if (!isValidExtension) {
      return { 
        valid: false, 
        error: `Formato não suportado (${urlExtension}). Formatos aceitos para ${media.type}: ${limits.allowedExtensions.join(", ")}`
      };
    }
    // Extension is valid
    return { valid: true };
  }
  
  // Only if no server MIME and no URL extension, accept provided mimetype (least trustworthy)
  // But still validate it
  if (providedMime) {
    const isValidProvidedMime = limits.allowedMimes.some(allowed => 
      providedMime.includes(allowed) || allowed.includes(providedMime.split("/")[1] || "")
    );
    if (!isValidProvidedMime) {
      return { 
        valid: false, 
        error: `Formato não suportado (${providedMime}). Formatos aceitos para ${media.type}: ${limits.allowedExtensions.join(", ")}`
      };
    }
    // Provided MIME is valid (but warn in logs)
    console.warn(`[whatsapp] Media validation using only provided mimetype '${providedMime}' - no server MIME or URL extension available`);
    return { valid: true };
  }
  
  // No source available to determine format - reject
  return { 
    valid: false, 
    error: `Não foi possível determinar o formato do arquivo. Formatos aceitos para ${media.type}: ${limits.allowedExtensions.join(", ")}`
  };
}

async function validateMediaBeforeSend(media: MediaMessage): Promise<MediaValidationResult> {
  const limits = MEDIA_LIMITS[media.type];
  if (!limits) {
    return { valid: false, error: `Tipo de mídia '${media.type}' não suportado` };
  }

  try {
    // HEAD request to check size and type without downloading
    const headResponse = await fetch(media.url, { method: "HEAD" });
    if (!headResponse.ok) {
      // Try GET with range to check if URL is accessible
      const rangeResponse = await fetch(media.url, { 
        method: "GET",
        headers: { "Range": "bytes=0-0" }
      });
      if (!rangeResponse.ok && rangeResponse.status !== 206) {
        return { valid: false, error: `Não foi possível acessar o arquivo de mídia (HTTP ${headResponse.status})` };
      }
    }

    const contentLength = parseInt(headResponse.headers.get("content-length") || "0", 10);
    const contentType = headResponse.headers.get("content-type")?.split(";")[0]?.toLowerCase() || "";

    // Check file size if available in headers
    if (contentLength > 0) {
      if (contentLength > limits.maxSize) {
        const maxSizeMB = Math.round(limits.maxSize / (1024 * 1024));
        const fileSizeMB = (contentLength / (1024 * 1024)).toFixed(2);
        return { 
          valid: false, 
          error: `Arquivo muito grande (${fileSizeMB}MB). Limite para ${media.type}: ${maxSizeMB}MB`,
          contentLength,
          contentType
        };
      }
    }

    // Validate MIME type using multiple sources
    const mimeValidation = validateMimeType(media, contentType);
    if (!mimeValidation.valid) {
      return { 
        valid: false, 
        error: mimeValidation.error,
        contentLength,
        contentType
      };
    }

    return { valid: true, contentLength, contentType };
  } catch (error: any) {
    console.error("[whatsapp] Error validating media:", error);
    return { valid: false, error: `Erro ao validar arquivo: ${error.message}` };
  }
}

function validateDownloadedMedia(buffer: Buffer, mediaType: "image" | "audio" | "video" | "document"): { valid: boolean; error?: string } {
  const limits = MEDIA_LIMITS[mediaType];
  
  if (buffer.length > limits.maxSize) {
    const maxSizeMB = Math.round(limits.maxSize / (1024 * 1024));
    const fileSizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
    return { 
      valid: false, 
      error: `Arquivo muito grande (${fileSizeMB}MB). Limite para ${mediaType}: ${maxSizeMB}MB`
    };
  }
  
  return { valid: true };
}

export async function sendWhatsAppMediaMessage(
  accountId: string,
  phone: string,
  media: MediaMessage
): Promise<{ success: boolean; error?: string }> {
  const conn = connections.get(accountId);
  
  if (!conn) {
    return { success: false, error: "WhatsApp não inicializado" };
  }
  
  if (conn.status === "banned") {
    return { success: false, error: "Conta suspensa temporariamente. Aguarde antes de enviar mensagens." };
  }
  
  if (conn.status !== "connected" || !conn.socket) {
    return { success: false, error: "WhatsApp não conectado" };
  }

  // Validate media before sending
  const validation = await validateMediaBeforeSend(media);
  if (!validation.valid) {
    console.error(`[whatsapp] Media validation failed for ${media.type}: ${validation.error}`);
    return { success: false, error: validation.error };
  }

  // Apply rate limiting for media messages too
  const rateCheck = checkRateLimit(accountId);
  if (!rateCheck.allowed) {
    console.log(`[whatsapp] Rate limit hit for media message from account ${accountId}, waiting ${rateCheck.waitMs}ms`);
    await new Promise(resolve => setTimeout(resolve, rateCheck.waitMs));
  }

  // Wait for minimum message interval
  const timeSinceLastMessage = Date.now() - conn.lastMessageSentAt;
  const requiredDelay = getRandomMessageDelay();
  if (timeSinceLastMessage < requiredDelay) {
    await new Promise(resolve => setTimeout(resolve, requiredDelay - timeSinceLastMessage));
  }

  try {
    let formattedPhone = phone.replace(/\D/g, "");
    if (!formattedPhone.startsWith("55")) {
      formattedPhone = "55" + formattedPhone;
    }
    const jid = formattedPhone + "@s.whatsapp.net";

    const response = await fetch(media.url);
    if (!response.ok) {
      return { success: false, error: "Erro ao baixar arquivo de mídia" };
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    // Post-download validation to catch cases where HEAD didn't provide size
    const postDownloadValidation = validateDownloadedMedia(buffer, media.type);
    if (!postDownloadValidation.valid) {
      console.error(`[whatsapp] Post-download validation failed for ${media.type}: ${postDownloadValidation.error}`);
      return { success: false, error: postDownloadValidation.error };
    }

    let messageContent: any;
    
    switch (media.type) {
      case "image":
        messageContent = {
          image: buffer,
          caption: media.caption || undefined,
          mimetype: media.mimetype || "image/jpeg",
        };
        break;
        
      case "audio":
        messageContent = {
          audio: buffer,
          mimetype: media.mimetype || "audio/ogg; codecs=opus",
          ptt: media.ptt !== undefined ? media.ptt : true, // Default to voice note
        };
        break;
        
      case "video":
        messageContent = {
          video: buffer,
          caption: media.caption || undefined,
          mimetype: media.mimetype || "video/mp4",
        };
        break;
        
      case "document":
        messageContent = {
          document: buffer,
          mimetype: media.mimetype || "application/pdf",
          fileName: media.fileName || "documento.pdf",
          caption: media.caption || undefined,
        };
        break;
        
      default:
        return { success: false, error: "Tipo de mídia não suportado" };
    }

    await conn.socket.sendMessage(jid, messageContent);
    conn.lastMessageSentAt = Date.now();
    
    console.log(`[whatsapp] Media (${media.type}) sent to ${phone} from account ${accountId}`);
    return { success: true };
  } catch (error: any) {
    console.error(`[whatsapp] Error sending media:`, error);
    
    if (isSpamOrBanError(error)) {
      conn.status = "banned";
      
      // Clear rate limit counters for isolation
      messageCounts.delete(accountId);
      
      // Clear auth directory for complete isolation
      const authDir = getAuthDir(accountId);
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true });
        console.log(`[whatsapp] Auth cleared for banned account ${accountId} during media send`);
      }
      
      await storage.upsertWhatsappSessionByAccountId(accountId, conn.adminId, {
        status: "banned",
        qrCode: null,
        phoneNumber: null,
        sessionData: null,
      });
      return { success: false, error: "Conta suspensa por spam. Aguarde antes de tentar novamente." };
    }
    
    return { success: false, error: error.message || "Erro ao enviar mídia" };
  }
}

export async function restoreWhatsAppSessions(): Promise<void> {
  try {
    // Get all sessions from database (any status)
    const sessions = await storage.getActiveWhatsappSessions();
    let restoredCount = 0;
    
    // Also check for session folders on disk that might not be in DB
    const sessionFolders = fs.existsSync(AUTH_DIR) 
      ? fs.readdirSync(AUTH_DIR).filter(f => fs.statSync(path.join(AUTH_DIR, f)).isDirectory())
      : [];
    
    // Create a map of accountId -> session for quick lookup
    const sessionMap = new Map(sessions.map(s => [s.accountId, s]));
    
    // Restore sessions that have valid credentials on disk
    for (const accountId of sessionFolders) {
      // Skip if credentials are not valid (not registered)
      if (!isSessionValid(accountId)) {
        console.log(`[whatsapp] Skipping account ${accountId} - no valid credentials on disk`);
        continue;
      }
      
      // Find matching session in database
      const session = sessionMap.get(accountId);
      if (!session) {
        console.log(`[whatsapp] Found orphaned session folder ${accountId} - no matching DB record`);
        continue;
      }
      
      console.log(`[whatsapp] Restoring session for account ${accountId} (admin: ${session.adminId}) from disk credentials`);
      
      // Small delay between connections to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      try {
        await initWhatsAppConnection(accountId, session.adminId);
        restoredCount++;
      } catch (error) {
        console.error(`[whatsapp] Failed to restore session for account ${accountId}:`, error);
        
        await storage.upsertWhatsappSessionByAccountId(accountId, session.adminId, {
          status: "disconnected",
          qrCode: null,
        });
      }
    }
    
    console.log(`[whatsapp] Session restoration complete. Restored ${restoredCount} sessions from ${sessionFolders.length} folders.`);
  } catch (error) {
    console.error("[whatsapp] Error restoring sessions:", error);
  }
}

export function replaceWhatsappMergeTags(
  text: string,
  data: {
    leadName?: string;
    leadPhone?: string;
    webinarTitle?: string;
    webinarDate?: string;
    webinarTime?: string;
    webinarLink?: string;
    replayLink?: string;
  }
): string {
  return text
    .replace(/\{\{nome\}\}/gi, data.leadName || "")
    .replace(/\{\{telefone\}\}/gi, data.leadPhone || "")
    .replace(/\{\{webinar_titulo\}\}/gi, data.webinarTitle || "")
    .replace(/\{\{webinar_data\}\}/gi, data.webinarDate || "")
    .replace(/\{\{webinar_horario\}\}/gi, data.webinarTime || "")
    .replace(/\{\{webinar_link\}\}/gi, data.webinarLink || "")
    .replace(/\{\{replay_link\}\}/gi, data.replayLink || "");
}

export async function clearBanStatus(accountId: string, adminId: string): Promise<boolean> {
  try {
    const conn = connections.get(accountId);
    
    if (conn) {
      if (conn.messageQueue && conn.messageQueue.length > 0) {
        console.log(`[whatsapp] Flushing ${conn.messageQueue.length} queued messages before clearing ban for account ${accountId}`);
        while (conn.messageQueue.length > 0) {
          const item = conn.messageQueue.shift();
          item?.reject(new Error("Conta banida - sessao resetada."));
        }
      }
      
      if (conn.socket) {
        try {
          conn.socket.end(undefined);
        } catch (e) {}
      }
      
      connections.delete(accountId);
    }
    
    const authDir = getAuthDir(accountId);
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true });
      console.log(`[whatsapp] Auth directory cleared for account ${accountId}`);
    }
    
    messageCounts.delete(accountId);
    
    await storage.upsertWhatsappSessionByAccountId(accountId, adminId, {
      status: "disconnected",
      qrCode: null,
      phoneNumber: null,
    });
    
    console.log(`[whatsapp] Ban status and session data cleared for account ${accountId}`);
    return true;
  } catch (error) {
    console.error("[whatsapp] Error clearing ban status:", error);
    return false;
  }
}

async function performHealthCheck(): Promise<void> {
  console.log(`[whatsapp] Running health check for ${connections.size} connections`);
  
  const entries = Array.from(connections.entries());
  for (const [accountId, conn] of entries) {
    try {
      if (conn.status === "qr_ready" && conn.qrGeneratedAt) {
        const qrAge = Date.now() - conn.qrGeneratedAt;
        if (qrAge > QR_CODE_TTL_MS) {
          console.log(`[whatsapp] QR expired for account ${accountId}, regenerating...`);
          
          if (conn.socket) {
            try {
              conn.socket.end(undefined);
            } catch (e) {
            }
          }
          
          connections.set(accountId, {
            ...conn,
            socket: null,
            qrCode: null,
            qrGeneratedAt: null,
            status: "disconnected",
          });
          
          await initWhatsAppConnection(accountId, conn.adminId);
        }
      }
      
      if (conn.status === "connected" && conn.socket) {
        try {
          const ws = conn.socket.ws as any;
          const state = ws?.readyState;
          if (state !== undefined && state !== 1) {
            console.log(`[whatsapp] Socket unhealthy for account ${accountId} (state: ${state}), attempting recovery...`);
            
            connections.set(accountId, {
              ...conn,
              socket: null,
              status: "disconnected",
              reconnectAttempts: 0,
            });
            
            await storage.upsertWhatsappSessionByAccountId(accountId, conn.adminId, {
              status: "disconnected",
            });
            
            setTimeout(() => {
              console.log(`[whatsapp] Auto-recovering connection for account ${accountId}`);
              initWhatsAppConnection(accountId, conn.adminId).catch(err => {
                console.error(`[whatsapp] Auto-recovery failed for account ${accountId}:`, err);
              });
            }, 2000);
          }
        } catch (e) {
          console.log(`[whatsapp] Socket check failed for account ${accountId}:`, e);
        }
      }
      
      const dbSession = await storage.getWhatsappSessionByAccountId(accountId);
      if (dbSession) {
        if (dbSession.status === "connected" && conn.status !== "connected") {
          console.log(`[whatsapp] DB/memory mismatch for account ${accountId}: DB=${dbSession.status}, MEM=${conn.status}`);
          await storage.upsertWhatsappSessionByAccountId(accountId, conn.adminId, {
            status: conn.status,
          });
        }
      }
      
      if ((conn.status === "disconnected" || conn.status === "banned") && conn.messageQueue.length > 0) {
        const errorMsg = conn.status === "banned" 
          ? "Conta suspensa por spam. Aguarde antes de tentar novamente."
          : "WhatsApp desconectado. Por favor, reconecte para enviar mensagens.";
        console.log(`[whatsapp] Health check: flushing ${conn.messageQueue.length} stale messages for ${conn.status} account ${accountId}`);
        while (conn.messageQueue.length > 0) {
          const item = conn.messageQueue.shift();
          item?.reject(new Error(errorMsg));
        }
      }
    } catch (error) {
      console.error(`[whatsapp] Health check error for account ${accountId}:`, error);
    }
  }
}

export function startHealthCheckInterval(): void {
  setInterval(() => {
    performHealthCheck().catch(err => {
      console.error("[whatsapp] Health check failed:", err);
    });
  }, HEALTH_CHECK_INTERVAL_MS);
  
  console.log(`[whatsapp] Health check started (interval: ${HEALTH_CHECK_INTERVAL_MS}ms)`);
}

// ============================================
// PROVIDER PATTERN - Routes to Baileys or Cloud API
// ============================================

import {
  sendCloudApiTextMessage,
  sendCloudApiMediaMessage,
  getCloudApiStatus,
  CloudApiMessage,
  CloudApiSendResult,
} from "./whatsapp-cloud-service";

export type WhatsAppProvider = "baileys" | "cloud_api";

export interface UnifiedSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  queued?: boolean;
}

export interface UnifiedStatus {
  status: string;
  qrCode?: string;
  phoneNumber?: string;
  qrExpired?: boolean;
  displayName?: string;
  provider?: WhatsAppProvider;
}

export async function sendMessageByProvider(
  accountId: string,
  phone: string,
  message: string
): Promise<UnifiedSendResult> {
  const account = await storage.getWhatsappAccountById(accountId);
  
  if (!account) {
    return { success: false, error: "Conta não encontrada" };
  }
  
  const provider = (account.provider || "baileys") as WhatsAppProvider;
  
  if (provider === "cloud_api") {
    const result = await sendCloudApiTextMessage(accountId, phone, message);
    return {
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    };
  }
  
  // Default: Baileys
  const result = await sendWhatsAppMessage(accountId, phone, message);
  return {
    success: result.success,
    error: result.error,
    queued: result.queued,
  };
}

export async function sendMediaMessageByProvider(
  accountId: string,
  phone: string,
  media: MediaMessage
): Promise<UnifiedSendResult> {
  const account = await storage.getWhatsappAccountById(accountId);
  
  if (!account) {
    return { success: false, error: "Conta não encontrada" };
  }
  
  const provider = (account.provider || "baileys") as WhatsAppProvider;
  
  if (provider === "cloud_api") {
    const cloudMedia: CloudApiMessage = {
      type: media.type,
      mediaUrl: media.url,
      caption: media.caption,
      fileName: media.fileName,
    };
    const result = await sendCloudApiMediaMessage(accountId, phone, cloudMedia);
    return {
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    };
  }
  
  // Default: Baileys
  const result = await sendWhatsAppMediaMessage(accountId, phone, media);
  return {
    success: result.success,
    error: result.error,
  };
}

export async function getStatusByProvider(accountId: string): Promise<UnifiedStatus> {
  const account = await storage.getWhatsappAccountById(accountId);
  
  if (!account) {
    return { status: "disconnected" };
  }
  
  const provider = (account.provider || "baileys") as WhatsAppProvider;
  
  if (provider === "cloud_api") {
    const result = await getCloudApiStatus(accountId);
    return {
      status: result.connected ? "connected" : "disconnected",
      phoneNumber: result.phoneNumber,
      displayName: result.displayName,
      provider: "cloud_api",
    };
  }
  
  // Default: Baileys
  const result = await getWhatsAppStatus(accountId);
  return {
    ...result,
    provider: "baileys",
  };
}

export async function initConnectionByProvider(
  accountId: string,
  adminId: string
): Promise<{
  success: boolean;
  status: string;
  qrCode?: string;
  phoneNumber?: string;
  displayName?: string;
  error?: string;
  provider?: WhatsAppProvider;
}> {
  const account = await storage.getWhatsappAccountById(accountId);
  
  if (!account) {
    return { success: false, status: "error", error: "Conta não encontrada" };
  }
  
  const provider = (account.provider || "baileys") as WhatsAppProvider;
  
  if (provider === "cloud_api") {
    // Cloud API doesn't need QR code connection - just validate credentials
    const status = await getCloudApiStatus(accountId);
    
    if (status.connected) {
      // Update account status in database
      await storage.updateWhatsappAccount(accountId, {
        status: "connected",
        phoneNumber: status.phoneNumber || null,
      });
      
      return {
        success: true,
        status: "connected",
        phoneNumber: status.phoneNumber,
        displayName: status.displayName,
        provider: "cloud_api",
      };
    }
    
    return {
      success: false,
      status: "disconnected",
      error: status.error || "Credenciais inválidas ou não configuradas",
      provider: "cloud_api",
    };
  }
  
  // Default: Baileys
  const result = await initWhatsAppConnection(accountId, adminId);
  return {
    ...result,
    provider: "baileys",
  };
}

export async function disconnectByProvider(
  accountId: string,
  adminId: string
): Promise<boolean> {
  const account = await storage.getWhatsappAccountById(accountId);
  
  if (!account) {
    return false;
  }
  
  const provider = (account.provider || "baileys") as WhatsAppProvider;
  
  if (provider === "cloud_api") {
    // Cloud API doesn't have persistent connections, just update status
    await storage.updateWhatsappAccount(accountId, {
      status: "disconnected",
      phoneNumber: null,
    });
    return true;
  }
  
  // Default: Baileys
  return disconnectWhatsApp(accountId, adminId);
}

// Gracefully close all WhatsApp connections on server shutdown
// This preserves credentials for reconnection after restart
export async function gracefulShutdown(): Promise<void> {
  console.log("[whatsapp] Graceful shutdown initiated - closing connections without clearing credentials...");
  
  const accountIds = Array.from(connections.keys());
  
  for (const accountId of accountIds) {
    await softCloseWhatsApp(accountId);
  }
  
  console.log(`[whatsapp] Graceful shutdown complete - ${accountIds.length} connections closed, credentials preserved`);
}

// Register shutdown handlers
process.on("SIGTERM", async () => {
  console.log("[whatsapp] Received SIGTERM signal");
  await gracefulShutdown();
});

process.on("SIGINT", async () => {
  console.log("[whatsapp] Received SIGINT signal");
  await gracefulShutdown();
});
