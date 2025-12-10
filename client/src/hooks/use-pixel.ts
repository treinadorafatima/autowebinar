import { useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

declare global {
  interface Window {
    fbq: any;
    _fbq: any;
    gtag: any;
    dataLayer: any[];
  }
}

interface UsePixelOptions {
  affiliateCode?: string | null;
}

export function usePixel(options?: UsePixelOptions) {
  const { affiliateCode } = options || {};
  const initializedPixels = useRef<Set<string>>(new Set());

  const { data: configs } = useQuery<Record<string, string>>({
    queryKey: ["/api/checkout/public-config"],
    staleTime: 1000 * 60 * 5,
  });

  const { data: affiliatePixelData } = useQuery<{ metaPixelId: string | null }>({
    queryKey: ['affiliate-pixel', affiliateCode],
    queryFn: async () => {
      if (!affiliateCode) return { metaPixelId: null };
      const response = await fetch(`/api/affiliate-pixel/${affiliateCode}`);
      if (!response.ok) return { metaPixelId: null };
      return response.json();
    },
    enabled: !!affiliateCode,
    staleTime: 1000 * 60 * 5,
  });

  const globalPixelId = configs?.FACEBOOK_PIXEL_ID;
  const affiliatePixelId = affiliatePixelData?.metaPixelId;
  const googleAdsConversionId = configs?.GOOGLE_ADS_CONVERSION_ID;
  const googleAdsConversionLabel = configs?.GOOGLE_ADS_CONVERSION_LABEL;

  const pixelIds = [globalPixelId, affiliatePixelId].filter(Boolean) as string[];
  const gtagInitialized = useRef(false);

  // Initialize Facebook Pixel
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

  // Initialize Google Ads gtag
  useEffect(() => {
    if (!googleAdsConversionId || gtagInitialized.current) return;

    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) {
      window.gtag = function() {
        window.dataLayer.push(arguments);
      };
      window.gtag('js', new Date());
      window.gtag('config', googleAdsConversionId);

      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${googleAdsConversionId}`;
      document.head.appendChild(script);
      gtagInitialized.current = true;
    }
  }, [googleAdsConversionId]);

  const trackEvent = useCallback(
    (
      eventName: string,
      params?: Record<string, any>,
      options?: { serverSide?: boolean; userData?: { email?: string; phone?: string; name?: string } }
    ) => {
      if (pixelIds.length > 0 && window.fbq) {
        // Send event with advanced matching user data if provided
        if (options?.userData) {
          const userData: Record<string, string> = {};
          if (options.userData.email) userData.em = options.userData.email.toLowerCase().trim();
          if (options.userData.phone) userData.ph = options.userData.phone.replace(/\D/g, '');
          if (options.userData.name) {
            const nameParts = options.userData.name.trim().split(' ');
            if (nameParts[0]) userData.fn = nameParts[0].toLowerCase();
            if (nameParts.length > 1) userData.ln = nameParts[nameParts.length - 1].toLowerCase();
          }
          // Use trackSingle with user_data in params for advanced matching
          const eventParams = {
            ...params,
            user_data: userData,
          };
          const eventId = `${eventName}_${Date.now()}`;
          window.fbq("track", eventName, eventParams, { eventID: eventId });
        } else {
          window.fbq("track", eventName, params);
        }
      }

      if (options?.serverSide) {
        fetch("/api/pixel/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            eventName, 
            params,
            affiliateCode,
            userData: options?.userData,
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
      email?: string;
      phone?: string;
      name?: string;
    }) => {
      // Facebook InitiateCheckout
      trackEvent("InitiateCheckout", {
        value: params.value,
        currency: params.currency || "BRL",
        content_name: params.content_name,
        content_ids: params.content_ids,
        num_items: params.num_items || 1,
      });
      // Google Ads begin_checkout
      if (window.gtag && googleAdsConversionId) {
        window.gtag('event', 'begin_checkout', {
          value: params.value,
          currency: params.currency || "BRL",
          items: params.content_ids?.map(id => ({ id })) || [],
        });
      }
    },
    [trackEvent, googleAdsConversionId]
  );

  const trackAddPaymentInfo = useCallback(
    (params: {
      value?: number;
      currency?: string;
      content_name?: string;
      payment_type?: string;
      email?: string;
      phone?: string;
      name?: string;
    }) => {
      const userData = params.email || params.phone || params.name 
        ? { email: params.email, phone: params.phone, name: params.name }
        : undefined;
      // Facebook AddPaymentInfo with user data for matching
      trackEvent("AddPaymentInfo", {
        value: params.value,
        currency: params.currency || "BRL",
        content_name: params.content_name,
        payment_type: params.payment_type,
      }, { userData });
      // Google Ads add_payment_info with user data
      if (window.gtag && googleAdsConversionId) {
        window.gtag('event', 'add_payment_info', {
          value: params.value,
          currency: params.currency || "BRL",
          payment_type: params.payment_type,
          ...(params.email && { user_data: { email: params.email.toLowerCase() } }),
        });
      }
    },
    [trackEvent, googleAdsConversionId]
  );

  const trackPurchase = useCallback(
    (params: {
      value: number;
      currency?: string;
      content_name?: string;
      content_ids?: string[];
      pagamentoId?: string;
      num_items?: number;
      email?: string;
      phone?: string;
      name?: string;
    }) => {
      const userData = params.email || params.phone || params.name 
        ? { email: params.email, phone: params.phone, name: params.name }
        : undefined;
      // Facebook Purchase with user data for matching
      trackEvent(
        "Purchase",
        {
          value: params.value,
          currency: params.currency || "BRL",
          content_name: params.content_name,
          content_ids: params.content_ids,
          num_items: params.num_items || 1,
        },
        { serverSide: true, userData }
      );
      // Google Ads conversion with user data
      if (window.gtag && googleAdsConversionId && googleAdsConversionLabel) {
        window.gtag('event', 'conversion', {
          send_to: `${googleAdsConversionId}/${googleAdsConversionLabel}`,
          value: params.value,
          currency: params.currency || "BRL",
          transaction_id: params.pagamentoId,
          ...(params.email && { user_data: { email: params.email.toLowerCase() } }),
        });
      }
    },
    [trackEvent, googleAdsConversionId, googleAdsConversionLabel]
  );

  const trackLead = useCallback(
    (params?: { 
      content_name?: string; 
      value?: number;
      email?: string;
      phone?: string;
      name?: string;
    }) => {
      const userData = params?.email || params?.phone || params?.name 
        ? { email: params?.email, phone: params?.phone, name: params?.name }
        : undefined;
      // Facebook Lead with user data for matching
      trackEvent("Lead", {
        content_name: params?.content_name,
        value: params?.value,
        currency: "BRL",
      }, { userData });
      // Google Ads generate_lead with user data
      if (window.gtag && googleAdsConversionId) {
        window.gtag('event', 'generate_lead', {
          value: params?.value,
          currency: "BRL",
          ...(params?.email && { user_data: { email: params.email.toLowerCase() } }),
        });
      }
    },
    [trackEvent, googleAdsConversionId]
  );

  return {
    trackEvent,
    trackPageView,
    trackViewContent,
    trackInitiateCheckout,
    trackAddPaymentInfo,
    trackPurchase,
    trackLead,
    isConfigured: pixelIds.length > 0,
    hasGlobalPixel: !!globalPixelId,
    hasAffiliatePixel: !!affiliatePixelId,
    hasGoogleAds: !!googleAdsConversionId,
  };
}
