import { useState, useEffect, useRef } from "react";
import { useRoute, useSearch } from "wouter";
import { Check, Play, Pause, Volume2, VolumeX, Maximize, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import Hls from "hls.js";

interface Webinar {
  id: string;
  slug: string;
  name: string;
  replayEnabled: boolean;
  replayVideoId: string | null;
  replayShowControls: boolean;
  replayAutoplay: boolean;
  replayThumbnailUrl: string;
  replayPlayerColor: string;
  replayPlayerBorderColor: string;
  replayBackgroundColor: string;
  replayBadgeText: string;
  replayTitle: string;
  replayOfferBadgeText: string;
  replayOfferTitle: string;
  replayOfferSubtitle: string;
  replayOfferImageUrl: string;
  replayBenefits: string;
  replayPriceText: string;
  replayButtonText: string;
  replayButtonUrl: string;
  replayButtonColor: string;
}

interface VideoInfo {
  id: string;
  uploadedVideoId: string;
  title: string;
  duration: number;
  hlsPlaylistUrl: string | null;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function stripHtml(html: string): string {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function sanitizeInlineHtml(html: string): string {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  
  const allowedTags = ["span", "b", "i", "u", "strong", "em", "br", "font"];
  
  const clean = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || "";
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      
      if (!allowedTags.includes(tag)) {
        return Array.from(el.childNodes).map(clean).join("");
      }
      
      const styles: string[] = [];
      
      if (tag === "font") {
        const colorAttr = el.getAttribute("color");
        if (colorAttr) styles.push(`color: ${colorAttr}`);
      }
      
      const inlineStyle = el.getAttribute("style");
      if (inlineStyle) {
        const colorMatch = inlineStyle.match(/color:\s*([^;]+)/i);
        const bgMatch = inlineStyle.match(/background(?:-color)?:\s*([^;]+)/i);
        if (colorMatch) styles.push(`color: ${colorMatch[1]}`);
        if (bgMatch) styles.push(`background: ${bgMatch[1]}`);
      }
      
      const children = Array.from(el.childNodes).map(clean).join("");
      if (tag === "br") return "<br>";
      
      const styleAttr = styles.length ? ` style="${styles.join("; ")}"` : "";
      const outputTag = tag === "font" ? "span" : tag;
      return `<${outputTag}${styleAttr}>${children}</${outputTag}>`;
    }
    return "";
  };
  
  return Array.from(tmp.childNodes).map(clean).join("");
}

export default function WebinarReplayPage() {
  const [, params] = useRoute("/w/:slug/replay");
  const slug = params?.slug;
  const searchString = useSearch();
  const isEmbed = searchString.includes("embed=1");

  const [webinar, setWebinar] = useState<Webinar | null>(null);
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (!isEmbed) return;
    
    // Remove margens do body/html quando em modo embed
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'auto';
    document.body.style.background = 'transparent';
    document.documentElement.style.margin = '0';
    document.documentElement.style.padding = '0';
    document.documentElement.style.overflow = 'auto';
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

  useEffect(() => {
    if (!slug) return;

    async function loadData() {
      try {
        const res = await fetch(`/api/webinars/${slug}`);
        if (!res.ok) throw new Error("Webinário não encontrado");
        const data = await res.json();
        setWebinar(data);

        if (!data.replayEnabled) {
          setError("Replay não está habilitado para este webinário");
          return;
        }

        if (data.replayVideoId) {
          const videoRes = await fetch(`/api/videos/${data.replayVideoId}`);
          if (videoRes.ok) {
            const videoData = await videoRes.json();
            setVideo(videoData);
          }
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [slug]);

  useEffect(() => {
    if (!video?.uploadedVideoId || !videoRef.current) return;

    const videoElement = videoRef.current;
    const hlsUrl = `/api/webinar/hls/${video.uploadedVideoId}/playlist.m3u8`;
    const directVideoUrl = `/api/webinar/video/${video.uploadedVideoId}`;

    const useFallbackVideo = () => {
      console.log("[replay] Using direct video fallback");
      videoElement.src = directVideoUrl;
      if (webinar?.replayAutoplay) {
        videoElement.play().catch(() => {});
      }
    };

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      });

      hls.loadSource(hlsUrl);
      hls.attachMedia(videoElement);
      hlsRef.current = hls;

      hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
        if (data.details?.totalduration && isFinite(data.details.totalduration)) {
          setDuration(data.details.totalduration);
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (webinar?.replayAutoplay) {
          videoElement.play().catch(() => {});
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.log("[replay] HLS fatal error, switching to direct video");
          hls.destroy();
          hlsRef.current = null;
          useFallbackVideo();
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
      videoElement.src = hlsUrl;
      videoElement.onerror = () => {
        console.log("[replay] Native HLS error, switching to direct video");
        useFallbackVideo();
      };
      if (webinar?.replayAutoplay) {
        videoElement.play().catch(() => {});
      }
    } else {
      useFallbackVideo();
    }
  }, [video, webinar?.replayAutoplay]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !video) return;

    const handleTimeUpdate = () => setCurrentTime(videoEl.currentTime);
    const handleDurationChange = () => {
      if (videoEl.duration && isFinite(videoEl.duration)) {
        setDuration(videoEl.duration);
      }
    };
    const handleLoadedMetadata = () => {
      if (videoEl.duration && isFinite(videoEl.duration)) {
        setDuration(videoEl.duration);
      }
    };
    const handleCanPlay = () => {
      // Don't set hasStarted here - let user click the overlay first
    };
    const handlePlay = () => {
      setIsPlaying(true);
      setHasStarted(true);
    };
    const handlePause = () => setIsPlaying(false);

    videoEl.addEventListener("timeupdate", handleTimeUpdate);
    videoEl.addEventListener("durationchange", handleDurationChange);
    videoEl.addEventListener("loadedmetadata", handleLoadedMetadata);
    videoEl.addEventListener("canplay", handleCanPlay);
    videoEl.addEventListener("play", handlePlay);
    videoEl.addEventListener("pause", handlePause);

    return () => {
      videoEl.removeEventListener("timeupdate", handleTimeUpdate);
      videoEl.removeEventListener("durationchange", handleDurationChange);
      videoEl.removeEventListener("loadedmetadata", handleLoadedMetadata);
      videoEl.removeEventListener("canplay", handleCanPlay);
      videoEl.removeEventListener("play", handlePlay);
      videoEl.removeEventListener("pause", handlePause);
    };
  }, [video]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(!isMuted);
  };

  const handleSeek = (value: number[]) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = value[0];
    setCurrentTime(value[0]);
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoRef.current.requestFullscreen();
    }
  };

  const handleStartPlay = () => {
    if (videoRef.current) {
      setHasStarted(true);
      setShowControls(true);
      videoRef.current.play();
    }
  };

  if (loading) {
    return (
      <div 
        ref={containerRef}
        className={isEmbed ? "w-full" : "min-h-screen"} 
        style={{ backgroundColor: "#4A8BB5" }}
      >
        {/* Skeleton loader que simula o layout do vídeo */}
        <div className="container mx-auto py-4 md:py-8">
          <div className="mx-auto px-2 md:px-4" style={{ maxWidth: "960px" }}>
            <div className="relative w-full overflow-hidden rounded-xl" style={{ backgroundColor: "#1a1a2e" }}>
              <div className="aspect-video flex flex-col items-center justify-center">
                <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4" />
                <div className="text-white/60 text-sm animate-pulse">Preparando replay...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !webinar) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center text-white">
          <h1 className="text-2xl font-bold mb-2">Erro</h1>
          <p className="text-slate-400">{error || "Webinário não encontrado"}</p>
        </div>
      </div>
    );
  }

  const benefits = webinar.replayBenefits ? JSON.parse(webinar.replayBenefits) : [];
  const playerColor = webinar.replayPlayerColor || "#3b82f6";
  const playerBorderColor = webinar.replayPlayerBorderColor || "#ffffff";
  const bgColor = webinar.replayBackgroundColor || "#4A8BB5";
  const buttonColor = webinar.replayButtonColor || "#22c55e";

  return (
    <div 
      ref={containerRef}
      className={isEmbed ? "w-full" : "min-h-screen"} 
      style={{ 
        backgroundColor: bgColor
      }}
    >
      <section className={isEmbed ? "py-4" : "container mx-auto py-3 md:py-16"}>
        <div className={isEmbed ? "mx-auto px-4" : "mx-auto px-3 md:px-4"} style={{ maxWidth: "960px" }}>
          {(webinar.replayBadgeText || webinar.replayTitle) && (
            <div className="text-center mb-4 md:mb-10">
              <div
                className="inline-block px-8 md:px-12 py-6 md:py-8 rounded-2xl"
                style={{
                  background: "linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%)",
                  backdropFilter: "blur(15px)",
                  border: "3px solid rgba(255, 215, 0, 0.4)",
                  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(255, 215, 0, 0.2)",
                }}
              >
                {webinar.replayBadgeText && (
                  <div
                    className="inline-block px-3 py-1 mb-4 rounded-full text-xs md:text-sm font-bold"
                    style={{
                      background: "linear-gradient(90deg, #FFD700 0%, #FFA500 100%)",
                      color: "#000000",
                      boxShadow: "0 4px 15px rgba(255, 215, 0, 0.5)",
                    }}
                    dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(webinar.replayBadgeText) }}
                  />
                )}
                {webinar.replayTitle && (
                  <h1
                    className="text-2xl md:text-5xl lg:text-6xl font-extrabold leading-tight px-2"
                    style={{
                      background: "linear-gradient(180deg, #FFFFFF 0%, #FFD700 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                      textShadow: "0 4px 20px rgba(255, 215, 0, 0.3)",
                      filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))",
                    }}
                    data-testid="text-replay-title"
                    dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(webinar.replayTitle) }}
                  />
                )}
              </div>
            </div>
          )}

          {video && (
            <div
              className="relative w-full mx-auto mb-4 md:mb-12"
              style={{
                maxWidth: "100%",
                borderRadius: "12px",
                border: `4px solid ${playerBorderColor}`,
                overflow: "hidden",
                boxShadow: "0 10px 25px rgba(0, 0, 0, 0.3)",
              }}
            >
              <div className="relative w-full" style={{ paddingBottom: "56.25%", backgroundColor: "#1a1a2e" }}>
                <video
                  ref={videoRef}
                  className="absolute top-0 left-0 w-full h-full object-cover"
                  style={{ backgroundColor: "#1a1a2e" }}
                  playsInline
                  data-testid="video-replay"
                />

                {!hasStarted && webinar.replayThumbnailUrl && (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer z-10"
                    onClick={handleStartPlay}
                    data-testid="overlay-play-replay-thumbnail"
                    style={{
                      backgroundImage: `url(${webinar.replayThumbnailUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  >
                    <div className="absolute inset-0 bg-black/40" />
                    <div
                      className="relative w-24 h-24 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-2xl"
                      style={{ backgroundColor: playerColor }}
                    >
                      <Play className="w-12 h-12 text-white ml-1" />
                    </div>
                    <p className="relative mt-4 text-white text-lg font-medium drop-shadow-lg">
                      Clique para iniciar
                    </p>
                  </div>
                )}

                {!hasStarted && !webinar.replayThumbnailUrl && (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer bg-black/60 z-10"
                    onClick={handleStartPlay}
                    data-testid="overlay-play-replay"
                  >
                    <div
                      className="w-24 h-24 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-2xl"
                      style={{ backgroundColor: playerColor }}
                    >
                      <Play className="w-12 h-12 text-white ml-1" />
                    </div>
                    <p className="mt-4 text-white text-lg font-medium drop-shadow-lg">
                      Clique para iniciar
                    </p>
                  </div>
                )}

                {hasStarted && webinar.replayShowControls === false && (
                  <div
                    className="absolute inset-0 flex items-center justify-center cursor-pointer z-10 group"
                    onClick={togglePlay}
                  >
                    <div
                      className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}
                      style={{ backgroundColor: playerColor }}
                    >
                      {isPlaying ? (
                        <Pause className="w-10 h-10 text-white" />
                      ) : (
                        <Play className="w-10 h-10 text-white ml-1" />
                      )}
                    </div>
                  </div>
                )}

                {(webinar.replayShowControls !== false) && hasStarted && (
                  <div
                    className="absolute bottom-0 left-0 right-0 p-4"
                    style={{
                      background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <button
                        onClick={togglePlay}
                        className="text-white hover:opacity-80 transition-opacity"
                        data-testid="button-play-pause"
                      >
                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                      </button>

                      <div className="flex-1">
                        <Slider
                          value={[currentTime]}
                          max={duration || 100}
                          step={1}
                          onValueChange={handleSeek}
                          className="cursor-pointer"
                          data-testid="slider-progress"
                        />
                      </div>

                      <span className="text-white text-sm font-mono min-w-[80px]">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>

                      <button
                        onClick={toggleMute}
                        className="text-white hover:opacity-80 transition-opacity"
                        data-testid="button-mute"
                      >
                        {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                      </button>

                      <button
                        onClick={toggleFullscreen}
                        className="text-white hover:opacity-80 transition-opacity"
                        data-testid="button-fullscreen"
                      >
                        <Maximize className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {(webinar.replayOfferBadgeText || webinar.replayOfferTitle || benefits.length > 0) && (
            <div
              className="text-center px-6 md:px-12 py-10 md:py-16 rounded-2xl"
              style={{
                maxWidth: "900px",
                margin: "0 auto",
                background: "linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.4) 100%)",
                backdropFilter: "blur(10px)",
                border: "2px solid rgba(255, 255, 255, 0.3)",
                boxShadow: "0 20px 60px rgba(0, 0, 0, 0.4)",
              }}
            >
              {webinar.replayOfferBadgeText && (
                <div
                  className="inline-block px-4 py-2 mb-6 rounded-full text-sm font-bold"
                  style={{
                    backgroundColor: "#FFD700",
                    color: "#2c3e50",
                    boxShadow: "0 4px 15px rgba(255, 215, 0, 0.4)",
                  }}
                  data-testid="badge-offer"
                  dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(webinar.replayOfferBadgeText) }}
                />
              )}

              {webinar.replayOfferTitle && (
                <h2
                  className="text-2xl md:text-4xl font-bold mb-4"
                  style={{ color: "#ffffff", textShadow: "3px 3px 6px rgba(0,0,0,0.8)" }}
                  data-testid="text-offer-title"
                  dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(webinar.replayOfferTitle) }}
                />
              )}

              {webinar.replayOfferSubtitle && (
                <p
                  className="text-base md:text-lg mb-6 font-medium"
                  style={{ color: "#ffffff", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}
                  data-testid="text-offer-subtitle"
                  dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(webinar.replayOfferSubtitle) }}
                />
              )}

              {webinar.replayOfferImageUrl && (
                <div className="mb-10" data-testid="image-offer">
                  <img
                    src={webinar.replayOfferImageUrl}
                    alt="Oferta"
                    className="rounded-lg"
                    style={{
                      maxWidth: "260px",
                      display: "block",
                      margin: "0 auto",
                    }}
                  />
                </div>
              )}

              {benefits.length > 0 && (
                <div
                  className="space-y-4 mb-10 text-left max-w-2xl mx-auto p-6 rounded-xl"
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    backdropFilter: "blur(5px)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                  }}
                >
                  {benefits.map((benefit: string, index: number) => (
                    <div key={index} className="flex items-start gap-4" data-testid={`benefit-item-${index}`}>
                      <div className="flex-shrink-0 rounded-full p-1.5" style={{ backgroundColor: "#90EE90" }}>
                        <Check className="h-5 w-5" style={{ color: "#000000", strokeWidth: 4 }} />
                      </div>
                      <span
                        className="text-base md:text-lg font-semibold"
                        style={{ color: "#ffffff", textShadow: "1px 1px 3px rgba(0,0,0,0.8)" }}
                        dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(benefit) }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {webinar.replayPriceText && (
                <div
                  className="p-8 mb-10 rounded-xl text-center"
                  style={{
                    background: "linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 165, 0, 0.1) 100%)",
                    border: "3px solid rgba(255, 215, 0, 0.8)",
                    boxShadow: "0 15px 40px rgba(255, 215, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
                  }}
                >
                  <p
                    className="text-lg md:text-2xl font-bold leading-relaxed"
                    style={{ color: "#ffffff", textShadow: "2px 2px 6px rgba(0,0,0,0.9)" }}
                    data-testid="text-pricing"
                    dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(webinar.replayPriceText) }}
                  />
                </div>
              )}

              {webinar.replayButtonUrl && webinar.replayButtonText && (
                <a
                  href={webinar.replayButtonUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full"
                >
                  <Button
                    size="lg"
                    className="w-full text-base md:text-2xl px-6 md:px-12 py-6 md:py-8 font-extrabold rounded-xl transition-all duration-300 hover:scale-105 uppercase tracking-wide"
                    style={{
                      background: `linear-gradient(135deg, ${buttonColor} 0%, ${buttonColor}dd 100%)`,
                      color: "#FFFFFF",
                      minHeight: "60px",
                      boxShadow: `0 15px 40px ${buttonColor}99, inset 0 2px 0 rgba(255,255,255,0.3)`,
                      border: "4px solid rgba(255, 255, 255, 0.5)",
                      textShadow: "2px 2px 6px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)",
                    }}
                    data-testid="button-cta"
                  >
                    {webinar.replayButtonText}
                  </Button>
                </a>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
