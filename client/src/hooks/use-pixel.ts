import { useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

declare global {
  interface Window {
    fbq: any;
    _fbq: any;
  }
}

interface UsePixelOptions {
  affiliateCode?: string | null;
}

export function usePixel(options?: UsePixelOptions) {
  const { affiliateCode } = options || {};
  const initializedPixels = useRef<Set<string>>(new Set());

  const { data: configs } = useQuery<Record<string, string>>({
    queryKey: ["/api/checkout/config/public"],
    staleTime: 1000 * 60 * 5,
  });

  const { data: affiliatePixelData } = useQuery<{ metaPixelId: string | null }>({
    queryKey: ["/api/affiliate-pixel", affiliateCode],
    enabled: !!affiliateCode,
    staleTime: 1000 * 60 * 5,
  });

  const globalPixelId = configs?.FACEBOOK_PIXEL_ID;
  const affiliatePixelId = affiliatePixelData?.metaPixelId;

  const pixelIds = [globalPixelId, affiliatePixelId].filter(Boolean) as string[];

  useEffect(() => {
    if (pixelIds.length === 0) return;

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

    pixelIds.forEach((pixelId) => {
      if (!initializedPixels.current.has(pixelId)) {
        window.fbq("init", pixelId);
        initializedPixels.current.add(pixelId);
      }
    });

    window.fbq("track", "PageView");
  }, [pixelIds.join(",")]);

  const trackEvent = useCallback(
    (
      eventName: string,
      params?: Record<string, any>,
      options?: { serverSide?: boolean }
    ) => {
      if (pixelIds.length > 0 && window.fbq) {
        window.fbq("track", eventName, params);
      }

      if (options?.serverSide) {
        fetch("/api/pixel/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            eventName, 
            params,
            affiliateCode,
          }),
        }).catch(console.error);
      }
    },
    [pixelIds.join(","), affiliateCode]
  );

  const trackPageView = useCallback(() => {
    if (pixelIds.length > 0 && window.fbq) {
      window.fbq("track", "PageView");
    }
  }, [pixelIds.join(",")]);

  const trackViewContent = useCallback(
    (params: { 
      content_name?: string; 
      content_ids?: string[]; 
      value?: number;
      content_type?: string;
    }) => {
      trackEvent("ViewContent", {
        ...params,
        currency: "BRL",
        content_type: params.content_type || "product",
      });
    },
    [trackEvent]
  );

  const trackInitiateCheckout = useCallback(
    (params: { 
      value?: number; 
      currency?: string; 
      content_name?: string;
      content_ids?: string[];
      num_items?: number;
    }) => {
      trackEvent("InitiateCheckout", {
        value: params.value,
        currency: params.currency || "BRL",
        content_name: params.content_name,
        content_ids: params.content_ids,
        num_items: params.num_items || 1,
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
      num_items?: number;
    }) => {
      trackEvent(
        "Purchase",
        {
          value: params.value,
          currency: params.currency || "BRL",
          content_name: params.content_name,
          content_ids: params.content_ids,
          num_items: params.num_items || 1,
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

  return {
    trackEvent,
    trackPageView,
    trackViewContent,
    trackInitiateCheckout,
    trackPurchase,
    trackLead,
    isConfigured: pixelIds.length > 0,
    hasGlobalPixel: !!globalPixelId,
    hasAffiliatePixel: !!affiliatePixelId,
  };
}
