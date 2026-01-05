import { useEffect, useCallback, useRef } from "react";

declare global {
  interface Window {
    fbq: any;
    _fbq: any;
    gtag: any;
    dataLayer: any[];
  }
}

interface GoogleAdsConversion {
  event: string;
  conversionId: string;
  conversionLabel: string;
}

interface UseWebinarTrackingOptions {
  webinarId?: string | null;
  facebookPixelId?: string | null;
  metaCapiEnabled?: boolean;
  googleAnalyticsId?: string | null;
  googleAdsConversions?: string | null;
  webinarName?: string;
  webinarSlug?: string;
}

function getCookie(name: string): string | undefined {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
  return undefined;
}

async function sendServerEvent(
  webinarId: string,
  eventName: string,
  userData?: { email?: string; phone?: string; firstName?: string; lastName?: string; city?: string; state?: string },
  customData?: Record<string, any>
): Promise<void> {
  try {
    const eventId = crypto.randomUUID();
    const eventTime = Math.floor(Date.now() / 1000);
    
    await fetch(`/api/webinars/${webinarId}/track-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName,
        eventId,
        eventTime,
        sourceUrl: window.location.href,
        userData: {
          ...userData,
          fbp: getCookie("_fbp"),
          fbc: getCookie("_fbc"),
        },
        customData,
      }),
    });
    console.log(`[webinar-tracking] Server-side ${eventName} sent`);
  } catch (error) {
    console.warn(`[webinar-tracking] Server-side ${eventName} failed:`, error);
  }
}

export function useWebinarTracking(options: UseWebinarTrackingOptions) {
  const { 
    webinarId,
    facebookPixelId, 
    metaCapiEnabled,
    googleAnalyticsId, 
    googleAdsConversions,
    webinarName, 
    webinarSlug 
  } = options;
  
  const initializedPixels = useRef<Set<string>>(new Set());
  const gtagInitialized = useRef<Set<string>>(new Set());
  const adsScriptsLoaded = useRef<Set<string>>(new Set());

  const hasPixel = !!facebookPixelId && facebookPixelId.trim() !== "";
  const hasGA4 = !!googleAnalyticsId && googleAnalyticsId.trim() !== "";
  const hasServerTracking = !!webinarId && !!metaCapiEnabled;
  
  let parsedAdsConversions: GoogleAdsConversion[] = [];
  try {
    parsedAdsConversions = JSON.parse(googleAdsConversions || "[]");
  } catch {
    parsedAdsConversions = [];
  }
  const hasGoogleAds = parsedAdsConversions.length > 0 && parsedAdsConversions.some(c => c.conversionId);

  useEffect(() => {
    if (!hasPixel) return;

    if (!window.fbq) {
      const n = (window.fbq = function (...args: any[]) {
        n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
      }) as any;
      if (!window._fbq) window._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];

      const script = document.createElement("script");
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(script);
    }

    if (!initializedPixels.current.has(facebookPixelId!)) {
      window.fbq("init", facebookPixelId);
      initializedPixels.current.add(facebookPixelId!);
      console.log(`[webinar-tracking] Facebook Pixel ${facebookPixelId} initialized`);
    }
  }, [facebookPixelId, hasPixel]);

  useEffect(() => {
    if (!hasGA4) return;

    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) {
      window.gtag = function() {
        window.dataLayer.push(arguments);
      };
    }

    if (!gtagInitialized.current.has(googleAnalyticsId!)) {
      window.gtag('js', new Date());
      window.gtag('config', googleAnalyticsId);

      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`;
      document.head.appendChild(script);
      gtagInitialized.current.add(googleAnalyticsId!);
      console.log(`[webinar-tracking] Google Analytics ${googleAnalyticsId} initialized`);
    }
  }, [googleAnalyticsId, hasGA4]);

  useEffect(() => {
    if (!hasGoogleAds) return;

    parsedAdsConversions.forEach(conv => {
      if (conv.conversionId && !adsScriptsLoaded.current.has(conv.conversionId)) {
        window.dataLayer = window.dataLayer || [];
        if (!window.gtag) {
          window.gtag = function() {
            window.dataLayer.push(arguments);
          };
        }
        
        const script = document.createElement("script");
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${conv.conversionId}`;
        document.head.appendChild(script);
        
        window.gtag('js', new Date());
        window.gtag('config', conv.conversionId);
        adsScriptsLoaded.current.add(conv.conversionId);
        console.log(`[webinar-tracking] Google Ads ${conv.conversionId} initialized`);
      }
    });
  }, [googleAdsConversions, hasGoogleAds]);

  const trackPageView = useCallback(() => {
    if (hasPixel && window.fbq) {
      window.fbq("track", "PageView");
      console.log("[webinar-tracking] FB PageView fired");
    }
    if (hasGA4 && window.gtag) {
      window.gtag("event", "page_view", {
        page_title: webinarName,
        page_location: window.location.href,
      });
      console.log("[webinar-tracking] GA4 page_view fired");
    }
    if (hasServerTracking && webinarId) {
      sendServerEvent(webinarId, "PageView");
    }
  }, [hasPixel, hasGA4, hasServerTracking, webinarId, webinarName]);

  const trackLead = useCallback(
    (userData?: { email?: string; phone?: string; name?: string }) => {
      const params: Record<string, any> = {
        content_name: webinarName,
        content_type: "webinar",
        content_ids: [webinarSlug],
      };
      
      const nameParts = userData?.name?.trim().split(' ') || [];
      const firstName = nameParts[0] || "";
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
      
      if (hasPixel && window.fbq) {
        if (userData) {
          const userDataFormatted: Record<string, string> = {};
          if (userData.email) userDataFormatted.em = userData.email.toLowerCase().trim();
          if (userData.phone) userDataFormatted.ph = userData.phone.replace(/\D/g, '');
          if (firstName) userDataFormatted.fn = firstName.toLowerCase();
          if (lastName) userDataFormatted.ln = lastName.toLowerCase();
          window.fbq("track", "Lead", { ...params, user_data: userDataFormatted });
        } else {
          window.fbq("track", "Lead", params);
        }
        console.log("[webinar-tracking] FB Lead fired");
      }
      
      if (hasGA4 && window.gtag) {
        window.gtag("event", "generate_lead", {
          currency: "BRL",
          value: 0,
          ...params,
        });
        console.log("[webinar-tracking] GA4 generate_lead fired");
      }

      const leadConversion = parsedAdsConversions.find(c => c.event === "lead");
      if (leadConversion && leadConversion.conversionId && leadConversion.conversionLabel && window.gtag) {
        window.gtag("event", "conversion", {
          send_to: `${leadConversion.conversionId}/${leadConversion.conversionLabel}`,
        });
        console.log(`[webinar-tracking] Google Ads conversion fired: ${leadConversion.conversionId}/${leadConversion.conversionLabel}`);
      }

      if (hasServerTracking && webinarId) {
        sendServerEvent(webinarId, "Lead", {
          email: userData?.email,
          phone: userData?.phone,
          firstName,
          lastName,
        });
      }
    },
    [hasPixel, hasGA4, hasServerTracking, webinarId, webinarName, webinarSlug, parsedAdsConversions]
  );

  const trackChatMessage = useCallback(() => {
    if (hasPixel && window.fbq) {
      window.fbq("trackCustom", "ChatMessage", {
        content_name: webinarName,
        content_type: "webinar_chat",
      });
      console.log("[webinar-tracking] FB ChatMessage (custom) fired");
    }
    if (hasGA4 && window.gtag) {
      window.gtag("event", "webinar_chat", {
        webinar_name: webinarName,
        webinar_slug: webinarSlug,
      });
      console.log("[webinar-tracking] GA4 webinar_chat fired");
    }
    if (hasServerTracking && webinarId) {
      sendServerEvent(webinarId, "ChatMessage");
    }
  }, [hasPixel, hasGA4, hasServerTracking, webinarId, webinarName, webinarSlug]);

  const trackInitiateCheckout = useCallback(
    (offerUrl?: string) => {
      if (hasPixel && window.fbq) {
        window.fbq("track", "InitiateCheckout", {
          content_name: webinarName,
          content_type: "webinar_offer",
        });
        console.log("[webinar-tracking] FB InitiateCheckout fired");
      }
      if (hasGA4 && window.gtag) {
        window.gtag("event", "begin_checkout", {
          items: [{ item_name: webinarName }],
        });
        console.log("[webinar-tracking] GA4 begin_checkout fired");
      }

      const checkoutConversion = parsedAdsConversions.find(c => c.event === "initiate_checkout");
      if (checkoutConversion && checkoutConversion.conversionId && checkoutConversion.conversionLabel && window.gtag) {
        window.gtag("event", "conversion", {
          send_to: `${checkoutConversion.conversionId}/${checkoutConversion.conversionLabel}`,
        });
        console.log(`[webinar-tracking] Google Ads conversion fired: ${checkoutConversion.conversionId}/${checkoutConversion.conversionLabel}`);
      }

      if (hasServerTracking && webinarId) {
        sendServerEvent(webinarId, "InitiateCheckout", undefined, { offer_url: offerUrl });
      }
    },
    [hasPixel, hasGA4, hasServerTracking, webinarId, webinarName, parsedAdsConversions]
  );

  const trackCustomEvent = useCallback(
    (eventName: string, params?: Record<string, any>) => {
      if (hasPixel && window.fbq) {
        window.fbq("trackCustom", eventName, params);
      }
      if (hasGA4 && window.gtag) {
        window.gtag("event", eventName, params);
      }
    },
    [hasPixel, hasGA4]
  );

  return {
    trackPageView,
    trackLead,
    trackChatMessage,
    trackInitiateCheckout,
    trackCustomEvent,
    isConfigured: hasPixel || hasGA4 || hasGoogleAds,
    hasPixel,
    hasGA4,
    hasGoogleAds,
    hasServerTracking,
  };
}
