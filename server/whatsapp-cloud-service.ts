import { storage } from "./storage";

const CLOUD_API_BASE_URL = "https://graph.facebook.com";

export interface CloudApiCredentials {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId?: string;
  webhookVerifyToken?: string;
  apiVersion?: string;
}

export interface CloudApiMessage {
  type: "text" | "image" | "audio" | "video" | "document";
  text?: string;
  mediaUrl?: string;
  caption?: string;
  fileName?: string;
}

export interface CloudApiSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface CloudApiStatus {
  connected: boolean;
  phoneNumber?: string;
  displayName?: string;
  error?: string;
}

function getApiVersion(account: { cloudApiVersion?: string | null }): string {
  return account.cloudApiVersion || "v20.0";
}

async function makeCloudApiRequest(
  endpoint: string,
  accessToken: string,
  method: "GET" | "POST" = "POST",
  body?: Record<string, unknown>
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    };

    if (body && method === "POST") {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(endpoint, options);
    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data?.error?.message || `HTTP ${response.status}`;
      console.error("[cloud-api] Request failed:", errorMessage, data);
      return { success: false, error: errorMessage };
    }

    return { success: true, data };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[cloud-api] Request error:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

export async function validateCloudApiCredentials(
  credentials: CloudApiCredentials
): Promise<{ valid: boolean; phoneNumber?: string; displayName?: string; error?: string }> {
  const apiVersion = credentials.apiVersion || "v20.0";
  const endpoint = `${CLOUD_API_BASE_URL}/${apiVersion}/${credentials.phoneNumberId}`;

  const result = await makeCloudApiRequest(endpoint, credentials.accessToken, "GET");

  if (!result.success) {
    return { valid: false, error: result.error };
  }

  const data = result.data as { display_phone_number?: string; verified_name?: string };
  return {
    valid: true,
    phoneNumber: data?.display_phone_number,
    displayName: data?.verified_name,
  };
}

export async function getCloudApiStatus(accountId: string): Promise<CloudApiStatus> {
  const account = await storage.getWhatsappAccountById(accountId);

  if (!account) {
    return { connected: false, error: "Conta não encontrada" };
  }

  if (account.provider !== "cloud_api") {
    return { connected: false, error: "Conta não configurada para Cloud API" };
  }

  if (!account.cloudApiAccessToken || !account.cloudApiPhoneNumberId) {
    return { connected: false, error: "Credenciais da Cloud API não configuradas" };
  }

  const validation = await validateCloudApiCredentials({
    accessToken: account.cloudApiAccessToken,
    phoneNumberId: account.cloudApiPhoneNumberId,
    apiVersion: account.cloudApiVersion || undefined,
  });

  if (!validation.valid) {
    return { connected: false, error: validation.error };
  }

  return {
    connected: true,
    phoneNumber: validation.phoneNumber,
    displayName: validation.displayName,
  };
}

function formatPhoneNumber(phone: string): string {
  let formatted = phone.replace(/\D/g, "");
  if (!formatted.startsWith("55")) {
    formatted = "55" + formatted;
  }
  return formatted;
}

export async function sendCloudApiTextMessage(
  accountId: string,
  phone: string,
  text: string
): Promise<CloudApiSendResult> {
  const account = await storage.getWhatsappAccountById(accountId);

  if (!account) {
    return { success: false, error: "Conta não encontrada" };
  }

  if (account.provider !== "cloud_api") {
    return { success: false, error: "Conta não configurada para Cloud API" };
  }

  if (!account.cloudApiAccessToken || !account.cloudApiPhoneNumberId) {
    return { success: false, error: "Credenciais da Cloud API não configuradas" };
  }

  const apiVersion = getApiVersion(account);
  const endpoint = `${CLOUD_API_BASE_URL}/${apiVersion}/${account.cloudApiPhoneNumberId}/messages`;
  const formattedPhone = formatPhoneNumber(phone);

  const body = {
    messaging_product: "whatsapp",
    to: formattedPhone,
    type: "text",
    text: { body: text },
  };

  const result = await makeCloudApiRequest(endpoint, account.cloudApiAccessToken, "POST", body);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const data = result.data as { messages?: Array<{ id: string }> };
  const messageId = data?.messages?.[0]?.id;

  console.log(`[cloud-api] Message sent to ${formattedPhone} from account ${accountId}, messageId: ${messageId}`);

  return { success: true, messageId };
}

