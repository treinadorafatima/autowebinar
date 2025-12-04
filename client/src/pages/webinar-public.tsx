import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Check, Volume2, VolumeX, Maximize } from "lucide-react";
import DOMPurify from "dompurify";
import Hls from "hls.js";
import { calculateWebinarStatusWithTimezone } from "@/lib/timezone";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'span', 'font', 'br'],
    ALLOWED_ATTR: ['style', 'color', 'size']
  });
}

function getButtonPadding(size: string): string {
  switch(size) {
    case "sm": return "16px 24px";
    case "md": return "20px 32px";
    case "lg": return "28px 40px";
    case "xl": return "36px 48px";
    default: return "28px 40px";
  }
}

function getButtonFontSize(size: string): string {
  switch(size) {
    case "sm": return "16px";
    case "md": return "18px";
    case "lg": return "22px";
    case "xl": return "26px";
    default: return "22px";
  }
}

interface Webinar {
  id: string;
  name: string;
  slug: string;
  description: string;
  videoUrl: string;
  uploadedVideoId: string | null;
  videoDuration: number;
  startHour: number;
  startMinute: number;
  timezone: string;
  recurrence: string;
  onceDate: string | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  countdownText: string;
  nextWebinarText: string;
  endedBadgeText: string;
  countdownColor: string;
  liveButtonColor: string;
  backgroundColor: string;
  backgroundImageUrl: string;
  isActive: boolean;
  pageTitle: string;
  pageBadgeText: string;
  pageBackgroundColor: string;
  leadsEnabled?: boolean;
  leadsCollectEmail?: boolean;
  leadsCollectWhatsapp?: boolean;
  offerEnabled: boolean;
  offerDelaySeconds: number;
  offerStartSeconds: number;
  offerEndsAtEnd: boolean;
  offerDurationSeconds: number;
  offerBadgeText: string;
  offerTitle: string;
  offerTitleColor: string;
  offerSubtitle: string;
  offerSubtitleColor: string;
  offerImageUrl: string;
  offerPriceText: string;
  offerPriceBorderColor: string;
  offerPriceBoxBgColor: string;
  offerPriceBoxShadow: boolean;
  offerPriceBoxPadding: string;
  offerPriceIconColor: string;
  offerPriceHighlightColor: string;
  offerPriceLabel: string;
  offerButtonText: string;
  offerButtonUrl: string;
  offerButtonColor: string;
  offerButtonSize: string;
  offerButtonShadow: boolean;
  offerButtonTextColor: string;
  offerBenefits: string;
  bannerEnabled: boolean;
  bannerStartSeconds: number;
  bannerEndsAtEnd: boolean;
  bannerDurationSeconds: number;
  bannerBackgroundColor: string;
  bannerButtonText: string;
  bannerButtonUrl: string;
  bannerButtonColor: string;
  bannerButtonTextColor: string;
  participantCount: number;
  participantOscillationPercent: number;
  showLiveIndicator?: boolean;
  liveIndicatorStyle?: "full" | "number" | "hidden";
  showEndedScreen?: boolean;
  showNextCountdown?: boolean;
  showNextSessionDate?: boolean;
  offerDisplayAfterEnd?: number;
  showOfferInsteadOfEnded?: boolean;
  offerDisplayHours?: number;
  offerDisplayMinutes?: number;
  commentTheme: string;
  // SEO e compartilhamento
  seoSiteName?: string;
  seoPageTitle?: string;
  seoDescription?: string;
  seoFaviconUrl?: string;
  seoShareImageUrl?: string;
}

interface Comment {
  id: string;
  text: string;
  author: string;
  timestamp: number;
}

type WebinarStatus = "waiting" | "live" | "ended";

function getOrCreateSessionId(): string {
  const key = "webinar_session_id";
  let sessionId = localStorage.getItem(key);
  if (!sessionId) {
    sessionId = "session_" + Date.now() + "_" + Math.random().toString(36).substring(7);
    localStorage.setItem(key, sessionId);
  }
  return sessionId;
}

