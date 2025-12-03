import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Upload, FileVideo, Trash2, Clock, Copy, Video, Zap, Pencil, Check, X } from "lucide-react";

interface UploadedVideo {
  id: string;
  filename: string;
  originalName: string;
  size: number;
  duration?: number;
  createdAt: string;
}

export default function AdminVideosPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [optimizingVideoId, setOptimizingVideoId] = useState<string | null>(null);
  const token = localStorage.getItem("adminToken");

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    fetchVideos();
  }, [token, setLocation]);

  async function fetchVideos() {
    try {
      const res = await fetch("/api/webinar/videos", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVideos(data.map((v: any) => ({
          id: v.id,
          filename: v.filename,
          originalName: v.title || v.filename,
          size: 0,
          duration: v.duration,
          createdAt: v.uploadedAt,
        })));
      }
    } catch (error) {
      console.error("Error fetching videos:", error);
    } finally {
      setLoading(false);
    }
  }

  function getVideoDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve(Math.round(video.duration) || 0);
      };
      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        resolve(0);
      };
      video.src = URL.createObjectURL(file);
    });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    const duration = await getVideoDuration(file);
    console.log(`[upload] Duração detectada: ${duration}s`);

    const formData = new FormData();
    formData.append("video", file);
    formData.append("duration", duration.toString());

    try {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
        }
      });

      xhr.onload = () => {
        if (xhr.status === 200) {
          toast({ title: "Vídeo enviado com sucesso!" });
          fetchVideos();
        } else {
          const response = JSON.parse(xhr.responseText);
          toast({
            title: "Erro",
            description: response.error || "Falha ao enviar",
            variant: "destructive",
          });
        }
        setUploading(false);
        setUploadProgress(0);
      };

      xhr.onerror = () => {
        toast({ title: "Erro", description: "Falha na conexão", variant: "destructive" });
        setUploading(false);
        setUploadProgress(0);
      };

      xhr.open("POST", "/api/webinar/upload-video");
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.send(formData);
    } catch (error) {
      toast({ title: "Erro ao enviar vídeo", variant: "destructive" });
      setUploading(false);
    }
    e.target.value = "";
  }

  async function handleDelete(videoId: string) {
    if (!confirm("Tem certeza que deseja excluir este vídeo?")) return;

    try {
      const res = await fetch(`/api/webinar/videos/${videoId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        toast({ title: "Vídeo excluído!" });
        fetchVideos();
      } else {
        toast({ title: "Erro ao excluir vídeo", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro ao excluir vídeo", variant: "destructive" });
    }
  }

  function formatDuration(seconds?: number): string {
    if (!seconds) return "—";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}min ${s}s`;
    if (m > 0) return `${m}min ${s}s`;
    return `${s}s`;
  }

  function copyVideoPath(filename: string) {
    navigator.clipboard.writeText(`/uploads/videos/${filename}`);
    toast({ title: "Caminho copiado!" });
  }

  async function handleRenameVideo(videoId: string) {
    if (!editingTitle.trim()) {
      toast({ title: "Digite um título", variant: "destructive" });
      return;
    }

    try {
      const res = await fetch(`/api/webinar/videos/${videoId}/title`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: editingTitle }),
      });

      if (res.ok) {
        toast({ title: "Título atualizado!" });
        setEditingVideoId(null);
        setEditingTitle("");
        fetchVideos();
      } else {
        throw new Error("Erro ao renomear");
      }
    } catch (error) {
      toast({ title: "Erro ao renomear vídeo", variant: "destructive" });
    }
  }

  async function handleOptimize(videoId: string) {
    setOptimizingVideoId(videoId);
    try {
      const res = await fetch(`/api/webinar/videos/${videoId}/optimize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        toast({ title: "Vídeo otimizado!", description: "O vídeo foi pré-carregado para reprodução mais rápida." });
      } else {
        throw new Error("Erro ao otimizar");
      }
    } catch (error) {
      toast({ title: "Erro ao otimizar vídeo", variant: "destructive" });
    } finally {
      setOptimizingVideoId(null);
    }
  }

  function startEditing(video: UploadedVideo) {
    setEditingVideoId(video.id);
    setEditingTitle(video.originalName);
  }

  function cancelEditing() {
    setEditingVideoId(null);
    setEditingTitle("");
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Biblioteca de Vídeos</h1>
        <p className="text-muted-foreground text-sm mt-1">Gerencie os vídeos disponíveis para seus webinários</p>
      </div>

      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Enviar Novo Vídeo
          </CardTitle>
          <CardDescription>
            Formatos suportados: MP4, WebM, MOV. Tamanho máximo: 2GB
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block">
            <input
              type="file"
              accept="video/*"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
              data-testid="input-upload-video"
            />
            <Button asChild disabled={uploading} className="cursor-pointer">
              <span>
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? `Enviando... ${uploadProgress}%` : "Selecionar Vídeo"}
              </span>
            </Button>
          </label>
          
          {uploading && (
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Enviando...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Videos List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileVideo className="w-5 h-5" />
            Vídeos Disponíveis ({videos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                <Video className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-lg font-medium mb-1">Nenhum vídeo enviado</p>
              <p className="text-sm text-muted-foreground">Envie seu primeiro vídeo para começar</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-1">
                {videos.map((video, index) => (
                  <div key={video.id}>
                    <div
                      className="flex items-center justify-between p-3 rounded-md hover-elevate"
                      data-testid={`video-item-${video.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="flex items-center justify-center w-10 h-10 rounded bg-secondary flex-shrink-0">
                          <FileVideo className="w-5 h-5 text-secondary-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          {editingVideoId === video.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                className="h-8 text-sm"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRenameVideo(video.id);
                                  if (e.key === "Escape") cancelEditing();
                                }}
                                data-testid={`input-rename-video-${video.id}`}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRenameVideo(video.id)}
                                title="Salvar"
                                data-testid={`button-save-rename-${video.id}`}
                              >
                                <Check className="w-4 h-4 text-green-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={cancelEditing}
                                title="Cancelar"
                                data-testid={`button-cancel-rename-${video.id}`}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <p className="font-medium truncate">{video.originalName}</p>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDuration(video.duration)}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      {editingVideoId !== video.id && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOptimize(video.id)}
                            disabled={optimizingVideoId === video.id}
                            title="Otimizar velocidade"
                            data-testid={`button-optimize-video-${video.id}`}
                          >
                            <Zap className={`w-4 h-4 ${optimizingVideoId === video.id ? "animate-pulse text-yellow-500" : ""}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditing(video)}
                            title="Renomear vídeo"
                            data-testid={`button-rename-video-${video.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyVideoPath(video.filename)}
                            title="Copiar caminho"
                            data-testid={`button-copy-video-${video.id}`}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(video.id)}
                            title="Excluir vídeo"
                            data-testid={`button-delete-video-${video.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {index < videos.length - 1 && <Separator className="my-1" />}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
