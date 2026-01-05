import { useEffect, useCallback, useRef } from "react";

declare global {
  interface Window {
    fbq: any;
    _fbq: any;
    gtag: any;
    dataLayer: any[];
  }
}

interface UseWebinarTrackingOptions {
  facebookPixelId?: string | null;
  googleTagId?: string | null;
  webinarName?: string;
  webinarSlug?: string;
}

export function useWebinarTracking(options: UseWebinarTrackingOptions) {
  const { facebookPixelId, googleTagId, webinarName, webinarSlug } = options;
  const initializedPixels = useRef<Set<string>>(new Set());
  const gtagInitialized = useRef<Set<string>>(new Set());

  const hasPixel = !!facebookPixelId && facebookPixelId.trim() !== "";
  const hasGtag = !!googleTagId && googleTagId.trim() !== "";

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
      console.log(`[webinar-tracking] Facebook Pixel ${facebookPixelId} initialized for webinar`);
    }

    window.fbq("track", "PageView");
  }, [facebookPixelId, hasPixel]);

  useEffect(() => {
    if (!hasGtag) return;

    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) {
      window.gtag = function() {
        window.dataLayer.push(arguments);
      };
    }

    if (!gtagInitialized.current.has(googleTagId!)) {
      window.gtag('js', new Date());
      window.gtag('config', googleTagId);

      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${googleTagId}`;
      document.head.appendChild(script);
      gtagInitialized.current.add(googleTagId!);
      console.log(`[webinar-tracking] Google Tag ${googleTagId} initialized for webinar`);
    }
  }, [googleTagId, hasGtag]);

  const trackEvent = useCallback(
    (eventName: string, params?: Record<string, any>) => {
      if (hasPixel && window.fbq) {
        window.fbq("track", eventName, params);
      }
      if (hasGtag && window.gtag) {
        window.gtag("event", eventName, params);
      }
    },
    [hasPixel, hasGtag]
  );

  const trackPageView = useCallback(() => {
    if (hasPixel && window.fbq) {
      window.fbq("track", "PageView");
    }
    if (hasGtag && window.gtag) {
      window.gtag("event", "page_view", {
        page_title: webinarName,
        page_location: window.location.href,
      });
    }
  }, [hasPixel, hasGtag, webinarName]);

  const trackWebinarView = useCallback(() => {
    trackEvent("ViewContent", {
      content_name: webinarName,
      content_type: "webinar",
      content_ids: [webinarSlug],
    });
  }, [trackEvent, webinarName, webinarSlug]);

  const trackRegistration = useCallback(
    (userData?: { email?: string; phone?: string; name?: string }) => {
      const params: Record<string, any> = {
        content_name: webinarName,
        content_type: "webinar",
        content_ids: [webinarSlug],
      };
      
      if (hasPixel && window.fbq) {
        if (userData) {
          const userDataFormatted: Record<string, string> = {};
          if (userData.email) userDataFormatted.em = userData.email.toLowerCase().trim();
          if (userData.phone) userDataFormatted.ph = userData.phone.replace(/\D/g, '');
          if (userData.name) {
            const nameParts = userData.name.trim().split(' ');
            if (nameParts[0]) userDataFormatted.fn = nameParts[0].toLowerCase();
            if (nameParts.length > 1) userDataFormatted.ln = nameParts[nameParts.length - 1].toLowerCase();
          }
          window.fbq("track", "CompleteRegistration", { ...params, user_data: userDataFormatted });
        } else {
          window.fbq("track", "CompleteRegistration", params);
        }
      }
      
      if (hasGtag && window.gtag) {
        window.gtag("event", "sign_up", {
          method: "webinar_registration",
          ...params,
          ...(userData?.email && { user_data: { email: userData.email.toLowerCase() } }),
        });
      }
    },
    [hasPixel, hasGtag, webinarName, webinarSlug]
  );

  const trackVideoStart = useCallback(() => {
    trackEvent("Lead", {
      content_name: webinarName,
      content_category: "webinar_video_start",
    });
    if (hasGtag && window.gtag) {
      window.gtag("event", "video_start", {
        video_title: webinarName,
      });
    }
  }, [trackEvent, hasGtag, webinarName]);

  const trackVideoProgress = useCallback(
    (percent: number) => {
      if (hasGtag && window.gtag) {
        window.gtag("event", "video_progress", {
          video_title: webinarName,
          video_percent: percent,
        });
      }
    },
    [hasGtag, webinarName]
  );

  const trackVideoComplete = useCallback(() => {
    trackEvent("ViewContent", {
      content_name: webinarName,
      content_category: "webinar_video_complete",
    });
    if (hasGtag && window.gtag) {
      window.gtag("event", "video_complete", {
        video_title: webinarName,
      });
    }
  }, [trackEvent, hasGtag, webinarName]);

  const trackOfferClick = useCallback(
    (offerUrl?: string) => {
      trackEvent("InitiateCheckout", {
        content_name: webinarName,
        content_type: "webinar_offer",
      });
      if (hasGtag && window.gtag) {
        window.gtag("event", "begin_checkout", {
          items: [{ item_name: webinarName }],
        });
      }
    },
    [trackEvent, hasGtag, webinarName]
  );

  const trackChatMessage = useCallback(() => {
    if (hasGtag && window.gtag) {
      window.gtag("event", "engagement", {
        engagement_type: "chat_message",
        content_name: webinarName,
      });
    }
  }, [hasGtag, webinarName]);

  return {
    trackEvent,
    trackPageView,
    trackWebinarView,
    trackRegistration,
    trackVideoStart,
    trackVideoProgress,
    trackVideoComplete,
    trackOfferClick,
    trackChatMessage,
    isConfigured: hasPixel || hasGtag,
    hasPixel,
    hasGtag,
  };
}
