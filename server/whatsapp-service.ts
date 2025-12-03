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

const logger = pino({ level: "warn" });

interface WhatsAppConnection {
  socket: WASocket | null;
  qrCode: string | null;
  qrGeneratedAt: number | null;
  status: "disconnected" | "connecting" | "qr_ready" | "connected" | "banned";
  phoneNumber: string | null;
  reconnectAttempts: number;
  lastMessageSentAt: number;
  messageQueue: Array<{ phone: string; message: string; resolve: (result: any) => void; reject: (error: any) => void }>;
  isProcessingQueue: boolean;
}

const connections: Map<string, WhatsAppConnection> = new Map();

const AUTH_DIR = path.join(process.cwd(), "whatsapp-sessions");

const QR_CODE_TTL_MS = 60 * 1000;
const MAX_RECONNECT_ATTEMPTS = 5;
const MIN_MESSAGE_INTERVAL_MS = 3000;
const MAX_MESSAGE_INTERVAL_MS = 8000;
const MAX_MESSAGES_PER_MINUTE = 10;
const RECONNECT_BASE_DELAY_MS = 5000;
const MAX_QUEUE_SIZE = 50;
const QUEUE_TIMEOUT_MS = 5 * 60 * 1000;
const HEALTH_CHECK_INTERVAL_MS = 60 * 1000;

