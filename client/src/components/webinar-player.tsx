import { useState, useEffect, useRef } from "react";
import { MessageCircle, Users, Radio, Play, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Comment {
  id: number;
  timestamp: number;
  name: string;
  location: string;
  message: string;
}

interface UserInfo {
  name: string;
  city: string;
  state: string;
}

interface WebinarPlayerProps {
  videoUrl: string;
  startHour: number;
  startMinute: number;
  videoDuration: number;
  comments: Comment[];
  onWebinarEnd?: () => void;
  countdownText?: string;
  nextWebinarText?: string;
  endedBadgeText?: string;
  countdownColor?: string;
  liveButtonColor?: string;
  backgroundColor?: string;
  backgroundImageUrl?: string;
  onEnterClick?: () => void;
  userInfo?: UserInfo | null;
  onRequestUserInfo?: () => void;
}

export default function WebinarPlayer({
  videoUrl,
  startHour = 18,
  startMinute = 50,
  videoDuration,
  comments,
  onWebinarEnd,
  countdownText = "O webinário começa em:",
  nextWebinarText = "Próximo webinário em:",
  endedBadgeText = "TRANSMISSÃO ENCERRADA",
  countdownColor = "#FFD700",
  liveButtonColor = "#e74c3c",
  backgroundColor = "#1a1a2e",
  backgroundImageUrl = "",
  onEnterClick,
  userInfo,
  onRequestUserInfo
}: WebinarPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLive, setIsLive] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [visibleComments, setVisibleComments] = useState<Comment[]>([]);
  const [countdown, setCountdown] = useState<string>("");
  const [currentTime, setCurrentTime] = useState(0);
  const commentsContainerRef = useRef<HTMLDivElement>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [videoError, setVideoError] = useState<string>("");
  const [sendingComment, setSendingComment] = useState(false);

  const handleSendComment = async () => {
    if (!userInfo) {
      onRequestUserInfo?.();
      return;
    }
    if (!newCommentText.trim()) return;
    
    setSendingComment(true);
    try {
      const currentTimestamp = Math.floor(currentTime);
      const res = await fetch("/api/webinar/live-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: newCommentText.trim(),
          author: `${userInfo.name} – ${userInfo.city} (${userInfo.state})`,
          timestamp: currentTimestamp,
        }),
      });
      if (res.ok) {
        setNewCommentText("");
        // Comment saved to database, will appear on next poll (every 5 seconds)
      } else {
        const error = await res.json();
        console.error("Erro ao enviar comentário:", error);
      }
    } catch (error) {
      console.error("Erro ao enviar comentário:", error);
    } finally {
      setSendingComment(false);
    }
  };

  const isEmbedUrl = videoUrl && videoUrl.includes("/embed/");

  const getSecondsUntilStart = () => {
    const now = new Date();
    const startTime = new Date();
    startTime.setHours(startHour, startMinute, 0, 0);
    
    if (now > startTime) {
      startTime.setDate(startTime.getDate() + 1);
    }
    
    return Math.floor((startTime.getTime() - now.getTime()) / 1000);
  };

  const getElapsedSeconds = () => {
    const now = new Date();
    const startTime = new Date();
    startTime.setHours(startHour, startMinute, 0, 0);
    
    if (now < startTime) {
      return -1;
    }
    
    const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
    
    if (elapsed > videoDuration) {
      return -2;
    }
    
    return elapsed;
  };

  const formatCountdown = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVideoEvents = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    e.preventDefault();
    const video = e.currentTarget;
    const elapsed = getElapsedSeconds();
    // Só sincroniza se tiver desviado muito (> 5 segundos)
    if (elapsed > 0 && Math.abs(video.currentTime - elapsed) > 5) {
      video.currentTime = elapsed;
    }
  };

  const handleStartVideo = () => {
    setHasStarted(true);
    setIsLive(true);
  };

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const errorCode = video.error?.code;
    let errorMsg = "Erro ao carregar vídeo";
    
    switch (errorCode) {
      case 1:
        errorMsg = "Vídeo abortado";
        break;
      case 2:
        errorMsg = "Erro de rede - verifique a URL do vídeo";
        break;
      case 3:
        errorMsg = "Vídeo interrompido";
        break;
      case 4:
        errorMsg = "Formato de vídeo não suportado ou URL inválida";
        break;
    }
    
    console.error("Erro no vídeo:", errorMsg, "URL:", videoUrl);
    setVideoError(errorMsg);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  // Auto-inicia quando chegar o horário da transmissão
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = getElapsedSeconds();
      // Se estamos ao vivo E ainda não iniciou, inicia automaticamente
      if (elapsed > 0 && !hasStarted) {
        setHasStarted(true);
        localStorage.setItem("webinarStarted", "true");
      }
      // Se não está mais ao vivo, limpa o localStorage
      else if (elapsed < 0) {
        localStorage.removeItem("webinarStarted");
      }
    }, 500);
    return () => clearInterval(interval);
  }, [hasStarted]);

  useEffect(() => {
    const baseViewers = 280 + Math.floor(Math.random() * 150);
    setViewerCount(baseViewers);

    const viewerInterval = setInterval(() => {
      setViewerCount(prev => {
        const change = Math.floor(Math.random() * 20) - 8;
        return Math.max(200, prev + change);
      });
    }, 5000);

    return () => clearInterval(viewerInterval);
  }, []);

  useEffect(() => {
    const checkTime = () => {
      const elapsed = getElapsedSeconds();
      
      if (elapsed === -1) {
        setIsLive(false);
        setIsEnded(false);
        const secondsUntil = getSecondsUntilStart();
        setCountdown(formatCountdown(secondsUntil));
      } else if (elapsed === -2) {
        setIsLive(false);
        setIsEnded(true);
        const secondsUntil = getSecondsUntilStart();
        setCountdown(formatCountdown(secondsUntil));
        if (onWebinarEnd) onWebinarEnd();
      } else {
        setIsLive(true);
        setIsEnded(false);
        setCurrentTime(elapsed);
      }
    };

    checkTime();
    const interval = setInterval(checkTime, 1000);
    return () => clearInterval(interval);
  }, [startHour, startMinute, videoDuration, onWebinarEnd]);

  // Sincroniza APENAS na primeira entrada ao vivo
  useEffect(() => {
    if (hasStarted && isLive && videoRef.current && !isEmbedUrl) {
      const video = videoRef.current;
      const elapsed = getElapsedSeconds();
      
      // Só sincroniza se o vídeo está no início (< 5 segundos)
      if (elapsed > 0 && video.currentTime < 5) {
        video.currentTime = elapsed;
      }
      
      // Inicia a reprodução
      if (video.paused) {
        video.play().catch(() => {});
      }
    }
  }, [hasStarted, isLive]);

  // Sincroniza levemente apenas se desviar muito (> 5 segundos)
  useEffect(() => {
    if (hasStarted && isLive && videoRef.current && !isEmbedUrl) {
      const syncInterval = setInterval(() => {
        const video = videoRef.current;
        if (!video) return;
        
        const elapsed = getElapsedSeconds();
        if (elapsed > 0) {
          // Só sincroniza se REALMENTE desviar muito (> 5 segundos)
          if (Math.abs(video.currentTime - elapsed) > 5) {
            video.currentTime = elapsed;
          }
          // Garante que está reproduzindo
          if (video.paused) {
            video.play().catch(() => {});
          }
        }
      }, 10000); // Sincroniza apenas a cada 10 segundos

      return () => clearInterval(syncInterval);
    }
  }, [hasStarted, isLive]);

  useEffect(() => {
    // Mostra todos comentários se está ao vivo, senão filtra por tempo
    if (isLive) {
      const newVisible = comments.filter(c => c.timestamp <= currentTime);
      setVisibleComments(newVisible);
      console.log(`[Comments] CurrentTime: ${currentTime}s, Filtered: ${newVisible.length}/${comments.length}`);
    } else {
      setVisibleComments([]);
    }
  }, [currentTime, comments, isLive]);

  useEffect(() => {
    if (commentsContainerRef.current) {
      commentsContainerRef.current.scrollTop = commentsContainerRef.current.scrollHeight;
    }
  }, [visibleComments]);

  if (!isLive && !isEnded) {
    const bgStyle: React.CSSProperties = {
      backgroundColor: backgroundColor,
    };
    
    if (backgroundImageUrl) {
      bgStyle.backgroundImage = `url(${backgroundImageUrl})`;
      bgStyle.backgroundSize = "cover";
      bgStyle.backgroundPosition = "center";
    }

    return (
      <div className="relative w-full rounded-xl overflow-hidden" style={bgStyle}>
        {backgroundImageUrl && <div className="absolute inset-0 bg-black/40" />}
        <div className="aspect-video relative z-10 flex flex-col items-center justify-center p-8">
          <div className="text-center">
            <div 
              className="inline-block px-4 py-2 mb-6 rounded-full text-sm font-bold animate-pulse"
              style={{ backgroundColor: countdownColor, color: countdownColor === "#FFD700" ? "#000" : "#fff" }}
            >
              TRANSMISSÃO EM BREVE
            </div>
            <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
              {countdownText}
            </h2>
            <div 
              className="text-4xl md:text-6xl font-mono font-bold mb-6"
              style={{ color: countdownColor }}
              data-testid="text-countdown"
            >
              {countdown}
            </div>
            <p className="text-white text-lg" style={{ textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
              Todos os dias às {(startHour ?? 18).toString().padStart(2, '0')}:{(startMinute ?? 50).toString().padStart(2, '0')}
            </p>
            <Button
              onClick={onEnterClick}
              size="lg"
              className="mt-8 mx-auto flex items-center gap-3 px-8 py-6 text-lg font-bold rounded-full"
              style={{ 
                background: `linear-gradient(135deg, ${liveButtonColor} 0%, ${liveButtonColor}dd 100%)`,
                boxShadow: `0 10px 30px ${liveButtonColor}80`
              }}
              data-testid="button-wait-entry"
            >
              <Play className="h-6 w-6 fill-white" />
              ENTRAR E AGUARDAR
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isEnded) {
    const bgStyle: React.CSSProperties = {
      backgroundColor: backgroundColor,
    };
    
    if (backgroundImageUrl) {
      bgStyle.backgroundImage = `url(${backgroundImageUrl})`;
      bgStyle.backgroundSize = "cover";
      bgStyle.backgroundPosition = "center";
    }

    return (
      <div className="relative w-full rounded-xl overflow-hidden" style={bgStyle}>
        {backgroundImageUrl && <div className="absolute inset-0 bg-black/40" />}
        <div className="aspect-video relative z-10 flex flex-col items-center justify-center p-8">
          <div className="text-center">
            <div 
              className="inline-block px-4 py-2 mb-6 rounded-full text-sm font-bold"
              style={{ backgroundColor: liveButtonColor, color: "#fff" }}
            >
              {endedBadgeText}
            </div>
            <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
              {nextWebinarText}
            </h2>
            <div 
              className="text-4xl md:text-6xl font-mono font-bold mb-6"
              style={{ color: countdownColor }}
              data-testid="text-countdown-next"
            >
              {countdown}
            </div>
            <p className="text-white text-lg" style={{ textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
              Amanhã às {startHour.toString().padStart(2, '0')}:{startMinute.toString().padStart(2, '0')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ backgroundColor: "#000" }}>
      <div className="relative">
        <div className="absolute top-3 left-3 z-10 flex items-center gap-3">
          <div 
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold"
            style={{ backgroundColor: "#e74c3c", color: "#fff" }}
          >
            <Radio className="h-4 w-4 animate-pulse" />
            AO VIVO
          </div>
          <div 
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
            style={{ backgroundColor: "rgba(0,0,0,0.7)", color: "#fff" }}
          >
            <Users className="h-4 w-4" />
            {viewerCount}
          </div>
        </div>

        {hasStarted && !isEmbedUrl && (
          <button
            onClick={toggleMute}
            className="absolute bottom-3 left-3 z-10 p-2 rounded-full transition-opacity"
            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
            data-testid="button-mute-toggle"
          >
            <Volume2 className={`h-5 w-5 ${isMuted ? 'text-gray-500' : 'text-white'}`} />
          </button>
        )}


        {isEmbedUrl ? (
          <iframe
            src={videoUrl}
            className="w-full aspect-video"
            style={{ border: "none" }}
            allowFullScreen
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            data-testid="video-embed"
          />
        ) : (
          <div className="relative w-full aspect-video bg-black">
            <video
              ref={videoRef}
              className="w-full aspect-video object-cover"
              src={videoUrl}
              playsInline
              autoPlay
              muted={isMuted}
              onSeeking={handleVideoEvents}
              onSeeked={handleVideoEvents}
              onPause={handleVideoEvents}
              onError={handleVideoError}
              onLoadedMetadata={() => {
                // Não sincroniza aqui para evitar reinícios desnecessários
              }}
              style={{ pointerEvents: "none" }}
              data-testid="video-player"
            />
            {videoError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                <div className="text-center text-white p-6">
                  <p className="text-lg font-semibold mb-2">⚠️ {videoError}</p>
                  <p className="text-sm text-gray-300 mb-4">URL: {videoUrl}</p>
                  <p className="text-xs text-gray-400">Verifique a configuração do vídeo no painel admin</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div 
        className="border-t-2"
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2d2d44" }}
      >
        <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: "#2d2d44" }}>
          <MessageCircle className="h-5 w-5 text-gray-400" />
          <span className="text-gray-300 font-medium">Chat ao vivo</span>
          <span className="text-gray-500 text-sm">({visibleComments.length} mensagens)</span>
        </div>

        <div 
          ref={commentsContainerRef}
          className="h-64 md:h-80 overflow-y-auto p-3 space-y-2"
          style={{ backgroundColor: "#12121f" }}
          data-testid="comments-container"
        >
          {visibleComments.map((comment) => (
            <div 
              key={comment.id} 
              className="p-2 rounded-lg"
              style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
              data-testid={`comment-${comment.id}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-sm" style={{ color: "#4A8BB5" }}>
                  {comment.name}
                </span>
                <span className="text-xs text-gray-500">
                  {comment.location}
                </span>
              </div>
              <p className="text-gray-200 text-sm">{comment.message}</p>
            </div>
          ))}
        </div>

        <div className="p-3 border-t flex gap-2" style={{ borderColor: "#2d2d44" }}>
          <input
            type="text"
            placeholder="Envie uma mensagem..."
            className="flex-1 px-4 py-2 rounded-full text-sm"
            style={{ 
              backgroundColor: "#2d2d44", 
              color: "#fff",
              border: "1px solid #3d3d54"
            }}
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSendComment();
              }
            }}
            disabled={sendingComment}
            data-testid="input-comment"
          />
          <button
            className="px-6 py-2 rounded-full text-sm font-bold disabled:opacity-50"
            style={{ backgroundColor: "#4A8BB5", color: "#fff" }}
            onClick={handleSendComment}
            disabled={sendingComment}
            data-testid="button-send-comment"
          >
            {sendingComment ? "..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
