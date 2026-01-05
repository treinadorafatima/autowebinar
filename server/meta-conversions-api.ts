import crypto from "crypto";

interface MetaEventData {
  eventName: string;
  eventTime?: number;
  eventSourceUrl?: string;
  actionSource?: string;
  userData?: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    state?: string;
    clientIpAddress?: string;
    clientUserAgent?: string;
    fbp?: string;
    fbc?: string;
  };
  customData?: Record<string, any>;
}

interface MetaConversionsConfig {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
}

function sha256Hash(value: string): string {
  return crypto.createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("55")) {
    return cleaned;
  }
  return `55${cleaned}`;
}

function hashUserData(userData: MetaEventData["userData"]): Record<string, string | undefined> {
  if (!userData) return {};
  
  const hashed: Record<string, string | undefined> = {};
  
  if (userData.email) {
    hashed.em = sha256Hash(userData.email);
  }
  if (userData.phone) {
    hashed.ph = sha256Hash(normalizePhone(userData.phone));
  }
  if (userData.firstName) {
    hashed.fn = sha256Hash(userData.firstName);
  }
  if (userData.lastName) {
    hashed.ln = sha256Hash(userData.lastName);
  }
  if (userData.city) {
    hashed.ct = sha256Hash(userData.city);
  }
  if (userData.state) {
    hashed.st = sha256Hash(userData.state);
  }
  if (userData.clientIpAddress) {
    hashed.client_ip_address = userData.clientIpAddress;
  }
  if (userData.clientUserAgent) {
    hashed.client_user_agent = userData.clientUserAgent;
  }
  if (userData.fbp) {
    hashed.fbp = userData.fbp;
  }
  if (userData.fbc) {
    hashed.fbc = userData.fbc;
  }
  
  return hashed;
}

export async function sendMetaConversionEvent(
  config: MetaConversionsConfig,
  eventData: MetaEventData & { eventId?: string }
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  const { pixelId, accessToken, testEventCode } = config;
  
  if (!pixelId || !accessToken) {
    return { success: false, error: "Missing pixelId or accessToken" };
  }
  
  const eventId = eventData.eventId || crypto.randomUUID();
  const eventTime = eventData.eventTime || Math.floor(Date.now() / 1000);
  
  const payload: any = {
    data: [
      {
        event_name: eventData.eventName,
        event_time: eventTime,
        event_id: eventId,
        action_source: eventData.actionSource || "website",
        event_source_url: eventData.eventSourceUrl,
        user_data: hashUserData(eventData.userData),
        custom_data: eventData.customData || {},
      },
    ],
  };
  
  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }
  
  const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      console.error("[meta-capi] Error sending event:", result);
      return { 
        success: false, 
        error: result.error?.message || "Unknown error",
        eventId 
      };
    }
    
    console.log(`[meta-capi] Event ${eventData.eventName} sent successfully. EventID: ${eventId}`);
    return { success: true, eventId };
  } catch (error: any) {
    console.error("[meta-capi] Network error:", error.message);
    return { success: false, error: error.message, eventId };
  }
}

export async function sendPageViewEvent(
  config: MetaConversionsConfig,
  options: {
    sourceUrl: string;
    userData?: MetaEventData["userData"];
  }
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  return sendMetaConversionEvent(config, {
    eventName: "PageView",
    eventSourceUrl: options.sourceUrl,
    userData: options.userData,
  });
}

export async function sendLeadEvent(
  config: MetaConversionsConfig,
  options: {
    sourceUrl: string;
    userData?: MetaEventData["userData"];
    contentName?: string;
    contentType?: string;
  }
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  return sendMetaConversionEvent(config, {
    eventName: "Lead",
    eventSourceUrl: options.sourceUrl,
    userData: options.userData,
    customData: {
      content_name: options.contentName,
      content_type: options.contentType || "webinar",
    },
  });
}

export async function sendInitiateCheckoutEvent(
  config: MetaConversionsConfig,
  options: {
    sourceUrl: string;
    userData?: MetaEventData["userData"];
    contentName?: string;
    value?: number;
    currency?: string;
  }
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  return sendMetaConversionEvent(config, {
    eventName: "InitiateCheckout",
    eventSourceUrl: options.sourceUrl,
    userData: options.userData,
    customData: {
      content_name: options.contentName,
      content_type: "webinar_offer",
      value: options.value,
      currency: options.currency || "BRL",
    },
  });
}

export async function sendCustomEvent(
  config: MetaConversionsConfig,
  options: {
    eventName: string;
    eventId?: string;
    eventTime?: number;
    sourceUrl: string;
    userData?: MetaEventData["userData"];
    customData?: Record<string, any>;
  }
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  return sendMetaConversionEvent(config, {
    eventName: options.eventName,
    eventId: options.eventId,
    eventTime: options.eventTime,
    eventSourceUrl: options.sourceUrl,
    userData: options.userData,
    customData: options.customData,
  });
}