export async function sendCloudApiMediaMessage(
  accountId: string,
  phone: string,
  media: CloudApiMessage
): Promise<CloudApiSendResult> {
  const account = await storage.getWhatsappAccountById(accountId);

  if (!account) {
    return { success: false, error: "Conta não encontrada" };
  }

  if (account.provider !== "cloud_api") {
    return { success: false, error: "Conta não configurada para Cloud API" };
  }

  if (!account.cloudApiAccessToken || !account.cloudApiPhoneNumberId) {
    return { success: false, error: "Credenciais da Cloud API não configuradas" };
  }

  const apiVersion = getApiVersion(account);
  const endpoint = `${CLOUD_API_BASE_URL}/${apiVersion}/${account.cloudApiPhoneNumberId}/messages`;
  const formattedPhone = formatPhoneNumber(phone);

  let body: Record<string, unknown>;

  switch (media.type) {
    case "image":
      body = {
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "image",
        image: {
          link: media.mediaUrl,
          caption: media.caption || undefined,
        },
      };
      break;

    case "audio":
      body = {
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "audio",
        audio: {
          link: media.mediaUrl,
        },
      };
      break;

    case "video":
      body = {
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "video",
        video: {
          link: media.mediaUrl,
          caption: media.caption || undefined,
        },
      };
      break;

    case "document":
      body = {
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "document",
        document: {
          link: media.mediaUrl,
          filename: media.fileName || "document",
          caption: media.caption || undefined,
        },
      };
      break;

    default:
      return { success: false, error: `Tipo de mídia não suportado: ${media.type}` };
  }

  const result = await makeCloudApiRequest(endpoint, account.cloudApiAccessToken, "POST", body);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const data = result.data as { messages?: Array<{ id: string }> };
  const messageId = data?.messages?.[0]?.id;

  console.log(`[cloud-api] Media (${media.type}) sent to ${formattedPhone} from account ${accountId}, messageId: ${messageId}`);

  return { success: true, messageId };
}

export async function sendCloudApiMessage(
  accountId: string,
  phone: string,
  message: CloudApiMessage
): Promise<CloudApiSendResult> {
  if (message.type === "text" && message.text) {
    return sendCloudApiTextMessage(accountId, phone, message.text);
  }

  return sendCloudApiMediaMessage(accountId, phone, message);
}

export async function sendCloudApiTemplateMessage(
  accountId: string,
  phone: string,
  templateName: string,
  languageCode: string = "pt_BR",
  components?: Array<{
    type: "header" | "body" | "button";
    parameters?: Array<{ type: string; text?: string; image?: { link: string } }>;
  }>
): Promise<CloudApiSendResult> {
  const account = await storage.getWhatsappAccountById(accountId);

  if (!account) {
    return { success: false, error: "Conta não encontrada" };
  }

  if (account.provider !== "cloud_api") {
    return { success: false, error: "Conta não configurada para Cloud API" };
  }

  if (!account.cloudApiAccessToken || !account.cloudApiPhoneNumberId) {
    return { success: false, error: "Credenciais da Cloud API não configuradas" };
  }

  const apiVersion = getApiVersion(account);
  const endpoint = `${CLOUD_API_BASE_URL}/${apiVersion}/${account.cloudApiPhoneNumberId}/messages`;
  const formattedPhone = formatPhoneNumber(phone);

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: formattedPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: components || [],
    },
  };

  const result = await makeCloudApiRequest(endpoint, account.cloudApiAccessToken, "POST", body);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const data = result.data as { messages?: Array<{ id: string }> };
  const messageId = data?.messages?.[0]?.id;

  console.log(`[cloud-api] Template ${templateName} sent to ${formattedPhone} from account ${accountId}, messageId: ${messageId}`);

  return { success: true, messageId };
}

export function verifyWebhook(
  verifyToken: string,
  mode: string,
  token: string,
  challenge: string
): { valid: boolean; challenge?: string } {
  if (mode === "subscribe" && token === verifyToken) {
    return { valid: true, challenge };
  }
  return { valid: false };
}

export interface IncomingWebhookMessage {
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string };
  document?: { id: string; mime_type: string; filename: string };
}

export interface WebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: { phone_number_id: string; display_phone_number: string };
      contacts?: Array<{ wa_id: string; profile: { name: string } }>;
      messages?: IncomingWebhookMessage[];
      statuses?: Array<{
        id: string;
        status: "sent" | "delivered" | "read" | "failed";
        timestamp: string;
        recipient_id: string;
        errors?: Array<{ code: number; title: string }>;
      }>;
    };
    field: string;
  }>;
}

export function parseWebhookPayload(body: {
  object: string;
  entry: WebhookEntry[];
}): {
  messages: Array<{
    phoneNumberId: string;
    from: string;
    fromName?: string;
    message: IncomingWebhookMessage;
  }>;
  statuses: Array<{
    phoneNumberId: string;
    messageId: string;
    status: string;
    recipientId: string;
    timestamp: string;
    errors?: Array<{ code: number; title: string }>;
  }>;
} {
  const messages: Array<{
    phoneNumberId: string;
    from: string;
    fromName?: string;
    message: IncomingWebhookMessage;
  }> = [];
  const statuses: Array<{
    phoneNumberId: string;
    messageId: string;
    status: string;
    recipientId: string;
    timestamp: string;
    errors?: Array<{ code: number; title: string }>;
  }> = [];

  if (body.object !== "whatsapp_business_account") {
    return { messages, statuses };
  }

  for (const entry of body.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      const value = change.value;
      const phoneNumberId = value.metadata.phone_number_id;
      const contacts = value.contacts || [];

      if (value.messages) {
        for (const msg of value.messages) {
          const contact = contacts.find((c) => c.wa_id === msg.from);
          messages.push({
            phoneNumberId,
            from: msg.from,
            fromName: contact?.profile?.name,
            message: msg,
          });
        }
      }

      if (value.statuses) {
        for (const status of value.statuses) {
          statuses.push({
            phoneNumberId,
            messageId: status.id,
            status: status.status,
            recipientId: status.recipient_id,
            timestamp: status.timestamp,
            errors: status.errors,
          });
        }
      }
    }
  }

  return { messages, statuses };
}
