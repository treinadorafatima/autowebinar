import { useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

declare global {
  interface Window {
    fbq: any;
    _fbq: any;
  }
}

interface PixelConfig {
  facebookPixelId?: string;
  googleAdsConversionId?: string;
}

export function usePixel() {
  const { data: configs } = useQuery<Record<string, string>>({
    queryKey: ["/api/checkout/config/public"],
    staleTime: 1000 * 60 * 5,
  });

  const facebookPixelId = configs?.FACEBOOK_PIXEL_ID;
  const googleAdsId = configs?.GOOGLE_ADS_CONVERSION_ID;

  useEffect(() => {
    if (!facebookPixelId) return;

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

    window.fbq("init", facebookPixelId);
    window.fbq("track", "PageView");
  }, [facebookPixelId]);

  const trackEvent = useCallback(
    (
      eventName: string,
      params?: Record<string, any>,
      options?: { serverSide?: boolean }
    ) => {
      if (facebookPixelId && window.fbq) {
        window.fbq("track", eventName, params);
      }

      if (options?.serverSide) {
        fetch("/api/pixel/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventName, params }),
        }).catch(console.error);
      }
    },
    [facebookPixelId]
  );

  const trackPageView = useCallback(() => {
    if (facebookPixelId && window.fbq) {
      window.fbq("track", "PageView");
    }
  }, [facebookPixelId]);

  const trackInitiateCheckout = useCallback(
    (params: { value?: number; currency?: string; content_name?: string }) => {
      trackEvent("InitiateCheckout", {
        value: params.value,
        currency: params.currency || "BRL",
        content_name: params.content_name,
      });
    },
    [trackEvent]
  );

  const trackPurchase = useCallback(
    (params: {
      value: number;
      currency?: string;
      content_name?: string;
      content_ids?: string[];
      pagamentoId?: string;
    }) => {
      trackEvent(
        "Purchase",
        {
          value: params.value,
          currency: params.currency || "BRL",
          content_name: params.content_name,
          content_ids: params.content_ids,
        },
        { serverSide: true }
      );
    },
    [trackEvent]
  );

  const trackLead = useCallback(
    (params?: { content_name?: string; value?: number }) => {
      trackEvent("Lead", params);
    },
    [trackEvent]
  );

  const trackViewContent = useCallback(
    (params: { content_name?: string; content_ids?: string[]; value?: number }) => {
      trackEvent("ViewContent", {
        ...params,
        currency: "BRL",
      });
    },
    [trackEvent]
  );

  return {
    trackEvent,
    trackPageView,
    trackInitiateCheckout,
    trackPurchase,
    trackLead,
    trackViewContent,
    isConfigured: !!facebookPixelId,
  };
}