export default function WebinarPublicPage() {
  const params = useParams<{ slug: string }>();
  const searchString = useSearch();
  const isEmbed = searchString.includes("embed=1");
  const isCompact = searchString.includes("compact=1");
  const previewMode = searchString.includes("preview=ended") ? "ended" 
    : searchString.includes("preview=waiting") ? "waiting" 
    : searchString.includes("preview=live") ? "live" 
    : null;
  
  const [webinar, setWebinar] = useState<Webinar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<WebinarStatus>("waiting");
  const [countdown, setCountdown] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [visibleComments, setVisibleComments] = useState<Comment[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [showOffer, setShowOffer] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showOfferAfterEnd, setShowOfferAfterEnd] = useState(false);
  const [offerExpiredAfterEnd, setOfferExpiredAfterEnd] = useState(false);
  
  // Estados para formulário de LEAD (inscrição)
  const [userName, setUserName] = useState(() => {
    return localStorage.getItem(`webinar-${params.slug}-userName`) || "";
  });
  const [userCity, setUserCity] = useState(() => {
    return localStorage.getItem(`webinar-${params.slug}-userCity`) || "";
  });
  const [userState, setUserState] = useState(() => {
    return localStorage.getItem(`webinar-${params.slug}-userState`) || "";
  });
  const [userEmail, setUserEmail] = useState("");
  const [userWhatsapp, setUserWhatsapp] = useState("");
  const [isRegistered, setIsRegistered] = useState(() => {
    return localStorage.getItem(`webinar-${params.slug}-registered`) === "true";
  });
  
  // Estados separados para formulário de CHAT (comentários)
  const [chatName, setChatName] = useState(() => {
    return localStorage.getItem(`webinar-${params.slug}-chatName`) || "";
  });
  const [chatCity, setChatCity] = useState(() => {
    return localStorage.getItem(`webinar-${params.slug}-chatCity`) || "";
  });
  const [chatState, setChatState] = useState(() => {
    return localStorage.getItem(`webinar-${params.slug}-chatState`) || "";
  });
  const [chatEmail, setChatEmail] = useState(() => {
    return localStorage.getItem(`webinar-${params.slug}-chatEmail`) || "";
  });
  const [chatWhatsapp, setChatWhatsapp] = useState(() => {
    return localStorage.getItem(`webinar-${params.slug}-chatWhatsapp`) || "";
  });
  const [isChatRegistered, setIsChatRegistered] = useState(() => {
    return localStorage.getItem(`webinar-${params.slug}-chatRegistered`) === "true";
  });
  
  const [userComment, setUserComment] = useState("");
  const [showParticipationModal, setShowParticipationModal] = useState(false);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [isUsingHls, setIsUsingHls] = useState(false);
  const [videoElementReady, setVideoElementReady] = useState(false);
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  
  const sessionIdRef = useRef<string>(getOrCreateSessionId());
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const videoCallbackRef = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      (videoRef as React.MutableRefObject<HTMLVideoElement>).current = node;
      setVideoElementReady(true);
      console.log("[Video] Element ready");
    }
  }, []);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const videoInitializedRef = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    const hasSeenModal = localStorage.getItem(`webinar-${params.slug}-modal-seen`);
    if (!hasSeenModal && status === "live") {
      setShowParticipationModal(true);
      localStorage.setItem(`webinar-${params.slug}-modal-seen`, "true");
    }
  }, [status, params.slug]);

  useEffect(() => {
    if (!isEmbed) return;
    
    // Remove margens do body/html quando em modo embed e esconde overflow
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.background = 'transparent';
    document.documentElement.style.margin = '0';
    document.documentElement.style.padding = '0';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.background = 'transparent';
    
    let lastHeight = 0;
    
    const sendHeight = () => {
      if (!containerRef.current) return;
      // Usa getBoundingClientRect para medição mais precisa
      const rect = containerRef.current.getBoundingClientRect();
      const height = Math.ceil(rect.height);
      if (height !== lastHeight && height > 0) {
        lastHeight = height;
        window.parent.postMessage({ type: 'webinar-resize', height }, '*');
      }
    };

    // Aguarda alguns frames para garantir que o layout está pronto
    setTimeout(sendHeight, 100);
    setTimeout(sendHeight, 300);
    setTimeout(sendHeight, 500);
    
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(sendHeight);
    });
    
    const mutationObserver = new MutationObserver(() => {
      setTimeout(sendHeight, 50);
    });
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
      mutationObserver.observe(containerRef.current, { 
        childList: true, 
        subtree: true, 
        attributes: true 
      });
    }
    
    // Backup interval para casos onde observers não disparam
    const interval = setInterval(sendHeight, 500);
    
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      clearInterval(interval);
    };
  }, [isEmbed]);

  const sessionStartTimeRef = useRef<number>(Date.now());
  const maxVideoPositionRef = useRef<number>(0);

  useEffect(() => {
    fetchWebinar();
    incrementViews();

    const handleBeforeUnload = () => {
      trackSession();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      trackSession();
    };
  }, [params.slug]);

  // Atualizar meta tags dinamicamente quando o webinar é carregado
  useEffect(() => {
    if (!webinar) return;
    
    // Guardar referências para cleanup
    const addedMetaTags: Element[] = [];
    const addedLinkTags: Element[] = [];
    const originalTitle = document.title;
    const originalFavicon = document.querySelector('link[rel="icon"]')?.getAttribute('href') || 'https://erodfrfuuhxdaeqfjzsn.supabase.co/storage/v1/object/public/webinar-images/system/autowebinar-favicon.png';
    
    // Título da página
    const pageTitle = webinar.seoPageTitle || webinar.pageTitle || webinar.name;
    const siteName = webinar.seoSiteName;
    document.title = siteName ? `${pageTitle} | ${siteName}` : pageTitle;
    
    // Meta description
    const description = webinar.seoDescription || webinar.description || `Assista ao webinário ${webinar.name}`;
    let metaDescription = document.querySelector('meta[name="description"]');
    const wasDescriptionNew = !metaDescription;
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
      addedMetaTags.push(metaDescription);
    }
    metaDescription.setAttribute('content', description);
    
    // Open Graph tags - sempre definir, mesmo que vazio para limpar valores anteriores
    const ogTags: Record<string, string> = {
      'og:title': pageTitle,
      'og:description': description,
      'og:type': 'website',
      'og:url': window.location.href,
      'og:site_name': siteName || 'Webinário',
    };
    
    // Apenas adicionar og:image se tiver URL
    if (webinar.seoShareImageUrl) {
      ogTags['og:image'] = webinar.seoShareImageUrl;
    }
    
    Object.entries(ogTags).forEach(([property, content]) => {
      let meta = document.querySelector(`meta[property="${property}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('property', property);
        document.head.appendChild(meta);
        addedMetaTags.push(meta);
      }
      meta.setAttribute('content', content);
    });
    
    // Remover og:image anterior se não tiver imagem configurada
    if (!webinar.seoShareImageUrl) {
      const existingOgImage = document.querySelector('meta[property="og:image"]');
      if (existingOgImage) {
        existingOgImage.remove();
      }
    }
    
    // Twitter Card tags
    const twitterTags: Record<string, string> = {
      'twitter:card': webinar.seoShareImageUrl ? 'summary_large_image' : 'summary',
      'twitter:title': pageTitle,
      'twitter:description': description,
    };
    
    if (webinar.seoShareImageUrl) {
      twitterTags['twitter:image'] = webinar.seoShareImageUrl;
    }
    
    Object.entries(twitterTags).forEach(([name, content]) => {
      let meta = document.querySelector(`meta[name="${name}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', name);
        document.head.appendChild(meta);
        addedMetaTags.push(meta);
      }
      meta.setAttribute('content', content);
    });
    
    // Remover twitter:image anterior se não tiver imagem configurada
    if (!webinar.seoShareImageUrl) {
      const existingTwitterImage = document.querySelector('meta[name="twitter:image"]');
      if (existingTwitterImage) {
        existingTwitterImage.remove();
      }
    }
    
    // Favicon - atualizar ou restaurar padrão
    let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    if (webinar.seoFaviconUrl) {
      if (!favicon) {
        favicon = document.createElement('link') as HTMLLinkElement;
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
        addedLinkTags.push(favicon);
      }
      favicon.href = webinar.seoFaviconUrl;
      
      // Also update apple-touch-icon
      let appleFavicon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement;
      if (!appleFavicon) {
        appleFavicon = document.createElement('link') as HTMLLinkElement;
        appleFavicon.rel = 'apple-touch-icon';
        document.head.appendChild(appleFavicon);
        addedLinkTags.push(appleFavicon);
      }
      appleFavicon.href = webinar.seoFaviconUrl;
    }
    
    return () => {
      // Cleanup: remover meta tags adicionadas e restaurar título/favicon
      document.title = 'AutoWebinar - Plataforma de Webinários Automatizados';
      
      // Remover meta tags que foram adicionadas por este componente
      addedMetaTags.forEach(tag => {
        if (tag.parentNode) {
          tag.parentNode.removeChild(tag);
        }
      });
      
      // Remover link tags que foram adicionadas
      addedLinkTags.forEach(tag => {
        if (tag.parentNode) {
          tag.parentNode.removeChild(tag);
        }
      });
      
      // Restaurar favicon original
      const currentFavicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
      if (currentFavicon) {
        currentFavicon.href = originalFavicon;
      }
    };
  }, [webinar]);

  async function incrementViews() {
    try {
      await fetch(`/api/webinars/${params.slug}/increment-view`, { method: "POST" });
    } catch (error) {
      console.error("Erro ao registrar visualização:", error);
    }
  }

  async function trackSession() {
    if (!webinar?.id) return;
    try {
      const viewDurationSeconds = Math.floor((Date.now() - sessionStartTimeRef.current) / 1000);
      await fetch(`/api/webinars/${webinar.id}/track-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          viewDurationSeconds,
          maxVideoPositionSeconds: maxVideoPositionRef.current,
        }),
      });
    } catch (error) {
      console.error("Erro ao rastrear sessão:", error);
    }
  }

  const handleVideoTimeUpdate = (videoTime: number) => {
    maxVideoPositionRef.current = Math.max(maxVideoPositionRef.current, Math.floor(videoTime));
    setCurrentTime(videoTime);
  }

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume / 100;
    }
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  }

  const handleToggleMute = () => {
    if (videoRef.current) {
      if (isMuted) {
        videoRef.current.volume = volume / 100;
        setIsMuted(false);
      } else {
        videoRef.current.volume = 0;
        setIsMuted(true);
      }
    }
  }

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen().catch(() => {});
      }
    }
  }

  async function fetchWebinar() {
    try {
      const res = await fetch(`/api/webinars/${params.slug}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (errorData.reason === "owner_plan_expired") {
          setError("Este webinário está temporariamente indisponível. Por favor, tente novamente mais tarde.");
        } else {
          setError("Webinário não encontrado");
        }
        setLoading(false);
        return;
      }
      const data = await res.json();
      setWebinar(data);
      
      // Load simulated/approved comments
      const commentsRes = await fetch(`/api/webinars/${data.id}/comments/active`);
      let allComments: Comment[] = [];
      if (commentsRes.ok) {
        const commentsData = await commentsRes.json();
        allComments = commentsData || [];
      }
      
      // Also load user's own comments (even if not approved yet)
      try {
        const userCommentsRes = await fetch(`/api/webinars/${data.id}/my-live-comments?sessionId=${sessionIdRef.current}`);
        if (userCommentsRes.ok) {
          const userComments = await userCommentsRes.json();
          // Merge, avoiding duplicates
          const existingIds = new Set(allComments.map((c: Comment) => c.id));
          const newUserComments = userComments.filter((c: Comment) => !existingIds.has(c.id));
          allComments = [...allComments, ...newUserComments];
        }
      } catch (e) {
        // Ignore errors loading user comments
      }
      
      setComments(allComments);
      setLoading(false);
    } catch (err) {
      setError("Erro ao carregar webinário");
      setLoading(false);
    }
  }

  async function loadUserLiveComments() {
    if (!webinar || !isRegistered) return;
    try {
      const res = await fetch(`/api/webinars/${webinar.id}/my-live-comments?sessionId=${sessionIdRef.current}`);
      if (res.ok) {
        const userComments = await res.json();
        // Merge simulated + user's real comments, avoiding duplicates
        setComments(prev => {
          const existingIds = new Set(prev.map(c => c.id));
          const newComments = userComments.filter((c: Comment) => !existingIds.has(c.id));
          return [...prev, ...newComments];
        });
      }
    } catch (error) {
      console.error("Erro ao carregar comentários do usuário:", error);
    }
  }

  const calculateStatus = useCallback(() => {
    if (!webinar) return;

    // Preview mode overrides normal status calculation
    if (previewMode) {
      setStatus(previewMode as WebinarStatus);
      setCountdown("12:34:56"); // Dummy countdown for preview
      if (previewMode === "live") {
        setCurrentTime(300); // 5 minutes into video for preview
      }
      return;
    }

    // Use timezone-aware calculation
    const timezone = webinar.timezone || "America/Sao_Paulo";
    const result = calculateWebinarStatusWithTimezone(
      webinar.startHour,
      webinar.startMinute,
      webinar.videoDuration,
      timezone
    );

    if (result.status === "live") {
      setStatus("live");
      // Only set currentTime from calculation if video is NOT playing yet
      // Once video is playing, we use the video's actual currentTime via onTimeUpdate
      if (!isVideoPlaying) {
        setCurrentTime(result.currentTime);
        scheduledTimeRef.current = result.currentTime;
      }
    } else if (result.status === "ended") {
      setStatus("ended");
      setCountdown(result.countdown);
    } else {
      // Before today's start time - respect showNextCountdown setting
      if (webinar.showNextCountdown) {
        setStatus("waiting");
      } else {
        setStatus("ended");
      }
      setCountdown(result.countdown);
    }
  }, [webinar, previewMode, isVideoPlaying]);

  // Ref to store the current scheduled time for video initialization
  const scheduledTimeRef = useRef<number>(0);

  useEffect(() => {
    calculateStatus();
    const interval = setInterval(calculateStatus, 1000);
    return () => clearInterval(interval);
  }, [calculateStatus]);
  
  // Also sync scheduledTimeRef via effect as backup
  useEffect(() => {
    scheduledTimeRef.current = currentTime;
  }, [currentTime]);

  // Fetch video URL (try HLS first, fallback to MP4)
  useEffect(() => {
    async function fetchVideoUrl() {
      if (status === "live" && webinar?.uploadedVideoId && !videoUrl && !hlsUrl) {
        try {
          // First check if HLS is available
          const hlsRes = await fetch(`/api/webinar/videos/${webinar.uploadedVideoId}/hls-status`);
          if (hlsRes.ok) {
            const hlsData = await hlsRes.json();
            if (hlsData.status === 'completed' && hlsData.hlsUrl) {
              console.log("HLS available, using HLS streaming");
              setHlsUrl(hlsData.hlsUrl);
              setIsUsingHls(true);
              videoInitializedRef.current = false;
              return;
            }
          }
          
          // Fallback to signed MP4 URL
          const res = await fetch(`/api/webinar/video-url/${webinar.uploadedVideoId}`);
          if (res.ok) {
            const data = await res.json();
            setVideoUrl(data.url);
            setIsUsingHls(false);
            videoInitializedRef.current = false;
            console.log("Using MP4 signed URL (HLS not available)");
          } else {
            console.error("Failed to fetch video URL");
          }
        } catch (error) {
          console.error("Error fetching video URL:", error);
        }
      }
    }
    fetchVideoUrl();
  }, [status, webinar?.uploadedVideoId, videoUrl, hlsUrl]);

  // Setup HLS.js when HLS URL is available
  const hlsInitializingRef = useRef(false);
  
  useEffect(() => {
    console.log("[HLS Setup] Checking conditions:", { 
      hlsUrl: !!hlsUrl, 
      videoElementReady,
      isUsingHls,
      webinar: !!webinar,
      alreadyInitializing: hlsInitializingRef.current
    });
    
    if (!hlsUrl || !videoElementReady || !videoRef.current || !isUsingHls) {
      console.log("[HLS Setup] Conditions not met, waiting...");
      return;
    }
    
    // Prevent double initialization
    if (hlsInitializingRef.current) {
      console.log("[HLS Setup] Already initializing, skipping...");
      return;
    }
    
    hlsInitializingRef.current = true;
    const video = videoRef.current;
    
    // Calculate elapsed time using timezone-aware calculation
    const calculateElapsedTime = (): number => {
      if (!webinar) return 0;
      
      const timezone = webinar.timezone || "America/Sao_Paulo";
      const result = calculateWebinarStatusWithTimezone(
        webinar.startHour,
        webinar.startMinute,
        webinar.videoDuration,
        timezone
      );
      
      return result.currentTime;
    };
    
    const elapsedSeconds = calculateElapsedTime();
    console.log(`[HLS] Calculated elapsed time: ${elapsedSeconds}s (${Math.floor(elapsedSeconds/60)}min ${elapsedSeconds%60}s)`);
    
    // Check if HLS is supported
    if (Hls.isSupported()) {
      console.log("Setting up HLS.js player with startPosition:", elapsedSeconds);
      
      // Destroy existing HLS instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        startPosition: elapsedSeconds, // Start at elapsed time!
      });
      
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      
      // Wait for LEVEL_LOADED to ensure segments are ready before seeking
      hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
        console.log(`[HLS] Level loaded, duration: ${data.details.totalduration}s`);
        
        // Re-calculate elapsed time for accuracy
        const currentElapsed = calculateElapsedTime();
        const maxTime = data.details.totalduration - 1;
        const targetTime = Math.min(currentElapsed, maxTime);
        
        console.log(`[HLS] Seeking to: ${targetTime}s (elapsed: ${currentElapsed}s, max: ${maxTime}s)`);
        
        if (targetTime > 0 && Math.abs(video.currentTime - targetTime) > 5) {
          video.currentTime = targetTime;
        }
      });
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log("[HLS] Manifest parsed, starting playback");
        video.play().then(() => {
          console.log("[HLS] Play started successfully");
          setIsVideoPlaying(true);
          setNeedsUserInteraction(false);
        }).catch((err) => {
          console.log("HLS play failed:", err.message);
          if (err.name === 'NotAllowedError') {
            console.log("[HLS] Autoplay blocked, needs user interaction");
            setNeedsUserInteraction(true);
          }
        });
        videoInitializedRef.current = true;
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error("HLS error:", data);
        if (data.fatal) {
          // On fatal error, fallback to MP4
          console.log("HLS fatal error, falling back to MP4");
          hls.destroy();
          hlsRef.current = null;
          setHlsUrl(null);
          setIsUsingHls(false);
        }
      });
      
      return () => {
        console.log("[HLS] Cleanup - destroying HLS instance");
        hls.destroy();
        hlsRef.current = null;
        hlsInitializingRef.current = false;
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      console.log("Using native HLS support");
      video.src = hlsUrl;
      video.addEventListener('loadedmetadata', () => {
        const elapsedNow = calculateElapsedTime();
        const targetTime = Math.min(elapsedNow, video.duration - 1);
        console.log(`[HLS Native] Seeking to: ${targetTime}s`);
        if (targetTime > 0) {
          video.currentTime = targetTime;
        }
        video.play().catch(() => {});
        videoInitializedRef.current = true;
      });
    }
  }, [hlsUrl, isUsingHls, webinar, videoElementReady]);

  // Handle video can play - seek to correct position
  const handleVideoCanPlay = useCallback(() => {
    if (videoRef.current && !videoInitializedRef.current && status === "live" && webinar) {
      const video = videoRef.current;
      
      // Calculate elapsed time directly using timezone-aware calculation
      const timezone = webinar.timezone || "America/Sao_Paulo";
      const result = calculateWebinarStatusWithTimezone(
        webinar.startHour,
        webinar.startMinute,
        webinar.videoDuration,
        timezone
      );
      const targetTime = Math.min(result.currentTime, video.duration - 1);
      
      console.log(`Video ready, seeking to ${targetTime}s (timezone: ${timezone})`);
      videoInitializedRef.current = true;
      
      // Seek after video is ready to play
      video.currentTime = targetTime;
      video.play().catch((err) => {
        console.log("Play failed:", err.message);
      });
    }
  }, [status, webinar]);

  // Handle video metadata loaded
  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoRef.current && status === "live") {
      console.log(`Video metadata loaded, duration: ${videoRef.current.duration}s`);
    }
  }, [status]);

  // Handle when video finishes seeking
  const handleVideoSeeked = useCallback(() => {
    if (videoRef.current && status === "live") {
      console.log(`Seek complete at ${videoRef.current.currentTime}s`);
      videoRef.current.play().catch(() => {});
    }
  }, [status]);

  useEffect(() => {
    if (status !== "live") {
      videoInitializedRef.current = false;
      setVideoUrl(null); // Reset URL when not live
      setHlsUrl(null);
      setIsUsingHls(false);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    }
  }, [status]);

  // Polling to check if HLS becomes available while using MP4
  useEffect(() => {
    if (status !== "live" || !webinar?.uploadedVideoId || isUsingHls || !videoUrl) return;
    
    // Check every 60 seconds if HLS becomes available
    const checkHlsInterval = setInterval(async () => {
      try {
        const hlsRes = await fetch(`/api/webinar/videos/${webinar.uploadedVideoId}/hls-status`);
        if (hlsRes.ok) {
          const hlsData = await hlsRes.json();
          if (hlsData.status === 'completed' && hlsData.hlsUrl) {
            console.log("HLS now available, upgrading from MP4 to HLS");
            const currentVideoTime = videoRef.current?.currentTime || 0;
            setVideoUrl(null);
            setHlsUrl(hlsData.hlsUrl);
            setIsUsingHls(true);
            videoInitializedRef.current = false;
            scheduledTimeRef.current = currentVideoTime;
          }
        }
      } catch (err) {
        console.error("Error checking HLS availability:", err);
      }
    }, 60000);
    
    return () => clearInterval(checkHlsInterval);
  }, [status, webinar?.uploadedVideoId, isUsingHls, videoUrl]);

  useEffect(() => {
    if (status === "live" && videoRef.current && videoInitializedRef.current) {
      const syncInterval = setInterval(() => {
        if (videoRef.current) {
          const diff = Math.abs(videoRef.current.currentTime - currentTime);
          if (diff > 2) {
            videoRef.current.currentTime = currentTime;
          }
        }
      }, 5000);
      return () => clearInterval(syncInterval);
    }
  }, [status, currentTime]);

  useEffect(() => {
    // Show simulated comments + user's real comments that already played
    // Sort by timestamp so user comments mix properly with simulated ones
    const filtered = comments
      .filter(c => c.timestamp <= currentTime)
      .sort((a, b) => a.timestamp - b.timestamp);
    setVisibleComments(filtered);
  }, [currentTime, comments]);

  useEffect(() => {
    // Load user's real comments when they register
    if (isRegistered && webinar) {
      loadUserLiveComments();
    }
  }, [isRegistered, webinar]);

  useEffect(() => {
    if (status === "live" && webinar) {
      const baseCount = webinar.participantCount || 200;
      const oscillationPercent = webinar.participantOscillationPercent || 20;
      const variance = Math.round(baseCount * (oscillationPercent / 100));
      
      // Initial count with some variance
      const initialCount = baseCount + Math.floor(Math.random() * variance * 2) - variance;
      setParticipantCount(Math.max(0, initialCount));
      
      // Update every 10 seconds with oscillation
      const interval = setInterval(() => {
        setParticipantCount(prev => {
          // Oscillate between baseCount - variance and baseCount + variance
          const delta = Math.floor(Math.random() * variance * 0.4) - (variance * 0.2);
          const newCount = prev + delta;
          const min = Math.max(0, baseCount - variance);
          const max = baseCount + variance;
          return Math.max(min, Math.min(max, newCount));
        });
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [status, webinar]);

  useEffect(() => {
    if (!webinar?.offerEnabled) {
      setShowOffer(false);
      return;
    }

    const offerStart = webinar.offerStartSeconds || 0;
    const offerEndsAtEnd = webinar.offerEndsAtEnd ?? true;
    const offerDuration = webinar.offerDurationSeconds || 0;
    const offerEnd = offerEndsAtEnd ? webinar.videoDuration : offerStart + offerDuration;

    // Show offer if current time is within the offer window
    const shouldShow = currentTime >= offerStart && currentTime < offerEnd;
    setShowOffer(shouldShow);
  }, [currentTime, webinar?.offerEnabled, webinar?.offerStartSeconds, webinar?.offerEndsAtEnd, webinar?.offerDurationSeconds, webinar?.videoDuration]);

  useEffect(() => {
    if (!webinar?.bannerEnabled) {
      setShowBanner(false);
      return;
    }

    const bannerStart = webinar.bannerStartSeconds || 0;
    const bannerEndsAtEnd = webinar.bannerEndsAtEnd ?? true;
    const bannerDuration = webinar.bannerDurationSeconds || 0;
    const bannerEnd = bannerEndsAtEnd ? webinar.videoDuration : bannerStart + bannerDuration;

    // Show banner if current time is within the banner window
    const shouldShowBanner = currentTime >= bannerStart && currentTime < bannerEnd;
    setShowBanner(shouldShowBanner);
  }, [currentTime, webinar?.bannerEnabled, webinar?.bannerStartSeconds, webinar?.bannerEndsAtEnd, webinar?.bannerDurationSeconds, webinar?.videoDuration]);

  // Handle post-end offer display (Mode 1: below "Transmissão Encerrada" screen)
  useEffect(() => {
    if (!webinar) {
      setShowOfferAfterEnd(false);
      return;
    }

    // Only show if webinar has ended and showOfferInsteadOfEnded is false (Mode 1)
    if (status !== "ended" || webinar.showOfferInsteadOfEnded || !webinar.offerEnabled) {
      setShowOfferAfterEnd(false);
      return;
    }

    // Calculate the actual time when webinar ended based on schedule
    const calculateWebinarEndTime = () => {
      const now = new Date();
      const videoDurationMs = (webinar.videoDuration || 0) * 1000;
      
      // Today's webinar start time
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), webinar.startHour, webinar.startMinute, 0);
      const todayEnd = todayStart.getTime() + videoDurationMs;
      
      // If today's end time is in the future, webinar ended yesterday
      if (todayEnd > now.getTime()) {
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        return yesterdayStart.getTime() + videoDurationMs;
      }
      
      return todayEnd;
    };

    const checkOfferDisplay = () => {
      const totalMinutes = (webinar.offerDisplayHours || 0) * 60 + (webinar.offerDisplayMinutes || 0);
      
      // If total minutes is 0, don't show offer after end (0h 0min = não mostrar)
      if (totalMinutes === 0) {
        setShowOfferAfterEnd(false);
        return;
      }

      const webinarEndTime = calculateWebinarEndTime();
      const offerDisplayMillis = totalMinutes * 60 * 1000;
      const now = Date.now();
      const timeSinceEnd = now - webinarEndTime;

      // Show offer only WITHIN the configured duration after webinar ends
      // e.g., if configured for 6h, show from end time until 6h later
      const shouldShow = timeSinceEnd >= 0 && timeSinceEnd <= offerDisplayMillis;
      setShowOfferAfterEnd(shouldShow);
    };

    // Check immediately
    checkOfferDisplay();

    // Re-check every 30 seconds to catch when delay expires
    const interval = setInterval(checkOfferDisplay, 30000);
    return () => clearInterval(interval);
  }, [status, webinar?.showOfferInsteadOfEnded, webinar?.offerEnabled, webinar?.offerDisplayHours, webinar?.offerDisplayMinutes, webinar?.startHour, webinar?.startMinute, webinar?.videoDuration, webinar]);

  // Handle offer expiration when showOfferInsteadOfEnded is active (Mode 2)
  useEffect(() => {
    if (!webinar) {
      setOfferExpiredAfterEnd(false);
      return;
    }

    // Only applies when showOfferInsteadOfEnded is true
    if (status !== "ended" || !webinar.showOfferInsteadOfEnded || !webinar.offerEnabled) {
      setOfferExpiredAfterEnd(false);
      return;
    }

    const totalMinutes = (webinar.offerDisplayHours || 0) * 60 + (webinar.offerDisplayMinutes || 0);
    
    // If no duration set, offer never expires
    if (totalMinutes === 0) {
      setOfferExpiredAfterEnd(false);
      return;
    }

    // Calculate when webinar ended
    const calculateWebinarEndTime = () => {
      const now = new Date();
      const videoDurationMs = (webinar.videoDuration || 0) * 1000;
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), webinar.startHour, webinar.startMinute, 0);
      const todayEnd = todayStart.getTime() + videoDurationMs;
      
      if (todayEnd > now.getTime()) {
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        return yesterdayStart.getTime() + videoDurationMs;
      }
      return todayEnd;
    };

    const checkOfferExpiration = () => {
      const webinarEndTime = calculateWebinarEndTime();
      const offerDisplayMillis = totalMinutes * 60 * 1000;
      const now = Date.now();
      const timeSinceEnd = now - webinarEndTime;
      
      // Offer expired if time since end exceeds display duration
      const expired = timeSinceEnd > offerDisplayMillis;
      setOfferExpiredAfterEnd(expired);
    };

    checkOfferExpiration();
    const interval = setInterval(checkOfferExpiration, 30000);
    return () => clearInterval(interval);
  }, [status, webinar?.showOfferInsteadOfEnded, webinar?.offerEnabled, webinar?.offerDisplayHours, webinar?.offerDisplayMinutes, webinar?.startHour, webinar?.startMinute, webinar?.videoDuration, webinar]);

  async function handleSendComment() {
    if (!userComment.trim() || !webinar) return;
    
    // Verifica campos obrigatórios baseado na configuração do webinar
    const needsName = webinar.chatCollectName !== false;
    const needsCity = webinar.chatCollectCity !== false;
    const needsState = webinar.chatCollectState !== false;
    
    // Verifica se os campos configurados estão preenchidos
    if ((needsName && !chatName.trim()) || 
        (needsCity && !chatCity.trim()) || 
        (needsState && (!chatState.trim() || chatState.length !== 2))) {
      toast({ 
        title: "Complete seu cadastro no chat", 
        description: "Preencha os campos para comentar",
        variant: "destructive" 
      });
      setShowParticipationModal(true);
      return;
    }
    
    // Monta o author baseado nos campos configurados
    let author = chatName || "Anônimo";
    if (needsCity && chatCity) {
      author += ` – ${chatCity}`;
      if (needsState && chatState) {
        author += ` (${chatState.toUpperCase()})`;
      }
    } else if (needsState && chatState) {
      author += ` – (${chatState.toUpperCase()})`;
    }
    
    // Se cidade e estado são obrigatórios, usa o formato completo
    if (needsCity && needsState) {
      author = `${chatName || "Anônimo"} – ${chatCity} (${chatState.toUpperCase()})`;
    }
    
    try {
      const res = await fetch(`/api/webinars/${webinar.id}/live-comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: userComment,
          author,
          timestamp: currentTime,
          sessionId: sessionIdRef.current,
        }),
      });
      
      if (res.ok) {
        const newComment = await res.json();
        setComments(prev => [...prev, newComment]);
        setUserComment("");
        toast({ title: "Comentário enviado!" });
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error("Erro ao enviar comentário:", errorData);
        toast({ 
          title: "Erro ao enviar comentário", 
          description: errorData.error || "Tente novamente",
          variant: "destructive" 
        });
      }
    } catch (err) {
      console.error("Erro de rede ao enviar comentário:", err);
      toast({ title: "Erro ao enviar comentário", variant: "destructive" });
    }
  }

  // Função para registrar no chat (separada do lead)
  function handleChatRegister() {
    if (!webinar) return;
    
    const needsName = webinar.chatCollectName !== false;
    const needsCity = webinar.chatCollectCity !== false;
    const needsState = webinar.chatCollectState !== false;
    const needsEmail = webinar.chatCollectEmail === true;
    const needsWhatsapp = webinar.chatCollectWhatsapp === true;
    
    // Validação baseada nos campos configurados
    if (needsName && !chatName.trim()) {
      toast({ title: "Preencha seu nome", variant: "destructive" });
      return;
    }
    if (needsEmail && !chatEmail.trim()) {
      toast({ title: "Preencha seu e-mail", variant: "destructive" });
      return;
    }
    if (needsEmail && chatEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chatEmail)) {
      toast({ title: "E-mail inválido", variant: "destructive" });
      return;
    }
    if (needsWhatsapp && !chatWhatsapp.trim()) {
      toast({ title: "Preencha seu WhatsApp", variant: "destructive" });
      return;
    }
    if (needsCity && !chatCity.trim()) {
      toast({ title: "Preencha sua cidade", variant: "destructive" });
      return;
    }
    if (needsState) {
      if (!chatState.trim()) {
        toast({ title: "Preencha seu estado", variant: "destructive" });
        return;
      }
      if (chatState.length !== 2) {
        toast({ title: "Estado deve ter 2 letras (ex: SP)", variant: "destructive" });
        return;
      }
    }
    
    // Persist chat registration in localStorage
    localStorage.setItem(`webinar-${params.slug}-chatRegistered`, "true");
    if (chatName) localStorage.setItem(`webinar-${params.slug}-chatName`, chatName);
    if (chatEmail) localStorage.setItem(`webinar-${params.slug}-chatEmail`, chatEmail);
    if (chatWhatsapp) localStorage.setItem(`webinar-${params.slug}-chatWhatsapp`, chatWhatsapp);
    if (chatCity) localStorage.setItem(`webinar-${params.slug}-chatCity`, chatCity);
    if (chatState) localStorage.setItem(`webinar-${params.slug}-chatState`, chatState.toUpperCase());
    
    setIsChatRegistered(true);
    setShowParticipationModal(false);
    toast({ title: "Cadastro no chat realizado!" });
  }
  
  // Função para registrar lead (inscrição no webinar) - NÃO usada no modal de chat
  function handleRegister() {
    if (!userName.trim() || !userCity.trim() || !userState.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    if (userState.length !== 2) {
      toast({ title: "Estado deve ter 2 letras (ex: SP)", variant: "destructive" });
      return;
    }
    
    // Capture lead if enabled
    if (webinar?.leadsEnabled) {
      fetch(`/api/webinars/${webinar.id}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userName,
          email: webinar.leadsCollectEmail ? userEmail : null,
          whatsapp: webinar.leadsCollectWhatsapp ? userWhatsapp : null,
          city: userCity,
          state: userState,
          sessionId: sessionIdRef.current,
        }),
      }).catch(() => {});
    }
    
    // Persist lead registration in localStorage
    localStorage.setItem(`webinar-${params.slug}-registered`, "true");
    localStorage.setItem(`webinar-${params.slug}-userName`, userName);
    localStorage.setItem(`webinar-${params.slug}-userCity`, userCity);
    localStorage.setItem(`webinar-${params.slug}-userState`, userState);
    
    setIsRegistered(true);
    setShowParticipationModal(false);
  }

  function handleOpenParticipationModal() {
    setShowParticipationModal(true);
  }

  function handleCloseParticipationModal() {
    setShowParticipationModal(false);
  }

  const benefits: string[] = webinar?.offerBenefits ? 
    (() => {
      try { return JSON.parse(webinar.offerBenefits); } 
      catch { return []; }
    })() : [];

  if (loading) {
    return (
      <div 
        ref={containerRef}
        className={isEmbed ? "w-full" : "min-h-screen"} 
        style={{ backgroundColor: isCompact ? "transparent" : "#4A8BB5" }}
      >
        {/* Skeleton loader que simula o layout do vídeo */}
        <div className={isCompact ? "" : "container mx-auto py-4 md:py-8"}>
          <div className={isCompact ? "" : "mx-auto px-2 md:px-4"} style={{ maxWidth: isCompact ? "100%" : "960px" }}>
            <div className="relative w-full overflow-hidden rounded-xl" style={{ backgroundColor: "#1a1a2e" }}>
              <div className="aspect-video flex flex-col items-center justify-center">
                <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4" />
                <div className="text-white/60 text-sm animate-pulse">Preparando transmissão...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !webinar) {
    return (
      <div 
        ref={containerRef}
        className={isEmbed ? "w-full flex items-center justify-center py-8" : "min-h-screen flex items-center justify-center"} 
        style={{ backgroundColor: isCompact ? "transparent" : "#4A8BB5" }}
      >
        <div className="text-white text-xl">{error || "Webinário não encontrado"}</div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={isEmbed ? "w-full" : "min-h-screen"}
      style={{ 
        // Página Completa (embed=1): mostra cor de fundo
        // Só Transmissão (embed=1&compact=1): fundo transparente
        backgroundColor: isCompact ? "transparent" : (webinar.pageBackgroundColor || "#4A8BB5"),
        overflow: isEmbed ? "hidden" : undefined
      }}
    >
      <Dialog open={showParticipationModal} onOpenChange={setShowParticipationModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{webinar?.chatFormTitle || "Participe do Chat"}</DialogTitle>
            <DialogDescription>
              Preencha seus dados para comentar na transmissão
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {(webinar?.chatCollectName !== false) && (
              <div>
                <Input
                  placeholder="Seu nome"
                  value={chatName}
                  onChange={(e) => setChatName(e.target.value)}
                  data-testid="input-modal-chat-name"
                />
              </div>
            )}
            {(webinar?.chatCollectEmail === true) && (
              <div>
                <Input
                  type="email"
                  placeholder="Seu e-mail"
                  value={chatEmail}
                  onChange={(e) => setChatEmail(e.target.value)}
                  data-testid="input-modal-chat-email"
                />
              </div>
            )}
            {(webinar?.chatCollectWhatsapp === true) && (
              <div>
                <Input
                  type="tel"
                  placeholder="WhatsApp (com DDD)"
                  value={chatWhatsapp}
                  onChange={(e) => setChatWhatsapp(e.target.value)}
                  data-testid="input-modal-chat-whatsapp"
                />
              </div>
            )}
            {(webinar?.chatCollectCity !== false) && (
              <div>
                <Input
                  placeholder="Cidade"
                  value={chatCity}
                  onChange={(e) => setChatCity(e.target.value)}
                  data-testid="input-modal-chat-city"
                />
              </div>
            )}
            {(webinar?.chatCollectState !== false) && (
              <div>
                <Input
                  placeholder="UF (ex: SP)"
                  value={chatState}
                  onChange={(e) => setChatState(e.target.value.toUpperCase())}
                  maxLength={2}
                  data-testid="input-modal-chat-state"
                />
              </div>
            )}
            <div className="flex gap-2 pt-4">
              <Button 
                variant="outline"
                onClick={handleCloseParticipationModal}
                className="flex-1"
                data-testid="button-modal-cancel"
              >
                Agora não
              </Button>
              <Button 
                onClick={handleChatRegister}
                className="flex-1"
                style={{ backgroundColor: "#22c55e" }}
                data-testid="button-modal-chat-register"
              >
                Participar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 
        Layout:
        - Página Completa (embed=1): container com padding, max-width 960px
        - Só Transmissão (embed=1&compact=1): sem container/padding, 100% width
        - Página Normal: container com padding, max-width 960px
      */}
      <section className={isCompact ? "" : "container mx-auto py-4 md:py-8"}>
        <div className={isCompact ? "" : "mx-auto px-2 md:px-4"} style={{ maxWidth: isCompact ? "100%" : "960px" }}>
          {/* Título: mostra em Página Completa (embed=1), esconde em Só Transmissão (compact=1) */}
          {!isCompact && webinar.pageTitle && (
            <div className="text-center mb-6">
              <div 
                className="inline-block px-6 md:px-10 py-4 md:py-6 rounded-2xl"
                style={{
                  background: "linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%)",
                  backdropFilter: "blur(15px)",
                  border: `3px solid ${webinar.countdownColor}40`,
                  boxShadow: `0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px ${webinar.countdownColor}20`
                }}
              >
                {webinar.pageBadgeText && (
                  <div 
                    className="inline-block px-3 py-1 mb-3 rounded-full text-xs md:text-sm font-bold"
                    style={{
                      background: `linear-gradient(90deg, ${webinar.countdownColor} 0%, ${webinar.countdownColor}cc 100%)`,
                      color: "#000000",
                      boxShadow: `0 4px 15px ${webinar.countdownColor}50`
                    }}
                    data-testid="badge-page"
                  >
                    {webinar.pageBadgeText}
                  </div>
                )}
                <h1 
                  className="text-xl md:text-4xl lg:text-5xl font-extrabold leading-tight px-2" 
                  style={{ 
                    background: `linear-gradient(180deg, #FFFFFF 0%, ${webinar.countdownColor} 100%)`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    textShadow: `0 4px 20px ${webinar.countdownColor}30`,
                    filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))"
                  }} 
                  data-testid="text-page-title"
                >
                  {webinar.pageTitle}
                </h1>
              </div>
            </div>
          )}

          <div className={isCompact ? "" : "mb-8"}>
            <div className={`relative w-full overflow-hidden ${isCompact ? "" : "rounded-xl"}`} style={{ backgroundColor: "#000" }}>
              <div className="relative">
                {status === "waiting" && (
                  <div 
                    className="aspect-video flex flex-col items-center justify-center"
                    style={{ backgroundColor: webinar.backgroundColor }}
                  >
                    <div 
                      className="inline-block px-4 py-2 mb-6 rounded-full text-sm font-bold animate-pulse"
                      style={{ backgroundColor: webinar.countdownColor, color: webinar.countdownColor === "#FFD700" ? "#000" : "#fff" }}
                    >
                      TRANSMISSAO EM BREVE
                    </div>
                    <h2 className="text-2xl md:text-4xl font-bold text-white mb-4 text-center px-4">
                      {webinar.countdownText}
                    </h2>
                    <div 
                      className="text-4xl md:text-6xl font-mono font-bold mb-6"
                      style={{ color: webinar.countdownColor }}
                      data-testid="text-countdown"
                    >
                      {countdown}
                    </div>
                  </div>
                )}

                {/* Tela de Encerrado Normal (quando showOfferInsteadOfEnded = false) */}
                {status === "ended" && !webinar.showOfferInsteadOfEnded && (
                  <div 
                    className="aspect-video flex flex-col items-center justify-center p-8"
                    style={{ backgroundColor: webinar.backgroundColor }}
                  >
                    <div className="text-center">
                      {webinar.showEndedScreen !== false && (
                        <div 
                          className="inline-block px-4 py-2 mb-6 rounded-full text-sm font-bold"
                          style={{ backgroundColor: webinar.liveButtonColor, color: "#fff" }}
                        >
                          {webinar.endedBadgeText}
                        </div>
                      )}
                      {webinar.showNextCountdown !== false && (
                        <>
                          <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                            {webinar.nextWebinarText}
                          </h2>
                          <div 
                            className="text-4xl md:text-6xl font-mono font-bold mb-6"
                            style={{ color: webinar.countdownColor }}
                          >
                            {countdown}
                          </div>
                        </>
                      )}
                      {webinar.showNextSessionDate !== false && (
                        <p className="text-white text-lg" style={{ textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
                          Amanha as {webinar.startHour.toString().padStart(2, '0')}:{webinar.startMinute.toString().padStart(2, '0')}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Quando showOfferInsteadOfEnded está ativo e a oferta expira, mostra tela de próxima sessão */}
                {status === "ended" && webinar.showOfferInsteadOfEnded && offerExpiredAfterEnd && (
                  <div 
                    className="aspect-video flex flex-col items-center justify-center p-8"
                    style={{ backgroundColor: webinar.backgroundColor }}
                  >
                    <div className="text-center">
                      <div 
                        className="inline-block px-4 py-2 mb-6 rounded-full text-sm font-bold"
                        style={{ backgroundColor: webinar.liveButtonColor, color: "#fff" }}
                      >
                        {webinar.endedBadgeText || "TRANSMISSAO ENCERRADA"}
                      </div>
                      <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                        {webinar.nextWebinarText || "Proxima transmissao em:"}
                      </h2>
                      <div 
                        className="text-4xl md:text-6xl font-mono font-bold mb-6"
                        style={{ color: webinar.countdownColor }}
                      >
                        {countdown}
                      </div>
                      <p className="text-white text-lg" style={{ textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
                        Amanha as {webinar.startHour.toString().padStart(2, '0')}:{webinar.startMinute.toString().padStart(2, '0')}
                      </p>
                    </div>
                  </div>
                )}

                {status === "live" && webinar.uploadedVideoId && (videoUrl || hlsUrl) && (
                  <>
                    {/* Live badge - top left (respects showLiveIndicator setting) */}
                    {webinar.showLiveIndicator !== false && (
                      <div className="absolute top-3 left-3 z-10">
                        <div 
                          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold"
                          style={{ backgroundColor: webinar.liveButtonColor, color: "#fff" }}
                        >
                          <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                          AO VIVO
                        </div>
                      </div>
                    )}
                    {/* Participant counter - top right (independent of live indicator) */}
                    {webinar.liveIndicatorStyle !== "hidden" && (
                      <div className="absolute top-3 right-3 z-10">
                        <div 
                          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
                          style={{ backgroundColor: "rgba(0,0,0,0.7)", color: "#fff" }}
                        >
                          <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                          {webinar.liveIndicatorStyle === "number" ? participantCount : `${participantCount} assistindo`}
                        </div>
                      </div>
                    )}
                    <div className="relative">
                      <video
                        ref={videoCallbackRef}
                        src={isUsingHls ? undefined : videoUrl || undefined}
                        className="w-full aspect-video object-cover"
                        controls={false}
                        autoPlay={!isUsingHls}
                        muted={isMuted}
                        playsInline
                        style={{ pointerEvents: "none" }}
                        onTimeUpdate={(e) => handleVideoTimeUpdate(e.currentTarget.currentTime)}
                        onError={(e) => {
                          console.error("Video error:", e);
                          if (videoRef.current && !isUsingHls) {
                            videoRef.current.load();
                          }
                        }}
                        onLoadStart={() => console.log("Video loading started")}
                        onLoadedMetadata={handleVideoLoadedMetadata}
                        onCanPlay={isUsingHls ? undefined : handleVideoCanPlay}
                        onPlaying={() => {
                          console.log("Video playing");
                          setIsVideoPlaying(true);
                          setNeedsUserInteraction(false);
                        }}
                        onSeeked={isUsingHls ? undefined : handleVideoSeeked}
                        data-testid="video-player"
                      />
                      {/* Play overlay for user interaction */}
                      {(needsUserInteraction || !isVideoPlaying) && (
                        <div 
                          className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 cursor-pointer z-20"
                          onClick={() => {
                            if (videoRef.current) {
                              videoRef.current.play().then(() => {
                                setIsVideoPlaying(true);
                                setNeedsUserInteraction(false);
                              }).catch(console.error);
                            }
                          }}
                          data-testid="video-play-overlay"
                        >
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-white bg-opacity-90 flex items-center justify-center">
                              <svg className="w-10 h-10 text-gray-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                              </svg>
                            </div>
                            <span className="text-white text-lg font-medium">Clique para assistir</span>
                          </div>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleToggleMute}
                            className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition"
                            title={isMuted ? "Ativar som" : "Mutar som"}
                            data-testid="button-toggle-mute"
                          >
                            {isMuted ? (
                              <VolumeX className="w-6 h-6 text-white" />
                            ) : (
                              <Volume2 className="w-6 h-6 text-white" />
                            )}
                          </button>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={isMuted ? 0 : volume}
                              onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                              className="w-20 h-1 bg-white bg-opacity-30 rounded-full appearance-none cursor-pointer accent-white"
                              title="Controle de volume"
                              data-testid="input-volume"
                            />
                            <span className="text-white text-sm font-medium w-8 text-right">
                              {isMuted ? "0" : volume}%
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={handleFullscreen}
                          className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition"
                          title="Tela cheia"
                          data-testid="button-fullscreen"
                        >
                          <Maximize className="w-6 h-6 text-white" />
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Banner de Anúncio */}
                {showBanner && webinar.bannerEnabled && status === "live" && (
                  <div 
                    className="w-full py-4 px-4 flex items-center justify-center"
                    style={{ backgroundColor: webinar.bannerBackgroundColor || "#1a1a2e" }}
                    data-testid="banner-container"
                  >
                    <a
                      href={webinar.bannerButtonUrl || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-8 py-3 rounded-lg font-bold text-lg shadow-lg hover:opacity-90 transition-all transform hover:scale-105"
                      style={{ 
                        backgroundColor: webinar.bannerButtonColor || "#22c55e",
                        color: webinar.bannerButtonTextColor || "#ffffff"
                      }}
                      data-testid="button-banner-cta"
                    >
                      {webinar.bannerButtonText || "Saiba Mais"}
                    </a>
                  </div>
                )}
              </div>

              {status === "live" && (
                <div 
                  className="border-t-2"
                  style={{ 
                    backgroundColor: webinar.commentTheme === "light" ? "#f5f5f5" : "#1a1a2e",
                    borderColor: webinar.commentTheme === "light" ? "#e0e0e0" : "#2d2d44"
                  }}
                >
                  <div 
                    className="flex items-center gap-2 px-4 py-2 border-b" 
                    style={{ borderColor: webinar.commentTheme === "light" ? "#e0e0e0" : "#2d2d44" }}
                  >
                    <span style={{ color: webinar.commentTheme === "light" ? "#333" : "#ccc" }} className="font-medium">Chat ao vivo</span>
                    <span style={{ color: webinar.commentTheme === "light" ? "#999" : "#666" }} className="text-sm">({visibleComments.length} mensagens)</span>
                  </div>

                  <div 
                    ref={commentsEndRef}
                    className="h-80 md:h-96 overflow-y-auto p-2 flex flex-col-reverse gap-1.5"
                    style={{ backgroundColor: webinar.commentTheme === "light" ? "#fafafa" : "#12121f" }}
                  >
                    {visibleComments.slice().reverse().map((comment) => (
                      <div 
                        key={comment.id} 
                        className="px-2 py-1.5 rounded-md"
                        style={{ backgroundColor: webinar.commentTheme === "light" ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)" }}
                      >
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="font-bold text-xs" style={{ color: webinar.commentTheme === "light" ? "#0066cc" : "#4A8BB5" }}>
                            {comment.author}
                          </span>
                        </div>
                        <p style={{ color: webinar.commentTheme === "light" ? "#333" : "#ccc" }} className="text-xs leading-snug">{comment.text}</p>
                      </div>
                    ))}
                  </div>

                  <div 
                    className="p-3 border-t flex gap-2" 
                    style={{ borderColor: webinar.commentTheme === "light" ? "#e0e0e0" : "#2d2d44" }}
                  >
                    {!isRegistered ? (
                      <Button 
                        onClick={handleOpenParticipationModal} 
                        className="w-full rounded-full"
                        style={{ backgroundColor: "#22c55e" }}
                        data-testid="button-open-participation-modal"
                      >
                        Participar do Chat
                      </Button>
                    ) : (
                      <>
                        <input
                          type="text"
                          placeholder="Envie uma mensagem..."
                          className="flex-1 px-4 py-2 rounded-full text-sm"
                          style={{ 
                            backgroundColor: webinar.commentTheme === "light" ? "#e8e8e8" : "#2d2d44",
                            color: webinar.commentTheme === "light" ? "#000" : "#fff",
                            border: webinar.commentTheme === "light" ? "1px solid #d0d0d0" : "1px solid #3d3d54"
                          }}
                          value={userComment}
                          onChange={(e) => setUserComment(e.target.value)}
                          onKeyPress={(e) => e.key === "Enter" && handleSendComment()}
                          data-testid="input-comment"
                        />
                        <button
                          className="px-6 py-2 rounded-full text-sm font-bold"
                          style={{ backgroundColor: webinar.commentTheme === "light" ? "#0066cc" : "#4A8BB5", color: "#fff" }}
                          onClick={handleSendComment}
                          data-testid="button-send-comment"
                        >
                          Enviar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {((showOffer && webinar.offerEnabled) || (status === "ended" && webinar.showOfferInsteadOfEnded && webinar.offerEnabled && !offerExpiredAfterEnd) || showOfferAfterEnd) && (
            <div 
              className="text-center px-6 md:px-12 py-10 md:py-16 rounded-2xl"
              style={{ 
                maxWidth: "900px", 
                margin: "0 auto",
                background: "linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.4) 100%)",
                backdropFilter: "blur(10px)",
                border: "2px solid rgba(255, 255, 255, 0.3)",
                boxShadow: "0 20px 60px rgba(0, 0, 0, 0.4)"
              }}
              data-testid="offer-container"
            >
              <div 
                className="inline-block px-4 py-2 mb-6 rounded-full text-sm font-bold"
                style={{ 
                  backgroundColor: webinar.countdownColor,
                  color: webinar.countdownColor === "#FFD700" ? "#2c3e50" : "#fff",
                  boxShadow: `0 4px 15px ${webinar.countdownColor}40`
                }}
                data-testid="badge-offer"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(webinar.offerBadgeText || "") }}
              />

              {webinar.offerTitle && (
                <h2 
                  className="text-2xl md:text-4xl font-bold mb-4" 
                  style={{ 
                    color: webinar.offerTitleColor || "#ffffff", 
                    textShadow: "3px 3px 6px rgba(0,0,0,0.8)" 
                  }}
                  data-testid="text-offer-title"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(webinar.offerTitle) }}
                />
              )}
              
              {webinar.offerSubtitle && (
                <p 
                  className="text-base md:text-lg mb-6 font-medium" 
                  style={{ 
                    color: webinar.offerSubtitleColor || "#ffffff", 
                    textShadow: "2px 2px 4px rgba(0,0,0,0.8)" 
                  }}
                  data-testid="text-offer-subtitle"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(webinar.offerSubtitle) }}
                />
              )}

              {webinar.offerImageUrl && (
                <div className="mb-10" data-testid="offer-image">
                  <img 
                    src={webinar.offerImageUrl} 
                    alt="Oferta" 
                    className="mx-auto rounded-lg"
                    style={{ 
                      maxWidth: "280px",
                      boxShadow: `0 8px 25px ${webinar.offerButtonColor}50`
                    }}
                  />
                </div>
              )}

              {benefits.length > 0 && (
                <div 
                  className="space-y-4 mb-8 text-left max-w-2xl mx-auto p-6 rounded-xl"
                  style={{ 
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    backdropFilter: "blur(5px)",
                    border: "1px solid rgba(255, 255, 255, 0.2)"
                  }}
                >
                  {benefits.map((benefit, index) => (
                    <div 
                      key={index} 
                      className="flex items-start gap-4"
                      data-testid={`benefit-item-${index}`}
                    >
                      <div 
                        className="flex-shrink-0 rounded-full p-1.5"
                        style={{ backgroundColor: "#90EE90" }}
                      >
                        <Check 
                          className="h-5 w-5" 
                          style={{ color: "#000000", strokeWidth: 4 }}
                        />
                      </div>
                      <span 
                        className="text-base md:text-lg font-semibold"
                        style={{ color: "#ffffff", textShadow: "1px 1px 3px rgba(0,0,0,0.8)" }}
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(benefit) }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {webinar.offerPriceText && (
                <div 
                  className="max-w-2xl mx-auto rounded-xl text-center mb-8"
                  style={{ 
                    backgroundColor: webinar.offerPriceBoxBgColor || "rgba(0, 0, 0, 0.3)",
                    border: `3px solid ${webinar.offerPriceBorderColor || "#84cc16"}`,
                    boxShadow: webinar.offerPriceBoxShadow !== false 
                      ? `0 0 30px ${webinar.offerPriceBorderColor || "#84cc16"}40, 0 10px 40px rgba(0,0,0,0.3)` 
                      : "none",
                    padding: webinar.offerPriceBoxPadding === "sm" ? "12px 16px" 
                      : webinar.offerPriceBoxPadding === "lg" ? "32px 40px"
                      : webinar.offerPriceBoxPadding === "xl" ? "40px 48px"
                      : "24px 32px"
                  }}
                  data-testid="offer-price-box"
                >
                  {webinar.offerPriceLabel && (
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <span 
                        className="text-xs font-bold uppercase tracking-wider"
                        style={{ color: webinar.offerPriceIconColor || "#84cc16" }}
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(webinar.offerPriceLabel) }}
                      />
                    </div>
                  )}
                  <p 
                    className="text-base md:text-lg font-semibold"
                    style={{ color: "#ffffff", textShadow: "1px 1px 3px rgba(0,0,0,0.8)" }}
                    data-testid="text-offer-price"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(webinar.offerPriceText) }}
                  />
                </div>
              )}

              {webinar.offerButtonUrl && (
                <a 
                  href={webinar.offerButtonUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block w-full max-w-2xl rounded-xl font-bold transition-transform hover:scale-[1.02]"
                  style={{ 
                    backgroundColor: webinar.offerButtonColor || "#22c55e",
                    color: webinar.offerButtonTextColor || "#fff",
                    boxShadow: webinar.offerButtonShadow !== false 
                      ? `0 10px 40px ${webinar.offerButtonColor || "#22c55e"}60, 0 4px 15px rgba(0,0,0,0.3)` 
                      : "none",
                    border: `3px solid ${webinar.offerButtonColor || "#22c55e"}`,
                    padding: getButtonPadding(webinar.offerButtonSize || "lg"),
                    fontSize: getButtonFontSize(webinar.offerButtonSize || "lg"),
                    textShadow: "1px 1px 2px rgba(0,0,0,0.3)"
                  }}
                  data-testid="button-offer-cta"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(webinar.offerButtonText) }}
                />
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