const messageCounts: Map<string, { count: number; resetAt: number }> = new Map();

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function getAuthDir(adminId: string): string {
  const dir = path.join(AUTH_DIR, adminId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getRandomBrowserFingerprint(): [string, string, string] {
  const browsers = [
    ["Chrome", "Windows", "10"],
    ["Firefox", "Windows", "11"],
    ["Edge", "Windows", "10"],
    ["Chrome", "macOS", "14"],
    ["Safari", "macOS", "14"],
    ["Chrome", "Linux", "Ubuntu"],
  ];
  
  const randomIndex = Math.floor(Math.random() * browsers.length);
  const [browser, os, version] = browsers[randomIndex];
  
  const chromeVersions = ["120.0.6099.109", "121.0.6167.85", "122.0.6261.57", "119.0.6045.160"];
  const firefoxVersions = ["121.0", "122.0", "123.0"];
  const edgeVersions = ["120.0.2210.91", "121.0.2277.83"];
  const safariVersions = ["17.2", "17.3", "16.6"];
  
  let browserVersion: string;
  switch (browser) {
    case "Chrome":
      browserVersion = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
      break;
    case "Firefox":
      browserVersion = firefoxVersions[Math.floor(Math.random() * firefoxVersions.length)];
      break;
    case "Edge":
      browserVersion = edgeVersions[Math.floor(Math.random() * edgeVersions.length)];
      break;
    case "Safari":
      browserVersion = safariVersions[Math.floor(Math.random() * safariVersions.length)];
      break;
    default:
      browserVersion = "120.0";
  }
  
  return [`AutoWebinar ${browser}`, os, browserVersion];
}

function getReconnectDelay(attempts: number): number {
  const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, attempts);
  const jitter = Math.random() * 2000;
  return Math.min(delay + jitter, 60000);
}

function checkRateLimit(adminId: string): { allowed: boolean; waitMs: number } {
  const now = Date.now();
  const record = messageCounts.get(adminId);
  
  if (!record || now > record.resetAt) {
    messageCounts.set(adminId, { count: 1, resetAt: now + 60000 });
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

async function processMessageQueue(adminId: string): Promise<void> {
  const conn = connections.get(adminId);
  if (!conn || conn.isProcessingQueue) return;
  
  conn.isProcessingQueue = true;
  
  while (conn.messageQueue.length > 0) {
    const currentConn = connections.get(adminId);
    
    if (!currentConn || currentConn.status === "banned") {
      while (conn.messageQueue.length > 0) {
        const remaining = conn.messageQueue.shift();
        remaining?.reject(new Error("Conta suspensa ou desconectada"));
      }
      break;
    }
    
    if (!currentConn.socket || currentConn.status !== "connected") {
      console.log(`[whatsapp] Queue paused for admin ${adminId} - waiting for connection (status: ${currentConn.status})`);
      conn.isProcessingQueue = false;
      return;
    }
    
    const item = conn.messageQueue[0];
    
    const rateCheck = checkRateLimit(adminId);
    if (!rateCheck.allowed) {
      console.log(`[whatsapp] Rate limit hit for admin ${adminId}, waiting ${rateCheck.waitMs}ms`);
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
      
      console.log(`[whatsapp] Message sent to ${item.phone} from admin ${adminId}`);
      item.resolve({ success: true });
    } catch (error: any) {
      console.error(`[whatsapp] Error sending message:`, error);
      
      if (isSpamOrBanError(error)) {
        console.error(`[whatsapp] SPAM/BAN detected for admin ${adminId}!`);
        conn.status = "banned";
        await storage.upsertWhatsappSession(adminId, {
          status: "banned",
          qrCode: null,
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

export async function initWhatsAppConnection(adminId: string): Promise<{
  success: boolean;
  status: string;
  qrCode?: string;
  phoneNumber?: string;
  error?: string;
}> {
  try {
    const existing = connections.get(adminId);
    
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
    
    if (existing?.status === "qr_ready" && existing.qrCode && existing.qrGeneratedAt) {
      if (Date.now() - existing.qrGeneratedAt < QR_CODE_TTL_MS) {
        return {
          success: true,
          status: "qr_ready",
          qrCode: existing.qrCode,
        };
      }
    }

    connections.set(adminId, {
      socket: null,
      qrCode: null,
      qrGeneratedAt: null,
      status: "connecting",
      phoneNumber: null,
      reconnectAttempts: existing?.reconnectAttempts || 0,
      lastMessageSentAt: 0,
      messageQueue: existing?.messageQueue || [],
      isProcessingQueue: false,
    });

    await storage.upsertWhatsappSession(adminId, {
      status: "connecting",
      qrCode: null,
    });

    const authDir = getAuthDir(adminId);
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
    });

    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      const conn = connections.get(adminId);

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { width: 256 });
          
          connections.set(adminId, {
            ...conn!,
            socket,
            qrCode: qrDataUrl,
            qrGeneratedAt: Date.now(),
            status: "qr_ready",
            phoneNumber: null,
            reconnectAttempts: 0,
          });

          await storage.upsertWhatsappSession(adminId, {
            status: "qr_ready",
            qrCode: qrDataUrl,
          });

          console.log(`[whatsapp] QR code generated for admin ${adminId}`);
        } catch (err) {
          console.error("[whatsapp] Error generating QR:", err);
        }
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        const currentConn = connections.get(adminId);
        const attempts = currentConn?.reconnectAttempts || 0;

        console.log(
          `[whatsapp] Connection closed for admin ${adminId}. Status: ${statusCode}, Reconnect: ${shouldReconnect}, Attempts: ${attempts}`
        );

        if (isSpamOrBanError(lastDisconnect?.error)) {
          console.error(`[whatsapp] BAN detected on disconnect for admin ${adminId}`);
          
          if (currentConn?.messageQueue && currentConn.messageQueue.length > 0) {
            console.log(`[whatsapp] Flushing ${currentConn.messageQueue.length} queued messages for banned admin ${adminId}`);
            while (currentConn.messageQueue.length > 0) {
              const item = currentConn.messageQueue.shift();
              item?.reject(new Error("Conta suspensa por spam. Aguarde algumas horas antes de tentar novamente."));
            }
          }
          
          connections.set(adminId, {
            ...currentConn!,
            socket: null,
            qrCode: null,
            qrGeneratedAt: null,
            status: "banned",
            reconnectAttempts: 0,
            messageQueue: [],
          });

          await storage.upsertWhatsappSession(adminId, {
            status: "banned",
            qrCode: null,
            phoneNumber: null,
          });
          return;
        }

        if (shouldReconnect && attempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = getReconnectDelay(attempts);
          console.log(`[whatsapp] Reconnecting in ${delay}ms (attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          
          connections.set(adminId, {
            ...currentConn!,
            socket: null,
            status: "connecting",
            reconnectAttempts: attempts + 1,
          });
          
          setTimeout(() => initWhatsAppConnection(adminId), delay);
        } else {
          if (currentConn?.messageQueue && currentConn.messageQueue.length > 0) {
            console.log(`[whatsapp] Flushing ${currentConn.messageQueue.length} queued messages for admin ${adminId} (connection permanently closed)`);
            while (currentConn.messageQueue.length > 0) {
              const item = currentConn.messageQueue.shift();
              item?.reject(new Error("Conexão encerrada permanentemente. Por favor, reconecte manualmente."));
            }
          }
          
          connections.set(adminId, {
            ...currentConn!,
            socket: null,
            qrCode: null,
            qrGeneratedAt: null,
            status: "disconnected",
            phoneNumber: null,
            reconnectAttempts: 0,
            messageQueue: [],
          });

          await storage.upsertWhatsappSession(adminId, {
            status: "disconnected",
            qrCode: null,
            phoneNumber: null,
          });

          if (!shouldReconnect) {
            const authDir = getAuthDir(adminId);
            if (fs.existsSync(authDir)) {
              fs.rmSync(authDir, { recursive: true });
              console.log(`[whatsapp] Auth cleared for admin ${adminId} (logged out)`);
            }
          }
        }
      }

      if (connection === "open") {
        const phoneNumber = socket.user?.id?.split(":")[0] || null;
        
        connections.set(adminId, {
          ...conn!,
          socket,
          qrCode: null,
          qrGeneratedAt: null,
          status: "connected",
          phoneNumber,
          reconnectAttempts: 0,
        });

        await storage.upsertWhatsappSession(adminId, {
          status: "connected",
          qrCode: null,
          phoneNumber,
          lastConnectedAt: new Date(),
        });

        console.log(`[whatsapp] Connected for admin ${adminId}: ${phoneNumber}`);
        
        processMessageQueue(adminId);
      }
    });

    return {
      success: true,
      status: "connecting",
    };
  } catch (error) {
    console.error("[whatsapp] Error initializing connection:", error);
    
    const existing = connections.get(adminId);
    connections.set(adminId, {
      socket: null,
      qrCode: null,
      qrGeneratedAt: null,
      status: "disconnected",
      phoneNumber: null,
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

export async function getWhatsAppStatus(adminId: string): Promise<{
  status: string;
  qrCode?: string;
  phoneNumber?: string;
  qrExpired?: boolean;
}> {
  const conn = connections.get(adminId);
  
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

  const session = await storage.getWhatsappSession(adminId);
  if (session) {
    return {
      status: session.status,
      qrCode: session.qrCode || undefined,
      phoneNumber: session.phoneNumber || undefined,
    };
  }

  return { status: "disconnected" };
}

export async function disconnectWhatsApp(adminId: string): Promise<boolean> {
  try {
    const conn = connections.get(adminId);
    
    if (conn?.messageQueue && conn.messageQueue.length > 0) {
      console.log(`[whatsapp] Flushing ${conn.messageQueue.length} queued messages before disconnect for admin ${adminId}`);
      while (conn.messageQueue.length > 0) {
        const item = conn.messageQueue.shift();
        item?.reject(new Error("WhatsApp desconectado pelo usuário."));
      }
    }
    
    if (conn?.socket) {
      await conn.socket.logout();
    }

    connections.delete(adminId);

    await storage.upsertWhatsappSession(adminId, {
      status: "disconnected",
      qrCode: null,
      phoneNumber: null,
    });

    const authDir = getAuthDir(adminId);
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true });
    }

    console.log(`[whatsapp] Disconnected for admin ${adminId}`);
    return true;
  } catch (error) {
    console.error("[whatsapp] Error disconnecting:", error);
    return false;
  }
}

export async function sendWhatsAppMessage(
  adminId: string,
  phone: string,
  message: string
): Promise<{ success: boolean; error?: string; queued?: boolean }> {
  let conn = connections.get(adminId);
  
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
      
      console.log(`[whatsapp] Message queued for admin ${adminId} (status: ${conn!.status})`);
    });
  }
  
  if (conn.status !== "connected" || !conn.socket) {
    return { success: false, error: "WhatsApp não conectado" };
  }

  return new Promise((resolve, reject) => {
    conn!.messageQueue.push({ phone, message, resolve, reject });
    processMessageQueue(adminId);
  });
}

export interface MediaMessage {
  type: "image" | "audio" | "video" | "document";
  url: string;
  caption?: string;
  fileName?: string;
  mimetype?: string;
}

export async function sendWhatsAppMediaMessage(
  adminId: string,
  phone: string,
  media: MediaMessage
): Promise<{ success: boolean; error?: string }> {
  const conn = connections.get(adminId);
  
  if (!conn) {
    return { success: false, error: "WhatsApp não inicializado" };
  }
  
  if (conn.status === "banned") {
    return { success: false, error: "Conta suspensa temporariamente. Aguarde antes de enviar mensagens." };
  }
  
  if (conn.status !== "connected" || !conn.socket) {
    return { success: false, error: "WhatsApp não conectado" };
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
          ptt: true,
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
    
    console.log(`[whatsapp] Media (${media.type}) sent to ${phone} from admin ${adminId}`);
    return { success: true };
  } catch (error: any) {
    console.error(`[whatsapp] Error sending media:`, error);
    
    if (isSpamOrBanError(error)) {
      conn.status = "banned";
      await storage.upsertWhatsappSession(adminId, {
        status: "banned",
        qrCode: null,
      });
      return { success: false, error: "Conta suspensa por spam. Aguarde antes de tentar novamente." };
    }
    
    return { success: false, error: error.message || "Erro ao enviar mídia" };
  }
}

export async function restoreWhatsAppSessions(): Promise<void> {
  try {
    const sessions = await storage.getActiveWhatsappSessions();
    
    for (const session of sessions) {
      if (session.status === "connected") {
        console.log(`[whatsapp] Restoring session for admin ${session.adminId}`);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
          await initWhatsAppConnection(session.adminId);
        } catch (error) {
          console.error(`[whatsapp] Failed to restore session for admin ${session.adminId}:`, error);
          
          await storage.upsertWhatsappSession(session.adminId, {
            status: "disconnected",
            qrCode: null,
          });
        }
      }
    }
    
    console.log(`[whatsapp] Session restoration complete. Restored ${sessions.length} sessions.`);
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

export async function clearBanStatus(adminId: string): Promise<boolean> {
  try {
    const conn = connections.get(adminId);
    
    if (conn) {
      if (conn.messageQueue && conn.messageQueue.length > 0) {
        console.log(`[whatsapp] Flushing ${conn.messageQueue.length} queued messages before clearing ban for admin ${adminId}`);
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
      
      connections.delete(adminId);
    }
    
    const authDir = getAuthDir(adminId);
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true });
      console.log(`[whatsapp] Auth directory cleared for admin ${adminId}`);
    }
    
    messageCounts.delete(adminId);
    
    await storage.upsertWhatsappSession(adminId, {
      status: "disconnected",
      qrCode: null,
      phoneNumber: null,
    });
    
    console.log(`[whatsapp] Ban status and session data cleared for admin ${adminId}`);
    return true;
  } catch (error) {
    console.error("[whatsapp] Error clearing ban status:", error);
    return false;
  }
}

async function performHealthCheck(): Promise<void> {
  console.log(`[whatsapp] Running health check for ${connections.size} connections`);
  
  const entries = Array.from(connections.entries());
  for (const [adminId, conn] of entries) {
    try {
      if (conn.status === "qr_ready" && conn.qrGeneratedAt) {
        const qrAge = Date.now() - conn.qrGeneratedAt;
        if (qrAge > QR_CODE_TTL_MS) {
          console.log(`[whatsapp] QR expired for admin ${adminId}, regenerating...`);
          
          if (conn.socket) {
            try {
              conn.socket.end(undefined);
            } catch (e) {
            }
          }
          
          connections.set(adminId, {
            ...conn,
            socket: null,
            qrCode: null,
            qrGeneratedAt: null,
            status: "disconnected",
          });
          
          await initWhatsAppConnection(adminId);
        }
      }
      
      if (conn.status === "connected" && conn.socket) {
        try {
          const ws = conn.socket.ws as any;
          const state = ws?.readyState;
          if (state !== undefined && state !== 1) {
            console.log(`[whatsapp] Socket unhealthy for admin ${adminId} (state: ${state}), attempting recovery...`);
            
            connections.set(adminId, {
              ...conn,
              socket: null,
              status: "disconnected",
              reconnectAttempts: 0,
            });
            
            await storage.upsertWhatsappSession(adminId, {
              status: "disconnected",
            });
            
            setTimeout(() => {
              console.log(`[whatsapp] Auto-recovering connection for admin ${adminId}`);
              initWhatsAppConnection(adminId).catch(err => {
                console.error(`[whatsapp] Auto-recovery failed for admin ${adminId}:`, err);
              });
            }, 2000);
          }
        } catch (e) {
          console.log(`[whatsapp] Socket check failed for admin ${adminId}:`, e);
        }
      }
      
      const dbSession = await storage.getWhatsappSession(adminId);
      if (dbSession) {
        if (dbSession.status === "connected" && conn.status !== "connected") {
          console.log(`[whatsapp] DB/memory mismatch for admin ${adminId}: DB=${dbSession.status}, MEM=${conn.status}`);
          await storage.upsertWhatsappSession(adminId, {
            status: conn.status,
          });
        }
      }
      
      if ((conn.status === "disconnected" || conn.status === "banned") && conn.messageQueue.length > 0) {
        const errorMsg = conn.status === "banned" 
          ? "Conta suspensa por spam. Aguarde antes de tentar novamente."
          : "WhatsApp desconectado. Por favor, reconecte para enviar mensagens.";
        console.log(`[whatsapp] Health check: flushing ${conn.messageQueue.length} stale messages for ${conn.status} admin ${adminId}`);
        while (conn.messageQueue.length > 0) {
          const item = conn.messageQueue.shift();
          item?.reject(new Error(errorMsg));
        }
      }
    } catch (error) {
      console.error(`[whatsapp] Health check error for admin ${adminId}:`, error);
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
